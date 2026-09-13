import { describe, expect, it } from 'vitest';
import { BRAIN_ONLY_FIELDS, DEFAULT_SIM, DEFAULT_EVO, type SimConfig } from '../src/core/config.ts';
import { Rng } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { World, obsDim, ACT_DIM, A_LOOK_X, A_LOOK_Z, A_COMM0, type Agent } from '../src/sim/world.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
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

  it('empties the contact channel when the world keeps no memory, without poisoning it with NaN', () => {
    // D1 step 2 is `memorySeconds: 0` = the world holds no record; remembering becomes the brain's job.
    // The fade is (1 - age/memorySeconds)², so without a guard that config is (1 - 0/0)² = NaN and the
    // whole enemy channel fills with NaN instead of emptying — every downstream number stays a number-
    // shaped value and nothing throws. Asserted relationally against the remembering config, so an
    // inverted guard fails in either direction.
    const look = (memorySeconds: number) => {
      const w = new World({ ...cfg, memorySeconds }, map, 3);
      const T = cfg.teamSize;
      Object.assign(w.agents[0], { x: 0, z: -4, yaw: Math.PI / 2 });
      Object.assign(w.agents[T], { x: 0, z: 4, yaw: -Math.PI / 2 });
      w.observe();                                    // seen, in plain view
      const seen = w.obs.slice(0, w.obsDim);
      Object.assign(w.agents[T], { x: 0, z: -28 });    // now behind me and far away
      w.agents[0].yaw = Math.PI / 2;
      w.t = 1;
      w.observe();
      const slot = obsSchema({ ...cfg, memorySeconds }).filter((f) => f.name.startsWith('enemy0.'));
      return {
        seenConf: seen[slot.find((f) => f.name === 'enemy0.confidence')!.index],
        recalled: slot.map((f) => w.obs[f.index]),
        finite: w.obs.every((x) => Number.isFinite(x)),
      };
    };
    const remembers = look(3);
    const forgets = look(0);
    expect(remembers.seenConf).toBeGreaterThan(0); // the scenario really did produce a sighting
    expect(forgets.seenConf).toBeGreaterThan(0);
    expect(remembers.recalled.some((x) => x !== 0)).toBe(true);  // memory holds the contact
    expect(forgets.recalled.every((x) => x === 0)).toBe(true);   // no memory: the slot is empty, not NaN
    expect(forgets.finite).toBe(true);
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

describe('capture rounds (ROADMAP C1a)', () => {
  const ccfg = { ...cfg, roundMode: 'capture' as const, captureSeconds: 2, armedSeconds: 4, defuseSeconds: 2 };
  const T = cfg.teamSize;

  /** Attackers are red. Puts `atk` reds and `def` blues in the site and everyone else far away. */
  function site(seed: number, atk: number, def: number): World {
    const w = new World(ccfg, map, seed, { attackers: 0 });
    for (let i = 0; i < T; i++) {
      const inSite = i < atk;
      Object.assign(w.agents[i], { x: inSite ? -1.5 + i * 1.5 : -26 + i, z: inSite ? 0 : -26, vx: 0, vz: 0 });
      const dIn = i < def;
      Object.assign(w.agents[T + i], { x: dIn ? 1.5 + i * 1.5 : 26 - i, z: dIn ? 0 : 26, vx: 0, vz: 0 });
    }
    return w;
  }
  const run = (w: World, seconds: number) => {
    const n = Math.round(seconds / cfg.dt);
    for (let i = 0; i < n && !w.done; i++) stepMatch(w, new IdlePolicy(), new IdlePolicy());
  };
  const kill = (w: World, team: 0 | 1) => {
    for (let i = 0; i < T; i++) w.agents[team === 0 ? i : T + i].alive = false;
    w.aliveCount[team] = 0;
  };

  it('arms only on uncontested attacker occupancy, and the meter decays when they leave', () => {
    const contested = site(1, 2, 2);
    run(contested, 3);
    expect(contested.capture[0], 'a defender standing in it should stop the clock').toBe(0);
    expect(contested.armedSite).toBe(-1);

    const clean = site(1, 2, 0);
    run(clean, ccfg.captureSeconds + 0.2);
    expect(clean.armedSite).toBe(0);

    const left = site(1, 2, 0);
    run(left, ccfg.captureSeconds * 0.5);
    expect(left.capture[0]).toBeGreaterThan(0.2);
    for (let i = 0; i < T; i++) Object.assign(left.agents[i], { x: -26 + i, z: -26 });
    run(left, ccfg.captureSeconds);
    expect(left.capture[0]).toBe(0);
    expect(left.armedSite).toBe(-1);
  });

  it('⭐ killing every attacker AFTER the site is armed does not save the defenders', () => {
    // This is the whole point of C1a. Under koth, wiping the enemy hands you the rest of the clock at the
    // zone's own rate — elimination IS the objective. Here the countdown has its own clock.
    const w = site(2, 2, 0);
    run(w, ccfg.captureSeconds + 0.2);
    expect(w.armedSite).toBe(0);
    kill(w, 0);
    run(w, ccfg.armedSeconds + 1);
    expect(w.done).toBe(true);
    expect(w.winner, 'the attackers are all dead and they still won').toBe(0);
  });

  it('lets defenders defuse it, and ends the round for them the moment they finish', () => {
    const w = site(3, 2, 0);
    run(w, ccfg.captureSeconds + 0.2);
    kill(w, 0);
    for (let i = 0; i < 2; i++) Object.assign(w.agents[T + i], { x: 1.5 + i * 1.5, z: 0 });
    run(w, ccfg.defuseSeconds + 0.5);
    expect(w.done).toBe(true);
    expect(w.winner).toBe(1);
    expect(w.armedT, 'defused strictly before the countdown ran out').toBeGreaterThan(0);
  });

  it('keeps elimination a legal win: wiping the attackers BEFORE they arm it ends the round', () => {
    const w = site(4, 2, 0);
    run(w, ccfg.captureSeconds * 0.4);
    expect(w.armedSite).toBe(-1);
    kill(w, 0);
    run(w, 0.2);
    expect(w.done).toBe(true);
    expect(w.winner).toBe(1);
  });

  it('lets an armed site outlive the round clock', () => {
    const w = site(5, 2, 0);
    w.t = cfg.matchSeconds - ccfg.captureSeconds - 0.5;
    run(w, ccfg.captureSeconds + 0.3);
    expect(w.armedSite).toBe(0);
    expect(w.t).toBeGreaterThan(cfg.matchSeconds - 0.5);
    run(w, 0.5);
    expect(w.done, 'the clock ran out but the site is armed, so the round is not over').toBe(false);
    run(w, ccfg.armedSeconds + 1);
    expect(w.winner).toBe(0);
  });

  it('⭐ reports the sites in each team\'s OWN frame, so the same genome plays the same game in either colour', () => {
    // This is GOTCHAS #17 again, one channel later. The objective block was emitted in world site order, so
    // red's obj0 was the site on its right and blue's obj0 was the site on its LEFT. A mirror test that runs
    // with one site cannot see that, and the consequence is not subtle: the same genome, mirrored, captured
    // a site as blue and never entered one as red — a permanent red/blue species difference (VISION §11.2)
    // arriving through the observation rather than through the schedule.
    const two = { ...ccfg, siteCount: 2 as const };
    const map2 = generateMap(DEFAULT_EVO.mapSeed, two);
    const w = new World(two, map2, 3, { attackers: 0 });
    const [A] = map2.sites;
    for (let i = 0; i < T; i++) {
      // red near site A; blue at the exact 180° rotation of each red body, so the two rows must agree
      const x = A.x - 2 + i * 0.8;
      const z = A.z + 1 - i * 0.4;
      Object.assign(w.agents[i], { x, z, yaw: Math.PI / 2, vx: 1 + i, vz: 2 });
      Object.assign(w.agents[T + i], { x: -x, z: -z, yaw: -Math.PI / 2, vx: -(1 + i), vz: -2 });
    }
    w.t = 2.5;
    w.observe();
    w.observe();
    const dim = w.obsDim;
    const fields = obsSchema(two);
    // the channel has to be exercised, or this passes on a row of zeros
    const selfIn = fields.find((f) => f.name === 'obj0.selfIn')!.index;
    expect(w.obs[selfIn], 'red slot 0 should be standing in its own obj0').toBe(1);
    for (let s = 0; s < T; s++) {
      const red = w.obs.slice(s * dim, (s + 1) * dim);
      const blue = w.obs.slice((T + s) * dim, (T + s + 1) * dim);
      for (let k = 0; k < dim; k++) {
        expect(Math.abs(red[k] - blue[k]), `slot ${s} field ${fields[k].name}`).toBeLessThan(1e-6);
      }
    }
  });

  it('gives neither colour an edge at attacking (mirror match, both role assignments)', () => {
    // The koth fairness test has a mirror-match band; capture needs its own, because "which colour attacks"
    // is a second axis it could go wrong on.
    const two = { ...cfg, roundMode: 'capture' as const, siteCount: 2 as const };
    const map2 = generateMap(DEFAULT_EVO.mapSeed, two);
    const shape2 = shapeFor(two, DEFAULT_EVO.hidden);
    const rng = new Rng(4);
    const wins = [0, 0];
    const total = [0, 0];
    for (let k = 0; k < 3; k++) {
      const g = randomGenome(shape2, rng);
      for (const attackers of [0, 1] as const) {
        for (let m = 0; m < 4; m++) {
          const r = runMatch(new NeuralPolicy(shape2, g), new NeuralPolicy(shape2, g), map2, 500 + m, two, { attackers });
          total[attackers]++;
          if (r.winner === attackers) wins[attackers]++;
        }
      }
    }
    expect(Math.abs(wins[0] / total[0] - wins[1] / total[1]), `${wins[0]}/${total[0]} vs ${wins[1]}/${total[1]}`).toBeLessThan(0.25);
  });

  it('⭐ cannot be defended everywhere: holding one site does not stop a capture at the other', () => {
    // The entire reason two sites is a different game. Defenders sit on A in force; attackers walk onto B.
    const two = { ...ccfg, siteCount: 2 as const };
    const map2 = generateMap(DEFAULT_EVO.mapSeed, two);
    const w = new World(two, map2, 7, { attackers: 0 });
    const [A, B] = map2.sites;
    for (let i = 0; i < T; i++) {
      Object.assign(w.agents[i], { x: B.x + (i - 2) * 1.2, z: B.z, vx: 0, vz: 0 });      // attackers on B
      Object.assign(w.agents[T + i], { x: A.x + (i - 2) * 1.2, z: A.z, vx: 0, vz: 0 });  // defenders on A
    }
    for (let i = 0; i < Math.round((two.captureSeconds + 0.2) / cfg.dt) && !w.done; i++) {
      stepMatch(w, new IdlePolicy(), new IdlePolicy());
    }
    expect(w.armedSite, 'site B armed while every defender stood on site A').toBe(1);
    expect(w.capture[0], 'nobody was capturing A').toBe(0);
  });

  it('arms one site only — there is one bomb, not one per site', () => {
    const two = { ...ccfg, siteCount: 2 as const };
    const map2 = generateMap(DEFAULT_EVO.mapSeed, two);
    const w = new World(two, map2, 8, { attackers: 0 });
    const [A, B] = map2.sites;
    for (let i = 0; i < T; i++) {
      Object.assign(w.agents[i], { x: (i < 3 ? A.x : B.x) + (i % 3) * 1.2, z: i < 3 ? A.z : B.z, vx: 0, vz: 0 });
      Object.assign(w.agents[T + i], { x: 26 - i, z: 26, vx: 0, vz: 0 });
    }
    for (let i = 0; i < Math.round((two.captureSeconds + 1.5) / cfg.dt) && !w.done; i++) {
      stepMatch(w, new IdlePolicy(), new IdlePolicy());
    }
    expect(w.armedSite).toBeGreaterThanOrEqual(0);
    const other = w.armedSite === 0 ? 1 : 0;
    expect(w.capture[other], 'the other site stops mattering the moment one is armed').toBeLessThan(1);
  });

  it('pays nothing for time not spent: a wipe adds no score', () => {
    const w = site(6, 0, 0);
    run(w, 5);
    kill(w, 1);
    run(w, 0.2);
    // nobody armed anything, so the attackers are left to walk in on their own clock — no free points
    expect(w.score[0]).toBe(0);
    expect(w.score[1]).toBe(0);
    expect(w.done, 'wiping the DEFENDERS does not end the round; the site still has to be taken').toBe(false);
  });
});

describe('radio v2 (ROADMAP D2)', () => {
  /** A policy that says exactly what it is told to, so the channel can be driven from the test. */
  class Talker implements Policy {
    private readonly say: (t: number) => number;
    constructor(say: (t: number) => number) { this.say = say; } // no parameter properties: erasableSyntaxOnly
    act(world: World, agent: number): void {
      const off = agent * ACT_DIM;
      world.act.fill(0, off, off + ACT_DIM);
      // atanh, so the tanh in the decoder gives back the value we asked for
      const v = this.say(world.tick);
      const x = 0.5 * Math.log((1 + v) / (1 - v));
      for (let c = 0; c < world.cfg.commDim; c++) world.act[off + A_COMM0 + c] = x;
    }
  }
  const drive = (over: Partial<SimConfig>, say: (t: number) => number, ticks: number) => {
    const c = { ...cfg, ...over };
    const w = new World(c, generateMap(DEFAULT_EVO.mapSeed, c), 1);
    const heard: number[] = [];
    const said: number[] = [];
    for (let i = 0; i < ticks; i++) {
      stepMatch(w, new Talker(say), new IdlePolicy());
      heard.push(w.heardComm(0, 0));
      said.push(w.agents[0].commSaid[0]);
    }
    return { heard, said, w };
  };

  it('quantises to a finite alphabet, and leaves a dead zone so silence is a choice', () => {
    const { said } = drive({ commTokens: 2 }, (t) => -0.99 + (t % 40) * 0.05, 40);
    const alphabet = [...new Set(said.map((v) => Number(v.toFixed(6))))].sort((a, b) => a - b);
    expect(alphabet).toEqual([-1, -0.5, 0, 0.5, 1]); // 2*tokens+1 symbols
    const { said: quiet } = drive({ commTokens: 2 }, () => 0.2, 3); // inside the dead zone
    expect(quiet.every((v) => v === 0), 'a small intent has to be expressible as silence').toBe(true);
  });

  it('⭐ delivers what was said N ticks ago, and nothing at all before that', () => {
    // The load-bearing one. An off-by-one here, or a delay that silently does nothing, leaves the channel
    // looking like a working radio while still being an instant state bus.
    const D = 3;
    const { heard, said } = drive({ commTokens: 4, commDelayTicks: D }, (t) => (t === 0 ? 1 : 0.02), 8);
    expect(said[0]).toBe(1);
    expect(said[1]).toBe(0); // 0.02 is inside the dead zone
    for (let i = 0; i < D; i++) expect(heard[i], `tick ${i} should still be silent`).toBe(0);
    expect(heard[D], 'the tick-0 message lands exactly D ticks later').toBe(1);
    expect(heard[D + 1]).toBe(0);
  });

  it('only re-decides every commIntervalTicks, and keeps transmitting in between', () => {
    const { said } = drive({ commTokens: 4, commIntervalTicks: 5 }, (t) => (t < 5 ? 1 : -1), 10);
    expect(said.slice(0, 5).every((v) => v === 1)).toBe(true);
    expect(said[5]).toBe(-1);            // the next decision point
    expect(said.slice(5, 10).every((v) => v === -1)).toBe(true);
  });

  it('leaves the default channel exactly as it was', () => {
    const { heard, said } = drive({}, (t) => (t % 2 === 0 ? 0.37 : -0.81), 6);
    for (let i = 0; i < 6; i++) {
      expect(said[i]).toBeCloseTo(i % 2 === 0 ? 0.37 : -0.81, 5); // no quantisation
      expect(heard[i]).toBe(said[i]);                             // no delay
    }
  });
});

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
