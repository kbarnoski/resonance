// ─────────────────────────────────────────────────────────────────────────────
// harmony.ts — a real functional-harmony system for 1910-ten-fingers.
//
// A key is a tonic pitch-class + mode. Each of the 12 chord cells is defined by
// semitone offsets from the tonic, so the whole grid transposes/relabels when
// you modulate. Diatonic functions (I ii iii IV V vi vii°) plus a column of
// SECONDARY DOMINANTS (V/V, V/vi, V/IV …) give the grid its bite. Voice-leading
// snaps each of the 4 voices to the nearest chord tone of the next chord, so a
// held→new transition glides instead of leaping — the core of the instrument.
// ─────────────────────────────────────────────────────────────────────────────

export type Mode = "major" | "minor";

export interface Key {
  tonicPc: number; // 0..11, C = 0
  mode: Mode;
}

export interface ChordCell {
  /** Roman-numeral label shown in the cell (tiny mono type). */
  roman: string;
  /** Functional column: Tonic / Predominant / Dominant / Applied. */
  cat: "T" | "PD" | "D" | "A";
  /** Semitone offsets from the tonic (may include a 7th). */
  degrees: number[];
}

// 12 cells laid out as a 4-column × 3-row matrix. col = index % 4.
// col0 = tonic function, col1 = predominant, col2 = dominant, col3 = applied.
export const CELLS_MAJOR: ChordCell[] = [
  { roman: "I", cat: "T", degrees: [0, 4, 7] },
  { roman: "IV", cat: "PD", degrees: [5, 9, 12] },
  { roman: "V7", cat: "D", degrees: [7, 11, 14, 17] },
  { roman: "V/V", cat: "A", degrees: [2, 6, 9, 12] }, // D7 → G
  { roman: "vi", cat: "T", degrees: [9, 12, 16] },
  { roman: "ii", cat: "PD", degrees: [2, 5, 9] },
  { roman: "V", cat: "D", degrees: [7, 11, 14] },
  { roman: "V/vi", cat: "A", degrees: [4, 8, 11, 14] }, // E7 → Am
  { roman: "iii", cat: "T", degrees: [4, 7, 11] },
  { roman: "ii7", cat: "PD", degrees: [2, 5, 9, 12] },
  { roman: "vii°", cat: "D", degrees: [11, 14, 17] },
  { roman: "V/IV", cat: "A", degrees: [0, 4, 7, 10] }, // C7 → F
];

export const CELLS_MINOR: ChordCell[] = [
  { roman: "i", cat: "T", degrees: [0, 3, 7] },
  { roman: "iv", cat: "PD", degrees: [5, 8, 12] },
  { roman: "V7", cat: "D", degrees: [7, 11, 14, 17] }, // harmonic-minor V
  { roman: "V/V", cat: "A", degrees: [2, 6, 9, 12] },
  { roman: "VI", cat: "T", degrees: [8, 12, 15] },
  { roman: "ii°", cat: "PD", degrees: [2, 5, 8] },
  { roman: "V", cat: "D", degrees: [7, 11, 14] },
  { roman: "V/iv", cat: "A", degrees: [0, 4, 7, 10] }, // C7 → iv
  { roman: "III", cat: "T", degrees: [3, 7, 10] },
  { roman: "iiø7", cat: "PD", degrees: [2, 5, 8, 12] },
  { roman: "vii°", cat: "D", degrees: [11, 14, 17] },
  { roman: "iv7", cat: "A", degrees: [5, 8, 12, 15] },
];

export const COL_LABELS = ["TONIC", "PREDOM", "DOMINANT", "APPLIED"] as const;

export function cellsForKey(key: Key): ChordCell[] {
  return key.mode === "major" ? CELLS_MAJOR : CELLS_MINOR;
}

const PC_NAMES = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export function keyName(key: Key): string {
  return `${PC_NAMES[key.tonicPc]} ${key.mode === "major" ? "major" : "minor"}`;
}

/** Absolute pitch classes of a chord in a key. */
export function chordPcs(cell: ChordCell, key: Key): number[] {
  return cell.degrees.map((d) => (((key.tonicPc + d) % 12) + 12) % 12);
}

// ── modulation ───────────────────────────────────────────────────────────────
export type Modulation = "dominant" | "relative";

export function modulate(key: Key, kind: Modulation): Key {
  if (kind === "dominant") {
    return { tonicPc: (key.tonicPc + 7) % 12, mode: key.mode };
  }
  // relative: major → relative minor (down m3 = +9), minor → relative major (+3)
  if (key.mode === "major") {
    return { tonicPc: (key.tonicPc + 9) % 12, mode: "minor" };
  }
  return { tonicPc: (key.tonicPc + 3) % 12, mode: "major" };
}

export function modLabel(key: Key, kind: Modulation): string {
  if (kind === "dominant") return "→ DOMINANT";
  return key.mode === "major" ? "→ REL. MINOR" : "→ REL. MAJOR";
}

// ── pitch helpers ─────────────────────────────────────────────────────────────
export const MIN_MIDI = 48; // C3
export const MAX_MIDI = 79; // G5

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function nearestMidi(pc: number, ref: number): number {
  let best = pc;
  let bestD = Infinity;
  for (let o = 3; o <= 7; o++) {
    const m = o * 12 + pc;
    const d = Math.abs(m - ref);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return Math.max(MIN_MIDI, Math.min(MAX_MIDI, best));
}

/**
 * Nearest-chord-tone voice leading. Given the previous 4-voice midi voicing and
 * the target chord's pitch classes, place 4 voices so each moves the least — the
 * new chord is voiced close to the old one, common tones are held, and the audio
 * can simply glide voice i from prev[i] to out[i].
 */
export function voiceLead(prev: number[], pcs: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const pc = pcs[i % pcs.length];
    out[i] = nearestMidi(pc, prev[i] ?? 60);
  }
  return out;
}

/** The opening voicing — a rooted tonic triad in the middle register. */
export const INITIAL_VOICING = [60, 64, 67, 72]; // C4 E4 G4 C5
