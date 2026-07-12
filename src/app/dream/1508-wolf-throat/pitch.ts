// ─────────────────────────────────────────────────────────────────────────────
// pitch.ts — a small, dependency-free YIN fundamental-pitch tracker.
//
//   The Wolf Throat is played by SINGING, so its whole soul is the accuracy and
//   latency of monophonic pitch detection. This is a hand-rolled YIN estimator
//   (de Cheveigné & Kawahara 2002): difference function → cumulative mean
//   normalized difference → absolute-threshold pick → parabolic refinement.
//   No FFT, no npm. It runs on a time-domain frame you pull from an AnalyserNode
//   with getFloatTimeDomainData().
//
//   Returns a frequency in Hz plus a `clarity` in [0,1] (1 = a clean, confident
//   pitch). Returns null on silence or when nothing periodic is found — the
//   caller treats that as "no voice, let the landscape dream on its own."
// ─────────────────────────────────────────────────────────────────────────────

export interface PitchResult {
  hz: number;
  /** Confidence 0..1 — how periodic the frame was (1 − YIN dip value). */
  clarity: number;
}

export interface PitchOptions {
  /** Yin absolute threshold. Lower = stricter. Default 0.14. */
  threshold?: number;
  /** RMS gate — frames quieter than this are treated as silence. Default 0.008. */
  rmsGate?: number;
  /** Lowest fundamental we bother to look for (Hz). Default 70. */
  minHz?: number;
  /** Highest fundamental we accept (Hz). Default 1100. */
  maxHz?: number;
}

/** Root-mean-square level of a time-domain frame (a cheap loudness gate). */
export function frameRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/**
 * Estimate the fundamental of a monophonic time-domain frame with YIN.
 * `buf` should hold at least ~2 periods of the lowest note you want to catch;
 * 2048 samples at 44.1 kHz reaches down to ~43 Hz, comfortably below the voice.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: PitchOptions = {},
): PitchResult | null {
  const threshold = opts.threshold ?? 0.14;
  const rmsGate = opts.rmsGate ?? 0.008;
  const minHz = opts.minHz ?? 70;
  const maxHz = opts.maxHz ?? 1100;

  if (frameRms(buf) < rmsGate) return null;

  const n = buf.length;
  const maxTau = Math.min(Math.floor(n / 2), Math.floor(sampleRate / minHz));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  if (maxTau <= minTau) return null;

  // 1. Difference function d(tau).
  const diff = new Float32Array(maxTau);
  for (let tau = minTau; tau < maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < maxTau; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // 2. Cumulative mean normalized difference d'(tau).
  const cmnd = new Float32Array(maxTau);
  cmnd[minTau] = 1;
  let running = 0;
  for (let tau = minTau; tau < maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - minTau + 1)) / running : 1;
  }

  // 3. Absolute-threshold pick: first local dip that drops below threshold.
  let bestTau = -1;
  for (let tau = minTau + 1; tau < maxTau - 1; tau++) {
    if (cmnd[tau] < threshold) {
      while (tau + 1 < maxTau - 1 && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  // Fall back to the global minimum if nothing crossed the threshold.
  if (bestTau === -1) {
    let min = Infinity;
    for (let tau = minTau + 1; tau < maxTau - 1; tau++) {
      if (cmnd[tau] < min) {
        min = cmnd[tau];
        bestTau = tau;
      }
    }
    // Too incoherent to be a sung pitch.
    if (bestTau === -1 || min > 0.6) return null;
  }

  // 4. Parabolic interpolation around the dip for sub-sample precision.
  const x0 = bestTau > minTau ? bestTau - 1 : bestTau;
  const x2 = bestTau + 1 < maxTau ? bestTau + 1 : bestTau;
  let refined = bestTau;
  if (x0 !== bestTau && x2 !== bestTau) {
    const s0 = cmnd[x0];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[x2];
    const denom = s0 + s2 - 2 * s1;
    if (Math.abs(denom) > 1e-9) {
      refined = bestTau + (s0 - s2) / (2 * denom);
    }
  }

  const hz = sampleRate / refined;
  if (!isFinite(hz) || hz < minHz || hz > maxHz) return null;

  const clarity = Math.max(0, Math.min(1, 1 - cmnd[bestTau]));
  return { hz, clarity };
}
