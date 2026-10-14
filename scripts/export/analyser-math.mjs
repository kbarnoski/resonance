// AnalyserNode math, reproduced offline (offline 4K export, docs/export-4k.md).
//
// Mirrors the Web Audio spec + Chromium's RealtimeAnalyser
// (third_party/blink/renderer/modules/webaudio/realtime_analyser.cc):
//   1. the last `fftSize` mono samples (stereo down-mixed 0.5·(L+R))
//   2. × Blackman window (alpha 0.16)
//   3. FFT, |X[k]| / fftSize                     (bin 0 = DC, packed Nyquist dropped)
//   4. smoothed: X̂[k] = τ·X̂_prev[k] + (1-τ)·|X[k]|  (non-finite → 0)
//   5. dB = 20·log10(X̂);  byte = trunc(255·(dB-min)/(max-min)), clamped 0..255
//   time domain bytes = trunc(128·(x+1)), clamped 0..255
//
// The app's settings (all of them, 2026-10-13 sweep): the shared engine
// analyser (src/lib/audio/audio-engine.ts) fftSize 256, smoothing 0.8,
// min/max dB at the defaults -100/-30. Every installation reader
// (visualizer, particle-lead-layer, live theatre) reads THAT node. The
// in-page stub reads fftSize/smoothing/min/max off the live node, so any
// other analyser config is reproduced too.
//
// CONSTRAINT: this file is concatenated into the page init script
// (build-init-script.mjs) — no imports, top-level `export function` only.

const blackmanCache = new Map();

/** Chromium's Blackman window (float32 like the C++ `p[i] *= float(window)`). */
export function blackmanWindow(n) {
  let w = blackmanCache.get(n);
  if (w) return w;
  w = new Float32Array(n);
  const alpha = 0.16;
  const a0 = 0.5 * (1 - alpha);
  const a1 = 0.5;
  const a2 = 0.5 * alpha;
  for (let i = 0; i < n; i++) {
    const x = i / n;
    w[i] = a0 - a1 * Math.cos(2 * Math.PI * x) + a2 * Math.cos(4 * Math.PI * x);
  }
  blackmanCache.set(n, w);
  return w;
}

/** In-place iterative radix-2 complex FFT (forward, unscaled). n must be a power of 2. */
export function fftInPlace(re, im) {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error(`fftInPlace: length ${n} is not a power of 2`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
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
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Unsmoothed linear magnitudes of one analysis window (oldest → newest
 * sample, length fftSize). Returns Float64Array(fftSize/2).
 */
export function analyserMagnitudes(samples, fftSize, out) {
  const n = fftSize;
  if (samples.length < n) throw new Error(`analyserMagnitudes: need ${n} samples, got ${samples.length}`);
  const w = blackmanWindow(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.fround(samples[i] * w[i]);
  fftInPlace(re, im);
  const bins = n >> 1;
  const mags = out && out.length === bins ? out : new Float64Array(bins);
  const scale = 1 / n;
  mags[0] = Math.abs(re[0]) * scale; // imag[0] holds the packed Nyquist in Chromium — zeroed
  for (let k = 1; k < bins; k++) mags[k] = Math.hypot(re[k], im[k]) * scale;
  return mags;
}

/** One smoothing step (in place on `prev`). */
export function smoothSpectrum(prev, mags, tau) {
  const t = Math.min(1, Math.max(0, Number.isFinite(tau) ? tau : 0.8));
  for (let k = 0; k < prev.length; k++) {
    const v = t * prev[k] + (1 - t) * mags[k];
    prev[k] = Number.isFinite(v) ? v : 0;
  }
  return prev;
}

/** getByteFrequencyData conversion. Writes min(out.length, bins) entries. */
export function toByteFrequency(smoothed, minDb, maxDb, out) {
  const range = maxDb === minDb ? 1 : 1 / (maxDb - minDb);
  const len = Math.min(out.length, smoothed.length);
  for (let k = 0; k < len; k++) {
    const mag = smoothed[k];
    const db = mag === 0 ? minDb : 20 * Math.log10(mag);
    let v = 255 * (db - minDb) * range;
    if (!(v > 0)) v = 0; // also NaN
    if (v > 255) v = 255;
    out[k] = v | 0;
  }
  return out;
}

/** getFloatFrequencyData conversion (dB; 0 → -Infinity like Chromium). */
export function toFloatFrequency(smoothed, out) {
  const len = Math.min(out.length, smoothed.length);
  for (let k = 0; k < len; k++) out[k] = 20 * Math.log10(smoothed[k]);
  return out;
}

/** getByteTimeDomainData conversion. */
export function toByteTimeDomain(samples, out) {
  const len = Math.min(out.length, samples.length);
  for (let i = 0; i < len; i++) {
    let v = 128 * (samples[i] + 1);
    if (!(v > 0)) v = 0;
    if (v > 255) v = 255;
    out[i] = v | 0;
  }
  return out;
}

/** getFloatTimeDomainData. */
export function toFloatTimeDomain(samples, out) {
  const len = Math.min(out.length, samples.length);
  for (let i = 0; i < len; i++) out[i] = samples[i];
  return out;
}

/**
 * Accumulate (+=) `gain ×` the `size` samples of `pcm` ending (exclusive)
 * at sample index `end` into `out`. Out-of-range samples are silence.
 */
export function mixWindow(pcm, end, size, gain, out) {
  const start = end - size;
  for (let i = 0; i < size; i++) {
    const idx = start + i;
    if (idx >= 0 && idx < pcm.length) out[i] += pcm[idx] * gain;
  }
  return out;
}

/** Interleaved PCM → mono, Web Audio "speakers" down-mix (mono copy, stereo 0.5·(L+R)). */
export function downmixInterleaved(interleaved, channels) {
  const frames = Math.floor(interleaved.length / channels);
  const mono = new Float32Array(frames);
  if (channels === 1) { mono.set(interleaved.subarray(0, frames)); return mono; }
  if (channels === 2) {
    for (let i = 0; i < frames; i++) mono[i] = 0.5 * (interleaved[2 * i] + interleaved[2 * i + 1]);
    return mono;
  }
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += interleaved[i * channels + c];
    mono[i] = s / channels;
  }
  return mono;
}

/** The sample index whose window ends at media time `t` (seconds). */
export function sampleIndexAt(t, sampleRate) {
  return Math.round(t * sampleRate);
}

/**
 * Offline precompute: the byte spectrum the app sees on each export frame,
 * one smoothing step per frame (= one analyser read per rendered frame).
 * Returns { bins, frames, data: Uint8Array(frames*bins) }.
 */
export function precomputeByteSpectra(pcm, sampleRate, opts) {
  const fftSize = opts.fftSize ?? 256;
  const smoothing = opts.smoothing ?? 0.8;
  const minDb = opts.minDecibels ?? -100;
  const maxDb = opts.maxDecibels ?? -30;
  const fps = opts.fps;
  const frames = opts.frames;
  const start = opts.startTime ?? 0;
  const bins = fftSize >> 1;
  const data = new Uint8Array(frames * bins);
  const prev = new Float64Array(bins);
  const win = new Float32Array(fftSize);
  const mags = new Float64Array(bins);
  for (let f = 0; f < frames; f++) {
    win.fill(0);
    mixWindow(pcm, sampleIndexAt(start + f / fps, sampleRate), fftSize, 1, win);
    analyserMagnitudes(win, fftSize, mags);
    smoothSpectrum(prev, mags, smoothing);
    toByteFrequency(prev, minDb, maxDb, data.subarray(f * bins, (f + 1) * bins));
  }
  return { bins, frames, data };
}
