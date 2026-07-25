// spectra.ts — the physics layer for "emberline".
//
// Every element is one additive "chord of matter": its real visible emission
// lines become the partials of a sustained tone. Line wavelength → partial
// frequency (deterministic, log-mapped, NEVER scale-snapped); relative line
// intensity → partial amplitude. Simple gases are sparse clean chords; dense
// metals (iron, neon) are rough shimmering clusters. That roughness is real —
// it is exactly the interval structure nature put in the light.
//
// All values are hard-coded constants. Nothing is fetched.

/* ── deterministic RNG (seeded mulberry32) ──────────────────────────────
   Used ONLY for cosmetic dither: the reverb impulse noise and per-partial
   shimmer phases. Never for pitches — pitches are pure physics. */
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

export const SEED = 0x2712;

/* ── one emission line ─────────────────────────────────────────────── */
export interface Line {
  /** wavelength in nanometres (vacuum-ish, rounded) */
  nm: number;
  /** relative intensity 0..1 (strongest visible line = 1) */
  rel: number;
}

export interface Element {
  symbol: string;
  name: string;
  lines: Line[];
  /** short human tag for how the chord behaves */
  character: string;
}

/* Real strongest visible emission lines (approximate, rounded). Sources are
   standard NIST-style line tables; values trimmed for a clear chord. */
export const ELEMENTS: Element[] = [
  {
    symbol: "H",
    name: "hydrogen",
    character: "sparse clean chord",
    lines: [
      { nm: 656.3, rel: 1.0 }, // Balmer-alpha
      { nm: 486.1, rel: 0.5 }, // Balmer-beta
      { nm: 434.0, rel: 0.25 }, // Balmer-gamma
      { nm: 410.2, rel: 0.15 }, // Balmer-delta
    ],
  },
  {
    symbol: "He",
    name: "helium",
    character: "airy open chord",
    lines: [
      { nm: 587.6, rel: 1.0 },
      { nm: 667.8, rel: 0.5 },
      { nm: 501.6, rel: 0.4 },
      { nm: 471.3, rel: 0.3 },
      { nm: 447.1, rel: 0.5 },
      { nm: 388.9, rel: 0.3 },
    ],
  },
  {
    symbol: "Na",
    name: "sodium",
    character: "near-unison D doublet",
    lines: [
      { nm: 589.0, rel: 1.0 }, // D2
      { nm: 589.6, rel: 0.95 }, // D1 — nearly a unison
    ],
  },
  {
    symbol: "Ne",
    name: "neon",
    character: "dense rough cluster",
    lines: [
      { nm: 640.2, rel: 1.0 },
      { nm: 614.3, rel: 0.6 },
      { nm: 588.2, rel: 0.6 },
      { nm: 585.2, rel: 0.7 },
      { nm: 594.5, rel: 0.5 },
      { nm: 621.7, rel: 0.5 },
      { nm: 650.7, rel: 0.6 },
      { nm: 638.3, rel: 0.4 },
      { nm: 626.6, rel: 0.3 },
      { nm: 703.2, rel: 0.4 },
    ],
  },
  {
    symbol: "Hg",
    name: "mercury",
    character: "bright triad-like",
    lines: [
      { nm: 404.7, rel: 0.6 },
      { nm: 435.8, rel: 1.0 },
      { nm: 546.1, rel: 1.0 },
      { nm: 577.0, rel: 0.5 },
      { nm: 579.1, rel: 0.5 },
    ],
  },
  {
    symbol: "Li",
    name: "lithium",
    character: "sparse warm chord",
    lines: [
      { nm: 670.8, rel: 1.0 },
      { nm: 610.4, rel: 0.4 },
      { nm: 460.3, rel: 0.3 },
    ],
  },
  {
    symbol: "K",
    name: "potassium",
    character: "low near-unison + spark",
    lines: [
      { nm: 766.5, rel: 1.0 },
      { nm: 769.9, rel: 0.6 },
      { nm: 404.4, rel: 0.3 },
    ],
  },
  {
    symbol: "Fe",
    name: "iron",
    character: "dense rough cluster",
    lines: [
      { nm: 438.4, rel: 1.0 },
      { nm: 430.8, rel: 0.9 },
      { nm: 427.2, rel: 0.7 },
      { nm: 440.5, rel: 0.7 },
      { nm: 489.1, rel: 0.5 },
      { nm: 495.8, rel: 0.5 },
      { nm: 516.8, rel: 0.6 },
      { nm: 526.9, rel: 0.5 },
      { nm: 532.8, rel: 0.4 },
      { nm: 537.1, rel: 0.4 },
    ],
  },
  {
    symbol: "Ca",
    name: "calcium",
    character: "wide open chord",
    lines: [
      { nm: 422.7, rel: 1.0 },
      { nm: 445.5, rel: 0.4 },
      { nm: 443.5, rel: 0.4 },
      { nm: 616.2, rel: 0.3 },
    ],
  },
  {
    symbol: "Ar",
    name: "argon",
    character: "deep-red rough cluster",
    lines: [
      { nm: 696.5, rel: 0.7 },
      { nm: 706.7, rel: 0.6 },
      { nm: 738.4, rel: 0.6 },
      { nm: 750.4, rel: 1.0 },
      { nm: 763.5, rel: 0.9 },
      { nm: 772.4, rel: 0.7 },
      { nm: 811.5, rel: 1.0 },
    ],
  },
];

/* ── wavelength → audible partial frequency ─────────────────────────────
   Physically honest, deterministic, GLOBAL (the same mapping for every
   element, so an element's register is meaningful, not re-normalised away).

   1. Optical frequency  f_opt = c / λ  → shorter λ (blue) = HIGHER f_opt.
      Across the visible band f_opt spans only ~1 octave, so a raw scale
      would cram every element into a semitone soup.
   2. We therefore stretch log(f_opt) linearly onto a log audible band
      [AUDIO_LO, AUDIO_HI]. Because both axes are logarithmic the RATIO
      structure of the lines survives — a near-unison stays a near-unison,
      a tight metal cluster stays tight — only the octave-span is widened
      so the ear can hear the intervals nature chose.
   3. NOTHING is snapped to a scale. The interval between two partials is
      whatever the two wavelengths dictate. */
export const C_LIGHT = 299_792_458; // m/s
export const LAM_RED = 820; // nm → maps to AUDIO_LO (lowest pitch)
export const LAM_VIOLET = 380; // nm → maps to AUDIO_HI (highest pitch)
export const AUDIO_LO = 80; // Hz
export const AUDIO_HI = 1600; // Hz

// f_opt bounds (Hz). Higher optical frequency = shorter wavelength = higher pitch.
const F_OPT_LO = C_LIGHT / (LAM_RED * 1e-9);
const F_OPT_HI = C_LIGHT / (LAM_VIOLET * 1e-9);
const LOG_SPAN = Math.log(F_OPT_HI / F_OPT_LO);
const LOG_AUDIO = Math.log(AUDIO_HI / AUDIO_LO);

/** Map an emission wavelength (nm) to its audible partial frequency (Hz). */
export function nmToHz(nm: number): number {
  const fOpt = C_LIGHT / (nm * 1e-9);
  const t = Math.log(fOpt / F_OPT_LO) / LOG_SPAN; // 0 at red bound, 1 at violet
  return AUDIO_LO * Math.exp(t * LOG_AUDIO);
}

/** Interval between two frequencies in cents (1200 = one octave). */
export function cents(f1: number, f2: number): number {
  return 1200 * Math.log2(f2 / f1);
}

/* ── wavelength → RGB ───────────────────────────────────────────────────
   Dan Bruton's classic visible-spectrum approximation (Approximate RGB
   values for a given wavelength, efg's / Bruton, http://www.physics.sfasu.edu
   /astro/color/spectra.html). Piecewise-linear channels 380–780 nm with a
   gamma and intensity roll-off near the vision limits. Wavelengths beyond
   780 nm (deep argon lines) clamp to dim red. Used for the art layer only. */
export function wavelengthToRGB(wl: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (wl >= 380 && wl < 440) {
    r = -(wl - 440) / (440 - 380);
    b = 1;
  } else if (wl < 490) {
    g = (wl - 440) / (490 - 440);
    b = 1;
  } else if (wl < 510) {
    g = 1;
    b = -(wl - 510) / (510 - 490);
  } else if (wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1;
  } else if (wl < 645) {
    r = 1;
    g = -(wl - 645) / (645 - 580);
  } else {
    r = 1;
  }
  let factor = 1;
  if (wl >= 380 && wl < 420) {
    factor = 0.3 + (0.7 * (wl - 380)) / (420 - 380);
  } else if (wl > 700) {
    factor = wl > 780 ? 0.35 : 0.3 + (0.7 * (780 - wl)) / (780 - 700);
  }
  const gamma = 0.8;
  const adj = (c: number): number =>
    c <= 0 ? 0 : Math.round(255 * Math.pow(c * factor, gamma));
  return [adj(r), adj(g), adj(b)];
}

/* ── derived per-element view model ─────────────────────────────────── */
export interface Partial {
  nm: number;
  rel: number;
  hz: number;
  rgb: [number, number, number];
}

export interface ElementView {
  symbol: string;
  name: string;
  character: string;
  partials: Partial[];
  /** smallest interval between adjacent partials, in cents */
  minCents: number;
  /** one-line readout, e.g. "Fe · iron · 10 lines · dense rough cluster" */
  readout: string;
}

export function buildElementView(el: Element): ElementView {
  const partials: Partial[] = el.lines.map((l) => ({
    nm: l.nm,
    rel: l.rel,
    hz: nmToHz(l.nm),
    rgb: wavelengthToRGB(l.nm),
  }));
  const sorted = [...partials].map((p) => p.hz).sort((a, b) => a - b);
  let minC = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    minC = Math.min(minC, Math.abs(cents(sorted[i - 1], sorted[i])));
  }
  if (!Number.isFinite(minC)) minC = 0;
  return {
    symbol: el.symbol,
    name: el.name,
    character: el.character,
    partials,
    minCents: minC,
    readout: `${el.symbol} · ${el.name} · ${el.lines.length} lines · ${el.character}`,
  };
}

export const ELEMENT_VIEWS: ElementView[] = ELEMENTS.map(buildElementView);
