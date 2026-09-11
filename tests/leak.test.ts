import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_SIM } from '../src/core/config.ts';
import { obsDim, World } from '../src/sim/world.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { LEAK_PROBES, counterfactual, labMap, place, runLeakMatrix } from '../src/probe/leak.ts';

const cfg = DEFAULT_SIM;

/** Names of the observation fields that move when `mutate` is applied to the observer's world. */
function moved(mutate: (w: World) => void, setup: (w: World) => void = stand, addBoxes = [] as never[]): string[] {
  return counterfactual(cfg, { setup, mutate, addBoxes }).changed.map((f) => f.name);
}

function stand(w: World): void {
  place(w, 0, 0, -10, Math.PI / 2);
  place(w, 1, 6, -10, Math.PI / 2);
}

describe('observation schema', () => {
  it('names every index exactly once and matches the world layout', () => {
    const s = obsSchema(cfg);
    expect(s.length).toBe(obsDim(cfg));
    expect(new Set(s.map((f) => f.name)).size).toBe(s.length);
    expect(s.every((f, i) => f.index === i)).toBe(true);
  });

  it('stays in step with smaller configurations too', () => {
    const small = { ...cfg, teamSize: 3, mateSlots: 2, enemySlots: 2, lidarRays: 4, commDim: 1 };
    expect(obsSchema(small).length).toBe(obsDim(small));
  });

  // The schema is a second description of a layout that world.observe() writes by hand, so bind the names
  // to behaviour: change one world quantity and check that exactly the declared fields respond.
  it('binds self fields to my own body', () => {
    expect(moved((w) => { w.agents[0].hp = 30; })).toEqual(['self.hp']);
    expect(moved((w) => { w.agents[0].ammo = 4; })).toEqual(['self.ammo']);
    expect(moved((w) => { w.agents[0].dmgRecent = 25; })).toEqual(['self.dmgRecent']);
  });

  it('binds geometry fields to walls', () => {
    const fields = moved(() => {}, stand, [{ minX: -8, minZ: -6, maxX: 8, maxZ: -4, h: 2.6 }] as never);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((n) => n.startsWith('geom.lidar'))).toBe(true);
  });

  it('binds teammate fields to teammate bodies', () => {
    const fields = moved((w) => place(w, 1, 5, -10, Math.PI / 2));
    expect(fields).toEqual(['mate0.dx', 'mate0.dist']);
  });

  it('binds comm fields to the radio', () => {
    expect(moved((w) => { w.agents[1].comm[0] = 0.5; })).toEqual(['mate0.comm0']);
  });
});

describe('information leak matrix (ROADMAP A1)', () => {
  // Each probe is registered with the status we currently expect. A mechanism fix flips a probe to
  // 'clean' and turns this red on purpose: update the registry in the same commit as the fix.
  for (const probe of LEAK_PROBES) {
    it(`${probe.id} [${probe.expect}] ${probe.title}`, () => {
      const r = probe.run(cfg);
      expect(r.status, r.detail).toBe(probe.expect);
      if (probe.expectFields) expect(r.fields.slice().sort()).toEqual(probe.expectFields.slice().sort());
      if (probe.expect === 'clean') expect(r.fields).toEqual([]);
    });
  }

  it('is reproducible', () => {
    const a = runLeakMatrix(cfg).map((e) => `${e.probe.id}:${e.result.status}:${e.result.fields.join(',')}`);
    const b = runLeakMatrix(cfg).map((e) => `${e.probe.id}:${e.result.status}:${e.result.fields.join(',')}`);
    expect(a).toEqual(b);
  });

  it('covers every known observation gap', () => {
    const inSchema = new Set(obsSchema(cfg).filter((f) => f.gap && f.legality !== 'legal').map((f) => f.gap!));
    const probed = new Set(LEAK_PROBES.map((p) => p.gap).filter(Boolean));
    for (const gap of inSchema) expect(probed, `gap ${gap} has no probe`).toContain(gap);
  });
});

describe('analytics firewall (SUBSTRATE T8)', () => {
  it('keeps the probes out of the simulation dependency graph', () => {
    for (const dir of ['src/sim', 'src/brain', 'src/evo', 'src/worker', 'src/render', 'src/ui']) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.ts')) continue;
        expect(readFileSync(`${dir}/${f}`, 'utf8'), `${dir}/${f}`).not.toMatch(/from '.*probe\//);
      }
    }
  });
});

describe('lab scenarios', () => {
  it('parks the two teams outside each other’s view range', () => {
    const w = new World(cfg, labMap(cfg, []), 1);
    w.observe();
    expect(Array.from(w.visible).every((v) => v === 0)).toBe(true);
  });
});
