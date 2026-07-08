// 1280-earth-bell — audio.ts
//
// MODAL SYNTHESIS: the planet rings as a bell. One sine oscillator per normal
// mode, tuned to that mode's real eigenfrequency scaled into the audible band
// (AUDIO_SCALE, ratios preserved) — so the sounding chord IS the Earth's true
// free-oscillation spectrum, transposed up. Each voice's level is driven every
// frame by that mode's decaying envelope from the shared model: a struck mode
// blooms and rings down with a long exponential tail. A soft sub "impact"
// thumps on each strike. Under it all, a very low planetary drone bed and an
// enormous convolution void give the resonance cavernous scale. Voices + bed →
// void → DynamicsCompressor limiter → master (peak ≤ 0.32, 2 s fade-in). Full
// teardown on unmount.

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { MODES, MODE_COUNT, modeAudioHz } from "./modes";

const MASTER_PEAK = 0.3;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  base: number; // per-mode base level (higher modes a touch quieter)
}

export interface AudioEngine {
  /** Push the live mode envelopes into the voices each frame. */
  setModes(env: Float32Array, enabled: boolean[], energy: number): void;
  /** Soft sub thump on a strike (strength 0..1). */
  impact(strength: number): void;
  /** Keep a soft planetary bed alive (the swell). */
  setSwell(on: boolean): void;
  stop(): void;
}

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(16, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.3, now);
  limiter.connect(master);

  // An enormous, slow void tail for planetary scale.
  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 7.5, decay: 2.2, wet: 0.5 });
  reverb.output.connect(limiter);

  // A very low planetary drone bed (the swell), off-ish at rest.
  const drone: DroneBank = startDroneBank(ctx, reverb.input, {
    root: 32.7, // ~C1 — a deep planetary sub
    ratios: [1, 1.5, 2],
    cutoffLow: 90,
    cutoffHigh: 900,
    peakGain: 0.16,
  });
  drone.setDrive(0.06);

  // Modal voice bank: one sine per normal mode.
  const voiceBus = ctx.createGain();
  voiceBus.gain.setValueAtTime(0.9, now);
  voiceBus.connect(reverb.input);
  voiceBus.connect(limiter); // a little dry path so onsets are crisp

  const lowest = Math.min(...MODES.map((d) => modeAudioHz(d)));
  const voices: Voice[] = [];
  for (let i = 0; i < MODE_COUNT; i++) {
    const f = modeAudioHz(MODES[i]);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, now);
    // Slight detune for a slow beat that gives the tone body.
    osc.detune.setValueAtTime(i % 2 === 0 ? -3 : 3, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(voiceBus);
    osc.start();
    // Higher modes gently rolled off so the chord isn't top-heavy.
    const base = 0.16 * Math.pow(lowest / f, 0.35);
    voices.push({ osc, gain, base });
  }

  // A reusable sub-impact voice retriggered on each strike.
  const impactOsc = ctx.createOscillator();
  impactOsc.type = "sine";
  impactOsc.frequency.setValueAtTime(46, now);
  const impactGain = ctx.createGain();
  impactGain.gain.setValueAtTime(0.0001, now);
  impactOsc.connect(impactGain);
  impactGain.connect(limiter);
  impactOsc.start();

  let swellOn = false;
  let stopped = false;

  return {
    setModes(env: Float32Array, enabled: boolean[], energy: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      for (let i = 0; i < MODE_COUNT; i++) {
        const v = voices[i];
        const level = enabled[i] ? env[i] * v.base : 0.0001;
        v.gain.gain.setTargetAtTime(Math.max(0.0001, level), t, 0.05);
      }
      // The void breathes a touch wetter when the planet is quiet.
      reverb.setWet(0.55 - 0.18 * energy);
      drone.setDrive((swellOn ? 0.35 : 0.06) + 0.35 * energy);
    },
    impact(strength: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const s = Math.max(0, Math.min(1, strength));
      const peak = 0.05 + 0.14 * s;
      impactOsc.frequency.setValueAtTime(52, t);
      impactOsc.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      impactGain.gain.cancelScheduledValues(t);
      impactGain.gain.setValueAtTime(Math.max(0.0001, impactGain.gain.value), t);
      impactGain.gain.linearRampToValueAtTime(peak, t + 0.012);
      impactGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    },
    setSwell(on: boolean) {
      swellOn = on;
      if (!stopped) drone.setDrive(on ? 0.35 : 0.06);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      } catch {
        /* ctx already closing */
      }
      drone.stop();
      const killAt = t + 0.6;
      for (const v of voices) {
        try {
          v.osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      try {
        impactOsc.stop(killAt);
      } catch {
        /* already stopped */
      }
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 700);
    },
  };
}
