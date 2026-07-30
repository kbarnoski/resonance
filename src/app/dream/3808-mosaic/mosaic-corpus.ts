// ════════════════════════════════════════════════════════════════════════════
// MOSAIC (3808) — corpus builder, descriptor analysis, and the shared FEATURE
// SPACE that lets a *target* signal be matched against a *corpus* recording.
//
// This is the analysis half of an audio-guided concatenative musaicing engine
// (see mosaic-audio.ts for the matcher). It slices the FIRST recording — the
// "instrument" — into ~46 ms grains, measures real spectral descriptors for each
// (centroid, RMS, pitch/periodicity, flatness, spread), and turns those into a
// normalized FEATURE VECTOR per grain plus a 2-D atlas position. The very same
// descriptor extraction + normalization is applied to the target frames so the
// two live in one comparable space — that is what lets the corpus "sing" the
// target's melody.
//
// Adapted (self-contained, NOT imported) from 3608-atlas's descriptor analysis.
// ════════════════════════════════════════════════════════════════════════════

// ── Determinism: an inline mulberry32, seeded. No Math.random()/Date.now() here.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ~46 ms @ 44.1 k, radix-2 for the FFT; also the grain playback length.
export const FRAME = 2048;
const MAX_GRAINS = 5000;
const PITCH_MIN_HZ = 50;
const PITCH_MAX_HZ = 2000;

// Feature vector layout (shared by corpus grains AND target frames):
//   0 logCentroid  1 logPitch  2 flatness  3 logSpread  4 logRms
export const FDIM = 5;
// Per-dimension weights for the timbre distance — pitch + brightness lead, since
// "singing the melody" is mostly a pitch/brightness match; loudness matters least.
export const FEATURE_WEIGHTS = new Float32Array([1.0, 1.35, 0.7, 0.5, 0.4]);

export interface GrainMeta {
  startSec: number;
  durSec: number;
  centroidHz: number;
  rms: number;
  pitchHz: number;
  periodicity: number;
  flatness: number;
  spreadHz: number;
}

export interface FeatureNorm {
  lo: Float32Array; // per-dim 2nd-percentile
  hi: Float32Array; // per-dim 98th-percentile
}

export interface Corpus {
  /** Source audio the grains are cut from — the engine plays slices of it. */
  buffer: AudioBuffer;
  grains: GrainMeta[];
  n: number;
  /** Interleaved [x0,y0,…] atlas positions, each component in [-0.95, 0.95]. */
  positions: Float32Array;
  /** Per-grain color param (violet-ramp t). */
  colorT: Float32Array;
  /** Per-grain normalized loudness (0..1). */
  loud: Float32Array;
  /** Per-grain source start time (s). */
  startSec: Float32Array;
  /** Normalized feature vectors, n × FDIM, row-major. */
  feats: Float32Array;
  /** Normalization used for feats — apply the SAME to target frames. */
  norm: FeatureNorm;
  durSec: number;
  /** Hop between consecutive grains (s) — the reconstruction time step. */
  hopSec: number;
  label: string;
}

// ── Radix-2 iterative FFT (in place). ─────────────────────────────────────────
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
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
      let cwr = 1;
      let cwi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b] * cwr - im[b] * cwi;
        const vi = re[b] * cwi + im[b] * cwr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] = re[a] + vr;
        im[a] = im[a] + vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr;
        cwr = ncwr;
      }
    }
  }
}

// ── Autocorrelation pitch → { hz, confidence }. ───────────────────────────────
function autocorrPitch(
  buf: Float32Array,
  start: number,
  len: number,
  sampleRate: number,
): { hz: number; confidence: number } {
  const total = buf.length;
  const avail = Math.min(len, total - start);
  if (avail < 512) return { hz: -1, confidence: 0 };

  const effSr = sampleRate / 2; // decimate ×2 for speed
  const n = avail >> 1;
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[start + i * 2];
  mean /= n;
  for (let i = 0; i < n; i++) x[i] = buf[start + i * 2] - mean;

  let c0 = 0;
  for (let i = 0; i < n; i++) c0 += x[i] * x[i];
  if (c0 < 1e-7) return { hz: -1, confidence: 0 };

  const minLag = Math.floor(effSr / PITCH_MAX_HZ);
  const maxLag = Math.min(n - 1, Math.floor(effSr / PITCH_MIN_HZ));

  let d = 1;
  while (d < maxLag) {
    let cur = 0;
    for (let i = 0; i < n - d; i++) cur += x[i] * x[i + d];
    let next = 0;
    for (let i = 0; i < n - (d + 1); i++) next += x[i] * x[i + d + 1];
    if (cur < next) break;
    d++;
    if (d > minLag) break;
  }
  let bestLag = -1;
  let bestVal = 0;
  let prev = 0;
  let prevPrev = 0;
  for (let lag = Math.max(minLag, d); lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += x[i] * x[i + lag];
    if (prev > prevPrev && prev >= sum && prev > bestVal) {
      bestVal = prev;
      bestLag = lag - 1;
    }
    prevPrev = prev;
    prev = sum;
  }
  if (bestLag <= 0) return { hz: -1, confidence: 0 };
  const hz = effSr / bestLag;
  if (hz < PITCH_MIN_HZ || hz > PITCH_MAX_HZ) return { hz: -1, confidence: 0 };
  return { hz, confidence: Math.max(0, Math.min(1, bestVal / c0)) };
}

// Scratch buffers reused across frames (analysis is single-threaded).
const reBuf = new Float32Array(FRAME);
const imBuf = new Float32Array(FRAME);
const hann = (() => {
  const w = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  return w;
})();

/** Measure raw spectral descriptors for one FRAME starting at `start`. */
export function analyzeFrame(
  mono: Float32Array,
  start: number,
  sampleRate: number,
): Omit<GrainMeta, "startSec" | "durSec"> {
  const total = mono.length;
  let rms = 0;
  for (let i = 0; i < FRAME; i++) {
    const s = start + i < total ? mono[start + i] : 0;
    rms += s * s;
    reBuf[i] = s * hann[i];
    imBuf[i] = 0;
  }
  rms = Math.sqrt(rms / FRAME);

  fft(reBuf, imBuf);

  const halfN = FRAME >> 1;
  const binHz = sampleRate / FRAME;
  let magSum = 0;
  let weighted = 0;
  let logSum = 0;
  const mags = new Float32Array(halfN);
  for (let k = 1; k < halfN; k++) {
    const m = Math.sqrt(reBuf[k] * reBuf[k] + imBuf[k] * imBuf[k]);
    mags[k] = m;
    magSum += m;
    weighted += m * (k * binHz);
    logSum += Math.log(m + 1e-9);
  }
  const centroidHz = magSum > 1e-9 ? weighted / magSum : 0;

  let spreadAcc = 0;
  for (let k = 1; k < halfN; k++) {
    const f = k * binHz;
    spreadAcc += mags[k] * (f - centroidHz) * (f - centroidHz);
  }
  const spreadHz = magSum > 1e-9 ? Math.sqrt(spreadAcc / magSum) : 0;

  const geoMean = Math.exp(logSum / (halfN - 1));
  const ariMean = magSum / (halfN - 1);
  const flatness = ariMean > 1e-9 ? Math.min(1, geoMean / ariMean) : 0;

  const { hz, confidence } = autocorrPitch(mono, start, FRAME, sampleRate);
  const pitchHz = hz > 0 ? hz : Math.max(PITCH_MIN_HZ, Math.min(PITCH_MAX_HZ, centroidHz));

  return { centroidHz, rms, pitchHz, periodicity: confidence, flatness, spreadHz };
}

/** Raw (pre-normalization) feature vector from descriptors, into `out`. */
export function rawFeature(d: Omit<GrainMeta, "startSec" | "durSec">, out: Float32Array): void {
  out[0] = Math.log2(Math.max(40, Math.min(16000, d.centroidHz || 40)));
  out[1] = Math.log2(Math.max(PITCH_MIN_HZ, Math.min(4000, d.pitchHz)));
  out[2] = d.flatness;
  out[3] = Math.log2(Math.max(20, Math.min(12000, d.spreadHz || 20)));
  out[4] = Math.log(d.rms + 1e-4);
}

/** Normalize a raw feature row in place-ish → writes normalized values to `out`. */
export function normalizeFeature(raw: Float32Array, norm: FeatureNorm, out: Float32Array): void {
  for (let k = 0; k < FDIM; k++) {
    const lo = norm.lo[k];
    const hi = norm.hi[k];
    out[k] = hi - lo < 1e-6 ? 0.5 : Math.max(0, Math.min(1, (raw[k] - lo) / (hi - lo)));
  }
}

/** Project a NORMALIZED feature (dims 0,1) to atlas space, matching the corpus. */
export function projectPos(normCentroid: number, normPitch: number): [number, number] {
  return [normCentroid * 1.9 - 0.95, normPitch * 1.9 - 0.95];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/** Average all channels of an AudioBuffer to a single mono Float32Array. */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const out = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  if (ch > 1) for (let i = 0; i < len; i++) out[i] /= ch;
  return out;
}

/**
 * Slice + analyze + project the FIRST recording into a Corpus.
 *
 *   x  = spectral centroid (brightness), log-scaled + percentile-normalized
 *   y  = pitch / periodicity estimate, log-scaled + percentile-normalized
 *   feats = normalized [centroid, pitch, flatness, spread, rms] per grain
 */
export function buildCorpus(
  buffer: AudioBuffer,
  mono: Float32Array,
  sampleRate: number,
  label: string,
): Corpus {
  const len = mono.length;
  const usable = Math.max(0, len - FRAME);
  let hop = Math.floor(FRAME / 2);
  const estimate = Math.floor(usable / hop) + 1;
  if (estimate > MAX_GRAINS) hop = Math.ceil(usable / MAX_GRAINS);
  const count = Math.max(1, Math.floor(usable / hop) + 1);

  const grains: GrainMeta[] = [];
  const rawRows = new Float32Array(count * FDIM);
  const tmp = new Float32Array(FDIM);

  for (let i = 0; i < count; i++) {
    const startSample = i * hop;
    const d = analyzeFrame(mono, startSample, sampleRate);
    grains.push({ startSec: startSample / sampleRate, durSec: FRAME / sampleRate, ...d });
    rawFeature(d, tmp);
    rawRows.set(tmp, i * FDIM);
  }

  // Robust per-dimension normalization on the 2nd/98th percentiles.
  const lo = new Float32Array(FDIM);
  const hi = new Float32Array(FDIM);
  const col: number[] = new Array(count);
  for (let k = 0; k < FDIM; k++) {
    for (let i = 0; i < count; i++) col[i] = rawRows[i * FDIM + k];
    col.sort((a, b) => a - b);
    lo[k] = percentile(col, 0.02);
    hi[k] = percentile(col, 0.98);
  }
  const norm: FeatureNorm = { lo, hi };

  const n = grains.length;
  const positions = new Float32Array(n * 2);
  const colorT = new Float32Array(n);
  const loud = new Float32Array(n);
  const startSec = new Float32Array(n);
  const feats = new Float32Array(n * FDIM);
  const nrow = new Float32Array(FDIM);

  for (let i = 0; i < n; i++) {
    normalizeFeature(rawRows.subarray(i * FDIM, i * FDIM + FDIM), norm, nrow);
    feats.set(nrow, i * FDIM);
    const [px, py] = projectPos(nrow[0], nrow[1]);
    positions[i * 2] = px;
    positions[i * 2 + 1] = py;
    const nr = nrow[4]; // normalized loudness
    colorT[i] = Math.max(0, Math.min(1, 0.12 + 0.6 * nrow[0] + 0.34 * nr));
    loud[i] = nr;
    startSec[i] = grains[i].startSec;
  }

  return {
    buffer,
    grains,
    n,
    positions,
    colorT,
    loud,
    startSec,
    feats,
    norm,
    durSec: FRAME / sampleRate,
    hopSec: hop / sampleRate,
    label,
  };
}

// ── Default corpus (the "instrument"): tonal + noisy material, ~9 s. ──────────
// A warm low drone region, a bright shimmer region, and a breathy noise band so
// the corpus has rich timbral + pitch structure for a target melody to draw on.
function scheduleNote(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  dur: number,
  bright: number,
  attack: number,
  peak: number,
): void {
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * (bright > 0.6 ? 3.0 : 2.0);
  const modGain = ctx.createGain();
  const depth = freq * (1.5 + bright * 6);
  modGain.gain.setValueAtTime(depth, t);
  modGain.gain.exponentialRampToValueAtTime(Math.max(1, depth * 0.12), t + dur);
  mod.connect(modGain);
  modGain.connect(carrier.frequency);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(500 + bright * 5000, t);
  lp.frequency.exponentialRampToValueAtTime(350, t + dur);
  lp.Q.value = 0.5;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0004, t + dur);

  carrier.connect(lp);
  lp.connect(amp);
  amp.connect(ctx.destination);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

function scheduleBreath(ctx: OfflineAudioContext, t: number, dur: number, centerHz: number): void {
  // A short band-passed noise gust → a noisy, unvoiced region in the corpus.
  const frames = Math.ceil(ctx.sampleRate * dur);
  const nb = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = nb.getChannelData(0);
  const rng = mulberry32(0x51ade ^ Math.floor(centerHz));
  for (let i = 0; i < frames; i++) data[i] = rng() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = nb;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = centerHz;
  bp.Q.value = 1.2;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.09, t + dur * 0.3);
  amp.gain.exponentialRampToValueAtTime(0.0004, t + dur);
  src.connect(bp);
  bp.connect(amp);
  amp.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export async function renderDefaultCorpus(sampleRate: number): Promise<AudioBuffer> {
  const duration = 9.5;
  const OAC: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor-prefixed fallback for older Safari
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(1, Math.ceil(sampleRate * duration), sampleRate);
  const rng = mulberry32(0x3808);

  // C minor pentatonic across four octaves.
  const roots = [130.81, 174.61, 196.0, 233.08, 261.63];
  const scale: number[] = [];
  for (let oct = 0; oct < 4; oct++) for (const r of roots) scale.push(r * Math.pow(2, oct));

  // Low warm drones.
  let t = 0.0;
  for (let i = 0; i < 4; i++) {
    const f = scale[Math.floor(rng() * 4)];
    scheduleNote(ctx, t, f, 2.6, 0.12 + rng() * 0.15, 0.4 + rng() * 0.3, 0.16);
    t += 1.9 + rng() * 0.4;
  }
  // Bright plucky line drifting up in register.
  t = 0.6;
  while (t < duration - 0.8) {
    const reg = Math.min(scale.length - 1, Math.floor(rng() * scale.length));
    const f = scale[reg];
    const high = reg > scale.length * 0.55;
    const bright = high ? 0.55 + rng() * 0.4 : 0.15 + rng() * 0.35;
    const dur = high ? 0.28 + rng() * 0.5 : 0.6 + rng() * 0.9;
    const attack = high ? 0.004 + rng() * 0.02 : 0.03 + rng() * 0.12;
    scheduleNote(ctx, t, f, dur, bright, attack, 0.1 + rng() * 0.09);
    t += 0.22 + rng() * 0.4;
  }
  // A few breathy noise gusts → a noisy region for unvoiced target frames.
  for (let i = 0; i < 5; i++) {
    scheduleBreath(ctx, 0.8 + i * 1.7, 0.5 + rng() * 0.4, 900 + rng() * 3500);
  }

  return await ctx.startRendering();
}

// ── Seeded AUTO target: a deterministic melody the mosaic reconstructs. ───────
// A rising/falling sequence of glide tones — a clear PHRASE with pitch contour,
// so the reconstructed path visibly traces coherent motion through the corpus.
export async function renderAutoTarget(sampleRate: number): Promise<AudioBuffer> {
  const duration = 7.0;
  const OAC: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor-prefixed fallback for older Safari
    window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(1, Math.ceil(sampleRate * duration), sampleRate);
  const rng = mulberry32(0x70a1 ^ 0x3808);

  // A singable contour in C minor pentatonic (mid register).
  const notes = [261.63, 311.13, 349.23, 392.0, 466.16, 392.0, 349.23, 311.13, 261.63, 233.08];
  let t = 0.05;
  let prev = notes[0];
  for (let i = 0; t < duration - 0.4 && i < 32; i++) {
    const f = notes[i % notes.length] * (i > notes.length ? 1.5 : 1);
    const dur = 0.42 + rng() * 0.26;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(prev, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, f), t + 0.06);
    prev = f;
    // A gentle vowel-like formant so brightness varies with the line.
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(700 + (f / 261.63) * 700, t);
    bp.Q.value = 4;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(0.22, t + 0.05);
    amp.gain.setValueAtTime(0.22, t + dur - 0.12);
    amp.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    osc.connect(bp);
    bp.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    t += dur + 0.04 + rng() * 0.05;
  }

  return await ctx.startRendering();
}
