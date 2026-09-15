/**
 * VISION §12.1 layer ③ — does the lurk shape travel with the IDENTITY INPUT or with the STARTING POSITION?
 *
 *   node scripts/lurkswap.ts runs/d2-long-s1.json --gen 299 --colour R [--n 12]
 *
 * All five bodies of a team run the same genome. The only thing that distinguishes them is the `self.slot`
 * one-hot — and `map.spawns[team][slot]` hands the same index to the spawn, so a role can live in either place.
 * Three arms separate them (pre-registration: runs/g2-lurk-swap-predictions.txt):
 *   A control      — untouched;
 *   B one-hot swap — after observe(), transpose the one-hot read by the bodies at spawns 0 and k (positions kept);
 *   C spawn swap   — transpose `spawns[team][0]` and `spawns[team][k]` in the map (one-hots kept).
 * Only the OBSERVED team is ever touched; the opponent plays normally in every arm.
 *
 * ⚠ Both arms show a body a (spawn, one-hot) pairing it never trained on — each input is in-distribution alone,
 * their JOINT is not (the same caveat scripts/identity.ts carries about its rotation). That is why the
 * pre-registration fixes a third outcome: if the shape dissolves under BOTH arms, the answer is "unattributable",
 * ⛔ not "neither".
 *
 * ⛔ Analysis only, behind the T8 firewall: it imports the detector, never the other way round, and nothing it
 * prints may be fed to training.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { stepMatch } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import { lurkMatchStats, meanSE, type LurkMatch } from '../src/probe/detect.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 12);
/** ⛔ frozen with the detector: the trade radius, and the measured length of a whole fight */
const SUPPORT_R = 12;
const LURK_TICKS = 30;

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

const path = files[0];
if (!path) throw new Error('usage: node scripts/lurkswap.ts runs/<run>.json --gen G --colour R|B');
const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
if (data.scaffold) throw new Error(`${path} is a scaffold run`);
const { sim } = normalizeSim(data.sim);
const shape = shapeFor(sim, data.evo.hidden);
const baseMap = generateMap(data.evo.mapSeed, sim);
const tag = basename(path).replace(/\.json$/, '');
const observe: 0 | 1 = (flags.get('colour') ?? 'R').toUpperCase() === 'B' ? 1 : 0;
const T = sim.teamSize;

const pick = (t: 0 | 1) => {
  const h = data.hof[t];
  const e = flags.has('gen') ? h.find((x) => x.gen === num('gen', 0)) : h[h.length - 1];
  if (!e) throw new Error(`${tag}: no hall-of-fame entry for gen ${flags.get('gen')}`);
  if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome length ${e.genome.length}`);
  return { gen: e.gen, genome: Float32Array.from(e.genome) };
};
const champ: [{ gen: number; genome: Float32Array }, { gen: number; genome: Float32Array }] = [pick(0), pick(1)];
const slot0Index = obsSchema(sim).find((f) => f.name === 'self.slot0')!.index;

/** a copy of the map with two of the observed team's spawns transposed — ⛔ the opponent's are untouched */
function swappedSpawnMap(k: number, from = 0): ArenaMap {
  const spawns: [typeof baseMap.spawns[0], typeof baseMap.spawns[1]] = [
    baseMap.spawns[0].map((s) => ({ ...s })), baseMap.spawns[1].map((s) => ({ ...s })),
  ];
  const mine = spawns[observe];
  const tmp = mine[from];
  mine[from] = mine[k];
  mine[k] = tmp;
  return { ...baseMap, spawns };
}

type Arm = { label: string; k: number; j?: number; mode: 'none' | 'onehot' | 'spawn' };
const arms: Arm[] = [{ label: 'A control', k: 0, mode: 'none' }];
for (const k of [1, 2, 3, 4]) arms.push({ label: `B one-hot 0<->${k}`, k, mode: 'onehot' });
for (const k of [1, 2, 3, 4]) arms.push({ label: `C spawn 0<->${k}`, k, mode: 'spawn' });
/**
 * PLACEBO, added after arms B and C were read (⚠ post-hoc, and said so in the write-up): transpose the one-hot of
 * two bodies that do NOT carry the shape. It answers the question B alone cannot — does moving slot 0's identity
 * dissolve the shape, or does ANY out-of-distribution one-hot edit dissolve it? A placebo can only weaken the
 * conclusion, never strengthen it, which is why adding it late is honest.
 */
for (const [a, b2] of [[1, 2], [2, 3], [3, 4]] as const) arms.push({ label: `P placebo ${a}<->${b2}`, k: a, j: b2, mode: 'onehot' });

/**
 * Play one match under an arm and score it. Returns the isolated ticks indexed BOTH ways: by the body's spawn
 * index and by the one-hot it read. In the control those are the same array; the arms are what pull them apart.
 */
function playArm(arm: Arm, seed: number, attackers: 0 | 1): {
  bySpawn: number[]; byCarrier: number[]; aliveBySpawn: number[]; stats: ReturnType<typeof lurkMatchStats>;
} {
  const map = arm.mode === 'spawn' ? swappedSpawnMap(arm.k) : baseMap;
  const w = new World(sim, map, seed, { attackers });
  const red: Policy = new NeuralPolicy(shape, champ[0].genome);
  const blue: Policy = new NeuralPolicy(shape, champ[1].genome);
  const base = observe === 0 ? 0 : T;
  /**
   * Two labels per body, and they are NOT interchangeable — the first version of this script indexed both by the
   * agent's array index, which in arm C IS the one-hot, so the "by spawn" column silently printed the carrier
   * attribution twice (GOTCHAS #26: two columns reading identically is the tell).
   *   carrier[i] — the one-hot body i reads (arm B transposes it);
   *   spawnOf[i] — which of the ORIGINAL spawn positions body i starts on (arm C transposes it).
   */
  const carrier = Array.from({ length: T }, (_, i) => i);
  const spawnOf = Array.from({ length: T }, (_, i) => i);
  const lo = arm.j === undefined ? 0 : arm.k;
  const hi = arm.j === undefined ? arm.k : arm.j;
  if (arm.mode === 'onehot') { carrier[lo] = hi; carrier[hi] = lo; }
  if (arm.mode === 'spawn') { spawnOf[lo] = hi; spawnOf[hi] = lo; }
  const edit = arm.mode === 'onehot' ? (wd: World) => {
    for (let k = 0; k < T; k++) {
      const off = (base + k) * wd.obsDim + slot0Index;
      for (let s = 0; s < T; s++) wd.obs[off + s] = s === carrier[k] ? 1 : 0;
    }
  } : undefined;

  const out: LurkMatch = { isolated: [], counted: [], speed: [], dealt: [], taken: [], kills: [] };
  const prev = Array.from({ length: T }, () => ({ dealt: 0, taken: 0, kills: 0 }));
  let checked = false;
  while (!w.done) {
    stepMatch(w, red, blue, edit);
    if (!checked) {
      checked = true;
      // prove the intervention reached what the brain read / where the body stands (GOTCHAS #26)
      if (arm.mode === 'onehot') {
        const off = (base + lo) * w.obsDim + slot0Index;
        const row = Array.from(w.obs.subarray(off, off + T));
        if (row.indexOf(1) !== hi) throw new Error(`${arm.label}: one-hot rewrite did not land (read ${row})`);
      }
      if (arm.mode === 'spawn') {
        const want = swappedSpawnMap(arm.k).spawns[observe][lo];
        const a = w.agents[base + lo];
        if (Math.hypot(a.x - want.x, a.z - want.z) > 8) throw new Error(`${arm.label}: spawn swap did not land`);
      }
    }
    const iso: boolean[] = [];
    const cnt: boolean[] = [];
    const spd: number[] = [];
    const dd: number[] = [];
    const tk: number[] = [];
    const kk: number[] = [];
    for (let k = 0; k < T; k++) {
      const a = w.agents[base + k];
      let mates = 0;
      let near = 0;
      for (let j = 0; j < T; j++) {
        if (j === k) continue;
        const b = w.agents[base + j];
        if (!b.alive) continue;
        mates++;
        if (Math.hypot(a.x - b.x, a.z - b.z) <= SUPPORT_R) near++;
      }
      cnt.push(a.alive && mates >= 2);
      iso.push(a.alive && mates >= 2 && near === 0);
      spd.push(a.alive ? Math.hypot(a.vx, a.vz) : 0);
      dd.push(a.damageDealt - prev[k].dealt);
      tk.push(a.damageTaken - prev[k].taken);
      kk.push(a.kills - prev[k].kills);
      prev[k] = { dealt: a.damageDealt, taken: a.damageTaken, kills: a.kills };
    }
    out.isolated.push(iso);
    out.counted.push(cnt);
    out.speed.push(spd);
    out.dealt.push(dd);
    out.taken.push(tk);
    out.kills.push(kk);
  }
  const stats = lurkMatchStats(out, LURK_TICKS);
  const byCarrier = new Array(T).fill(0);
  const bySpawn = new Array(T).fill(0);
  const aliveBySpawn = new Array(T).fill(0);
  stats.perSlot.forEach((v, k) => { byCarrier[carrier[k]] += v; bySpawn[spawnOf[k]] += v; });
  stats.perSlotAlive.forEach((v, k) => { aliveBySpawn[spawnOf[k]] += v; });
  return { bySpawn, byCarrier, aliveBySpawn, stats };
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(0)}%`);

console.log(`lurk swap — ${tag}@${champ[observe].gen} ${observe === 0 ? 'R' : 'B'}, ${N} seeds x 2 role assignments per arm`);
console.log(`the shape at gen 299 sits on slot 0. B moves the ONE-HOT off that body, C moves the BODY off that spawn.`);
console.log('"slot0 by spawn" = the body that STARTS where slot 0 starts; "slot0 by carrier" = the body READING one-hot 0.');
console.log('⚠ both arms are out-of-distribution in the JOINT (spawn, one-hot); a dissolved shape means unattributable.\n');
console.log(`${padr('arm', 20)}${pad('alive ticks', 12)}${pad('isolated', 10)}${pad('share', 7)}${pad('episodes', 10)}`
  + `${pad('slot0 by spawn', 15)}${pad('slot0 by carrier', 18)}${pad('per-slot by spawn %', 21)}${pad('ep speed', 10)}${pad('dealt/K', 10)}`);

const rows: { arm: Arm; share: number; spawn0: number; carrier0: number }[] = [];
for (const arm of arms) {
  const aliveSlots = new Array(T).fill(0);
  const bySpawn = new Array(T).fill(0);
  const byCarrier = new Array(T).fill(0);
  let alive = 0;
  let isolated = 0;
  let episodes = 0;
  const ep = { ticks: 0, speed: 0, dealt: 0, kills: 0 };
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const r = playArm(arm, hashSeed(31337, m), attackers);
      alive += r.stats.aliveTicks;
      isolated += r.stats.isolatedTicks;
      episodes += r.stats.episodes;
      ep.ticks += r.stats.epTicks;
      ep.speed += r.stats.epSpeedSum;
      ep.dealt += r.stats.epDealt;
      ep.kills += r.stats.epKills;
      r.aliveBySpawn.forEach((v, k) => { aliveSlots[k] += v; });
      r.bySpawn.forEach((v, k) => { bySpawn[k] += v; });
      r.byCarrier.forEach((v, k) => { byCarrier[k] += v; });
    }
  }
  const share = alive ? isolated / alive : NaN;
  // shares of the TOTAL isolation, so the two labels are directly comparable
  const spawn0 = isolated ? bySpawn[0] / isolated : NaN;
  const carrier0 = isolated ? byCarrier[0] / isolated : NaN;
  rows.push({ arm, share, spawn0, carrier0 });
  const perSlot = bySpawn.map((v, k) => (aliveSlots[k] ? Math.round((100 * v) / aliveSlots[k]) : 0)).join('/');
  console.log(`${padr(arm.label, 20)}${pad(String(alive), 12)}${pad(String(isolated), 10)}${pad(pct(share), 7)}${pad(String(episodes), 10)}`
    + `${pad(pct(spawn0), 15)}${pad(pct(carrier0), 18)}${pad(perSlot, 21)}`
    + `${pad(ep.ticks ? `${(ep.speed / ep.ticks).toFixed(2)}m/s` : '—', 10)}${pad(ep.ticks ? `${ep.dealt.toFixed(0)}/${ep.kills}` : '—', 10)}`);
}

const mean = (xs: number[]) => meanSE(xs);
const b = rows.filter((r) => r.arm.mode === 'onehot' && r.arm.j === undefined);
const c = rows.filter((r) => r.arm.mode === 'spawn');
const plac = rows.filter((r) => r.arm.j !== undefined);
const ctl = rows[0];
console.log(`\ncontrol: slot0 holds ${pct(ctl.spawn0)} of all isolation (spawn and carrier are the same body here)`);
console.log(`arm B (one-hot moved): by spawn ${pct(mean(b.map((r) => r.spawn0)).mean)} ± ${(mean(b.map((r) => r.spawn0)).se * 100).toFixed(1)}pp`
  + ` · by carrier ${pct(mean(b.map((r) => r.carrier0)).mean)} ± ${(mean(b.map((r) => r.carrier0)).se * 100).toFixed(1)}pp   (mean over k=1..4)`);
console.log(`arm C (body moved):    by spawn ${pct(mean(c.map((r) => r.spawn0)).mean)} ± ${(mean(c.map((r) => r.spawn0)).se * 100).toFixed(1)}pp`
  + ` · by carrier ${pct(mean(c.map((r) => r.carrier0)).mean)} ± ${(mean(c.map((r) => r.carrier0)).se * 100).toFixed(1)}pp   (mean over k=1..4)`);
console.log(`placebo (two NON-lurker one-hots swapped): slot0 keeps ${pct(mean(plac.map((r) => r.spawn0)).mean)} ± ${(mean(plac.map((r) => r.spawn0)).se * 100).toFixed(1)}pp of the isolation`
  + `, share ${pct(mean(plac.map((r) => r.share)).mean)} vs control ${pct(ctl.share)}   ⚠ post-hoc control, added after B and C were read`);
console.log('\n⚠ read against runs/g2-lurk-swap-predictions.txt: the two arms must agree on the SAME label, or the');
console.log('   answer is "this instrument cannot attribute the role". ⛔ Intent is not on this ladder at all.');
