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
import type { Box } from '../sim/geom.ts';
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
  return d.changed.length === 0
    ? { status: 'clean', fields, detail: cleanNote }
    : { status: 'leak', fields, detail: `${leakNote} (max |Δ| ${d.maxDelta.toFixed(3)})` };
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
    expect: 'leak',
    expectFields: ['geom.lidar5', 'geom.lidar6', 'geom.lidar7'],
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
    expect: 'leak',
    expectFields: ['mate0.firing'],
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
    expect: 'leak',
    expectFields: ['obj.enemyInZone'],
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
    expect: 'leak',
    expectFields: ['enemy0.dx', 'enemy0.dz', 'enemy0.dist', 'enemy0.exposure'], // A3.1 deleted the other three
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
    expect: 'leak',
    expectFields: ['enemy0.present', 'enemy0.dz', 'enemy0.dist', 'enemy0.exposure', 'enemy0.visible'],
    run: (cfg) => {
      const d = counterfactual(cfg, {
        setup: (w) => {
          place(w, OBSERVER, 0, -15, Math.PI / 2);
          place(w, ENEMY, 0, cfg.viewRange - 15.1, -Math.PI / 2); // 29.9 m away, in full view
        },
        mutate: (w) => place(w, ENEMY, 0, cfg.viewRange - 14.9, -Math.PI / 2), // 30.1 m away
      });
      const fields = d.changed.map((f) => f.name);
      return d.changed.length === 0
        ? { status: 'clean', fields, detail: 'perception degrades continuously across the range limit' }
        : {
            status: 'leak',
            fields,
            detail: `20 cm of enemy movement flips ${fields.length} observation fields ` +
              `(max |Δ| ${d.maxDelta.toFixed(3)}): the contact does not fade, it is deleted`,
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
    title: 'my memory of a contact is a perfect step function the world keeps for me',
    expect: 'leak',
    expectFields: ['enemy0.present', 'enemy0.dx', 'enemy0.dz', 'enemy0.dist', 'enemy0.staleness'],
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
      const fields: string[] = [];
      for (let k = 0; k < before.length; k++) if (Math.abs(before[k] - after[k]) > 1e-9) fields.push(schema[k].name);
      return fields.length === 0
        ? { status: 'clean', fields, detail: 'remembering is the brain’s job and it degrades on its own terms' }
        : {
            status: 'leak',
            fields,
            detail: `200 ms either side of the ${cfg.memorySeconds} s memory window flips ${fields.length} fields: ` +
              'the world holds an exact position for me, at full precision, and then deletes it in one tick',
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

/** Run the whole matrix against the shipped config, in probe-number order. */
export function runLeakMatrix(cfg: SimConfig = DEFAULT_SIM): Array<{ probe: LeakProbe; result: ProbeResult }> {
  const num = (id: string) => Number(id.replace(/^\D+/, ''));
  return LEAK_PROBES.slice()
    .sort((a, b) => num(a.id) - num(b.id))
    .map((probe) => ({ probe, result: probe.run(cfg) }));
}
