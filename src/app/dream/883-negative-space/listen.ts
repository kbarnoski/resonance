// listen.ts — energy pipeline shared by the live mic AND the synthetic auto-demo.
//
// The whole point of 883-negative-space is the INVERSION: silence drives the
// music. So the one number that matters is "energy" (short-term RMS). Whether
// that energy comes from a real microphone or from a scripted synthetic signal,
// it flows through the *identical* logic here. That guarantees the auto-demo
// proves the concept with the same code path the live mic would exercise.

export interface StillnessState {
  /** Smoothed short-term energy 0..1 (RMS-ish). */
  energy: number;
  /** Seconds of continuous stillness accumulated (clamped). */
  stillSeconds: number;
  /** 0..1 duck amount — 1 = fully ducked (you just made a sound). */
  duck: number;
  /** True the moment energy crosses the threshold upward (an onset). */
  onset: boolean;
  /** True while energy is below threshold (you are being still). */
  still: boolean;
}

export interface StillnessConfig {
  /** Energy above this counts as "sound" and resets the bloom. */
  threshold: number;
  /** Cap on accumulated stillness (seconds) — bounds the bloom. */
  maxStillSeconds: number;
  /** How fast duck rushes toward 1 when sound appears (per second). */
  duckAttack: number;
  /** How fast duck relaxes back toward 0 when quiet returns (per second). */
  duckRelease: number;
}

export const DEFAULT_CONFIG: StillnessConfig = {
  threshold: 0.06,
  maxStillSeconds: 16,
  duckAttack: 14,
  duckRelease: 1.1,
};

export function makeStillnessState(): StillnessState {
  return { energy: 0, stillSeconds: 0, duck: 0, onset: false, still: true };
}

/** Advance the stillness model by `dt` seconds given a raw energy sample. */
export function stepStillness(
  s: StillnessState,
  rawEnergy: number,
  dt: number,
  cfg: StillnessConfig = DEFAULT_CONFIG,
): StillnessState {
  // Smooth the raw energy a little so single noisy samples don't flicker.
  const energy = s.energy + (rawEnergy - s.energy) * Math.min(1, dt * 18);
  const wasStill = s.still;
  const still = energy < cfg.threshold;
  const onset = wasStill && !still;

  let stillSeconds = s.stillSeconds;
  let duck = s.duck;

  if (still) {
    // Silence: accumulate stillness, relax the duck back toward open.
    stillSeconds = Math.min(cfg.maxStillSeconds, stillSeconds + dt);
    duck = Math.max(0, duck - cfg.duckRelease * dt);
  } else {
    // Sound: rush the duck closed and FREEZE the bloom where it is (we do not
    // reset stillSeconds to 0 — the piece "resumes building from where it left
    // off", per the brief, but it stops climbing while you make noise).
    duck = Math.min(1, duck + cfg.duckAttack * dt);
  }

  return { energy, stillSeconds, duck, onset, still };
}

/** Compute RMS of a time-domain buffer in [-1, 1] (or [0,255] byte) form. */
export function rmsOfTimeDomain(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
