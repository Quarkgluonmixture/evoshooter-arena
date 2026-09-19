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
  /**
   * 'koth'    — the shipped baseline: whoever holds the zone accrues points, most points wins, and a wipe
   *             hands the survivors the remaining clock at the zone's own rate.
   * 'capture' — ROADMAP C1a: one side attacks, one defends. Attackers fill a capture meter inside the site
   *             (time cost, decays when they leave); filling it ARMS an independent countdown that keeps
   *             running after every attacker is dead; defenders standing in the site burn that countdown
   *             back down (time cost again). The round ends by rule, so nothing needs to stand in for
   *             "the survivors walk over and hold it" — the free-clock payout simply does not exist.
   */
  roundMode: 'koth' | 'capture';
  /**
   * 1 — the shipped single central zone.
   * 2 — ROADMAP C1b: two sites, placed so that the 180° rotation swaps them, which is what keeps the map
   *     side-fair with an asymmetric objective. Until C1b-2 the world still plays only site 0; this changes
   *     the MAP and what `npm run mapprobe` can measure, nothing else.
   */
  siteCount: 1 | 2;
  /** distance of each site centre from the arena centre when `siteCount` is 2 */
  siteOffset: number;
  captureSeconds: number;   // uncontested attacker occupancy needed to arm the site
  armedSeconds: number;     // countdown once armed; runs whether or not the attackers are alive
  defuseSeconds: number;    // uncontested defender occupancy needed to disarm it
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
   * ROADMAP D2 / VISION §7.2. 0 = the shipped baseline: an unbounded float per slot, rewritten every tick,
   * which is not a radio — it is a second exact-state bus. Above 0 the broadcast is quantised to
   * `2 * commTokens + 1` symbols per slot (±k/commTokens, plus 0), and 0 means SILENCE, which a player
   * chooses by keeping the output inside the dead zone. ⛔ No symbol has a preset meaning and none ever will;
   * what a symbol comes to mean is the thing D2 is trying to observe, not something to encode.
   */
  commTokens: number;
  /** a new message may only be DECIDED every N ticks; between those the last decision keeps transmitting */
  commIntervalTicks: number;
  /** teammates hear what was said this many ticks ago */
  commDelayTicks: number;
  /**
   * Width of the player's own recurrent state (ROADMAP D1 / SUBSTRATE V6b). 0 = feed-forward brain, the
   * shipped baseline. When > 0 the previous tick's first-hidden-layer activations are fed back in as extra
   * inputs, so the brain can carry belief across ticks instead of the world holding a perfect record for it.
   * Must not exceed `hidden[0]`. The state lives on the World, never on the policy, so it is reset with the
   * match — a policy object is cached and reused across matches, and state on it would leak between them.
   */
  recurrentDim: number;
  /**
   * ROADMAP E2b. Width of each player's PRIVATE DIE: k numbers in [-1, 1) drawn once per round from a pure
   * hash of (team, slot, match seed), visible to that player alone and constant for the round. 0 = the
   * shipped baseline, which has no die at all.
   *
   * E2b measured why this exists. The world's only randomness is the hit roll, spawns come from the map and
   * perception jitter is a pure hash of (slot, time bucket), so against a given opponent a policy replays
   * the same round every time: four champions, two maps, both roles, 32 seeds each read EXACTLY 0.000 bits
   * of plan entropy, while the equilibrium this world pays 14.5 pp for is a 0.904-bit mixture. A control
   * that alternates its plan reads 1.000 bits on the same instrument, so the world can carry a mixed plan —
   * it just cannot generate one for a policy whose inputs are identical every round.
   *
   * ⛔ The die encodes nothing. It is not a percept, carries no world truth, and no teammate or enemy can
   * read it (`A1-P27`). Whether evolution finds a use for it is the open question, not a premise.
   */
  privateDieDim: number;
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
  roundMode: 'koth',
  siteCount: 1,
  siteOffset: 12,
  captureSeconds: 3,
  armedSeconds: 15,
  defuseSeconds: 5,
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
  commTokens: 0,
  commIntervalTicks: 1,
  commDelayTicks: 0,
  recurrentDim: 0,
  privateDieDim: 0,
  heatCells: 24,
};

/**
 * SimConfig fields that change the BRAIN's interface but not the world itself. Two runs that differ only in
 * these are still playing the same game, so a hand-written bot's win share against each is comparable
 * (`scripts/yardstick.ts`). `tests/world.test.ts` checks that claim mechanically: perturbing any key listed
 * here must leave a scripted-bot match bit-identical. ⛔ Adding a key that reaches the world breaks the one
 * comparison that survives a phase boundary.
 */
export const BRAIN_ONLY_FIELDS: (keyof SimConfig)[] = ['recurrentDim', 'memorySeconds', 'privateDieDim'];

/**
 * Fill in fields a saved run predates. A run exported before `recurrentDim` existed has `undefined` there,
 * and `obsDim(cfg) + undefined` is NaN — which surfaced as a genome-length mismatch rather than as a
 * missing field. Returns the names it had to default so a script can say so out loud instead of pretending
 * the old run was configured that way.
 */
export function normalizeSim(saved: Partial<SimConfig>): { sim: SimConfig; defaulted: (keyof SimConfig)[] } {
  const defaulted = (Object.keys(DEFAULT_SIM) as (keyof SimConfig)[]).filter((k) => saved[k] === undefined);
  return { sim: { ...DEFAULT_SIM, ...saved }, defaulted };
}

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
