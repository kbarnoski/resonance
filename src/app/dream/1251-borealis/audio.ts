// audio.ts — real-recording loader + offline fallback + the tunnel audio engine
// for 1251 · borealis. The forward journey INTO the light is driven by Karel's
// real piano energy read off an AnalyserNode.
//
// Graph:
//   BufferSource(loop) → VoidReverb(cavernous tunnel space) → pianoGain
//       → AnalyserNode → masterGain(~0.45) → DynamicsCompressor(limiter) → dest
//   Shepard(endless rise) + DroneBank(sustaining pad) → bedGain → masterGain
//
// The piano energy (AnalyserNode) modulates forward speed / core brightness /
// density in the shader; loud passages surge you forward, quiet passages let the
// light settle. The Shepard tone is the auditory analog of endless forward
// motion; the drone sustains the space; the void reverb puts the piano in the
// cavernous tunnel. This is a READ-ONLY use of the existing public GET
// /api/audio/<id> route — no mic, no new API route, no guard.

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

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

// Small deterministic RNG (loom lives in another folder, so inline it here to
// keep this piece self-contained — the only cross-folder imports allowed are
// from _shared/).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Offline fallback: a gentle ~14s pentatonic piano sketch ─────────────────
// Detuned partials + a soft hammer transient per note over a warm pentatonic
// phrase, so the analyser always has real harmonic content to drive the march.

const FB_ROOT_HZ = 174.61; // F3
const FB_PHRASE = [0, 3, 7, 10, 12, 15, 12, 10, 7, 12, 15, 19, 15, 12, 7, 3];

export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 14;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtor: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtor(1, length, sampleRate);
  const rand = mulberry32(0x1251b0d1);

  const noteSecs = durationSecs / FB_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FB_PHRASE.forEach((semi, i) => {
    const start = i * noteSecs + (rand() - 0.5) * 0.02;
    const freq = FB_ROOT_HZ * Math.pow(2, semi / 12);

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

// ─── Tunnel audio engine ─────────────────────────────────────────────────────

export class TunnelAudio {
  readonly ctx: AudioContext;
  private analyser: AnalyserNode;
  private masterGain: GainNode;
  private bedGain: GainNode;
  private pianoGain: GainNode;
  private limiter: DynamicsCompressorNode;
  private reverb: VoidReverb;
  private shepard: ShepardEngine;
  private drone: DroneBank;
  private source: AudioBufferSourceNode | null = null;
  private freq: Float32Array<ArrayBuffer>;
  private energy = 0;
  private started = false;
  private paused = false;

  constructor() {
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();

    // final limiter → destination
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.limiter.connect(this.ctx.destination);

    // modest master behind the limiter
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.45;
    this.masterGain.connect(this.limiter);

    // piano bus: source → reverb → pianoGain → analyser → master
    this.pianoGain = this.ctx.createGain();
    this.pianoGain.gain.value = 1.0;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.minDecibels = -100;
    this.analyser.maxDecibels = -10;

    this.reverb = createVoidReverb(this.ctx, { seconds: 5, decay: 2.6, wet: 0.42 });
    this.reverb.output.connect(this.pianoGain);
    this.pianoGain.connect(this.analyser);
    this.analyser.connect(this.masterGain);

    // shared psych bed: endless-rising Shepard + sustaining drone pad
    this.bedGain = this.ctx.createGain();
    this.bedGain.gain.value = 0.7;
    this.bedGain.connect(this.masterGain);

    this.shepard = startShepard(this.ctx, this.bedGain, {
      dir: 1,
      peakGain: 0.34,
      driveRate: 0.14,
      centerOct: 4.2,
    });
    this.drone = startDroneBank(this.ctx, this.bedGain, {
      root: 41.2, // E1 — a deep cavern floor
      peakGain: 0.26,
      cutoffLow: 180,
      cutoffHigh: 2200,
    });

    this.freq = new Float32Array(this.analyser.frequencyBinCount);
  }

  /** Start looped playback of a decoded buffer (call from a user gesture). */
  async start(buffer: AudioBuffer): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(this.reverb.input);
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

  /** Advance the Shepard glissando; call once per frame with dt seconds. */
  step(dt: number): void {
    this.shepard.step(dt);
  }

  /** Set the 0..1 journey drive (energy + approach) into the bed. */
  setDrive(d: number): void {
    const drive = Math.min(1, Math.max(0, d));
    this.shepard.setDrive(drive);
    this.drone.setDrive(drive * 0.9);
  }

  /** Read the current smoothed piano energy 0..1 (drives the forward march). */
  sample(): number {
    this.analyser.getFloatFrequencyData(this.freq);
    const bins = this.freq.length;
    const nyq = this.ctx.sampleRate / 2;
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < bins; i++) {
      const f = (i / bins) * nyq;
      if (f < 50 || f > 5000) continue;
      const db = this.freq[i];
      let n = (db - -88) / (-24 - -88);
      n = n < 0 ? 0 : n > 1 ? 1 : n;
      sum += n;
      cnt++;
    }
    const raw = cnt ? sum / cnt : 0;
    const e = Math.pow(raw, 0.85);
    this.energy += (e - this.energy) * 0.12;
    return this.energy;
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

  async dispose(): Promise<void> {
    this.stopSource();
    try {
      this.shepard.stop();
    } catch {
      /* ignore */
    }
    try {
      this.drone.stop();
    } catch {
      /* ignore */
    }
    try {
      this.reverb.input.disconnect();
      this.reverb.output.disconnect();
      this.pianoGain.disconnect();
      this.analyser.disconnect();
      this.bedGain.disconnect();
      this.masterGain.disconnect();
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
