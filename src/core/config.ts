/** Simulation rules. Everything tactical must EMERGE from these affordances; nothing here scripts behaviour. */
export interface SimConfig {
  arenaHalf: number;        // arena spans [-arenaHalf, arenaHalf] on x and z
  teamSize: number;
  dt: number;               // seconds per tick
  matchSeconds: number;
  agentRadius: number;
  eyeHeight: number;
  bodyPoints: number[];     // heights sampled for line-of-sight / exposure
  maxSpeed: number;
  aimSpeedMul: number;      // speed multiplier while in aim mode
  accel: number;
  turnRate: number;         // rad/s
  fovDeg: number;
  viewRange: number;
  fireCooldown: number;
  damage: number;
  magSize: number;
  reloadSeconds: number;
  hp: number;
  baseAccuracy: number;
  settleSeconds: number;    // time to fully settle aim on a new target
  aimConeDeg: number;       // must face target within this cone to fire
  zoneRadius: number;
  zonePointsPerSecond: number;
  memorySeconds: number;    // how long team knowledge of an enemy position persists
  lidarRays: number;
  lidarRange: number;
  enemySlots: number;
  mateSlots: number;
  commDim: number;
  heatCells: number;        // heat-map grid resolution per axis
}

export const DEFAULT_SIM: SimConfig = {
  arenaHalf: 30,
  teamSize: 5,
  dt: 1 / 15,
  matchSeconds: 40,
  agentRadius: 0.5,
  eyeHeight: 1.6,
  bodyPoints: [1.55, 1.0, 0.45],
  maxSpeed: 6,
  aimSpeedMul: 0.45,
  accel: 30,
  turnRate: Math.PI * 3,
  fovDeg: 110,
  viewRange: 30,
  fireCooldown: 0.25,
  damage: 26,
  magSize: 10,
  reloadSeconds: 1.6,
  hp: 100,
  baseAccuracy: 0.85,
  settleSeconds: 0.5,
  aimConeDeg: 12,
  zoneRadius: 6,
  zonePointsPerSecond: 1,
  memorySeconds: 3,
  lidarRays: 8,
  lidarRange: 15,
  enemySlots: 3,
  mateSlots: 4,
  commDim: 2,
  heatCells: 24,
};

/** Evolution hyper-parameters. */
export interface EvoConfig {
  popSize: number;          // per team
  pairings: number;         // matches vs current opposing population per genome
  hofMatches: number;       // matches vs opposing hall of fame per genome
  hofWindow: number;        // sample opponents from the last N hall-of-fame entries
  elite: number;
  tournament: number;
  crossoverProb: number;
  mutRate: number;          // per-weight mutation probability
  mutSigma: number;
  resetProb: number;        // per-weight probability of a fresh random value
  hidden: number[];
  mapSeed: number;
  ladderGap: number;        // compare champion vs champion from N generations ago
  ladderMatches: number;
}

export const DEFAULT_EVO: EvoConfig = {
  popSize: 24,
  pairings: 3,
  hofMatches: 2,
  hofWindow: 20,
  elite: 2,
  tournament: 3,
  crossoverProb: 0.5,
  mutRate: 0.02,
  mutSigma: 0.05,
  resetProb: 0.002,
  hidden: [40, 24],
  mapSeed: 7,
  ladderGap: 10,
  ladderMatches: 8,
};

export const RED = 0;
export const BLUE = 1;
export type Team = 0 | 1;
