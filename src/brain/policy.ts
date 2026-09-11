import type { SimConfig } from '../core/config.ts';
import { Mlp, type MlpShape } from './mlp.ts';
import { ACT_DIM, obsDim, type World } from '../sim/world.ts';

/** A policy writes raw action outputs for one agent from the world's observation buffer. */
export interface Policy {
  act(world: World, agent: number): void;
}

export function shapeFor(cfg: SimConfig, hidden: number[]): MlpShape {
  return { inputs: obsDim(cfg), hidden, outputs: ACT_DIM };
}

/** All agents of a team share one network; roles can still specialise via the slot one-hot input. */
export class NeuralPolicy implements Policy {
  readonly mlp: Mlp;
  constructor(shape: MlpShape, genome: Float32Array) {
    this.mlp = new Mlp(shape, genome);
  }
  act(world: World, agent: number): void {
    this.mlp.forward(world.obs, agent * world.obsDim, world.act, agent * ACT_DIM);
  }
}
