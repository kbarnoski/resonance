// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the DISSOLVE sound-world, tracking the edge-precision scalar.
//
//   • MOTION (precision → 1): audio FOCUSES to a bright, present tone. The shared
//     just-intonation drone bed (droneBank) opens its filter, and a Shepard–Risset
//     ascent brightens — a here-now foreground.
//   • STILLNESS (precision → 0): audio OPENS into a wide, detuned WASH. A separate
//     pad of three sines a fifth+octave apart, whose detune spread WIDENS with the
//     long-form dissolution depth, swells up under a soft lowpass — boundless,
//     ego-dissolved, cosmic-ambient.
//
//   All engines are built + resumed only inside the Start gesture (the page owns
//   the AudioContext). Fully torn down on stop().
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "../_shared/psych/shepard";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";

export interface DissolveAudio {
  /** precision & depth both 0..1. */
  setState(precision: number, depth: number): void;
  step(dt: number): void;
  stop(): void;
}

interface WashVoice {
  osc: OscillatorNode;
  baseFreq: number;
  detuneSign: number;
}

export function makeDissolveAudio(ctx: AudioContext): DissolveAudio {
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Core present-focused bed: brightens with precision.
  const drone = startDroneBank(ctx, master, {
    root: 55,
    cutoffLow: 170,
    cutoffHigh: 2400,
    peakGain: 0.26,
  });

  // Present-tone ascent: a Shepard glissando that brightens when moving.
  const shep = startShepard(ctx, master, {
    peakGain: 0.3,
    driveRate: 0.14,
    baseRate: 0.012,
  });

  // ── the wide detuned WASH (cosmic-ambient, swells in stillness) ─────────────
  const washGain = ctx.createGain();
  washGain.gain.value = 0.0001;
  const washLP = ctx.createBiquadFilter();
  washLP.type = "lowpass";
  washLP.frequency.value = 700;
  washLP.Q.value = 0.6;
  washLP.connect(washGain);
  washGain.connect(master);

  const washRatios = [1, 1.5, 2.0]; // root, fifth, octave
  const washVoices: WashVoice[] = [];
  const washRoot = 82.5; // ~E2
  for (let i = 0; i < washRatios.length; i++) {
    for (const sign of [-1, 1]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const baseFreq = washRoot * washRatios[i];
      osc.frequency.value = baseFreq;
      const g = ctx.createGain();
      g.gain.value = 0.5 / washRatios[i];
      osc.connect(g);
      g.connect(washLP);
      osc.start();
      washVoices.push({ osc, baseFreq, detuneSign: sign });
    }
  }

  let stopped = false;

  return {
    setState(precision: number, depth: number) {
      const p = Math.min(1, Math.max(0, precision));
      const d = Math.min(1, Math.max(0, depth));
      const still = 1 - p;
      const now = ctx.currentTime;

      // present bed + ascent brighten with precision
      drone.setDrive(p);
      shep.setDrive(0.08 + p * 0.85);

      // wash swells + widens its detune as stillness deepens
      if (!stopped) {
        const washLevel = 0.34 * still * (0.45 + 0.55 * d);
        washGain.gain.setTargetAtTime(washLevel, now, 0.4);
        // filter opens slightly with depth so the wash breathes, but stays soft
        washLP.frequency.setTargetAtTime(500 + 900 * d, now, 0.5);
        const spread = 6 + 34 * d * still; // cents, widens in deep stillness
        for (const v of washVoices) {
          v.osc.detune.setTargetAtTime(v.detuneSign * spread, now, 0.5);
        }
      }
    },
    step(dt: number) {
      shep.step(dt);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        washGain.gain.cancelScheduledValues(now);
        washGain.gain.setValueAtTime(Math.max(0.0001, washGain.gain.value), now);
        washGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* ctx closing */
      }
      const killAt = now + 0.7;
      for (const v of washVoices) {
        try {
          v.osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
      drone.stop();
      shep.stop();
    },
  };
}
