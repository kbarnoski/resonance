// Shared field model + deterministic helpers for the "Ensemble" duet.
// No Math.random / Date.now on the sim path — see mulberry32 below.

export const N_STRINGS = 22;

// Continuous log-frequency rack. Deliberately NOT snapped to a just / tempered
// scale — free ratios are the point (telematic "shared resonant field", not a
// keyboard). Pitch is a smooth function of string index (i.e. of y position).
export const F_MIN = 116;
export const F_MAX = 712;

export function stringFreq(i: number): number {
  const t = i / (N_STRINGS - 1);
  return F_MIN * Math.pow(F_MAX / F_MIN, t);
}

export function allFreqs(): number[] {
  return Array.from({ length: N_STRINGS }, (_, i) => stringFreq(i));
}

// Seeded PRNG — every stochastic decision in the sim path (ghost timing, the
// Karplus–Strong excitation noise) is driven by this so a headless review is
// bit-for-bit reproducible.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ghost seed — the "second player" that always joins so the piece duets solo.
export const GHOST_SEED = 0x2912;

// Violet ramp. Local player is the calm core violet; the partner is a shifted
// magenta-violet so two presences read as distinct without leaving the hue band.
const PLAYER_HUES = [266, 300, 250, 288, 318, 236];

export function playerHue(player: number): number {
  return PLAYER_HUES[player % PLAYER_HUES.length];
}

export function playerHsl(player: number, light = 66, alpha = 1): string {
  const h = playerHue(player);
  return alpha >= 1
    ? `hsl(${h} 80% ${light}%)`
    : `hsl(${h} 80% ${light}% / ${alpha})`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
