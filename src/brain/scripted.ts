/**
 * Hand-written reference bots. They exist ONLY to validate that the environment rewards competence
 * (tests + baselines) — the evolving agents never see them and no tactic is scripted into the game.
 */
import type { Policy } from './policy.ts';
import type { SimConfig } from '../core/config.ts';
import { ACT_DIM, A_MOVE_X, A_MOVE_Z, A_FIRE, A_TARGET0, A_AIM, A_COMM0, type World } from '../sim/world.ts';
import { obsSchema } from '../sim/obsSchema.ts';
import { navDir } from '../sim/nav.ts';

export class IdlePolicy implements Policy {
  act(world: World, agent: number): void {
    world.act.fill(0, agent * ACT_DIM, (agent + 1) * ACT_DIM);
  }
}

/** Walks straight to the zone and shoots whatever is in slot 0. */
export class RusherPolicy implements Policy {
  act(world: World, agent: number): void {
    const off = agent * ACT_DIM;
    const act = world.act;
    act.fill(0, off, off + ACT_DIM);
    const a = world.agents[agent];
    const sg = a.team === 0 ? 1 : -1;
    const dx = world.map.zoneX - a.x;
    const dz = world.map.zoneZ - a.z;
    const d = Math.hypot(dx, dz);
    if (d > world.cfg.zoneRadius * 0.5) {
      act[off + A_MOVE_X] = (sg * dx) / d * 3;
      act[off + A_MOVE_Z] = (sg * dz) / d * 3;
    }
    act[off + A_FIRE] = 1;
    act[off + A_TARGET0] = 1;
  }
}

/** Stays at spawn in aim mode and shoots slot 0 — a pure defender. */
export class CamperPolicy implements Policy {
  act(world: World, agent: number): void {
    const off = agent * ACT_DIM;
    world.act.fill(0, off, off + ACT_DIM);
    world.act[off + A_FIRE] = 1;
    world.act[off + A_AIM] = 1;
    world.act[off + A_TARGET0] = 1;
  }
}

/* ---------------------------------------------------------------- C1c reference bots
 * These read engine truth directly — which site is armed, where the sites are. That is legal for a
 * reference bot and ONLY for a reference bot: ROADMAP C1's exit is stated as "scripted/reference agents can
 * show the world ALLOWS it", and CLAUDE.md forbids these ever entering the evolving population. Nothing
 * here is a tactic an agent can call; they exist so a human can ask the map a question and get an answer.
 */

/**
 * Walks to a named site, shooting whatever is in slot 0 on the way. `site` may be one index for the whole
 * team or one per team slot, because a team that cannot split across two sites cannot answer any of C1's
 * questions — and one Policy object serves all five bodies, so the split has to live in here.
 */
export class SiteAttackerPolicy implements Policy {
  private readonly site: number | number[];
  constructor(site: number | number[]) { this.site = site; }
  protected target(world: World, slot: number): number {
    void world;
    return Array.isArray(this.site) ? this.site[slot % this.site.length] : this.site;
  }
  /** How close to the site centre to get. Inside the radius means capturing; outside means only threatening. */
  protected stopAt(world: World, slot: number): number { void slot; return world.cfg.zoneRadius * 0.5; }
  act(world: World, agent: number): void {
    const off = agent * ACT_DIM;
    const act = world.act;
    act.fill(0, off, off + ACT_DIM);
    const a = world.agents[agent];
    const sg = a.team === 0 ? 1 : -1;
    const s = world.map.sites[Math.min(this.target(world, a.slot), world.map.sites.length - 1)];
    const d = Math.hypot(s.x - a.x, s.z - a.z);
    if (d > this.stopAt(world, a.slot)) {
      // Walk the navigation field rather than the straight line. The C1b screens are placed to break
      // sight-lines and they break naive movement too: the first version of these bots pinned themselves
      // against a screen and never reached a site, which made every exit question read FAIL for a reason
      // that had nothing to do with the world.
      const [gx, gz] = navDir(world.map, world.cfg, a.x, a.z, s.x, s.z);
      act[off + A_MOVE_X] = sg * gx * 3;
      act[off + A_MOVE_Z] = sg * gz * 3;
    }
    act[off + A_FIRE] = 1;
    act[off + A_TARGET0] = 1;
  }
}

/** Pressures one site, then leaves for another at a fixed time — the crudest possible fake. */
export class FakeAttackerPolicy extends SiteAttackerPolicy {
  private readonly second: number;
  private readonly switchAt: number;
  constructor(first: number, second: number, switchAt: number) {
    super(first);
    this.second = second;
    this.switchAt = switchAt;
  }
  protected override target(world: World, slot: number): number {
    return world.t < this.switchAt ? super.target(world, slot) : this.second;
  }
  /**
   * Before the switch it stands at the EDGE of the first site rather than in it. A "fake" that walks into
   * the site and captures it is not a fake, it is an attack that changes its mind — the first version did
   * exactly that and armed the site it was supposed to be pretending about.
   */
  protected override stopAt(world: World, slot: number): number {
    return world.t < this.switchAt ? world.cfg.zoneRadius * 1.25 : super.stopAt(world, slot);
  }
}

/** Holds one site, and goes to defuse whichever site actually got armed. */
export class SiteDefenderPolicy extends SiteAttackerPolicy {
  protected override target(world: World, slot: number): number {
    return world.armedSite >= 0 ? world.armedSite : super.target(world, slot);
  }
}

/**
 * Goes wherever the pressure is: counts living attackers near each site and converges on the busiest one.
 * This is the defender a fake is supposed to beat — a defender that never reacts cannot be faked out, and a
 * claim that "the fake pays" is empty unless it is measured against one that does.
 */
export class ReactiveDefenderPolicy extends SiteAttackerPolicy {
  protected override target(world: World, slot: number): number {
    if (world.armedSite >= 0) return world.armedSite;
    const near = world.map.sites.map(() => 0);
    const r = world.cfg.zoneRadius * 2.5;
    for (const a of world.agents) {
      if (!a.alive || a.team !== world.attackers) continue;
      world.map.sites.forEach((s, i) => { if (Math.hypot(a.x - s.x, a.z - s.z) < r) near[i]++; });
    }
    const best = near.indexOf(Math.max(...near));
    return Math.max(...near) > 0 ? best : super.target(world, slot);
  }
}

/** Leaves its site for the other one at a fixed time, on no information at all — a rotate that is too early. */
export class EagerRotateDefenderPolicy extends SiteAttackerPolicy {
  private readonly other: number;
  private readonly rotateAt: number;
  constructor(home: number | number[], other: number, rotateAt: number) {
    super(home);
    this.other = other;
    this.rotateAt = rotateAt;
  }
  protected override target(world: World, slot: number): number {
    if (world.armedSite >= 0) return world.armedSite;
    return world.t < this.rotateAt ? super.target(world, slot) : this.other;
  }
}

/**
 * Hunts with a MEMORY HORIZON: chases a visible enemy, and for `seconds` after losing sight keeps moving to
 * where it last saw him; after that it goes back to the objective. `seconds = 0` is a bot that forgets the
 * instant an enemy leaves its view.
 *
 * Built to answer one question without training anything: does this world PAY for temporal belief? Sweep the
 * horizon and see whether win rate follows it. If it does, memory has value here and evolution's failure to
 * use it is a search problem; if it does not, there is no demand to find. (ROADMAP D1, 2026-09-13.)
 *
 * Reads engine truth, like every reference bot, and must never enter the evolving population.
 */
export class MemoryHunterPolicy implements Policy {
  private readonly seconds: number;
  private readonly last: { x: number; z: number; t: number }[] = [];
  /** Memory is per-agent and MATCH-scoped: cleared when a different world shows up, because a reference bot
   *  carrying belief across matches would make a match depend on which matches ran before it (D1 step 1). */
  private world: World | null = null;
  constructor(seconds: number) { this.seconds = seconds; }

  /** The nearest enemy THIS agent can see. Overridden by the telepathy upper bound below. */
  protected visibleEnemy(world: World, agent: number): { x: number; z: number } | null {
    const me = world.agents[agent];
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const e of world.agents) {
      if (!e.alive || e.team === me.team) continue;
      if (!world.visible[agent * world.n + e.id]) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < bestD) { bestD = d; best = { x: e.x, z: e.z }; }
    }
    return best;
  }

  /** Where to go when there is nobody to chase or remember. Overridden by the radio listener below. */
  protected idleSite(world: World, agent: number): { x: number; z: number } {
    return world.map.sites[world.agents[agent].slot % world.map.sites.length];
  }

  act(world: World, agent: number): void {
    if (this.world !== world) {
      this.world = world;
      this.last.length = 0;
      for (let i = 0; i < world.n; i++) this.last.push({ x: 0, z: 0, t: -1e9 });
    }
    const off = agent * ACT_DIM;
    const act = world.act;
    act.fill(0, off, off + ACT_DIM);
    const a = world.agents[agent];
    const sg = a.team === 0 ? 1 : -1;

    const seen = this.visibleEnemy(world, agent);
    const mem = this.last[agent];
    if (seen) { mem.x = seen.x; mem.z = seen.z; mem.t = world.t; }

    // target: him if I can see him, else where he was if that is still fresh, else the objective
    let tx: number;
    let tz: number;
    let stop: number;
    if (seen) { tx = seen.x; tz = seen.z; stop = 2; }
    else if (world.t - mem.t <= this.seconds) { tx = mem.x; tz = mem.z; stop = 1.5; }
    else {
      const site = this.idleSite(world, agent);
      tx = site.x;
      tz = site.z;
      stop = world.cfg.zoneRadius * 0.5;
    }
    if (Math.hypot(tx - a.x, tz - a.z) > stop) {
      const [gx, gz] = navDir(world.map, world.cfg, a.x, a.z, tx, tz);
      act[off + A_MOVE_X] = sg * gx * 3;
      act[off + A_MOVE_Z] = sg * gz * 3;
    }
    act[off + A_FIRE] = 1;
    act[off + A_TARGET0] = 1;
  }
}

/**
 * Like `MemoryHunterPolicy`, but it reacts to the nearest enemy visible to ANY of its teammates — perfect,
 * instant, free communication. An UPPER BOUND on what a radio could ever buy, not a legal policy.
 *
 * Its only job is to answer "does this world pay for sharing contacts at all?" before anyone tunes a channel
 * or reads meaning into one. Same method as `MemoryHunterPolicy`: ask the world first, then ask whether
 * evolution can find it.
 */
export class TeamSightHunterPolicy extends MemoryHunterPolicy {
  protected override visibleEnemy(world: World, agent: number): { x: number; z: number } | null {
    const me = world.agents[agent];
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const e of world.agents) {
      if (!e.alive || e.team === me.team) continue;
      let seenByAnyone = false;
      for (const mate of world.agents) {
        if (!mate.alive || mate.team !== me.team) continue;
        if (world.visible[mate.id * world.n + e.id]) { seenByAnyone = true; break; }
      }
      if (!seenByAnyone) continue;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < bestD) { bestD = d; best = { x: e.x, z: e.z }; }
    }
    return best;
  }
}

/**
 * ROADMAP D2c. A `MemoryHunterPolicy(0)` whose ONE extra source of information is the real radio — what a
 * finite, delayed, quantised channel can buy, measured next to the telepathy upper bound above.
 *
 * Speaker: while I can see an enemy, I transmit which site he is nearest (+1 for the site on my team's left in
 * its own frame, -1 for the other) and silence otherwise. One symbol, the crudest callout there is.
 * Listener: reads ONLY its own observation's `mate*.comm0` fields, so the world's quantiser, send interval and
 * delay all apply; while a teammate is calling, it goes to the called site instead of its own.
 *
 * ⛔ The protocol is hand-written, which is exactly why it lives here and never in a population: it asks the
 * world what a legal radio is worth, it is not a vocabulary for anyone to inherit (VISION §7.1).
 * With every teammate message muted it must play bit-identically to `MemoryHunterPolicy(0)` —
 * `scripts/radiodemand.ts` asserts that, and it is the proof that the radio is the only thing this adds.
 */
export class RadioCallerPolicy extends MemoryHunterPolicy {
  private commIdx: number[] = [];
  private idxFor: SimConfig | null = null;
  constructor() { super(0); }

  /** index of the site on `team`'s left in its own frame */
  private static leftSite(world: World, team: number): number {
    const sg = team === 0 ? 1 : -1;
    let best = 0;
    world.map.sites.forEach((s, i) => { if (sg * s.x < sg * world.map.sites[best].x) best = i; });
    return best;
  }

  private heardSite(world: World, agent: number): number {
    if (this.idxFor !== world.cfg) {
      this.idxFor = world.cfg;
      this.commIdx = obsSchema(world.cfg).filter((f) => /^mate\d+\.comm0$/.test(f.name)).map((f) => f.index);
    }
    const base = agent * world.obsDim;
    for (const idx of this.commIdx) {
      const v = world.obs[base + idx];
      if (Math.abs(v) < 0.25) continue;
      const left = RadioCallerPolicy.leftSite(world, world.agents[agent].team);
      return v > 0 || world.map.sites.length < 2 ? left : 1 - left;
    }
    return -1;
  }

  protected override idleSite(world: World, agent: number): { x: number; z: number } {
    const s = this.heardSite(world, agent);
    return s >= 0 ? world.map.sites[s] : super.idleSite(world, agent);
  }

  override act(world: World, agent: number): void {
    super.act(world, agent);
    const seen = this.visibleEnemy(world, agent);
    let say = 0;
    if (seen) {
      const sites = world.map.sites;
      let near = 0;
      sites.forEach((s, i) => { if (Math.hypot(s.x - seen.x, s.z - seen.z) < Math.hypot(sites[near].x - seen.x, sites[near].z - seen.z)) near = i; });
      // ±3 saturates tanh (0.995), which every quantiser setting rounds to its outermost symbol
      say = near === RadioCallerPolicy.leftSite(world, world.agents[agent].team) ? 3 : -3;
    }
    world.act[agent * ACT_DIM + A_COMM0] = say;
  }
}

/** Rushes the zone but never fires — isolates "shooting matters" in tests. */
export class PacifistRusherPolicy implements Policy {
  private inner = new RusherPolicy();
  act(world: World, agent: number): void {
    this.inner.act(world, agent);
    world.act[agent * ACT_DIM + A_FIRE] = -1;
  }
}
