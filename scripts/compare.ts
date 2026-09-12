/**
 * Compare N headless runs: node scripts/compare.ts runs/a.json runs/b.json [runs/c.json ...] [--last 5]
 *
 * Prints, per behaviour metric, the mean over the last N generations — averaged over BOTH sides. Side-by-side
 * cells are the wrong unit for anything zero-sum (my kills are your deaths), so a per-side column pair can
 * almost never move together and a prediction written against one of them is close to unfalsifiable
 * (GOTCHAS #14). The both-sides mean is half the joint total, which is the readable version of the same thing.
 *
 * ⛔ Fitness is NOT compared across runs: it is a within-run currency, and its ranking inverts across runs
 * (GOTCHAS #21). For "which of these is stronger", use `npm run crossplay`, or `npm run yardstick` when the
 * runs no longer share a rule set.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { METRIC_KEYS, type TeamMetrics } from '../src/evo/match.ts';

const files = process.argv.slice(2).filter((s) => !s.startsWith('--'));
const lastArg = process.argv.indexOf('--last');
const LAST = lastArg > 0 ? Number(process.argv[lastArg + 1]) : 5;
if (files.length < 2) throw new Error('usage: node scripts/compare.ts <a.json> <b.json> [more.json ...] [--last N]');

interface Gen {
  gen: number;
  ladder0: [number | null, number | null];
  ladder0Sight?: [number | null, number | null];
  red: { best: number; mean: number; metrics: TeamMetrics };
  blue: { best: number; mean: number; metrics: TeamMetrics };
}
const runs = files.map((p) => ({ tag: basename(p).replace(/\.json$/, ''), data: JSON.parse(readFileSync(p, 'utf8')) as { gens: Gen[] } }));

/** Mean of a metric over the last LAST generations and over both sides. */
function joint(run: { gens: Gen[] }, k: keyof TeamMetrics): number {
  const gens = run.gens.slice(-LAST);
  let s = 0;
  for (const g of gens) s += (g.red.metrics[k] + g.blue.metrics[k]) / 2;
  return s / gens.length;
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const W = Math.max(10, ...runs.map((r) => r.tag.length + 1));

console.log(`mean of the last ${LAST} generations, averaged over both sides`);
console.log(`${padr('metric', 14)}${runs.map((r) => pad(r.tag, W)).join('')}`);
for (const k of METRIC_KEYS) {
  // a run exported before a metric existed has undefined there; print n/a rather than a number-shaped NaN
  console.log(`${padr(k, 14)}${runs.map((r) => { const v = joint(r.data, k); return pad(Number.isFinite(v) ? v.toFixed(3) : 'n/a', W); }).join('')}`);
}
console.log();
// `·` = the two champions never saw each other, so that win share measures nothing (GOTCHAS #20).
// Runs exported before the denominator existed have no ladder0Sight and simply print unmarked.
console.log(`${padr('ladder vs gen-0', 14)}${runs.map((r) => {
  const g = r.data.gens[r.data.gens.length - 1];
  return pad(g.ladder0.map((x, t) => (x === null ? '-' : `${(x * 100).toFixed(0)}%${g.ladder0Sight?.[t] === 0 ? '·' : ''}`)).join('/'), W);
}).join('')}`);
console.log('(R/B; `·` = those two champions never saw each other, so the number measures nothing)');
