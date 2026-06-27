// scorer.ts — a Fux-style voice-leading scorer.
//
// Given a partial set of voices and a candidate next pitch for one voice,
// returns a score. Higher is better. Rules follow the species-counterpoint
// spirit of Fux's Gradus ad Parnassum (1725): prefer consonance on strong
// beats, stepwise motion, and contrary motion; punish parallel perfect
// fifths/octaves, voice crossing, and large leaps. This is what makes the
// output sound like deliberate counterpoint instead of random notes.

export interface VoiceState {
  // recent pitches this voice has sounded (most recent last)
  history: number[];
}

const CONSONANT = new Set([0, 3, 4, 7, 8, 9, 12]); // unison,3rds,5th,6ths,oct (mod 12 below)
const PERFECT = new Set([0, 7]); // unison/octave(0) and fifth(7), mod 12

function intervalClass(a: number, b: number): number {
  return Math.abs(a - b) % 12;
}

export interface ScoreContext {
  candidate: number; // proposed pitch for the moving voice
  prev: number | null; // moving voice's previous pitch
  prevPrev: number | null; // moving voice's pitch before that
  others: number[]; // current pitches of the other sounding voices
  othersPrev: number[]; // those voices' previous pitches
  strongBeat: boolean;
  lowBound: number;
  highBound: number;
}

export function scoreCandidate(ctx: ScoreContext): number {
  let s = 0;
  const { candidate, prev, others, othersPrev, strongBeat } = ctx;

  // ── range: keep voice in its comfortable register ──
  if (candidate < ctx.lowBound) s -= 6 + (ctx.lowBound - candidate) * 0.5;
  if (candidate > ctx.highBound) s -= 6 + (candidate - ctx.highBound) * 0.5;

  // ── melodic motion of the moving voice ──
  if (prev !== null) {
    const leap = Math.abs(candidate - prev);
    if (leap === 0) s -= 2; // discourage repeated notes (some allowed)
    else if (leap <= 2) s += 4; // stepwise — rewarded
    else if (leap <= 4) s += 1; // a third — fine
    else if (leap <= 7) s -= 1; // a fifth-ish leap — tolerated
    else s -= 2 + (leap - 7) * 0.6; // big leaps punished, scaling

    // recovery: a leap should be followed by a step in the opposite dir
    if (ctx.prevPrev !== null) {
      const prevLeap = prev - ctx.prevPrev;
      const thisLeap = candidate - prev;
      if (Math.abs(prevLeap) > 4 && Math.sign(prevLeap) === Math.sign(thisLeap)) {
        s -= 2.5; // two big leaps in the same direction — bad
      }
    }
  }

  // ── harmonic relationship against every other sounding voice ──
  for (let i = 0; i < others.length; i++) {
    const other = others[i];
    const ic = intervalClass(candidate, other);

    if (strongBeat) {
      if (CONSONANT.has(ic)) s += 3;
      else s -= 4; // dissonance on a strong beat — Fux frowns
    } else {
      if (CONSONANT.has(ic)) s += 1;
      else s -= 0.5; // passing dissonance on weak beats is OK
    }

    // voice crossing / overlap penalty (compare absolute pitch)
    if (prev !== null) {
      const wasAbove = prev > (othersPrev[i] ?? other);
      const isAbove = candidate > other;
      if (wasAbove !== isAbove && Math.abs(candidate - other) < 12) {
        s -= 3; // voices crossed
      }
    }

    // ── parallel / direct perfect-consonance check ──
    const op = othersPrev[i];
    if (prev !== null && op !== undefined) {
      const prevIc = intervalClass(prev, op);
      if (PERFECT.has(ic) && PERFECT.has(prevIc) && ic === prevIc) {
        const movingDir = Math.sign(candidate - prev);
        const otherDir = Math.sign(other - op);
        if (movingDir === otherDir && movingDir !== 0) {
          s -= 8; // parallel fifths / octaves — heavily punished
        }
      }
      // reward contrary motion
      const movingDir = Math.sign(candidate - prev);
      const otherDir = Math.sign(other - op);
      if (movingDir !== 0 && otherDir !== 0) {
        if (movingDir !== otherDir) s += 1.5; // contrary
        else s -= 0.4; // similar motion — mildly discouraged
      }
    }
  }

  return s;
}

// Pick the best in-key candidate pitch for a moving voice from a set of
// options (greedy with the scorer). Returns the chosen pitch.
export function chooseBest(
  candidates: number[],
  base: Omit<ScoreContext, "candidate">,
): number {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate({ ...base, candidate: c });
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}
