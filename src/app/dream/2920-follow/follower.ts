// Online forward-path DTW score follower — the heart of the piece.
//
// The reference melody is sampled into a pitch contour (see reference.ts). As
// live pitch frames arrive, we align them to that contour with a BANDED,
// MONOTONE cost recursion:
//
//     D'[j] = localCost(j) + min( D[j], D[j-1], D[j-2] )
//
// evaluated only over a sliding band of reference frames around the current
// head. The head is the argmin of the accumulated cost in the band; it advances
// when the singer moves forward, WAITS when the singer holds or pauses (silence
// simply doesn't advance it), and CATCHES UP when the singer leaps ahead. The
// reported position is driven entirely by this DTW head — never a wall clock.
//
// Inspired by Simon Dixon's MATCH online DTW, Dannenberg's 1984 computer
// accompaniment, and modern score-followers (Matchmaker, The ACCompanion).

import type { RefFrame } from "./reference";
import { FRAMES_PER_BEAT } from "./reference";

export interface FollowState {
  headFrame: number; // fractional reference-frame index
  headBeat: number; // headFrame / FRAMES_PER_BEAT
  bpm: number; // smoothed live tempo (display / arp only)
  confidence: number; // 0..1, how well the live pitch matches the score here
  waiting: boolean; // true when the singer is silent / holding
}

const INF = 1e9;

/** Octave-folded semitone distance with a small penalty for octave transposition
 *  (so a singer an octave off still tracks, but the true octave is preferred). */
function localCost(live: number, ref: number): number {
  let best = Infinity;
  for (let k = -1; k <= 1; k++) {
    const dist = Math.abs(live - (ref + 12 * k)) + (k === 0 ? 0 : 1.6);
    if (dist < best) best = dist;
  }
  return best * best;
}

export class ScoreFollower {
  private readonly n: number;
  private D: Float64Array;
  private head = 0; // fractional head for smooth display
  private headInt = 0; // integer DTW head
  private started = false;

  // Tempo estimation via head-beat crossings vs. wall clock.
  private lastBeatSample = 0;
  private lastBeatMs = 0;
  private bpm = 0;
  private conf = 0;

  constructor(
    private readonly contour: RefFrame[],
    private readonly bandBack = 6,
    private readonly bandFwd = 22,
  ) {
    this.n = contour.length;
    this.D = new Float64Array(this.n).fill(INF);
  }

  reset(): void {
    this.D.fill(INF);
    this.head = 0;
    this.headInt = 0;
    this.started = false;
    this.lastBeatSample = 0;
    this.lastBeatMs = 0;
    this.bpm = 0;
    this.conf = 0;
  }

  private state(waiting: boolean): FollowState {
    return {
      headFrame: this.head,
      headBeat: this.head / FRAMES_PER_BEAT,
      bpm: this.bpm,
      confidence: this.conf,
      waiting,
    };
  }

  /** Feed one live pitch frame (MIDI float, or null for silence). */
  step(liveMidi: number | null, nowMs: number): FollowState {
    // Silence: hold position, let confidence relax. This is what makes the
    // accompaniment WAIT through a rubato pause — the head simply doesn't move.
    if (liveMidi === null) {
      this.conf *= 0.9;
      return this.state(true);
    }

    const lo = Math.max(0, this.headInt - this.bandBack);
    const hi = Math.min(this.n - 1, this.headInt + this.bandFwd);

    const next = new Float64Array(this.n).fill(INF);

    if (!this.started) {
      // Seed: first voiced frame may match anywhere in the opening band.
      for (let j = lo; j <= hi; j++) next[j] = localCost(liveMidi, this.contour[j].midi);
      this.started = true;
    } else {
      for (let j = lo; j <= hi; j++) {
        const a = this.D[j];
        const b = j >= 1 ? this.D[j - 1] : INF;
        const c = j >= 2 ? this.D[j - 2] : INF;
        const prevMin = Math.min(a, b, c);
        if (prevMin >= INF) continue;
        next[j] = localCost(liveMidi, this.contour[j].midi) + prevMin;
      }
    }

    // Find best (argmin) and normalize the band by its minimum so accumulated
    // cost stays bounded over a long performance.
    let bestJ = lo;
    let bestVal = Infinity;
    for (let j = lo; j <= hi; j++) {
      if (next[j] < bestVal) {
        bestVal = next[j];
        bestJ = j;
      }
    }
    if (!isFinite(bestVal)) {
      // No usable path in band — keep the old head, low confidence.
      this.conf *= 0.8;
      this.D = next;
      return this.state(false);
    }
    for (let j = lo; j <= hi; j++) {
      if (next[j] < INF) next[j] -= bestVal;
    }
    this.D = next;

    // Monotone forward head: advance to the argmin, never step backward.
    const target = Math.max(this.headInt, bestJ);
    // Smooth the fractional head toward the integer target for a fluid playhead.
    this.head += (target - this.head) * 0.45;
    this.headInt = target;

    // Confidence from the raw local match at the head (independent of history).
    const localAtHead = localCost(liveMidi, this.contour[this.headInt].midi);
    const instConf = Math.max(0, 1 - localAtHead / 6);
    this.conf += (instConf - this.conf) * 0.3;

    // Live tempo from head-beat crossings (display + arp rate only).
    const beat = this.head / FRAMES_PER_BEAT;
    if (this.lastBeatMs === 0) {
      this.lastBeatMs = nowMs;
      this.lastBeatSample = beat;
    } else if (beat - this.lastBeatSample >= 0.5) {
      const dBeat = beat - this.lastBeatSample;
      const dSec = (nowMs - this.lastBeatMs) / 1000;
      if (dSec > 0.02) {
        const inst = (dBeat / dSec) * 60;
        const clamped = Math.max(30, Math.min(180, inst));
        this.bpm = this.bpm === 0 ? clamped : this.bpm + (clamped - this.bpm) * 0.4;
      }
      this.lastBeatMs = nowMs;
      this.lastBeatSample = beat;
    }

    return this.state(false);
  }
}
