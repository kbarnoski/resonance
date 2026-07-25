// ════════════════════════════════════════════════════════════════════════════
//  ORRERY — orbital-resonance engine (pure, no React, no DOM).
//
//  A tiny 2D central-gravity system: N bodies orbit a fixed star. Each body's
//  orbital frequency (mean motion) becomes a musical pitch. When two adjacent
//  orbits drift near a small-integer PERIOD ratio (2:1, 3:2, 4:3 …) a gentle,
//  physically-motivated "resonance capture" force nudges them into an exact
//  lock — the same mechanism that traps real moons into mean-motion resonance
//  (see the Laplace resonance of Io–Europa–Ganymede, 4:2:1). Locked orbits →
//  just intervals → consonance. Swing energy breaks the lock → periods drift →
//  microtonal beating. Pitch is ALWAYS a direct readout of the live dynamics,
//  never snapped to a scale.
// ════════════════════════════════════════════════════════════════════════════

/** Deterministic PRNG — seed everything, never Math.random at module scope. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Central gravitational parameter (sim units). */
const GM = 1.0;
/** Softening² — keeps the central singularity finite and integration stable. */
const SOFT2 = 0.0009;
/** Fixed simulation timestep (sim seconds) — decoupled from frame rate. */
export const SIM_DT = 1 / 240;

/** Small-integer period ratios the system can lock into (inner:outer > 1). */
export interface Ratio {
  p: number;
  q: number;
  value: number;
  name: string;
}
export const TARGET_RATIOS: Ratio[] = [
  { p: 2, q: 1, value: 2 / 1, name: "octave" },
  { p: 3, q: 2, value: 3 / 2, name: "fifth" },
  { p: 4, q: 3, value: 4 / 3, name: "fourth" },
  { p: 5, q: 3, value: 5 / 3, name: "maj sixth" },
  { p: 5, q: 4, value: 5 / 4, name: "maj third" },
  { p: 6, q: 5, value: 6 / 5, name: "min third" },
  { p: 3, q: 1, value: 3 / 1, name: "octave+fifth" },
];

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** live semi-major axis (from vis-viva) — cached each step for readout. */
  a: number;
  /** live mean motion n = sqrt(GM/a³) — the orbital frequency. */
  n: number;
  hue: number;
  /** rolling trail of recent positions (sim coords). */
  trail: number[];
}

/** A detected resonance between two adjacent bodies. */
export interface Lock {
  inner: number; // body index
  outer: number; // body index
  ratio: Ratio;
  /** 0..1 — how deep in the capture basin (1 = perfectly commensurate). */
  strength: number;
}

const TRAIL_LEN = 60;

export class OrreryEngine {
  bodies: Body[] = [];
  locks: Lock[] = [];
  private rng: () => number;
  private acc = 0; // fixed-step accumulator (sim seconds)
  /** energy vector currently injected by swing / pointer / autopilot. */
  private injX = 0;
  private injY = 0;
  private burst = 0;
  /** integrated "temperature" of the system — how far from a clean lock. */
  temperature = 0;

  constructor(seed: number, count = 4) {
    this.rng = mulberry32(seed);
    // Seed a Laplace-like chain: outer→inner semi-major axes chosen so the
    // period ratios START slightly OFF resonance. Capture then audibly pulls
    // them into lock within the first seconds — the piece introduces itself.
    const baseA = [0.5, 0.33, 0.235, 0.15]; // outer → inner
    const hues = [265, 285, 305, 320];
    for (let i = 0; i < count; i++) {
      const jitter = 1 + (this.rng() - 0.5) * 0.12; // seeded detune off-resonance
      const a = (baseA[i % baseA.length] ?? 0.15) * jitter;
      const ang = this.rng() * Math.PI * 2;
      const x = Math.cos(ang) * a;
      const y = Math.sin(ang) * a;
      // near-circular speed, with a little seeded eccentricity
      const vc = Math.sqrt(GM / a);
      const ecc = 1 + (this.rng() - 0.5) * 0.1;
      const vx = -Math.sin(ang) * vc * ecc;
      const vy = Math.cos(ang) * vc * ecc;
      this.bodies.push({
        x,
        y,
        vx,
        vy,
        a,
        n: Math.sqrt(GM / (a * a * a)),
        hue: hues[i % hues.length] ?? 285,
        trail: [],
      });
    }
    this.recompute();
  }

  /** Inject a swing/pointer energy vector (sim accel) + an optional jerk burst. */
  inject(ex: number, ey: number, burst: number) {
    this.injX = ex;
    this.injY = ey;
    this.burst = Math.max(this.burst, burst);
  }

  /** Advance real time; runs an integer number of fixed sim steps. */
  advance(realDt: number) {
    // clamp to avoid spiral-of-death after a tab stall
    this.acc += Math.min(realDt, 0.05);
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 64) {
      this.step(SIM_DT);
      this.acc -= SIM_DT;
      steps++;
    }
    // burst decays regardless of steps
    this.burst *= 0.9;
  }

  private step(dt: number) {
    const b = this.bodies;

    // ── 1. central gravity (semi-implicit Euler, softened) ──
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      const r2 = p.x * p.x + p.y * p.y + SOFT2;
      const inv = 1 / Math.sqrt(r2);
      const f = -GM * inv * inv * inv; // -GM / r³
      let ax = f * p.x;
      let ay = f * p.y;

      // ── swing energy injection: bulk push + seeded turbulent kicks ──
      if (this.injX !== 0 || this.injY !== 0 || this.burst > 0) {
        const kick = this.burst * 2.2;
        ax += this.injX * 0.6 + (this.rng() - 0.5) * kick;
        ay += this.injY * 0.6 + (this.rng() - 0.5) * kick;
      }

      p.vx += ax * dt;
      p.vy += ay * dt;
    }

    // ── 2. mild eccentricity damping (keeps pitches legible when calm) ──
    // Damp only the radial velocity component; leaves the orbit's energy/period
    // largely intact but rounds it toward circular over time.
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      const rlen = Math.hypot(p.x, p.y) || 1e-6;
      const rx = p.x / rlen;
      const ry = p.y / rlen;
      const vr = p.vx * rx + p.vy * ry;
      const damp = 0.6 * dt;
      p.vx -= vr * rx * damp;
      p.vy -= vr * ry * damp;
    }

    // ── 3. integrate positions ──
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    this.recompute();

    // ── 4. resonance capture — the heart of the piece ──
    // For each adjacent pair, if the live period ratio sits inside a target's
    // basin, apply equal-and-opposite tangential accelerations that drive the
    // ratio toward exact commensurability. Prograde push raises a (lowers n),
    // retrograde lowers a (raises n): negative feedback onto the mismatch.
    // Outside every basin: nothing — orbits drift freely (microtonal).
    const order = this.bodies
      .map((_, i) => i)
      .sort((i, j) => this.bodies[j].a - this.bodies[i].a); // outer → inner
    for (let k = 0; k < order.length - 1; k++) {
      const outer = order[k];
      const inner = order[k + 1];
      const po = b[outer];
      const pi = b[inner];
      const ratio = pi.n / po.n; // > 1
      let best: Ratio | null = null;
      let bestDelta = Infinity;
      for (const t of TARGET_RATIOS) {
        const d = ratio - t.value;
        const window = 0.05 * t.value;
        if (Math.abs(d) < window && Math.abs(d) < Math.abs(bestDelta)) {
          best = t;
          bestDelta = d;
        }
      }
      if (best) {
        const window = 0.05 * best.value;
        const depth = 1 - Math.abs(bestDelta) / window; // 0..1
        // gentle: scales with mismatch and basin depth
        const s = bestDelta * 0.9 * (0.4 + 0.6 * depth) * dt;
        this.tangential(pi, +s); // inner prograde → a↑ → n↓  (reduces ratio)
        this.tangential(po, -s); // outer retrograde → a↓ → n↑ (reduces ratio)
      }
    }

    // ── 5. soft containment: keep bodies bound and on-screen ──
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (p.a > 0.62 || p.a < 0.09 || !isFinite(p.a)) {
        // nudge back toward a safe band by scaling speed toward circular
        const rlen = Math.hypot(p.x, p.y) || 1e-6;
        const target = Math.min(0.6, Math.max(0.1, rlen));
        const vc = Math.sqrt(GM / target);
        const vlen = Math.hypot(p.vx, p.vy) || 1e-6;
        const blend = 0.04;
        p.vx = p.vx * (1 - blend) + (p.vx / vlen) * vc * blend;
        p.vy = p.vy * (1 - blend) + (p.vy / vlen) * vc * blend;
      }
    }
  }

  /** Apply a tangential (along-velocity) acceleration of signed magnitude s. */
  private tangential(p: Body, s: number) {
    const vlen = Math.hypot(p.vx, p.vy) || 1e-6;
    p.vx += (p.vx / vlen) * s;
    p.vy += (p.vy / vlen) * s;
  }

  /** Refresh cached a, n, trails and detect current locks. */
  private recompute() {
    let temp = 0;
    for (const p of this.bodies) {
      const r = Math.hypot(p.x, p.y) || 1e-6;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      // vis-viva: 1/a = 2/r - v²/GM
      const invA = 2 / r - v2 / GM;
      const a = invA > 1e-4 ? 1 / invA : 0.62; // unbound guard
      p.a = a;
      p.n = Math.sqrt(GM / (a * a * a));
      p.trail.push(p.x, p.y);
      if (p.trail.length > TRAIL_LEN * 2) p.trail.splice(0, 2);
    }

    // detect locks
    this.locks = [];
    const order = this.bodies
      .map((_, i) => i)
      .sort((i, j) => this.bodies[j].a - this.bodies[i].a);
    for (let k = 0; k < order.length - 1; k++) {
      const outer = order[k];
      const inner = order[k + 1];
      const ratio = this.bodies[inner].n / this.bodies[outer].n;
      let best: Ratio | null = null;
      let bestDelta = Infinity;
      for (const t of TARGET_RATIOS) {
        const d = ratio - t.value;
        const window = 0.05 * t.value;
        if (Math.abs(d) < window && Math.abs(d) < Math.abs(bestDelta)) {
          best = t;
          bestDelta = d;
        }
      }
      if (best) {
        const window = 0.05 * best.value;
        const strength = 1 - Math.abs(bestDelta) / window;
        this.locks.push({ inner, outer, ratio: best, strength });
        temp += 1 - strength;
      } else {
        temp += 1;
      }
    }
    this.temperature = temp / Math.max(1, this.bodies.length - 1);
  }

  /** Audio readout: pitch of each body relative to the outermost (drone). */
  frequencies(baseHz: number): number[] {
    // reference = outermost body (largest a → smallest n) = the tonic bass
    let ref = Infinity;
    for (const p of this.bodies) ref = Math.min(ref, p.n);
    if (!isFinite(ref) || ref <= 0) ref = 1;
    return this.bodies.map((p) => baseHz * (p.n / ref));
  }
}
