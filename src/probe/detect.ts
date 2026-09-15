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
  opts: { team: 0 | 1; teamSize: number; n: number; tick: number; minSeparationDeg: number; minRange: number },
  alive: (id: number) => boolean,
  pos: (id: number) => { x: number; z: number },
  visible: (viewer: number, target: number) => boolean,
  damageThisTick: number,
): void {
  const { team, teamSize, n, tick, minSeparationDeg, minRange } = opts;
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
    // ⚠ the angle alone conflates flanking with proximity: two bodies standing together subtend a wide angle at an
    // enemy one metre away. Both seers must be at least `minRange` from the enemy for the pair to count.
    const far = (id: number) => Math.hypot(pos(id).x - ep.x, pos(id).z - ep.z) >= minRange;
    for (let a = 0; a < seers.length; a++) {
      if (!far(seers[a])) continue;
      for (let b = a + 1; b < seers.length; b++) {
        if (!far(seers[b])) continue;
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

/* ------------------------------------------------------------------ rotate / pressure → switch (G2) */

/** Per tick: where each defender stood, and which site the attackers were massing on (−1 = tie / nobody). */
export interface RotateTrace {
  /** defenders[t][k] = {x,z} of the k-th defender at tick t (dead players keep their last position) */
  defenders: { x: number; z: number }[][];
  /** hot[t] = index of the site with more attackers within the radius, or −1 */
  hot: number[];
  sites: { x: number; z: number }[];
}

export interface RotateStats {
  /** defender-steps where the defender started nearer the COLD site — the only steps a rotation could happen in */
  opportunities: number;
  rotations: number;
  /** seconds from the step's start to the tick the defender became nearer the hot site */
  lags: number[];
  firstAt: number | null;
}

const nearer = (p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }): boolean =>
  Math.hypot(p.x - a.x, p.z - a.z) < Math.hypot(p.x - b.x, p.z - b.z);

/**
 * Score `trace.defenders` against `pressure.hot`. Passing a DIFFERENT match's `hot` timeline is the null: the same
 * real movement, someone else's pressure. If the two rates match, the movement is not a response to pressure.
 * ⚠ Both traces must come from the same map and the same match length; the caller passes matched pairs.
 */
export function rotateStats(trace: RotateTrace, pressure: Pick<RotateTrace, 'hot'>, stepTicks: number, horizonTicks: number, dt: number): RotateStats {
  const out: RotateStats = { opportunities: 0, rotations: 0, lags: [], firstAt: null };
  const T = Math.min(trace.defenders.length, pressure.hot.length);
  for (let t = 0; t + horizonTicks < T; t += stepTicks) {
    const hot = pressure.hot[t];
    if (hot < 0) continue;
    const cold = hot === 0 ? 1 : 0;
    const hotSite = trace.sites[hot];
    const coldSite = trace.sites[cold];
    const row = trace.defenders[t];
    for (let k = 0; k < row.length; k++) {
      if (!nearer(row[k], coldSite, hotSite)) continue;   // already on the hot side: nothing to rotate
      out.opportunities++;
      for (let u = t + 1; u <= t + horizonTicks; u++) {
        if (nearer(trace.defenders[u][k], hotSite, coldSite)) {
          out.rotations++;
          out.lags.push((u - t) * dt);
          if (out.firstAt === null) out.firstAt = t;
          break;
        }
      }
    }
  }
  out.lags.sort((a, b) => a - b);
  return out;
}

/* ------------------------------------------------------------------ man-disadvantage tempo (G2) */

/** Per tick: how fast each observed player moved, and the head count its team was playing under. */
export interface TempoTrace {
  /** speed[t][k] = m/s of the k-th observed player at tick t, NaN while dead (dead men have no tempo) */
  speed: number[][];
  /** delta[t] = alive(observed) − alive(enemy) at tick t */
  delta: number[];
}

/** One player's mean speed in each head-count state. NaN where the player spent less than `minTicks` there. */
export interface TempoPair {
  down: number;
  even: number;
  up: number;
  downTicks: number;
  evenTicks: number;
  upTicks: number;
}

/**
 * Split each player's speeds by the head count in `delta`. Passing a DIFFERENT match's `delta` is the null: the same
 * real movement under someone else's head count. The comparison is WITHIN a player on purpose — the players who live
 * long enough to be down a man are the passive ones, so a team-level mean would read that selection as a slowdown.
 *
 * ⚠ `delta` may come from another match; only the ticks both traces have are scored.
 */
export function tempoPairs(trace: TempoTrace, delta: number[], minTicks: number): TempoPair[] {
  const T = Math.min(trace.speed.length, delta.length);
  const players = trace.speed.length ? trace.speed[0].length : 0;
  const sum = [0, 1, 2].map(() => new Float64Array(players));
  const cnt = [0, 1, 2].map(() => new Float64Array(players));
  for (let t = 0; t < T; t++) {
    const state = delta[t] < 0 ? 0 : delta[t] === 0 ? 1 : 2;
    const row = trace.speed[t];
    for (let k = 0; k < players; k++) {
      const v = row[k];
      if (Number.isNaN(v)) continue;                     // dead
      sum[state][k] += v;
      cnt[state][k]++;
    }
  }
  const at = (s: number, k: number) => (cnt[s][k] >= minTicks ? sum[s][k] / cnt[s][k] : NaN);
  return Array.from({ length: players }, (_, k) => ({
    down: at(0, k), even: at(1, k), up: at(2, k),
    downTicks: cnt[0][k], evenTicks: cnt[1][k], upTicks: cnt[2][k],
  }));
}

/** Mean and its standard error — a single null draw is not a standard error (GOTCHAS #32). */
export function meanSE(xs: number[]): { mean: number; se: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: NaN, se: NaN, n };
  const mu = xs.reduce((t, x) => t + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((t, x) => t + (x - mu) * (x - mu), 0) / Math.max(1, n - 1));
  return { mean: mu, se: sd / Math.sqrt(n), n };
}

/* ------------------------------------------------------------------ isolated / lurk-like path (G2) */

/** One match, one observed team: who was out of support, and who was even eligible to be. */
export interface LurkMatch {
  /** isolated[t][k] — player k had no living teammate inside the support radius on tick t */
  isolated: boolean[][];
  /** counted[t][k] — player k was alive on tick t AND had at least 2 living teammates (a dead team is not a lurk) */
  counted: boolean[][];
  /** speed[t][k] in m/s, and the damage/kills that player produced on that tick — ⛔ NOT part of any gate.
   *  They exist because the frozen LIMITS say a player who is lost or dead-ended behind geometry reads exactly
   *  like a lurker: a body that never moves and never fights is a stuck body, whatever the shape says. */
  speed: number[][];
  dealt: number[][];
  taken: number[][];
  kills: number[][];
}

export interface LurkStats {
  /** eligible player-ticks — the denominator, printed so a ratio is never read off an empty one (族 B) */
  aliveTicks: number;
  isolatedTicks: number;
  /** isolated ticks per slot, and the eligible ticks each slot had — ⭐ a slot that is simply ALIVE longer would
   *  collect more isolated ticks, so the per-slot SHARE is the honest read, not the raw count (族 B) */
  perSlot: number[];
  perSlotAlive: number[];
  /** runs of >= minTicks consecutive isolated ticks */
  episodes: number;
  /** their lengths in ticks, sorted */
  lengths: number[];
  /** tick the first qualifying episode started, for a replay anchor */
  firstAt: number | null;
  /** inside qualifying episodes only: how the isolated player actually behaved (descriptive, ⛔ never a gate) */
  epTicks: number;
  epSpeedSum: number;
  epDealt: number;
  epTaken: number;
  epKills: number;
}

/**
 * Score one match. An episode has to be CONSECUTIVE: a player who flickers in and out of support is inside a fight,
 * not playing away from it, and the 2 s floor is the measured length of a whole fight (first damage to death p75).
 */
export function lurkMatchStats(m: LurkMatch, minTicks: number): LurkStats {
  const T = m.isolated.length;
  const players = T ? m.isolated[0].length : 0;
  const out: LurkStats = {
    aliveTicks: 0, isolatedTicks: 0, perSlot: new Array(players).fill(0), perSlotAlive: new Array(players).fill(0),
    episodes: 0, lengths: [], firstAt: null,
    epTicks: 0, epSpeedSum: 0, epDealt: 0, epTaken: 0, epKills: 0,
  };
  const run = new Array(players).fill(0);
  const start = new Array(players).fill(0);
  // buffered per-run behaviour, banked only if the run turns out to BE an episode
  const buf = Array.from({ length: players }, () => ({ speed: 0, dealt: 0, taken: 0, kills: 0 }));
  const close = (k: number) => {
    if (run[k] >= minTicks) {
      out.episodes++;
      out.lengths.push(run[k]);
      if (out.firstAt === null || start[k] < out.firstAt) out.firstAt = start[k];
      out.epTicks += run[k];
      out.epSpeedSum += buf[k].speed;
      out.epDealt += buf[k].dealt;
      out.epTaken += buf[k].taken;
      out.epKills += buf[k].kills;
    }
    run[k] = 0;
    buf[k] = { speed: 0, dealt: 0, taken: 0, kills: 0 };
  };
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < players; k++) {
      if (!m.counted[t][k]) { close(k); continue; }
      out.aliveTicks++;
      out.perSlotAlive[k]++;
      if (!m.isolated[t][k]) { close(k); continue; }
      out.isolatedTicks++;
      out.perSlot[k]++;
      if (run[k] === 0) start[k] = t;
      run[k]++;
      buf[k].speed += m.speed[t][k];
      buf[k].dealt += m.dealt[t][k];
      buf[k].taken += m.taken[t][k];
      buf[k].kills += m.kills[t][k];
    }
  }
  for (let k = 0; k < players; k++) close(k);
  out.lengths.sort((a, b) => a - b);
  return out;
}

/**
 * Is the SAME slot carrying the isolation across matches? `perMatch[m][k]` = isolated ticks of slot k in match m.
 *
 * The null permutes each match's slot labels INDEPENDENTLY and re-pools. Everything real survives it — how much
 * isolation there was, when, and in which match — and only the alignment of identity across matches is destroyed.
 * ⭐ That is why this question is askable here and tempo's was not (GOTCHAS #35): nothing in it touches the clock.
 */
export function slotConcentration(perMatch: number[][], redraws: number, seed: number): {
  top: number; topSlot: number; total: number; nullMean: number; nullSE: number;
} {
  const players = perMatch.length ? perMatch[0].length : 0;
  const pooled = new Array(players).fill(0);
  for (const row of perMatch) for (let k = 0; k < players; k++) pooled[k] += row[k];
  const total = pooled.reduce((a, b) => a + b, 0);
  if (!total) return { top: NaN, topSlot: -1, total: 0, nullMean: NaN, nullSE: NaN };
  const topSlot = pooled.indexOf(Math.max(...pooled));
  const rng = new Rng(seed);
  const draws: number[] = [];
  for (let r = 0; r < redraws; r++) {
    const acc = new Array(players).fill(0);
    for (const row of perMatch) {
      const perm = Array.from({ length: players }, (_, i) => i);
      for (let i = players - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = perm[i];
        perm[i] = perm[j];
        perm[j] = tmp;
      }
      for (let k = 0; k < players; k++) acc[k] += row[perm[k]];
    }
    draws.push(Math.max(...acc) / total);
  }
  const ms = meanSE(draws);
  return { top: pooled[topSlot] / total, topSlot, total, nullMean: ms.mean, nullSE: ms.se };
}

/* ------------------------------------------------------------------ pair coordination (G2) */

/**
 * WHO IS WHOSE NEAREST, per tick. A distance threshold cannot ask this question in a world whose teams move as a
 * clump (champion pairwise distance runs p25 3.3 m to p75 13.0 m, 32% of pair-ticks inside 4 m): "are they
 * together" is saturated. The nearest-teammate RELATION is not — it is a ranking inside the clump.
 */
export interface PairCounts {
  /** counts[i][j] = ticks where j was i's nearest living teammate */
  counts: number[][];
  /** eligible[i] = ticks where i was alive with at least one living teammate — i's own denominator */
  eligible: number[];
}

export function newPairCounts(players: number): PairCounts {
  return {
    counts: Array.from({ length: players }, () => new Array(players).fill(0)),
    eligible: new Array(players).fill(0),
  };
}

/** Accumulate one tick from an already-resolved `nearest` row (−1 = dead, or nobody left to be near). */
export function pairTick(pc: PairCounts, nearest: number[]): void {
  for (let i = 0; i < nearest.length; i++) {
    if (nearest[i] < 0) continue;
    pc.eligible[i]++;
    pc.counts[i][nearest[i]]++;
  }
}

/**
 * Mutual pairs, strongest first. `strength(i,j) = min(P(i->j), P(j->i))`: BOTH have to point at each other, which
 * is what separates a pair from one player trailing someone who is busy with somebody else.
 */
export function topMutual(pc: PairCounts): { i: number; j: number; strength: number }[] {
  const n = pc.eligible.length;
  const p = (i: number, j: number) => (pc.eligible[i] ? pc.counts[i][j] / pc.eligible[i] : 0);
  const out: { i: number; j: number; strength: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push({ i, j, strength: Math.min(p(i, j), p(j, i)) });
  return out.sort((a, b) => b.strength - a.strength);
}

/** Pool per-match counts into one matrix. */
export function poolPairs(per: PairCounts[], players: number): PairCounts {
  const out = newPairCounts(players);
  for (const m of per) {
    for (let i = 0; i < players; i++) {
      out.eligible[i] += m.eligible[i];
      for (let j = 0; j < players; j++) out.counts[i][j] += m.counts[i][j];
    }
  }
  return out;
}

/**
 * The null for "is it the SAME pair across matches": relabel each match's slots independently and re-pool, then
 * take the strongest mutual pair again. Every trajectory, every fight, the clock and the existence of pair
 * structure WITHIN a match survive; only the recurrence of one pair across matches is destroyed.
 * ⛔ Deliberately not a between-match permutation — that family is what GOTCHAS #35 is about.
 */
export function pairNull(per: PairCounts[], players: number, redraws: number, seed: number): { mean: number; se: number } {
  const rng = new Rng(seed);
  const draws: number[] = [];
  for (let r = 0; r < redraws; r++) {
    const acc = newPairCounts(players);
    for (const m of per) {
      const perm = Array.from({ length: players }, (_, i) => i);
      for (let i = players - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = perm[i];
        perm[i] = perm[j];
        perm[j] = tmp;
      }
      for (let i = 0; i < players; i++) {
        acc.eligible[perm[i]] += m.eligible[i];
        for (let j = 0; j < players; j++) acc.counts[perm[i]][perm[j]] += m.counts[i][j];
      }
    }
    draws.push(topMutual(acc)[0]?.strength ?? 0);
  }
  return meanSE(draws);
}
