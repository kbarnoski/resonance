// pitch.ts — monophonic sung-pitch detection for cantor.
//
// YIN / CMNDF (cumulative mean normalized difference function) — a variation on
// autocorrelation that suppresses the strong zero-lag peak and the octave
// errors that plague plain autocorrelation pitch trackers (de Cheveigné &
// Kawahara, 2002). Low-latency, few parameters, well-suited to a single
// singing voice. Pure function, no allocation in the hot path beyond one
// scratch buffer, so it is cheap enough to run every animation frame.

export interface PitchState {
  /** Detected fundamental in Hz, or 0 when no confident pitch. */
  hz: number;
  /** 0..1 confidence (1 − CMNDF at the chosen lag). */
  clarity: number;
  /** 0..1 input loudness (RMS, lightly scaled). */
  loud: number;
}

// Vocal search range — ~F2 (87 Hz) up to ~C6 (1047 Hz).
const F_LO = 87;
const F_HI = 1047;
// CMNDF absolute threshold: the first dip below this is taken as the period.
const THRESH = 0.14;
// Below this RMS we treat the input as silence (no pitch).
const SILENCE = 0.006;

let scratch: Float32Array | null = null;

/**
 * Read one time-domain mic frame and write the detected pitch into `out`.
 * `buf` is a Float32Array of time-domain samples (e.g. from
 * AnalyserNode.getFloatTimeDomainData). `out` is mutated in place to avoid
 * per-frame allocation.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, out: PitchState): void {
  const n = buf.length;

  // Loudness (RMS).
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  out.loud = Math.min(1, rms * 6);

  if (rms < SILENCE) {
    out.hz = 0;
    out.clarity = 0;
    return;
  }

  const w = n >> 1; // correlation window
  const tauMin = Math.max(2, Math.floor(sampleRate / F_HI));
  const tauMax = Math.min(w - 1, Math.ceil(sampleRate / F_LO));

  if (!scratch || scratch.length < tauMax + 1) scratch = new Float32Array(tauMax + 1);
  const cmnd = scratch;

  // Difference function d(tau).
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let j = 0; j < w; j++) {
      const diff = buf[j] - buf[j + tau];
      d += diff * diff;
    }
    // Cumulative mean normalization.
    runningSum += d;
    cmnd[tau] = runningSum > 0 ? (d * tau) / runningSum : 1;
  }

  // Absolute-threshold search: first local minimum below THRESH.
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < THRESH) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }

  // Fallback: global minimum in range (weaker confidence).
  if (tauEst === -1) {
    let best = tauMin;
    for (let tau = tauMin + 1; tau <= tauMax; tau++) {
      if (cmnd[tau] < cmnd[best]) best = tau;
    }
    tauEst = best;
    if (cmnd[tauEst] > 0.6) {
      // Too unreliable to call a pitch.
      out.hz = 0;
      out.clarity = 0;
      return;
    }
  }

  // Parabolic interpolation around tauEst for sub-sample precision.
  let tau = tauEst;
  if (tauEst > tauMin && tauEst < tauMax) {
    const a = cmnd[tauEst - 1];
    const b = cmnd[tauEst];
    const c = cmnd[tauEst + 1];
    const denom = 2 * (2 * b - a - c);
    if (Math.abs(denom) > 1e-9) tau = tauEst + (c - a) / denom;
  }

  out.hz = sampleRate / tau;
  out.clarity = Math.max(0, Math.min(1, 1 - cmnd[tauEst]));
}
