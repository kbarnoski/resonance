// harmony.ts — the shared gravitational framework.
//
// A deterministic, slowly-drifting modal chord progression that both peers
// (or the solo player + their synthetic companion) compute identically from
// nothing but a shared integer "beat" index. Nobody's pitch is EVER hard
// quantized to it — contributions glide continuously and are only pulled
// SOFTLY toward the nearest chord tone, so the room always leans consonant
// without ever feeling like a grid.

/** Deterministic PRNG — no Math.random() anywhere in this piece. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── The shared clock ─────────────────────────────────────────────────────
/** One "beat" of the shared framework — the atomic unit carried over the
 *  network so two peers can agree on where the harmony is. Deliberately
 *  slow: this is a room to breathe in, not a metronome. */
export const BEAT_MS = 3600;
/** A chord holds for this many beats before the room drifts to the next. */
export const BEATS_PER_CHORD = 4;
export const CHORD_MS = BEAT_MS * BEATS_PER_CHORD;

/** Root of the shared modal space — D3. Everything is diatonic to D Dorian,
 *  so any two tones drawn from the framework are consonant with each other,
 *  and the loop never demands a cadence (no "resolution", no winner). */
export const ROOT_HZ = 146.83;

/** Eight four-note 7th chords, all diatonic to D Dorian (D E F G A B C),
 *  each given as semitone offsets from the root. Chosen so neighbouring
 *  chords in the loop always share at least two common tones — the harmony
 *  drifts, it never jumps. */
export const PROGRESSION: readonly (readonly number[])[] = [
  [0, 3, 7, 10], // i    Dm7
  [3, 7, 10, 14], // III  Fmaj7
  [7, 10, 14, 17], // v    Am7
  [2, 5, 9, 12], // ii   Em7
  [5, 9, 12, 15], // iv   G7
  [10, 14, 17, 21], // VII  Cmaj7
  [3, 7, 10, 14], // III  Fmaj7 (return)
  [7, 10, 14, 17], // v    Am7 (return -> shares A, C with i)
];

export const CHORD_NAMES: readonly string[] = [
  "i · Dm7",
  "III · Fmaj7",
  "v · Am7",
  "ii · Em7",
  "iv · G7",
  "VII · Cmaj7",
  "III · Fmaj7",
  "v · Am7",
];

export function beatIndexForElapsed(elapsedMs: number): number {
  return Math.max(0, Math.floor(elapsedMs / BEAT_MS));
}

export function chordIndexForBeat(beat: number): number {
  return Math.floor(beat / BEATS_PER_CHORD) % PROGRESSION.length;
}

/** 0..1 progress within the current beat — used for the room's slow
 *  ambient "breathing" (never a hard pulse/strobe). */
export function beatPhase(elapsedMs: number): number {
  const m = elapsedMs % BEAT_MS;
  return m < 0 ? 0 : m / BEAT_MS;
}

// ── Chord tones ──────────────────────────────────────────────────────────
/** Absolute Hz for a chord's tones in the low, warm drone register
 *  (roughly 70-260 Hz) that the shared bed sustains. */
export function bedFreqs(chordIndex: number): number[] {
  const semis = PROGRESSION[chordIndex % PROGRESSION.length];
  return semis.map((s) => ROOT_HZ * 0.5 * Math.pow(2, s / 12));
}

/** All chord-tone frequencies across several octaves, clipped to an
 *  audible "commons" register — this is the gravitational field that
 *  contributions and gridlines are drawn toward. */
export function fieldFreqs(
  chordIndex: number,
  lo = 100,
  hi = 920
): number[] {
  const semis = PROGRESSION[chordIndex % PROGRESSION.length];
  const out: number[] = [];
  for (const s of semis) {
    const base = ROOT_HZ * Math.pow(2, s / 12);
    for (let k = -1; k <= 2; k++) {
      const f = base * Math.pow(2, k);
      if (f >= lo && f <= hi) out.push(f);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Soft gravitational pull: bends `freq` toward the nearest tone of the
 *  shared framework by `pull` (0 = untouched / continuous, 1 = fully
 *  snapped). We deliberately keep pull well under 1 — this is a center of
 *  gravity, never a quantizer. */
export function pullTowardField(
  freq: number,
  chordIndex: number,
  pull = 0.38
): number {
  const candidates = fieldFreqs(chordIndex);
  if (candidates.length === 0) return freq;
  let nearest = candidates[0];
  let bestDist = Math.abs(Math.log2(freq / nearest));
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(Math.log2(freq / candidates[i]));
    if (d < bestDist) {
      bestDist = d;
      nearest = candidates[i];
    }
  }
  // Blend in log-frequency space so the pull feels even across registers.
  const logBlend =
    Math.log2(freq) + (Math.log2(nearest) - Math.log2(freq)) * pull;
  return Math.pow(2, logBlend);
}

/** Pick a tone from the current chord that sits away from `avoidFreq` —
 *  used by the synthetic companion to "leave space" rather than doubling
 *  the person it's answering. */
export function pickComplementaryTone(
  chordIndex: number,
  avoidFreq: number | null,
  rng: () => number,
  lo = 160,
  hi = 760
): number {
  const candidates = fieldFreqs(chordIndex, lo, hi);
  if (candidates.length === 0) return ROOT_HZ;
  if (avoidFreq === null) {
    return candidates[Math.floor(rng() * candidates.length) % candidates.length];
  }
  // Weight toward tones at least a third away (in semitones) from avoidFreq.
  const spaced = candidates.filter(
    (f) => Math.abs(Math.log2(f / avoidFreq)) * 12 > 2.5
  );
  const pool = spaced.length > 0 ? spaced : candidates;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** Map a continuous 0..1 (e.g. pointer y) to a frequency across the
 *  commons register, log-scaled so it feels even by ear. */
export function tToFreq(t: number, lo = 130, hi = 840): number {
  const c = clamp01(t);
  return lo * Math.pow(hi / lo, c);
}

/** Inverse of tToFreq — used to place a frequency vertically in the field. */
export function freqToT(freq: number, lo = 130, hi = 840): number {
  const f = clamp(freq, lo, hi);
  return Math.log(f / lo) / Math.log(hi / lo);
}
