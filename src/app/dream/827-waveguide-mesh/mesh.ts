// ── Waveguide Mesh · shared model + pitch mapping ──────────────────────────
// Constants and the MIDI → membrane-tension mapping shared by the audio engine
// (worklet) and the main-thread fallback / UI.

export const NX = 28;
export const NY = 28;
export const N = NX * NY;

// Pitch → wave-speed coefficient C (membrane tension).
// We use the FULL CHROMATIC scale straight from MIDI (not C-major-pentatonic).
// A higher note = tighter head = faster waves = higher modal frequencies.
// The mesh's fundamental scales roughly with C, so we map MIDI to C
// logarithmically anchored at a comfortable mid note.
//
// CFL stability for the 2-D FDTD bound: C <= 1/sqrt(2) ≈ 0.707. We stay under.
const C_LO = 0.2; // lowest-note tension
const C_HI = 0.68; // highest-note tension (just inside CFL bound)
const MIDI_LO = 36; // C2
const MIDI_HI = 84; // C6

export function midiToTension(midi: number): number {
  const t = (clamp(midi, MIDI_LO, MIDI_HI) - MIDI_LO) / (MIDI_HI - MIDI_LO);
  return C_LO + (C_HI - C_LO) * t;
}

// Higher notes ring a little shorter so fast chordal playing stays articulate.
export function midiToDamping(midi: number): number {
  const t = (clamp(midi, MIDI_LO, MIDI_HI) - MIDI_LO) / (MIDI_HI - MIDI_LO);
  return 0.99992 - t * 0.00012;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function midiToName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// On-screen pads: one octave of a modal/just-leaning chromatic-ish set that
// sounds consonant but is NOT C-major-pentatonic. We use a D-dorian-flavoured
// set across the row plus the chromatic neighbours available via the keyboard.
// Pads span a useful range for chord-stabbing.
export interface Pad {
  midi: number;
  label: string;
}

// Two rows worth: a lower drum-tom row and an upper plate row.
export const PAD_MIDIS_LOW = [38, 41, 43, 45, 48, 50]; // toms — D2-ish region
export const PAD_MIDIS_HIGH = [53, 55, 57, 60, 62, 65]; // plates — higher

export function makePads(midis: number[]): Pad[] {
  return midis.map((m) => ({ midi: m, label: midiToName(m) }));
}

// Computer-keyboard → MIDI map (one octave, white+black), so a laptop can play.
export const KEY_TO_MIDI: Record<string, number> = {
  a: 48, w: 49, s: 50, e: 51, d: 52, f: 53, t: 54,
  g: 55, y: 56, h: 57, u: 58, j: 59, k: 60,
  o: 61, l: 62, p: 63, ";": 64,
};
