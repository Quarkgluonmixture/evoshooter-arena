import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from '../sim/map.ts';
import type { World, ShotEvent, KillEvent } from '../sim/world.ts';

export const TEAM_HEX: [number, number] = [0xe66767, 0x3987e5];
export const TEAM_CSS: [string, string] = ['#e66767', '#3987e5'];

const TRAIL_LEN = 48;
const TRACER_POOL = 96;
const PARTICLE_POOL = 300;
const FLASH_POOL = 48;
const GRAVITY = 26;

interface AgentView {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  visor: THREE.Mesh;
  gun: THREE.Mesh;
  hpBg: THREE.Sprite;
  hpFg: THREE.Sprite;
  hpMat: THREE.SpriteMaterial;
  comm: THREE.Mesh;
  commMat: THREE.MeshStandardMaterial;
  fov: THREE.Mesh;
  fovMat: THREE.MeshBasicMaterial;
  aimRing: THREE.Mesh;
  trail: THREE.Line;
  trailPos: Float32Array;
  trailCount: number;
  deadAnim: number;
  lastX: number;
  lastZ: number;
  /** pose at the previous sim tick + the one just simulated; rendering interpolates between them */
  px: number; pz: number; pyaw: number;
  cx: number; cz: number; cyaw: number;
  /** interpolated pose actually drawn this frame (the camera must follow THIS, not the raw sim pose) */
  rx: number; rz: number; ryaw: number;
  /** white flash when this agent is struck, 1 → 0 */
  hitFlash: number;
  /** seconds left of muzzle flash */
  muzzleT: number;
  muzzle: THREE.Sprite;
  muzzleMat: THREE.SpriteMaterial;
}

interface Tracer { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number; max: number; peak: number }
/** A ballistic debris bit. Deliberately NOT a growing sphere — that read as a water ripple, not a bullet impact. */
interface Particle {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial;
  vx: number; vy: number; vz: number;
  life: number; max: number; size: number; grav: number;
}
interface Flash { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; life: number; max: number; size: number }

export interface SceneToggles {
  fov: boolean;
  trails: boolean;
  comm: boolean;
  tracers: boolean;
}

/** All rendering state for one arena. Pure view: reads a World, never mutates it. */
export class ArenaScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly toggles: SceneToggles = { fov: true, trails: true, comm: true, tracers: true };
  /** agent whose own body is hidden because the camera sits in its eyes */
  firstPersonId = -1;
  /** id of the agent the spectator is following (for first-person view-model + shake); -1 = none */
  subjectId = -1;
  /** camera shake amplitude, decays every frame; the rig reads it */
  shake = 0;
  private readonly cfg: SimConfig;
  readonly map: ArenaMap;
  private readonly container: HTMLElement;
  private views: AgentView[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly particles: Particle[] = [];
  private readonly flashes: Flash[] = [];
  private readonly puffTex: THREE.Texture;
  private viewModel!: THREE.Group;
  private viewMuzzle!: THREE.Sprite;
  private viewMuzzleMat!: THREE.SpriteMaterial;
  private viewMuzzleT = 0;
  private recoil = 0;
  private zoneDisc!: THREE.Mesh;
  private zoneMat!: THREE.MeshBasicMaterial;
  private zoneT = 0;
  private readonly agentRoot = new THREE.Group();
  private readonly fxRoot = new THREE.Group();

  constructor(container: HTMLElement, cfg: SimConfig, map: ArenaMap) {
    this.container = container;
    this.cfg = cfg;
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x0e1014);
    this.scene.fog = new THREE.Fog(0x0e1014, 90, 160);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.camera.position.set(0, 46, 58);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 140;
    this.controls.target.set(0, 0, 0);

    this.puffTex = makePuffTexture();
    this.buildLights();
    this.buildMap();
    this.scene.add(this.agentRoot, this.fxRoot);
    this.buildPools();
    this.buildViewModel();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xb8c4d8, 0x2a2d36, 1.15);
    this.scene.add(hemi);
    const fill = new THREE.DirectionalLight(0x9fb4d8, 0.9); // opposite side, no shadows: keeps back faces readable in 1st person
    fill.position.set(-30, 35, -40);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const h = this.cfg.arenaHalf + 5;
    sun.shadow.camera.left = -h;
    sun.shadow.camera.right = h;
    sun.shadow.camera.top = h;
    sun.shadow.camera.bottom = -h;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
  }

  private buildMap(): void {
    const half = this.cfg.arenaHalf;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, half * 2),
      new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(half * 2, 12, 0x3a3f4a, 0x2c303a);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // team halves tint
    for (let t = 0; t < 2; t++) {
      const tint = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2, 6),
        new THREE.MeshBasicMaterial({ color: TEAM_HEX[t], transparent: true, opacity: 0.08, depthWrite: false }),
      );
      tint.rotation.x = -Math.PI / 2;
      tint.position.set(0, 0.015, t === 0 ? -half + 3 : half - 3);
      this.scene.add(tint);
    }

    // boundary
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(half * 2, 0.02, half * 2)),
      new THREE.LineBasicMaterial({ color: 0x4a5060 }),
    );
    border.position.y = 0.02;
    this.scene.add(border);

    // cover
    const tallMat = new THREE.MeshStandardMaterial({ color: 0x5b6273, roughness: 0.8 });
    const lowMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, roughness: 0.85 });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x0e1014, transparent: true, opacity: 0.6 });
    for (const b of this.map.boxes) {
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const geo = new THREE.BoxGeometry(w, b.h, d);
      const m = new THREE.Mesh(geo, b.h > 2 ? tallMat : lowMat);
      m.position.set((b.minX + b.maxX) / 2, b.h / 2, (b.minZ + b.maxZ) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      edges.position.copy(m.position);
      this.scene.add(edges);
    }

    // zone
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.cfg.zoneRadius - 0.15, this.cfg.zoneRadius + 0.15, 64),
      new THREE.MeshBasicMaterial({ color: 0xe8e8e6, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.map.zoneX, 0.03, this.map.zoneZ);
    this.scene.add(ring);
    this.zoneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false });
    this.zoneDisc = new THREE.Mesh(new THREE.CircleGeometry(this.cfg.zoneRadius, 64), this.zoneMat);
    this.zoneDisc.rotation.x = -Math.PI / 2;
    this.zoneDisc.position.set(this.map.zoneX, 0.025, this.map.zoneZ);
    this.scene.add(this.zoneDisc);

    // spawn pads
    for (let t = 0; t < 2; t++) {
      for (const sp of this.map.spawns[t]) {
        const pad = new THREE.Mesh(
          new THREE.CircleGeometry(0.7, 24),
          new THREE.MeshBasicMaterial({ color: TEAM_HEX[t], transparent: true, opacity: 0.35 }),
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(sp.x, 0.02, sp.z);
        this.scene.add(pad);
      }
    }
  }

  private buildPools(): void {
    for (let i = 0; i < TRACER_POOL; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      this.fxRoot.add(line);
      this.tracers.push({ line, mat, life: 0, max: 1, peak: 1 });
    }
    const bitGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < PARTICLE_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(bitGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.fxRoot.add(mesh);
      this.particles.push({ mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, grav: GRAVITY });
    }
    for (let i = 0; i < FLASH_POOL; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.fxRoot.add(sprite);
      this.flashes.push({ sprite, mat, life: 0, max: 1, size: 1 });
    }
  }

  /** Gun held by the camera in first person: without it, shooting has no on-screen source. */
  private buildViewModel(): void {
    this.viewModel = new THREE.Group();
    // self-lit: the view model hangs in the camera's shadow, so plain standard material renders as a black slab
    const dark = new THREE.MeshStandardMaterial({ color: 0x555b67, roughness: 0.55, metalness: 0.3, emissive: 0x23272e, emissiveIntensity: 1 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.5), dark);
    body.position.set(0, 0, -0.18);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.08), dark);
    grip.position.set(0, -0.11, 0.03);
    grip.rotation.x = -0.18;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.05), dark);
    sight.position.set(0, 0.065, -0.28);
    this.viewModel.add(body, grip, sight);
    this.viewMuzzleMat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.viewMuzzle = new THREE.Sprite(this.viewMuzzleMat);
    this.viewMuzzle.position.set(0, 0.005, -0.46);
    this.viewMuzzle.scale.setScalar(0.22);
    this.viewMuzzle.visible = false;
    this.viewModel.add(this.viewMuzzle);
    this.viewModel.position.set(0.3, -0.25, -0.62);
    this.viewModel.rotation.set(0, 0.16, 0.06); // toed in, so the silhouette reads as a weapon
    this.viewModel.scale.setScalar(0.55);       // tuned by eye in the headless check: any bigger and it owns the frame
    this.viewModel.visible = false;
    this.camera.add(this.viewModel);
    this.scene.add(this.camera); // children of the camera only render if the camera is in the graph
  }

  private freeParticle(): Particle {
    let best = this.particles[0];
    for (const p of this.particles) {
      if (p.life <= 0) return p;
      if (p.life < best.life) best = p;
    }
    return best;
  }

  private freeFlash(): Flash {
    let best = this.flashes[0];
    for (const f of this.flashes) {
      if (f.life <= 0) return f;
      if (f.life < best.life) best = f;
    }
    return best;
  }

  /** One-shot burst of ballistic bits. `spread` = cone half-width around (dx,dy,dz). */
  private burst(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    opts: { count: number; color: number; speed: number; spread: number; size: number; life: number; grav?: number },
  ): void {
    for (let i = 0; i < opts.count; i++) {
      const p = this.freeParticle();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * opts.spread;
      // random unit vector, then biased towards the impact normal
      const rx = Math.cos(a) * r;
      const ry = (Math.random() - 0.35) * opts.spread;
      const rz = Math.sin(a) * r;
      const sp = opts.speed * (0.45 + Math.random() * 0.9);
      p.vx = (dx + rx) * sp;
      p.vy = (dy + ry) * sp;
      p.vz = (dz + rz) * sp;
      p.size = opts.size * (0.6 + Math.random() * 0.8);
      p.max = opts.life * (0.7 + Math.random() * 0.6);
      p.life = p.max;
      p.grav = opts.grav ?? GRAVITY;
      p.mat.color.setHex(opts.color);
      p.mat.opacity = 1;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.set(p.size, p.size, p.size);
      p.mesh.visible = true;
    }
  }

  private flash(x: number, y: number, z: number, color: number, size: number, life: number): void {
    const f = this.freeFlash();
    f.sprite.position.set(x, y, z);
    f.size = size;
    f.max = life;
    f.life = life;
    f.mat.color.setHex(color);
    f.mat.opacity = 1;
    f.sprite.scale.setScalar(size);
    f.sprite.visible = true;
  }

  /** (Re)create agent views for a fresh world. */
  bindWorld(world: World): void {
    for (const v of this.views) this.agentRoot.remove(v.group);
    this.views = [];
    for (const t of this.tracers) { t.line.visible = false; t.life = 0; }
    for (const p of this.particles) { p.mesh.visible = false; p.life = 0; }
    for (const f of this.flashes) { f.sprite.visible = false; f.life = 0; }
    this.shake = 0;
    this.recoil = 0;
    this.viewMuzzleT = 0;

    const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.95, 6, 14);
    const visorGeo = new THREE.BoxGeometry(0.34, 0.14, 0.18);
    const commGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const ringGeo = new THREE.RingGeometry(0.62, 0.72, 32);
    const gunGeo = new THREE.BoxGeometry(0.62, 0.11, 0.11);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.45, metalness: 0.6 });
    const fovR = 7;
    const fovShape = new THREE.Shape();
    const halfFov = (this.cfg.fovDeg * Math.PI) / 360;
    fovShape.moveTo(0, 0);
    fovShape.absarc(0, 0, fovR, -halfFov, halfFov, false);
    fovShape.lineTo(0, 0);
    const fovGeo = new THREE.ShapeGeometry(fovShape, 24);

    for (const a of world.agents) {
      const color = TEAM_HEX[a.team];
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.9;
      body.castShadow = true;
      group.add(body);
      const visor = new THREE.Mesh(visorGeo, new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.3, metalness: 0.6 }));
      visor.position.set(0.32, this.cfg.eyeHeight, 0);
      group.add(visor);

      // a visible weapon: shots now leave a gun instead of the middle of the head
      const gun = new THREE.Mesh(gunGeo, gunMat);
      gun.position.set(MUZZLE.fwd - 0.3, MUZZLE.up, MUZZLE.side);
      gun.castShadow = true;
      group.add(gun);
      const muzzleMat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const muzzle = new THREE.Sprite(muzzleMat);
      muzzle.position.set(MUZZLE.fwd, MUZZLE.up, MUZZLE.side);
      muzzle.scale.setScalar(0.5);
      muzzle.visible = false;
      group.add(muzzle);

      const hpBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false }));
      hpBg.scale.set(1.1, 0.12, 1);
      hpBg.position.y = 2.25;
      const hpMat = new THREE.SpriteMaterial({ color: 0x7ee08a, depthTest: false });
      const hpFg = new THREE.Sprite(hpMat);
      hpFg.scale.set(1.0, 0.08, 1);
      hpFg.position.y = 2.25;
      group.add(hpBg, hpFg);

      const commMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0x000000, emissiveIntensity: 1.6, roughness: 0.4 });
      const comm = new THREE.Mesh(commGeo, commMat);
      comm.position.y = 2.6;
      group.add(comm);

      const fovMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const fov = new THREE.Mesh(fovGeo, fovMat);
      fov.rotation.x = -Math.PI / 2;
      fov.position.y = 0.04;
      group.add(fov);

      const aimRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      aimRing.rotation.x = -Math.PI / 2;
      aimRing.position.y = 0.05;
      aimRing.visible = false;
      group.add(aimRing);

      const trailPos = new Float32Array(TRAIL_LEN * 3);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setDrawRange(0, 0);
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 }));
      trail.frustumCulled = false;
      this.agentRoot.add(trail);

      group.position.set(a.x, 0, a.z);
      this.agentRoot.add(group);
      this.views.push({
        group, body, bodyMat, visor, gun, hpBg, hpFg, hpMat, comm, commMat, fov, fovMat, aimRing, trail, trailPos,
        trailCount: 0, deadAnim: 0, lastX: a.x, lastZ: a.z,
        px: a.x, pz: a.z, pyaw: a.yaw, cx: a.x, cz: a.z, cyaw: a.yaw, rx: a.x, rz: a.z, ryaw: a.yaw,
        hitFlash: 0, muzzleT: 0, muzzle, muzzleMat,
      });
    }
  }

  /**
   * Snapshot the pose of every agent as "the previous tick". Must be called immediately BEFORE each
   * sim step: the sim runs at 15 Hz while we draw at display rate, so rendering the raw sim pose
   * makes agents visibly step (the "一卡一卡" stutter). We interpolate prev → current instead.
   */
  captureTick(world: World): void {
    for (let i = 0; i < world.agents.length; i++) {
      const v = this.views[i];
      if (!v) continue;
      const a = world.agents[i];
      v.px = v.cx; v.pz = v.cz; v.pyaw = v.cyaw;
      v.cx = a.x; v.cz = a.z; v.cyaw = a.yaw;
    }
  }

  /** How many pooled effects are alive right now — the only honest signal that a shot rendered. */
  fxStats(): { tracers: number; particles: number; flashes: number; shake: number } {
    return {
      tracers: this.tracers.reduce((n, t) => n + (t.life > 0 ? 1 : 0), 0),
      particles: this.particles.reduce((n, p) => n + (p.life > 0 ? 1 : 0), 0),
      flashes: this.flashes.reduce((n, f) => n + (f.life > 0 ? 1 : 0), 0),
      shake: this.shake,
    };
  }

  /** Half-extent of the arena, for camera clamping. */
  get mapHalf(): number {
    return this.cfg.arenaHalf;
  }

  /** Interpolated pose currently on screen (the camera must follow this, not the raw sim pose). */
  pose(i: number): { x: number; z: number; yaw: number } | null {
    const v = this.views[i];
    return v ? { x: v.rx, z: v.rz, yaw: v.ryaw } : null;
  }

  /**
   * Pull the world's state into the meshes.
   * `alpha` = how far the render clock sits between the previous and the latest sim tick (0..1).
   * `tickAdvanced` = the sim moved this frame (append to trails).
   */
  sync(world: World, alpha: number, tickAdvanced: boolean): void {
    const T = this.cfg.teamSize;
    const t = Math.max(0, Math.min(1, alpha));
    let rz = 0;
    let bz = 0;
    for (let i = 0; i < world.agents.length; i++) {
      const a = world.agents[i];
      const v = this.views[i];
      if (!v) continue;
      v.rx = v.px + (v.cx - v.px) * t;
      v.rz = v.pz + (v.cz - v.pz) * t;
      v.ryaw = v.pyaw + shortestArc(v.pyaw, v.cyaw) * t;
      v.group.position.set(v.rx, 0, v.rz);
      v.group.rotation.y = -v.ryaw;
      // in first person, a teammate standing on your shoulder fills the whole screen: fade them out
      let nearFade = 1;
      if (this.firstPersonId >= 0 && i !== this.firstPersonId && a.alive) {
        const d = Math.hypot(v.rx - this.camera.position.x, v.rz - this.camera.position.z);
        nearFade = d < 1.8 ? 0 : d < 3.0 ? (d - 1.8) / 1.2 : 1;
      }
      const hidden = i === this.firstPersonId || nearFade <= 0;
      v.group.visible = !hidden;
      v.fov.visible = this.toggles.fov && a.alive;
      v.comm.visible = this.toggles.comm && a.alive;
      v.trail.visible = this.toggles.trails && !hidden;
      v.hpBg.visible = a.alive;
      v.hpFg.visible = a.alive;
      v.aimRing.visible = a.alive && a.aim;
      if (a.alive) {
        v.deadAnim = 0;
        v.body.rotation.z = 0;
        v.body.position.y = 0.9;
        v.bodyMat.opacity = 1;
        v.bodyMat.transparent = false;
        // struck this instant: flash the body white, so a hit READS as a hit.
        // `hitFlash` is set to 1 by addShot and decays in update(dt); dmgRecent keeps it lit while damage is fresh.
        v.hitFlash = Math.max(v.hitFlash, Math.min(1, a.dmgRecent / this.cfg.damage));
        if (v.hitFlash > 0.02) {
          v.bodyMat.emissive.setRGB(1, 0.92, 0.88);
          v.bodyMat.emissiveIntensity = 0.2 + 1.5 * v.hitFlash;
        } else {
          v.bodyMat.emissive.setHex(TEAM_HEX[a.team]);
          v.bodyMat.emissiveIntensity = a.firing ? 0.55 : 0.12;
        }
        if (nearFade < 1) {
          v.bodyMat.transparent = true;
          v.bodyMat.opacity = nearFade;
        }
        v.visor.visible = nearFade > 0.6; // opaque black parts cannot fade: drop them early

        const hp = a.hp / this.cfg.hp;
        v.hpFg.scale.x = Math.max(0.02, hp);
        v.hpMat.color.setHSL(0.33 * hp, 0.8, 0.55);
        // comm channel → hue by angle, brightness by magnitude
        const mag = Math.min(1, Math.hypot(a.comm[0], a.comm[1]));
        const hue = (Math.atan2(a.comm[1], a.comm[0]) / (2 * Math.PI) + 1) % 1;
        v.commMat.emissive.setHSL(hue, 0.9, 0.15 + 0.45 * mag);
        v.commMat.color.setHSL(hue, 0.8, 0.1 + 0.3 * mag);
        v.fovMat.opacity = a.firing ? 0.22 : 0.1;
        if (this.inZone(a.x, a.z)) { if (a.team === 0) rz++; else bz++; }
        v.gun.visible = nearFade > 0.6;
        if (tickAdvanced && (Math.abs(a.x - v.lastX) > 0.05 || Math.abs(a.z - v.lastZ) > 0.05)) {
          this.pushTrail(v, a.x, a.z);
          v.lastX = a.x;
          v.lastZ = a.z;
        }
      } else {
        v.deadAnim = Math.min(1, v.deadAnim + 0.08);
        v.body.rotation.z = (Math.PI / 2) * v.deadAnim;
        v.body.position.y = 0.9 - 0.55 * v.deadAnim;
        v.bodyMat.transparent = true;
        v.bodyMat.opacity = 1 - 0.55 * v.deadAnim;
        v.bodyMat.emissiveIntensity = 0;
        v.hitFlash = 0;
        v.gun.visible = v.deadAnim < 0.5;
        v.visor.visible = true; // may have been dropped by the first-person near-fade while it was alive
        v.muzzle.visible = false;
      }
    }
    void T;
    const owner: 0 | 1 | -1 = rz > bz ? 0 : bz > rz ? 1 : -1;
    if (owner !== -1) {
      this.zoneMat.color.setHex(TEAM_HEX[owner]);
      this.zoneMat.opacity = 0.22 + 0.08 * Math.sin(this.zoneT * 6);
    } else {
      this.zoneMat.color.setHex(0xffffff);
      this.zoneMat.opacity = 0.05;
    }
  }

  private inZone(x: number, z: number): boolean {
    const dx = x - this.map.zoneX;
    const dz = z - this.map.zoneZ;
    return dx * dx + dz * dz <= this.cfg.zoneRadius * this.cfg.zoneRadius;
  }

  private pushTrail(v: AgentView, x: number, z: number): void {
    const p = v.trailPos;
    if (v.trailCount < TRAIL_LEN) {
      p[v.trailCount * 3] = x;
      p[v.trailCount * 3 + 1] = 0.08;
      p[v.trailCount * 3 + 2] = z;
      v.trailCount++;
    } else {
      p.copyWithin(0, 3);
      p[(TRAIL_LEN - 1) * 3] = x;
      p[(TRAIL_LEN - 1) * 3 + 1] = 0.08;
      p[(TRAIL_LEN - 1) * 3 + 2] = z;
    }
    const geo = v.trail.geometry;
    geo.setDrawRange(0, v.trailCount);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Render one fired round: muzzle flash at the gun, a short tracer, and — on a hit — a spray of
   * ballistic debris plus a body flash. No expanding spheres: those read as water ripples, not bullets.
   */
  addShot(ev: ShotEvent, world: World): void {
    const shooter = world.agents[ev.shooter];
    const sv = this.views[ev.shooter];
    const team = shooter.team;
    // fire from the gun using the pose actually on screen, not the raw sim pose
    const yaw = sv ? sv.ryaw : shooter.yaw;
    const fx = Math.cos(yaw);
    const fz = Math.sin(yaw);
    const bx = sv ? sv.rx : shooter.x;
    const bz = sv ? sv.rz : shooter.z;
    const mx = bx + fx * MUZZLE.fwd - Math.sin(yaw) * MUZZLE.side;
    const my = MUZZLE.up;
    const mz = bz + fz * MUZZLE.fwd + Math.cos(yaw) * MUZZLE.side;

    // the eye sits ~0.6 m from your own gun: a world-space muzzle flash there would white out first person,
    // so the subject's own flash lives on the view model instead
    const own = ev.shooter === this.firstPersonId;
    if (sv && !own) { sv.muzzleT = 0.05; sv.muzzleMat.opacity = 1; sv.muzzle.visible = shooter.alive; }
    if (!own) this.flash(mx, my, mz, 0xffd9a0, 0.75, 0.05);
    if (ev.shooter === this.subjectId) {
      this.recoil = 1;
      this.viewMuzzleT = 0.05;
      this.shake = Math.max(this.shake, 0.05);
    }

    if (this.toggles.tracers) {
      const t = this.tracers.find((x) => x.life <= 0) ?? this.tracers[0];
      const pos = t.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, mx, my, mz);
      pos.setXYZ(1, ev.x1, ev.y1, ev.z1);
      pos.needsUpdate = true;
      t.mat.color.setHex(ev.hit ? 0xfff4d0 : TEAM_HEX[team]);
      t.peak = ev.hit ? 1 : 0.55;
      t.mat.opacity = t.peak;
      t.max = ev.hit ? 0.09 : 0.07;
      t.life = t.max;
      t.line.visible = true;
    }

    // impact
    const d = Math.hypot(ev.x1 - mx, ev.z1 - mz) || 1;
    const nx = -(ev.x1 - mx) / d; // back along the bullet path
    const nz = -(ev.z1 - mz) / d;
    if (ev.hit) {
      const tv = this.views[ev.target];
      if (tv) tv.hitFlash = 1;
      this.flash(ev.x1, ev.y1, ev.z1, 0xffe6c0, 0.5, 0.06);
      this.burst(ev.x1, ev.y1, ev.z1, nx, 0.35, nz, { count: 7, color: 0x9e1f1f, speed: 7, spread: 0.7, size: 0.1, life: 0.5 });
      this.burst(ev.x1, ev.y1, ev.z1, nx, 0.5, nz, { count: 3, color: 0xffd27a, speed: 11, spread: 0.5, size: 0.06, life: 0.22 });
      if (ev.target === this.subjectId) this.shake = Math.max(this.shake, 0.5);
    } else {
      this.burst(ev.x1, ev.y1, ev.z1, nx, 0.4, nz, { count: 4, color: 0xb9bcc4, speed: 6, spread: 0.8, size: 0.07, life: 0.3 });
    }
  }

  addKill(ev: KillEvent, world: World): void {
    const team = world.agents[ev.victim].team;
    this.flash(ev.x, 1.1, ev.z, TEAM_HEX[team], 1.6, 0.14);
    this.burst(ev.x, 1.1, ev.z, 0, 1, 0, { count: 16, color: 0x9e1f1f, speed: 6.5, spread: 1.0, size: 0.12, life: 0.7 });
    this.burst(ev.x, 1.1, ev.z, 0, 1, 0, { count: 8, color: TEAM_HEX[team], speed: 4.5, spread: 1.0, size: 0.1, life: 0.6 });
    if (ev.victim === this.subjectId) this.shake = Math.max(this.shake, 0.9);
  }

  update(dt: number): void {
    this.zoneT += dt;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, (t.life / t.max) * t.peak);
      if (t.life <= 0) t.line.visible = false;
    }
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; p.mat.opacity = 0; continue; }
      p.vy -= p.grav * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vz *= 1 - 2.2 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.03) { p.mesh.position.y = 0.03; p.vy *= -0.25; p.vx *= 0.6; p.vz *= 0.6; }
      const f = p.life / p.max;
      p.mesh.scale.setScalar(p.size * (0.35 + 0.65 * f)); // shrink, never grow
      p.mat.opacity = Math.min(1, f * 1.6);
      p.mesh.rotation.x += dt * 9;
      p.mesh.rotation.y += dt * 7;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      f.sprite.scale.setScalar(f.size * (0.55 + 0.45 * k));
      f.mat.opacity = k;
      if (f.life <= 0) f.sprite.visible = false;
    }
    for (const v of this.views) {
      if (v.hitFlash > 0) v.hitFlash = Math.max(0, v.hitFlash - dt * 4);
      if (v.muzzleT > 0) {
        v.muzzleT -= dt;
        v.muzzleMat.opacity = Math.max(0, v.muzzleT / 0.05);
        v.muzzle.scale.setScalar(0.34 + 0.26 * Math.random());
        if (v.muzzleT <= 0) v.muzzle.visible = false;
      }
    }
    // first-person view model: recoil kick + its own muzzle flash
    this.viewModel.visible = this.firstPersonId >= 0;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const kick = this.recoil * this.recoil;
    this.viewModel.position.set(0.3, -0.25 - 0.012 * kick, -0.62 + 0.07 * kick);
    this.viewModel.rotation.x = 0.2 * kick;
    if (this.viewMuzzleT > 0) {
      this.viewMuzzleT -= dt;
      this.viewMuzzle.visible = this.viewMuzzleT > 0;
      this.viewMuzzleMat.opacity = Math.max(0, this.viewMuzzleT / 0.05);
      this.viewMuzzle.scale.setScalar(0.26 + 0.2 * Math.random());
    } else if (this.viewMuzzle.visible) {
      this.viewMuzzle.visible = false;
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.controls.update();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

/** Where the gun sits on the capsule, in local (forward, up, side) units. */
const MUZZLE = { fwd: 0.62, up: 1.28, side: 0.24 };

function shortestArc(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Soft round puff used by every flash sprite (muzzle, impact, kill). */
function makePuffTexture(): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,236,200,0.85)');
  grad.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
