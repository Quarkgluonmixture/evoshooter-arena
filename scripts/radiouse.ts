/**
 * ROADMAP D2 — does an evolved team USE its own radio, and for what the messages say? Receiver side, one team at a time.
 *
 *   node scripts/radiouse.ts runs/a.json [more.json ...] [--gens 39,149,last] [--n 24] [--seed 7070]
 *
 * Each champion (at each requested hall-of-fame generation) plays the other colour's champion of every run in its arm —
 * same rules, same generation — while the OBSERVED team's incoming radio (every `mate*.comm*` field it reads) is:
 *   normal    untouched;
 *   speaker   ⭐ each teammate's broadcast replaced by something that SAME speaker (team slot) said at another moment in
 *             normal play: who talks and how each speaker habitually talks survive, only WHEN it was said is destroyed;
 *   frozen    each teammate always broadcasts his most common symbol from normal play: a pure per-speaker constant code;
 *   shuffled  each teammate's broadcast replaced by anything this team heard in normal play: destroys timing AND habits;
 *   off       silence.
 * Only the observed team is edited: ablating both teams reads "everyone got weaker" as a null (recprobe's rule).
 * A substitute is drawn once per (speaker, channel) per send interval, aligned to the delayed send grid, and every
 * listener hears the same one — a real broadcast holds a symbol for `commIntervalTicks` and says one thing to everybody.
 * A dead speaker stays silent in every mode, as in normal play.
 *
 * Reading it:  Δspeaker = normal − speaker   ⇒ SITUATIONAL content (what is happening now);
 *              Δfrozen  = normal − frozen    ⇒ more than a per-speaker constant (≈ 0 means a constant code is enough);
 *              Δshuffle = normal − shuffled  ⇒ timing and/or per-speaker structure — on its own, not content;
 *              Δoff                          ⇒ the input is load-bearing at all.
 * ⚠ Readout history (both found on the d2-radio control before any long run was read):
 *   v1 had only `shuffled` and read pooled Δshuffle +0.543 on a radio whose sender side shows 0–1% MI — a per-speaker
 *   constant code (the shape D1's recurrent state had, GOTCHAS #24) would do that, hence `speaker` and `frozen`;
 *   v2 redrew substitutes EVERY tick and independently per listener, so a held symbol flickered and two teammates heard one
 *   speaker say different things. Its pooled Δspeaker passed (+0.042) only because per-champion −0.51 and +0.69 cancelled.
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
import { stepMatch, summarize } from '../src/evo/match.ts';
import { World } from '../src/sim/world.ts';
import { mateFields, mateSlotSpeakers } from '../src/probe/radioCall.ts';

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

type Mode = 'normal' | 'speaker' | 'frozen' | 'shuffled' | 'off';
const MODES: Mode[] = ['normal', 'speaker', 'frozen', 'shuffled', 'off'];
const RESERVOIR = 50000;
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Reservoir sample with a seeded generator, so a readout is reproducible. */
class Reservoir {
  readonly xs: number[] = [];
  private seen = 0;
  private readonly rng: Rng;
  constructor(seed: number) { this.rng = new Rng(seed); }
  add(v: number): void {
    this.seen++;
    if (this.xs.length < RESERVOIR) this.xs.push(v);
    else { const k = this.rng.int(this.seen); if (k < RESERVOIR) this.xs[k] = v; }
  }
}

/** Most common value (a quantised radio has a handful of symbols); falls back to the mean for a continuous one. */
function modal(xs: number[]): number {
  const counts = new Map<number, number>();
  for (const v of xs) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
    if (counts.size > 64) return mean(xs);
  }
  let best = 0;
  let bestN = -1;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

console.log('radio use — observed team hears normal / speaker (same speaker, another moment) / frozen (each speaker\'s usual symbol) / shuffled / off;');
console.log(`one substitute per speaker per send interval, the same for every listener; each champion vs the other colour's champion of every run in its arm, ${N} seeds x 2 roles\n`);
console.log(`${padr('arm', 16)}${padr('champion', 20)}${pad('normal', 8)}${pad('speaker', 8)}${pad('frozen', 8)}${pad('shuffled', 9)}${pad('off', 8)}` +
  `${pad('Δspeaker', 9)}${pad('Δfrozen', 9)}${pad('Δshuffle', 9)}${pad('Δoff', 8)}${pad('moved', 7)}${pad('win n/sp/fr/sh/off', 21)}${pad('heard', 6)}`);

const pooled = new Map<string, { dSpeaker: number[]; dFrozen: number[]; dShuffle: number[]; offBelow: number }>();
for (const entry of entries) {
  const opponents = entries.filter((e) => e.arm === entry.arm);
  const { dx, comm } = mateFields(entry.sim);
  const allComm = comm.flat();
  const T = entry.sim.teamSize;
  const C = entry.sim.commDim;
  const interval = Math.max(1, entry.sim.commIntervalTicks);
  const delay = entry.sim.commDelayTicks;
  for (const team of [0, 1] as const) {
    // what this team HEARS in normal play: pooled, and per speaker (team slot) x channel
    const heard = new Reservoir(hashSeed(BASE, 0x5e5, team));
    const bySpeaker = Array.from({ length: T }, (_, s) => Array.from({ length: C }, (_, c) => new Reservoir(hashSeed(BASE, 0x5e6, team, s, c))));
    let usual: number[][] = [];
    const mine = new NeuralPolicy(entry.shape, entry.champ[team]);
    const res = new Map<Mode, { fit: number[]; win: number; heardOn: number; heardAll: number }>();
    const order: number[] = [];
    for (const mode of MODES) {
      if (mode === 'frozen') usual = bySpeaker.map((row) => row.map((r) => modal(r.xs)));
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
            // one substitute per (speaker agent, channel), redrawn when that speaker's heard symbol could change
            const subst = new Float32Array(w.n * C);
            let drawn = false;
            const edit = (x: World) => {
              if (mode === 'speaker' || mode === 'shuffled' || mode === 'frozen') {
                const onGrid = (((x.tick - delay) % interval) + interval) % interval === 0;
                if (!drawn || onGrid) {
                  drawn = true;
                  for (const sp of x.agents) {
                    if (sp.team !== team) continue;
                    for (let c = 0; c < C; c++) {
                      const pool = mode === 'shuffled' ? heard.xs : bySpeaker[sp.slot][c].xs;
                      subst[sp.id * C + c] = mode === 'frozen' ? usual[sp.slot][c] : pool.length ? pool[rng.int(pool.length)] : 0;
                    }
                  }
                }
              }
              for (let i = 0; i < x.n; i++) {
                const a = x.agents[i];
                if (!a.alive || a.team !== team) continue;
                const base = i * x.obsDim;
                if (mode === 'off') {
                  for (const j of allComm) x.obs[base + j] = 0;
                } else {
                  mateSlotSpeakers(x, entry.sim, i, dx, order);
                  for (let s = 0; s < order.length; s++) {
                    const sp = x.agents[order[s]];
                    for (let c = 0; c < C; c++) {
                      const j = base + comm[s][c];
                      if (mode === 'normal') {
                        heard.add(x.obs[j]);
                        if (sp.alive) bySpeaker[sp.slot][c].add(x.obs[j]);
                      } else {
                        x.obs[j] = sp.alive ? subst[sp.id * C + c] : 0;
                      }
                    }
                  }
                }
                for (const j of allComm) {
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
      if (mode === 'normal' && heard.xs.length === 0) throw new Error(`${entry.tag}: the team heard nothing at all — no pool to draw from`);
      res.set(mode, { fit, win: win / fit.length, heardOn, heardAll });
    }
    const f = (m: Mode) => mean(res.get(m)!.fit);
    const off = res.get('off')!;
    if (off.heardOn !== 0) throw new Error('off mode still delivered radio — the ablation did not land');
    const nrm = res.get('normal')!;
    const dSpeaker = f('normal') - f('speaker');
    const dFrozen = f('normal') - f('frozen');
    const dShuffle = f('normal') - f('shuffled');
    const dOff = f('off') - f('normal');
    const moved = nrm.fit.filter((v, i) => v !== res.get('speaker')!.fit[i]).length;
    const p = pooled.get(entry.arm) ?? { dSpeaker: [], dFrozen: [], dShuffle: [], offBelow: 0 };
    p.dSpeaker.push(dSpeaker);
    p.dFrozen.push(dFrozen);
    p.dShuffle.push(dShuffle);
    if (f('off') < f('normal')) p.offBelow++;
    pooled.set(entry.arm, p);
    const pw = (m: Mode) => (res.get(m)!.win * 100).toFixed(0);
    console.log(`${padr(entry.arm, 16)}${padr(`${entry.tag}@${entry.gen} ${team === 0 ? 'R' : 'B'}`, 20)}` +
      `${pad(f('normal').toFixed(3), 8)}${pad(f('speaker').toFixed(3), 8)}${pad(f('frozen').toFixed(3), 8)}${pad(f('shuffled').toFixed(3), 9)}${pad(f('off').toFixed(3), 8)}` +
      `${pad(dSpeaker.toFixed(3), 9)}${pad(dFrozen.toFixed(3), 9)}${pad(dShuffle.toFixed(3), 9)}${pad(dOff.toFixed(3), 8)}${pad(`${moved}/${nrm.fit.length}`, 7)}` +
      `${pad(`${pw('normal')}/${pw('speaker')}/${pw('frozen')}/${pw('shuffled')}/${pw('off')}%`, 21)}${pad(`${((nrm.heardOn / Math.max(1, nrm.heardAll)) * 100).toFixed(0)}%`, 6)}`);
  }
}

console.log('\npooled per arm:');
for (const [arm, p] of pooled) {
  const small = p.dSpeaker.filter((d) => Math.abs(d) <= 0.25).length;
  console.log(`  ${padr(arm, 16)} Δspeaker > 0 in ${p.dSpeaker.filter((d) => d > 0).length}/${p.dSpeaker.length} · pooled Δspeaker ${mean(p.dSpeaker).toFixed(3)}` +
    ` (|Δspeaker| <= 0.25 in ${small}/${p.dSpeaker.length}) · pooled Δfrozen ${mean(p.dFrozen).toFixed(3)} · pooled Δshuffle ${mean(p.dShuffle).toFixed(3)} · off below normal in ${p.offBelow}/${p.dSpeaker.length}`);
}
console.log('moved = matches whose team fitness changed at all between normal and speaker (capture fitness is quantised).');
console.log('heard = share of incoming radio fields that were non-silent in normal play.');
