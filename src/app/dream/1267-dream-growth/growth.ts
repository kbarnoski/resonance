// ── Dream Growth · the MORPHOGENETIC MEMORY LAYER ───────────────────────────
// This is the cycle-2 deepening: the room GROWS around your playing. Every
// strike accretes a new architectural element (a pillar rises, an arch spans to
// a neighbour, a chime hangs) near where and how you played. Each grown element
// is itself a playable resonator, so the instrument gets richer as you build it.
//
// The growth is SHAPED by how you play:
//   • pitch  → element TYPE and HEIGHT (low/sparse → cavernous pillars; high/
//              dense → a thicket of chimes; the middle → spanning arches),
//   • density (your recent tempo) → clustered-vs-spread placement,
//   • a running histogram of your degrees → biases the tuning of new elements
//     toward your EMERGING MODE, so the space converges on the music you play.
//
// It is a record you can walk: old growth persists (instance pools are capped;
// when full the element FARTHEST from you is gracefully retired to make room),
// so backtracking through earlier structure replays your own performance.
//
// Everything is InstancedMesh (three pools) so a few hundred grown elements stay
// cheap on the GPU. Grow-in is a smooth scale ease from zero — never a pop.

import * as THREE from "three";
import {
  degreeFreq,
  pitchNorm,
  ROOT_PILLAR,
  ROOT_ARCH,
  ROOT_CHIME,
  DORIAN,
} from "./tuning";

export type ElemType = "pillar" | "arch" | "chime";

const CAP: Record<ElemType, number> = { pillar: 150, arch: 90, chime: 160 };
const GROW_IN = 1.15; // seconds for a new element to ease up to full size
const DIE_OUT = 0.9; // seconds for a retired element to shrink away
const MAX_PENDING = 24;

const BONE = new THREE.Color(0xd8d1c1);
const TEAL_HOT = new THREE.Color(0x8ffdea);

/** Parameters describing a single accretion event. */
export interface GrowSeed {
  x: number;
  z: number;
  degree: number; // Dorian degree the visitor just struck
  freq: number; // frequency they just struck (drives shape via pitchNorm)
  density: number; // 0..1 recent playing density (tempo)
  camX: number;
  camZ: number;
  elapsed: number;
}

/** A hit returned when the crosshair strikes grown geometry. */
export interface GrowthHit {
  distance: number;
  freq: number;
  x: number;
  y: number;
  z: number;
}

interface Grown {
  type: ElemType;
  slot: number;
  x: number;
  y: number; // centre height used for the audio/strike point
  z: number;
  rotY: number;
  height: number; // final tall dimension
  radius: number; // final cross dimension (pillar radius / arch half-span)
  freq: number;
  born: number;
  grow: number; // 0..1 grow-in
  bloom: number; // 0..1 struck glow
  hovered: boolean;
  swingPhase: number;
  top?: number; // chimes: ceiling pivot they hang and swing from
  dying: boolean;
}

interface Pool {
  type: ElemType;
  mesh: THREE.InstancedMesh;
  free: number[];
  live: Grown[];
  pending: GrowSeed[];
}

function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

export class GrowthField {
  private scene: THREE.Scene;
  private reduced: boolean;
  private pools: Record<ElemType, Pool>;
  private disposables: { dispose(): void }[] = [];

  // running histogram of struck degrees → the emerging mode
  private histogram = new Float32Array(DORIAN.length);
  private totalGrown = 0;

  // reusable temporaries (no per-frame allocation)
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _pos = new THREE.Vector3();
  private _scale = new THREE.Vector3();
  private _col = new THREE.Color();
  private _up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene, reduced: boolean) {
    this.scene = scene;
    this.reduced = reduced;
    this.pools = {
      pillar: this.makePool("pillar"),
      arch: this.makePool("arch"),
      chime: this.makePool("chime"),
    };
  }

  private makePool(type: ElemType): Pool {
    let geo: THREE.BufferGeometry;
    if (type === "pillar") {
      // unit column: radius ~0.42, height 1, sitting on y=0..1
      geo = new THREE.CylinderGeometry(0.34, 0.42, 1, 16);
      geo.translate(0, 0.5, 0);
    } else if (type === "arch") {
      // unit half-torus arcing over local +Y from -X to +X (foot line on y=0)
      geo = new THREE.TorusGeometry(1, 0.11, 8, 22, Math.PI);
    } else {
      // unit chime slab hanging down from y=0
      geo = new THREE.BoxGeometry(0.42, 1, 0.13);
      geo.translate(0, -0.5, 0);
    }
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, // white base; per-instance colour tints toward bone
      roughness: 0.9,
      metalness: 0,
    });
    const cap = CAP[type];
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    // collapse every slot to zero scale + bone colour up front
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < cap; i++) {
      mesh.setMatrixAt(i, zero);
      mesh.setColorAt(i, BONE);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
    this.disposables.push(geo, mat);
    const free: number[] = [];
    for (let i = cap - 1; i >= 0; i--) free.push(i);
    return { type, mesh, free, live: [], pending: [] };
  }

  get count(): number {
    return this.totalGrown;
  }

  /** The most-played degree so far (index into DORIAN), or -1 if silent. */
  get emergingDegree(): number {
    let best = -1;
    let bestV = 0;
    for (let i = 0; i < this.histogram.length; i++) {
      if (this.histogram[i] > bestV) {
        bestV = this.histogram[i];
        best = i;
      }
    }
    return best;
  }

  /** Accrete one element for a strike: fold the struck degree into the emerging
   *  mode, choose a type/shape from pitch + density, and spawn (or queue). */
  grow(seed: GrowSeed): void {
    // fold the struck degree into the running histogram (with slow decay so the
    // emerging mode tracks the RECENT performance, not just the whole session)
    for (let i = 0; i < this.histogram.length; i++) this.histogram[i] *= 0.985;
    const d = ((Math.round(seed.degree) % DORIAN.length) + DORIAN.length) % DORIAN.length;
    this.histogram[d] += 1;

    const type = this.chooseType(seed);
    const pool = this.pools[type];

    // a slot must be free; if the pool is full, retire the element farthest from
    // the visitor (keep the history you're standing in) and queue this seed
    if (pool.free.length === 0) {
      this.retireFarthest(pool, seed.camX, seed.camZ);
      if (pool.pending.length < MAX_PENDING) pool.pending.push(seed);
      return;
    }
    this.spawn(pool, seed);
  }

  private chooseType(seed: GrowSeed): ElemType {
    const bright = pitchNorm(seed.freq); // 0 low … 1 high
    const dense = seed.density; // 0 sparse … 1 dense
    // low & sparse → cavernous pillars; high & dense → thicket of chimes;
    // the metaphysical middle → spanning arches. A little randomness keeps the
    // colonnade organic rather than mechanical.
    const airy = 0.55 * bright + 0.45 * dense + (Math.random() - 0.5) * 0.16;
    if (airy > 0.62) return "chime";
    if (airy < 0.38) return "pillar";
    return "arch";
  }

  private spawn(pool: Pool, seed: GrowSeed): void {
    const bright = pitchNorm(seed.freq);
    // bias the new element's tuning toward the emerging mode a third of the time
    let degree = Math.round(seed.degree);
    const em = this.emergingDegree;
    if (em >= 0 && Math.random() < 0.34) degree = em;

    // placement: dense playing clusters growth tight around the strike; sparse
    // playing spreads it out into open ground (cavernous vs. crowded)
    const spread = 1.6 + (1 - seed.density) * 6.5;
    const ang = Math.random() * Math.PI * 2;
    const r = spread * (0.55 + Math.random() * 0.7);
    const x = seed.x + Math.cos(ang) * r;
    const z = seed.z + Math.sin(ang) * r;

    const slot = pool.free.pop()!;
    let el: Grown;
    if (pool.type === "pillar") {
      const height = 3.2 + (1 - bright) * 6.2; // low notes → tall columns
      el = {
        type: "pillar", slot, x, y: height * 0.5, z, rotY: 0,
        height, radius: 1, freq: degreeFreq(ROOT_PILLAR, degree, 0),
        born: seed.elapsed, grow: 0, bloom: 0, hovered: false, swingPhase: 0,
        dying: false,
      };
    } else if (pool.type === "chime") {
      const len = 1.3 + (1 - bright) * 2.0;
      const hangTop = 4.4 + bright * 2.4; // brighter → hung higher, denser canopy
      el = {
        type: "chime", slot, x, y: hangTop - len * 0.5, z, rotY: Math.random() * Math.PI,
        height: len, radius: 1, freq: degreeFreq(ROOT_CHIME, degree, 0),
        born: seed.elapsed, grow: 0, bloom: 0, hovered: false,
        swingPhase: Math.random() * Math.PI * 2, top: hangTop, dying: false,
      };
    } else {
      // arch spans from the strike toward the nearest existing foot (pillar or
      // arch); if nothing is near, it becomes a modest freestanding arch
      const near = this.nearestFoot(x, z);
      let rotY = Math.random() * Math.PI;
      let half = 2.0;
      let cx = x;
      let cz = z;
      if (near) {
        const dx = near.x - x;
        const dz = near.z - z;
        const dist = Math.hypot(dx, dz);
        half = Math.min(4.5, Math.max(1.5, dist * 0.5));
        cx = x + dx * 0.5;
        cz = z + dz * 0.5;
        rotY = -Math.atan2(dz, dx);
      }
      const height = 2.4 + (1 - bright) * 3.4;
      el = {
        type: "arch", slot, x: cx, y: height * 0.72, z: cz, rotY,
        height, radius: half, freq: degreeFreq(ROOT_ARCH, degree, 0),
        born: seed.elapsed, grow: 0, bloom: 0, hovered: false, swingPhase: 0,
        dying: false,
      };
    }
    // a strike also blooms the thing it grows
    el.bloom = 1;
    pool.live.push(el);
    this.totalGrown++;
  }

  private nearestFoot(x: number, z: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bestD = 81; // only span to a foot within 9m
    for (const t of ["pillar", "arch"] as const) {
      for (const el of this.pools[t].live) {
        if (el.dying) continue;
        const dd = (el.x - x) ** 2 + (el.z - z) ** 2;
        if (dd > 1 && dd < bestD) {
          bestD = dd;
          best = { x: el.x, z: el.z };
        }
      }
    }
    return best;
  }

  private retireFarthest(pool: Pool, camX: number, camZ: number): void {
    let victim: Grown | null = null;
    let far = -1;
    for (const el of pool.live) {
      if (el.dying) continue;
      const dd = (el.x - camX) ** 2 + (el.z - camZ) ** 2;
      if (dd > far) {
        far = dd;
        victim = el;
      }
    }
    if (victim) victim.dying = true;
  }

  /** Raycast the crosshair against grown geometry; nearest hit or null. */
  raycast(raycaster: THREE.Raycaster): GrowthHit | null {
    let best: GrowthHit | null = null;
    for (const type of ["pillar", "arch", "chime"] as const) {
      const pool = this.pools[type];
      const hits = raycaster.intersectObject(pool.mesh, false);
      for (const h of hits) {
        const id = h.instanceId;
        if (id === undefined) continue;
        const el = pool.live.find((e) => e.slot === id && !e.dying);
        if (!el) continue;
        if (!best || h.distance < best.distance) {
          best = { distance: h.distance, freq: el.freq, x: el.x, y: el.y, z: el.z };
          el.bloom = 1;
        }
        break; // nearest hit on this mesh is first
      }
    }
    return best;
  }

  /** Hover highlight from the crosshair (called each frame with the ray). */
  private applyHover(raycaster: THREE.Raycaster): void {
    for (const type of ["pillar", "arch", "chime"] as const) {
      const pool = this.pools[type];
      let hoverSlot = -1;
      const hits = raycaster.intersectObject(pool.mesh, false);
      for (const h of hits) {
        if (h.instanceId === undefined) continue;
        const el = pool.live.find((e) => e.slot === h.instanceId && !e.dying);
        if (el) {
          hoverSlot = el.slot;
          break;
        }
      }
      for (const el of pool.live) el.hovered = el.slot === hoverSlot;
    }
  }

  update(dt: number, elapsed: number, raycaster: THREE.Raycaster): void {
    this.applyHover(raycaster);
    const swingAmp = this.reduced ? 0.15 : 1;
    for (const type of ["pillar", "arch", "chime"] as const) {
      const pool = this.pools[type];
      const mesh = pool.mesh;
      const survivors: Grown[] = [];
      for (const el of pool.live) {
        // grow-in / die-out envelope
        if (el.dying) {
          el.grow -= dt / DIE_OUT;
          if (el.grow <= 0) {
            // free the slot, collapse it, drain a pending seed if any
            this._m.makeScale(0, 0, 0);
            mesh.setMatrixAt(el.slot, this._m);
            pool.free.push(el.slot);
            this.totalGrown = Math.max(0, this.totalGrown - 1);
            continue;
          }
        } else if (el.grow < 1) {
          el.grow = Math.min(1, el.grow + dt / GROW_IN);
        }
        if (el.bloom > 0) el.bloom = Math.max(0, el.bloom - dt / 0.75);

        const g = easeOut(el.grow);
        this.writeMatrix(el, g, elapsed, swingAmp);
        mesh.setMatrixAt(el.slot, this._m);

        // colour: bone at rest, brightening toward hot teal on bloom / hover
        const lift = Math.min(1, el.bloom * 0.9 + (el.hovered ? 0.22 : 0));
        this._col.copy(BONE).lerp(TEAL_HOT, lift);
        mesh.setColorAt(el.slot, this._col);
        survivors.push(el);
      }
      pool.live = survivors;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      // drain pending spawns into any slots freed this frame
      while (pool.pending.length > 0 && pool.free.length > 0) {
        this.spawn(pool, pool.pending.shift()!);
      }
    }
  }

  private writeMatrix(el: Grown, g: number, elapsed: number, swingAmp: number): void {
    if (el.type === "pillar") {
      this._pos.set(el.x, 0, el.z);
      this._q.setFromAxisAngle(this._up, 0);
      this._scale.set(1, el.height * g, 1);
    } else if (el.type === "chime") {
      const top = el.top ?? el.y + el.height * 0.5;
      const swing = Math.sin(elapsed * 0.6 + el.swingPhase) * 0.09 * swingAmp * g;
      this._pos.set(el.x, top, el.z);
      // rotate about Z for the swing, about Y for slab facing
      const e = new THREE.Euler(0, el.rotY, swing, "YXZ");
      this._q.setFromEuler(e);
      this._scale.set(1, el.height * g, 1);
    } else {
      // arch: half-span in X, height in Y, tube in Z; grows uniformly in
      this._pos.set(el.x, 0.05, el.z);
      this._q.setFromAxisAngle(this._up, el.rotY);
      this._scale.set(el.radius * g, el.height * g, 1 * g + 0.001);
    }
    this._m.compose(this._pos, this._q, this._scale);
  }

  dispose(): void {
    for (const type of ["pillar", "arch", "chime"] as const) {
      this.scene.remove(this.pools[type].mesh);
      this.pools[type].mesh.dispose();
    }
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
  }
}
