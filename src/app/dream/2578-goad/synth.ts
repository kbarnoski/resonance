// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — Web Audio synth
//
// Three sound sources:
//   • DRONE   — a soft, continuous C-major triad pad in the low register. This
//               is the harmonic ground the whole game is measured against, and
//               it is what makes dissonance AUDIBLE: a melody tritone or minor
//               second physically beats against these ringing partials.
//   • HUMAN   — a warm filtered triangle (the "you" voice).
//   • AI      — a brighter, slightly detuned sawtooth (an edgier adversary).
//
// Pitches are free 12-TET (no consonant lattice, no snapping), so the synth can
// sound genuinely rough. Everything is SSR-guarded and every node is tracked
// for teardown. `playSequence` sweeps a playhead off the audio clock.
// ════════════════════════════════════════════════════════════════════════════

import { DRONE_MIDIS, midiToFreq, type Owner } from "./tension";

interface VoiceSpec {
  type: OscillatorType;
  detune: number;
  cutoff: number;
  gain: number;
}

const VOICES: Record<Owner, VoiceSpec> = {
  human: { type: "triangle", detune: 0, cutoff: 1600, gain: 0.2 },
  ai: { type: "sawtooth", detune: 7, cutoff: 3000, gain: 0.15 },
};

export class GoadSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private active = new Set<OscillatorNode>();
  private raf = 0;

  ready(): boolean {
    return this.ctx !== null && this.ctx.state !== "closed";
  }

  /** Create/resume on a user gesture. Returns false if audio is unavailable. */
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
      this.startDrone();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return true;
  }

  /** The continuous harmonic ground. Low gain so melody stays on top. */
  private startDrone(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.droneOscs.length) return;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.connect(lp);
    lp.connect(master);
    this.droneGain = g;
    for (const m of DRONE_MIDIS) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = midiToFreq(m);
      osc.connect(g);
      osc.start();
      this.droneOscs.push(osc);
      // A quiet detuned twin thickens the pad and enriches beating.
      const twin = ctx.createOscillator();
      twin.type = "sine";
      twin.frequency.value = midiToFreq(m);
      twin.detune.value = 6;
      twin.connect(g);
      twin.start();
      this.droneOscs.push(twin);
    }
  }

  private voiceAt(
    midi: number,
    owner: Owner,
    start: number,
    dur: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const spec = VOICES[owner];

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.detune.value = spec.detune;
    osc.frequency.setValueAtTime(midiToFreq(midi), start);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(spec.cutoff, start);

    const g = ctx.createGain();
    const a = 0.014;
    const peak = spec.gain;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + a);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, start + dur * 0.6);
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

  /** Sound one note immediately (live keyboard play). */
  note(midi: number, owner: Owner, dur = 0.5): void {
    if (!this.ensure() || !this.ctx) return;
    this.voiceAt(midi, owner, this.ctx.currentTime + 0.001, dur);
  }

  /**
   * Play a flattened sequence of (pitch, owner) events, one per beat, driving a
   * playhead callback (fractional event index) off the audio clock. Returns a
   * stop function; calls onDone when finished.
   */
  playSequence(
    events: { pitch: number; owner: Owner }[],
    bpm: number,
    onPos: (pos: number) => void,
    onDone: () => void,
  ): () => void {
    if (!this.ensure() || !this.ctx) {
      onDone();
      return () => {};
    }
    const ctx = this.ctx;
    const spb = 60 / bpm;
    const start = ctx.currentTime + 0.08;
    for (let i = 0; i < events.length; i++) {
      this.voiceAt(events[i].pitch, events[i].owner, start + i * spb, spb * 0.92);
    }
    let stopped = false;
    const tick = () => {
      if (stopped || !this.ctx) return;
      const pos = (this.ctx.currentTime - start) / spb;
      if (pos >= events.length) {
        onPos(events.length);
        onDone();
        return;
      }
      onPos(Math.max(0, pos));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(this.raf);
      onDone();
    };
  }

  /** Full teardown — stop drone + all voices, close the context. */
  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const osc of this.droneOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.droneOscs = [];
    this.droneGain?.disconnect();
    this.droneGain = null;
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
