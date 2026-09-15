/**
 * ROADMAP G3 chunk 1 — STYLE SPACE: where does a lineage's behaviour sit, generation by generation?
 *
 *   node scripts/style.ts runs/d2-long-s1.json [--gens 0,10,...] [--n 8] [--colour R|B|both]
 *
 * The features are ⛔ not invented here: `METRIC_KEYS` is the 22-metric behaviour vector the engine already
 * maintains and the rest of the repo already charts. The opponent is FIXED at the opposite colour's final
 * champion, because with a co-evolving opponent "the style moved" and "the opponent moved" are one number
 * (the arm-A lesson from the lurk birth sweep).
 *
 * ⭐ What makes this a measurement and not a picture: every generation is measured TWICE on disjoint seed
 * blocks, so the distance between a generation's own two estimates is what "no change" looks like. A step
 * between generations counts only if it clears that floor. Pre-registration: runs/g3-style-predictions.txt.
 *
 * ⚠⚠ WHAT THAT FLOOR ACTUALLY IS, measured not assumed: the world seed drives ONLY the hit roll
 * (`world.rng` appears at the shot resolution and at tracer cosmetics, nowhere else) — perception jitter is a
 * deterministic hash of (slot key, time bucket, constant), and the map and spawns are fixed. So two seeds give
 * the SAME match for a team that never fires, and this floor is "re-roll the shooting dice", ⛔ not "re-run the
 * world". A champion that does not engage therefore reads own-noise 0.00 and makes its neighbours' steps look
 * enormous; those rows are flagged `det` below and their ratios are ⛔ not to be read as signal.
 *
 * ⛔ Analysis only, behind the T8 firewall: nothing printed here may be fed back into training.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { METRIC_KEYS, meanMetrics, runMatch, type TeamMetrics } from '../src/evo/match.ts';
import { meanSE } from '../src/probe/detect.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 8);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

const path = files[0];
if (!path) throw new Error('usage: node scripts/style.ts runs/<run>.json [--gens a,b,c] [--n 8]');
const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
if (data.scaffold) throw new Error(`${path} is a scaffold run`);
const { sim } = normalizeSim(data.sim);
const shape = shapeFor(sim, data.evo.hidden);
/**
 * `--map <seed>` re-runs the identical sweep on a different generated map. ⚠ Not a noise floor — with fixed
 * spawns and deterministic policies there is little sampling noise to find. It is an EXTERNAL VALIDITY check:
 * is the style movement a property of the lineage, or of the one map these champions trained on? Every other
 * map is out-of-distribution for all of them equally.
 */
const MAP_SEED = num('map', data.evo.mapSeed);
const map = generateMap(MAP_SEED, sim);
const tag = basename(path).replace(/\.json$/, '');

const genomeAt = (t: 0 | 1, g: number): { gen: number; genome: Float32Array } => {
  const h = data.hof[t];
  let best: RunHofEntry | undefined;
  for (const e of h) if (e.gen <= g && (!best || e.gen > best.gen)) best = e;
  const e = best ?? h[0];
  if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome length ${e.genome.length}`);
  return { gen: e.gen, genome: Float32Array.from(e.genome) };
};
const lastGen = data.hof[0][data.hof[0].length - 1].gen;
const GENS = flags.has('gens')
  ? String(flags.get('gens')).split(',').map(Number)
  : [...Array.from({ length: Math.floor(lastGen / 10) }, (_, i) => i * 10), lastGen];

/** One estimate of a generation's style: N matches x both role assignments, against the FIXED final opponent. */
function styleOf(colour: 0 | 1, gen: number, seedBlock: number): TeamMetrics {
  const mine = genomeAt(colour, gen).genome;
  const theirs = genomeAt(colour === 0 ? 1 : 0, lastGen).genome;
  const rows: TeamMetrics[] = [];
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const red = new NeuralPolicy(shape, colour === 0 ? mine : theirs);
      const blue = new NeuralPolicy(shape, colour === 0 ? theirs : mine);
      // disjoint seed blocks: the second estimate must not share a single world with the first
      const r = runMatch(red, blue, map, hashSeed(0x57e1, seedBlock, m), sim, { attackers });
      rows.push(r.metrics[colour]);
    }
  }
  return meanMetrics(rows);
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

const colours: (0 | 1)[] = (flags.get('colour') ?? 'both') === 'both' ? [0, 1]
  : [(flags.get('colour') ?? 'R').toUpperCase() === 'B' ? 1 : 0];

for (const colour of colours) {
  const label = colour === 0 ? 'R' : 'B';
  const A = GENS.map((g) => styleOf(colour, g, 1));
  const B = GENS.map((g) => styleOf(colour, g, 2));

  // drop any feature that is non-finite anywhere — ⛔ never impute, and say which ones went
  const keys = METRIC_KEYS.filter((k) => A.every((m) => Number.isFinite(m[k])) && B.every((m) => Number.isFinite(m[k])));
  const dropped = METRIC_KEYS.filter((k) => !keys.includes(k));

  // z-score on the pooled A+B estimates so both blocks live in the same space
  const mu: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const k of keys) {
    const xs = [...A.map((m) => m[k]), ...B.map((m) => m[k])];
    const s = meanSE(xs);
    mu[k] = s.mean;
    const v = xs.reduce((t, x) => t + (x - s.mean) ** 2, 0) / Math.max(1, xs.length - 1);
    sd[k] = Math.sqrt(v) || 1;
  }
  const z = (m: TeamMetrics) => keys.map((k) => (m[k] - mu[k]) / sd[k]);
  const ZA = A.map(z);
  const ZB = B.map(z);
  const dist = (p: number[], q: number[]) => Math.hypot(...p.map((v, i) => v - q[i]));

  // the floor: a generation against ITSELF, measured on the other seed block. ⭐ Kept PER GENERATION as well as
  // pooled: a step between two generations is only credible if BOTH endpoints are themselves stable, and one
  // unstable champion would otherwise inflate the pooled floor for everybody else.
  const own = ZA.map((p, i) => dist(p, ZB[i]));
  const floor = meanSE(own);
  // the signal: consecutive sampled generations, using the mean of the two blocks
  const mid = ZA.map((p, i) => p.map((v, j) => (v + ZB[i][j]) / 2));
  const steps = mid.slice(1).map((p, i) => dist(p, mid[i]));

  // PCA on the mean trajectory: two components by power iteration on the covariance
  const D = keys.length;
  const cov = Array.from({ length: D }, () => new Array(D).fill(0));
  const centre = keys.map((_, j) => mid.reduce((t, p) => t + p[j], 0) / mid.length);
  for (const p of mid) {
    for (let a = 0; a < D; a++) for (let b = 0; b < D; b++) cov[a][b] += (p[a] - centre[a]) * (p[b] - centre[b]);
  }
  const power = (mat: number[][]): number[] => {
    let v = new Array(D).fill(0).map((_, i) => Math.sin(i + 1));
    for (let it = 0; it < 300; it++) {
      const w = mat.map((row) => row.reduce((t, x, j) => t + x * v[j], 0));
      const n = Math.hypot(...w) || 1;
      v = w.map((x) => x / n);
    }
    return v;
  };
  const pc1 = power(cov);
  const lam1 = pc1.reduce((t, x, i) => t + x * cov[i].reduce((s, c, j) => s + c * pc1[j], 0), 0);
  const cov2 = cov.map((row, i) => row.map((x, j) => x - lam1 * pc1[i] * pc1[j]));
  const pc2 = power(cov2);
  const lam2 = pc2.reduce((t, x, i) => t + x * cov2[i].reduce((s, c, j) => s + c * pc2[j], 0), 0);
  const total = cov.reduce((t, row, i) => t + row[i], 0);
  const proj = (p: number[], v: number[]) => p.map((x, i) => (x - centre[i]) * v[i]).reduce((t, x) => t + x, 0);

  console.log(`\n${tag} ${label} — style space over ${GENS.length} generations, fixed opponent = ${label === 'R' ? 'B' : 'R'}@${lastGen}`);
  console.log(`map ${MAP_SEED}${MAP_SEED === data.evo.mapSeed ? ' (the training map)' : ' ⚠ NOT the training map — out-of-distribution for every champion here'}`);
  console.log(`${N} matches x 2 role assignments per estimate, every generation measured on TWO disjoint seed blocks`);
  console.log(`features: ${keys.length} of ${METRIC_KEYS.length}${dropped.length ? ` (dropped, non-finite somewhere: ${dropped.join(', ')})` : ''}`);
  console.log(`⭐ noise floor (a generation vs ITSELF on the other block): ${floor.mean.toFixed(2)} ± ${floor.se.toFixed(2)} SE in z-units`);
  console.log(`   ⛔ the pooled number is context only — each step below is judged against the LARGER of its two endpoints' own noise`);
  console.log(`PC1 ${((lam1 / total) * 100).toFixed(0)}% of variance · PC2 ${((lam2 / total) * 100).toFixed(0)}%`);
  const load = (v: number[]) => keys.map((k, i) => ({ k, w: v[i] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 4)
    .map((e) => `${e.k} ${e.w >= 0 ? '+' : ''}${e.w.toFixed(2)}`).join('  ');
  console.log(`   PC1 loads on: ${load(pc1)}`);
  console.log(`   PC2 loads on: ${load(pc2)}`);
  // ⚠ a step across 50 generations is not comparable with a step across 2: the gap is printed, and an uneven
  // sweep says so loudly, because the first run of this script was read with 20/2/50-generation gaps side by side
  const gaps = GENS.slice(1).map((g, i) => g - GENS[i]);
  const evenSweep = gaps.every((g) => g === gaps[0]);
  if (!evenSweep) {
    console.log(`\n⚠⚠ UNEVEN SWEEP (gaps ${[...new Set(gaps)].join(', ')} generations) — steps across different gaps`);
    console.log('   are ⛔ NOT comparable, and "movement?" below is only meaningful within one gap size.');
  }
  console.log(`\n${padr('gen', 6)}${pad('gap', 5)}${pad('PC1', 8)}${pad('PC2', 8)}${pad('own noise', 11)}${pad('step from prev', 16)}${pad('vs local floor', 16)}  movement?`);
  GENS.forEach((g, i) => {
    const step = i === 0 ? NaN : steps[i - 1];
    // local floor = the larger of the two endpoints' own re-measurement distances
    const local = i === 0 ? NaN : Math.max(own[i], own[i - 1]);
    const ratio = i === 0 ? NaN : step / local;
    // a near-zero own-noise means the champion never rolls a die — its ratio is inflated, ⛔ not significant
    const det = own[i] < 0.3 || (i > 0 && own[i - 1] < 0.3);
    console.log(`${padr(String(g), 6)}${pad(i === 0 ? '—' : String(GENS[i] - GENS[i - 1]), 5)}${pad(proj(mid[i], pc1).toFixed(2), 8)}${pad(proj(mid[i], pc2).toFixed(2), 8)}`
      + `${pad(own[i].toFixed(2), 11)}${pad(Number.isNaN(step) ? '—' : step.toFixed(2), 16)}${pad(Number.isNaN(ratio) ? '—' : `${ratio.toFixed(1)}x`, 16)}`
      + `  ${det ? '⚠ det ON THIS MAP — ratio inflated, do not read' : (!Number.isNaN(ratio) && ratio >= 2 ? 'YES' : '')}`);
  });
}
console.log('\n⚠ coordinates are relative to THIS sweep (z-scored across it): adding generations moves them.');
console.log('⚠ the noise floor is the HIT-ROLL floor: the world seed drives only the shot dice, so a champion that');
console.log('   never engages reads 0.00 own-noise (flagged `det`) — ⚠ and `det` is a property of the CHAMPION ON');
console.log('   THIS MAP, not of the champion: s1 R gen 160 reads 0.08 here and 1.27 / 1.45 on maps 11 / 23.');
console.log('⛔⛔ WHICH generations move is MAP-SPECIFIC (measured 2026-09-15): agreement between the training map');
console.log('   and two others was 83% and 42%, against chance levels of 62% and 50% — i.e. at or below chance on');
console.log('   one of them. Only the EARLIEST step moves on every map. ⇒ say "on this map" or do not say it.');
console.log('⚠ one fixed opponent = style as seen by that opponent. ⛔ A loading says what moved, not why.');
