// ════════════════════════════════════════════════════════════════════════════
// Counterpoint Duel (2502) — two-voice Web Audio synth
//
// The cantus firmus and the counterpoint get distinct timbres so the ear can
// track the two lines: the lower voice is a soft filtered triangle, the upper
// voice a brighter sawtooth. Every placed note sounds immediately; the whole
// duet can also be played back with a moving playhead. All browser APIs are
// SSR-guarded and every oscillator is tracked for teardown.
// ════════════════════════════════════════════════════════════════════════════

import type { Voice } from "./counterpoint";

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface VoiceSpec {
  type: OscillatorType;
  cutoff: number;
  gain: number;
}

const VOICES: Record<Voice, VoiceSpec> = {
  cf: { type: "triangle", cutoff: 1400, gain: 0.22 },
  cp: { type: "sawtooth", cutoff: 2600, gain: 0.16 },
};

export class DuelSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = new Set<OscillatorNode>();
  private raf = 0;

  /** True once an AudioContext exists and is running. */
  ready(): boolean {
    return this.ctx !== null && this.ctx.state !== "closed";
  }

  /** Create/resume the context on a user gesture. Returns false if unavailable. */
  ensure(): boolean {
    if (typeof window === "undefined") return false;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor();
      } catch {
        return false;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  private voiceAt(midi: number, voice: Voice, start: number, dur: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const spec = VOICES[voice];

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(midiToFreq(midi), start);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(spec.cutoff, start);

    const g = ctx.createGain();
    const a = 0.012;
    const peak = spec.gain;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(peak * 0.6, start + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(master);

    osc.start(start);
    osc.stop(start + dur + 0.02);
    this.active.add(osc);
    osc.onended = () => {
      this.active.delete(osc);
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  /** Sound a single note immediately (on gesture). */
  note(midi: number, voice: Voice, dur = 0.55): void {
    if (!this.ensure() || !this.ctx) return;
    this.voiceAt(midi, voice, this.ctx.currentTime + 0.001, dur);
  }

  /**
   * Play the whole two-voice line back. Drives `onBeat` via rAF from the audio
   * clock so a playhead can track the true sounding position, and calls
   * `onDone` when finished. Returns a stop function.
   */
  playSequence(
    cf: readonly number[],
    cp: readonly (number | null)[],
    bpm: number,
    onBeat: (pos: number) => void,
    onDone: () => void,
  ): () => void {
    if (!this.ensure() || !this.ctx) {
      onDone();
      return () => {};
    }
    const ctx = this.ctx;
    const spb = 60 / bpm;
    const start = ctx.currentTime + 0.08;
    for (let i = 0; i < cf.length; i++) {
      const t = start + i * spb;
      this.voiceAt(cf[i], "cf", t, spb * 0.92);
      const upper = cp[i];
      if (upper !== null && upper !== undefined) {
        this.voiceAt(upper, "cp", t, spb * 0.92);
      }
    }
    const total = cf.length * spb;
    const tick = () => {
      if (!this.ctx) return;
      const pos = (this.ctx.currentTime - start) / spb;
      if (pos >= cf.length) {
        onBeat(cf.length);
        onDone();
        return;
      }
      onBeat(Math.max(0, pos));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(this.raf);
      void total;
      onDone();
    };
  }

  /** Full teardown — stop everything and close the context. */
  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const osc of this.active) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.active.clear();
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
    }
    this.ctx = null;
    this.master = null;
  }
}
