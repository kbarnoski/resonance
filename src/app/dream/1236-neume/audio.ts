// audio.ts — read-only loader for Karel's real piano recording, a MANDATORY
// offline synthesized fallback so the page always has real harmonic content to
// notate, and a small buffer-playback engine with a tracked playhead so the
// chant can ink itself in sync.
//
// READ-ONLY of the existing public GET /api/audio/<id>. No mic, no new route.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type SourceKind = "recording" | "fallback";

/**
 * Fetch the recording into an AudioBuffer via the existing read-only route.
 * Handles both response shapes (JSON `{url}` → fetch bytes, or raw bytes).
 * Returns null on ANY failure so the caller can fall back gracefully.
 */
export async function fetchPianoBuffer(ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, { signal: controller.signal });
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

// ── deterministic PRNG (for tiny, tasteful timing/detune jitter) ─────────────
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

// A slow modal/pentatonic-ish solo-piano phrase (MIDI). Clear rise + fall so
// the transcription always yields a legible chant of pes / clivis / climacus.
const FALLBACK_PHRASE = [57, 60, 62, 64, 67, 69, 67, 64, 62, 60, 64, 67, 69, 72];

/**
 * Render a gentle ~12s solo-piano-like phrase with an OfflineAudioContext.
 * Detuned sine/triangle partials, soft attack + long decay. This GUARANTEES the
 * page always has real, monophonic, notatable harmonic content — never silence —
 * when the network recording is unavailable (the norm in headless test).
 */
export async function renderFallbackBuffer(sampleRate = 44100): Promise<AudioBuffer> {
  const durationSecs = 12;
  const length = Math.floor(durationSecs * sampleRate);
  const OfflineCtor: typeof OfflineAudioContext =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtor(1, length, sampleRate);
  const rand = mulberry32(0x9e3779b1);

  const noteSecs = durationSecs / FALLBACK_PHRASE.length;
  const master = offline.createGain();
  master.gain.value = 0.9;
  master.connect(offline.destination);

  FALLBACK_PHRASE.forEach((midi, i) => {
    const start = i * noteSecs + (rand() - 0.5) * 0.015;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const partials = [
      { mult: 1, gain: 0.55, type: "triangle" as OscillatorType, detune: (rand() - 0.5) * 3 },
      { mult: 2, gain: 0.22, type: "sine" as OscillatorType, detune: (rand() - 0.5) * 6 },
      { mult: 3, gain: 0.11, type: "sine" as OscillatorType, detune: (rand() - 0.5) * 8 },
      { mult: 4.01, gain: 0.05, type: "sine" as OscillatorType, detune: (rand() - 0.5) * 10 },
    ];
    const body = offline.createGain();
    body.gain.setValueAtTime(0.0001, start);
    body.gain.linearRampToValueAtTime(0.9, start + 0.02); // soft attack
    body.gain.exponentialRampToValueAtTime(0.0001, start + noteSecs * 2.6); // long decay
    body.connect(master);
    partials.forEach((p) => {
      const osc = offline.createOscillator();
      osc.type = p.type;
      osc.frequency.value = freq * p.mult;
      osc.detune.value = p.detune;
      const g = offline.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(body);
      osc.start(start);
      osc.stop(start + noteSecs * 2.8);
    });
  });

  return await offline.startRendering();
}

// ── short synthesized reverb impulse (a little chapel warmth) ────────────────
function buildImpulse(ctx: AudioContext, seconds = 2.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(seconds * rate);
  const impulse = ctx.createBuffer(2, len, rate);
  const rand = mulberry32(0x51e5b0ba);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (rand() * 2 - 1) * Math.pow(1 - t, 2.4);
    }
  }
  return impulse;
}

/**
 * Plays a decoded AudioBuffer and exposes a tracked playhead (position in
 * seconds) so the manuscript can reveal neumes in time. Playback graph:
 *   source → dry + convolver(wet) → master → destination
 */
export class PlaybackEngine {
  readonly ctx: AudioContext;
  private dry: GainNode;
  private wet: GainNode;
  private convolver: ConvolverNode;
  private master: GainNode;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private ctxStart = 0; // ctx.currentTime when the current source started
  private baseOffset = 0; // playhead position at that start
  private playing = false;
  private endedAt = 0; // guard so manual stops don't fire onEnd
  onEnd: (() => void) | null = null;

  constructor() {
    const Ctor: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctor();
    this.dry = this.ctx.createGain();
    this.dry.gain.value = 0.82;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0.3;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = buildImpulse(this.ctx);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.dry.connect(this.master);
    this.convolver.connect(this.wet);
    this.wet.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  load(buffer: AudioBuffer): void {
    this.buffer = buffer;
    this.baseOffset = 0;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Current playhead position in seconds (clamped to the buffer duration). */
  position(): number {
    let pos = this.baseOffset;
    if (this.playing) pos += this.ctx.currentTime - this.ctxStart;
    return Math.max(0, Math.min(pos, this.duration));
  }

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      } catch {
        /* already stopped */
      }
      this.source = null;
    }
  }

  async play(): Promise<void> {
    if (!this.buffer) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.playing) return;
    let offset = this.baseOffset;
    if (offset >= this.duration - 0.02) offset = 0; // replay from top if at end
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.dry);
    src.connect(this.convolver);
    const startTag = this.ctx.currentTime;
    src.onended = () => {
      if (!this.playing || this.ctx.currentTime < this.endedAt - 0.05) return;
      this.playing = false;
      this.baseOffset = this.duration;
      this.onEnd?.();
    };
    src.start(0, offset);
    this.source = src;
    this.ctxStart = startTag;
    this.baseOffset = offset;
    this.endedAt = startTag + (this.duration - offset);
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.baseOffset = this.position();
    this.playing = false;
    this.stopSource();
  }

  async seek(t: number): Promise<void> {
    const target = Math.max(0, Math.min(t, this.duration));
    const wasPlaying = this.playing;
    this.pause();
    this.baseOffset = target;
    if (wasPlaying) await this.play();
  }

  async dispose(): Promise<void> {
    this.onEnd = null;
    this.stopSource();
    try {
      this.dry.disconnect();
      this.wet.disconnect();
      this.convolver.disconnect();
      this.master.disconnect();
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
