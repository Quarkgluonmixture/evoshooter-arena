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
  /** enemies of the KILLER's team still alive right after this kill — the denominator of the conditional null */
  aliveEnemies: [number, number];
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
  /** deaths with at least one qualifying teammate kill (inside window and radius) — the conditional denominator */
  answered: number;
  /** expected trades if each qualifying kill had picked uniformly among the enemies alive at that moment */
  chance: number;
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
  const out: TradeStats = { deaths: mine.length, traded: 0, far: 0, gaps: [], nullRate: 0, firstAt: null, answered: 0, chance: 0 };
  const enemy: 0 | 1 = team === 0 ? 1 : 0;

  for (const death of mine) {
    let best: { gap: number; far: boolean } | null = null;
    // every teammate kill inside the window and radius, whoever it landed on: the conditional null's opportunities
    let miss = 1;
    let qualifying = 0;
    for (const ans of answers) {
      if (ans.killer === death.victim) continue;          // a corpse cannot trade itself
      const gap = ans.tick - death.tick;
      if (gap < 0 || gap > windowTicks) continue;
      const far = Math.hypot(ans.x - death.x, ans.z - death.z) > radius;
      if (!far) {
        qualifying++;
        const alive = Math.max(1, ans.aliveEnemies[enemy]);
        miss *= 1 - 1 / alive;                            // …would a uniform pick have hit the killer?
      }
      if (ans.victim !== death.killer) continue;          // from here on, only the answer that landed ON the killer
      if (!best || gap < best.gap) best = { gap, far };
    }
    if (qualifying > 0) {
      out.answered++;
      out.chance += 1 - miss;
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

/* ------------------------------------------------------------------ crossfire (ROADMAP G2, VISION §9.4) */

export interface CrossfireStats {
  /** ticks where at least one of the observed team could legally see an enemy (the denominator) */
  seenTicks: number;
  /** of those, ticks where >= 2 teammates saw the same enemy from at least `minSeparation` apart */
  crossTicks: number;
  /** separations (degrees) on every tick where >= 2 saw the same enemy, for the median */
  separations: number[];
  /** damage the observed team dealt on crossfire ticks, and in total — is the shape where the fighting happens? */
  crossDamage: number;
  totalDamage: number;
  /** first crossfire tick, for a replay anchor */
  firstAt: number | null;
}

export function newCrossfireStats(): CrossfireStats {
  return { seenTicks: 0, crossTicks: 0, separations: [], crossDamage: 0, totalDamage: 0, firstAt: null };
}

/**
 * Accumulate one tick. `angleAt(e, i, j)` is the angle at enemy `e` between teammates `i` and `j`, which is what
 * "covered from two directions" means geometrically — ⛔ not the angle at the teammates, which two players standing
 * side by side would also satisfy at long range.
 *
 * ⚠ Uses `world.visible`, the LEGAL percept matrix: this asks who COULD see the enemy, not who was aiming at it.
 */
export function crossfireTick(
  st: CrossfireStats,
  opts: { team: 0 | 1; teamSize: number; n: number; tick: number; minSeparationDeg: number },
  alive: (id: number) => boolean,
  pos: (id: number) => { x: number; z: number },
  visible: (viewer: number, target: number) => boolean,
  damageThisTick: number,
): void {
  const { team, teamSize, n, tick, minSeparationDeg } = opts;
  const base = team === 0 ? 0 : teamSize;
  const enemyBase = team === 0 ? teamSize : 0;
  let anySeen = false;
  let anyCross = false;
  let bestSep = 0;
  for (let e = enemyBase; e < enemyBase + teamSize && e < n; e++) {
    if (!alive(e)) continue;
    const seers: number[] = [];
    for (let i = base; i < base + teamSize && i < n; i++) if (alive(i) && visible(i, e)) seers.push(i);
    if (seers.length === 0) continue;
    anySeen = true;
    if (seers.length < 2) continue;
    const ep = pos(e);
    let sep = 0;
    for (let a = 0; a < seers.length; a++) {
      for (let b = a + 1; b < seers.length; b++) {
        const pa = pos(seers[a]);
        const pb = pos(seers[b]);
        const angA = Math.atan2(pa.z - ep.z, pa.x - ep.x);
        const angB = Math.atan2(pb.z - ep.z, pb.x - ep.x);
        let d = Math.abs(angA - angB);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > sep) sep = d;
      }
    }
    const deg = (sep * 180) / Math.PI;
    if (deg > bestSep) bestSep = deg;
    if (deg >= minSeparationDeg) anyCross = true;
  }
  if (!anySeen) return;
  st.seenTicks++;
  if (bestSep > 0) st.separations.push(bestSep);
  st.totalDamage += damageThisTick;
  if (anyCross) {
    st.crossTicks++;
    st.crossDamage += damageThisTick;
    if (st.firstAt === null) st.firstAt = tick;
  }
}
