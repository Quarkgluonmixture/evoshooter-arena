import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from '../sim/map.ts';
import { World, type WorldEvent } from '../sim/world.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../brain/policy.ts';
import { stepMatch } from '../evo/match.ts';
import { ArenaScene } from './scene.ts';
import { CameraRig } from './camera.ts';

export interface MatchLabels { red: string; blue: string }

/** Drives one visible match in real time (× speed) and feeds the scene. */
export class MatchViewer {
  readonly scene: ArenaScene;
  readonly rig: CameraRig;
  world: World | null = null;
  labels: MatchLabels = { red: 'red', blue: 'blue' };
  speed = 1.5;
  paused = false;
  /** seconds to hold the final frame before `onFinished` fires */
  holdSeconds = 2.5;
  onFinished: (() => void) | null = null;
  /** Spectator-only: one call per kill, for the feed. ⛔ Never wire a policy to this (world.events is observer-side). */
  onKill: ((killer: number, victim: number) => void) | null = null;
  /** Fired when a new match is loaded, so per-match overlays (the kill feed) can clear. */
  onNewMatch: (() => void) | null = null;
  private red: Policy | null = null;
  private blue: Policy | null = null;
  private acc = 0;
  private hold = 0;
  private readonly frameEvents: WorldEvent[] = [];
  private finishedNotified = false;
  private readonly cfg: SimConfig;
  private readonly map: ArenaMap;
  private readonly hidden: number[];

  constructor(container: HTMLElement, cfg: SimConfig, map: ArenaMap, hidden: number[]) {
    this.cfg = cfg;
    this.map = map;
    this.hidden = hidden;
    this.scene = new ArenaScene(container, cfg, map);
    this.rig = new CameraRig(this.scene);
  }

  load(red: Float32Array, blue: Float32Array, seed: number, labels: MatchLabels): void {
    const shape = shapeFor(this.cfg, this.hidden);
    this.red = new NeuralPolicy(shape, red);
    this.blue = new NeuralPolicy(shape, blue);
    this.world = new World(this.cfg, this.map, seed);
    this.labels = labels;
    this.acc = 0;
    this.hold = 0;
    this.finishedNotified = false;
    this.onNewMatch?.();
    this.scene.bindWorld(this.world);
    this.scene.sync(this.world, 1, false);
    this.rig.reset(this.world);
  }

  get busy(): boolean {
    return this.world !== null && !this.world.done;
  }

  /** Advance by `realDt` seconds of wall-clock time. */
  frame(realDt: number): void {
    const w = this.world;
    let advanced = false;
    this.frameEvents.length = 0;
    if (w && this.red && this.blue && !this.paused) {
      if (!w.done) {
        this.acc += realDt * this.speed;
        let steps = 0;
        while (this.acc >= this.cfg.dt && steps < 12 && !w.done) {
          this.scene.captureTick(w); // snapshot the pose we are interpolating FROM
          stepMatch(w, this.red, this.blue);
          for (const ev of w.events) this.frameEvents.push(ev);
          this.acc -= this.cfg.dt;
          steps++;
          advanced = true;
        }
        if (this.acc > this.cfg.dt * 12) this.acc = 0;
      } else if (!this.finishedNotified) {
        this.hold += realDt;
        if (this.hold >= this.holdSeconds) {
          this.finishedNotified = true;
          this.onFinished?.();
        }
      }
    }
    // Render one tick behind the sim, `alpha` of the way into the latest tick: fixed-step sim (15 Hz),
    // smooth display. Snap to the last tick once the match is over or while paused.
    if (w) {
      const alpha = w.done ? 1 : Math.min(1, this.acc / this.cfg.dt);
      this.scene.sync(w, alpha, advanced);
      // FX are spawned after sync so they attach to the pose that is actually on screen
      for (const ev of this.frameEvents) {
        if (ev.kind === 'shot') this.scene.addShot(ev, w);
        else {
          this.scene.addKill(ev, w);
          this.onKill?.(ev.killer, ev.victim);
        }
      }
    }
    this.rig.update(w, realDt, this.frameEvents);
    this.scene.update(realDt);
    this.scene.render();
  }
}
