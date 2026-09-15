/**
 * ROADMAP G2 — run the trade detector, on scripted scenarios first (its precision check) and then on champions.
 *
 *   node scripts/detect.ts [runs/a.json ...] [--gen G] [--n 12] [--window 3] [--radius 12]
 *
 * The scripted rows are not decoration: G2 asks for a precision sanity check, and a detector that reads 0 on a
 * scenario built to contain trades, or > 0 on one where nobody can shoot back, is broken (GOTCHAS #26 — prove the
 * tool reaches its assertion before reading the world with it).
 *
 * ⛔ Nothing here may enter training: the detector lives under src/probe, behind the T8 firewall.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { DEFAULT_SIM, normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { stepMatch } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import { PacifistRusherPolicy, PostHolderPolicy, SiteAttackerPolicy, SiteDefenderPolicy } from '../src/brain/scripted.ts';
import {
  crossfireTick, median, newCrossfireStats, tradeStats, type CrossfireStats, type KillRecord, type TradeOptions,
} from '../src/probe/detect.ts';

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
const WINDOW = num('window', 3);
const RADIUS = num('radius', 12);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

/** Play a match and keep the spectator's kill records (tick + where), which is all the detector needs. */
function playAndCollect(sim: SimConfig, map: ArenaMap, seed: number, red: Policy, blue: Policy, attackers: 0 | 1): { kills: KillRecord[]; ticks: number } {
  const w = new World(sim, map, seed, { attackers });
  const kills: KillRecord[] = [];
  while (!w.done) {
    stepMatch(w, red, blue);
    for (const ev of w.events) {
      if (ev.kind !== 'kill') continue;
      // alive counts after this tick's kills: the pool a teammate's next shot could have picked from
      kills.push({ tick: w.tick, killer: ev.killer, victim: ev.victim, x: ev.x, z: ev.z, aliveEnemies: [w.aliveCount[0], w.aliveCount[1]] });
    }
  }
  return { kills, ticks: w.tick };
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

interface Row { label: string; sim: SimConfig; map: ArenaMap; red: () => Policy; blue: () => Policy; observe: 0 | 1 }

const scriptedSim: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2, memorySeconds: 0 };
const scriptedMap = generateMap(7, scriptedSim);
const rows: Row[] = [
  // positive: both sides walk the same lane, so answering the killer is possible and common
  { label: 'scripted: same lane (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new SiteDefenderPolicy(0), observe: 0 },
  // negative: the observed team never fires, so it can never answer anybody
  { label: 'scripted: pacifists (−)', sim: scriptedSim, map: scriptedMap, red: () => new PacifistRusherPolicy(), blue: () => new SiteDefenderPolicy(0), observe: 0 },
];

for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  if (data.scaffold) throw new Error(`${path} is a scaffold run`);
  const { sim } = normalizeSim(data.sim);
  const shape = shapeFor(sim, data.evo.hidden);
  const map = generateMap(data.evo.mapSeed, sim);
  const tag = basename(path).replace(/\.json$/, '');
  const pick = (t: 0 | 1) => {
    const h = data.hof[t];
    const e = flags.has('gen') ? h.find((x) => x.gen === num('gen', 0)) : h[h.length - 1];
    if (!e) throw new Error(`${tag}: no hall-of-fame entry for gen ${flags.get('gen')}`);
    if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
    return { gen: e.gen, genome: Float32Array.from(e.genome) };
  };
  const r = pick(0);
  const b = pick(1);
  for (const observe of [0, 1] as const) {
    rows.push({
      label: `${tag}@${r.gen} ${observe === 0 ? 'R' : 'B'}`,
      sim, map, observe,
      red: () => new NeuralPolicy(shape, r.genome),
      blue: () => new NeuralPolicy(shape, b.genome),
    });
  }
}

console.log(`trade detector — window ${WINDOW}s, radius ${RADIUS}m, ${N} seeds x 2 role assignments per row`);
console.log('a death is TRADED when a teammate kills the killer inside the window and inside the radius;');
console.log("null = the same kills with the answering kill's TIME redrawn inside the match (64 redraws);");
console.log('lift = traded / expected-if-the-answering-kill-had-picked-uniformly-among-living-enemies, counted over the');
console.log('       deaths that got any answer inside the window and radius — it keeps every real time and place\n');
console.log(`${padr('observed team', 24)}${pad('deaths', 8)}${pad('traded', 8)}${pad('rate', 7)}${pad('null', 7)}${pad('x null', 7)}${pad('far', 6)}${pad('answered', 10)}${pad('lift', 7)}${pad('median gap', 11)}${pad('first trade (replay anchor)', 26)}`);

for (const row of rows) {
  const opts: TradeOptions = { windowSeconds: WINDOW, radius: RADIUS, dt: row.sim.dt, teamSize: row.sim.teamSize };
  let deaths = 0;
  let traded = 0;
  let far = 0;
  let nullSum = 0;
  let nullN = 0;
  let answered = 0;
  let chance = 0;
  const gaps: number[] = [];
  let anchor: { seed: number; attackers: 0 | 1; tick: number } | null = null;
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      const { kills, ticks } = playAndCollect(row.sim, row.map, seed, row.red(), row.blue(), attackers);
      const st = tradeStats(kills, row.observe, opts, ticks, hashSeed(991, m, attackers));
      deaths += st.deaths;
      traded += st.traded;
      far += st.far;
      gaps.push(...st.gaps);
      if (st.deaths) { nullSum += st.nullRate * st.deaths; nullN += st.deaths; }
      answered += st.answered;
      chance += st.chance;
      // a replay anchor needs the seed too, or "tick 213" points at nothing reproducible
      if (anchor === null && st.firstAt !== null) anchor = { seed, attackers, tick: st.firstAt };
    }
  }
  gaps.sort((a, b2) => a - b2);
  const rate = deaths ? traded / deaths : NaN;
  const nul = nullN ? nullSum / nullN : NaN;
  console.log(`${padr(row.label, 24)}${pad(String(deaths), 8)}${pad(String(traded), 8)}${pad(Number.isNaN(rate) ? 'n/a' : pct(rate), 7)}`
    + `${pad(Number.isNaN(nul) ? 'n/a' : pct(nul), 7)}${pad(nul > 0 ? (rate / nul).toFixed(1) : '—', 7)}${pad(String(far), 6)}`
    + `${pad(`${answered}`, 10)}${pad(chance > 0 ? (traded / chance).toFixed(2) : '—', 7)}`
    + `${pad(gaps.length ? `${median(gaps).toFixed(2)}s` : '—', 11)}${pad(anchor === null ? '—' : `seed ${anchor.seed} atk${anchor.attackers} t${anchor.tick}`, 26)}`);
}
/* ------------------------------------------------------------------ crossfire */

const SEP = num('separation', 60);
const MIN_RANGE = num('min-range', 6);
/** scripted controls: the same bots, split across both sites or stacked on one — the geometry does the talking */
const site0 = scriptedMap.sites[0];
/** two posts on OPPOSITE sides of site 0: an enemy on the site is between them, which is the angle we are after */
const flankPosts = [
  { x: site0.x - 7, z: site0.z - 2 }, { x: site0.x + 7, z: site0.z + 2 },
  { x: site0.x - 7, z: site0.z + 2 }, { x: site0.x + 7, z: site0.z - 2 }, { x: site0.x, z: site0.z - 8 },
];
/** the same five bodies bunched at one post: same map, same shooting, no angle */
const bunchedPosts = [{ x: site0.x - 1, z: site0.z - 7 }, { x: site0.x, z: site0.z - 7 }, { x: site0.x + 1, z: site0.z - 7 },
  { x: site0.x - 1, z: site0.z - 8 }, { x: site0.x + 1, z: site0.z - 8 }];
const crossRows: Row[] = [
  { label: 'scripted: flanking (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new PostHolderPolicy(flankPosts), observe: 1 },
  { label: 'scripted: bunched (−)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new PostHolderPolicy(bunchedPosts), observe: 1 },
  ...rows.filter((r) => !r.label.startsWith('scripted')),
];

function playCrossfire(row: Row, seed: number, attackers: 0 | 1, st: CrossfireStats): void {
  const w = new World(row.sim, row.map, seed, { attackers });
  const red = row.red();
  const blue = row.blue();
  let lastDamage = 0;
  while (!w.done) {
    stepMatch(w, red, blue);
    const dealt = w.stats[row.observe].damageDealt;
    crossfireTick(
      st,
      { team: row.observe, teamSize: row.sim.teamSize, n: w.n, tick: w.tick, minSeparationDeg: SEP, minRange: MIN_RANGE },
      (id) => w.agents[id].alive,
      (id) => w.agents[id],
      (viewer, target) => w.visible[viewer * w.n + target] === 1,
      dealt - lastDamage,
    );
    lastDamage = dealt;
  }
}

console.log(`\ncrossfire detector — an enemy seen by >= 2 teammates at least ${SEP}° apart (angle AT the enemy), both >= ${MIN_RANGE}m away`);
console.log(`${padr('observed team', 24)}${pad('seen ticks', 11)}${pad('crossfire', 10)}${pad('share', 7)}${pad('median sep', 11)}${pad('dmg share', 10)}${pad('first (replay anchor)', 26)}`);
for (const row of crossRows) {
  const st = newCrossfireStats();
  let anchor: { seed: number; attackers: 0 | 1; tick: number } | null = null;
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      const before = st.firstAt;
      playCrossfire(row, seed, attackers, st);
      if (anchor === null && before === null && st.firstAt !== null) anchor = { seed, attackers, tick: st.firstAt };
    }
  }
  st.separations.sort((a, b) => a - b);
  const share = st.seenTicks ? st.crossTicks / st.seenTicks : NaN;
  const dmg = st.totalDamage > 0 ? st.crossDamage / st.totalDamage : NaN;
  console.log(`${padr(row.label, 24)}${pad(String(st.seenTicks), 11)}${pad(String(st.crossTicks), 10)}`
    + `${pad(Number.isNaN(share) ? 'n/a' : pct(share), 7)}${pad(st.separations.length ? `${median(st.separations).toFixed(0)}°` : '—', 11)}`
    + `${pad(Number.isNaN(dmg) ? 'n/a' : pct(dmg), 10)}${pad(anchor === null ? '—' : `seed ${anchor.seed} atk${anchor.attackers} t${anchor.tick}`, 26)}`);
}

console.log('\n⚠ this is FORM, not intent: two players shooting the same enemy produce the same shape (VISION §12.1 needs');
console.log('   birth / stability / intervention before any "they learned to trade"). ⛔ detector output never enters training.');
