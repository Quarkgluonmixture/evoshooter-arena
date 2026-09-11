/**
 * Hand-written reference bots. They exist ONLY to validate that the environment rewards competence
 * (tests + baselines) — the evolving agents never see them and no tactic is scripted into the game.
 */
import type { Policy } from './policy.ts';
import { ACT_DIM, A_MOVE_X, A_MOVE_Z, A_FIRE, A_TARGET0, A_AIM, type World } from '../sim/world.ts';

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

/** Rushes the zone but never fires — isolates "shooting matters" in tests. */
export class PacifistRusherPolicy implements Policy {
  private inner = new RusherPolicy();
  act(world: World, agent: number): void {
    this.inner.act(world, agent);
    world.act[agent * ACT_DIM + A_FIRE] = -1;
  }
}
