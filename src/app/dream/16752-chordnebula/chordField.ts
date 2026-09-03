// ─────────────────────────────────────────────────────────────────────────────
// 16752-chordnebula · chordField.ts — turn one chord symbol into the fields that
// drive the nebula: which pitch-classes bloom (light-cores), how consonant it is
// (open caverns vs. thick medium), and its quality (warm/major vs. cool/minor).
//
// The chord SYMBOL from Karel's analysis (e.g. "A#maj9/F", "Dm7") is parsed into
// its sounding tones. We spell them out from the root + quality + extensions so
// the exact chord that is playing decides the colour + structure — a small,
// honest chord→colour mapping in the spirit of "Chord Colourizer"
// (arXiv 2510.10173). Not a full harmonic analyser; enough to make each chord
// read distinctly and musically.
// ─────────────────────────────────────────────────────────────────────────────

import { chordRoot, chordIsMinor } from "../_shared/trackAnalysis";

export interface ChordField {
  /** Per pitch-class target activation 0..1 (index 0 = C … 11 = B). */
  pcs: number[];
  /** 0..1 — simple triads high, extended / altered chords low. */
  consonance: number;
  /** 0..1 — how much extra tone-mass thickens + darkens the medium. */
  densityBias: number;
  /** 0..1 — minor / diminished. */
  minor: number;
}

/** Neutral field (no chord / unparseable): a faint even violet drift. */
export function neutralField(): ChordField {
  return { pcs: new Array<number>(12).fill(0), consonance: 0.55, densityBias: 0, minor: 0 };
}

/**
 * Parse a chord symbol into its sounding pitch-classes and the derived scalars.
 * Robust to the leading root + accidental, an optional bass ("/F"), and the
 * common quality tokens (m, maj7, 7, 9, 6, dim/°, aug/+, sus2/sus4).
 */
export function chordToField(symbol: string): ChordField {
  const root = chordRoot(symbol);
  if (root === null) return neutralField();

  const minor = chordIsMinor(symbol);
  // Body after the root + accidental, upper-cased for token tests.
  const body = symbol.replace(/^[A-Ga-g][#b]?/, "");
  const b = body.toUpperCase();

  const has = (re: RegExp) => re.test(b);
  const isDim = has(/DIM|°/);
  const isAug = has(/AUG|\+/);
  const isMaj7 = has(/MAJ7|MAJ9|M7\b/) && !minor; // "M7" only when not the minor "m"
  const isSus2 = has(/SUS2/);
  const isSus4 = has(/SUS4|SUS(?!2)/);

  const intervals: number[] = [0]; // root always
  // third (or a suspension replacing it)
  if (isSus2) intervals.push(2);
  else if (isSus4) intervals.push(5);
  else intervals.push(minor || isDim ? 3 : 4);
  // fifth
  if (isDim) intervals.push(6);
  else if (isAug) intervals.push(8);
  else intervals.push(7);
  // sixth
  if (has(/(^|[^A-Z])6/)) intervals.push(9);
  // seventh
  if (isMaj7) intervals.push(11);
  else if (has(/7|9|11|13/)) intervals.push(10);
  // ninth
  if (has(/9|ADD9/)) intervals.push(2);

  const pcs = new Array<number>(12).fill(0);
  for (const iv of intervals) {
    const pc = (root + iv) % 12;
    // root a touch stronger so it anchors the hue read
    pcs[pc] = Math.max(pcs[pc], iv === 0 ? 1.0 : 0.82);
  }

  const toneCount = intervals.length;
  // Extended / altered chords are less consonant and thicken the medium.
  let dissonance = 0;
  if (minor) dissonance += 0.12;
  if (isDim) dissonance += 0.32;
  if (isAug) dissonance += 0.28;
  if (has(/7|9|11|13/)) dissonance += 0.18;
  if (toneCount >= 5) dissonance += 0.12;
  const consonance = Math.max(0, Math.min(1, 1 - dissonance));
  const densityBias = Math.max(0, Math.min(1, (toneCount - 3) * 0.22 + (isDim ? 0.15 : 0)));

  return { pcs, consonance, densityBias, minor: minor || isDim ? 1 : 0 };
}
