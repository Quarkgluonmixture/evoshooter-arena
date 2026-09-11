import { DEFAULT_EVO, DEFAULT_SIM, type EvoConfig, type SimConfig } from '../core/config.ts';
import { Rng, hashSeed } from '../core/rng.ts';
import { generateMap, type ArenaMap } from '../sim/map.ts';
import { randomGenome, type MlpShape } from '../brain/mlp.ts';
import { NeuralPolicy, shapeFor } from '../brain/policy.ts';
import { crossover, mutate, tournament } from './genetic.ts';
import { runMatch, meanMetrics, type MatchResult, type TeamMetrics } from './match.ts';

/** One match to evaluate: indices into a shared genome table. */
export interface MatchJob {
  red: number;
  blue: number;
  seed: number;
  /** bit 1 = credit red genome's fitness, bit 2 = credit blue genome's fitness */
  credit: number;
  kind: 'pair' | 'hof' | 'ladder';
}

export interface Evaluator {
  run(genomes: Float32Array[], jobs: MatchJob[], wantHeat: boolean): Promise<MatchResult[]>;
}

/** Synchronous single-thread evaluator (tests, CLI). */
export class LocalEvaluator implements Evaluator {
  private readonly shape: MlpShape;
  private readonly map: ArenaMap;
  private readonly cfg: SimConfig;
  constructor(cfg: SimConfig, shape: MlpShape, map: ArenaMap) {
    this.cfg = cfg;
    this.shape = shape;
    this.map = map;
  }
  run(genomes: Float32Array[], jobs: MatchJob[], wantHeat: boolean): Promise<MatchResult[]> {
    return Promise.resolve(evaluateJobs(this.cfg, this.shape, this.map, genomes, jobs, wantHeat));
  }
}

export function evaluateJobs(
  cfg: SimConfig,
  shape: MlpShape,
  map: ArenaMap,
  genomes: Float32Array[],
  jobs: MatchJob[],
  wantHeat: boolean,
): MatchResult[] {
  const cache = new Map<number, NeuralPolicy>();
  const pol = (i: number) => {
    let p = cache.get(i);
    if (!p) { p = new NeuralPolicy(shape, genomes[i]); cache.set(i, p); }
    return p;
  };
  return jobs.map((j) => runMatch(pol(j.red), pol(j.blue), map, j.seed, cfg, { heat: wantHeat }));
}

export interface SnapshotHof { gen: number; fitness: number; genome: number[] }
export interface TrainerSnapshot {
  version: 1;
  evo: EvoConfig;
  sim: SimConfig;
  gen: number;
  rngState: number;
  pops: [number[][], number[][]];
  hof: [SnapshotHof[], SnapshotHof[]];
}

export interface HofEntry {
  gen: number;
  fitness: number;
  genome: Float32Array;
}

export interface TeamGenStats {
  best: number;
  mean: number;
  worst: number;
  champion: Float32Array;
  championMetrics: TeamMetrics;
  popMetrics: TeamMetrics;
}

export interface GenReport {
  gen: number;
  elapsedMs: number;
  matches: number;
  teams: [TeamGenStats, TeamGenStats];
  /** win-rate of this generation's champion vs the champion `ladderGap` generations ago (null until available) */
  ladder: [number | null, number | null];
  /** win-rate of this generation's champion vs the generation-0 champion (null at gen 0) */
  ladder0: [number | null, number | null];
  /** share of pairing matches won by red (0.5 = balanced arms race) */
  redWinShare: number;
  heat: [Float32Array, Float32Array];
}

/**
 * Two populations (red, blue) co-evolve against each other. Each genome is scored against several current
 * opponents plus a hall-of-fame opponent, so progress cannot be faked by only beating today's rivals.
 */
export class Trainer {
  readonly evo: EvoConfig;
  readonly sim: SimConfig;
  readonly shape: MlpShape;
  readonly map: ArenaMap;
  readonly rng: Rng;
  pops: [Float32Array[], Float32Array[]];
  hof: [HofEntry[], HofEntry[]];
  gen = 0;
  history: GenReport[] = [];

  constructor(evo: Partial<EvoConfig> = {}, sim: Partial<SimConfig> = {}, seed = 1) {
    this.evo = { ...DEFAULT_EVO, ...evo };
    this.sim = { ...DEFAULT_SIM, ...sim };
    this.shape = shapeFor(this.sim, this.evo.hidden);
    this.map = generateMap(this.evo.mapSeed, this.sim);
    this.rng = new Rng(seed);
    this.pops = [[], []];
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < this.evo.popSize; i++) this.pops[t].push(randomGenome(this.shape, this.rng));
    }
    this.hof = [[], []];
  }

  localEvaluator(): LocalEvaluator {
    return new LocalEvaluator(this.sim, this.shape, this.map);
  }

  private hofPick(team: 0 | 1): HofEntry | null {
    const h = this.hof[team];
    if (h.length === 0) return null;
    const start = Math.max(0, h.length - this.evo.hofWindow);
    return h[start + this.rng.int(h.length - start)];
  }

  /** Build the genome table + jobs for the current generation. */
  private plan(): { genomes: Float32Array[]; jobs: MatchJob[] } {
    const P = this.evo.popSize;
    const genomes: Float32Array[] = [...this.pops[0], ...this.pops[1]];
    const jobs: MatchJob[] = [];
    const seedBase = hashSeed(this.gen, 0xabc);

    for (let k = 0; k < this.evo.pairings; k++) {
      const perm = this.rng.shuffle(Array.from({ length: P }, (_, i) => i));
      for (let i = 0; i < P; i++) {
        jobs.push({ red: i, blue: P + perm[i], seed: hashSeed(seedBase, k, i), credit: 3, kind: 'pair' });
      }
    }
    for (let k = 0; k < this.evo.hofMatches; k++) {
      for (let i = 0; i < P; i++) {
        const hb = this.hofPick(1);
        if (hb) {
          genomes.push(hb.genome);
          jobs.push({ red: i, blue: genomes.length - 1, seed: hashSeed(seedBase, 100 + k, i), credit: 1, kind: 'hof' });
        }
        const hr = this.hofPick(0);
        if (hr) {
          genomes.push(hr.genome);
          jobs.push({ red: genomes.length - 1, blue: P + i, seed: hashSeed(seedBase, 200 + k, i), credit: 2, kind: 'hof' });
        }
      }
    }
    return { genomes, jobs };
  }

  async runGeneration(evaluator: Evaluator): Promise<GenReport> {
    const t0 = Date.now();
    const P = this.evo.popSize;
    const { genomes, jobs } = this.plan();
    const results = await evaluator.run(genomes, jobs, true);

    const fitSum: [number[], number[]] = [new Array(P).fill(0), new Array(P).fill(0)];
    const fitN: [number[], number[]] = [new Array(P).fill(0), new Array(P).fill(0)];
    const metricsBy: [TeamMetrics[][], TeamMetrics[][]] = [
      Array.from({ length: P }, () => []),
      Array.from({ length: P }, () => []),
    ];
    const heat: [Float32Array, Float32Array] = [
      new Float32Array(this.sim.heatCells ** 2),
      new Float32Array(this.sim.heatCells ** 2),
    ];
    let redWins = 0;
    let pairCount = 0;
    for (let k = 0; k < jobs.length; k++) {
      const j = jobs[k];
      const r = results[k];
      if (j.credit & 1) {
        fitSum[0][j.red] += r.fitness[0];
        fitN[0][j.red]++;
        metricsBy[0][j.red].push(r.metrics[0]);
      }
      if (j.credit & 2) {
        const bi = j.blue - P;
        fitSum[1][bi] += r.fitness[1];
        fitN[1][bi]++;
        metricsBy[1][bi].push(r.metrics[1]);
      }
      if (j.kind === 'pair') {
        pairCount++;
        if (r.winner === 0) redWins++;
        else if (r.winner === -1) redWins += 0.5;
      }
      if (r.heat) {
        for (let c = 0; c < heat[0].length; c++) {
          heat[0][c] += r.heat[0][c];
          heat[1][c] += r.heat[1][c];
        }
      }
    }
    for (let t = 0; t < 2; t++) {
      let mx = 0;
      for (let c = 0; c < heat[t].length; c++) mx = Math.max(mx, heat[t][c]);
      if (mx > 0) for (let c = 0; c < heat[t].length; c++) heat[t][c] /= mx;
    }

    const fitness: [number[], number[]] = [
      fitSum[0].map((s, i) => (fitN[0][i] ? s / fitN[0][i] : 0)),
      fitSum[1].map((s, i) => (fitN[1][i] ? s / fitN[1][i] : 0)),
    ];

    const teams = [0, 1].map((t) => {
      const f = fitness[t];
      let bi = 0;
      for (let i = 1; i < P; i++) if (f[i] > f[bi]) bi = i;
      const all: TeamMetrics[] = [];
      for (const list of metricsBy[t]) all.push(...list);
      const champion = new Float32Array(this.pops[t][bi]);
      this.hof[t].push({ gen: this.gen, fitness: f[bi], genome: champion });
      return {
        best: f[bi],
        mean: f.reduce((a, b) => a + b, 0) / P,
        worst: Math.min(...f),
        champion,
        championMetrics: meanMetrics(metricsBy[t][bi]),
        popMetrics: meanMetrics(all),
      } satisfies TeamGenStats;
    }) as [TeamGenStats, TeamGenStats];

    // ladders: champion now vs (a) champion `ladderGap` generations ago and (b) the very first champion.
    // Same-colour lineage; the past self plays the other side (any genome can play either colour).
    const ladder: [number | null, number | null] = [null, null];
    const ladder0: [number | null, number | null] = [null, null];
    let ladderMatches = 0;
    const gap = this.evo.ladderGap;
    const L = this.evo.ladderMatches;
    if (this.gen >= 1 && L > 0) {
      const lg: Float32Array[] = [];
      const lj: MatchJob[] = [];
      const plan: { team: 0 | 1; slot: 'gap' | 'first' }[] = [];
      for (const t of [0, 1] as const) {
        const h = this.hof[t];
        const now = lg.push(h[h.length - 1].genome) - 1;
        const first = lg.push(h[0].genome) - 1;
        plan.push({ team: t, slot: 'first' });
        for (let m = 0; m < L; m++) lj.push({ red: now, blue: first, seed: hashSeed(this.gen, 0x1ad0, t, m), credit: 0, kind: 'ladder' });
        if (this.gen >= gap) {
          const past = lg.push(h[h.length - 1 - gap].genome) - 1;
          plan.push({ team: t, slot: 'gap' });
          for (let m = 0; m < L; m++) lj.push({ red: now, blue: past, seed: hashSeed(this.gen, 0x1ad, t, m), credit: 0, kind: 'ladder' });
        }
      }
      const lr = await evaluator.run(lg, lj, false);
      ladderMatches = lj.length;
      plan.forEach((p, k) => {
        let w = 0;
        for (let m = 0; m < L; m++) {
          const r = lr[k * L + m];
          if (r.winner === 0) w += 1;
          else if (r.winner === -1) w += 0.5;
        }
        (p.slot === 'gap' ? ladder : ladder0)[p.team] = w / L;
      });
    }

    this.evolve(fitness);

    const report: GenReport = {
      gen: this.gen,
      elapsedMs: Date.now() - t0,
      matches: jobs.length + ladderMatches,
      teams,
      ladder,
      ladder0,
      redWinShare: pairCount ? redWins / pairCount : 0.5,
      heat,
    };
    this.history.push(report);
    this.gen++;
    return report;
  }

  private evolve(fitness: [number[], number[]]): void {
    const P = this.evo.popSize;
    for (let t = 0; t < 2; t++) {
      const pop = this.pops[t];
      const f = fitness[t];
      const order = Array.from({ length: P }, (_, i) => i).sort((a, b) => f[b] - f[a]);
      const next: Float32Array[] = [];
      for (let e = 0; e < Math.min(this.evo.elite, P); e++) next.push(new Float32Array(pop[order[e]]));
      while (next.length < P) {
        const p1 = pop[tournament(f, this.evo.tournament, this.rng)];
        let child: Float32Array;
        if (this.rng.next() < this.evo.crossoverProb) {
          const p2 = pop[tournament(f, this.evo.tournament, this.rng)];
          child = crossover(p1, p2, this.shape, this.rng);
        } else {
          child = p1;
        }
        next.push(mutate(child, this.rng, this.evo));
      }
      this.pops[t] = next;
    }
  }

  /** Serialisable state (genomes as plain arrays) so a run can be exported and resumed. */
  snapshot(): TrainerSnapshot {
    return {
      version: 1,
      evo: this.evo,
      sim: this.sim,
      gen: this.gen,
      rngState: this.rng.next() * 4294967296,
      pops: this.pops.map((p) => p.map((g) => Array.from(g))) as [number[][], number[][]],
      hof: this.hof.map((h) => h.map((e) => ({ gen: e.gen, fitness: e.fitness, genome: Array.from(e.genome) }))) as [SnapshotHof[], SnapshotHof[]],
    };
  }

  static restore(s: TrainerSnapshot): Trainer {
    const t = new Trainer(s.evo, s.sim, Math.floor(s.rngState) >>> 0);
    t.gen = s.gen;
    t.pops = s.pops.map((p) => p.map((g) => Float32Array.from(g))) as [Float32Array[], Float32Array[]];
    t.hof = s.hof.map((h) => h.map((e) => ({ gen: e.gen, fitness: e.fitness, genome: Float32Array.from(e.genome) }))) as [HofEntry[], HofEntry[]];
    return t;
  }

  /** Head-to-head between two genomes over `n` seeds; returns win share of `a` (playing red). */
  async duel(evaluator: Evaluator, a: Float32Array, b: Float32Array, n: number, seed = 777): Promise<number> {
    const jobs: MatchJob[] = [];
    for (let m = 0; m < n; m++) jobs.push({ red: 0, blue: 1, seed: hashSeed(seed, m), credit: 0, kind: 'ladder' });
    const res = await evaluator.run([a, b], jobs, false);
    let w = 0;
    for (const r of res) w += r.winner === 0 ? 1 : r.winner === -1 ? 0.5 : 0;
    return w / n;
  }
}
