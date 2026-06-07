// dtw.ts — Online (streaming) Dynamic Time Warping score follower.
//
// Implements forward/online DTW in the spirit of Simon Dixon's MATCH (2005):
// rather than building the full N×M cost matrix offline, we grow the alignment
// path one note at a time as live notes arrive, within a bounded search window.
//
// On each incoming played pitch we:
//   1) compute a local cost for matching that pitch against reference cells
//      inside a bounded window ahead of the last committed column,
//   2) extend the accumulated-cost frontier with the classic DTW recurrence
//      D(i,j) = cost(i,j) + min( D(i-1,j), D(i,j-1), D(i-1,j-1) ),
//   3) commit the reference column with the lowest accumulated cost in the
//      window (never moving backward),
//   4) derive local tempo from the SLOPE of the warping path over recent cells.
//
// The committed (row, col) cells form the warping path that the GPU draws.
// Additionally, this module tracks the soloist's expressive parameters —
// velocity/dynamics and articulation ratio — so audio can couple to them.

import type { ScoreNote } from "./score"

// ─── Cost between a played pitch and a reference note ────────────────────────
// Pitch-class aware: exact match is 0, octave errors are cheap.
function pitchCost(played: number, ref: number): number {
  if (played === ref) return 0
  const dPc = Math.min((played - ref + 1200) % 12, (ref - played + 1200) % 12)
  const dOct = Math.abs(Math.round((played - ref) / 12))
  return dPc * 1.0 + dOct * 0.25
}

export interface PathCell {
  row: number // live note index
  col: number // committed reference index
}

export interface FollowResult {
  col: number          // committed reference column after this note
  slope: number        // local path slope (ref cols per live row), tempo proxy
  windowLo: number     // bounded search window lower bound (ref col)
  windowHi: number     // bounded search window upper bound (ref col)
  cost: number         // accumulated cost at committed cell
  confident: boolean   // whether the match cost is low
  // Expressive parameters:
  smoothedVelocity: number    // EMA-smoothed soloist velocity (0–127)
  smoothedArticulation: number // EMA-smoothed IOI ratio (0–1, legato→staccato)
}

export class OnlineDTW {
  private ref: ScoreNote[]
  private windowRadius: number
  // Accumulated cost across the reference columns at the current frontier row.
  private acc: number[]
  private prevAcc: number[]
  private committedCol = -1
  private row = -1
  readonly path: PathCell[] = []

  // Smoothed expressive parameters (EMA).
  private _smoothedVelocity = 64
  private _smoothedArticulation = 0.7  // start legato-ish
  private _lastOnsetMs = 0

  constructor(ref: ScoreNote[], windowRadius = 5) {
    this.ref = ref
    this.windowRadius = windowRadius
    this.acc = new Array(ref.length).fill(Infinity)
    this.prevAcc = new Array(ref.length).fill(Infinity)
  }

  reset(): void {
    this.acc.fill(Infinity)
    this.prevAcc.fill(Infinity)
    this.committedCol = -1
    this.row = -1
    this.path.length = 0
    this._smoothedVelocity = 64
    this._smoothedArticulation = 0.7
    this._lastOnsetMs = 0
  }

  // Feed one live played note. Returns the new committed alignment + tempo + expression.
  // velocity: 0–127. durationMs: actual held time in ms (0 if unknown). nowMs: wall clock.
  step(
    playedMidi: number,
    velocity: number,
    durationMs: number,
    nowMs: number,
  ): FollowResult {
    const M = this.ref.length
    this.row += 1

    // ── Update expressive EMA tracking ────────────────────────────────────────
    // Dynamics: smooth velocity with α=0.35 so it breathes, not jitters.
    this._smoothedVelocity = this._smoothedVelocity * 0.65 + velocity * 0.35

    // Articulation: ratio of duration to inter-onset-interval.
    // Low ratio (short held / long IOI) = staccato. High = legato.
    const ioiMs = this._lastOnsetMs > 0 ? nowMs - this._lastOnsetMs : 500
    this._lastOnsetMs = nowMs
    let articulationRatio = 0.7
    if (durationMs > 0 && ioiMs > 0) {
      articulationRatio = Math.max(0.05, Math.min(1.0, durationMs / Math.max(ioiMs, 80)))
    }
    // Smooth articulation with a slower α so phrase changes read clearly.
    this._smoothedArticulation = this._smoothedArticulation * 0.7 + articulationRatio * 0.3

    // ── Online DTW step ────────────────────────────────────────────────────────
    // Bounded window: search ahead of last committed column.
    const lo = Math.max(0, this.committedCol)
    const hi = Math.min(M - 1, this.committedCol + this.windowRadius)

    // Roll the frontier.
    this.prevAcc = this.acc
    this.acc = new Array(M).fill(Infinity)

    let bestCol = lo
    let bestCost = Infinity

    for (let j = lo; j <= hi; j++) {
      const c = pitchCost(playedMidi, this.ref[j].midi)
      // Three-predecessor recurrence.
      const diag = j > 0 ? this.prevAcc[j - 1] : (this.row === 0 ? 0 : Infinity)
      const up   = this.prevAcc[j]
      const left = j > 0 ? this.acc[j - 1] : Infinity
      let best = Math.min(diag, up, left)
      if (!isFinite(best)) best = this.row === 0 ? 0 : c
      const total = c + best
      this.acc[j] = total
      if (total < bestCost) {
        bestCost = total
        bestCol = j
      }
    }

    // Commit forward-only.
    this.committedCol = Math.max(this.committedCol, bestCol)
    this.path.push({ row: this.row, col: this.committedCol })

    const slope = this.computeSlope()
    const localCost = pitchCost(playedMidi, this.ref[this.committedCol].midi)

    return {
      col: this.committedCol,
      slope,
      windowLo: lo,
      windowHi: hi,
      cost: bestCost,
      confident: localCost < 0.5,
      smoothedVelocity: this._smoothedVelocity,
      smoothedArticulation: this._smoothedArticulation,
    }
  }

  // Slope of the path over the last few committed cells.
  // ~1.0 = in step; >1 = rushing; <1 = dragging.
  private computeSlope(): number {
    const p = this.path
    if (p.length < 2) return 1
    const span = Math.min(4, p.length - 1)
    const a = p[p.length - 1 - span]
    const b = p[p.length - 1]
    const dRow = b.row - a.row
    const dCol = b.col - a.col
    if (dRow <= 0) return 1
    const raw = dCol / dRow
    return 0.4 + 0.6 * raw
  }

  get smoothedVelocity(): number { return this._smoothedVelocity }
  get smoothedArticulation(): number { return this._smoothedArticulation }
}
