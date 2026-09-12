/**
 * Hand-written reference bots. They exist ONLY to validate that the environment rewards competence
 * (tests + baselines) — the evolving agents never see them and no tactic is scripted into the game.
 */
import type { Policy } from './policy.ts';
import { ACT_DIM, A_MOVE_X, A_MOVE_Z, A_FIRE, A_TARGET0, A_AIM, type World } from '../sim/world.ts';
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

/** Rushes the zone but never fires — isolates "shooting matters" in tests. */
export class PacifistRusherPolicy implements Policy {
  private inner = new RusherPolicy();
  act(world: World, agent: number): void {
    this.inner.act(world, agent);
    world.act[agent * ACT_DIM + A_FIRE] = -1;
  }
}
