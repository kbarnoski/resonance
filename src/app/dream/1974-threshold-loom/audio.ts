// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the sleep-onset cosmic-ambient bed (self-contained Web Audio).
//
//   Three voices, all gated behind a user gesture (the "Begin" button creates
//   the AudioContext) and routed master → limiter → destination at a LOW gain:
//
//     • A SHEPARD–RISSET glissando DESCENDING FOREVER (Shepard 1964 / Risset) —
//       the shared engine in _shared/psych/shepard.ts, run with dir:-1. Sine
//       partials one octave apart under a fixed Gaussian envelope glide down
//       endlessly; there is no audible bottom, so the ear is carried downward
//       toward sleep without ever arriving. As `depth` climbs the glide speeds
//       and brightens — the descent deepens as the sleeper sinks.
//
//     • A soft cosmic PAD — detuned low sine partials through a lowpass. As
//       depth climbs the filter opens a little and the pad swells: the room
//       grows warmer and rounder.
//
//     • A per-keystroke PHOSPHENE CHIME — a very soft, low, enveloped blip that
//       accompanies each visual bloom. Pitches walk a fixed pentatonic scale
//       (an index counter, not randomness) and drop an octave in the deep state.
//       Attack/decay are gentle — no clicks.
//
//   SAFETY / LEVELS: master gain ≤ 0.16 (well under the 0.18 ceiling) → a
//   DynamicsCompressor limiter → destination. Nothing ever blasts.
//
//   DETERMINISM: no Math.random / Date / performance.now. Web Audio ramps use
//   ctx.currentTime (allowed); the glissando advances on the render loop's dt.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";

const MASTER_GAIN = 0.16; // ≤ 0.18 ceiling
const PAD_PARTIALS = [1.0, 1.5017, 2.0, 2.9966]; // gentle off-round JI drone
const PAD_BASE = 58.27; // ~A#1, off-round
// A1 pentatonic-ish scale for the keystroke chimes (low, drowsy).
const CHIME_SCALE = [110.0, 130.81, 146.83, 174.61, 196.0];

export class ThresholdAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private shepard: ShepardEngine;
  private shepGain: GainNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padOscs: OscillatorNode[] = [];
  private chimeBus: GainNode;
  private chimeIndex = 0;
  private started = false;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // master → limiter → destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 26;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Shepard–Risset descending → sub-gain → master.
    this.shepGain = ctx.createGain();
    this.shepGain.gain.value = 0.5;
    this.shepGain.connect(this.master);
    this.shepard = startShepard(ctx, this.shepGain, {
      dir: -1,
      partials: 9,
      fLow: 24.0,
      centerOct: 3.3,
      sigmaOct: 1.5,
      baseRate: 0.02,
      driveRate: 0.1,
      peakGain: 0.5,
    });

    // Cosmic pad: detuned low sines → lowpass → padGain → master.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 260;
    this.padFilter.Q.value = 0.5;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.master);
    for (let i = 0; i < PAD_PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = PAD_BASE * PAD_PARTIALS[i];
      osc.detune.value = (i - 1.5) * 4; // gentle slow beating
      const vg = ctx.createGain();
      vg.gain.value = 1 / (i + 1.6);
      osc.connect(vg);
      vg.connect(this.padFilter);
      osc.start();
      this.padOscs.push(osc);
    }

    // Keystroke chime bus.
    this.chimeBus = ctx.createGain();
    this.chimeBus.gain.value = 0.8;
    this.chimeBus.connect(this.master);
  }

  /** Fade the bed in (called right after Begin). */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(MASTER_GAIN, now + 3.5);
    this.padGain.gain.setValueAtTime(0.0001, now);
    this.padGain.gain.exponentialRampToValueAtTime(0.5, now + 4.0);
  }

  /** Feed the sleep-onset depth (0..1) into the bed. */
  setDepth(depth: number): void {
    if (this.disposed) return;
    const d = Math.min(1, Math.max(0, depth));
    const now = this.ctx.currentTime;
    // Deeper → the descent quickens & brightens.
    this.shepard.setDrive(d);
    // Deeper → the pad opens & swells a little (round, not bright).
    this.padFilter.frequency.setTargetAtTime(240 + d * 520, now, 0.6);
    this.padGain.gain.setTargetAtTime(0.42 + d * 0.5, now, 0.6);
  }

  /** Advance the endless glissando. Call once per frame with dt seconds. */
  step(dt: number): void {
    if (this.disposed) return;
    this.shepard.step(dt);
  }

  /** A soft phosphene chime for a keystroke bloom. */
  chime(depth: number, drowsy: number): void {
    if (this.disposed || !this.started) return;
    const now = this.ctx.currentTime;
    const idx = this.chimeIndex++ % CHIME_SCALE.length;
    const oct = depth > 0.6 ? 0.5 : 1; // sink an octave in the deep state
    const freq = CHIME_SCALE[idx] * oct;

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + drowsy * 400;
    const env = this.ctx.createGain();
    // Softer + longer as it gets drowsier; never a click.
    const peak = 0.06 + drowsy * 0.06;
    const rel = 1.0 + drowsy * 1.8;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    osc.connect(lp);
    lp.connect(env);
    env.connect(this.chimeBus);
    osc.start(now);
    osc.stop(now + rel + 0.05);
  }

  /** Full teardown: fade out, stop every oscillator, release nodes. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      /* ctx closing */
    }
    this.shepard.stop();
    const killAt = now + 0.5;
    for (const osc of this.padOscs) {
      try {
        osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }
}
