/**
 * Draws a cross-play matrix that `scripts/crossplay.ts --out` produced.
 *
 * ⛔ This module computes NOTHING about strength: every win share, decisive edge and non-transitive cycle is read
 * out of the file exactly as the CLI computed it (`src/core/crossplayFile.ts`). A second implementation would
 * drift, and the drifted one is the one people look at.
 * ⭐ Cells with no contact are printed `··` and are not coloured — a win rate with an empty denominator is not a
 * measurement (GOTCHAS #18 / #20).
 */
import type { CrossplayFile } from '../core/crossplayFile.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Blue→neutral→red ramp around 50%, strongest at a whitewash. */
function cellStyle(win: number): string {
  const d = Math.max(-1, Math.min(1, (win - 0.5) * 2));
  const a = (0.1 + 0.5 * Math.abs(d)).toFixed(2);
  return d >= 0 ? `background: rgba(90,170,110,${a})` : `background: rgba(190,90,90,${a})`;
}

export function renderCrossplay(root: HTMLElement, data: CrossplayFile, mapIndex = 0): void {
  const m = data.maps[Math.max(0, Math.min(data.maps.length - 1, mapIndex))];
  const K = data.entrants.length;
  const decisive = new Set(m.decisiveEdges.map(([i, j]) => `${i}x${j}`));
  const short = (name: string) => name.replace(/\.json$/, '');

  const head = data.maps.length > 1
    ? `<div class="xp-maps">${data.maps.map((x, i) =>
      `<button data-map="${i}"${i === mapIndex ? ' class="on"' : ''}>map ${x.mapSeed}</button>`).join('')}</div>`
    : '';

  const rows = data.entrants.map((e, i) => {
    const cells = data.entrants.map((_, j) => {
      if (i === j) return '<td class="xp-diag">—</td>';
      if (m.sight[i][j] === 0) return '<td class="xp-dead" title="these two never saw each other — the cell measures nothing">··</td>';
      const cls = decisive.has(`${i}x${j}`) ? ' class="xp-edge"' : '';
      return `<td${cls} style="${cellStyle(m.balanced[i][j])}" title="${pct(m.balanced[i][j])} over both colours · ${m.sight[i][j].toFixed(0)} sighting ticks/match">${pct(m.balanced[i][j])}</td>`;
    }).join('');
    const mean = m.rowMean[i]; // computed by the CLI over contact-bearing cells only — ⛔ never recomputed here
    // index first: the cycles line below refers to entrants by index, so the eye can follow it without counting rows
    return `<tr><th title="${short(e.name)} — ${short(e.source)} gen ${e.gen}, trained fitness ${e.fitness.toFixed(3)}">`
      + `<span class="xp-i">${i}</span> ${short(e.name)}</th>${cells}`
      + `<td class="xp-mean">${mean === null ? 'n/a' : pct(mean)}</td></tr>`;
  }).join('');

  const mirror = m.mirror.reduce((s, x) => s + x, 0) / Math.max(1, K);
  root.innerHTML = `${head}
    <table class="xp">
      <tr><th></th>${data.entrants.map((_, j) => `<th>${j}</th>`).join('')}<th class="xp-mean">mean</th></tr>
      ${rows}
    </table>
    <div class="xp-foot">
      <div>${data.n} seeds/side · margin ${Math.round(data.margin * 100)}pp · mirror red ${pct(mirror)}${
        Math.abs(mirror - 0.5) > 0.15 ? ' ⚠ the MAP decides, not the genome' : ''}</div>
      <div>decisive edges: ${m.decisiveEdges.length}${m.decisiveEdges.length ? ` of ${K * (K - 1)}` : ''}</div>
      <div>${m.cycles.length
        ? `⭐ non-transitive cycles: ${m.cycles.length} — ${m.cycles.slice(0, 4).join(' | ')}`
        : 'non-transitive cycles: none at this margin'}</div>
      <div class="xp-note">rows are the entrant index used in the cycles above; a cell is the row's win share over both colours.</div>
    </div>`;

  for (const b of root.querySelectorAll<HTMLButtonElement>('.xp-maps button')) {
    b.onclick = () => renderCrossplay(root, data, Number(b.dataset.map));
  }
}
