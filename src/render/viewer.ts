import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from '../sim/map.ts';
import { World } from '../sim/world.ts';
import { NeuralPolicy, shapeFor, type Policy } from '../brain/policy.ts';
import { stepMatch } from '../evo/match.ts';
import { ArenaScene } from './scene.ts';

export interface MatchLabels { red: string; blue: string }

/** Drives one visible match in real time (× speed) and feeds the scene. */
export class MatchViewer {
  readonly scene: ArenaScene;
  world: World | null = null;
  labels: MatchLabels = { red: 'red', blue: 'blue' };
  speed = 1.5;
  paused = false;
  /** seconds to hold the final frame before `onFinished` fires */
  holdSeconds = 2.5;
  onFinished: (() => void) | null = null;
  private red: Policy | null = null;
  private blue: Policy | null = null;
  private acc = 0;
  private hold = 0;
  private finishedNotified = false;
  private readonly cfg: SimConfig;
  private readonly map: ArenaMap;
  private readonly hidden: number[];

  constructor(container: HTMLElement, cfg: SimConfig, map: ArenaMap, hidden: number[]) {
    this.cfg = cfg;
    this.map = map;
    this.hidden = hidden;
    this.scene = new ArenaScene(container, cfg, map);
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
    this.scene.bindWorld(this.world);
    this.scene.sync(this.world, false);
  }

  get busy(): boolean {
    return this.world !== null && !this.world.done;
  }

  /** Advance by `realDt` seconds of wall-clock time. */
  frame(realDt: number): void {
    const w = this.world;
    let advanced = false;
    if (w && this.red && this.blue && !this.paused) {
      if (!w.done) {
        this.acc += realDt * this.speed;
        let steps = 0;
        while (this.acc >= this.cfg.dt && steps < 12 && !w.done) {
          stepMatch(w, this.red, this.blue);
          for (const ev of w.events) {
            if (ev.kind === 'shot') this.scene.addShot(ev, w);
            else this.scene.addKill(ev, w);
          }
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
    if (w) this.scene.sync(w, advanced);
    this.scene.update(realDt);
    this.scene.render();
  }
}
