// ─────────────────────────────────────────────────────────────────────────────
// 2264-crystal-bloom · scene.ts — the recursive crystalline cathedral (three.js).
//
//   THE ONE QUESTION: what if PLAYING a keyboard grew an ecstatic crystalline
//   cathedral of light — structure PROLIFERATING into being and BUILDING around
//   you, instead of the self dissolving away?
//
//   CORE TECHNIQUE — recursive geometric subdivision / self-similar lattice
//   proliferation. Each played note seeds a "branch": a polyhedral cell near the
//   core that recursively BUDS child cells outward — scaled + rotated copies in a
//   coherent cone around the branch axis. A tap grows 2–3 self-similar levels; a
//   HELD key keeps budding its frontier further out, so sustained/repeated play
//   accretes a growing crystalline architecture radiating from the centre.
//   Chords = several branches budding at once = several simultaneous structures.
//
//   Cells are one InstancedMesh of emissive icosahedra, additively blended, so
//   the more you play the brighter and denser the plenum becomes (colour runs
//   violet → gold → white as recursion deepens — deep structure reads as the
//   over-bright ARRIVAL). Instances are capped and the oldest are recycled.
//
//   Determinism: every random choice draws from a seeded mulberry32 (rng.ts);
//   time comes from the caller's clock. No Math.random / Date.now anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { mulberry32, SEED } from "./rng";

const MAX_CELLS = 4000; // hard cap on instances (recycle oldest when full)
const CORE_RADIUS = 1.6; // where a branch root sits, just off the centre
const BASE_SCALE = 0.62; // gen-0 cell size (world units)
const CHILD_FALLOFF = 0.66; // each generation shrinks by this
const SPREAD = 2.55; // how far a child buds along its direction (× parent scale)
const MAX_FRONTIER = 18; // cap on a branch's growing frontier
const GROW_INTERVAL = 0.3; // seconds between frontier buds while a key is held
const GROW_IN = 0.55; // seconds for a newborn cell to ease up to full size

// Palette anchors (art layer — raw colour is fine here). violet → gold → white.
const HUE_NEAR = new THREE.Color(0.42, 0.2, 0.9); // gen-0 violet
const HUE_MID = new THREE.Color(0.95, 0.72, 0.28); // mid gold
const HUE_FAR = new THREE.Color(1.0, 0.98, 0.95); // deep white arrival

interface Cell {
  active: boolean;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number; // target scale
  spin: number; // idle rotation speed
  spawnT: number;
  gen: number;
}

interface FrontierNode {
  pos: THREE.Vector3;
  scale: number;
  gen: number;
}

interface Branch {
  active: boolean;
  axis: THREE.Vector3;
  tanA: THREE.Vector3;
  tanB: THREE.Vector3;
  frontier: FrontierNode[];
  lastGrow: number;
  budCount: number;
}

export class CrystalScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mesh: THREE.InstancedMesh;
  private geom: THREE.IcosahedronGeometry;
  private mat: THREE.MeshBasicMaterial;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private coreGeom: THREE.SphereGeometry;

  private cells: Cell[] = [];
  private cursor = 0; // ring-buffer write head
  private liveCount = 0;
  private branches = new Map<string, Branch>();
  private spawnCount = 0;
  private rand: () => number;

  // reusable scratch objects (no per-frame allocation)
  private mTmp = new THREE.Matrix4();
  private vTmp = new THREE.Vector3();
  private cTmp = new THREE.Color();
  private qTmp = new THREE.Quaternion();
  private eTmp = new THREE.Euler();

  constructor(canvas: HTMLCanvasElement) {
    this.rand = mulberry32(SEED);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x05030a, 1); // near-black violet, never pure black
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05030a, 0.017);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.camera.position.set(0, 6, 26);

    // Crystalline cells: one instanced, additively-blended emissive icosahedron.
    this.geom = new THREE.IcosahedronGeometry(1, 0);
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: false,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.92,
    });
    this.mesh = new THREE.InstancedMesh(this.geom, this.mat, MAX_CELLS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Pre-fill the pool with dormant (zero-scale) cells + black colour.
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_CELLS; i++) {
      this.cells.push({
        active: false,
        pos: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        scale: 0,
        spin: 0,
        spawnT: 0,
        gen: 0,
      });
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, this.cTmp.setRGB(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.scene.add(this.mesh);

    // A soft luminous core the cathedral grows out of.
    this.coreGeom = new THREE.SphereGeometry(1.1, 24, 16);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5, 0.32, 0.85),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.5,
    });
    this.core = new THREE.Mesh(this.coreGeom, this.coreMat);
    this.scene.add(this.core);
  }

  /** Active-cell fraction in [0,1] — drives audio brightness + UI density. */
  get energy(): number {
    return this.liveCount / MAX_CELLS;
  }

  resize(w: number, h: number): void {
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Seed a branch for a played note. token = key identity (for release). */
  noteOn(token: string, degree: number, tSec: number): void {
    if (this.branches.has(token)) return;
    // Fibonacci-sphere axis so repeated / chorded notes fan out coherently.
    const idx = this.spawnCount++;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - ((idx % 24) / 23) * 2 * 0.85; // bias away from the poles
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = idx * golden + (degree / 9) * Math.PI * 2;
    const axis = new THREE.Vector3(Math.cos(theta) * r, y * 0.7 + (degree / 9 - 0.5) * 0.8, Math.sin(theta) * r).normalize();

    // Two tangents spanning the plane perpendicular to the axis.
    const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const tanA = new THREE.Vector3().crossVectors(axis, up).normalize();
    const tanB = new THREE.Vector3().crossVectors(axis, tanA).normalize();

    const rootPos = axis.clone().multiplyScalar(CORE_RADIUS);
    const branch: Branch = {
      active: true,
      axis,
      tanA,
      tanB,
      frontier: [{ pos: rootPos, scale: BASE_SCALE, gen: 0 }],
      lastGrow: tSec,
      budCount: 2 + Math.floor(this.rand() * 2.99), // 2..4 children per node
    };

    // Root cell + two immediate generations → a tap already reads as a little
    // self-similar crystal cluster (recursive subdivision, 2–3 levels).
    this.addCell(rootPos, BASE_SCALE, 0, tSec);
    this.growBranch(branch, tSec);
    this.growBranch(branch, tSec);
    this.branches.set(token, branch);
  }

  /** Release a note — its structure stops growing but persists as architecture. */
  noteOff(token: string): void {
    const b = this.branches.get(token);
    if (b) b.active = false;
    this.branches.delete(token);
  }

  /** Bud every frontier node outward into scaled/rotated children. */
  private growBranch(branch: Branch, tSec: number): void {
    const next: FrontierNode[] = [];
    for (const node of branch.frontier) {
      const childScale = node.scale * CHILD_FALLOFF;
      if (childScale < 0.05) continue;
      for (let i = 0; i < branch.budCount; i++) {
        // Direction: the branch axis tilted into a coherent cone (not noise).
        const ang = (i / branch.budCount) * Math.PI * 2 + node.gen * 1.1;
        const cone = 0.55 + this.rand() * 0.35;
        const dir = this.vTmp
          .copy(branch.axis)
          .addScaledVector(branch.tanA, Math.cos(ang) * cone)
          .addScaledVector(branch.tanB, Math.sin(ang) * cone)
          .normalize();
        const pos = node.pos
          .clone()
          .addScaledVector(dir, node.scale * SPREAD + childScale * SPREAD * 0.5);
        const gen = node.gen + 1;
        this.addCell(pos, childScale, gen, tSec);
        if (next.length < MAX_FRONTIER) next.push({ pos, scale: childScale, gen });
      }
    }
    branch.frontier = next;
    branch.lastGrow = tSec;
  }

  /** Write a cell into the ring buffer (recycling the oldest when full). */
  private addCell(pos: THREE.Vector3, scale: number, gen: number, tSec: number): void {
    const c = this.cells[this.cursor];
    if (!c.active) this.liveCount++;
    c.active = true;
    c.pos.copy(pos);
    c.scale = scale;
    c.gen = gen;
    c.spawnT = tSec;
    c.spin = (this.rand() - 0.5) * 0.6;
    // Random-ish crystalline orientation, seeded.
    this.eTmp.set(this.rand() * 6.283, this.rand() * 6.283, this.rand() * 6.283);
    c.quat.setFromEuler(this.eTmp);
    this.cursor = (this.cursor + 1) % MAX_CELLS;
  }

  /** Colour for a recursion generation: violet → gold → white. */
  private genColor(gen: number, out: THREE.Color): THREE.Color {
    const t = Math.min(1, gen / 6);
    if (t < 0.5) out.copy(HUE_NEAR).lerp(HUE_MID, t / 0.5);
    else out.copy(HUE_MID).lerp(HUE_FAR, (t - 0.5) / 0.5);
    return out;
  }

  /**
   * Advance + render one frame.
   *  tSec  — the caller's clock (AudioContext time or performance.now/1000).
   *  flick — luminance multiplier in [floor,1] from the shared SafeFlicker.
   *  grow  — whether held branches may keep budding this frame.
   */
  update(tSec: number, flick: number, grow: boolean): void {
    // Keep held branches proliferating outward.
    if (grow) {
      for (const b of this.branches.values()) {
        if (b.active && b.frontier.length > 0 && tSec - b.lastGrow >= GROW_INTERVAL) {
          this.growBranch(b, tSec);
        }
      }
    }

    // Write matrices + colours for the whole pool.
    for (let i = 0; i < MAX_CELLS; i++) {
      const c = this.cells[i];
      if (!c.active) continue;
      const age = tSec - c.spawnT;
      // Grow-in ease (easeOutCubic) then a tiny breathing settle.
      const grown = age >= GROW_IN ? 1 : 1 - Math.pow(1 - age / GROW_IN, 3);
      const breathe = 1 + Math.sin(tSec * 0.8 + c.spawnT * 3.1) * 0.04;
      const s = c.scale * grown * breathe;

      // Slow idle spin around the seeded axis.
      this.qTmp.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.spin * tSec * 0.15);
      this.qTmp.multiply(c.quat);
      this.mTmp.compose(c.pos, this.qTmp, this.vTmp.set(s, s, s));
      this.mesh.setMatrixAt(i, this.mTmp);

      // Emissive brightness: newborn flash decaying to a steady plenum glow.
      const flash = 1 + Math.exp(-age / 0.5) * 1.4;
      const bright = flick * grown * flash;
      this.genColor(c.gen, this.cTmp).multiplyScalar(bright);
      this.mesh.setColorAt(i, this.cTmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // Core pulses with total density → brighter plenum the more you play.
    const dens = this.energy;
    const corePulse = 0.4 + 0.6 * Math.min(1, dens * 6) + Math.sin(tSec * 0.9) * 0.06;
    this.coreMat.opacity = 0.45 * flick * corePulse;
    this.core.scale.setScalar(1 + Math.min(1.8, dens * 10));

    // Slowly orbiting camera — radius/height breathe.
    const ang = tSec * 0.075;
    const rad = 25 + Math.sin(tSec * 0.11) * 3.5;
    this.camera.position.set(
      Math.cos(ang) * rad,
      6 + Math.sin(tSec * 0.17) * 3.5,
      Math.sin(ang) * rad,
    );
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  /** Cancel all growth (used when the safe flicker / kill is engaged). */
  clearBranches(): void {
    this.branches.clear();
  }

  dispose(): void {
    this.branches.clear();
    this.geom.dispose();
    this.mat.dispose();
    this.coreGeom.dispose();
    this.coreMat.dispose();
    this.mesh.dispose();
    this.renderer.dispose();
  }
}

export { MAX_CELLS };
