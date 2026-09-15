import { Trainer, type TrainerSnapshot } from '../evo/trainer.ts';
import type { StoreJSON } from './store.ts';
import type { Session } from './session.ts';
import { $, pickedJson } from './dom.ts';

interface RunFile { version: number; trainer: TrainerSnapshot; history: StoreJSON }

/**
 * The "Run" tab: the rules this page's world runs under, and export / import of a whole run (populations, hall
 * of fame, history). An imported run brings its own world; if it differs, the session rebuilds the viewer around
 * it instead of playing its champions under the wrong rules (GOTCHAS #33).
 */
export function createRunPanel(session: Session): void {
  const rules = $('world-rules');
  const syncRules = () => { rules.textContent = session.describeWorld(); };
  syncRules();
  session.onReset(syncRules);

  $('export').onclick = () => {
    const payload: RunFile = { version: 1, trainer: session.trainer.snapshot(), history: session.store.toJSON() };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `evoshooter-run-gen${session.trainer.gen}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  ($('import') as HTMLInputElement).onchange = async (e) => {
    try {
      const picked = await pickedJson<RunFile>(e);
      if (!picked) return;
      const t = Trainer.restore(picked.data.trainer);
      const worldChanged = session.reset(t);
      session.store.loadJSON(picked.data.history, t.hof, t.sim.heatCells);
      session.status(session.fmtStatus(session.store.latest()) + `\nimported ${picked.name}`
        + (worldChanged ? ` · adopted its world: ${session.describeWorld()}` : ''));
      session.playSelection();
    } catch (err) {
      alert(`import failed: ${(err as Error).message}`);
    }
  };
}
