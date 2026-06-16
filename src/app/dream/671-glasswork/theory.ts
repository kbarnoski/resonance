// theory.ts — D Dorian harmonic material for "glasswork".
//
// Key: D Dorian (D E F G A B C). We name chords by their root scale degree
// using lowercase roman-ish ids and store each chord as a set of pitch classes
// plus a "rest" weight (how tonic-resting it feels) used by the random walk.
//
// We deliberately avoid C-major-pentatonic. The mode is Dorian: minor-ish but
// with the bright natural 6 (B), which gives the wistful-not-sad colour. An
// occasional Lydian #11 tint (G# = pc 8) is offered as a colour note.

// Pitch classes (0 = C). D Dorian scale degrees, pc values:
//   D=2 E=4 F=5 G=7 A=9 B=11 C=0
export const TONIC_PC = 2; // D

// The seven diatonic pitch classes of D Dorian, in scale order from D.
export const DORIAN_PCS = [2, 4, 5, 7, 9, 11, 0]; // D E F G A B C

// Lydian #11 colour note relative to D: G# = pc 8. Used sparingly as a tint.
export const LYDIAN_TINT_PC = 8; // G#

export interface Chord {
  id: string; // human label, e.g. "i", "IV", "bVII"
  // chord tones as pitch classes (0..11), root listed first
  pcs: number[];
  // 0..1 — how much this chord feels like rest/home (tonic high, tension low)
  rest: number;
}

// A small, tasteful palette of diatonic chords in D Dorian. These are the
// nodes of the harmonic random walk. Voicings as triads/7ths by pitch class;
// the voice-leading engine spreads them across octaves.
//
//   i    = Dm7   (D F A C)   — home
//   IV   = G     (G B D)     — the bright Dorian IV, signature colour
//   bVII = C     (C E G)     — gentle subdominant pull
//   v    = Am7   (A C E G)   — soft, unresolved minor dominant
//   ii   = Em    (E G B)     — pensive
//   bVI  = Bdim-ish -> use F (F A C) as bIII-ish warmth ... kept simple as IIIb
//   IVadd = Gadd (G A B D)   — shimmering open colour
//   tint = G#dim colour      — fleeting Lydian #11 lift (rare)
export const CHORDS: Chord[] = [
  { id: "i", pcs: [2, 5, 9, 0], rest: 1.0 }, // Dm7  D F A C
  { id: "IV", pcs: [7, 11, 2], rest: 0.55 }, // G    G B D
  { id: "bVII", pcs: [0, 4, 7], rest: 0.6 }, // C    C E G
  { id: "v", pcs: [9, 0, 4, 7], rest: 0.45 }, // Am7  A C E G
  { id: "ii", pcs: [4, 7, 11], rest: 0.4 }, // Em   E G B
  { id: "bIII", pcs: [5, 9, 0], rest: 0.7 }, // F    F A C (relative-major calm)
  { id: "IVadd9", pcs: [7, 9, 11, 2], rest: 0.5 }, // Gadd9 G A B D
  { id: "tint", pcs: [8, 11, 2, 5], rest: 0.2 }, // #IV-ish colour G# B D F
];

export const CHORD_BY_ID: Record<string, Chord> = Object.fromEntries(
  CHORDS.map((c) => [c.id, c]),
);

// Transition weights for the random walk. Higher = more likely. The matrix is
// hand-tuned for a tension→resolution gravity: tension chords lean toward home,
// home is allowed to wander. "tint" is rare and only reachable from a few
// places, and it always wants to resolve.
export const TRANSITIONS: Record<string, Record<string, number>> = {
  i: { IV: 3, bVII: 2, v: 2.5, ii: 1.5, bIII: 1.5, IVadd9: 2, tint: 0.4 },
  IV: { i: 2.5, bVII: 1.5, ii: 1.5, IVadd9: 2, v: 1 },
  bVII: { i: 2.5, IV: 1.5, bIII: 1.5, v: 1 },
  v: { i: 3.5, IV: 1, bIII: 1, ii: 0.8 },
  ii: { v: 2.5, i: 2, IV: 1, bVII: 1 },
  bIII: { i: 2.5, IV: 1.5, bVII: 1.5, IVadd9: 1 },
  IVadd9: { i: 2.5, IV: 1.5, v: 1, ii: 1 },
  tint: { i: 3.5, IV: 1.5, bIII: 1 }, // tint always resolves home-ward
};

// MIDI helpers. We work in MIDI note numbers for the actual voices so that
// voice-leading distance is real semitone distance across octaves.
export const A4 = 69; // MIDI A4 = 440 Hz
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - A4) / 12);
}

// Expand a chord (pitch classes) into candidate MIDI notes within a register
// window [lo, hi] inclusive. Returns sorted ascending MIDI numbers.
export function chordMidiCandidates(
  pcs: number[],
  lo: number,
  hi: number,
): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (pcs.includes(((m % 12) + 12) % 12)) out.push(m);
  }
  return out;
}

// Dorian scale MIDI candidates in a window — used by the melody for passing
// tones. If `tint` is true, fold in the Lydian #11 colour note.
export function scaleMidiCandidates(
  lo: number,
  hi: number,
  tint = false,
): number[] {
  const set = new Set(DORIAN_PCS);
  if (tint) set.add(LYDIAN_TINT_PC);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (set.has(((m % 12) + 12) % 12)) out.push(m);
  }
  return out;
}
