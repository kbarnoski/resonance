// hmm.ts — Left-to-right Hidden Markov score-position model (the ROBUSTNESS layer).
//
// The robustness idea, after Nakamura et al., "Real-Time Audio-to-Score Alignment
// of Performances Containing Errors and Arbitrary Repeats and Skips" (parallel HMM
// with delayed-decision / anticipation): model the score as a left-to-right hidden
// Markov chain where each STATE is a score note. Crucially, we include explicit
// transitions for performance ERRORS so a mistake doesn't kill the estimate:
//
//   • SELF-loop   — hesitation, or insertion of a wrong/extra note in place.
//   • STEP +1     — the normal advance to the next score note.
//   • SKIP +2/+3  — the soloist jumped forward (omitted notes).
//   • BACK -1     — the soloist repeated a note (accidental repeat / restart).
//
// The emission probability compares the played pitch to each candidate state's
// score pitch: HIGH on an exact match, LOW BUT NONZERO on a mismatch. That nonzero
// floor is the whole trick — a wrong note merely lowers a state's likelihood, it
// does not zero it out, so probability mass survives on the correct neighbourhood
// and the MAP estimate snaps back once the soloist returns to the score.
//
// We maintain a forward belief vector (a discrete Bayesian filter / the forward
// pass of a HMM). The MAP state index is the HMM's position estimate; because mass
// is spread over multiple hypotheses, it tolerates wrong notes that derail DTW.

import type { ScoreNote } from "./score"

export interface HmmResult {
  map: number          // MAP (most-likely) state index = HMM position estimate
  belief: number[]     // full normalized belief vector over states (for viz)
  entropy: number      // 0..1 normalized entropy (how spread / uncertain we are)
  confidence: number   // peak belief mass on the MAP state (1 = certain)
}

export class ScoreHMM {
  private ref: ScoreNote[]
  private N: number
  private belief: number[]

  // Transition weights (unnormalized; normalized per-row at construction).
  // Tuned so STEP dominates but errors are always reachable.
  private readonly wSelf = 0.18  // hesitation / inserted wrong note
  private readonly wStep = 0.55  // normal +1 advance
  private readonly wSkip2 = 0.14 // jump forward 2
  private readonly wSkip3 = 0.07 // jump forward 3
  private readonly wBack = 0.06  // accidental repeat (-1)

  // Emission floor: probability of observing a mismatching pitch. Nonzero so a
  // wrong note cannot annihilate a state. Exact match gets the full mass.
  private readonly emitMatch = 1.0
  private readonly emitNear = 0.22   // within 2 semitones (close miss)
  private readonly emitFar = 0.06    // far miss / off-key (still nonzero!)

  constructor(ref: ScoreNote[]) {
    this.ref = ref
    this.N = ref.length
    this.belief = new Array(this.N).fill(0)
    this.belief[0] = 1
  }

  reset(): void {
    this.belief.fill(0)
    this.belief[0] = 1
  }

  // Emission likelihood of `played` given the soloist is at state j.
  private emission(played: number, j: number): number {
    const ref = this.ref[j].midi
    if (played === ref) return this.emitMatch
    const semis = Math.abs(played - ref)
    // Octave-equivalent closeness (pitch class) too, so an octave slip is "near".
    const pc = Math.min((played - ref + 1200) % 12, (ref - played + 1200) % 12)
    if (semis <= 2 || pc <= 2) return this.emitNear
    return this.emitFar
  }

  // Forward step: predict (transition) then update (emission), then normalize.
  // Returns the MAP estimate and diagnostics for the visualizer.
  step(played: number): HmmResult {
    const N = this.N
    const prior = this.belief
    const pred = new Array(N).fill(0)

    // ── Predict: spread each state's mass through the error-aware transitions ──
    for (let i = 0; i < N; i++) {
      const m = prior[i]
      if (m <= 0) continue
      // self
      pred[i] += m * this.wSelf
      // step +1
      if (i + 1 < N) pred[i + 1] += m * this.wStep
      else pred[i] += m * this.wStep // absorb at the end
      // skip +2 / +3
      if (i + 2 < N) pred[i + 2] += m * this.wSkip2
      else pred[Math.min(i + 2, N - 1)] += m * this.wSkip2
      if (i + 3 < N) pred[i + 3] += m * this.wSkip3
      else pred[Math.min(i + 3, N - 1)] += m * this.wSkip3
      // back -1 (repeat / restart)
      if (i - 1 >= 0) pred[i - 1] += m * this.wBack
      else pred[i] += m * this.wBack
    }

    // ── Update: multiply by emission likelihood ───────────────────────────────
    let sum = 0
    for (let j = 0; j < N; j++) {
      pred[j] *= this.emission(played, j)
      sum += pred[j]
    }

    // ── Normalize (guard against total collapse) ──────────────────────────────
    if (sum <= 1e-12) {
      // Degenerate: keep prior to avoid NaN. (Shouldn't happen given nonzero floor.)
      this.belief = prior.slice()
    } else {
      for (let j = 0; j < N; j++) pred[j] /= sum
      this.belief = pred
    }

    // ── MAP + diagnostics ─────────────────────────────────────────────────────
    let map = 0
    let peak = 0
    for (let j = 0; j < N; j++) {
      if (this.belief[j] > peak) { peak = this.belief[j]; map = j }
    }

    // Normalized Shannon entropy as an uncertainty readout.
    let H = 0
    for (let j = 0; j < N; j++) {
      const p = this.belief[j]
      if (p > 1e-9) H -= p * Math.log(p)
    }
    const Hmax = Math.log(N)
    const entropy = Hmax > 0 ? H / Hmax : 0

    return {
      map,
      belief: this.belief.slice(),
      entropy,
      confidence: peak,
    }
  }

  get map(): number {
    let map = 0
    let peak = 0
    for (let j = 0; j < this.N; j++) {
      if (this.belief[j] > peak) { peak = this.belief[j]; map = j }
    }
    return map
  }

  get beliefVector(): number[] { return this.belief.slice() }
}
