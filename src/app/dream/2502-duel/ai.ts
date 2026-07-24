// ════════════════════════════════════════════════════════════════════════════
// Counterpoint Duel (2502) — the opponent
//
// Real adversarial search. The counterpoint line is filled beat-by-beat, the
// two players alternating. A move's value to whoever plays it is its immediate
// rule score MINUS the best the opponent can then extract from the position it
// leaves behind — classic negamax (Shannon 1950 game-tree minimax, sign-flipped
// per ply). The AI is not picking the locally tastiest note; it is picking the
// note that leaves YOU the worst best-reply, up to `depth` plies ahead.
// ════════════════════════════════════════════════════════════════════════════

import { CANDIDATES, scoreMove } from "./counterpoint";

/**
 * Best reachable (mover − opponent) differential from `beat` onward, searching
 * `depth` plies. Beyond the horizon we return 0: the remaining game is treated
 * as even, so the score already accrued dominates — a standard depth-limited
 * negamax with a neutral static evaluation.
 */
function negamax(
  beat: number,
  prevUpper: number,
  cf: readonly number[],
  depth: number,
): number {
  if (beat >= cf.length || depth <= 0) return 0;
  let best = -Infinity;
  for (const pitch of CANDIDATES) {
    const s = scoreMove(beat, pitch, prevUpper, cf).points;
    const val = s - negamax(beat + 1, pitch, cf, depth - 1);
    if (val > best) best = val;
  }
  return best;
}

export interface AiChoice {
  pitch: number;
  /** The negamax value the AI believes this move secures. */
  value: number;
  /** Nodes visited — surfaced so the UI can prove the search really ran. */
  nodes: number;
}

/**
 * Choose the AI's note at `beat`. Deterministic: ties break toward the more
 * stepwise move, then the lower pitch, so replays are exact (no Math.random).
 */
export function chooseAiMove(
  beat: number,
  prevUpper: number | null,
  cf: readonly number[],
  depth = 3,
): AiChoice {
  let nodes = 0;
  let bestPitch = CANDIDATES[0];
  let bestVal = -Infinity;
  let bestStep = Infinity;

  for (const pitch of CANDIDATES) {
    nodes++;
    const s = scoreMove(beat, pitch, prevUpper, cf).points;
    const val = s - countingNegamax(beat + 1, pitch, cf, depth - 1, (k) => (nodes += k));
    const step = prevUpper === null ? 0 : Math.abs(pitch - prevUpper);
    if (val > bestVal || (val === bestVal && step < bestStep)) {
      bestVal = val;
      bestPitch = pitch;
      bestStep = step;
    }
  }

  return { pitch: bestPitch, value: bestVal, nodes };
}

// Node-counting wrapper so the readout can show the tree really was searched.
function countingNegamax(
  beat: number,
  prevUpper: number,
  cf: readonly number[],
  depth: number,
  tally: (n: number) => void,
): number {
  if (beat >= cf.length || depth <= 0) return 0;
  let best = -Infinity;
  let visited = 0;
  for (const pitch of CANDIDATES) {
    visited++;
    const s = scoreMove(beat, pitch, prevUpper, cf).points;
    const val = s - countingNegamax(beat + 1, pitch, cf, depth - 1, tally);
    if (val > best) best = val;
  }
  tally(visited);
  return best;
}

// Re-export the pure searcher for anyone who just wants the value.
export { negamax };
