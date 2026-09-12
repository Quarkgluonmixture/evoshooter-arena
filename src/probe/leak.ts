/**
 * A1 — information provenance probes.
 *
 * Each probe changes ONE thing the observer cannot legally perceive and reports which observation fields
 * moved. A probe is registered with the status we currently EXPECT ('clean' or 'leak' + the SUBSTRATE gap
 * it belongs to); `tests/leak.test.ts` asserts measured == registered, so a fix and a regression are both
 * loud. This phase measures only — it must not change any mechanism.
 *
 * Nothing in `src/sim` or `src/brain` may import this file (SUBSTRATE T8, analytics firewall).
 */
import { DEFAULT_SIM, type SimConfig } from '../core/config.ts';
import { wrapAngle, type Box } from '../sim/geom.ts';
import type { ArenaMap } from '../sim/map.ts';
import { World, ACT_DIM, A_AIM, A_TARGET0 } from '../sim/world.ts';
import { obsSchema, type ObsField } from '../sim/obsSchema.ts';

export type ProbeKind = 'counterfactual' | 'truth-identity' | 'discontinuity' | 'action';
export type ProbeStatus = 'clean' | 'leak';

export interface ProbeResult {
  status: ProbeStatus;
  /** observation fields that moved (empty for action probes) */
  fields: string[];
  detail: string;
}

export interface LeakProbe {
  id: string;
  kind: ProbeKind;
  /** SUBSTRATE §11 hard test this instruments, when there is one */
  test?: string;
  /** SUBSTRATE §1 gap, when the probe is expected to leak */
  gap?: string;
  title: string;
  expect: ProbeStatus;
  /** for expect==='leak': exactly which fields must move; a partial fix turns the test red */
  expectFields?: string[];
  run: (cfg: SimConfig) => ProbeResult;
}

/* ------------------------------------------------------------------ lab world */

/** Empty arena with the two teams parked in opposite corners, far outside each other's view range. */
export function labMap(cfg: SimConfig, boxes: Box[]): ArenaMap {
  const spawns: [{ x: number; z: number }[], { x: number; z: number }[]] = [[], []];
  for (let s = 0; s < cfg.teamSize; s++) {
    spawns[0].push({ x: -26 + s, z: -27 });
    spawns[1].push({ x: 26 - s, z: 27 });
  }
  return { seed: -1, boxes, spawns, zoneX: 0, zoneZ: 0 };
}

export function place(w: World, id: number, x: number, z: number, yaw: number): void {
  const a = w.agents[id];
  a.x = x;
  a.z = z;
  a.yaw = yaw;
}

/** Face `id` at (x,z). */
export function faceAt(w: World, id: number, x: number, z: number): void {
  const a = w.agents[id];
  a.yaw = Math.atan2(z - a.z, x - a.x);
}

export interface Counterfactual {
  boxes?: Box[];
  /** boxes that exist in the treatment world only (geometry that "appears") */
  addBoxes?: Box[];
  observer?: number;
  setup: (w: World) => void;
  /** applied to the treatment world only */
  mutate: (w: World) => void;
  /** applied to BOTH worlds after the first observe(), for probes about memory over time */
  after?: (w: World) => void;
}

export interface DiffResult {
  changed: ObsField[];
  maxDelta: number;
}

/** Build two identical worlds, mutate one, and diff the observer's observation row. */
export function counterfactual(cfg: SimConfig, c: Counterfactual): DiffResult {
  const base = c.boxes ?? [];
  const maps = [labMap(cfg, base), labMap(cfg, base.concat(c.addBoxes ?? []))];
  const i = c.observer ?? 0;
  const row = (treatment: boolean): Float32Array => {
    const w = new World(cfg, maps[treatment ? 1 : 0], 1);
    c.setup(w);
    if (treatment) c.mutate(w);
    w.observe();
    if (c.after) {
      c.after(w);
      w.observe();
    }
    return w.obs.slice(i * w.obsDim, (i + 1) * w.obsDim);
  };
  const a = row(false);
  const b = row(true);
  const schema = obsSchema(cfg);
  const changed: ObsField[] = [];
  let maxDelta = 0;
  for (let k = 0; k < a.length; k++) {
    const d = Math.abs(a[k] - b[k]);
    if (d > 1e-9) {
      changed.push(schema[k]);
      if (d > maxDelta) maxDelta = d;
    }
  }
  return { changed, maxDelta };
}

function cf(cfg: SimConfig, c: Counterfactual, cleanNote: string, leakNote: string): ProbeResult {
  const d = counterfactual(cfg, c);
  const fields = d.changed.map((f) => f.name);
  const mag = d.maxDelta >= 0.001 ? d.maxDelta.toFixed(3) : d.maxDelta.toExponential(2);
  return d.changed.length === 0
    ? { status: 'clean', fields, detail: cleanNote }
    : { status: 'leak', fields, detail: `${leakNote} (max |Δ| ${mag})` };
}

/* ----------------------------------------------------------------- scenarios */

/** Tall wall across the middle: the observer at (0,-10) cannot see anything at (0,+10). */
const MID_WALL: Box = { minX: -5, minZ: -1, maxX: 5, maxZ: 1, h: 3 };
const OBSERVER = 0;
const MATE = 1;
const ENEMY = 5;

/** Observer at (0,-10) looking down +z (red's forward). */
function standObserver(w: World): void {
  place(w, OBSERVER, 0, -10, Math.PI / 2);
}

/* -------------------------------------------------------------------- probes */

export const LEAK_PROBES: LeakProbe[] = [
  {
    id: 'A1-P1',
    kind: 'counterfactual',
    test: 'T1',
    title: 'an enemy nobody has seen moves behind a wall',
    expect: 'clean',
    run: (cfg) =>
      cf(
        cfg,
        {
          boxes: [MID_WALL],
          setup: (w) => {
            standObserver(w);
            place(w, ENEMY, 0, 10, -Math.PI / 2);
          },
          mutate: (w) => place(w, ENEMY, 0, 14, -Math.PI / 2),
        },
        'no observation field moves — the baseline is honest when nobody on the team has the contact',
        'observation moved without any legal sensor',
      ),
  },
  {
    id: 'A1-P2',
    kind: 'counterfactual',
    test: 'T1',
    gap: 'V1',
    title: 'an enemy only my TEAMMATE can see moves',
    expect: 'clean', // flipped by ROADMAP A2 (was: leak on enemy0.dx/dz/dist)
    run: (cfg) =>
      cf(
        cfg,
        {
          boxes: [MID_WALL],
          setup: (w) => {
            standObserver(w);
            place(w, MATE, 12, -10, 0);
            faceAt(w, MATE, 0, 10);
            place(w, ENEMY, 0, 10, -Math.PI / 2);
          },
          mutate: (w) => place(w, ENEMY, 3, 14, -Math.PI / 2),
        },
        'observer unaffected by what the teammate sees',
        'team-shared exact enemy position: my slots track an enemy I have never seen',
      ),
  },
  {
    id: 'A1-P3',
    kind: 'counterfactual',
    test: 'T1',
    gap: 'V1',
    title: 'the team memory outlives the teammate who made the contact',
    expect: 'clean', // flipped by ROADMAP A2 (was: leak on enemy0.present/dx/dz/dist/staleness)
    run: (cfg) =>
      cf(
        cfg,
        {
          boxes: [MID_WALL],
          setup: (w) => {
            standObserver(w);
            // control and treatment differ ONLY in where the teammate is looking, which is not in my
            // observation at all — so every legal channel I have is byte-identical in both worlds
            place(w, MATE, 12, -10, 0);
            place(w, ENEMY, 3, 10, -Math.PI / 2);
          },
          mutate: (w) => faceAt(w, MATE, 3, 10),
          after: (w) => {
            const m = w.agents[MATE];
            if (m.alive) {
              m.alive = false;
              m.hp = 0;
              w.aliveCount[m.team]--;
            }
            w.t += 1;
          },
        },
        'contact dies with the observer who made it',
        'I still hold a fresh exact contact one second after the only witness died',
      ),
  },
  {
    id: 'A1-P4',
    kind: 'counterfactual',
    test: 'T1',
    gap: 'V2',
    title: 'a visible enemy loses HP without changing its silhouette',
    expect: 'clean', // flipped by ROADMAP A3.1 (was: leak on enemy0.hp)
    run: (cfg) =>
      cf(
        cfg,
        {
          setup: (w) => {
            standObserver(w);
            place(w, ENEMY, 0, 10, -Math.PI / 2);
          },
          mutate: (w) => {
            w.agents[ENEMY].hp = 40;
          },
        },
        'enemy HP is not readable',
        'enemy HP is piped straight into the observation',
      ),
  },
  {
    id: 'A1-P5',
    kind: 'counterfactual',
    gap: 'V2',
    title: 'a visible enemy turns around',
    expect: 'clean', // flipped by ROADMAP A3.1 (was: leak on enemy0.facingDot)
    run: (cfg) =>
      cf(
        cfg,
        {
          setup: (w) => {
            standObserver(w);
            place(w, ENEMY, 0, 10, -Math.PI / 2);
          },
          mutate: (w) => {
            w.agents[ENEMY].yaw = Math.PI / 2;
          },
        },
        'facing is inferred, not read',
        'facing arrives as an exact dot product (the cue is legitimate, the FORM is engine truth)',
      ),
  },
  {
    id: 'A1-P7',
    kind: 'counterfactual',
    test: 'T3',
    gap: 'V3',
    title: 'a wall appears behind my head',
    expect: 'clean', // flipped by ROADMAP A3.3: rays live inside the field of view now
    run: (cfg) =>
      cf(
        cfg,
        {
          // the observer stands at (0,-10) facing +z; this block is squarely behind its head
          addBoxes: [{ minX: -8, minZ: -16, maxX: 8, maxZ: -14, h: 2.6 }],
          setup: standObserver,
          mutate: () => {},
        },
        'geometry behind the head is invisible',
        'the 360° lidar reports a wall that appeared behind my head while I never turned',
      ),
  },
  {
    id: 'A1-P9',
    kind: 'counterfactual',
    test: 'T2',
    title: 'a teammate changes its private intention',
    expect: 'clean',
    run: (cfg) =>
      cf(
        cfg,
        {
          setup: (w) => {
            standObserver(w);
            place(w, MATE, 6, -10, Math.PI / 2);
          },
          mutate: (w) => {
            const m = w.agents[MATE];
            m.targetId = ENEMY;
            m.settleT = 0.4;
            m.aim = true;
            m.ammo = 2;
            m.reloadT = 0.9;
            m.cooldownT = 0.1;
            m.lookX = 0.8;
            m.lookZ = -0.6;
          },
        },
        'private intention, aim state, ammo and reload stay inside the teammate',
        'teammate private state reaches me',
      ),
  },
  {
    id: 'A1-P10',
    kind: 'counterfactual',
    test: 'T2',
    gap: 'V11',
    title: 'a teammate 30 m away behind a wall pulls the trigger',
    expect: 'clean', // flipped by V11: firing is a visual cue now, not a HUD field
    run: (cfg) =>
      cf(
        cfg,
        {
          boxes: [MID_WALL],
          setup: (w) => {
            standObserver(w);
            place(w, MATE, 0, 20, Math.PI / 2);
            for (let m = 2; m < cfg.teamSize; m++) place(w, m, -28 - m, -28, 0); // keep slot 0 for MATE
          },
          mutate: (w) => {
            w.agents[MATE].firing = true;
          },
        },
        'firing is a visual cue only',
        'teammate body-action truth arrives through the wall (SUBSTRATE §6.2 allows it only in vision)',
      ),
  },
  {
    id: 'A1-P11',
    kind: 'counterfactual',
    test: 'T1',
    gap: 'V12',
    title: 'an enemy nobody has seen steps into the objective',
    expect: 'clean', // flipped by V12: the objective HUD no longer counts bodies
    run: (cfg) =>
      cf(
        cfg,
        {
          boxes: [MID_WALL],
          setup: (w) => {
            standObserver(w);
            place(w, ENEMY, 0, 10, -Math.PI / 2);
          },
          mutate: (w) => place(w, ENEMY, 0, 2, -Math.PI / 2),
        },
        'the objective HUD does not count invisible bodies',
        'the objective HUD counts enemies standing in the zone that nobody has ever seen',
      ),
  },
  {
    id: 'A1-P6',
    kind: 'truth-identity',
    gap: 'V2',
    title: 'a visible contact is engine truth, not a percept',
    expect: 'clean', // A3.2 replaced every field this probe knew how to check; V2 now rides on A1-P16
    run: (cfg) => {
      const w = new World(cfg, labMap(cfg, []), 1);
      standObserver(w);
      place(w, ENEMY, 6, 8, -Math.PI / 2);
      w.observe();
      const me = w.agents[OBSERVER];
      const en = w.agents[ENEMY];
      const off = OBSERVER * w.obsDim;
      const half = cfg.arenaHalf;
      const n = w.n;
      const names = new Set(obsSchema(cfg).map((f) => f.name));
      const candidates: Array<[string, number]> = [
        ['enemy0.dx', (en.x - me.x) / half],
        ['enemy0.dz', (en.z - me.z) / half],
        ['enemy0.dist', Math.min(1, Math.hypot(en.x - me.x, en.z - me.z) / half)],
        ['enemy0.exposure', w.exposure[OBSERVER * n + ENEMY]],
        ['enemy0.exposureToMe', w.exposure[ENEMY * n + OBSERVER]],
        ['enemy0.facingDot', -(Math.cos(en.yaw) * (en.x - me.x) + Math.sin(en.yaw) * (en.z - me.z)) /
          Math.hypot(en.x - me.x, en.z - me.z)],
        ['enemy0.hp', en.hp / cfg.hp],
      ];
      // a field a phase has deleted is not a leak that got fixed silently — it simply is not there any more
      const exact = candidates.filter(([name]) => names.has(name));
      const fields = exact
        .filter(([name, v]) => w.obs[off + indexOfField(cfg, name)] === Math.fround(v))
        .map(([name]) => name);
      if (exact.length === 0) {
        return {
          status: 'clean',
          fields: [],
          detail: 'RETIRED: every coordinate field this probe checked has been deleted by A3.2. ' +
            'It is kept so a re-added dx/dz/dist/exposure would light up again — the live V2 question is A1-P16.',
        };
      }
      return fields.length === 0
        ? { status: 'clean', fields, detail: 'no contact field equals the engine value bit for bit' }
        : {
            status: 'leak',
            fields,
            detail: `${fields.length}/${exact.length} contact fields equal the engine truth expression exactly ` +
              `(of ${candidates.length} the baseline shipped; no bearing/quality transform, no noise, no quantisation)`,
          };
    },
  },
  {
    id: 'A1-P8',
    kind: 'discontinuity',
    gap: 'V3',
    title: 'an enemy steps 20 cm across the view-range line',
    expect: 'clean', // flipped by ROADMAP A3.2: quality fades to zero instead of being cut off
    run: (cfg) => {
      const d = counterfactual(cfg, {
        setup: (w) => {
          place(w, OBSERVER, 0, -15, Math.PI / 2);
          place(w, ENEMY, 0, cfg.viewRange - 15.1, -Math.PI / 2); // 29.9 m away, in full view
        },
        mutate: (w) => place(w, ENEMY, 0, cfg.viewRange - 14.9, -Math.PI / 2), // 30.1 m away
      });
      // A continuous sensor still moves a little when the target moves; a cliff moves a lot. The
      // threshold was fixed before the A3.2 run (LOG 2026-09-11 23:05), not chosen after seeing it.
      const CLIFF = 0.05;
      const fields = d.changed.map((f) => f.name);
      return d.maxDelta <= CLIFF
        ? {
            status: 'clean',
            fields: [],
            detail: `20 cm across the range limit moves the observation by at most ${d.maxDelta.toFixed(4)} ` +
              `(cliff threshold ${CLIFF}): the contact fades instead of being deleted`,
          }
        : {
            status: 'leak',
            fields,
            detail: `20 cm of enemy movement flips ${fields.length} observation fields ` +
              `(max |Δ| ${d.maxDelta.toFixed(3)} > ${CLIFF}): the contact does not fade, it is deleted`,
          };
    },
  },
  {
    id: 'A1-P12',
    kind: 'action',
    gap: 'V4',
    title: 'choosing a target slot turns the head by itself',
    expect: 'leak',
    run: (cfg) => {
      const w = new World(cfg, labMap(cfg, []), 1);
      standObserver(w);
      const bearing = 0.7;
      place(w, ENEMY, 20 * Math.cos(bearing), -10 + 20 * Math.sin(bearing), -Math.PI / 2);
      w.observe();
      if (w.slots[OBSERVER * cfg.enemySlots] !== ENEMY) {
        throw new Error('A1-P12 scenario broken: the enemy is not in slot 0');
      }
      const before = w.agents[OBSERVER].yaw;
      w.act.fill(0);
      w.act[OBSERVER * ACT_DIM + A_AIM] = 1;
      w.act[OBSERVER * ACT_DIM + A_TARGET0] = 1;
      w.step();
      const turned = Math.abs(w.agents[OBSERVER].yaw - before);
      const scanCap = cfg.scanTurnRate * cfg.dt;
      return turned <= 1e-9
        ? { status: 'clean', fields: [], detail: 'the head only moves when the policy asks it to' }
        : {
            status: 'leak',
            fields: [],
            detail: `with every look action at zero the head still swung ${(turned * 180 / Math.PI).toFixed(1)}° ` +
              `toward the chosen slot in one tick (scan cap is ${(scanCap * 180 / Math.PI).toFixed(1)}°): ` +
              'aiming is a world service, not a body skill',
          };
    },
  },
  {
    id: 'A1-P13',
    kind: 'action',
    gap: 'V4',
    title: 'the head snaps onto an enemy only my teammate can see',
    expect: 'clean', // flipped by ROADMAP A2: there is no inherited contact to aim at any more
    run: (cfg) => {
      const w = new World(cfg, labMap(cfg, [WIDE_WALL]), 1);
      standObserver(w);
      place(w, MATE, 20, -10, 0);
      place(w, ENEMY, 10, 8, -Math.PI / 2);
      faceAt(w, MATE, 10, 8);
      w.observe();
      const n = w.n;
      if (w.visible[OBSERVER * n + ENEMY] !== 0) throw new Error('A1-P13 scenario broken: the observer can see the enemy');
      if (w.visible[MATE * n + ENEMY] !== 1) throw new Error('A1-P13 scenario broken: the teammate cannot see the enemy');
      if (w.slots[OBSERVER * cfg.enemySlots] !== ENEMY) {
        return { status: 'clean', fields: [], detail: 'nothing inherited from the teammate, so there is nothing to auto-aim at' };
      }
      const before = w.agents[OBSERVER].yaw;
      w.act.fill(0);
      w.act[OBSERVER * ACT_DIM + A_AIM] = 1;
      w.act[OBSERVER * ACT_DIM + A_TARGET0] = 1;
      w.step();
      const turned = Math.abs(w.agents[OBSERVER].yaw - before);
      return turned <= 1e-9
        ? { status: 'clean', fields: [], detail: 'no aim service for contacts I cannot see' }
        : {
            status: 'leak',
            fields: [],
            detail: `the head swung ${(turned * 180 / Math.PI).toFixed(1)}° in one tick onto an enemy behind a wall ` +
              'that only a teammate can see (V1 feeding V4)',
          };
    },
  },
  {
    id: 'A1-P14',
    kind: 'action',
    gap: 'V4',
    title: 'the head snaps onto where I last saw someone',
    expect: 'leak',
    run: (cfg) => {
      const w = new World(cfg, labMap(cfg, [MID_WALL]), 1);
      standObserver(w);
      place(w, ENEMY, 12, 6, -Math.PI / 2); // in plain view, 37° off my facing
      w.observe();
      if (w.visible[OBSERVER * w.n + ENEMY] !== 1) throw new Error('A1-P14 scenario broken: the enemy is not visible');
      place(w, ENEMY, 0, 10, -Math.PI / 2); // steps behind the wall, straight ahead of me
      w.t += 1;
      w.observe();
      if (w.visible[OBSERVER * w.n + ENEMY] !== 0) throw new Error('A1-P14 scenario broken: the enemy is still visible');
      if (w.slots[OBSERVER * cfg.enemySlots] !== ENEMY) throw new Error('A1-P14 scenario broken: my own contact expired');
      const before = w.agents[OBSERVER].yaw; // already pointing at where the enemy REALLY is
      w.act.fill(0);
      w.act[OBSERVER * ACT_DIM + A_AIM] = 1;
      w.act[OBSERVER * ACT_DIM + A_TARGET0] = 1;
      w.step();
      const turned = Math.abs(w.agents[OBSERVER].yaw - before);
      return turned <= 1e-9
        ? { status: 'clean', fields: [], detail: 'the head stays where the policy put it' }
        : {
            status: 'leak',
            fields: [],
            detail: `the head swung ${(turned * 180 / Math.PI).toFixed(1)}° AWAY from the enemy's real bearing and ` +
              'onto my one-second-old memory of it: the aim service reads my contact list, not my eyes',
          };
    },
  },
  {
    id: 'A1-P15',
    kind: 'discontinuity',
    gap: 'V6',
    title: 'the memory window ends in a cliff',
    expect: 'clean', // flipped by ROADMAP V6a: the hold fades as (1-t)^2 instead of being deleted
    run: (cfg) => {
      // Both worlds are read at the SAME clock time (so the legal round-time HUD is identical); they differ
      // only in how long ago the sighting happened — see GOTCHAS #11.
      const NOW = 4;
      const seen = (age: number): Float32Array => {
        const w = new World(cfg, labMap(cfg, [MID_WALL]), 1);
        standObserver(w);
        w.t = NOW - age;
        place(w, ENEMY, 12, 6, -Math.PI / 2); // seen once, in plain view
        w.observe();
        place(w, ENEMY, 0, 10, -Math.PI / 2); // then gone behind the wall
        w.t = NOW;
        w.observe();
        return w.obs.slice(OBSERVER * w.obsDim, (OBSERVER + 1) * w.obsDim);
      };
      const before = seen(cfg.memorySeconds - 0.1);
      const after = seen(cfg.memorySeconds + 0.1);
      const schema = obsSchema(cfg);
      // Check the denominator first: with no world memory the contact slot is empty on BOTH sides of the
      // boundary, so "nothing moved" would read as a passing cliff test over an empty channel — a clean
      // that means the probe had nothing to measure (same trap A1-P23 hit, GOTCHAS族 B).
      const confIdx = indexOfField(cfg, 'enemy0.confidence');
      if (before[confIdx] === 0 && after[confIdx] === 0) {
        return {
          status: 'clean',
          fields: [],
          detail: 'there is no memory window to end — the contact channel is already empty on both sides of ' +
            'the boundary, so this probe has nothing to measure under this config',
        };
      }
      const fields: string[] = [];
      let maxDelta = 0;
      for (let k = 0; k < before.length; k++) {
        const dd = Math.abs(before[k] - after[k]);
        if (dd > 1e-9) fields.push(schema[k].name);
        if (dd > maxDelta) maxDelta = dd;
      }
      // Same magnitude criterion as A1-P8, fixed before the V6a run: a fading memory still moves a
      // little at the end of the window, a deleted one moves a lot.
      const CLIFF = 0.05;
      return maxDelta <= CLIFF
        ? {
            status: 'clean',
            fields: [],
            detail: `200 ms either side of the ${cfg.memorySeconds} s window moves the observation by at most ` +
              `${maxDelta.toExponential(2)} (cliff threshold ${CLIFF}): the memory fades out instead of being deleted`,
          }
        : {
            status: 'leak',
            fields,
            detail: `200 ms either side of the ${cfg.memorySeconds} s memory window moves ${fields.length} fields ` +
              `by up to ${maxDelta.toFixed(4)}: the world deletes what I still remember in one tick`,
          };
    },
  },
  {
    id: 'A1-P16',
    kind: 'counterfactual',
    gap: 'V2',
    title: 'an enemy 25 m away shifts by 5 cm',
    expect: 'clean', // flipped by ROADMAP A3.2b (was: leak, 20/20 starting positions tracked the shift)
    run: (cfg) => {
      // Quantisation always has boundaries, so ONE scenario would pass by luck about 97% of the time.
      // Sweep 20 starting offsets and allow at most 10% of them to move (threshold fixed in LOG 23:25).
      const N = 20;
      const ALLOWED = 0.1;
      let moved = 0;
      let worst = 0;
      for (let k = 0; k < N; k++) {
        const x0 = -3 + (6 * k) / (N - 1); // spread the true bearing across the quantisation grid
        const d = counterfactual(cfg, {
          setup: (w) => {
            standObserver(w);
            place(w, ENEMY, x0, 15, -Math.PI / 2); // ~25 m ahead, in plain view
          },
          mutate: (w) => place(w, ENEMY, x0 + 0.05, 15, -Math.PI / 2),
        });
        if (d.changed.length > 0) moved++;
        if (d.maxDelta > worst) worst = d.maxDelta;
      }
      const rate = moved / N;
      return rate <= ALLOWED
        ? {
            status: 'clean',
            fields: [],
            detail: `${moved}/${N} starting positions react to a 5 cm shift at 25 m (allowed ${ALLOWED * 100}%): ` +
              'the percept is coarser than the movement, so the true position is no longer recoverable',
          }
        : {
            status: 'leak',
            fields: [],
            detail: `${moved}/${N} starting positions track a 5 cm shift at 25 m (max |Δ| ${worst.toExponential(2)}): ` +
              'the transform is continuous and noiseless, so the true position is still recoverable from it',
          };
    },
  },
  {
    id: 'A1-P17',
    kind: 'counterfactual',
    test: 'T4',
    title: 'an enemy fires behind a wall',
    expect: 'clean',
    run: (cfg) => {
      const d = counterfactual(cfg, {
        boxes: [MID_WALL],
        setup: (w) => {
          standObserver(w);
          place(w, ENEMY, 0, 10, -Math.PI / 2);
        },
        mutate: (w) => {
          w.events.push({
            kind: 'shot', shooter: ENEMY, target: OBSERVER, hit: false,
            x0: 0, y0: cfg.eyeHeight, z0: 10, x1: 0, y1: cfg.eyeHeight, z1: -10,
          });
        },
      });
      const names = d.changed.map((f) => f.name);
      const audio = names.filter((n) => n.startsWith('audio'));
      // Both halves matter: the shot must be HEARD (an unchanged observation would be a silent world
      // passing as "no leak"), and it must not move anything except the hearing channel.
      if (audio.length === 0) {
        return { status: 'leak', fields: names, detail: 'the gunshot changed nothing at all — the channel is deaf, not clean' };
      }
      return audio.length === names.length
        ? { status: 'clean', fields: [], detail: `the shot is audible through the wall and moves only the hearing channel (${audio.join(', ')})` }
        : { status: 'leak', fields: names.filter((n) => !n.startsWith('audio')), detail: 'firing moved something outside the hearing channel' };
    },
  },
  {
    id: 'A1-P18',
    kind: 'discontinuity',
    test: 'T4',
    title: 'the same gunshot at 8, 16, 24 and 32 m',
    expect: 'clean',
    run: (cfg) => {
      const heard = (dist: number) => {
        const w = new World(cfg, labMap(cfg, []), 1);
        standObserver(w);
        place(w, ENEMY, 0, -10 + dist, -Math.PI / 2);
        w.events.push({
          kind: 'shot', shooter: ENEMY, target: OBSERVER, hit: false,
          x0: 0, y0: cfg.eyeHeight, z0: -10 + dist, x1: 0, y1: cfg.eyeHeight, z1: -10,
        });
        w.observe();
        let sum = 0;
        for (let s = 0; s < cfg.audioSectors; s++) sum += w.obs[OBSERVER * w.obsDim + indexOfField(cfg, `audio${s}.gunshot`)];
        return sum;
      };
      const a = heard(8);
      const b = heard(16);
      const c = heard(24);
      const far = heard(cfg.audioRange + 4);
      const ok = a > b && b > c && c > 0 && far === 0;
      const shape = `8 m ${a.toFixed(3)} > 16 m ${b.toFixed(3)} > 24 m ${c.toFixed(3)}, beyond range ${far.toFixed(3)}`;
      return ok
        ? { status: 'clean', fields: [], detail: `loudness falls with distance and reaches nothing: ${shape}` }
        : { status: 'leak', fields: [], detail: `attenuation is not monotone or does not reach zero: ${shape}` };
    },
  },
  {
    id: 'A1-P19',
    kind: 'counterfactual',
    test: 'T4',
    title: 'the same gunshot, with and without a wall in the way',
    expect: 'clean',
    run: (cfg) => {
      const heard = (boxes: Box[]) => {
        const w = new World(cfg, labMap(cfg, boxes), 1);
        standObserver(w);
        place(w, ENEMY, 0, 6, -Math.PI / 2);
        w.events.push({
          kind: 'shot', shooter: ENEMY, target: OBSERVER, hit: false,
          x0: 0, y0: cfg.eyeHeight, z0: 6, x1: 0, y1: cfg.eyeHeight, z1: -10,
        });
        w.observe();
        let sum = 0;
        for (let s = 0; s < cfg.audioSectors; s++) sum += w.obs[OBSERVER * w.obsDim + indexOfField(cfg, `audio${s}.gunshot`)];
        return sum;
      };
      const clear = heard([]);
      const walled = heard([MID_WALL]);
      return walled < clear && walled > 0
        ? { status: 'clean', fields: [], detail: `a wall muffles the shot without silencing it: ${clear.toFixed(3)} → ${walled.toFixed(3)}` }
        : { status: 'leak', fields: [], detail: `occlusion is wrong: clear ${clear.toFixed(3)}, walled ${walled.toFixed(3)}` };
    },
  },
  {
    id: 'A1-P20',
    kind: 'counterfactual',
    test: 'T4',
    title: 'a walker and a sprinter at the same spot',
    expect: 'clean',
    run: (cfg) => {
      const heard = (speed: number) => {
        const w = new World(cfg, labMap(cfg, []), 1);
        standObserver(w);
        place(w, ENEMY, 0, 0, -Math.PI / 2);
        w.agents[ENEMY].vz = -speed;
        w.observe();
        let sum = 0;
        for (let s = 0; s < cfg.audioSectors; s++) sum += w.obs[OBSERVER * w.obsDim + indexOfField(cfg, `audio${s}.footstep`)];
        return sum;
      };
      const slow = heard(1.5);
      const fast = heard(cfg.maxSpeed);
      return fast > slow
        ? { status: 'clean', fields: [], detail: `moving fast is louder than moving slowly: ${slow.toFixed(3)} → ${fast.toFixed(3)} (the affordance, not a rule that says when to walk)` }
        : { status: 'leak', fields: [], detail: `gait does not change loudness: slow ${slow.toFixed(3)}, fast ${fast.toFixed(3)}` };
    },
  },
  {
    id: 'A1-P21',
    kind: 'counterfactual',
    test: 'T4',
    title: 'a teammate and an enemy making the same noise',
    expect: 'clean',
    run: (cfg) => {
      const heard = (mover: number) => {
        const w = new World(cfg, labMap(cfg, []), 1);
        standObserver(w);
        place(w, mover, 0, 2, -Math.PI / 2);
        w.agents[mover].vz = -cfg.maxSpeed;
        w.observe();
        const out: number[] = [];
        for (let s = 0; s < cfg.audioSectors; s++) {
          out.push(w.obs[OBSERVER * w.obsDim + indexOfField(cfg, `audio${s}.footstep`)]);
        }
        return out;
      };
      const mate = heard(MATE);
      const enemy = heard(ENEMY);
      const same = mate.every((v, i) => Math.abs(v - enemy[i]) < 1e-9) && mate.some((v) => v > 0);
      return same
        ? { status: 'clean', fields: [], detail: 'the same steps sound the same whoever is making them — telling friend from foe is inference, not a label' }
        : { status: 'leak', fields: [], detail: `friend and foe are distinguishable in the audio channel: ${mate.map((v) => v.toFixed(3)).join(',')} vs ${enemy.map((v) => v.toFixed(3)).join(',')}` };
    },
  },
  {
    id: 'A1-P22',
    kind: 'counterfactual',
    test: 'T2',
    title: 'a teammate fires in plain sight',
    expect: 'clean',
    run: (cfg) => {
      // The guard on V11's fix: hiding the field behind a visibility test must not turn it into a dead
      // constant. If this ever reports "nothing moved", A1-P10 is passing for the wrong reason.
      const d = counterfactual(cfg, {
        setup: (w) => {
          standObserver(w);
          place(w, MATE, 0, 6, Math.PI / 2); // 16 m straight ahead, nothing in the way
          for (let m = 2; m < cfg.teamSize; m++) place(w, m, -28 - m, -28, 0);
        },
        mutate: (w) => {
          w.agents[MATE].firing = true;
        },
      });
      const names = d.changed.map((f) => f.name);
      return names.length === 1 && names[0] === 'mate0.firing'
        ? { status: 'clean', fields: [], detail: 'I can see him shoot, and that is the only thing it tells me' }
        : { status: 'leak', fields: names, detail: `expected exactly mate0.firing to move, got [${names.join(', ')}]` };
    },
  },
  {
    id: 'A1-P23',
    kind: 'truth-identity',
    gap: 'V6',
    title: 'a two-second-old memory has not drifted at all',
    expect: 'leak',
    run: (cfg) => {
      const w = new World(cfg, labMap(cfg, [MID_WALL]), 1);
      standObserver(w);
      place(w, ENEMY, 12, 6, -Math.PI / 2); // seen once, in plain view
      w.observe();
      place(w, ENEMY, 0, 10, -Math.PI / 2); // then gone behind the wall, and I stand still
      const bearingAt = (age: number) => {
        w.t = age;
        w.observe();
        const off = OBSERVER * w.obsDim;
        const sin = w.obs[off + indexOfField(cfg, 'enemy0.bearingSin')];
        const cos = w.obs[off + indexOfField(cfg, 'enemy0.bearingCos')];
        return Math.atan2(sin, cos); // the confidence scaling cancels in the ratio
      };
      const confAt = (age: number) => {
        w.t = age;
        w.observe();
        return Math.abs(w.obs[OBSERVER * w.obsDim + indexOfField(cfg, 'enemy0.confidence')]);
      };
      const young = bearingAt(0.2);
      const old = bearingAt(2);
      const drift = Math.abs(wrapAngle(old - young));
      // Check the denominator before reading the ratio: with no world memory the slot is all zeros, and
      // atan2(0, 0) is 0 at every age — which would read as "perfectly stable recall" and keep this probe
      // red for the one reason that means it has nothing to measure (GOTCHAS族 B).
      if (confAt(0.2) === 0 && confAt(2) === 0) {
        return {
          status: 'clean',
          fields: [],
          detail: 'there is no recalled contact at all — once he is out of sight the channel is empty, so the ' +
            'world is not holding a record on my behalf. Whether the BRAIN remembers is a behaviour question, ' +
            'not a leak question.',
        };
      }
      // The confidence scaling cancels in the ratio only up to float32 rounding, which shows up as ~1e-5 rad
      // of fake drift. Real perceptual drift would be degrees over seconds, so the line sits between them.
      const REAL = 1e-3; // rad, about 0.06°
      return drift > REAL
        ? { status: 'clean', fields: [], detail: `the recalled bearing has moved ${(drift * 180 / Math.PI).toFixed(2)}° in 1.8 s` }
        : {
            status: 'leak',
            fields: [],
            detail: `after 1.8 s the recalled bearing has moved ${drift.toExponential(2)} rad — float32 rounding, ` +
              'not memory: the world keeps a perfect record for me and only fades its weight, so remembering ' +
              'is still not the brain\'s job (V6b)',
          };
    },
  },
];

/** Wide version of the mid wall, so a contact well off the centre line is still hidden. */

const WIDE_WALL: Box = { minX: -9, minZ: -1, maxX: 9, maxZ: 1, h: 3 };

export function indexOfField(cfg: SimConfig, name: string): number {
  const f = obsSchema(cfg).find((x) => x.name === name);
  if (!f) throw new Error(`unknown observation field: ${name}`);
  return f.index;
}

/** The registry in probe-number order — the one place that ordering is decided. */
export function sortedProbes(): LeakProbe[] {
  const num = (id: string) => Number(id.replace(/^\D+/, ''));
  return LEAK_PROBES.slice().sort((a, b) => num(a.id) - num(b.id));
}

/**
 * Run the whole matrix against the shipped config, in probe-number order.
 * A probe that throws is NOT caught here: several of them assert their own scenario held (an enemy still
 * being in the contact slot, a wall actually blocking) and a silent catch would turn "my test bench broke"
 * into an ordinary clean/leak reading. Callers running a deliberately non-default config catch it instead.
 */
export function runLeakMatrix(cfg: SimConfig = DEFAULT_SIM): Array<{ probe: LeakProbe; result: ProbeResult }> {
  return sortedProbes().map((probe) => ({ probe, result: probe.run(cfg) }));
}
