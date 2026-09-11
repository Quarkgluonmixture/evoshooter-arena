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

export const SELF_BASE = 20;
export const MATE_FEATS_BASE = 6;
export const ENEMY_FEATS = 6;

export function obsDim(cfg: SimConfig): number {
  return SELF_BASE + cfg.teamSize + 5 + cfg.lidarRays + cfg.mateSlots * (MATE_FEATS_BASE + cfg.commDim) + cfg.enemySlots * ENEMY_FEATS;
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
  comm: Float32Array;
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
    spreadSum: 0, spreadTicks: 0, engageDistSum: 0, flankHits: 0,
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
  readonly stats: [TeamStats, TeamStats];
  readonly heat: [Float32Array, Float32Array] | null;
  readonly events: WorldEvent[] = [];
  score: [number, number] = [0, 0];
  aliveCount: [number, number];
  t = 0;
  tick = 0;
  done = false;
  /** -1 draw / undecided, 0 red, 1 blue */
  winner: -1 | 0 | 1 = -1;
  private readonly cosHalfFov: number;
  private readonly halfFov: number;
  private readonly cosAimCone: number;
  private readonly lidarDirs: Float32Array;
  private readonly pendingShots: number[] = [];

  constructor(cfg: SimConfig, map: ArenaMap, seed: number, opts: { heat?: boolean } = {}) {
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
    this.stats = [newStats(cfg.commDim), newStats(cfg.commDim)];
    this.aliveCount = [cfg.teamSize, cfg.teamSize];
    this.cosHalfFov = Math.cos((cfg.fovDeg * Math.PI) / 360);
    this.halfFov = (cfg.fovDeg * Math.PI) / 360;
    this.cosAimCone = Math.cos((cfg.aimConeDeg * Math.PI) / 180);
    this.lidarDirs = new Float32Array(cfg.lidarRays * 2);
    for (let k = 0; k < cfg.lidarRays; k++) {
      const a = (k * 2 * Math.PI) / cfg.lidarRays;
      this.lidarDirs[k * 2] = Math.cos(a);
      this.lidarDirs[k * 2 + 1] = Math.sin(a);
    }
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

  private lidar(a: Agent, out: Float32Array, off: number): void {
    const cfg = this.cfg;
    const sg = World.sgn(a.team);
    const half = cfg.arenaHalf;
    for (let k = 0; k < cfg.lidarRays; k++) {
      const dx = sg * this.lidarDirs[k * 2];
      const dz = sg * this.lidarDirs[k * 2 + 1];
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
      out[off + k] = Math.max(0, best) / cfg.lidarRange;
    }
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
        if (e > 0 && d > 1e-6 && (fx * dx + fz * dz) / d >= this.cosHalfFov) this.visible[i * n + j] = 1;
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

    // 3. per-team spread + zone counts + heat
    const zoneCount: [number, number] = [0, 0];
    for (let team = 0; team < 2; team++) {
      const base = team === RED ? 0 : T;
      let sum = 0;
      let pairs = 0;
      for (let i = 0; i < T; i++) {
        const a = ag[base + i];
        if (!a.alive) continue;
        if (this.inZone(a)) zoneCount[team]++;
        if (this.heat) {
          const cells = cfg.heatCells;
          const cx = Math.min(cells - 1, Math.max(0, Math.floor(((a.x + cfg.arenaHalf) / (2 * cfg.arenaHalf)) * cells)));
          const cz = Math.min(cells - 1, Math.max(0, Math.floor(((a.z + cfg.arenaHalf) / (2 * cfg.arenaHalf)) * cells)));
          this.heat[team][cz * cells + cx] += 1;
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
      o[p++] = this.inZone(a) ? 1 : 0;
      o[p++] = a.aim ? 1 : 0;
      o[p++] = timeLeft;
      o[p++] = (this.score[team] - this.score[enemyTeam]) / maxScore;
      o[p++] = Math.min(1, a.dmgRecent / 50);
      o[p++] = sg * a.hitDirX;
      o[p++] = sg * a.hitDirZ;
      o[p++] = a.cooldownT <= 0 && a.reloadT <= 0 && a.ammo > 0 ? 1 : 0;
      o[p++] = this.aliveCount[team] / T;
      o[p++] = this.aliveCount[enemyTeam] / T;
      o[p++] = speed / cfg.maxSpeed;
      for (let s = 0; s < T; s++) o[p++] = s === a.slot ? 1 : 0;

      // --- zone
      {
        const dx = this.map.zoneX - a.x;
        const dz = this.map.zoneZ - a.z;
        o[p++] = (sg * dx) / half;
        o[p++] = (sg * dz) / half;
        o[p++] = Math.min(1, Math.hypot(dx, dz) / half);
        o[p++] = zoneCount[team] / T;
        o[p++] = zoneCount[enemyTeam] / T;
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
          const dx = m.x - a.x;
          const dz = m.z - a.z;
          o[p++] = (sg * dx) / half;
          o[p++] = (sg * dz) / half;
          o[p++] = Math.min(1, Math.hypot(dx, dz) / half);
          o[p++] = m.alive ? 1 : 0;
          o[p++] = m.alive ? m.hp / cfg.hp : 0;
          o[p++] = m.alive && m.firing ? 1 : 0;
          for (let c = 0; c < cfg.commDim; c++) o[p++] = m.alive ? m.comm[c] : 0;
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
        const fresh = age <= cfg.memorySeconds;
        if (!vis && !fresh) continue;
        const qTrue = vis ? this.perceptQuality(a, en.x - a.x, en.z - a.z, this.exposure[i * n + id]) : 0;
        const live = vis ? this.reportQuality(a, en, qTrue) : 0;
        // while I can see him the belief is this tick's percept, and the stored contact is the same
        // number — what I remember is what I saw, not what was true
        const believed = vis ? this.perceive(a, en, en.x - a.x, en.z - a.z, live) : null;
        const recalled = fresh ? k.q * Math.max(0, 1 - age / cfg.memorySeconds) : 0; // a glimpse I barely got is a memory I barely hold
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
          o[p++] = vis ? 0 : Math.min(1, (this.t - kn.t) / cfg.memorySeconds);
        } else {
          for (let c = 0; c < ENEMY_FEATS; c++) o[p++] = 0;
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
        st.commSum[c] += a.comm[c];
        st.commSq[c] += a.comm[c] * a.comm[c];
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

    // 4. zone control scoring
    let rz = 0;
    let bz = 0;
    for (let i = 0; i < n; i++) {
      const a = ag[i];
      if (a.alive && this.inZone(a)) {
        if (a.team === RED) rz++;
        else bz++;
      }
    }
    if (rz > bz) this.score[RED] += cfg.zonePointsPerSecond * dt;
    else if (bz > rz) this.score[BLUE] += cfg.zonePointsPerSecond * dt;

    // 5. clock + termination
    this.t += dt;
    this.tick++;
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
    return h >>> 0;
  }
}
