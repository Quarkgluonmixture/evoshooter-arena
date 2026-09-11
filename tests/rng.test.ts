import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/core/rng.ts';

describe('Rng', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const c = new Rng(124);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    const sc = Array.from({ length: 5 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('stays in [0,1) and gauss has ~zero mean', () => {
    const r = new Rng(9);
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const u = r.next();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += r.gauss();
    }
    expect(Math.abs(sum / 5000)).toBeLessThan(0.1);
  });
  it('hashSeed mixes arguments', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
    expect(hashSeed(1, 2)).toBe(hashSeed(1, 2));
  });
});
