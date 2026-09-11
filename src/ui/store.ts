import type { GenReport, HofEntry } from '../evo/trainer.ts';
import type { TeamMetrics } from '../evo/match.ts';

export interface StoreTeam { best: number; mean: number; worst: number; championMetrics: TeamMetrics; popMetrics: TeamMetrics }
export interface StoreReport {
  gen: number; elapsedMs: number; matches: number; ladder: [number | null, number | null]; redWinShare: number;
  teams: [StoreTeam, StoreTeam];
}
export interface StoreJSON { reports: StoreReport[] }

/** Everything the UI needs to plot evolution and time-travel through champions. */
export class HistoryStore {
  readonly reports: GenReport[] = [];
  readonly listeners = new Set<() => void>();

  clear(): void {
    this.reports.length = 0;
    for (const l of this.listeners) l();
  }

  /** Rebuild reports from an exported file; champions come from the hall of fame, heat is not persisted. */
  loadJSON(data: StoreJSON, hof: [HofEntry[], HofEntry[]], heatCells: number): void {
    this.reports.length = 0;
    for (const r of data.reports) {
      const teams = [0, 1].map((t) => {
        const src = r.teams[t];
        const champ = hof[t].find((e) => e.gen === r.gen)?.genome ?? new Float32Array(0);
        return { ...src, champion: champ };
      }) as GenReport['teams'];
      this.reports.push({ ...r, teams, heat: [new Float32Array(heatCells * heatCells), new Float32Array(heatCells * heatCells)] });
    }
    for (const l of this.listeners) l();
  }

  push(r: GenReport): void {
    this.reports.push(r);
    for (const l of this.listeners) l();
  }

  onChange(l: () => void): void {
    this.listeners.add(l);
  }

  gens(): number[] {
    return this.reports.map((r) => r.gen);
  }

  team(t: 0 | 1, pick: (r: GenReport) => number): number[] {
    return this.reports.map((r) => pick(r));
  }

  metric(t: 0 | 1, key: keyof TeamMetrics): number[] {
    return this.reports.map((r) => r.teams[t].popMetrics[key]);
  }

  ladder(t: 0 | 1): number[] {
    return this.reports.map((r) => (r.ladder[t] === null ? NaN : r.ladder[t]));
  }

  champion(t: 0 | 1, gen: number): Float32Array | null {
    const r = this.reports.find((x) => x.gen === gen);
    return r ? r.teams[t].champion : null;
  }

  latest(): GenReport | null {
    return this.reports.length ? this.reports[this.reports.length - 1] : null;
  }

  /** Serialisable history (heat dropped to keep files small; genomes live in the trainer snapshot). */
  toJSON(): StoreJSON {
    return {
      reports: this.reports.map((r) => ({
        gen: r.gen, elapsedMs: r.elapsedMs, matches: r.matches, ladder: r.ladder, redWinShare: r.redWinShare,
        teams: r.teams.map((t) => ({ best: t.best, mean: t.mean, worst: t.worst, championMetrics: t.championMetrics, popMetrics: t.popMetrics })) as [StoreTeam, StoreTeam],
      })),
    };
  }
}
