// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the per-note pluck/bell synth for "Dream Replay", plus the routing
// that wires the shared drone bed + void reverb behind it. Just-intonation
// ratios over a root; triangle/sine through a short exponential-decay gain;
// capped polyphony with self-cleaning nodes; everything into a final
// DynamicsCompressor. AudioContext is created/resumed only from a user gesture
// (the Begin button) — the page keeps the visuals running if audio is blocked.
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

/**
 * A one-octave-plus just-intonation diatonic scale as pure ratios over the root.
 * Index 0 = lowest (unison). Chosen for a warm, consonant "bell garden" — every
 * onset lands in tune with the drone. Extends a little past the octave so the
 * vertical range of the canvas maps to a satisfying pitch span.
 */
export const JUST_RATIOS: number[] = [
  1, // 1/1  unison
  9 / 8, // major 2nd
  5 / 4, // major 3rd
  4 / 3, // perfect 4th
  3 / 2, // perfect 5th
  5 / 3, // major 6th
  15 / 8, // major 7th
  2, // octave
  9 / 4, // 9th
  5 / 2, // 10th (major 3rd + octave)
];

export const SCALE_SIZE = JUST_RATIOS.length;

const ROOT_HZ = 196; // G3 — a calm, low-mid centre.

export interface DreamAudio {
  /** Fire one bell at a scale index (0..SCALE_SIZE-1) and velocity 0..1. */
  pluck(pitchIndex: number, velocity: number, alpha: number): void;
  /** Drive the shared drone + reverb wetness from the oneirogen alpha 0..1. */
  setAlpha(alpha: number): void;
  /** Fade + tear everything down (call before closing the context). */
  stop(): void;
}

const MAX_VOICES = 10;

/**
 * Build the audio graph on an already-resumed context. Returns null-safe voice
 * scheduling. The caller owns the AudioContext lifecycle.
 */
export function startAudio(ctx: AudioContext): DreamAudio {
  // ── Master bus ─────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  master.connect(comp);
  comp.connect(ctx.destination);

  // ── Shared void reverb (plucks + drone route through it) ────────────────────
  const verb: VoidReverb = createVoidReverb(ctx, {
    seconds: 4.5,
    decay: 2.6,
    wet: 0.28,
  });
  verb.output.connect(master);

  // Dry pluck bus (so plucks are audible even without the wet tail).
  const dryPlucks = ctx.createGain();
  dryPlucks.gain.value = 0.9;
  dryPlucks.connect(master);

  // ── Shared drone bed — quiet continuous foundation ──────────────────────────
  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: ROOT_HZ / 2, // an octave below the plucks
    cutoffLow: 200,
    cutoffHigh: 2400,
    peakGain: 0.16,
  });
  drone.setDrive(0.05);

  let activeVoices = 0;

  const pluck = (pitchIndex: number, velocity: number, alpha: number) => {
    if (ctx.state !== "running") return;
    if (activeVoices >= MAX_VOICES) return;

    const idx = Math.max(0, Math.min(SCALE_SIZE - 1, Math.round(pitchIndex)));
    const ratio = JUST_RATIOS[idx];
    const freq = ROOT_HZ * ratio;
    const now = ctx.currentTime;
    const vel = Math.max(0.05, Math.min(1, velocity));

    // As the dream deepens, notes ring longer and softer — bells smearing into
    // afterimage. Awake they are short, present, faithful.
    const decay = 0.45 + alpha * 1.9;
    const peak = vel * (0.28 - alpha * 0.1);

    const osc = ctx.createOscillator();
    // Warmer/rounder as we dream (sine); brighter/plainer awake (triangle).
    osc.type = alpha > 0.55 ? "sine" : "triangle";
    osc.frequency.value = freq;

    // A quiet higher partial gives the "bell" shimmer, stronger awake.
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.01;
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.18 * (1 - alpha * 0.6);
    partial.connect(partialGain);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.008 + decay);

    // Gentle lowpass so higher notes aren't harsh; opens a touch with velocity.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1400 + vel * 2600;
    tone.Q.value = 0.6;

    osc.connect(env);
    partialGain.connect(env);
    env.connect(tone);
    // Route to both the dry bus and the reverb; wetness grows via verb.setWet().
    tone.connect(dryPlucks);
    tone.connect(verb.input);

    activeVoices++;
    const stopAt = now + 0.008 + decay + 0.05;
    osc.start(now);
    partial.start(now);
    osc.stop(stopAt);
    partial.stop(stopAt);

    const cleanup = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      try {
        osc.disconnect();
        partial.disconnect();
        partialGain.disconnect();
        env.disconnect();
        tone.disconnect();
      } catch {
        /* already gone */
      }
    };
    osc.onended = cleanup;
  };

  const setAlpha = (alpha: number) => {
    const a = Math.min(1, Math.max(0, alpha));
    // Drone swells and the void opens as the dream takes over.
    drone.setDrive(0.05 + a * 0.75);
    verb.setWet(0.28 + a * 0.5);
  };

  const stop = () => {
    drone.stop();
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } catch {
      /* context closing */
    }
  };

  return { pluck, setAlpha, stop };
}
