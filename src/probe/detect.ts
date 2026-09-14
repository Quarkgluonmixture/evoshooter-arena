/**
 * ROADMAP G2 — read-only tactic detectors. First one: the TRADE (VISION §9.1).
 *
 * ⚠ ANALYSIS ONLY. ⛔ No detector result may enter the live sim, be fed to a policy, or become a reward: the T8
 * firewall (`tests/leak.test.ts`) forbids src/sim, src/brain, src/evo, src/worker, src/render and src/ui from
 * importing anything under src/probe. These names exist so a human can ask "how often does this shape happen",
 * ⛔ not so an agent can be told to do it.
 *
 * ⚠ Form is not function (DISCOVERY-EXPLAINABILITY-CONTRACT): a trade-shaped pair of kills can happen because two
 * players shot the same enemy by accident, so `tradeStats` carries a same-match null to compare against.
 */
import { Rng } from '../core/rng.ts';

/** One kill as the spectator channel reports it, plus when and where it happened. */
export interface KillRecord {
  tick: number;
  killer: number;
  victim: number;
  x: number;
  z: number;
}

export interface TradeOptions {
  /** how long after a kill the answer still counts as a trade */
  windowSeconds: number;
  /** how far away the answering kill may be and still be the same fight */
  radius: number;
  dt: number;
  teamSize: number;
}

export interface TradeStats {
  deaths: number;
  /** deaths whose killer was killed back by a teammate inside the window AND inside the radius */
  traded: number;
  /** same, but the answer landed further away than `radius` — counted apart, not as a trade */
  far: number;
  /** seconds between the death and the answering kill, sorted */
  gaps: number[];
  /** mean traded/deaths over `nulls` redraws that keep who killed whom and move only WHEN the answer happened */
  nullRate: number;
  /** the first trade, for a replay anchor: tick of the death */
  firstAt: number | null;
}

const teamOf = (agent: number, teamSize: number): 0 | 1 => (agent < teamSize ? 0 : 1);

/**
 * Trades suffered by `team`: one of its players died, and one of its other players killed that killer within the
 * window. `nulls` shuffles only the TIME of each answering kill inside the match, which is the question "would
 * this window catch a coincidence at this kill density?" — the same kills, the same pairs, a different clock.
 */
export function tradeStats(kills: KillRecord[], team: 0 | 1, opts: TradeOptions, matchTicks: number, seed = 991, nulls = 64): TradeStats {
  const { windowSeconds, radius, dt, teamSize } = opts;
  const windowTicks = windowSeconds / dt;
  const mine = kills.filter((k) => teamOf(k.victim, teamSize) === team);
  const answers = kills.filter((k) => teamOf(k.killer, teamSize) === team);
  const out: TradeStats = { deaths: mine.length, traded: 0, far: 0, gaps: [], nullRate: 0, firstAt: null };

  for (const death of mine) {
    let best: { gap: number; far: boolean } | null = null;
    for (const ans of answers) {
      if (ans.victim !== death.killer) continue;          // the answer must land on the killer
      if (ans.killer === death.victim) continue;          // a corpse cannot trade itself
      const gap = ans.tick - death.tick;
      if (gap < 0 || gap > windowTicks) continue;
      const far = Math.hypot(ans.x - death.x, ans.z - death.z) > radius;
      if (!best || gap < best.gap) best = { gap, far };
    }
    if (!best) continue;
    if (best.far) out.far++;
    else {
      out.traded++;
      out.gaps.push(best.gap * dt);
      if (out.firstAt === null) out.firstAt = death.tick;
    }
  }
  out.gaps.sort((a, b) => a - b);

  if (mine.length && answers.length) {
    const rng = new Rng(seed);
    let hits = 0;
    for (let r = 0; r < nulls; r++) {
      const moved = answers.map((a) => ({ ...a, tick: rng.int(Math.max(1, matchTicks)) }));
      for (const death of mine) {
        for (const ans of moved) {
          if (ans.victim !== death.killer || ans.killer === death.victim) continue;
          const gap = ans.tick - death.tick;
          if (gap < 0 || gap > windowTicks) continue;
          if (Math.hypot(ans.x - death.x, ans.z - death.z) > radius) continue;
          hits++;
          break;
        }
      }
    }
    out.nullRate = hits / (nulls * mine.length);
  }
  return out;
}

export const median = (xs: number[]): number => (xs.length ? xs[(xs.length - 1) >> 1] : NaN);
