/**
 * Inheritance / mutation sensitivity — the gate ROADMAP D1 and GOTCHAS #6 demand BEFORE any change to
 * genome scale (V6b's recurrent brain, V7's per-player parameters, E1's club genotype).
 *
 *   node scripts/inherit.ts runs/v6a-fade-s1.json [--side R|B] [--gen last] [--children 16]
 *                           [--matches 4] [--sigma .05] [--rate .02] [--reset .002] [--sweep] [--fanin]
 *
 * The question is not "is the genome bigger", it is "does a child still behave like its parent". One
 * mutate() call perturbs each weight, and the closed form for how far that moves a layer's PRE-activation,
 * relative to the pre-activation itself, is
 *
 *     v = resetProb * (0.25 + s^2) + mutRate * sigma^2        per-weight perturbation variance
 *     D = sqrt(v) / s                                          s = that layer's actual weight std
 *
 * (a reset REPLACES a weight with gauss*0.5 rather than nudging it, so it contributes 0.25 + s^2.)
 * D is what collapses a population when it gets too large (GOTCHAS #1). This script measures D directly
 * and checks it against the formula, so the next scale change can be reasoned about instead of guessed.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { EvoConfig, SimConfig } from '../src/core/config.ts';
import { Rng, hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { Mlp, layerSizes, randomGenome, genomeLength, type MlpShape } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { mutate, mutationVariance, RESET_SCALE } from '../src/evo/genetic.ts';
import { evaluateJobs, type MatchJob } from '../src/evo/trainer.ts';
import { stepMatch } from '../src/evo/match.ts';
import { World, ACT_DIM } from '../src/sim/world.ts';

/* ----------------------------------------------------------------------- args */

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
if (files.length === 0) {
  console.error('usage: node scripts/inherit.ts <run.json> [--side R] [--gen last] [--children 16] [--sweep] [--fanin]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const CHILDREN = num('children', 16);
const MATCHES = num('matches', 4);
const SIGMA = num('sigma', 0.05);
const RATE = num('rate', 0.02);
const RESET = num('reset', 0.002);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }

const runs = files.map((f) => ({ tag: basename(f).replace(/\.json$/, ''), data: JSON.parse(readFileSync(f, 'utf8')) as RunFile }));
const ref = runs[0];
const sim = ref.data.sim;
const shape = shapeFor(sim, ref.data.evo.hidden);
const map = generateMap(ref.data.evo.mapSeed, sim);

const pick = (r: typeof ref, side: 'R' | 'B') => {
  const hof = r.data.hof[side === 'R' ? 0 : 1];
  const spec = flags.get('gen') ?? 'last';
  const e = spec === 'last' ? hof[hof.length - 1] : spec === 'first' ? hof[0] : hof.find((x) => x.gen === Number(spec))!;
  if (!e) throw new Error(`${r.tag}: no hall-of-fame entry for --gen ${spec}`);
  if (e.genome.length !== genomeLength(shape)) throw new Error(`${r.tag}:${side}@${e.gen} has ${e.genome.length} weights, this build expects ${genomeLength(shape)}`);
  return { name: `${r.tag}:${side}@${e.gen}`, genome: Float32Array.from(e.genome) };
};

const parent = pick(ref, (flags.get('side') as 'R' | 'B') ?? 'R');
// The sparring partner comes from a DIFFERENT run when one is available: two champions of the same run
// can be a mutual-avoidance pair and then the observation batch has no enemy in it (GOTCHAS #18).
const foe = runs.length > 1 ? pick(runs[1], 'B') : pick(ref, 'B');

/* ------------------------------------------------------- real observation batch */

const rows: Float32Array[] = [];
let batchSight = 0;
{
  const pol = new NeuralPolicy(shape, parent.genome);
  const other = new NeuralPolicy(shape, foe.genome);
  for (let m = 0; m < MATCHES; m++) {
    const w = new World(sim, map, hashSeed(31337, m));
    while (!w.done) {
      stepMatch(w, pol, other);
      for (let i = 0; i < w.n; i++) {
        if (w.agents[i].alive && rows.length < 30000) rows.push(w.obs.slice(i * w.obsDim, (i + 1) * w.obsDim));
      }
    }
    batchSight += w.stats[0].sightTicks + w.stats[1].sightTicks;
  }
}

/* --------------------------------------------------- per-layer disruption, D */

const sizes = layerSizes(shape);
const LAYERS = sizes.length - 1;

/** Weight std of each layer (weights only, biases excluded — biases have no fan-in to normalise against). */
function layerWeightStd(g: Float32Array, sh: MlpShape): number[] {
  const s = layerSizes(sh);
  const out: number[] = [];
  let p = 0;
  for (let l = 1; l < s.length; l++) {
    const nin = s[l - 1];
    const nout = s[l];
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < nout * nin; i++) { sum += g[p + i]; sq += g[p + i] * g[p + i]; }
    const n = nout * nin;
    out.push(Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)));
    p += nout * nin + nout;
  }
  return out;
}

// the formula itself lives next to mutate() in src/evo/genetic.ts — one copy, no drift
const predictedD = (s: number, sigma: number, rate: number, reset: number) =>
  Math.sqrt(mutationVariance(s, { mutSigma: sigma, mutRate: rate, resetProb: reset })) / s;

/** Measured D: std of the per-unit pre-activation CHANGE over std of the pre-activation itself. */
function measureD(
  sh: MlpShape,
  p: Float32Array,
  children: Float32Array[],
  batch: Float32Array[],
): { d: number[]; act: number } {
  const s = layerSizes(sh);
  const mk = () => s.slice(1).map((n) => new Float32Array(n));
  const tp = mk();
  const tc = mk();
  const outP = new Float32Array(ACT_DIM);
  const outC = new Float32Array(ACT_DIM);
  const parentMlp = new Mlp(sh, p);
  const sumSq = new Array(s.length - 1).fill(0);
  const sumRef = new Array(s.length - 1).fill(0);
  let actSq = 0;
  let actRef = 0;
  for (const child of children) {
    const childMlp = new Mlp(sh, child);
    for (const row of batch) {
      parentMlp.forward(row, 0, outP, 0, tp);
      childMlp.forward(row, 0, outC, 0, tc);
      for (let l = 0; l < s.length - 1; l++) {
        for (let o = 0; o < tp[l].length; o++) {
          const dv = tc[l][o] - tp[l][o];
          sumSq[l] += dv * dv;
          sumRef[l] += tp[l][o] * tp[l][o];
        }
      }
      for (let o = 0; o < ACT_DIM; o++) { actSq += (outC[o] - outP[o]) ** 2; actRef += outP[o] * outP[o]; }
    }
  }
  return {
    d: sumSq.map((v, l) => Math.sqrt(v / Math.max(1e-12, sumRef[l]))),
    act: Math.sqrt(actSq / Math.max(1e-12, actRef)),
  };
}

function children(p: Float32Array, sigma: number, rate: number, reset: number, seed: number): Float32Array[] {
  const rng = new Rng(seed);
  return Array.from({ length: CHILDREN }, () => mutate(p, rng, { mutSigma: sigma, mutRate: rate, resetProb: reset }));
}

/* --------------------------------------------------------------------- report */

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const f3 = (x: number) => pad(x.toFixed(3), 7);

console.log(`inheritance sensitivity — parent → child under mutate()`);
console.log(`parent ${parent.name}   sparring ${foe.name}   layers ${sizes.join('→')}   genome ${genomeLength(shape)}`);
console.log(`observation batch: ${rows.length} rows from ${MATCHES} matches, ${batchSight} sighting ticks total${batchSight === 0 ? '  ⚠ NO CONTACT — the batch has no enemy in it (GOTCHAS #18); pass a second run' : ''}`);
console.log(`settings: sigma ${SIGMA}  rate ${RATE}  reset ${RESET}   children ${CHILDREN}`);
console.log();

const stds = layerWeightStd(parent.genome, shape);
const kids = children(parent.genome, SIGMA, RATE, RESET, 4242);
const meas = measureD(shape, parent.genome, kids, rows);
console.log('per-layer relative pre-activation disruption   D = sqrt(reset*(0.25+s²) + rate*sigma²) / s');
console.log(`${padr('layer', 7)}${pad('fan-in', 8)}${pad('s (std)', 10)}${pad('predicted', 11)}${pad('measured', 10)}${pad('ratio', 8)}`);
for (let l = 0; l < LAYERS; l++) {
  const pd = predictedD(stds[l], SIGMA, RATE, RESET);
  console.log(`${padr(String(l + 1), 7)}${pad(String(sizes[l]), 8)}${pad(stds[l].toFixed(4), 10)}${f3(pd)}${' '.repeat(4)}${f3(meas.d[l])}${' '.repeat(3)}${pad((meas.d[l] / pd).toFixed(2), 8)}`);
}
console.log(`action outputs: relative change ${meas.act.toFixed(3)}`);
console.log();

// which term of v actually dominates at these settings
{
  const s = stds[0];
  const resetTerm = RESET * (RESET_SCALE * RESET_SCALE + s * s);
  const sigmaTerm = RATE * SIGMA * SIGMA;
  console.log(`what sets D at these settings (layer 1): reset term ${resetTerm.toExponential(1)} vs sigma term ${sigmaTerm.toExponential(1)}` +
    `  ⇒ ${resetTerm > sigmaTerm ? `RESET dominates by ${(resetTerm / sigmaTerm).toFixed(1)}x` : `SIGMA dominates by ${(sigmaTerm / resetTerm).toFixed(1)}x`}`);
  console.log();
}

/* --------------------------------------------- parent and children vs one yardstick */
{
  // The first version duelled each child against its own parent and read a clean 50 % — over ZERO sighting
  // ticks. A champion and its near-copies inherit the same mutual-avoidance equilibrium, so they never meet
  // (GOTCHAS #18/#20). Score both against a THIRD party instead: same opponent, same seeds, both colours.
  const n = num('duel', 3);
  const genomes = [parent.genome, foe.genome, ...kids];
  const jobs: MatchJob[] = [];
  const contenders = [0, ...kids.map((_, i) => i + 2)];
  for (const c of contenders) {
    for (let m = 0; m < n; m++) {
      jobs.push({ red: c, blue: 1, seed: hashSeed(555, m), credit: 0, kind: 'ladder' });
      jobs.push({ red: 1, blue: c, seed: hashSeed(555, m), credit: 0, kind: 'ladder' });
    }
  }
  const res = evaluateJobs(sim, shape, map, genomes, jobs, false);
  const scores: number[] = [];
  let sight = 0;
  let k = 0;
  for (let ci = 0; ci < contenders.length; ci++) {
    let w = 0;
    for (let m = 0; m < n; m++) {
      const asRed = res[k++];
      const asBlue = res[k++];
      w += asRed.winner === 0 ? 1 : asRed.winner === -1 ? 0.5 : 0;
      w += asBlue.winner === 1 ? 1 : asBlue.winner === -1 ? 0.5 : 0;
      sight += asRed.metrics[0].sightTicks + asRed.metrics[1].sightTicks + asBlue.metrics[0].sightTicks + asBlue.metrics[1].sightTicks;
    }
    scores.push(w / (2 * n));
  }
  const pScore = scores[0];
  const kidScores = scores.slice(1);
  const mean = kidScores.reduce((a, b) => a + b, 0) / kidScores.length;
  const sd = Math.sqrt(kidScores.reduce((a, b) => a + (b - mean) ** 2, 0) / kidScores.length);
  const lo = Math.min(...kidScores);
  const hi = Math.max(...kidScores);
  console.log(`vs the yardstick ${foe.name}, side-balanced over ${n} seeds x 2 colours (${(sight / res.length).toFixed(0)} sighting ticks/match):`);
  console.log(`  parent   ${(pScore * 100).toFixed(0)}%`);
  console.log(`  children ${(mean * 100).toFixed(0)}% mean, sd ${(sd * 100).toFixed(0)}pp, range ${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%  (n=${kidScores.length})`);
  console.log(`  Δ mean − parent: ${((mean - pScore) * 100).toFixed(0)}pp — a large negative gap is the mutation breaking behaviour, which is what killed the sigma 0.15 population (GOTCHAS #1)`);
  if (sight === 0) console.log('  ⚠ ZERO sighting ticks: this yardstick never meets anyone here, so the row above measures nothing');
  console.log();
}

/* ------------------------------------------------------------------- sweeps */

if (flags.has('sweep')) {
  console.log('sweep — measured layer-1 D and action change');
  console.log(`${padr('sigma', 8)}${padr('rate', 8)}${padr('reset', 9)}${pad('pred D1', 9)}${pad('meas D1', 9)}${pad('action', 9)}`);
  const grid: [number, number, number][] = [];
  for (const sg of [0.02, 0.05, 0.08, 0.15]) grid.push([sg, RATE, RESET]);
  for (const rt of [0.01, 0.04]) grid.push([SIGMA, rt, RESET]);
  for (const rs of [0, 0.001, 0.005, 0.02]) grid.push([SIGMA, RATE, rs]);
  const sub = rows.filter((_, i) => i % 4 === 0); // the sweep only needs the ratio, not every row
  for (const [sg, rt, rs] of grid) {
    const ks = children(parent.genome, sg, rt, rs, 909);
    const m = measureD(shape, parent.genome, ks, sub);
    console.log(`${padr(String(sg), 8)}${padr(String(rt), 8)}${padr(String(rs), 9)}${f3(predictedD(stds[0], sg, rt, rs))}${' '.repeat(2)}${f3(m.d[0])}${' '.repeat(2)}${f3(m.act)}`);
  }
  console.log();
}

if (flags.has('fanin')) {
  // Does D follow FAN-IN or total genome size? Random genomes at init scale (s = 1/sqrt(fan_in)) —
  // these are not players (GOTCHAS #13), but D is a property of the weights, not of the behaviour.
  console.log('fan-in law — random genomes at init scale, so s = 1/sqrt(fan-in) by construction');
  console.log(`${padr('hidden', 12)}${pad('genome', 9)}${pad('layer', 7)}${pad('fan-in', 8)}${pad('pred D', 9)}${pad('meas D', 9)}${pad('ratio', 8)}`);
  const sub = rows.filter((_, i) => i % 8 === 0);
  for (const hidden of [[24, 16], [40, 24], [80, 48], [160, 96]]) {
    const sh = shapeFor(sim, hidden);
    const rng = new Rng(7);
    const g = randomGenome(sh, rng);
    const ss = layerWeightStd(g, sh);
    const ks = Array.from({ length: 6 }, () => mutate(g, rng, { mutSigma: SIGMA, mutRate: RATE, resetProb: RESET }));
    const m = measureD(sh, g, ks, sub);
    const sz = layerSizes(sh);
    for (let l = 0; l < sz.length - 1; l++) {
      const pd = predictedD(ss[l], SIGMA, RATE, RESET);
      console.log(`${padr(l === 0 ? `[${hidden}]` : '', 12)}${pad(l === 0 ? String(genomeLength(sh)) : '', 9)}${pad(String(l + 1), 7)}${pad(String(sz[l]), 8)}${f3(pd)}${' '.repeat(2)}${f3(m.d[l])}${' '.repeat(2)}${pad((m.d[l] / pd).toFixed(2), 8)}`);
    }
  }
  console.log();
  console.log('V6b forecast: concatenating an H-unit recurrent state onto the observation takes layer 1 fan-in');
  for (const H of [24, 40, 64]) {
    const nin = sizes[0] + H; // layer-1 fan-in becomes obsDim + recurrent state
    const sInit = 1 / Math.sqrt(nin);
    const s0 = 1 / Math.sqrt(sizes[0]);
    console.log(`  ${sizes[0]} → ${nin} (H=${H}): D ${predictedD(s0, SIGMA, RATE, RESET).toFixed(3)} → ${predictedD(sInit, SIGMA, RATE, RESET).toFixed(3)}` +
      `  (${(((predictedD(sInit, SIGMA, RATE, RESET) / predictedD(s0, SIGMA, RATE, RESET)) - 1) * 100).toFixed(0)}%)`);
  }
}
