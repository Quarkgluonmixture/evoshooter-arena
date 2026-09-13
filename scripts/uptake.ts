/**
 * ROADMAP D2, search side — listener uptake: if every speaker were already informative, does evolution learn to LISTEN?
 *
 *   node scripts/uptake.ts train runs/d2-radio-s1.json --seed 1 --out runs/uptake-informed-s1.json [--gens 40]
 *   node scripts/uptake.ts eval runs/uptake-informed-s1.json runs/d2-radio-s1.json ... [--n 24]
 *
 * commstep's random one-sided mutations could not resolve a stepping stone either way (GOTCHAS #26 ④), so this uses
 * evolution itself as the instrument.
 *
 * `train` copies evo + sim from a control run and trains the same seed, with ONE difference: every message either team
 * hears is replaced by the one-symbol site call from src/probe/radioCall.ts. Genome length is unchanged, so the initial
 * populations are the control run's — asserted, not assumed (GOTCHAS #27).
 * ⚠ An analysis-only scaffold. The output carries a `scaffold` field; ⛔ never seed a population from it and ⛔ never
 * put its champions in a cross-play matrix with normally trained ones (crossplay's drift guard compares SimConfig and
 * cannot see this difference).
 *
 * `eval` plays each champion against the other colour's champion of every run in its arm (same scaffold, same
 * generation count), with calls injected for both teams, and sets the observed team's calls to normal / flipped
 * (+1 <-> -1: same timing, wrong site) / off. A listener that uses what the
 * call SAYS loses fitness when it is flipped; one that uses only "someone is talking" does not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { normalizeSim, type EvoConfig, type SimConfig } from '../src/core/config.ts';
import { hashSeed } from '../src/core/rng.ts';
import { generateMap, type ArenaMap } from '../src/sim/map.ts';
import { genomeLength, type MlpShape } from '../src/brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../src/brain/policy.ts';
import { stepMatch, summarize, type MatchResult } from '../src/evo/match.ts';
import { Trainer, type Evaluator, type MatchJob } from '../src/evo/trainer.ts';
import { World } from '../src/sim/world.ts';
import { injectCalls, type CallMode } from '../src/probe/radioCall.ts';

const argv = process.argv.slice(2);
const cmd = argv.shift();
const files: string[] = [];
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) flags.set(a.slice(2), argv[i + 1]?.startsWith('--') === false ? argv[++i] : '1');
  else files.push(a);
}
const num = (k: string, d: number) => (flags.has(k) ? Number(flags.get(k)) : d);
if ((cmd !== 'train' && cmd !== 'eval') || files.length === 0) {
  console.error('usage: node scripts/uptake.ts train <control.json> --seed N --out <out.json> [--gens 40]');
  console.error('       node scripts/uptake.ts eval <run.json> [more.json ...] [--n 24]');
  process.exit(2);
}

const SCAFFOLD = 'informed-radio: src/probe/radioCall.ts site calls replaced every message both teams heard during training (analysis only)';

interface RunHofEntry { gen: number; fitness: number; genome: number[] }
interface RunFile { evo: EvoConfig; sim: SimConfig; hof: [RunHofEntry[], RunHofEntry[]]; scaffold?: string }

/** Every match of training, with site calls injected for both teams. */
class InformedEvaluator implements Evaluator {
  private readonly sim: SimConfig;
  private readonly map: ArenaMap;
  private readonly trainer: Trainer;
  constructor(trainer: Trainer) {
    this.trainer = trainer;
    this.sim = trainer.sim;
    this.map = trainer.map;
  }
  run(genomes: Float32Array[], jobs: MatchJob[], wantHeat: boolean): Promise<MatchResult[]> {
    const cache = new Map<number, NeuralPolicy>();
    const pol = (i: number) => {
      let p = cache.get(i);
      if (!p) { p = new NeuralPolicy(this.trainer.shape, genomes[i]); cache.set(i, p); }
      return p;
    };
    const { edit } = injectCalls(this.sim, [0, 1]);
    return Promise.resolve(jobs.map((j) => {
      const w = new World(this.sim, this.map, j.seed, { heat: wantHeat, attackers: j.attackers });
      while (!w.done) stepMatch(w, pol(j.red), pol(j.blue), edit);
      return summarize(w);
    }));
  }
}

const f3 = (x: number) => x.toFixed(3).padStart(7);

if (cmd === 'train') {
  const control = JSON.parse(readFileSync(files[0], 'utf8')) as RunFile;
  if (control.scaffold) throw new Error(`${files[0]} is itself a scaffold run — the control must be a normally trained run`);
  const { sim } = normalizeSim(control.sim);
  const seed = num('seed', NaN);
  const out = flags.get('out');
  if (!Number.isFinite(seed) || !out) throw new Error('train needs --seed (the control run\'s trainer seed) and --out');
  const gens = num('gens', control.hof[0].length);
  const trainer = new Trainer(control.evo, sim, seed);
  // Same genome length ⇒ same initial populations — but only if the seed is right. Prove it: the control run's
  // gen-0 champion must be one of these genomes, bit for bit (GOTCHAS #27).
  for (const t of [0, 1] as const) {
    const g0 = control.hof[t][0].genome;
    const found = trainer.pops[t].some((g) => g.length === g0.length && g.every((v, i) => v === Math.fround(g0[i])));
    if (!found) throw new Error(`colour ${t}: the control's gen-0 champion is not in this initial population — wrong --seed?`);
  }
  console.log(`uptake train — control ${basename(files[0])}, seed ${seed}, ${gens} gens, pop ${trainer.evo.popSize}; initial populations match the control ✓`);
  console.log(`scaffold: ${SCAFFOLD}`);
  console.log('gen |  bestR   meanR |  bestB   meanB | objR  objB | 1stShot | ms');
  const ev = new InformedEvaluator(trainer);
  for (let g = 0; g < gens; g++) {
    const r = await trainer.runGeneration(ev);
    const [R, B] = r.teams;
    console.log(`${String(r.gen).padStart(3)} | ${f3(R.best)} ${f3(R.mean)} | ${f3(B.best)} ${f3(B.mean)} | ` +
      `${R.popMetrics.objectiveProgress.toFixed(2)}  ${B.popMetrics.objectiveProgress.toFixed(2)} | ${R.popMetrics.firstContact.toFixed(1).padStart(7)} | ${r.elapsedMs}`);
  }
  writeFileSync(out, JSON.stringify({
    scaffold: SCAFFOLD,
    control: files[0],
    seed,
    evo: trainer.evo,
    sim: trainer.sim,
    hof: trainer.hof.map((h) => h.map((e) => ({ gen: e.gen, fitness: e.fitness, genome: Array.from(e.genome) }))),
  }));
  console.log(`saved ${out}`);
} else {
  const N = num('n', 24);
  const BASE = num('seed', 6060);
  const MODES: CallMode[] = ['normal', 'flipped', 'off'];
  const pad = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);
  const padr = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  interface Entry { tag: string; arm: string; sim: SimConfig; shape: MlpShape; map: ArenaMap; champ: Float32Array[] }
  const entries: Entry[] = files.map((path) => {
    const data = JSON.parse(readFileSync(path, 'utf8')) as RunFile;
    const { sim } = normalizeSim(data.sim);
    const shape = shapeFor(sim, data.evo.hidden);
    const champ = ([0, 1] as const).map((t) => {
      const e = data.hof[t][data.hof[t].length - 1];
      if (e.genome.length !== genomeLength(shape)) throw new Error(`${path}: genome ${e.genome.length} != ${genomeLength(shape)}`);
      return Float32Array.from(e.genome);
    });
    const arm = `${data.scaffold ? 'INFORMED' : 'CONTROL'}-${data.hof[0].length}g`;
    return { tag: basename(path).replace(/\.json$/, ''), arm, sim, shape, map: generateMap(data.evo.mapSeed, sim), champ };
  });
  // Every champion meets the other colour's champion of EVERY run in its own arm. ⚠ v1 used only its own run's
  // opponent, and the 40-gen s2 pair read 98% / 2% win — a ceiling where no content effect can show (GOTCHAS #26).
  for (const x of entries) {
    for (const y of entries) {
      if (x.arm === y.arm && (JSON.stringify(x.sim) !== JSON.stringify(y.sim) || x.map.seed !== y.map.seed)) {
        throw new Error(`${x.tag} and ${y.tag} are in one arm but were trained under different rules or maps`);
      }
    }
  }
  console.log(`uptake eval — each champion vs the other colour's champion of every run in its arm, ${N} seeds x 2 roles each;`);
  console.log('calls injected for both teams; the observed team hears normal / flipped (+1 <-> -1, same timing, wrong site) / off\n');
  console.log(`${padr('arm', 16)}${padr('champion', 26)}${pad('opps', 5)}${pad('fit norm', 9)}${pad('flipped', 9)}${pad('off', 9)}${pad('Δcontent', 10)}${pad('Δoff', 9)}${pad('win n/f/o', 14)}${pad('calling', 9)}`);
  const pooled = new Map<string, { dContent: number[]; offBelow: number }>();
  for (const entry of entries) {
    const opponents = entries.filter((e) => e.arm === entry.arm);
    for (const team of [0, 1] as const) {
      const res = new Map<CallMode, { fit: number; win: number; calling: number }>();
      for (const mode of MODES) {
        const opp = injectCalls(entry.sim, [team === 0 ? 1 : 0], 'normal');
        const me = injectCalls(entry.sim, [team], mode);
        const edit = (w: World) => { opp.edit(w); me.edit(w); };
        const mine = new NeuralPolicy(entry.shape, entry.champ[team]);
        let fit = 0;
        let win = 0;
        let n = 0;
        for (const o of opponents) {
          const theirs = new NeuralPolicy(o.shape, o.champ[1 - team]);
          for (let m = 0; m < N; m++) {
            for (const attackers of [0, 1] as const) {
              const w = new World(entry.sim, entry.map, hashSeed(BASE, m), { attackers });
              while (!w.done) stepMatch(w, team === 0 ? mine : theirs, team === 0 ? theirs : mine, edit);
              const r = summarize(w);
              fit += r.fitness[team];
              win += r.winner === team ? 1 : r.winner === -1 ? 0.5 : 0;
              n++;
            }
          }
        }
        // `calling` counts what reached the observed team after the mode was applied, so off must read 0 — the proof the mode landed
        res.set(mode, { fit: fit / n, win: win / n, calling: me.stats.calling / Math.max(1, me.stats.written) });
      }
      const nrm = res.get('normal')!;
      const flp = res.get('flipped')!;
      const off = res.get('off')!;
      if (off.calling !== 0) throw new Error('off mode still delivered calls — the ablation did not land');
      const dContent = nrm.fit - flp.fit;
      const p = pooled.get(entry.arm) ?? { dContent: [], offBelow: 0 };
      p.dContent.push(dContent);
      if (off.fit < nrm.fit) p.offBelow++;
      pooled.set(entry.arm, p);
      const pw = (x: number) => (x * 100).toFixed(0);
      console.log(`${padr(entry.arm, 16)}${padr(`${entry.tag} ${team === 0 ? 'R' : 'B'}`, 26)}${pad(String(opponents.length), 5)}` +
        `${pad(nrm.fit.toFixed(3), 9)}${pad(flp.fit.toFixed(3), 9)}${pad(off.fit.toFixed(3), 9)}${pad(dContent.toFixed(3), 10)}${pad((off.fit - nrm.fit).toFixed(3), 9)}` +
        `${pad(`${pw(nrm.win)}/${pw(flp.win)}/${pw(off.win)}%`, 14)}${pad(`${pw(nrm.calling)}%`, 9)}`);
    }
  }
  console.log('\npooled per arm (compare with runs/d2-uptake*-predictions.txt):');
  for (const [arm, p] of pooled) {
    const mean = p.dContent.reduce((a, b) => a + b, 0) / p.dContent.length;
    const pos = p.dContent.filter((d) => d > 0).length;
    console.log(`  ${padr(arm, 16)} Δcontent > 0 in ${pos}/${p.dContent.length} · pooled mean Δcontent ${mean.toFixed(3)} · off below normal in ${p.offBelow}/${p.dContent.length}`);
  }
}
