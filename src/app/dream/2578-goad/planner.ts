// ════════════════════════════════════════════════════════════════════════════
// Goad (2578) — the adversarial beam-search planner
//
// On its turn the AI does NOT grab the locally tastiest note. It searches over
// its own next 4-bar phrase with a beam search (keep the top-K partial phrases
// at each of the SLOTS steps, extend every survivor by each candidate pitch,
// re-score, prune back to K) and picks the phrase that MAXIMISES the tension it
// hands the human while MINIMISING the tension it must carry itself — an
// adversary that uses dissonance as a weapon (George Lewis's *Voyager*, 1987,
// is the ancestor of software that improvises AGAINST you rather than to please
// you).
//
// It plans past its own phrase: every candidate ending is scored by
// `bestResolutionResidual` — a cheap model of the human's best possible
// resolution — so the AI prefers cliffs the human CANNOT fully defuse, setting
// up the next exchange. Scoring a move by the opponent's best reply is exactly
// the sign-flipped lookahead of Shannon's 1950 chess paper.
// ════════════════════════════════════════════════════════════════════════════

import { mulberry32, randInt } from "./rng";
import {
  MELODY_LO,
  MELODY_HI,
  SLOTS,
  bankedTension,
  bestResolutionResidual,
  eventTension,
  instability,
  intervalLabel,
  phraseTension,
  roughness,
} from "./tension";

export interface PlanResult {
  notes: number[];
  tension: number[];
  banked: number;
  humanResidual: number; // best the human can resolve to (higher = more trapped)
  intent: string;
  nodes: number; // candidate phrases scored
  beam: number;
}

// Candidate pitch pool for each step: the full chromatic melody range, so the
// AI is free to reach for genuinely rough intervals (no consonant lattice).
const POOL: number[] = [];
for (let m = MELODY_LO; m <= MELODY_HI; m++) POOL.push(m);

const BEAM_WIDTH = 10;

// Objective weights.
const W_BANK = 1.0; // tension handed to the human at the barline
const W_TRAP = 0.85; // residual after the human's best resolution (2-exchange)
const W_SELFCOST = 0.34; // tension the AI must carry through its own phrase
const W_INCOHERENCE = 0.42; // penalty for flailing (huge leaps, no shape)

interface Partial {
  notes: number[];
  prev: number; // last pitch placed
  interiorCost: number; // accumulated interior tension + incoherence
}

/** Incoherence penalty for placing `pitch` after `prev` at `slot`. */
function stepIncoherence(pitch: number, prev: number, slot: number): number {
  const leap = Math.abs(pitch - prev);
  // Punish leaps bigger than an octave hard, and reward the occasional step.
  const leapPen = leap > 12 ? (leap - 12) * 0.06 : 0;
  const staticPen = slot > 0 && leap === 0 ? 0.05 : 0; // don't just sit still
  return leapPen + staticPen;
}

/**
 * Score a completed candidate phrase. `incomingPrev` is the human's last pitch
 * (context for the AI's first event). Higher is better FOR THE AI.
 */
function scoreComplete(
  notes: number[],
  interiorCost: number,
  incomingPrev: number,
): { value: number; banked: number; humanResidual: number } {
  const tension = phraseTension(notes, incomingPrev);
  const banked = bankedTension(notes, tension);
  const humanResidual = bestResolutionResidual(notes[notes.length - 1]);
  // Interior cost is the mean, so long phrases aren't unfairly penalised.
  const meanInterior = interiorCost / notes.length;
  const value =
    W_BANK * banked +
    W_TRAP * humanResidual -
    W_SELFCOST * meanInterior;
  return { value, banked, humanResidual };
}

/**
 * Beam search for the AI's next phrase.
 *
 * @param incomingPrev the human's final pitch (start-of-phrase context)
 * @param seed         deterministic seed for tie-breaking
 */
export function planPhrase(incomingPrev: number, seed: number): PlanResult {
  let nodes = 0;

  // Seed the beam with a single empty partial phrase.
  let beam: Partial[] = [{ notes: [], prev: incomingPrev, interiorCost: 0 }];

  for (let slot = 0; slot < SLOTS; slot++) {
    const expanded: { p: Partial; heuristic: number }[] = [];
    for (const partial of beam) {
      for (const pitch of POOL) {
        nodes++;
        const evT = eventTension(pitch, partial.prev, slot);
        const incoh = stepIncoherence(pitch, partial.prev, slot);
        const notes = [...partial.notes, pitch];
        const interiorCost = partial.interiorCost + evT + W_INCOHERENCE * incoh;
        // Partial heuristic: keep the phrases that are cheap to carry so far
        // but END loud. On the final slot, prefer high roughness/instability
        // so the survivors are set up to hand over a cliff.
        const endBonus =
          slot === SLOTS - 1
            ? roughness(pitch) * 0.6 + instability(pitch) * 0.6
            : 0;
        const heuristic = endBonus - interiorCost * 0.25;
        expanded.push({
          p: { notes, prev: pitch, interiorCost },
          heuristic,
        });
      }
    }
    // Prune to the top BEAM_WIDTH by heuristic (deterministic, seeded ties).
    expanded.sort((a, b) => {
      if (b.heuristic !== a.heuristic) return b.heuristic - a.heuristic;
      // Deterministic tie-break from the seed + note content.
      const ha = tieKey(a.p.notes, seed);
      const hb = tieKey(b.p.notes, seed);
      return hb - ha;
    });
    beam = expanded.slice(0, BEAM_WIDTH).map((e) => e.p);
  }

  // Final scoring of the surviving phrases by the true adversarial objective.
  let best: Partial | null = null;
  let bestScore = -Infinity;
  let bestBanked = 0;
  let bestResidual = 0;
  for (const partial of beam) {
    const { value, banked, humanResidual } = scoreComplete(
      partial.notes,
      partial.interiorCost,
      incomingPrev,
    );
    if (value > bestScore) {
      bestScore = value;
      best = partial;
      bestBanked = banked;
      bestResidual = humanResidual;
    }
  }

  const chosen = best ?? beam[0];
  const tension = phraseTension(chosen.notes, incomingPrev);
  return {
    notes: chosen.notes,
    tension,
    banked: bestBanked,
    humanResidual: bestResidual,
    intent: describeIntent(chosen.notes, bestResidual),
    nodes,
    beam: BEAM_WIDTH,
  };
}

/** Deterministic hash of a note list + seed, for stable tie-breaking. */
function tieKey(notes: number[], seed: number): number {
  let h = seed >>> 0;
  for (const n of notes) h = (Math.imul(h ^ n, 0x9e3779b1) >>> 0) ^ (h >>> 15);
  return h >>> 0;
}

/** Taunting one-liner describing the cliff the AI just built. */
function describeIntent(notes: number[], residual: number): string {
  const last = notes[notes.length - 1];
  const pc = (((last - 60) % 12) + 12) % 12;
  const label = intervalLabel(last);
  const trapped = residual > 0.34;
  if (pc === 6) {
    return trapped
      ? "held the tritone over the barline — resolve it or lose ground."
      : "left a tritone ringing against the root. Your move.";
  }
  if (pc === 11) {
    return "left the leading tone hanging — it wants to rise to the tonic, so do it.";
  }
  if (pc === 5) {
    return "parked on the active 4th — it leans onto the third. Lean it back.";
  }
  if (pc === 1 || pc === 8 || pc === 3) {
    return `a chromatic ${label} grinding on the drone — good luck making that pretty.`;
  }
  if (pc === 10) {
    return "dropped a minor 7th on you — it pulls downward. Follow it or fight it.";
  }
  if (trapped) {
    return `ended on the ${label}; even your best resolution stays tense. You're boxed in.`;
  }
  return `ended on the ${label} — mild, but I'm setting the next trap.`;
}

// ── Synthetic human (auto-demo + the "estimate" the planner reasons about) ─────

/**
 * A seeded synthetic human phrase used by the auto-demo. It mostly tries to
 * RESOLVE the incoming cliff (stepwise toward chord tones) but with seeded
 * imperfection, so the demo dialogue breathes instead of flat-lining. Fully
 * deterministic from the seed.
 */
export function runSyntheticHuman(
  incomingPrev: number,
  seed: number,
): { notes: number[]; tension: number[] } {
  const rng = mulberry32(seed);
  const notes: number[] = [];
  let p = incomingPrev;
  for (let slot = 0; slot < SLOTS; slot++) {
    // Aim: descend by step toward a chord tone, but sometimes wander (tension).
    const wander = rng() < 0.32;
    let pick = p;
    let pickScore = Infinity;
    for (let d = -4; d <= 4; d++) {
      const cand = p + d;
      if (cand < MELODY_LO || cand > MELODY_HI) continue;
      const t = eventTension(cand, p, slot);
      const noise = wander ? (rng() - 0.5) * 0.6 : 0;
      const stepBias = Math.abs(d) > 2 ? 0.08 : 0;
      const score = t + stepBias + noise;
      if (score < pickScore) {
        pickScore = score;
        pick = cand;
      }
    }
    p = pick;
    notes.push(p);
  }
  return { notes, tension: phraseTension(notes, incomingPrev) };
}

/** A neutral, on-drone opening pitch for the very first human phrase. */
export function seedOpeningPitch(seed: number): number {
  // Start somewhere sane in the middle of the range, deterministically.
  const opts = [64, 67, 60, 62]; // E4 G4 C4 D4
  return opts[randInt(mulberry32(seed), 0, opts.length - 1)];
}
