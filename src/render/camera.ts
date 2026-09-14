import * as THREE from 'three';
import { rayBoxDist2D } from '../sim/geom.ts';
import type { Box } from '../sim/geom.ts';
import type { World } from '../sim/world.ts';
import type { ArenaScene } from './scene.ts';

export type CamMode = 'free' | 'third' | 'first';

const FOV: Record<CamMode, number> = { free: 48, third: 62, first: 90 };
const MIN_SHOT = 2.6;      // director: minimum seconds before cutting away from a living subject
const SWITCH_MARGIN = 1.6; // director: how much more interesting another agent must be to force a cut
const DEATH_LINGER = 1.2;  // director: seconds to stay on a dead subject before cutting
const CHASE_BACK = 6.4;    // third person: metres behind the subject
const CHASE_MIN = 3.2;     // …but never closer than this, or the capsule eats the frame
const CHASE_UP = 3.2;      // third person: metres above the subject's feet (above every wall: cover tops out at 2.6)
const CHASE_MAX_UP = 7.5;  // …but never a satellite view
const CHASE_SIDE = 0.9;    // over-the-shoulder offset, so the subject is not dead centre
const CAM_RADIUS = 0.45;   // keep the third-person camera this far off walls

/**
 * Spectator camera, CS:GO-observer style: free orbit, third-person chase, first-person eye cam, plus an
 * automatic "director" that follows whoever is in the thick of the action.
 *
 * Everything here follows the scene's INTERPOLATED pose (`scene.pose`), never the raw 15 Hz sim pose —
 * otherwise the camera itself stutters even when the bodies do not.
 */
export class CameraRig {
  mode: CamMode = 'free';
  subject = -1;
  director = false;
  /** last director cut, for the UI */
  lastCutReason = '';
  /** bumped on every director cut, so the page can flash a transition without polling the reason string */
  cutSeq = 0;
  private readonly scene: ArenaScene;
  private smoothYaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tgt = new THREE.Vector3();
  private shotT = 0;
  private deadT = 0;
  private readonly bump: number[] = [];
  private savedFree: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private initialised = false;
  /** cover grown by the camera radius, so the boom never grazes a corner */
  private readonly padded: Box[];

  constructor(scene: ArenaScene) {
    this.scene = scene;
    this.padded = scene.map.boxes.map((b) => ({
      minX: b.minX - CAM_RADIUS, maxX: b.maxX + CAM_RADIUS,
      minZ: b.minZ - CAM_RADIUS, maxZ: b.maxZ + CAM_RADIUS, h: b.h,
    }));
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
    if (mode === 'free') {
      this.director = false;
      if (this.savedFree) {
        this.scene.camera.position.copy(this.savedFree.pos);
        this.scene.controls.target.copy(this.savedFree.target);
      }
      this.scene.camera.rotation.set(0, 0, 0);
    }
    this.publishSubject();
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
    this.publishSubject();
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

  /** A fresh match is loaded: drop the stale shot so the camera does not fly across the map. */
  reset(world: World | null): void {
    this.initialised = false;
    this.shotT = 0;
    this.deadT = 0;
    this.bump.length = 0;
    if (this.mode === 'free' || !world) { this.publishSubject(); return; }
    if (this.director) this.pickSubject(world, 'new match');
    else if (this.subject < 0 || this.subject >= world.n || !world.agents[this.subject].alive) this.pickSubject(world, 'new match');
    else this.publishSubject();
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
    } else if (this.director && this.shotT >= MIN_SHOT && !a.firing) {
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
    this.cutSeq++;
    this.publishSubject();
  }

  /** Tell the scene who we are watching: it hides that body in first person and owns the view model. */
  private publishSubject(): void {
    this.scene.firstPersonId = this.mode === 'first' ? this.subject : -1;
    this.scene.subjectId = this.mode === 'free' ? -1 : this.subject;
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

  /**
   * Place the chase boom so the subject stays VISIBLE.
   * Cover tops out at 2.6 m, so the primary move is to raise the camera until the sight line to the
   * subject's head clears whatever sits under the boom; only when that would need a satellite view do we
   * pull the boom in. (Shortening first was the old bug: the camera ended up inside the subject's capsule.)
   */
  private boom(x: number, z: number, dx: number, dz: number, want: number): { back: number; up: number } {
    const head = 1.7;
    const margin = 0.5;
    let back = want;
    // arena wall
    if (dx > 1e-9) back = Math.min(back, (this.scene.mapHalf - x) / dx);
    else if (dx < -1e-9) back = Math.min(back, (-this.scene.mapHalf - x) / dx);
    if (dz > 1e-9) back = Math.min(back, (this.scene.mapHalf - z) / dz);
    else if (dz < -1e-9) back = Math.min(back, (-this.scene.mapHalf - z) / dz);
    back = Math.max(CHASE_MIN, back);

    let up = CHASE_UP;
    for (let iter = 0; iter < 3; iter++) {
      let need = CHASE_UP;
      let nearest = Infinity;
      for (const b of this.padded) {
        const t0 = rayBoxDist2D(x, z, dx, dz, b);
        if (!(t0 < back)) continue;
        if (t0 < nearest) nearest = t0;
        need = Math.max(need, head + ((b.h + margin - head) * back) / Math.max(0.5, t0));
      }
      if (need <= CHASE_MAX_UP || nearest === Infinity) { up = Math.min(CHASE_MAX_UP, need); break; }
      const shorter = Math.max(CHASE_MIN, nearest - 0.4);
      up = CHASE_MAX_UP;
      if (shorter >= back - 1e-3) break; // already as tight as allowed: fly high and look down
      back = shorter;
    }
    return { back, up };
  }

  private place(world: World, dt: number): void {
    const a = world.agents[this.subject];
    const p = this.scene.pose(this.subject) ?? { x: a.x, z: a.z, yaw: a.yaw };
    const cam = this.scene.camera;
    const k = 1 - Math.exp(-dt * (this.mode === 'first' ? 16 : 8));
    // smooth the heading (agents can swing fast; the eye should not)
    let dy = p.yaw - this.smoothYaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.smoothYaw = this.initialised ? this.smoothYaw + dy * Math.min(1, k * 1.4) : p.yaw;
    const fx = Math.cos(this.smoothYaw);
    const fz = Math.sin(this.smoothYaw);

    if (this.mode === 'first') {
      const eye = world.cfg.eyeHeight + (a.alive ? 0 : -1.0);
      // a little ahead of the body centre so the visor never clips into the view
      this.pos.set(p.x + fx * 0.25, eye, p.z + fz * 0.25);
      this.look.set(this.pos.x + fx * 20, eye + (a.alive ? 0 : -2.5), this.pos.z + fz * 20);
      cam.position.copy(this.pos);
      cam.lookAt(this.look);
    } else {
      // over-the-shoulder: pull back, step to one side, and CLIMB when cover shortens the boom
      // (shrinking the distance alone put the camera inside the subject whenever its back was to a wall)
      const rx = -Math.sin(this.smoothYaw);
      const rz = Math.cos(this.smoothYaw);
      const b = this.boom(p.x + rx * CHASE_SIDE, p.z + rz * CHASE_SIDE, -fx, -fz, CHASE_BACK);
      this.tmp.set(p.x - fx * b.back + rx * CHASE_SIDE, b.up, p.z - fz * b.back + rz * CHASE_SIDE);
      // look just ahead of the subject, not 8 m down-range: that pushed them to the edge of frame
      const target = this.tgt.set(p.x + fx * 3 + rx * CHASE_SIDE * 0.4, 1.45, p.z + fz * 3 + rz * CHASE_SIDE * 0.4);
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
    // hit/fire shake, applied after lookAt so it perturbs the final orientation
    const sh = this.scene.shake;
    if (sh > 0.001) {
      const amp = sh * (this.mode === 'first' ? 0.05 : 0.03);
      cam.rotation.x += (Math.random() - 0.5) * amp;
      cam.rotation.y += (Math.random() - 0.5) * amp;
      cam.rotation.z += (Math.random() - 0.5) * amp * 1.6;
    }
    this.initialised = true;
  }
}
