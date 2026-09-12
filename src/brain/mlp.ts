import type { Rng } from '../core/rng.ts';

export interface MlpShape {
  inputs: number;
  hidden: number[];
  outputs: number;
}

export function layerSizes(shape: MlpShape): number[] {
  return [shape.inputs, ...shape.hidden, shape.outputs];
}

export function genomeLength(shape: MlpShape): number {
  const s = layerSizes(shape);
  let n = 0;
  for (let l = 1; l < s.length; l++) n += s[l] * s[l - 1] + s[l];
  return n;
}

/** Gaussian init scaled by fan-in; biases zero. */
export function randomGenome(shape: MlpShape, rng: Rng): Float32Array {
  const s = layerSizes(shape);
  const g = new Float32Array(genomeLength(shape));
  let p = 0;
  for (let l = 1; l < s.length; l++) {
    const nin = s[l - 1];
    const nout = s[l];
    const scale = 1 / Math.sqrt(nin);
    for (let i = 0; i < nout * nin; i++) g[p++] = rng.gauss() * scale;
    p += nout; // biases stay 0
  }
  return g;
}

/** Rational tanh approximation (max abs error ≈ 0.024, saturates at |x|=3). Deterministic and ~5× cheaper than Math.tanh. */
export function fastTanh(x: number): number {
  if (x >= 3) return 1;
  if (x <= -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** Feed-forward network with tanh hidden units and linear outputs. Weights live in one flat Float32Array (the genome). */
export class Mlp {
  readonly shape: MlpShape;
  readonly w: Float32Array;
  private readonly sizes: number[];
  private readonly buf: Float32Array[];

  constructor(shape: MlpShape, weights: Float32Array) {
    if (weights.length !== genomeLength(shape)) {
      throw new Error(`genome length ${weights.length} != expected ${genomeLength(shape)}`);
    }
    this.shape = shape;
    this.w = weights;
    this.sizes = layerSizes(shape);
    this.buf = this.sizes.map((n) => new Float32Array(n));
  }

  /**
   * @param trace optional per-layer buffers (one per hidden/output layer, in order) that receive the
   *        PRE-activation values. Used by the inheritance probe to measure how far a mutation moves a
   *        layer's pre-activations; there is deliberately no second copy of this forward pass to drift.
   * @param hiddenOut optional buffer that receives the first hidden layer's POST-activations (its first
   *        `hiddenOut.length` units) — the recurrent state a D1 brain carries to the next tick.
   */
  forward(input: Float32Array, inOff: number, out: Float32Array, outOff: number, trace?: Float32Array[], hiddenOut?: Float32Array): void {
    const s = this.sizes;
    const w = this.w;
    let cur = this.buf[0];
    for (let i = 0; i < s[0]; i++) cur[i] = input[inOff + i];
    let p = 0;
    const last = s.length - 1;
    for (let l = 1; l <= last; l++) {
      const nin = s[l - 1];
      const nout = s[l];
      const next = this.buf[l];
      const bias = p + nout * nin;
      const n4 = nin - (nin % 4);
      for (let o = 0; o < nout; o++) {
        const row = p + o * nin;
        let a0 = 0;
        let a1 = 0;
        let a2 = 0;
        let a3 = 0;
        let i = 0;
        for (; i < n4; i += 4) {
          a0 += w[row + i] * cur[i];
          a1 += w[row + i + 1] * cur[i + 1];
          a2 += w[row + i + 2] * cur[i + 2];
          a3 += w[row + i + 3] * cur[i + 3];
        }
        let acc = w[bias + o] + a0 + a1 + a2 + a3;
        for (; i < nin; i++) acc += w[row + i] * cur[i];
        if (trace) trace[l - 1][o] = acc;
        next[o] = l === last ? acc : fastTanh(acc);
      }
      p = bias + nout;
      cur = next;
    }
    if (hiddenOut) {
      const h = this.buf[1];
      for (let o = 0; o < hiddenOut.length; o++) hiddenOut[o] = h[o];
    }
    for (let o = 0; o < s[last]; o++) out[outOff + o] = cur[o];
  }
}
