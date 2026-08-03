import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Elaine Chew's Spiral Array — the geometry of tonal space.
//
// Pitches are laid out along the *line of fifths*: stepping by one index k moves
// a perfect fifth (7 semitones), and the line is wound into a helix so that
// every four steps (four fifths ≈ two octaves of the circle) completes one full
// turn. The payoff of the winding: a major triad's root, fifth and major third
// land at k, k+1 and k+4 — a small compact triangle — while a dissonant cluster
// spreads its vertices around the helix into a stretched shape.
//
// Reference: Elaine Chew, *Mathematical and Computational Modeling of Tonality:
// Theory and Applications* (Springer, 2014) — the Spiral Array and its
// center-of-effect tonal-analysis device.
// ─────────────────────────────────────────────────────────────────────────────

/** Helix radius (Chew's R). */
export const R = 1;
/** Vertical rise per fifth-step (Chew's h). */
export const H = 0.4;

/** Range of the line of fifths we render (inclusive). Wide enough that each of
 *  the 12 pitch classes appears ~2×, giving room to place a triad's k+4 third. */
export const K_MIN = -11;
export const K_MAX = 13;

/** Vertical center of the rendered helix, so the crystal sits around the origin. */
const CENTER_Y = ((K_MIN + K_MAX) / 2) * H;

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

/** Pitch class (0–11, C=0) at line-of-fifths index k. Each step is +7 semitones. */
export function pcOfK(k: number): number {
  return ((((k * 7) % 12) + 12) % 12);
}

/** Human note name for a pitch class. */
export function noteName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

/** Position of helix node k, in the crystal's local (un-rotated) space.
 *  y is the helix axis (Chew's z·h); x,z trace the circle. */
export function nodePosition(k: number): THREE.Vector3 {
  const a = (k * Math.PI) / 2;
  return new THREE.Vector3(
    R * Math.sin(a),
    k * H - CENTER_Y,
    R * Math.cos(a)
  );
}

/** All rendered nodes, precomputed. */
export interface SpiralNode {
  k: number;
  pc: number;
  pos: THREE.Vector3;
}

export function buildNodes(): SpiralNode[] {
  const out: SpiralNode[] = [];
  for (let k = K_MIN; k <= K_MAX; k++) {
    out.push({ k, pc: pcOfK(k), pos: nodePosition(k) });
  }
  return out;
}

/** Choose which representation of a pitch class to light: the node whose height
 *  is nearest the current center of effect. This keeps voice-leading local and
 *  chords compact, the way Chew's model resolves a pitch to its nearest spelling. */
export function pickNodeIndex(pc: number, refY: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = K_MIN; k <= K_MAX; k++) {
    if (pcOfK(k) !== pc) continue;
    const d = Math.abs(k * H - CENTER_Y - refY);
    if (d < bestD) {
      bestD = d;
      best = k - K_MIN; // index into buildNodes() array
    }
  }
  return best;
}

/** Violet-family color for a pitch class. Ordered around the circle of fifths so
 *  neighbours on the helix read as neighbours in hue; stays inside the indigo→
 *  magenta arc (never an off-brand hue). */
export function pcColor(pc: number): THREE.Color {
  const fifths = (((pc * 7) % 12) + 12) % 12; // circle-of-fifths position
  const t = fifths / 12;
  // hue 0.66 (indigo) → 0.86 (magenta), all within the violet accent family.
  const hue = 0.66 + t * 0.2;
  return new THREE.Color().setHSL(hue, 0.62, 0.62);
}

/** MIDI note number → frequency in Hz (A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
