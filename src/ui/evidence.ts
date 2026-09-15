import type { CrossplayFile } from '../core/crossplayFile.ts';
import type { AnalysisFile } from '../core/analysisFile.ts';
import { renderCrossplay } from './crossplayView.ts';
import { renderAnalysis } from './analysisView.ts';
import { $, pickedJson } from './dom.ts';

/**
 * The "Evidence" tab: artifacts the CLI measured, drawn here and nowhere recomputed. The tab is laid out as the
 * claim ladder of VISION §12.1 (detection → interpretation → intervention) so a reader always sees which rung a
 * picture sits on; today every file this page can load sits on the first rung, and the page says so.
 */
export function createEvidencePanel(): void {
  ($('xp-import') as HTMLInputElement).onchange = async (e) => {
    try {
      const picked = await pickedJson<CrossplayFile>(e);
      if (!picked) return;
      if (!picked.data.entrants || !picked.data.maps?.length) throw new Error('not a cross-play export — run crossplay.ts with --out');
      const view = $('xp-view');
      view.classList.remove('hint');
      renderCrossplay(view, picked.data);
    } catch (err) {
      alert(`cross-play load failed: ${(err as Error).message}`);
    }
  };
  ($('an-import') as HTMLInputElement).onchange = async (e) => {
    try {
      const picked = await pickedJson<AnalysisFile>(e);
      if (!picked) return;
      if (picked.data.kind !== 'style' && picked.data.kind !== 'lineage') {
        throw new Error('not a G3 analysis export — run style.ts or lineage.ts with --out');
      }
      const view = $('an-view');
      view.classList.remove('hint');
      renderAnalysis(view, picked.data);
    } catch (err) {
      alert(`analysis load failed: ${(err as Error).message}`);
    }
  };
}
