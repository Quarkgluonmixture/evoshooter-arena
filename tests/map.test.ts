import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM } from '../src/core/config.ts';
import { generateMap, rotateBox } from '../src/sim/map.ts';
import { pointBoxDist } from '../src/sim/geom.ts';

describe('generateMap', () => {
  const map = generateMap(7, DEFAULT_SIM);
  it('is 180° symmetric (every box has a rotated twin)', () => {
    for (const b of map.boxes) {
      const r = rotateBox(b);
      const twin = map.boxes.find(
        (o) => Math.abs(o.minX - r.minX) < 1e-9 && Math.abs(o.maxX - r.maxX) < 1e-9 &&
          Math.abs(o.minZ - r.minZ) < 1e-9 && Math.abs(o.maxZ - r.maxZ) < 1e-9 && o.h === r.h,
      );
      expect(twin).toBeDefined();
    }
  });
  it('has mirrored spawns clear of cover', () => {
    expect(map.spawns[0].length).toBe(DEFAULT_SIM.teamSize);
    for (let s = 0; s < DEFAULT_SIM.teamSize; s++) {
      expect(map.spawns[1][s].x).toBeCloseTo(-map.spawns[0][s].x);
      expect(map.spawns[1][s].z).toBeCloseTo(-map.spawns[0][s].z);
      for (const team of map.spawns) for (const sp of team) for (const b of map.boxes) {
        expect(pointBoxDist(sp.x, sp.z, b)).toBeGreaterThan(DEFAULT_SIM.agentRadius);
      }
    }
  });
  it('produces a reasonable amount of cover and is seed-stable', () => {
    expect(map.boxes.length).toBeGreaterThanOrEqual(16);
    expect(generateMap(7, DEFAULT_SIM)).toEqual(map);
    expect(generateMap(8, DEFAULT_SIM).boxes).not.toEqual(map.boxes);
  });
});
