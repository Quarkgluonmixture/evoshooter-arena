/**
 * ROADMAP D2's required analyses — what, if anything, is on the radio.
 *
 *   node scripts/radio.ts runs/a.json [runs/alien.json] [--n 6] [--bins 5] [--gen N]
 *
 * ⛔ None of this licenses the sentence "the team has a language". D2's strong-claim gate wants three layers
 * — a sender-state relation, a receiver response, and an intervention — and this script measures the first
 * two plus the intervention. A high mutual information alone is a CORRELATION: "token 3 shows up when an
 * enemy is visible" is not "token 3 means enemy" (VISION §7.4).
 *
 * Layer 1, sender: symbol entropy, silence rate, and mutual information against candidate referents.
 * Layer 2+3, receiver and intervention: three ablations, each editing what the brain is about to READ:
 *   off       — every teammate's message replaced by silence;
 *   shuffled  — replaced by a message drawn from this run's own recorded pool (same marginal distribution,
 *               correlation with the situation destroyed) — the in-distribution control GOTCHAS #24 demands,
 *               because "muting it hurts" only shows the input is load-bearing, not that it carries meaning;
 *   alien     — replaced by messages recorded from a DIFFERENT run's champion. If an alien vocabulary works
 *               as well as the team's own, whatever is on the wire is not team-specific.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
if (files.length === 0) {
  console.error('usage: node scripts/radio.ts <run.json> [alien.json] [--n 6] [--bins 5]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 6);
const BINS = num('bins', 5);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }

function load(path: string, gen?: number) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  const { sim, defaulted } = normalizeSim(data.sim);
  const tag = basename(path).replace(/\.json$/, '');
  if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults`);
  const shape = shapeFor(sim, data.evo.hidden);
  const champ = ([0, 1] as const).map((t) => {
    // `--gen N` reads generation N's hall-of-fame champion instead of the last one (the alien run always uses its last)
    const e = gen === undefined ? data.hof[t][data.hof[t].length - 1] : data.hof[t].find((x) => x.gen === gen);
    if (!e) throw new Error(`${tag}: no hall-of-fame entry for gen ${gen}`);
    if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
    return Float32Array.from(e.genome);
  });
  return { tag, sim, evo: data.evo, shape, champ };
}

const GEN = flags.has('gen') ? num('gen', 0) : undefined;
const A = load(files[0], GEN);
const ALIEN = files[1] ? load(files[1]) : null;
if (ALIEN && ALIEN.shape.inputs !== A.shape.inputs) {
  throw new Error(`alien run has obsDim ${ALIEN.shape.inputs}, this one has ${A.shape.inputs} — a transplanted vocabulary has to come from the same observation layout`);
}
const map = generateMap(A.evo.mapSeed, A.sim);
const commDim = A.sim.commDim;
/** observation indices of the mate comm slots — what a LISTENER reads */
const COMM_IDX = obsSchema(A.sim).filter((f) => /^mate\d+\.comm\d+$/.test(f.name)).map((f) => f.index);

/* --------------------------------------------------------- layer 1: the sender */

const bin = (v: number) => Math.max(0, Math.min(BINS - 1, Math.floor(((v + 1) / 2) * BINS)));
/** candidate referents a message might be about — all of them legal things the speaker knows */
const REFERENTS = ['enemy visible', 'in a site', 'a site is armed', 'reloading', 'hp below half'] as const;
function referents(w: World, i: number): boolean[] {
  const a = w.agents[i];
  let sees = false;
  for (const e of w.agents) if (e.alive && e.team !== a.team && w.visible[i * w.n + e.id]) { sees = true; break; }
  let inSite = false;
  for (let s = 0; s < w.map.sites.length; s++) if (w.inSite(a, s)) { inSite = true; break; }
  return [sees, inSite, w.armedSite >= 0, a.reloadT > 0, a.hp < w.cfg.hp / 2];
}

const symCount = new Array(BINS).fill(0) as number[];
const joint = REFERENTS.map(() => Array.from({ length: 2 }, () => new Array(BINS).fill(0) as number[]));
const refCount = REFERENTS.map(() => [0, 0]);
/** every transmitted symbol we saw, as an ablation pool */
const pool: number[] = [];

for (let m = 0; m < N; m++) {
  for (const attackers of [0, 1] as const) {
    const w = new World(A.sim, map, hashSeed(2718, m), { attackers });
    const red = new NeuralPolicy(A.shape, A.champ[0]);
    const blue = new NeuralPolicy(A.shape, A.champ[1]);
    while (!w.done) {
      stepMatch(w, red, blue);
      for (let i = 0; i < w.n; i++) {
        if (!w.agents[i].alive) continue;
        const bits = referents(w, i);
        for (let c = 0; c < commDim; c++) {
          const b = bin(w.agents[i].commSaid[c]);
          symCount[b]++;
          pool.push(w.agents[i].commSaid[c]);
          bits.forEach((v, r) => { joint[r][v ? 1 : 0][b]++; refCount[r][v ? 1 : 0]++; });
        }
      }
    }
  }
}

const H = (counts: number[]) => {
  const n = counts.reduce((s, x) => s + x, 0);
  if (n === 0) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) { const p = c / n; h -= p * Math.log2(p); }
  return h;
};
const total = symCount.reduce((s, x) => s + x, 0);
const Hsym = H(symCount);
const silence = symCount[bin(0)] / total;

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`radio analysis — ${A.tag}${GEN === undefined ? '' : `@${GEN}`}, ${N} seeds x 2 role assignments, ${commDim} slot(s), ${BINS} bins`);
console.log(`world radio: ${A.sim.commTokens ? `${2 * A.sim.commTokens + 1} symbols/slot, every ${A.sim.commIntervalTicks}t, ${A.sim.commDelayTicks}t delay` : 'continuous float every tick (pre-D2 baseline)'}`);
console.log();
console.log(`symbol entropy ${Hsym.toFixed(2)} of ${Math.log2(BINS).toFixed(2)} bits possible · silence-bin share ${(silence * 100).toFixed(0)}% · ${total} symbols observed`);
console.log();
console.log(`${padr('candidate referent', 20)}${pad('MI (bits)', 11)}${pad('% of H', 9)}${pad('base rate', 11)}`);
REFERENTS.forEach((name, r) => {
  const n = refCount[r][0] + refCount[r][1];
  const cond = [0, 1].map((v) => (refCount[r][v] / n) * H(joint[r][v]));
  const mi = Hsym - cond.reduce((s, x) => s + x, 0);
  console.log(`${padr(name, 20)}${pad(mi.toFixed(3), 11)}${pad(`${((mi / Math.max(1e-9, Hsym)) * 100).toFixed(0)}%`, 9)}${pad(`${((refCount[r][1] / n) * 100).toFixed(0)}%`, 11)}`);
});
console.log('⚠ MI is a CORRELATION. "this symbol shows up when an enemy is visible" is not "this symbol means enemy".');
console.log();

/* ------------------------------------- layers 2 and 3: receiver and intervention */

let alienPool: number[] = [];
if (ALIEN) {
  for (let m = 0; m < Math.max(2, N >> 1); m++) {
    const w = new World(ALIEN.sim, generateMap(ALIEN.evo.mapSeed, ALIEN.sim), hashSeed(3141, m), { attackers: 0 });
    const red = new NeuralPolicy(ALIEN.shape, ALIEN.champ[0]);
    const blue = new NeuralPolicy(ALIEN.shape, ALIEN.champ[1]);
    while (!w.done) {
      stepMatch(w, red, blue);
      for (let i = 0; i < w.n; i++) if (w.agents[i].alive) for (let c = 0; c < commDim; c++) alienPool.push(w.agents[i].commSaid[c]);
    }
  }
}

type Mode = 'normal' | 'off' | 'shuffled' | 'alien';
function run(mode: Mode) {
  let k = 0;
  const src = mode === 'alien' ? alienPool : pool;
  const edit = mode === 'normal' ? undefined : (w: World) => {
    for (let i = 0; i < w.n; i++) {
      for (const idx of COMM_IDX) {
        w.obs[i * w.obsDim + idx] = mode === 'off' ? 0 : src[(k = (k + 7919) % Math.max(1, src.length))];
      }
    }
  };
  let kills = 0;
  let shots = 0;
  let first = 0;
  let obj = 0;
  let n = 0;
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const w = new World(A.sim, map, hashSeed(2718, m), { attackers });
      const red = new NeuralPolicy(A.shape, A.champ[0]);
      const blue = new NeuralPolicy(A.shape, A.champ[1]);
      while (!w.done) stepMatch(w, red, blue, edit);
      const r = summarize(w);
      for (const t of [0, 1] as const) { kills += r.metrics[t].kills; shots += r.metrics[t].shots; first += r.metrics[t].firstContact; obj += r.metrics[t].objectiveProgress; }
      n += 2;
    }
  }
  return { kills: kills / n, shots: shots / n, first: first / n, obj: obj / n };
}

const MODES: Mode[] = ALIEN ? ['normal', 'off', 'shuffled', 'alien'] : ['normal', 'off', 'shuffled'];
console.log(`${padr('radio', 12)}${pad('kills', 8)}${pad('shots', 8)}${pad('1st shot', 10)}${pad('objective', 11)}`);
for (const mode of MODES) {
  const r = run(mode);
  console.log(`${padr(mode, 12)}${pad(r.kills.toFixed(2), 8)}${pad(r.shots.toFixed(1), 8)}${pad(r.first.toFixed(1), 10)}${pad(r.obj.toFixed(3), 11)}`);
}
console.log();
console.log('off vs normal alone proves only that the input is load-bearing. The claim needs shuffled (and alien)');
console.log('to come out WORSE than normal: same distribution on the wire, correlation with the situation removed.');
console.log('⛔ team-crossplay (A\'s speaker with B\'s listener) is not in this script yet. It needs no genome change:');
console.log('   Policy.act runs per agent, so a wrapper that dispatches by slot puts A in one body and B in the rest.');
