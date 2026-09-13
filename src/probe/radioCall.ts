/**
 * Radio probe plumbing: which teammate a listener hears in each mate slot, and an injector that writes the one-symbol
 * site callout into what a team HEARS (behind `scripts/commstep.ts` and `scripts/uptake.ts`). The protocol itself is
 * `siteCall` in src/brain/scripted.ts, the single definition shared with `RadioCallerPolicy`, so every D2 probe asks the
 * world the same question in the same words. `scripts/radiouse.ts` uses the slot → speaker mapping.
 *
 * ⚠ ANALYSIS ONLY. ⛔ Nothing in a shipped training path may import this file (VISION §7.1: messages have no preset
 * meaning), and the simulation graph cannot: `tests/leak.test.ts` (SUBSTRATE T8) forbids src/sim, src/brain, src/evo,
 * src/worker, src/render and src/ui from importing anything under src/probe.
 */
import type { SimConfig } from '../core/config.ts';
import type { World } from '../sim/world.ts';
import { obsSchema } from '../sim/obsSchema.ts';
import { siteCall } from '../brain/scripted.ts';

/**
 * normal  — the true call;
 * flipped — +1 <-> -1: same timing and silence pattern, wrong site (the in-distribution control, GOTCHAS #24);
 * off     — silence.
 */
export type CallMode = 'normal' | 'flipped' | 'off';

/** Observation indices of every mate slot's `dx` field and `comm*` fields. */
export function mateFields(sim: SimConfig): { dx: number[]; comm: number[][] } {
  const schema = obsSchema(sim);
  const at = (name: string) => {
    const f = schema.find((x) => x.name === name);
    if (!f) throw new Error(`observation has no field ${name}`);
    return f.index;
  };
  return {
    dx: Array.from({ length: sim.mateSlots }, (_, s) => at(`mate${s}.dx`)),
    comm: Array.from({ length: sim.mateSlots }, (_, s) => Array.from({ length: sim.commDim }, (_, c) => at(`mate${s}.comm${c}`))),
  };
}

/**
 * The teammate occupying each of `listener`'s mate slots this tick, as agent ids in slot order (`out` is reused).
 * ⚠ A second copy of world.observe()'s ordering (alive first, then nearest) — so every call checks it against the
 * observation's `mate*.dx` and throws on drift. Call it only after observe(), i.e. inside an `afterObserve` edit.
 */
export function mateSlotSpeakers(w: World, sim: SimConfig, listener: number, dx: number[], out: number[]): number[] {
  const a = w.agents[listener];
  const T = sim.teamSize;
  const myBase = a.team === 0 ? 0 : T;
  const sg = a.team === 0 ? 1 : -1;
  out.length = 0;
  for (let m = 0; m < T; m++) if (myBase + m !== a.id) out.push(myBase + m);
  out.sort((u, v) => {
    const A = w.agents[u];
    const B = w.agents[v];
    if (A.alive !== B.alive) return A.alive ? -1 : 1;
    return Math.hypot(A.x - a.x, A.z - a.z) - Math.hypot(B.x - a.x, B.z - a.z);
  });
  if (out.length > sim.mateSlots) out.length = sim.mateSlots;
  const base = a.id * w.obsDim;
  for (let s = 0; s < out.length; s++) {
    const m = w.agents[out[s]];
    const expect = m.alive ? (sg * (m.x - a.x)) / sim.arenaHalf : 0;
    if (Math.abs(w.obs[base + dx[s]] - expect) > 1e-4) {
      throw new Error(`teammate ordering drifted from world.observe(): slot ${s} dx ${w.obs[base + dx[s]]} != ${expect}`);
    }
  }
  return out;
}

/**
 * An `afterObserve` edit that overwrites every radio message the listed teams hear with site calls: slot 0 gets
 * the call of the teammate in that mate slot, the other comm slots go silent. Instant — it ignores the radio's
 * interval and delay. `stats` counts writes and non-silent writes, the denominator behind any reading.
 */
export function injectCalls(sim: SimConfig, teams: readonly (0 | 1)[], mode: CallMode = 'normal') {
  const { dx, comm } = mateFields(sim);
  const stats = { written: 0, calling: 0 };
  const order: number[] = [];
  const edit = (w: World) => {
    const T = sim.teamSize;
    for (const team of teams) {
      const myBase = team === 0 ? 0 : T;
      for (let k = 0; k < T; k++) {
        const a = w.agents[myBase + k];
        if (!a.alive) continue;
        mateSlotSpeakers(w, sim, a.id, dx, order);
        const base = a.id * w.obsDim;
        for (let s = 0; s < order.length; s++) {
          const call = siteCall(w, order[s]);
          const said = mode === 'off' ? 0 : mode === 'flipped' ? -call : call;
          stats.written++;
          if (said !== 0) stats.calling++;
          for (let c = 0; c < sim.commDim; c++) w.obs[base + comm[s][c]] = c === 0 ? said : 0;
        }
      }
    }
  };
  return { edit, stats };
}
