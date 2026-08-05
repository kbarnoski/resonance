/**
 * 6728 · Comma Walk — just-intonation lattice cartography.
 *
 * Pure math, no React, no DOM. A pitch is a lattice vector (a, b) whose ratio
 * is (3/2)^a · (5/4)^b — i.e. prime exponents (3^a, 5^b), octave-agnostic. Axis
 * a = pure fifths, axis b = pure major thirds: the Euler / Riemann Tonnetz.
 *
 * A chord occupies a small cluster of lattice cells. On a chord change we place
 * the new cluster to share the most common tones with the previous one and
 * move the least — exactly what adaptive JI does. The accumulated residual
 * (pure interval minus its nearest 12-TET interval) IS the drift from home; a
 * I–vi–ii–V–I lap nets one syntonic comma (verified in this module's constants).
 */

export const CENTS_FIFTH = 1200 * Math.log2(3 / 2); // 701.955
export const CENTS_THIRD = 1200 * Math.log2(5 / 4); // 386.314
export const SYNTONIC_COMMA = 1200 * Math.log2(81 / 80); // 21.506
export const PYTHAGOREAN_COMMA = 1200 * Math.log2(531441 / 524288); // 23.460

export type Vec = readonly [number, number];

/** Octave-agnostic cents of a lattice vector, relative to origin. */
export function rawCents(a: number, b: number): number {
  return a * CENTS_FIFTH + b * CENTS_THIRD;
}

/** Nearest 12-TET semitone class 0..11 of a lattice vector. */
export function pitchClass(a: number, b: number): number {
  return (((Math.round(rawCents(a, b) / 100) % 12) + 12) % 12);
}

/** Signed comma offset (cents) of a vector from its nearest 12-TET semitone. */
export function commaOffset(a: number, b: number): number {
  const c = rawCents(a, b);
  return c - Math.round(c / 100) * 100;
}

// Triad interval-vectors from the chord root, in lattice coordinates.
export const MAJOR_TRIAD: Vec[] = [
  [0, 0],
  [0, 1],
  [1, 0],
]; // root, pure major third 5/4, pure fifth 3/2
export const MINOR_TRIAD: Vec[] = [
  [0, 0],
  [1, -1],
  [1, 0],
]; // root, pure minor third 6/5, pure fifth 3/2

export type Quality = "maj" | "min";

export interface Chord {
  /** Roman-numeral-ish label. */
  label: string;
  /** Nearest 12-TET root pitch class 0..11 (C = 0). */
  rootPc: number;
  quality: Quality;
}

/** The comma-pump lap: I – vi – ii – V – I, roots C A D G C. */
export const PROGRESSION: Chord[] = [
  { label: "I", rootPc: 0, quality: "maj" },
  { label: "vi", rootPc: 9, quality: "min" },
  { label: "ii", rootPc: 2, quality: "min" },
  { label: "V", rootPc: 7, quality: "maj" },
];

export interface PlacedChord {
  root: Vec;
  cells: Vec[];
  chord: Chord;
}

const cellKey = (c: Vec) => `${c[0]},${c[1]}`;

/**
 * Adaptive placement: given the previous chord's absolute lattice cells, choose
 * where the target chord lands so it shares the most common tones with the
 * previous chord and moves the least. Deterministic; reproduces the comma pump.
 */
export function placeChord(
  prev: PlacedChord | null,
  chord: Chord,
): PlacedChord {
  const iv = chord.quality === "maj" ? MAJOR_TRIAD : MINOR_TRIAD;
  if (!prev) {
    // Anchor the first chord so its root's pitch class is the target.
    const cells = iv.map(([x, y]) => [x, y] as Vec);
    return { root: [0, 0], cells, chord };
  }
  const prevRoot = prev.root;
  const prevSet = new Set(prev.cells.map(cellKey));
  let best: PlacedChord | null = null;
  let bestScore: [number, number] | null = null;
  for (let da = -4; da <= 4; da++) {
    for (let db = -4; db <= 4; db++) {
      const ra = prevRoot[0] + da;
      const rb = prevRoot[1] + db;
      if (pitchClass(ra, rb) !== chord.rootPc) continue;
      const cells = iv.map(([x, y]) => [ra + x, rb + y] as Vec);
      const shared = cells.filter((c) => prevSet.has(cellKey(c))).length;
      const move = Math.abs(da) + Math.abs(db);
      const score: [number, number] = [-shared, move];
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] && score[1] < bestScore[1])
      ) {
        bestScore = score;
        best = { root: [ra, rb], cells, chord };
      }
    }
  }
  return best ?? { root: prevRoot, cells: prev.cells, chord };
}

/** Residual drift (cents) contributed by moving root from `from` to `to`. */
export function stepDrift(from: Vec, to: Vec): number {
  const dJI = rawCents(to[0], to[1]) - rawCents(from[0], from[1]);
  const d12 = Math.round(dJI / 100) * 100;
  return dJI - d12;
}

// ----------------------------- keyboard scale ------------------------------

export interface KeyDef {
  code: string; // event.key lowercase
  label: string;
  note: string;
  /** Lattice offset of this scale degree relative to the current tonic. */
  offset: Vec;
  black: boolean;
}

// White keys A S D F G H J K = C D E F G A B C (5-limit JI major scale).
// Black keys W E T Y U = C# D# F# G# A#.
export const KEYS: KeyDef[] = [
  { code: "a", label: "A", note: "C", offset: [0, 0], black: false },
  { code: "w", label: "W", note: "C♯", offset: [-1, -1], black: true },
  { code: "s", label: "S", note: "D", offset: [2, 0], black: false },
  { code: "e", label: "E", note: "D♯", offset: [1, -1], black: true },
  { code: "d", label: "D", note: "E", offset: [0, 1], black: false },
  { code: "f", label: "F", note: "F", offset: [-1, 0], black: false },
  { code: "t", label: "T", note: "F♯", offset: [2, 1], black: true },
  { code: "g", label: "G", note: "G", offset: [1, 0], black: false },
  { code: "y", label: "Y", note: "G♯", offset: [0, -1], black: true },
  { code: "h", label: "H", note: "A", offset: [-1, 1], black: false },
  { code: "u", label: "U", note: "A♯", offset: [2, -1], black: true },
  { code: "j", label: "J", note: "B", offset: [1, 1], black: false },
  { code: "k", label: "K", note: "C′", offset: [0, 0], black: false },
];

/** Frequency of a lattice vector, in the reference octave around `base` Hz. */
export function latticeFreq(base: number, a: number, b: number): number {
  const cents = rawCents(a, b);
  // Fold into one octave [0,1200) for a stable playing register.
  const folded = ((cents % 1200) + 1200) % 1200;
  return base * Math.pow(2, folded / 1200);
}

/** 12-TET frequency of a pitch class, in the reference octave around `base`. */
export function equalFreq(base: number, pc: number): number {
  return base * Math.pow(2, pc / 12);
}

// --------------------------------- PRNG ------------------------------------

/** Seeded mulberry32 — deterministic; no Math.random / Date anywhere. */
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
