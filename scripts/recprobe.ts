/**
 * Hidden-state ablation — ROADMAP D1's exit question: is the recurrent state actually load-bearing?
 *
 *   node scripts/recprobe.ts runs/d1-C-rec-s1.json [--gens last] [--n 8]
 *
 * Plays each champion three times over the same seeds:
 *   live    — normally;
 *   wiped   — `world.brain` zeroed after every tick, so nothing crosses a tick boundary;
 *   frozen  — the state is snapshotted early and re-fed unchanged for the rest of the match.
 *
 * `wiped` alone cannot carry the claim: it removes 29 % of the network's inputs, and any trained network
 * degrades when you blank a chunk of its input. `frozen` is the control that separates the two stories —
 * the input stays in-distribution and non-zero, and only its TIME-VARYING content is gone. If frozen hurts
 * about as much as wiped, what the state carries is history. If frozen is fine and only wiped hurts, the
 * state is working as a learned constant, not as memory (DISCOVERY contract: mechanism ≠ evolved mechanism).
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

type Mode = 'live' | 'wiped' | 'frozen' | 'alien';
const FREEZE_TICK = 10; // long enough for the state to leave its zero start, early enough to erase a match

/** A state captured from a DIFFERENT match, so it is in-distribution but carries nothing about this one. */
let alienState: Float32Array | null = null;

/**
 * One match under one ablation mode. Only the WATCHED team's slice of the state is touched: when the
 * opponent is the run's own champion it has a recurrent brain too, and ablating both sides would compare
 * two crippled teams and call the wash a null result.
 */
function play(red: Policy, blue: Policy, seed: number, mode: Mode, watch: 0 | 1, into: Tally, m: ArenaMap): void {
  const w = new World(sim, m, seed);
  let frozenState: Float32Array | null = null;
  // running mean/variance of the watched team's state, sampled once per tick
  const sum = new Float32Array(rec);
  const sq = new Float32Array(rec);
  let ticks = 0;
  const base = watch === 0 ? 0 : sim.teamSize;
  while (!w.done) {
    stepMatch(w, red, blue);
    ticks++;
    const lo = base * rec;
    const hi = (base + sim.teamSize) * rec;
    if (mode === 'wiped') w.brain.fill(0, lo, hi);
    else if (mode === 'frozen') {
      if (ticks === FREEZE_TICK) frozenState = w.brain.slice(lo, hi);
      else if (frozenState) w.brain.set(frozenState, lo);
    } else if (mode === 'alien' && alienState) {
      w.brain.set(alienState, lo);
    }
    // Sampled AFTER the mode is applied, so the statistics describe what the brain will actually be fed
    // next tick — on a frozen/alien row that is a constant, and `var` should read ~0.
    for (let k = 0; k < rec; k++) {
      const v = w.brain[base * rec + k];
      sum[k] += v;
      sq[k] += v * v;
      if (Math.abs(v) > 0.99) into.sat++;
      into.stateAbs += Math.abs(v);
    }
    into.samples += rec;
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

// Capture the alien donor once, from a match on a seed that no evaluation cell uses, so it is a real
// in-distribution state that has nothing to do with the matches it will be fed into.
{
  const w = new World(sim, map, hashSeed(97531, 0));
  const red = new NeuralPolicy(shape, champ[0].genome);
  const blue = new NeuralPolicy(shape, champ[1].genome);
  for (let i = 0; i < FREEZE_TICK && !w.done; i++) stepMatch(w, red, blue);
  alienState = w.brain.slice(0, sim.teamSize * rec);
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`hidden-state ablation — ${tag}, recurrentDim ${rec}, memorySeconds ${sim.memorySeconds}`);
console.log(`${champ[0].name} over ${N} seeds x 2 colours per opponent; "wiped" zeroes world.brain after every tick`);
console.log();
console.log(`${padr('opponent', 16)}${padr('state', 8)}${pad('win', 6)}${pad('kills', 8)}${pad('shots', 8)}${pad('1st shot', 10)}${pad('sight', 8)}${pad('|h|', 7)}${pad('var', 8)}${pad('sat%', 7)}`);

for (const opp of OPPONENTS) {
  for (const mode of ['live', 'wiped', 'frozen', 'alien'] as const) {
    const t = blank();
    for (let m = 0; m < N; m++) {
      const seed = hashSeed(24680, m);
      play(new NeuralPolicy(shape, champ[0].genome), opp.make(), seed, mode, 0, t, map);
      play(opp.make(), new NeuralPolicy(shape, champ[0].genome), seed, mode, 1, t, map);
    }
    const g = 2 * N;
    console.log(
      `${padr(mode === 'live' ? opp.name : '', 16)}${padr(mode, 8)}` +
      `${pad(`${((t.win / g) * 100).toFixed(0)}%`, 6)}${pad((t.kills / g).toFixed(2), 8)}${pad((t.shots / g).toFixed(1), 8)}` +
      `${pad((t.first / g).toFixed(1), 10)}${pad((t.sight / g).toFixed(0), 8)}` +
      `${pad((t.stateAbs / t.samples).toFixed(3), 7)}${pad((t.stateVar / rec).toFixed(4), 8)}${pad(`${((t.sat / t.samples) * 100).toFixed(0)}%`, 7)}`,
    );
  }
}
console.log();
console.log('`var` is the mean per-unit variance of the state over a match, on the LIVE row. Near zero means the state');
console.log('never moves, and then "wiping made no difference" says nothing about memory — there was nothing to wipe.');
console.log(`frozen = this match's state snapshotted at tick ${FREEZE_TICK} and re-fed unchanged: same magnitude, no history.`);
console.log('alien  = a state captured once from a different match and re-fed everywhere: in-distribution, and');
console.log('         not about this match at all. frozen ≈ alien ≈ live means the channel is a learned CONSTANT.');
