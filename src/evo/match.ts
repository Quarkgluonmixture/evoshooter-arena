import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from '../sim/map.ts';
import { World, type TeamStats } from '../sim/world.ts';
import type { Policy } from '../brain/policy.ts';

/** Human-readable behaviour metrics for one team in one match (all plain numbers → chartable). */
export interface TeamMetrics {
  zoneScore: number;
  kills: number;
  deaths: number;
  survivors: number;
  damageDealt: number;
  damageTaken: number;
  shots: number;
  accuracy: number;      // hits / shots
  zoneShare: number;     // fraction of alive agent-ticks spent inside the zone
  coverRatio: number;    // fraction of threatened ticks spent out of the nearest threat's sight
  spread: number;        // mean pairwise distance between living teammates
  engageDist: number;    // mean distance of fired shots
  flankRate: number;     // hits landed on targets facing away
  aimUsage: number;      // fraction of ticks in aim mode
  moveFraction: number;  // fraction of ticks moving
  commActivity: number;  // std-dev of the comm channel across agents and time
  firstContact: number;  // seconds until the first shot (matchSeconds if none)
  sightTicks: number;    // (my agent, enemy) pairs in sight, summed over ticks — 0 = the teams never met
  objectiveProgress: number; // 0..1 of this team's own objective: zone-point share (koth) or capture/defuse (capture)
  reloads: number;
}

export const METRIC_KEYS = [
  'zoneScore', 'kills', 'deaths', 'survivors', 'damageDealt', 'damageTaken', 'shots', 'accuracy', 'zoneShare',
  'coverRatio', 'spread', 'engageDist', 'flankRate', 'aimUsage', 'moveFraction', 'commActivity', 'firstContact', 'sightTicks', 'objectiveProgress', 'reloads',
] as const satisfies readonly (keyof TeamMetrics)[];

export interface MatchResult {
  winner: -1 | 0 | 1;
  score: [number, number];
  fitness: [number, number];
  metrics: [TeamMetrics, TeamMetrics];
  ticks: number;
  heat: [Float32Array, Float32Array] | null;
}

export function deriveMetrics(st: TeamStats, world: World, team: 0 | 1): TeamMetrics {
  const cfg = world.cfg;
  let commVar = 0;
  if (st.commN > 0) {
    for (let c = 0; c < cfg.commDim; c++) {
      const mean = st.commSum[c] / st.commN;
      commVar += Math.max(0, st.commSq[c] / st.commN - mean * mean);
    }
    commVar /= cfg.commDim;
  }
  return {
    zoneScore: world.score[team],
    kills: st.kills,
    deaths: st.deaths,
    survivors: world.aliveCount[team],
    damageDealt: st.damageDealt,
    damageTaken: st.damageTaken,
    shots: st.shots,
    accuracy: st.shots > 0 ? st.hits / st.shots : 0,
    zoneShare: st.aliveAgentTicks > 0 ? st.zoneAgentTicks / st.aliveAgentTicks : 0,
    coverRatio: st.threatTicks > 0 ? st.coverTicks / st.threatTicks : 0,
    spread: st.spreadTicks > 0 ? st.spreadSum / st.spreadTicks : 0,
    engageDist: st.shots > 0 ? st.engageDistSum / st.shots : 0,
    flankRate: st.hits > 0 ? st.flankHits / st.hits : 0,
    aimUsage: st.aliveAgentTicks > 0 ? st.aimTicks / st.aliveAgentTicks : 0,
    moveFraction: st.aliveAgentTicks > 0 ? st.moveTicks / st.aliveAgentTicks : 0,
    commActivity: Math.sqrt(commVar),
    firstContact: st.firstContactT < 0 ? cfg.matchSeconds : st.firstContactT,
    sightTicks: st.sightTicks,
    objectiveProgress: cfg.roundMode === 'capture'
      ? (team === world.attackers ? Math.max(world.capture, world.armed ? 1 : 0) : world.defuse)
      : Math.min(1, world.score[team] / (cfg.matchSeconds * cfg.zonePointsPerSecond)),
    reloads: st.reloads,
  };
}

/**
 * Fitness = zone margin (the objective) + damage margin + zone-presence margin (both are shaping so early
 * generations get a gradient, and so "everyone hides" scores below "at least contest the zone")
 * + a bonus for wiping / penalty for being wiped. Zero-sum: red fitness = -blue fitness.
 */
export function fitnessOf(world: World, team: 0 | 1): number {
  const cfg = world.cfg;
  const other = team === 0 ? 1 : 0;
  if (cfg.roundMode === 'capture') return captureFitness(world, team);
  const maxScore = cfg.matchSeconds * cfg.zonePointsPerSecond;
  const zone = (world.score[team] - world.score[other]) / maxScore;
  const st = world.stats[team];
  const so = world.stats[other];
  const dmg = (st.damageDealt - st.damageTaken) / (cfg.teamSize * cfg.hp);
  const share = (s: TeamStats) => (s.aliveAgentTicks > 0 ? s.zoneAgentTicks / s.aliveAgentTicks : 0);
  const presence = share(st) - share(so);
  let elim = 0;
  if (world.aliveCount[other] === 0) elim += 0.3;
  if (world.aliveCount[team] === 0) elim -= 0.3;
  return zone + 0.5 * dmg + 0.2 * presence + elim;
}

/**
 * ROADMAP C1a fitness. The round is decided by rule, so the outcome carries it; the only shaping is that an
 * attack that nearly armed the site scores above one that never touched it, which is the cold-start problem
 * VISION §10 allows shaping for. Zero-sum by construction: it is one attacker-side number, negated.
 * ⚠ The damage term is kept at the koth value for now. It is the term measured to be out of compliance with
 * VISION §10 (never overridden by results), and re-deciding it is its own lever, not a rider on this one.
 */
function captureFitness(world: World, team: 0 | 1): number {
  const cfg = world.cfg;
  const atk = world.attackers;
  const progress = Math.max(world.capture, world.armed ? 1 : 0);
  const attackerObjective = world.winner === atk ? 1 : -1 + 0.6 * progress;
  const objective = team === atk ? attackerObjective : -attackerObjective;
  const st = world.stats[team];
  const dmg = (st.damageDealt - st.damageTaken) / (cfg.teamSize * cfg.hp);
  return objective + 0.5 * dmg;
}

export function summarize(world: World): MatchResult {
  return {
    winner: world.winner,
    score: [world.score[0], world.score[1]],
    fitness: [fitnessOf(world, 0), fitnessOf(world, 1)],
    metrics: [deriveMetrics(world.stats[0], world, 0), deriveMetrics(world.stats[1], world, 1)],
    ticks: world.tick,
    heat: world.heat,
  };
}

/** Advance one tick with the given policies (used by both the trainer and the live viewer). */
export function stepMatch(world: World, red: Policy, blue: Policy): void {
  world.observe();
  for (let i = 0; i < world.n; i++) {
    if (!world.agents[i].alive) continue;
    (world.agents[i].team === 0 ? red : blue).act(world, i);
  }
  world.step();
}

export function runMatch(
  red: Policy,
  blue: Policy,
  map: ArenaMap,
  seed: number,
  cfg: SimConfig,
  opts: { heat?: boolean } = {},
): MatchResult {
  const world = new World(cfg, map, seed, opts);
  while (!world.done) stepMatch(world, red, blue);
  return summarize(world);
}

export function meanMetrics(list: TeamMetrics[]): TeamMetrics {
  const out = {} as Record<keyof TeamMetrics, number>;
  for (const k of METRIC_KEYS) {
    let s = 0;
    for (const m of list) s += m[k];
    out[k] = list.length ? s / list.length : 0;
  }
  return out as TeamMetrics;
}
