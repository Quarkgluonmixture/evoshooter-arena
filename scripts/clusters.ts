/**
 * ROADMAP G3 — CLUB / TEAM CLUSTERS: do champions that co-evolved together look alike?
 *
 *   node scripts/clusters.ts runs/a.json runs/b.json ... [--n 6] [--map 7]
 *
 * ⛔ Not "style.ts on more files": that script z-scores inside its own sweep and measures each lineage against
 * ITS OWN final opponent — two different rulers, so its coordinates are not comparable between runs. Clustering
 * needs one space and one ruler, and the repo already has the ruler: a HAND-WRITTEN reference bot, the only
 * thing that compares across boundaries because it has no genome, reads no observations and does not co-evolve.
 * Every champion plays the same bot; the raw METRIC_KEYS vectors are z-scored across the whole field at once.
 * ⛔ The bot is a measuring stick — C1's exit forbids it in any training pool.
 *
 * ⛔ No k-means: picking k and re-running until the picture looks clean is a garden of forking paths. The
 * question is asked as a NEAREST-NEIGHBOUR test with a chance level stated in advance — is a champion's nearest
 * neighbour in style space its own run-mate? Pre-registration: runs/g3-clusters-predictions.txt.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { SiteDefenderPolicy } from '../src/brain/scripted.ts';
import { METRIC_KEYS, meanMetrics, runMatch, type TeamMetrics } from '../src/evo/match.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 6);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

interface Champ { name: string; run: string; colour: 0 | 1; genome: Float32Array; sim: SimConfig; hidden: number[]; mapSeed: number }
const champs: Champ[] = [];
for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  if (data.scaffold) throw new Error(`${path} is a scaffold run`);
  const { sim } = normalizeSim(data.sim);
  const tag = basename(path).replace(/\.json$/, '');
  for (const colour of [0, 1] as const) {
    const h = data.hof[colour];
    const e = h[h.length - 1];
    champs.push({ name: `${tag}:${colour === 0 ? 'R' : 'B'}@${e.gen}`, run: tag, colour, genome: Float32Array.from(e.genome), sim, hidden: data.evo.hidden, mapSeed: data.evo.mapSeed });
  }
}
if (champs.length < 4) throw new Error('need at least two runs');
// ⛔ one ruler means one rule set: a champion trained under different rules is not measurable here (crossplay's
// drift guard exists for the same reason)
const ref = champs[0];
for (const c of champs) {
  if (genomeLength(shapeFor(c.sim, c.hidden)) !== genomeLength(shapeFor(ref.sim, ref.hidden))) {
    throw new Error(`${c.name} has a different genome shape — ⛔ not comparable in one space`);
  }
}
const MAP_SEED = num('map', ref.mapSeed);
const map = generateMap(MAP_SEED, ref.sim);

/** every champion against the SAME hand-written bot — the only ruler that compares across lineages */
function styleOf(c: Champ): TeamMetrics {
  const rows: TeamMetrics[] = [];
  const shape = shapeFor(c.sim, c.hidden);
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const mine: Policy = new NeuralPolicy(shape, c.genome);
      const bot: Policy = new SiteDefenderPolicy(0);
      const r = runMatch(c.colour === 0 ? mine : bot, c.colour === 0 ? bot : mine, map, hashSeed(0xc1a5, m), c.sim, { attackers });
      rows.push(r.metrics[c.colour]);
    }
  }
  return meanMetrics(rows);
}

const vecs = champs.map(styleOf);
const keys = METRIC_KEYS.filter((k) => vecs.every((v) => Number.isFinite(v[k])));
const dropped = METRIC_KEYS.filter((k) => !keys.includes(k));
const mu: Record<string, number> = {};
const sd: Record<string, number> = {};
for (const k of keys) {
  const xs = vecs.map((v) => v[k]);
  const m = xs.reduce((t, x) => t + x, 0) / xs.length;
  mu[k] = m;
  sd[k] = Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)) || 1;
}
const Z = vecs.map((v) => keys.map((k) => (v[k] - mu[k]) / sd[k]));
const dist = (a: number[], b: number[]) => Math.hypot(...a.map((x, i) => x - b[i]));

const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
console.log(`clusters — ${champs.length} champions on map ${MAP_SEED}, ${N} seeds x 2 roles each, all against ONE hand-written bot`);
console.log(`${keys.length} of ${METRIC_KEYS.length} metrics${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`);
console.log(`⛔ no k-means: the question is the pre-registered nearest-neighbour test, chance = 1/${champs.length - 1} = ${(100 / (champs.length - 1)).toFixed(1)}%\n`);

let mates = 0;
const nn: number[] = [];
champs.forEach((c, i) => {
  let best = -1;
  let bd = Infinity;
  champs.forEach((_, j) => { if (i !== j) { const d = dist(Z[i], Z[j]); if (d < bd) { bd = d; best = j; } } });
  nn.push(best);
  const isMate = champs[best].run === c.run;
  if (isMate) mates++;
  console.log(`${padr(c.name, 26)} nearest: ${padr(champs[best].name, 26)} d=${bd.toFixed(2)}  ${isMate ? '← RUN-MATE' : ''}`);
});
console.log(`\nrun-mate is the nearest neighbour for ${mates}/${champs.length} = ${((100 * mates) / champs.length).toFixed(0)}%`
  + ` (chance ${(100 / (champs.length - 1)).toFixed(1)}%)`);
console.log(`⚠ nearest-neighbour indices, for the cross-map agreement check: ${nn.join(',')}`);
