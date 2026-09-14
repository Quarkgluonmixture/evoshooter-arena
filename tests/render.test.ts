import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM } from '../src/core/config.ts';
import { commLight } from '../src/render/scene.ts';

/**
 * The radio light is the only place a viewer can SEE what a player said. D2a made the radio a handful of held
 * symbols, so these pin the two things a continuous colour ramp got wrong: the same symbol must always look the
 * same, and silence must read as silence.
 */
const quantised = { ...DEFAULT_SIM, commTokens: 2, commDim: 2 };
const said = (a: number, b: number) => Float32Array.from([a, b]);

describe('commLight (spectator radio light)', () => {
  it('gives one symbol exactly one colour', () => {
    expect(commLight(quantised, said(0.5, 0))).toEqual(commLight(quantised, said(0.5, 0)));
    expect(commLight(quantised, said(1, -0.5))).toEqual(commLight(quantised, said(1, -0.5)));
  });

  it('separates the symbols of slot 0 by hue', () => {
    const hues = [-1, -0.5, 0.5, 1].map((v) => commLight(quantised, said(v, 0))[0]);
    expect(new Set(hues).size).toBe(hues.length);
  });

  it('reads silence as dark, and a transmission as lit', () => {
    expect(commLight(quantised, said(0, 0))[1]).toBeLessThanOrEqual(0.1);
    for (const v of [-1, -0.5, 0.5, 1]) expect(commLight(quantised, said(v, 0))[1]).toBeGreaterThan(0.2);
  });

  it('still ramps when the radio is continuous (the pre-D2 baseline)', () => {
    const cont = { ...DEFAULT_SIM, commTokens: 0, commDim: 2 };
    expect(commLight(cont, said(0.2, 0))[1]).toBeLessThan(commLight(cont, said(0.9, 0))[1]);
  });
});
