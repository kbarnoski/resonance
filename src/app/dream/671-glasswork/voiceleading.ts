// voiceleading.ts — real nearest-tone four-part voice-leading.
//
// Given the 4 voices' current MIDI notes and a target chord (set of pitch
// classes), choose target MIDI notes — one per voice — so that the TOTAL
// semitone motion is minimised, while penalising doublings/unisons so the
// chord stays open and audible. Each voice then glides (portamento) to its
// target; the glide is the whole point of the piece.
//
// We do an exhaustive 4-voice assignment over the candidate target notes
// within each voice's local register window. The candidate set is tiny
// (a handful of notes per voice), so full search is cheap and gives a true
// minimum rather than a greedy approximation.

import { chordMidiCandidates } from "./theory";

export interface VoicePlan {
  // target MIDI per voice, parallel to the input `current` array
  targets: number[];
  // total absolute semitone motion of the chosen assignment
  cost: number;
}

// Per-voice register windows (MIDI). Bass → top. Kept fairly tight so each
// voice keeps its identity and only ever glides a small distance — the
// signature "breathing" rather than leaping.
export const VOICE_WINDOWS: Array<[number, number]> = [
  [38, 50], // voice 0 — low (D2..D3-ish)
  [50, 60], // voice 1
  [57, 67], // voice 2
  [62, 74], // voice 3 — top pad
];

const DOUBLING_PENALTY = 5.0; // semitone-equivalent cost for sharing a pc
const UNISON_PENALTY = 9.0; // harsher cost for an exact MIDI unison

// Cost of moving one voice from `from` to `to`.
function moveCost(from: number, to: number): number {
  return Math.abs(from - to);
}

// Penalty for the chosen set of target notes (doublings/unisons keep the
// texture muddy — we want the four voices to spread the chord).
function spreadPenalty(notes: number[]): number {
  let pen = 0;
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      if (notes[i] === notes[j]) pen += UNISON_PENALTY;
      else if (
        ((notes[i] % 12) + 12) % 12 ===
        ((notes[j] % 12) + 12) % 12
      ) {
        pen += DOUBLING_PENALTY;
      }
    }
  }
  return pen;
}

// Compute the minimal-motion voicing of `targetPcs` from the `current` voices.
// `bend` (0..1) nudges the candidate windows upward (brighter register) when
// the pointer is high — gentle, optional.
export function planVoices(
  current: number[],
  targetPcs: number[],
  bend = 0,
): VoicePlan {
  const lift = Math.round(bend * 4); // up to +4 semitones of register lift
  // Build per-voice candidate lists (chord tones inside each voice's window).
  const cand: number[][] = VOICE_WINDOWS.map(([lo, hi]) => {
    const list = chordMidiCandidates(targetPcs, lo + lift, hi + lift);
    // guard: if window had no chord tone, widen a little
    if (list.length === 0) {
      return chordMidiCandidates(targetPcs, lo + lift - 3, hi + lift + 3);
    }
    return list;
  });

  let best: VoicePlan = { targets: [...current], cost: Infinity };

  // Exhaustive 4-deep search. Candidate lists are small (~2-4 each).
  const pick: number[] = [0, 0, 0, 0];
  const recurse = (v: number, partialCost: number, chosen: number[]): void => {
    if (partialCost >= best.cost) return; // prune
    if (v === 4) {
      const total = partialCost + spreadPenalty(chosen);
      if (total < best.cost) {
        best = { targets: [...chosen], cost: total };
      }
      return;
    }
    const options = cand[v];
    for (let k = 0; k < options.length; k++) {
      const note = options[k];
      chosen[v] = note;
      pick[v] = k;
      recurse(v + 1, partialCost + moveCost(current[v], note), chosen);
    }
  };
  recurse(0, 0, [0, 0, 0, 0]);

  if (!isFinite(best.cost)) {
    // total fallback — should never happen, but keep voices alive
    best = { targets: [...current], cost: 0 };
  }
  return best;
}
