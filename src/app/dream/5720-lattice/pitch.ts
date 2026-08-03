// ─────────────────────────────────────────────────────────────────────────────
// Monophonic pitch detection via normalized autocorrelation (ACF). Used for the
// microphone fallback: hum or play into the mic and the nearest MIDI note lights
// its node on the helix. Returns null when the signal is too weak or unpitched.
// ─────────────────────────────────────────────────────────────────────────────

/** Detect the fundamental frequency (Hz) of a time-domain buffer, or null. */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;

  // Reject near-silence — RMS gate.
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  // Search lags corresponding to ~55 Hz … ~1000 Hz.
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 55));

  let bestLag = -1;
  let bestCorr = 0;
  let lastCorr = 1;
  let foundGoodDip = false;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= n - lag;

    // Wait for the autocorrelation to dip below zero once (past the main lobe)
    // before accepting a peak — avoids locking onto lag 0.
    if (!foundGoodDip && corr < 0) foundGoodDip = true;

    if (foundGoodDip && corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
    lastCorr = corr;
  }
  void lastCorr;

  if (bestLag <= 0 || bestCorr < 0.01) return null;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  let interpLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    let a = 0;
    let b = 0;
    let c = 0;
    for (let i = 0; i < n - (bestLag - 1); i++) a += buf[i] * buf[i + bestLag - 1];
    for (let i = 0; i < n - bestLag; i++) b += buf[i] * buf[i + bestLag];
    for (let i = 0; i < n - (bestLag + 1); i++) c += buf[i] * buf[i + bestLag + 1];
    a /= n - (bestLag - 1);
    b /= n - bestLag;
    c /= n - (bestLag + 1);
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-9) interpLag = bestLag - (0.5 * (c - a)) / denom;
  }

  const freq = sampleRate / interpLag;
  if (freq < 50 || freq > 1100) return null;
  return freq;
}

/** Nearest MIDI note number for a frequency. */
export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}
