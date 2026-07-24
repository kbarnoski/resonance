// ════════════════════════════════════════════════════════════════════════════
// Trap (2530) — two-timbre Web Audio synth
//
// Two voices so the ear can tell who is playing: the AI is a bright, biting
// sawtooth; you are a warmer triangle; the seed notes are a soft sine. When a
// note lands we also let the PREVIOUS note ring on underneath it, so a
// dissonant interval genuinely beats and clashes — the danger is not filtered
// out, it is the point. Every browser API is SSR-guarded and every oscillator
// is tracked for teardown.
// ════════════════════════════════════════════════════════════════════════════

export type Voice = "ai" | "you" | "seed";

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface VoiceSpec {
  type: OscillatorType;
  cutoff: number;
  gain: number;
}

const VOICES: Record<Voice, VoiceSpec> = {
  ai: { type: "sawtooth", cutoff: 3000, gain: 0.15 },
  you: { type: "triangle", cutoff: 1600, gain: 0.18 },
  seed: { type: "sine", cutoff: 1200, gain: 0.12 },
};

export class TrapSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private active = new Set<OscillatorNode>();
  private raf = 0;

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
      this.master.gain.value = 0.85;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  private voiceAt(
    midi: number,
    voice: Voice,
    start: number,
    dur: number,
    gainScale = 1,
  ): void {
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
    const peak = spec.gain * gainScale;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, start + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(filter);
    filter.connect(g);
    g.connect(master);

    osc.start(start);
    osc.stop(start + dur + 0.03);
    this.active.add(osc);
    osc.onended = () => {
      this.active.delete(osc);
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  /**
   * Sound a note now. If `prev` is given, its tail rings on underneath so the
   * interval actually clashes — high tension is audible, not scrubbed away.
   */
  strike(midi: number, prev: number | null, voice: Voice, dur = 0.7): void {
    if (!this.ensure() || !this.ctx) return;
    const t = this.ctx.currentTime + 0.001;
    if (prev !== null) this.voiceAt(prev, "seed", t, dur * 0.8, 0.5);
    this.voiceAt(midi, voice, t, dur);
  }

  /**
   * Play the whole line back with overlapping notes so consecutive intervals
   * beat against each other. Drives `onBeat` from the audio clock so a playhead
   * can track the true sounding position. Returns a stop function.
   */
  playLine(
    notes: readonly { midi: number; by: Voice }[],
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
    for (let i = 0; i < notes.length; i++) {
      // Deliberately longer than one beat so neighbouring notes overlap and clash.
      this.voiceAt(notes[i].midi, notes[i].by, start + i * spb, spb * 1.35);
    }
    const tick = () => {
      if (!this.ctx) return;
      const pos = (this.ctx.currentTime - start) / spb;
      if (pos >= notes.length) {
        onBeat(notes.length);
        onDone();
        return;
      }
      onBeat(Math.max(0, pos));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(this.raf);
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
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}
