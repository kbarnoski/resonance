// ─────────────────────────────────────────────────────────────────────────────
// sim.ts — the deterministic traveling-wave engine (the single source of truth).
//
// A lattice of coupled phase oscillators lives in *cortical* coordinates (u,v):
// u = log r (radial), v = angle. A small set of cortical PLANE-WAVE sources sweeps
// across it; under the inverse log-polar warp (r = exp(u)) each cortical plane
// wave reads out as the classic expanding/contracting concentric rings of the
// psychedelic "breathing tunnel". The GPU/CPU lattices are FORCED by these sources
// (a driven Kuramoto model) so their visible wavefronts and the audio front-
// crossing events share one clock — see == hear by construction.
//
// This module owns nothing GPU/DOM/audio: pure math + seeded PRNG, so both the
// WebGPU path and the Canvas2D fallback drive from identical state, and the audio
// events are computed here regardless of which visual backend is live.
//
// SAFETY: the ~5-Hz cortical wave of the research is rendered as a SPATIAL ripple
// (a moving ring), never a full-field luminance flash, and its temporal rate is
// slowed into the theta band (~1–1.8 Hz) — well under the 3-Hz photosensitive
// ceiling. See README.
// ─────────────────────────────────────────────────────────────────────────────

export const TAU = Math.PI * 2;

// Cortical radial extent. r = exp(u); fovea (small r) at U_MIN, periphery at U_MAX.
export const U_MIN = Math.log(0.06);
export const U_MAX = Math.log(1.5);
export const EXP_UMAX = Math.exp(U_MAX);

// GPU lattice (instanced points). GX*GV must stay <= ~250k.
export const GX = 440; // radial cells
export const GV = 280; // angular cells

// CPU fallback lattice (<= ~6k cells).
export const FX = 92;
export const FV = 62;

export const NSRC_MAX = 6;
export const NR = 7; // audio listening rings
export const DURATION = 420; // seconds — the ~7-minute REBUS arc

const FBASE = 150; // Hz, continuous pitch base

/** Deterministic PRNG — no Math.random anywhere in the piece. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface Source {
  k: number; // cortical spatial frequency
  phi: number; // 0 = tunnel rings, ±π/4 = spirals
  amp: number; // current amplitude
  ampTarget: number;
  omega: number; // temporal angular velocity (rad/s), sign = sweep direction
  omegaTarget: number;
  phase: number; // accumulated temporal phase (integral of omega) — shared with GPU
  nextDrift: number; // arc-time of next omega re-roll
}

export interface StrikeEvent {
  freq: number;
  pan: number;
  amp: number;
  bright: number;
}

export interface ArcState {
  drive: number; // 0..1 REBUS entropy envelope
  coupling: number; // K
  forcing: number; // F
  noise: number;
  breath: number;
  vrot: number;
  nSrc: number;
  dir: number; // dominant sweep direction (+1 outward / -1 inward)
}

/** Per-source packed layout the shaders read: (k, phi, amp, phase). */
export type SrcPacked = Float32Array;

export class WaveEngine {
  readonly sources: Source[] = [];
  private rng: () => number;
  private reduced: boolean;
  t = 0; // arc time (seconds)
  private ringU: number[] = [];
  private lastFloor: number[]; // [src*NR + ring]

  constructor(seed: number, reduced: boolean) {
    this.rng = mulberry32(seed);
    this.reduced = reduced;
    for (let j = 0; j < NR; j++) {
      this.ringU.push(U_MIN + ((j + 0.5) / NR) * (U_MAX - U_MIN));
    }
    this.lastFloor = new Array(NSRC_MAX * NR).fill(NaN);
    // Seed source 0 — the single calm cosmic-onset tunnel wave.
    this.sources.push(this.makeSource(0, 0));
  }

  private makeSource(index: number, arcP: number): Source {
    const r = this.rng;
    // Later sources bias toward spirals; source 0 is always a pure tunnel.
    let phi = 0;
    if (index > 0) {
      const pick = r();
      if (pick < 0.4) phi = 0;
      else if (pick < 0.7) phi = Math.PI / 4;
      else if (pick < 0.9) phi = -Math.PI / 4;
      else phi = Math.PI / 6;
    }
    const k = 3.4 + r() * 5.2;
    // temporal rate ~0.85..1.7 Hz -> theta-band, safe as a spatial ripple.
    const mag = TAU * (0.85 + r() * 0.85);
    const sign = index === 0 ? 1 : r() < 0.5 + 0.25 * arcP ? 1 : -1;
    const omega = mag * sign * (this.reduced ? 0.55 : 1);
    return {
      k,
      phi,
      amp: index === 0 ? 1 : 0,
      ampTarget: 1,
      omega,
      omegaTarget: omega,
      phase: r() * TAU,
      nextDrift: this.t + 4 + r() * 5,
    };
  }

  /** The REBUS arc: entropy rises then gently settles; source count grows. */
  arcAt(p: number): { drive: number; nSrc: number; vrot: number } {
    // onset(calm) -> build -> peak(melt) -> settle
    let drive =
      0.28 * smoothstep(0, 0.12, p) +
      0.5 * smoothstep(0.12, 0.68, p) +
      0.16 * smoothstep(0.6, 0.82, p) -
      0.62 * smoothstep(0.86, 1.0, p);
    drive = clamp(drive, 0, 1);
    let nSrc = 1;
    if (p > 0.28) nSrc = 2;
    if (p > 0.52) nSrc = 3;
    if (p > 0.76) nSrc = 4;
    nSrc = Math.min(nSrc, NSRC_MAX);
    const vrot = 0.05 + 0.35 * drive;
    return { drive, nSrc, vrot };
  }

  /** Advance the engine by dt seconds; returns the current arc/render state. */
  step(dt: number): ArcState {
    const cdt = Math.min(0.05, Math.max(0, dt));
    this.t += cdt;
    const p = clamp(this.t / DURATION, 0, 1);
    const { drive, nSrc, vrot } = this.arcAt(p);

    // Spawn sources as the arc opens.
    while (this.sources.length < nSrc) {
      this.sources.push(this.makeSource(this.sources.length, p));
    }

    // Evolve each source: seeded omega random walk (never loops) + amp ramp.
    let dirSum = 0;
    let dirW = 0;
    for (let s = 0; s < this.sources.length; s++) {
      const src = this.sources[s];
      const active = s < nSrc;
      src.ampTarget = active ? 1 : 0;
      src.amp += (src.ampTarget - src.amp) * (1 - Math.exp(-cdt / 1.6));
      if (this.t >= src.nextDrift) {
        const r = this.rng;
        const mag = TAU * (0.8 + r() * 0.95);
        // flips become more likely as entropy rises (attentional wander)
        const flip = r() < 0.12 + 0.35 * drive;
        const sign = flip ? -Math.sign(src.omegaTarget || 1) : Math.sign(src.omegaTarget || 1);
        src.omegaTarget = mag * sign * (this.reduced ? 0.55 : 1);
        src.nextDrift = this.t + (this.reduced ? 7 : 4) + r() * 5;
      }
      src.omega += (src.omegaTarget - src.omega) * (1 - Math.exp(-cdt / 2.5));
      src.phase += src.omega * cdt;
      // keep the accumulator bounded without breaking continuity
      if (src.phase > 1e6 || src.phase < -1e6) src.phase = src.phase % TAU;
      dirSum += Math.sign(src.omega) * src.amp;
      dirW += src.amp;
    }

    const dir = dirW > 0 ? (dirSum >= 0 ? 1 : -1) : 1;
    const rm = this.reduced ? 0.6 : 1;
    return {
      drive,
      coupling: (0.6 + 3.2 * drive) * rm,
      forcing: (5.2 - 3.0 * drive) * rm, // high early (clean rings) -> low late (melt)
      noise: (0.05 + 1.15 * drive) * rm,
      breath: (0.05 + 0.14 * drive) * rm,
      vrot: vrot * rm,
      nSrc,
      dir,
    };
  }

  /** Pack active sources into (k, phi, amp, phase) quads for the shaders. */
  packSources(out: SrcPacked): number {
    let n = 0;
    for (let s = 0; s < this.sources.length && n < NSRC_MAX; s++) {
      const src = this.sources[s];
      if (src.amp < 0.02) continue;
      out[n * 4 + 0] = src.k;
      out[n * 4 + 1] = src.phi;
      out[n * 4 + 2] = src.amp;
      out[n * 4 + 3] = src.phase;
      n++;
    }
    return n;
  }

  /**
   * Detect wavefront crossings at the fixed listening rings — the audible sweep.
   * A front passes ring j the instant its cortical phase crosses a multiple of
   * 2π; that is the same instant the bright ring visibly reaches that radius, so
   * sight and sound fire together. Pan follows the front's screen angle.
   */
  collectStrikes(drive: number): StrikeEvent[] {
    const events: StrikeEvent[] = [];
    for (let s = 0; s < this.sources.length; s++) {
      const src = this.sources[s];
      if (src.amp < 0.08) continue;
      const cphi = Math.cos(src.phi);
      const sphi = Math.sin(src.phi);
      for (let j = 0; j < NR; j++) {
        const uu = this.ringU[j];
        const ph = src.k * cphi * uu + src.phase; // temporal phase at this ring
        const fl = Math.floor(ph / TAU);
        const key = s * NR + j;
        const prev = this.lastFloor[key];
        this.lastFloor[key] = fl;
        if (Number.isNaN(prev) || fl === prev) continue;
        // A front crossed. Locate its screen angle for the pan.
        let pan = 0;
        if (Math.abs(sphi) > 1e-3) {
          const vFront = -(src.k * cphi * uu + src.phase - TAU * fl) / (src.k * sphi);
          pan = clamp(Math.cos(vFront), -1, 1);
        }
        const uunorm = (uu - U_MIN) / (U_MAX - U_MIN);
        // inner (fovea) -> higher; continuous, inharmonic per-source detune.
        const freq = FBASE * Math.pow(2, (1 - uunorm) * 2.35) * (1 + 0.019 * s);
        const bright = 0.35 + 0.65 * src.amp;
        events.push({ freq, pan, amp: src.amp * (0.5 + 0.5 * drive), bright });
      }
    }
    // Prioritise the strongest fronts; cap so the voice pool never floods.
    events.sort((a, b) => b.amp - a.amp);
    return events.slice(0, 5);
  }
}
