// ─────────────────────────────────────────────────────────────────────────────
// messiaen.ts — the art-only colour layer. Olivier Messiaen described, in
// interview after interview (most fully in "Music and Color: Conversations
// with Claude Samuel", 1986), seeing specific complex colours whenever he
// heard certain chords — a real, well-documented case of chord→colour
// synaesthesia, organised around his seven "Modes of Limited Transposition".
// His own words, paraphrased from those conversations and his "Traité de
// rythme, de couleur, et d'ornithologie":
//
//   Mode 2 (octatonic) T1  — blue-violet rocks flecked with gold. His favourite.
//   Mode 2 T2              — gold and brown, on a milky-white ground, with
//                             mauve, black and pale-grey highlights.
//   Mode 2 T3               — green and orange, dotted with violet, blue, red.
//   Mode 3                  — orange and red with a little green, milky-white
//                             ground, dotted mauve.
//   Mode 4                  — a grey-mauve, blue-grey "cathedral" stained glass.
//   Mode 5                  — mauve, blue-violet, amethyst.
//   Mode 6                  — dominant blue and orange.
//   Mode 7                  — everything of modes 2–6 combined; red, blue,
//                             green predominate.
//
// Messiaen never assigned single PITCH CLASSES their own colour — colour
// belonged to whole chords/modes for him. To make a 12-spoke rose window we
// need one colour per pitch class, so this file builds a plausible 12-tone
// jewel wheel by hand, each spoke drawn from the mode-family it sits inside
// most characteristically (see the comment on each entry below), and keeps a
// SEPARATE, faithful mode-detector (detectMode) that actually matches his
// documented Mode 1 and Mode 2 transpositions and biases the whole rose
// toward their real colour when three or more notes land inside one. This is
// an artistic extrapolation, not a transcription of Messiaen's own chart —
// said plainly in the README.
//
// ALL raw jewel hex lives in this file (and the CSS it feeds). Nowhere else.
// ─────────────────────────────────────────────────────────────────────────────

export interface NoteColor {
  /** Base jewel hex for this pitch class. */
  hex: string;
  /** Short colour name as Messiaen (or the nearest mode family) would say it. */
  name: string;
  /** Which of his documented modes this hue is drawn from. */
  source: string;
}

// pitch class 0..11 = C, C#, D, D#, E, F, F#, G, G#, A, A#, B
export const PITCH_CLASS_COLOR: NoteColor[] = [
  { hex: "#E8A23A", name: "amber-gold", source: "Mode 3 — orange-gold ground" },
  { hex: "#4B2FBE", name: "blue-violet", source: "Mode 2 T1 — his favourite" },
  { hex: "#D8481F", name: "vermilion", source: "Mode 3 — orange-red" },
  { hex: "#1E8F5F", name: "emerald", source: "Mode 2 T3 — green facet" },
  { hex: "#A81238", name: "ruby", source: "Mode 6/7 — dominant red" },
  { hex: "#CFE7DE", name: "milky pearl", source: "Mode 2 T2 — milky-white ground" },
  { hex: "#7C2FA6", name: "amethyst", source: "Mode 5 — mauve-violet" },
  { hex: "#9C8A5E", name: "grey-gold", source: "Mode 4 — grey stained glass" },
  { hex: "#1E4FA8", name: "cobalt", source: "Mode 6 — blue half" },
  { hex: "#C98A17", name: "topaz", source: "Mode 2 T2 — gold and brown" },
  { hex: "#B23E72", name: "carmine rose", source: "Mode 5 — mauve-pink" },
  { hex: "#6B6478", name: "slate mauve", source: "Mode 4 — blue-grey mauve" },
];

export const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F",
  "F♯", "G", "G♯", "A", "A♯", "B",
];

// ── small colour-mixing utilities (linear channel mix — good enough for a
//    jewel-glass look; no HSL round-trip needed) ────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16)
    .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Linear-mix two hex colours; t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/**
 * Register (ring) → saturation/depth: outer rings (low octaves) read as
 * deeper, shadowed glass; inner rings (high octaves) read as brighter,
 * more luminous glass. Returns {base, hi, lo} — a resting tint plus a
 * lightened highlight and a darkened shadow, precomputed once per cell
 * (it never needs to change per frame — only opacity does).
 */
export function registerTint(baseHex: string, ring: number): { base: string; hi: string; lo: string } {
  // ring 0 = outer/low, ring 3 = inner/high. Positive = toward depth (black),
  // negative = toward shimmer (white).
  const depthByRing = [0.24, 0.1, -0.06, -0.2];
  const d = depthByRing[Math.max(0, Math.min(3, ring))] ?? 0;
  const base = d >= 0 ? mixHex(baseHex, "#0a0710", d) : mixHex(baseHex, "#ffffff", -d);
  return {
    base,
    hi: mixHex(base, "#ffffff", 0.4),
    lo: mixHex(base, "#050308", 0.45),
  };
}

/** Velocity (0..1) → the ceiling brightness a lit petal swells toward. */
export function velocityToBrightness(velocity: number): number {
  const v = Math.max(0, Math.min(1, velocity));
  return 0.32 + v * 0.68;
}

// ── Messiaen's Modes of Limited Transposition — the ones we actually detect.
//    Mode 1 = whole tone (2 transpositions). Mode 2 = octatonic (3
//    transpositions, the mode he described most vividly). Each candidate
//    carries its documented dominant colour. ───────────────────────────────
interface ModeCandidate {
  name: string;
  pcs: Set<number>;
  color: string;
}

function pcSet(pcs: number[]): Set<number> {
  return new Set(pcs);
}

export const MESSIAEN_MODES: ModeCandidate[] = [
  { name: "Mode 1 (whole tone)", pcs: pcSet([0, 2, 4, 6, 8, 10]), color: "#7C8AA0" },
  { name: "Mode 1 (whole tone)", pcs: pcSet([1, 3, 5, 7, 9, 11]), color: "#7C8AA0" },
  { name: "Mode 2 T1 (octatonic)", pcs: pcSet([0, 1, 3, 4, 6, 7, 9, 10]), color: "#4B2FBE" },
  { name: "Mode 2 T2 (octatonic)", pcs: pcSet([1, 2, 4, 5, 7, 8, 10, 11]), color: "#B08A3E" },
  { name: "Mode 2 T3 (octatonic)", pcs: pcSet([2, 3, 5, 6, 8, 9, 11, 0]), color: "#2F8F5B" },
];

/**
 * Given the set of currently-held pitch classes, find the tightest-fitting
 * Messiaen mode that fully contains them (≥3 notes required — a dyad or
 * single note doesn't yet suggest a mode). Ties broken by declaration order.
 * Returns null when nothing documented fits (most chromatic clusters won't,
 * honestly — this is a real detector, not a fudge).
 */
export function detectMode(activePcs: Set<number>): { name: string; color: string } | null {
  if (activePcs.size < 3) return null;
  let best: ModeCandidate | null = null;
  for (const cand of MESSIAEN_MODES) {
    let fits = true;
    for (const pc of activePcs) {
      if (!cand.pcs.has(pc)) { fits = false; break; }
    }
    if (fits && (!best || cand.pcs.size < best.pcs.size)) best = cand;
  }
  return best ? { name: best.name, color: best.color } : null;
}
