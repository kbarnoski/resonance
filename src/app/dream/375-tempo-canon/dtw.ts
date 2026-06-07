// dtw.ts — Online (streaming) Dynamic Time Warping score follower.
//
// This is the engine that makes Tempo Canon distinct from its siblings. It
// implements forward/online DTW in the spirit of Simon Dixon's MATCH (2005):
// rather than building the full N×M cost matrix offline, we grow an alignment
// path one step at a time as live notes arrive, restricted to a bounded search
// window around the current frontier.
//
// On each incoming played pitch we:
//   1) compute a local cost of matching that pitch against reference cells
//      inside a bounded window ahead of the current committed column,
//   2) extend the accumulated-cost frontier with the classic DTW recurrence
//      D(i,j) = cost(i,j) + min( D(i-1,j), D(i,j-1), D(i-1,j-1) ),
//   3) commit the reference column with the lowest accumulated cost in the
//      window (the new score position),
//   4) derive local tempo from the SLOPE of the warping path: how many
//      reference columns advanced per live row over a short history. Slope > 1
//      => player is rushing; slope < 1 => dragging.
//
// The committed (row, col) cells form the warping path that the GPU draws.

import type { ScoreNote } from "./score"

// ─── Cost between a played pitch and a reference note ────────────────────────
// Pitch-class aware distance so octave slips are cheap; exact match is 0.
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
  confident: boolean   // whether the match cost was low
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
  }

  // Feed one live played pitch. Returns the new committed alignment + tempo.
  step(playedMidi: number): FollowResult {
    const M = this.ref.length
    this.row += 1

    // Bounded window: search a small band ahead of the last committed column.
    const lo = Math.max(0, this.committedCol)
    const hi = Math.min(M - 1, this.committedCol + this.windowRadius)

    // Roll the frontier: prevAcc holds the previous live row's accumulated cost.
    this.prevAcc = this.acc
    this.acc = new Array(M).fill(Infinity)

    let bestCol = lo
    let bestCost = Infinity

    for (let j = lo; j <= hi; j++) {
      const c = pitchCost(playedMidi, this.ref[j].midi)
      // DTW recurrence over the three predecessors, online form.
      const diag = j > 0 ? this.prevAcc[j - 1] : (this.row === 0 ? 0 : Infinity)
      const up   = this.prevAcc[j]                 // advance live, stay in ref
      const left = j > 0 ? this.acc[j - 1] : Infinity // advance ref, stay live
      let best = Math.min(diag, up, left)
      if (!isFinite(best)) best = this.row === 0 ? 0 : c // seed first row/col
      const total = c + best
      this.acc[j] = total
      if (total < bestCost) {
        bestCost = total
        bestCol = j
      }
    }

    // Commit forward-only: never move the score position backward.
    this.committedCol = Math.max(this.committedCol, bestCol)
    this.path.push({ row: this.row, col: this.committedCol })

    // Local tempo = slope of warping path over a short window of committed cells.
    const slope = this.computeSlope()
    // Confidence: low per-note match cost (cheap heuristic for HUD only).
    const localCost = pitchCost(playedMidi, this.ref[this.committedCol].midi)

    return {
      col: this.committedCol,
      slope,
      windowLo: lo,
      windowHi: hi,
      cost: bestCost,
      confident: localCost < 0.5,
    }
  }

  // Slope of the path: reference columns advanced per live note, over the last
  // few committed cells. ~1.0 = in step; >1 = rushing; <1 = dragging.
  private computeSlope(): number {
    const p = this.path
    if (p.length < 2) return 1
    const span = Math.min(4, p.length - 1)
    const a = p[p.length - 1 - span]
    const b = p[p.length - 1]
    const dRow = b.row - a.row
    const dCol = b.col - a.col
    if (dRow <= 0) return 1
    // Smooth toward 1 so a single repeated/held column doesn't read as a stop.
    const raw = dCol / dRow
    return 0.4 + 0.6 * raw + 0.0 // bias keeps slope readable, never zero
  }
}
