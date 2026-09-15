import { Trainer, type GenReport } from '../evo/trainer.ts';
import { WorkerEvaluator } from '../worker/pool.ts';
import { MatchViewer } from '../render/viewer.ts';
import { HistoryStore } from './store.ts';

export interface Selection { red: number; blue: number }

/**
 * The state every panel shares: the trainer being evolved, the history of its generations, and the viewer that
 * shows its champions. Panels never hold a `Trainer` of their own — `reset` swaps it here and tells them, and
 * when the new run's WORLD differs (map, round rules, radio) the viewer is rebuilt around it rather than playing
 * champions under rules they were not trained in (GOTCHAS #33).
 */
export class Session {
  trainer: Trainer;
  evaluator: WorkerEvaluator | null = null;
  readonly store = new HistoryStore();
  readonly viewer: MatchViewer;
  running = false;
  /** time-travel pick; ignored while `follow` is on */
  selection: Selection | null = null;
  /** show the newest champions as soon as a generation finishes */
  follow = true;
  private replaySeed = 1;
  private readonly resetListeners = new Set<(t: Trainer, worldChanged: boolean) => void>();
  private readonly statusListeners = new Set<(html: string) => void>();
  private readonly runningListeners = new Set<(running: boolean) => void>();

  constructor(trainer: Trainer, canvas: HTMLElement) {
    this.trainer = trainer;
    this.viewer = new MatchViewer(canvas, trainer.sim, trainer.map, trainer.evo.hidden);
    this.viewer.onFinished = () => { this.playSelection(); };
  }

  onReset(l: (t: Trainer, worldChanged: boolean) => void): void { this.resetListeners.add(l); }
  onStatus(l: (html: string) => void): void { this.statusListeners.add(l); }
  onRunning(l: (running: boolean) => void): void { this.runningListeners.add(l); }

  status(html: string): void {
    for (const l of this.statusListeners) l(html);
  }

  label(t: 0 | 1, gen: number): string {
    return `${t === 0 ? 'RED' : 'BLUE'} gen ${gen}`;
  }

  /** Load the selected champions into the viewer; false when there is nothing to show yet. */
  playSelection(): boolean {
    const latest = this.store.latest();
    if (!latest) return false;
    const sel = this.follow || !this.selection ? { red: latest.gen, blue: latest.gen } : this.selection;
    const red = this.store.champion(0, sel.red);
    const blue = this.store.champion(1, sel.blue);
    if (!red || !blue || red.length === 0 || blue.length === 0) return false;
    this.replaySeed++;
    this.viewer.load(red, blue, this.replaySeed, { red: this.label(0, sel.red), blue: this.label(1, sel.blue) });
    return true;
  }

  /** Time travel: pit these two generations' champions against each other, and stop following the newest. */
  watch(sel: Selection): void {
    this.follow = false;
    this.selection = sel;
    this.playSelection();
  }

  followLatest(): void {
    this.follow = true;
    this.selection = null;
    this.playSelection();
  }

  ensureEvaluator(n: number): void {
    const size = Math.max(1, Math.min(32, n || 1));
    if (this.evaluator && this.evaluator.size === size && this.evaluator.mapSeed === this.trainer.evo.mapSeed) return;
    this.evaluator?.dispose();
    this.evaluator = new WorkerEvaluator(this.trainer.sim, this.trainer.evo.hidden, this.trainer.evo.mapSeed, size);
  }

  start(workers: number): void {
    if (this.running) return;
    this.running = true;
    this.ensureEvaluator(workers);
    for (const l of this.runningListeners) l(true);
    void this.trainLoop();
  }

  /** The generation in flight still finishes and is recorded; only the next one is not started. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const l of this.runningListeners) l(false);
  }

  private async trainLoop(): Promise<void> {
    while (this.running) {
      if (!this.evaluator) break;
      const r = await this.trainer.runGeneration(this.evaluator);
      this.store.push(r);
      this.status(this.fmtStatus(r));
      if (!this.viewer.busy) this.playSelection();
    }
  }

  fmtStatus(r: GenReport | null): string {
    const t = this.trainer;
    if (!r) return `idle — ${t.evo.popSize} genomes per team · ${t.pops[0][0].length} weights each · map ${t.evo.mapSeed}`;
    const [R, B] = r.teams;
    const secs = (r.elapsedMs / 1000).toFixed(1);
    const workers = this.evaluator ? this.evaluator.size : 0;
    // zero sighting ticks = the two champions never met; the win share is then a scoreboard, not a result
    const lad = (v: number | null, sight: number | null) =>
      v === null ? '–' : `${(v * 100).toFixed(0)}${sight === 0 ? '%<sub title="they never saw each other">·</sub>' : '%'}`;
    return (
      `<b>generation ${r.gen}</b> · ${r.matches} matches · ${secs} s/gen · ${workers} workers\n` +
      `red  best <b>${R.best.toFixed(2)}</b> mean ${R.mean.toFixed(2)} · vs gen 0 <b>${lad(r.ladder0[0], r.ladder0Sight[0])}</b> · vs −10 <b>${lad(r.ladder[0], r.ladderSight[0])}</b>\n` +
      `blue best <b>${B.best.toFixed(2)}</b> mean ${B.mean.toFixed(2)} · vs gen 0 <b>${lad(r.ladder0[1], r.ladder0Sight[1])}</b> · vs −10 <b>${lad(r.ladder[1], r.ladderSight[1])}</b>\n` +
      `head-to-head balance: red wins ${(r.redWinShare * 100).toFixed(0)}%`
    );
  }

  /**
   * Does this trainer play in a different world than the current one? Compares the WHOLE ruleset — round mode,
   * site count and the three radio parameters — not the genome length or the map seed alone, which is the
   * proxy GOTCHAS #33 is about.
   */
  worldDiffers(t: Trainer): boolean {
    const rs = t.sim;
    const mine = this.trainer.sim;
    return t.evo.mapSeed !== this.trainer.evo.mapSeed
      || rs.siteCount !== mine.siteCount || rs.roundMode !== mine.roundMode
      || rs.commTokens !== mine.commTokens || rs.commIntervalTicks !== mine.commIntervalTicks
      || rs.commDelayTicks !== mine.commDelayTicks;
  }

  /** Swap the trainer; returns whether the viewer had to be rebuilt for a different world. */
  reset(t: Trainer): boolean {
    const worldChanged = this.worldDiffers(t);
    this.stop();
    this.trainer = t;
    this.store.clear();
    this.selection = null;
    this.follow = true;
    this.evaluator?.dispose();
    this.evaluator = null;
    this.viewer.world = null;
    if (worldChanged) this.viewer.rebuild(t.sim, t.map, t.evo.hidden);
    this.status(this.fmtStatus(null));
    for (const l of this.resetListeners) l(t, worldChanged);
    return worldChanged;
  }

  /** One line of the rules this session's world runs under — what an imported run has to match. */
  describeWorld(): string {
    const t = this.trainer;
    const s = t.sim;
    const radio = s.commTokens ? `${2 * s.commTokens + 1} symbols / every ${s.commIntervalTicks} ticks / +${s.commDelayTicks} ticks delay` : 'continuous';
    return `map ${t.evo.mapSeed} · ${s.roundMode} · ${s.siteCount} site${s.siteCount > 1 ? 's' : ''} · radio ${radio}`;
  }
}
