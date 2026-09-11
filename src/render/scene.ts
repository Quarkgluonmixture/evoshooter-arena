import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimConfig } from '../core/config.ts';
import type { ArenaMap } from '../sim/map.ts';
import type { World, ShotEvent, KillEvent } from '../sim/world.ts';

export const TEAM_HEX: [number, number] = [0xe66767, 0x3987e5];
export const TEAM_CSS: [string, string] = ['#e66767', '#3987e5'];

const TRAIL_LEN = 48;
const TRACER_POOL = 96;
const SPARK_POOL = 48;

interface AgentView {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  visor: THREE.Mesh;
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
}

interface Tracer { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number; max: number }
interface Spark { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }

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
  private readonly cfg: SimConfig;
  private readonly map: ArenaMap;
  private readonly container: HTMLElement;
  private views: AgentView[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly sparks: Spark[] = [];
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

    this.buildLights();
    this.buildMap();
    this.scene.add(this.agentRoot, this.fxRoot);
    this.buildPools();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xb8c4d8, 0x1a1c22, 0.85);
    this.scene.add(hemi);
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
      this.tracers.push({ line, mat, life: 0, max: 1 });
    }
    const sparkGeo = new THREE.SphereGeometry(0.25, 10, 8);
    for (let i = 0; i < SPARK_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      this.fxRoot.add(mesh);
      this.sparks.push({ mesh, mat, life: 0 });
    }
  }

  /** (Re)create agent views for a fresh world. */
  bindWorld(world: World): void {
    for (const v of this.views) this.agentRoot.remove(v.group);
    this.views = [];
    for (const t of this.tracers) { t.line.visible = false; t.life = 0; }
    for (const s of this.sparks) { s.mesh.visible = false; s.life = 0; }

    const bodyGeo = new THREE.CapsuleGeometry(0.42, 0.95, 6, 14);
    const visorGeo = new THREE.BoxGeometry(0.34, 0.14, 0.18);
    const commGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const ringGeo = new THREE.RingGeometry(0.62, 0.72, 32);
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
        group, body, bodyMat, visor, hpBg, hpFg, hpMat, comm, commMat, fov, fovMat, aimRing, trail, trailPos,
        trailCount: 0, deadAnim: 0, lastX: a.x, lastZ: a.z,
      });
    }
  }

  /** Pull the world's state into the meshes. `tickAdvanced` = the sim moved this frame (append to trails). */
  sync(world: World, tickAdvanced: boolean): void {
    const T = this.cfg.teamSize;
    let rz = 0;
    let bz = 0;
    for (let i = 0; i < world.agents.length; i++) {
      const a = world.agents[i];
      const v = this.views[i];
      if (!v) continue;
      v.group.position.set(a.x, 0, a.z);
      v.group.rotation.y = -a.yaw;
      v.fov.visible = this.toggles.fov && a.alive;
      v.comm.visible = this.toggles.comm && a.alive;
      v.trail.visible = this.toggles.trails;
      v.hpBg.visible = a.alive;
      v.hpFg.visible = a.alive;
      v.aimRing.visible = a.alive && a.aim;
      if (a.alive) {
        v.deadAnim = 0;
        v.body.rotation.z = 0;
        v.body.position.y = 0.9;
        v.bodyMat.opacity = 1;
        v.bodyMat.transparent = false;
        v.bodyMat.emissiveIntensity = a.firing ? 0.55 : 0.12;
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

  addShot(ev: ShotEvent, world: World): void {
    if (!this.toggles.tracers) return;
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) t = this.tracers[0];
    const pos = t.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, ev.x0, ev.y0, ev.z0);
    pos.setXYZ(1, ev.x1, ev.y1, ev.z1);
    pos.needsUpdate = true;
    const team = world.agents[ev.shooter].team;
    t.mat.color.setHex(ev.hit ? 0xfff2c4 : TEAM_HEX[team]);
    t.mat.opacity = ev.hit ? 1 : 0.6;
    t.max = ev.hit ? 0.28 : 0.18;
    t.life = t.max;
    t.line.visible = true;
    if (ev.hit) {
      let s = this.sparks.find((x) => x.life <= 0);
      if (!s) s = this.sparks[0];
      s.mesh.position.set(ev.x1, ev.y1, ev.z1);
      s.mesh.scale.setScalar(0.6);
      s.mat.color.setHex(0xffd27a);
      s.mat.opacity = 1;
      s.life = 0.25;
      s.mesh.visible = true;
    }
  }

  addKill(ev: KillEvent, world: World): void {
    let s = this.sparks.find((x) => x.life <= 0);
    if (!s) s = this.sparks[0];
    s.mesh.position.set(ev.x, 1.0, ev.z);
    s.mesh.scale.setScalar(1.2);
    s.mat.color.setHex(TEAM_HEX[world.agents[ev.victim].team]);
    s.mat.opacity = 1;
    s.life = 0.6;
    s.mesh.visible = true;
  }

  update(dt: number): void {
    this.zoneT += dt;
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mat.opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) t.line.visible = false;
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.scale.multiplyScalar(1 + dt * 6);
      s.mat.opacity = Math.max(0, s.life * 3);
      if (s.life <= 0) s.mesh.visible = false;
    }
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
