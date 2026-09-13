/**
 * ROADMAP D2 — does an evolved team USE its own radio, and for what the messages say? Receiver side, one team at a time.
 *
 *   node scripts/radiouse.ts runs/a.json [more.json ...] [--gens 39,149,last] [--n 24] [--seed 7070]
 *
 * Each champion (at each requested hall-of-fame generation) plays the other colour's champion of every run in its arm —
 * same rules, same generation — while the OBSERVED team's incoming radio (every `mate*.comm*` field it reads) is:
 *   normal    untouched;
 *   shuffled  replaced by a value drawn at random (seeded) from what this team actually HEARD in its normal matches: same
 *             symbol distribution, correlation with the situation destroyed — the in-distribution control (GOTCHAS #24);
 *   off       silence.
 * Only the observed team is edited: ablating both teams reads "everyone got weaker" as a null (recprobe's rule).
 * Δshuffle = fitness(normal) − fitness(shuffled) is the meaning-bearing use; Δoff alone only shows the input is load-bearing.
 *
 * This supersedes the receiver half of `scripts/radio.ts`, which ablates both teams and walks its pool with a fixed stride;
 * radio.ts stays the sender-side instrument (entropy / silence / MI).
 * ⚠ capture fitness is quantised (GOTCHAS #26 ⑤), so every row also says in how many matches the outcome moved at all.
 * ⛔ Scaffold runs (`scaffold` field) are refused: their radio was overwritten during training.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { Rng, hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength, type MlpShape } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { obsSchema } from '../src/sim/obsSchema.ts';
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';

const argv = process.argv.slice(2);
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
if (files.length === 0) {
  console.error('usage: node scripts/radiouse.ts <run.json> [more.json ...] [--gens 39,149,last] [--n 24] [--seed 7070]');
  process.exit(2);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
const N = num('n', 24);
const BASE = num('seed', 7070);
const GEN_SPEC = (flags.get('gens') ?? 'last').split(',').map((s) => s.trim()).filter(Boolean);

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }
interface Entry { tag: string; gen: number; arm: string; rules: string; sim: SimConfig; shape: MlpShape; map: ArenaMap; champ: Float32Array[] }

const entries: Entry[] = [];
for (const path of files) {
  const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
  const tag = basename(path).replace(/\.json$/, '');
  if (data.scaffold) throw new Error(`${tag} is a scaffold run — its radio was overwritten during training, so this readout means nothing for it`);
  const { sim } = normalizeSim(data.sim);
  const shape = shapeFor(sim, data.evo.hidden);
  const map = generateMap(data.evo.mapSeed, sim);
  const radio = sim.commTokens ? `${2 * sim.commTokens + 1}sym/${sim.commIntervalTicks}t/${sim.commDelayTicks}t` : 'continuous';
  for (const spec of GEN_SPEC) {
    const gen = spec === 'last' ? data.hof[0][data.hof[0].length - 1].gen : Number(spec);
    const champ = ([0, 1] as const).map((t) => {
      const e = data.hof[t].find((x) => x.gen === gen);
      if (!e) throw new Error(`${tag}: no hall-of-fame entry for gen ${gen}`);
      if (e.genome.length !== genomeLength(shape)) throw new Error(`${tag}: genome ${e.genome.length} != ${genomeLength(shape)}`);
      return Float32Array.from(e.genome);
    });
    entries.push({ tag, gen, arm: `g${gen} ${radio}`, rules: JSON.stringify(sim) + map.seed, sim, shape, map, champ });
  }
}
for (const x of entries) {
  for (const y of entries) {
    if (x.arm === y.arm && x.rules !== y.rules) throw new Error(`${x.tag} and ${y.tag} share an arm but were trained under different rules or maps`);
  }
}

type Mode = 'normal' | 'shuffled' | 'off';
const MODES: Mode[] = ['normal', 'shuffled', 'off'];
const RESERVOIR = 50000;
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

console.log(`radio use — observed team's incoming radio set to normal / shuffled (drawn from what it really hears) / off;`);
console.log(`each champion vs the other colour's champion of every run in its arm, ${N} seeds x 2 roles each\n`);
console.log(`${padr('arm', 20)}${padr('champion', 24)}${pad('opps', 5)}${pad('fit norm', 9)}${pad('shuffled', 9)}${pad('off', 9)}` +
  `${pad('Δshuffle', 10)}${pad('Δoff', 9)}${pad('moved', 9)}${pad('win n/s/o', 14)}${pad('heard', 7)}`);

const pooled = new Map<string, { dShuffle: number[]; offBelow: number }>();
for (const entry of entries) {
  const opponents = entries.filter((e) => e.arm === entry.arm);
  const commIdx = obsSchema(entry.sim).filter((f) => /^mate\d+\.comm\d+$/.test(f.name)).map((f) => f.index);
  for (const team of [0, 1] as const) {
    // reservoir sample of what this team actually HEARS in normal play; the shuffled mode draws from it
    const reservoir: number[] = [];
    let seen = 0;
    const resRng = new Rng(hashSeed(BASE, 0x5e5, team));
    const mine = new NeuralPolicy(entry.shape, entry.champ[team]);
    const res = new Map<Mode, { fit: number[]; win: number; heardOn: number; heardAll: number }>();
    for (const mode of MODES) {
      const fit: number[] = [];
      let win = 0;
      let heardOn = 0;
      let heardAll = 0;
      opponents.forEach((o, oi) => {
        const theirs = new NeuralPolicy(o.shape, o.champ[1 - team]);
        for (let m = 0; m < N; m++) {
          for (const attackers of [0, 1] as const) {
            const rng = new Rng(hashSeed(BASE, oi, m, attackers));
            const w = new World(entry.sim, entry.map, hashSeed(BASE, m), { attackers });
            const edit = (x: World) => {
              for (let i = 0; i < x.n; i++) {
                const a = x.agents[i];
                if (!a.alive || a.team !== team) continue;
                const base = i * x.obsDim;
                for (const j of commIdx) {
                  if (mode === 'normal') {
                    const v = x.obs[base + j];
                    seen++;
                    if (reservoir.length < RESERVOIR) reservoir.push(v);
                    else { const k = resRng.int(seen); if (k < RESERVOIR) reservoir[k] = v; }
                  } else {
                    x.obs[base + j] = mode === 'off' ? 0 : reservoir[rng.int(reservoir.length)];
                  }
                  heardAll++;
                  if (x.obs[base + j] !== 0) heardOn++;
                }
              }
            };
            while (!w.done) stepMatch(w, team === 0 ? mine : theirs, team === 0 ? theirs : mine, edit);
            const r = summarize(w);
            fit.push(r.fitness[team]);
            win += r.winner === team ? 1 : r.winner === -1 ? 0.5 : 0;
          }
        }
      });
      if (mode === 'normal' && reservoir.length === 0) throw new Error(`${entry.tag}: the team heard nothing at all — no pool to shuffle`);
      res.set(mode, { fit, win: win / fit.length, heardOn, heardAll });
    }
    const nrm = res.get('normal')!;
    const shf = res.get('shuffled')!;
    const off = res.get('off')!;
    if (off.heardOn !== 0) throw new Error('off mode still delivered radio — the ablation did not land');
    const dShuffle = mean(nrm.fit) - mean(shf.fit);
    const dOff = mean(off.fit) - mean(nrm.fit);
    const moved = nrm.fit.filter((v, i) => v !== shf.fit[i]).length;
    const p = pooled.get(entry.arm) ?? { dShuffle: [], offBelow: 0 };
    p.dShuffle.push(dShuffle);
    if (mean(off.fit) < mean(nrm.fit)) p.offBelow++;
    pooled.set(entry.arm, p);
    const pw = (x: number) => (x * 100).toFixed(0);
    console.log(`${padr(entry.arm, 20)}${padr(`${entry.tag}@${entry.gen} ${team === 0 ? 'R' : 'B'}`, 24)}${pad(String(opponents.length), 5)}` +
      `${pad(mean(nrm.fit).toFixed(3), 9)}${pad(mean(shf.fit).toFixed(3), 9)}${pad(mean(off.fit).toFixed(3), 9)}` +
      `${pad(dShuffle.toFixed(3), 10)}${pad(dOff.toFixed(3), 9)}${pad(`${moved}/${nrm.fit.length}`, 9)}` +
      `${pad(`${pw(nrm.win)}/${pw(shf.win)}/${pw(off.win)}%`, 14)}${pad(`${pw(nrm.heardOn / Math.max(1, nrm.heardAll))}%`, 7)}`);
  }
}

console.log('\npooled per arm:');
for (const [arm, p] of pooled) {
  console.log(`  ${padr(arm, 20)} Δshuffle > 0 in ${p.dShuffle.filter((d) => d > 0).length}/${p.dShuffle.length} · pooled mean Δshuffle ${mean(p.dShuffle).toFixed(3)} · off below normal in ${p.offBelow}/${p.dShuffle.length}`);
}
console.log('moved = matches whose team fitness changed at all between normal and shuffled (capture fitness is quantised).');
console.log('heard = share of incoming radio fields that were non-silent in normal play.');
