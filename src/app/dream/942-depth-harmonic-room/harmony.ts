// harmony.ts — the neo-Riemannian Tonnetz harmony engine.
//
// This is the CORE of the piece. Position in the room selects a cell on a
// 2D Tonnetz lattice; each cell is a major or minor triad. Adjacent cells are
// related by a single parsimonious neo-Riemannian transform — P (Parallel),
// L (Leittonwechsel) or R (Relative) — each of which holds TWO of the three
// chord tones fixed and moves only ONE by a semitone or tone. That common-tone
// retention IS the smooth voice-leading; walking the lattice = gliding through
// voice-led harmony.
//
// References:
//   • Hugo Riemann — original Tonnetz; Richard Cohn, *Audacious Euphony* (2012)
//     — modern neo-Riemannian formalization of P / L / R.
//   • Dmitri Tymoczko, *A Geometry of Music* (2011) — voice-leading geometry,
//     "move each voice the smallest distance" nearest-tone voicing.
//   • Aldwell & Schachter, *Harmony and Voice Leading* — SATB doubling/spacing.
//
// All pitches are MIDI note numbers. A triad is stored as {root, third, fifth}
// pitch classes plus a quality flag; voicing turns it into 4 absolute MIDI
// voices (SATB) chosen to move minimally from the previous voicing.

// ── Triad as a chord on the Tonnetz ─────────────────────────────────────────

export type Quality = "maj" | "min";

export interface Triad {
  /** root pitch class 0..11 (0 = C) */
  root: number;
  quality: Quality;
}

const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export function triadName(t: Triad): string {
  return NAMES[((t.root % 12) + 12) % 12] + (t.quality === "min" ? "m" : "");
}

/** The three pitch classes of a triad, low→high in close root position. */
export function triadPitchClasses(t: Triad): [number, number, number] {
  const third = t.quality === "maj" ? 4 : 3;
  return [t.root % 12, (t.root + third) % 12, (t.root + 7) % 12];
}

// ── The three neo-Riemannian operations ─────────────────────────────────────
// Each maps a major triad to a minor (or vice versa) holding two common tones.
//
//   P  (Parallel):        C maj (C E G)  ↔  C min (C E♭ G)   — third moves ½
//   L  (Leittonwechsel):  C maj (C E G)  ↔  E min (B E G)     — root moves ½ down
//   R  (Relative):        C maj (C E G)  ↔  A min (A C E)     — fifth moves +tone

export function applyP(t: Triad): Triad {
  // same root, flip quality.
  return { root: t.root, quality: t.quality === "maj" ? "min" : "maj" };
}

export function applyL(t: Triad): Triad {
  if (t.quality === "maj") {
    // C maj → E min : new root = old third (E), quality min.
    return { root: (t.root + 4) % 12, quality: "min" };
  }
  // E min → C maj : new root = E min's fifth + ? Inverse of above.
  // E min (E G B) → C maj (C E G): new root = old fifth - 3? old root E(4)→C(0).
  return { root: (t.root + 8) % 12, quality: "maj" };
}

export function applyR(t: Triad): Triad {
  if (t.quality === "maj") {
    // C maj → A min : new root = old root - 3 (A), quality min.
    return { root: (t.root + 9) % 12, quality: "min" };
  }
  // A min → C maj : new root = old root + 3 (C), quality maj.
  return { root: (t.root + 3) % 12, quality: "maj" };
}

export type Transform = "P" | "L" | "R" | "I"; // I = identity (no move)

export function applyTransform(t: Triad, x: Transform): Triad {
  switch (x) {
    case "P":
      return applyP(t);
    case "L":
      return applyL(t);
    case "R":
      return applyR(t);
    default:
      return t;
  }
}

// ── The lattice: a discrete (col,row) grid → triad ──────────────────────────
//
// We lay triads out so that horizontal motion walks an L/R chain (the
// "hexatonic / Weitzmann" style alternation that travels around thirds) and
// vertical motion applies P (major↔minor brightness). This gives an intuitive
// body mapping: step sideways ⇒ the harmony rotates through related keys
// (R, L, R, L…); lean in/out ⇒ the SAME chord brightens to major or darkens
// to minor (P). Two of three voices are always retained on every single step.

export const LAT_COLS = 7; // lateral cells (centroidX)
export const LAT_ROWS = 3; // depth bands (near→far): bright→neutral→dark

// Anchor triad at the centre of the lattice (warm, tonic-ish): C major.
const ANCHOR: Triad = { root: 0, quality: "maj" };

/**
 * Resolve a lattice cell to a concrete triad by walking parsimonious transforms
 * out from the anchor. Column walks an alternating R/L chain (smooth third-cycle
 * motion); row applies P relative to the column's "natural" quality so the
 * near band reads major-bright and the far band minor-dark.
 */
export function cellToTriad(col: number, row: number): Triad {
  const c = Math.max(0, Math.min(LAT_COLS - 1, Math.round(col)));
  const r = Math.max(0, Math.min(LAT_ROWS - 1, Math.round(row)));

  // walk col steps out from centre column, alternating R then L.
  const mid = (LAT_COLS - 1) / 2;
  let t: Triad = { ...ANCHOR };
  const steps = c - mid; // signed distance from centre
  const n = Math.abs(Math.round(steps));
  // Stepping RIGHT of centre leads with R (descending-thirds chain:
  // C→Am→F→Dm…); stepping LEFT leads with L (the complementary chain), so the
  // two sides are mirror journeys away from the tonic. Each step is one
  // parsimonious transform → always two retained common tones.
  const lead: Transform = steps >= 0 ? "R" : "L";
  const other: Transform = steps >= 0 ? "L" : "R";
  for (let i = 0; i < n; i++) {
    t = applyTransform(t, i % 2 === 0 ? lead : other);
  }

  // row: near band (r=0) = brighten toward major, far band (r=ROWS-1) = minor.
  // Centre row = leave as-is. Apply P to force quality where the band demands.
  if (r === 0 && t.quality === "min") t = applyP(t); // near ⇒ major
  if (r === LAT_ROWS - 1 && t.quality === "maj") t = applyP(t); // far ⇒ minor

  return t;
}

/** Name the single transform that best describes col,row → col2,row2. */
export function describeMove(
  a: Triad,
  b: Triad,
): Transform {
  if (a.root === b.root && a.quality !== b.quality) return "P";
  if (sameTriad(applyL(a), b)) return "L";
  if (sameTriad(applyR(a), b)) return "R";
  if (sameTriad(a, b)) return "I";
  // multi-step move: report the operation that retains the most common tones.
  return bestParsimonious(a, b);
}

function sameTriad(a: Triad, b: Triad): boolean {
  return a.root % 12 === b.root % 12 && a.quality === b.quality;
}

function commonTones(a: Triad, b: Triad): number {
  const pa = new Set(triadPitchClasses(a));
  let n = 0;
  for (const p of triadPitchClasses(b)) if (pa.has(p)) n++;
  return n;
}

function bestParsimonious(a: Triad, b: Triad): Transform {
  const cands: Transform[] = ["P", "L", "R"];
  let best: Transform = "I";
  let bestCommon = -1;
  for (const x of cands) {
    const c = commonTones(applyTransform(a, x), b);
    if (c > bestCommon) {
      bestCommon = c;
      best = x;
    }
  }
  return best;
}

// ── SATB voicing with nearest-chord-tone voice-leading ──────────────────────
//
// Given the target triad, produce 4 absolute MIDI voices (Bass, Tenor, Alto,
// Soprano). The bass takes the root in a fixed low octave. The upper three
// voices each pick the octave of a chord tone NEAREST to where that voice
// currently sits — so when the triad changes, the common tones literally do
// not move, and the single changed tone slides the minimal distance. This is
// Tymoczko's "minimal voice-leading" made concrete.

export interface Voicing {
  /** absolute MIDI: [bass, tenor, alto, soprano] */
  midi: [number, number, number, number];
  triad: Triad;
}

const BASS_CENTRE = 41; // ~F2
const UPPER_CENTRES = [55, 62, 67]; // tenor ~G3, alto ~D4, soprano ~G4

function nearestMidiForPc(pc: number, target: number): number {
  // find octave of pitch-class `pc` closest to `target`.
  const base = ((pc % 12) + 12) % 12;
  const k = Math.round((target - base) / 12);
  return base + 12 * k;
}

/**
 * Voice `triad` to be as close as possible to `prev` (nearest-tone). `openness`
 * (0..1, from nearEnergy) gently lifts the soprano an octave-ish for a more open
 * spacing when the listener leans in.
 */
export function voiceTriad(
  triad: Triad,
  prev: Voicing | null,
  openness: number,
): Voicing {
  const pcs = triadPitchClasses(triad); // [root, third, fifth] pitch classes

  // bass = root, fixed register (small adjustment toward prev bass).
  const bassTarget = prev ? prev.midi[0] : BASS_CENTRE;
  const bass = nearestMidiForPc(pcs[0], bassTarget);

  // upper three voices: greedy nearest-tone assignment of the 3 pcs to the 3
  // upper voice slots, minimizing total motion from the previous voicing.
  const prevUpper = prev ? [prev.midi[1], prev.midi[2], prev.midi[3]] : UPPER_CENTRES;

  // try all 3! = 6 assignments of pcs→slots, pick min total semitone motion.
  const perms: number[][] = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  let bestNotes: [number, number, number] = [
    UPPER_CENTRES[0],
    UPPER_CENTRES[1],
    UPPER_CENTRES[2],
  ];
  let bestCost = Infinity;
  for (const perm of perms) {
    const notes: [number, number, number] = [0, 0, 0];
    let cost = 0;
    for (let slot = 0; slot < 3; slot++) {
      const pc = pcs[perm[slot]];
      const target = prevUpper[slot];
      const m = nearestMidiForPc(pc, target);
      notes[slot] = m;
      cost += Math.abs(m - target);
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestNotes = notes;
    }
  }

  // keep voices ordered low→high & non-crossing within the upper trio.
  bestNotes.sort((a, b) => a - b);

  // gentle openness: lift soprano up to +12 as the listener leans in.
  const lift = Math.round(openness * 5); // up to ~a fourth
  bestNotes[2] = bestNotes[2] + lift;

  // ensure tenor sits above bass
  if (bestNotes[0] <= bass) bestNotes[0] += 12;

  return {
    midi: [bass, bestNotes[0], bestNotes[1], bestNotes[2]],
    triad,
  };
}

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
