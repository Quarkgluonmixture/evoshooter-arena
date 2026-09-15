/**
 * ROADMAP G3 chunk 2b — INFERRED LINEAGE: when was the champion line replaced, and when did it merely drift?
 *
 *   node scripts/lineage.ts runs/d2-long-s1.json [--colour R|B|both] [--takeover 3]
 *
 * ⛔ The trainer records NO parentage — a hall-of-fame entry is `{gen, fitness, genome}` — so there are no real
 * parent→child edges in any saved run, and adding them would mean re-running training. Everything here is
 * INFERRED FROM THE GENOMES and must be described that way. Pre-registration: runs/g3-lineage-predictions.txt.
 *
 * ⭐ What the inference can still separate, and a fitness curve cannot:
 *   RETAINED  distance exactly 0 — elitism carried the same individual forward;
 *   drift     a small change — a child of the same line;
 *   TAKEOVER  a large change — a different individual took the hall of fame.
 * No simulation runs here at all: it is genome arithmetic, so it is deterministic and instant.
 *
 * ⚠ The takeover threshold is a multiple of the run's OWN median non-zero step, ⛔ not an absolute number: a
 * genome scale differs per network shape, and a fixed cut would mean something different in every run.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { EvoConfig, SimConfig } from '../src/core/config.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const TAKEOVER = num('takeover', 3);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

const path = files[0];
if (!path) throw new Error('usage: node scripts/lineage.ts runs/<run>.json [--colour R|B|both]');
const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
if (data.scaffold) throw new Error(`${path} is a scaffold run`);
const tag = basename(path).replace(/\.json$/, '');

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const median = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[(xs.length - 1) >> 1] : NaN);

const colours: (0 | 1)[] = (flags.get('colour') ?? 'both') === 'both' ? [0, 1]
  : [(flags.get('colour') ?? 'R').toUpperCase() === 'B' ? 1 : 0];

for (const t of colours) {
  const hof = data.hof[t];
  const label = t === 0 ? 'R' : 'B';
  const steps: { gen: number; d: number; moved: number }[] = [];
  for (let i = 0; i + 1 < hof.length; i++) {
    const a = hof[i].genome;
    const b = hof[i + 1].genome;
    if (a.length !== b.length) throw new Error(`${tag} ${label}: genome length changed at gen ${hof[i].gen} — ⛔ not comparable (GOTCHAS #27)`);
    let sq = 0;
    let moved = 0;
    for (let k = 0; k < a.length; k++) {
      const dv = b[k] - a[k];
      if (dv !== 0) moved++;
      sq += dv * dv;
    }
    steps.push({ gen: hof[i].gen, d: Math.sqrt(sq / a.length), moved: moved / a.length });
  }
  const nonZero = steps.filter((s) => s.d > 0).map((s) => s.d);
  const med = median(nonZero);
  const retained = steps.filter((s) => s.d === 0).length;
  const takeovers = steps.filter((s) => s.d >= TAKEOVER * med);

  console.log(`\n${tag} ${label} — inferred lineage over ${hof.length} hall-of-fame champions (${steps.length} steps)`);
  console.log(`⛔ inferred from genomes: the trainer records no parentage, so these are not real parent-child edges`);
  console.log(`RETAINED (distance exactly 0): ${retained}/${steps.length} = ${((100 * retained) / steps.length).toFixed(0)}%`
    + `  — elitism carried the same individual forward`);
  console.log(`median non-zero step: ${med.toExponential(2)} RMS per weight · takeover cut = ${TAKEOVER}x that = ${(TAKEOVER * med).toExponential(2)}`);
  console.log(`TAKEOVERS: ${takeovers.length} of ${steps.length} steps (${((100 * takeovers.length) / steps.length).toFixed(0)}%)`);
  if (takeovers.length && takeovers.length <= 40) {
    console.log(`  at generations: ${takeovers.map((s) => `${s.gen}->${s.gen + 1}`).join(', ')}`);
  }
  // the shape of the distribution, so "heavy-tailed" is shown rather than asserted
  const q = (p: number) => (nonZero.length ? nonZero.slice().sort((a, b) => a - b)[Math.floor(p * (nonZero.length - 1))] : NaN);
  console.log(`  non-zero step distribution: p25 ${q(0.25).toExponential(2)} · p50 ${q(0.5).toExponential(2)}`
    + ` · p75 ${q(0.75).toExponential(2)} · p95 ${q(0.95).toExponential(2)} · max ${q(1).toExponential(2)}`);
  const movedAtTakeover = takeovers.length ? takeovers.reduce((s, x) => s + x.moved, 0) / takeovers.length : NaN;
  const movedElse = steps.filter((s) => s.d > 0 && s.d < TAKEOVER * med);
  console.log(`  share of weights that moved: takeovers ${(100 * movedAtTakeover).toFixed(0)}%`
    + ` vs ordinary non-zero steps ${(100 * (movedElse.reduce((s, x) => s + x.moved, 0) / Math.max(1, movedElse.length))).toFixed(0)}%`);

  /**
   * ⭐ DIAGNOSTIC added after P1/P2 failed (labelled as such in the write-up): distance as a function of LAG.
   * Zero takeovers can mean two very different things and the frozen design cannot tell them apart:
   *   a) one line drifting continuously — then d(lag) keeps GROWING with the lag (a random walk grows ~sqrt(k));
   *   b) a CONVERGED population — every individual is a near-copy of every other, champions are draws from one
   *      cloud, and d(lag) is FLAT from lag 1, in which case "lineage" is not visible in these genomes at all.
   * ⚠ mutRate 0.02 x mutSigma 0.05 gives an RMS of 0.0071 for ONE mutation event, and the observed median step
   * is ~9x that — so consecutive champions are NOT parent and child, and (b) is a live possibility.
   */
  const lagCurve = [1, 2, 4, 8, 16, 32, 64, 128].map((lag) => {
    const ds: number[] = [];
    for (let i = 0; i + lag < hof.length; i += Math.max(1, Math.floor(lag / 2))) {
      const a = hof[i].genome;
      const b = hof[i + lag].genome;
      let sq = 0;
      for (let k = 0; k < a.length; k++) sq += (b[k] - a[k]) ** 2;
      ds.push(Math.sqrt(sq / a.length));
    }
    return { lag, d: ds.reduce((t, x) => t + x, 0) / Math.max(1, ds.length) };
  });
  console.log(`  ⭐ distance vs LAG (⚠ diagnostic, added after the frozen predictions failed):`);
  console.log(`     ${lagCurve.map((x) => `${x.lag}:${x.d.toExponential(2)}`).join('  ')}`);
  const ratio = lagCurve[lagCurve.length - 1].d / lagCurve[0].d;
  console.log(`     lag-128 / lag-1 = ${ratio.toFixed(2)}x ⇒ ${ratio > 1.5 ? 'the line DRIFTS (distance keeps growing)' : 'FLAT — champions look like draws from one converged cloud, ⛔ no lineage visible in the genomes'}`);

  // the two cross-references named in the pre-registration, descriptive only
  const near = (g: number) => takeovers.some((s) => Math.abs(s.gen - g) <= 1);
  console.log(`  ⭐ cross-reference (⛔ descriptive, no era language): gen 72, where the lurk role locked for 227`);
  console.log(`     generations, ${near(72) ? 'IS' : 'is NOT'} at or within one generation of a takeover.`);
  console.log(`\n${padr('gen', 7)}${pad('RMS step', 12)}${pad('weights moved', 15)}  ${''}`);
  for (const s of steps.filter((x, i) => i % Math.ceil(steps.length / 20) === 0 || x.d >= TAKEOVER * med).slice(0, 40)) {
    console.log(`${padr(String(s.gen), 7)}${pad(s.d === 0 ? '0 (retained)' : s.d.toExponential(2), 12)}`
      + `${pad(`${(100 * s.moved).toFixed(0)}%`, 15)}  ${s.d >= TAKEOVER * med ? 'TAKEOVER' : ''}`);
  }
}
console.log('\n⚠ "takeover" means the champion genome changed a lot between two generations — it does NOT identify');
console.log('   an individual, a parent or a cause. ⛔ No era language: G3 dropped that narrative on 2026-09-15.');
