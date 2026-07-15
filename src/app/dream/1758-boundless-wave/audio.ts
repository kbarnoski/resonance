// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the boundless-space audio bed.
//
//   Deliberately NOT a clean just-intonation drone. The pad is a handful of
//   detuned + slightly INHARMONIC partial voices whose ratios sit just off the
//   harmonic series, so a sustained chord shimmers and beats instead of locking.
//   Its brightness and level track the field's total energy (a CPU-side scalar
//   proxy for |u|² integrated over the grid), so the sound fills as the standing
//   wave fills and thins toward a faint breathing ground in silence.
//
//   master graph:  pad → voidReverb → DynamicsCompressor → gain(0.15) → dest
//
//   The microphone is NEVER routed here — only its loudness envelope reaches the
//   field, so there is no feedback path. Determinism: no Math.random / Date in
//   the update path; ctx.currentTime is used only for Web Audio ramps, which the
//   brief allows.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

// Inharmonic pad partials — ratios drift off the harmonic series so sustained
// chords beat and shimmer (boundless, never a locked drone).
const PAD_PARTIALS = [1.0, 1.503, 2.008, 3.02, 4.97, 6.03];
const BASE_FREQ = 48.999; // ~G1, an off-round fundamental so nothing sits dead-on

export class BoundlessAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private reverb: VoidReverb;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padOscs: OscillatorNode[] = [];
  private detuneLfos: OscillatorNode[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 3.0;
    this.comp.attack.value = 0.03;
    this.comp.release.value = 0.4;

    // pad → reverb → compressor → master → destination
    this.reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.4, wet: 0.55 });
    this.reverb.output.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // ── Pad ──────────────────────────────────────────────────────────────────
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 700;
    this.padFilter.Q.value = 0.5;

    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.reverb.input);

    for (let p = 0; p < PAD_PARTIALS.length; p++) {
      const ratio = PAD_PARTIALS[p];
      const freq = BASE_FREQ * ratio;
      // Detuned pair per partial → slow beating.
      for (let s = 0; s < 2; s++) {
        const osc = ctx.createOscillator();
        osc.type = s === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = s === 0 ? -6 : 6;

        // Gentle per-partial detune LFO for evolving shimmer.
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.021 + ratio * 0.013;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 2.5 + ratio; // cents of wobble
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);

        const pg = ctx.createGain();
        pg.gain.value = 0.42 / (ratio * (s === 0 ? 1 : 1.7));
        osc.connect(pg);
        pg.connect(this.padFilter);

        this.padOscs.push(osc);
        this.detuneLfos.push(lfo);
      }
    }
  }

  /** Start the pad and fade the master in. Call from the Begin gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    for (const osc of this.padOscs) osc.start();
    for (const lfo of this.detuneLfos) lfo.start();

    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.linearRampToValueAtTime(0.5, now + 4.0);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.15, now + 3.0);
  }

  /** Per-frame update. fieldLevel 0..1 is the standing-wave energy proxy. */
  step(fieldLevel: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const lv = Math.max(0, Math.min(1, fieldLevel));

    // The pad brightens and swells as the field fills; thins toward a faint
    // breathing ground in silence (never fully gone).
    this.padFilter.frequency.setTargetAtTime(520 + lv * 1700, now, 0.4);
    this.padGain.gain.setTargetAtTime(0.3 + lv * 0.32, now, 0.6);
  }

  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.2);
    } catch {
      /* ctx may be closing */
    }
    const stopAt = now + 0.5;
    for (const osc of this.padOscs) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    for (const lfo of this.detuneLfos) {
      try {
        lfo.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
  }
}
