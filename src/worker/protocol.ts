import type { SimConfig } from '../core/config.ts';
import type { MatchJob } from '../evo/trainer.ts';
import type { MatchResult } from '../evo/match.ts';

export interface EvalRequest {
  type: 'eval';
  id: number;
  genomes: Float32Array[];
  jobs: MatchJob[];
  wantHeat: boolean;
  sim: SimConfig;
  hidden: number[];
  mapSeed: number;
}

export interface EvalResponse {
  type: 'result';
  id: number;
  results: MatchResult[];
  ms: number;
}
