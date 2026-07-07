// ── Dream Growth · first-person navigable interior that GROWS as you play ────
// A real three.js scene-graph you WALK through with WASD + pointer-lock look.
// You start on near-empty ground with a sparse cloister of a few plaster
// pillars; every strike accretes new geometry (see growth.ts), so by minute
// five the endless plaza has reconfigured into a cathedral of your own making —
// a physical record of your performance you can walk back through and replay.
//
// Palette: bone/plaster white, cold fluorescent-teal ambient, long de Chirico
// raking shadows from one low sun whose azimuth slowly crawls. Flat (no tone-
// mapping) so it reads like a metaphysical painting, not a game.
//
// Striking raycasts from the crosshair against the starter pillars, the grown
// geometry AND the open ground — whichever is nearest rings, and each strike is
// tuned to a just-intonation A-Dorian degree by what (or where) it hit.

import * as THREE from "three";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { GrowthField } from "./growth";
import {
  degreeFreq,
  groundDegree,
  DORIAN,
  ROOT_PILLAR,
  ROOT_ARCH,
  mod,
} from "./tuning";

const EYE = 1.62;
const TILE = 4;
const BONE = 0xd7d0c0;
const TEAL = new THREE.Color(0x63e6d2);

export interface StrikeHit {
  freq: number;
  x: number;
  y: number;
  z: number;
}

export interface ListenerPose {
  px: number; py: number; pz: number;
  fx: number; fy: number; fz: number;
  ux: number; uy: number; uz: number;
}

interface BaseResonator {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  freq: number;
  bloom: number;
  hovered: boolean;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#cbc4b2";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(70,92,90,0.5)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.fillStyle = `rgba(150,150,140,${0.03 + Math.random() * 0.04})`;
    g.beginPath();
    g.arc(x, y, 6 + Math.random() * 22, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(200, 200);
  tex.anisotropy = 4;
  return tex;
}

export class GrowthScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private mount: HTMLElement;
  private reduced: boolean;

  private ground: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private base: BaseResonator[] = [];
  private growth: GrowthField;
  private disposables: { dispose(): void }[] = [];

  // movement
  private yaw = 0;
  private pitch = 0;
  private pendingYaw = 0;
  private pendingPitch = 0;
  private vel = new THREE.Vector3();
  private keys = new Set<string>();
  private bobDist = 0;
  private preview = true;

  // playing density — recent strike timestamps (seconds)
  private strikeTimes: number[] = [];

  // fx pools
  private rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private flashes: { light: THREE.PointLight; life: number }[] = [];

  private raycaster = new THREE.Raycaster();
  private hovered: BaseResonator | null = null;

  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _ndc = new THREE.Vector2();
  private _p = new THREE.Vector3();

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.reduced = prefersReducedMotion();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const haze = new THREE.Color(0xa9bab7);
    scene.background = haze;
    scene.fog = new THREE.FogExp2(haze.getHex(), 0.028);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      68,
      (mount.clientWidth || window.innerWidth) / (mount.clientHeight || window.innerHeight),
      0.1,
      400,
    );
    camera.position.set(0, EYE, 6);
    this.camera = camera;

    const hemi = new THREE.HemisphereLight(0xcdeee8, 0xb6b0a0, 0.55);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0x8fb7b2, 0.25);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xf3f4ef, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 130;
    const s = 48;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    const floorTex = makeFloorTexture();
    const floorGeo = new THREE.PlaneGeometry(900, 900);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex, color: 0xffffff, roughness: 0.95, metalness: 0,
    });
    const ground = new THREE.Mesh(floorGeo, floorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;
    this.disposables.push(floorGeo, floorMat, floorTex);

    this.buildStarterCloister();
    this.buildFxPools();

    this.growth = new GrowthField(scene, this.reduced);

    // draw one frame immediately so mount is never blank
    this.renderer.render(this.scene, this.camera);
  }

  // A sparse ring of starter pillars — orientation, not a room. Minute 1 is
  // near-empty ground; the visitor grows the rest.
  private buildStarterCloister(): void {
    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.5, 5.6, 18);
    const baseGeo = new THREE.BoxGeometry(1.25, 0.4, 1.25);
    const capGeo = new THREE.BoxGeometry(1.15, 0.45, 1.15);
    this.disposables.push(pillarGeo, baseGeo, capGeo);
    const stone = new THREE.MeshStandardMaterial({ color: 0xc4bdac, roughness: 0.95, metalness: 0 });
    this.disposables.push(stone);

    const N = 8;
    const R = 9;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const x = Math.cos(ang) * R;
      const z = Math.sin(ang) * R - 2;
      const base = new THREE.Mesh(baseGeo, stone);
      base.position.set(x, 0.2, z);
      base.castShadow = true; base.receiveShadow = true;
      this.scene.add(base);
      const cap = new THREE.Mesh(capGeo, stone);
      cap.position.set(x, 5.85, z);
      cap.castShadow = true;
      this.scene.add(cap);

      const mat = new THREE.MeshStandardMaterial({
        color: BONE, roughness: 0.9, metalness: 0,
        emissive: TEAL.clone(), emissiveIntensity: 0,
      });
      const pillar = new THREE.Mesh(pillarGeo, mat);
      pillar.position.set(x, 3.0, z);
      pillar.castShadow = true; pillar.receiveShadow = true;
      this.scene.add(pillar);
      const degree = mod(i, DORIAN.length);
      this.base.push({ mesh: pillar, mat, freq: degreeFreq(ROOT_PILLAR, degree, 0), bloom: 0, hovered: false });
    }
  }

  private buildFxPools(): void {
    const ringGeo = new THREE.RingGeometry(0.2, 0.34, 40);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: TEAL, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, mat, life: 0 });
      this.disposables.push(mat);
    }
    for (let i = 0; i < 6; i++) {
      const light = new THREE.PointLight(TEAL.getHex(), 0, 16, 2);
      light.visible = false;
      this.scene.add(light);
      this.flashes.push({ light, life: 0 });
    }
  }

  // ── input ──
  setKey(code: string, down: boolean): void {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }
  clearKeys(): void {
    this.keys.clear();
  }
  setPreview(on: boolean): void {
    this.preview = on;
  }
  applyLook(dx: number, dy: number): void {
    this.pendingYaw -= dx;
    this.pendingPitch -= dy;
  }

  get grownCount(): number {
    return this.growth.count;
  }
  get emergingDegree(): number {
    return this.growth.emergingDegree;
  }

  // ── strike ──
  /** Raycast from a normalized device coord; ring the nearest of {base pillar,
   *  grown element, open ground}, then accrete new growth at the hit point. */
  strikeAt(ndcX = 0, ndcY = 0, elapsed = 0): StrikeHit | null {
    this._ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this._ndc, this.camera);

    // base pillars
    const baseHits = this.raycaster.intersectObjects(this.base.map((r) => r.mesh), false);
    const baseHit = baseHits[0];
    // grown geometry
    const grownHit = this.growth.raycast(this.raycaster);
    // open ground
    const groundHits = this.raycaster.intersectObject(this.ground, false);
    const groundHit = groundHits[0];

    // choose the nearest valid hit
    let kind: "base" | "grown" | "ground" | null = null;
    let dist = Infinity;
    if (baseHit && baseHit.distance < dist) { dist = baseHit.distance; kind = "base"; }
    if (grownHit && grownHit.distance < dist) { dist = grownHit.distance; kind = "grown"; }
    if (groundHit && groundHit.distance < dist && groundHit.distance < 60) { dist = groundHit.distance; kind = "ground"; }
    if (!kind) return null;

    let freq = 220;
    let degree = 0;
    const point = new THREE.Vector3();

    if (kind === "base" && baseHit) {
      const res = this.base.find((r) => r.mesh === baseHit.object);
      if (res) {
        res.bloom = 1;
        freq = res.freq;
        degree = DORIAN.findIndex((_, i) => degreeFreq(ROOT_PILLAR, i, 0) === res.freq);
        if (degree < 0) degree = 0;
      }
      point.copy(baseHit.point);
    } else if (kind === "grown" && grownHit) {
      freq = grownHit.freq;
      degree = this.degreeOfFreq(freq);
      point.set(grownHit.x, grownHit.y, grownHit.z);
    } else if (kind === "ground" && groundHit) {
      point.copy(groundHit.point);
      degree = groundDegree(point.x, point.z);
      freq = degreeFreq(ROOT_ARCH, degree, 0);
    }

    this.spawnRing(point);
    this.spawnFlash(point);

    // update playing density from strike cadence
    this.strikeTimes.push(elapsed);
    while (this.strikeTimes.length > 0 && elapsed - this.strikeTimes[0] > 2.6) {
      this.strikeTimes.shift();
    }
    const density = Math.min(1, this.strikeTimes.length / 6);

    // ACCRETE: grow new geometry shaped by pitch + density near this strike
    this.growth.grow({
      x: point.x, z: point.z, degree, freq, density,
      camX: this.camera.position.x, camZ: this.camera.position.z, elapsed,
    });

    return { freq, x: point.x, y: point.y, z: point.z };
  }

  private degreeOfFreq(freq: number): number {
    // recover a Dorian degree from a grown element's frequency (root-agnostic)
    let f = freq;
    while (f > ROOT_PILLAR * 1.95) f /= 2;
    while (f < ROOT_PILLAR * 0.98) f *= 2;
    const ratio = f / ROOT_PILLAR;
    let best = 0;
    let bestErr = Infinity;
    for (let i = 0; i < DORIAN.length; i++) {
      const err = Math.abs(Math.log2(ratio / DORIAN[i]));
      if (err < bestErr) { bestErr = err; best = i; }
    }
    return best;
  }

  private spawnRing(point: THREE.Vector3): void {
    const slot = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    slot.life = 1;
    slot.mesh.visible = true;
    slot.mesh.position.copy(point);
    slot.mesh.lookAt(this.camera.position);
    slot.mesh.scale.setScalar(1);
  }
  private spawnFlash(point: THREE.Vector3): void {
    const slot = this.flashes.find((f) => f.life <= 0) ?? this.flashes[0];
    slot.life = 1;
    slot.light.visible = true;
    slot.light.position.copy(point);
    slot.light.intensity = 7;
  }

  // ── per-frame update ──
  update(dt: number, elapsed: number): void {
    const camp = this.camera;

    this.yaw += this.pendingYaw;
    this.pitch += this.pendingPitch;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch));
    camp.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));

    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const accel = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) accel.add(this._fwd);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) accel.sub(this._fwd);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) accel.add(this._right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) accel.sub(this._right);
    if (accel.lengthSq() > 0) {
      accel.normalize().multiplyScalar(2.4);
    } else if (this.preview) {
      this.yaw += Math.sin(elapsed * 0.07) * dt * 0.25;
      this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      accel.copy(this._fwd).multiplyScalar(0.7);
    }
    this.vel.x += (accel.x - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.z += (accel.z - this.vel.z) * Math.min(1, dt * 2.2);
    camp.position.x += this.vel.x * dt;
    camp.position.z += this.vel.z * dt;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobDist += speed * dt;
    const bobAmp = this.reduced ? 0.12 : 1;
    const bobY = Math.sin(this.bobDist * 3.4) * 0.045 * (speed / 2.4) * bobAmp;
    const breath = Math.sin(elapsed * 0.9) * 0.02 * bobAmp;
    camp.position.y = EYE + bobY + breath;
    const roll = Math.sin(this.bobDist * 1.7) * 0.007 * (speed / 2.4) * bobAmp;
    camp.rotateZ(roll);

    this.ground.position.x = Math.round(camp.position.x / TILE) * TILE;
    this.ground.position.z = Math.round(camp.position.z / TILE) * TILE;

    this.sun.target.position.set(camp.position.x, 0, camp.position.z);
    const az = 0.6 + Math.sin(elapsed * 0.012) * 0.5;
    const sunDist = 62;
    this.sun.position.set(
      camp.position.x + Math.cos(az) * sunDist,
      28 + Math.sin(elapsed * 0.02) * 6,
      camp.position.z + Math.sin(az) * sunDist,
    );

    // hover on base pillars from the crosshair
    this._ndc.set(0, 0);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const bh = this.raycaster.intersectObjects(this.base.map((r) => r.mesh), false)[0];
    const newHover = bh ? this.base.find((r) => r.mesh === bh.object) ?? null : null;
    if (newHover !== this.hovered) {
      if (this.hovered) this.hovered.hovered = false;
      if (newHover) newHover.hovered = true;
      this.hovered = newHover;
    }
    for (const r of this.base) {
      if (r.bloom > 0) r.bloom = Math.max(0, r.bloom - dt / 0.7);
      r.mat.emissiveIntensity = r.bloom * 2.2 + (r.hovered ? 0.28 : 0);
      r.mat.color.setHex(BONE);
      if (r.bloom > 0) r.mat.color.lerp(new THREE.Color(0xffffff), r.bloom * 0.5);
    }

    // grow the world (also updates grown-geometry hover from the same ray)
    this.growth.update(dt, elapsed, this.raycaster);

    // fx pools
    for (const ring of this.rings) {
      if (ring.life > 0) {
        ring.life -= dt / 0.9;
        const t = 1 - Math.max(0, ring.life);
        ring.mesh.scale.setScalar(1 + t * 9);
        ring.mesh.lookAt(camp.position);
        ring.mat.opacity = Math.max(0, ring.life) * 0.7;
        if (ring.life <= 0) ring.mesh.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt / 0.6;
        f.light.intensity = Math.max(0, f.life) * 7;
        if (f.life <= 0) f.light.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  getListenerPose(): ListenerPose {
    this.camera.getWorldDirection(this._fwd);
    this._up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const p = this.camera.position;
    return {
      px: p.x, py: p.y, pz: p.z,
      fx: this._fwd.x, fy: this._fwd.y, fz: this._fwd.z,
      ux: this._up.x, uy: this._up.y, uz: this._up.z,
    };
  }

  resize(): void {
    const w = this.mount.clientWidth || window.innerWidth;
    const h = this.mount.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose(): void {
    for (const r of this.base) r.mat.dispose();
    this.growth.dispose();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
