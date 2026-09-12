import { Rng } from '../core/rng.ts';
import type { SimConfig } from '../core/config.ts';
import { type Box, boxesOverlap, pointBoxDist } from './geom.ts';

export interface Spawn { x: number; z: number }

export interface ArenaMap {
  seed: number;
  boxes: Box[];
  /** spawns[team][slot] in world frame */
  spawns: [Spawn[], Spawn[]];
  /** objective centres. Length 1 is the classic central zone; length 2 is C1b's two-site layout, laid out so
   *  that the map's own 180° rotation maps site 0 onto site 1 — that is what keeps it side-fair. */
  sites: Spawn[];
  /** site 0, kept as its own field because the world, the viewer and the heat map all still read it */
  zoneX: number;
  zoneZ: number;
}

/** Rotate a box 180° about the arena centre — the map is fair because every piece of cover has a twin. */
export function rotateBox(b: Box): Box {
  return { minX: -b.maxX, minZ: -b.maxZ, maxX: -b.minX, maxZ: -b.minZ, h: b.h };
}

/**
 * Procedural 180°-symmetric arena. Cover comes in two heights: low walls hide legs/torso but not the head,
 * tall walls block sight completely. Two pillars sit on the rim of the control zone.
 */
export function generateMap(seed: number, cfg: SimConfig): ArenaMap {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const half = cfg.arenaHalf;
  const boxes: Box[] = [];

  const spawnRow = half - 3;
  const spawns: [Spawn[], Spawn[]] = [[], []];
  for (let s = 0; s < cfg.teamSize; s++) {
    const x = cfg.teamSize === 1 ? 0 : -8 + (16 * s) / (cfg.teamSize - 1);
    spawns[0].push({ x, z: -spawnRow });
    spawns[1].push({ x: -x, z: spawnRow });
  }

  const two = cfg.siteCount === 2;
  const sites: Spawn[] = two
    ? [{ x: cfg.siteOffset, z: 0 }, { x: -cfg.siteOffset, z: 0 }]
    : [{ x: 0, z: 0 }];

  const pillar: Box = { minX: 4.2, minZ: -0.9, maxX: 5.8, maxZ: 0.9, h: 2.6 };
  boxes.push(pillar, rotateBox(pillar));

  if (two) {
    // Screens: BOTH sites have to be hidden from BOTH spawn rows, so it takes two pairs rather than one —
    // a single pair only hides each site from the row it faces. The gaps left over are the lanes: a central
    // door between the two screens and an open flank outside each one.
    const screenNear: Box = { minX: 4, minZ: -13, maxX: 20, maxZ: -11.5, h: 2.6 };
    const screenFar: Box = { minX: -20, minZ: -13, maxX: -4, maxZ: -11.5, h: 2.6 };
    boxes.push(screenNear, rotateBox(screenNear), screenFar, rotateBox(screenFar));
    // Centre divider: without it the two sites are one wide room and "which site" is not a decision. It is
    // its own 180° twin, so it is pushed once — rotating it would duplicate the same box.
    boxes.push({ minX: -1.5, minZ: -7, maxX: 1.5, maxZ: 7, h: 2.6 });
  } else {
    // Mid walls: the zone must not be visible from the spawn rows, otherwise "camp at spawn" beats "hold the zone"
    // and both sides learn to hide. Two segments per side leave a narrow central door → three lanes.
    const midL: Box = { minX: -9, minZ: -11.6, maxX: -1.2, maxZ: -10.4, h: 2.6 };
    const midR: Box = { minX: 1.2, minZ: -11.6, maxX: 9, maxZ: -10.4, h: 2.6 };
    boxes.push(midL, midR, rotateBox(midL), rotateBox(midR));
  }

  const targetPairs = 13;
  let pairs = 0;
  let tries = 0;
  while (pairs < targetPairs && tries < 4000) {
    tries++;
    const w = rng.range(1.5, 6);
    const d = rng.range(1, 4);
    const cx = rng.range(-half + 4, half - 4);
    const cz = rng.range(-half + 8, half - 8);
    const h = rng.next() < 0.4 ? 1.1 : 2.6;
    const b: Box = { minX: cx - w / 2, minZ: cz - d / 2, maxX: cx + w / 2, maxZ: cz + d / 2, h };
    const twin = rotateBox(b);
    let inSite = false;
    for (const s of sites) if (pointBoxDist(s.x, s.z, b) < cfg.zoneRadius + 1) { inSite = true; break; }
    if (inSite) continue;
    if (boxesOverlap(b, twin, 1.4)) continue;
    let bad = false;
    for (const o of boxes) {
      if (boxesOverlap(b, o, 1.4) || boxesOverlap(twin, o, 1.4)) { bad = true; break; }
    }
    if (bad) continue;
    for (const team of spawns) {
      for (const sp of team) {
        if (pointBoxDist(sp.x, sp.z, b) < 2.5 || pointBoxDist(sp.x, sp.z, twin) < 2.5) { bad = true; break; }
      }
      if (bad) break;
    }
    if (bad) continue;
    boxes.push(b, twin);
    pairs++;
  }

  return { seed, boxes, spawns, sites, zoneX: sites[0].x, zoneZ: sites[0].z };
}
