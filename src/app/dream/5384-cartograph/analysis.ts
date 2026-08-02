// ════════════════════════════════════════════════════════════════════════════
// 5384 — Cartograph · analysis.ts
//
// A from-scratch Music-Structure-Analysis pipeline. NO npm deps. Everything —
// the FFT, the chroma extractor, the self-similarity matrix, the Foote novelty
// curve and the peak-picker — is hand-written here.
//
//   audio → mono decimate → STFT (radix-2 FFT + Hann) → chroma (12 pc) →
//   frame-decimate → KEY-INVARIANT self-similarity matrix → diagonal smoothing →
//   checkerboard novelty (Foote 2000) → adaptive peak-pick → segment labels.
//
// See README.md for the references (Foote 1999/2000, Müller FMP).
// ════════════════════════════════════════════════════════════════════════════

const TARGET_SR = 11025; // decimate target — analysis runs sub-second at this rate
const FRAME = 4096; // STFT window (~0.37 s @ 11 kHz) — must be a power of two
const HOP = FRAME / 2; // 50 % overlap
const MAX_FRAMES = 256; // cap on the feature count → bounds the O(N²) SSM cost
const CHROMA_SMOOTH = 3; // temporal median-ish smoothing radius over feature frames
const DIAG_SMOOTH = 2; // main-diagonal-direction smoothing radius (sharpens stripes)

export interface Segment {
  startFrame: number;
  endFrame: number;
  startT: number;
  endT: number;
  label: number; // repeated sections share a label (via key-invariant matching)
}

export interface AnalysisResult {
  n: number; // matrix dimension
  ssm: Float32Array; // n·n row-major, values in [0,1]
  novelty: Float32Array; // length n, normalized [0,1]
  boundaries: number[]; // frame indices of detected section starts
  frameTimes: Float32Array; // seconds at the centre of each decimated frame
  segments: Segment[];
  duration: number; // total seconds
  ssmLo: number; // contrast-stretch reference low (percentile)
  ssmHi: number; // contrast-stretch reference high (percentile)
}

// ── radix-2 Cooley–Tukey FFT (in place) ──────────────────────────────────────
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
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── mono downmix + decimate to ~TARGET_SR ────────────────────────────────────
function decimateMono(buffer: AudioBuffer): { data: Float32Array; sr: number } {
  const chs = buffer.numberOfChannels;
  const srcLen = buffer.length;
  const srcSr = buffer.sampleRate;
  // mono downmix
  const mono = new Float32Array(srcLen);
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < srcLen; i++) mono[i] += d[i] / chs;
  }
  if (srcSr <= TARGET_SR) return { data: mono, sr: srcSr };
  const factor = Math.max(1, Math.round(srcSr / TARGET_SR));
  const outLen = Math.floor(srcLen / factor);
  const out = new Float32Array(outLen);
  // simple box anti-alias average per decimation window
  for (let i = 0; i < outLen; i++) {
    let s = 0;
    const base = i * factor;
    for (let k = 0; k < factor; k++) s += mono[base + k];
    out[i] = s / factor;
  }
  return { data: out, sr: srcSr / factor };
}

// precomputed pitch-class of every FFT bin, or -1 to ignore (out of band)
function binPitchClasses(sr: number): Int8Array {
  const half = FRAME >> 1;
  const pc = new Int8Array(half);
  for (let b = 0; b < half; b++) {
    const freq = (b * sr) / FRAME;
    if (freq < 55 || freq > 2093) {
      pc[b] = -1; // below A1 or above C7 — outside the harmonic band we fold
      continue;
    }
    const midi = 69 + 12 * Math.log2(freq / 440);
    pc[b] = ((Math.round(midi) % 12) + 12) % 12;
  }
  return pc;
}

// ── STFT → chroma frames ─────────────────────────────────────────────────────
function computeChroma(signal: Float32Array, sr: number): Float32Array[] {
  const half = FRAME >> 1;
  const pcOf = binPitchClasses(sr);
  const hann = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  }
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  const frames: Float32Array[] = [];
  const nFrames = Math.max(1, Math.floor((signal.length - FRAME) / HOP) + 1);
  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = (signal[start + i] || 0) * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const chroma = new Float32Array(12);
    for (let b = 1; b < half; b++) {
      const p = pcOf[b];
      if (p < 0) continue;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      chroma[p] += mag;
    }
    // L2 normalize
    let norm = 0;
    for (let k = 0; k < 12; k++) norm += chroma[k] * chroma[k];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let k = 0; k < 12; k++) chroma[k] /= norm;
    frames.push(chroma);
  }
  return frames;
}

// light temporal smoothing (moving average) then decimate to <= MAX_FRAMES
function smoothAndDecimate(
  frames: Float32Array[],
): { feats: Float32Array[]; factor: number } {
  const n = frames.length;
  const sm: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const acc = new Float32Array(12);
    let cnt = 0;
    for (let d = -CHROMA_SMOOTH; d <= CHROMA_SMOOTH; d++) {
      const j = i + d;
      if (j < 0 || j >= n) continue;
      const fr = frames[j];
      for (let k = 0; k < 12; k++) acc[k] += fr[k];
      cnt++;
    }
    let norm = 0;
    for (let k = 0; k < 12; k++) {
      acc[k] /= cnt;
      norm += acc[k] * acc[k];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let k = 0; k < 12; k++) acc[k] /= norm;
    sm.push(acc);
  }
  const factor = Math.max(1, Math.ceil(n / MAX_FRAMES));
  if (factor === 1) return { feats: sm, factor };
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i += factor) {
    const acc = new Float32Array(12);
    let cnt = 0;
    for (let k = 0; k < factor && i + k < n; k++) {
      const fr = sm[i + k];
      for (let c = 0; c < 12; c++) acc[c] += fr[c];
      cnt++;
    }
    let norm = 0;
    for (let c = 0; c < 12; c++) {
      acc[c] /= cnt;
      norm += acc[c] * acc[c];
    }
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let c = 0; c < 12; c++) acc[c] /= norm;
    out.push(acc);
  }
  return { feats: out, factor };
}

// KEY-INVARIANT similarity: max cosine over all 12 cyclic rotations of b
// (the Optimal Transposition Index). A repeat in a DIFFERENT KEY still lights up.
function keyInvariantSim(a: Float32Array, b: Float32Array): number {
  let best = 0;
  for (let r = 0; r < 12; r++) {
    let dot = 0;
    for (let k = 0; k < 12; k++) dot += a[k] * b[(k + r) % 12];
    if (dot > best) best = dot;
  }
  return best < 0 ? 0 : best > 1 ? 1 : best;
}

function buildSSM(feats: Float32Array[]): Float32Array {
  const n = feats.length;
  const raw = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    raw[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const s = keyInvariantSim(feats[i], feats[j]);
      raw[i * n + j] = s;
      raw[j * n + i] = s;
    }
  }
  // diagonal-direction smoothing — average along the main-diagonal path so that
  // sustained repeated *sequences* form crisp stripes instead of speckle.
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      let cnt = 0;
      for (let d = -DIAG_SMOOTH; d <= DIAG_SMOOTH; d++) {
        const ii = i + d;
        const jj = j + d;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        s += raw[ii * n + jj];
        cnt++;
      }
      out[i * n + j] = s / cnt;
    }
  }
  return out;
}

// ── Foote novelty (2000): correlate a Gaussian-tapered checkerboard kernel
//    along the main diagonal of the SSM. Peaks = structural boundaries. ────────
function computeNovelty(ssm: Float32Array, n: number): Float32Array {
  const kh = Math.max(4, Math.min(28, Math.floor(n / 6))); // kernel half-width
  const sigma = kh / 2;
  // precompute Gaussian-tapered checkerboard weights over [-kh..kh]²
  const size = 2 * kh + 1;
  const kernel = new Float32Array(size * size);
  for (let a = -kh; a <= kh; a++) {
    for (let b = -kh; b <= kh; b++) {
      const g = Math.exp(-(a * a + b * b) / (2 * sigma * sigma));
      const sign = Math.sign(a) * Math.sign(b); // + on-diagonal quadrants, − off
      kernel[(a + kh) * size + (b + kh)] = g * sign;
    }
  }
  const nov = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let a = -kh; a <= kh; a++) {
      const ii = i + a;
      if (ii < 0 || ii >= n) continue;
      for (let b = -kh; b <= kh; b++) {
        const jj = i + b;
        if (jj < 0 || jj >= n) continue;
        v += kernel[(a + kh) * size + (b + kh)] * ssm[ii * n + jj];
      }
    }
    nov[i] = v > 0 ? v : 0;
  }
  // normalize to [0,1]
  let mx = 1e-9;
  for (let i = 0; i < n; i++) if (nov[i] > mx) mx = nov[i];
  for (let i = 0; i < n; i++) nov[i] /= mx;
  return nov;
}

// adaptive peak-pick: local maxima above (local mean + k·std), min-distance apart
function pickBoundaries(nov: Float32Array, n: number): number[] {
  if (n < 8) return [];
  const win = Math.max(4, Math.floor(n / 8));
  const minDist = Math.max(3, Math.floor(n / 20));
  const k = 0.6;
  const bounds: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (nov[i] <= nov[i - 1] || nov[i] < nov[i + 1]) continue; // local max
    let sum = 0;
    let sumSq = 0;
    let cnt = 0;
    for (let d = -win; d <= win; d++) {
      const j = i + d;
      if (j < 0 || j >= n) continue;
      sum += nov[j];
      sumSq += nov[j] * nov[j];
      cnt++;
    }
    const mean = sum / cnt;
    const std = Math.sqrt(Math.max(0, sumSq / cnt - mean * mean));
    if (nov[i] < mean + k * std || nov[i] < 0.12) continue;
    if (bounds.length && i - bounds[bounds.length - 1] < minDist) {
      // keep the stronger of the two neighbouring peaks
      if (nov[i] > nov[bounds[bounds.length - 1]]) bounds[bounds.length - 1] = i;
      continue;
    }
    bounds.push(i);
  }
  return bounds;
}

// segment the timeline at the boundaries and label repeated sections (key-invariant)
function labelSegments(
  feats: Float32Array[],
  boundaries: number[],
  frameTimes: Float32Array,
  n: number,
): Segment[] {
  const cuts = [0, ...boundaries.filter((b) => b > 0 && b < n), n];
  const uniq = Array.from(new Set(cuts)).sort((a, b) => a - b);
  const segs: Segment[] = [];
  const means: Float32Array[] = [];
  for (let s = 0; s < uniq.length - 1; s++) {
    const a = uniq[s];
    const b = uniq[s + 1];
    const mean = new Float32Array(12);
    for (let i = a; i < b; i++) {
      const fr = feats[i];
      for (let k = 0; k < 12; k++) mean[k] += fr[k];
    }
    let norm = 0;
    for (let k = 0; k < 12; k++) norm += mean[k] * mean[k];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let k = 0; k < 12; k++) mean[k] /= norm;
    // assign to an earlier segment's label if key-invariantly similar
    let label = means.length;
    let bestSim = 0.86; // threshold for "same section returns"
    for (let m = 0; m < means.length; m++) {
      const sim = keyInvariantSim(mean, means[m]);
      if (sim > bestSim) {
        bestSim = sim;
        label = segs[m].label;
      }
    }
    means.push(mean);
    segs.push({
      startFrame: a,
      endFrame: b,
      startT: frameTimes[a] ?? 0,
      endT: frameTimes[Math.min(b, n - 1)] ?? frameTimes[n - 1],
      label,
    });
  }
  return segs;
}

function percentile(arr: Float32Array, p: number): number {
  const sorted = Float32Array.from(arr).sort();
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/** Full pipeline. Synchronous and sub-second for the ~50 s demo. */
export function analyze(buffer: AudioBuffer): AnalysisResult {
  const { data, sr } = decimateMono(buffer);
  const chroma = computeChroma(data, sr);
  const { feats, factor } = smoothAndDecimate(chroma);
  const n = feats.length;
  const secPerDecimatedFrame = (HOP * factor) / sr;
  const frameTimes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    frameTimes[i] = (i + 0.5) * secPerDecimatedFrame + FRAME / 2 / sr;
  }
  const ssm = buildSSM(feats);
  const novelty = computeNovelty(ssm, n);
  const boundaries = pickBoundaries(novelty, n);
  const segments = labelSegments(feats, boundaries, frameTimes, n);
  const duration = buffer.duration;
  // contrast-stretch references from the off-diagonal distribution
  const ssmLo = percentile(ssm, 0.4);
  const ssmHi = Math.max(ssmLo + 0.05, percentile(ssm, 0.995));
  return {
    n,
    ssm,
    novelty,
    boundaries,
    frameTimes,
    segments,
    duration,
    ssmLo,
    ssmHi,
  };
}
