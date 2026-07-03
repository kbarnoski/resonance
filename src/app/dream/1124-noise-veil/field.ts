// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the seeded "wave after wave" macro-swell controller.
//
//   This is the shared brain that both the audio (panner-voice gains + slow
//   orbit) and the visual (fog density + drift) read from every frame. It is a
//   PURE function of time, the slope/intensity controls, and a seeded set of
//   per-voice phases/rates — so:
//     • the visual can animate the instant the page loads, before any audio
//       exists (never blank), and
//     • once audio starts, sound and image move as ONE field (never divergent).
//
//   "Wave after wave" (the study's phrase) is a bank of very slow LFOs
//   (0.02–0.09 Hz) whose phases are seeded, so swells roll around the field
//   forever without a per-frame Math.random anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./noise";

export const N_VOICES = 5;

/** Seeded, deterministic per-voice constants — built ONCE at module load. */
function buildVoices(seed: number) {
  const rand = mulberry32(seed);
  const rates: number[] = [];
  const phases: number[] = [];
  const az: number[] = []; // base azimuth around the listener (radians)
  const el: number[] = []; // base elevation
  for (let i = 0; i < N_VOICES; i++) {
    rates.push(0.02 + rand() * 0.07); // 0.02–0.09 Hz — glacial swells
    phases.push(rand());
    az.push(((i + 0.5) / N_VOICES) * Math.PI * 2 - Math.PI + (rand() - 0.5) * 0.4);
    el.push((rand() - 0.5) * 0.7);
  }
  return { rates, phases, az, el };
}

const VOICES = buildVoices(0x5eed_1124);

export interface FieldState {
  t: number;
  slope: number; // 0 white … 1 brown
  intensity: number; // 0..1 master
  drive: number; // overall energy 0..1 (intensity × swell)
  swell: number; // the big master wave 0..1
  flow: number; // motion-speed factor (brown ⇒ more oceanic drift)
  voices: number[]; // per-voice envelope 0..1
  azimuth: number[]; // per-voice current azimuth (rad)
  elevation: number[]; // per-voice current elevation (rad)
}

/** Evaluate the whole field at absolute time t (seconds). */
export function computeField(
  t: number,
  slope: number,
  intensity: number,
  reduced: boolean,
): FieldState {
  const TAU = Math.PI * 2;
  const ts = reduced ? 0.45 : 1; // reduced-motion ⇒ slow everything further
  const s = Math.min(1, Math.max(0, slope));
  const inten = Math.min(1, Math.max(0, intensity));

  // The master swell — one very slow ocean-breath over the whole field.
  const swell = 0.5 + 0.5 * Math.sin(TAU * (t * ts * 0.017 + 0.13));

  const voices: number[] = [];
  const azimuth: number[] = [];
  const elevation: number[] = [];
  for (let i = 0; i < N_VOICES; i++) {
    const env =
      0.5 + 0.5 * Math.sin(TAU * (t * ts * VOICES.rates[i] + VOICES.phases[i]));
    // Brown biases toward slow, deep, coherent swells (more contrast); white is
    // flatter and more even. Blend the raw env toward the swell as slope rises.
    const shaped = env * (1 - s * 0.35) + swell * (s * 0.35);
    voices.push(shaped);

    // Slow orbit around the listener — brown drifts faster (oceanic current).
    const orbit = t * ts * (0.006 + s * 0.02) * (i % 2 === 0 ? 1 : -1);
    azimuth.push(VOICES.az[i] + orbit);
    elevation.push(VOICES.el[i] + 0.25 * Math.sin(TAU * t * ts * 0.008 + i));
  }

  const drive = inten * (0.4 + 0.6 * swell);
  const flow = ts * (0.25 + s * 0.95); // brown ⇒ oceanic drift, white ⇒ still

  return {
    t,
    slope: s,
    intensity: inten,
    drive,
    swell,
    flow,
    voices,
    azimuth,
    elevation,
  };
}
