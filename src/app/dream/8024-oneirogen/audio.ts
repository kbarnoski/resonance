// ─────────────────────────────────────────────────────────────────────────────
// 8024-oneirogen · audio engine — the sonic half of the reality-monitoring crossfade
//
// Six harmonic "band voices" (a harmonic-series stack over A1) sit on a drone bed
// inside a code-generated void reverb. Every frame their gains are crossfaded by
// the hidden dial alpha:
//   • alpha low  → each voice tracks the LIVE mic band energy — the sound you hear
//     is a sonification of your actual spectrum (PERCEPTION: hear-what-you-see).
//   • alpha high → each voice tracks the PRIOR band energy (a running EMA of your
//     recent sound) and slowly detunes on a seeded LFO — the audio is SYNTHESIZED
//     from the prior, not your live input (HALLUCINATION: you hear your own
//     sound-world being dreamed back at you).
// The reverb opens and the drone saturates as alpha rises, so the dream grows more
// spacious and unreal. All time comes from AudioContext.currentTime (deterministic-
// friendly — no Date.now / performance.now / Math.random here).
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/visionary/convolutionVoid";

// Harmonic series over A1 (55 Hz): one representative tone per perceptual band,
// low band = fundamental sub, high band = upper partial.
const BAND_FREQS = [55, 110, 165, 220, 275, 330];

export class OneirogenAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private reverb: VoidReverb;
  private drone: DroneBank;
  private voices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private muted = false;
  private stopped = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.reverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.3 });
    this.master.connect(this.reverb.input);
    this.reverb.output.connect(ctx.destination);

    // A calm just-intonation bed under everything.
    this.drone = startDroneBank(ctx, this.master, { root: 55, peakGain: 0.16 });

    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      osc.type = i < 2 ? "sine" : "triangle";
      osc.frequency.value = BAND_FREQS[i];
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(this.master);
      osc.start();
      this.voices.push({ osc, gain: g });
    }

    const now = ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.9, now + 2.0);
  }

  setMuted(m: boolean) {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.9, now, 0.1);
  }

  /** Called every frame with the current perception / generation state. */
  update(
    liveBands: number[],
    priorBands: number[],
    alpha: number,
    amp: number,
  ) {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      // Crossfade: perception (live) → generation (prior) by alpha.
      const e = liveBands[i] * (1 - alpha) + priorBands[i] * alpha;
      // Upper partials sit quieter so the sub stays the foundation.
      const w = 0.5 / (1 + i * 0.6);
      this.voices[i].gain.gain.setTargetAtTime(
        Math.max(0.0001, e * w * 0.6),
        now,
        0.08,
      );
      // At high alpha the dreamed voice wanders off pitch — it is generated,
      // no longer locked to real input.
      const detune = alpha * 18 * Math.sin(now * (0.13 + i * 0.017) + i);
      this.voices[i].osc.detune.setTargetAtTime(detune, now, 0.2);
    }
    this.drone.setDrive(Math.min(1, amp * 0.7 + alpha * 0.5));
    // The dream grows more spacious / unreal as the discriminator fails.
    this.reverb.setWet(0.25 + 0.55 * alpha);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      /* ctx closing */
    }
    this.drone.stop();
    const killAt = now + 0.5;
    for (const v of this.voices) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }
}
