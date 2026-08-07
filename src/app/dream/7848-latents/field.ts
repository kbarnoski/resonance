// 7848-latents — the hand-built LATENT FIELD.
//
// A continuous 2D sound-world. Every position (x,y) in the unit square maps —
// through smooth basis functions (sums of seeded 2D Gaussians) — to a handful
// of synth parameters. The axes themselves are NOT labelled and NOT pre-given:
// you discover interpretable features (a bright region, a consonant valley, a
// pulsing zone) BY EAR and mark them. This is the hand-built, no-ML stand-in
// for the "interpretable concept directions" of arXiv:2505.18186.
//
// Everything here is FIXED-SEED deterministic (mulberry32, seed 0x7848). No
// Math.random / Date.now anywhere.

/** Deterministic PRNG. Same seed → same field, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Point {
  x: number;
  y: number;
}

/** The five smooth sub-fields sampled at a position. All in [0,1]. */
export interface FieldSample {
  /** bright ↔ dark — drives filter cutoff AND the visual lightness. */
  brightness: number;
  /** consonant ↔ dissonant cluster — drives chord character. */
  tension: number;
  /** slow ↔ fast — drives the tremolo / pulse rate. */
  pulse: number;
  /** sparse ↔ thick — drives pad density AND the visual saturation. */
  density: number;
  /** low ↔ high — quantised to a scale for the root pitch. */
  pitch: number;
}

const CHANNELS = 5; // brightness, tension, pulse, density, pitch

interface Center {
  x: number;
  y: number;
  inv2s2: number; // 1 / (2 σ²), precomputed
  amp: number; // signed weight
  ch: number; // which sub-field this bump belongs to
}

export interface Field {
  centers: Center[];
  sample: (x: number, y: number) => FieldSample;
}

const CH_KEYS = [
  "brightness",
  "tension",
  "pulse",
  "density",
  "pitch",
] as const;

function sigmoid(v: number): number {
  return 1 / (1 + Math.exp(-1.6 * v));
}

/**
 * Build the latent field from the 0x7848 seed. Three Gaussian bumps per
 * channel (15 total) guarantee every sub-field has real hills and valleys, so
 * the landscape has discoverable features rather than a flat wash.
 */
export function makeField(seed = 0x7848): Field {
  const rnd = mulberry32(seed);
  const centers: Center[] = [];
  const bumpsPerChannel = 3;

  for (let ch = 0; ch < CHANNELS; ch++) {
    for (let b = 0; b < bumpsPerChannel; b++) {
      const x = 0.08 + rnd() * 0.84;
      const y = 0.08 + rnd() * 0.84;
      const sigma = 0.12 + rnd() * 0.16;
      // signed amplitude, biased away from zero so bumps read clearly
      const mag = 0.7 + rnd() * 0.9;
      const amp = (rnd() < 0.5 ? -1 : 1) * mag;
      centers.push({ x, y, inv2s2: 1 / (2 * sigma * sigma), amp, ch });
    }
  }

  const sample = (x: number, y: number): FieldSample => {
    const acc = [0, 0, 0, 0, 0];
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i];
      const dx = x - c.x;
      const dy = y - c.y;
      acc[c.ch] += c.amp * Math.exp(-(dx * dx + dy * dy) * c.inv2s2);
    }
    const out = {} as FieldSample;
    for (let ch = 0; ch < CHANNELS; ch++) {
      out[CH_KEYS[ch]] = sigmoid(acc[ch]);
    }
    return out;
  };

  return { centers, sample };
}

/**
 * How much a position "sings": bright AND consonant, with a little reward for
 * mid/high pitch so the discovered markers span a phrase rather than a drone.
 * Pure function of the field — this is what the seeded explorer treats as the
 * hidden good spots, discovered by scanning rather than by being told.
 */
export function singScore(s: FieldSample): number {
  const consonance = 1 - s.tension;
  return s.brightness * 0.55 + consonance * 0.3 + s.pitch * 0.15;
}

/**
 * Scan the field on a grid and return the `count` best-scoring spots that are
 * at least `minDist` apart (non-max suppression), returned in a legible
 * nearest-neighbour visiting order starting from the lowest spot. These are the
 * "discovered" features — nothing about them is printed on the field.
 */
export function discoverFeatures(
  field: Field,
  count: number,
  minDist = 0.2,
): Point[] {
  const res = 44;
  type Scored = { x: number; y: number; s: number };
  const cand: Scored[] = [];
  for (let iy = 1; iy < res; iy++) {
    for (let ix = 1; ix < res; ix++) {
      const x = ix / res;
      const y = iy / res;
      cand.push({ x, y, s: singScore(field.sample(x, y)) });
    }
  }
  cand.sort((a, b) => b.s - a.s);

  const picked: Scored[] = [];
  const md2 = minDist * minDist;
  for (const c of cand) {
    if (picked.length >= count) break;
    let ok = true;
    for (const p of picked) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy < md2) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push(c);
  }

  // Order for a legible path: nearest-neighbour from the bottom-most pick.
  const remaining = picked.slice();
  const ordered: Point[] = [];
  let cur = remaining.reduce((lo, p) => (p.y > lo.y ? p : lo), remaining[0]);
  remaining.splice(remaining.indexOf(cur), 1);
  ordered.push({ x: cur.x, y: cur.y });
  while (remaining.length) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - cur.x;
      const dy = remaining[i].y - cur.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    cur = remaining[bi];
    remaining.splice(bi, 1);
    ordered.push({ x: cur.x, y: cur.y });
  }
  return ordered;
}
