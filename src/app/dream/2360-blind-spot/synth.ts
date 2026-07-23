// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — additive partial-bank pad for the MIB instrument.
//
//   One sustained sine partial per target dot. Each partial's gain is driven
//   continuously by that dot's *subjective awareness* (0 = reported gone /
//   faded, 1 = seen). So the chord audibly thins as your visual field shrinks
//   and re-blooms as dots return. Soft, slow, cosmic-ambient — never a "played"
//   instrument, just the field reading itself back.
//
//   All nodes are created inside the user's Start gesture and fully torn down on
//   stop / unmount (oscillators stopped, ctx.close()).
// ─────────────────────────────────────────────────────────────────────────────

import { TARGETS } from "./stimulus";

interface Voice {
  osc: OscillatorNode;
  detune: OscillatorNode; // faint second osc for chorused warmth
  detuneGain: GainNode;
  gain: GainNode;
}

export class BlindSpotSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  /** Must be called from within a user gesture. */
  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio unavailable");

    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // gentle master chain — low level, softened top, no clipping.
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 2.2);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    tone.Q.value = 0.4;
    master.connect(tone);
    tone.connect(ctx.destination);
    this.master = master;

    // slow shared amplitude shimmer so the pad breathes (calm, ~0.06 Hz).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfo.start();
    this.lfo = lfo;
    this.lfoGain = lfoGain;

    // one voice per target partial.
    this.voices = TARGETS.map((t, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = t.freq;

      const detune = ctx.createOscillator();
      detune.type = "sine";
      detune.frequency.value = t.freq * 1.004; // subtle beating
      const detuneGain = ctx.createGain();
      detuneGain.gain.value = 0.4;
      detune.connect(detuneGain);

      const gain = ctx.createGain();
      // higher partials sit quieter so the pad stays warm, not shrill.
      const base = 0.9 - i * 0.1;
      gain.gain.value = 0.0001;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      // start fully "seen".
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, 0.14 * base),
        ctx.currentTime + 2.2
      );

      osc.connect(gain);
      detuneGain.connect(gain);
      gain.connect(master);
      lfoGain.connect(gain.gain); // shared breathing
      osc.start();
      detune.start();
      return { osc, detune, detuneGain, gain };
    });
  }

  /** Push the current awareness array (0..1 per target) into partial gains. */
  applyAwareness(awareness: number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < this.voices.length; i++) {
      const a = Math.max(0, Math.min(1, awareness[i] ?? 0));
      const base = 0.9 - i * 0.1;
      const target = Math.max(0.0001, a * 0.14 * base);
      // smooth so muting/unmuting reads as a fade, never a click.
      this.voices[i].gain.gain.setTargetAtTime(target, ctx.currentTime, 0.14);
    }
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  dispose(): void {
    try {
      this.voices.forEach((v) => {
        v.osc.stop();
        v.detune.stop();
      });
      this.lfo?.stop();
    } catch {
      /* already stopped */
    }
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.voices = [];
    this.lfo = null;
    this.lfoGain = null;
  }
}
