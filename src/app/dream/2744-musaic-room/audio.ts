// ─── musaic-room · audio engine ──────────────────────────────────────────────
// Captures live mic PCM in fixed grains, extracts real features, grows a corpus
// of past grains, and — for each incoming grain — plays back its nearest past
// match instead of the present sound. The room rebuilds the present from its own
// memory. Web Audio API only; no ML, no network.

import {
  extractFeatures,
  findNearest,
  makeFftScratch,
  makeRng,
  normalizeFeatures,
  type FeatureVec,
  type FftScratch,
  type Grain,
} from "./dsp";

export const GRAIN_SIZE = 4096; // samples ≈ 93 ms @ 44.1 kHz (a ScriptProcessor block)
export const CORPUS_CAP = 600; // grains remembered before oldest is evicted
const EXCLUDE_MS = 1000; // don't match anything heard in the last ~second
const SILENCE_RMS = 0.006; // below this a grain is treated as silence (skipped)
const EDGE_FADE = 220; // samples of cosine fade at each grain edge (anti-click)
const OUT_GAIN = 0.85; // per-grain playback gain
const MASTER_GAIN = 0.6; // master bus gain (kept modest to tame mic feedback)

export type SourceKind = "mic" | "demo";

export interface EngineStatus {
  running: boolean;
  source: SourceKind | null;
  error: string | null;
}

/** Live snapshot the render loop reads every frame. */
export interface EngineSnapshot {
  corpus: Grain[];
  query: FeatureVec | null;
  match: Grain | null;
  source: SourceKind | null;
}

type WebkitWindow = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

export class MusaicEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private srcNode: AudioNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private master: GainNode | null = null;
  private lowpass: BiquadFilterNode | null = null;

  private fft: FftScratch = makeFftScratch(GRAIN_SIZE);
  private rng = makeRng(0x2744);

  private corpus: Grain[] = [];
  private nextId = 0;
  private query: FeatureVec | null = null;
  private match: Grain | null = null;
  private source: SourceKind | null = null;

  private onStatus: (s: EngineStatus) => void;

  constructor(onStatus: (s: EngineStatus) => void) {
    this.onStatus = onStatus;
  }

  snapshot(): EngineSnapshot {
    return {
      corpus: this.corpus,
      query: this.query,
      match: this.match,
      source: this.source,
    };
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const w = window as WebkitWindow;
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 7000; // shave harsh grain edges a touch
    lowpass.connect(master).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.lowpass = lowpass;
    return ctx;
  }

  /** Build the shared processor + routing once a source node exists. */
  private wireProcessor(ctx: AudioContext, src: AudioNode): void {
    const processor = ctx.createScriptProcessor(GRAIN_SIZE, 1, 1);
    processor.onaudioprocess = (ev) => this.onGrain(ev);
    // The processor must reach destination to run; mute that path so the raw
    // input is never heard — only the reconstructed mosaic is.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(processor);
    processor.connect(mute).connect(ctx.destination);
    this.srcNode = src;
    this.processor = processor;
  }

  private onGrain(ev: AudioProcessingEvent): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const input = ev.inputBuffer.getChannelData(0);
    const sr = ctx.sampleRate;

    const raw = extractFeatures(input, sr, this.fft);
    const vec = normalizeFeatures(raw);
    this.query = vec;

    // Silence gate — don't remember or reconstruct dead air.
    if (raw.rms < SILENCE_RMS) {
      this.match = null;
      return;
    }

    const now = performance.now();
    const idx = findNearest(this.corpus, vec, now, EXCLUDE_MS);
    const matched = idx >= 0 ? this.corpus[idx] : null;
    this.match = matched;

    if (matched) this.playGrain(ctx, matched.pcm, sr);

    // Remember the present grain so future moments can be built from it.
    const pcm = new Float32Array(GRAIN_SIZE);
    pcm.set(input);
    this.corpus.push({ id: this.nextId++, bornAt: now, pcm, vec });
    if (this.corpus.length > CORPUS_CAP) this.corpus.shift();
  }

  private playGrain(ctx: AudioContext, pcm: Float32Array, sr: number): void {
    const buf = ctx.createBuffer(1, pcm.length, sr);
    const ch = buf.getChannelData(0);
    const n = pcm.length;
    for (let i = 0; i < n; i++) {
      let env = 1;
      if (i < EDGE_FADE) env = 0.5 - 0.5 * Math.cos((Math.PI * i) / EDGE_FADE);
      else if (i > n - EDGE_FADE)
        env = 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / EDGE_FADE);
      ch[i] = pcm[i] * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = OUT_GAIN;
    src.connect(g).connect(this.lowpass ?? ctx.destination);
    src.start();
  }

  /** Start with the live microphone. Falls back to the demo source on failure. */
  async startMic(): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) {
      this.onStatus({
        running: false,
        source: null,
        error: "This browser has no Web Audio support.",
      });
      return;
    }
    await ctx.resume();

    const md =
      typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || !md.getUserMedia) {
      this.startDemo(
        "No microphone available — playing an internal demo source through the same pipeline.",
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      this.startDemo(
        "Microphone blocked or unavailable — playing an internal demo source instead.",
      );
      return;
    }

    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    this.wireProcessor(ctx, src);
    this.source = "mic";
    this.onStatus({ running: true, source: "mic", error: null });
  }

  /** Start with a deterministic internal source (no mic required). */
  startDemo(error: string | null = null): void {
    const ctx = this.ensureCtx();
    if (!ctx) {
      this.onStatus({
        running: false,
        source: null,
        error: "This browser has no Web Audio support.",
      });
      return;
    }
    void ctx.resume();
    const src = this.makeDemoSource(ctx);
    this.wireProcessor(ctx, src);
    this.source = "demo";
    this.onStatus({ running: true, source: "demo", error });
  }

  /** A looping, evolving buffer of tones + noise bursts. Deterministic
   *  (mulberry32-seeded) so the piece is reproducible without a mic. It is
   *  never heard directly — the pipeline reconstructs it from its own past. */
  private makeDemoSource(ctx: AudioContext): AudioBufferSourceNode {
    const sr = ctx.sampleRate;
    const seconds = 14;
    const len = Math.floor(seconds * sr);
    const buf = ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    const rng = this.rng;

    // A wandering set of partials, re-chosen every ~0.6 s, plus sparse
    // noise/click events so brightness + loudness features genuinely vary.
    const stepLen = Math.floor(0.6 * sr);
    let f0 = 110 + rng() * 90;
    let f1 = f0 * (1.5 + rng());
    let amp = 0.2 + rng() * 0.2;
    let noiseUntil = 0;
    let phase0 = 0;
    let phase1 = 0;
    for (let i = 0; i < len; i++) {
      if (i % stepLen === 0) {
        f0 = 90 + rng() * 260;
        f1 = f0 * (1.4 + rng() * 2.2);
        amp = 0.12 + rng() * 0.28;
        if (rng() > 0.55) noiseUntil = i + Math.floor((0.05 + rng() * 0.2) * sr);
      }
      phase0 += (2 * Math.PI * f0) / sr;
      phase1 += (2 * Math.PI * f1) / sr;
      let s = Math.sin(phase0) * amp + Math.sin(phase1) * amp * 0.5;
      if (i < noiseUntil) s += (rng() * 2 - 1) * 0.4;
      // Gentle amplitude breathing so silence gate sometimes engages.
      s *= 0.55 + 0.45 * Math.sin((2 * Math.PI * i) / (sr * 3.7));
      ch[i] = s * 0.7;
    }

    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = true;
    node.start();
    return node;
  }

  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.srcNode) {
      try {
        this.srcNode.disconnect();
      } catch {
        // already disconnected
      }
      this.srcNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.query = null;
    this.match = null;
    this.source = null;
    this.onStatus({ running: false, source: null, error: null });
  }

  dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  reset(): void {
    this.corpus = [];
    this.nextId = 0;
    this.query = null;
    this.match = null;
  }
}
