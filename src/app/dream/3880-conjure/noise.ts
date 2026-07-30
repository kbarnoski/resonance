// Deterministic, phase-seeded pseudo-noise shared by demo/synth/particle
// code. Every call is a pure function of (t, phase) — never stateful RNG
// consumption per-frame — so motion is reproducible regardless of frame
// rate. Phases themselves are drawn once from mulberry32 at construction
// time (see rng.ts). No Math.random / Date.now / new Date anywhere.

/** Smooth wandering value in roughly [-1, 1]. */
export function n1(t: number, phase: number, freq = 0.0027): number {
  return (
    Math.sin(t * freq + phase) * 0.5 +
    Math.sin(t * freq * 2.13 + phase * 1.7) * 0.5
  );
}

/** Smooth wandering value in [0, 1]. */
export function n01(t: number, phase: number, freq?: number): number {
  return (n1(t, phase, freq) + 1) / 2;
}
