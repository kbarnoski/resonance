// ─────────────────────────────────────────────────────────────────────────────
// sim.ts — the deterministic heart of Breath Nimbus.
//
//   Everything here is pure and frame-deterministic: no Math.random, no
//   Date.now, no performance.now. All randomness comes from a fixed-seed
//   mulberry32 PRNG; all time comes from an integer frame counter passed in by
//   the caller. This is what lets the headless morning review render an
//   identical nimbus every run.
//
//   Three pieces:
//     • mulberry32          — seeded PRNG for particle init only.
//     • BreathEstimator     — envelope → normalized breath amplitude, phase,
//                             period (breaths/min) and a coherence score that
//                             rewards slow, steady ~0.1 Hz breathing.
//     • ParticleNimbus      — curl-noise (divergence-free) advection + a
//                             breath-driven radial force that gathers motes to
//                             the core on inhale and disperses them to a
//                             boundless veil on exhale. Coherence tightens the
//                             swarm into a calm phase-locked ring.
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed-seed 32-bit PRNG. Deterministic across builds/runs. */
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

// Physics runs on a fixed timestep so the sim is resolution- and clock-
// independent (matches the deterministic requirement).
const DT = 1 / 60;
const TWO_PI = 6.283185307179586;

// ── Breath phase + coherence ────────────────────────────────────────────────

export interface BreathState {
  /** Slow-smoothed raw envelope, pre-normalization (debug). */
  smoothed: number;
  /** Self-calibrated breath amplitude, 0 (peak exhale) → 1 (peak inhale). */
  amp: number;
  /** Signed gather signal: +1 fully gathered (inhale), −1 fully dispersed. */
  gather: number;
  /** True while the envelope is rising (inhaling). */
  inhaling: boolean;
  /** Estimated breaths per minute (NaN until two peaks seen). */
  bpm: number;
  /** 0..1 — how close breathing is to slow, steady ~6 bpm resonance. */
  coherence: number;
}

/** Turns a running breath envelope (mic RMS or synthetic ghost) into a
 *  normalized amplitude, a phase, a period and a coherence score. */
export class BreathEstimator {
  private smoothed = 0.5;
  private prevAmp = 0.5;
  private lo = 0.4;
  private hi = 0.6;
  private lastPeakFrame = -1;
  private periods: number[] = []; // recent inhale→inhale intervals, in frames
  private wasInhaling = false;
  private cohEma = 0;
  private bpmVal = NaN;

  /** Feed one envelope sample. `frame` is the integer animation frame. */
  update(raw: number, frame: number): BreathState {
    // Slow exponential smoother — breathing is a ~0.1 Hz signal, so we can
    // afford to be aggressive and reject speech/room transients.
    this.smoothed += (raw - this.smoothed) * 0.06;
    const s = this.smoothed;

    // Self-calibrating adaptive envelope: the floor drops instantly to catch
    // the quietest moment and creeps back up; the ceiling rises instantly to
    // catch the loudest and creeps back down. Keeps a minimum gap so a still
    // room never divides by zero.
    if (s < this.lo) this.lo = s;
    else this.lo += (s - this.lo) * 0.0008;
    if (s > this.hi) this.hi = s;
    else this.hi += (s - this.hi) * 0.0008;
    const gap = Math.max(1e-3, this.hi - this.lo);
    const amp = Math.min(1, Math.max(0, (s - this.lo) / gap));

    // Phase: rising envelope = inhale. Detect the inhale peak (rising→falling)
    // to measure breath-to-breath period.
    const inhaling = amp > this.prevAmp + 1e-4 ? true : amp < this.prevAmp - 1e-4 ? false : this.wasInhaling;
    if (this.wasInhaling && !inhaling && amp > 0.55) {
      // Just crested an inhale peak.
      if (this.lastPeakFrame >= 0) {
        const period = frame - this.lastPeakFrame;
        if (period > 30 && period < 60 * 30) {
          this.periods.push(period);
          if (this.periods.length > 6) this.periods.shift();
        }
      }
      this.lastPeakFrame = frame;
    }
    this.wasInhaling = inhaling;
    this.prevAmp = amp;

    // Coherence = closeness of period to the ~10 s resonance target × the
    // steadiness of consecutive breaths (low variance). HeartMath's
    // resonance-frequency breathing sits near 6 breaths/min (≈0.1 Hz).
    let targetCloseness = 0;
    let steadiness = 0;
    if (this.periods.length >= 2) {
      const mean = this.periods.reduce((a, b) => a + b, 0) / this.periods.length;
      const periodSec = mean / 60;
      this.bpmVal = 60 / periodSec;
      const err = (periodSec - 10) / 5; // ±5 s tolerance around the 10 s target
      targetCloseness = Math.exp(-err * err);
      let variance = 0;
      for (const p of this.periods) variance += (p - mean) * (p - mean);
      variance /= this.periods.length;
      const cv = Math.sqrt(variance) / Math.max(1, mean); // coefficient of variation
      steadiness = Math.exp(-cv * 6);
    }
    const cohTarget = targetCloseness * steadiness;
    // Smooth the score so the swarm eases rather than snaps.
    this.cohEma += (cohTarget - this.cohEma) * 0.02;

    return {
      smoothed: s,
      amp,
      gather: amp * 2 - 1,
      inhaling,
      bpm: this.bpmVal,
      coherence: this.cohEma,
    };
  }
}

// ── Curl-noise flow field ────────────────────────────────────────────────────
//
//   We advect motes on a divergence-free field built as the 2D curl of a
//   scalar stream function ψ:  v = (∂ψ/∂y, −∂ψ/∂x).  The curl of any scalar
//   field is divergence-free by construction, so the flow neither compresses
//   nor rarefies the cloud (Bridson et al., "Curl-Noise for Procedural Fluid
//   Flow", SIGGRAPH 2007). Using a small sum of sines for ψ gives an *analytic*
//   gradient — no finite differences — so 60k motes advect cheaply on the CPU.

interface Octave {
  ax: number; ay: number; // spatial frequencies
  px: number; py: number; // phases
  w: number;              // temporal drift rate
  amp: number;            // contribution weight
}

function buildField(rng: () => number, octaves: number): Octave[] {
  const o: Octave[] = [];
  for (let i = 0; i < octaves; i++) {
    const scale = 1.4 + i * 1.6;
    o.push({
      ax: scale * (0.7 + rng() * 0.6),
      ay: scale * (0.7 + rng() * 0.6),
      px: rng() * TWO_PI,
      py: rng() * TWO_PI,
      w: (0.05 + rng() * 0.12) * (i % 2 === 0 ? 1 : -1),
      amp: 1 / (1 + i * 0.9),
    });
  }
  return o;
}

// ── Particle nimbus ───────────────────────────────────────────────────────────

export interface NimbusParams {
  count: number;
  seed: number;
}

export class ParticleNimbus {
  readonly count: number;
  /** Interleaved x,y in a normalized square space (roughly [-1,1]). */
  readonly pos: Float32Array;
  /** Per-particle static seed 0..1 (colour/size variation). Uploaded once. */
  readonly seed: Float32Array;
  private vel: Float32Array;
  private field: Octave[];
  private tSec = 0;

  constructor({ count, seed }: NimbusParams) {
    this.count = count;
    this.pos = new Float32Array(count * 2);
    this.vel = new Float32Array(count * 2);
    this.seed = new Float32Array(count);
    const rng = mulberry32(seed);
    this.field = buildField(rng, 4);
    // Seed motes on a soft disc so the very first frame already reads as a cloud.
    for (let i = 0; i < count; i++) {
      const ang = rng() * TWO_PI;
      const r = Math.sqrt(rng()) * 0.9;
      this.pos[i * 2] = Math.cos(ang) * r;
      this.pos[i * 2 + 1] = Math.sin(ang) * r;
      this.seed[i] = rng();
    }
  }

  /** Stream function partial derivatives at (x,y) — the curl-noise velocity. */
  private flow(x: number, y: number, t: number, out: [number, number]): void {
    let dpdx = 0;
    let dpdy = 0;
    const f = this.field;
    for (let k = 0; k < f.length; k++) {
      const o = f[k];
      // ψ_k = amp · sin(ax·x + px + t·w) · cos(ay·y + py − t·w)
      const sx = o.ax * x + o.px + t * o.w;
      const cy = o.ay * y + o.py - t * o.w;
      const sinSx = Math.sin(sx);
      const cosSx = Math.cos(sx);
      const sinCy = Math.sin(cy);
      const cosCy = Math.cos(cy);
      // ∂ψ/∂x = amp · ax · cos(sx) · cos(cy)
      dpdx += o.amp * o.ax * cosSx * cosCy;
      // ∂ψ/∂y = amp · (−ay) · sin(sx) · sin(cy)
      dpdy += o.amp * -o.ay * sinSx * sinCy;
    }
    // v = curl(ψ) = (∂ψ/∂y, −∂ψ/∂x)
    out[0] = dpdy;
    out[1] = -dpdx;
  }

  /** Advance one fixed step. `breath` drives the radial gather/disperse force;
   *  higher `coherence` calms turbulence and confines the swarm into a ring. */
  step(breath: BreathState, coherence: number): void {
    this.tSec += DT;
    const t = this.tSec;
    const g = breath.gather; // +1 gather (inhale) … −1 disperse (exhale)

    // High coherence => quiet flow + firm confinement (phase-locked cloud).
    // Low coherence  => lively curl turbulence + loose, diffuse field.
    const turb = 0.55 * (1 - 0.75 * coherence);
    const damping = 0.90 - 0.05 * coherence; // calmer breathing settles faster
    // Radial rest-radius the swarm relaxes toward, breathing in and out.
    // Inhale pulls toward a tight gathered core; exhale opens to a wide veil.
    const restR = 0.22 + (1 - (g * 0.5 + 0.5)) * 0.85;
    // Coherent breathing tightens the ring the motes phase-lock onto.
    const ringPull = 0.6 + 1.4 * coherence;

    const pos = this.pos;
    const vel = this.vel;
    const tmp: [number, number] = [0, 0];
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      let x = pos[ix];
      let y = pos[iy];
      const r = Math.hypot(x, y) || 1e-5;
      const nx = x / r;
      const ny = y / r;

      // Curl-noise advection.
      this.flow(x, y, t, tmp);
      let vx = vel[ix] + tmp[0] * turb * DT;
      let vy = vel[iy] + tmp[1] * turb * DT;

      // Breath radial force: gather inward on inhale, push outward on exhale.
      const radialF = g * 2.2;
      vx -= nx * radialF * DT;
      vy -= ny * radialF * DT;

      // Spring toward the breathing rest-radius (this is what forms the calm
      // phase-locked ring when coherence — and thus ringPull — is high).
      const dr = r - restR;
      vx -= nx * dr * ringPull * DT;
      vy -= ny * dr * ringPull * DT;

      // A gentle swirl keeps the gathered core alive rather than a dead point.
      const swirl = 0.5 * (0.4 + 0.6 * coherence);
      vx += -ny * swirl * DT;
      vy += nx * swirl * DT;

      vx *= damping;
      vy *= damping;

      x += vx * DT * 6;
      y += vy * DT * 6;

      // Soft outer boundary so the veil stays on-screen.
      const rr = Math.hypot(x, y);
      const MAXR = 1.35;
      if (rr > MAXR) {
        const k = MAXR / rr;
        x *= k;
        y *= k;
        vx *= 0.4;
        vy *= 0.4;
      }

      pos[ix] = x;
      pos[iy] = y;
      vel[ix] = vx;
      vel[iy] = vy;
    }
  }
}
