/**
 * Map topology probe — ROADMAP Phase C1 says "probe before map build", so this measures the CURRENT arena
 * on the metrics a new topology will have to beat.
 *
 *   node scripts/mapprobe.ts [--seeds 7,11,23] [--cell 0.5] [--slack 0.15]
 *
 * What it can measure on a one-objective map, and what it structurally cannot, is itself the finding: the
 * rotate / fake / commitment family of metrics has no definition until there are two places worth going.
 *
 * Route structure is read off two BFS distance fields — distance from a spawn row (`ds`) and distance from
 * the objective (`dt`). A cell is on a viable route when `ds + dt <= shortest * (1 + slack)`, so a sensible
 * detour counts and a walk into the far corner does not. Slicing that corridor by depth and counting
 * connected components per slice gives the number of genuinely distinct ways through, and the narrowest
 * slice is the choke.
 */
import { DEFAULT_SIM, DEFAULT_EVO } from '../src/core/config.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { pointBoxDist, segmentHitsBox } from '../src/sim/geom.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', String(DEFAULT_EVO.mapSeed)).split(',').map(Number);
const CELL = Number(flag('cell', '0.5'));
const SLACK = Number(flag('slack', '0.15'));
const cfg = DEFAULT_SIM;

interface Grid { n: number; walk: Uint8Array; xOf: (i: number) => number; zOf: (i: number) => number; idx: (x: number, z: number) => number }

/**
 * Odd cell count with centres at (i - mid) * CELL, so the grid maps onto itself under the 180° rotation the
 * map is built with. An edge-aligned grid does not: x = 8 and x = -8 land in cells centred at 8.25 and
 * -7.75, and the probe then reports a half-metre side asymmetry that exists only in the measurement — on a
 * map whose whole point is being side-fair.
 */
function buildGrid(map: ArenaMap): Grid {
  const half = Math.round(cfg.arenaHalf / CELL);
  const n = 2 * half + 1;
  const mid = half;
  const walk = new Uint8Array(n * n);
  const xOf = (i: number) => ((i % n) - mid) * CELL;
  const zOf = (i: number) => (Math.floor(i / n) - mid) * CELL;
  for (let i = 0; i < n * n; i++) {
    const x = xOf(i);
    const z = zOf(i);
    // a body has width: a cell is walkable only if the agent's disc fits
    let ok = true;
    for (const b of map.boxes) {
      if (pointBoxDist(x, z, b) < cfg.agentRadius) { ok = false; break; }
    }
    walk[i] = ok ? 1 : 0;
  }
  const clamp = (c: number) => Math.min(n - 1, Math.max(0, c));
  const idx = (x: number, z: number) => clamp(Math.round(z / CELL) + mid) * n + clamp(Math.round(x / CELL) + mid);
  return { n, walk, xOf, zOf, idx };
}

/** 4-neighbour BFS in cells; Infinity where unreachable. */
function bfs(g: Grid, sources: number[]): Float64Array {
  const d = new Float64Array(g.n * g.n).fill(Infinity);
  const q: number[] = [];
  for (const s of sources) if (g.walk[s]) { d[s] = 0; q.push(s); }
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    const cx = c % g.n;
    const cz = Math.floor(c / g.n);
    const step = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (const [ddx, ddz] of step) {
      const nx = cx + ddx;
      const nz = cz + ddz;
      if (nx < 0 || nz < 0 || nx >= g.n || nz >= g.n) continue;
      const k = nz * g.n + nx;
      if (!g.walk[k] || d[k] !== Infinity) continue;
      d[k] = d[c] + 1;
      q.push(k);
    }
  }
  return d;
}

/** Connected components (4-neighbour) among the flagged cells of one depth slice. */
function components(g: Grid, cells: number[]): number {
  const set = new Set(cells);
  const seen = new Set<number>();
  let n = 0;
  for (const c of cells) {
    if (seen.has(c)) continue;
    n++;
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const v = stack.pop()!;
      const vx = v % g.n;
      const vz = Math.floor(v / g.n);
      for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = vx + ddx;
        const nz = vz + ddz;
        if (nx < 0 || nz < 0 || nx >= g.n || nz >= g.n) continue;
        const k = nz * g.n + nx;
        if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
      }
    }
  }
  return n;
}

function losBlocked(map: ArenaMap, ax: number, az: number, bx: number, bz: number): boolean {
  for (const b of map.boxes) {
    if (b.h <= cfg.eyeHeight) continue; // low cover does not hide a standing head
    if (segmentHitsBox(ax, cfg.eyeHeight, az, bx, cfg.eyeHeight, bz, b)) return true;
  }
  return false;
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

// `--self-test`: the metrics below are meant to certify that a NEW topology is side-fair, so the instrument
// has to be side-fair first. Checks the grid maps onto itself under the map's own 180° rotation, and that a
// symmetric map therefore reads identically for both teams. Exits non-zero on failure — a probe that only
// prints its complaint is a probe nobody notices.
if (process.argv.includes('--self-test')) {
  const map = generateMap(DEFAULT_EVO.mapSeed, cfg);
  const g = buildGrid(map);
  let bad = 0;
  for (const [x, z] of [[8, 27], [-4, 11.3], [0, 0], [13.7, -2.2], [29.9, -29.9]] as const) {
    const a = g.idx(x, z);
    const b = g.idx(-x, -z);
    if (a + b !== g.n * g.n - 1) { console.error(`grid is not 180°-symmetric at (${x}, ${z}): ${a} + ${b} != ${g.n * g.n - 1}`); bad++; }
    if (g.walk[a] !== g.walk[b]) { console.error(`walkability differs across the rotation at (${x}, ${z})`); bad++; }
  }
  const dt = bfs(g, [g.idx(map.zoneX, map.zoneZ)]);
  const reach = (team: 0 | 1) => Math.min(...map.spawns[team].map((s) => dt[g.idx(s.x, s.z)]));
  if (reach(0) !== reach(1)) { console.error(`a 180°-symmetric map reads ${reach(0)} vs ${reach(1)} cells for the two sides`); bad++; }
  console.log(bad === 0 ? `self-test OK (grid ${g.n}x${g.n}, both sides ${reach(0)} cells from the objective)` : `self-test FAILED: ${bad} problem(s)`);
  process.exit(bad === 0 ? 0 : 2);
}

console.log(`map topology probe — cell ${CELL}m, detour slack ${(SLACK * 100).toFixed(0)}%`);
console.log(`objectives on this map: 1 (a single central zone) — every rotate / fake / commitment metric below`);
console.log(`reads n/a because it has no definition until there are two places worth going. That is Phase C1's premise.`);
console.log();
console.log(`${padr('seed', 6)}${padr('side', 6)}${pad('walkable', 10)}${pad('dist', 7)}${pad('routes', 8)}${pad('choke', 7)}${pad('corridor', 10)}${pad('spawnLOS', 10)}`);

for (const seed of SEEDS) {
  const map = generateMap(seed, cfg);
  const g = buildGrid(map);
  const walkable = g.walk.reduce((a, b) => a + b, 0);
  const site = [g.idx(map.zoneX, map.zoneZ)];
  const dt = bfs(g, site);
  for (const team of [0, 1] as const) {
    const spawns = map.spawns[team];
    const ds = bfs(g, spawns.map((s) => g.idx(s.x, s.z)));
    let best = Infinity;
    for (const s of spawns) best = Math.min(best, ds[g.idx(s.x, s.z)] + dt[g.idx(s.x, s.z)]);
    // shortest spawn->site distance, in cells
    let shortest = Infinity;
    for (const s of spawns) shortest = Math.min(shortest, dt[g.idx(s.x, s.z)]);
    void best;
    const budget = shortest * (1 + SLACK);
    const onPath: number[] = [];
    for (let i = 0; i < g.n * g.n; i++) if (g.walk[i] && ds[i] + dt[i] <= budget) onPath.push(i);
    // slice the corridor by depth from the spawn row and count distinct ways through each slice
    const byDepth = new Map<number, number[]>();
    for (const c of onPath) {
      const k = Math.round(ds[c] / 4) * 4; // 2 m bands at cell 0.5
      if (!byDepth.has(k)) byDepth.set(k, []);
      byDepth.get(k)!.push(c);
    }
    let maxRoutes = 0;
    let choke = Infinity;
    for (const [k, cells] of [...byDepth].sort((a, b) => a[0] - b[0])) {
      if (k === 0 || k >= shortest) continue; // ignore the slices sitting on top of spawn and site
      maxRoutes = Math.max(maxRoutes, components(g, cells));
      choke = Math.min(choke, cells.length);
    }
    const blocked = spawns.filter((s) => losBlocked(map, s.x, s.z, map.zoneX, map.zoneZ)).length;
    console.log(
      `${padr(team === 0 ? String(seed) : '', 6)}${padr(team === 0 ? 'red' : 'blue', 6)}` +
      `${pad(String(walkable), 10)}${pad((shortest * CELL).toFixed(1), 7)}${pad(String(maxRoutes), 8)}` +
      `${pad(String(choke === Infinity ? 0 : choke), 7)}${pad(`${((onPath.length / walkable) * 100).toFixed(0)}%`, 10)}` +
      `${pad(`${blocked}/${spawns.length}`, 10)}`,
    );
  }
}
console.log();
console.log('dist      = shortest spawn→objective distance in metres');
console.log('routes    = most connected components any 2 m slice of the viable corridor splits into (1 = a single lane)');
console.log('choke     = cells in the narrowest slice of that corridor');
console.log('corridor  = share of walkable area that lies on a viable route at all');
console.log('spawnLOS  = spawn points whose sight-line to the objective is blocked (high is intended: GOTCHAS tombstone 3)');
console.log();
console.log('n/a until there are two objectives: site commitment time, first pressure side, rotate frequency,');
console.log('defender rotation latency, split width, post-objective retake paths.');
