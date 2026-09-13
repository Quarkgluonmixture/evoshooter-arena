/**
 * ROADMAP E1 probe — are the current "five players" five people, or five bodies?
 *
 *   node scripts/identity.ts runs/a.json [more.json ...] [--n 16] [--seed 4242]
 *
 * The shared brain's only identity input is the `self.slot` one-hot, and `map.spawns[team][slot]` hands the
 * same label to the spawn position. So "slot 2 plays differently from slot 0" can be pure geometry — a body
 * that starts on the flank takes the flank route — with no identity in the brain at all.
 *
 * This breaks the tie without training anything or touching the sim. Every tick, after observe(), the
 * one-hot is rewritten so the body spawned at slot s reads slot (s + k) mod T, and every seed is played at
 * EVERY rotation k = 0..T-1 (same k for both teams). Each body then carries two labels that are balanced
 * against each other — within a seed each body meets each carrier exactly once:
 *   body    — where it spawned (and everything keyed to that: perception-noise keys, mates' ordering);
 *   carrier — the one-hot it reads, i.e. who the network is told it is.
 * A per-match behaviour vector per body is classified with leave-one-seed-out nearest centroid, once by each
 * label, per (run, colour, role) cell. Chance = 1/T. If behaviour follows the carrier, the brain has
 * individuals; if it follows the body, it has bodies.
 *
 * ⚠ v1 drew ONE k per match. Then any training fold that held a seed with the same k as the held-out seed
 * handed the carrier classifier the body's geometry under a fixed relabelling, and the n=3 smoke run's
 * carrier 47–67% could not be told apart from that leak. The Latin square is what makes the two columns
 * mean two different things.
 * ⚠ A rotated one-hot shows a body a (spawn, one-hot) pairing it never trained on: each input is
 * in-distribution on its own, their JOINT is not. Same shape of control as radio.ts's `shuffled`.
 * ⚠ A low carrier number means "a nearest-centroid classifier over THESE features cannot find it", not
 * "there is nothing to find". ⛔ No role names in here: an identity is a cluster, not a job title.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { Rng, hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength, type MlpShape } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { stepMatch } from '../src/evo/match.ts';
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
  console.error('usage: node scripts/identity.ts <run.json> [more.json ...] [--n 16] [--seed 4242]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 16);
const BASE = num('seed', 4242);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }
interface Run { tag: string; sim: SimConfig; shape: MlpShape; map: ArenaMap; champ: Float32Array[]; gen: number }

function load(path: string): Run {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  const { sim, defaulted } = normalizeSim(data.sim);
  const tag = basename(path).replace(/\.json$/, '');
  if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults`);
  const shape = shapeFor(sim, data.evo.hidden);
  const champ = ([0, 1] as const).map((t) => {
    const e = data.hof[t][data.hof[t].length - 1];
    if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
    return Float32Array.from(e.genome);
  });
  return { tag, sim, shape, map: generateMap(data.evo.mapSeed, sim), champ, gen: data.hof[0][data.hof[0].length - 1].gen };
}

/* ---------------------------------------------------------- behaviour vectors */

interface Sample { seed: number; team: 0 | 1; attacking: boolean; body: number; carrier: number; f: number[] }

function featureNames(sim: SimConfig): string[] {
  const comm = Array.from({ length: sim.commDim }, (_, c) => `comm${c}`);
  return ['meanX', 'meanZ', 'moving', 'aiming', 'shots/s', 'survival', 'mateDist', 'inSite', 'leftLean', ...comm, 'kills'];
}

function play(run: Run, seedIdx: number, k: number, attackers: 0 | 1): Sample[] {
  const { sim } = run;
  const T = sim.teamSize;
  const w = new World(sim, run.map, hashSeed(BASE, seedIdx), { attackers });
  const red = new NeuralPolicy(run.shape, run.champ[0]);
  const blue = new NeuralPolicy(run.shape, run.champ[1]);
  const slot0 = obsSchema(sim).find((f) => f.name === 'self.slot0')!.index;
  const edit = k === 0 ? undefined : (wd: World) => {
    for (let i = 0; i < wd.n; i++) {
      const shown = (wd.agents[i].slot + k) % T;
      const base = i * wd.obsDim + slot0;
      for (let s = 0; s < T; s++) wd.obs[base + s] = s === shown ? 1 : 0;
    }
  };
  // own-frame "left" site per team: the one with the smaller team-frame x
  const left = ([0, 1] as const).map((t) => {
    const sg = t === 0 ? 1 : -1;
    let best = 0;
    run.map.sites.forEach((s, i) => { if (sg * s.x < sg * run.map.sites[best].x) best = i; });
    return best;
  });

  const n = w.n;
  const acc = Array.from({ length: n }, () => ({ ticks: 0, x: 0, z: 0, move: 0, aim: 0, mate: 0, mateN: 0, inSite: 0, lean: 0, comm: new Array(sim.commDim).fill(0) as number[] }));
  let first = true;
  while (!w.done) {
    stepMatch(w, red, blue, edit);
    if (first && edit) {
      // prove the rewrite reached what the brain read, before trusting a single number (GOTCHAS #26)
      const row = w.obs.subarray(slot0, slot0 + T);
      if (row.indexOf(1) !== (w.agents[0].slot + k) % T) throw new Error(`one-hot rewrite did not land: read ${Array.from(row)} for k=${k}`);
      first = false;
    }
    for (let i = 0; i < n; i++) {
      const a = w.agents[i];
      if (!a.alive) continue;
      const sg = a.team === 0 ? 1 : -1;
      const c = acc[i];
      c.ticks++;
      c.x += sg * a.x;
      c.z += sg * a.z;
      if (Math.hypot(a.vx, a.vz) > 0.25 * sim.maxSpeed) c.move++;
      if (a.aim) c.aim++;
      let nearest = Infinity;
      for (const m of w.agents) if (m.alive && m.team === a.team && m.id !== a.id) nearest = Math.min(nearest, Math.hypot(m.x - a.x, m.z - a.z));
      if (nearest < Infinity) { c.mate += nearest; c.mateN++; }
      for (let s = 0; s < run.map.sites.length; s++) if (w.inSite(a, s)) { c.inSite++; break; }
      if (run.map.sites.length > 1) {
        const dists = run.map.sites.map((s) => Math.hypot(s.x - a.x, s.z - a.z));
        if (dists.indexOf(Math.min(...dists)) === left[a.team]) c.lean++;
      }
      for (let d = 0; d < sim.commDim; d++) c.comm[d] += a.commSaid[d];
    }
  }
  return w.agents.map((a, i) => {
    const c = acc[i];
    const t = Math.max(1, c.ticks);
    return {
      seed: seedIdx,
      team: a.team,
      attacking: a.team === attackers,
      body: a.slot,
      carrier: (a.slot + k) % T,
      f: [c.x / t, c.z / t, c.move / t, c.aim / t, a.shots / (t * sim.dt), c.ticks / Math.max(1, w.tick),
        c.mateN ? c.mate / c.mateN : 0, c.inSite / t, c.lean / t, ...c.comm.map((v) => v / t), a.kills],
    };
  });
}

/* ------------------------------------------------------------------ classifier */

/** Leave-one-seed-out nearest centroid, features z-scored on the training fold only. */
function looAccuracy(samples: Sample[], label: (s: Sample) => number, classes: number): number {
  const seeds = [...new Set(samples.map((s) => s.seed))];
  const D = samples[0].f.length;
  let hit = 0;
  for (const held of seeds) {
    const train = samples.filter((s) => s.seed !== held);
    const mu = new Array(D).fill(0) as number[];
    const sd = new Array(D).fill(0) as number[];
    for (const s of train) s.f.forEach((v, d) => { mu[d] += v / train.length; });
    for (const s of train) s.f.forEach((v, d) => { sd[d] += (v - mu[d]) ** 2 / train.length; });
    const z = (f: number[]) => f.map((v, d) => (sd[d] > 1e-12 ? (v - mu[d]) / Math.sqrt(sd[d]) : 0));
    const cent = Array.from({ length: classes }, () => new Array(D).fill(0) as number[]);
    const cnt = new Array(classes).fill(0) as number[];
    for (const s of train) { const l = label(s); z(s.f).forEach((v, d) => { cent[l][d] += v; }); cnt[l]++; }
    cent.forEach((c, l) => c.forEach((_, d) => { c[d] /= Math.max(1, cnt[l]); }));
    for (const s of samples.filter((x) => x.seed === held)) {
      const q = z(s.f);
      let best = 0;
      let bestD = Infinity;
      for (let l = 0; l < classes; l++) {
        if (cnt[l] === 0) continue;
        const d2 = q.reduce((acc, v, d) => acc + (v - cent[l][d]) ** 2, 0);
        if (d2 < bestD) { bestD = d2; best = l; }
      }
      if (best === label(s)) hit++;
    }
  }
  return hit / samples.length;
}

/** Between-class over within-class variance of one feature under one labelling — which features carry it. */
function fisher(samples: Sample[], label: (s: Sample) => number, d: number, classes: number): number {
  const all = samples.map((s) => s.f[d]);
  const mu = all.reduce((a, b) => a + b, 0) / all.length;
  let between = 0;
  let within = 0;
  for (let l = 0; l < classes; l++) {
    const xs = samples.filter((s) => label(s) === l).map((s) => s.f[d]);
    if (xs.length === 0) continue;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    between += xs.length * (m - mu) ** 2;
    within += xs.reduce((a, v) => a + (v - m) ** 2, 0);
  }
  return within > 1e-12 ? between / within : 0;
}

/* ------------------------------------------------------------------------- run */

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => pad(`${(x * 100).toFixed(0)}%`, 9);

console.log(`E1 identity probe — ${N} seeds x every one-hot rotation x both role assignments per run, last hof champion of each colour`);
console.log('aligned = rotation 0 only, the world as trained · body / carrier / random = all rotations, balanced (Latin square)');
console.log(`chance = 1/teamSize · random = labels permuted per seed (must read ~chance or the fold is leaking)\n`);
console.log(`${padr('run', 20)}${padr('cell', 14)}${pad('aligned', 9)}${pad('body', 9)}${pad('carrier', 9)}${pad('random', 9)}${pad('shots/p', 9)}${pad('alive', 8)}`);

let cells = 0;
let p1 = 0;
let p2a = 0;
let p2b = 0;
const fisherBody: number[] = [];
const fisherCarrier: number[] = [];
let names: string[] = [];
// `--drop comm0,comm1` classifies without those features. A per-slot constant offset on the radio output is
// identity only in the thinnest sense; dropping it asks whether the carrier shows up in how a body MOVES and FIGHTS.
const DROP = new Set((flags.get('drop') ?? '').split(',').filter(Boolean));
if (DROP.size) console.log(`dropped features: ${[...DROP].join(', ')}\n`);
for (const path of files) {
  const run = load(path);
  const T = run.sim.teamSize;
  const allNames = featureNames(run.sim);
  const keep = allNames.map((_, d) => d).filter((d) => !DROP.has(allNames[d]));
  names = keep.map((d) => allNames[d]);
  const aligned: Sample[] = [];
  const balanced: Sample[] = [];
  for (let m = 0; m < N; m++) {
    for (let k = 0; k < T; k++) {
      for (const attackers of [0, 1] as const) {
        const got = play(run, m, k, attackers);
        if (k === 0) aligned.push(...got);
        balanced.push(...got);
      }
    }
  }
  for (const team of [0, 1] as const) {
    for (const attacking of [true, false]) {
      const pick = (xs: Sample[]) => xs.filter((s) => s.team === team && s.attacking === attacking);
      const raw = pick(balanced);
      // denominators come off the full vector, before any feature is dropped
      const shots = raw.reduce((a, s) => a + s.f[4] * s.f[5] * run.sim.matchSeconds, 0) / raw.length;
      const alive = raw.reduce((a, s) => a + s.f[5], 0) / raw.length;
      const project = (xs: Sample[]) => xs.map((s) => ({ ...s, f: keep.map((d) => s.f[d]) }));
      const A = project(pick(aligned));
      const S = project(raw);
      const perm = new Map<number, number[]>();
      const rng = new Rng(hashSeed(BASE, 0x7a, team, attacking ? 1 : 0));
      for (const s of S) if (!perm.has(s.seed)) perm.set(s.seed, rng.shuffle(Array.from({ length: T }, (_, i) => i)));
      const accA = looAccuracy(A, (s) => s.body, T);
      const accBody = looAccuracy(S, (s) => s.body, T);
      const accCarrier = looAccuracy(S, (s) => s.carrier, T);
      const accRandom = looAccuracy(S, (s) => perm.get(s.seed)![s.body], T);
      cells++;
      if (accA >= 0.5) p1++;
      if (accBody > accCarrier) p2a++;
      if (accCarrier <= 0.35) p2b++;
      names.forEach((_, d) => {
        fisherBody[d] = (fisherBody[d] ?? 0) + fisher(S, (s) => s.body, d, T);
        fisherCarrier[d] = (fisherCarrier[d] ?? 0) + fisher(S, (s) => s.carrier, d, T);
      });
      console.log(`${padr(`${run.tag}@${run.gen}`, 20)}${padr(`${team === 0 ? 'red' : 'blue'} ${attacking ? 'atk' : 'def'}`, 14)}` +
        `${pct(accA)}${pct(accBody)}${pct(accCarrier)}${pct(accRandom)}${pad(shots.toFixed(1), 9)}${pad(alive.toFixed(2), 8)}`);
    }
  }
}

console.log();
const rank = (xs: number[]) => names.map((nm, d) => ({ nm, v: xs[d] / cells })).sort((a, b) => b.v - a.v).slice(0, 4)
  .map((e) => `${e.nm} ${e.v.toFixed(2)}`).join(' · ');
console.log(`features that separate BODIES   (mean Fisher ratio): ${rank(fisherBody)}`);
console.log(`features that separate CARRIERS (mean Fisher ratio): ${rank(fisherCarrier)}`);
console.log();
console.log(`against runs/e1-identity-predictions.txt, ${cells} cells:`);
console.log(`  P1  aligned >= 50%            ${p1}/${cells}  (predicted >= ${Math.ceil(cells * 0.75)})`);
console.log(`  P2  body > carrier            ${p2a}/${cells}  (predicted >= ${Math.ceil(cells * 0.75)})`);
console.log(`  P2  carrier <= 35%            ${p2b}/${cells}  (predicted >= ${Math.ceil(cells * 0.75)})`);
console.log('shots/p and alive are the denominators: a cell where bodies barely live or never shoot has little behaviour to classify.');
