// ─────────────────────────────────────────────────────────────────────────────
// tunings.ts — the xenharmonic scale library + the sensory-dissonance model.
//
//   This is the brain the Wolf Throat sings against. Two jobs:
//
//   (1) SCALES. Four selectable tunings, each described as a *period* (the
//       interval at which the scale repeats — an octave 2:1 for most, but a
//       TRITAVE 3:1 for Bohlen–Pierce) plus the cent positions of its degrees
//       inside one period. Being able to sing BETWEEN these degrees — to be
//       gloriously "wrong" on purpose — is the entire point, so nothing here
//       ever snaps a sung pitch; the degrees are only landmarks.
//
//   (2) ROUGHNESS. A Plomp–Levelt / Sethares sensory-dissonance model. Two pure
//       partials beat and grind by an amount that depends on their frequency
//       separation relative to critical bandwidth; a complex tone's roughness
//       against a reference is the sum over every pair of partials. Sweeping a
//       probe tone across the pitch axis traces the consonance/dissonance
//       LANDSCAPE the singer flies over: valleys = consonance, ridges = the
//       audible wrongness. This is exactly the curve Sethares uses to explain
//       why a given timbre wants a given scale.
//
//   Refs: William Sethares, *Tuning, Timbre, Spectrum, Scale* (2005);
//   R. Plomp & W. J. M. Levelt, "Tonal Consonance and Critical Bandwidth" (1965);
//   Harry Partch, *Genesis of a Music* (1949) for the just-intonation lattice;
//   Heinz Bohlen & Kees van Prooijen for the 3:1 tritave scale.
// ─────────────────────────────────────────────────────────────────────────────

export const OCTAVE_CENTS = 1200;
export const TRITAVE_CENTS = 1200 * Math.log2(3); // 1901.955…

export interface Tuning {
  id: string;
  name: string;
  shortName: string;
  /** The repeat interval in cents (1200 = octave, 1901.955 = tritave). */
  periodCents: number;
  /** Ratio form of the period (2 or 3) — used to fold sung pitch into range. */
  periodRatio: number;
  /** Degree positions in cents within [0, periodCents). */
  degreesCents: number[];
  blurb: string;
}

const edt = (steps: number, periodCents: number): number[] =>
  Array.from({ length: steps }, (_, i) => (i * periodCents) / steps);

const centsOf = (ratio: number): number => 1200 * Math.log2(ratio);

// Just-intonation degrees from Partch-flavored small-integer ratios.
const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8];

export const TUNINGS: Tuning[] = [
  {
    id: "bp",
    name: "Bohlen–Pierce",
    shortName: "Bohlen–Pierce",
    periodCents: TRITAVE_CENTS,
    periodRatio: 3,
    // 13 equal divisions of the tritave (3:1) — no octaves at all.
    degreesCents: edt(13, TRITAVE_CENTS),
    blurb:
      "13 equal steps of the tritave (3:1) — a scale with NO octave. Built for odd-harmonic timbres; against an ordinary voice it is alien and luminous.",
  },
  {
    id: "19edo",
    name: "19-tone equal",
    shortName: "19-EDO",
    periodCents: OCTAVE_CENTS,
    periodRatio: 2,
    degreesCents: edt(19, OCTAVE_CENTS),
    blurb:
      "The octave cut into 19 equal steps. Sweeter major thirds than the piano and a whole crop of microtonal neighbours to slip between.",
  },
  {
    id: "slendro",
    name: "Slendro-flavoured",
    shortName: "Slendro",
    periodCents: OCTAVE_CENTS,
    periodRatio: 2,
    // Near-equipentatonic, deliberately un-tempered — no two gamelan agree.
    degreesCents: [0, 231, 474, 717, 955],
    blurb:
      "A five-tone, near-equal pentatonic in the spirit of Javanese sléndro — no just intervals, no fixed standard. Warm, floating, faintly out-of-focus.",
  },
  {
    id: "ji",
    name: "Just intonation",
    shortName: "Just (5-limit)",
    periodCents: OCTAVE_CENTS,
    periodRatio: 2,
    degreesCents: JI_RATIOS.map(centsOf),
    blurb:
      "Small whole-number ratios (Partch's lattice): 9/8, 5/4, 4/3, 3/2, 5/3, 15/8. The valleys sit dead-centre on the degrees — the consonance reference.",
  },
];

// ── Sensory-dissonance (Plomp–Levelt / Sethares) ────────────────────────────

interface Partial {
  f: number;
  a: number;
}

const B1 = 3.5;
const B2 = 5.75;
const D_STAR = 0.24;
const S1 = 0.0207;
const S2 = 18.96;

/** Dissonance contributed by a single pair of pure partials. */
function pairDissonance(f1: number, a1: number, f2: number, a2: number): number {
  const fmin = Math.min(f1, f2);
  const fmax = Math.max(f1, f2);
  const s = D_STAR / (S1 * fmin + S2);
  const df = fmax - fmin;
  const amp = Math.min(a1, a2);
  return amp * (Math.exp(-B1 * s * df) - Math.exp(-B2 * s * df));
}

/** A harmonic complex tone: `n` partials at 1/k amplitude (organ-ish rolloff). */
export function harmonicComplex(fundamental: number, n = 6): Partial[] {
  const out: Partial[] = [];
  for (let k = 1; k <= n; k++) out.push({ f: fundamental * k, a: 1 / k });
  return out;
}

/** Total roughness between two complex tones — every cross pair, summed. */
export function complexRoughness(a: Partial[], b: Partial[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      total += pairDissonance(a[i].f, a[i].a, b[j].f, b[j].a);
    }
  }
  return total;
}

export interface Landscape {
  /** Normalized roughness 0..1 sampled left→right across one period. */
  samples: number[];
  /** Fractional positions (0..1 across the axis) of each scale degree. */
  degreePos: number[];
  /** Raw (un-normalized) max, kept so cursor readings stay on the same scale. */
  rawMax: number;
}

/**
 * Build the dissonance landscape for a tuning: a probe complex tone swept in
 * log-frequency from `baseHz` up through one period, measured against a fixed
 * reference complex (the drone). Returns normalized samples for drawing plus
 * the degree marker positions.
 */
export function buildLandscape(
  tuning: Tuning,
  baseHz: number,
  reference: Partial[],
  resolution = 360,
): Landscape {
  const samples = new Array<number>(resolution);
  let rawMax = 1e-9;
  for (let i = 0; i < resolution; i++) {
    const u = i / (resolution - 1); // 0..1 across the period
    const probeHz = baseHz * Math.pow(2, (u * tuning.periodCents) / 1200);
    const r = complexRoughness(harmonicComplex(probeHz), reference);
    samples[i] = r;
    if (r > rawMax) rawMax = r;
  }
  for (let i = 0; i < resolution; i++) samples[i] /= rawMax;

  const degreePos = tuning.degreesCents.map((c) => c / tuning.periodCents);
  return { samples, degreePos, rawMax };
}

/** Fold a sung frequency into [baseHz, baseHz*periodRatio) by the period. */
export function foldToPeriod(
  hz: number,
  baseHz: number,
  periodRatio: number,
): number {
  if (hz <= 0) return baseHz;
  let f = hz;
  while (f < baseHz) f *= periodRatio;
  while (f >= baseHz * periodRatio) f /= periodRatio;
  return f;
}

/** 0..1 log position of a folded frequency across one period. */
export function periodPosition(
  foldedHz: number,
  baseHz: number,
  periodCents: number,
): number {
  const cents = 1200 * Math.log2(foldedHz / baseHz);
  return Math.max(0, Math.min(1, cents / periodCents));
}

export interface NearestDegree {
  index: number;
  posDelta: number; // signed fractional distance (sung − degree)
  centsOff: number; // signed cents from the nearest degree
}

/** Nearest scale degree to a fractional axis position, with the cent error. */
export function nearestDegree(
  pos: number,
  tuning: Tuning,
): NearestDegree {
  const degPos = tuning.degreesCents.map((c) => c / tuning.periodCents);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < degPos.length; i++) {
    const d = Math.abs(pos - degPos[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return {
    index: best,
    posDelta: pos - degPos[best],
    centsOff: (pos - degPos[best]) * tuning.periodCents,
  };
}

/** Read the normalized roughness of the landscape at a fractional position. */
export function roughnessAtPos(land: Landscape, pos: number): number {
  const x = Math.max(0, Math.min(1, pos)) * (land.samples.length - 1);
  const i = Math.floor(x);
  const frac = x - i;
  const a = land.samples[i];
  const b = land.samples[Math.min(land.samples.length - 1, i + 1)];
  return a + (b - a) * frac;
}
