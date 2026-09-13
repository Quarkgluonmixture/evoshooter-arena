/**
 * ROADMAP D2, search side — does evolution have a STEPPING STONE toward using the radio?
 *
 *   node scripts/commstep.ts runs/a.json [more.json ...] [--k 24] [--m 6] [--seed 5150]
 *                            [--sigma-in 0.1] [--sigma-out 0.2]
 *
 * Demand (memdemand), channel (radiodemand) and architecture (identity) are ruled out, which leaves search.
 * Communication is two-sided: a speaker mutation pays nothing while listeners ignore the radio, and a listener
 * mutation pays nothing while speakers broadcast noise. This measures both one-sided steps directly.
 *
 * Each champion is mutated in ONE subset of weights and played against the other colour's unmutated champion,
 * both roles. A mutant is "beneficial" when its team fitness beats the unmutated champion — in the same
 * context — on the training seeds and again on held-out seeds. Every comm class has a control class of the
 * same size and sigma on non-comm weights, because a champion is not optimal on any particular seed set and
 * some random mutations will always look good.
 *
 * `informed` context: every teammate message the mutated team hears is overwritten with an informative call
 * (+1 / -1 = the nearest enemy that teammate can see is nearest our left / right site, 0 = he sees nobody).
 * It asks "if speakers already carried information, would a listener mutation be selected?". ⚠ Analysis only:
 * the call is built from each teammate's own sight, so it is legal information, but nothing in training does this.
 * ⛔ No preset meaning is being proposed for any population here — this measures a landscape, it ships nothing.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { Rng, hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength, layerSizes, type MlpShape } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { A_COMM0, World } from '../src/sim/world.ts';
import { injectCalls } from '../src/probe/radioCall.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
if (files.length === 0) {
  console.error('usage: node scripts/commstep.ts <run.json> [more.json ...] [--k 24] [--m 6] [--seed 5150] [--sigma-in 0.1] [--sigma-out 0.2]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const K = num('k', 24);
const M = num('m', 6);
const BASE = num('seed', 5150);
const SIGMA_IN = num('sigma-in', 0.1);
const SIGMA_OUT = num('sigma-out', 0.2);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }
interface Run { tag: string; sim: SimConfig; shape: MlpShape; map: ArenaMap; champ: Float32Array[]; gen: number }

function load(path: string): Run {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  const { sim, defaulted } = normalizeSim(data.sim);
  const tag = basename(path).replace(/\.json$/, '');
  if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults`);
  if (sim.recurrentDim !== 0) throw new Error(`${tag}: recurrent brains are not supported (input index != obs index)`);
  const shape = shapeFor(sim, data.evo.hidden);
  const champ = ([0, 1] as const).map((t) => {
    const e = data.hof[t][data.hof[t].length - 1];
    if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
    return Float32Array.from(e.genome);
  });
  return { tag, sim, shape, map: generateMap(data.evo.mapSeed, sim), champ, gen: data.hof[0][data.hof[0].length - 1].gen };
}

/* ------------------------------------------------------------- weight subsets */

function layers(shape: MlpShape) {
  const s = layerSizes(shape);
  const out: { nin: number; nout: number; w: number; b: number }[] = [];
  let p = 0;
  for (let l = 1; l < s.length; l++) {
    out.push({ nin: s[l - 1], nout: s[l], w: p, b: p + s[l] * s[l - 1] });
    p += s[l] * s[l - 1] + s[l];
  }
  return out;
}

function subsets(run: Run) {
  const L = layers(run.shape);
  const first = L[0];
  const last = L[L.length - 1];
  const commCols = new Set(obsSchema(run.sim).filter((f) => /^mate\d+\.comm\d+$/.test(f.name)).map((f) => f.index));
  const listener: number[] = [];
  const listenerPool: number[] = [];
  for (let o = 0; o < first.nout; o++) {
    for (let c = 0; c < first.nin; c++) (commCols.has(c) ? listener : listenerPool).push(first.w + o * first.nin + c);
  }
  const speaker: number[] = [];
  const speakerPool: number[] = [];
  for (let o = 0; o < last.nout; o++) {
    const isComm = o >= A_COMM0 && o < A_COMM0 + run.sim.commDim;
    for (let h = 0; h < last.nin; h++) (isComm ? speaker : speakerPool).push(last.w + o * last.nin + h);
    (isComm ? speaker : speakerPool).push(last.b + o);
  }
  return { listener, listenerPool, speaker, speakerPool };
}

function mutant(g: Float32Array, idx: number[], sigma: number, rng: Rng): Float32Array {
  const out = new Float32Array(g);
  for (const i of idx) out[i] += rng.gauss() * sigma;
  return out;
}

function sample(pool: number[], n: number, rng: Rng): number[] {
  const a = pool.slice();
  for (let i = 0; i < n; i++) {
    const j = i + rng.int(a.length - i);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, n);
}

/* ------------------------------------------------------------------ contexts */

type Context = 'evolved' | 'informed';

function evaluate(run: Run, team: 0 | 1, genome: Float32Array, ctx: Context, seedBase: number): { fit: number; sight: number } {
  const mine = new NeuralPolicy(run.shape, genome);
  const theirs = new NeuralPolicy(run.shape, run.champ[1 - team]);
  const edit = ctx === 'informed' ? injectCalls(run.sim, [team]).edit : undefined;
  let fit = 0;
  let sight = 0;
  let n = 0;
  for (let m = 0; m < M; m++) {
    for (const attackers of [0, 1] as const) {
      const w = new World(run.sim, run.map, hashSeed(seedBase, m), { attackers });
      while (!w.done) stepMatch(w, team === 0 ? mine : theirs, team === 0 ? theirs : mine, edit);
      const r = summarize(w);
      fit += r.fitness[team];
      sight += r.metrics[team].sightTicks;
      n++;
    }
  }
  return { fit: fit / n, sight: sight / n };
}

/* ------------------------------------------------------------------------- run */

interface ClassSpec { name: string; ctx: Context; pick: (rng: Rng) => number[]; sigma: number }
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => pad(`${(x * 100).toFixed(0)}%`, 9);

console.log(`comm stepping-stone probe — ${K} mutants per class, ${M} seeds x 2 roles to train + ${M} x 2 held out`);
console.log(`sigma: ${SIGMA_IN} on layer-1 subsets, ${SIGMA_OUT} on output subsets · benefit = beats the unmutated champion on train AND held-out seeds\n`);
console.log(`${padr('champion', 22)}${padr('class', 22)}${pad('benefit', 9)}${pad('train>0', 9)}${pad('inert', 9)}${pad('meanΔ', 9)}${pad('bestΔheld', 11)}`);

const pooled = new Map<string, { ben: number; n: number; inert: number }>();
for (const path of files) {
  const run = load(path);
  const sub = subsets(run);
  const CLASSES: ClassSpec[] = [
    { name: 'listener', ctx: 'evolved', pick: () => sub.listener, sigma: SIGMA_IN },
    { name: 'listener ctl', ctx: 'evolved', pick: (r) => sample(sub.listenerPool, sub.listener.length, r), sigma: SIGMA_IN },
    { name: 'speaker', ctx: 'evolved', pick: () => sub.speaker, sigma: SIGMA_OUT },
    { name: 'speaker ctl', ctx: 'evolved', pick: (r) => sample(sub.speakerPool, sub.speaker.length, r), sigma: SIGMA_OUT },
    { name: 'listener | informed', ctx: 'informed', pick: () => sub.listener, sigma: SIGMA_IN },
    { name: 'listener ctl | informed', ctx: 'informed', pick: (r) => sample(sub.listenerPool, sub.listener.length, r), sigma: SIGMA_IN },
  ];
  for (const team of [0, 1] as const) {
    const champ = run.champ[team];
    const label = `${run.tag}@${run.gen} ${team === 0 ? 'R' : 'B'}`;
    const base = new Map<Context, { train: { fit: number; sight: number }; held: { fit: number; sight: number } }>();
    for (const ctx of ['evolved', 'informed'] as const) {
      base.set(ctx, { train: evaluate(run, team, champ, ctx, BASE), held: evaluate(run, team, champ, ctx, BASE + 1) });
    }
    const bE = base.get('evolved')!;
    const bI = base.get('informed')!;
    console.log(`${padr(label, 22)}base fitness evolved ${bE.train.fit.toFixed(3)} / informed ${bI.train.fit.toFixed(3)} · sight/match ${bE.train.sight.toFixed(0)} / ${bI.train.sight.toFixed(0)}`);
    CLASSES.forEach((cls, ci) => {
      const rng = new Rng(hashSeed(BASE, files.indexOf(path), team, ci));
      const b = base.get(cls.ctx)!;
      let ben = 0;
      let pos = 0;
      let inert = 0;
      let sumD = 0;
      let bestH = -Infinity;
      for (let k = 0; k < K; k++) {
        const g = mutant(champ, cls.pick(rng), cls.sigma, rng);
        const dT = evaluate(run, team, g, cls.ctx, BASE).fit - b.train.fit;
        sumD += dT;
        if (dT === 0) inert++;
        if (dT > 0) {
          pos++;
          const dH = evaluate(run, team, g, cls.ctx, BASE + 1).fit - b.held.fit;
          bestH = Math.max(bestH, dH);
          if (dH > 0) ben++;
        }
      }
      const p = pooled.get(cls.name) ?? { ben: 0, n: 0, inert: 0 };
      p.ben += ben; p.n += K; p.inert += inert;
      pooled.set(cls.name, p);
      console.log(`${padr('', 22)}${padr(cls.name, 22)}${pct(ben / K)}${pct(pos / K)}${pct(inert / K)}${pad((sumD / K).toFixed(3), 9)}${pad(bestH === -Infinity ? '-' : bestH.toFixed(3), 11)}`);
    });
  }
}

const rate = (name: string) => { const p = pooled.get(name)!; return p.ben / p.n; };
console.log('\npooled over all champions:');
for (const [name, p] of pooled) console.log(`  ${padr(name, 24)}benefit ${pct(p.ben / p.n)}  inert ${pct(p.inert / p.n)}  (n=${p.n})`);
const pp = (x: number) => `${(x * 100).toFixed(0)}pp`;
console.log('\nagainst runs/d2-commstep-predictions.txt:');
console.log(`  P1  |listener − ctl| <= 10pp (evolved)           ${pp(rate('listener') - rate('listener ctl'))}`);
console.log(`  P1  |speaker − ctl|  <= 10pp (evolved)           ${pp(rate('speaker') - rate('speaker ctl'))}`);
console.log(`  P2  listener|informed − ctl|informed >= +10pp    ${pp(rate('listener | informed') - rate('listener ctl | informed'))}`);
console.log(`  P2  listener|informed − listener|evolved >= +10pp ${pp(rate('listener | informed') - rate('listener'))}`);
console.log('inert = training fitness bit-identical to the champion: that subset never touched play on those seeds.');
