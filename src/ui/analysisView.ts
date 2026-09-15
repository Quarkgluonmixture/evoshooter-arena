/**
 * Draws the G3 analysis exports that `scripts/style.ts --out` and `scripts/lineage.ts --out` produced.
 *
 * ⛔ Computes NOTHING: every coordinate, step, noise floor, takeover and verdict is read out of the file exactly
 * as the CLI wrote it (`src/core/analysisFile.ts`), for the same reason the cross-play view does it — a second
 * implementation drifts, and the drifted one is the one people look at.
 * ⭐ It also prints the file's own `caveats` ABOVE the numbers rather than below them. Every G3 number earned its
 * warning the hard way (the style trajectory is map-specific; "lineage" is inferred because the trainer records
 * no parentage; a `det` row's ratio is inflated), and a warning nobody reads is not a warning.
 */
import type { AnalysisFile, LineageFile, StyleFile } from '../core/analysisFile.ts';

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
const f2 = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : '—');

function caveats(list: string[]): string {
  return `<ul class="an-caveats">${list.map((c) => `<li>⚠ ${esc(c)}</li>`).join('')}</ul>`;
}

/** A bar whose width is a share of the row's maximum — ⛔ no scaling decision that changes a number's meaning. */
function bar(v: number, max: number, cls: string): string {
  const w = max > 0 && Number.isFinite(v) ? Math.max(1, Math.round((100 * v) / max)) : 0;
  return `<span class="an-bar ${cls}" style="width:${w}%"></span>`;
}

function renderStyle(data: StyleFile): string {
  const maxStep = Math.max(...data.points.map((p) => (Number.isFinite(p.step) ? p.step : 0)), 0);
  // ⚠ the flag lives INSIDE the ratio cell, not in a column of its own: as a separate column it pushed the table
  // past the panel and the browser clipped exactly the label that must never be lost — "det — ratio inflated".
  const rows = data.points.map((p) => {
    const ratio = Number.isFinite(p.ratio) ? `${f2(p.ratio)}x` : '—';
    const flag = p.det ? '<span class="an-det" title="own noise &lt; 0.3: this champion rolls no dice on this map, so the ratio is inflated — do not read it">det</span>'
      : (Number.isFinite(p.ratio) && p.ratio >= 2 ? '<b>moved</b>' : '');
    return `<tr${p.det ? ' class="an-row-det"' : ''}><td>${p.gen}</td><td>${f2(p.pc1)}</td><td>${f2(p.pc2)}</td>`
      + `<td>${f2(p.own)}</td><td>${f2(p.step)}${bar(p.step, maxStep, 'an-b-step')}</td>`
      + `<td>${ratio}${flag ? ` ${flag}` : ''}</td></tr>`;
  }).join('');
  const load = data.loadings.map((l) =>
    `<div class="small">PC${l.pc} loads on: ${l.top.map((t) => `${esc(t.key)} ${t.w >= 0 ? '+' : ''}${f2(t.w)}`).join(' · ')}</div>`).join('');
  return `<h3>style — ${esc(data.source)} ${data.colour} vs ${esc(data.opponent)}, map ${data.mapSeed}`
    + `${data.trainingMap ? '' : ' <span class="an-warn">(NOT the training map)</span>'}</h3>`
    + caveats(data.caveats)
    + `<div class="small">${data.points.length} generations · ${data.n} matches x 2 roles per estimate, two seed blocks`
    + ` · PC1 ${Math.round(100 * data.pcaVar[0])}% of variance, PC2 ${Math.round(100 * data.pcaVar[1])}%`
    + `${data.droppedKeys.length ? ` · dropped features: ${data.droppedKeys.map(esc).join(', ')}` : ''}</div>`
    + load
    + `<table class="an"><thead><tr><th>gen</th><th>PC1</th><th>PC2</th><th>own noise</th><th>step</th>`
    + `<th>vs local floor</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLineage(data: LineageFile): string {
  const tracks = data.tracks.map((t) => {
    const maxD = Math.max(...t.steps.map((s) => s.d), 0);
    // one thin bar per generation: the whole history at a glance, retained steps showing as gaps
    const strip = t.steps.map((s) =>
      `<i class="an-tick${s.d === 0 ? ' an-tick-0' : ''}${s.d >= t.takeoverCut ? ' an-tick-over' : ''}"`
      + ` style="height:${Math.max(2, Math.round((28 * s.d) / (maxD || 1)))}px" title="gen ${s.gen}: ${s.d.toExponential(2)}"></i>`).join('');
    const maxLag = Math.max(...t.lag.map((l) => l.d), 0);
    const lag = t.lag.map((l) =>
      `<tr><td>${l.lag}</td><td>${l.d.toExponential(2)}${bar(l.d, maxLag, 'an-b-lag')}</td></tr>`).join('');
    return `<h4>${t.colour} — ${t.champions} champions</h4>`
      + `<div class="small">retained (no change at all): <b>${t.retained}</b>/${t.steps.length}`
      + ` = ${Math.round((100 * t.retained) / t.steps.length)}% · takeovers at ${t.takeoverCut.toExponential(2)}:`
      + ` <b>${t.takeovers.length}</b>${t.takeovers.length ? ` (gens ${t.takeovers.join(', ')})` : ''}</div>`
      + `<div class="an-strip">${strip}</div>`
      + `<div class="small an-verdict">${esc(t.verdict)}</div>`
      + `<table class="an an-lag"><thead><tr><th>lag</th><th>mean distance</th></tr></thead><tbody>${lag}</tbody></table>`;
  }).join('');
  return `<h3>inferred lineage — ${esc(data.source)}</h3>`
    + caveats(data.caveats)
    + `<div class="small">one mutation event = ${data.oneMutationRms.toExponential(2)} RMS per weight`
    + ` (mutRate ${data.mutRate}, mutSigma ${data.mutSigma}) — the scale a step should be read against</div>`
    + tracks;
}

export function renderAnalysis(root: HTMLElement, data: AnalysisFile): void {
  if (data.kind === 'style') root.innerHTML = renderStyle(data);
  else if (data.kind === 'lineage') root.innerHTML = renderLineage(data);
  else throw new Error('not a G3 analysis export — run style.ts or lineage.ts with --out');
}
