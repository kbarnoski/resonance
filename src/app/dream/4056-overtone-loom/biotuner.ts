// biotuner.ts — the load-bearing novel technique.
//
// A signal-derived microtonal tuning, after Antoine Bellemare's Biotuner engine
// and its "harmonic recurrence" idea: the strongest spectral peaks of a signal
// ARE the scale. The lowest strong peak is the fundamental f0; every other peak
// becomes a scale degree via its ratio to f0, folded into one octave. Ratios
// that land near small-integer just fractions (3/2, 5/4, 7/4 …) are snapped and
// labelled — that recurrence of simple whole-number relationships is what makes
// the derived scale feel like a scale rather than noise. No 12-TET is ever
// imposed; the grid comes out of the sound.

/** Deterministic PRNG (Tommy Ettinger's mulberry32) — seeds the auto-demo. */
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

/** A spectral peak: a frequency and a normalized magnitude 0..1. */
export interface Peak {
  freq: number;
  mag: number;
}

/** One derived scale degree, expressed as an exact frequency ratio. */
export interface Degree {
  /** Folded ratio in [1, 2). */
  ratio: number;
  /** Cents above the fundamental, 0 .. 1200. */
  cents: number;
  /** Just-ratio label if the degree snapped to one, else "·". */
  label: string;
  /** Cents error from the nearest just ratio when snapped, else NaN. */
  justError: number;
}

/** Small-integer just intervals used for harmonic-recurrence snapping. */
const JUST: ReadonlyArray<{ ratio: number; name: string }> = [
  { ratio: 1 / 1, name: "1/1" },
  { ratio: 16 / 15, name: "16/15" },
  { ratio: 9 / 8, name: "9/8" },
  { ratio: 7 / 6, name: "7/6" },
  { ratio: 6 / 5, name: "6/5" },
  { ratio: 5 / 4, name: "5/4" },
  { ratio: 4 / 3, name: "4/3" },
  { ratio: 7 / 5, name: "7/5" },
  { ratio: 3 / 2, name: "3/2" },
  { ratio: 8 / 5, name: "8/5" },
  { ratio: 5 / 3, name: "5/3" },
  { ratio: 7 / 4, name: "7/4" },
  { ratio: 9 / 5, name: "9/5" },
  { ratio: 15 / 8, name: "15/8" },
];

export function centsOf(ratio: number): number {
  return 1200 * Math.log2(ratio);
}

/** Fold any positive ratio into a single octave [1, 2). */
export function foldToOctave(ratio: number): number {
  let r = ratio;
  if (!(r > 0) || !isFinite(r)) return 1;
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  return r;
}

const SNAP_CENTS = 18; // fold onto a just ratio within this distance
const DEDUP_CENTS = 15; // merge degrees closer than this
const MIN_MAG = 0.06; // ignore peaks quieter than this

/**
 * Derive a bespoke microtonal scale from a set of spectral peaks.
 * Returns the chosen fundamental and its scale degrees, sorted by pitch, with
 * the unison (1/1) always present.
 */
export function deriveScale(peaks: Peak[]): { f0: number; degrees: Degree[] } {
  const strong = peaks
    .filter((p) => p.mag > MIN_MAG && p.freq > 0)
    .sort((a, b) => a.freq - b.freq);
  if (strong.length === 0) return { f0: 0, degrees: [] };

  const f0 = strong[0].freq;

  const raw: { ratio: number; label: string; justError: number }[] = [
    { ratio: 1, label: "1/1", justError: 0 }, // fundamental / unison
  ];

  for (const p of strong) {
    const folded = foldToOctave(p.freq / f0);
    const foldedCents = centsOf(folded);
    // Harmonic recurrence: snap to the nearest small-integer just ratio.
    let bestName = "·";
    let bestErr = Infinity;
    let bestRatio = folded;
    for (const j of JUST) {
      const err = Math.abs(foldedCents - centsOf(j.ratio));
      if (err < bestErr) {
        bestErr = err;
        bestName = j.name;
        bestRatio = j.ratio;
      }
    }
    if (bestErr <= SNAP_CENTS) {
      raw.push({ ratio: bestRatio, label: bestName, justError: bestErr });
    } else {
      raw.push({ ratio: folded, label: "·", justError: NaN });
    }
  }

  // Sort by cents, then dedup near-coincident degrees (prefer just-labelled).
  raw.sort((a, b) => centsOf(a.ratio) - centsOf(b.ratio));
  const degrees: Degree[] = [];
  for (const r of raw) {
    const c = centsOf(r.ratio);
    const prev = degrees[degrees.length - 1];
    if (prev && Math.abs(c - prev.cents) < DEDUP_CENTS) {
      // Coincident — keep the just-labelled one if only one side is labelled.
      if (r.label !== "·" && prev.label === "·") {
        degrees[degrees.length - 1] = {
          ratio: r.ratio,
          cents: c,
          label: r.label,
          justError: r.justError,
        };
      }
      continue;
    }
    degrees.push({
      ratio: r.ratio,
      cents: c,
      label: r.label,
      justError: r.justError,
    });
  }

  return { f0, degrees };
}

/**
 * Pick up to 8 spectral peaks from a (smoothed) dB spectrum in 80–2000 Hz.
 * Local maxima above an adaptive noise floor, refined by parabolic
 * interpolation for sub-bin frequency accuracy.
 */
export function pickPeaks(spectrum: Float32Array, binHz: number): Peak[] {
  const loBin = Math.max(1, Math.floor(80 / binHz));
  const hiBin = Math.min(spectrum.length - 2, Math.ceil(2000 / binHz));
  if (hiBin <= loBin) return [];

  let maxDb = -Infinity;
  for (let i = loBin; i <= hiBin; i++) if (spectrum[i] > maxDb) maxDb = spectrum[i];
  if (!isFinite(maxDb)) return [];
  const floor = maxDb - 32; // ~32 dB dynamic window below the loudest peak

  const cand: { freq: number; db: number }[] = [];
  for (let i = loBin; i <= hiBin; i++) {
    const v = spectrum[i];
    if (v > floor && v >= spectrum[i - 1] && v > spectrum[i + 1]) {
      const a = spectrum[i - 1];
      const b = v;
      const c = spectrum[i + 1];
      const denom = a - 2 * b + c;
      const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
      cand.push({ freq: (i + shift) * binHz, db: v });
    }
  }
  cand.sort((x, y) => y.db - x.db);
  const span = Math.max(1e-6, maxDb - floor);
  return cand.slice(0, 8).map((c) => ({
    freq: c.freq,
    mag: Math.max(0, Math.min(1, (c.db - floor) / span)),
  }));
}

/**
 * Deterministic synthetic spectrum for the headless / mic-denied auto-demo.
 * A handful of detuned partials that random-walk (seeded by mulberry32) so the
 * derived scale visibly re-forms over time. Returns a peak list for time tMs.
 */
export function makeSyntheticSpectrum(seed: number): (tMs: number) => Peak[] {
  const rand = mulberry32(seed);
  const baseF0 = 132 + rand() * 40; // ~132–172 Hz fundamental
  // Detuned, deliberately-microtonal partial ratios (not 12-TET).
  const bases = [
    1,
    1.5 + (rand() - 0.5) * 0.12,
    1.78 + (rand() - 0.5) * 0.16,
    2.52 + (rand() - 0.5) * 0.22,
    3.17 + (rand() - 0.5) * 0.28,
    4.06 + (rand() - 0.5) * 0.32,
  ];
  const walk = bases.map((b) => ({ base: b, cur: b, target: b }));
  let nextRetarget = 0;

  return function sample(tMs: number): Peak[] {
    if (tMs >= nextRetarget) {
      nextRetarget = tMs + 1100 + rand() * 900;
      for (const w of walk) w.target = w.base * (1 + (rand() - 0.5) * 0.18);
    }
    const peaks: Peak[] = [];
    for (let i = 0; i < walk.length; i++) {
      const w = walk[i];
      w.cur += (w.target - w.cur) * 0.03; // smooth drift toward target
      peaks.push({ freq: baseF0 * w.cur, mag: 0.92 - i * 0.12 });
    }
    return peaks;
  };
}
