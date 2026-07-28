// ─────────────────────────────────────────────────────────────────────────────
// beat.ts — the dependency-free conducting pipeline for 3416-baton.
//
//   camera frame → motion energy → derivative-threshold ICTUS → PLL beat grid
//   → tempo + tightness + instability.  No MediaPipe, no TensorFlow — every
//   number here is hand-written JS so the piece stays self-contained.
//
//   The one idea that makes camera-conducting feel crisp: we do NOT threshold
//   the raw motion-energy signal (which is smeared and drifts with lighting).
//   We threshold the DERIVATIVE d(energy)/dt against a running mean+k·std, and
//   fire a beat instant (an "ictus") only on a rising edge past a refractory
//   gap.  A conductor's downbeat is an *acceleration* of the hand, so the
//   derivative is where the beat actually lives.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG — all deterministic logic uses this, never Math.random(). */
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

// ── tuning constants (verified headless — see README) ────────────────────────
const MIN_PERIOD = 60 / 180; // fastest tempo (also keeps beat pulse ≤3 Hz)
const MAX_PERIOD = 60 / 50; // slowest tempo
const ALPHA_CONDUCTOR = 0.25; // how fast the tempo estimate tracks the baton
const ALPHA_GRID = 0.08; // ensemble inertia — the grid follows SLOWLY (the stakes)
const PHASE_GAIN = 0.12; // PLL phase-nudge per ictus
const STRAIN_PER_ICTUS = 0.42; // instability added per strained beat
const INSTAB_DECAY = 0.42; // instability shed per second when steady
const IOI_HISTORY = 8; // inter-ictus intervals kept for variance

// ─────────────────────────────────────────────────────────────────────────────
// MotionTracker — global motion energy + horizontal centroid from a downscaled
// frame (80×60 luminance).  The hidden 2D canvas is ONLY a pixel-sampling
// buffer; the visible output is three.js.
// ─────────────────────────────────────────────────────────────────────────────
export class MotionTracker {
  private prev: Float32Array | null = null;
  readonly w: number;
  readonly h: number;

  constructor(w = 80, h = 60) {
    this.w = w;
    this.h = h;
  }

  /** Returns motion energy [0..~1], horizontal centroid [-1..1], peak cell. */
  compute(rgba: Uint8ClampedArray): {
    energy: number;
    centroidX: number;
    peak: number;
  } {
    const n = this.w * this.h;
    const lum = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      // Rec. 601 luma, normalized
      lum[i] =
        (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
    }
    if (!this.prev) {
      this.prev = lum;
      return { energy: 0, centroidX: 0, peak: 0 };
    }
    let sum = 0;
    let peak = 0;
    let cxNum = 0;
    let cxDen = 0;
    for (let y = 0, i = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++, i++) {
        const d = Math.abs(lum[i] - this.prev[i]);
        if (d > 0.06) {
          sum += d;
          if (d > peak) peak = d;
          cxNum += d * x;
          cxDen += d;
        }
      }
    }
    this.prev = lum;
    const energy = sum / n; // mean per-pixel abs diff
    const centroidX = cxDen > 0 ? (cxNum / cxDen / (this.w - 1)) * 2 - 1 : 0;
    return { energy: Math.min(1, energy * 8), centroidX, peak };
  }

  reset() {
    this.prev = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IctusDetector — adaptive threshold on the DERIVATIVE of energy.
// ─────────────────────────────────────────────────────────────────────────────
export class IctusDetector {
  private prevEnergy = 0;
  private prevT = -1;
  private meanD = 0;
  private varD = 1e-4;
  private lastIctus = -10;
  private readonly K = 1.6; // std multiplier
  private readonly ADAPT = 0.05; // EWMA rate for mean/var of derivative
  private readonly REFRACTORY = 0.18; // seconds
  private readonly MIN_ABS = 0.15; // absolute floor so stillness never fires

  /** Feed one frame. Returns true on the frame an ictus fires. */
  detect(energy: number, t: number): boolean {
    if (this.prevT < 0) {
      this.prevT = t;
      this.prevEnergy = energy;
      return false;
    }
    const dt = Math.max(1e-3, t - this.prevT);
    const d = (energy - this.prevEnergy) / dt; // derivative of energy
    this.prevT = t;
    this.prevEnergy = energy;

    const std = Math.sqrt(this.varD);
    const threshold = this.meanD + this.K * std;
    let fired = false;
    if (
      d > threshold &&
      d > this.MIN_ABS &&
      t - this.lastIctus > this.REFRACTORY
    ) {
      this.lastIctus = t;
      fired = true;
    }
    // adapt running mean/var of the derivative
    this.meanD += this.ADAPT * (d - this.meanD);
    const dev = d - this.meanD;
    this.varD += this.ADAPT * (dev * dev - this.varD);
    return fired;
  }

  reset() {
    this.prevEnergy = 0;
    this.prevT = -1;
    this.meanD = 0;
    this.varD = 1e-4;
    this.lastIctus = -10;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BeatEngine — EWMA tempo + phase-locked loop + inertial ensemble grid.
//   The grid is the ensemble's OWN clock; it follows the baton slowly, so a
//   rush or drag opens a gap that shows up as `instability`.
// ─────────────────────────────────────────────────────────────────────────────
export class BeatEngine {
  beatPeriod = 0.5; // conductor tempo estimate (seconds/beat)
  gridPeriod = 0.5; // ensemble tempo (inertial)
  totalBeats = 0; // monotonic-ish beat accumulator (the grid)
  instability = 0; // 0..1 — the fail meter
  tightness = 1; // 0..1 — how even the baton is
  bpm = 120;

  private lastIctus: number | null = null;
  private iois: number[] = [];

  /** Register a beat instant at time t (seconds). */
  onIctus(t: number) {
    if (this.lastIctus != null) {
      const ioi = t - this.lastIctus;
      if (ioi > 0.15 && ioi < 2.0) {
        this.iois.push(ioi);
        if (this.iois.length > IOI_HISTORY) this.iois.shift();

        // conductor tempo (responsive EWMA)
        this.beatPeriod = clamp(
          ALPHA_CONDUCTOR * ioi + (1 - ALPHA_CONDUCTOR) * this.beatPeriod,
          MIN_PERIOD,
          MAX_PERIOD,
        );
        this.bpm = 60 / this.beatPeriod;

        // phase error of the grid relative to this ictus, signed [-0.5,0.5]
        const frac = this.totalBeats - Math.floor(this.totalBeats);
        const e = frac <= 0.5 ? frac : frac - 1;
        this.totalBeats -= PHASE_GAIN * e; // PLL nudge toward the beat

        // ensemble period follows SLOWLY (this is the inertia / the stakes)
        this.gridPeriod = clamp(
          this.gridPeriod + ALPHA_GRID * (this.beatPeriod - this.gridPeriod),
          MIN_PERIOD,
          MAX_PERIOD,
        );

        // strain → instability
        const cv = coeffVar(this.iois);
        const phaseStrain = Math.min(1, Math.abs(e) * 2.2);
        const varStrain = Math.min(1, cv * 2.6);
        const tempoStrain = Math.min(
          1,
          (Math.abs(this.beatPeriod - this.gridPeriod) / this.gridPeriod) * 2.5,
        );
        const strain =
          0.42 * phaseStrain + 0.33 * varStrain + 0.25 * tempoStrain;
        this.instability = clamp(
          this.instability + STRAIN_PER_ICTUS * strain,
          0,
          1,
        );
        this.tightness = clamp(1 - cv * 3, 0, 1);
      }
    }
    this.lastIctus = t;
  }

  /** Advance the grid + relax instability. dt in seconds. */
  step(dt: number) {
    this.totalBeats += dt / this.gridPeriod;
    this.instability = clamp(this.instability - INSTAB_DECAY * dt, 0, 1);
  }

  /** Fractional position within the current bar (0..1), 4 beats to a bar. */
  barPhase(): number {
    const b = this.totalBeats % 4;
    return (b < 0 ? b + 4 : b) / 4;
  }

  /** 1..4 bar counter for the readout. */
  barBeat(): number {
    const b = Math.floor(this.totalBeats) % 4;
    return (b < 0 ? b + 4 : b) + 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AutoConductor — seeded self-demo. Emits a believable ictus stream through the
// SAME onIctus() so the ensemble plays in time with no camera. Every ~21 s it
// deliberately RUSHES for five seconds so a silent reviewer sees instability
// rise, then recede.
// ─────────────────────────────────────────────────────────────────────────────
export class AutoConductor {
  private rng = mulberry32(0x3416);
  private next = -1;
  private cycleStart = -1;

  /** Call every frame with now (seconds). Returns true when an ictus fires. */
  fire(now: number): boolean {
    if (this.next < 0) {
      this.cycleStart = now;
      this.next = now + 0.3;
      return false;
    }
    if (now >= this.next) {
      const phase = (now - this.cycleStart) % 21;
      let period: number;
      let jit: number;
      if (phase < 8) {
        period = 0.5;
        jit = 0.01;
      } else if (phase < 13) {
        const f = (phase - 8) / 5; // 0..1 through the rush
        period = 0.5 - 0.24 * f;
        jit = 0.065;
      } else {
        period = 0.5;
        jit = 0.01;
      }
      this.next = now + period + (this.rng() - 0.5) * 2 * jit;
      return true;
    }
    return false;
  }

  /** True while the auto-conductor is in its deliberate rush window. */
  rushing(now: number): boolean {
    if (this.cycleStart < 0) return false;
    const phase = (now - this.cycleStart) % 21;
    return phase >= 8 && phase < 13;
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

function coeffVar(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
  return Math.sqrt(v) / m;
}
