import * as THREE from 'three';
import type { World } from '../sim/world.ts';
import type { ArenaScene } from './scene.ts';

export type CamMode = 'free' | 'third' | 'first';

const FOV: Record<CamMode, number> = { free: 48, third: 58, first: 82 };
const MIN_SHOT = 3.0;      // director: minimum seconds before cutting away from a living subject
const SWITCH_MARGIN = 1.6; // director: how much more interesting another agent must be to force a cut
const DEATH_LINGER = 1.0;  // director: seconds to stay on a dead subject before cutting

/**
 * Spectator camera, CS:GO-observer style: free orbit, third-person chase, first-person eye cam, plus an
 * automatic "director" that follows whoever is in the thick of the action.
 */
export class CameraRig {
  mode: CamMode = 'free';
  subject = -1;
  director = false;
  /** last director cut, for the UI */
  lastCutReason = '';
  private readonly scene: ArenaScene;
  private smoothYaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private shotT = 0;
  private deadT = 0;
  private readonly bump: number[] = [];
  private savedFree: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private initialised = false;

  constructor(scene: ArenaScene) {
    this.scene = scene;
  }

  setMode(mode: CamMode): void {
    if (mode === this.mode) return;
    if (this.mode === 'free') {
      this.savedFree = { pos: this.scene.camera.position.clone(), target: this.scene.controls.target.clone() };
    }
    this.mode = mode;
    this.initialised = false;
    this.scene.camera.fov = FOV[mode];
    this.scene.camera.updateProjectionMatrix();
    this.scene.controls.enabled = mode === 'free';
    this.scene.firstPersonId = mode === 'first' ? this.subject : -1;
    if (mode === 'free') {
      this.director = false;
      if (this.savedFree) {
        this.scene.camera.position.copy(this.savedFree.pos);
        this.scene.controls.target.copy(this.savedFree.target);
      }
    }
  }

  toggleView(): void {
    this.setMode(this.mode === 'first' ? 'third' : 'first');
  }

  select(id: number, world: World | null): void {
    if (!world || id < 0 || id >= world.n) return;
    this.subject = id;
    this.shotT = 0;
    this.deadT = 0;
    this.initialised = false;
    if (this.mode === 'free') this.setMode('third');
    this.scene.firstPersonId = this.mode === 'first' ? id : -1;
  }

  /** Next living agent (wrapping); dir = ±1. */
  cycle(world: World | null, dir: 1 | -1 = 1): void {
    if (!world) return;
    const n = world.n;
    let id = this.subject < 0 ? (dir === 1 ? -1 : n) : this.subject;
    for (let k = 0; k < n; k++) {
      id = (id + dir + n) % n;
      if (world.agents[id].alive) { this.select(id, world); return; }
    }
  }

  setDirector(on: boolean, world: World | null): void {
    this.director = on;
    if (on) {
      if (this.mode === 'free') this.setMode('third');
      this.shotT = MIN_SHOT; // allow an immediate first cut
      this.pickSubject(world, 'director on');
    }
  }

  /** Call once per rendered frame after the world has been stepped. */
  update(world: World | null, dt: number, events: readonly { kind: string; killer?: number }[]): void {
    if (this.mode === 'free') {
      this.scene.controls.enabled = true;
      return;
    }
    if (!world) return;
    for (const ev of events) if (ev.kind === 'kill' && ev.killer !== undefined) this.bump[ev.killer] = 3.5;
    for (let i = 0; i < this.bump.length; i++) if (this.bump[i] > 0) this.bump[i] -= dt;

    if (this.subject < 0 || this.subject >= world.n) this.pickSubject(world, 'no subject');
    const a = world.agents[this.subject];
    this.shotT += dt;
    if (!a.alive) {
      this.deadT += dt;
      if (this.deadT >= DEATH_LINGER) this.pickSubject(world, `${this.name(world, this.subject)} died`);
    } else if (this.director && this.shotT >= MIN_SHOT) {
      const cur = this.interest(world, this.subject);
      let best = this.subject;
      let bestS = cur;
      for (let i = 0; i < world.n; i++) {
        const s = this.interest(world, i);
        if (s > bestS) { bestS = s; best = i; }
      }
      if (best !== this.subject && bestS > cur + SWITCH_MARGIN) this.cut(world, best, 'action elsewhere');
    }
    this.place(world, dt);
  }

  private pickSubject(world: World | null, reason: string): void {
    if (!world) return;
    let best = -1;
    let bestS = -Infinity;
    for (let i = 0; i < world.n; i++) {
      const s = this.interest(world, i);
      if (s > bestS) { bestS = s; best = i; }
    }
    if (best < 0) return;
    this.cut(world, best, reason);
  }

  private cut(world: World, id: number, reason: string): void {
    this.subject = id;
    this.shotT = 0;
    this.deadT = 0;
    this.initialised = false;
    this.lastCutReason = `→ ${this.name(world, id)} (${reason})`;
    this.scene.firstPersonId = this.mode === 'first' ? id : -1;
  }

  name(world: World, id: number): string {
    const a = world.agents[id];
    return `${a.team === 0 ? 'R' : 'B'}${a.slot + 1}`;
  }

  /** How watchable is this agent right now? Used by the director. */
  interest(world: World, id: number): number {
    const a = world.agents[id];
    if (!a.alive) return -1;
    const n = world.n;
    let s = 0;
    if (a.firing) s += 3;
    s += Math.min(3, a.dmgRecent / 15);
    let vis = 0;
    let nearest = Infinity;
    for (let e = 0; e < n; e++) {
      const b = world.agents[e];
      if (b.team === a.team || !b.alive) continue;
      if (world.visible[id * n + e]) vis++;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < nearest) nearest = d;
    }
    s += vis * 1.2;
    if (nearest < 12) s += 2;
    else if (nearest < 20) s += 1;
    if (world.inZone(a)) s += 0.8;
    if (a.aim) s += 0.3;
    if (this.bump[id] > 0) s += this.bump[id];
    s += a.hp / world.cfg.hp; // prefer healthier subjects (they live longer)
    return s;
  }

  private place(world: World, dt: number): void {
    const a = world.agents[this.subject];
    const cam = this.scene.camera;
    const k = 1 - Math.exp(-dt * (this.mode === 'first' ? 14 : 7));
    // smooth the heading (agents can snap 540°/s; the eye should not)
    let dy = a.yaw - this.smoothYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.smoothYaw = this.initialised ? this.smoothYaw + dy * Math.min(1, k * 1.4) : a.yaw;
    const fx = Math.cos(this.smoothYaw);
    const fz = Math.sin(this.smoothYaw);

    if (this.mode === 'first') {
      const eye = world.cfg.eyeHeight + (a.alive ? 0 : -1.0);
      this.pos.set(a.x, eye, a.z);
      this.look.set(a.x + fx * 10, eye - 0.9, a.z + fz * 10);
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
    } else {
      this.tmp.set(a.x - fx * 8, 5.2, a.z - fz * 8);
      const target = new THREE.Vector3(a.x + fx * 7, 0.4, a.z + fz * 7);
      if (!this.initialised) {
        this.pos.copy(this.tmp);
        this.look.copy(target);
      } else {
        this.pos.lerp(this.tmp, k);
        this.look.lerp(target, k);
      }
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
    }
    this.initialised = true;
  }
}
