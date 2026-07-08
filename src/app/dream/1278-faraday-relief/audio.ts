// 1278-faraday-relief — audio.ts
//
// The surface ANSWERS at the subharmonic f/2 — the defining signature of the
// Faraday instability (a parametrically driven fluid responds at half the drive
// frequency). A small voice bank plays f/2 and its overtones; the SYMMETRY
// picks the chord it sings:
//
//   stripes      1, 3/2                     (a bare fifth)
//   square       1, 6/5, 3/2                (a minor triad)
//   hexagon      1, 5/4, 3/2, 9/4           (major add9)
//   quasicrystal 1, 4/3, 16/9, 2, 8/3       (wide quartal shimmer, detuned)
//
// Surface energy E=ΣA_j² opens a lowpass and lifts the voice level — the timbre
// brightens as the relief LOCKS; below ε_c the sound thins to almost nothing.
// Voices + a just-intonation drone bed run through a convolution void, then a
// DynamicsCompressor brick-wall limiter, then a master gain (≤0.32, 2 s ramp).
// Full teardown on unmount.

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import type { ActiveSymmetry } from "./faraday";

const MAX_VOICES = 6;
const MASTER_PEAK = 0.32;

interface ChordSpec {
  ratios: number[];
  detune: number[]; // cents, for the quasicrystal shimmer
}

const CHORDS: Record<ActiveSymmetry, ChordSpec> = {
  stripes: { ratios: [1, 1.5], detune: [0, 0] },
  square: { ratios: [1, 1.2, 1.5], detune: [0, 0, 0] },
  hexagon: { ratios: [1, 1.25, 1.5, 2.25], detune: [0, 0, 0, 0] },
  quasicrystal: {
    ratios: [1, 4 / 3, 16 / 9, 2, 8 / 3],
    detune: [-7, 5, -4, 9, -6],
  },
};

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export interface AudioEngine {
  /** Push the live simulation state into the sound. */
  setState(f: number, symmetry: ActiveSymmetry, energyNorm: number): void;
  stop(): void;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export async function startAudio(): Promise<AudioEngine> {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  await ctx.resume();

  const now = ctx.currentTime;

  // Master + brick-wall limiter.
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_PEAK, now + 2);
  master.connect(ctx.destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(14, now);
  limiter.attack.setValueAtTime(0.003, now);
  limiter.release.setValueAtTime(0.25, now);
  limiter.connect(master);

  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 4, decay: 3, wet: 0.42 });
  reverb.output.connect(limiter);

  const drone: DroneBank = startDroneBank(ctx, reverb.input, { root: 55 });
  drone.setDrive(0.2);

  // Voice bus: voices → lowpass (energy-driven) → level → reverb.
  const voiceBus = ctx.createGain();
  voiceBus.gain.setValueAtTime(0.0001, now);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(400, now);
  lp.Q.setValueAtTime(0.9, now);
  voiceBus.connect(lp);
  lp.connect(reverb.input);

  const voices: Voice[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(110, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    osc.connect(gain);
    gain.connect(voiceBus);
    osc.start();
    voices.push({ osc, gain });
  }

  let stopped = false;

  return {
    setState(f: number, symmetry: ActiveSymmetry, energyNorm: number) {
      if (stopped) return;
      const t = ctx.currentTime;
      const fundamental = f / 2; // the Faraday subharmonic
      const chord = CHORDS[symmetry];
      const en = clamp(energyNorm, 0, 1);

      for (let i = 0; i < MAX_VOICES; i++) {
        const v = voices[i];
        if (i < chord.ratios.length) {
          const freq = fundamental * chord.ratios[i];
          v.osc.frequency.setTargetAtTime(freq, t, 0.08);
          v.osc.detune.setTargetAtTime(chord.detune[i] ?? 0, t, 0.1);
          // higher partials quieter; overall level tracks lock energy
          const partialLvl = 1 / (1 + i * 0.55);
          v.gain.gain.setTargetAtTime((0.02 + 0.16 * en) * partialLvl, t, 0.12);
        } else {
          v.gain.gain.setTargetAtTime(0.0001, t, 0.12);
        }
      }

      // Brighter + louder as the relief locks; thins below threshold.
      lp.frequency.setTargetAtTime(320 + en * en * 4200, t, 0.12);
      voiceBus.gain.setTargetAtTime(0.15 + 0.85 * en, t, 0.12);
      drone.setDrive(0.12 + 0.7 * en);
      reverb.setWet(0.5 - 0.16 * en);
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
      setTimeout(() => {
        ctx.close().catch(() => undefined);
      }, 700);
    },
  };
}
