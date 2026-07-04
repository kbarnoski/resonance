import * as THREE from "three";

/*
 * Quantized vortex filaments in a superfluid.
 *
 * Each filament is a closed 3D polyline (a loop) evolved under the
 * Local Induction Approximation (LIA, Da Rios 1906 / Arms-Hama):
 * a point moves along its binormal at a speed proportional to the
 * local curvature. This makes vortex RINGS translate and helical
 * (Kelvin, 1880) waves rotate and propagate along the line — the
 * signature motion of superfluid vorticity (Feynman 1955).
 */

export const R_BOX = 2.0; // world radius (soft boundary sphere)
export const N_PTS = 96; // points per filament loop
export const MAX_FILAMENTS = 6;

export interface Filament {
  active: boolean;
  points: THREE.Vector3[];
  vel: THREE.Vector3[]; // scratch velocity buffer
  hue: number; // 0..1 subtle color variation within the cyan family
  flash: number; // 0..1 transient brightness (reconnection glint)
  age: number; // seconds alive — used to retire the oldest
}

export interface Reconnection {
  pos: THREE.Vector3; // where the strands crossed
  energy: number; // 0..1, from relative approach speed (drives audio pitch)
}

// ── helpers ────────────────────────────────────────────────────────────────

function makeFilament(): Filament {
  const points: THREE.Vector3[] = [];
  const vel: THREE.Vector3[] = [];
  for (let i = 0; i < N_PTS; i++) {
    points.push(new THREE.Vector3());
    vel.push(new THREE.Vector3());
  }
  return { active: false, points, vel, hue: 0, flash: 0, age: 0 };
}

// Two unit vectors perpendicular to `axis` (an orthonormal basis for its plane).
function basisFor(axis: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3): void {
  const a = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  u.copy(a).cross(axis).normalize();
  v.copy(axis).cross(u).normalize();
}

/**
 * Shape a filament as a ring of radius `rad` around `center`, normal `axis`,
 * carrying a Kelvin wave: a helical displacement of mode `m` and amplitude `amp`.
 */
export function seedRing(
  f: Filament,
  center: THREE.Vector3,
  rad: number,
  axis: THREE.Vector3,
  m: number,
  amp: number,
  hue: number,
): void {
  const ax = axis.clone().normalize();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  basisFor(ax, u, v);
  for (let i = 0; i < N_PTS; i++) {
    const th = (i / N_PTS) * Math.PI * 2;
    const p = f.points[i];
    // base circle
    p.copy(center)
      .addScaledVector(u, Math.cos(th) * rad)
      .addScaledVector(v, Math.sin(th) * rad);
    // Kelvin wave: helical wobble — displace along axis + radially
    const wob = amp * Math.sin(m * th);
    p.addScaledVector(ax, wob);
    p.addScaledVector(u, Math.cos(th) * amp * 0.5 * Math.cos(m * th));
    p.addScaledVector(v, Math.sin(th) * amp * 0.5 * Math.cos(m * th));
    f.vel[i].set(0, 0, 0);
  }
  f.active = true;
  f.hue = hue;
  f.flash = 0;
  f.age = 0;
}

// ── simulation ──────────────────────────────────────────────────────────────

export class VortexSim {
  filaments: Filament[] = [];
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private cooldown = 0; // frames until reconnection checks resume for stability
  private frame = 0;

  constructor() {
    for (let i = 0; i < MAX_FILAMENTS; i++) this.filaments.push(makeFilament());
    this.reset();
  }

  reset(): void {
    for (const f of this.filaments) f.active = false;
    // A few interlocked rings so the tangle is alive on mount.
    seedRing(
      this.filaments[0],
      new THREE.Vector3(-0.35, 0.1, 0),
      1.05,
      new THREE.Vector3(0.2, 1, 0.15),
      3,
      0.18,
      0.5,
    );
    seedRing(
      this.filaments[1],
      new THREE.Vector3(0.4, -0.1, 0.1),
      0.95,
      new THREE.Vector3(1, 0.15, 0.4),
      4,
      0.16,
      0.62,
    );
    seedRing(
      this.filaments[2],
      new THREE.Vector3(0, 0.35, -0.3),
      0.8,
      new THREE.Vector3(0.1, 0.3, 1),
      5,
      0.14,
      0.44,
    );
  }

  activeCount(): number {
    let c = 0;
    for (const f of this.filaments) if (f.active) c++;
    return c;
  }

  /** Spawn a fresh ring; retires the oldest filament if all slots are full. */
  spawnRing(center: THREE.Vector3, axis: THREE.Vector3, rad: number, energy: number): void {
    let slot = this.filaments.find((f) => !f.active);
    if (!slot) {
      // reuse the oldest active one
      slot = this.filaments.reduce((a, b) => (a.age >= b.age ? a : b));
    }
    seedRing(slot, center, rad, axis, 3 + Math.floor(energy * 4), 0.12 + energy * 0.12, 0.4 + Math.random() * 0.25);
  }

  /** Kelvin-wave kick: transverse impulse to points near `at`. */
  stirKick(at: THREE.Vector3, dir: THREE.Vector3, strength: number): void {
    const rad = 0.85;
    const r2 = rad * rad;
    const d = dir.clone().normalize();
    for (const f of this.filaments) {
      if (!f.active) continue;
      for (let i = 0; i < N_PTS; i++) {
        const dist2 = f.points[i].distanceToSquared(at);
        if (dist2 < r2) {
          const w = (1 - dist2 / r2) * strength;
          f.vel[i].addScaledVector(d, w);
          f.flash = Math.min(1, f.flash + w * 0.4);
        }
      }
    }
  }

  /** Redistribute points evenly by arc length so the loop doesn't bunch. */
  private resample(f: Filament): void {
    const pts = f.points;
    let total = 0;
    const seg: number[] = new Array(N_PTS);
    for (let i = 0; i < N_PTS; i++) {
      const j = (i + 1) % N_PTS;
      seg[i] = pts[i].distanceTo(pts[j]);
      total += seg[i];
    }
    if (total < 1e-5) return;
    const step = total / N_PTS;
    const out: THREE.Vector3[] = [];
    let segIdx = 0;
    let acc = 0;
    for (let i = 0; i < N_PTS; i++) {
      const target = i * step;
      while (acc + seg[segIdx] < target && segIdx < N_PTS - 1) {
        acc += seg[segIdx];
        segIdx++;
      }
      const local = seg[segIdx] > 1e-6 ? (target - acc) / seg[segIdx] : 0;
      const a = pts[segIdx];
      const b = pts[(segIdx + 1) % N_PTS];
      out.push(new THREE.Vector3().lerpVectors(a, b, local));
    }
    for (let i = 0; i < N_PTS; i++) pts[i].copy(out[i]);
  }

  /**
   * Advance one physics step. Returns the reconnection events fired this step
   * (to be sonified). `dt` is scaled time, `beta` the LIA coefficient.
   */
  step(dt: number, beta: number): Reconnection[] {
    this.frame++;
    const events: Reconnection[] = [];

    for (const f of this.filaments) {
      if (!f.active) continue;
      f.age += dt;
      f.flash *= 0.9;

      // 1. LIA velocities: v = beta * curvature * binormal  (∝ cross(e1,e2))
      for (let i = 0; i < N_PTS; i++) {
        const pPrev = f.points[(i - 1 + N_PTS) % N_PTS];
        const p = f.points[i];
        const pNext = f.points[(i + 1) % N_PTS];
        this.tmpA.subVectors(p, pPrev); // e1
        this.tmpB.subVectors(pNext, p); // e2
        const segLen = 0.5 * (this.tmpA.length() + this.tmpB.length()) + 1e-6;
        this.tmpC.crossVectors(this.tmpA, this.tmpB); // ∝ curvature·binormal·segLen²
        const scale = beta / (segLen * segLen);
        // blend the induced LIA velocity with any accumulated stir impulse
        f.vel[i].addScaledVector(this.tmpC, scale);
      }

      // 2. integrate + damp the injected impulse; soft-reflect at the sphere
      const MAX_V = 3.0;
      for (let i = 0; i < N_PTS; i++) {
        const p = f.points[i];
        const vl = f.vel[i].length();
        if (vl > MAX_V) f.vel[i].multiplyScalar(MAX_V / vl);
        p.addScaledVector(f.vel[i], dt);
        // decay only the non-LIA (stir) part: we rebuild LIA each frame, so
        // scrub the buffer but keep a little momentum for lively Kelvin waves
        f.vel[i].multiplyScalar(0.72);
        const d = p.length();
        if (d > R_BOX) {
          p.multiplyScalar(R_BOX / d);
          // reflect residual velocity inward
          const n = this.tmpA.copy(p).multiplyScalar(1 / R_BOX);
          const vn = f.vel[i].dot(n);
          if (vn > 0) f.vel[i].addScaledVector(n, -1.6 * vn);
        }
      }

      // 3. keep points equidistant
      this.resample(f);
    }

    // 4. reconnection detection (throttled + subsampled for 60fps)
    if (this.cooldown > 0) this.cooldown--;
    if (this.frame % 3 === 0) {
      const dRec = 0.14;
      const dRec2 = dRec * dRec;
      const stride = 2;
      const list = this.filaments.filter((f) => f.active);
      outer: for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const fa = list[a];
          const fb = list[b];
          for (let i = 0; i < N_PTS; i += stride) {
            for (let j = 0; j < N_PTS; j += stride) {
              const pa = fa.points[i];
              const pb = fb.points[j];
              const d2 = pa.distanceToSquared(pb);
              if (d2 < dRec2) {
                // relative approach speed → event energy
                const rel = this.tmpA.subVectors(fa.vel[i], fb.vel[j]).length();
                const energy = Math.max(0.15, Math.min(1, rel * 0.9 + 0.2));
                // 2025 asymmetry law: strands SEPARATE faster than they approach.
                // Push both apart along their separation, harder than they came in.
                const sep = this.tmpB.subVectors(pa, pb);
                if (sep.lengthSq() < 1e-8) sep.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
                sep.normalize();
                const recoil = 0.9 + energy * 0.8;
                fa.vel[i].addScaledVector(sep, recoil);
                fb.vel[j].addScaledVector(sep, -recoil);
                // localized Kelvin-wave kick on both strands around the crossing
                this.localKick(fa, i, sep, energy * 0.6);
                this.localKick(fb, j, sep.clone().multiplyScalar(-1), energy * 0.6);
                fa.flash = 1;
                fb.flash = 1;
                events.push({
                  pos: new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5),
                  energy,
                });
                this.cooldown = 8;
                if (events.length >= 4) break outer; // cap per step
              }
            }
          }
        }
      }
    }

    return events;
  }

  private localKick(f: Filament, i: number, dir: THREE.Vector3, strength: number): void {
    const span = 5;
    for (let k = -span; k <= span; k++) {
      const idx = (i + k + N_PTS) % N_PTS;
      const w = (1 - Math.abs(k) / (span + 1)) * strength;
      f.vel[idx].addScaledVector(dir, w);
    }
  }
}
