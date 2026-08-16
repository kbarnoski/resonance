// ─────────────────────────────────────────────────────────────────────────────
// beatEngine.ts — offline MIR for the flip-deck.
//
// Given one of Karel's decoded solo-piano AudioBuffers, we hand-roll a small
// beat-tracking pipeline so the visitor can cut and re-loop his bars in time:
//
//   1. mono mixdown
//   2. spectral-flux onset novelty  (radix-2 STFT, frame 2048 / hop 512, Hann,
//      half-wave-rectified frame-to-frame magnitude increase; Bello et al. 2005)
//   3. tempo by autocorrelation of the (mean-subtracted, smoothed) novelty over a
//      60–180 BPM band; weak-peak fallback ~90 BPM; caller can nudge
//   4. a 4/4 beat/bar grid: phase-align a pulse train to the novelty, then pick
//      the bar phase whose downbeats carry the most low-band (< ~220 Hz) accent
//
// This is deliberately classic MIR (see README refs), not a neural tracker, so
// on heavy rubato the grid is an honest approximation — good enough to snap loops
// to, and the visitor always hears his real timbre either way.
//
// No Math.random / Date.now anywhere — pure functions of the samples.
// ─────────────────────────────────────────────────────────────────────────────

export interface BeatAnalysis {
  /** estimated tempo in BPM. */
  bpm: number;
  /** beat onset times (seconds), ascending, spanning the whole track. */
  beatTimes: number[];
  /** downbeat / bar-boundary times (seconds), a subset of beatTimes. */
  barTimes: number[];
  /** track duration (seconds). */
  duration: number;
}

export interface WaveformPeaks {
  /** per-bin minimum sample (-1..0-ish), length = bins. */
  min: Float32Array;
  /** per-bin maximum sample (0..1-ish), length = bins. */
  max: Float32Array;
  bins: number;
}

const FRAME = 2048;
const HOP = 512;

// ── mono mixdown ─────────────────────────────────────────────────────────────

export function toMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = ch > 0 ? 1 / ch : 1;
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

// ── iterative radix-2 FFT (in-place, real input via packed re/im arrays) ──────

function fftRadix2(re: Float32Array, im: Float32Array): void {
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
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aR = re[i + k];
        const aI = im[i + k];
        const bR = re[i + k + half];
        const bI = im[i + k + half];
        const tR = bR * curR - bI * curI;
        const tI = bR * curI + bI * curR;
        re[i + k] = aR + tR;
        im[i + k] = aI + tI;
        re[i + k + half] = aR - tR;
        im[i + k + half] = aI - tI;
        const nR = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = nR;
      }
    }
  }
}

interface NoveltyResult {
  novelty: Float32Array; // half-wave-rectified spectral flux per frame
  lowBand: Float32Array; // low-frequency energy per frame (for downbeats)
  hopSec: number;
  nFrames: number;
}

function computeNovelty(mono: Float32Array, sampleRate: number): NoveltyResult {
  const hann = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  }
  const half = FRAME >> 1;
  const nFrames = Math.max(0, Math.floor((mono.length - FRAME) / HOP) + 1);
  const novelty = new Float32Array(nFrames);
  const lowBand = new Float32Array(nFrames);
  const prevMag = new Float32Array(half);
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);

  // low band: bins whose center freq < ~220 Hz
  const lowCut = Math.max(1, Math.floor((220 * FRAME) / sampleRate));

  for (let f = 0; f < nFrames; f++) {
    const start = f * HOP;
    for (let i = 0; i < FRAME; i++) {
      re[i] = mono[start + i] * hann[i];
      im[i] = 0;
    }
    fftRadix2(re, im);
    let flux = 0;
    let low = 0;
    for (let k = 0; k < half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const d = mag - prevMag[k];
      if (d > 0) flux += d;
      if (k < lowCut) low += mag;
      prevMag[k] = mag;
    }
    novelty[f] = flux;
    lowBand[f] = low;
  }

  return { novelty, lowBand, hopSec: HOP / sampleRate, nFrames };
}

// ── smoothing + local-mean subtraction ───────────────────────────────────────

function smooth(x: Float32Array, radius: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  // prefix sums for an O(n) moving average
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n - 1, i + radius);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  return out;
}

// ── tempo via autocorrelation ────────────────────────────────────────────────

function estimateTempo(
  novelty: Float32Array,
  hopSec: number,
): { bpm: number; enhanced: Float32Array } {
  const n = novelty.length;
  // enhance: subtract a local mean (background), half-wave rectify
  const bg = smooth(novelty, 8);
  const enhanced = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = novelty[i] - bg[i];
    enhanced[i] = v > 0 ? v : 0;
  }

  const minLag = Math.max(1, Math.round(60 / 180 / hopSec)); // 180 BPM
  const maxLag = Math.min(n - 1, Math.round(60 / 60 / hopSec)); // 60 BPM

  let bestLag = minLag;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += enhanced[i] * enhanced[i + lag];
    // mild bias toward the middle of the tempo band to avoid octave runaway
    const bpm = 60 / (lag * hopSec);
    const bias = 1 - 0.15 * Math.abs(Math.log2(bpm / 110));
    const score = s * bias;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  let bpm = 60 / (bestLag * hopSec);
  // weak-signal fallback
  if (!isFinite(bpm) || bestScore <= 0) bpm = 90;
  // keep in a sane band
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return { bpm, enhanced };
}

// ── phase-align a pulse train, then find the downbeat phase ───────────────────

function buildGrid(
  enhanced: Float32Array,
  lowBand: Float32Array,
  hopSec: number,
  bpm: number,
  duration: number,
): { beatTimes: number[]; barTimes: number[] } {
  const beatFrames = 60 / bpm / hopSec;
  const n = enhanced.length;

  // best phase 0..beatFrames: maximize summed novelty landing on beats
  let bestPhase = 0;
  let bestSum = -Infinity;
  const steps = Math.max(1, Math.round(beatFrames));
  for (let p = 0; p < steps; p++) {
    let s = 0;
    for (let pos = p; pos < n; pos += beatFrames) {
      const idx = Math.round(pos);
      if (idx >= 0 && idx < n) s += enhanced[idx];
    }
    if (s > bestSum) {
      bestSum = s;
      bestPhase = p;
    }
  }

  const beatTimes: number[] = [];
  const beatFrameIdx: number[] = [];
  for (let pos = bestPhase; ; pos += beatFrames) {
    const t = pos * hopSec;
    if (t > duration) break;
    beatTimes.push(t);
    beatFrameIdx.push(Math.round(pos));
  }

  // downbeat phase (0..3 in 4/4): the offset whose beats carry most low-band
  let bestDown = 0;
  let bestDownSum = -Infinity;
  for (let ph = 0; ph < 4; ph++) {
    let s = 0;
    for (let i = ph; i < beatFrameIdx.length; i += 4) {
      const idx = beatFrameIdx[i];
      if (idx >= 0 && idx < n) s += lowBand[idx];
    }
    if (s > bestDownSum) {
      bestDownSum = s;
      bestDown = ph;
    }
  }

  const barTimes: number[] = [];
  for (let i = bestDown; i < beatTimes.length; i += 4) barTimes.push(beatTimes[i]);

  return { beatTimes, barTimes };
}

// ── public entry ──────────────────────────────────────────────────────────────

/** Cached novelty so a BPM nudge can re-grid without re-running the STFT. */
export interface GridCache {
  enhanced: Float32Array;
  lowBand: Float32Array;
  hopSec: number;
  duration: number;
  detectedBpm: number;
}

/** Full analysis: the detected grid plus a cache for cheap re-gridding. */
export function analyzeTrack(buffer: AudioBuffer): {
  analysis: BeatAnalysis;
  cache: GridCache;
} {
  const mono = toMono(buffer);
  const sr = buffer.sampleRate;
  const duration = buffer.duration;
  const { novelty, lowBand, hopSec } = computeNovelty(mono, sr);
  const { bpm: detected, enhanced } = estimateTempo(novelty, hopSec);
  const bpm = Math.round(detected * 10) / 10;
  const cache: GridCache = { enhanced, lowBand, hopSec, duration, detectedBpm: bpm };
  const { beatTimes, barTimes } = buildGrid(enhanced, lowBand, hopSec, bpm, duration);
  return { analysis: { bpm, beatTimes, barTimes, duration }, cache };
}

/** Rebuild the beat/bar grid at a new BPM from a cached novelty (fast). */
export function regrid(cache: GridCache, bpm: number): BeatAnalysis {
  const { beatTimes, barTimes } = buildGrid(
    cache.enhanced,
    cache.lowBand,
    cache.hopSec,
    bpm,
    cache.duration,
  );
  return { bpm, beatTimes, barTimes, duration: cache.duration };
}

/** Downsample the mono mixdown to per-bin min/max for the WebGL ribbon. */
export function buildPeaks(buffer: AudioBuffer, bins: number): WaveformPeaks {
  const mono = toMono(buffer);
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  const per = mono.length / bins;
  for (let b = 0; b < bins; b++) {
    const a = Math.floor(b * per);
    const z = Math.min(mono.length, Math.floor((b + 1) * per));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < z; i++) {
      const v = mono[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max, bins };
}

/** Build a time-reversed copy of an AudioBuffer for backwards playback. */
export function reverseBuffer(ctx: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const rev = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = rev.getChannelData(c);
    const n = src.length;
    for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return rev;
}

/** Index of the value in a sorted array nearest to `t`. */
export function nearestIndex(sorted: number[], t: number): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(sorted[lo - 1] - t) <= Math.abs(sorted[lo] - t)) return lo - 1;
  return lo;
}
