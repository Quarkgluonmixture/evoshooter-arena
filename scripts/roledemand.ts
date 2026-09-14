/**
 * ROADMAP E1 — what is PLAYER-SHAPED individuality worth in this world? Asked of the world, not of the optimiser.
 *
 *   node scripts/roledemand.ts [--seeds 7,11,23] [--n 8]
 *
 * E1's identity probe showed the shared brain already carries "one 40-dim bias per player" (slot one-hot x layer 1) and that
 * evolution uses it. So E1 may not build player blocks until something shows that a per-player CONSTANT is not enough. This
 * asks the world with hand-written defenders, exactly as D1 (memdemand) and D2c (radiodemand) did: same attackers, same maps,
 * same seeds, same rules — only the SHAPE of the defenders' differences changes.
 *
 *   identical x5        one rule for everyone; differences come only from each player's inputs (= radiodemand's `private 0s`,
 *                       and the control: it must reproduce that row match for match);
 *   per-player constant one number per player (which site is mine) = what today's slot one-hot bias can express;
 *   roles x5            players differ in the shape of their rule (anchor / reactive rotator / hunter / camper);
 *   role oracle         everyone holds the site the attack actually goes to — the ceiling of perfect assignment, not a legal
 *                       strategy (reference-only, reads engine truth, like telepathy in memdemand).
 *
 * ⚠ Scripted roles are ONE point in role space: a small number bounds THIS role set, not every possible individuality.
 * ⛔ Reference bots never enter the evolving population (CLAUDE.md), and nothing here is a training path.
 */
import { DEFAULT_SIM, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import {
  CamperPolicy, EagerRotateDefenderPolicy, FakeAttackerPolicy, MemoryHunterPolicy, ReactiveDefenderPolicy,
  SiteAttackerPolicy, SiteDefenderPolicy,
} from '../src/brain/scripted.ts';
import type { Policy } from '../src/brain/policy.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', '7,11,23').split(',').map(Number);
const N = Number(flag('n', '8'));
const base: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2, memorySeconds: 0 };

/** Runs a different policy per team slot — the only thing in this script that no single scripted policy can do. */
class PerSlotPolicy implements Policy {
  private readonly per: Policy[];
  constructor(per: Policy[]) { this.per = per; }
  act(world: World, agent: number): void {
    const slot = world.agents[agent].slot;
    this.per[slot % this.per.length].act(world, agent);
  }
}

/** Holds whichever site the attackers are actually converging on: perfect assignment, engine truth, upper bound only. */
class OracleDefenderPolicy extends SiteAttackerPolicy {
  protected override target(world: World, slot: number): number {
    if (world.armedSite >= 0) return world.armedSite;
    const near = world.map.sites.map(() => 0);
    for (const a of world.agents) {
      if (!a.alive || a.team !== world.attackers) continue;
      let best = 0;
      let bestD = Infinity;
      world.map.sites.forEach((s, i) => {
        const d = Math.hypot(a.x - s.x, a.z - s.z);
        if (d < bestD) { bestD = d; best = i; }
      });
      near[best]++;
    }
    return Math.max(...near) > 0 ? near.indexOf(Math.max(...near)) : super.target(world, slot);
  }
}

const ATTACKS: { name: string; make: () => Policy }[] = [
  { name: 'straight A', make: () => new SiteAttackerPolicy(0) },
  { name: 'straight B', make: () => new SiteAttackerPolicy(1) },
  { name: 'fake A→B', make: () => new FakeAttackerPolicy(0, 1, 10) },
];
const SPLIT = [0, 0, 0, 1, 1];

interface Row { label: string; make: () => Policy; control?: boolean }
const ROWS: Row[] = [
  { label: 'identical x5 (ctl)', make: () => new MemoryHunterPolicy(0), control: true },
  { label: 'per-player const', make: () => new SiteDefenderPolicy(SPLIT) },
  { label: 'roles x5 (a)', make: () => new PerSlotPolicy([
    new SiteDefenderPolicy(0), new SiteDefenderPolicy(0), new SiteDefenderPolicy(1),
    new ReactiveDefenderPolicy(0), new MemoryHunterPolicy(0),
  ]) },
  { label: 'roles x5 (b)', make: () => new PerSlotPolicy([
    new SiteDefenderPolicy(0), new SiteDefenderPolicy(1), new CamperPolicy(),
    new EagerRotateDefenderPolicy(0, 1, 12), new ReactiveDefenderPolicy(1),
  ]) },
  { label: 'role oracle (ub)', make: () => new OracleDefenderPolicy(SPLIT) },
];

const maps = new Map<number, ArenaMap>(SEEDS.map((s) => [s, generateMap(s, base)]));
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`role demand — ${SEEDS.length} maps x ${N} seeds x both role assignments per attack; defender = the row`);
console.log('world: capture, 2 sites, memorySeconds 0 · the question: what does player-SHAPED individuality add over one constant per player?\n');
console.log(`${padr('defender', 20)}${ATTACKS.map((a) => pad(a.name, 12)).join('')}${pad('mean', 8)}${pad('armed', 8)}${pad('sight', 8)}`);

const means = new Map<string, number>();
const signatures = new Map<string, string[]>();
for (const row of ROWS) {
  const sig: string[] = [];
  const cells: string[] = [];
  let wAll = 0;
  let nAll = 0;
  let armedAll = 0;
  let sightAll = 0;
  for (const atk of ATTACKS) {
    let w = 0;
    let n = 0;
    for (const mapSeed of SEEDS) {
      for (const attackers of [0, 1] as const) {
        for (let m = 0; m < N; m++) {
          const world = new World(base, maps.get(mapSeed)!, hashSeed(8642, mapSeed, m), { attackers });
          const A = atk.make();
          const D = row.make();
          const defender = attackers === 0 ? 1 : 0;
          while (!world.done) stepMatch(world, attackers === 0 ? A : D, attackers === 0 ? D : A);
          const r = summarize(world);
          const sight = r.metrics[0].sightTicks + r.metrics[1].sightTicks;
          sig.push(`${r.winner}|${sight}|${r.ticks}`);
          n++;
          if (r.winner === defender) w++;
          armedAll += r.metrics[0].objectiveProgress >= 1 || r.metrics[1].objectiveProgress >= 1 ? 1 : 0;
          sightAll += sight;
        }
      }
    }
    cells.push(pad(`${((w / n) * 100).toFixed(0)}%`, 12));
    wAll += w;
    nAll += n;
  }
  signatures.set(row.label, sig);
  means.set(row.label, wAll / nAll);
  console.log(`${padr(row.label, 20)}${cells.join('')}${pad(`${((wAll / nAll) * 100).toFixed(0)}%`, 8)}` +
    `${pad(`${((armedAll / nAll) * 100).toFixed(0)}%`, 8)}${pad((sightAll / nAll).toFixed(0), 8)}`);
  // GOTCHAS #13 / #18: a scripted row with no contact would read as a clean number and mean nothing
  if (sightAll / nAll < 50) throw new Error(`${row.label}: ${(sightAll / nAll).toFixed(0)} sighting ticks per match — nobody met anybody, the row is empty`);
}

const pp = (a: string, b: string) => `${(((means.get(a)! - means.get(b)!) * 100)).toFixed(0)}pp`;
console.log();
console.log('against runs/e1-roledemand-predictions.txt:');
console.log(`  P1  best roles x5 within 5pp of the per-player constant   ${pp(
  means.get('roles x5 (a)')! >= means.get('roles x5 (b)')! ? 'roles x5 (a)' : 'roles x5 (b)', 'per-player const')}`);
console.log(`  P2  per-player constant beats identical x5 by >= 15pp     ${pp('per-player const', 'identical x5 (ctl)')}`);
console.log(`  P3  identical x5 == radiodemand's 'private 0s' row        run: npm run radiodemand (same seeds / bots / sim)`);
console.log(`  headroom: role oracle − best roles x5                     ${pp('role oracle (ub)',
  means.get('roles x5 (a)')! >= means.get('roles x5 (b)')! ? 'roles x5 (a)' : 'roles x5 (b)')}`);
console.log('cell / mean = DEFENDER win share. armed = rounds where a site got armed. sight = sighting ticks per match.');
console.log('⚠ ONE point in role space: a small number bounds THIS role set, not every possible individuality.');
