/**
 * Navigation grid — ⚠ REFERENCE AND ANALYSIS ONLY.
 *
 * Nothing an evolving policy can reach may ever import this. Handing an agent a shortest-path field is
 * handing it the answer to "how do I get there", which is exactly the kind of pre-solved question
 * `docs/VISION.md` §1.1 forbids putting in the world. It exists so that (a) `scripts/mapprobe.ts` can
 * measure a map's route structure and (b) the hand-written reference bots in `src/brain/scripted.ts` can
 * walk somewhere on purpose — C1's exit is "reference agents can show the world ALLOWS it", and a bot that
 * gets stuck on a wall proves nothing about the world.
 *
 * The grid has an ODD cell count with centres symmetric about the origin, so it maps onto itself under the
 * 180° rotation the arena is built with. An edge-aligned grid does not, and then a perfectly side-fair map
 * measures as asymmetric (GOTCHAS #25).
 */
import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from './map.ts';
import { pointBoxDist } from './geom.ts';

export interface NavGrid {
  n: number;
  cell: number;
  walk: Uint8Array;
  xOf(i: number): number;
  zOf(i: number): number;
  idx(x: number, z: number): number;
}

export function buildNav(map: ArenaMap, cfg: SimConfig, cell = 0.5): NavGrid {
  const half = Math.round(cfg.arenaHalf / cell);
  const n = 2 * half + 1;
  const walk = new Uint8Array(n * n);
  const xOf = (i: number) => ((i % n) - half) * cell;
  const zOf = (i: number) => (Math.floor(i / n) - half) * cell;
  for (let i = 0; i < n * n; i++) {
    const x = xOf(i);
    const z = zOf(i);
    let ok = true;
    for (const b of map.boxes) if (pointBoxDist(x, z, b) < cfg.agentRadius) { ok = false; break; }
    walk[i] = ok ? 1 : 0;
  }
  const clamp = (c: number) => Math.min(n - 1, Math.max(0, c));
  const idx = (x: number, z: number) => clamp(Math.round(z / cell) + half) * n + clamp(Math.round(x / cell) + half);
  return { n, cell, walk, xOf, zOf, idx };
}

/** 4-neighbour BFS in cells; Infinity where unreachable. */
export function bfsFrom(g: NavGrid, sources: number[]): Float64Array {
  const d = new Float64Array(g.n * g.n).fill(Infinity);
  const q: number[] = [];
  for (const s of sources) if (g.walk[s]) { d[s] = 0; q.push(s); }
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    const cx = c % g.n;
    const cz = Math.floor(c / g.n);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= g.n || nz >= g.n) continue;
      const k = nz * g.n + nx;
      if (!g.walk[k] || d[k] !== Infinity) continue;
      d[k] = d[c] + 1;
      q.push(k);
    }
  }
  return d;
}

/* --------------------------------------------------------------- cached fields */

interface Cached { nav: NavGrid; fields: Map<string, Float64Array> }
const CACHE = new WeakMap<ArenaMap, Cached>();

/** Distance-to-target field for this map, built once and reused. */
export function fieldTo(map: ArenaMap, cfg: SimConfig, tx: number, tz: number): { nav: NavGrid; field: Float64Array } {
  let c = CACHE.get(map);
  if (!c) { c = { nav: buildNav(map, cfg), fields: new Map() }; CACHE.set(map, c); }
  const key = `${tx},${tz}`;
  let field = c.fields.get(key);
  if (!field) {
    field = bfsFrom(c.nav, [c.nav.idx(tx, tz)]);
    c.fields.set(key, field);
  }
  return { nav: c.nav, field };
}

/**
 * Unit direction from (x, z) toward the neighbouring cell closest to the target, or the straight-line
 * direction when the field says nothing useful (already there, or standing somewhere unreachable).
 */
export function navDir(map: ArenaMap, cfg: SimConfig, x: number, z: number, tx: number, tz: number): [number, number] {
  const { nav, field } = fieldTo(map, cfg, tx, tz);
  const here = nav.idx(x, z);
  let best = -1;
  let bestD = field[here];
  const cx = here % nav.n;
  const cz = Math.floor(here / nav.n);
  // look two cells out: one cell is 0.5 m and an agent covers that inside a tick, which makes the heading jitter
  for (let ddz = -2; ddz <= 2; ddz++) {
    for (let ddx = -2; ddx <= 2; ddx++) {
      const nx = cx + ddx;
      const nz = cz + ddz;
      if (nx < 0 || nz < 0 || nx >= nav.n || nz >= nav.n) continue;
      const k = nz * nav.n + nx;
      if (!nav.walk[k]) continue;
      if (field[k] < bestD) { bestD = field[k]; best = k; }
    }
  }
  const gx = best >= 0 ? nav.xOf(best) - x : tx - x;
  const gz = best >= 0 ? nav.zOf(best) - z : tz - z;
  const d = Math.hypot(gx, gz);
  return d > 1e-6 ? [gx / d, gz / d] : [0, 0];
}
