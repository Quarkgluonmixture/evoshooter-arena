/**
 * Snapshot-and-resume for long headless training runs.
 *
 * A long run on a shared machine can be killed by the host for memory (three times on 2026-09-13, with the process
 * itself flat at ~150–320 MB), so the trainer is written next to `--out` every `snapEvery` generations and a rerun with
 * the same `--out` picks up from it.
 *
 * ⚠ `Trainer.snapshot()` re-seeds the RNG, so a snapshotted run is deterministic but NOT bit-identical to the same
 * command without snapshots. That is why `snapEvery` 0 (off) is the default for `scripts/train.ts`: turning snapshots on
 * silently changes the trajectory of every run whose command line is already recorded in the LOG. The initial population
 * is unaffected — it is drawn before the first snapshot.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { Trainer, type Evaluator, type GenReport } from '../../src/evo/trainer.ts';

export const snapshotPath = (out: string): string => `${out}.snap.json`;

/** Restore from `out`'s snapshot when snapshots are on and one exists; otherwise build a fresh trainer. */
export function openTrainer(out: string, snapEvery: number, fresh: () => Trainer): { trainer: Trainer; resumedAt: number | null } {
  const snap = snapshotPath(out);
  if (snapEvery > 0 && out && existsSync(snap)) {
    const trainer = Trainer.restore(JSON.parse(readFileSync(snap, 'utf8')));
    return { trainer, resumedAt: trainer.gen };
  }
  return { trainer: fresh(), resumedAt: null };
}

/** Run until `trainer.gen === gens`, snapshotting (with the process RSS, so a future kill can be read) every `snapEvery`. */
export async function runGenerations(
  trainer: Trainer,
  evaluator: Evaluator,
  gens: number,
  out: string,
  snapEvery: number,
  onGen: (r: GenReport) => void,
): Promise<void> {
  while (trainer.gen < gens) {
    const r = await trainer.runGeneration(evaluator);
    onGen(r);
    if (snapEvery > 0 && trainer.gen % snapEvery === 0 && trainer.gen < gens) {
      writeFileSync(snapshotPath(out), JSON.stringify(trainer.snapshot()));
      console.log(`    snapshot at gen ${trainer.gen} · rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
    }
  }
}

export function clearSnapshot(out: string): void {
  const snap = snapshotPath(out);
  if (existsSync(snap)) unlinkSync(snap);
}
