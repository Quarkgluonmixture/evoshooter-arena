import type { Rng } from '../core/rng.ts';
import { layerSizes, type MlpShape } from '../brain/mlp.ts';

export interface MutationParams {
  mutRate: number;
  mutSigma: number;
  resetProb: number;
}

/** Std of the fresh value a reset draws. A reset REPLACES a weight rather than nudging it. */
export const RESET_SCALE = 0.5;

/** Copy-and-mutate: per-weight Gaussian noise plus rare full resets (lets evolution escape local optima). */
export function mutate(g: Float32Array, rng: Rng, p: MutationParams): Float32Array {
  const out = new Float32Array(g);
  for (let i = 0; i < out.length; i++) {
    const u = rng.next();
    if (u < p.resetProb) out[i] = rng.gauss() * RESET_SCALE;
    else if (u < p.resetProb + p.mutRate) out[i] += rng.gauss() * p.mutSigma;
  }
  return out;
}

/**
 * Variance that one `mutate` call adds to a single weight, for a layer whose weights have std `s`.
 * A reset replaces the weight, so it contributes `RESET_SCALE² + s²`, not `sigma²` — which is why the
 * reset probability, not sigma, is what sets inheritance fidelity at the current defaults.
 * Divide its square root by `s` to get the layer's relative pre-activation disruption (`scripts/inherit.ts`).
 */
export function mutationVariance(s: number, p: MutationParams): number {
  return p.resetProb * (RESET_SCALE * RESET_SCALE + s * s) + p.mutRate * p.mutSigma * p.mutSigma;
}

/** Neuron-wise crossover: each unit keeps its whole incoming weight vector from one parent. */
export function crossover(a: Float32Array, b: Float32Array, shape: MlpShape, rng: Rng): Float32Array {
  const out = new Float32Array(a.length);
  const s = layerSizes(shape);
  let p = 0;
  for (let l = 1; l < s.length; l++) {
    const nin = s[l - 1];
    const nout = s[l];
    const bias = p + nout * nin;
    for (let o = 0; o < nout; o++) {
      const src = rng.next() < 0.5 ? a : b;
      const row = p + o * nin;
      for (let i = 0; i < nin; i++) out[row + i] = src[row + i];
      out[bias + o] = src[bias + o];
    }
    p = bias + nout;
  }
  return out;
}

/** Tournament selection: returns the index of the fittest of k random picks. */
export function tournament(fitness: number[], k: number, rng: Rng): number {
  let best = rng.int(fitness.length);
  for (let i = 1; i < k; i++) {
    const c = rng.int(fitness.length);
    if (fitness[c] > fitness[best]) best = c;
  }
  return best;
}
