/*
 * 4568 · MARBLE — pitch detection (time-domain YIN)
 *
 * This is a TIME-DOMAIN autocorrelation / YIN detector operating on the raw
 * waveform buffer (analyser.getFloatTimeDomainData). It is deliberately NOT an
 * FFT spectral-feature field (no spectral-centroid / flux / RMS drives a
 * visualiser here) — the mic's job is a single job: report the FUNDAMENTAL
 * pitch of the incoming sound so we can carve the nearest partial.
 *
 * de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator for speech
 * and music", JASA 2002 — difference function → cumulative mean normalised
 * difference → absolute threshold → parabolic interpolation.
 */

/**
 * @returns fundamental frequency in Hz, or -1 if the buffer is too quiet /
 *          unpitched to trust.
 */
export function detectPitchYIN(
  buf: Float32Array,
  sampleRate: number,
  threshold = 0.12,
): number {
  const n = buf.length;
  const maxTau = n >> 1;

  // RMS gate — ignore silence / room hiss so we never carve on noise.
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return -1;

  // 1. difference function
  const diff = new Float32Array(maxTau);
  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < maxTau; j++) {
      const d = buf[j] - buf[j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // 2. cumulative mean normalised difference
  const cmnd = new Float32Array(maxTau);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }

  // 3. absolute threshold — first dip below threshold, walked to its local min
  let tau = -1;
  for (let t = 2; t < maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 < maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    // no clear pitch period found
    let minV = Infinity;
    let minT = -1;
    for (let t = 2; t < maxTau; t++) {
      if (cmnd[t] < minV) {
        minV = cmnd[t];
        minT = t;
      }
    }
    if (minV < 0.35) tau = minT;
    else return -1;
  }

  // 4. parabolic interpolation around the chosen lag
  let betterTau = tau;
  if (tau > 0 && tau < maxTau - 1) {
    const s0 = cmnd[tau - 1];
    const s1 = cmnd[tau];
    const s2 = cmnd[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }

  const freq = sampleRate / betterTau;
  if (freq < 70 || freq > 2200) return -1;
  return freq;
}
