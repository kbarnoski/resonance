// Call-and-response growing-memory engine.
// ────────────────────────────────────────────────────────────────────────────
// This is the "game": a Simon-style clapping CONVERSATION that grows.
//
//   • The creature CALLS a short rhythm (a list of beat offsets in seconds from
//     the start of the phrase). The child then RESPONDS by clapping it back.
//   • We record the child's detected onset TIMES (relative to when their turn
//     opened) and compare them against the target pattern, beat-by-beat, within
//     a generous tolerance. A 4-year-old's timing is wobbly, so tolerance is
//     wide and we score on "did roughly the right NUMBER of claps land near the
//     right places", not millisecond精度.
//   • On a good-enough match the creature DELIGHTS and the pattern GROWS by one
//     clap (Simon-style). The growing shared rhythm IS the song.
//   • On a miss there is NO fail — the creature warmly replays the SAME pattern
//     ("let's try together"). Nothing is lost.
//
// State machine (driven by the page's animation loop via tick()):
//   intro    → brief breath before the first call
//   calling  → creature is clapping the pattern (we schedule its beats)
//   waiting  → child's turn; we collect their onset times until the window ends
//   judging  → compare, then either grow (success) or repeat (gentle retry)
//   celebrate→ creature delights; new clap is added; loops back to calling
//
// Beats are stored as offsets in seconds. New beats are added at musically
// pleasant spots (on a loose grid) so the phrase reads as a tune, not noise.

export type Phase = "intro" | "calling" | "waiting" | "judging" | "celebrate";

export interface PatternState {
  phase: Phase;
  /** the shared rhythm: beat offsets in seconds from phrase start. */
  pattern: number[];
  /** how many successful "grows" so far (the length of the song). */
  level: number;
  /** during `calling`, index of the next creature beat to play (for visuals). */
  callIndex: number;
  /** during `waiting`, the child's detected onset offsets (seconds). */
  responses: number[];
  /** 0..1 progress through the current phase (for visual cueing). */
  phaseProgress: number;
}

export interface MatchResult {
  matched: boolean;
  /** 0..1 how well the response lined up (for warmth of the reaction). */
  quality: number;
}

export interface PatternEngine {
  state: () => Readonly<PatternState>;
  /** advance the machine. dt seconds. nowMs = performance.now().
   *  `emitBeat` is called with the beat index whenever the creature should clap
   *  during the `calling` phase (page plays the sound + flashes the bead). */
  tick: (dt: number, emitBeat: (beatIndex: number, total: number) => void) => void;
  /** record a child clap (only counts during the `waiting` phase). offset is
   *  computed internally from when the waiting window opened. */
  registerClap: () => void;
  /** the most recent judging result, or null. cleared on the next call. */
  lastResult: () => MatchResult | null;
  reset: () => void;
}

export interface PatternConfig {
  /** seconds between beats in the creature's call (the tempo). */
  beatSec: number;
  /** seconds the creature pauses after calling before the child's window opens. */
  gapSec: number;
  /** extra seconds of listening window beyond the pattern length. */
  responseSlackSec: number;
  /** ± seconds a child clap may miss a target and still count. Generous. */
  toleranceSec: number;
  /** fraction of beats that must be hit to count as a match (forgiving). */
  matchFraction: number;
  /** starting number of claps in the pattern. */
  startBeats: number;
  /** max pattern length before it gently caps / loops. */
  maxBeats: number;
}

export const DEFAULT_PATTERN: PatternConfig = {
  beatSec: 0.5,
  gapSec: 0.55,
  responseSlackSec: 1.1,
  toleranceSec: 0.34, // wide: wobbly little hands still land
  matchFraction: 0.6, // hit ~60% of the claps near the mark → success
  startBeats: 2,
  maxBeats: 9,
};

export function createPatternEngine(cfg: PatternConfig = DEFAULT_PATTERN): PatternEngine {
  // Build a starting pattern on a loose grid so it sounds like a phrase.
  function seedPattern(n: number): number[] {
    const beats: number[] = [];
    for (let i = 0; i < n; i++) beats.push(i * cfg.beatSec);
    return beats;
  }

  // Add one clap to the pattern at a musical spot: usually the next grid slot,
  // occasionally a syncopated half-beat, so the growing song stays interesting.
  function growPattern(beats: number[]): number[] {
    const last = beats.length ? beats[beats.length - 1] : 0;
    // 70% on-grid next beat, 30% a gentle off-beat for groove
    const step = Math.random() < 0.3 ? cfg.beatSec * 0.5 : cfg.beatSec;
    const next = last + Math.max(cfg.beatSec * 0.5, step);
    return [...beats, next];
  }

  const st: PatternState = {
    phase: "intro",
    pattern: seedPattern(cfg.startBeats),
    level: 0,
    callIndex: 0,
    responses: [],
    phaseProgress: 0,
  };

  let phaseClock = 0; // seconds elapsed in the current phase
  let waitOpenClock = 0; // phaseClock value when the waiting window opened
  let nextBeatToEmit = 0; // index of the next creature beat to fire
  let result: MatchResult | null = null;

  function patternDuration(): number {
    return st.pattern.length ? st.pattern[st.pattern.length - 1] : 0;
  }

  function enter(phase: Phase): void {
    st.phase = phase;
    phaseClock = 0;
    st.phaseProgress = 0;
    if (phase === "calling") {
      st.callIndex = 0;
      nextBeatToEmit = 0;
    }
    if (phase === "waiting") {
      st.responses = [];
      waitOpenClock = 0;
    }
  }

  function judge(): MatchResult {
    const target = st.pattern;
    const got = st.responses;
    // For each target beat, is there a child clap within tolerance? Greedy
    // one-to-one match so two claps can't both satisfy the same beat.
    const used = new Array(got.length).fill(false);
    let hits = 0;
    let errSum = 0;
    for (const t of target) {
      let best = -1;
      let bestErr = cfg.toleranceSec + 1;
      for (let j = 0; j < got.length; j++) {
        if (used[j]) continue;
        const e = Math.abs(got[j] - t);
        if (e < bestErr) {
          bestErr = e;
          best = j;
        }
      }
      if (best >= 0 && bestErr <= cfg.toleranceSec) {
        used[best] = true;
        hits++;
        errSum += bestErr;
      }
    }
    const need = Math.max(1, Math.ceil(target.length * cfg.matchFraction));
    const matched = hits >= need;
    // quality blends coverage and timing tightness, for reaction warmth.
    const coverage = hits / Math.max(1, target.length);
    const tightness = hits > 0 ? 1 - errSum / (hits * cfg.toleranceSec) : 0;
    const quality = Math.max(0, Math.min(1, 0.6 * coverage + 0.4 * tightness));
    return { matched, quality };
  }

  function tick(dt: number, emitBeat: (beatIndex: number, total: number) => void): void {
    phaseClock += dt;

    switch (st.phase) {
      case "intro": {
        // a short settling breath, then the first call
        st.phaseProgress = Math.min(1, phaseClock / 1.4);
        if (phaseClock >= 1.4) enter("calling");
        break;
      }

      case "calling": {
        const dur = patternDuration();
        st.phaseProgress = dur > 0 ? Math.min(1, phaseClock / (dur + cfg.beatSec)) : 1;
        // fire each creature beat as its scheduled offset passes
        while (
          nextBeatToEmit < st.pattern.length &&
          phaseClock >= st.pattern[nextBeatToEmit]
        ) {
          emitBeat(nextBeatToEmit, st.pattern.length);
          st.callIndex = nextBeatToEmit;
          nextBeatToEmit++;
        }
        // once all beats played + a short tail, hand over to the child
        if (nextBeatToEmit >= st.pattern.length && phaseClock >= dur + cfg.gapSec) {
          enter("waiting");
        }
        break;
      }

      case "waiting": {
        const dur = patternDuration();
        const windowLen = dur + cfg.responseSlackSec;
        st.phaseProgress = Math.min(1, phaseClock / windowLen);
        if (phaseClock >= windowLen) enter("judging");
        break;
      }

      case "judging": {
        // instantaneous: decide, then branch
        result = judge();
        if (result.matched) {
          enter("celebrate");
        } else {
          // gentle retry — replay the SAME pattern, no penalty
          enter("calling");
        }
        break;
      }

      case "celebrate": {
        st.phaseProgress = Math.min(1, phaseClock / 1.3);
        if (phaseClock >= 1.3) {
          // GROW: add a clap and level up, then call the longer phrase
          st.level += 1;
          if (st.pattern.length < cfg.maxBeats) {
            st.pattern = growPattern(st.pattern);
          } else {
            // capped: reshuffle into a fresh, slightly different seed so the
            // song keeps evolving instead of dead-ending.
            st.pattern = seedPattern(cfg.startBeats + 1);
          }
          enter("calling");
        }
        break;
      }
    }
  }

  function registerClap(): void {
    if (st.phase !== "waiting") return;
    const offset = phaseClock - waitOpenClock;
    if (offset < 0) return;
    st.responses.push(offset);
  }

  function reset(): void {
    st.pattern = seedPattern(cfg.startBeats);
    st.level = 0;
    st.callIndex = 0;
    st.responses = [];
    result = null;
    enter("intro");
  }

  return {
    state: () => st,
    tick,
    registerClap,
    lastResult: () => {
      const r = result;
      return r;
    },
    reset,
  };
}
