// Autocorrelation / YIN-style monophonic pitch detection on a time-domain buffer.
// No recording, no storage, no network — we read the analyser buffer in place,
// estimate a fundamental, and throw the samples away every frame.

export interface PitchResult {
  /** Estimated fundamental in Hz, or 0 when no confident pitch. */
  hz: number;
  /** RMS amplitude 0..1 of the analysed frame (loudness gate input). */
  rms: number;
}

const MIN_HZ = 150; // clamp to a child-voice friendly range
const MAX_HZ = 700;

/**
 * YIN-style detector: cumulative-mean-normalized difference function with a
 * parabolic refinement of the chosen lag. Robust enough for a sung vowel,
 * cheap enough to run every animation frame.
 *
 * @param buf   time-domain samples (-1..1), typically analyser.getFloatTimeDomainData
 * @param rate  sample rate of the AudioContext
 * @param gate  RMS threshold below which we report no pitch (silence/noise)
 */
export function detectPitch(
  buf: Float32Array,
  rate: number,
  gate = 0.012
): PitchResult {
  const n = buf.length;

  // RMS first — cheap loudness gate so room hiss never grows a flower.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < gate) return { hz: 0, rms };

  // Search only the lag window matching our Hz clamp.
  const maxLag = Math.min(Math.floor(rate / MIN_HZ), Math.floor(n / 2));
  const minLag = Math.max(2, Math.floor(rate / MAX_HZ));

  // Difference function d(tau).
  const diff = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < n - maxLag; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference (YIN step 3).
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[minLag] = 1;
  let running = 0;
  for (let tau = minLag + 1; tau <= maxLag; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - minLag + 1)) / running : 1;
  }

  // Absolute threshold: first dip below 0.12, else global minimum.
  const threshold = 0.12;
  let bestTau = -1;
  for (let tau = minLag + 1; tau < maxLag; tau++) {
    if (cmnd[tau] < threshold) {
      // walk down to the local minimum of this valley
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 0) {
    let min = Infinity;
    for (let tau = minLag + 1; tau < maxLag; tau++) {
      if (cmnd[tau] < min) {
        min = cmnd[tau];
        bestTau = tau;
      }
    }
    // Too noisy / unvoiced — refuse rather than emit garbage.
    if (min > 0.5) return { hz: 0, rms };
  }
  if (bestTau <= 0) return { hz: 0, rms };

  // Parabolic interpolation around bestTau for sub-sample accuracy.
  const x0 = bestTau > minLag ? bestTau - 1 : bestTau;
  const x2 = bestTau + 1 <= maxLag ? bestTau + 1 : bestTau;
  let refined = bestTau;
  if (x0 !== bestTau && x2 !== bestTau) {
    const s0 = cmnd[x0];
    const s1 = cmnd[bestTau];
    const s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) refined = bestTau + (s2 - s0) / denom;
  }

  const hz = rate / refined;
  if (hz < MIN_HZ || hz > MAX_HZ) return { hz: 0, rms };
  return { hz, rms };
}
