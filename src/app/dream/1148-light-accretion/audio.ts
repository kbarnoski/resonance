// audio.ts — real-audio loader + realtime analysis, in three tiers so the piece
// is never blank or silent:
//   1. paste a Path recording id  → fetch the EXISTING read-only GET /api/audio/<id>
//   2. drop / choose a local file → decode it
//   3. synth fallback             → offline-rendered gentle piano arpeggio
// Playback runs through a synthesized reverb tail → a compressor/limiter →
// destination. Per-frame it exposes RMS energy, spectral flux (onset strength)
// and spectral centroid (brightness), which drive deposits into the field.
//
// READ-ONLY of an existing public GET route. No mic, no new API, no recording.

import { mulberry32 } from "./field";

/** Karel's real "Welcome Home" solo-piano recording (read-only existing route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "recording" | "file" | "fallback";

export interface AudioFrame {
  energy: number; // 0..1 overall RMS
  flux: number; // 0..1 onset strength (positive spectral flux)
  centroid: number; // 0..1 spectral brightness
}

/**
 * Fetch a Path recording into an AudioBuffer via the existing read-only route.
 * Handles both response shapes: JSON `{url}` (fetch that for bytes) or raw audio
 * bytes. Returns null on ANY failure so the caller can fall back gracefully.
 */
export async function fetchRecordingBuffer(
  ctx: BaseAudioContext,
  id: string,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`/api/audio/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    let arrayBuf: ArrayBuffer;

    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      arrayBuf = await r2.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }

    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Decode a user-dropped / picked file into an AudioBuffer. Null on failure. */
export async function decodeFileBuffer(
  ctx: BaseAudioContext,
  file: File,
): Promise<AudioBuffer | null> {
  try {
    const arrayBuf = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuf);
  } catch {
    return null;
  }
}

// ─── Tier 3: offline-rendered gentle piano-ish arpeggio ──────────────────────

const FALLBACK_ROOT_HZ = 196; // G3 — warm, low
// A slow ascending/descending arpeggio over an open, consonant voicing.
const FALLBACK_PHRASE = [0, 4, 7, 11, 12, 16, 12, 11, 7, 4, 7, 12, 16, 19, 16, 12];

/**
 * Render a gentle ~16s detuned-partial "piano" arpeggio through an
 * OfflineAudioContext so tier 3 always has real harmonic + percussive content.
 * Deterministic — timing/detune jitter from a seeded PRNG.
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 16;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtx: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, sampleRate);
  const rand = mulberry32(0x0f0cc12e);

  const noteSecs = durationSecs / FALLBACK_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.85;
  master.connect(offline.destination);

  FALLBACK_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs + (rand() - 0.5) * 0.02;
    const freq = FALLBACK_ROOT_HZ * Math.pow(2, semi / 12);
    const partials = [
      { mult: 1, gain: 0.5, detune: (rand() - 0.5) * 3 },
      { mult: 2, gain: 0.2, detune: (rand() - 0.5) * 6 },
      { mult: 3, gain: 0.1, detune: (rand() - 0.5) * 8 },
      { mult: 4.01, gain: 0.05, detune: (rand() - 0.5) * 10 },
    ];
    const bodyGain = offline.createGain();
    // Soft attack, long-ish decay — a bell/piano-ish envelope.
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.linearRampToValueAtTime(0.9, start + 0.03);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + noteSecs * 2.4);
    bodyGain.connect(master);

    partials.forEach((p) => {
      const osc = offline.createOscillator();
      osc.type = p.mult === 1 ? "triangle" : "sine";
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(bodyGain);
      osc.start(start);
      osc.stop(start + noteSecs * 2.6);
    });
  });

  return await offline.startRendering();
}

// ─── Playback + realtime analysis engine ─────────────────────────────────────

/** Build a short synthesized impulse response for a soft cathedral reverb. */
function buildImpulse(ctx: AudioContext, seconds = 2.6): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const impulse = ctx.createBuffer(2, len, rate);
  const rand = mulberry32(0x51e5b0ba);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponentially decaying diffuse noise tail.
      d[i] = (rand() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
  }
  return impulse;
}

/**
 * Manages the playback graph and per-frame analysis:
 *   source → [dry + convolver wet] → compressor(limiter) → analyser → destination
 * Call start() from a user gesture (autoplay is gated). getFrame() each RAF.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private analyser: AnalyserNode;
  private compressor: DynamicsCompressorNode;
  private convolver: ConvolverNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private freq: Uint8Array<ArrayBuffer>;
  private prevMag: Float32Array;
  private started = false;

  constructor() {
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    this.compressor = this.ctx.createDynamicsCompressor();
    // Gentle limiter — protect the reverb tail from clipping without pumping.
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.28;

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = buildImpulse(this.ctx);

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.78;
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.42;

    // Wire the shared tail: dry + wet → compressor → analyser → destination.
    this.dryGain.connect(this.compressor);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.prevMag = new Float32Array(this.analyser.frequencyBinCount);
  }

  /** Begin playback of a decoded buffer. Resumes the context (gesture-gated). */
  async start(buffer: AudioBuffer, loop = true): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(this.dryGain);
    src.connect(this.convolver);
    src.start();
    this.source = src;
    this.started = true;
  }

  isStarted(): boolean {
    return this.started;
  }

  /**
   * Per-frame analysis → drive signals for the field. Reads the frequency
   * spectrum once and derives RMS energy, positive spectral flux (onset
   * strength) and spectral centroid (brightness), each normalized to ~0..1.
   */
  getFrame(): AudioFrame {
    const a = this.analyser;
    const bins = this.freq;
    a.getByteFrequencyData(bins);

    let sum = 0;
    let weighted = 0;
    let flux = 0;
    let energy = 0;
    for (let i = 0; i < bins.length; i++) {
      const mag = bins[i] / 255;
      energy += mag * mag;
      sum += mag;
      weighted += mag * i;
      const diff = mag - this.prevMag[i];
      if (diff > 0) flux += diff;
      this.prevMag[i] = mag;
    }

    const rms = Math.sqrt(energy / bins.length);
    // Centroid in [0,1] over the spectrum → maps to musical register/brightness.
    const centroidBin = sum > 1e-4 ? weighted / sum : 0;
    const centroid = centroidBin / bins.length;
    // Normalize / shape the raw signals into perceptual 0..1.
    return {
      energy: clamp01(rms * 3.2),
      flux: clamp01(flux / (bins.length * 0.08)),
      centroid: clamp01(centroid * 4.0),
    };
  }

  /** Frequency (Hz) of the loudest bin — a small live readout, not load-bearing. */
  peakHz(): number {
    const bins = this.freq;
    let maxV = 0;
    let maxI = 0;
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > maxV) {
        maxV = bins[i];
        maxI = i;
      }
    }
    const nyquist = this.ctx.sampleRate / 2;
    return (maxI / bins.length) * nyquist;
  }

  /** Clean teardown: stop source, disconnect nodes, close context. */
  async dispose(): Promise<void> {
    try {
      if (this.source) {
        this.source.stop();
        this.source.disconnect();
      }
    } catch {
      /* already stopped */
    }
    try {
      this.dryGain.disconnect();
      this.wetGain.disconnect();
      this.convolver.disconnect();
      this.compressor.disconnect();
      this.analyser.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (this.ctx.state !== "closed") await this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
