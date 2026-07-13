// voice.ts — VOICE IN: pitch + energy from the microphone by autocorrelation
// (on getFloatTimeDomainData, NOT FFT), plus a deterministic idle carrier so
// the flame is always morphing and the drone is always singing, mic or no mic.
//
// The mic analyser is never routed to the destination and the drone is never
// routed into the analyser, so the closed loop (voice -> flame -> drone) cannot
// howl. Heavy one-pole smoothing + a noise floor keep it stable even when the
// drone leaks acoustically back into the mic.

import { mulberry32 } from "./flame";

export interface Drive {
  pitch: number; // 0..1 (log-mapped 80..600 Hz)
  energy: number; // 0..1
  reduced: boolean;
}

const F_MIN = 80;
const F_MAX = 600;
const LOG_MIN = Math.log(F_MIN);
const LOG_SPAN = Math.log(F_MAX) - LOG_MIN;

export class Voice {
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;

  // Smoothed live state.
  private pitch = 0.4;
  private energy = 0;

  // Idle carrier: two seeded smooth-noise tracks (pitch, energy). Deterministic.
  private readonly idleRng = mulberry32(0x1576f1a3);
  private readonly pitchNoise = new SmoothNoise(this.idleRng);
  private readonly energyNoise = new SmoothNoise(this.idleRng);

  attachMic(ctx: AudioContext, stream: MediaStream): boolean {
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.0; // we do our own smoothing
      src.connect(an); // NB: analyser is a dead-end, never -> destination
      this.analyser = an;
      this.buf = new Float32Array(an.fftSize);
      this.stream = stream;
      return true;
    } catch {
      return false;
    }
  }

  hasMic(): boolean {
    return this.analyser !== null;
  }

  /** Sample the drive at absolute time `t` seconds. Blends live mic (if any)
   *  with the idle carrier; with no mic the carrier fully drives it. */
  sample(t: number, reduced: boolean): Drive {
    // Idle carrier — a slow deterministic wander so nothing is ever static.
    const carrierRate = reduced ? 0.05 : 0.11;
    const idlePitch = 0.5 + 0.42 * this.pitchNoise.at(t * carrierRate);
    const idleEnergy = 0.28 + 0.24 * (0.5 + 0.5 * this.energyNoise.at(t * carrierRate * 1.7));

    let targetPitch = idlePitch;
    let targetEnergy = idleEnergy;

    if (this.analyser && this.buf) {
      this.analyser.getFloatTimeDomainData(this.buf);
      const rms = computeRMS(this.buf);
      const floor = 0.012; // noise floor: ignore room hum + drone bleed
      if (rms > floor) {
        const f0 = autocorrelate(this.buf, this.analyser.context.sampleRate);
        if (f0 > 0) {
          const p = (Math.log(clamp(f0, F_MIN, F_MAX)) - LOG_MIN) / LOG_SPAN;
          // Voice leads; the idle carrier lingers underneath as a bias.
          targetPitch = 0.85 * p + 0.15 * idlePitch;
        }
        const loud = clamp((rms - floor) * 9, 0, 1);
        targetEnergy = Math.max(idleEnergy * 0.5, loud);
      }
    }

    // One-pole smoothing — the loop stays gentle and never runs away.
    const kp = reduced ? 0.04 : 0.08;
    const ke = 0.09;
    this.pitch += (targetPitch - this.pitch) * kp;
    this.energy += (targetEnergy - this.energy) * ke;

    return {
      pitch: clamp(this.pitch, 0, 1),
      energy: clamp(this.energy, 0, 1),
      reduced,
    };
  }

  stop() {
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    try {
      this.analyser?.disconnect();
    } catch {
      /* already gone */
    }
    this.analyser = null;
    this.buf = null;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function computeRMS(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

/** Autocorrelation pitch detection on the time-domain buffer. Returns Hz, or
 *  0 if no clear period is found. Classic ACF with a parabolic-free peak pick. */
function autocorrelate(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  const minLag = Math.floor(sampleRate / F_MAX);
  const maxLag = Math.floor(sampleRate / F_MIN);

  let bestLag = -1;
  let bestCorr = 0;
  let prevCorr = 1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= n - lag;
    // Look for the first strong local peak (avoids octave errors on harmonics).
    if (corr > 0.9 * prevCorr && corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
    prevCorr = corr;
  }
  if (bestLag <= 0 || bestCorr < 1e-5) return 0;
  return sampleRate / bestLag;
}

// Value noise: piecewise-cubic interpolation between seeded random knots.
// Deterministic, smooth (C1), and unbounded in time — no looping.
class SmoothNoise {
  private knots: number[] = [];
  private readonly rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  private knot(i: number): number {
    while (this.knots.length <= i) this.knots.push(this.rng() * 2 - 1);
    return this.knots[i];
  }

  /** Sample at continuous position `x` (in knot units). */
  at(x: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const a = this.knot(i);
    const b = this.knot(i + 1);
    // smoothstep for a gentle, drift-free curve
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  }
}
