/**
 * Does this world PAY for temporal belief? — asked of the world, not of the optimiser.
 *
 *   node scripts/memdemand.ts [--seeds 7,11] [--n 8] [--horizons 0,1,3,10]
 *
 * D1's reopened result was that the recurrent channel is used as a learned constant even after C1/C2 made
 * the objective pay. That measurement cannot tell "temporal belief is worth nothing here" from "mutation
 * cannot find it": per-weight gaussian noise applies no pressure toward credit assignment across time.
 *
 * This separates them without training anything. `MemoryHunterPolicy(s)` chases a visible enemy and, for `s`
 * seconds after losing sight, keeps moving to where it last saw him. Round-robin the horizons against each
 * other, both role assignments, same seeds. If win rate follows the horizon, the world rewards memory and
 * evolution's failure to use it is a SEARCH problem. If it does not, there is no demand to find, and D1
 * should stop being described as a debt this world is carrying.
 */
import { DEFAULT_SIM, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { runMatch } from '../src/evo/match.ts';
import { FakeAttackerPolicy, MemoryHunterPolicy, SiteAttackerPolicy, SiteDefenderPolicy } from '../src/brain/scripted.ts';
import type { Policy } from '../src/brain/policy.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', '7,11').split(',').map(Number);
const N = Number(flag('n', '8'));
// -1 = the plain site-holding reference defender, as a sanity anchor next to the memory sweep
const H = flag('horizons', '-1,0,1,3,10').split(',').map(Number);
// memorySeconds 0 so the WORLD is not remembering on anyone's behalf — the only memory in play is the bot's.
const cfg: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2, memorySeconds: 0 };

const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

console.log(`memory demand — horizons ${H.join(' / ')} s, ${SEEDS.length} maps x ${N} seeds x both role assignments`);
console.log(`world: capture, 2 sites, memorySeconds 0 (nothing is remembering except the bot itself)\n`);

// ⚠ v1 of this script round-robined hunter-vs-hunter and read EXACTLY 50% in every cell. The reason was not
// a tie: two hunters fight all match and neither ever holds a site uncontested long enough to arm it, so the
// DEFENDER always won and the only thing deciding a match was which side had been assigned to defend. The
// horizon could not show up at all (GOTCHAS #26 — prove the measurement reached the assertion).
//
// v2 asks the question where memory actually has a job: the ATTACKER is a fixed bot that goes and captures,
// and the DEFENDER's memory horizon is swept. A defender who loses sight of an intruder either remembers
// where he went or goes back to standing on a site.
const ATTACKS: { name: string; make: () => Policy }[] = [
  { name: 'straight A', make: () => new SiteAttackerPolicy(0) },
  { name: 'straight B', make: () => new SiteAttackerPolicy(1) },
  { name: 'fake A→B', make: () => new FakeAttackerPolicy(0, 1, 10) },
];
const SPLIT = [0, 0, 0, 1, 1];

console.log(`${padr('defender memory', 17)}${ATTACKS.map((a) => pad(a.name, 14)).join('')}${pad('mean', 8)}${pad('armed', 8)}${pad('sight', 8)}`);
const means: number[] = [];
for (const h of H) {
  const cells: string[] = [];
  let wAll = 0;
  let nAll = 0;
  let armedAll = 0;
  let sightAll = 0;
  for (const atk of ATTACKS) {
    let w = 0;
    let n = 0;
    for (const mapSeed of SEEDS) {
      const map = generateMap(mapSeed, cfg);
      for (const attackers of [0, 1] as const) {
        for (let m = 0; m < N; m++) {
          const seed = hashSeed(8642, mapSeed, m);
          const A = atk.make();
          const D = h < 0 ? new SiteDefenderPolicy(SPLIT) : new MemoryHunterPolicy(h);
          const r = runMatch(attackers === 0 ? A : D, attackers === 0 ? D : A, map, seed, cfg, { attackers });
          const defender = attackers === 0 ? 1 : 0;
          n++;
          if (r.winner === defender) w++;
          armedAll += r.metrics[0].objectiveProgress >= 1 || r.metrics[1].objectiveProgress >= 1 ? 1 : 0;
          sightAll += r.metrics[0].sightTicks + r.metrics[1].sightTicks;
        }
      }
    }
    cells.push(pad(`${((w / n) * 100).toFixed(0)}%`, 14));
    wAll += w;
    nAll += n;
  }
  means.push(wAll / nAll);
  console.log(`${padr(h < 0 ? 'site-holder ref' : `${h}s`, 17)}${cells.join('')}${pad(`${((wAll / nAll) * 100).toFixed(0)}%`, 8)}` +
    `${pad(`${((armedAll / nAll) * 100).toFixed(0)}%`, 8)}${pad((sightAll / nAll).toFixed(0), 8)}`);
}
console.log();
console.log('cell / mean = DEFENDER win share. armed = rounds where a site got armed (if ~0 the objective never');
console.log('happened and nothing here is about memory). sight = mean sighting ticks per match.');
console.log(`⭐ Read the mean column against the horizon: ${H.map((h, i) => `${h}s ${(means[i] * 100).toFixed(0)}%`).join('  ')}`);
console.log('   Rising = this world pays for temporal belief and evolution not using it is a SEARCH problem.');
console.log('   Flat = there is no demand here to find, and D1 should stop being called a debt this world carries.');
