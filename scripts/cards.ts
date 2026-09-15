/**
 * ROADMAP G3 — PLAYER IDENTITY CARDS, assembled from `scripts/detect.ts --out` facts across several maps.
 *
 *   node scripts/cards.ts runs/facts-s1-map7.json runs/facts-s1-map11.json runs/facts-s1-map23.json
 *
 * ⛔ Computes no behaviour: every number here was produced by the lurk and pair detectors and written to those
 * files. This merges them. ⛔ And it deliberately does NOT re-simulate — detect.ts and lurkswap.ts already carry
 * the per-tick observation loop, and a third copy is the drift this repo keeps paying for.
 *
 * ⚠⚠ WHY EVERY LINE CARRIES A TRAVELS/VARIES MARK: "slot 0 is the lurker" is true on the training map and false
 * on map 23, where that slot's isolation reads 0% (GOTCHAS #40). A card is the most confident-looking surface in
 * the project, so it is the worst possible place to print a fact that holds on one map. A fact is stated plainly
 * only when every map agrees; otherwise the card shows the split and says VARIES.
 * ⛔ No role names — "lurker", "anchor", "entry" — appear here at all: VISION keeps tactic names out of the
 * product surface, and today's evidence says the underlying facts are not even stable.
 */
import { readFileSync } from 'node:fs';

interface FactRow {
  label: string; colour: string; perSlotIsolated: number[]; isolatedShare: number;
  topSlot: number; topSlotShare: number; lurkXnull: number; pair: string; pairStrength: number; pairXnull: number;
}
interface FactFile { kind: 'detect-facts'; createdAt: string; map: number | string; rows: FactRow[] }

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (files.length < 2) throw new Error('usage: node scripts/cards.ts <two or more detect --out fact files, one per map>');
const packs: FactFile[] = files.map((f) => {
  const d = JSON.parse(readFileSync(f, 'utf8')) as FactFile;
  if (d.kind !== 'detect-facts') throw new Error(`${f} is not a detect --out fact file`);
  return d;
});
const maps = packs.map((p) => String(p.map));
if (new Set(maps).size !== maps.length) throw new Error(`the same map appears twice (${maps.join(', ')}) — ⛔ a "travels" mark over one map is meaningless`);

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => (Number.isFinite(x) ? `${Math.round(x)}%` : '—');

const labels = [...new Set(packs.flatMap((p) => p.rows.map((r) => r.label)))];
console.log(`player cards — ${labels.length} champion(s) across ${maps.length} maps (${maps.join(', ')})`);
console.log('⛔ every line is marked TRAVELS only when all maps agree; ⛔ no role names, ⛔ nothing recomputed here\n');

for (const label of labels) {
  const rows = packs.map((p) => p.rows.find((r) => r.label === label)).filter(Boolean) as FactRow[];
  if (rows.length !== packs.length) {
    console.log(`${label}: ⚠ missing from some map files — skipped (⛔ a card over a subset would hide the disagreement)\n`);
    continue;
  }
  const slots = rows[0].perSlotIsolated.length;
  console.log(`=== ${label} ===`);
  console.log(`${padr('', 8)}${maps.map((m) => pad(`map ${m}`, 10)).join('')}   verdict`);
  for (let k = 0; k < slots; k++) {
    const shares = rows.map((r) => r.perSlotIsolated[k]);
    const tops = rows.map((r) => r.topSlot === k);
    const allTop = tops.every(Boolean);
    const noneTop = tops.every((t) => !t);
    // a NEGATIVE that holds everywhere is still something that travels — and it is the one this project expects
    const verdict = allTop ? 'TRAVELS: top isolated slot on every map'
      : noneTop ? 'travels (negative): never the top isolated slot'
        : `VARIES — top slot only on map ${maps.filter((_, i) => tops[i]).join(', ')}`;
    console.log(`${padr(`slot ${k}`, 8)}${shares.map((v) => pad(pct(v), 10)).join('')}   ${verdict}`);
  }
  const pairs = rows.map((r) => r.pair);
  const samePair = new Set(pairs).size === 1;
  console.log(`${padr('pair', 8)}${pairs.map((p, i) => pad(`${p} ${rows[i].pairXnull.toFixed(1)}x`, 10)).join('')}`
    + `   ${samePair ? 'TRAVELS: the same pair on every map' : 'VARIES — a different pair on different maps'}`);
  const everyAbove = rows.every((r) => r.pairXnull >= 1.5);
  console.log(`${padr('', 8)}${''.padEnd(10 * maps.length)}   ${everyAbove
    ? 'travels: SOME mutual pair clears 1.5x its null on every map' : '⚠ no pair clears 1.5x on at least one map'}`);
  console.log();
}
console.log('⚠ a card states a fact plainly only where every map agrees. Where it says VARIES, the fact is about');
console.log('   the map as much as the player — which is why the per-map numbers stay on the card (GOTCHAS #40).');
