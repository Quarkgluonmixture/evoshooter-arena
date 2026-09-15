/**
 * ROADMAP G2 — run the trade detector, on scripted scenarios first (its precision check) and then on champions.
 *
 *   node scripts/detect.ts [runs/a.json ...] [--gen G] [--n 12] [--window 3] [--radius 12]
 *
 * The scripted rows are not decoration: G2 asks for a precision sanity check, and a detector that reads 0 on a
 * scenario built to contain trades, or > 0 on one where nobody can shoot back, is broken (GOTCHAS #26 — prove the
 * tool reaches its assertion before reading the world with it).
 *
 * ⛔ Nothing here may enter training: the detector lives under src/probe, behind the T8 firewall.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { DEFAULT_SIM, normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { stepMatch } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import {
  ClutchSlowPolicy, EagerRotateDefenderPolicy, FakeAttackerPolicy, MetronomePolicy, PacifistRusherPolicy,
  PostHolderPolicy, ReactiveDefenderPolicy, SiteAttackerPolicy, SiteDefenderPolicy,
} from '../src/brain/scripted.ts';
import {
  crossfireTick, meanSE, median, newCrossfireStats, rotateStats, tempoPairs, tradeStats,
  type CrossfireStats, type KillRecord, type RotateStats, type RotateTrace, type TempoTrace, type TradeOptions,
} from '../src/probe/detect.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
/**
 * A CLOSED detector does not print champion rows. The rule when precision fails is "⛔ champions stay unread", and
 * printing them anyway has a measured cost: after crossfire v1 failed with the champion rows in the same table, the
 * redo's expectations were no longer a clean prior and the prediction file had to say so. `--reopen trade,rotate,…`
 * is the deliberate override, and it is only legitimate together with a NEW pre-registration.
 */
const reopened = (name: string) => (flags.get('reopen') ?? '').split(',').includes(name);
const N = num('n', 12);
const WINDOW = num('window', 3);
const RADIUS = num('radius', 12);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

/** Play a match and keep the spectator's kill records (tick + where), which is all the detector needs. */
function playAndCollect(sim: SimConfig, map: ArenaMap, seed: number, red: Policy, blue: Policy, attackers: 0 | 1): { kills: KillRecord[]; ticks: number } {
  const w = new World(sim, map, seed, { attackers });
  const kills: KillRecord[] = [];
  while (!w.done) {
    stepMatch(w, red, blue);
    for (const ev of w.events) {
      if (ev.kind !== 'kill') continue;
      // alive counts after this tick's kills: the pool a teammate's next shot could have picked from
      kills.push({ tick: w.tick, killer: ev.killer, victim: ev.victim, x: ev.x, z: ev.z, aliveEnemies: [w.aliveCount[0], w.aliveCount[1]] });
    }
  }
  return { kills, ticks: w.tick };
}

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

interface Row { label: string; sim: SimConfig; map: ArenaMap; red: () => Policy; blue: () => Policy; observe: 0 | 1 }

const scriptedSim: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2, memorySeconds: 0 };
const scriptedMap = generateMap(7, scriptedSim);
const rows: Row[] = [
  // positive: both sides walk the same lane, so answering the killer is possible and common
  { label: 'scripted: same lane (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new SiteDefenderPolicy(0), observe: 0 },
  // negative: the observed team never fires, so it can never answer anybody
  { label: 'scripted: pacifists (−)', sim: scriptedSim, map: scriptedMap, red: () => new PacifistRusherPolicy(), blue: () => new SiteDefenderPolicy(0), observe: 0 },
];

for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  if (data.scaffold) throw new Error(`${path} is a scaffold run`);
  const { sim } = normalizeSim(data.sim);
  const shape = shapeFor(sim, data.evo.hidden);
  const map = generateMap(data.evo.mapSeed, sim);
  const tag = basename(path).replace(/\.json$/, '');
  const pick = (t: 0 | 1) => {
    const h = data.hof[t];
    const e = flags.has('gen') ? h.find((x) => x.gen === num('gen', 0)) : h[h.length - 1];
    if (!e) throw new Error(`${tag}: no hall-of-fame entry for gen ${flags.get('gen')}`);
    if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
    return { gen: e.gen, genome: Float32Array.from(e.genome) };
  };
  const r = pick(0);
  const b = pick(1);
  for (const observe of [0, 1] as const) {
    rows.push({
      label: `${tag}@${r.gen} ${observe === 0 ? 'R' : 'B'}`,
      sim, map, observe,
      red: () => new NeuralPolicy(shape, r.genome),
      blue: () => new NeuralPolicy(shape, b.genome),
    });
  }
}

console.log(`trade detector — window ${WINDOW}s, radius ${RADIUS}m, ${N} seeds x 2 role assignments per row`);
console.log('a death is TRADED when a teammate kills the killer inside the window and inside the radius;');
console.log("null = the same kills with the answering kill's TIME redrawn inside the match (64 redraws);");
console.log('lift = traded / expected-if-the-answering-kill-had-picked-uniformly-among-living-enemies, counted over the');
console.log('       deaths that got any answer inside the window and radius — it keeps every real time and place\n');
console.log(`${padr('observed team', 24)}${pad('deaths', 8)}${pad('traded', 8)}${pad('rate', 7)}${pad('null', 7)}${pad('x null', 7)}${pad('far', 6)}${pad('answered', 10)}${pad('lift', 7)}${pad('median gap', 11)}${pad('first trade (replay anchor)', 26)}`);

for (const row of rows) {
  const opts: TradeOptions = { windowSeconds: WINDOW, radius: RADIUS, dt: row.sim.dt, teamSize: row.sim.teamSize };
  let deaths = 0;
  let traded = 0;
  let far = 0;
  let nullSum = 0;
  let nullN = 0;
  let answered = 0;
  let chance = 0;
  const gaps: number[] = [];
  let anchor: { seed: number; attackers: 0 | 1; tick: number } | null = null;
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      const { kills, ticks } = playAndCollect(row.sim, row.map, seed, row.red(), row.blue(), attackers);
      const st = tradeStats(kills, row.observe, opts, ticks, hashSeed(991, m, attackers));
      deaths += st.deaths;
      traded += st.traded;
      far += st.far;
      gaps.push(...st.gaps);
      if (st.deaths) { nullSum += st.nullRate * st.deaths; nullN += st.deaths; }
      answered += st.answered;
      chance += st.chance;
      // a replay anchor needs the seed too, or "tick 213" points at nothing reproducible
      if (anchor === null && st.firstAt !== null) anchor = { seed, attackers, tick: st.firstAt };
    }
  }
  gaps.sort((a, b2) => a - b2);
  const rate = deaths ? traded / deaths : NaN;
  const nul = nullN ? nullSum / nullN : NaN;
  console.log(`${padr(row.label, 24)}${pad(String(deaths), 8)}${pad(String(traded), 8)}${pad(Number.isNaN(rate) ? 'n/a' : pct(rate), 7)}`
    + `${pad(Number.isNaN(nul) ? 'n/a' : pct(nul), 7)}${pad(nul > 0 ? (rate / nul).toFixed(1) : '—', 7)}${pad(String(far), 6)}`
    + `${pad(`${answered}`, 10)}${pad(chance > 0 ? (traded / chance).toFixed(2) : '—', 7)}`
    + `${pad(gaps.length ? `${median(gaps).toFixed(2)}s` : '—', 11)}${pad(anchor === null ? '—' : `seed ${anchor.seed} atk${anchor.attackers} t${anchor.tick}`, 26)}`);
}
/* ------------------------------------------------------------------ crossfire */

const SEP = num('separation', 60);
const MIN_RANGE = num('min-range', 6);
/** scripted controls: the same bots, split across both sites or stacked on one — the geometry does the talking */
const site0 = scriptedMap.sites[0];
/** two posts on OPPOSITE sides of site 0: an enemy on the site is between them, which is the angle we are after */
const flankPosts = [
  { x: site0.x - 7, z: site0.z - 2 }, { x: site0.x + 7, z: site0.z + 2 },
  { x: site0.x - 7, z: site0.z + 2 }, { x: site0.x + 7, z: site0.z - 2 }, { x: site0.x, z: site0.z - 8 },
];
/** the same five bodies bunched at one post: same map, same shooting, no angle */
const bunchedPosts = [{ x: site0.x - 1, z: site0.z - 7 }, { x: site0.x, z: site0.z - 7 }, { x: site0.x + 1, z: site0.z - 7 },
  { x: site0.x - 1, z: site0.z - 8 }, { x: site0.x + 1, z: site0.z - 8 }];
const crossRows: Row[] = [
  { label: 'scripted: flanking (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new PostHolderPolicy(flankPosts), observe: 1 },
  { label: 'scripted: bunched (−)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new PostHolderPolicy(bunchedPosts), observe: 1 },
  ...rows.filter((r) => !r.label.startsWith('scripted')),
];

function playCrossfire(row: Row, seed: number, attackers: 0 | 1, st: CrossfireStats): void {
  const w = new World(row.sim, row.map, seed, { attackers });
  const red = row.red();
  const blue = row.blue();
  let lastDamage = 0;
  while (!w.done) {
    stepMatch(w, red, blue);
    const dealt = w.stats[row.observe].damageDealt;
    crossfireTick(
      st,
      { team: row.observe, teamSize: row.sim.teamSize, n: w.n, tick: w.tick, minSeparationDeg: SEP, minRange: MIN_RANGE },
      (id) => w.agents[id].alive,
      (id) => w.agents[id],
      (viewer, target) => w.visible[viewer * w.n + target] === 1,
      dealt - lastDamage,
    );
    lastDamage = dealt;
  }
}

console.log(`\ncrossfire detector — an enemy seen by >= 2 teammates at least ${SEP}° apart (angle AT the enemy), both >= ${MIN_RANGE}m away`);
console.log(`${padr('observed team', 24)}${pad('seen ticks', 11)}${pad('crossfire', 10)}${pad('share', 7)}${pad('median sep', 11)}${pad('dmg share', 10)}${pad('first (replay anchor)', 26)}`);
for (const row of crossRows) {
  const st = newCrossfireStats();
  let anchor: { seed: number; attackers: 0 | 1; tick: number } | null = null;
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      const before = st.firstAt;
      playCrossfire(row, seed, attackers, st);
      if (anchor === null && before === null && st.firstAt !== null) anchor = { seed, attackers, tick: st.firstAt };
    }
  }
  st.separations.sort((a, b) => a - b);
  const share = st.seenTicks ? st.crossTicks / st.seenTicks : NaN;
  const dmg = st.totalDamage > 0 ? st.crossDamage / st.totalDamage : NaN;
  console.log(`${padr(row.label, 24)}${pad(String(st.seenTicks), 11)}${pad(String(st.crossTicks), 10)}`
    + `${pad(Number.isNaN(share) ? 'n/a' : pct(share), 7)}${pad(st.separations.length ? `${median(st.separations).toFixed(0)}°` : '—', 11)}`
    + `${pad(Number.isNaN(dmg) ? 'n/a' : pct(dmg), 10)}${pad(anchor === null ? '—' : `seed ${anchor.seed} atk${anchor.attackers} t${anchor.tick}`, 26)}`);
}

/* ------------------------------------------------------------------ rotate (pressure → switch) */

/** TS cannot see an assignment made inside a callback, so read the anchor through this instead of narrowing it. */
const anchorOf = (a: { seed: number; attackers: 0 | 1; tick: number } | null): string =>
  (a === null ? '—' : `seed ${a.seed} atk${a.attackers} t${a.tick}`);

const PRESSURE_R = num('pressure-radius', 12);
const STEP = 15;          // 1 s
const HORIZON = 45;       // 3 s
// ⚠ the attacker ALTERNATES per match: with one fixed attacker every match has the same pressure timeline, and
// "another match's pressure" is the same pressure — the null then reads 1.00 for everyone, including a rotator that
// ignores pressure entirely (first precision run, see the prediction file's addendum).
const ROTATE_ATTACKS: (() => Policy)[] = [
  () => new SiteAttackerPolicy(0), () => new SiteAttackerPolicy(1), () => new FakeAttackerPolicy(0, 1, 10),
];
const holdPosts = [{ x: site0.x - 3, z: site0.z }, { x: site0.x + 3, z: site0.z }, { x: site0.x, z: site0.z - 3 },
  { x: site0.x, z: site0.z + 3 }, { x: site0.x - 3, z: site0.z - 3 }];
const rotateRows: Row[] = [
  { label: 'scripted: eager rot (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new EagerRotateDefenderPolicy(1, 0, 12), observe: 1 },
  { label: 'scripted: reactive (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new ReactiveDefenderPolicy(1), observe: 1 },
  // a real negative: fixed posts, so it CANNOT answer pressure (the site bots converge on the armed site, which is
  // itself a rotation — that is why they read 38% and are not a negative control)
  { label: 'scripted: posts (−)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new PostHolderPolicy(holdPosts), observe: 1 },
  // ⛔ CLOSED 2026-09-15: precision failed twice (a pressure-blind timed rotator reads 39%, the genuinely reactive
  // defender 5%) — this definition measures "how often do you cross the midline", not a response to pressure.
  ...(flags.has('precision') || !reopened('rotate') ? [] : rows.filter((r) => !r.label.startsWith('scripted'))),
];

/** Record where the defenders stood and which site the attackers massed on, tick by tick. */
function playRotate(row: Row, seed: number, attackers: 0 | 1, matchIndex: number): RotateTrace | null {
  const defender: 0 | 1 = attackers === 0 ? 1 : 0;
  if (defender !== row.observe) return null;             // only the matches where this colour defends
  const w = new World(row.sim, row.map, seed, { attackers });
  const scriptedRow = row.label.startsWith('scripted');
  const attackPolicy = scriptedRow ? ROTATE_ATTACKS[matchIndex % ROTATE_ATTACKS.length]() : null;
  const red = attackPolicy && attackers === 0 ? attackPolicy : row.red();
  const blue = attackPolicy && attackers === 1 ? attackPolicy : row.blue();
  const T = row.sim.teamSize;
  const base = defender === 0 ? 0 : T;
  const trace: RotateTrace = { defenders: [], hot: [], sites: row.map.sites.map((s) => ({ x: s.x, z: s.z })) };
  while (!w.done) {
    stepMatch(w, red, blue);
    trace.defenders.push(Array.from({ length: T }, (_, k) => ({ x: w.agents[base + k].x, z: w.agents[base + k].z })));
    const near = row.map.sites.map(() => 0);
    for (const a of w.agents) {
      if (!a.alive || a.team !== attackers) continue;
      row.map.sites.forEach((s, i) => { if (Math.hypot(a.x - s.x, a.z - s.z) <= PRESSURE_R) near[i]++; });
    }
    const top = Math.max(...near);
    const winners = near.filter((v) => v === top).length;
    trace.hot.push(top > 0 && winners === 1 ? near.indexOf(top) : -1);
  }
  return trace;
}

console.log('\n⛔ rotate detector CLOSED 2026-09-15 (precision FAIL, runs/g2-rotate-predictions.txt): champion rows are not printed.');
console.log(`rotate detector — pressure = attackers within ${PRESSURE_R}m; a defender that starts nearer the COLD site and is nearer`);
console.log(`the HOT one within ${(HORIZON * scriptedSim.dt).toFixed(0)}s has rotated. null = the same movement scored against ANOTHER match's pressure timeline`);
console.log(`${padr('observed team', 24)}${pad('chances', 9)}${pad('rotations', 10)}${pad('rate', 7)}${pad('null', 7)}${pad('x null', 7)}${pad('median lag', 11)}${pad('first (replay anchor)', 26)}`);

for (const row of rotateRows) {
  const traces: { seed: number; attackers: 0 | 1; trace: RotateTrace }[] = [];
  for (let m = 0; m < N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      const trace = playRotate(row, seed, attackers, m);
      if (trace) traces.push({ seed, attackers, trace });
    }
  }
  const acc = { opportunities: 0, rotations: 0, lags: [] as number[] };
  const nullAcc = { opportunities: 0, rotations: 0 };
  type Anchor = { seed: number; attackers: 0 | 1; tick: number };
  let anchor: Anchor | null = null;
  traces.forEach((t, i) => {
    const real: RotateStats = rotateStats(t.trace, t.trace, STEP, HORIZON, row.sim.dt);
    acc.opportunities += real.opportunities;
    acc.rotations += real.rotations;
    acc.lags.push(...real.lags);
    if (anchor === null && real.firstAt !== null) anchor = { seed: t.seed, attackers: t.attackers, tick: real.firstAt };
    // the null: this match's real movement, the NEXT match's pressure
    const other = traces[(i + 1) % traces.length];
    if (other !== t) {
      const fake = rotateStats(t.trace, other.trace, STEP, HORIZON, row.sim.dt);
      nullAcc.opportunities += fake.opportunities;
      nullAcc.rotations += fake.rotations;
    }
  });
  acc.lags.sort((a, b) => a - b);
  const rate = acc.opportunities ? acc.rotations / acc.opportunities : NaN;
  const nul = nullAcc.opportunities ? nullAcc.rotations / nullAcc.opportunities : NaN;
  console.log(`${padr(row.label, 24)}${pad(String(acc.opportunities), 9)}${pad(String(acc.rotations), 10)}`
    + `${pad(Number.isNaN(rate) ? 'n/a' : pct(rate), 7)}${pad(Number.isNaN(nul) ? 'n/a' : pct(nul), 7)}`
    + `${pad(nul > 0 ? (rate / nul).toFixed(2) : '—', 7)}${pad(acc.lags.length ? `${median(acc.lags).toFixed(2)}s` : '—', 11)}`
    + `${pad(anchorOf(anchor), 26)}`);
}

/* ------------------------------------------------------------------ man-disadvantage tempo (clutch) */

/**
 * How long a player must spend in a state for its mean speed to count. The prediction file froze 2 s; the world
 * says that is ~7x too long (addendum, 2026-09-15): per-player DOWN phases run p50 = 4 ticks, and in the mutual-rush
 * control NO player ever reaches 30 — rounds here end ~1.4 s after the head count breaks. 8 ticks is read off that
 * distribution (just above its p50), ⛔ not tuned against the verdict: the P1 thresholds below are untouched.
 */
const MIN_STATE_TICKS = 8;
/** P1 thresholds, frozen in the same file before anything was implemented — ⛔ do not tune after reading the rows */
const P1_CLUTCH_DID = -0.5;
const P1_CONTROL_DID = 0.3;
const P1_RATIO = 4;
const P1_MIN_PAIRED = 50;

/** the man-disadvantage phase is short and rare, so this section needs its own, larger match count */
const TEMPO_N = num('tempo-n', 40);

const tempoRows: Row[] = [
  // (+) the same site attacker as the (c) row, plus ONE thing: it stops moving while its team is down a man
  { label: 'scripted: clutch (+)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new ClutchSlowPolicy(0), observe: 1 },
  // (−) patrols between the sites forever: never reads the head count, and never arrives and stops either
  { label: 'scripted: metronome (−)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new MetronomePolicy(8), observe: 1 },
  // (c) reads nothing, but arrives and stands still — its RAW slowdown is the round clock, and the null must remove it
  { label: 'scripted: arrive+stop (c)', sim: scriptedSim, map: scriptedMap, red: () => new SiteAttackerPolicy(0), blue: () => new SiteAttackerPolicy(0), observe: 1 },
  // ⛔ CLOSED 2026-09-15: see the banner below — the between-match null cannot separate "down a man" from "late in
  // the round" in this world, so the champion rows would be unreadable even if they were printed.
  ...(flags.has('precision') || !reopened('tempo') ? [] : rows.filter((r) => !r.label.startsWith('scripted'))),
];

/** Record how fast each observed player moved and the head count it was playing under, tick by tick. */
function playTempo(row: Row, seed: number, attackers: 0 | 1): TempoTrace {
  const w = new World(row.sim, row.map, seed, { attackers });
  const red = row.red();
  const blue = row.blue();
  const T = row.sim.teamSize;
  const base = row.observe === 0 ? 0 : T;
  const enemy: 0 | 1 = row.observe === 0 ? 1 : 0;
  const trace: TempoTrace = { speed: [], delta: [] };
  while (!w.done) {
    stepMatch(w, red, blue);
    trace.speed.push(Array.from({ length: T }, (_, k) => {
      const a = w.agents[base + k];
      return a.alive ? Math.hypot(a.vx, a.vz) : NaN;   // NaN, not 0: a corpse has no tempo, it is not a slow player
    }));
    trace.delta.push(w.aliveCount[row.observe] - w.aliveCount[enemy]);
  }
  return trace;
}

/**
 * How much of the donor timeline is actually a DIFFERENT timeline. `agree` = share of ticks labelled the same,
 * `jaccard` = overlap of the DOWN ticks themselves. ⭐ A permutation null is only a null to the extent these are
 * low: if the head count is a function of the round clock, another match's head count is this match's head count
 * (GOTCHAS #35), and the null quietly subtracts the very effect it is supposed to test.
 */
const donorOverlap = (a: number[], b: number[]): { agree: number; jaccard: number } => {
  const T = Math.min(a.length, b.length);
  let same = 0;
  let both = 0;
  let either = 0;
  for (let t = 0; t < T; t++) {
    const x = Math.sign(a[t]);
    const y = Math.sign(b[t]);
    if (x === y) same++;
    if (x < 0 || y < 0) either++;
    if (x < 0 && y < 0) both++;
  }
  return { agree: T ? same / T : 1, jaccard: either ? both / either : 1 };
};

const sgn = (x: number) => (Number.isNaN(x) ? '   n/a' : `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(2)}`);
const pm = (s: { mean: number; se: number }) => `${sgn(s.mean)} ± ${s.se.toFixed(2)}`;

console.log('\n⛔ tempo detector CLOSED 2026-09-15 (precision FAIL, runs/g2-tempo-predictions.txt addendum): champion rows are not printed.');
console.log('   why: in this world the head count is nearly a function of the round clock (first man down at tick 68 ± 15,');
console.log('   and only 2-4 of ~26 one-second bins hold both states), so ANOTHER match\'s head count is this match\'s head');
console.log('   count — the null eats 88% of an effect that is causal by construction. A real answer needs a within-match');
console.log('   fork/intervention (G4c), ⛔ not a permutation. See the `donor agree/∩` column: 95%/94% on the negative row.');
console.log(`tempo detector — speed (m/s) while DOWN a man vs while EVEN, per player, paired (>= ${MIN_STATE_TICKS} ticks in each state, ${TEMPO_N} seeds x 2 roles);`);
console.log("null = the same speeds scored against ANOTHER match's head-count timeline, because being down a man and");
console.log('standing still both happen LATE in a round. HEADLINE = DiD (real − null), per player, mean ± SE');
console.log(`${padr('observed team', 24)}${pad('paired', 8)}${pad('raw down-even', 16)}${pad('null', 16)}${pad('DiD (headline)', 16)}${pad('up-even', 9)}${pad('down/even ticks', 17)}${pad('donor agree/∩', 14)}${pad('dead donor', 12)}${pad('first down (anchor)', 26)}`);

const tempoDiD = new Map<string, { mean: number; se: number; n: number }>();
for (const row of tempoRows) {
  const traces: { seed: number; attackers: 0 | 1; trace: TempoTrace }[] = [];
  for (let m = 0; m < TEMPO_N; m++) {
    for (const attackers of [0, 1] as const) {
      const seed = hashSeed(31337, m);
      traces.push({ seed, attackers, trace: playTempo(row, seed, attackers) });
    }
  }
  const raw: number[] = [];
  const nul: number[] = [];
  let sameDonor = 0;
  const agree: number[] = [];
  const jacc: number[] = [];
  const did: number[] = [];
  const upv: number[] = [];
  let downTicks = 0;
  let evenTicks = 0;
  type Anchor = { seed: number; attackers: 0 | 1; tick: number };
  let anchor: Anchor | null = null;
  /**
   * The donor for the null: ANOTHER world seed, whose match is at least as long as this one and otherwise as close
   * in length as possible. Two things this guards, both learned the hard way in the first two precision runs:
   *   - the two role assignments of the same seed can carry a bit-identical head-count timeline, and a donor that
   *     changes nothing reads DiD = 0.00 ± 0.00 for every player;
   *   - a SHORTER donor truncates the trace to its own length, so the null is scored on the early, fast part of the
   *     match only — the same "both traces must be the same match length" requirement rotateStats documents.
   */
  const donorFor = (i: number): number => {
    const len = traces[i].trace.delta.length;
    let best = -1;
    for (let j = 0; j < traces.length; j++) {
      if (traces[j].seed === traces[i].seed) continue;
      const lj = traces[j].trace.delta.length;
      if (lj < len) continue;
      if (best < 0 || lj < traces[best].trace.delta.length) best = j;
    }
    return best;
  };
  traces.forEach((t, i) => {
    const d = donorFor(i);
    const other = d < 0 ? t : traces[d];
    const ov = donorOverlap(t.trace.delta, other.trace.delta);
    const same = d < 0 || ov.agree >= 1;
    if (same) sameDonor++;
    else { agree.push(ov.agree); jacc.push(ov.jaccard); }
    const real = tempoPairs(t.trace, t.trace.delta, MIN_STATE_TICKS);
    const fake = same ? null : tempoPairs(t.trace, other.trace.delta, MIN_STATE_TICKS);
    if (anchor === null) {
      const d = t.trace.delta.findIndex((v) => v < 0);
      if (d >= 0) anchor = { seed: t.seed, attackers: t.attackers, tick: d };
    }
    real.forEach((p, k) => {
      downTicks += p.downTicks;
      evenTicks += p.evenTicks;
      const realOk = !Number.isNaN(p.down) && !Number.isNaN(p.even);
      if (realOk) raw.push(p.down - p.even);
      if (!Number.isNaN(p.up) && !Number.isNaN(p.even)) upv.push(p.up - p.even);
      const f = fake?.[k];
      if (!f || Number.isNaN(f.down) || Number.isNaN(f.even)) return;
      nul.push(f.down - f.even);
      if (realOk) did.push(p.down - p.even - (f.down - f.even));
    });
  });
  const dd = meanSE(did);
  tempoDiD.set(row.label, dd);
  console.log(`${padr(row.label, 24)}${pad(String(dd.n), 8)}${pad(pm(meanSE(raw)), 16)}${pad(pm(meanSE(nul)), 16)}`
    + `${pad(pm(dd), 16)}${pad(sgn(meanSE(upv).mean), 9)}${pad(`${downTicks}/${evenTicks}`, 17)}${pad(`${pct(meanSE(agree).mean)}/${pct(meanSE(jacc).mean)}`, 14)}${pad(`${sameDonor}/${traces.length}`, 12)}${pad(anchorOf(anchor), 26)}`);
}

// the gate prints its own verdict against the thresholds frozen BEFORE the run, so "precision passed" is not a
// judgement call made after seeing the table (GOTCHAS #26: prove the tool reached the assertion)
const plus = tempoDiD.get('scripted: clutch (+)')!;
const minus = tempoDiD.get('scripted: metronome (−)')!;
const conf = tempoDiD.get('scripted: arrive+stop (c)')!;
const worstControl = Math.max(Math.abs(minus.mean), Math.abs(conf.mean));
const checks: [string, boolean][] = [
  [`a. clutch DiD ${plus.mean.toFixed(2)} <= ${P1_CLUTCH_DID} and |DiD| >= 3 SE (${(3 * plus.se).toFixed(2)})`, plus.mean <= P1_CLUTCH_DID && Math.abs(plus.mean) >= 3 * plus.se],
  [`b. both controls |DiD| <= ${P1_CONTROL_DID} (metronome ${Math.abs(minus.mean).toFixed(2)}, arrive+stop ${Math.abs(conf.mean).toFixed(2)})`, worstControl <= P1_CONTROL_DID],
  [`c. |clutch DiD| >= ${P1_RATIO}x the worst control (${(P1_RATIO * worstControl).toFixed(2)})`, Math.abs(plus.mean) >= P1_RATIO * worstControl],
  [`d. every scripted row >= ${P1_MIN_PAIRED} paired players`, [plus, minus, conf].every((s) => s.n >= P1_MIN_PAIRED)],
];
console.log('\nP1 precision gate (thresholds frozen in runs/g2-tempo-predictions.txt):');
for (const [text, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${text}`);
console.log(`  => ${checks.every((c) => c[1]) ? 'PASS — the champion rows may be read (description only)' : 'FAIL — ⛔ the champion rows must NOT be read; fix the definition or close the detector'}`);

console.log('\n⚠ this is FORM, not intent: two players shooting the same enemy produce the same shape (VISION §12.1 needs');
console.log('   birth / stability / intervention before any "they learned to trade"). ⛔ detector output never enters training.');
