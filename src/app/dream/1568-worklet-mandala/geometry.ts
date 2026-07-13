// ─────────────────────────────────────────────────────────────────────────────
// geometry.ts — the Klüver-form-constant mandala generator.
//
// A discrete, radially-symmetric kaleidoscope: concentric RINGS of DOM tiles
// (petals) laid out in rotational symmetry. Each ring is a wrapper <div> that
// spins as a rigid body (that rotation is what AnimationWorklet / rAF drives);
// each tile inside is a petal transformed to its polar slot. Alternating rings
// counter-rotate, which reads as a blooming honeycomb/spiral lattice — three of
// Heinrich Klüver's four form constants at once (spirals, lattice/honeycomb,
// funnel), kept STRICTLY as a symmetric mandala of elements (never a warped
// synthetic wave field).
//
// Everything here is deterministic (seeded PRNG) so the figure is identical on
// every mount. Tile count is held well under 360 so DOM animation stays smooth.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32, rangeOf, SEED } from "./rng";

export interface Tile {
  /** Polar slot angle around the ring, degrees. */
  angleDeg: number;
  /** Distance from center, px. */
  radius: number;
  /** Petal's own orientation, degrees (faces outward). */
  petalDeg: number;
  /** Tile edge length, px. */
  size: number;
  /** Per-tile hue offset added on top of the ring + live container hue. */
  hue: number;
  /** Per-tile brightness jitter, 0..1 → lightness. */
  light: number;
  /** Border-radius pattern index → petal vs lozenge vs blade. */
  shape: number;
}

export interface Ring {
  index: number;
  /** +1 or -1 — spin direction (rings counter-rotate). */
  dir: 1 | -1;
  /** Base spin-speed multiplier for this ring. */
  speedMult: number;
  tiles: Tile[];
}

export interface Mandala {
  /** Square edge of the whole figure, px. */
  size: number;
  rings: Ring[];
  tileCount: number;
}

const RINGS = 8;

/** Build the mandala layout. Pure + seeded. */
export function buildMandala(size = 620): Mandala {
  const rng = mulberry32(SEED ^ 0x9e37);
  const maxR = size * 0.455;
  const rings: Ring[] = [];
  let tileCount = 0;

  for (let r = 0; r < RINGS; r++) {
    const t = (r + 1) / RINGS;
    const radius = maxR * (0.16 + 0.84 * t);
    // Petals grow outward as the ring circumference grows.
    const count = 8 + r * 4; // 8,12,16,…,36  → 176 total, well under 360.
    const dir: 1 | -1 = r % 2 === 0 ? 1 : -1;
    const speedMult = rangeOf(rng, 0.55, 1.65) * (1 + t * 0.35);
    // Ring hue walks violet → magenta → cyan across the radius.
    const ringHue = -30 + t * 130; // added to container --hue at paint time.
    const baseSize = size * (0.05 + 0.055 * t);
    const petalSpin = rangeOf(rng, -18, 18);

    const tiles: Tile[] = [];
    for (let i = 0; i < count; i++) {
      const angleDeg = (360 / count) * i + rangeOf(rng, -1.5, 1.5);
      tiles.push({
        angleDeg,
        radius,
        petalDeg: angleDeg + 90 + petalSpin,
        size: baseSize * rangeOf(rng, 0.86, 1.12),
        hue: ringHue + rangeOf(rng, -12, 12),
        light: rangeOf(rng, 0.5, 0.72),
        shape: i % 3,
      });
    }
    rings.push({ index: r, dir, speedMult, tiles });
    tileCount += count;
  }

  return { size, rings, tileCount };
}

/** Base spin, degrees-per-second, for a ring at playbackRate 1.
 *  Deliberately glacial (well under any flicker band): ~4–13 deg/s. */
export const BASE_DEG_PER_SEC = 8;

/** Border-radius recipes → petal, lozenge, blade. */
export const SHAPE_RADII = [
  "46% 8% 46% 8% / 42% 12% 42% 12%",
  "50% 50% 50% 50% / 64% 64% 36% 36%",
  "30% 70% 70% 30% / 30% 30% 70% 70%",
];
