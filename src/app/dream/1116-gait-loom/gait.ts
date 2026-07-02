/* ───────────────────────────────────────────────────────────────────────────
   1116-gait-loom — gait.ts

   Two ways to get a stream of footsteps:

   1. createStepDetector() — reads raw DeviceMotion acceleration
      (accelerationIncludingGravity). It removes gravity with a slow low-pass
      "baseline", high-passes the magnitude, and runs a small state machine with
      an adaptive threshold + refractory window to find the impact peak of each
      footfall. Each step carries an estimated cadence (steps/min, EMA-smoothed)
      and a normalized intensity.

   2. createSimGait(seed) — a fully deterministic walker for machines with no
      accelerometer (most desktops, and this headless build env). It emits steps
      at ~108 steps/min with a small seeded, humanized jitter and a slow cadence
      wander. Uses a mulberry32 PRNG — never Math.random — so the same seed always
      produces the same gait. Wall-clock timing (performance.now) drives *when*
      ticks happen, but the content of each step is seed-deterministic.
─────────────────────────────────────────────────────────────────────────── */

export interface StepEvent {
  /** timestamp (ms, performance.now clock) the step was registered */
  t: number;
  /** normalized footfall strength, 0..1 */
  intensity: number;
  /** estimated cadence in steps/min */
  cadence: number;
}

/** Small, fast, seedable PRNG. Deterministic given a seed. */
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface StepDetector {
  /** feed one accelerometer sample; returns a StepEvent on a detected footfall */
  push(x: number, y: number, z: number, t: number): StepEvent | null;
}

/**
 * Footstep detector from a single accelerometer stream.
 * Tuned for a phone held/pocketed while walking (~90–130 spm).
 */
export function createStepDetector(): StepDetector {
  let grav = 9.81; // slow baseline ≈ gravity magnitude
  let lp = 0; // light smoothing of the high-passed signal
  let peakEnv = 1.0; // running envelope of |signal| for adaptive threshold
  let armed = true; // ready to register the next step
  let lastStepMs = 0;
  let cadence = 0; // EMA of steps/min

  const REFRACTORY_MS = 250; // ignore double-peaks faster than 240 spm

  return {
    push(x, y, z, t) {
      const mag = Math.hypot(x, y, z);

      // Track gravity as a very slow moving average, subtract it out.
      grav += (mag - grav) * 0.06;
      const hp = mag - grav;

      // Light smoothing to reject single-sample spikes.
      lp += (hp - lp) * 0.45;
      const a = lp;

      // Adaptive envelope: threshold scales with recent motion energy.
      peakEnv += (Math.abs(a) - peakEnv) * 0.02;
      const thresh = Math.max(0.7, peakEnv * 0.9);

      let ev: StepEvent | null = null;

      if (armed && a > thresh && t - lastStepMs > REFRACTORY_MS) {
        const interval = t - lastStepMs;
        if (lastStepMs > 0 && interval < 2000) {
          const inst = 60000 / interval;
          cadence = cadence === 0 ? inst : cadence + (inst - cadence) * 0.3;
        }
        const intensity = clamp(a / (peakEnv * 2 + 1e-3), 0, 1);
        lastStepMs = t;
        armed = false;
        ev = {
          t,
          intensity: clamp(0.4 + intensity * 0.6, 0, 1),
          cadence: clamp(cadence || 110, 40, 200),
        };
      }

      // Re-arm once the signal falls well back below threshold.
      if (!armed && a < thresh * 0.3) armed = true;

      return ev;
    },
  };
}

export interface SimGait {
  /** call every animation frame with performance.now(); returns a step when due */
  tick(nowMs: number): StepEvent | null;
}

/**
 * Deterministic simulated walker (~baseCadence spm) with seeded humanization.
 * The first tick primes the clock and returns null.
 */
export function createSimGait(seed: number, baseCadence = 108): SimGait {
  const rng = mulberry32(seed);
  let started = false;
  let nextMs = 0;
  let phase = 0; // drives a slow cadence wander

  return {
    tick(nowMs) {
      if (!started) {
        started = true;
        nextMs = nowMs + 450;
        return null;
      }
      if (nowMs < nextMs) return null;

      // Slow, organic cadence wander around the base tempo.
      phase += 0.06;
      const wander = Math.sin(phase) * 6 + Math.sin(phase * 0.37) * 3;
      const cad = clamp(baseCadence + wander, 60, 150);

      // Seeded per-step jitter (never Math.random).
      const jitter = 1 + (rng() - 0.5) * 0.06;
      const interval = (60000 / cad) * jitter;
      nextMs = nowMs + interval;

      const intensity = clamp(0.62 + rng() * 0.38, 0, 1);
      return { t: nowMs, intensity, cadence: cad };
    },
  };
}
