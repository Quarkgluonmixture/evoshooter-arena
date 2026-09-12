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
import { buildNav, bfsFrom, type NavGrid } from '../src/sim/nav.ts';
import { segmentHitsBox } from '../src/sim/geom.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', String(DEFAULT_EVO.mapSeed)).split(',').map(Number);
const CELL = Number(flag('cell', '0.5'));
const SLACK = Number(flag('slack', '0.15'));
const SITES = Number(flag('sites', String(DEFAULT_SIM.siteCount)));
const cfg = { ...DEFAULT_SIM, siteCount: (SITES === 2 ? 2 : 1) as 1 | 2 };

type Grid = NavGrid;
const buildGrid = (map: ArenaMap): Grid => buildNav(map, cfg, CELL);
const bfs = (g: Grid, sources: number[]): Float64Array => bfsFrom(g, sources);

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
  // Two sites are only side-fair if the rotation swaps them: red→A has to equal blue→B, and red→B blue→A.
  // With one site per side that is one number; with two it is the claim the whole layout rests on.
  for (const seed of [7, 11, 23]) {
    const m2 = generateMap(seed, { ...cfg, siteCount: 2 as const });
    const g2 = buildGrid(m2);
    const d2 = m2.sites.map((s) => bfs(g2, [g2.idx(s.x, s.z)]));
    const reach2 = (team: 0 | 1, si: number) => Math.min(...m2.spawns[team].map((s) => d2[si][g2.idx(s.x, s.z)]));
    if (reach2(0, 0) !== reach2(1, 1) || reach2(0, 1) !== reach2(1, 0)) {
      console.error(`two-site map ${seed} is not side-fair: red→A/B = ${reach2(0, 0)}/${reach2(0, 1)}, blue→B/A = ${reach2(1, 1)}/${reach2(1, 0)}`);
      bad++;
    }
  }
  console.log(bad === 0 ? `self-test OK (grid ${g.n}x${g.n}, both sides ${reach(0)} cells from the objective; two-site layout side-fair on 3 seeds)` : `self-test FAILED: ${bad} problem(s)`);
  process.exit(bad === 0 ? 0 : 2);
}

console.log(`map topology probe — cell ${CELL}m, detour slack ${(SLACK * 100).toFixed(0)}%, siteCount ${cfg.siteCount}`);
console.log();

/** Cells on a viable route from `from` to `to`: a sensible detour counts, a walk into a dead corner does not. */
function corridor(g: Grid, ds: Float64Array, dt: Float64Array, shortest: number): Set<number> {
  const budget = shortest * (1 + SLACK);
  const out = new Set<number>();
  for (let i = 0; i < g.n * g.n; i++) if (g.walk[i] && ds[i] + dt[i] <= budget) out.add(i);
  return out;
}

/** Widest split of the corridor into distinct ways through, and the narrowest slice (the choke). */
function shape(g: Grid, cells: Set<number>, ds: Float64Array, shortest: number): { routes: number; mid: number; midWide: number; choke: number } {
  const byDepth = new Map<number, number[]>();
  for (const c of cells) {
    const k = Math.round(ds[c] / 4) * 4; // 2 m bands at cell 0.5
    if (!byDepth.has(k)) byDepth.set(k, []);
    byDepth.get(k)!.push(c);
  }
  let routes = 0;
  let mid = Infinity;
  let midWide = Infinity;
  let choke = Infinity;
  for (const [k, band] of byDepth) {
    if (k === 0 || k >= shortest) continue; // ignore the slices sitting on top of spawn and site
    const c = components(g, band);
    routes = Math.max(routes, c);
    choke = Math.min(choke, band.length);
    // C1's exit asks whether a single path dominates. Slices near the site are one component no matter how
    // open the map is — every approach has to arrive somewhere — so the question is only meaningful in the
    // middle of the journey, where an alternative could exist.
    if (k > 0.25 * shortest && k < 0.75 * shortest) {
      if (c < mid) { mid = c; midWide = band.length; }
      else if (c === mid) midWide = Math.min(midWide, band.length);
    }
  }
  return { routes, mid: mid === Infinity ? 0 : mid, midWide: midWide === Infinity ? 0 : midWide, choke: choke === Infinity ? 0 : choke };
}

const SITE_NAMES = ['A', 'B', 'C', 'D'];

for (const seed of SEEDS) {
  const map = generateMap(seed, cfg);
  const g = buildGrid(map);
  const walkable = g.walk.reduce((a, b) => a + b, 0);
  const dSite = map.sites.map((s) => bfs(g, [g.idx(s.x, s.z)]));
  console.log(`map seed ${seed} — ${walkable} walkable cells, ${map.sites.length} site(s) at ${map.sites.map((s) => `(${s.x}, ${s.z})`).join(' ')}`);
  console.log(`  ${padr('side', 6)}${padr('site', 6)}${pad('dist', 7)}${pad('routes', 8)}${pad('mid', 8)}${pad('choke', 7)}${pad('corridor', 10)}${pad('spawnLOS', 10)}`);
  const union: Set<number>[] = [];
  const perSide: Set<number>[][] = [];
  for (const team of [0, 1] as const) {
    const spawns = map.spawns[team];
    const ds = bfs(g, spawns.map((s) => g.idx(s.x, s.z)));
    const all = new Set<number>();
    const mine: Set<number>[] = [];
    map.sites.forEach((site, si) => {
      const dt = dSite[si];
      const shortest = Math.min(...spawns.map((s) => dt[g.idx(s.x, s.z)]));
      const cells = corridor(g, ds, dt, shortest);
      mine.push(cells);
      for (const c of cells) all.add(c);
      const { routes, mid, midWide, choke } = shape(g, cells, ds, shortest);
      const blocked = spawns.filter((s) => losBlocked(map, s.x, s.z, site.x, site.z)).length;
      console.log(
        `  ${padr(si === 0 ? (team === 0 ? 'red' : 'blue') : '', 6)}${padr(SITE_NAMES[si], 6)}` +
        `${pad((shortest * CELL).toFixed(1), 7)}${pad(String(routes), 8)}${pad(`${mid}/${midWide}`, 8)}${pad(String(choke), 7)}` +
        `${pad(`${((cells.size / walkable) * 100).toFixed(0)}%`, 10)}${pad(`${blocked}/${spawns.length}`, 10)}`,
      );
    });
    perSide.push(mine);
    union.push(all);
    console.log(`  ${padr('', 6)}${padr('all', 6)}${pad('', 7)}${pad('', 8)}${pad('', 8)}${pad('', 7)}${pad(`${((all.size / walkable) * 100).toFixed(0)}%`, 10)}`);
  }
  if (map.sites.length >= 2) {
    // the geometric floor on defender rotation latency: how far it is from one site to the other on foot
    const rot = dSite[0][g.idx(map.sites[1].x, map.sites[1].z)] * CELL;
    console.log(`  site A → site B on foot: ${rot.toFixed(1)} m  (= ${(rot / cfg.maxSpeed).toFixed(1)} s at full sprint — the floor under any rotation)`);
    for (const team of [0, 1] as const) {
      const [a, b] = perSide[team];
      let inter = 0;
      for (const c of a) if (b.has(c)) inter++;
      const uni = a.size + b.size - inter;
      console.log(`  ${team === 0 ? 'red' : 'blue'} approaches to A and B overlap ${((inter / Math.max(1, uni)) * 100).toFixed(0)}%` +
        ` — low means "which site" is a real commitment, high means one road serves both`);
    }
  } else {
    console.log('  n/a until there are two objectives: A→B rotation distance, approach disjointness, split width.');
  }
  console.log();
}
console.log('dist      = shortest spawn→site distance in metres');
console.log('routes    = most connected components any 2 m slice of that corridor splits into (1 = a single lane)');
console.log('mid       = over the MIDDLE HALF of the journey: fewest components / how many cells wide that slice is.');
console.log('            ⭐ one component is only a dominating path if it is also NARROW. A single wide slice is an open');
console.log('            field everyone crosses, which is not the same thing as a corridor everyone is funnelled into.');
console.log('choke     = cells in the narrowest slice');
console.log('corridor  = share of walkable area on a viable route to that site; `all` is the union over sites');
console.log('spawnLOS  = spawn points whose sight-line to the site is blocked (high is intended: GOTCHAS tombstone 3)');
console.log();
console.log('still n/a without agents: site commitment time, first pressure side, rotate frequency, defender');
console.log('rotation latency (only its geometric floor is above), post-objective retake success.');
