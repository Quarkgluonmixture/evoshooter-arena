import { type SimConfig, type Team, RED, BLUE } from '../core/config.ts';
import { Rng } from '../core/rng.ts';
import type { ArenaMap } from './map.ts';
import { segmentHitsBox, rayBoxDist2D, resolveCircleBox, wrapAngle } from './geom.ts';

/* ------------------------------------------------------------------ actions */

export const ACT_DIM = 12;
export const A_MOVE_X = 0;
export const A_MOVE_Z = 1;
export const A_LOOK_X = 2;
export const A_LOOK_Z = 3;
export const A_FIRE = 4;
export const A_TARGET0 = 5; // 5..7 target-slot logits
export const A_RELOAD = 8;
export const A_AIM = 9;
export const A_COMM0 = 10; // 10..11 comm channel

/* --------------------------------------------------------------- observation */

export const SELF_BASE = 19;
export const MATE_FEATS_BASE = 6;
export const ENEMY_FEATS = 6;
/** per objective site, always: dx, dz, dist, I am in it, how many of us are in it */
export const OBJ_FEATS_BASE = 5;

/**
 * The round-state fields exist only in `capture` mode, where there is a round state to report. In `koth`
 * there is nothing to be armed, so emitting `armed` / `countdown` / `defuse` would hand every brain three
 * inputs that are identically zero for the whole of its life — plus 3 x hidden[0] weights that can only
 * dilute mutation. A field that cannot vary is not information, and ⛔ a constant input is not harmless:
 * it is a free parameter with nothing to learn from.
 */
export function objFeats(cfg: SimConfig): number {
  return OBJ_FEATS_BASE + (cfg.roundMode === 'capture' ? 1 : 0); // + armed
}
export function objGlobal(cfg: SimConfig): number {
  return cfg.roundMode === 'capture' ? 2 : 0; // countdown, defuse
}

export const AUDIO_CLASSES = 2; // footstep, gunshot

export function obsDim(cfg: SimConfig): number {
  return SELF_BASE + cfg.teamSize + cfg.siteCount * objFeats(cfg) + objGlobal(cfg) + cfg.lidarRays
    + cfg.mateSlots * (MATE_FEATS_BASE + cfg.commDim)
    + cfg.enemySlots * ENEMY_FEATS + cfg.audioSectors * AUDIO_CLASSES;
}

/* -------------------------------------------------------------------- state */

export interface Agent {
  id: number;
  team: Team;
  slot: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  alive: boolean;
  ammo: number;
  reloadT: number;
  cooldownT: number;
  targetId: number;
  settleT: number;
  aim: boolean;
  firing: boolean;
  /** low-passed look intent in the TEAM frame; keeps scanning gradual instead of per-tick jitter */
  lookX: number;
  lookZ: number;
  /** what I am trying to say this tick, straight off the action */
  comm: Float32Array;
  /** the quantised symbol currently leaving my radio — only re-decided every `commIntervalTicks` */
  commSaid: Float32Array;
  dmgRecent: number;
  hitDirX: number;
  hitDirZ: number;
  shots: number;
  hits: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  deathT: number;
}

/** A remembered sighting: where I believed he was, when, and how good that look was. */
export interface Known { x: number; z: number; t: number; q: number }

export interface ShotEvent {
  kind: 'shot';
  shooter: number;
  target: number;
  hit: boolean;
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}
export interface KillEvent { kind: 'kill'; victim: number; killer: number; x: number; z: number }

/**
 * ⚠ SPECTATOR CHANNEL. These carry exact coordinates and identities, and they exist for two consumers: the
 * viewer (which is an observer, not a player, and is allowed to see everything) and `hear()`, which turns a
 * shot into gunshot audio — that is physics, not a feed.
 *
 * ⛔ No policy may read `world.events`. ROADMAP C2 requires the player-facing kill feed to carry no death
 * coordinate, and the feed players actually get is the alive-count channel (`self.aliveMine`,
 * `self.aliveEnemy`, `mate*.alive`) plus whatever they heard — none of which says where. A corpse reports
 * that it is dead and nothing else (`A1-P24`, `A1-P26`).
 */
export type WorldEvent = ShotEvent | KillEvent;

/** Raw per-team accumulators; turned into human metrics by match.ts. */
export interface TeamStats {
  shots: number;
  hits: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  zoneAgentTicks: number;
  aliveAgentTicks: number;
  coverTicks: number;
  threatTicks: number;
  moveTicks: number;
  aimTicks: number;
  spreadSum: number;
  spreadTicks: number;
  /** (viewer, enemy) pairs of MY team that had eyes on an enemy this tick, summed over ticks.
   *  The denominator behind every behaviour claim: zero here means the two teams never met (GOTCHAS #18). */
  sightTicks: number;
  engageDistSum: number;
  flankHits: number;
  commSum: number[];
  commSq: number[];
  commN: number;
  firstContactT: number;
  reloads: number;
}

function newStats(commDim: number): TeamStats {
  return {
    shots: 0, hits: 0, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0,
    zoneAgentTicks: 0, aliveAgentTicks: 0, coverTicks: 0, threatTicks: 0, moveTicks: 0, aimTicks: 0,
    spreadSum: 0, spreadTicks: 0, sightTicks: 0, engageDistSum: 0, flankHits: 0,
    commSum: new Array(commDim).fill(0), commSq: new Array(commDim).fill(0), commN: 0,
    firstContactT: -1, reloads: 0,
  };
}

const THREAT_RANGE = 25;

/** Stateless integer hash → [-1, 1). Perception error must be reproducible without touching the RNG stream
 *  the combat rolls draw from, otherwise a replay of the same match would diverge. */
function jitter(a: number, b: number, c: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 2147483648 - 1;
}

/**
 * Deterministic 3D arena simulation. Both teams perceive the world in a "team frame" (blue's frame is the
 * world rotated 180°), so a genome can play either colour and the two populations stay directly comparable.
 */
export class World {
  readonly cfg: SimConfig;
  readonly map: ArenaMap;
  readonly rng: Rng;
  readonly agents: Agent[] = [];
  readonly n: number;
  readonly obsDim: number;
  readonly obs: Float32Array;
  readonly act: Float32Array;
  /** exposure[i*n+j]: fraction of j's body points visible from i's eye (LOS only, no FOV). */
  readonly exposure: Float32Array;
  /** visible[i*n+j]: j is inside i's field of view and at least partly unobstructed. */
  readonly visible: Uint8Array;
  /** slots[i*enemySlots+s]: enemy id occupying observation slot s of agent i, or -1. */
  readonly slots: Int16Array;
  /**
   * contact[playerId][enemySlot]: the last position THIS player saw that enemy at, and when.
   * Contacts are private: a teammate's sighting never lands here (ROADMAP A2 / SUBSTRATE V1).
   */
  readonly contact: Known[][];
  /** audio[(i * audioSectors + sector) * AUDIO_CLASSES + klass]: loudness this listener currently hears. */
  readonly audio: Float32Array;
  /**
   * commWire[((i * commDim) + c) * L + age]: what agent i's slot c was transmitting `age` ticks ago, where
   * L = commDelayTicks + 1. Teammates read the OLDEST entry, so a message takes real time to arrive — and
   * what a speaker is currently saying is not the same object as what a listener currently hears.
   */
  private readonly commWire: Float32Array;
  /**
   * brain[i*recurrentDim + k]: player i's own recurrent state, carried from last tick (ROADMAP D1).
   * It lives here rather than on the policy on purpose — policies are cached per genome and replayed
   * across matches, so state held on one would make a match depend on which matches ran before it.
   * Zeroed at construction, which is what "reset with the match" means in practice.
   */
  readonly brain: Float32Array;
  /** audioPath[i*n+j]: this tick's attenuation multiplier between i and j, or 0 when out of earshot. */
  private readonly audioPath: Float32Array;
  /** losPair[i*n+j]: 1 when nothing stands between i's eye and j's eye. Symmetric; one pass per tick. */
  private readonly losPair: Uint8Array;
  readonly stats: [TeamStats, TeamStats];
  readonly heat: [Float32Array, Float32Array] | null;
  /** same grid, but only counting ticks an agent FIRED from that cell: where fights happen, not where feet go */
  readonly heatFire: [Float32Array, Float32Array] | null;
  readonly events: WorldEvent[] = [];
  score: [number, number] = [0, 0];
  /** Which side attacks in `capture` mode. Assigned per match and swapped in pairs, so it is a ROLE, not
   *  an identity — a club has to play both ends of it (VISION §11.2). Unused in `koth`. */
  readonly attackers: Team;
/** capture meter per site, 0..1. Fills while attackers hold that site alone, decays when none are in it. */
  readonly capture: number[];
  /**
   * siteOrder[team][s] = world site index reported in that team's observation slot `s`.
   *
   * The objective block MUST be ordered in the team's own frame. Emitting sites in world index order makes
   * red's `obj0` the site on its right and blue's `obj0` the site on its left, so the same genome behaves
   * differently depending on its colour — a permanent red/blue species difference arriving through the
   * observation (VISION §11.2), and invisible to a mirror test that only runs with one site.
   * Sorting by team-frame x (then z) is position-based, so it holds for any layout rather than assuming the
   * two sites are each other's mirror.
   */
  private readonly siteOrder: [number[], number[]];
  /** index of the armed site, or -1. Only one can ever be armed: there is one bomb, not one per site. */
  armedSite = -1;
  /** seconds left on the countdown once armed. */
  armedT = 0;
  /** defuse meter, 0..1, burned by defenders holding the ARMED site alone. */
  defuse = 0;
  aliveCount: [number, number];
  t = 0;
  tick = 0;
  done = false;
  /** -1 draw / undecided, 0 red, 1 blue */
  winner: -1 | 0 | 1 = -1;
  private readonly cosHalfFov: number;
  private readonly halfFov: number;
  private readonly cosAimCone: number;
  private readonly lidarOffsets: Float32Array;
  private readonly pendingShots: number[] = [];

  constructor(cfg: SimConfig, map: ArenaMap, seed: number, opts: { heat?: boolean; attackers?: Team } = {}) {
    this.cfg = cfg;
    this.map = map;
    this.rng = new Rng(seed);
    this.n = cfg.teamSize * 2;
    this.obsDim = obsDim(cfg);
    this.obs = new Float32Array(this.n * this.obsDim);
    this.act = new Float32Array(this.n * ACT_DIM);
    this.exposure = new Float32Array(this.n * this.n);
    this.visible = new Uint8Array(this.n * this.n);
    this.slots = new Int16Array(this.n * cfg.enemySlots).fill(-1);
    this.contact = [];
    this.audio = new Float32Array(this.n * cfg.audioSectors * AUDIO_CLASSES);
    this.brain = new Float32Array(this.n * cfg.recurrentDim);
    this.commWire = new Float32Array(this.n * cfg.commDim * (cfg.commDelayTicks + 1));
    this.audioPath = new Float32Array(this.n * this.n);
    this.losPair = new Uint8Array(this.n * this.n);
    this.stats = [newStats(cfg.commDim), newStats(cfg.commDim)];
    this.aliveCount = [cfg.teamSize, cfg.teamSize];
    if (map.sites.length !== cfg.siteCount) {
      throw new Error(`map has ${map.sites.length} site(s) but cfg.siteCount is ${cfg.siteCount} — the observation layout is derived from cfg, so they must agree`);
    }
    this.attackers = opts.attackers ?? RED;
    this.armedT = cfg.armedSeconds;
    this.capture = map.sites.map(() => 0);
    this.siteOrder = [0, 1].map((team) => {
      const sg = team === RED ? 1 : -1;
      return map.sites
        .map((s, i) => ({ i, x: sg * s.x, z: sg * s.z }))
        .sort((a, b) => b.x - a.x || b.z - a.z)
        .map((e) => e.i);
    }) as [number[], number[]];
    this.cosHalfFov = Math.cos((cfg.fovDeg * Math.PI) / 360);
    this.halfFov = (cfg.fovDeg * Math.PI) / 360;
    this.cosAimCone = Math.cos((cfg.aimConeDeg * Math.PI) / 180);
    // Angular offsets from where the agent is looking: one down the crosshair, then progressively
    // sparser out to the edge of the field of view. Nothing behind the head is sensed at all.
    this.lidarOffsets = new Float32Array(cfg.lidarRays);
    {
      const m = Math.floor((cfg.lidarRays - 1) / 2);
      const span = (cfg.geomFovDeg * Math.PI) / 360; // half-span: structures are seen wider than enemies
      let w = 0;
      this.lidarOffsets[w++] = 0;
      for (let k = 1; k <= m; k++) {
        const off = span * Math.pow(k / m, 1.6);
        this.lidarOffsets[w++] = -off;
        if (w < cfg.lidarRays) this.lidarOffsets[w++] = off;
      }
      while (w < cfg.lidarRays) this.lidarOffsets[w++] = (cfg.geomFovDeg * Math.PI) / 360;
    }
    this.heatFire = opts.heat
      ? [new Float32Array(cfg.heatCells * cfg.heatCells), new Float32Array(cfg.heatCells * cfg.heatCells)]
      : null;
    this.heat = opts.heat
      ? [new Float32Array(cfg.heatCells * cfg.heatCells), new Float32Array(cfg.heatCells * cfg.heatCells)]
      : null;

    for (let team = 0; team < 2; team++) {
      for (let s = 0; s < cfg.teamSize; s++) {
        const sp = map.spawns[team][s];
        this.agents.push({
          id: this.agents.length,
          team: team as Team,
          slot: s,
          x: sp.x,
          z: sp.z,
          vx: 0,
          vz: 0,
          yaw: team === RED ? Math.PI / 2 : -Math.PI / 2, // face the enemy half (+z for red)
          hp: cfg.hp,
          alive: true,
          ammo: cfg.magSize,
          reloadT: 0,
          cooldownT: 0,
          targetId: -1,
          settleT: 0,
          aim: false,
          firing: false,
          lookX: 0,
          lookZ: 1, // both teams start looking at the enemy half (team frame is mirrored)
          comm: new Float32Array(cfg.commDim),
          commSaid: new Float32Array(cfg.commDim),
          dmgRecent: 0,
          hitDirX: 0,
          hitDirZ: 0,
          shots: 0,
          hits: 0,
          kills: 0,
          damageDealt: 0,
          damageTaken: 0,
          deathT: -1,
        });
      }
    }
    for (let i = 0; i < this.n; i++) {
      const c: Known[] = [];
      for (let e = 0; e < cfg.teamSize; e++) c.push({ x: 0, z: 0, t: -1e9, q: 0 });
      this.contact.push(c);
    }
  }

  /* --------------------------------------------------------------- helpers */

  /** +1 for red, -1 for blue: multiplies world coordinates into the team frame. */
  static sgn(team: Team): number {
    return team === RED ? 1 : -1;
  }

  teamOf(id: number): Team {
    return this.agents[id].team;
  }

  private losClear(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const boxes = this.map.boxes;
    for (let i = 0; i < boxes.length; i++) {
      if (segmentHitsBox(ax, ay, az, bx, by, bz, boxes[i])) return false;
    }
    return true;
  }

  /** Fraction of `target` body points visible from `viewer` eye. */
  private computeExposure(viewer: Agent, target: Agent): number {
    const pts = this.cfg.bodyPoints;
    let vis = 0;
    for (let k = 0; k < pts.length; k++) {
      if (this.losClear(viewer.x, this.cfg.eyeHeight, viewer.z, target.x, pts[k], target.z)) vis++;
    }
    return vis / pts.length;
  }

  /**
   * How good a look I am getting: visible body fraction x distance falloff x eccentricity falloff.
   * Both falloffs reach zero smoothly at the physical limits, so a contact fades instead of being
   * deleted at a threshold (SUBSTRATE V3 / ROADMAP A3.2).
   */
  perceptQuality(a: Agent, dx: number, dz: number, exposure: number): number {
    if (exposure <= 0) return 0;
    const d = Math.hypot(dx, dz);
    const R = this.cfg.viewRange;
    if (d >= R) return 0;
    const near = 1 - (d / R) * (d / R);
    const t = Math.abs(wrapAngle(Math.atan2(dz, dx) - a.yaw)) / this.halfFov;
    if (t >= 1) return 0;
    const centre = 1 - t * t;
    return exposure * near * near * centre * centre;
  }

  /**
   * Where I think he is. The true offset is blurred and then quantised, both by an amount that grows as
   * the look gets worse, so a movement finer than my perceptual resolution does not reach the policy.
   */
  perceive(viewer: Agent, target: Agent, dx: number, dz: number, reported: number): { dx: number; dz: number } {
    const cfg = this.cfg;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return { dx, dz };
    // `reported` is already quantised, so every step size below is one of a discrete set. Deriving a step
    // from a continuous quantity would leak that quantity straight back through the rounding.
    const coarse = 0.15 + 0.85 * (1 - Math.min(1, Math.max(0, reported)));
    const bucket = Math.floor(this.t / cfg.perceptBucketSeconds);
    // Keyed by SLOT, not agent id, and quantised in the viewer's own frame: a red player and its mirrored
    // blue counterpart must draw the same error and land on the same lattice cell, or the two colours stop
    // solving the same problem (T7, and the reason champion-vs-past-self is a fair comparison).
    const key = viewer.slot * 31 + target.slot;
    const bErr = cfg.perceptBearingError * coarse;
    const rErr = cfg.perceptRangeError * coarse;
    const rel = wrapAngle(Math.atan2(dz, dx) - viewer.yaw) + jitter(key, bucket, 0x9e3779b1) * bErr;
    const range = Math.max(0.5, d * (1 + jitter(key, bucket, 0x85ebca6b) * rErr));
    const qb = Math.round(rel / bErr) * bErr;                           // angular lattice in MY frame
    const lr = Math.log1p(rErr);
    const qr = Math.exp(Math.round(Math.log(range) / lr) * lr);         // multiplicative range lattice
    const ang = viewer.yaw + qb;
    return { dx: Math.cos(ang) * qr, dz: Math.sin(ang) * qr };
  }

  /**
   * Decay what everyone is still hearing, then mix in this tick's sounds: footsteps from anyone who is
   * moving (louder the faster they go) and gunshots from the previous tick's shots. A sound carries no
   * identity and no team label — a teammate's steps arrive in exactly the same channel as an enemy's.
   */
  private hear(): void {
    const cfg = this.cfg;
    const S = cfg.audioSectors;
    const n = this.n;
    const ag = this.agents;
    const decay = Math.exp(-cfg.dt / cfg.audioDecaySeconds);
    for (let k = 0; k < this.audio.length; k++) this.audio[k] *= decay;

    // One geometry pass per PAIR, not per (listener, source): the segment is the same in both
    // directions. Hearing and "can I see my teammate" both read it, so it is computed once.
    const R = cfg.audioRange;
    const far = Math.max(R, cfg.viewRange);
    this.audioPath.fill(0);
    this.losPair.fill(0);
    for (let i = 0; i < n; i++) {
      if (!ag[i].alive) continue;
      for (let j = i + 1; j < n; j++) {
        if (!ag[j].alive) continue;
        const d = Math.hypot(ag[j].x - ag[i].x, ag[j].z - ag[i].z);
        if (d >= far) continue;
        // only teammates need the sight flag beyond earshot; enemies are handled by the exposure pass
        if (d >= R && ag[i].team !== ag[j].team) continue;
        const clear = this.losClear(ag[i].x, cfg.eyeHeight, ag[i].z, ag[j].x, cfg.eyeHeight, ag[j].z);
        if (clear) {
          this.losPair[i * n + j] = 1;
          this.losPair[j * n + i] = 1;
        }
        if (d >= R) continue;
        const near = 1 - (d / R) * (d / R);
        const path = clear ? near * near : near * near * cfg.audioOcclusion;
        this.audioPath[i * n + j] = path;
        this.audioPath[j * n + i] = path;
      }
    }

    const emit = (source: Agent, klass: number, loud: number) => {
      if (loud <= 0) return;
      for (let i = 0; i < n; i++) {
        const me = ag[i];
        if (!me.alive || me.id === source.id) continue;
        const path = this.audioPath[i * n + source.id];
        if (path <= 0) continue;
        const energy = loud * path;
        const dx = source.x - me.x;
        const dz = source.z - me.z;
        // spread over neighbouring sectors so a source crossing a sector edge does not jump
        const b = wrapAngle(Math.atan2(dz, dx) - me.yaw);
        for (let s = 0; s < S; s++) {
          const c = Math.cos(b - (2 * Math.PI * s) / S);
          if (c <= 0) continue;
          this.audio[(i * S + s) * AUDIO_CLASSES + klass] += (energy * c * c * 2) / S;
        }
      }
    };

    for (let j = 0; j < n; j++) {
      const src = ag[j];
      if (!src.alive) continue;
      const speed = Math.hypot(src.vx, src.vz);
      const gait = Math.max(0, speed - 0.5) / Math.max(1e-6, cfg.maxSpeed - 0.5);
      emit(src, 0, cfg.footstepGain * Math.pow(gait, 1.5));
    }
    for (const ev of this.events) {
      if (ev.kind === 'shot') emit(ag[ev.shooter], 1, cfg.gunshotGain);
    }
  }

  /** Quantise a heard loudness the same way a visual percept is quantised. */
  private reportLoudness(listener: Agent, slotKey: number, v: number): number {
    if (v <= 1e-4) return 0;
    const bucket = Math.floor(this.t / this.cfg.perceptBucketSeconds);
    const noisy = v * (1 + jitter(listener.slot * 97 + slotKey, bucket, 0x6a09e667) * 0.2);
    if (noisy <= 1e-4) return 0;
    const lq = Math.log(1.15);
    return Math.min(1, Math.exp(Math.round(Math.log(noisy) / lq) * lq));
  }

  /**
   * What I would say about how good my look is. Quantised, because an exact quality number is an exact
   * function of the true geometry and would hand back everything the blurred bearing just removed.
   */
  reportQuality(viewer: Agent, target: Agent, q: number): number {
    if (q <= 0) return 0;
    const bucket = Math.floor(this.t / this.cfg.perceptBucketSeconds);
    const noisy = q * (1 + jitter(viewer.slot * 31 + target.slot, bucket, 0xc2b2ae35) * 0.2);
    if (noisy <= 1e-6) return 0;
    // fixed 15% multiplicative lattice: a faint contact stays faint instead of rounding away, and the
    // lattice itself carries no information about the true value
    const lq = Math.log(1.15);
    return Math.min(1, Math.exp(Math.round(Math.log(noisy) / lq) * lq));
  }

  /** Is `other` inside my field of view, within range, and not behind something? */
  private canSee(me: Agent, other: Agent): boolean {
    const cfg = this.cfg;
    const dx = other.x - me.x;
    const dz = other.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d > cfg.viewRange || d < 1e-6) return d <= 1e-6;
    if (!this.losPair[me.id * this.n + other.id]) return false;
    return (Math.cos(me.yaw) * dx + Math.sin(me.yaw) * dz) / d >= this.cosHalfFov;
  }

  private lidar(a: Agent, out: Float32Array, off: number): void {
    const cfg = this.cfg;
    const half = cfg.arenaHalf;
    const bucket = Math.floor(this.t / cfg.perceptBucketSeconds);
    const lg = Math.log1p(cfg.geomRangeError);
    for (let k = 0; k < cfg.lidarRays; k++) {
      const ang = a.yaw + this.lidarOffsets[k];
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      let best = cfg.lidarRange;
      // arena walls
      if (dx > 1e-9) best = Math.min(best, (half - a.x) / dx);
      else if (dx < -1e-9) best = Math.min(best, (-half - a.x) / dx);
      if (dz > 1e-9) best = Math.min(best, (half - a.z) / dz);
      else if (dz < -1e-9) best = Math.min(best, (-half - a.z) / dz);
      const boxes = this.map.boxes;
      for (let i = 0; i < boxes.length; i++) {
        const t = rayBoxDist2D(a.x, a.z, dx, dz, boxes[i]);
        if (t < best) best = t;
      }
      // same treatment as a visual contact: blurred, then snapped to a multiplicative lattice, so the
      // reading cannot be inverted back into an exact wall distance
      // keyed by slot + ray index, never by agent id: mirrored players must read the same wall (GOTCHAS #17)
      const noisy = Math.max(0.05, best * (1 + jitter(a.slot * 131 + k, bucket, 0x27d4eb2d) * cfg.geomRangeError));
      const q = Math.exp(Math.round(Math.log(noisy) / lg) * lg);
      out[off + k] = Math.min(1, q / cfg.lidarRange);
    }
  }

  /** Inside site `si`. `inZone` is the site-0 view every single-objective consumer still reads. */
  inSite(a: Agent, si: number): boolean {
    const s = this.map.sites[si];
    const dx = a.x - s.x;
    const dz = a.z - s.z;
    return dx * dx + dz * dz <= this.cfg.zoneRadius * this.cfg.zoneRadius;
  }

  inZone(a: Agent): boolean {
    const dx = a.x - this.map.zoneX;
    const dz = a.z - this.map.zoneZ;
    return dx * dx + dz * dz <= this.cfg.zoneRadius * this.cfg.zoneRadius;
  }

  /* --------------------------------------------------------------- observe */

  /** Fill `obs` for every living agent from the current state. Must be called before `step`. */
  observe(): void {
    const cfg = this.cfg;
    const n = this.n;
    const ag = this.agents;
    const T = cfg.teamSize;
    this.hear();

    // 1. exposure / visibility between opposing agents
    this.exposure.fill(0);
    this.visible.fill(0);
    for (let i = 0; i < n; i++) {
      const a = ag[i];
      if (!a.alive) continue;
      const fx = Math.cos(a.yaw);
      const fz = Math.sin(a.yaw);
      for (let j = 0; j < n; j++) {
        const b = ag[j];
        if (b.team === a.team || !b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d > cfg.viewRange) continue;
        const e = this.computeExposure(a, b);
        this.exposure[i * n + j] = e;
        if (e > 0 && d > 1e-6 && (fx * dx + fz * dz) / d >= this.cosHalfFov) {
          this.visible[i * n + j] = 1;
          this.stats[a.team].sightTicks++;
        }
      }
    }

    // 2. private contacts: what I see updates MY memory only. Teammates get nothing for free — a sighting
    //    can only reach them through a legal channel (body cue in view, or the comm channel).
    for (let i = 0; i < n; i++) {
      const me = ag[i];
      if (!me.alive) continue;
      const enemyBase = me.team === RED ? T : 0;
      const mine = this.contact[i];
      for (let e = 0; e < T; e++) {
        const enemy = ag[enemyBase + e];
        if (!enemy.alive || !this.visible[i * n + enemy.id]) continue;
        const qTrue = this.perceptQuality(me, enemy.x - me.x, enemy.z - me.z, this.exposure[i * n + enemy.id]);
        if (qTrue <= 0) continue;
        const q = this.reportQuality(me, enemy, qTrue);
        if (q <= 0) continue;
        const seen = this.perceive(me, enemy, enemy.x - me.x, enemy.z - me.z, q);
        const k = mine[e];
        k.x = me.x + seen.dx;
        k.z = me.z + seen.dz;
        k.t = this.t;
        k.q = q;
      }
    }

    // 3. per-team spread + per-site occupancy + heat
    const siteCount: [number[], number[]] = [this.map.sites.map(() => 0), this.map.sites.map(() => 0)];
    for (let team = 0; team < 2; team++) {
      const base = team === RED ? 0 : T;
      let sum = 0;
      let pairs = 0;
      for (let i = 0; i < T; i++) {
        const a = ag[base + i];
        if (!a.alive) continue;
        for (let si = 0; si < this.map.sites.length; si++) if (this.inSite(a, si)) siteCount[team][si]++;
        if (this.heat) {
          const cells = cfg.heatCells;
          const cx = Math.min(cells - 1, Math.max(0, Math.floor(((a.x + cfg.arenaHalf) / (2 * cfg.arenaHalf)) * cells)));
          const cz = Math.min(cells - 1, Math.max(0, Math.floor(((a.z + cfg.arenaHalf) / (2 * cfg.arenaHalf)) * cells)));
          this.heat[team][cz * cells + cx] += 1;
          if (a.firing && this.heatFire) this.heatFire[team][cz * cells + cx] += 1;
        }
        for (let j = i + 1; j < T; j++) {
          const b = ag[base + j];
          if (!b.alive) continue;
          sum += Math.hypot(a.x - b.x, a.z - b.z);
          pairs++;
        }
      }
      if (pairs > 0) {
        this.stats[team].spreadSum += sum / pairs;
        this.stats[team].spreadTicks++;
      }
    }

    // 4. observations
    const half = cfg.arenaHalf;
    const timeLeft = Math.max(0, cfg.matchSeconds - this.t) / cfg.matchSeconds;
    const maxScore = cfg.matchSeconds * cfg.zonePointsPerSecond;
    const mateOrder: number[] = [];
    const enemyOrder: number[] = [];
    const enemyDist: number[] = [];
    const enemyVis: number[] = [];
    const enemyConf: number[] = [];
    const enemyLive: number[] = [];

    for (let i = 0; i < n; i++) {
      const a = ag[i];
      const off = i * this.obsDim;
      const o = this.obs;
      const slotBase = i * cfg.enemySlots;
      for (let s = 0; s < cfg.enemySlots; s++) this.slots[slotBase + s] = -1;
      if (!a.alive) {
        o.fill(0, off, off + this.obsDim);
        continue;
      }
      const team = a.team;
      const sg = World.sgn(team);
      const st = this.stats[team];
      const yawT = team === RED ? a.yaw : a.yaw + Math.PI;
      const speed = Math.hypot(a.vx, a.vz);
      const enemyTeam: Team = team === RED ? BLUE : RED;
      const myBase = team === RED ? 0 : T;
      const enemyBase = team === RED ? T : 0;

      let p = off;
      // --- self
      o[p++] = (sg * a.x) / half;
      o[p++] = (sg * a.z) / half;
      o[p++] = Math.cos(yawT);
      o[p++] = Math.sin(yawT);
      o[p++] = (sg * a.vx) / cfg.maxSpeed;
      o[p++] = (sg * a.vz) / cfg.maxSpeed;
      o[p++] = a.hp / cfg.hp;
      o[p++] = a.ammo / cfg.magSize;
      o[p++] = a.reloadT > 0 ? 1 : 0;
      o[p++] = a.aim ? 1 : 0;
      o[p++] = timeLeft;
      // how the round is going, in [-1, 1]. Same legal HUD channel in both modes; only the scale differs,
      // because capture progress is not measured in zone-seconds.
      o[p++] = (this.score[team] - this.score[enemyTeam]) / (cfg.roundMode === 'capture' ? 2 : maxScore);
      o[p++] = Math.min(1, a.dmgRecent / 50);
      o[p++] = sg * a.hitDirX;
      o[p++] = sg * a.hitDirZ;
      o[p++] = a.cooldownT <= 0 && a.reloadT <= 0 && a.ammo > 0 ? 1 : 0;
      o[p++] = this.aliveCount[team] / T;
      o[p++] = this.aliveCount[enemyTeam] / T;
      o[p++] = speed / cfg.maxSpeed;
      for (let s = 0; s < T; s++) o[p++] = s === a.slot ? 1 : 0;

      // --- objective HUD, one block per site, then the round-wide public state (ROADMAP C2)
      for (let slot = 0; slot < cfg.siteCount; slot++) {
        const si = this.siteOrder[team][slot];
        const s = this.map.sites[si];
        const dx = s.x - a.x;
        const dz = s.z - a.z;
        o[p++] = (sg * dx) / half;
        o[p++] = (sg * dz) / half;
        o[p++] = Math.min(1, Math.hypot(dx, dz) / half);
        o[p++] = this.inSite(a, si) ? 1 : 0;
        o[p++] = siteCount[team][si] / T;
        // Whether a site is armed is public: in a real round it is announced and audible. How far a capture
        // has GOT is not — you have to be there to see it, which is what leaves the attackers a window.
        // The enemy count inside the site used to be here (V12): it reported bodies nobody had seen,
        // a free occupancy radar. The legal channel for "they are taking it" is the public round state.
        if (cfg.roundMode === 'capture') o[p++] = this.armedSite === si ? 1 : 0;
      }
      if (cfg.roundMode === 'capture') {
        o[p++] = this.armedSite >= 0 ? Math.max(0, this.armedT / cfg.armedSeconds) : 0;
        o[p++] = this.defuse;
      }

      // --- lidar
      this.lidar(a, o, p);
      p += cfg.lidarRays;

      // --- teammates (alive first, then nearest)
      mateOrder.length = 0;
      for (let m = 0; m < T; m++) {
        const id = myBase + m;
        if (id !== i) mateOrder.push(id);
      }
      mateOrder.sort((u, v) => {
        const A = ag[u];
        const B = ag[v];
        if (A.alive !== B.alive) return A.alive ? -1 : 1;
        return Math.hypot(A.x - a.x, A.z - a.z) - Math.hypot(B.x - a.x, B.z - a.z);
      });
      for (let s = 0; s < cfg.mateSlots; s++) {
        if (s < mateOrder.length) {
          const m = ag[mateOrder[s]];
          // A dead teammate's frozen position is a DEATH COORDINATE, and ROADMAP C2 rules that the public
          // "we are a man down" signal carries no coordinate: it tells you the fight happened, not where.
          // Leaving it on the HUD hands every survivor a permanent marker on the last place an enemy was.
          const dx = m.alive ? m.x - a.x : 0;
          const dz = m.alive ? m.z - a.z : 0;
          o[p++] = (sg * dx) / half;
          o[p++] = (sg * dz) / half;
          o[p++] = m.alive ? Math.min(1, Math.hypot(dx, dz) / half) : 0;
          o[p++] = m.alive ? 1 : 0;
          o[p++] = m.alive ? m.hp / cfg.hp : 0;
          // A teammate's body actions are a VISUAL cue, not a HUD field: out of sight, out of mind
          // (SUBSTRATE §6.2 / V11). Position and health stay on the HUD; firing does not.
          o[p++] = m.alive && m.firing && this.canSee(a, m) ? 1 : 0;
          // what he SAID a moment ago, not what he is saying now (D2 transmission delay)
          for (let c = 0; c < cfg.commDim; c++) o[p++] = m.alive ? this.heardComm(m.id, c) : 0;
        } else {
          for (let c = 0; c < MATE_FEATS_BASE + cfg.commDim; c++) o[p++] = 0;
        }
      }

      // --- enemy contacts: strongest belief first (own eyes now, or my own recent memory)
      enemyOrder.length = 0;
      enemyDist.length = 0;
      enemyVis.length = 0;
      enemyConf.length = 0;
      enemyLive.length = 0;
      for (let e = 0; e < T; e++) {
        const id = enemyBase + e;
        const en = ag[id];
        if (!en.alive) continue;
        const vis = this.visible[i * n + id];
        const k = this.contact[i][e];
        const age = this.t - k.t;
        // memorySeconds 0 means the world keeps no record at all (ROADMAP D1 step 2: remembering becomes
        // the brain's job). Without the > 0 guard the fade below is (1 - 0/0)² = NaN and the whole contact
        // channel silently fills with NaN rather than emptying.
        const fresh = cfg.memorySeconds > 0 && age <= cfg.memorySeconds;
        if (!vis && !fresh) continue;
        const qTrue = vis ? this.perceptQuality(a, en.x - a.x, en.z - a.z, this.exposure[i * n + id]) : 0;
        const live = vis ? this.reportQuality(a, en, qTrue) : 0;
        // while I can see him the belief is this tick's percept, and the stored contact is the same
        // number — what I remember is what I saw, not what was true
        const believed = vis ? this.perceive(a, en, en.x - a.x, en.z - a.z, live) : null;
        // A glimpse I barely got is a memory I barely hold, and the hold decays as (1-t)^2 so the end of
        // the window is a fade rather than a deletion (ROADMAP V6a).
        const fade = fresh ? (1 - age / cfg.memorySeconds) * (1 - age / cfg.memorySeconds) : 0;
        const recalled = k.q * fade;
        const conf = Math.max(live, recalled);
        if (conf <= 0) continue;
        const px = believed ? a.x + believed.dx : k.x;
        const pz = believed ? a.z + believed.dz : k.z;
        enemyOrder.push(id);
        enemyDist.push(Math.hypot(px - a.x, pz - a.z));
        enemyVis.push(vis);
        enemyConf.push(conf);
        enemyLive.push(live);
      }
      const idx = enemyOrder.map((_, k) => k);
      idx.sort((u, v) => (enemyConf[v] - enemyConf[u]) || (enemyDist[u] - enemyDist[v]));
      for (let s = 0; s < cfg.enemySlots; s++) {
        if (s < idx.length) {
          const k = idx[s];
          const id = enemyOrder[k];
          const en = ag[id];
          const vis = enemyVis[k] === 1;
          const kn = this.contact[i][id - enemyBase];
          const believed = vis ? this.perceive(a, en, en.x - a.x, en.z - a.z, enemyLive[k]) : null;
          const px = believed ? a.x + believed.dx : kn.x;
          const pz = believed ? a.z + believed.dz : kn.z;
          const d = enemyDist[k];
          const conf = enemyConf[k];
          // Everything about a contact is scaled by how sure I am of it, so a fading percept fades the
          // whole channel instead of handing over a full-strength coordinate right up to a cutoff.
          const bearing = wrapAngle(Math.atan2(pz - a.z, px - a.x) - a.yaw);
          this.slots[slotBase + s] = id;
          o[p++] = conf * Math.sin(bearing);
          o[p++] = conf * Math.cos(bearing);
          o[p++] = conf * Math.min(1, d / cfg.viewRange);
          o[p++] = enemyLive[k];
          o[p++] = conf;
          // Recency, not staleness — and scaled by confidence like every other field in this slot. The
          // first version reported a bare 1 while visible, which put a full-height cliff back at the edge
          // of vision; A1-P8, written three phases earlier, caught it.
          {
            const age = this.t - kn.t;
            const f = Math.max(0, 1 - age / cfg.memorySeconds);
            o[p++] = conf * (vis ? 1 : f * f);
          }
        } else {
          for (let c = 0; c < ENEMY_FEATS; c++) o[p++] = 0;
        }
      }

      // --- hearing: head-relative sectors, no identity, no team label
      for (let s = 0; s < cfg.audioSectors; s++) {
        for (let c = 0; c < AUDIO_CLASSES; c++) {
          const idx = (i * cfg.audioSectors + s) * AUDIO_CLASSES + c;
          o[p++] = this.reportLoudness(a, s * AUDIO_CLASSES + c, this.audio[idx]);
        }
      }

      // --- metrics: cover vs nearest known threat
      {
        let nearest = -1;
        let nd = THREAT_RANGE;
        for (let e = 0; e < T; e++) {
          const id = enemyBase + e;
          if (!ag[id].alive) continue;
          const kn = this.contact[i][e];
          if (this.t - kn.t > cfg.memorySeconds && !this.visible[i * n + id]) continue;
          const d = Math.hypot(ag[id].x - a.x, ag[id].z - a.z);
          if (d < nd) { nd = d; nearest = id; }
        }
        if (nearest >= 0) {
          st.threatTicks++;
          if (this.exposure[nearest * n + i] === 0) st.coverTicks++;
        }
      }
      st.aliveAgentTicks++;
      if (this.inZone(a)) st.zoneAgentTicks++;
      if (speed > 0.5) st.moveTicks++;
      if (a.aim) st.aimTicks++;
      for (let c = 0; c < cfg.commDim; c++) {
        // the metric describes the RADIO, not the unexpressed urge: with commTokens 0 these are the same
        // number, so the default config's commActivity is unchanged
        st.commSum[c] += a.commSaid[c];
        st.commSq[c] += a.commSaid[c] * a.commSaid[c];
      }
      st.commN++;
    }
  }

  /* ------------------------------------------------------------------ step */

  /** Apply `act` for every living agent and advance one tick. */
  step(): void {
    if (this.done) return;
    const cfg = this.cfg;
    const dt = cfg.dt;
    const n = this.n;
    const ag = this.agents;
    this.events.length = 0;

    // 1. decode actions, turn, move
    for (let i = 0; i < n; i++) {
      const a = ag[i];
      if (!a.alive) continue;
      const off = i * ACT_DIM;
      const act = this.act;
      const sg = World.sgn(a.team);

      // target selection among occupied slots
      let best = -1;
      let bestLogit = -Infinity;
      for (let s = 0; s < cfg.enemySlots; s++) {
        const id = this.slots[i * cfg.enemySlots + s];
        if (id < 0) continue;
        const l = act[off + A_TARGET0 + s];
        if (l > bestLogit) { bestLogit = l; best = id; }
      }
      if (best !== a.targetId) a.settleT = 0;
      else a.settleT += dt;
      a.targetId = best;
      a.aim = act[off + A_AIM] > 0;
      a.firing = act[off + A_FIRE] > 0 && best >= 0;
      for (let c = 0; c < cfg.commDim; c++) a.comm[c] = Math.tanh(act[off + A_COMM0 + c]);
      this.transmit(a);

      // movement intent (team frame -> world)
      let mx = Math.tanh(act[off + A_MOVE_X]);
      let mz = Math.tanh(act[off + A_MOVE_Z]);
      const mlen = Math.hypot(mx, mz);
      if (mlen > 1) { mx /= mlen; mz /= mlen; }
      const speedCap = cfg.maxSpeed * (a.aim ? cfg.aimSpeedMul : 1);
      const tvx = sg * mx * speedCap;
      const tvz = sg * mz * speedCap;

      // look intent is low-passed before it can steer the head (raw action = white noise every tick)
      {
        const kl = 1 - Math.exp(-dt / cfg.lookSmoothSeconds);
        a.lookX += (Math.tanh(act[off + A_LOOK_X]) - a.lookX) * kl;
        a.lookZ += (Math.tanh(act[off + A_LOOK_Z]) - a.lookZ) * kl;
      }

      // desired facing
      let want = a.yaw;
      let hasWant = false;
      const engaging = (a.firing || a.aim) && best >= 0;
      if (engaging) {
        const en = ag[best];
        const vis = this.visible[i * n + best];
        const kn = this.contact[i][best - (a.team === RED ? cfg.teamSize : 0)];
        const px = vis ? en.x : kn.x;
        const pz = vis ? en.z : kn.z;
        want = Math.atan2(pz - a.z, px - a.x);
        hasWant = true;
      } else {
        if (Math.hypot(a.lookX, a.lookZ) > 0.3) {
          want = Math.atan2(sg * a.lookZ, sg * a.lookX);
          hasWant = true;
        } else if (mlen > 0.2) {
          want = Math.atan2(tvz, tvx);
          hasWant = true;
        }
      }
      if (hasWant) {
        const d = wrapAngle(want - a.yaw);
        // Flick speed only when actually engaging someone. Otherwise a head SWEEPS: without this cap the
        // network's per-tick look output made agents snap ±36° every tick, which reads as random jerking.
        const maxTurn = (engaging ? cfg.turnRate : cfg.scanTurnRate) * dt;
        a.yaw = wrapAngle(a.yaw + Math.max(-maxTurn, Math.min(maxTurn, d)));
      }

      // velocity + integrate
      const ax = tvx - a.vx;
      const az = tvz - a.vz;
      const alen = Math.hypot(ax, az);
      const maxDv = cfg.accel * dt;
      if (alen > maxDv) {
        a.vx += (ax / alen) * maxDv;
        a.vz += (az / alen) * maxDv;
      } else {
        a.vx = tvx;
        a.vz = tvz;
      }
      a.x += a.vx * dt;
      a.z += a.vz * dt;

      // timers
      if (a.cooldownT > 0) a.cooldownT -= dt;
      if (a.reloadT > 0) {
        a.reloadT -= dt;
        if (a.reloadT <= 0) { a.reloadT = 0; a.ammo = cfg.magSize; }
      } else if (a.ammo === 0 || (act[off + A_RELOAD] > 0 && a.ammo < cfg.magSize)) {
        a.reloadT = cfg.reloadSeconds;
        this.stats[a.team].reloads++;
      }
      a.dmgRecent *= Math.exp(-dt * 2);
    }

    // 2. collisions (agents vs boxes, agents vs agents, arena bounds)
    const r = cfg.agentRadius;
    const half = cfg.arenaHalf - r;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const a = ag[i];
        if (!a.alive) continue;
        for (const b of this.map.boxes) {
          const [nx, nz] = resolveCircleBox(a.x, a.z, r, b);
          a.x = nx;
          a.z = nz;
        }
        if (a.x > half) a.x = half;
        if (a.x < -half) a.x = -half;
        if (a.z > half) a.z = half;
        if (a.z < -half) a.z = -half;
      }
      for (let i = 0; i < n; i++) {
        const a = ag[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < n; j++) {
          const b = ag[j];
          if (!b.alive) continue;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          const min = 2 * r;
          if (d2 < min * min && d2 > 1e-9) {
            const d = Math.sqrt(d2);
            const push = (min - d) / 2;
            a.x -= (dx / d) * push;
            a.z -= (dz / d) * push;
            b.x += (dx / d) * push;
            b.z += (dz / d) * push;
          }
        }
      }
    }

    // 3. combat — resolved SIMULTANEOUSLY: every shooter is judged against the start-of-tick state,
    //    then damage is applied. Otherwise whichever team is processed first gets a permanent first-shot edge.
    const pending = this.pendingShots;
    pending.length = 0;
    for (let i = 0; i < n; i++) {
      const a = ag[i];
      if (!a.alive || !a.firing || a.targetId < 0) continue;
      if (a.cooldownT > 0 || a.reloadT > 0 || a.ammo <= 0) continue;
      const tgt = ag[a.targetId];
      if (!tgt.alive) continue;
      const expo = this.exposure[i * n + tgt.id];
      if (expo <= 0) continue;
      const dx = tgt.x - a.x;
      const dz = tgt.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      const fx = Math.cos(a.yaw);
      const fz = Math.sin(a.yaw);
      if ((fx * dx + fz * dz) / d < this.cosAimCone) continue; // still turning onto the target

      a.ammo--;
      a.cooldownT = cfg.fireCooldown;
      a.shots++;
      const st = this.stats[a.team];
      st.shots++;
      st.engageDistSum += d;
      if (st.firstContactT < 0) st.firstContactT = this.t;
      const other = this.stats[tgt.team];
      if (other.firstContactT < 0) other.firstContactT = this.t;

      const mySpeed = Math.hypot(a.vx, a.vz);
      const tgtSpeed = Math.hypot(tgt.vx, tgt.vz);
      const distF = d <= 8 ? 1 : Math.max(0.25, 1 - ((d - 8) / 22) * 0.75); // 1.0 inside 8u → 0.25 at view range
      const moveF = a.aim ? 1 : mySpeed > 1 ? 0.6 : 1;
      const settleF = 0.65 + 0.35 * Math.min(1, a.settleT / cfg.settleSeconds);
      const tgtF = tgtSpeed > 3 ? 0.85 : 1;
      const prob = cfg.baseAccuracy * expo * distF * moveF * settleF * tgtF;
      const hit = this.rng.next() < prob;
      pending.push(i, tgt.id, hit ? 1 : 0);

      this.events.push({
        kind: 'shot', shooter: i, target: tgt.id, hit,
        x0: a.x, y0: cfg.eyeHeight, z0: a.z,
        x1: tgt.x + (hit ? 0 : this.rng.range(-0.8, 0.8)), y1: hit ? 1.1 : this.rng.range(0.3, 2.2), z1: tgt.z + (hit ? 0 : this.rng.range(-0.8, 0.8)),
      });
    }
    for (let k = 0; k < pending.length; k += 3) {
      if (!pending[k + 2]) continue;
      const a = ag[pending[k]];
      const tgt = ag[pending[k + 1]];
      const st = this.stats[a.team];
      const other = this.stats[tgt.team];
      const dmg = cfg.damage;
      a.hits++;
      st.hits++;
      a.damageDealt += dmg;
      st.damageDealt += dmg;
      tgt.damageTaken += dmg;
      other.damageTaken += dmg;
      const dx = tgt.x - a.x;
      const dz = tgt.z - a.z;
      const d = Math.hypot(dx, dz) || 1;
      tgt.dmgRecent += dmg;
      tgt.hitDirX = -dx / d;
      tgt.hitDirZ = -dz / d;
      if ((Math.cos(tgt.yaw) * -dx + Math.sin(tgt.yaw) * -dz) / d < 0) st.flankHits++;
      if (!tgt.alive) continue; // already killed this tick by someone else; damage still counts
      tgt.hp -= dmg;
      if (tgt.hp <= 0) {
        tgt.hp = 0;
        tgt.alive = false;
        tgt.deathT = this.t;
        tgt.firing = false;
        a.kills++;
        st.kills++;
        other.deaths++;
        this.aliveCount[tgt.team]--;
        this.events.push({ kind: 'kill', victim: tgt.id, killer: a.id, x: tgt.x, z: tgt.z });
      }
    }

    // 4. objective
    let rz = 0;
    let bz = 0;
    for (let i = 0; i < n; i++) {
      const a = ag[i];
      if (a.alive && this.inZone(a)) {
        if (a.team === RED) rz++;
        else bz++;
      }
    }
    if (cfg.roundMode === 'capture') this.stepCapture(dt);
    else if (rz > bz) this.score[RED] += cfg.zonePointsPerSecond * dt;
    else if (bz > rz) this.score[BLUE] += cfg.zonePointsPerSecond * dt;

    // 5. clock + termination
    this.t += dt;
    this.tick++;
    if (cfg.roundMode === 'capture') {
      this.endCapture();
      return;
    }
    if (this.aliveCount[RED] === 0 || this.aliveCount[BLUE] === 0) {
      const remaining = Math.max(0, cfg.matchSeconds - this.t);
      if (this.aliveCount[RED] > 0) this.score[RED] += remaining * cfg.zonePointsPerSecond;
      if (this.aliveCount[BLUE] > 0) this.score[BLUE] += remaining * cfg.zonePointsPerSecond;
      this.done = true;
    } else if (this.t >= cfg.matchSeconds - 1e-9) {
      this.done = true;
    }
    if (this.done) {
      if (this.score[RED] > this.score[BLUE] + 1e-9) this.winner = RED;
      else if (this.score[BLUE] > this.score[RED] + 1e-9) this.winner = BLUE;
      else this.winner = -1;
    }
  }

  /**
   * ROADMAP D2. Decide a symbol at most every `commIntervalTicks`, then push it down the wire. The quantiser
   * keeps the ACTION space continuous and discretises what comes out, the same way a visual percept is
   * reported through a quantiser rather than by changing what an eye is: `Math.round(v * tokens) / tokens`
   * gives `2*tokens+1` symbols, and the dead zone around 0 is what makes silence a choice rather than a
   * value a player cannot express.
   */
  /** Test/probe seam: push this agent's current intent onto the wire without stepping the world. */
  transmitFor(a: Agent): void { this.transmit(a); }

  private transmit(a: Agent): void {
    const cfg = this.cfg;
    const L = cfg.commDelayTicks + 1;
    const decide = cfg.commIntervalTicks <= 1 || this.tick % cfg.commIntervalTicks === 0;
    for (let c = 0; c < cfg.commDim; c++) {
      if (decide) {
        const v = a.comm[c];
        a.commSaid[c] = cfg.commTokens > 0
          ? Math.max(-1, Math.min(1, Math.round(v * cfg.commTokens) / cfg.commTokens))
          : v;
      }
      const base = (a.id * cfg.commDim + c) * L;
      for (let age = L - 1; age > 0; age--) this.commWire[base + age] = this.commWire[base + age - 1];
      this.commWire[base] = a.commSaid[c];
    }
  }

  /** What agent `i`'s slot `c` sounds like to a listener right now — `commDelayTicks` behind what he is saying. */
  heardComm(i: number, c: number): number {
    const L = this.cfg.commDelayTicks + 1;
    return this.commWire[(i * this.cfg.commDim + c) * L + (L - 1)];
  }

  /** Living attackers and defenders standing in site `si`. */
  private siteCounts(si: number): [number, number] {
    let atk = 0;
    let def = 0;
    for (const a of this.agents) {
      if (!a.alive || !this.inSite(a, si)) continue;
      if (a.team === this.attackers) atk++;
      else def++;
    }
    return [atk, def];
  }

  /**
   * ROADMAP C1a. Uncontested attacker occupancy fills the meter; filling it arms a countdown that runs on
   * its own clock from then on. Uncontested defender occupancy after that burns a defuse meter. Contested
   * means nobody makes progress — holding a site is something you have to be *alone* in to finish.
   */
  private stepCapture(dt: number): void {
    const cfg = this.cfg;
    if (this.armedSite < 0) {
      // Every site runs its own meter, and defenders can only be standing in one of them — which is exactly
      // what makes two sites a decision rather than a wider version of one.
      for (let si = 0; si < this.map.sites.length; si++) {
        const [atk, def] = this.siteCounts(si);
        if (atk > 0 && def === 0) this.capture[si] = Math.min(1, this.capture[si] + dt / cfg.captureSeconds);
        else if (atk === 0) this.capture[si] = Math.max(0, this.capture[si] - dt / cfg.captureSeconds);
        if (this.capture[si] >= 1) {
          this.armedSite = si;
          this.armedT = cfg.armedSeconds;
          break;
        }
      }
    } else {
      this.armedT -= dt; // keeps running whether or not an attacker is still alive — that is the point
      const [atk, def] = this.siteCounts(this.armedSite);
      if (def > 0 && atk === 0) this.defuse = Math.min(1, this.defuse + dt / cfg.defuseSeconds);
      else if (def === 0) this.defuse = Math.max(0, this.defuse - dt / cfg.defuseSeconds);
    }
    // The scoreboard field the HUD already carries: attacker progress vs defender progress.
    this.score[this.attackers] = Math.max(...this.capture) + (this.armedSite >= 0 ? 1 : 0);
    this.score[this.attackers === RED ? BLUE : RED] = this.defuse;
  }

  /** Round end for `capture` mode. Every branch is a rule; nothing is paid out for time not spent. */
  private endCapture(): void {
    const def: Team = this.attackers === RED ? BLUE : RED;
    if (this.armedSite >= 0) {
      if (this.defuse >= 1) { this.winner = def; this.done = true; }
      else if (this.armedT <= 0) { this.winner = this.attackers; this.done = true; }
      return; // an armed site outlives the round clock: it has to be defused or it goes off
    }
    if (this.aliveCount[this.attackers] === 0) { this.winner = def; this.done = true; return; }
    if (this.t >= this.cfg.matchSeconds - 1e-9) { this.winner = def; this.done = true; }
  }

  /** Cheap state fingerprint for determinism checks. */
  hash(): number {
    let h = 2166136261;
    const mix = (v: number) => {
      const x = Math.round(v * 1000) | 0;
      h ^= x;
      h = Math.imul(h, 16777619) >>> 0;
    };
    for (const a of this.agents) {
      mix(a.x); mix(a.z); mix(a.yaw); mix(a.hp); mix(a.alive ? 1 : 0); mix(a.ammo);
    }
    mix(this.score[0]); mix(this.score[1]); mix(this.tick);
    // Only mixed in capture mode, so koth fingerprints stay exactly what they were.
    if (this.cfg.roundMode === 'capture') { for (const c of this.capture) mix(c); mix(this.armedSite); mix(this.armedT); mix(this.defuse); }
    return h >>> 0;
  }
}
