// ─────────────────────────────────────────────────────────────────────────────
// noise.ts — the spectrally-shaped noise engine for Noise Veil.
//
//   The load-bearing idea (Pistolas, Smets & Wagemans, i-Perception 2025): in a
//   multimodal Ganzfeld the *spectral character* of the auditory noise steers the
//   CONTENT of the hallucination — brown noise pushed viewers toward water/fluid
//   themes vs white. So here the noise's 1/f slope is the instrument.
//
//   To make white↔pink↔brown a genuine, deterministic, real-time morph we
//   generate three seeded base buffers ONCE (white, pink, brown) with a
//   mulberry32 PRNG — no Math.random on any per-frame path — then equal-power
//   crossfade between them. Slope 0 = white (flat), 0.5 = pink (-3 dB/oct),
//   1 = brown (-6 dB/oct, water-heavy sub).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 32-bit PRNG. Same seed → same noise field, every load. */
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

/** Peak-normalise a channel to ~0.92 so no path clips when crossfaded. */
function normalise(data: Float32Array): void {
  let peak = 1e-6;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  const g = 0.92 / peak;
  for (let i = 0; i < data.length; i++) data[i] *= g;
}

export interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
}

/** Build the three seeded base buffers. Each is a long loopable bed. */
export function makeNoiseBuffers(
  ctx: AudioContext,
  seconds: number,
  seed: number,
): NoiseBuffers {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const rand = mulberry32(seed);

  const white = ctx.createBuffer(1, n, sr);
  const pink = ctx.createBuffer(1, n, sr);
  const brown = ctx.createBuffer(1, n, sr);
  const w = white.getChannelData(0);
  const p = pink.getChannelData(0);
  const b = brown.getChannelData(0);

  // Paul Kellet's economy pink filter state.
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  // Brown = leaky integral of white.
  let last = 0;

  for (let i = 0; i < n; i++) {
    const wn = rand() * 2 - 1;
    w[i] = wn;

    b0 = 0.99886 * b0 + wn * 0.0555179;
    b1 = 0.99332 * b1 + wn * 0.0750759;
    b2 = 0.969 * b2 + wn * 0.153852;
    b3 = 0.8665 * b3 + wn * 0.3104856;
    b4 = 0.55 * b4 + wn * 0.5329522;
    b5 = -0.7616 * b5 - wn * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + wn * 0.5362;
    b6 = wn * 0.115926;

    last = (last + 0.02 * wn) / 1.02;
    b[i] = last;
  }

  normalise(w);
  normalise(p);
  normalise(b);
  return { white, pink, brown };
}

/** Equal-power crossfade weights for a slope in [0,1].
 *  0 → white, 0.5 → pink, 1 → brown. Two triangular segments. */
export function slopeToGains(slope: number): {
  white: number;
  pink: number;
  brown: number;
} {
  const s = Math.min(1, Math.max(0, slope));
  const HALF_PI = Math.PI / 2;
  if (s <= 0.5) {
    const t = s / 0.5;
    return { white: Math.cos(t * HALF_PI), pink: Math.sin(t * HALF_PI), brown: 0 };
  }
  const t = (s - 0.5) / 0.5;
  return { white: 0, pink: Math.cos(t * HALF_PI), brown: Math.sin(t * HALF_PI) };
}

/** A short human label for the current spectral character. */
export function slopeToLabel(slope: number): string {
  const s = Math.min(1, Math.max(0, slope));
  if (s < 0.17) return "white — bright, flat, even";
  if (s < 0.4) return "white → pink";
  if (s < 0.6) return "pink — warm 1/f glow";
  if (s < 0.83) return "pink → brown";
  return "brown — deep, oceanic, fluid";
}
