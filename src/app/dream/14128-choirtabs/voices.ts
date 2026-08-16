// ─────────────────────────────────────────────────────────────────────────────
// 14128-choirtabs · voices.ts — the local choir engine (one graph per tab).
//
//   This is the "synchronized local-engine" half of the model: this tab plays the
//   WHOLE choir — self, peers, and any virtual stand-ins — as its own Web Audio
//   voices, every one locked to the shared beat from clock.ts. Nothing streams
//   between tabs; the clock is what keeps the local engines in phase.
//
//   Each voice loops a phrase of Karel's REAL recorded piano. We NEVER set
//   source.loop — instead a ~100ms lookahead scheduler queues successive
//   AudioBufferSourceNodes so each phrase lands exactly on its beat boundary, with
//   an EQUAL-POWER crossfade at the seam (gapless). A voice's canon "entry delay"
//   (in bars) offsets its phrase-start grid, so voices enter in staggered rounds
//   and weave a canon. Everything routes into the ear-safety master, never the raw
//   destination.
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadRealTrackBuffer,
  REAL_TRACKS,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { BEAT_DUR_SEC, BEATS_PER_BAR, LOOP_BEATS } from "./clock";

/** A voice to sound this frame — self, a peer, or a virtual stand-in. */
export interface VoiceSpec {
  id: string;
  trackId: string;
  delayBars: number;
}

const CROSSFADE_SEC = 0.09; // equal-power seam between successive phrases
const LOOKAHEAD_SEC = 0.12; // schedule phrases this far in advance
const PHRASE_OFFSET_SEC = 0; // where in the track the looped phrase begins
const PHRASE_DUR_SEC = LOOP_BEATS * BEAT_DUR_SEC; // grid spacing (start→start)

// Precompute short equal-power fade curves (sqrt keeps summed power constant
// across the seam of two uncorrelated buffer regions).
const CURVE_N = 48;
function makeFadeCurve(rising: boolean): Float32Array {
  const c = new Float32Array(CURVE_N);
  for (let i = 0; i < CURVE_N; i++) {
    const t = i / (CURVE_N - 1);
    c[i] = Math.sqrt(rising ? t : 1 - t);
  }
  return c;
}
const FADE_IN = makeFadeCurve(true);
const FADE_OUT = makeFadeCurve(false);

interface VoiceState {
  trackId: string;
  gain: GainNode; // persistent per-voice trim into the master
  nextStartBeat: number | null; // next phrase-start not yet scheduled
  sources: Set<AudioBufferSourceNode>;
}

export class Engine {
  readonly ctx: AudioContext;
  private readonly master: SafeMaster;
  private readonly voices = new Map<string, VoiceState>();

  // Buffer cache: undefined = never asked, null = loading, AudioBuffer = ready.
  private readonly buffers = new Map<string, AudioBuffer | null>();

  private readonly freqBuf: Uint8Array;
  private level = 0;
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.master = createSafeMaster(this.ctx, { gain: 0.82 });
    this.freqBuf = new Uint8Array(
      new ArrayBuffer(this.master.analyser.frequencyBinCount),
    );
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  /** Kick off a buffer load if we have not already. Safe to call every frame. */
  private ensureBuffer(trackId: string): AudioBuffer | null {
    if (this.buffers.has(trackId)) return this.buffers.get(trackId) ?? null;
    // Guard against invented ids: only load real catalog tracks.
    if (!REAL_TRACKS.some((t) => t.id === trackId)) {
      this.buffers.set(trackId, null);
      return null;
    }
    this.buffers.set(trackId, null); // mark loading
    loadRealTrackBuffer(this.ctx, trackId)
      .then((r) => {
        if (!this.disposed) this.buffers.set(trackId, r.buffer);
      })
      .catch(() => {
        // Leave as null; the voice simply stays silent until retried.
        this.buffers.delete(trackId);
      });
    return null;
  }

  private schedulePhrase(
    v: VoiceState,
    buffer: AudioBuffer,
    startTime: number,
  ): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Keep the phrase window inside the buffer.
    const maxLen = Math.max(0.2, buffer.duration - PHRASE_OFFSET_SEC - 0.05);
    const body = Math.min(PHRASE_DUR_SEC, maxLen);
    const playLen = body + CROSSFADE_SEC; // extend into the seam for crossfade

    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(env);
    env.connect(v.gain);

    const t0 = Math.max(startTime, ctx.currentTime + 0.02);
    // Equal-power fade in over the seam, hold, then fade out into the next entry.
    env.gain.setValueCurveAtTime(FADE_IN, t0, CROSSFADE_SEC);
    env.gain.setValueAtTime(1, t0 + CROSSFADE_SEC);
    env.gain.setValueCurveAtTime(FADE_OUT, t0 + body, CROSSFADE_SEC);

    src.start(t0, PHRASE_OFFSET_SEC, playLen);
    src.stop(t0 + playLen + 0.02);

    v.sources.add(src);
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
      } catch {
        /* already gone */
      }
      v.sources.delete(src);
    };
  }

  private resetVoice(v: VoiceState): void {
    const ctxNow = this.ctx.currentTime;
    for (const s of v.sources) {
      try {
        s.stop(ctxNow + 0.05);
      } catch {
        /* already stopped */
      }
    }
    v.nextStartBeat = null;
  }

  /**
   * Sync the live graph to `specs` and schedule any phrase entries that fall
   * inside the lookahead window. `beat` is the shared continuous beat sampled at
   * this instant; convert a target beat to context time via the delta from now.
   */
  update(specs: VoiceSpec[], beat: number, playing: boolean): void {
    if (this.disposed) return;
    const ctxNow = this.ctx.currentTime;
    const keep = new Set(specs.map((s) => s.id));

    // Retire voices that left.
    for (const [id, v] of this.voices) {
      if (!keep.has(id)) {
        this.resetVoice(v);
        try {
          v.gain.disconnect();
        } catch {
          /* already gone */
        }
        this.voices.delete(id);
      }
    }

    // Per-voice trim: shave headroom as the choir grows so the master limiter
    // shapes rather than clamps.
    const n = Math.max(1, specs.length);
    const perVoice = Math.min(0.5, 0.95 / Math.sqrt(n));

    for (const spec of specs) {
      let v = this.voices.get(spec.id);
      if (!v) {
        const gain = this.ctx.createGain();
        gain.gain.value = perVoice;
        gain.connect(this.master.input);
        v = { trackId: spec.trackId, gain, nextStartBeat: null, sources: new Set() };
        this.voices.set(spec.id, v);
      }
      v.gain.gain.setTargetAtTime(perVoice, ctxNow, 0.2);

      // Track change → flush this voice so old/new phrases never overlap.
      if (v.trackId !== spec.trackId) {
        this.resetVoice(v);
        v.trackId = spec.trackId;
      }

      if (!playing) {
        this.resetVoice(v);
        continue;
      }

      const buffer = this.ensureBuffer(spec.trackId);
      if (!buffer) continue; // still loading — stays silent

      const delayBeats = spec.delayBars * BEATS_PER_BAR;
      const lookaheadBeats = LOOKAHEAD_SEC / BEAT_DUR_SEC;

      // Initialize the phrase-start grid: entries at delayBeats + k*LOOP_BEATS.
      if (v.nextStartBeat === null) {
        const kFloor = Math.ceil((beat - delayBeats) / LOOP_BEATS);
        const kFirst = Math.max(0, kFloor); // never before the canon entry
        v.nextStartBeat = delayBeats + kFirst * LOOP_BEATS;
      }

      let guard = 0;
      while (v.nextStartBeat < beat + lookaheadBeats && guard++ < 8) {
        const startTime = ctxNow + (v.nextStartBeat - beat) * BEAT_DUR_SEC;
        this.schedulePhrase(v, buffer, startTime);
        v.nextStartBeat += LOOP_BEATS;
      }
    }

    // Read the tamed mix back for a soft global glow.
    this.master.analyser.getByteFrequencyData(
      this.freqBuf as Uint8Array<ArrayBuffer>,
    );
    let sum = 0;
    const bins = Math.min(64, this.freqBuf.length);
    for (let i = 0; i < bins; i++) sum += this.freqBuf[i];
    const rms = sum / (bins * 255);
    this.level += (rms - this.level) * 0.12;
  }

  /** Smoothed overall level in [0,1] for visuals. */
  getLevel(): number {
    return this.level;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of this.voices.values()) {
      for (const s of v.sources) {
        try {
          s.stop();
          s.disconnect();
        } catch {
          /* already gone */
        }
      }
      try {
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
    }
    this.voices.clear();
    this.master.disconnect();
    void this.ctx.close();
  }
}
