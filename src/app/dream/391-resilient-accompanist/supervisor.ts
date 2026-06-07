// supervisor.ts — the confidence-gated dual follower (the lab-first feature).
//
// Runs the proven OnlineDTW (smooth, fast) and the ScoreHMM (robust to errors)
// in parallel and arbitrates between them with a HYSTERESIS gate on DTW's
// confidence:
//
//   • While DTW confidence stays HIGH, trust DTW — it gives the smoothest,
//     lowest-latency tracking when the soloist plays correctly.
//   • When DTW confidence DROPS below `loThresh` (a wrong-note run derails it),
//     hand control to the HMM, whose spread belief survives the mistake and keeps
//     a sane position estimate.
//   • When DTW confidence RECOVERS above `hiThresh` (> loThresh, hysteresis), hand
//     control back to DTW so it doesn't flap on a single clean note.
//
// The accompaniment position = whichever follower is currently trusted. We also
// emit `switchEvent` so the UI/audio can flag the exact moment of a handover.

import { OnlineDTW } from "./dtw"
import type { FollowResult } from "./dtw"
import { ScoreHMM } from "./hmm"
import type { HmmResult } from "./hmm"
import type { ScoreNote } from "./score"

export type Controller = "dtw" | "hmm"

export interface SupervisorResult {
  controller: Controller   // who is in control right now
  position: number         // trusted committed score position (drives accompaniment)
  dtw: FollowResult        // raw DTW result (for the DTW cursor + confidence band)
  hmm: HmmResult           // raw HMM result (for the HMM cursor + belief cloud)
  switchEvent: "to-hmm" | "to-dtw" | null // a handover happened on this step
}

export class DualFollower {
  private dtw: OnlineDTW
  private hmm: ScoreHMM
  private controller: Controller = "dtw"
  // Hysteresis thresholds on DTW confidence (0..1).
  private readonly loThresh: number
  private readonly hiThresh: number

  constructor(ref: ScoreNote[], windowRadius = 5, loThresh = 0.42, hiThresh = 0.7) {
    this.dtw = new OnlineDTW(ref, windowRadius)
    this.hmm = new ScoreHMM(ref)
    this.loThresh = loThresh
    this.hiThresh = hiThresh
  }

  reset(): void {
    this.dtw.reset()
    this.hmm.reset()
    this.controller = "dtw"
  }

  // Feed one played note to BOTH followers, then arbitrate.
  step(
    playedMidi: number,
    velocity: number,
    durationMs: number,
    nowMs: number,
  ): SupervisorResult {
    const dtwRes = this.dtw.step(playedMidi, velocity, durationMs, nowMs)
    const hmmRes = this.hmm.step(playedMidi)

    let switchEvent: "to-hmm" | "to-dtw" | null = null

    if (this.controller === "dtw") {
      // Drop to the robust HMM when DTW confidence collapses.
      if (dtwRes.confidence < this.loThresh) {
        this.controller = "hmm"
        switchEvent = "to-hmm"
      }
    } else {
      // Return to smooth DTW only once confidence clears the higher bar.
      if (dtwRes.confidence > this.hiThresh) {
        this.controller = "dtw"
        switchEvent = "to-dtw"
      }
    }

    const position = this.controller === "dtw" ? dtwRes.col : hmmRes.map

    return {
      controller: this.controller,
      position,
      dtw: dtwRes,
      hmm: hmmRes,
      switchEvent,
    }
  }

  // Accessors for the render loop (read-only snapshots).
  get dtwPath() { return this.dtw.path }
  get dtwConfidence() { return this.dtw.confidence }
  get smoothedVelocity() { return this.dtw.smoothedVelocity }
  get smoothedArticulation() { return this.dtw.smoothedArticulation }
  get currentController() { return this.controller }
  get hmmBelief() { return this.hmm.beliefVector }
  get hmmMap() { return this.hmm.map }
  get loThreshold() { return this.loThresh }
  get hiThreshold() { return this.hiThresh }
}
