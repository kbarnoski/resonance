// entropy.ts — the REBUS "priors relax" arc for 1300-carrier-bloom.
//
//   RELaxed Beliefs Under pSychedelics (Carhart-Harris & Friston 2019): over a
//   psychedelic experience the brain's high-level priors loosen, so perception
//   grows less constrained, more entropic, more geometrically free. We model that
//   as ONE scalar e ∈ [0,1] that ramps slowly across the piece and then eases
//   back down (come-up → peak → settle), independent of the beat. Everything that
//   should be *audibly and visibly different at minute 3 than at 0:20* reads from
//   this scalar:
//
//     • which form constant dominates    tunnel → spiral → honeycomb
//     • how loose the symmetry is         (added warp jitter)
//     • how many noise octaves fold in    (fine turbulence at the peak)
//
//   Pointer/tilt PERTURBATION can nudge `e` up or down so the player can push the
//   trip deeper or pull it back — the arc is a tide, the hands are a paddle.
//
//   No React, no DOM: a pure state object stepped once per frame.

/** Form-constant blend weights [tunnel, spiral, honeycomb] summing to ~1. */
export interface FormBlend {
  tunnel: number;
  spiral: number;
  honeycomb: number;
}

export interface EntropyState {
  /** 0..1 relaxed-priors scalar (the whole arc reads from this). */
  value: number;
  /** Seconds elapsed since begin(). */
  elapsed: number;
}

/** Length of the slow arc in seconds. ~3.5 min: come-up, peak, settle. */
const ARC_SECS = 210;

export function makeEntropy(): EntropyState {
  return { value: 0.05, elapsed: 0 };
}

/**
 * Advance the arc. `dt` seconds; `push` in [-1,1] is the player's live nudge
 * (drag/tilt energy) that biases the tide up or down. The base shape is a slow
 * asymmetric rise to a plateau near ~2.5 min then a gentle settle, so 0:20 and
 * 3:00 look genuinely different. Clamped to [0,1].
 */
export function stepEntropy(s: EntropyState, dt: number, push: number): void {
  s.elapsed += dt;
  const t = Math.min(1, s.elapsed / ARC_SECS);
  // Asymmetric bell-ish base: rise faster than it falls, plateau in the middle.
  // rise: smoothstep to 1 over first 55%; settle: ease down to ~0.7 after.
  const rise = smoothstep(0.0, 0.55, t);
  const settle = 1.0 - 0.3 * smoothstep(0.7, 1.0, t);
  const base = rise * settle;
  // Player push slews the value toward base±push, so hands can deepen or lift it.
  const target = clamp01(base + 0.35 * push);
  const k = 1 - Math.exp(-dt / 1.6); // ~1.6s smoothing so nudges feel like tide.
  s.value += (target - s.value) * k;
  s.value = clamp01(s.value);
}

/**
 * Map the entropy scalar to form-constant blend weights. Low entropy = a tight
 * tunnel (strong prior); rising entropy morphs tunnel → spiral → honeycomb as
 * the geometry reorganizes. `formBias` in [-1,1] is a live perturbation that
 * pushes the blend toward more-ordered (tunnel) or more-complex (honeycomb).
 */
export function entropyToForm(e: number, formBias: number): FormBlend {
  // Shift the effective position along the tunnel→spiral→honeycomb axis.
  const x = clamp01(e + 0.28 * formBias);
  // Two overlapping ramps centered at 1/3 and 2/3.
  const tunnel = Math.max(0, 1 - x * 2.0);
  const honeycomb = Math.max(0, (x - 0.5) * 2.0);
  const spiral = Math.max(0, 1 - Math.abs(x - 0.5) * 2.2);
  const sum = tunnel + spiral + honeycomb || 1;
  return { tunnel: tunnel / sum, spiral: spiral / sum, honeycomb: honeycomb / sum };
}

/** Number of turbulence octaves to fold in at this entropy (1 → ~4). */
export function entropyNoiseOctaves(e: number): number {
  return 1 + Math.round(e * 3);
}

/** Symmetry-loosening jitter amplitude at this entropy (0 → ~0.35). */
export function entropySymmetryJitter(e: number): number {
  return 0.35 * e * e;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
