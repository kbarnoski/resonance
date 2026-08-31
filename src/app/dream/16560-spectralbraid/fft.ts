// ─────────────────────────────────────────────────────────────────────────────
// fft.ts — a self-contained, dependency-free radix-2 Cooley–Tukey FFT.
//
// In-place, iterative (no recursion), operates on split real/imaginary Float32
// arrays whose length MUST be a power of two. `inverse` runs the inverse
// transform and scales by 1/N so a forward→inverse round-trip returns the input.
//
// Used by the Spectral Braid engine for both offline STFT analysis and the
// streaming overlap-add resynthesis of Karel's two real takes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-place radix-2 FFT. `re` and `im` are modified directly.
 * @param re real parts, length N (power of two)
 * @param im imaginary parts, length N
 * @param inverse when true, computes the inverse transform (÷N applied)
 */
export function fftRadix2(re: Float32Array, im: Float32Array, inverse = false): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  const sign = inverse ? 1 : -1;

  // Butterfly stages.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    for (let start = 0; start < n; start += len) {
      let wr = 1;
      let wi = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }

  if (inverse) {
    const inv = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= inv;
      im[i] *= inv;
    }
  }
}
