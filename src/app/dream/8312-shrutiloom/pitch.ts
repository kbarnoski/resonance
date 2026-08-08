// ── Monophonic pitch detection ────────────────────────────────────────────────
// A compact McLeod Pitch Method (MPM / normalized square difference) detector.
// We need the SUNG note's fundamental f0 in Hz — the shared mic hook only gives
// band energy + spectral centroid, which is not clean enough to quantize to a
// just-intonation lattice. So we run our own NSDF over a time-domain buffer.
//
// Reference: Philip McLeod & Geoff Wyvill, "A Smarter Way to Find Pitch"
// (ICMC 2005). NSDF peaks are robust for sustained vocal tones.

export interface PitchResult {
  /** Detected fundamental in Hz, or -1 if no confident pitch. */
  hz: number;
  /** Peak clarity 0..1 (NSDF peak height). Higher = more tonal/steady. */
  clarity: number;
  /** RMS amplitude 0..1 of the analysed window. */
  rms: number;
}

const NO_PITCH: PitchResult = { hz: -1, clarity: 0, rms: 0 };

/**
 * Estimate the fundamental of a time-domain buffer via the normalized
 * square-difference function.
 *
 * @param buf         Float32 time-domain samples (roughly -1..1).
 * @param sampleRate  AudioContext sample rate (Hz).
 * @param rmsGate     Minimum RMS to attempt detection (amplitude gate).
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  rmsGate = 0.008,
): PitchResult {
  const n = buf.length;

  // Amplitude gate — reject silence / breath noise early.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < rmsGate) return { ...NO_PITCH, rms };

  // Vocal range of interest ~70–1000 Hz → lag search window.
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(Math.floor(sampleRate / 70), Math.floor(n / 2));
  if (maxLag <= minLag) return { ...NO_PITCH, rms };

  // NSDF: n'(tau) = 2*r(tau) / m(tau), where r is autocorrelation and
  // m is the summed squared terms. Values live in [-1, 1].
  const nsdf = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let acf = 0;
    let div = 0;
    const lim = n - tau;
    for (let i = 0; i < lim; i++) {
      const a = buf[i];
      const b = buf[i + tau];
      acf += a * b;
      div += a * a + b * b;
    }
    nsdf[tau] = div > 0 ? (2 * acf) / div : 0;
  }

  // Peak picking: find the first "key maximum" — the highest peak after the
  // NSDF first drops below zero (skips the trivial peak at tau=0 region).
  let started = false;
  let bestTau = -1;
  let bestVal = 0;
  // Collect the maximum of each positive hump, then take the first hump whose
  // peak clears a threshold relative to the global max (McLeod's approach).
  let globalMax = 0;
  const peaks: Array<{ tau: number; val: number }> = [];
  let humpTau = -1;
  let humpVal = -Infinity;
  for (let tau = minLag; tau <= maxLag; tau++) {
    const v = nsdf[tau];
    if (v > 0) {
      if (!started) started = true;
      if (v > humpVal) {
        humpVal = v;
        humpTau = tau;
      }
    } else if (started) {
      // Just crossed back below zero — close out this hump.
      if (humpTau >= 0) {
        peaks.push({ tau: humpTau, val: humpVal });
        if (humpVal > globalMax) globalMax = humpVal;
      }
      started = false;
      humpVal = -Infinity;
      humpTau = -1;
    }
  }
  if (started && humpTau >= 0) {
    peaks.push({ tau: humpTau, val: humpVal });
    if (humpVal > globalMax) globalMax = humpVal;
  }
  if (peaks.length === 0 || globalMax <= 0) return { ...NO_PITCH, rms };

  // First peak that exceeds k * globalMax is the fundamental (avoids octave
  // errors toward higher, slightly-taller harmonic peaks).
  const k = 0.85;
  const thresh = k * globalMax;
  for (const p of peaks) {
    if (p.val >= thresh) {
      bestTau = p.tau;
      bestVal = p.val;
      break;
    }
  }
  if (bestTau < 0) return { ...NO_PITCH, rms };

  // Parabolic interpolation around the chosen lag for sub-sample precision.
  const t0 = Math.max(minLag, bestTau - 1);
  const t2 = Math.min(maxLag, bestTau + 1);
  const y0 = nsdf[t0];
  const y1 = nsdf[bestTau];
  const y2 = nsdf[t2];
  const denom = y0 - 2 * y1 + y2;
  let refined = bestTau;
  if (Math.abs(denom) > 1e-9) {
    refined = bestTau + (0.5 * (y0 - y2)) / denom;
  }
  if (refined <= 0) return { ...NO_PITCH, rms };

  const hz = sampleRate / refined;
  if (!Number.isFinite(hz) || hz < 60 || hz > 1200) return { ...NO_PITCH, rms };

  return { hz, clarity: Math.max(0, Math.min(1, bestVal)), rms };
}
