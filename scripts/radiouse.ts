/**
 * ROADMAP D2 — does an evolved team USE its own radio, and for what the messages say? Receiver side, one team at a time.
 *
 *   node scripts/radiouse.ts runs/a.json [more.json ...] [--gens 39,149,last] [--n 24] [--seed 7070] [--observe tag:B,tag:R]
 *
 * `--observe` reads only the listed champions (run tag + colour); every other entry still serves as an opponent.
 * Each champion's draws are seeded by its own team and match indices, so filtering changes no number.
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
 * A substitute is drawn once per speaker per send interval, aligned to the delayed send grid, and every listener hears the
 * same one — a real broadcast holds a symbol for `commIntervalTicks` and says one thing to everybody. All of a speaker's
 * channels are substituted TOGETHER from one real moment, so a joint code across comm0 / comm1 survives (GOTCHAS #29).
 *   speaker' / shuffled'  the same substitution again with an independent draw seed: Δredraw = speaker − speaker' is the
 *             readout's own noise floor, because nothing about the radio differs between the two streams.
 * A dead speaker stays silent in every mode, as in normal play.
 *
 *   replay    ⭐ the team's whole incoming radio at the same tick of ANOTHER match (same champions, opponent, roles; a speaker
 *             dead here stays silent): hold time, joint channels, habits, sequence, synchrony and clock all survive; only
 *             alignment with THIS match's situation is removed. replay' uses another donor match (its floor).
 *
 * Reading it:  Δreplay  = normal − replay    ⇒ ⭐ SITUATIONAL content — the content readout (GOTCHAS #31);
 *              Δspeaker = normal − speaker   ⇒ content AND sequence / synchrony / clock shape, which i.i.d. draws break;
 *              Δfrozen  = normal − frozen    ⇒ more than a per-speaker constant (≈ 0 means a constant code is enough);
 *              Δshuffle = normal − shuffled  ⇒ timing and/or per-speaker structure — on its own, not content;
 *              Δoff                          ⇒ the input is load-bearing at all.
 * ⚠ Readout history (both found on the d2-radio control before any long run was read):
 *   v1 had only `shuffled` and read pooled Δshuffle +0.543 on a radio whose sender side shows 0–1% MI — a per-speaker
 *   constant code (the shape D1's recurrent state had, GOTCHAS #24) would do that, hence `speaker` and `frozen`;
 *   v2 redrew substitutes EVERY tick and independently per listener, so a held symbol flickered and two teammates heard one
 *   speaker say different things. Its pooled Δspeaker passed (+0.042) only because per-champion −0.51 and +0.69 cancelled.
 *   v3 drew once per interval, shared by every listener, but still per channel; its control gate failed (2/4 champions
 *   within 0.25). v4 draws channels jointly and prints the redraw floor, because the gate never asked whether the ruler
 *   itself resolves 0.25 (runs/d2s-probe0-predictions.txt).
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
const OBSERVE = flags.has('observe') ? new Set(flags.get('observe')!.split(',').map((s) => s.trim()).filter(Boolean)) : null;

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

if (OBSERVE) {
  for (const k of OBSERVE) {
    const [tag, colour] = k.split(':');
    if (!entries.some((e) => e.tag === tag) || (colour !== 'R' && colour !== 'B')) throw new Error(`--observe ${k} matches no run (want <tag>:R or <tag>:B)`);
  }
}

type Mode = 'normal' | 'speaker' | 'frozen' | 'shuffled' | 'off' | "speaker'" | "shuffled'" | 'replay' | "replay'";
/** ⚠ `normal` must come first: it fills the pools and the replay recordings every other mode draws from */
const MODES: Mode[] = ['normal', 'speaker', 'frozen', 'shuffled', 'off', "speaker'", "shuffled'", 'replay', "replay'"];
/** a mode's substitution family and draw salt: the primed modes are the same substitution with an independent draw */
const family = (m: Mode) => (m.endsWith("'") ? m.slice(0, -1) : m);
const salt = (m: Mode) => (m.endsWith("'") ? 1 : 0);
const RESERVOIR = 50000;
const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Reservoir sample with a seeded generator, so a readout is reproducible. Items are one speaker's channels at one moment. */
class Reservoir {
  readonly xs: number[][] = [];
  private seen = 0;
  private readonly rng: Rng;
  constructor(seed: number) { this.rng = new Rng(seed); }
  add(v: number[]): void {
    this.seen++;
    if (this.xs.length < RESERVOIR) this.xs.push(v);
    else { const k = this.rng.int(this.seen); if (k < RESERVOIR) this.xs[k] = v; }
  }
}

/** Most common channel tuple (a quantised radio has a handful of symbols); falls back to the per-channel mean for a continuous one. */
function modal(xs: number[][], C: number): number[] {
  const counts = new Map<string, { v: number[]; n: number }>();
  for (const v of xs) {
    const k = v.join(',');
    const e = counts.get(k);
    if (e) e.n++; else counts.set(k, { v, n: 1 });
    if (counts.size > 256) return Array.from({ length: C }, (_, c) => mean(xs.map((x) => x[c])));
  }
  let best: number[] = new Array(C).fill(0);
  let bestN = -1;
  for (const { v, n } of counts.values()) if (n > bestN) { best = v; bestN = n; }
  return best;
}

console.log('radio use (v4) — observed team hears normal / speaker (same speaker, another moment) / frozen (each speaker\'s usual symbols) / shuffled / off;');
console.log(`one substitute per speaker per send interval, all channels from one moment, the same for every listener; each champion vs the other colour's champion of every run in its arm, ${N} seeds x 2 roles`);
console.log("redraw floors: Δredraw = speaker − speaker', Δredraw-sh = shuffled − shuffled' (same substitution, independent draw)");
console.log("replay = the team's whole radio at the same tick of ANOTHER match (same champions, opponent, roles): keeps sequence, synchrony and clock, removes only this match's situation; Δredraw-rp = replay − replay' (another donor)\n");
console.log(`${padr('arm', 16)}${padr('champion', 20)}${pad('normal', 8)}${pad('speaker', 8)}${pad('frozen', 8)}${pad('shuffled', 9)}${pad('off', 8)}` +
  `${pad('Δspeaker', 9)}${pad('Δfrozen', 9)}${pad('Δshuffle', 9)}${pad('Δoff', 8)}${pad('Δredraw', 9)}${pad('Δredraw-sh', 11)}${pad('Δreplay', 9)}${pad('Δredraw-rp', 11)}${pad('no-donor', 9)}${pad('moved', 7)}${pad('win n/sp/fr/sh/off/rp', 24)}${pad('heard', 6)}`);

const pooled = new Map<string, { dSpeaker: number[]; dFrozen: number[]; dShuffle: number[]; dRedraw: number[]; dRedrawSh: number[]; dReplay: number[]; dRedrawRp: number[]; offBelow: number }>();
for (const entry of entries) {
  const opponents = entries.filter((e) => e.arm === entry.arm);
  const { dx, comm } = mateFields(entry.sim);
  const allComm = comm.flat();
  const T = entry.sim.teamSize;
  const C = entry.sim.commDim;
  const interval = Math.max(1, entry.sim.commIntervalTicks);
  const delay = entry.sim.commDelayTicks;
  for (const team of [0, 1] as const) {
    if (OBSERVE && !OBSERVE.has(`${entry.tag}:${team === 0 ? 'R' : 'B'}`)) continue;
    // what this team HEARS in normal play: pooled, and per speaker (team slot) x channel
    const heard = new Reservoir(hashSeed(BASE, 0x5e5, team));
    const bySpeaker = Array.from({ length: T }, (_, s) => new Reservoir(hashSeed(BASE, 0x5e6, team, s)));
    /** normal play, per match (opponent, seed, roles): per tick, what each teammate slot was heard saying (NaN = nobody heard him) */
    const recordings = new Map<string, Float32Array[]>();
    const recKey = (oi: number, m: number, attackers: number) => `${oi}/${m}/${attackers}`;
    let usual: number[][] = [];
    const mine = new NeuralPolicy(entry.shape, entry.champ[team]);
    const res = new Map<Mode, { fit: number[]; win: number; heardOn: number; heardAll: number; noDonor: number }>();
    const order: number[] = [];
    for (const mode of MODES) {
      if (mode === 'frozen') usual = bySpeaker.map((r) => modal(r.xs, C));
      const fam = family(mode);
      let noDonor = 0;
      const fit: number[] = [];
      let win = 0;
      let heardOn = 0;
      let heardAll = 0;
      opponents.forEach((o, oi) => {
        const theirs = new NeuralPolicy(o.shape, o.champ[1 - team]);
        for (let m = 0; m < N; m++) {
          for (const attackers of [0, 1] as const) {
            const rng = new Rng(hashSeed(BASE, oi, m, attackers, salt(mode)));
            const w = new World(entry.sim, entry.map, hashSeed(BASE, m), { attackers });
            // one substitute per (speaker agent, channel), redrawn when that speaker's heard symbol could change
            const subst = new Float32Array(w.n * C);
            const record: Float32Array[] = [];
            // replay donors: other matches with the same opponent and roles, nearest first; replay' starts one further on
            const donors: Float32Array[][] = [];
            if (fam === 'replay') {
              for (let k = mode === 'replay' ? 1 : 2; k < N + 1; k++) {
                const d = recordings.get(recKey(oi, (m + k) % N, attackers));
                if ((m + k) % N !== m && d) donors.push(d);
              }
            }
            let drawn = false;
            const edit = (x: World) => {
              if (fam === 'speaker' || fam === 'shuffled' || fam === 'frozen') {
                const onGrid = (((x.tick - delay) % interval) + interval) % interval === 0;
                if (!drawn || onGrid) {
                  drawn = true;
                  for (const sp of x.agents) {
                    if (sp.team !== team) continue;
                    // one real moment for all of this speaker's channels
                    const pool = fam === 'shuffled' ? heard.xs : bySpeaker[sp.slot].xs;
                    const pick = fam === 'frozen' ? usual[sp.slot] : pool.length ? pool[rng.int(pool.length)] : null;
                    for (let c = 0; c < C; c++) subst[sp.id * C + c] = pick ? pick[c] : 0;
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
                    if (mode === 'normal') {
                      const said = comm[s].map((j) => x.obs[base + j]);
                      heard.add(said);
                      if (sp.alive) bySpeaker[sp.slot].add(said);
                      let row = record[x.tick];
                      if (!row) { row = new Float32Array(T * C).fill(NaN); record[x.tick] = row; }
                      for (let c = 0; c < C; c++) row[sp.slot * C + c] = said[c];
                    } else if (fam === 'replay') {
                      let donorRow: Float32Array | undefined;
                      for (const d of donors) {
                        const r = d[x.tick];
                        if (r && !Number.isNaN(r[sp.slot * C])) { donorRow = r; break; }
                      }
                      if (!donorRow && sp.alive) noDonor += C;
                      for (let c = 0; c < C; c++) x.obs[base + comm[s][c]] = sp.alive && donorRow ? donorRow[sp.slot * C + c] : 0;
                    } else {
                      for (let c = 0; c < C; c++) x.obs[base + comm[s][c]] = sp.alive ? subst[sp.id * C + c] : 0;
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
            if (mode === 'normal') recordings.set(recKey(oi, m, attackers), record);
            const r = summarize(w);
            fit.push(r.fitness[team]);
            win += r.winner === team ? 1 : r.winner === -1 ? 0.5 : 0;
          }
        }
      });
      if (mode === 'normal' && heard.xs.length === 0) throw new Error(`${entry.tag}: the team heard nothing at all — no pool to draw from`);
      res.set(mode, { fit, win: win / fit.length, heardOn, heardAll, noDonor });
    }
    const f = (m: Mode) => mean(res.get(m)!.fit);
    const off = res.get('off')!;
    if (off.heardOn !== 0) throw new Error('off mode still delivered radio — the ablation did not land');
    const nrm = res.get('normal')!;
    /** paired per-match difference (matches are aligned by opponent, world seed and roles): mean and its standard error */
    const paired = (a: Mode, b: Mode) => {
      const xs = res.get(a)!.fit.map((v, i) => v - res.get(b)!.fit[i]);
      const mu = mean(xs);
      const sd = Math.sqrt(xs.reduce((t, x) => t + (x - mu) * (x - mu), 0) / Math.max(1, xs.length - 1));
      return { mu, se: sd / Math.sqrt(xs.length) };
    };
    const pReplay = paired('normal', 'replay');
    const pNull = paired('replay', "replay'");
    const dSpeaker = f('normal') - f('speaker');
    const dFrozen = f('normal') - f('frozen');
    const dShuffle = f('normal') - f('shuffled');
    const dOff = f('off') - f('normal');
    const dRedraw = f('speaker') - f("speaker'");
    const dRedrawSh = f('shuffled') - f("shuffled'");
    const dReplay = f('normal') - f('replay');
    const dRedrawRp = f('replay') - f("replay'");
    const rp = res.get('replay')!;
    const noDonorShare = rp.noDonor / Math.max(1, rp.heardAll);
    const moved = nrm.fit.filter((v, i) => v !== res.get('speaker')!.fit[i]).length;
    const p = pooled.get(entry.arm) ?? { dSpeaker: [], dFrozen: [], dShuffle: [], dRedraw: [], dRedrawSh: [], dReplay: [], dRedrawRp: [], offBelow: 0 };
    p.dReplay.push(dReplay);
    p.dRedrawRp.push(dRedrawRp);
    p.dRedraw.push(dRedraw);
    p.dRedrawSh.push(dRedrawSh);
    p.dSpeaker.push(dSpeaker);
    p.dFrozen.push(dFrozen);
    p.dShuffle.push(dShuffle);
    if (f('off') < f('normal')) p.offBelow++;
    pooled.set(entry.arm, p);
    const pw = (m: Mode) => (res.get(m)!.win * 100).toFixed(0);
    console.log(`${padr(entry.arm, 16)}${padr(`${entry.tag}@${entry.gen} ${team === 0 ? 'R' : 'B'}`, 20)}` +
      `${pad(f('normal').toFixed(3), 8)}${pad(f('speaker').toFixed(3), 8)}${pad(f('frozen').toFixed(3), 8)}${pad(f('shuffled').toFixed(3), 9)}${pad(f('off').toFixed(3), 8)}` +
      `${pad(dSpeaker.toFixed(3), 9)}${pad(dFrozen.toFixed(3), 9)}${pad(dShuffle.toFixed(3), 9)}${pad(dOff.toFixed(3), 8)}${pad(dRedraw.toFixed(3), 9)}${pad(dRedrawSh.toFixed(3), 11)}${pad(dReplay.toFixed(3), 9)}${pad(dRedrawRp.toFixed(3), 11)}${pad(`${(noDonorShare * 100).toFixed(1)}%`, 9)}${pad(`${moved}/${nrm.fit.length}`, 7)}` +
      `${pad(`${pw('normal')}/${pw('speaker')}/${pw('frozen')}/${pw('shuffled')}/${pw('off')}/${pw('replay')}%`, 24)}${pad(`${((nrm.heardOn / Math.max(1, nrm.heardAll)) * 100).toFixed(0)}%`, 6)}`);
    // paired per-match estimate: a single redraw difference is NOT a standard error (D2s Probe 1c)
    console.log(`${padr('', 16)}${padr(`${entry.tag}@${entry.gen} ${team === 0 ? 'R' : 'B'}`, 20)}paired per match, n=${nrm.fit.length}:` +
      ` Δreplay ${pReplay.mu.toFixed(3)} ± ${pReplay.se.toFixed(3)} SE · null (replay − replay') ${pNull.mu.toFixed(3)} ± ${pNull.se.toFixed(3)} SE`);
  }
}

console.log('\npooled per arm:');
for (const [arm, p] of pooled) {
  const small = p.dSpeaker.filter((d) => Math.abs(d) <= 0.25).length;
  console.log(`  ${padr(arm, 16)} Δspeaker > 0 in ${p.dSpeaker.filter((d) => d > 0).length}/${p.dSpeaker.length} · pooled Δspeaker ${mean(p.dSpeaker).toFixed(3)}` +
    ` (|Δspeaker| <= 0.25 in ${small}/${p.dSpeaker.length}) · pooled Δfrozen ${mean(p.dFrozen).toFixed(3)} · pooled Δshuffle ${mean(p.dShuffle).toFixed(3)} · off below normal in ${p.offBelow}/${p.dSpeaker.length}`);
  const abs = (xs: number[]) => xs.map(Math.abs);
  console.log(`  ${padr('', 16)} floor: mean |Δredraw| ${mean(abs(p.dRedraw)).toFixed(3)} (<= 0.25 in ${p.dRedraw.filter((d) => Math.abs(d) <= 0.25).length}/${p.dRedraw.length})` +
    ` · mean |Δredraw-sh| ${mean(abs(p.dRedrawSh)).toFixed(3)} (<= 0.25 in ${p.dRedrawSh.filter((d) => Math.abs(d) <= 0.25).length}/${p.dRedrawSh.length})` +
    ` · mean |Δredraw-rp| ${mean(abs(p.dRedrawRp)).toFixed(3)} · pooled Δreplay ${mean(p.dReplay).toFixed(3)}`);
}
console.log('moved = matches whose team fitness changed at all between normal and speaker (capture fitness is quantised).');
console.log('heard = share of incoming radio fields that were non-silent in normal play.');
