import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM } from '../src/core/config.ts';
import { generateMap, rotateBox } from '../src/sim/map.ts';
import { pointBoxDist, segmentHitsBox } from '../src/sim/geom.ts';

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
  it('mostly hides the zone from the spawn rows (only the central door leaks a sliver)', () => {
    const eye = DEFAULT_SIM.eyeHeight;
    let blocked = 0;
    let total = 0;
    for (const team of map.spawns) for (const sp of team) {
      for (let k = 0; k < 24; k++) {
        const ang = (k / 24) * Math.PI * 2;
        for (const r of [0.3, 0.9]) {
          const zx = map.zoneX + Math.cos(ang) * DEFAULT_SIM.zoneRadius * r;
          const zz = map.zoneZ + Math.sin(ang) * DEFAULT_SIM.zoneRadius * r;
          total++;
          if (map.boxes.some((b) => segmentHitsBox(sp.x, eye, sp.z, zx, 1.0, zz, b))) blocked++;
        }
      }
    }
    expect(blocked / total).toBeGreaterThan(0.75);
  });
  it('produces a reasonable amount of cover and is seed-stable', () => {
    expect(map.boxes.length).toBeGreaterThanOrEqual(16);
    expect(generateMap(7, DEFAULT_SIM)).toEqual(map);
    expect(generateMap(8, DEFAULT_SIM).boxes).not.toEqual(map.boxes);
  });
});

describe('two-site layout (ROADMAP C1b)', () => {
  const cfg = { ...DEFAULT_SIM, siteCount: 2 as const };

  it('places the two sites so the map\'s own 180° rotation swaps them', () => {
    // This is the whole reason the layout is side-fair with an asymmetric objective: whichever side you
    // start on, rotating the world puts you in the other side's position with A and B relabelled. If the
    // sites were not each other's image, "attack A" would mean something different for red and for blue.
    for (const seed of [7, 11, 23]) {
      const m = generateMap(seed, cfg);
      expect(m.sites.length).toBe(2);
      expect(m.sites[1].x).toBeCloseTo(-m.sites[0].x, 9);
      expect(m.sites[1].z).toBeCloseTo(-m.sites[0].z, 9);
      expect(m.zoneX).toBe(m.sites[0].x); // the single-site consumers still read site 0
      expect(m.zoneZ).toBe(m.sites[0].z);
    }
  });

  it('keeps every site clear of cover and hidden from the spawn rows', () => {
    const eye = DEFAULT_SIM.eyeHeight;
    for (const seed of [7, 11, 23]) {
      const m = generateMap(seed, cfg);
      for (const site of m.sites) {
        for (const b of m.boxes) expect(pointBoxDist(site.x, site.z, b)).toBeGreaterThan(1);
        let blocked = 0;
        let total = 0;
        for (const team of m.spawns) for (const sp of team) {
          for (let k = 0; k < 24; k++) {
            const ang = (k / 24) * Math.PI * 2;
            for (const r of [0.3, 0.9]) {
              const zx = site.x + Math.cos(ang) * DEFAULT_SIM.zoneRadius * r;
              const zz = site.z + Math.sin(ang) * DEFAULT_SIM.zoneRadius * r;
              total++;
              if (m.boxes.some((b) => segmentHitsBox(sp.x, eye, sp.z, zx, 1.0, zz, b))) blocked++;
            }
          }
        }
        expect(blocked / total, `seed ${seed} site (${site.x}, ${site.z})`).toBeGreaterThan(0.75);
      }
    }
  });

  it('leaves the single-site map untouched', () => {
    // siteCount is a switch, not a rewrite: the classic arena has to come out bit-identical or every
    // baseline measured on it quietly stops being comparable.
    const one = generateMap(7, DEFAULT_SIM);
    expect(one.sites).toEqual([{ x: 0, z: 0 }]);
    expect(one.boxes.length).toBeGreaterThanOrEqual(16);
    expect(generateMap(7, { ...DEFAULT_SIM, siteCount: 1 as const })).toEqual(one);
  });
});
