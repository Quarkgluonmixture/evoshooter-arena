import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { Mlp, fastTanh, genomeLength, randomGenome } from '../src/brain/mlp.ts';
import { crossover, mutate, tournament } from '../src/evo/genetic.ts';

const shape = { inputs: 5, hidden: [4, 3], outputs: 2 };

describe('Mlp', () => {
  it('sizes the genome as Σ(out×in + out)', () => {
    expect(genomeLength(shape)).toBe(5 * 4 + 4 + 4 * 3 + 3 + 3 * 2 + 2);
  });
  it('rejects a wrong-length genome and is deterministic', () => {
    expect(() => new Mlp(shape, new Float32Array(3))).toThrow();
    const g = randomGenome(shape, new Rng(1));
    const m = new Mlp(shape, g);
    const inp = new Float32Array([0.1, -0.2, 0.3, 0.4, -0.5]);
    const o1 = new Float32Array(2);
    const o2 = new Float32Array(2);
    m.forward(inp, 0, o1, 0);
    m.forward(inp, 0, o2, 0);
    expect(Array.from(o1)).toEqual(Array.from(o2));
    expect(o1.every(Number.isFinite)).toBe(true);
  });
  it('computes a known 1-layer case by hand', () => {
    const s = { inputs: 2, hidden: [], outputs: 1 };
    const m = new Mlp(s, new Float32Array([2, -1, 0.5])); // w=[2,-1], b=0.5
    const out = new Float32Array(1);
    m.forward(new Float32Array([1, 3]), 0, out, 0);
    expect(out[0]).toBeCloseTo(2 * 1 - 1 * 3 + 0.5);
  });
  it('fastTanh tracks Math.tanh within 0.03 and saturates', () => {
    for (let x = -6; x <= 6; x += 0.05) expect(Math.abs(fastTanh(x) - Math.tanh(x))).toBeLessThan(0.03);
    expect(fastTanh(50)).toBe(1);
    expect(fastTanh(-50)).toBe(-1);
  });
});

describe('genetic operators', () => {
  it('mutate touches roughly mutRate of the weights and never the original', () => {
    const g = new Float32Array(10000);
    const m = mutate(g, new Rng(2), { mutRate: 0.05, mutSigma: 0.1, resetProb: 0 });
    let changed = 0;
    for (let i = 0; i < g.length; i++) if (m[i] !== 0) changed++;
    expect(changed / g.length).toBeGreaterThan(0.035);
    expect(changed / g.length).toBeLessThan(0.065);
    expect(g.every((v) => v === 0)).toBe(true);
  });
  it('crossover copies whole neuron rows from one parent', () => {
    const n = genomeLength(shape);
    const a = new Float32Array(n).fill(1);
    const b = new Float32Array(n).fill(2);
    const c = crossover(a, b, shape, new Rng(3));
    expect(c.every((v) => v === 1 || v === 2)).toBe(true);
    expect(c.some((v) => v === 1)).toBe(true);
    expect(c.some((v) => v === 2)).toBe(true);
    // first layer: rows of 5 weights each must be uniform
    for (let o = 0; o < 4; o++) {
      const row = Array.from(c.subarray(o * 5, o * 5 + 5));
      expect(new Set(row).size).toBe(1);
      expect(c[20 + o]).toBe(row[0]); // bias follows its row
    }
  });
  it('tournament prefers fitter individuals', () => {
    const fit = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rng = new Rng(4);
    let sum = 0;
    for (let i = 0; i < 2000; i++) sum += fit[tournament(fit, 3, rng)];
    expect(sum / 2000).toBeGreaterThan(6);
  });
});
