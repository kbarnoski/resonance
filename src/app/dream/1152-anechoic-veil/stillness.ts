// ─────────────────────────────────────────────────────────────────────────────
// stillness.ts — the "silence integrator" state machine for 1152-anechoic-veil.
//
//   The instrument is your STILLNESS. This module holds the one piece of state
//   that everything else is a function of: a running `stillness` value in [0,1]
//   that RISES the longer the measured mic RMS stays below a threshold and FALLS
//   sharply the instant sound spikes. A second `scatter` value tracks the
//   momentary loudness so the veil can visibly erode/scatter on a transient.
//
//   No React, no DOM — safe to instantiate anywhere and step from a RAF loop.
//   Deterministic: no Math.random / Date.now on any path here.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32). Used only at init for fixed per-ring phase
 *  offsets — never in a hot path. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RMS below this counts as "silence" and lets stillness accrue. Tuned for a
 *  quiet room read via getByteTimeDomainData (0 = silence, ~0.1+ = speech). */
export const SILENCE_THRESHOLD = 0.045;

// Rise is slow (~7–8 s of held silence to fully bloom). Fall is sharp — a spike
// erodes seconds of accrued stillness in a heartbeat. Reward for restraint.
const RISE_PER_SEC = 0.135;
const FALL_BASE_PER_SEC = 0.18;
const FALL_GAIN = 4.4;
const SCATTER_EASE = 8.0;

/** Read a true time-domain RMS (0..1) from an AnalyserNode. */
export function readRms(
  analyser: AnalyserNode,
  buf: Uint8Array,
): number {
  // TS 5.5+ narrows the typed-array param; the runtime type satisfies it.
  analyser.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}

/** The silence integrator. `stillness` drives the bloom + drone swell;
 *  `scatter` is the momentary erosion driven by loudness. */
export class StillnessIntegrator {
  stillness = 0;
  scatter = 0;

  /** Advance by `dtSec` seconds given the current measured RMS. */
  step(dtSec: number, rms: number): void {
    // Clamp huge frame gaps (tab was backgrounded) so nothing snaps.
    const dt = Math.min(0.05, Math.max(0, dtSec));

    if (rms < SILENCE_THRESHOLD) {
      // Rise scales with how deep the silence is — total silence blooms fastest.
      const depth = 1 - rms / SILENCE_THRESHOLD;
      this.stillness += RISE_PER_SEC * depth * dt;
    } else {
      // Louder-than-threshold: fall, harder the louder it gets.
      const over = rms - SILENCE_THRESHOLD;
      this.stillness -= (FALL_BASE_PER_SEC + over * FALL_GAIN) * dt;
    }
    this.stillness = Math.min(1, Math.max(0, this.stillness));

    // Scatter chases instantaneous loudness (erosion you can see immediately).
    const target = Math.min(1, Math.max(0, (rms - SILENCE_THRESHOLD) / 0.22));
    const k = Math.min(1, dt * SCATTER_EASE);
    this.scatter += (target - this.scatter) * k;
  }
}
