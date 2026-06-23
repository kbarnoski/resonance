/**
 * audio.ts — kids-safe Web Audio engine for "Monster Keys".
 *
 * Every voice routes:
 *   osc(s) -> voiceGain -> masterGain(<=0.26) -> lowpass(<=6.5kHz)
 *          -> compressor(threshold -10, ratio 20:1) -> destination
 * An AnalyserNode taps the master post-compressor but is NEVER routed to
 * destination. An always-on ambient pad keeps it from ever being silent.
 *
 * Dissonance = WOBBLE only: a clashing note grows a detuned partner partial
 * (~+6 cents) plus a slow shimmer LFO. Never louder, never harsher, never
 * higher. Soft attacks >= 40ms. Safe for a sleeping toddler next door.
 */

import { noteFreq } from "./harmony";

type Voice = {
  index: number;
  osc: OscillatorNode;
  partner: OscillatorNode; // detuned beating partial (for wobble)
  partnerGain: GainNode;
  gain: GainNode;
  shimmer: OscillatorNode; // slow LFO modulating the partner gain
  shimmerGain: GainNode;
};

export class MonsterAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private padOsc: OscillatorNode[] = [];
  private voices = new Map<number, Voice>();
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  /** Must be called inside a user gesture (iOS gate). Idempotent. */
  async start(): Promise<boolean> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return true;
    }
    type ACtor = typeof AudioContext;
    const w = window as unknown as {
      AudioContext?: ACtor;
      webkitAudioContext?: ACtor;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;

    // ── Safety chain ──────────────────────────────────────────────────────
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.knee.value = 6;
    comp.attack.value = 0.02;
    comp.release.value = 0.25;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 6500;
    lowpass.Q.value = 0.4;

    const master = ctx.createGain();
    master.gain.value = 0.26;

    master.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(ctx.destination);

    // Analyser taps the master but is NEVER connected to destination.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    master.connect(analyser);
    this.freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

    this.master = master;
    this.analyser = analyser;

    // ── Always-on warm ambient pad (never silent) ─────────────────────────
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    const padBase = noteFreq(0) / 2; // a warm low root, one octave down
    [1, 1.5, 2].forEach((mult, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = padBase * mult;
      o.detune.value = i === 1 ? 4 : 0;
      o.connect(padGain);
      o.start();
      this.padOsc.push(o);
    });
    padGain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.6);

    if (ctx.state === "suspended") await ctx.resume();
    return true;
  }

  /** Toggle a creature voice on. velocity 0..1 -> brightness. */
  noteOn(index: number, velocity = 0.8): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (this.voices.has(index)) return;

    const now = ctx.currentTime;
    const f = noteFreq(index);
    const level = 0.05 + velocity * 0.07; // gentle, capped well below master

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const osc = ctx.createOscillator();
    osc.type = "triangle"; // soft, warm, not buzzy
    osc.frequency.value = f;
    osc.connect(gain);

    // Detuned partner partial — silent until this voice is in a clash.
    const partnerGain = ctx.createGain();
    partnerGain.gain.value = 0;
    partnerGain.connect(gain);
    const partner = ctx.createOscillator();
    partner.type = "sine";
    partner.frequency.value = f;
    partner.detune.value = 6; // ~+6 cents -> slow beating when active
    partner.connect(partnerGain);

    // Slow shimmer LFO modulating the partner gain (the wobble sound).
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = 3.2; // slow, soothing wobble rate
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0;
    shimmer.connect(shimmerGain);
    shimmerGain.connect(partnerGain.gain);

    osc.start(now);
    partner.start(now);
    shimmer.start(now);

    // Soft attack >= 40ms.
    gain.gain.setTargetAtTime(level, now, 0.05);

    this.voices.set(index, {
      index,
      osc,
      partner,
      partnerGain,
      gain,
      shimmer,
      shimmerGain,
    });
  }

  noteOff(index: number): void {
    const ctx = this.ctx;
    const v = this.voices.get(index);
    if (!ctx || !v) return;
    const now = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0, now, 0.12);
    const stopAt = now + 0.6;
    v.osc.stop(stopAt);
    v.partner.stop(stopAt);
    v.shimmer.stop(stopAt);
    this.voices.delete(index);
  }

  isOn(index: number): boolean {
    return this.voices.has(index);
  }

  heldIndices(): number[] {
    return [...this.voices.keys()].sort((a, b) => a - b);
  }

  /**
   * Apply per-note wobble. `wobble` is 0..1 — drives partner partial amount and
   * shimmer depth ONLY. Never touches the main gain (never louder/harsher).
   */
  applyWobble(index: number, wobble: number): void {
    const ctx = this.ctx;
    const v = this.voices.get(index);
    if (!ctx || !v) return;
    const now = ctx.currentTime;
    // Partner partial amount (the beating). Capped low & soft.
    const partnerLevel = 0.55 * wobble;
    v.partnerGain.gain.setTargetAtTime(partnerLevel, now, 0.18);
    // Shimmer depth modulates the partner gain around its level.
    v.shimmerGain.gain.setTargetAtTime(0.4 * wobble * partnerLevel, now, 0.18);
  }

  /** Soft warm reward chord shimmer when a clash resolves. */
  rewardBloom(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(master);
    // A gentle rising warm triad blip (root, 5th, octave), very soft.
    [0, 7, 12].forEach((semi, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = noteFreq(0) * Math.pow(2, semi / 12) * 2;
      o.connect(g);
      o.start(now + i * 0.05);
      o.stop(now + 1.4);
    });
    g.gain.setTargetAtTime(0.06, now, 0.08);
    g.gain.setTargetAtTime(0, now + 0.5, 0.4);
  }

  /** Average analyser energy 0..1 for visual coupling. */
  energy(): number {
    if (!this.analyser || !this.freqData) return 0;
    this.analyser.getByteFrequencyData(this.freqData);
    let sum = 0;
    for (let i = 0; i < this.freqData.length; i++) sum += this.freqData[i];
    return sum / (this.freqData.length * 255);
  }

  async close(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.voices.values()) {
      try {
        v.osc.stop();
        v.partner.stop();
        v.shimmer.stop();
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    for (const o of this.padOsc) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.padOsc = [];
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.master = null;
    this.analyser = null;
  }
}
