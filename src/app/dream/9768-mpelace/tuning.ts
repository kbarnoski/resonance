// ─────────────────────────────────────────────────────────────────────────────
// 9768-mpelace — tuning.ts
//
// The isomorphic hex lattice + the two tuning systems it can be tuned to.
//
// LAYOUT (Bosanquet generalised keyboard / Wicki–Hayden family): every hex
// cell is addressed by axial coordinates (col, row). The SAME two-neighbour
// shape always means the SAME two intervals, anywhere on the board — that is
// the whole point of an isomorphic controller (Milne, Sethares & Plamondon,
// "Isomorphic Controllers and Dynamic Tuning", 2007):
//
//   col+1  → up a perfect fifth   (3/2 in JI, 18 steps of 31-EDO)
//   row+1  → up a major third     (5/4 in JI, 10 steps of 31-EDO)
//   col+1,row-1 → up a minor third (the third hex neighbour, "for free")
//
// This is the classic Euler/Tonnetz triangular net folded onto a hex tiling
// (each hex has 6 neighbours: ±fifth, ±third, ±minor-third). It generalises
// the brief's flat "semitone = 2·col + 7·row" formula to a genuine two-
// generator 5-limit system — the nearest-12-TET semitone position of a cell
// is ~7·col + 4·row (a fifth is ~7 semitones, a major third ~4), but the
// SOUNDING pitch is the exact product of ratios below, not that tempered
// approximation.
//
// TUNING MODES:
//   • "ji5"   — pure 5-limit just intonation. (3/2)^col · (5/4)^row, taken
//               literally (no octave-reduction fold). Because the syntonic
//               comma (81/80) never cancels, this lattice does NOT repeat
//               under octave shift — drift is real and audible/visible.
//   • "edo31" — 31 equal divisions of the octave. 31-EDO is the historic
//               "closes the comma" tuning for exactly this keyboard shape
//               (its fifth is 18 steps ≈ 696.8¢, its third 10 steps ≈
//               387.1¢ — both within ~1.5¢ of pure JI). The identical hex
//               shape becomes perfectly periodic once you temper. This
//               shared-shape / two-tuning contrast IS Milne–Sethares–
//               Plamondon's "dynamic tuning" idea made playable.
// ─────────────────────────────────────────────────────────────────────────────

export type TuningMode = "ji5" | "edo31";

/** Reference frequency (Hz) of the origin cell (col=0,row=0). F3, chosen so
 *  the rendered grid sits in a comfortably audible register either side. */
export const ORIGIN_HZ = 174.6141; // F3

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;

/** Exact frequency of a 12-TET MIDI note number, A4=440Hz. */
export function freqOfMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Nearest 12-TET MIDI note number for a frequency (clamped to the MIDI range). */
export function nearestMidi(freqHz: number): number {
  const raw = Math.round(69 + 12 * Math.log2(freqHz / 440));
  return Math.min(127, Math.max(0, raw));
}

/** Cents deviation of freqHz from its nearest 12-TET note. */
export function centsFromNearest(freqHz: number, midi: number): number {
  return 1200 * Math.log2(freqHz / freqOfMidi(midi));
}

export function midiNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/** Raw JI ratio for a lattice cell, UNREDUCED — (3/2)^col · (5/4)^row. */
export function ratioJI(col: number, row: number): number {
  return Math.pow(1.5, col) * Math.pow(1.25, row);
}

/** 31-EDO step count for a lattice cell: fifth = 18 steps, third = 10 steps. */
export function stepsEDO31(col: number, row: number): number {
  return 18 * col + 10 * row;
}

/** Exact sounding frequency (Hz) of a lattice cell under a tuning mode. */
export function cellFreqHz(col: number, row: number, mode: TuningMode): number {
  if (mode === "edo31") {
    return ORIGIN_HZ * Math.pow(2, stepsEDO31(col, row) / 31);
  }
  return ORIGIN_HZ * ratioJI(col, row);
}

export interface HexCell {
  col: number;
  row: number;
  freqHz: number;
  midi: number;
  cents: number;
  /** |exact Hz - nearest-12-TET Hz| — the beating rate an ear would hear if
   *  this note sounded against its own tempered shadow. Drives the shimmer. */
  diffHz: number;
  name: string;
}

export function makeCell(col: number, row: number, mode: TuningMode): HexCell {
  const freqHz = cellFreqHz(col, row, mode);
  const midi = nearestMidi(freqHz);
  const cents = centsFromNearest(freqHz, midi);
  const diffHz = Math.abs(freqHz - freqOfMidi(midi));
  return { col, row, freqHz, midi, cents, diffHz, name: midiNoteName(midi) };
}

/** Bounds of the rendered board. Kept modest so every cell stays audible
 *  (roughly 40 Hz .. 1.4 kHz across the full JI range). */
export const COL_MIN = -3;
export const COL_MAX = 3;
export const ROW_MIN = -2;
export const ROW_MAX = 2;

export function makeGrid(mode: TuningMode): HexCell[] {
  const cells: HexCell[] = [];
  for (let row = ROW_MIN; row <= ROW_MAX; row++) {
    for (let col = COL_MIN; col <= COL_MAX; col++) {
      cells.push(makeCell(col, row, mode));
    }
  }
  return cells;
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

// ── I–vi–IV–V progression, expressed as lattice offsets ─────────────────────
// Each triad is a small triangle of neighbouring hexes on the Tonnetz — the
// literal geometric point of the piece: chord shapes are RIGID and SLIDE.
// Adjacent chords in this progression share an edge (two common tones),
// exactly the neo-Riemannian PLR relations the Tonnetz was built to show.
export interface ChordShape {
  name: string;
  cells: { col: number; row: number }[];
}

export const PROGRESSION: ChordShape[] = [
  { name: "I", cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }] },
  { name: "vi", cells: [{ col: -1, row: 1 }, { col: 0, row: 1 }, { col: 0, row: 0 }] },
  { name: "IV", cells: [{ col: -1, row: 0 }, { col: 0, row: 0 }, { col: -1, row: 1 }] },
  { name: "V", cells: [{ col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: 1 }] },
];

// ── axial hex → pixel (pointy-top hexagons) ──────────────────────────────────
export function hexToPixel(col: number, row: number, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (col + row / 2);
  const y = size * 1.5 * row;
  return { x, y };
}
