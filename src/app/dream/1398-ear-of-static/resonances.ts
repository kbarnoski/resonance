// ─────────────────────────────────────────────────────────────────────────────
// resonances.ts — the hidden latent-resonance model for 1398-ear-of-static.
//
//   Seven tuned resonances live along a normalized [0,1] "listening ribbon".
//   Each is snapped to a 5-limit just-intonation grid (so the whole set is
//   consonant with itself), spaced apart by a min-gap constraint so a sweeping
//   focus meets them one at a time. Each resonance also carries a short looping
//   melodic contour expressed as SCALE INDICES into a shared just scale — so no
//   matter the seed, every fragment is always in-key.
//
//   Everything is derived from a fixed seed via mulberry32 — NEVER Math.random /
//   Date.now (both banned here) — so the field is identical every run and the
//   piece is headless-verifiable. The auditory-pareidolia effect depends on the
//   resonances being genuinely present from t=0 (running but gated), so seeking
//   "reveals" what was always there rather than triggering something new.
// ─────────────────────────────────────────────────────────────────────────────

/** Small, fast, deterministic PRNG. Seeded — no Math.random / Date.now. */
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

/** Fixed build seed — the whole instrument is deterministic from this. */
export const SEED = 0x1398ea9;

/** Root of the just system (A2). */
export const ROOT_HZ = 110;

/**
 * A 5-limit just scale spanning one octave (ascending ratios). Chosen so the
 * melodic contours drawn from it are always consonant with each resonance and
 * with each other. Degrees wrap by octave (see `scaleFreq`).
 */
export const JI_SCALE = [
  1, // unison
  9 / 8, // major 2nd
  5 / 4, // major 3rd
  4 / 3, // perfect 4th
  3 / 2, // perfect 5th
  5 / 3, // major 6th
  15 / 8, // major 7th
];

/** Frequency of a scale degree (may be negative or > scale length; wraps by octave). */
export function scaleFreq(degree: number): number {
  const n = JI_SCALE.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return ROOT_HZ * JI_SCALE[idx] * Math.pow(2, oct);
}

export interface Resonance {
  id: number;
  /** Position on the normalized [0,1] listening ribbon. */
  x: number;
  /** Center (ring) frequency in Hz — the snapped JI grid pitch. */
  freq: number;
  /** Scale degree this resonance sits on (its melody centers here). */
  degree: number;
  /** Looping 3–5 note contour as absolute scale degrees (always in-key). */
  contour: number[];
  /** Per-note duration in seconds for the looping fragment. */
  noteDur: number;
  /** A stable phase offset so fragments don't all start together. */
  phase: number;
}

// Frequency band the ribbon spans (log-mapped), ~2.5 octaves of grid pitches.
const F_MIN = ROOT_HZ * 1.0; // 110 Hz
const F_MAX = ROOT_HZ * 6.0; // 660 Hz

/** Map a JI grid frequency to its position on the [0,1] ribbon (log scale). */
function freqToX(freq: number): number {
  return (Math.log(freq) - Math.log(F_MIN)) / (Math.log(F_MAX) - Math.log(F_MIN));
}

/**
 * Build the seven hidden resonances. Candidate grid pitches are every scale
 * degree across the band; we pick a spaced subset with mulberry32 and give each
 * a short in-key melodic contour.
 */
export function buildResonances(seed: number = SEED): Resonance[] {
  const rnd = mulberry32(seed);

  // 1. Enumerate every JI grid pitch inside the band as a candidate.
  const candidates: { degree: number; freq: number; x: number }[] = [];
  for (let deg = 0; deg <= JI_SCALE.length * 3; deg++) {
    const f = scaleFreq(deg);
    if (f < F_MIN * 1.02 || f > F_MAX * 0.98) continue;
    candidates.push({ degree: deg, freq: f, x: freqToX(f) });
  }

  // 2. Pick 7 with a min-spacing constraint on the ribbon.
  const MIN_GAP = 0.1;
  const TARGET = 7;
  const chosen: typeof candidates = [];
  // Shuffle candidate order deterministically.
  const order = candidates.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const oi of order) {
    if (chosen.length >= TARGET) break;
    const c = candidates[oi];
    if (chosen.every((k) => Math.abs(k.x - c.x) >= MIN_GAP)) chosen.push(c);
  }
  // Relax the gap if the grid was too sparse to reach 7.
  let gap = MIN_GAP;
  while (chosen.length < TARGET && gap > 0.04) {
    gap *= 0.8;
    for (const oi of order) {
      if (chosen.length >= TARGET) break;
      const c = candidates[oi];
      if (chosen.some((k) => k.degree === c.degree)) continue;
      if (chosen.every((k) => Math.abs(k.x - c.x) >= gap)) chosen.push(c);
    }
  }
  chosen.sort((a, b) => a.x - b.x);

  // 3. Give each resonance a looping in-key melodic contour.
  return chosen.map((c, i) => {
    const noteCount = 3 + Math.floor(rnd() * 3); // 3..5 notes
    const contour: number[] = [c.degree];
    let deg = c.degree;
    for (let n = 1; n < noteCount; n++) {
      // Small in-scale steps around the resonance degree (stays in-key & near).
      const step = Math.round((rnd() - 0.5) * 4); // -2..+2 degrees
      deg = c.degree + Math.max(-4, Math.min(4, deg - c.degree + step));
      contour.push(deg);
    }
    return {
      id: i,
      x: c.x,
      freq: c.freq,
      degree: c.degree,
      contour,
      noteDur: 0.34 + rnd() * 0.26, // 0.34..0.60 s per note
      phase: rnd(),
    };
  });
}

/** Alignment tolerance for the focus→resonance gaussian (ribbon units). */
export const ALIGN_TOLERANCE = 0.06;

/**
 * Alignment 0..1 of a focus position `x` to a resonance — a wide gaussian so
 * seeking is generously rewarded (the resonance "was always there" once found).
 */
export function alignment(focusX: number, resonanceX: number): number {
  const d = focusX - resonanceX;
  return Math.exp(-(d * d) / (2 * ALIGN_TOLERANCE * ALIGN_TOLERANCE));
}
