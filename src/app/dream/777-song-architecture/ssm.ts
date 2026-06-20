// Chroma feature extraction + Self-Similarity Matrix computation.
// Pure functions that run on a decoded AudioBuffer's samples (no live mic).
// Foote-style SSM: slice into frames, compute a 12-bin chroma per frame,
// then S[i][j] = cosine similarity between chroma(i) and chroma(j).

export interface SsmResult {
  size: number; // N frames
  frameSec: number; // seconds per frame
  matrix: Float32Array; // length N*N, row-major, values 0..1
  chroma: Float32Array[]; // N chroma vectors (each length 12)
  novelty: Float32Array; // length N, section-boundary novelty curve 0..1
}

// In-place iterative radix-2 FFT on real/imag arrays (length must be 2^k).
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
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
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wpr = Math.cos(ang);
    const wpi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = i + k + len / 2;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
}

// Map an FFT magnitude spectrum to a 12-bin chroma vector (pitch classes).
function spectrumToChroma(
  mag: Float32Array,
  sampleRate: number,
  fftSize: number
): Float32Array {
  const chroma = new Float32Array(12);
  const minHz = 55; // A1 — ignore sub-bass rumble
  const maxHz = 4000; // ignore very high noise
  for (let bin = 1; bin < mag.length; bin++) {
    const hz = (bin * sampleRate) / fftSize;
    if (hz < minHz || hz > maxHz) continue;
    // pitch class = round(12*log2(hz/440)) mod 12, anchored so A->9
    const midi = 69 + 12 * Math.log2(hz / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += mag[bin];
  }
  // L2 normalize so cosine similarity is well-defined.
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i] * chroma[i];
  const norm = Math.sqrt(sum) || 1;
  for (let i = 0; i < 12; i++) chroma[i] /= norm;
  return chroma;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < 12; i++) dot += a[i] * b[i];
  // vectors are L2-normalized, so dot == cosine (clamp for safety)
  return dot < 0 ? 0 : dot > 1 ? 1 : dot;
}

// Compute the full SSM from a decoded AudioBuffer.
// targetFrames keeps the matrix legible; frame length adapts to duration.
export function computeSsm(buffer: AudioBuffer, targetFrames = 96): SsmResult {
  const sampleRate = buffer.sampleRate;
  const ch = buffer.getChannelData(0);
  const dur = buffer.duration;

  // Aim for ~1s frames but cap the matrix size for render speed.
  const frameSec = Math.max(0.5, dur / targetFrames);
  const hop = Math.floor(frameSec * sampleRate);
  const fftSize = 4096; // analysis window
  const N = Math.max(2, Math.floor((ch.length - fftSize) / hop) + 1);

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const mag = new Float32Array(fftSize / 2);
  const chroma: Float32Array[] = [];

  for (let f = 0; f < N; f++) {
    const start = f * hop;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const idx = start + i;
      const s = idx < ch.length ? ch[idx] : 0;
      // Hann window
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
      re[i] = s * w;
    }
    fft(re, im);
    for (let b = 0; b < mag.length; b++) {
      mag[b] = Math.hypot(re[b], im[b]);
    }
    chroma.push(spectrumToChroma(mag, sampleRate, fftSize));
  }

  // Build N×N similarity matrix.
  const matrix = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      const s = cosine(chroma[i], chroma[j]);
      matrix[i * N + j] = s;
      matrix[j * N + i] = s;
    }
  }

  // Novelty curve via a small diagonal-offset checkerboard kernel (Foote).
  const novelty = computeNovelty(matrix, N);

  return { size: N, frameSec, matrix, chroma, novelty };
}

// Checkerboard-kernel novelty: correlate a Gaussian-tapered checkerboard
// along the main diagonal; peaks mark section boundaries.
function computeNovelty(matrix: Float32Array, N: number): Float32Array {
  const L = 8; // kernel half-width
  const novelty = new Float32Array(N);
  // Precompute kernel weights (sign pattern * gaussian taper).
  const kernel: number[][] = [];
  for (let a = -L; a < L; a++) {
    const row: number[] = [];
    for (let b = -L; b < L; b++) {
      const g = Math.exp(-(a * a + b * b) / (2 * (L * 0.5) * (L * 0.5)));
      const sign = a * b >= 0 ? 1 : -1;
      row.push(sign * g);
    }
    kernel.push(row);
  }
  let maxV = 1e-9;
  for (let c = 0; c < N; c++) {
    let acc = 0;
    for (let a = -L; a < L; a++) {
      const i = c + a;
      if (i < 0 || i >= N) continue;
      for (let b = -L; b < L; b++) {
        const j = c + b;
        if (j < 0 || j >= N) continue;
        acc += kernel[a + L][b + L] * matrix[i * N + j];
      }
    }
    const v = Math.abs(acc);
    novelty[c] = v;
    if (v > maxV) maxV = v;
  }
  for (let c = 0; c < N; c++) novelty[c] /= maxV;
  return novelty;
}
