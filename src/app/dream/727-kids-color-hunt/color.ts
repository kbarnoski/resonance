// color.ts — Camera center-region color sampling + cross-modal color→harmony mapping
// for 727-kids-color-hunt.
//
// The world is the instrument: each frame we draw the live video into a tiny
// offscreen canvas and average the RGB of a small CENTER region. That average
// becomes an HSV reading, and HSV drives both the sound (chord + register +
// loudness) and the WebGPU particle bloom (color + count + energy).
//
// This is analysis-only — the camera frame is never recorded or sent; only the
// few hundred averaged pixels of the center reticle are ever read.

export interface HsvResult {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export interface ColorSample {
  hsv: HsvResult;
  rgb: { r: number; g: number; b: number };
  /** true when the region is colorful + bright enough to be "a color" */
  confident: boolean;
}

// ── RGB → HSV ────────────────────────────────────────────────────────────────
export function rgbToHsv(r: number, g: number, b: number): HsvResult {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  const v = max;
  const s = max === 0 ? 0 : delta / max;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  return { h, s, v };
}

// ── HSV → CSS color string (for the live UI swatch) ──────────────────────────
export function hsvToCss(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to255 = (n: number) => Math.round((n + m) * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

// Generous thresholds so real-room objects under kids' lighting still "count".
const SAT_THRESHOLD = 0.18;
const VAL_THRESHOLD = 0.14;

// ── Sample the center region of an ImageData ─────────────────────────────────
export function sampleCenterRegion(
  imageData: ImageData,
  boxFrac: number, // fraction of the smaller dimension for the sampling box
): ColorSample {
  const { width, height, data } = imageData;
  const boxSize = Math.max(1, Math.floor(Math.min(width, height) * boxFrac));
  const x0 = Math.floor((width - boxSize) / 2);
  const y0 = Math.floor((height - boxSize) / 2);
  const x1 = x0 + boxSize;
  const y1 = y0 + boxSize;

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  // Step so we read ~32×32 samples regardless of box size — cheap + stable.
  const step = Math.max(1, Math.floor(boxSize / 32));
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  }

  if (count === 0) {
    return {
      rgb: { r: 128, g: 128, b: 128 },
      hsv: { h: 0, s: 0, v: 0.5 },
      confident: false,
    };
  }

  const r = rSum / count;
  const g = gSum / count;
  const b = bSum / count;
  const hsv = rgbToHsv(r, g, b);
  const confident = hsv.s > SAT_THRESHOLD && hsv.v > VAL_THRESHOLD;

  return { rgb: { r, g, b }, hsv, confident };
}

// ── Cross-modal: hue → a consonant chord on a fixed pentatonic/modal palette ──
// Scriabin's clavier à lumières + Kandinsky's color-tone theory: a color IS a
// tone color. Warm hues (red/orange) → a warm, LOW, open consonance; greens →
// a settled MID; cool hues (cyan/blue) → a bright, HIGH shimmer. Everything is
// drawn from one C-major-pentatonic field across octaves so NOTHING is "wrong".

export interface Chord {
  /** Hz frequencies, root-first, low→high. Always consonant. */
  freqs: number[];
  /** 0–1 along warm(low)→cool(high) — used to color/shape the bloom. */
  warmth: number;
  /** human-readable name for the design notes only */
  name: string;
}

// C major pentatonic across the registers we draw from: C D E G A.
// Low/warm anchors near C2–C3, bright/cool stacks near C5–C6.
const PENTA = [
  // [name, base freq]
  ["C", 65.41],
  ["D", 73.42],
  ["E", 82.41],
  ["G", 98.0],
  ["A", 110.0],
] as const;

function pentaAt(degree: number, octave: number): number {
  const wrapped = ((degree % 5) + 5) % 5;
  const base = PENTA[wrapped][1];
  return base * Math.pow(2, octave);
}

/**
 * Map a hue (0–360) onto a consonant pentatonic voicing whose REGISTER shifts
 * from warm-low (red) up through mid (green) to bright-high (cyan/blue/violet).
 */
export function hueToChord(h: number): Chord {
  // warmth: 1 at red (0/360), 0 at cyan (~180). Smooth and circular.
  const rad = (h * Math.PI) / 180;
  const warmth = (Math.cos(rad) + 1) / 2; // 1 at hue 0, 0 at hue 180

  // Register climbs with coolness. Warm reds sit ~2 octaves below cool blues.
  // baseOct is the octave multiplier applied to the pentatonic anchors.
  const baseOct = 1 + Math.round((1 - warmth) * 3); // 1 (warm) → 4 (cool)

  // Pick a degree root from the hue so neighboring colors differ a little,
  // but all are still pentatonic and therefore mutually consonant.
  const rootDegree = Math.floor((h / 360) * 5) % 5;

  // A warm, open voicing for low registers (root + 5th + octave); a brighter,
  // wider, shimmering stack for high registers (add the 6th/9th color tones).
  const freqs: number[] = [];
  if (warmth > 0.55) {
    // WARM / LOW — fat, consonant, grounded.
    freqs.push(pentaAt(rootDegree, baseOct));
    freqs.push(pentaAt(rootDegree + 3, baseOct)); // a 5th-ish (G over C)
    freqs.push(pentaAt(rootDegree, baseOct + 1)); // octave shimmer
  } else if (warmth > 0.4) {
    // MID / GREEN — settled triadic-pentatonic.
    freqs.push(pentaAt(rootDegree, baseOct));
    freqs.push(pentaAt(rootDegree + 1, baseOct));
    freqs.push(pentaAt(rootDegree + 3, baseOct + 1));
  } else {
    // COOL / HIGH — bright, airy, wide pentatonic sparkle.
    freqs.push(pentaAt(rootDegree, baseOct));
    freqs.push(pentaAt(rootDegree + 2, baseOct + 1));
    freqs.push(pentaAt(rootDegree + 4, baseOct + 1));
    freqs.push(pentaAt(rootDegree, baseOct + 2));
  }

  const name =
    warmth > 0.55 ? "warm · low · open" : warmth > 0.4 ? "green · mid" : "cool · high · shimmer";

  return { freqs, warmth, name };
}
