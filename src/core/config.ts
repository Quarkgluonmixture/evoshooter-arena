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
  turnRate: number;         // rad/s while engaging a chosen target (flick onto the shot)
  scanTurnRate: number;     // rad/s while nobody is being engaged (a head sweeps, it does not teleport)
  lookSmoothSeconds: number;// low-pass on the look action, so per-tick network noise cannot snap the head
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
  memorySeconds: number;    // how long a player's own contact memory persists
  perceptBearingError: number;   // worst-case angular error of a visual contact (rad); also the quantisation step
  perceptRangeError: number;     // worst-case relative range error of a visual contact; also the quantisation step
  perceptBucketSeconds: number;  // how long one perception error persists before it is redrawn
  audioSectors: number;     // head-relative sectors of the hearing channel (hearing is omnidirectional)
  audioRange: number;        // distance at which a sound has faded to nothing
  audioOcclusion: number;    // multiplier applied to a sound that has to pass through geometry
  audioDecaySeconds: number; // how fast the heard loudness fades once the source stops
  footstepGain: number;      // loudness of a full-speed run
  gunshotGain: number;       // loudness of one round leaving a barrel
  lidarRays: number;        // structured rays inside the field of view, densest at the crosshair
  geomRangeError: number;   // relative error/quantisation of a wall-distance reading
  geomFovDeg: number;       // angular span of the geometry rays: wider than enemy recognition, still not behind
  lidarRange: number;
  enemySlots: number;
  mateSlots: number;
  commDim: number;
  /**
   * Width of the player's own recurrent state (ROADMAP D1 / SUBSTRATE V6b). 0 = feed-forward brain, the
   * shipped baseline. When > 0 the previous tick's first-hidden-layer activations are fed back in as extra
   * inputs, so the brain can carry belief across ticks instead of the world holding a perfect record for it.
   * Must not exceed `hidden[0]`. The state lives on the World, never on the policy, so it is reset with the
   * match — a policy object is cached and reused across matches, and state on it would leak between them.
   */
  recurrentDim: number;
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
  turnRate: Math.PI * 2,
  scanTurnRate: 2.6,
  lookSmoothSeconds: 0.45,
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
  perceptBearingError: 0.12,
  perceptRangeError: 0.25,
  perceptBucketSeconds: 0.4,
  audioSectors: 4,
  audioRange: 28,
  audioOcclusion: 0.45,
  audioDecaySeconds: 0.35,
  footstepGain: 0.6,
  gunshotGain: 1,
  lidarRays: 13,
  geomRangeError: 0.08,
  geomFovDeg: 180,
  lidarRange: 15,
  enemySlots: 3,
  mateSlots: 4,
  commDim: 2,
  recurrentDim: 0,
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
