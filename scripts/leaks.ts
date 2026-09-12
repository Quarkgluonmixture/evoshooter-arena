/**
 * Print the A1 information-leak matrix: node scripts/leaks.ts
 * Registered expectations live in src/probe/leak.ts; tests/leak.test.ts asserts measured == registered.
 */
import { DEFAULT_SIM } from '../src/core/config.ts';
import { runLeakMatrix, sortedProbes, type LeakProbe, type ProbeResult } from '../src/probe/leak.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';

// `--rec N` / `--mem S` run the matrix under a variant brain config, so a phase can see what its own world
// would report before its defaults ship. The registry in src/probe/leak.ts is written against DEFAULT_SIM,
// so a variant run is a diagnostic, not a gate: it exits 0 on disagreement and says so.
const flag = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const cfg = { ...DEFAULT_SIM, recurrentDim: flag('rec', DEFAULT_SIM.recurrentDim), memorySeconds: flag('mem', DEFAULT_SIM.memorySeconds) };
const VARIANT = cfg.recurrentDim !== DEFAULT_SIM.recurrentDim || cfg.memorySeconds !== DEFAULT_SIM.memorySeconds;
if (VARIANT) console.log(`VARIANT CONFIG: recurrentDim=${cfg.recurrentDim} memorySeconds=${cfg.memorySeconds} — diagnostic only, the registry describes the defaults\n`);
const schema = obsSchema(cfg);
const by = (l: string) => schema.filter((f) => f.legality === l).length;
console.log(`observation: ${schema.length} fields — ${by('legal')} legal, ${by('truth-form')} truth-form, ${by('hidden')} hidden`);
const gaps = new Map<string, number>();
for (const f of schema) if (f.gap) gaps.set(f.gap, (gaps.get(f.gap) ?? 0) + 1);
console.log('fields per gap: ' + [...gaps].sort().map(([g, n]) => `${g}=${n}`).join(' '));
console.log();

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
let mismatches = 0;
let broken = 0;
// Under a variant config some probes cannot set their scenario up at all (A1-P14 needs a remembered contact
// that memorySeconds=0 deletes). That is information, not a crash — report it and keep going.
const rows: Array<{ probe: LeakProbe; result: ProbeResult | null; error?: string }> = VARIANT
  ? sortedProbes().map((probe) => {
      try {
        return { probe, result: probe.run(cfg) };
      } catch (e) {
        return { probe, result: null, error: e instanceof Error ? e.message : String(e) };
      }
    })
  : runLeakMatrix(cfg).map((r) => ({ probe: r.probe, result: r.result }));

for (const { probe, result, error } of rows) {
  if (!result) {
    broken++;
    console.log(`${pad(probe.id, 7)} ${pad('n/a', 5)} ${pad(probe.gap ?? '-', 4)} ${pad(probe.test ?? '-', 3)} ! ${probe.title}`);
    console.log(`        scenario cannot be built under this config: ${error}`);
    continue;
  }
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
if (broken) console.log(`${broken} probe(s) could not build their scenario under this config`);
console.log(mismatches === 0 ? 'matrix matches the registry' : `${mismatches} probe(s) disagree with the registry`);
// This runs as a CI gate, so it has to FAIL when the world stops matching the registry.
// A gate that prints a complaint and exits 0 is a gate that is always open.
if (mismatches > 0 && !VARIANT) process.exitCode = 1;
if (mismatches > 0 && VARIANT) console.log('(variant run — not failing the build; re-register expectations when these defaults ship)');
