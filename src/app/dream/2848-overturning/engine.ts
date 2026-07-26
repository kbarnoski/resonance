// ─────────────────────────────────────────────────────────────────────────────
// 2848-overturning — the dynamical core.
//
// A REAL fast–slow stochastic system: Stommel's (1961) two-box thermohaline
// model in the Marotzke non-dimensional form, integrated with Euler–Maruyama
// and additive seeded noise. The system is genuinely BISTABLE with a
// saddle-node (fold) catastrophe, so it tips and shows hysteresis — the return
// path does not retrace the outward path.
//
//   dx/dt = η1 − x·(1 + |x−y|)          x = ΔT  (temperature contrast)
//   dy/dt = F  − y·(η3 + |x−y|)         y = ΔS  (salinity contrast)
//   q = x − y                            overturning strength (density-driven)
//
// F is the freshwater forcing on the salinity box — the SLOW control we drift
// toward the fold and back. All randomness comes from a mulberry32 stream
// seeded with 0x2848 (no Math.random / Date anywhere).
// ─────────────────────────────────────────────────────────────────────────────

export const ETA1 = 3.0; // thermal forcing (fast, strong restoring)
export const ETA3 = 0.3; // salinity restoring rate (slow box)
export const DT = 0.01; // integration timestep (model time)
export const SIGMA = 0.07; // noise amplitude (additive, Euler–Maruyama)

// Freshwater-forcing arc endpoints. Folds (verified numerically) sit at
// F≈1.0 (off→on, lower fold) and F≈1.245 (on→off, upper fold): the bistable
// window. We drift F from F_LO up past the upper fold, then back down past the
// lower fold — a full hysteresis loop.
export const F_LO = 0.6;
export const F_HI = 1.75;

// Real seconds of the self-playing arc (inside the 9–11 min brief).
export const ARC_SECONDS = 600;
// Model-time units advanced per real second (quasi-static enough for
// hysteresis, slow enough that critical slowing down is audible/visible).
export const MODEL_PER_SEC = 5.0;

export const WINDOW = 300; // rolling-window length for early-warning signals

// ── seeded PRNG ──────────────────────────────────────────────────────────────
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

// Box–Muller Gaussian from a mulberry32 stream, caching the spare deviate.
export function makeGauss(rng: () => number): () => number {
  let spare: number | null = null;
  return function () {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u < 1e-12) u = rng();
    const v = rng();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
}

// ── the reduced 1-D balance function (for the potential landscape) ─────────────
// Zeros of G are the fixed points of the flow; −∫G dq is an effective potential
// whose minima are the stable "on"/"off" states and whose barrier vanishes at
// the fold. Its curvature −G'(q*) is the recovery rate → critical slowing down.
export function gForce(q: number, F: number): number {
  const a = Math.abs(q);
  return ETA1 / (1 + a) - F / (ETA3 + a) - q;
}

function gPrime(q: number, F: number): number {
  const h = 1e-4;
  return (gForce(q + h, F) - gForce(q - h, F)) / (2 * h);
}

// Effective potential U(q;F) = −∫₀^q G dq', sampled for drawing the landscape.
export function potentialCurve(
  F: number,
  qMin: number,
  qMax: number,
  n: number,
): { q: number; u: number }[] {
  const out: { q: number; u: number }[] = [];
  const dq = (qMax - qMin) / (n - 1);
  // integrate from qMin
  let u = 0;
  let prevG = gForce(qMin, F);
  out.push({ q: qMin, u: 0 });
  for (let i = 1; i < n; i++) {
    const q = qMin + i * dq;
    const g = gForce(q, F);
    u += -0.5 * (g + prevG) * dq; // trapezoid of −G
    prevG = g;
    out.push({ q, u });
  }
  return out;
}

// The slow forcing schedule over normalized arc progress p ∈ [0,1]:
// ramp up to F_HI at the midpoint, then back down to F_LO.
export function forcingAt(p: number): number {
  const u = Math.min(1, Math.max(0, p));
  if (u < 0.5) return F_LO + (F_HI - F_LO) * (u / 0.5);
  return F_HI - (F_HI - F_LO) * ((u - 0.5) / 0.5);
}

// ── rolling early-warning statistics ───────────────────────────────────────────
export interface Ews {
  variance: number;
  ac1: number; // lag-1 autocorrelation
}

export function computeEws(win: number[]): Ews {
  const n = win.length;
  if (n < 8) return { variance: 0, ac1: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += win[i];
  mean /= n;
  let vr = 0;
  for (let i = 0; i < n; i++) {
    const d = win[i] - mean;
    vr += d * d;
  }
  vr /= n;
  let cov = 0;
  for (let i = 1; i < n; i++) cov += (win[i - 1] - mean) * (win[i] - mean);
  cov /= n - 1;
  const ac1 = vr > 1e-12 ? cov / vr : 0;
  return { variance: vr, ac1: Math.max(-1, Math.min(1, ac1)) };
}

export interface Snapshot {
  x: number; // ΔT
  y: number; // ΔS
  q: number; // overturning strength
  F: number; // freshwater forcing
  progress: number; // 0..1 through the arc
  variance: number;
  ac1: number;
  resilience: number; // 0..1, ≈ distance to fold (well curvature)
  flicker: number; // 0..1 basin-flickering near the edge
  on: boolean; // in the overturning ("on") basin
  collapsed: boolean; // has crossed into the "off" basin this arc
}

const SADDLE_Q = 0.25; // approximate basin boundary between on (q>~) and off

export class OverturningEngine {
  private x = 1.5;
  private y = 0.4;
  private rng: () => number;
  private gauss: () => number;
  private win: number[] = [];
  private modelTime = 0; // accumulated model time
  private smax = 0.6; // running max well-curvature for resilience scaling
  collapsed = false;

  constructor(seed = 0x2848) {
    this.rng = mulberry32(seed);
    this.gauss = makeGauss(this.rng);
    // burn-in on the "on" state so we open in strong overturning
    const F0 = forcingAt(0);
    for (let i = 0; i < 4000; i++) this.stepOnce(F0);
    this.win.length = 0;
    this.collapsed = false;
  }

  private stepOnce(F: number): void {
    const q = this.x - this.y;
    const aq = Math.abs(q);
    const dx = ETA1 - this.x * (1 + aq);
    const dy = F - this.y * (ETA3 + aq);
    const sdt = Math.sqrt(DT);
    this.x += dx * DT + SIGMA * sdt * this.gauss();
    this.y += dy * DT + SIGMA * sdt * this.gauss();
  }

  // Advance the model by `realSeconds` of arc at MODEL_PER_SEC, sampling q into
  // the rolling window once per call.
  advance(realSeconds: number): void {
    const steps = Math.max(1, Math.round((MODEL_PER_SEC / DT) * realSeconds));
    const p = this.modelTime / (ARC_SECONDS * MODEL_PER_SEC);
    const F = forcingAt(p);
    for (let i = 0; i < steps; i++) this.stepOnce(F);
    this.modelTime += MODEL_PER_SEC * realSeconds;
    const q = this.x - this.y;
    this.win.push(q);
    if (this.win.length > WINDOW) this.win.shift();
    if (q < 0.1) this.collapsed = true;
  }

  get progress(): number {
    return Math.min(1, this.modelTime / (ARC_SECONDS * MODEL_PER_SEC));
  }

  // Deterministically fast-forward the arc (the "Jump ahead" control).
  jump(realSeconds: number): void {
    const chunk = 1 / 30;
    let left = realSeconds;
    while (left > 1e-6) {
      this.advance(Math.min(chunk, left));
      left -= chunk;
    }
  }

  snapshot(): Snapshot {
    const p = this.progress;
    const F = forcingAt(p);
    const q = this.x - this.y;
    const { variance, ac1 } = computeEws(this.win);

    // resilience = local well curvature −G'(q), normalized against its running
    // max. Near the fold the curvature → 0 (critical slowing down).
    const curv = Math.max(0, -gPrime(q, F));
    if (curv > this.smax) this.smax = curv;
    const resilience = Math.max(0, Math.min(1, curv / this.smax));

    // flickering: recent window straddles both basins near the edge.
    let above = 0;
    let below = 0;
    const tail = this.win.slice(-60);
    for (let i = 0; i < tail.length; i++) {
      if (tail[i] > SADDLE_Q + 0.15) above++;
      else if (tail[i] < SADDLE_Q - 0.15) below++;
    }
    const flicker =
      tail.length > 0
        ? (Math.min(above, below) / tail.length) * 2
        : 0;

    return {
      x: this.x,
      y: this.y,
      q,
      F,
      progress: p,
      variance,
      ac1,
      resilience,
      flicker: Math.max(0, Math.min(1, flicker)),
      on: q > SADDLE_Q,
      collapsed: this.collapsed,
    };
  }
}
