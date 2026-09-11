/// <reference lib="webworker" />
import { generateMap, type ArenaMap } from '../sim/map.ts';
import { shapeFor } from '../brain/policy.ts';
import { evaluateJobs } from '../evo/trainer.ts';
import type { EvalRequest, EvalResponse } from './protocol.ts';

let cacheKey = '';
let map: ArenaMap | null = null;

self.onmessage = (ev: MessageEvent<EvalRequest>) => {
  const msg = ev.data;
  if (msg.type !== 'eval') return;
  const key = `${msg.mapSeed}|${JSON.stringify(msg.sim)}`;
  if (key !== cacheKey || !map) {
    map = generateMap(msg.mapSeed, msg.sim);
    cacheKey = key;
  }
  const t0 = performance.now();
  const results = evaluateJobs(msg.sim, shapeFor(msg.sim, msg.hidden), map, msg.genomes, msg.jobs, msg.wantHeat);
  const out: EvalResponse = { type: 'result', id: msg.id, results, ms: performance.now() - t0 };
  (self as unknown as Worker).postMessage(out);
};
