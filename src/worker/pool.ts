import type { SimConfig } from '../core/config.ts';
import type { MatchResult } from '../evo/match.ts';
import type { Evaluator, MatchJob } from '../evo/trainer.ts';
import type { EvalRequest, EvalResponse } from './protocol.ts';

interface Pending { resolve: (r: EvalResponse) => void; reject: (e: unknown) => void }

/** Spreads a generation's matches across N web workers; each worker only receives the genomes its jobs reference. */
export class WorkerEvaluator implements Evaluator {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  busyMs = 0;
  readonly sim: SimConfig;
  readonly hidden: number[];
  readonly mapSeed: number;
  constructor(sim: SimConfig, hidden: number[], mapSeed: number, n: number) {
    this.sim = sim;
    this.hidden = hidden;
    this.mapSeed = mapSeed;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./eval.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<EvalResponse>) => {
        const p = this.pending.get(ev.data.id);
        if (!p) return;
        this.pending.delete(ev.data.id);
        p.resolve(ev.data);
      };
      w.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(e);
        this.pending.clear();
      };
      this.workers.push(w);
    }
  }

  get size(): number {
    return this.workers.length;
  }

  private send(w: Worker, req: EvalRequest): Promise<EvalResponse> {
    return new Promise((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      w.postMessage(req);
    });
  }

  async run(genomes: Float32Array[], jobs: MatchJob[], wantHeat: boolean): Promise<MatchResult[]> {
    const n = Math.max(1, Math.min(this.workers.length, jobs.length));
    const chunks: { jobs: MatchJob[]; idx: number[] }[] = Array.from({ length: n }, () => ({ jobs: [], idx: [] }));
    jobs.forEach((j, k) => {
      const c = chunks[k % n];
      c.jobs.push(j);
      c.idx.push(k);
    });
    const results: MatchResult[] = new Array(jobs.length);
    await Promise.all(
      chunks.map(async (c, ci) => {
        if (c.jobs.length === 0) return;
        // compact genome table for this worker
        const remap = new Map<number, number>();
        const sub: Float32Array[] = [];
        const local = c.jobs.map((j) => {
          const r = (g: number) => {
            let m = remap.get(g);
            if (m === undefined) { m = sub.push(genomes[g]) - 1; remap.set(g, m); }
            return m;
          };
          return { ...j, red: r(j.red), blue: r(j.blue) };
        });
        const res = await this.send(this.workers[ci], {
          type: 'eval', id: this.nextId++, genomes: sub, jobs: local, wantHeat,
          sim: this.sim, hidden: this.hidden, mapSeed: this.mapSeed,
        });
        this.busyMs += res.ms;
        res.results.forEach((r, k) => { results[c.idx[k]] = r; });
      }),
    );
    return results;
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
  }
}
