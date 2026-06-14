// audio.ts — 583-piano-mosaic-field
//
// Source + corpus builder for the concatenative-musaicing instrument.
//
//   1. Source: fetch + decode Karel's real solo-piano recording, OR synthesise
//      a gentle evolving solo-piano-like fallback so we ALWAYS have an
//      AudioBuffer to decompose. The corpus build is identical either way —
//      the only difference is which buffer feeds it.
//   2. Corpus: slice the mono mix into overlapping Hann-windowed grains
//      (~120ms, 50% hop). For each grain precompute spectral centroid
//      (brightness), RMS (loudness) and a crude dominant pitch (spectral peak
//      with parabolic refinement). These features place each grain in the
//      2-D timbre field the visitor drags through.
//
// All client-side, Web Audio API only. No npm deps.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

/** One short overlapping grain of Karel's piano + its precomputed features. */
export interface Grain {
  /** Sample offset of this grain's start within the shared mono buffer. */
  start: number;
  /** Length in samples. */
  length: number;
  /** Spectral centroid mapped 0..1 (dark → bright). Field X axis. */
  brightness: number;
  /** Dominant pitch mapped 0..1 over the corpus pitch range. Field Y axis. */
  pitch: number;
  /** RMS loudness 0..1. */
  loudness: number;
  /** Estimated dominant frequency in Hz (informational). */
  hz: number;
}

/** The decoded corpus: an AudioBuffer plus the grain index over it. */
export interface Corpus {
  buffer: AudioBuffer;
  grains: Grain[];
  kind: AudioSourceKind;
}

// ─── Karel's piano fetch (JSON-{url} or raw bytes, 4s timeout) ─────────────────

async function fetchPianoBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    let bytes: ArrayBuffer;
    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      bytes = await r2.arrayBuffer();
    } else {
      bytes = await res.arrayBuffer();
    }
    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fallback: render a gentle evolving solo-piano-like buffer ─────────────────

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Render ~28s of warm diatonic/lydian solo piano into an OfflineAudioContext.
 * Each note is a few detuned partials with a soft percussive (hammer) envelope.
 * The result is an AudioBuffer we decompose exactly like the real recording.
 */
async function renderFallbackBuffer(sampleRate: number): Promise<AudioBuffer> {
  const dur = 28;
  const offline = new OfflineAudioContext(1, Math.ceil(dur * sampleRate), sampleRate);

  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  // Lydian-flavoured pool, warm mid register (C lydian: C D E F# G A B).
  const pool = [48, 50, 52, 54, 55, 57, 59, 60, 62, 64, 66, 67, 69, 71, 72, 74, 76];

  const partials = [
    { mul: 1.0, gain: 1.0 },
    { mul: 2.0, gain: 0.42 },
    { mul: 3.01, gain: 0.18 },
    { mul: 4.02, gain: 0.08 },
  ];

  // Soft slow pad bed for spectral continuity between notes.
  for (const m of [36, 43, 48]) {
    const o = offline.createOscillator();
    o.type = "sine";
    o.frequency.value = midiToHz(m);
    const g = offline.createGain();
    g.gain.value = 0.035;
    o.connect(g);
    g.connect(master);
    o.start(0);
    o.stop(dur);
  }

  // Schedule overlapping arpeggio-ish notes, drifting up and down the pool.
  let t = 0.15;
  let idx = pool.length >> 1;
  let dir = 1;
  while (t < dur - 1.2) {
    idx += dir * (1 + (Math.random() < 0.4 ? 1 : 0));
    if (idx >= pool.length - 1) { idx = pool.length - 1; dir = -1; }
    if (idx <= 0) { idx = 0; dir = 1; }
    if (Math.random() < 0.15) dir *= -1;

    const midi = pool[idx] + (Math.random() < 0.2 ? 12 : 0);
    const f0 = midiToHz(midi);
    const vel = 0.5 + Math.random() * 0.5;
    const noteGain = offline.createGain();
    const peak = 0.16 * vel;
    const a = 0.006;
    const d = 1.6 + Math.random() * 1.4;
    noteGain.gain.setValueAtTime(0.0001, t);
    noteGain.gain.exponentialRampToValueAtTime(peak, t + a);
    noteGain.gain.exponentialRampToValueAtTime(0.0008, t + a + d);
    noteGain.connect(master);

    for (const p of partials) {
      const o = offline.createOscillator();
      o.type = p.mul === 1 ? "triangle" : "sine";
      o.frequency.value = f0 * p.mul * (1 + (Math.random() - 0.5) * 0.004);
      const g = offline.createGain();
      g.gain.value = p.gain;
      o.connect(g);
      g.connect(noteGain);
      o.start(t);
      o.stop(t + a + d + 0.05);
    }

    // Occasional simultaneous lower note for harmony / spectral variety.
    if (Math.random() < 0.35) {
      const lf = midiToHz(pool[Math.max(0, idx - 4)] - 12);
      const o = offline.createOscillator();
      o.type = "sine";
      o.frequency.value = lf;
      const g = offline.createGain();
      g.gain.value = 0.0001;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * vel, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 2.4);
    }

    t += 0.28 + Math.random() * 0.5;
  }

  return await offline.startRendering();
}

// ─── Mono mix ──────────────────────────────────────────────────────────────────

function toMono(buffer: AudioBuffer): Float32Array {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  const inv = 1 / Math.max(1, ch);
  for (let i = 0; i < n; i++) out[i] *= inv;
  return out;
}

// ─── Grain feature extraction ──────────────────────────────────────────────────

/** Next power of two >= n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place radix-2 Cooley–Tukey FFT on interleaved-free split real/imag arrays.
 * re/im length must be a power of two. Used per grain to get a magnitude
 * spectrum for centroid + pitch.
 */
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
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

interface BuildOpts {
  grainMs?: number;
  hopFraction?: number;
  maxGrains?: number;
}

/**
 * Decompose a mono signal into overlapping grains with precomputed features.
 * Quiet grains are skipped; the corpus is capped (evenly subsampled) so
 * real-time matching stays cheap.
 */
export function buildGrains(
  mono: Float32Array,
  sampleRate: number,
  opts: BuildOpts = {},
): Grain[] {
  const grainMs = opts.grainMs ?? 120;
  const hopFraction = opts.hopFraction ?? 0.5;
  const maxGrains = opts.maxGrains ?? 1000;

  const grainLen = Math.max(256, Math.round((grainMs / 1000) * sampleRate));
  const hop = Math.max(1, Math.round(grainLen * hopFraction));
  const fftN = nextPow2(grainLen);

  // Precompute Hann window over the analysis frame.
  const win = new Float32Array(grainLen);
  for (let i = 0; i < grainLen; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainLen - 1));
  }

  const re = new Float32Array(fftN);
  const im = new Float32Array(fftN);

  const raw: Grain[] = [];
  let maxRms = 1e-6;

  for (let s = 0; s + grainLen <= mono.length; s += hop) {
    // RMS over the windowed grain.
    let sumSq = 0;
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < grainLen; i++) {
      const v = mono[s + i] * win[i];
      re[i] = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / grainLen);
    if (rms < 0.0015) continue; // skip near-silence

    fft(re, im);

    // Magnitude spectrum → centroid + spectral peak (parabolic refine).
    const half = fftN >> 1;
    let magSum = 0;
    let weighted = 0;
    let peakBin = 1;
    let peakMag = 0;
    for (let k = 1; k < half; k++) {
      const mag = Math.hypot(re[k], im[k]);
      magSum += mag;
      weighted += mag * k;
      if (mag > peakMag) { peakMag = mag; peakBin = k; }
    }
    const centroidBin = magSum > 1e-9 ? weighted / magSum : 1;

    // Parabolic interpolation around the peak for a finer pitch estimate.
    let refined = peakBin;
    if (peakBin > 1 && peakBin < half - 1) {
      const m0 = Math.hypot(re[peakBin - 1], im[peakBin - 1]);
      const m1 = peakMag;
      const m2 = Math.hypot(re[peakBin + 1], im[peakBin + 1]);
      const denom = m0 - 2 * m1 + m2;
      if (Math.abs(denom) > 1e-9) refined = peakBin + (0.5 * (m0 - m2)) / denom;
    }
    const hz = (refined * sampleRate) / fftN;
    const centroidHz = (centroidBin * sampleRate) / fftN;

    raw.push({
      start: s,
      length: grainLen,
      brightness: centroidHz, // remap below
      pitch: hz,              // remap below
      loudness: rms,
      hz,
    });
    if (rms > maxRms) maxRms = rms;
  }

  if (raw.length === 0) return raw;

  // Normalise features into 0..1. Brightness uses log centroid (perceptual);
  // pitch uses log-Hz clamped to a musical band; loudness relative to corpus.
  let minLogC = Infinity, maxLogC = -Infinity;
  let minLogP = Infinity, maxLogP = -Infinity;
  for (const g of raw) {
    const lc = Math.log2(Math.max(40, g.brightness));
    const lp = Math.log2(Math.max(40, Math.min(4000, g.pitch)));
    if (lc < minLogC) minLogC = lc; if (lc > maxLogC) maxLogC = lc;
    if (lp < minLogP) minLogP = lp; if (lp > maxLogP) maxLogP = lp;
  }
  const cSpan = Math.max(0.001, maxLogC - minLogC);
  const pSpan = Math.max(0.001, maxLogP - minLogP);
  for (const g of raw) {
    const lc = Math.log2(Math.max(40, g.brightness));
    const lp = Math.log2(Math.max(40, Math.min(4000, g.pitch)));
    g.brightness = (lc - minLogC) / cSpan;
    g.pitch = (lp - minLogP) / pSpan;
    g.loudness = Math.min(1, g.loudness / maxRms);
  }

  // Cap by even subsampling to keep matching cheap.
  if (raw.length <= maxGrains) return raw;
  const stride = raw.length / maxGrains;
  const capped: Grain[] = [];
  for (let i = 0; i < maxGrains; i++) capped.push(raw[Math.floor(i * stride)]);
  return capped;
}

// ─── Public: obtain a corpus (real piano or fallback) ──────────────────────────

/**
 * Resolve the audio source and build the grain corpus. Tries Karel's real
 * recording first; on any failure or timeout, renders the synth fallback.
 * Always resolves with a usable corpus.
 */
export async function buildCorpus(ctx: AudioContext): Promise<Corpus> {
  let buffer = await fetchPianoBuffer(ctx);
  let kind: AudioSourceKind = "piano";
  if (!buffer) {
    buffer = await renderFallbackBuffer(ctx.sampleRate);
    kind = "fallback";
  }
  const mono = toMono(buffer);
  const grains = buildGrains(mono, buffer.sampleRate, {
    grainMs: 120,
    hopFraction: 0.5,
    maxGrains: 1000,
  });
  // If a real buffer somehow yielded an empty corpus, fall back.
  if (grains.length < 16 && kind === "piano") {
    buffer = await renderFallbackBuffer(ctx.sampleRate);
    kind = "fallback";
    const m2 = toMono(buffer);
    return {
      buffer,
      kind,
      grains: buildGrains(m2, buffer.sampleRate, { grainMs: 120, hopFraction: 0.5, maxGrains: 1000 }),
    };
  }
  return { buffer, grains, kind };
}
