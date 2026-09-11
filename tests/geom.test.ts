import { describe, expect, it } from 'vitest';
import { segmentHitsBox, rayBoxDist2D, resolveCircleBox, type Box } from '../src/sim/geom.ts';

const wall: Box = { minX: -1, minZ: 4, maxX: 1, maxZ: 5, h: 2.6 };
const low: Box = { minX: -1, minZ: 4, maxX: 1, maxZ: 5, h: 1.1 };

describe('segmentHitsBox', () => {
  it('blocks a shot through a tall wall and not around it', () => {
    expect(segmentHitsBox(0, 1.6, 0, 0, 1.0, 10, wall)).toBe(true);
    expect(segmentHitsBox(5, 1.6, 0, 5, 1.0, 10, wall)).toBe(false);
  });
  it('low cover hides the legs but not the head', () => {
    expect(segmentHitsBox(0, 1.6, 0, 0, 0.45, 10, low)).toBe(true);
    expect(segmentHitsBox(0, 1.6, 0, 0, 1.55, 10, low)).toBe(false);
  });
  it('ignores boxes behind the target', () => {
    expect(segmentHitsBox(0, 1.6, 0, 0, 1.0, 3, wall)).toBe(false);
  });
});

describe('rayBoxDist2D', () => {
  it('returns entry distance or Infinity', () => {
    expect(rayBoxDist2D(0, 0, 0, 1, wall)).toBeCloseTo(4);
    expect(rayBoxDist2D(0, 0, 0, -1, wall)).toBe(Infinity);
    expect(rayBoxDist2D(0, 0, 1, 0, wall)).toBe(Infinity);
  });
});

describe('resolveCircleBox', () => {
  it('pushes a penetrating circle out along the nearest face', () => {
    const [x, z] = resolveCircleBox(0, 3.8, 0.5, wall);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(3.5);
  });
  it('leaves non-touching circles alone', () => {
    expect(resolveCircleBox(0, 3, 0.5, wall)).toEqual([0, 3]);
  });
  it('ejects a centre that ended up inside', () => {
    const [, z] = resolveCircleBox(0, 4.1, 0.5, wall);
    expect(z).toBeCloseTo(3.5);
  });
});
