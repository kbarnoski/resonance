/**
 * score.ts — the deterministic, endless graphic score for `1958-treatise-scroll`.
 *
 * A Cornelius Cardew *Treatise*-style page (long lines, circles, filled dots,
 * boxes, arcs, number-fields) generated band-by-band from a seeded PRNG so the
 * score is byte-identical on every load and fully reproducible headless. There
 * is NO Math.random / Date here (or anywhere in this prototype) — determinism is
 * the whole point: reading the same page twice performs the same piece.
 *
 * Reading model: the visitor scrolls the page DOWNWARD; vertical scroll is TIME.
 * The perpendicular (horizontal) axis carries PITCH — a mark on the left of the
 * page rings low, a mark on the right rings high — exactly like a piano roll
 * rotated to be read top-to-bottom. Every mark carries a real vertical EXTENT
 * [y0, y1] in score-pixels; a mark sounds while the playhead sits inside that
 * extent, so parking the scroll on a tall mark (a box, a circle, a thick line)
 * sustains it as a held drone, while a tiny dot can only ever be a pluck.
 *
 * Pitch lives on a JUST-INTONATION scale (not pentatonic): three octaves of the
 * ratios 1/1 9/8 5/4 4/3 3/2 5/3 15/8 over a C3 tonic.
 */

// ---- seeded PRNG (mulberry32) ---------------------------------------------
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- just-intonation pitch axis -------------------------------------------
/** C3 tonic (Hz). */
export const TONIC = 130.81;
/** One octave of just ratios (the 2/1 begins the next octave block). */
const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];

/** Ascending scale, C2 → C5 (three octaves + closing octave), in Hz. */
export const SCALE_FREQS: number[] = (() => {
  const out: number[] = [];
  for (let oct = -1; oct <= 1; oct++) {
    for (const r of RATIOS) out.push(TONIC * Math.pow(2, oct) * r);
  }
  out.push(TONIC * 4); // closing C5
  return out;
})();

/** Horizontal position (0..1, left→right) → a scale frequency (low→high). */
export function pitchFromX(x: number): number {
  const clamped = x < 0 ? 0 : x > 1 ? 1 : x;
  const idx = Math.round(clamped * (SCALE_FREQS.length - 1));
  return SCALE_FREQS[idx];
}

/** Just-intonation chord colours, as ratio stacks over a root. */
const CHORDS: number[][] = [
  [1, 5 / 4, 3 / 2], // just major triad
  [1, 6 / 5, 3 / 2], // just minor triad
  [1, 4 / 3, 3 / 2], // sus4 (open)
  [1, 5 / 4, 3 / 2, 15 / 8], // major seventh
  [1, 3 / 2, 2], // bare fifth + octave
];

// ---- marks -----------------------------------------------------------------
export type MarkType =
  | "line"
  | "circle"
  | "dot"
  | "cluster"
  | "arc"
  | "box"
  | "numbers";

export interface Mark {
  id: number;
  type: MarkType;
  x: number; // 0..1 centre (pitch axis)
  y: number; // absolute score-y centre (px)
  y0: number; // top of sounding extent
  y1: number; // bottom of sounding extent
  w: number; // normalised width (lines / boxes)
  thickness: number; // stroke width (px)
  sustain: boolean; // true = holds while under playhead; false = pluck
  freqs: number[]; // one note, or a JI chord stack
  gain: number; // 0..1 base loudness (from mark weight)
  timbre: "line" | "round" | "glass"; // steers oscillator colour
  r?: number; // circle radius (px)
  boxH?: number; // box height (px)
  span?: number; // arc vertical span (px)
  bend?: number; // arc horizontal curvature (px, signed)
  dots?: { dx: number; dy: number }[]; // cluster offsets (px)
  glyphs?: string; // number-field text
}

/** Band height in score-px. Marks are generated one band at a time. */
export const BAND_H = 150;

function weightGain(weight: number): number {
  // weight 1..9  ->  gain 0.28 .. 1.0
  return 0.28 + (weight - 1) * (0.72 / 8);
}

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

const bandCache = new Map<number, Mark[]>();

function buildBand(seed: number, n: number): Mark[] {
  const key = (seed ^ (n * 0x9e3779b1)) >>> 0;
  const rng = mulberry32((key + 0x1a2b3c4d) >>> 0);
  const marks: Mark[] = [];
  const baseId = (n & 0xffff) * 32 + 1;

  // Every 3rd–4th band lays down a long faint "staff" line spanning the page —
  // Cardew's horizontal spine fragments. Soft, wide, sustaining.
  if (Math.floor(rng() * 4) === 0) {
    const y = n * BAND_H + rng() * BAND_H;
    const th = 1.5 + rng() * 1.5;
    marks.push({
      id: baseId,
      type: "line",
      x: 0.5,
      y,
      y0: y - th,
      y1: y + th,
      w: 0.82 + rng() * 0.12,
      thickness: th,
      sustain: true,
      freqs: [pitchFromX(0.5)],
      gain: 0.3,
      timbre: "line",
    });
  }

  const count = 2 + Math.floor(rng() * 3); // 2..4 event marks
  for (let i = 0; i < count; i++) {
    const id = baseId + i + 1;
    const y = n * BAND_H + rng() * BAND_H;
    const x = 0.12 + rng() * 0.76;
    const weight = 1 + Math.floor(rng() * 8); // 1..8
    const root = pitchFromX(x);
    const roll = rng();

    if (roll < 0.24) {
      // filled dot — a pluck
      const r = 3 + weight * 0.6;
      marks.push({
        id,
        type: "dot",
        x,
        y,
        y0: y - r,
        y1: y + r,
        w: 0,
        thickness: r,
        sustain: false,
        freqs: [root],
        gain: weightGain(weight) * 0.85,
        timbre: "round",
        r,
      });
    } else if (roll < 0.42) {
      // dot cluster — quick just-intonation arpeggio-chord
      const k = 3 + Math.floor(rng() * 3);
      const dots: { dx: number; dy: number }[] = [];
      const freqs: number[] = [];
      const chord = pick(rng, CHORDS);
      for (let d = 0; d < k; d++) {
        dots.push({ dx: (rng() - 0.5) * 46, dy: (rng() - 0.5) * 40 });
        freqs.push(root * chord[d % chord.length]);
      }
      const ys = dots.map((p) => p.dy);
      const top = Math.min(...ys) - 4;
      const bot = Math.max(...ys) + 4;
      marks.push({
        id,
        type: "cluster",
        x,
        y,
        y0: y + top,
        y1: y + bot,
        w: 0,
        thickness: 3,
        sustain: false,
        freqs,
        gain: weightGain(weight) * 0.7,
        timbre: "round",
        dots,
      });
    } else if (roll < 0.6) {
      // circle / ring — a sustained just chord
      const r = 14 + weight * 3.4;
      const chord = pick(rng, CHORDS);
      marks.push({
        id,
        type: "circle",
        x,
        y,
        y0: y - r,
        y1: y + r,
        w: 0,
        thickness: 1.5 + weight * 0.5,
        sustain: true,
        freqs: chord.map((c) => root * c),
        gain: weightGain(weight) * 0.55,
        timbre: "glass",
        r,
      });
    } else if (roll < 0.74) {
      // thick horizontal stroke — dynamics ride the thickness; sustains
      const th = 4 + weight * 1.4;
      marks.push({
        id,
        type: "line",
        x,
        y,
        y0: y - th / 2,
        y1: y + th / 2,
        w: 0.18 + rng() * 0.44,
        thickness: th,
        sustain: true,
        freqs: [root],
        gain: weightGain(weight),
        timbre: "line",
      });
    } else if (roll < 0.86) {
      // box / field — a long parkable drone-cluster
      const boxH = 40 + weight * 12;
      const chord = pick(rng, CHORDS);
      marks.push({
        id,
        type: "box",
        x,
        y,
        y0: y - boxH / 2,
        y1: y + boxH / 2,
        w: 0.1 + rng() * 0.2,
        thickness: 1.5,
        sustain: true,
        freqs: chord.map((c) => root * c),
        gain: weightGain(weight) * 0.6,
        timbre: "line",
        boxH,
      });
    } else if (roll < 0.95) {
      // arc — a gliding line
      const span = 30 + weight * 8;
      const bend = (rng() - 0.5) * 90;
      marks.push({
        id,
        type: "arc",
        x,
        y,
        y0: y - span / 2,
        y1: y + span / 2,
        w: 0,
        thickness: 2 + weight * 0.4,
        sustain: true,
        freqs: [root],
        gain: weightGain(weight) * 0.5,
        timbre: "glass",
        span,
        bend,
      });
    } else {
      // number-field — a soft bell glyph
      const digits = "0123456789";
      let g = "";
      const len = 1 + Math.floor(rng() * 2);
      for (let d = 0; d < len; d++)
        g += digits[Math.floor(rng() * 10) % 10];
      marks.push({
        id,
        type: "numbers",
        x,
        y,
        y0: y - 10,
        y1: y + 10,
        w: 0,
        thickness: 1,
        sustain: false,
        freqs: [root * 2],
        gain: weightGain(weight) * 0.5,
        timbre: "glass",
        glyphs: g,
      });
    }
  }

  return marks;
}

function bandMarks(seed: number, n: number): Mark[] {
  const cacheKey = (seed ^ (n * 2654435761)) >>> 0;
  let m = bandCache.get(cacheKey);
  if (!m) {
    m = buildBand(seed, n);
    bandCache.set(cacheKey, m);
  }
  return m;
}

/** All marks whose sounding extent overlaps [fromY, toY]. */
export function marksInRange(seed: number, fromY: number, toY: number): Mark[] {
  const first = Math.floor(fromY / BAND_H) - 1;
  const last = Math.floor(toY / BAND_H) + 1;
  const out: Mark[] = [];
  for (let n = first; n <= last; n++) {
    const band = bandMarks(seed, n);
    for (const mk of band) {
      if (mk.y1 >= fromY && mk.y0 <= toY) out.push(mk);
    }
  }
  return out;
}
