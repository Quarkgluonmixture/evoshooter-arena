/**
 * Print the A1 information-leak matrix: node scripts/leaks.ts
 * Registered expectations live in src/probe/leak.ts; tests/leak.test.ts asserts measured == registered.
 */
import { DEFAULT_SIM } from '../src/core/config.ts';
import { runLeakMatrix } from '../src/probe/leak.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';

const cfg = DEFAULT_SIM;
const schema = obsSchema(cfg);
const by = (l: string) => schema.filter((f) => f.legality === l).length;
console.log(`observation: ${schema.length} fields — ${by('legal')} legal, ${by('truth-form')} truth-form, ${by('hidden')} hidden`);
const gaps = new Map<string, number>();
for (const f of schema) if (f.gap) gaps.set(f.gap, (gaps.get(f.gap) ?? 0) + 1);
console.log('fields per gap: ' + [...gaps].sort().map(([g, n]) => `${g}=${n}`).join(' '));
console.log();

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
let mismatches = 0;
for (const { probe, result } of runLeakMatrix(cfg)) {
  const ok = result.status === probe.expect;
  if (!ok) mismatches++;
  const tag = result.status === 'leak' ? 'LEAK' : 'clean';
  console.log(
    `${pad(probe.id, 7)} ${pad(tag, 5)} ${pad(probe.gap ?? '-', 4)} ${pad(probe.test ?? '-', 3)} ` +
      `${ok ? ' ' : '!'} ${probe.title}`,
  );
  console.log(`        ${result.detail}`);
  if (result.fields.length) console.log(`        fields: ${result.fields.join(', ')}`);
  if (!ok) console.log(`        !! registered as ${probe.expect}, measured ${result.status}`);
}
console.log();
console.log(mismatches === 0 ? 'matrix matches the registry' : `${mismatches} probe(s) disagree with the registry`);
