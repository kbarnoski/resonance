// ── Dream Cathedral · first-person navigable interior (real three.js geometry) ─
// A nave of plaster pillars, arches, hanging chime-slabs and inlaid floor tiles,
// rendered as a real 3D scene-graph you WALK through with WASD + mouselook. The
// colonnade is an infinite treadmill (bays recycle around the camera) so the
// space is endless; the light's azimuth crawls so the long de Chirico shadows
// slowly swing and minute 3 differs from minute 1.
//
// Palette: bone/plaster white, cold fluorescent-teal ambient, long metaphysical
// shadows — flat (no tone-mapping) so it reads like a painting, not a game.
//
// Striking is handled by raycasting from the crosshair; each hit resonator is
// tuned to a just-intonation A-Dorian degree by its world position, so walking
// the nave and striking builds real modal harmony.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// Just-intonation A Dorian (A B C D E F# G) — a real mode with real semitone
// steps, NOT a "no-wrong-notes" pentatonic. Ratios above the octave root.
const DORIAN: ReadonlyArray<number> = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5];
const ROOT_PILLAR = 110; // A2
const ROOT_TILE = 220; // A3
const ROOT_CHIME = 440; // A4

const BAY_DEPTH = 7;
const N_BAYS = 18;
const SPAN = BAY_DEPTH * N_BAYS;
const NAVE_HALF = 3.4; // half-width of the aisle (pillar offset from centre)
const PILLAR_H = 6.2;
const EYE = 1.62;
const TILE = 4; // floor tile period (for seamless recentre)

const BONE = 0xd7d0c0;
const TEAL = new THREE.Color(0x63e6d2);

/** Info returned when the crosshair strikes a resonator. */
export interface StrikeHit {
  freq: number;
  x: number;
  y: number;
  z: number;
}

interface Resonator {
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  freq: number;
  bloom: number; // 0..1 current emissive bloom
  hovered: boolean;
  baseY: number; // for chime swing
  phase: number;
}

interface Bay {
  group: THREE.Group;
  resonators: Resonator[];
  hasChime: boolean;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Assign a just-intonation frequency from a Dorian degree + octave. */
function degFreq(root: number, degree: number, octaveUp: number): number {
  const d = mod(degree, DORIAN.length);
  return root * DORIAN[d] * Math.pow(2, octaveUp);
}

/** A subtle bone tile texture for the plaza floor (drawn to a canvas). */
function makeFloorTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#cbc4b2";
  g.fillRect(0, 0, 256, 256);
  // cold grout lines
  g.strokeStyle = "rgba(70,92,90,0.5)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  // faint plaster mottling
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
  tex.repeat.set(200, 200); // one tile per TILE world-units across a huge plane
  tex.anisotropy = 4;
  return tex;
}

export class CathedralScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private mount: HTMLElement;
  private reduced: boolean;

  private ground: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private bays: Bay[] = [];
  private resonators: Resonator[] = [];

  // shared geometry/materials (disposed once)
  private disposables: { dispose(): void }[] = [];

  // movement state
  private yaw = 0;
  private pitch = 0;
  private pendingYaw = 0;
  private pendingPitch = 0;
  private vel = new THREE.Vector3();
  private keys = new Set<string>();
  private bobDist = 0;
  private preview = true; // self-playing drift before the visitor enters

  // strike fx pools
  private rings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number }[] = [];
  private flashes: { light: THREE.PointLight; life: number }[] = [];

  private raycaster = new THREE.Raycaster();
  private hovered: Resonator | null = null;

  // reusable temporaries (no per-frame allocation)
  private _fwd = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _ndc = new THREE.Vector2();

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.reduced = prefersReducedMotion();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping; // flat, metaphysical, painterly
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const haze = new THREE.Color(0xa9bab7); // pale cold teal-grey
    scene.background = haze;
    scene.fog = new THREE.FogExp2(haze.getHex(), 0.03);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      68,
      (mount.clientWidth || window.innerWidth) / (mount.clientHeight || window.innerHeight),
      0.1,
      400,
    );
    camera.position.set(0, EYE, 0);
    this.camera = camera;

    // ── lighting: cold teal fill + one strong low sun for long shadows ──
    const hemi = new THREE.HemisphereLight(0xcdeee8, 0xb6b0a0, 0.55);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0x8fb7b2, 0.25);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xf3f4ef, 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    const s = 46;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    // ── floor (huge plane, recentred by whole tiles for seamless infinity) ──
    const floorTex = makeFloorTexture();
    const floorGeo = new THREE.PlaneGeometry(800, 800);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
    });
    const ground = new THREE.Mesh(floorGeo, floorMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    this.ground = ground;
    this.disposables.push(floorGeo, floorMat, floorTex);

    this.buildBays();
    this.buildFxPools();
  }

  // ── geometry construction ────────────────────────────────────────────────
  private buildBays(): void {
    // Shared geometry across all bays keeps the scene light.
    const pillarGeo = new THREE.CylinderGeometry(0.42, 0.5, PILLAR_H, 20);
    const capitalGeo = new THREE.BoxGeometry(1.25, 0.5, 1.25);
    const baseGeo = new THREE.BoxGeometry(1.35, 0.4, 1.35);
    const archGeo = new THREE.TorusGeometry(NAVE_HALF, 0.34, 12, 24, Math.PI);
    const chimeGeo = new THREE.BoxGeometry(0.5, 2.6, 0.14);
    const tileGeo = new THREE.BoxGeometry(2.4, 0.12, 2.4);
    this.disposables.push(pillarGeo, capitalGeo, baseGeo, archGeo, chimeGeo, tileGeo);

    const plaster = () =>
      new THREE.MeshStandardMaterial({
        color: BONE,
        roughness: 0.9,
        metalness: 0,
        emissive: TEAL.clone(),
        emissiveIntensity: 0,
      });
    const stone = new THREE.MeshStandardMaterial({
      color: 0xc4bdac,
      roughness: 0.95,
      metalness: 0,
    });
    this.disposables.push(stone);

    for (let i = 0; i < N_BAYS; i++) {
      const group = new THREE.Group();
      const z = -i * BAY_DEPTH;
      group.position.z = z;
      const bay: Bay = { group, resonators: [], hasChime: i % 3 === 1 };

      for (const side of [-1, 1] as const) {
        const x = side * NAVE_HALF;
        // base + capital (non-resonant stone)
        const base = new THREE.Mesh(baseGeo, stone);
        base.position.set(x, 0.2, 0);
        base.castShadow = true;
        base.receiveShadow = true;
        group.add(base);
        const capital = new THREE.Mesh(capitalGeo, stone);
        capital.position.set(x, PILLAR_H + 0.25, 0);
        capital.castShadow = true;
        group.add(capital);
        // the pillar shaft — a resonator
        const pmat = plaster();
        const pillar = new THREE.Mesh(pillarGeo, pmat);
        pillar.position.set(x, PILLAR_H / 2 + 0.4, 0);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        group.add(pillar);
        const res: Resonator = {
          mesh: pillar, mat: pmat, freq: 110, bloom: 0, hovered: false,
          baseY: pillar.position.y, phase: 0,
        };
        bay.resonators.push(res);
        this.resonators.push(res);
      }

      // arch spanning the aisle
      const archMat = plaster();
      const arch = new THREE.Mesh(archGeo, archMat);
      // half-torus arc (0..π) already curves upward — spans pillar-top to pillar-top
      arch.position.set(0, PILLAR_H + 0.4, 0);
      arch.castShadow = true;
      group.add(arch);
      const archRes: Resonator = {
        mesh: arch, mat: archMat, freq: 220, bloom: 0, hovered: false,
        baseY: arch.position.y, phase: 0,
      };
      bay.resonators.push(archRes);
      this.resonators.push(archRes);

      // hanging chime-slab (every 3rd bay), swinging in the centre aisle
      if (bay.hasChime) {
        const cmat = plaster();
        const chime = new THREE.Mesh(chimeGeo, cmat);
        chime.position.set(0, PILLAR_H - 1.6, 0);
        chime.castShadow = true;
        group.add(chime);
        const cres: Resonator = {
          mesh: chime, mat: cmat, freq: 440, bloom: 0, hovered: false,
          baseY: chime.position.y, phase: Math.random() * Math.PI * 2,
        };
        bay.resonators.push(cres);
        this.resonators.push(cres);
      }

      // inlaid floor tile — a resonator you can strike underfoot
      const tmat = plaster();
      const tile = new THREE.Mesh(tileGeo, tmat);
      tile.position.set(0, 0.06, BAY_DEPTH / 2);
      tile.receiveShadow = true;
      group.add(tile);
      const tres: Resonator = {
        mesh: tile, mat: tmat, freq: 220, bloom: 0, hovered: false,
        baseY: tile.position.y, phase: 0,
      };
      bay.resonators.push(tres);
      this.resonators.push(tres);

      this.scene.add(group);
      this.bays.push(bay);
      this.tuneBay(bay);
    }
  }

  /** Retune a bay's resonators from its current world Z so the space is
   *  spatially consistent even when you backtrack (or a bay recycles). */
  private tuneBay(bay: Bay): void {
    const bayIndex = Math.round(-bay.group.position.z / BAY_DEPTH);
    // pillars: left = degree d, right = a third up (d+2)
    // arch: octave-up (d+4), tile: mid (d+1), chime: high (d+2)
    let ri = 0;
    // left pillar
    bay.resonators[ri++].freq = degFreq(ROOT_PILLAR, bayIndex, 0);
    // right pillar (index 1)
    bay.resonators[ri++].freq = degFreq(ROOT_PILLAR, bayIndex + 2, 0);
    // arch (index 2)
    bay.resonators[ri++].freq = degFreq(ROOT_TILE, bayIndex + 4, 0);
    if (bay.hasChime) {
      bay.resonators[ri++].freq = degFreq(ROOT_CHIME, bayIndex + 2, 0);
    }
    // tile (last)
    bay.resonators[ri].freq = degFreq(ROOT_TILE, bayIndex + 1, 0);
  }

  private buildFxPools(): void {
    const ringGeo = new THREE.RingGeometry(0.2, 0.34, 40);
    this.disposables.push(ringGeo);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, mat, life: 0 });
      this.disposables.push(mat);
    }
    for (let i = 0; i < 5; i++) {
      const light = new THREE.PointLight(TEAL.getHex(), 0, 14, 2);
      light.visible = false;
      this.scene.add(light);
      this.flashes.push({ light, life: 0 });
    }
  }

  // ── input ──────────────────────────────────────────────────────────────
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

  // ── strike ────────────────────────────────────────────────────────────
  /** Raycast from a normalized device coord (default crosshair centre). */
  strikeAt(ndcX = 0, ndcY = 0): StrikeHit | null {
    this._ndc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const meshes = this.resonators.map((r) => r.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hitMesh = hits[0].object as THREE.Mesh;
    const res = this.resonators.find((r) => r.mesh === hitMesh);
    if (!res) return null;
    res.bloom = 1;
    const p = new THREE.Vector3();
    hitMesh.getWorldPosition(p);
    this.spawnRing(hits[0].point);
    this.spawnFlash(hits[0].point);
    return { freq: res.freq, x: p.x, y: p.y, z: p.z };
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
    slot.light.intensity = 6;
  }

  // ── per-frame update ─────────────────────────────────────────────────
  update(dt: number, elapsed: number): void {
    const camp = this.camera;

    // consume look deltas
    this.yaw += this.pendingYaw;
    this.pitch += this.pendingPitch;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch));
    camp.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));

    // ground-plane forward/right from yaw only (dreamy, no fly)
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // desired velocity from WASD — slow, weightless, with inertia
    const accel = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) accel.add(this._fwd);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) accel.sub(this._fwd);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) accel.add(this._right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) accel.sub(this._right);
    if (accel.lengthSq() > 0) {
      accel.normalize().multiplyScalar(2.4);
    } else if (this.preview) {
      // gentle self-playing walk-through before the visitor enters
      this.yaw += Math.sin(elapsed * 0.07) * dt * 0.3;
      this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      accel.copy(this._fwd).multiplyScalar(0.9);
    }
    // critically-damped-ish approach to target velocity (inertia)
    this.vel.x += (accel.x - this.vel.x) * Math.min(1, dt * 2.2);
    this.vel.z += (accel.z - this.vel.z) * Math.min(1, dt * 2.2);
    camp.position.x += this.vel.x * dt;
    camp.position.z += this.vel.z * dt;

    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobDist += speed * dt;

    // head-bob + idle breathing (respect reduced motion)
    const bobAmp = this.reduced ? 0.12 : 1;
    const bobY = Math.sin(this.bobDist * 3.4) * 0.045 * (speed / 2.4) * bobAmp;
    const breath = Math.sin(elapsed * 0.9) * 0.02 * bobAmp;
    camp.position.y = EYE + bobY + breath;
    // subtle head roll
    const roll = Math.sin(this.bobDist * 1.7) * 0.007 * (speed / 2.4) * bobAmp;
    camp.rotateZ(roll);

    // recentre the floor by whole tiles (seamless infinite plaza)
    this.ground.position.x = Math.round(camp.position.x / TILE) * TILE;
    this.ground.position.z = Math.round(camp.position.z / TILE) * TILE;

    // keep the shadow frustum on the walker
    this.sun.target.position.set(camp.position.x, 0, camp.position.z);
    // slowly swinging azimuth → long shadows crawl (dream reconfiguration)
    const az = 0.6 + Math.sin(elapsed * 0.012) * 0.5;
    const sunDist = 60;
    this.sun.position.set(
      camp.position.x + Math.cos(az) * sunDist,
      26 + Math.sin(elapsed * 0.02) * 6,
      camp.position.z + Math.sin(az) * sunDist,
    );

    // recycle bays around the camera (infinite treadmill, both directions)
    for (const bay of this.bays) {
      const rel = bay.group.position.z - camp.position.z;
      if (rel > SPAN / 2) {
        bay.group.position.z -= SPAN;
        this.tuneBay(bay);
      } else if (rel < -SPAN / 2) {
        bay.group.position.z += SPAN;
        this.tuneBay(bay);
      }
    }

    // hover highlight from the crosshair
    this._ndc.set(0, 0);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.resonators.map((r) => r.mesh),
      false,
    )[0];
    const newHover = hit
      ? this.resonators.find((r) => r.mesh === hit.object) ?? null
      : null;
    if (newHover !== this.hovered) {
      if (this.hovered) this.hovered.hovered = false;
      if (newHover) newHover.hovered = true;
      this.hovered = newHover;
    }

    // resonator visuals: bloom decay + hover glow + chime swing
    for (const r of this.resonators) {
      if (r.bloom > 0) r.bloom = Math.max(0, r.bloom - dt / 0.7);
      const glow = r.bloom * 2.2 + (r.hovered ? 0.28 : 0);
      r.mat.emissiveIntensity = glow;
      // struck surfaces brighten toward white as they bloom
      r.mat.color.setHex(BONE);
      if (r.bloom > 0) {
        r.mat.color.lerp(new THREE.Color(0xffffff), r.bloom * 0.5);
      }
      // chimes drift/swing (only chimes carry a nonzero phase)
      if (r.phase !== 0) {
        r.mesh.rotation.z = Math.sin(elapsed * 0.5 + r.phase) * 0.06 * bobAmp;
      }
    }

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
        f.light.intensity = Math.max(0, f.life) * 6;
        if (f.life <= 0) f.light.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Listener pose for the HRTF audio engine (world position + forward + up). */
  getListenerPose() {
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
    for (const r of this.resonators) r.mat.dispose();
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
