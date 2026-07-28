// ════════════════════════════════════════════════════════════════════════════
// 3424 — attending · the field model
//
// THE QUESTION: what if attention were a GIFT that grows things — and nothing
// you ever noticed could be lost?
//
// The governing scalar per glyph is `bloom` in [0,1]. It is MONOTONIC and
// NON-DECREASING: every code path here can only ever add to it. There is no
// decay, no eviction, no subtraction. Moving attention away subtracts nothing.
// This is the deliberate emotional inverse of retroactive interference — here,
// adding only ever adds.
//
// Determinism: no Math.random / Date.now. Randomness comes from a seeded
// mulberry32(0x3424); timing is passed in as performance.now() values.
// ════════════════════════════════════════════════════════════════════════════

/** Vogel's golden angle, ~137.507°, in radians. Drives the phyllotaxis. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** ~30–40 soft voice-glyphs. */
export const GLYPH_COUNT = 37;

export const FIELD_CX = 300;
export const FIELD_CY = 300;

/** Spiral packing constant: RADIUS_SCALE * sqrt(i) keeps equal area per glyph. */
const RADIUS_SCALE = 42;

/** A glyph counts as "noticed" once its bloom first crosses this. */
export const NOTICE_THRESHOLD = 0.14;

/** Attention falloff (px). Larger = a gentler, wider touch. */
const FALLOFF = 74;

export interface Glyph {
  /** Index in spiral order (0 = center, growing outward). */
  i: number;
  /** Position in the 600×600 SVG viewBox. */
  x: number;
  y: number;
  /** Continuous, un-snapped fundamental frequency (Hz). */
  freq: number;
  /** Gentle detune (cents) of the second partial, for a slow beating warmth. */
  detune: number;
  /** Per-glyph breathing phase so the field doesn't pulse in lockstep. */
  breathPhase: number;
  /** MONOTONIC, non-decreasing attention scalar in [0,1]. */
  bloom: number;
  /** performance.now() when first noticed, else null. Order builds the constellation. */
  noticedAt: number | null;
}

/** Small deterministic PRNG. Seed with an int; returns a fn giving [0,1). */
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

/** Build the phyllotaxis field. Deterministic: same seed → identical field. */
export function makeField(): Glyph[] {
  const rng = mulberry32(0x3424);
  const glyphs: Glyph[] = [];
  for (let i = 0; i < GLYPH_COUNT; i++) {
    const r = RADIUS_SCALE * Math.sqrt(i);
    const a = i * GOLDEN_ANGLE;
    const x = FIELD_CX + r * Math.cos(a);
    const y = FIELD_CY + r * Math.sin(a);
    // Continuous pitch: inner glyphs low, outer high, ~2.4 octaves, NO scale
    // snapping. A hair of deterministic jitter keeps neighbours from ever
    // landing on an exact ratio.
    const t = i / (GLYPH_COUNT - 1);
    const freq = 116 * Math.pow(2, t * 2.4) * (0.994 + rng() * 0.012);
    const detune = 4 + rng() * 7;
    glyphs.push({
      i,
      x,
      y,
      freq,
      detune,
      breathPhase: rng() * Math.PI * 2,
      bloom: 0,
      noticedAt: null,
    });
  }
  return glyphs;
}

export const FIELD_FREQS = (glyphs: Glyph[]): number[] => glyphs.map((g) => g.freq);
export const FIELD_DETUNES = (glyphs: Glyph[]): number[] => glyphs.map((g) => g.detune);

/**
 * Deposit attention at (fx,fy) with a given strength. The ONLY way bloom
 * changes anywhere in this piece — and it can only ever add. `rate` sets how
 * quickly a well-attended glyph fills; the (1 - 0.7*bloom) term eases the
 * approach to 1 so full bloom is asymptotic and calm.
 */
export function applyBloom(
  glyphs: Glyph[],
  fx: number,
  fy: number,
  strength: number,
  dt: number,
  now: number,
  noticedOrder: number[],
): void {
  if (strength <= 0 || dt <= 0) return;
  const twoSigma2 = 2 * FALLOFF * FALLOFF;
  for (const g of glyphs) {
    if (g.bloom >= 1) continue;
    const dx = g.x - fx;
    const dy = g.y - fy;
    const gauss = Math.exp(-(dx * dx + dy * dy) / twoSigma2);
    const delta = strength * gauss * 0.85 * dt;
    if (delta <= 0) continue;
    // bloom only ever increases.
    g.bloom = Math.min(1, g.bloom + delta * (1 - 0.7 * g.bloom));
    if (g.noticedAt === null && g.bloom >= NOTICE_THRESHOLD) {
      g.noticedAt = now;
      noticedOrder.push(g.i);
    }
  }
}

export interface Autopilot {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  nextRetargetAt: number;
  rng: () => number;
}

/** Deterministic wander that biases toward the LEAST-bloomed region, so the
 *  field fills itself on its own over ~60s with zero input. */
export function makeAutopilot(): Autopilot {
  const rng = mulberry32(0x3424 ^ 0x9e3779b9);
  return {
    fx: FIELD_CX,
    fy: FIELD_CY,
    tx: FIELD_CX,
    ty: FIELD_CY,
    nextRetargetAt: 0,
    rng,
  };
}

export function stepAutopilot(
  ap: Autopilot,
  glyphs: Glyph[],
  now: number,
  dt: number,
): void {
  if (now >= ap.nextRetargetAt) {
    // Pick the least-bloomed glyph, with a little jitter so it doesn't march
    // in a rigid order.
    let best: Glyph | null = null;
    let bestScore = Infinity;
    for (const g of glyphs) {
      const score = g.bloom + ap.rng() * 0.28;
      if (score < bestScore) {
        bestScore = score;
        best = g;
      }
    }
    if (best) {
      ap.tx = best.x;
      ap.ty = best.y;
    }
    ap.nextRetargetAt = now + 2000 + ap.rng() * 1500;
  }
  const k = 1 - Math.exp(-dt * 1.7);
  ap.fx += (ap.tx - ap.fx) * k;
  ap.fy += (ap.ty - ap.fy) * k;
}

/** Map a spectral centroid (Hz) to a focus point in the field: low centroid →
 *  inner (low) glyphs, high centroid → outer (high) glyphs. Log-scaled. */
export function centroidToFocus(
  glyphs: Glyph[],
  centroid: number,
): { fx: number; fy: number } {
  const lo = Math.log(90);
  const hi = Math.log(3800);
  const c = Math.max(lo, Math.min(hi, Math.log(Math.max(1, centroid))));
  const t = (c - lo) / (hi - lo);
  const idx = Math.max(0, Math.min(glyphs.length - 1, Math.round(t * (glyphs.length - 1))));
  const g = glyphs[idx];
  return { fx: g.x, fy: g.y };
}
