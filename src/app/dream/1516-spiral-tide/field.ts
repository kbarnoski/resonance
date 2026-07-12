// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the deterministic complex-traveling-wave engine for Spiral Tide.
//
// A closed-form complex wave ψ(u,v,t) lives in cortical (u,v) coordinates and
// genuinely MORPHS through three propagation geometries — PLANAR, CONCENTRIC and
// SPIRAL — the three wave patterns Das/Zabeh/Ermentrout/Jacobs (Nature Comms
// 2026) show distinguish human cognitive states. Under the inverse log-polar
// warp r = exp(u) (Bressloff–Cowan 2001) each reads out as a Klüver form
// constant: drifting stripes, breathing rings, and a real rotating spiral whose
// integer winding number m winds the phase around the origin.
//
// The SAME ψ that lights a screen pixel is evaluated at a handful of fixed
// listening rings to trigger the struck-bell strikes — sight and sound share one
// clock and one location (exact / structural see==hear). No Math.random / Date:
// a mulberry32 PRNG seeded from a constant integer drives the arc; the render
// loop feeds performance.now()-derived dt. Cycle 2 of 1506-theta-tide.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — replayable, unlike Math.random(). */
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

export const SEED = 0x51106b2e;

// Cortical sampling grid — ~60 rings × ~110 spokes ≈ 6600 points.
export const RINGS = 60;
export const SPOKES = 110;
export const U_MIN = -2.6;
export const U_MAX = 1.6;

// Three wave geometries.
export const PLANAR = 0;
export const CONCENTRIC = 1;
export const SPIRAL = 2;

// Spiral winding number (integer — the number of spiral arms). Sign = chirality.
export const WIND_M = 3;

// Full self-evolving arc length (seconds) — non-looping, minute 6 ≠ minute 1.
export const DURATION = 360;

// Fixed listening rings (cortical u). Inner rings = higher bell fundamentals.
export const LISTEN_U = [-1.9, -0.9, 0.0, 0.8, 1.5];

/** A single wavefront-crossing event — the visible front reaching a listening
 *  ring IS this audible strike (shared ψ, shared clock, shared location). */
export interface StrikeEvent {
  freq: number; // continuous inharmonic fundamental (Hz)
  pan: number; // -1..1, the front's on-screen angle (rotates in SPIRAL)
  amp: number; // 0..1 loudness
  bright: number; // 0..1, drives tone length / brightness
}

/** Standard Bayer 8×8 ordered-dither threshold matrix, normalised to (0,1). */
export const BAYER8 = buildBayer8();
function buildBayer8(): Float32Array {
  // Recursive Bayer construction: M_{2n} from M_n.
  const base = [
    [0, 2],
    [3, 1],
  ];
  let m: number[][] = base;
  for (let size = 2; size < 8; size *= 2) {
    const n = size;
    const next: number[][] = [];
    for (let y = 0; y < n * 2; y++) next.push(new Array(n * 2).fill(0));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = m[y][x];
        next[y][x] = 4 * v + 0;
        next[y][x + n] = 4 * v + 2;
        next[y + n][x] = 4 * v + 3;
        next[y + n][x + n] = 4 * v + 1;
      }
    }
    m = next;
  }
  const out = new Float32Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // Map 0..63 to a centred (0,1) range so thresholds bracket brightness.
      out[y * 8 + x] = (m[y][x] + 0.5) / 64;
    }
  }
  return out;
}

/** Live parameter snapshot the renderer reads each frame. */
export interface FieldParams {
  /** Accumulated temporal phase (rad); signed velocity integrated so direction
   *  flips stay position-continuous. */
  tempPhase: number;
  /** Geometry crossfade weights (sum ≈ 1): [planar, concentric, spiral]. */
  w: [number, number, number];
  /** Radial wavenumber in u. */
  k: number;
  /** Signed, smoothly-morphing spiral winding number (chirality × |m|). */
  mEff: number;
  /** Planar plane-wave direction in cortical space (rad). */
  phi: number;
  /** Base hue 0..1 (violet-forward), drifts slowly with state. */
  hue: number;
  /** REBUS-style intensity 0..1 (opens the drone, brightens the field). */
  drive: number;
  /** Smoothed gain-envelope amplitude the audio master also uses; the ordered
   *  dither breathes with THIS value, so the grain is audio-reactive. */
  ditherAmp: number;
  /** +1 / -1 wave direction (also the Shepard glissando direction). */
  dir: number;
  /** Arc progress 0..1. */
  progress: number;
  /** Human label of the dominant geometry. */
  label: string;
}

const STATE_LABEL = ["Planar", "Concentric", "Spiral"];

interface Segment {
  state: number;
  dur: number;
}

/** The deterministic engine. step(dt) advances clocks / arc / weights; the page
 *  reads params() to render and drains collectStrikes() to sound the bells. */
export class SpiralField {
  private rnd: () => number;
  private reduced: boolean;

  t = 0; // arc seconds
  private tempPhase = 0; // integrated temporal phase (signed)
  private omega: number; // rad/s temporal rate (photosensitive-safe, < 3 Hz)
  private k = 3.6;
  private phi = 0;
  private dir = 1; // +1 / -1 wave direction & chirality
  private chir = 1; // spiral handedness (folds into dir at flip time)
  private mEff = WIND_M; // smoothed signed winding number
  private hue = 0.72;
  private drive = 0;
  private ditherAmp = 0.3;
  private swell = 0; // decaying strike-energy bump feeding the dither

  private w: [number, number, number] = [1, 0, 0];
  private wTarget: [number, number, number] = [1, 0, 0];
  private targetState = PLANAR;

  private segments: Segment[];
  private segIdx = 0;
  private segT = 0;

  // Per-listening-ring wavefront counters (integer part of the ring phase).
  private lastN: number[] = [];
  private pending: StrikeEvent[] = [];
  private fBase: number[] = [];

  constructor(seed: number, reduced: boolean) {
    this.rnd = mulberry32(seed);
    this.reduced = reduced;
    this.omega = (reduced ? 0.4 : 1) * 2 * Math.PI * 0.72; // ≈0.72 Hz ring motion
    this.segments = this.buildArc();

    for (let i = 0; i < LISTEN_U.length; i++) {
      this.lastN.push(0);
      // Inner (small u) rings ring higher; continuous, not a musical scale.
      this.fBase.push(150 * Math.pow(2, -LISTEN_U[i] / 1.15));
    }
    this.applyState(this.segments[0].state, true);
  }

  /** Seeded, jittered PLANAR → CONCENTRIC → SPIRAL(peak) → settle timeline. */
  private buildArc(): Segment[] {
    const plan: number[] = [
      PLANAR,
      CONCENTRIC,
      SPIRAL,
      CONCENTRIC,
      SPIRAL, // the melt / peak
      CONCENTRIC,
      PLANAR, // settle
    ];
    const segs: Segment[] = [];
    for (let i = 0; i < plan.length; i++) {
      const base = 42 + this.rnd() * 22; // 42–64 s
      const peak = plan[i] === SPIRAL && i === 4 ? 1.35 : 1;
      segs.push({ state: plan[i], dur: base * peak });
    }
    return segs;
  }

  private applyState(state: number, immediate: boolean) {
    this.targetState = state;
    this.wTarget = [
      state === PLANAR ? 1 : 0,
      state === CONCENTRIC ? 1 : 0,
      state === SPIRAL ? 1 : 0,
    ];
    if (immediate) this.w = [...this.wTarget] as [number, number, number];
  }

  /** Attentional input: Space / click advances the geometry (auto arc continues). */
  advanceState() {
    this.applyState((this.targetState + 1) % 3, false);
  }

  /** Attentional input: ← / → flip spiral chirality + wave direction (and, in the
   *  page, the Shepard glissando direction). Position stays continuous; only the
   *  winding sign morphs across ~0.6 s. */
  flip(sign: number) {
    this.dir = sign >= 0 ? 1 : -1;
    this.chir = this.dir;
  }

  dirValue() {
    return this.dir;
  }

  /** Advance the whole model by dt seconds (dt derived from performance.now()). */
  step(dt: number) {
    const d = Math.min(0.05, Math.max(0, dt)) * (this.reduced ? 0.4 : 1);
    this.t += d;

    // Auto-advance the arc.
    this.segT += d;
    const seg = this.segments[this.segIdx];
    if (seg && this.segT >= seg.dur && this.segIdx < this.segments.length - 1) {
      this.segIdx++;
      this.segT = 0;
      this.applyState(this.segments[this.segIdx].state, false);
    }

    // Smoothly crossfade the geometry weights (two active during a morph).
    const wa = 1 - Math.exp(-d / 1.1);
    for (let i = 0; i < 3; i++) this.w[i] += (this.wTarget[i] - this.w[i]) * wa;

    // Integrate the SIGNED temporal velocity → flips stay position-continuous.
    this.tempPhase += -this.dir * this.omega * d;

    // Morph the signed winding number toward the current chirality.
    const ma = 1 - Math.exp(-d / 0.6);
    this.mEff += (this.chir * WIND_M - this.mEff) * ma;

    // Slow, non-looping evolution of wavenumber, planar angle and hue.
    this.k = 3.0 + 0.9 * Math.sin(this.t * 0.021) + 0.5 * this.w[2];
    this.phi += d * 0.06;
    const hueT = 0.62 * this.w[0] + 0.72 * this.w[1] + 0.83 * this.w[2];
    this.hue += (hueT + 0.03 * Math.sin(this.t * 0.015) - this.hue) * wa;

    // REBUS drive: a rising-then-settling envelope over the arc, lifted at the
    // spiral melt. Peaks around minute 4–5, gentles at the end.
    const p = this.t / DURATION;
    const arcEnv = Math.sin(Math.min(1, p) * Math.PI) ** 0.8; // 0→1→0 bell
    this.drive = Math.min(1, 0.18 + 0.62 * arcEnv + 0.3 * this.w[2]);

    // Strike-energy swell decays; the dither and the audio master both read it.
    this.swell *= Math.exp(-d / 0.9);
    const ampT = 0.28 + 0.42 * this.drive + this.swell;
    this.ditherAmp += (Math.min(1, ampT) - this.ditherAmp) * (1 - Math.exp(-d / 0.35));

    this.detectStrikes();
  }

  /** Detect wavefronts crossing each listening ring and queue the bells. */
  private detectStrikes() {
    const TAU = 2 * Math.PI;
    for (let p = 0; p < LISTEN_U.length; p++) {
      const u = LISTEN_U[p];
      // Ring phase (concentric/spiral timing): k·u + temporal phase.
      const phase = this.k * u + this.tempPhase;
      const n = Math.floor(phase / TAU);
      if (n !== this.lastN[p]) {
        const crossings = Math.min(2, Math.abs(n - this.lastN[p]));
        this.lastN[p] = n;

        // On-screen angle of the brightest point on this ring:
        //   SPIRAL: v* winds and ROTATES as tempPhase advances → pan spins.
        //   CONCENTRIC: whole ring lights at once → centred (pan 0).
        //   PLANAR: biased toward the plane-wave direction φ.
        const vStar = -(this.k * u + this.tempPhase) / this.mEff;
        const spiralPan = Math.cos(vStar);
        const planarPan = 0.55 * Math.cos(this.phi);
        const pan =
          this.w[2] * spiralPan + this.w[1] * 0 + this.w[0] * planarPan;

        // Continuous inharmonic fundamental; spiral shimmer lifts it.
        const freq = this.fBase[p] * (1 + 0.55 * this.w[2]);
        // Planar bells are nearly silent (planar = drone/pad); rings/spiral ring.
        const geomAmp = 0.15 * this.w[0] + 1.0 * this.w[1] + 1.15 * this.w[2];
        const amp = Math.min(1, (0.35 + 0.55 * this.drive) * geomAmp);
        const bright = 0.4 + 0.55 * this.drive;

        if (amp > 0.02) {
          for (let c = 0; c < crossings; c++) {
            this.pending.push({
              freq,
              pan: Math.max(-1, Math.min(1, pan)),
              amp,
              bright,
            });
          }
          this.swell = Math.min(0.5, this.swell + 0.06 * amp);
        }
      }
    }
  }

  /** Drain queued strikes (consumed once per frame by the audio module). */
  collectStrikes(): StrikeEvent[] {
    if (this.pending.length === 0) return [];
    const out = this.pending;
    this.pending = [];
    return out;
  }

  params(): FieldParams {
    return {
      tempPhase: this.tempPhase,
      w: [this.w[0], this.w[1], this.w[2]],
      k: this.k,
      mEff: this.mEff,
      phi: this.phi,
      hue: this.hue,
      drive: this.drive,
      ditherAmp: this.ditherAmp,
      dir: this.dir,
      progress: Math.min(1, this.t / DURATION),
      label: STATE_LABEL[this.targetState],
    };
  }
}
