// ════════════════════════════════════════════════════════════════════════════
// notation.ts — SVG geometry + the art palette for the two-voice piano-roll.
//
// Time flows right → left: "now" is the right edge; notes scroll left and off.
// Pitch maps to Y. Colors are the only raw hex allowed by the brief — they live
// inside the SVG art and stay within the Resonance violet family.
// ════════════════════════════════════════════════════════════════════════════

// Art colors (violet family — the sanctioned accent + its analogous neighbors).
export const ART = {
  bg: "#0b0713", // near-black violet wash
  staff: "#241147", // faint staff lines
  tonic: "#3a1d78", // emphasized tonic line
  you: "#a78bfa", // visitor's voice (violet)
  youCore: "#8b5cf6",
  partner: "#b043e0", // partner's answer (magenta neighbor)
  partnerCore: "#c85ef0",
  linkCons: "#c4b5fd", // consonant relationship line
  linkDiss: "#5b2ec9", // dissonant relationship line
  now: "#ddd6fe",
} as const;

// Visible pitch + time window.
export const MIDI_LO = 52;
export const MIDI_HI = 86;
export const WINDOW_MS = 6000;

export const VIEW_W = 1000;
export const VIEW_H = 440;
const PAD_Y = 18;

export function pitchToY(midi: number): number {
  const t = (midi - MIDI_LO) / (MIDI_HI - MIDI_LO);
  const clamped = Math.max(0, Math.min(1, t));
  return PAD_Y + (1 - clamped) * (VIEW_H - 2 * PAD_Y);
}

/** X for an absolute timestamp given the current clock. now → right edge. */
export function timeToX(t: number, now: number): number {
  return VIEW_W - ((now - t) / WINDOW_MS) * VIEW_W;
}

export const pxPerMs = VIEW_W / WINDOW_MS;

/** C-natural midi numbers within the visible range (for octave gridlines). */
export function octaveLines(): number[] {
  const out: number[] = [];
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    if (m % 12 === 0) out.push(m); // pitch-class 0 == C
  }
  return out;
}

export function noteName(midi: number): string {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const oct = Math.floor(midi / 12) - 1;
  return `${names[((midi % 12) + 12) % 12]}${oct}`;
}
