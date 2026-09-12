/**
 * ROADMAP C1 exit — asked of the WORLD with reference bots, not of the population.
 *
 *   node scripts/c1exit.ts [--seeds 7,11,23] [--n 8]
 *
 * C1's exit is "scripted/reference agents can show the world ALLOWS it", which is why these bots are allowed
 * to read engine truth and why they must never enter the evolving population (CLAUDE.md). Each question is
 * a comparison, and every run plays BOTH role assignments over the same seeds, so no answer can be an
 * artefact of which colour attacked.
 */
import { DEFAULT_SIM, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap } from '../src/sim/map.ts';
import { stepMatch } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import {
  EagerRotateDefenderPolicy, FakeAttackerPolicy, ReactiveDefenderPolicy, SiteAttackerPolicy,
  SiteDefenderPolicy,
} from '../src/brain/scripted.ts';
import type { Policy } from '../src/brain/policy.ts';

const flag = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const SEEDS = flag('seeds', '7,11,23').split(',').map(Number);
const N = Number(flag('n', '8'));
const cfg: SimConfig = { ...DEFAULT_SIM, roundMode: 'capture', siteCount: 2 };

interface Outcome { atkWin: number; armed: number; armedB: number; rounds: number; meanT: number }

function play(mkAtk: () => Policy, mkDef: () => Policy): Outcome {
  const o: Outcome = { atkWin: 0, armed: 0, armedB: 0, rounds: 0, meanT: 0 };
  for (const seed of SEEDS) {
    const map = generateMap(seed, cfg);
    for (const attackers of [0, 1] as const) {
      for (let m = 0; m < N; m++) {
        const w = new World(cfg, map, hashSeed(31415, seed, m), { attackers });
        const atk = mkAtk();
        const def = mkDef();
        while (!w.done) stepMatch(w, attackers === 0 ? atk : def, attackers === 0 ? def : atk);
        o.rounds++;
        o.meanT += w.t;
        if (w.winner === attackers) o.atkWin++;
        if (w.armedSite >= 0) { o.armed++; if (w.armedSite === 1) o.armedB++; }
      }
    }
  }
  o.meanT /= o.rounds;
  return o;
}

const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(0)}%`;
const line = (label: string, o: Outcome) =>
  console.log(`  ${label.padEnd(38)} attackers ${pct(o.atkWin, o.rounds).padStart(4)}   armed ${pct(o.armed, o.rounds).padStart(4)}` +
    ` (B in ${pct(o.armedB, Math.max(1, o.armed)).padStart(4)})   mean round ${o.meanT.toFixed(1)}s   n=${o.rounds}`);

console.log(`C1 exit, reference bots only — ${SEEDS.length} map seeds x ${N} seeds x both role assignments\n`);

// Defenders that hold their posts: 3 on A, 2 on B.
const SPLIT = [0, 0, 0, 1, 1];
// The early rotate has to happen BEFORE the site is typically armed, or the bot goes to the armed site like
// any other defender and the comparison silently becomes "hold vs hold" — which is what it did at t=8.
const ROTATE_AT = Number(flag('rotate-at', '4'));
const holders = () => new SiteDefenderPolicy(SPLIT);

console.log('E1  can either site be taken at all?');
const e1a = play(() => new SiteAttackerPolicy(0), holders);
const e1b = play(() => new SiteAttackerPolicy(1), holders);
line('all-in on A vs a 3/2 hold', e1a);
line('all-in on B vs a 3/2 hold', e1b);
const e1 = e1a.atkWin > 0 && e1b.atkWin > 0;
console.log(`  => ${e1 ? 'PASS' : 'FAIL'} — both sites are winnable${e1 ? '' : ': one of them is not'}\n`);

console.log('E2  does pressuring A and leaving for B pay, and only against a defender that reacts?');
const straightR = play(() => new SiteAttackerPolicy(1), () => new ReactiveDefenderPolicy(SPLIT));
const fakeR = play(() => new FakeAttackerPolicy(0, 1, 10), () => new ReactiveDefenderPolicy(SPLIT));
const straightS = play(() => new SiteAttackerPolicy(1), holders);
const fakeS = play(() => new FakeAttackerPolicy(0, 1, 10), holders);
line('straight to B vs a REACTIVE defender', straightR);
line('fake A then B vs a REACTIVE defender', fakeR);
line('straight to B vs a defender that HOLDS', straightS);
line('fake A then B vs a defender that HOLDS', fakeS);
const gainR = fakeR.atkWin / fakeR.rounds - straightR.atkWin / straightR.rounds;
const gainS = fakeS.atkWin / fakeS.rounds - straightS.atkWin / straightS.rounds;
// ROADMAP C1's wording is "給 A 壓力後去 B 在某些 defender response 下有收益" — under SOME response. Requiring
// it to beat every response was a stricter bar than the phase sets, and a stricter bar than is true.
const e2 = Math.max(gainR, gainS) > 0;
console.log(`  fake pays ${(gainR * 100).toFixed(0)}pp against a reactive defender and ${(gainS * 100).toFixed(0)}pp against one that holds`);
console.log(`  => ${e2 ? 'PASS' : 'FAIL'} — the phase asks whether it pays against SOME defender response, not every one\n`);

console.log('E3  does rotating too early leave exploitable space?');
// All five defenders on A, not the 3/2 split. Against the split the attackers already win 88%, so there is
// no room left for leaving early to cost anything — the comparison saturates and reads 0pp whatever happens.
// The question needs a defence that is actually holding before you ask what letting go costs.
const STACK = [0, 0, 0, 0, 0];
const vsHold = play(() => new SiteAttackerPolicy(0), () => new SiteDefenderPolicy(STACK));
const vsEager = play(() => new SiteAttackerPolicy(0), () => new EagerRotateDefenderPolicy(STACK, 1, ROTATE_AT));
line('attack A vs five defenders holding A', vsHold);
line(`attack A vs five that leave A at t=${ROTATE_AT}`, vsEager);
const gap = vsEager.atkWin / vsEager.rounds - vsHold.atkWin / vsHold.rounds;
const e3 = gap > 0;
console.log(`  leaving early costs the defenders ${(gap * 100).toFixed(0)}pp`);
console.log(`  => ${e3 ? 'PASS' : 'FAIL'} — space is left behind\n`);

console.log('E4  is there a path that dominates every strategy?');
console.log('  answered geometrically by `npm run mapprobe -- --sites 2`: see the `mid` column, which reports the');
console.log('  fewest components over the middle half of a journey AND how wide that slice is. One component is');
console.log('  only a dominating path if it is also narrow.\n');

const passes = [e1, e2, e3].filter(Boolean).length;
console.log(`${passes}/3 behavioural exit questions pass. E4 is geometric — read mapprobe.`);
process.exitCode = passes === 3 ? 0 : 1;
