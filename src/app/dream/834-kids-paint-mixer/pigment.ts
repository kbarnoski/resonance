// pigment.ts — Kubelka-Munk subtractive pigment mixing
//
// Re-implemented from first principles + Spectral.js (MIT, rvanwijnen/spectral.js)
// Kubelka-Munk: each pigment is characterised by absorption (K) and scattering (S)
// spectra. Mixing is done in K/S space (linear, additive by weight), not in RGB.
// This gives physically-correct subtractive mixing: blue + yellow = green,
// red + yellow = orange, red + blue = purple.
//
// We use the 36-sample (380–730 nm, 10 nm step) spectral representation from
// Spectral.js. RGB primaries are mapped to their approximate spectral reflectance
// curves, allowing us to re-implement the same approach inline with no npm deps.

// ── CIE 1931 2° colour-matching functions (36 samples, 380–730nm 10nm step) ──
// Source: CIE publication 15:2004, tabulated & normalised for sRGB reconstruction
const CIE_X: number[] = [
  0.0014,0.0042,0.0143,0.0435,0.1344,0.2839,0.3483,0.3362,0.2908,0.1954,
  0.0956,0.0320,0.0049,0.0093,0.0633,0.1655,0.2904,0.4334,0.5945,0.7621,
  0.9163,1.0263,1.0622,1.0026,0.8544,0.6424,0.4479,0.2835,0.1649,0.0874,
  0.0468,0.0227,0.0114,0.0058,0.0029,0.0014,
]
const CIE_Y: number[] = [
  0.0000,0.0001,0.0004,0.0012,0.0040,0.0116,0.0230,0.0380,0.0600,0.0910,
  0.1390,0.2080,0.3230,0.5030,0.7100,0.8620,0.9540,0.9950,0.9950,0.9520,
  0.8700,0.7570,0.6310,0.5030,0.3810,0.2650,0.1750,0.1070,0.0610,0.0320,
  0.0170,0.0082,0.0041,0.0021,0.0010,0.0005,
]
const CIE_Z: number[] = [
  0.0065,0.0201,0.0679,0.2074,0.6456,1.3856,1.7471,1.7721,1.6692,1.2876,
  0.8130,0.4652,0.2720,0.1582,0.0782,0.0422,0.0203,0.0087,0.0037,0.0021,
  0.0017,0.0011,0.0008,0.0003,0.0002,0.0000,0.0000,0.0000,0.0000,0.0000,
  0.0000,0.0000,0.0000,0.0000,0.0000,0.0000,
]

const N = 36 // number of spectral samples

// ── Spectral reflectance curves for our 3 pigment primaries ─────────────────
// Magenta-red (cadmium red-like): high reflectance in red + blue-violet bands
const R_RED: number[] = [
  0.40,0.38,0.35,0.30,0.25,0.20,0.15,0.12,0.10,0.08,
  0.07,0.06,0.06,0.06,0.07,0.08,0.10,0.12,0.14,0.16,
  0.18,0.22,0.32,0.50,0.72,0.88,0.95,0.97,0.97,0.96,
  0.96,0.95,0.95,0.94,0.94,0.93,
]
// Process yellow: absorbs blue/violet, reflects green + red
const R_YELLOW: number[] = [
  0.05,0.05,0.06,0.06,0.07,0.08,0.10,0.13,0.17,0.22,
  0.30,0.42,0.60,0.78,0.90,0.95,0.96,0.97,0.97,0.96,
  0.95,0.94,0.93,0.92,0.91,0.90,0.89,0.89,0.89,0.88,
  0.88,0.88,0.88,0.87,0.87,0.87,
]
// Phthalocyanine blue/cyan: absorbs red/orange, reflects blue-green
const R_BLUE: number[] = [
  0.90,0.91,0.91,0.90,0.88,0.82,0.72,0.60,0.48,0.36,
  0.25,0.16,0.09,0.05,0.04,0.04,0.05,0.07,0.09,0.11,
  0.12,0.11,0.10,0.08,0.06,0.05,0.04,0.04,0.04,0.04,
  0.04,0.04,0.04,0.04,0.04,0.04,
]
// White (titanium white): near-perfect diffuse reflector
const R_WHITE: number[] = Array(N).fill(0.97)

// ── Kubelka-Munk: convert reflectance ↔ K/S ratio ───────────────────────────
// K/S = (1 - R)² / (2R)
function rToKS(r: number): number {
  const rc = Math.max(0.001, Math.min(0.999, r))
  return (1 - rc) * (1 - rc) / (2 * rc)
}

// Given K/S, recover reflectance via K-M quadratic: R = 1 + K/S - sqrt((K/S)² + 2·K/S)
function ksToR(ks: number): number {
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks)
}

// ── Primary KS spectra ────────────────────────────────────────────────────────
function buildKS(r: number[]): number[] {
  return r.map(rToKS)
}

const KS_RED    = buildKS(R_RED)
const KS_YELLOW = buildKS(R_YELLOW)
const KS_BLUE   = buildKS(R_BLUE)
const KS_WHITE  = buildKS(R_WHITE)

// ── Spectral → XYZ → linear RGB ──────────────────────────────────────────────
function spectrumToXYZ(r: number[]): [number, number, number] {
  let X = 0, Y = 0, Z = 0, Yn = 0
  for (let i = 0; i < N; i++) {
    X += r[i] * CIE_X[i]
    Y += r[i] * CIE_Y[i]
    Z += r[i] * CIE_Z[i]
    Yn += CIE_Y[i]
  }
  return [X / Yn, Y / Yn, Z / Yn]
}

// XYZ D65 → linear sRGB (IEC 61966-2-1 matrix)
function xyzToLinearRGB(X: number, Y: number, Z: number): [number, number, number] {
  const r =  3.2406 * X - 1.5372 * Y - 0.4986 * Z
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z
  const b =  0.0557 * X - 0.2040 * Y + 1.0570 * Z
  return [r, g, b]
}

// sRGB gamma encode (handles negatives by clamping)
function gammaEncode(c: number): number {
  const cc = Math.max(0, Math.min(1, c))
  return cc <= 0.0031308 ? 12.92 * cc : 1.055 * Math.pow(cc, 1 / 2.4) - 0.055
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Weights: [red, yellow, blue, white] — they should sum ≤ 1; remainder is white */
export interface PigmentWeights {
  red: number
  yellow: number
  blue: number
  white: number
}

/**
 * Mix pigments in Kubelka-Munk K/S space and return the sRGB [0–255] result.
 * This gives subtractive mixing: blue+yellow → green, red+yellow → orange, etc.
 */
export function mixPigments(w: PigmentWeights): [number, number, number] {
  const total = w.red + w.yellow + w.blue + w.white
  const wt = total > 0 ? total : 1
  const wr = w.red   / wt
  const wy = w.yellow / wt
  const wb = w.blue  / wt
  const ww = Math.max(0, 1 - wr - wy - wb)

  // Mix K/S spectra linearly by weight (K-M mixture rule)
  const mixed = new Array<number>(N)
  for (let i = 0; i < N; i++) {
    mixed[i] = wr * KS_RED[i] + wy * KS_YELLOW[i] + wb * KS_BLUE[i] + ww * KS_WHITE[i]
  }

  // Convert mixed K/S back to reflectance spectrum
  const rSpec = mixed.map(ksToR)

  // Spectrum → XYZ → linear sRGB → gamma-encoded sRGB
  const [X, Y, Z] = spectrumToXYZ(rSpec)
  const [lr, lg, lb] = xyzToLinearRGB(X, Y, Z)
  return [
    Math.round(gammaEncode(lr) * 255),
    Math.round(gammaEncode(lg) * 255),
    Math.round(gammaEncode(lb) * 255),
  ]
}

/**
 * Quick sanity: pre-compute blob-pair reference mixes for debugging.
 * blue+yellow should → green, red+yellow → orange, red+blue → purple.
 */
export function referenceColors(): Record<string, [number, number, number]> {
  return {
    red:     mixPigments({ red: 1, yellow: 0, blue: 0, white: 0 }),
    yellow:  mixPigments({ red: 0, yellow: 1, blue: 0, white: 0 }),
    blue:    mixPigments({ red: 0, yellow: 0, blue: 1, white: 0 }),
    redYellow:  mixPigments({ red: 0.5, yellow: 0.5, blue: 0, white: 0 }),
    blueYellow: mixPigments({ red: 0, yellow: 0.5, blue: 0.5, white: 0 }),
    redBlue:    mixPigments({ red: 0.5, yellow: 0, blue: 0.5, white: 0 }),
  }
}

/**
 * Convert [r,g,b] (0-255) to HSV (h: 0-360, s: 0-1, v: 0-1).
 */
export function rgbToHSV(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === rn)      h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else                 h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  const s = max > 0 ? d / max : 0
  return [h, s, max]
}
