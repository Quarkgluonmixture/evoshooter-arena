/**
 * ROADMAP D2c — what is a LEGAL finite radio worth in this world? Asked of the world, not of the optimiser.
 *
 *   node scripts/radiodemand.ts [--seeds 7,11,23] [--n 8]
 *
 * memdemand's telepathy row showed the world pays heavily for shared contact, but telepathy shares exact
 * coordinates instantly — an upper bound no radio reaches. D2 trained populations on a 5-symbol radio and found
 * nothing on it, and the E1 identity probe removed the architectural excuse. Before blaming search, ask the
 * channel: a hand-written one-symbol site callout (`RadioCallerPolicy`), sent through the world's real quantiser,
 * send interval and delay, against memdemand's scripted attackers on memdemand's seeds.
 *
 * Rows share seeds and attackers; only the defender and the radio rules change. `radio muted` is the control:
 * every teammate message is zeroed before anyone reads it, which must reproduce `private 0s` match for match.
 * If it does not, the caller is learning something from outside the radio and the script refuses to go on.
 */
import { DEFAULT_SIM, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import {
  FakeAttackerPolicy, MemoryHunterPolicy, RadioCallerPolicy, SiteAttackerPolicy, SiteDefenderPolicy, TeamSightHunterPolicy,
} from '../src/brain/scripted.ts';
import type { Policy } from '../src/brain/policy.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', '7,11,23').split(',').map(Number);
const N = Number(flag('n', '8'));
// memorySeconds 0, as in memdemand: nothing remembers on anyone's behalf
const base: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2, memorySeconds: 0 };
const radio = (commTokens: number, commIntervalTicks: number, commDelayTicks: number): SimConfig =>
  ({ ...base, commTokens, commIntervalTicks, commDelayTicks });

const ATTACKS: { name: string; make: () => Policy }[] = [
  { name: 'straight A', make: () => new SiteAttackerPolicy(0) },
  { name: 'straight B', make: () => new SiteAttackerPolicy(1) },
  { name: 'fake A→B', make: () => new FakeAttackerPolicy(0, 1, 10) },
];
const SPLIT = [0, 0, 0, 1, 1];

interface Row { label: string; cfg: SimConfig; make: () => Policy; mute?: boolean }
const ROWS: Row[] = [
  { label: 'site-holder ref', cfg: base, make: () => new SiteDefenderPolicy(SPLIT) },
  { label: 'private 0s', cfg: base, make: () => new MemoryHunterPolicy(0) },
  { label: 'radio muted (ctl)', cfg: radio(2, 1, 0), make: () => new RadioCallerPolicy(), mute: true },
  { label: 'radio continuous', cfg: radio(0, 1, 0), make: () => new RadioCallerPolicy() },
  { label: 'radio 5sym/1t/0t', cfg: radio(2, 1, 0), make: () => new RadioCallerPolicy() },
  { label: 'radio 5sym/5t/3t', cfg: radio(2, 5, 3), make: () => new RadioCallerPolicy() },
  { label: 'radio 3sym/15t/8t', cfg: radio(1, 15, 8), make: () => new RadioCallerPolicy() },
  { label: 'telepathy 0s', cfg: base, make: () => new TeamSightHunterPolicy(0) },
];

const maps = new Map<number, ArenaMap>(SEEDS.map((s) => [s, generateMap(s, base)]));
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`radio demand — ${SEEDS.length} maps x ${N} seeds x both role assignments per attack; defender = the row`);
console.log('world: capture, 2 sites, memorySeconds 0 · protocol: one symbol = "the enemy I see is nearest my left / right site"\n');
console.log(`${padr('defender', 19)}${ATTACKS.map((a) => pad(a.name, 12)).join('')}${pad('mean', 8)}${pad('armed', 8)}${pad('sight', 8)}${pad('calling', 9)}`);

const signatures = new Map<string, string[]>();
const means = new Map<string, number>();
for (const row of ROWS) {
  const muteIdx = row.mute ? obsSchema(row.cfg).filter((f) => /^mate\d+\.comm\d+$/.test(f.name)).map((f) => f.index) : null;
  const edit = muteIdx ? (w: World) => {
    for (let i = 0; i < w.n; i++) for (const j of muteIdx) w.obs[i * w.obsDim + j] = 0;
  } : undefined;
  const sig: string[] = [];
  const cells: string[] = [];
  let wAll = 0;
  let nAll = 0;
  let armedAll = 0;
  let sightAll = 0;
  let callTicks = 0;
  let aliveTicks = 0;
  for (const atk of ATTACKS) {
    let w = 0;
    let n = 0;
    for (const mapSeed of SEEDS) {
      for (const attackers of [0, 1] as const) {
        for (let m = 0; m < N; m++) {
          const world = new World(row.cfg, maps.get(mapSeed)!, hashSeed(8642, mapSeed, m), { attackers });
          const A = atk.make();
          const D = row.make();
          const defender = attackers === 0 ? 1 : 0;
          while (!world.done) {
            stepMatch(world, attackers === 0 ? A : D, attackers === 0 ? D : A, edit);
            // the denominator: how often a living defender is actually transmitting something
            for (const a of world.agents) {
              if (!a.alive || a.team !== defender) continue;
              aliveTicks++;
              if (Math.abs(a.commSaid[0]) > 0.25) callTicks++;
            }
          }
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
  console.log(`${padr(row.label, 19)}${cells.join('')}${pad(`${((wAll / nAll) * 100).toFixed(0)}%`, 8)}` +
    `${pad(`${((armedAll / nAll) * 100).toFixed(0)}%`, 8)}${pad((sightAll / nAll).toFixed(0), 8)}` +
    `${pad(`${((callTicks / Math.max(1, aliveTicks)) * 100).toFixed(0)}%`, 9)}`);
  if (row.mute) {
    const ref = signatures.get('private 0s')!;
    const diff = sig.filter((s, i) => s !== ref[i]).length;
    if (diff > 0) {
      throw new Error(`control failed: radio muted differs from private 0s in ${diff}/${sig.length} matches — the caller is getting information from outside the radio`);
    }
    console.log(`${' '.repeat(19)}✓ control: muted caller == private 0s in all ${sig.length} matches (the radio is the only thing it adds)`);
  }
}

const p0 = means.get('private 0s')!;
const G = means.get('telepathy 0s')! - p0;
const share = (label: string) => (G > 0 ? (means.get(label)! - p0) / G : NaN);
console.log();
console.log(`G = telepathy − private = ${(G * 100).toFixed(0)}pp. Share of G recovered by each radio row:`);
for (const r of ROWS.filter((x) => x.label.startsWith('radio ') && !x.mute)) {
  console.log(`  ${padr(r.label, 19)}${pad(`${(share(r.label) * 100).toFixed(0)}%`, 6)}`);
}
console.log();
console.log('against runs/d2c-radiodemand-predictions.txt:');
console.log(`  P1  5sym/1t/0t recovers >= 50% of G          ${(share('radio 5sym/1t/0t') * 100).toFixed(0)}%`);
console.log(`  P2  5sym/5t/3t within 5pp of 5sym/1t/0t       ${((means.get('radio 5sym/5t/3t')! - means.get('radio 5sym/1t/0t')!) * 100).toFixed(0)}pp`);
console.log(`  P3  3sym/15t/8t recovers >= 33% of G          ${(share('radio 3sym/15t/8t') * 100).toFixed(0)}%`);
console.log('cell / mean = DEFENDER win share. armed = rounds where a site got armed. sight = sighting ticks per match.');
console.log('calling = share of living-defender ticks with a non-silent symbol leaving the radio (0 = the radio never happened).');
console.log('⚠ one hand-written protocol is ONE point in protocol space: a low number bounds this protocol, not every radio.');
