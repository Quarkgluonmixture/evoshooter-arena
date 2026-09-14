/**
 * Cross-play win-rate matrix — the side-neutral replacement for the champion-vs-gen-0 scalar.
 *
 *   node scripts/crossplay.ts runs/a.json runs/b.json [--gens last] [--sides both] [--n 6]
 *                             [--maps 7,11] [--margin 0.15] [--seed 9001] [--out runs/xp.json]
 *
 * Every pair plays BOTH sides over the same seeds (SUBSTRATE 10.3), so no result can be a colour artefact,
 * and every cell carries its own denominator: sighting ticks and shots. A cell where the two champions never
 * saw each other is printed as `··` — a non-measurement, NOT a 50% draw (GOTCHAS #18).
 *
 * ⚠ KNOWN LIMIT: the drift guard below compares SimConfig, which catches a rule change that shows up as a
 * number. It does NOT catch a change in what an action MEANS — take away target-slot auto-turn (V4) while
 * every SimConfig field happens to stay put, and this tool will happily run a champion that was trained to
 * rely on auto-aim against one that never had it, and report the difference as strength. A phase that
 * changes action semantics cannot be evaluated by putting its champions in one arena with the old ones;
 * compare within-rule-set quantities instead.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import type { CrossplayFile } from '../src/core/crossplayFile.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { shapeFor } from '../src/brain/policy.ts';
import { evaluateJobs, type MatchJob } from '../src/evo/trainer.ts';

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
  console.error('usage: node scripts/crossplay.ts <run.json> [more.json ...] [--gens last] [--sides both]');
  console.error('       [--n 6] [--maps 7,11] [--margin 0.15] [--seed 9001] [--out runs/xp.json] [--allow-sim-drift]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 6);                       // seeds per side per pair
const BASE_SEED = num('seed', 9001);
const MARGIN = num('margin', 0.15);          // distance from 50% that counts as a decisive edge
const GEN_SPEC = (flags.get('gens') ?? 'last').split(',').map((s) => s.trim()).filter(Boolean);
const SIDE_SPEC = flags.get('sides') ?? 'both';
const ALLOW_DRIFT = flags.has('allow-sim-drift');

/* ---------------------------------------------------------------------- input */

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]] }

interface Entrant {
  name: string;
  source: string;
  side: 'R' | 'B';
  gen: number;
  fitness: number;
  genome: Float32Array;
}

const runs = files.map((f) => {
  const data = JSON.parse(readFileSync(f, 'utf8')) as RunFile;
  const tag = basename(f).replace(/\.json$/, '');
  if (!data.hof || !data.sim) throw new Error(`${f}: not a trainer run export (no hof/sim) — re-run train.ts with --out`);
  const { sim, defaulted } = normalizeSim(data.sim);
  if (defaulted.length) console.log(`note: ${tag} predates ${defaulted.join(', ')} — using today's defaults for those`);
  return { path: f, tag, data: { ...data, sim } };
});
// Fail closed on config drift: champions trained under different rules are not comparable, and the
// resulting matrix would be measuring the rule change, not the lineages (GOTCHAS #12).
const ref = runs[0];
for (const r of runs.slice(1)) {
  const diffs = (Object.keys(ref.data.sim) as (keyof SimConfig)[])
    .filter((k) => JSON.stringify(ref.data.sim[k]) !== JSON.stringify(r.data.sim[k]));
  if (diffs.length) {
    const msg = `${r.tag} was trained under a different SimConfig than ${ref.tag}: ${diffs.join(', ')}`;
    if (!ALLOW_DRIFT) throw new Error(`${msg}\n  ⇒ these champions are not comparable. Re-train, or pass --allow-sim-drift if you really mean it.`);
    console.warn(`WARNING: ${msg} (--allow-sim-drift)`);
  }
  if (r.data.evo.hidden.join(',') !== ref.data.evo.hidden.join(',')) {
    throw new Error(`${r.tag} has hidden layers [${r.data.evo.hidden}] but ${ref.tag} has [${ref.data.evo.hidden}] — different networks cannot share a genome shape`);
  }
}

const sim = ref.data.sim;
const shape = shapeFor(sim, ref.data.evo.hidden);
const expectLen = genomeLength(shape);

function pickGens(hof: RunHofEntry[]): number[] {
  const idx = new Set<number>();
  for (const g of GEN_SPEC) {
    if (g === 'last') idx.add(hof.length - 1);
    else if (g === 'first') idx.add(0);
    else if (g === 'mid') idx.add(Math.floor((hof.length - 1) / 2));
    else {
      const want = Number(g);
      const at = hof.findIndex((e) => e.gen === want);
      if (at < 0) throw new Error(`--gens ${g}: no hall-of-fame entry for generation ${g} (run has 0..${hof[hof.length - 1].gen})`);
      idx.add(at);
    }
  }
  return [...idx].sort((a, b) => a - b);
}

const entrants: Entrant[] = [];
for (const r of runs) {
  for (const [t, side] of [[0, 'R'], [1, 'B']] as const) {
    if (SIDE_SPEC !== 'both' && SIDE_SPEC !== (side === 'R' ? 'red' : 'blue')) continue;
    const hof = r.data.hof[t];
    for (const i of pickGens(hof)) {
      const e = hof[i];
      if (e.genome.length !== expectLen) {
        throw new Error(`${r.tag}:${side}@${e.gen} genome has ${e.genome.length} weights, this build expects ${expectLen} — that run predates the current observation/network shape`);
      }
      entrants.push({ name: `${r.tag}:${side}@${e.gen}`, source: r.tag, side, gen: e.gen, fitness: e.fitness, genome: Float32Array.from(e.genome) });
    }
  }
}
if (entrants.length < 2) throw new Error(`need at least 2 entrants, got ${entrants.length} — widen --gens or pass more runs`);

const K = entrants.length;
const MAPS = (flags.get('maps') ?? String(ref.data.evo.mapSeed)).split(',').map((s) => Number(s.trim()));

/* ------------------------------------------------------------------- matrices */

interface MapResult {
  mapSeed: number;
  /** winRed[i][j]: win share of i playing RED against j playing blue, over N seeds. */
  winRed: number[][];
  /** balanced[i][j]: side-neutral win share of i vs j = (winRed[i][j] + 1 - winRed[j][i]) / 2. */
  balanced: number[][];
  /** sight[i][j]: mean sighting ticks (both teams) per match in that cell. 0 = they never met. */
  sight: number[][];
  /** shots[i][j]: mean shots (both teams) per match in that cell. */
  shots: number[][];
  /** mirror[i]: win share of the RED side when i plays itself — the map's own colour bias. */
  mirror: number[];
  matches: number;
  ms: number;
}

const zeros = () => Array.from({ length: K }, () => new Array(K).fill(0) as number[]);

function runMap(mapSeed: number): MapResult {
  const t0 = Date.now();
  const map = generateMap(mapSeed, sim);
  const genomes = entrants.map((e) => e.genome);
  const jobs: MatchJob[] = [];
  // Every cell plays the SAME N seeds, so cells are paired: a seed that happens to favour attacking
  // play favours it identically everywhere, and differences between cells stay about the genomes.
  const seeds = Array.from({ length: N }, (_, m) => hashSeed(BASE_SEED, mapSeed, m));
  // the diagonal is a mirror match: the same genome on both sides, which reads the map's own colour bias
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      for (const s of seeds) jobs.push({ red: i, blue: j, seed: s, credit: 0, kind: 'ladder' });
    }
  }
  const res = evaluateJobs(sim, shape, map, genomes, jobs, false);

  const winRed = zeros();
  const sight = zeros();
  const shots = zeros();
  let k = 0;
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) {
      let w = 0;
      let sg = 0;
      let sh = 0;
      for (let m = 0; m < N; m++) {
        const r = res[k++];
        w += r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0;
        sg += r.metrics[0].sightTicks + r.metrics[1].sightTicks;
        sh += r.metrics[0].shots + r.metrics[1].shots;
      }
      winRed[i][j] = w / N;
      sight[i][j] = sg / N;
      shots[i][j] = sh / N;
    }
  }
  const balanced = zeros();
  for (let i = 0; i < K; i++) {
    for (let j = 0; j < K; j++) balanced[i][j] = (winRed[i][j] + (1 - winRed[j][i])) / 2;
  }
  const mirror = Array.from({ length: K }, (_, i) => winRed[i][i]);
  return { mapSeed, winRed, balanced, sight, shots, mirror, matches: jobs.length, ms: Date.now() - t0 };
}

/* --------------------------------------------------------------------- report */

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pctOf = (x: number) => `${(x * 100).toFixed(0)}%`;

console.log(`cross-play: ${K} entrants x ${MAPS.length} map(s), ${N} seeds per side per pair`);
console.log(`sim from ${ref.tag}; genome ${expectLen} weights; obs ${shape.inputs}; margin ${MARGIN}`);
// 2N coin flips per cell: anything inside this band of 50% is what a dead-even pair looks like.
console.log(`each cell is ${2 * N} matches ⇒ a true 50/50 pair lands within ±${(100 * 1.645 * Math.sqrt(0.25 / (2 * N))).toFixed(0)}pp nine times in ten`);
console.log();
entrants.forEach((e, i) => console.log(`  ${pad(String(i), 2)}  ${padr(e.name, 24)} train-fitness ${e.fitness.toFixed(3)}`));
console.log();

const results = MAPS.map(runMap);

/** Below this many sighting ticks a cell is a near-non-measurement: the result came from the objective
 *  clock, not from a fight. Calibrated against the matrix itself so it survives changes to match length. */
function lowContactFloor(r: MapResult): number {
  const live: number[] = [];
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) if (i !== j && r.sight[i][j] > 0) live.push(r.sight[i][j]);
  if (live.length === 0) return 0;
  live.sort((a, b) => a - b);
  return 0.25 * live[Math.floor(live.length / 2)];
}

function printMatrix(r: MapResult): void {
  const W = 7;
  const floor = lowContactFloor(r);
  console.log(`map seed ${r.mapSeed} — ${r.matches} matches in ${(r.ms / 1000).toFixed(1)}s`);
  console.log(`  win share of ROW vs COLUMN, side-balanced (row plays both colours; the pair sums to 100%)`);
  console.log(`  ·· = the two never saw each other (non-measurement)   ~ = under ${floor.toFixed(0)} sighting ticks/match, decided by the clock not a fight`);
  console.log('      ' + entrants.map((_, j) => pad(String(j), W)).join('') + '   | mean  mirror');
  for (let i = 0; i < K; i++) {
    const cells = entrants.map((_, j) => {
      if (i === j) return pad('--', W);
      if (r.sight[i][j] === 0) return pad('··', W);          // never saw each other: not a draw, a non-measurement
      return pad(pctOf(r.balanced[i][j]) + (r.sight[i][j] < floor ? '~' : ' '), W);
    });
    const live = entrants.map((_, j) => j).filter((j) => j !== i && r.sight[i][j] > 0);
    const thin = live.filter((j) => r.sight[i][j] < floor).length;
    const mean = live.length ? live.reduce((s, j) => s + r.balanced[i][j], 0) / live.length : NaN;
    const meanStr = live.length ? pad(pctOf(mean), 5) : pad('n/a', 5);
    console.log(`  ${pad(String(i), 2)}  ${cells.join('')}   | ${meanStr} ${pad(pctOf(r.mirror[i]), 6)}${thin ? `  (${thin} thin)` : ''}`);
  }
  console.log();
  console.log('  contact denominator — mean sighting ticks (and shots) per match');
  console.log('      ' + entrants.map((_, j) => pad(String(j), W)).join(''));
  for (let i = 0; i < K; i++) {
    const cells = entrants.map((_, j) => pad(i === j ? '--' : `${r.sight[i][j].toFixed(0)}/${r.shots[i][j].toFixed(0)}`, W));
    console.log(`  ${pad(String(i), 2)}  ${cells.join('')}`);
  }
  const dead: string[] = [];
  for (let i = 0; i < K; i++) for (let j = i + 1; j < K; j++) if (r.sight[i][j] === 0 && r.sight[j][i] === 0) dead.push(`${i}x${j}`);
  if (dead.length) {
    console.log(`  ⚠ ${dead.length} pair(s) never saw each other at all: ${dead.join(' ')}`);
    console.log('    Those cells measure nothing. Do not read their win rate (GOTCHAS #18).');
  }
  const bias = r.mirror.reduce((s, x) => s + x, 0) / K;
  console.log(`  mirror (self-play) red win share: mean ${pctOf(bias)}  — far from 50% means the MAP, not the genome, decides`);
  console.log();
}

/** Cells that are decisive AND have contact — the same predicate the printed edge count uses. */
function decisiveEdges(r: MapResult): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
    if (i !== j && r.sight[i][j] > 0 && r.balanced[i][j] >= 0.5 + MARGIN) out.push([i, j]);
  }
  return out;
}

/** Mean side-balanced win share over the cells that actually had contact — null when this entrant met nobody. */
function rowMean(r: MapResult, i: number): number | null {
  const live = entrants.map((_, j) => j).filter((j) => j !== i && r.sight[i][j] > 0);
  return live.length ? live.reduce((s, j) => s + r.balanced[i][j], 0) / live.length : null;
}

function cycles(r: MapResult): string[] {
  const beats = (i: number, j: number) => r.sight[i][j] > 0 && r.balanced[i][j] >= 0.5 + MARGIN;
  const out: string[] = [];
  for (let a = 0; a < K; a++) {
    for (let b = 0; b < K; b++) {
      for (let c = b + 1; c < K; c++) {
        if (a === b || a === c) continue;
        if (beats(a, b) && beats(b, c) && beats(c, a)) out.push(`${a} > ${b} > ${c} > ${a}`);
      }
    }
  }
  return out;
}

for (const r of results) {
  printMatrix(r);
  const cyc = cycles(r);
  console.log(`  decisive edges (|win - 50%| >= ${(MARGIN * 100).toFixed(0)}pp): ${decisiveEdges(r).length}`);
  console.log(cyc.length ? `  non-transitive cycles: ${cyc.length} — ${cyc.slice(0, 8).join(' | ')}` : '  non-transitive cycles: none at this margin');
  console.log();
}

if (results.length > 1) {
  console.log('across maps — mean side-balanced win share per entrant (contact-bearing cells only)');
  for (let i = 0; i < K; i++) {
    const per = results.map((r) => rowMean(r, i));
    console.log(`  ${padr(entrants[i].name, 24)} ${per.map((x, m) => `map ${MAPS[m]}: ${x === null ? ' n/a' : pad(pctOf(x), 4)}`).join('   ')}`);
  }
  console.log();
}

if (flags.has('out')) {
  const out = {
    createdAt: new Date().toISOString(),
    sources: runs.map((r) => r.path),
    sim,
    hidden: ref.data.evo.hidden,
    n: N,
    baseSeed: BASE_SEED,
    margin: MARGIN,
    entrants: entrants.map((e) => ({ name: e.name, source: e.source, side: e.side, gen: e.gen, fitness: e.fitness })),
    // the page draws these; it must never recompute an edge or a cycle from the cells (src/core/crossplayFile.ts)
    maps: results.map((r) => ({
      mapSeed: r.mapSeed, winRed: r.winRed, balanced: r.balanced, sight: r.sight, shots: r.shots, mirror: r.mirror,
      decisiveEdges: decisiveEdges(r), cycles: cycles(r), rowMean: entrants.map((_, i) => rowMean(r, i)),
    })),
  } satisfies CrossplayFile;
  writeFileSync(flags.get('out')!, JSON.stringify(out));
  console.log(`saved ${flags.get('out')}`);
}
