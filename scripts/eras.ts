/**
 * ROADMAP G3 chunk 2a — ERAS: does a later generation actually beat its own past, and does that survive a map?
 *
 *   node scripts/eras.ts runs/xp-eras.json
 *
 * ⛔ This recomputes NOTHING. `src/core/crossplayFile.ts` is explicit that the CLI computes the matrix, the
 * decisive edges and the cycles once and everything downstream consumes them; this script reads `balanced`,
 * `sight`, `rowMean` and `cycles` and asks three questions of them:
 *   PROGRESS   Spearman(generation, rowMean) per colour per map;
 *   HEAD-TO-HEAD  of all (later, earlier) same-colour pairs WITH CONTACT, how often the later one wins;
 *   ⭐ CROSS-MAP ORDINAL STABILITY  Kendall tau between maps' rankings.
 *
 * ⭐ Why the third one is the gate and not a footnote: G3 chunk 1 shipped a style trajectory and then had to
 * disqualify it for era claims, because WHICH generations move turned out to be map-specific. Ordinal strength
 * is the quantity the repo's own notes say survives a map change — and this script is where that gets checked
 * rather than assumed. Pre-registration: runs/g3-eras-predictions.txt.
 *
 * ⚠ Cells with no contact are dropped, never read as 50% (GOTCHAS #18), and the drop count is printed: a
 * progress number computed over a handful of cells is not a progress number.
 */
import { readFileSync } from 'node:fs';
import type { CrossplayFile } from '../src/core/crossplayFile.ts';

const path = process.argv[2];
if (!path) throw new Error('usage: node scripts/eras.ts runs/xp-eras.json');
const xp = JSON.parse(readFileSync(path, 'utf8')) as CrossplayFile;
// ⚠ Files written before 2026-09-12 carry only mapSeed/winRed/balanced/sight/shots/mirror. `rowMean` and
// `cycles` came later, and crossplayFile.ts is explicit that nothing downstream may recompute them — so the
// honest response to an old file is to REFUSE it, ⛔ not to quietly fill the gap with a second algorithm.
for (const m of xp.maps) {
  if (!m.rowMean || !m.cycles) {
    throw new Error(`${path} predates rowMean/cycles (written ${xp.createdAt}). Re-run crossplay --out; `
      + '⛔ this script may not recompute them (src/core/crossplayFile.ts).');
  }
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : 'n/a');

/** ranks with ties averaged — Spearman on generations needs it when two entrants share a rowMean */
function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array(xs.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    const mean = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k].i] = mean;
    i = j + 1;
  }
  return r;
}

function spearman(a: number[], b: number[]): number {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((t, x) => t + x, 0) / n;
  const mb = rb.reduce((t, x) => t + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : NaN;
}

/** Kendall tau-b between two score vectors over the same entrants */
function kendall(a: number[], b: number[]): number {
  let con = 0;
  let dis = 0;
  let tieA = 0;
  let tieB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if (!Number.isFinite(a[i]) || !Number.isFinite(a[j]) || !Number.isFinite(b[i]) || !Number.isFinite(b[j])) continue;
      const da = Math.sign(a[i] - a[j]);
      const db = Math.sign(b[i] - b[j]);
      if (da === 0) tieA++;
      if (db === 0) tieB++;
      if (da === 0 || db === 0) continue;
      if (da === db) con++;
      else dis++;
    }
  }
  const n0 = con + dis + tieA + tieB;
  return n0 ? (con - dis) / Math.sqrt((con + dis + tieA) * (con + dis + tieB)) : NaN;
}

console.log(`eras — ${xp.entrants.length} entrants x ${xp.maps.length} map(s), ${xp.n} seeds per side per pair`);
console.log(`sources: ${xp.sources.join(', ')}`);
console.log(`⚠ crossplay's own resolution: ${2 * xp.n} matches per cell ⇒ a true 50/50 pair lands within about`);
console.log(`   ±${(164.5 * 0.5 / Math.sqrt(2 * xp.n)).toFixed(0)}pp nine times in ten. ⛔ Edges smaller than that are not interpreted.\n`);

for (const m of xp.maps) {
  const trainingMap = m.mapSeed === xp.maps[0].mapSeed;
  console.log(`map ${m.mapSeed}${trainingMap ? ' (first listed — the training map if it was given first)' : ''}`);
  for (const side of ['R', 'B'] as const) {
    const idx = xp.entrants.map((e, i) => ({ e, i })).filter((x) => x.e.side === side).sort((a, b) => a.e.gen - b.e.gen);
    if (idx.length < 3) continue;
    const gens = idx.map((x) => x.e.gen);
    const means = idx.map((x) => m.rowMean[x.i] ?? NaN);
    const rho = spearman(gens.filter((_, k) => Number.isFinite(means[k])), means.filter(Number.isFinite));
    // head-to-head: later vs earlier, contact-bearing cells only
    let later = 0;
    let total = 0;
    let dropped = 0;
    let thin = 0;
    for (let a = 0; a < idx.length; a++) {
      for (let b = 0; b < a; b++) {
        const i = idx[a].i;
        const j = idx[b].i;
        if (!m.sight[i][j]) { dropped++; continue; }
        if (m.sight[i][j] < 50) thin++;
        total++;
        if (m.balanced[i][j] > 0.5) later++;
      }
    }
    console.log(`  ${side}: Spearman(gen, rowMean) = ${Number.isFinite(rho) ? rho.toFixed(2) : 'n/a'}`
      + ` · later-beats-earlier ${total ? pct(later / total) : 'n/a'} of ${total} pairs`
      + `${dropped ? ` (⚠ ${dropped} dropped, no contact)` : ''}${thin ? ` (⚠ ${thin} thin, <50 sight ticks)` : ''}`);
    console.log(`     ${idx.map((x) => `${x.e.gen}:${pct(m.rowMean[x.i] ?? NaN)}`).join('  ')}`);
  }
  console.log(`  cycles: ${m.cycles.length ? m.cycles.join(' | ') : 'none at this margin'}`);
  console.log(`  mirror (self-play) red share: ${pct(m.mirror.reduce((t, x) => t + x, 0) / m.mirror.length)}`
    + ' — far from 50% means the MAP decides, which is why every pair plays both sides');
}

if (xp.maps.length > 1) {
  console.log('\n⭐ cross-map ordinal stability (Kendall tau between maps, over the entrants both maps measured)');
  console.log(`${padr('', 10)}${xp.maps.map((m) => pad(String(m.mapSeed), 8)).join('')}`);
  for (const a of xp.maps) {
    const row = xp.maps.map((b) => {
      if (a === b) return pad('—', 8);
      const va = a.rowMean.map((v) => (v === null ? NaN : v));
      const vb = b.rowMean.map((v) => (v === null ? NaN : v));
      return pad(kendall(va, vb).toFixed(2), 8);
    });
    console.log(`${padr(`map ${a.mapSeed}`, 10)}${row.join('')}`);
  }
  // ⚠ POST-HOC (added after the first run, and labelled as such): the pre-registration specified tau over ALL
  // entrants, and that mixes the two colours into one ranking. If one colour's ladder is orderly and the other's
  // is not, the mixed tau hides both facts — so the same tau is also printed per colour. ⛔ It does not replace
  // the frozen gate above; it says which part of the field the gate's verdict is about.
  for (const side of ['R', 'B'] as const) {
    const pick = xp.entrants.map((e, i) => (e.side === side ? i : -1)).filter((i) => i >= 0);
    if (pick.length < 3) continue;
    const row = xp.maps.map((b) => pick.map((i) => (b.rowMean[i] === null ? NaN : (b.rowMean[i] as number))));
    const pairs: string[] = [];
    for (let a = 0; a < xp.maps.length; a++) {
      for (let b = a + 1; b < xp.maps.length; b++) pairs.push(`${xp.maps[a].mapSeed}v${xp.maps[b].mapSeed} ${kendall(row[a], row[b]).toFixed(2)}`);
    }
    console.log(`   ⚠ post-hoc, per colour — ${side}: ${pairs.join('  ')}`);
  }
  console.log('\n⛔ The frozen branch: tau >= 0.6 licenses an era statement that may leave the training map.');
  console.log('   Below that, strength ordering is map-specific and ⛔ no era claim is licensed at all.');
}
