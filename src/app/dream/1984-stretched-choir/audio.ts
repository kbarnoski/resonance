/**
 * audio.ts — additive Web Audio engine for the Stretched Choir.
 *
 * Each held note is a bank of `PARTIAL_COUNT` sine oscillators tuned to the
 * STRETCHED partial series (see spectrum.ts). Changing the stretch live
 * re-tunes every sounding partial with a short glide, so a held chord can be
 * heard melting and re-forming as the visitor drags the slider. A soft
 * generated reverb tail gives the choir its glassy bloom.
 *
 * The engine also exposes a lightweight JS-side snapshot of every sounding
 * partial (frequency, amplitude envelope, local beat rate) so the DOM/CSS
 * compositor layer can draw and pulse voices without ever touching an
 * AnalyserNode per note.
 */

import {
  PARTIAL_COUNT,
  partialAmp,
  partialFreq,
  noteFreq,
} from "./spectrum";

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  n: number;
}

interface Voice {
  midi: number;
  f0: number; // current fundamental in Hz (depends on scaleStretch)
  velocity: number; // 0..1
  partials: Partial[];
  gain: GainNode; // per-voice envelope
  startTime: number;
  releaseTime: number | null;
}

/** Per-partial info handed to the visual layer each frame. */
export interface PartialSnapshot {
  freq: number;
  amp: number; // 0..1 relative brightness (env * rolloff)
  beatHz: number; // local beat rate against nearest neighbouring partial
  n: number;
}

export interface VoiceSnapshot {
  midi: number;
  f0: number;
  env: number; // 0..1 amplitude envelope
  partials: PartialSnapshot[];
}

const ATTACK = 0.06;
const RELEASE = 1.1;
const PEAK = 0.14; // per-voice peak gain (polyphony-safe)
const GLIDE = 0.08; // seconds to glide a partial to a new frequency

export class StretchedChoir {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: ConvolverNode;
  private voices = new Map<number, Voice>();
  private timbreStretch: number;
  private scaleStretch: number;

  constructor(timbreStretch: number, scaleStretch: number) {
    this.timbreStretch = timbreStretch;
    this.scaleStretch = scaleStretch;

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // Gentle limiter so dense chords don't clip.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.5;
    const dry = this.ctx.createGain();
    dry.gain.value = 0.8;

    this.master.connect(comp);
    comp.connect(dry).connect(this.ctx.destination);
    comp.connect(this.reverb).connect(wet).connect(this.ctx.destination);
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  /** Bright, smooth exponential-decay noise impulse for a glassy tail. */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  noteOn(midi: number, velocity = 0.85): void {
    if (this.voices.has(midi)) return;
    const now = this.ctx.currentTime;
    const f0 = noteFreq(midi, this.scaleStretch);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(
      PEAK * velocity + 0.0001,
      now + ATTACK,
    );
    voiceGain.connect(this.master);

    const partials: Partial[] = [];
    for (let n = 1; n <= PARTIAL_COUNT; n++) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(
        partialFreq(f0, n, this.timbreStretch),
        now,
      );
      const g = this.ctx.createGain();
      g.gain.value = partialAmp(n);
      osc.connect(g).connect(voiceGain);
      osc.start(now);
      partials.push({ osc, gain: g, n });
    }

    this.voices.set(midi, {
      midi,
      f0,
      velocity,
      partials,
      gain: voiceGain,
      startTime: now,
      releaseTime: null,
    });
  }

  noteOff(midi: number): void {
    const v = this.voices.get(midi);
    if (!v || v.releaseTime !== null) return;
    const now = this.ctx.currentTime;
    v.releaseTime = now;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + RELEASE);
    for (const p of v.partials) {
      p.osc.stop(now + RELEASE + 0.05);
    }
    // Reap after release completes.
    window.setTimeout(
      () => {
        if (this.voices.get(midi) === v) this.voices.delete(midi);
      },
      (RELEASE + 0.1) * 1000,
    );
  }

  /** Re-tune every sounding partial to a new pseudo-octave stretch. */
  setTimbreStretch(stretch: number): void {
    this.timbreStretch = stretch;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      for (const p of v.partials) {
        const target = partialFreq(v.f0, p.n, stretch);
        p.osc.frequency.cancelScheduledValues(now);
        p.osc.frequency.setValueAtTime(p.osc.frequency.value, now);
        p.osc.frequency.linearRampToValueAtTime(target, now + GLIDE);
      }
    }
  }

  /** Re-tune the fundamental of every sounding voice to a new scale stretch. */
  setScaleStretch(stretch: number): void {
    this.scaleStretch = stretch;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      v.f0 = noteFreq(v.midi, stretch);
      for (const p of v.partials) {
        const target = partialFreq(v.f0, p.n, this.timbreStretch);
        p.osc.frequency.cancelScheduledValues(now);
        p.osc.frequency.setValueAtTime(p.osc.frequency.value, now);
        p.osc.frequency.linearRampToValueAtTime(target, now + GLIDE);
      }
    }
  }

  private envAt(v: Voice, now: number): number {
    if (v.releaseTime === null) {
      const t = now - v.startTime;
      if (t < ATTACK) return Math.max(0, t / ATTACK) * v.velocity;
      return v.velocity;
    }
    const t = now - v.releaseTime;
    return Math.max(0, 1 - t / RELEASE) * v.velocity;
  }

  /**
   * Snapshot every sounding partial for the visual layer. Beat rate is the
   * absolute frequency gap to the nearest *other* partial when they fall
   * inside the audible beating band (< 30 Hz) — the very gap that produces
   * amplitude beating in the mixed audio, so the visual pulse is honest.
   */
  snapshot(): VoiceSnapshot[] {
    const now = this.ctx.currentTime;
    const all: { freq: number }[] = [];
    const voiceData: VoiceSnapshot[] = [];

    for (const v of this.voices.values()) {
      const env = this.envAt(v, now);
      const ps: PartialSnapshot[] = v.partials.map((p) => {
        const freq = partialFreq(v.f0, p.n, this.timbreStretch);
        all.push({ freq });
        return { freq, amp: env * partialAmp(p.n), beatHz: 0, n: p.n };
      });
      voiceData.push({ midi: v.midi, f0: v.f0, env, partials: ps });
    }

    // Second pass: nearest-neighbour beat rate across the whole choir.
    for (const v of voiceData) {
      for (const p of v.partials) {
        let best = Infinity;
        for (const other of all) {
          const df = Math.abs(other.freq - p.freq);
          if (df > 0.01 && df < best) best = df;
        }
        p.beatHz = best < 30 ? best : 0;
      }
    }
    return voiceData;
  }

  activeCount(): number {
    let n = 0;
    for (const v of this.voices.values()) if (v.releaseTime === null) n++;
    return n;
  }

  async close(): Promise<void> {
    try {
      await this.ctx.close();
    } catch {
      /* already closing */
    }
  }
}
