/**
 * Hidden-state ablation — ROADMAP D1's exit question: is the recurrent state actually load-bearing?
 *
 *   node scripts/recprobe.ts runs/d1-C-rec-s1.json [--gens last] [--n 8]
 *
 * Plays each champion twice over the same seeds: once normally, once with `world.brain` zeroed after every
 * tick, so the brain is handed a blank state at every step and can carry nothing across time. A difference
 * proves the state is being used. No difference proves it is not — which is a real outcome for D1, not a
 * broken experiment: a 40-unit Elman state trained by mutation alone may simply never learn to integrate.
 *
 * ⚠ An ablation that changes nothing because there was nothing to ablate is the same shape of empty result
 * as a win rate over zero sighting ticks, so the state's own statistics are printed next to the behaviour:
 * if the state never moves, or every unit is saturated, the comparison had nothing to remove.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { CamperPolicy, RusherPolicy } from '../src/brain/scripted.ts';
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
  console.error('usage: node scripts/recprobe.ts <run.json> [--gens last] [--n 8]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 8);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }

const raw = JSON.parse(readFileSync(files[0], 'utf8')) as RunFile;
const tag = basename(files[0]).replace(/\.json$/, '');
const { sim, defaulted } = normalizeSim(raw.sim);
if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults`);
if (sim.recurrentDim === 0) throw new Error(`${tag} was trained with recurrentDim 0 — there is no state to ablate`);
const shape = shapeFor(sim, raw.evo.hidden);
const map = generateMap(raw.evo.mapSeed, sim);
const rec = sim.recurrentDim;

const spec = flags.get('gens') ?? 'last';
const pickGen = (hof: RunHofEntry[]) => (spec === 'last' ? hof[hof.length - 1] : spec === 'first' ? hof[0] : hof.find((e) => e.gen === Number(spec))!);
const champ = ([0, 1] as const).map((t) => {
  const e = pickGen(raw.hof[t]);
  if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}:${t}@${e.gen} has ${e.genome.length} weights, config implies ${genomeLength(shape)}`);
  return { name: `${t === 0 ? 'R' : 'B'}@${e.gen}`, genome: Float32Array.from(e.genome) };
});

interface Tally { win: number; sight: number; shots: number; kills: number; first: number; stateAbs: number; stateVar: number; sat: number; samples: number }
const blank = (): Tally => ({ win: 0, sight: 0, shots: 0, kills: 0, first: 0, stateAbs: 0, stateVar: 0, sat: 0, samples: 0 });

/** One match, optionally with the recurrent state wiped after every tick. */
function play(red: Policy, blue: Policy, seed: number, ablate: boolean, watch: 0 | 1, into: Tally, m: ArenaMap): void {
  const w = new World(sim, m, seed);
  // running mean/variance of the watched team's state, sampled once per tick
  const sum = new Float32Array(rec);
  const sq = new Float32Array(rec);
  let ticks = 0;
  const base = watch === 0 ? 0 : sim.teamSize;
  while (!w.done) {
    stepMatch(w, red, blue);
    for (let k = 0; k < rec; k++) {
      const v = w.brain[base * rec + k];
      sum[k] += v;
      sq[k] += v * v;
      if (Math.abs(v) > 0.99) into.sat++;
      into.stateAbs += Math.abs(v);
    }
    into.samples += rec;
    ticks++;
    if (ablate) w.brain.fill(0);
  }
  for (let k = 0; k < rec; k++) into.stateVar += Math.max(0, sq[k] / ticks - (sum[k] / ticks) ** 2);
  const r = summarize(w);
  const me = r.metrics[watch];
  into.win += r.winner === watch ? 1 : r.winner === -1 ? 0.5 : 0;
  into.sight += me.sightTicks + r.metrics[watch === 0 ? 1 : 0].sightTicks;
  into.shots += me.shots;
  into.kills += me.kills;
  into.first += me.firstContact;
}

const OPPONENTS: { name: string; make: () => Policy; sideNeutral: boolean }[] = [
  { name: `own ${champ[1].name}`, make: () => new NeuralPolicy(shape, champ[1].genome), sideNeutral: true },
  { name: 'rusher', make: () => new RusherPolicy(), sideNeutral: true },
  { name: 'camper', make: () => new CamperPolicy(), sideNeutral: true },
];

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`hidden-state ablation — ${tag}, recurrentDim ${rec}, memorySeconds ${sim.memorySeconds}`);
console.log(`${champ[0].name} over ${N} seeds x 2 colours per opponent; "wiped" zeroes world.brain after every tick`);
console.log();
console.log(`${padr('opponent', 16)}${padr('state', 8)}${pad('win', 6)}${pad('kills', 8)}${pad('shots', 8)}${pad('1st shot', 10)}${pad('sight', 8)}${pad('|h|', 7)}${pad('var', 8)}${pad('sat%', 7)}`);

for (const opp of OPPONENTS) {
  for (const ablate of [false, true]) {
    const t = blank();
    for (let m = 0; m < N; m++) {
      const seed = hashSeed(24680, m);
      play(new NeuralPolicy(shape, champ[0].genome), opp.make(), seed, ablate, 0, t, map);
      play(opp.make(), new NeuralPolicy(shape, champ[0].genome), seed, ablate, 1, t, map);
    }
    const g = 2 * N;
    console.log(
      `${padr(ablate ? '' : opp.name, 16)}${padr(ablate ? 'wiped' : 'live', 8)}` +
      `${pad(`${((t.win / g) * 100).toFixed(0)}%`, 6)}${pad((t.kills / g).toFixed(2), 8)}${pad((t.shots / g).toFixed(1), 8)}` +
      `${pad((t.first / g).toFixed(1), 10)}${pad((t.sight / g).toFixed(0), 8)}` +
      `${pad((t.stateAbs / t.samples).toFixed(3), 7)}${pad((t.stateVar / rec).toFixed(4), 8)}${pad(`${((t.sat / t.samples) * 100).toFixed(0)}%`, 7)}`,
    );
  }
}
console.log();
console.log('`var` is the mean per-unit variance of the state over a match, on the LIVE row. Near zero means the state');
console.log('never moves, and then "wiping made no difference" says nothing about memory — there was nothing to wipe.');
