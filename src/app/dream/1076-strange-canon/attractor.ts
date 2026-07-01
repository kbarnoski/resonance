// attractor.ts — René Thomas' cyclically-symmetric strange attractor.
//
//   dx/dt = sin(y) − b·x
//   dy/dt = sin(z) − b·y
//   dz/dt = sin(x) − b·z
//
// Integrated with classic RK4 at a fixed dt. The single dissipation constant `b`
// is a bifurcation parameter: outside ~[0.12, 0.21] the system collapses to a
// limit cycle (large b) or wanders toward a fixed point / fills space chaotically
// (small b). We clamp `b` to that safe chaotic band so the trajectory stays a
// living, aperiodic, cyclically-symmetric tangle.
//
// The integrator keeps a rolling ring buffer of recent {x,y,z,t} samples — this
// history buffer IS the score: the audio layer reads it at staggered delays
// (the delayed-reader canon), and the renderer draws it as a glowing trail.

export interface TrajPoint {
  x: number;
  y: number;
  z: number;
  /** Simulated time in seconds at which this sample was integrated. */
  t: number;
}

/** Safe chaotic band for the Thomas dissipation constant. */
export const B_MIN = 0.12;
export const B_MAX = 0.21;

export function clampB(b: number): number {
  return Math.min(B_MAX, Math.max(B_MIN, b));
}

type Vec3 = { x: number; y: number; z: number };

function deriv(s: Vec3, b: number, out: Vec3): void {
  out.x = Math.sin(s.y) - b * s.x;
  out.y = Math.sin(s.z) - b * s.y;
  out.z = Math.sin(s.x) - b * s.z;
}

export class ThomasAttractor {
  private x: number;
  private y: number;
  private z: number;
  private b: number;
  private simTime = 0;
  private readonly dt: number;

  // Ring buffer of history samples.
  private readonly cap: number;
  private buf: Float32Array; // packed [x,y,z,t] * cap
  private head = 0; // index of the next slot to write
  private count = 0; // number of valid samples

  // Scratch vectors reused every RK4 step (no per-step allocation).
  private k1: Vec3 = { x: 0, y: 0, z: 0 };
  private k2: Vec3 = { x: 0, y: 0, z: 0 };
  private k3: Vec3 = { x: 0, y: 0, z: 0 };
  private k4: Vec3 = { x: 0, y: 0, z: 0 };
  private tmp: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(opts?: { b?: number; dt?: number; capacity?: number }) {
    this.b = clampB(opts?.b ?? 0.19);
    this.dt = opts?.dt ?? 0.02;
    this.cap = opts?.capacity ?? 6000;
    this.buf = new Float32Array(this.cap * 4);
    // Slightly off-origin seed so the symmetric system is nudged into motion.
    this.x = 0.1;
    this.y = 0.0;
    this.z = 0.0;
    this.record();
  }

  setB(b: number): void {
    this.b = clampB(b);
  }

  getB(): number {
    return this.b;
  }

  get timeNow(): number {
    return this.simTime;
  }

  private record(): void {
    const i = this.head * 4;
    this.buf[i] = this.x;
    this.buf[i + 1] = this.y;
    this.buf[i + 2] = this.z;
    this.buf[i + 3] = this.simTime;
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) this.count++;
  }

  /** Advance one RK4 step of the fixed dt and append to the history buffer. */
  step(): void {
    const { dt, b } = this;
    const s: Vec3 = { x: this.x, y: this.y, z: this.z };

    deriv(s, b, this.k1);

    this.tmp.x = s.x + (dt / 2) * this.k1.x;
    this.tmp.y = s.y + (dt / 2) * this.k1.y;
    this.tmp.z = s.z + (dt / 2) * this.k1.z;
    deriv(this.tmp, b, this.k2);

    this.tmp.x = s.x + (dt / 2) * this.k2.x;
    this.tmp.y = s.y + (dt / 2) * this.k2.y;
    this.tmp.z = s.z + (dt / 2) * this.k2.z;
    deriv(this.tmp, b, this.k3);

    this.tmp.x = s.x + dt * this.k3.x;
    this.tmp.y = s.y + dt * this.k3.y;
    this.tmp.z = s.z + dt * this.k3.z;
    deriv(this.tmp, b, this.k4);

    this.x += (dt / 6) * (this.k1.x + 2 * this.k2.x + 2 * this.k3.x + this.k4.x);
    this.y += (dt / 6) * (this.k1.y + 2 * this.k2.y + 2 * this.k3.y + this.k4.y);
    this.z += (dt / 6) * (this.k1.z + 2 * this.k2.z + 2 * this.k3.z + this.k4.z);
    this.simTime += dt;
    this.record();
  }

  /** Number of valid samples currently held. */
  get length(): number {
    return this.count;
  }

  /** The most recently integrated point. */
  latest(): TrajPoint {
    const idx = ((this.head - 1 + this.cap) % this.cap) * 4;
    return {
      x: this.buf[idx],
      y: this.buf[idx + 1],
      z: this.buf[idx + 2],
      t: this.buf[idx + 3],
    };
  }

  /**
   * Sample the history at a given simulated time (seconds). Returns the nearest
   * stored point at-or-before `t`, or null if `t` is older than the buffer.
   * This is how the canon reads the SAME line at staggered delays.
   */
  sampleAtTime(t: number): TrajPoint | null {
    if (this.count === 0) return null;
    // Walk backward from head; buffer is time-ordered (monotone increasing t).
    // Oldest valid sample:
    const oldestIdx =
      this.count < this.cap ? 0 : this.head; // logical start
    const oldestT = this.buf[(oldestIdx % this.cap) * 4 + 3];
    if (t < oldestT) return null;
    const newest = this.latest();
    if (t >= newest.t) return newest;

    // Binary-ish scan: since dt is fixed and time increases with index, estimate
    // the offset directly, then correct.
    const approxAgo = newest.t - t;
    const stepsAgo = Math.round(approxAgo / this.dt);
    let logical = this.count - 1 - stepsAgo;
    logical = Math.min(this.count - 1, Math.max(0, logical));

    const readAt = (logicalIdx: number): TrajPoint => {
      const physical =
        this.count < this.cap
          ? logicalIdx
          : (this.head + logicalIdx) % this.cap;
      const p = physical * 4;
      return {
        x: this.buf[p],
        y: this.buf[p + 1],
        z: this.buf[p + 2],
        t: this.buf[p + 3],
      };
    };

    let cur = readAt(logical);
    // Nudge toward the exact time in case dt drift accumulated.
    while (cur.t > t && logical > 0) {
      logical--;
      cur = readAt(logical);
    }
    while (logical < this.count - 1) {
      const next = readAt(logical + 1);
      if (next.t > t) break;
      logical++;
      cur = next;
    }
    return cur;
  }

  /**
   * Copy the trajectory into an interleaved xyz Float32Array for the renderer,
   * ordered oldest → newest. Returns the number of points written.
   */
  copyXYZ(out: Float32Array): number {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const physical =
        this.count < this.cap ? i : (this.head + i) % this.cap;
      const p = physical * 4;
      const o = i * 3;
      out[o] = this.buf[p];
      out[o + 1] = this.buf[p + 1];
      out[o + 2] = this.buf[p + 2];
    }
    return n;
  }

  get capacity(): number {
    return this.cap;
  }
}
