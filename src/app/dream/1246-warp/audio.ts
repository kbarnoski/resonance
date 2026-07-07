// audio.ts — real-recording loader + offline fallback + a playback/analysis
// engine for 1246 · warp. The loom weaves whatever this is playing.
//
// Graph:  BufferSource → gain(0.5) → AnalyserNode → DynamicsCompressor(limiter)
//         → destination.  Per weft pass we read AnalyserNode.getFloatFrequencyData
//         and fold the spectrum into log-frequency band energies.
//
// This is a READ-ONLY use of the existing public GET /api/audio/<id> route. No
// mic, no new API route, no recording, no guard needed.

import { mulberry32 } from "./loom";

/** Karel's real solo-piano recording (existing read-only route). */
export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

/**
 * Fetch the recording into an AudioBuffer via the existing read-only route.
 * Handles both response shapes: JSON `{url}` (fetch that for bytes) or raw
 * audio bytes. Returns null on ANY failure so the caller falls back gracefully.
 */
export async function fetchPianoBuffer(
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
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

// ─── Offline fallback: a gentle ~14s pentatonic piano sketch ─────────────────
// Detuned partials + a soft hammer transient per note, over a warm pentatonic
// phrase, so the loom always has real harmonic content across the bands.

const FB_ROOT_HZ = 174.61; // F3
// C-ish pentatonic degrees (semitones) meandering across ~2 octaves.
const FB_PHRASE = [0, 3, 7, 10, 12, 15, 12, 10, 7, 12, 15, 19, 15, 12, 7, 3];

export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 14;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtor: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtor(1, length, sampleRate);
  const rand = mulberry32(0x1246a0d1);

  const noteSecs = durationSecs / FB_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FB_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs + (rand() - 0.5) * 0.02;
    const freq = FB_ROOT_HZ * Math.pow(2, semi / 12);

    // harmonic body
    const bodyGain = offline.createGain();
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.linearRampToValueAtTime(0.85, start + 0.025);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + noteSecs * 2.6);
    bodyGain.connect(master);

    const partials = [
      { mult: 1, gain: 0.5, type: "triangle" as OscillatorType },
      { mult: 2, gain: 0.22, type: "sine" as OscillatorType },
      { mult: 3, gain: 0.12, type: "sine" as OscillatorType },
      { mult: 4.02, gain: 0.06, type: "sine" as OscillatorType },
      { mult: 5.99, gain: 0.03, type: "sine" as OscillatorType },
    ];
    partials.forEach((p) => {
      const osc = offline.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      osc.detune.value = (rand() - 0.5) * 7;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(bodyGain);
      osc.start(start);
      osc.stop(start + noteSecs * 2.8);
    });

    // soft hammer transient — a short filtered noise burst for onset texture
    const nlen = Math.floor(sampleRate * 0.03);
    const noiseBuf = offline.createBuffer(1, nlen, sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let n = 0; n < nlen; n++) nd[n] = (rand() * 2 - 1) * (1 - n / nlen);
    const noise = offline.createBufferSource();
    noise.buffer = noiseBuf;
    const nf = offline.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = freq * 3;
    nf.Q.value = 0.7;
    const ng = offline.createGain();
    ng.gain.value = 0.12;
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(start);
    noise.stop(start + 0.05);
  });

  return await offline.startRendering();
}

// ─── Playback + analysis engine ──────────────────────────────────────────────

const F_MIN = 55; // A1
const F_MAX = 8000;
const DB_FLOOR = -92;
const DB_CEIL = -26;

export class WeaveAudio {
  readonly ctx: AudioContext;
  private analyser: AnalyserNode;
  private masterGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private source: AudioBufferSourceNode | null = null;
  private spectrum: Float32Array<ArrayBuffer>;
  private started = false;
  private paused = false;

  constructor() {
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -10;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    // source → gain → analyser → limiter → destination
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    this.spectrum = new Float32Array(this.analyser.frequencyBinCount);
  }

  /** Start looped playback of a decoded buffer (call from a user gesture). */
  async start(buffer: AudioBuffer): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.masterGain);
    src.start();
    this.source = src;
    this.started = true;
    this.paused = false;
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  isStarted(): boolean {
    return this.started;
  }
  isPaused(): boolean {
    return this.paused;
  }

  /** Toggle play/pause by suspending/resuming the context. */
  async togglePause(): Promise<boolean> {
    if (!this.started) return this.paused;
    if (this.paused) {
      await this.ctx.resume();
      this.paused = false;
    } else {
      await this.ctx.suspend();
      this.paused = true;
    }
    return this.paused;
  }

  /**
   * Fold the current spectrum into `out.length` log-frequency band energies in
   * 0..1. out[0] = lowest band (bass), out[n-1] = highest (treble).
   */
  getBandEnergies(out: Float32Array): void {
    const a = this.analyser;
    a.getFloatFrequencyData(this.spectrum);
    const bins = this.spectrum.length;
    const nyquist = this.ctx.sampleRate / 2;
    const bands = out.length;
    for (let b = 0; b < bands; b++) {
      const fLo = F_MIN * Math.pow(F_MAX / F_MIN, b / bands);
      const fHi = F_MIN * Math.pow(F_MAX / F_MIN, (b + 1) / bands);
      let lo = Math.floor((fLo / nyquist) * bins);
      let hi = Math.ceil((fHi / nyquist) * bins);
      lo = Math.max(0, Math.min(bins - 1, lo));
      hi = Math.max(lo + 1, Math.min(bins, hi));
      let sum = 0;
      for (let i = lo; i < hi; i++) {
        const db = this.spectrum[i];
        const norm = (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR);
        sum += norm < 0 ? 0 : norm > 1 ? 1 : norm;
      }
      let e = sum / (hi - lo);
      // gentle treble lift (piano highs are quieter) + perceptual shaping
      e *= 1 + 0.5 * (b / bands);
      e = Math.pow(Math.max(0, Math.min(1, e)), 0.8);
      out[b] = e;
    }
  }

  async dispose(): Promise<void> {
    this.stopSource();
    try {
      this.masterGain.disconnect();
      this.analyser.disconnect();
      this.limiter.disconnect();
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
