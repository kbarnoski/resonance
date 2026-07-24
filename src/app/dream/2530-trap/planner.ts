// ════════════════════════════════════════════════════════════════════════════
// Trap (2530) — the adversarial planner
//
// The AI is trying to WIN a zero-sum tension game. The shared line is extended
// one note at a time, the two players alternating. Tension (see tension.ts) is
// a single scalar both sides fight over: the AI MAXIMISES it, the human
// MINIMISES it. This is exactly the minimax of Shannon's 1950 chess paper,
// pruned with alpha–beta.
//
// Crucially the AI does NOT grab the locally most dissonant note. It values a
// move by what the human's BEST reply can still be forced to sound like, one
// phrase ahead — so it will happily play a merely-tense note if that note builds
// the rolling sonority into a cluster you cannot resolve. That is the trap.
//
// A note's tension is weighted by WHO plays it: a tense note the human is forced
// into is worth more to the AI (PLAYER_W) than a tense note the AI plays itself
// (AI_W). So the search actively hunts positions where YOUR hands are tied.
//
// The search returns its principal variation (PV) — the line it believes will
// actually be played — which the UI reveals as the pending "threat", giving you
// a beat's warning to escape.
// ════════════════════════════════════════════════════════════════════════════

import { CANDIDATES, noteTension, pushEcho } from "./tension";

// The AI most wants to strand YOU, so tension on the human's turn counts for
// more than tension the AI creates on its own turn.
const AI_W = 0.7;
const PLAYER_W = 1.3;

interface Counter {
  n: number;
}

interface SearchResult {
  value: number;
  pv: number[];
}

/**
 * Depth-limited alpha–beta minimax over accumulated tension.
 * `maximising` = the AI's turn (wants tension high); otherwise the human (wants
 * it low). Beyond the horizon the remaining game is treated as neutral (0), the
 * standard depth-limited static evaluation.
 */
function search(
  beat: number,
  echo: readonly number[],
  depth: number,
  maximising: boolean,
  alpha: number,
  beta: number,
  endBeat: number,
  counter: Counter,
): SearchResult {
  if (depth <= 0 || beat > endBeat) return { value: 0, pv: [] };

  const weight = maximising ? AI_W : PLAYER_W;
  let pv: number[] = [];

  if (maximising) {
    let value = -Infinity;
    let a = alpha;
    for (const pitch of CANDIDATES) {
      counter.n++;
      const t = noteTension(pitch, echo).total;
      const child = search(
        beat + 1,
        pushEcho(echo, pitch),
        depth - 1,
        false,
        a,
        beta,
        endBeat,
        counter,
      );
      const v = t * weight + child.value;
      if (v > value) {
        value = v;
        pv = [pitch, ...child.pv];
      }
      if (value > a) a = value;
      if (a >= beta) break; // beta cutoff
    }
    return { value, pv };
  }

  let value = Infinity;
  let b = beta;
  for (const pitch of CANDIDATES) {
    counter.n++;
    const t = noteTension(pitch, echo).total;
    const child = search(
      beat + 1,
      pushEcho(echo, pitch),
      depth - 1,
      true,
      alpha,
      b,
      endBeat,
      counter,
    );
    const v = t * weight + child.value;
    if (v < value) {
      value = v;
      pv = [pitch, ...child.pv];
    }
    if (value < b) b = value;
    if (alpha >= b) break; // alpha cutoff
  }
  return { value, pv };
}

export interface CandidateEval {
  pitch: number;
  tension: number;
  value: number;
}

export interface Plan {
  /** The note the AI commits to now. */
  pitch: number;
  /** The minimax value the AI believes this line secures (higher = more trapped you are). */
  value: number;
  /** Nodes the search actually visited — proof the tree was walked. */
  nodes: number;
  /** Principal variation: [AI now, expected you, AI's planned trap, …]. */
  pv: number[];
  /** Per-candidate evaluation, tense-first, for making the reasoning visible. */
  evals: CandidateEval[];
}

/**
 * Choose the AI's note at `beat` (its turn — the maximiser). Deterministic: ties
 * break toward the more aggressive note (higher immediate tension), then the
 * lower pitch, so replays are exact.
 */
export function planTrap(
  beat: number,
  echo: readonly number[],
  depth: number,
  endBeat: number,
): Plan {
  const counter: Counter = { n: 0 };
  let bestPitch = CANDIDATES[0];
  let bestValue = -Infinity;
  let bestTension = -Infinity;
  let bestPv: number[] = [];
  const evals: CandidateEval[] = [];

  let alpha = -Infinity;
  const beta = Infinity;

  for (const pitch of CANDIDATES) {
    counter.n++;
    const t = noteTension(pitch, echo).total;
    const child = search(
      beat + 1,
      pushEcho(echo, pitch),
      depth - 1,
      false,
      alpha,
      beta,
      endBeat,
      counter,
    );
    const v = t * AI_W + child.value;
    evals.push({ pitch, tension: t, value: v });
    if (v > bestValue || (v === bestValue && t > bestTension)) {
      bestValue = v;
      bestTension = t;
      bestPitch = pitch;
      bestPv = [pitch, ...child.pv];
    }
    if (bestValue > alpha) alpha = bestValue;
  }

  evals.sort((x, y) => y.tension - x.tension);
  return {
    pitch: bestPitch,
    value: bestValue,
    nodes: counter.n,
    pv: bestPv,
    evals,
  };
}
