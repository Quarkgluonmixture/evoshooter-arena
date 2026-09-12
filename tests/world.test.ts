import { describe, expect, it } from 'vitest';
import { BRAIN_ONLY_FIELDS, DEFAULT_SIM, DEFAULT_EVO, type SimConfig } from '../src/core/config.ts';
import { Rng } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { World, obsDim, ACT_DIM, A_LOOK_X, A_LOOK_Z, type Agent } from '../src/sim/world.ts';
import { randomGenome } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../src/brain/policy.ts';
import { IdlePolicy, RusherPolicy, PacifistRusherPolicy, CamperPolicy } from '../src/brain/scripted.ts';
import { runMatch, stepMatch } from '../src/evo/match.ts';

const cfg = DEFAULT_SIM;
const map = generateMap(DEFAULT_EVO.mapSeed, cfg);
const shape = shapeFor(cfg, DEFAULT_EVO.hidden);

describe('World', () => {
  it('is deterministic: same seed + same policies → same fingerprint', () => {
    const rng = new Rng(5);
    const g1 = randomGenome(shape, rng);
    const g2 = randomGenome(shape, rng);
    const run = (seed: number) => {
      const w = new World(cfg, map, seed);
      const r = new NeuralPolicy(shape, g1);
      const b = new NeuralPolicy(shape, g2);
      for (let i = 0; i < 150; i++) stepMatch(w, r, b);
      return w.hash();
    };
    expect(run(11)).toBe(run(11));
    // hit rolls are the only stochastic element, so use bots that are guaranteed to shoot
    const shoot = (seed: number) => {
      const w = new World(cfg, map, seed);
      while (!w.done) stepMatch(w, new RusherPolicy(), new RusherPolicy());
      return w.hash();
    };
    expect(shoot(11)).toBe(shoot(11));
    expect(shoot(11)).not.toBe(shoot(12));
  });

  it('keeps the mirror symmetry once contacts exist (kickoff alone never touches the contact channel)', () => {
    // Kickoff has nobody in sight, so the enemy-contact half of the observation is all zeros there and a
    // symmetry break inside it goes unnoticed. Put both sides in the SAME situation, mirrored, and compare.
    const w = new World(cfg, map, 3);
    const T = cfg.teamSize;
    const put = (id: number, x: number, z: number, yaw: number) => {
      const a = w.agents[id];
      a.x = x; a.z = z; a.yaw = yaw;
    };
    for (let s = 0; s < T; s++) {
      // red at (x, z) looking at the enemy half; blue is its 180° rotation, looking back
      const x = -6 + 3 * s;
      put(s, x, -4 - s, Math.PI / 2);
      put(T + s, -x, 4 + s, -Math.PI / 2);
      // moving, so the hearing channel is not all zeros — a silent scenario would leave the whole audio
      // half of the observation untested, which is how the last symmetry break got through (GOTCHAS #17)
      w.agents[s].vx = 1 + s;
      w.agents[s].vz = 2;
      w.agents[T + s].vx = -(1 + s);
      w.agents[T + s].vz = -2;
    }
    w.t = 2.5;
    w.observe();
    w.observe(); // second pass so both sides have a contact memory of the same age
    const dim = w.obsDim;
    for (let s = 0; s < T; s++) {
      const red = w.obs.slice(s * dim, (s + 1) * dim);
      const blue = w.obs.slice((T + s) * dim, (T + s + 1) * dim);
      for (let k = 0; k < dim; k++) {
        expect(Math.abs(red[k] - blue[k]), `slot ${s} feature ${k}`).toBeLessThan(1e-6);
      }
    }
  });

  it('gives mirrored teams identical observations at kickoff (team-frame symmetry)', () => {
    const w = new World(cfg, map, 1);
    w.observe();
    const D = obsDim(cfg);
    for (let s = 0; s < cfg.teamSize; s++) {
      const red = Array.from(w.obs.subarray(s * D, (s + 1) * D));
      const blue = Array.from(w.obs.subarray((cfg.teamSize + s) * D, (cfg.teamSize + s + 1) * D));
      for (let k = 0; k < D; k++) expect(blue[k]).toBeCloseTo(red[k], 5);
    }
  });

  it('keeps observations finite and bounded', () => {
    const rng = new Rng(3);
    const r = new NeuralPolicy(shape, randomGenome(shape, rng));
    const b = new NeuralPolicy(shape, randomGenome(shape, rng));
    const w = new World(cfg, map, 4);
    let bad = 0;
    for (let i = 0; i < 200; i++) {
      stepMatch(w, r, b);
      for (let k = 0; k < w.obs.length; k++) {
        if (!Number.isFinite(w.obs[k]) || Math.abs(w.obs[k]) > 1.5) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('idle vs idle is a scoreless draw with no shots', () => {
    const r = runMatch(new IdlePolicy(), new IdlePolicy(), map, 1, cfg);
    expect(r.winner).toBe(-1);
    expect(r.score).toEqual([0, 0]);
    expect(r.metrics[0].shots).toBe(0);
    expect(r.fitness[0]).toBeCloseTo(0);
  });

  it('rewards the team that takes the zone (rusher beats idle)', () => {
    const r = runMatch(new RusherPolicy(), new IdlePolicy(), map, 2, cfg);
    expect(r.winner).toBe(0);
    expect(r.fitness[0]).toBeGreaterThan(0.5);
    expect(r.fitness[1]).toBeLessThan(-0.5);
    expect(r.metrics[0].zoneShare).toBeGreaterThan(0.3);
  });

  it('rewards shooting (rusher beats pacifist rusher via kills)', () => {
    let wins = 0;
    let kills = 0;
    for (let s = 0; s < 4; s++) {
      const r = runMatch(new RusherPolicy(), new PacifistRusherPolicy(), map, 10 + s, cfg);
      if (r.winner === 0) wins++;
      kills += r.metrics[0].kills;
    }
    expect(wins).toBe(4);
    expect(kills).toBeGreaterThan(0);
  });

  it('fitness is zero-sum between the teams', () => {
    const r = runMatch(new RusherPolicy(), new CamperPolicy(), map, 3, cfg);
    expect(r.fitness[0] + r.fitness[1]).toBeCloseTo(0, 6);
  });

  it('counts sighting ticks for the eye that is looking, never for the team facing away', () => {
    // This counter is the denominator behind every behaviour claim (GOTCHAS #18): a cross-play cell with
    // zero sightings is a non-measurement, not a 50/50 draw. Three ways it can silently lie — never
    // incrementing, crediting the wrong team, or crediting both ends of a one-way sighting — all show up here.
    const T = cfg.teamSize;
    const place = (blueYaw: number) => {
      const w = new World(cfg, map, 3);
      for (let s = 0; s < T; s++) {
        const x = -6 + 3 * s;
        Object.assign(w.agents[s], { x, z: -4 - s, yaw: Math.PI / 2 });
        Object.assign(w.agents[T + s], { x: -x, z: 4 + s, yaw: blueYaw });
      }
      w.observe();
      return w.stats.map((st) => st.sightTicks);
    };
    const [mutualR, mutualB] = place(-Math.PI / 2); // both sides looking at each other
    expect(mutualR).toBeGreaterThan(0);
    expect(mutualB).toBe(mutualR); // mirrored setup → mirrored sightings
    const [oneWayR, oneWayB] = place(Math.PI / 2); // blue looking away, red unchanged
    expect(oneWayR).toBe(mutualR);
    expect(oneWayB).toBe(0);
  });

  it('keeps the recurrent state on the world, so a reused policy cannot leak one match into the next', () => {
    // The whole reason `world.brain` is not a field on NeuralPolicy: evaluateJobs caches one policy per
    // genome and replays it across every match of a generation. State on the policy would make a match
    // depend on which matches ran before it — same seed, different answer, and nothing would error.
    const rcfg = { ...cfg, recurrentDim: 16 };
    const rshape = shapeFor(rcfg, DEFAULT_EVO.hidden);
    const rng = new Rng(5);
    const g1 = randomGenome(rshape, rng);
    const g2 = randomGenome(rshape, rng);
    const play = (seed: number, red: Policy, blue: Policy) => {
      const w = new World(rcfg, map, seed);
      for (let i = 0; i < 120; i++) stepMatch(w, red, blue);
      return w.hash();
    };
    const fresh = play(11, new NeuralPolicy(rshape, g1), new NeuralPolicy(rshape, g2));
    const reused = new NeuralPolicy(rshape, g1);
    const reusedFoe = new NeuralPolicy(rshape, g2);
    play(12, reused, reusedFoe); // a different match first, on the very same policy objects
    expect(play(11, reused, reusedFoe)).toBe(fresh);
  });

  it('actually feeds the recurrent state back — zeroing it every tick changes the match', () => {
    // Positive guardrail for the same wiring: if the state were never written back, the extra inputs would
    // sit at a constant 0 and D1 would be a no-op that still passes every other test.
    const rcfg = { ...cfg, recurrentDim: 16 };
    const rshape = shapeFor(rcfg, DEFAULT_EVO.hidden);
    const rng = new Rng(6);
    const g1 = randomGenome(rshape, rng);
    const g2 = randomGenome(rshape, rng);
    const run = (zeroEveryTick: boolean) => {
      const w = new World(rcfg, map, 21);
      const red = new NeuralPolicy(rshape, g1);
      const blue = new NeuralPolicy(rshape, g2);
      for (let i = 0; i < 90; i++) {
        stepMatch(w, red, blue);
        if (zeroEveryTick) w.brain.fill(0);
      }
      return { hash: w.hash(), nonzero: w.brain.reduce((n, x) => n + (x !== 0 ? 1 : 0), 0) };
    };
    const live = run(false);
    expect(live.nonzero).toBeGreaterThan(0);
    expect(live.hash).not.toBe(run(true).hash);
  });

  it('keeps every BRAIN_ONLY_FIELDS entry invisible to a hand-written bot', () => {
    // scripts/yardstick.ts compares champions across a phase boundary by scoring them against scripted bots,
    // and that is only valid while the bot is playing the SAME game under both configs. The allowlist is the
    // load-bearing claim; this checks it mechanically rather than trusting the name.
    const run = (c: SimConfig) => {
      const w = new World(c, generateMap(DEFAULT_EVO.mapSeed, c), 17);
      while (!w.done) stepMatch(w, new RusherPolicy(), new CamperPolicy());
      return w.hash();
    };
    const base = run(cfg);
    for (const k of BRAIN_ONLY_FIELDS) {
      const v = cfg[k];
      expect(typeof v, `${k} is not a number — extend this test before adding it`).toBe('number');
      expect(run({ ...cfg, [k]: (v as number) + 40 }), `changing ${k} reached the world`).toBe(base);
    }
  });

  it('refuses a recurrent slice wider than the hidden layer it is taken from', () => {
    expect(() => shapeFor({ ...cfg, recurrentDim: 64 }, [40, 24])).toThrow(/recurrentDim/);
  });

  it('never lets an agent end up inside cover or outside the arena', () => {
    const rng = new Rng(8);
    const r = new NeuralPolicy(shape, randomGenome(shape, rng));
    const b = new NeuralPolicy(shape, randomGenome(shape, rng));
    const w = new World(cfg, map, 9);
    let outside = 0;
    let inCover = 0;
    while (!w.done) {
      stepMatch(w, r, b);
      for (const a of w.agents) {
        if (!a.alive) continue;
        if (Math.abs(a.x) > cfg.arenaHalf || Math.abs(a.z) > cfg.arenaHalf) outside++;
        for (const box of map.boxes) {
          if (a.x > box.minX && a.x < box.maxX && a.z > box.minZ && a.z < box.maxZ) inCover++;
        }
      }
    }
    expect(outside).toBe(0);
    expect(inCover).toBe(0);
  });
});

/**
 * A look action that slams to the opposite direction every single tick — i.e. the worst case the network
 * can produce. The head must SWEEP through it, not follow it.
 */
class JitterLookPolicy implements Policy {
  private flip = 1;
  act(world: World, agent: number): void {
    const off = agent * ACT_DIM;
    world.act.fill(0, off, off + ACT_DIM);
    world.act[off + A_LOOK_X] = this.flip * 3;
    world.act[off + A_LOOK_Z] = -this.flip * 3;
    if (agent === world.n - 1) this.flip = -this.flip as 1 | -1;
  }
}

describe('turning', () => {
  it('sweeps instead of snapping when the look action jitters every tick', () => {
    const w = new World(cfg, map, 3);
    const pol = new JitterLookPolicy();
    const prevYaw = new Map<number, number>();
    let reversals = 0;
    let samples = 0;
    let maxStep = 0;
    let lastDelta = 0;
    const a: Agent = w.agents[0];
    prevYaw.set(a.id, a.yaw);
    for (let i = 0; i < 200; i++) {
      stepMatch(w, pol, pol);
      let d = a.yaw - (prevYaw.get(a.id) as number);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      prevYaw.set(a.id, a.yaw);
      maxStep = Math.max(maxStep, Math.abs(d));
      if (i > 0 && Math.abs(d) > 1e-3 && Math.sign(d) !== Math.sign(lastDelta)) reversals++;
      lastDelta = d;
      samples++;
    }
    // never faster than the scan cap…
    expect(maxStep).toBeLessThanOrEqual(cfg.scanTurnRate * cfg.dt + 1e-9);
    // …and the low-pass means the head does not follow the flip-flop: without it this is ~1 per tick
    expect(reversals / samples).toBeLessThan(0.2);
  });
});

describe('fairness', () => {
  it('gives neither colour a systematic edge (mirror match of identical bots ≈ 50/50)', () => {
    let red = 0;
    const N = 60;
    for (let s = 0; s < N; s++) {
      const r = runMatch(new RusherPolicy(), new RusherPolicy(), map, 1000 + s, cfg);
      red += r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0;
    }
    const share = red / N;
    expect(share).toBeGreaterThan(0.33);
    expect(share).toBeLessThan(0.67);
  });
});
