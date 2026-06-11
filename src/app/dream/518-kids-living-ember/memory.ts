/**
 * memory.ts — Long-form drift engine + cumulative memory for the Living Ember.
 *
 * The ember state is driven by two slow drift functions (sums of incommensurate
 * LFOs with irrational-ratio frequencies over a ~5-minute base period) PLUS
 * accumulated child hum energy, so the state NEVER loops back and is
 * demonstrably different at minute 5 vs second 30.
 *
 * No imports. No DOM access. Pure math, pure state.
 */

// Irrational-ratio frequency multipliers ensure the combined LFO never repeats.
// Base period = 300 s (5 minutes).
const BASE = 300; // seconds

// Feed-rate drift: sum of 4 incommensurate LFOs
const FEED_LFOS: Array<[number, number, number]> = [
  // [amplitude, freq (Hz), phase_offset (rad)]
  [0.008, 1.0 / BASE,         0.0],
  [0.005, Math.PI / BASE,    0.7],
  [0.003, Math.E  / BASE,    2.1],
  [0.002, 1.618034 / BASE,   4.3], // golden ratio
];

// Kill-rate drift
const KILL_LFOS: Array<[number, number, number]> = [
  [0.007, 1.0         / BASE, 1.2],
  [0.004, Math.SQRT2  / BASE, 3.0],
  [0.003, Math.PI     / BASE, 0.3],
  [0.002, 2.71828     / BASE, 5.1],
];

// Base Gray-Scott parameters — "warm coral / Turing spot" zone
export const BASE_F = 0.0540;
export const BASE_K = 0.0630;

/** Accumulated hum energy (never decremented) */
let cumulativeHum = 0;

/** Last update time (seconds) */
let lastT = 0;

export interface EmberState {
  /** Gray-Scott feed rate (drives GPU RD step) */
  f: number;
  /** Gray-Scott kill rate (drives GPU RD step) */
  k: number;
  /** Brightness boost 0–1 from recent humming */
  humBoost: number;
  /** Slow bloom pulse 0–1 */
  bloom: number;
  /** Cumulative hum energy — monotonically increases, caps at ~6 */
  totalHum: number;
  /** Elapsed time in seconds */
  t: number;
}

/**
 * Evaluate a bank of LFOs at time t.
 */
function evalLFOs(lfos: Array<[number, number, number]>, t: number): number {
  let val = 0;
  for (const [amp, freq, phase] of lfos) {
    val += amp * Math.sin(2 * Math.PI * freq * t + phase);
  }
  return val;
}

/**
 * Tick the memory state forward.
 * @param tSec  current elapsed seconds
 * @param rms   current mic RMS energy (0–1); 0 = silence
 * @returns current EmberState
 */
export function tickMemory(tSec: number, rms: number): EmberState {
  const dt = tSec - lastT;
  lastT = tSec;

  // Accumulate hum energy permanently (slow integrator)
  cumulativeHum += rms * Math.max(0, dt) * 0.8;

  // Drift from LFOs (incommensurate → never repeats)
  const fDrift = evalLFOs(FEED_LFOS, tSec);
  const kDrift = evalLFOs(KILL_LFOS, tSec);

  // Cumulative hum shifts morphology permanently toward a warmer zone
  const humShift = Math.min(0.018, cumulativeHum * 0.0004);

  const f = Math.max(0.020, Math.min(0.080, BASE_F + fDrift + humShift));
  const k = Math.max(0.045, Math.min(0.075, BASE_K + kDrift - humShift * 0.5));

  // Bloom: slow envelope on the lowest-frequency LFO
  const bloom = 0.5 + 0.5 * Math.sin(2 * Math.PI * (1.0 / BASE) * tSec);

  // humBoost: smoothed live RMS (clamped)
  const humBoost = Math.min(1.0, rms * 2.5);

  return {
    f,
    k,
    humBoost,
    bloom,
    totalHum: cumulativeHum,
    t: tSec,
  };
}

/** Reset memory (call on fresh start so module-level state is clean) */
export function resetMemory(): void {
  cumulativeHum = 0;
  lastT = 0;
}

/**
 * Simulated hum envelope for auto-demo / no-mic mode.
 * Returns a soft oscillating RMS value so the ember always looks alive.
 */
export function autoDemoRms(tSec: number): number {
  // Gentle breath pattern: slow rise every ~12 seconds
  const breath  = 0.5 + 0.5 * Math.sin(2 * Math.PI * tSec / 12.0);
  // Slower deeper wave every ~47 seconds
  const deep    = 0.5 + 0.5 * Math.sin(2 * Math.PI * tSec / 47.0);
  // Flutter
  const flutter = 0.5 + 0.5 * Math.sin(2 * Math.PI * tSec / 3.7);
  return (breath * 0.5 + deep * 0.3 + flutter * 0.2) * 0.55;
}
