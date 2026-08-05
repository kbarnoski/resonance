/**
 * 6808 · Spectrascale — Sethares dissonance-curve scale construction.
 *
 * The scale is NOT assumed. It is DERIVED from the timbre: given the current
 * spectrum (partial ratios + amplitudes), we sweep a second copy of that same
 * spectrum across an octave and, at every interval, sum the pairwise sensory
 * dissonance (Plomp–Levelt / Sethares). The LOCAL MINIMA of that curve are the
 * consonant interval steps for THIS timbre — its natural scale. Reshape the
 * spectrum and the whole curve re-flows, so the scale re-lays-out.
 *
 * Refs: William Sethares, "Tuning Timbre Spectrum Scale" (dissonance-curve /
 * related-scale chapters); Plomp & Levelt, "Tonal Consonance and Critical
 * Bandwidth" (1965).
 */

/** Reference fundamental for the swept curve (also the audio base, C4). */
export const BASE_HZ = 261.63;

/** Number of drawbar partials the timbre is built from. */
export const N_PARTIALS = 8;

/** Resolution of the pure-DOM dissonance plot (one bar per sample). */
export const CURVE_SAMPLES = 200;

export interface Spectrum {
  /** Frequency ratio of each partial relative to the fundamental. */
  ratios: number[];
  /** Linear amplitude of each partial. */
  amps: number[];
}

export interface TimbreParams {
  /** Drawbar amplitudes, one per partial (0..1). */
  amps: number[];
  /** Octave-stretch ratio A: 2.0 = harmonic, >2 stretched, <2 compressed. */
  stretch: number;
  /** Inharmonicity coefficient B (piano-string model), 0 = none. */
  inharm: number;
}

export interface Valley {
  /** Interval ratio (alpha) at the dissonance minimum, in [1, 2]. */
  ratio: number;
  /** Interval size in cents above the unison. */
  cents: number;
  /** Sample index into the curve array. */
  index: number;
  /** Dissonance value at the minimum (unnormalised). */
  value: number;
  /** Nearest small-integer just ratio, e.g. "3/2". */
  nearest: string;
  /** Cents of that nearest just ratio. */
  nearestCents: number;
}

export interface Scale {
  curve: number[];
  maxD: number;
  minD: number;
  valleys: Valley[];
}

/* ------------------------- seeded PRNG (determinism) ----------------------- */

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

/* --------------------- Plomp–Levelt / Sethares roughness ------------------- */

/**
 * Sensory dissonance of a set of partials (frequencies + amplitudes), summed
 * over all pairs. This is Sethares' standard `dissmeasure` with the ~0.24
 * critical-bandwidth curve and the two-exponential roughness model.
 */
export function dissmeasure(freqs: number[], amps: number[]): number {
  const Dstar = 0.24; // point of maximum roughness (fraction of CB)
  const S1 = 0.0207;
  const S2 = 18.96;
  const C1 = 5;
  const C2 = -5;
  const A1 = -3.51;
  const A2 = -5.75;

  let d = 0;
  for (let i = 0; i < freqs.length; i++) {
    for (let j = i + 1; j < freqs.length; j++) {
      const fMin = Math.min(freqs[i], freqs[j]);
      const fDif = Math.abs(freqs[i] - freqs[j]);
      const l = Math.min(amps[i], amps[j]);
      const s = Dstar / (S1 * fMin + S2);
      d += l * (C1 * Math.exp(A1 * s * fDif) + C2 * Math.exp(A2 * s * fDif));
    }
  }
  return d;
}

/* ------------------------ spectrum from drawbar params --------------------- */

/**
 * Build the concrete partial ratios/amps from the drawbar + stretch +
 * inharmonicity controls. Partial n (1-indexed):
 *   ratio_n = n^log2(stretch) * sqrt(1 + B n^2), normalised so ratio_1 = 1.
 * With stretch = 2 and B = 0 this is exactly the harmonic series (1,2,3,…).
 */
export function computeSpectrum(p: TimbreParams): Spectrum {
  const exp = Math.log2(Math.max(1.05, p.stretch));
  const norm = Math.sqrt(1 + p.inharm); // ratio of n=1 before normalising
  const ratios: number[] = [];
  const amps: number[] = [];
  for (let n = 1; n <= p.amps.length; n++) {
    const r = (Math.pow(n, exp) * Math.sqrt(1 + p.inharm * n * n)) / norm;
    ratios.push(r);
    amps.push(p.amps[n - 1]);
  }
  return { ratios, amps };
}

/* --------------------------- nearest just ratio ---------------------------- */

const RATIO_TABLE: { p: number; q: number }[] = (() => {
  const out: { p: number; q: number }[] = [];
  for (let q = 1; q <= 16; q++) {
    for (let pn = q; pn <= q * 2; pn++) {
      out.push({ p: pn, q });
    }
  }
  return out;
})();

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Nearest low-complexity just ratio to a given interval in cents. */
export function nearestRatio(cents: number): { label: string; cents: number } {
  let best = { label: "1/1", cents: 0, score: Infinity };
  for (const { p, q } of RATIO_TABLE) {
    const g = gcd(p, q);
    const pp = p / g;
    const qq = q / g;
    const rc = 1200 * Math.log2(pp / qq);
    // penalise complex ratios so simple ones win near-ties.
    const score = Math.abs(rc - cents) + (pp + qq) * 0.35;
    if (score < best.score) {
      best = { label: `${pp}/${qq}`, cents: rc, score };
    }
  }
  return { label: best.label, cents: best.cents };
}

/* ------------------- the dissonance curve and its valleys ------------------ */

/**
 * Sweep a second copy of the spectrum across [1, 2] (unison → octave) and
 * record total sensory dissonance at each interval. Then find the local minima:
 * those intervals ARE the derived scale steps for this timbre.
 */
export function computeScale(spec: Spectrum, base = BASE_HZ): Scale {
  const curve = new Array<number>(CURVE_SAMPLES);
  let maxD = -Infinity;
  let minD = Infinity;

  const nf = spec.ratios.length;
  const freqs = new Array<number>(nf * 2);
  const amps = new Array<number>(nf * 2);
  for (let n = 0; n < nf; n++) {
    freqs[n] = base * spec.ratios[n];
    amps[n] = spec.amps[n];
    amps[nf + n] = spec.amps[n];
  }

  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const alpha = 1 + i / (CURVE_SAMPLES - 1); // 1 .. 2
    for (let n = 0; n < nf; n++) {
      freqs[nf + n] = base * alpha * spec.ratios[n];
    }
    const d = dissmeasure(freqs, amps);
    curve[i] = d;
    if (d > maxD) maxD = d;
    if (d < minD) minD = d;
  }

  const valleys = findValleys(curve, maxD, minD);
  return { curve, maxD, minD, valleys };
}

/**
 * Local minima of the curve with a prominence gate so the octave-approach
 * plateau and numerical wiggles don't register as spurious scale steps.
 */
function findValleys(curve: number[], maxD: number, minD: number): Valley[] {
  const span = Math.max(1e-9, maxD - minD);
  const prominence = span * 0.012;
  const raw: number[] = [];

  for (let i = 2; i < curve.length - 2; i++) {
    const v = curve[i];
    if (
      v <= curve[i - 1] &&
      v <= curve[i + 1] &&
      v < curve[i - 2] &&
      v < curve[i + 2]
    ) {
      // require a rise of at least `prominence` on both sides within a window
      let leftMax = v;
      let rightMax = v;
      for (let k = i - 1; k >= Math.max(0, i - 14); k--) {
        leftMax = Math.max(leftMax, curve[k]);
      }
      for (let k = i + 1; k <= Math.min(curve.length - 1, i + 14); k++) {
        rightMax = Math.max(rightMax, curve[k]);
      }
      if (leftMax - v >= prominence && rightMax - v >= prominence) {
        raw.push(i);
      }
    }
  }

  // Merge minima that are closer than ~18 cents (keep the deeper one).
  const merged: number[] = [];
  for (const idx of raw) {
    const cents = 1200 * Math.log2(1 + idx / (curve.length - 1));
    const last = merged[merged.length - 1];
    if (last !== undefined) {
      const lc = 1200 * Math.log2(1 + last / (curve.length - 1));
      if (Math.abs(cents - lc) < 18) {
        if (curve[idx] < curve[last]) merged[merged.length - 1] = idx;
        continue;
      }
    }
    merged.push(idx);
  }

  return merged.map((index) => {
    const ratio = 1 + index / (curve.length - 1);
    const cents = 1200 * Math.log2(ratio);
    const nr = nearestRatio(cents);
    return {
      ratio,
      cents,
      index,
      value: curve[index],
      nearest: nr.label,
      nearestCents: nr.cents,
    };
  });
}

/* --------------------------------- presets --------------------------------- */

export interface Preset {
  id: string;
  label: string;
  params: TimbreParams;
}

const decay = (rate: number) =>
  Array.from({ length: N_PARTIALS }, (_, i) => Math.pow(rate, i));

export const PRESETS: Preset[] = [
  {
    id: "harmonic",
    label: "Harmonic",
    params: { amps: decay(0.68), stretch: 2.0, inharm: 0 },
  },
  {
    id: "stretched",
    label: "Stretched",
    params: { amps: decay(0.68), stretch: 2.13, inharm: 0 },
  },
  {
    id: "metallic",
    label: "Metallic",
    params: {
      amps: [1, 0.5, 0.72, 0.34, 0.6, 0.28, 0.44, 0.22],
      stretch: 2.0,
      inharm: 0.032,
    },
  },
  {
    id: "odd",
    label: "Odd-only",
    params: {
      amps: [1, 0, 0.55, 0, 0.36, 0, 0.26, 0],
      stretch: 2.0,
      inharm: 0,
    },
  },
];

export function clonePreset(p: Preset): TimbreParams {
  return {
    amps: [...p.params.amps],
    stretch: p.params.stretch,
    inharm: p.params.inharm,
  };
}
