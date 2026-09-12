/**
 * Fixed-yardstick benchmark — the one comparison that survives a change of rules.
 *
 *   node scripts/yardstick.ts runs/ff.json runs/rec.json [--gens first,last] [--sides both] [--n 8]
 *
 * `crossplay` puts two champions in one arena, which only works while they play the same game: a phase that
 * changes what an action MEANS (V4's auto-aim, D1's extra brain inputs) leaves its champions unable to meet
 * the old ones at all. The hand-written bots in src/brain/scripted.ts have no genome and no observation
 * vector — they read the world and write actions — so they are the same opponent under every rule set, and
 * a win share against them is comparable across the boundary.
 *
 * ⚠ That only holds while the WORLD is unchanged. `recurrentDim` is allowed to differ because it widens the
 * brain's input and nothing else; any other SimConfig difference changes the game the bot is playing too,
 * and the comparison is confounded — so it is a hard error unless you say otherwise.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { BRAIN_ONLY_FIELDS, normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { CamperPolicy, IdlePolicy, RusherPolicy } from '../src/brain/scripted.ts';
import { runMatch } from '../src/evo/match.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
if (files.length === 0) {
  console.error('usage: node scripts/yardstick.ts <run.json> [more.json ...] [--gens last] [--sides both] [--n 8]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 8);
const BASE_SEED = num('seed', 4242);
const GEN_SPEC = (flags.get('gens') ?? 'last').split(',').map((s) => s.trim()).filter(Boolean);
const SIDE_SPEC = flags.get('sides') ?? 'both';

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }

const runs = files.map((f) => {
  const data = JSON.parse(readFileSync(f, 'utf8')) as RunFile;
  const { sim, defaulted } = normalizeSim(data.sim);
  const tag = basename(f).replace(/\.json$/, '');
  if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults for those`);
  return { tag, data: { ...data, sim } };
});
const ref = runs[0];
for (const r of runs.slice(1)) {
  const diffs = (Object.keys(ref.data.sim) as (keyof SimConfig)[])
    .filter((k) => !BRAIN_ONLY_FIELDS.includes(k) && JSON.stringify(ref.data.sim[k]) !== JSON.stringify(r.data.sim[k]));
  if (diffs.length && !flags.has('allow-sim-drift')) {
    throw new Error(`${r.tag} and ${ref.tag} differ in ${diffs.join(', ')} — the scripted bot is playing a different game in each, so its win share is not comparable.\n  Pass --allow-sim-drift only if you have a reason the difference cannot reach the bot.`);
  }
  if (diffs.length) console.warn(`WARNING: ${r.tag} differs in ${diffs.join(', ')} — the yardstick is confounded (--allow-sim-drift)`);
  if (r.data.evo.mapSeed !== ref.data.evo.mapSeed) throw new Error(`${r.tag} was trained on map ${r.data.evo.mapSeed}, ${ref.tag} on ${ref.data.evo.mapSeed}`);
}

interface Entrant { name: string; rules: string; policy: (map: ReturnType<typeof generateMap>) => Policy; sim: SimConfig }

const entrants: Entrant[] = [];
for (const r of runs) {
  const sim = r.data.sim;
  const shape = shapeFor(sim, r.data.evo.hidden);
  for (const [t, side] of [[0, 'R'], [1, 'B']] as const) {
    if (SIDE_SPEC !== 'both' && SIDE_SPEC !== (side === 'R' ? 'red' : 'blue')) continue;
    const hof = r.data.hof[t];
    const idx = new Set<number>();
    for (const g of GEN_SPEC) {
      if (g === 'last') idx.add(hof.length - 1);
      else if (g === 'first') idx.add(0);
      else {
        const at = hof.findIndex((e) => e.gen === Number(g));
        if (at < 0) throw new Error(`--gens ${g}: ${r.tag} has no generation ${g}`);
        idx.add(at);
      }
    }
    for (const i of [...idx].sort((a, b) => a - b)) {
      const e = hof[i];
      if (e.genome.length !== genomeLength(shape)) {
        throw new Error(`${r.tag}:${side}@${e.gen} has ${e.genome.length} weights but its own config implies ${genomeLength(shape)} — the run file and this build disagree`);
      }
      const genome = Float32Array.from(e.genome);
      entrants.push({
        name: `${r.tag}:${side}@${e.gen}`,
        rules: sim.recurrentDim ? `rec${sim.recurrentDim}` : 'ff',
        policy: () => new NeuralPolicy(shape, genome),
        sim,
      });
    }
  }
}
if (entrants.length === 0) throw new Error('no entrants');

const BOTS: { name: string; make: () => Policy }[] = [
  { name: 'rusher', make: () => new RusherPolicy() },
  { name: 'camper', make: () => new CamperPolicy() },
  { name: 'idle', make: () => new IdlePolicy() },
];

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`fixed-yardstick benchmark — ${entrants.length} champions vs ${BOTS.length} hand-written bots, ${N} seeds per side`);
console.log(`map ${ref.data.evo.mapSeed}; each cell is ${2 * N} matches, so a true 50/50 lands within ±${(100 * 1.645 * Math.sqrt(0.25 / (2 * N))).toFixed(0)}pp nine times in ten`);
console.log(`rule sets present: ${[...new Set(entrants.map((e) => e.rules))].join(', ')}`);
console.log();
console.log(`${padr('champion', 26)}${padr('rules', 7)}${BOTS.map((b) => pad(b.name, 16)).join('')}`);

for (const e of entrants) {
  const map = generateMap(ref.data.evo.mapSeed, e.sim);
  const cells: string[] = [];
  for (const bot of BOTS) {
    let w = 0;
    let sight = 0;
    for (let m = 0; m < N; m++) {
      const seed = hashSeed(BASE_SEED, m);
      const asRed = runMatch(e.policy(map), bot.make(), map, seed, e.sim);
      const asBlue = runMatch(bot.make(), e.policy(map), map, seed, e.sim);
      w += asRed.winner === 0 ? 1 : asRed.winner === -1 ? 0.5 : 0;
      w += asBlue.winner === 1 ? 1 : asBlue.winner === -1 ? 0.5 : 0;
      sight += asRed.metrics[0].sightTicks + asRed.metrics[1].sightTicks + asBlue.metrics[0].sightTicks + asBlue.metrics[1].sightTicks;
    }
    const share = w / (2 * N);
    const perMatch = sight / (2 * N);
    cells.push(pad(`${(share * 100).toFixed(0)}%${perMatch === 0 ? '··' : ` (${perMatch.toFixed(0)})`}`, 16));
  }
  console.log(`${padr(e.name, 26)}${padr(e.rules, 7)}${cells.join('')}`);
}
console.log();
console.log('cell = side-balanced win share (mean sighting ticks per match). `··` = they never met, so the share measures nothing.');
console.log('The bots are identical under every rule set, so these columns ARE comparable across a phase boundary — the one');
console.log('comparison crossplay cannot make once genomes stop being interchangeable.');
