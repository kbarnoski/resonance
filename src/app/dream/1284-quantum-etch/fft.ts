// 1284-quantum-etch — fft.ts
//
// A zero-dependency radix-2 Cooley–Tukey FFT, hand-written for the split-step
// Schrödinger solver. Iterative, in-place, with precomputed bit-reversal
// permutation and twiddle factors. The 2D transform runs the 1D pass over every
// row, then over every column (separable DFT). Forward uses e^{-i·}; inverse
// uses the conjugate twiddles and divides by N. NO npm FFT dependency.

export interface FFT1D {
  readonly n: number;
  /** In-place FFT on re/im (length n). inverse=true divides by n. */
  transform(re: Float32Array, im: Float32Array, inverse: boolean): void;
}

export function createFFT1D(n: number): FFT1D {
  if (n < 2 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, got ${n}`);
  }

  let bits = 0;
  while (1 << bits < n) bits++;

  // Bit-reversal permutation table.
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }

  // Forward twiddles (e^{-i·2π·k/n}) for k in [0, n/2).
  const half = n >> 1;
  const cos = new Float32Array(half);
  const sin = new Float32Array(half);
  for (let k = 0; k < half; k++) {
    const ang = (-2 * Math.PI * k) / n;
    cos[k] = Math.cos(ang);
    sin[k] = Math.sin(ang);
  }

  return {
    n,
    transform(re: Float32Array, im: Float32Array, inverse: boolean): void {
      // Reorder by bit reversal.
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) {
          const tr = re[i];
          re[i] = re[j];
          re[j] = tr;
          const ti = im[i];
          im[i] = im[j];
          im[j] = ti;
        }
      }
      // Butterflies.
      for (let len = 2; len <= n; len <<= 1) {
        const h = len >> 1;
        const step = n / len;
        for (let i = 0; i < n; i += len) {
          let ti = 0;
          for (let k = 0; k < h; k++) {
            const wr = cos[ti];
            const wi = inverse ? -sin[ti] : sin[ti];
            const a = i + k;
            const b = a + h;
            const xr = re[b] * wr - im[b] * wi;
            const xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr;
            im[b] = im[a] - xi;
            re[a] += xr;
            im[a] += xi;
            ti += step;
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
    },
  };
}

export interface FFT2D {
  readonly n: number;
  /** In-place forward 2D FFT on row-major re/im (length n·n). */
  forward(re: Float32Array, im: Float32Array): void;
  /** In-place inverse 2D FFT (normalised by n·n). */
  inverse(re: Float32Array, im: Float32Array): void;
}

export function createFFT2D(n: number): FFT2D {
  const fft = createFFT1D(n);
  const colRe = new Float32Array(n);
  const colIm = new Float32Array(n);

  const run2D = (re: Float32Array, im: Float32Array, inverse: boolean) => {
    // Rows are contiguous — transform each in place via a subarray view.
    for (let y = 0; y < n; y++) {
      const o = y * n;
      fft.transform(re.subarray(o, o + n), im.subarray(o, o + n), inverse);
    }
    // Columns are strided — gather, transform, scatter.
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        const idx = y * n + x;
        colRe[y] = re[idx];
        colIm[y] = im[idx];
      }
      fft.transform(colRe, colIm, inverse);
      for (let y = 0; y < n; y++) {
        const idx = y * n + x;
        re[idx] = colRe[y];
        im[idx] = colIm[y];
      }
    }
  };

  return {
    n,
    forward(re, im) {
      run2D(re, im, false);
    },
    inverse(re, im) {
      run2D(re, im, true);
    },
  };
}
