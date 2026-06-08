/**
 * tuning.ts — 5-limit just intonation + comma pump logic
 *
 * Maintains a floating-point currentRootHz that drifts via the syntonic comma
 * each time a progression loop completes. All chord building uses pure ratios.
 */

// ── 5-limit JI scale degrees (ratios above root) ──────────────────────────────

export const JI_RATIOS: Record<string, number> = {
  P1:  1,         // 1/1  — unison
  M2:  9 / 8,     // 9/8  — major second
  m3:  6 / 5,     // 6/5  — minor third
  M3:  5 / 4,     // 5/4  — major third
  P4:  4 / 3,     // 4/3  — perfect fourth
  P5:  3 / 2,     // 3/2  — perfect fifth
  m6:  8 / 5,     // 8/5  — minor sixth
  M6:  5 / 3,     // 5/3  — major sixth
  m7:  9 / 5,     // 9/5  — minor seventh
  M7:  15 / 8,    // 15/8 — major seventh
};

// ── Chord voicings (intervals above root) ─────────────────────────────────────

export type ChordKind = "maj" | "min" | "dom7" | "maj7" | "min7";

export interface ChordVoicing {
  kind: ChordKind;
  ratios: number[];   // pure ratios above the chord root
  name: string;       // display label, e.g. "I maj"
}

function majChord(name: string): ChordVoicing {
  return { kind: "maj",  ratios: [1, JI_RATIOS.M3, JI_RATIOS.P5], name };
}
function dom7Chord(name: string): ChordVoicing {
  return { kind: "dom7", ratios: [1, JI_RATIOS.M3, JI_RATIOS.P5, JI_RATIOS.m7], name };
}
function maj7Chord(name: string): ChordVoicing {
  return { kind: "maj7", ratios: [1, JI_RATIOS.M3, JI_RATIOS.P5, JI_RATIOS.M7], name };
}
function min7Chord(name: string): ChordVoicing {
  return { kind: "min7", ratios: [1, JI_RATIOS.m3, JI_RATIOS.P5, JI_RATIOS.m7], name };
}

// ── Progression steps ─────────────────────────────────────────────────────────
//
// Each step specifies:
//   rootMove  — how the ROOT changes from the previous chord (pure ratio)
//   chord     — the voicing to build above the new root
//
// The progression is: I → vi → IV → ii → V → I
// Root motions (all 5-limit pure):
//   I  → vi  : down a pure M3 (× 4/5, then octave-up ×2 = ×8/5 … or direct ×(4/5)×(4/3)?
//              Actually cleaner: down a minor sixth = ×(5/8)×2 to stay in same octave band
//              I=1/1 → vi root is 5/3 above I if we think diatonically.
//              Use: move root to M6 above = ×5/3, stay in register (÷2 if needed).
//   vi → IV  : down a M3 = ×(4/5), then ×2 = ×8/5
//   IV → ii  : down a m3 = ×(5/6), then ×2 = ×5/3 ?
//              IV=4/3 relative to I; ii=9/8 relative to I → ii is 27/32 below IV
//              For simplicity: ii root = IV root × (27/32) × 2 = IV × 27/16 … simpler:
//              down a P5 = ×2/3 × 2 = ×4/3 ? No.
//              Let's use direct: down a pure m3 = ×(5/6), octave up ×2 = ×5/3
//   ii → V  : up a pure P4 = ×4/3
//   V  → I  : down a pure P5 = ×(2/3), octave up ×2 = ×4/3  ← THIS IS THE COMMA PUMP
//              V×(4/3) should equal I, but in JI: if V=3/2 × homeHz,
//              then V×(4/3) = (3/2)×(4/3) × homeHz = 2 × homeHz
//              That IS the octave of home. So a naive I→vi→IV→ii→V→I loop
//              around 5-limit intervals does NOT drift via that specific path.
//
// THE ACTUAL SYNTONIC COMMA PUMP path (the classic pump):
//   The pump arises from a chain: I → IV → ii → V → I where the ii chord
//   is tuned to a pure minor third above the IV, and the V is a pure P4 above ii.
//   Running: root(I) → root(IV)=×4/3 → root(ii)=root(IV)×(5/6)×2=root(IV)×(5/3)
//     but (4/3)×(5/3)=20/9 which needs ÷2 = 10/9
//   root(V) = root(ii)×(4/3) = 10/9×4/3 = 40/27
//   root(I') should be ×(2/3)×2=×4/3 from V: (40/27)×(4/3)=160/81
//   octave equivalence: 160/81 vs 2/1 = 160/81 ≈ 1.975 → off by 81/80 = syntonic comma ✓
//
// So we use the progression: I → IV → ii → V → I with pure-interval root motions.
// Each full cycle, the returned root is 1.975… × homeHz not exactly 2 × homeHz.
// We do NOT enforce octave-equivalent normalisation between chords — we just
// multiply the current root by the ratio and optionally shift up/down by ×2 to
// keep frequencies in a ~80–440 Hz range.

export interface ProgressionStep {
  rootMove: number;       // multiply prev root by this to get this chord's root
  chord: ChordVoicing;
  durationBeats: number;
}

export const PROGRESSION: ProgressionStep[] = [
  { rootMove: 1,       chord: majChord("I"),   durationBeats: 4 },  // stay at current root
  { rootMove: 4 / 3,  chord: majChord("IV"),  durationBeats: 4 },  // up a P4
  { rootMove: 5 / 6,  chord: min7Chord("ii"), durationBeats: 4 },  // down a m3 (×5/6 from IV)
  { rootMove: 4 / 3,  chord: dom7Chord("V"),  durationBeats: 4 },  // up a P4 from ii
  { rootMove: 2 / 3,  chord: maj7Chord("I'"), durationBeats: 4 },  // down a P5 from V → drifted I
];
// Note: after one full cycle, root has been multiplied by:
//   1 × (4/3) × (5/6) × (4/3) × (2/3)
//   = (4/3) × (5/6) × (4/3) × (2/3)
//   = (4×5×4×2) / (3×6×3×3) = 160/162 = 80/81
// That is 1/SYNTONIC_COMMA below the starting root — i.e., down by ~21.5 cents per cycle.
// Octave-normalise to keep the root in register (×2 if < minHz, ÷2 if > maxHz).

export const SYNTONIC_COMMA = 81 / 80;  // ratio; drift is × (80/81) per cycle ≈ −21.5 cents

export const HOME_HZ = 220;             // A3 — our eternal tonic

/** Convert Hz drift to cents from the original home pitch */
export function centsDrift(currentHz: number, homeHz: number): number {
  return 1200 * Math.log2(currentHz / homeHz);
}

/**
 * Octave-normalize a frequency to the range [minHz, maxHz) by repeatedly
 * multiplying or dividing by 2.
 */
export function octaveNorm(hz: number, minHz = 60, maxHz = 480): number {
  let f = hz;
  while (f < minHz) f *= 2;
  while (f >= maxHz) f /= 2;
  return f;
}

/**
 * Snap a frequency to the nearest 12-TET pitch.
 * formula: f_et = 440 × 2^( round(12 × log2(f/440)) / 12 )
 */
export function snapToET(hz: number): number {
  const semis = Math.round(12 * Math.log2(hz / 440));
  return 440 * Math.pow(2, semis / 12);
}

/**
 * Build the absolute frequencies for all voices in a chord.
 * rootHz: floating-point root (may drift)
 * voicing: which JI ratios to stack above it
 * useET: if true, snap each partial to 12-TET before returning
 */
export function buildChordFreqs(
  rootHz: number,
  voicing: ChordVoicing,
  useET: boolean,
): number[] {
  return voicing.ratios.map((r) => {
    const f = rootHz * r;
    return useET ? snapToET(f) : f;
  });
}
