import type { SimConfig } from '../core/config.ts';
import { Mlp, type MlpShape } from './mlp.ts';
import { ACT_DIM, obsDim, type World } from '../sim/world.ts';

/** A policy writes raw action outputs for one agent from the world's observation buffer. */
export interface Policy {
  act(world: World, agent: number): void;
}

/**
 * Network input = the observation, plus (when `recurrentDim > 0`) the player's own state from last tick.
 * The recurrent slice is taken from the first hidden layer, so it costs no new hyper-parameter beyond its
 * width, and widening it only changes this layer's fan-in — which is the one thing inheritance fidelity
 * actually tracks (`npm run inherit`, GOTCHAS #22).
 */
export function shapeFor(cfg: SimConfig, hidden: number[]): MlpShape {
  if (cfg.recurrentDim > hidden[0]) {
    throw new Error(`recurrentDim ${cfg.recurrentDim} exceeds the first hidden layer (${hidden[0]}) it is taken from`);
  }
  return { inputs: obsDim(cfg) + cfg.recurrentDim, hidden, outputs: ACT_DIM };
}

/** All agents of a team share one network; roles can still specialise via the slot one-hot input. */
export class NeuralPolicy implements Policy {
  readonly mlp: Mlp;
  /** [observation | previous recurrent state], rebuilt per act(). Unused by a feed-forward brain. */
  private readonly scratch: Float32Array;
  /**
   * Next tick's state is staged here and copied into the world only after the forward pass has finished
   * reading the current one. The state itself lives on the World, never here: this object is cached per
   * genome and replayed across matches, so state kept on it would leak from one match into the next.
   */
  private readonly staged: Float32Array;

  constructor(shape: MlpShape, genome: Float32Array) {
    this.mlp = new Mlp(shape, genome);
    this.scratch = new Float32Array(shape.inputs);
    this.staged = new Float32Array(shape.hidden[0]);
  }

  act(world: World, agent: number): void {
    const rec = world.cfg.recurrentDim;
    if (rec === 0) {
      this.mlp.forward(world.obs, agent * world.obsDim, world.act, agent * ACT_DIM);
      return;
    }
    const od = world.obsDim;
    const state = this.staged.subarray(0, rec);
    this.scratch.set(world.obs.subarray(agent * od, (agent + 1) * od), 0);
    this.scratch.set(world.brain.subarray(agent * rec, (agent + 1) * rec), od);
    this.mlp.forward(this.scratch, 0, world.act, agent * ACT_DIM, undefined, state);
    world.brain.set(state, agent * rec);
  }
}
