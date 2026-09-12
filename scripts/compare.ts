/**
 * A/B two headless runs: node scripts/compare.ts runs/base.json runs/treat.json [--last 5]
 * Prints the mean of each behaviour metric over the last N generations for both sides of both runs,
 * plus the champion-vs-gen-0 ladder. Use it to reconcile a phase against its pre-registered prediction.
 */
import { readFileSync } from 'node:fs';
import { METRIC_KEYS, type TeamMetrics } from '../src/evo/match.ts';

const [aPath, bPath] = process.argv.slice(2).filter((s) => !s.startsWith('--'));
const lastArg = process.argv.indexOf('--last');
const LAST = lastArg > 0 ? Number(process.argv[lastArg + 1]) : 5;
if (!aPath || !bPath) throw new Error('usage: node scripts/compare.ts <base.json> <treatment.json> [--last N]');

interface Gen { gen: number; ladder0: [number | null, number | null]; ladder0Sight?: [number | null, number | null]; red: { best: number; mean: number; metrics: TeamMetrics }; blue: { best: number; mean: number; metrics: TeamMetrics } }
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as { gens: Gen[] };

function tail(run: { gens: Gen[] }, side: 'red' | 'blue'): TeamMetrics {
  const gens = run.gens.slice(-LAST);
  const out = {} as Record<string, number>;
  for (const k of METRIC_KEYS) out[k] = gens.reduce((s, g) => s + g[side].metrics[k], 0) / gens.length;
  return out as unknown as TeamMetrics;
}
const fitness = (run: { gens: Gen[] }, side: 'red' | 'blue') =>
  run.gens.slice(-LAST).reduce((s, g) => s + g[side].best, 0) / LAST;

const A = load(aPath);
const B = load(bPath);
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const num = (x: number) => pad(x.toFixed(3), 8);

console.log(`base = ${aPath}   treatment = ${bPath}   (mean of the last ${LAST} generations)`);
console.log(`${pad('metric', 14)} | ${pad('base R', 8)} ${pad('treat R', 8)} | ${pad('base B', 8)} ${pad('treat B', 8)}`);
for (const k of METRIC_KEYS) {
  const ar = tail(A, 'red')[k];
  const br = tail(B, 'red')[k];
  const ab = tail(A, 'blue')[k];
  const bb = tail(B, 'blue')[k];
  console.log(`${pad(k, 14)} | ${num(ar)} ${num(br)} | ${num(ab)} ${num(bb)}`);
}
console.log(`${pad('bestFitness', 14)} | ${num(fitness(A, 'red'))} ${num(fitness(B, 'red'))} | ${num(fitness(A, 'blue'))} ${num(fitness(B, 'blue'))}`);
// `·` = the two champions never saw each other, so that win share measures nothing (GOTCHAS #20).
// Runs exported before the denominator existed have no ladder0Sight and simply print unmarked.
const ladder = (run: { gens: Gen[] }) => {
  const g = run.gens.slice(-1)[0];
  return g.ladder0.map((x, t) => (x === null ? '-' : `${(x * 100).toFixed(0)}%${g.ladder0Sight?.[t] === 0 ? '·' : ''}`)).join(' / ');
};
console.log(`final-gen ladder vs gen-0 (R / B): base ${ladder(A)}   treatment ${ladder(B)}`);
