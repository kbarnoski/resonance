/**
 * Web Audio playback for `9128-rekindle`.
 *
 * Soft FM voices for the melody and additive-ish chord voices for the
 * reharmonization. NO drone bed — every voice is note-gated with a short
 * envelope. The AudioContext is created lazily and only resumed on a user
 * gesture; `dispose()` tears everything down.
 */

import type { NoteEvent } from "./transcribe";
import type { ChordEvent } from "./reharmonize";

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export type PlayMode = "reharmonized" | "original";

export interface PlayOptions {
  melody: NoteEvent[];
  chords: ChordEvent[];
  mode: PlayMode;
  /** Called with elapsed seconds while playing; use for the playhead. */
  onTick?: (elapsed: number, total: number) => void;
  onEnd?: () => void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: AudioScheduledSourceNode[] = [];
  private gains: GainNode[] = [];
  private raf = 0;
  private startedAt = 0;
  private total = 0;
  private playing = false;

  /** Create + resume the context. Must be called from a user gesture. */
  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Decode encoded audio bytes into an AudioBuffer via this engine's context. */
  async decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
    const ctx = await this.ensure();
    try {
      return await ctx.decodeAudioData(data.slice(0));
    } catch {
      return null;
    }
  }

  private clearVoices() {
    for (const n of this.active) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
    for (const g of this.gains) {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
    }
    this.active = [];
    this.gains = [];
  }

  /** Schedule an FM voice: carrier + modulator with a soft AD envelope. */
  private fmVoice(
    freq: number,
    at: number,
    dur: number,
    peak: number,
    ratio: number,
    modDepth: number,
    type: OscillatorType,
  ) {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const env = ctx.createGain();

    carrier.type = type;
    modulator.type = "sine";
    carrier.frequency.value = freq;
    modulator.frequency.value = freq * ratio;
    modGain.gain.value = freq * modDepth;

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(this.master!);

    const attack = 0.015;
    const release = Math.min(0.5, dur * 0.6);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + attack);
    env.gain.setValueAtTime(peak, at + Math.max(attack, dur - release));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    carrier.start(at);
    modulator.start(at);
    carrier.stop(at + dur + 0.05);
    modulator.stop(at + dur + 0.05);

    this.active.push(carrier, modulator);
    this.gains.push(modGain, env);
  }

  /** Play melody (+ chords when mode = reharmonized). */
  async play(opts: PlayOptions): Promise<void> {
    const ctx = await this.ensure();
    this.stop();
    this.playing = true;

    const t0 = ctx.currentTime + 0.08;
    this.startedAt = t0;

    const melodyEnd = opts.melody.length
      ? Math.max(...opts.melody.map((n) => n.start + n.dur))
      : 0;
    const chordEnd = opts.chords.length
      ? Math.max(...opts.chords.map((c) => c.start + c.dur))
      : 0;
    this.total = Math.max(melodyEnd, chordEnd) + 0.4;

    // Melody — brighter FM triangle voice on top.
    for (const n of opts.melody) {
      this.fmVoice(
        midiToFreq(n.midi),
        t0 + n.start,
        n.dur,
        0.16 + n.vel * 0.14,
        2, // carrier:modulator ratio
        1.4,
        "triangle",
      );
    }

    // Reharmonized chords — soft sine pads beneath, note-gated (no drone).
    if (opts.mode === "reharmonized") {
      for (const c of opts.chords) {
        const voiceGain = 0.09 / Math.max(1, Math.sqrt(c.voicing.length));
        for (const m of c.voicing) {
          this.fmVoice(
            midiToFreq(m),
            t0 + c.start + 0.01,
            Math.max(0.2, c.dur - 0.04),
            voiceGain,
            1,
            0.6,
            "sine",
          );
        }
      }
    }

    const tick = () => {
      if (!this.ctx || !this.playing) return;
      const elapsed = this.ctx.currentTime - this.startedAt;
      opts.onTick?.(Math.max(0, elapsed), this.total);
      if (elapsed >= this.total) {
        this.playing = false;
        this.clearVoices();
        opts.onEnd?.();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clearVoices();
  }

  async dispose() {
    this.stop();
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* noop */
      }
      this.ctx = null;
      this.master = null;
    }
  }
}
