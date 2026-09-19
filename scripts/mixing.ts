/**
 * ROADMAP E2b — the world pays for a MIXED plan; can the substrate express one?
 *
 *   node scripts/mixing.ts runs/a.json [runs/b.json ...] [--gen G] [--maps 7,11] [--n 32] [--k 6] [--t 6]
 *
 * Every demand probe in this repo so far asked what the world pays for, and every one read low — memory (D1),
 * a finite radio (D2c), player-shaped roles (E1), round-start agreement (E2). E2's table has the single
 * exception: solved as a zero-sum game, the defender's equilibrium MIXES (stack 68 % / change plan 32 %) and is
 * worth 41.5 %, while the best pure play is worth 27 % in its worst case. The world pays +14.5 pp for being
 * unpredictable. This script asks the supply side: does an evolved team's round plan vary at all?
 *
 * Read from the source before measuring (premise, not finding): `World`'s rng is consumed in exactly two
 * places — the hit roll and a tracer endpoint — spawns come from the map, and perception jitter is a pure hash
 * of (slot-derived key, time bucket), so it never reads the match seed. The measurement puts a number on what
 * that costs in the decision variable, and — the part the source cannot answer — checks whether a different
 * OPPONENT moves the plan instead.
 *
 * The plan statistic: at t = T seconds, which site each of the team's five players is nearest to, as a
 * 5-tuple. Entropy is taken over that tuple inside one (row, arm, map, role) cell, so it never compares a red
 * tuple with a blue one — which also makes it invariant to each team's own site ordering (GOTCHAS #17), and
 * never averages two maps into one behaviour claim (GOTCHAS #40). Reference point: the E2 equilibrium
 * mixture, 68/32, is 0.904 bits.
 *
 * Arms, each with its own denominator printed:
 *   A own dice   same opponent, same map, N match seeds — the only die in the world is the hit roll;
 *   B opponents  same map, same match seed, K opponents drawn from the other colour's hall of fame;
 *   C maps       same opponent, same match seed, across the listed maps (reported separately: it is not
 *                mixing, it is the map, and it is here so the other two arms have something to be small
 *                against).
 *
 * Controls (GOTCHAS #26 — prove the instrument reaches the assertion before reading a champion): a fixed 3/2
 * hand-written defence must read 0.000 bits under `own dice`, and one that ALTERNATES its plan by match index
 * must read exactly 1.000. ⭐ The gate alternates rather than flips a coin on purpose: a fair coin's own
 * entropy is a random variable (a 22/10 window reads 0.896), so gating on it would fail a working instrument
 * one time in ten. The coin rows are still printed — they are what a real mixed strategy reads like here.
 *
 * ⛔ Zero bits does not mean the champion is weak: a pure strategy is fine when the opponent cannot find the
 * best response (`npm run exploit` cracked one target in four). ⛔ One statistic, these maps, this lineage.
 * ⛔ Nothing here authorises construction; reference bots never enter a training pool (CLAUDE.md).
 * Pre-registration: predictions/e2b-mixing-predictions.txt.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { Rng, hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { PacifistRusherPolicy, SiteDefenderPolicy } from '../src/brain/scripted.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 32);
const K = num('k', 6);
const T = num('t', 6);
const MAPS = (flags.get('maps') ?? '7,11').split(',').map(Number);
if (!files.length) throw new Error('need at least one run file');

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

/** The mixture the E2 table says this world pays for: two plans at 68/32. */
const EQUILIBRIUM_BITS = -(0.68 * Math.log2(0.68) + 0.32 * Math.log2(0.32));

const nearestSite = (map: ArenaMap, x: number, z: number): number => {
  let best = 0;
  let bestD = Infinity;
  map.sites.forEach((s, i) => {
    const d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
};
/** The team's plan: which site each slot is nearest to at this instant, in slot order. */
const planOf = (world: World, team: 0 | 1): string => {
  const per: number[] = [];
  for (const a of world.agents) if (a.team === team) per[a.slot] = nearestSite(world.map, a.x, a.z);
  return per.join('');
};
const entropy = (plans: string[]): number => {
  const counts = new Map<string, number>();
  for (const p of plans) counts.set(p, (counts.get(p) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) { const p = c / plans.length; h -= p * Math.log2(p); }
  return h;
};
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

interface Obs { plan: string; tPlan: number; alive: number; firstShot: number }
/** One whole match; the plan is sampled at T, and the round is played out so the guards mean something. */
function observe(cfg: SimConfig, map: ArenaMap, seed: number, red: Policy, blue: Policy, attackers: 0 | 1, team: 0 | 1): Obs {
  const world = new World(cfg, map, seed, { attackers });
  const tickT = Math.round(T / cfg.dt);
  let last = planOf(world, team);
  let tPlan = 0;
  let alive = cfg.teamSize;
  while (!world.done) {
    stepMatch(world, red, blue);
    if (world.tick > tickT) continue;
    const now = planOf(world, team);
    if (now !== last) { tPlan = world.tick * cfg.dt; last = now; }
    alive = world.agents.filter((a) => a.team === team && a.alive).length;
  }
  const st = summarize(world);
  return { plan: last, tPlan, alive, firstShot: Math.min(st.metrics[0].firstContact, st.metrics[1].firstContact) };
}

/** First moment at which two runs of the SAME policies under different match seeds hold different state. */
function divergenceSeconds(cfg: SimConfig, map: ArenaMap, sa: number, sb: number, red: Policy, blue: Policy, attackers: 0 | 1): number {
  const a = new World(cfg, map, sa, { attackers });
  const b = new World(cfg, map, sb, { attackers });
  while (!a.done && !b.done) {
    stepMatch(a, red, blue);
    stepMatch(b, red, blue);
    for (let i = 0; i < a.n; i++) {
      if (a.agents[i].x !== b.agents[i].x || a.agents[i].z !== b.agents[i].z || a.agents[i].hp !== b.agents[i].hp) {
        return a.tick * cfg.dt;
      }
    }
  }
  return a.t;
}

const SPLIT = [0, 0, 0, 1, 1];
const teamCoin = (seed: number): number[] => (new Rng(seed).int(2) === 0 ? SPLIT : SPLIT.map((s) => 1 - s));
const independentCoins = (seed: number): number[] => { const r = new Rng(seed); return SPLIT.map(() => (r.int(5) < 3 ? 0 : 1)); };

interface Foe { name: string; make: () => Policy }
interface Row {
  name: string;
  team: 0 | 1;
  /** the team under measurement; the controls redraw their whole plan from the match seed or its index */
  make: (seed: number, index: number) => Policy;
  foes: Foe[];
  sim: SimConfig;
  control?: boolean;
}

const rows: Row[] = [];
for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  if (data.scaffold) throw new Error(`${path} is a scaffold run — ⛔ not a population source`);
  const { sim } = normalizeSim(data.sim);
  const shape = shapeFor(sim, data.evo.hidden);
  const tag = basename(path).replace(/\.json$/, '');
  for (const colour of [0, 1] as const) {
    const mine = data.hof[colour];
    const theirs = data.hof[colour === 0 ? 1 : 0];
    const pick = (flags.has('gen') ? mine.find((e) => e.gen === num('gen', 0)) : undefined) ?? mine[mine.length - 1];
    const me = new NeuralPolicy(shape, Float32Array.from(pick.genome));
    // K opponents spread over the other colour's history: different brains, identical rules
    const step = Math.max(1, Math.floor(theirs.length / K));
    const foes: Foe[] = theirs.filter((_, i) => i % step === 0).slice(-K)
      .map((e) => ({ name: `g${e.gen}`, make: () => new NeuralPolicy(shape, Float32Array.from(e.genome)) as Policy }));
    rows.push({ name: `${tag}:${colour === 0 ? 'R' : 'B'}@${pick.gen}`, team: colour, make: () => me, foes, sim });
  }
}
const simRef = rows[0].sim;
// ⚠ The controls' opponent does not shoot. Their job is to prove the statistic can SEE a plan change; a
// hand attacker that trades kills at 2 s would have the control's tuple read after casualties, which is the
// one thing the guard below forbids in a champion cell.
const handFoe: Foe[] = [{ name: 'pacifist rush', make: () => new PacifistRusherPolicy() as Policy }];
rows.push(
  // ⭐ The gate is the ALTERNATING row, not the coin: a detectability check must not import the sampling
  // noise of a fair coin. Alternating by match index is exactly 50/50 by construction ⇒ exactly 1.000 bits,
  // so a reading below that is the instrument's fault and nothing else. The coin rows stay, reported but
  // not gating, because they are what a real mixed strategy looks like at this sample size.
  { name: 'ctl fixed 3/2', team: 1, make: () => new SiteDefenderPolicy(SPLIT), foes: handFoe, sim: simRef, control: true },
  { name: 'ctl alternating', team: 1, make: (_s, i) => new SiteDefenderPolicy(i % 2 === 0 ? SPLIT : SPLIT.map((x) => 1 - x)), foes: handFoe, sim: simRef, control: true },
  { name: 'ctl team coin', team: 1, make: (s) => new SiteDefenderPolicy(teamCoin(s)), foes: handFoe, sim: simRef, control: true },
  { name: 'ctl own coins', team: 1, make: (s) => new SiteDefenderPolicy(independentCoins(s)), foes: handFoe, sim: simRef, control: true },
);

const maps = new Map<number, ArenaMap>(MAPS.map((s) => [s, generateMap(s, simRef)]));
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const bits = (x: number) => x.toFixed(3);

console.log(`mixing — does the round plan vary? · plan = which site each slot is nearest to at t=${T}s (5-tuple)`);
console.log(`own-dice n=${N} seeds · opponents k=${K} brains · maps ${MAPS.join(',')} · what the world pays for is a ${bits(EQUILIBRIUM_BITS)}-bit mixture (68/32)\n`);
console.log(`${padr('row', 22)}${padr('role', 5)}${pad('map', 4)}${pad('A own dice', 12)}${pad('B opponents', 13)}${pad('tPlan', 8)}${pad('tDiv', 8)}${pad('1stShot', 9)}${pad('alive5', 8)}`);

const A = new Map<string, number>();
const B = new Map<string, number>();
const C = new Map<string, number>();
/** cells where fewer than half the matches still had five players at T — a tuple read off a dying team is a
 *  casualty list, not a plan, so the summary refuses them instead of relying on the warning being noticed. */
const unguarded = new Set<string>();
const key = (row: string, role: string, map: number | string) => `${row}|${role}|${map}`;

for (const row of rows) {
  const cfg = row.sim;
  const newest = row.foes[row.foes.length - 1];
  for (const role of ['def', 'atk'] as const) {
    if (row.control && role === 'atk') continue;                  // the controls are hand-written defenders
    const attackers: 0 | 1 = role === 'atk' ? row.team : ((row.team === 0 ? 1 : 0) as 0 | 1);
    const sides = (me: Policy, foe: Policy): [Policy, Policy] => (row.team === 0 ? [me, foe] : [foe, me]);
    const fixedSeed = hashSeed(9137, MAPS[0], 0);
    const plansC: string[] = [];
    for (const mapSeed of MAPS) {
      const map = maps.get(mapSeed)!;
      // A — own dice: one map, one opponent, N match seeds
      const obsA: Obs[] = [];
      for (let m = 0; m < N; m++) {
        const seed = hashSeed(9137, mapSeed, m);
        obsA.push(observe(cfg, map, seed, ...sides(row.make(seed, m), newest.make()), attackers, row.team));
      }
      // B — opponents: one map, one match seed, K brains from the other colour's history
      const plansB = row.foes.map((f) => observe(cfg, map, fixedSeed, ...sides(row.make(fixedSeed, 0), f.make()), attackers, row.team).plan);
      // C — this map's contribution to the cross-map spread, at the fixed seed and newest opponent
      plansC.push(observe(cfg, map, fixedSeed, ...sides(row.make(fixedSeed, 0), newest.make()), attackers, row.team).plan);
      // divergence: the same pair of brains, two different match seeds, stepped in lockstep
      const tDiv = divergenceSeconds(cfg, map, hashSeed(9137, mapSeed, 0), hashSeed(9137, mapSeed, 1),
        ...sides(row.make(hashSeed(9137, mapSeed, 0), 0), newest.make()), attackers);
      const hA = entropy(obsA.map((o) => o.plan));
      const hB = entropy(plansB);
      A.set(key(row.name, role, mapSeed), hA);
      B.set(key(row.name, role, mapSeed), hB);
      const alive5 = obsA.filter((o) => o.alive === cfg.teamSize).length / obsA.length;
      console.log(`${padr(row.name, 22)}${padr(role, 5)}${pad(String(mapSeed), 4)}${pad(bits(hA), 12)}${pad(row.foes.length > 1 ? bits(hB) : '·', 13)}` +
        `${pad(`${mean(obsA.map((o) => o.tPlan)).toFixed(1)}s`, 8)}${pad(`${tDiv.toFixed(1)}s`, 8)}` +
        `${pad(`${mean(obsA.map((o) => o.firstShot)).toFixed(1)}s`, 9)}${pad(`${(alive5 * 100).toFixed(0)}%`, 8)}`);
      // GOTCHAS #13 / family B: a cell measured on a team that is already dying is a casualty list, not a plan
      if (alive5 < 0.5) unguarded.add(key(row.name, role, mapSeed));
      if (alive5 < 0.5) console.log(`  ⚠ ${row.name}/${role}/map ${mapSeed}: only ${(alive5 * 100).toFixed(0)}% of matches still had five players at t=${T}s`);
      if (alive5 < 1 && mean(obsA.map((o) => o.firstShot)) < T) console.log(`  ⚠ ${row.name}/${role}/map ${mapSeed}: the mean first shot (${mean(obsA.map((o) => o.firstShot)).toFixed(1)}s) lands before t=${T}s — the plan is being read after contact, not before`);
    }
    C.set(key(row.name, role, 'maps'), entropy(plansC));
  }
}

const champs = rows.filter((r) => !r.control).map((r) => r.name);
const cells = (m: Map<string, number>, rowsIn: string[], roles = ['def', 'atk']) =>
  rowsIn.flatMap((r) => roles.flatMap((role) => MAPS
    .filter((s) => !unguarded.has(key(r, role, s)))
    .map((s) => m.get(key(r, role, s))).filter((v): v is number => v !== undefined)));
const dropped = [...unguarded].length;

console.log('\nagainst predictions/e2b-mixing-predictions.txt:');
if (dropped) console.log(`  ⚠ ${dropped} cell(s) are left out of every line below: fewer than half their matches still had five players at t=${T}s, so the tuple there is a casualty list, not a plan`);
const gateFixed = Math.max(...cells(A, ['ctl fixed 3/2'], ['def']));
const gateAlt = Math.min(...cells(A, ['ctl alternating'], ['def']));
const gateOk = gateFixed === 0 && gateAlt === 1;
console.log(`  P5  gate: fixed 3/2 = 0.000 · alternating = 1.000        ${bits(gateFixed)} / ${bits(gateAlt)}  ${gateOk ? '✓ the champion rows may be read' : '✗ ⛔ the instrument did not reach the assertion — do not read the champion rows'}`);
console.log(`        for scale: a real coin ${bits(Math.min(...cells(A, ['ctl team coin'], ['def'])))} (its own sampling noise) · a plan drawn five times ${bits(Math.min(...cells(A, ['ctl own coins'], ['def'])))}`);
const worstA = Math.max(...cells(A, champs));
console.log(`  P1  every champion cell under own dice reads 0.000 bits  max ${bits(worstA)}  ${worstA === 0 ? '✓' : '✗'}`);
const maxB = Math.max(...cells(B, champs));
console.log(`  P3  champion entropy under opponents: > 0 and < 0.5      max ${bits(maxB)}  ${maxB > 0 && maxB < 0.5 ? '✓' : '✗'}`);
console.log(`  P4  what evolution collects vs what the world pays for   ${bits(worstA)} vs ${bits(EQUILIBRIUM_BITS)} bits`);
const cGtB = champs.filter((r) => (C.get(key(r, 'def', 'maps')) ?? 0) > mean(cells(B, [r], ['def']))).length;
console.log(`  P6  the map moves the plan more than the opponent does    ${cGtB}/${champs.length} champions, defending`);
console.log(`\narm C (cross-map, fixed seed and opponent): ${champs.map((r) => `${r} def ${bits(C.get(key(r, 'def', 'maps')) ?? NaN)}`).join(' · ')}`);
console.log('entropy is in bits inside one (row, arm, map, role) cell — never across colours and never across maps, so neither');
console.log('each team\'s own site order nor GOTCHAS #40 can get into the number.');
console.log('⛔ 0 bits does not say the champion is weak; it says this world gives it no way to be unpredictable round to round.');
