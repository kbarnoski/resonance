/**
 * pitch.ts — live pitch detection via autocorrelation (the Chris Wilson method,
 * a practical cousin of YIN). Mic is ANALYSIS-ONLY: we read a float time-domain
 * buffer, estimate the fundamental, and immediately discard the samples. Nothing
 * is ever recorded, stored, or transmitted — only the derived pentatonic degree
 * is saved to the genome.
 */

/**
 * Estimate the fundamental frequency (Hz) of a time-domain buffer.
 * Returns -1 when the signal is too quiet or unvoiced.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;

  // RMS gate — ignore silence / breath.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim the leading/trailing low-energy edges to a stable window.
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }
  }
  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 8) return -1;

  // Autocorrelation.
  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // Find the first dip, then the peak after it.
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return -1;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  let T0 = maxpos;
  const x1 = c[maxpos - 1] ?? c[maxpos];
  const x2 = c[maxpos];
  const x3 = c[maxpos + 1] ?? c[maxpos];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a !== 0) T0 = T0 - b / (2 * a);

  const freq = sampleRate / T0;
  // Plausible singing/humming range only.
  if (freq < 70 || freq > 1200) return -1;
  return freq;
}
