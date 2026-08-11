// clay.ts — the plastic-clay soft body for 10216 · Clay Memory.
//
// THE MODEL: region-based shape-matching (Müller, Heidelberger, Teschner & Gross,
// "Meshless Deformations Based on Shape Matching", SIGGRAPH 2005) with an XPBD-
// flavoured PLASTICITY extension (Macklin et al. 2016). Real clay is plastic: it
// holds the shape you push it into and does NOT spring back. That is the whole
// point of this build, and it is what the solver below encodes.
//
//   • A subdivided icosphere is de-duped into ~642 particles, each with a rest
//     position x0 and a current position x.
//   • Particles are grouped into overlapping cubic CLUSTERS (a coarse grid + a
//     margin) so the body stays continuous.
//   • Per frame, per cluster: current centre of mass cm, rest centre of mass cm0,
//     moment matrix A = Σ (xᵢ − cm)(x0ᵢ − cm0)ᵀ, best-fit rotation R via polar
//     decomposition. The elastic GOAL for a particle is gᵢ = R·(x0ᵢ − cm0) + cm,
//     averaged over every cluster that contains it. A stiffness term pulls x → g.
//   • PLASTICITY (the differentiator): when a particle is pushed past a YIELD
//     threshold, its REST position x0 permanently creeps toward the deformed
//     state (bounded by a max plastic radius). The rest shape itself changes, so
//     the elastic goal moves with it — the dent becomes the new "home". That is
//     the clay's memory. Gentle touches stay elastic; firm kneading reshapes.
//
// Everything is guarded: zero-mass / degenerate clusters fall back to identity
// rotation so the mesh can never NaN.

import * as THREE from "three";

export interface ClayHand {
  active: boolean;
  x: number; // normalized screen 0..1 (already mirrored)
  y: number;
  grab: boolean; // pinch
}

export interface ClayMetrics {
  /** Mean particle speed this frame (drives granular squelch). */
  motion: number;
  /** Accumulated plastic deformation, ~0..1 (drives drone darkening). */
  plastic: number;
  /** Sum of plastic creep applied this frame (a "it took the shape" event). */
  yieldEnergy: number;
  /** Whether any hand is pinching. */
  pinching: boolean;
}

const RADIUS = 1.2;
const DETAIL = 3; // IcosahedronGeometry detail → ~642 unique verts
const GRID = 3; // 3×3×3 = 27 candidate clusters
const CLUSTER_MARGIN = 0.62; // fraction of a cell added on each side → overlap

// Solver tuning.
const DAMPING = 0.9; // velocity retention per frame
const STIFFNESS = 0.55; // elastic pull toward shape-matched goal (0..1)
const YIELD = 0.05; // deviation (world units) beyond which clay yields
const CREEP = 0.28; // fraction of the excess absorbed into rest per frame
const MAX_PLASTIC = 0.95 * RADIUS; // rest can travel at most this far from origin
const MAX_SPEED = 6; // velocity clamp (units/s) — stability guard

// Hand-brush tuning.
const REACH = RADIUS * 1.55; // screen half-span mapped to local XY
const BRUSH = 0.6; // push brush radius (local units)
const PUSH_SPEED = 2.6; // dent speed (units/s at brush centre)
const Z_FLOOR = -RADIUS * 1.05; // deepest a particle may be pushed
const GRAB_RADIUS = 0.55; // pinch neighbourhood (rest-space)
const PEAK_PULL = 0.75 * RADIUS; // how far a pinch pulls a peak past the surface

// ── tiny 3×3 row-major matrix helpers (row-major: [0,1,2 / 3,4,5 / 6,7,8]) ─────
type M3 = number[];

function det3(m: M3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** Inverse of m into out; returns false if singular. */
function inverse3(m: M3, out: M3): boolean {
  const d = det3(m);
  if (!isFinite(d) || Math.abs(d) < 1e-9) return false;
  const id = 1 / d;
  out[0] = (m[4] * m[8] - m[5] * m[7]) * id;
  out[1] = (m[2] * m[7] - m[1] * m[8]) * id;
  out[2] = (m[1] * m[5] - m[2] * m[4]) * id;
  out[3] = (m[5] * m[6] - m[3] * m[8]) * id;
  out[4] = (m[0] * m[8] - m[2] * m[6]) * id;
  out[5] = (m[2] * m[3] - m[0] * m[5]) * id;
  out[6] = (m[3] * m[7] - m[4] * m[6]) * id;
  out[7] = (m[1] * m[6] - m[0] * m[7]) * id;
  out[8] = (m[0] * m[4] - m[1] * m[3]) * id;
  return true;
}

const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Extract the best-fit rotation from A via iterative polar decomposition:
 *  R ← ½(R + R⁻ᵀ). Degenerate / reflecting inputs fall back to identity so the
 *  mesh can never blow up. */
function polarRotation(A: M3): M3 {
  if (Math.abs(det3(A)) < 1e-8) return IDENTITY.slice();
  const R = A.slice();
  const inv: M3 = new Array(9);
  for (let iter = 0; iter < 16; iter++) {
    if (!inverse3(R, inv)) return IDENTITY.slice();
    // R ← ½(R + inv(R)ᵀ)
    let diff = 0;
    const t = [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]];
    for (let k = 0; k < 9; k++) {
      const nv = 0.5 * (R[k] + t[k]);
      diff += Math.abs(nv - R[k]);
      R[k] = nv;
    }
    if (diff < 1e-6) break;
  }
  if (!isFinite(R[0]) || det3(R) < 0) return IDENTITY.slice();
  return R;
}

interface Cluster {
  members: Int32Array;
}

export class ClaySolver {
  readonly geometry: THREE.BufferGeometry;
  private n: number; // particle count
  private x: Float32Array; // current positions (3n)
  private v: Float32Array; // velocities (3n)
  private x0: Float32Array; // MUTABLE rest positions (3n) — the memory
  private x0orig: Float32Array; // pristine rest (for reset)
  private vmap: Int32Array; // geometry vertex → particle index
  private clusters: Cluster[] = [];
  private goal: Float32Array; // scratch goals (3n)
  private weight: Float32Array; // cluster coverage per particle (n)
  private latch: Int32Array = new Int32Array([-1, -1]); // pinch-latched particle per hand
  private prevGrab: boolean[] = [false, false];
  private metrics: ClayMetrics = { motion: 0, plastic: 0, yieldEnergy: 0, pinching: false };

  constructor() {
    const geo = new THREE.IcosahedronGeometry(RADIUS, DETAIL);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const raw = posAttr.array as Float32Array;
    const vCount = posAttr.count;

    // De-dupe coincident vertices into a particle list.
    const keyToIndex = new Map<string, number>();
    const px: number[] = [];
    const vmap = new Int32Array(vCount);
    for (let j = 0; j < vCount; j++) {
      const x = raw[j * 3];
      const y = raw[j * 3 + 1];
      const z = raw[j * 3 + 2];
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let idx = keyToIndex.get(key);
      if (idx === undefined) {
        idx = px.length / 3;
        keyToIndex.set(key, idx);
        px.push(x, y, z);
      }
      vmap[j] = idx;
    }

    this.n = px.length / 3;
    this.geometry = geo;
    this.vmap = vmap;
    this.x = Float32Array.from(px);
    this.x0 = Float32Array.from(px);
    this.x0orig = Float32Array.from(px);
    this.v = new Float32Array(this.n * 3);
    this.goal = new Float32Array(this.n * 3);
    this.weight = new Float32Array(this.n);

    this.buildClusters();
    this.writeGeometry();
  }

  /** Overlapping cubic clusters over the rest bounding box. */
  private buildClusters(): void {
    const cell = (2 * RADIUS) / GRID;
    const half = cell * (0.5 + CLUSTER_MARGIN);
    const clusters: Cluster[] = [];
    for (let gz = 0; gz < GRID; gz++) {
      for (let gy = 0; gy < GRID; gy++) {
        for (let gx = 0; gx < GRID; gx++) {
          const cx = -RADIUS + (gx + 0.5) * cell;
          const cy = -RADIUS + (gy + 0.5) * cell;
          const cz = -RADIUS + (gz + 0.5) * cell;
          const members: number[] = [];
          for (let i = 0; i < this.n; i++) {
            if (
              Math.abs(this.x0orig[i * 3] - cx) <= half &&
              Math.abs(this.x0orig[i * 3 + 1] - cy) <= half &&
              Math.abs(this.x0orig[i * 3 + 2] - cz) <= half
            ) {
              members.push(i);
            }
          }
          if (members.length >= 4) clusters.push({ members: Int32Array.from(members) });
        }
      }
    }
    this.clusters = clusters;
  }

  getMetrics(): ClayMetrics {
    return this.metrics;
  }

  /** Restore the pristine sphere — the only way clay ever heals, because it never
   *  heals on its own. */
  reset(): void {
    this.x.set(this.x0orig);
    this.x0.set(this.x0orig);
    this.v.fill(0);
    this.latch[0] = -1;
    this.latch[1] = -1;
    this.metrics = { motion: 0, plastic: 0, yieldEnergy: 0, pinching: false };
    this.writeGeometry();
  }

  private writeGeometry(): void {
    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const vmap = this.vmap;
    const x = this.x;
    for (let j = 0; j < vmap.length; j++) {
      const p = vmap[j];
      arr[j * 3] = x[p * 3];
      arr[j * 3 + 1] = x[p * 3 + 1];
      arr[j * 3 + 2] = x[p * 3 + 2];
    }
    posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  /** Advance the sim one frame. dt in seconds; hands up to 2. */
  step(dtRaw: number, hands: ClayHand[]): void {
    const n = this.n;
    const x = this.x;
    const v = this.v;
    const x0 = this.x0;
    const dt = Math.min(0.05, Math.max(1 / 240, dtRaw));

    // 0. snapshot for PBD velocity recompute.
    const xPrev = new Float32Array(x); // small (≈1.9k floats), fine per frame

    // 1. inertia (semi-implicit) with damping.
    for (let i = 0; i < n * 3; i++) {
      v[i] *= DAMPING;
      x[i] += v[i] * dt;
    }

    // 2. hand manipulation — moves x directly; plasticity locks it in later.
    let pinching = false;
    for (let hIdx = 0; hIdx < Math.min(2, hands.length); hIdx++) {
      const hand = hands[hIdx];
      if (!hand || !hand.active) {
        this.latch[hIdx] = -1;
        this.prevGrab[hIdx] = false;
        continue;
      }
      const lx = (hand.x - 0.5) * 2 * REACH;
      const ly = (0.5 - hand.y) * 2 * REACH;

      if (hand.grab) {
        pinching = true;
        // rising edge → latch the nearest front-facing particle.
        if (!this.prevGrab[hIdx] || this.latch[hIdx] < 0) {
          let best = -1;
          let bestD = Infinity;
          for (let i = 0; i < n; i++) {
            if (x[i * 3 + 2] < 0) continue; // front hemisphere (+Z faces camera)
            const dx = x[i * 3] - lx;
            const dy = x[i * 3 + 1] - ly;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          this.latch[hIdx] = best;
        }
        const anchor = this.latch[hIdx];
        if (anchor >= 0) {
          const ax = this.x0orig[anchor * 3];
          const ay = this.x0orig[anchor * 3 + 1];
          const az = this.x0orig[anchor * 3 + 2];
          const peakZ = Math.max(RADIUS, az) + PEAK_PULL;
          for (let i = 0; i < n; i++) {
            const rdx = this.x0orig[i * 3] - ax;
            const rdy = this.x0orig[i * 3 + 1] - ay;
            const rdz = this.x0orig[i * 3 + 2] - az;
            const rd = Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
            if (rd > GRAB_RADIUS) continue;
            const fall = 1 - rd / GRAB_RADIUS;
            const tx = lx * fall + x[i * 3] * (1 - fall);
            const ty = ly * fall + x[i * 3 + 1] * (1 - fall);
            const tz = peakZ * fall + x[i * 3 + 2] * (1 - fall);
            const k = 0.35 * fall;
            x[i * 3] += (tx - x[i * 3]) * k;
            x[i * 3 + 1] += (ty - x[i * 3 + 1]) * k;
            x[i * 3 + 2] += (tz - x[i * 3 + 2]) * k;
          }
        }
      } else {
        // open palm → dent inward along the view axis (−Z).
        this.latch[hIdx] = -1;
        const b2 = BRUSH * BRUSH;
        for (let i = 0; i < n; i++) {
          if (x[i * 3 + 2] < -0.15) continue; // only the front surface dents
          const dx = x[i * 3] - lx;
          const dy = x[i * 3 + 1] - ly;
          const d2 = dx * dx + dy * dy;
          if (d2 > b2) continue;
          const fall = 1 - Math.sqrt(d2) / BRUSH;
          x[i * 3 + 2] -= PUSH_SPEED * dt * fall;
          // gentle knead: gather slightly toward the palm centre.
          x[i * 3] -= dx * 0.04 * fall;
          x[i * 3 + 1] -= dy * 0.04 * fall;
          if (x[i * 3 + 2] < Z_FLOOR) x[i * 3 + 2] = Z_FLOOR;
        }
      }
      this.prevGrab[hIdx] = hand.grab;
    }

    // 3. centres of mass (over current x and current rest x0).
    let cmx = 0,
      cmy = 0,
      cmz = 0,
      c0x = 0,
      c0y = 0,
      c0z = 0;
    for (let i = 0; i < n; i++) {
      cmx += x[i * 3];
      cmy += x[i * 3 + 1];
      cmz += x[i * 3 + 2];
      c0x += x0[i * 3];
      c0y += x0[i * 3 + 1];
      c0z += x0[i * 3 + 2];
    }
    cmx /= n;
    cmy /= n;
    cmz /= n;
    c0x /= n;
    c0y /= n;
    c0z /= n;

    // Global best-fit rotation (used to map plastic creep into the rest frame).
    const Ag = this.momentMatrix(null, cmx, cmy, cmz, c0x, c0y, c0z);
    const Rg = polarRotation(Ag);
    // Rgᵀ for world→rest mapping.
    const RgT: M3 = [Rg[0], Rg[3], Rg[6], Rg[1], Rg[4], Rg[7], Rg[2], Rg[5], Rg[8]];

    // 4. accumulate shape-matched goals from every cluster.
    this.goal.fill(0);
    this.weight.fill(0);
    for (const cl of this.clusters) {
      const m = cl.members;
      const len = m.length;
      // cluster centres of mass.
      let ccx = 0,
        ccy = 0,
        ccz = 0,
        c0cx = 0,
        c0cy = 0,
        c0cz = 0;
      for (let a = 0; a < len; a++) {
        const i = m[a];
        ccx += x[i * 3];
        ccy += x[i * 3 + 1];
        ccz += x[i * 3 + 2];
        c0cx += x0[i * 3];
        c0cy += x0[i * 3 + 1];
        c0cz += x0[i * 3 + 2];
      }
      ccx /= len;
      ccy /= len;
      ccz /= len;
      c0cx /= len;
      c0cy /= len;
      c0cz /= len;
      const A = this.momentMatrix(m, ccx, ccy, ccz, c0cx, c0cy, c0cz);
      const R = polarRotation(A);
      for (let a = 0; a < len; a++) {
        const i = m[a];
        const qx = x0[i * 3] - c0cx;
        const qy = x0[i * 3 + 1] - c0cy;
        const qz = x0[i * 3 + 2] - c0cz;
        const gx = R[0] * qx + R[1] * qy + R[2] * qz + ccx;
        const gy = R[3] * qx + R[4] * qy + R[5] * qz + ccy;
        const gz = R[6] * qx + R[7] * qy + R[8] * qz + ccz;
        this.goal[i * 3] += gx;
        this.goal[i * 3 + 1] += gy;
        this.goal[i * 3 + 2] += gz;
        this.weight[i] += 1;
      }
    }

    // 5. elastic correction + plastic creep.
    let yieldEnergy = 0;
    for (let i = 0; i < n; i++) {
      let gx: number, gy: number, gz: number;
      const w = this.weight[i];
      if (w > 0) {
        gx = this.goal[i * 3] / w;
        gy = this.goal[i * 3 + 1] / w;
        gz = this.goal[i * 3 + 2] / w;
      } else {
        // fallback: global shape match (keeps orphans continuous).
        const qx = x0[i * 3] - c0x;
        const qy = x0[i * 3 + 1] - c0y;
        const qz = x0[i * 3 + 2] - c0z;
        gx = Rg[0] * qx + Rg[1] * qy + Rg[2] * qz + cmx;
        gy = Rg[3] * qx + Rg[4] * qy + Rg[5] * qz + cmy;
        gz = Rg[6] * qx + Rg[7] * qy + Rg[8] * qz + cmz;
      }

      // deviation of the (externally pushed) particle from its elastic goal.
      const dvx = x[i * 3] - gx;
      const dvy = x[i * 3 + 1] - gy;
      const dvz = x[i * 3 + 2] - gz;
      const devMag = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

      // PLASTICITY: past yield, creep the REST position toward where the particle
      // currently is (mapped world→rest via Rgᵀ). The rest shape absorbs the dent.
      if (devMag > YIELD) {
        // measured rest offset = Rgᵀ · (x − cm); target rest = cm0 + that.
        const wx = x[i * 3] - cmx;
        const wy = x[i * 3 + 1] - cmy;
        const wz = x[i * 3 + 2] - cmz;
        const mrx = RgT[0] * wx + RgT[1] * wy + RgT[2] * wz;
        const mry = RgT[3] * wx + RgT[4] * wy + RgT[5] * wz;
        const mrz = RgT[6] * wx + RgT[7] * wy + RgT[8] * wz;
        const trx = c0x + mrx;
        const tryy = c0y + mry;
        const trz = c0z + mrz;
        const f = CREEP * Math.min(1, (devMag - YIELD) / (YIELD * 3));
        let nx = x0[i * 3] + (trx - x0[i * 3]) * f;
        let ny = x0[i * 3 + 1] + (tryy - x0[i * 3 + 1]) * f;
        let nz = x0[i * 3 + 2] + (trz - x0[i * 3 + 2]) * f;
        // bound plastic strain: rest can't drift past MAX_PLASTIC from origin.
        const ox = this.x0orig[i * 3];
        const oy = this.x0orig[i * 3 + 1];
        const oz = this.x0orig[i * 3 + 2];
        const ddx = nx - ox;
        const ddy = ny - oy;
        const ddz = nz - oz;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
        if (dd > MAX_PLASTIC) {
          const s = MAX_PLASTIC / dd;
          nx = ox + ddx * s;
          ny = oy + ddy * s;
          nz = oz + ddz * s;
        }
        yieldEnergy +=
          Math.abs(nx - x0[i * 3]) +
          Math.abs(ny - x0[i * 3 + 1]) +
          Math.abs(nz - x0[i * 3 + 2]);
        x0[i * 3] = nx;
        x0[i * 3 + 1] = ny;
        x0[i * 3 + 2] = nz;
      }

      // elastic pull x → goal (this is the spring that a plastic rest slowly wins).
      x[i * 3] -= dvx * STIFFNESS;
      x[i * 3 + 1] -= dvy * STIFFNESS;
      x[i * 3 + 2] -= dvz * STIFFNESS;
    }

    // 6. PBD velocity recompute + clamp + metrics.
    const invDt = 1 / dt;
    let motion = 0;
    for (let i = 0; i < n; i++) {
      let vx = (x[i * 3] - xPrev[i * 3]) * invDt;
      let vy = (x[i * 3 + 1] - xPrev[i * 3 + 1]) * invDt;
      let vz = (x[i * 3 + 2] - xPrev[i * 3 + 2]) * invDt;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > MAX_SPEED) {
        const s = MAX_SPEED / sp;
        vx *= s;
        vy *= s;
        vz *= s;
      }
      if (!isFinite(vx) || !isFinite(vy) || !isFinite(vz)) {
        vx = vy = vz = 0;
      }
      v[i * 3] = vx;
      v[i * 3 + 1] = vy;
      v[i * 3 + 2] = vz;
      motion += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }

    // plastic magnitude 0..~1 for the drone.
    let plastic = 0;
    for (let i = 0; i < n; i++) {
      const ddx = x0[i * 3] - this.x0orig[i * 3];
      const ddy = x0[i * 3 + 1] - this.x0orig[i * 3 + 1];
      const ddz = x0[i * 3 + 2] - this.x0orig[i * 3 + 2];
      plastic += Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    }
    plastic = plastic / (n * RADIUS);

    this.metrics = {
      motion: motion / (n * 3),
      plastic: Math.min(1, plastic * 2.2),
      yieldEnergy,
      pinching,
    };

    this.writeGeometry();
  }

  /** Moment matrix A = Σ (xᵢ − cm)(x0ᵢ − cm0)ᵀ over members (or all if null). */
  private momentMatrix(
    members: Int32Array | null,
    cmx: number,
    cmy: number,
    cmz: number,
    c0x: number,
    c0y: number,
    c0z: number,
  ): M3 {
    const A: M3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const x = this.x;
    const x0 = this.x0;
    const len = members ? members.length : this.n;
    for (let a = 0; a < len; a++) {
      const i = members ? members[a] : a;
      const px = x[i * 3] - cmx;
      const py = x[i * 3 + 1] - cmy;
      const pz = x[i * 3 + 2] - cmz;
      const qx = x0[i * 3] - c0x;
      const qy = x0[i * 3 + 1] - c0y;
      const qz = x0[i * 3 + 2] - c0z;
      A[0] += px * qx;
      A[1] += px * qy;
      A[2] += px * qz;
      A[3] += py * qx;
      A[4] += py * qy;
      A[5] += py * qz;
      A[6] += pz * qx;
      A[7] += pz * qy;
      A[8] += pz * qz;
    }
    return A;
  }
}
