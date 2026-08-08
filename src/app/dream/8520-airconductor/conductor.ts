// 8520 · Air Conductor — gesture logic (no React, no DOM).
//
// Three pieces live here:
//   1. mulberry32           — seeded PRNG for the deterministic ghost.
//   2. GhostConductor       — a "phantom conductor" that drives invisible hand
//                             positions through a ~28s arc, throwing real
//                             down-flicks that the SAME beat detector catches.
//   3. BeatDetector         — a lightweight recognizer: a short ring buffer of
//                             the right wrist's vertical velocity, matched
//                             against a canonical downbeat template with a tiny
//                             DTW, gated by a robust velocity-peak + reversal
//                             detector (Gesture2Music-style, arXiv:2511.00793).

export const VOICE_COUNT = 7;

/** A single frame of conductor state, whatever the source. */
export interface ConductState {
  leftPresent: boolean;
  leftX: number;
  leftY: number; // 0 = top of frame, 1 = bottom
  rightPresent: boolean;
  rightX: number;
  rightY: number;
  pinch: number; // 0 = open/legato, 1 = tight/staccato
  source: "ghost" | "camera" | "pointer";
}

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Ghost conductor — deterministic self-demo
// ---------------------------------------------------------------------------
interface GhostBeat {
  at: number; // seconds into the loop
  section: number;
}

export class GhostConductor {
  private rand: () => number;
  private beats: GhostBeat[] = [];
  private loop = 28; // seconds
  private lastPhase = 0;
  private flickT = -10; // when the current down-flick started (seconds, loop time)

  constructor(seed = 0x8520) {
    this.rand = mulberry32(seed);
    this.buildScore();
  }

  /** Pre-roll a deterministic conducting score: swelling + section pointing +
   *  a sequence of downbeats spread across the ~28s arc. */
  private buildScore() {
    let t = 1.4;
    while (t < this.loop - 1) {
      const section = Math.floor(this.rand() * VOICE_COUNT);
      this.beats.push({ at: t, section });
      // Semi-random spacing — denser in the middle of the arc (the "climax").
      const mid = 1 - Math.abs(t / this.loop - 0.5) * 2; // 0..1 hump
      const gap = 1.9 - mid * 0.9 + this.rand() * 0.7;
      t += gap;
    }
  }

  /** Which section the phantom is currently pointing at (for foreground). */
  private sweepSection(phase: number): number {
    // Slow triangle sweep across the fan plus a little wobble.
    const tri = Math.abs(((phase * 1.3) % 2) - 1); // 0..1..0
    const wob = 0.06 * Math.sin(phase * Math.PI * 5.3);
    return Math.min(0.999, Math.max(0, tri + wob));
  }

  /** Advance the ghost and return a full conduct-state for this frame.
   *  `tSec` is monotonic seconds; internally wrapped into the loop. */
  update(tSec: number): ConductState {
    const phase = (tSec % this.loop) / this.loop; // 0..1
    const loopT = phase * this.loop;

    // Detect loop wrap → reset flick memory so beats re-fire next cycle.
    if (phase < this.lastPhase) this.flickT = -10;
    this.lastPhase = phase;

    // Fire the nearest upcoming beat's down-flick.
    for (const b of this.beats) {
      if (loopT >= b.at && loopT < b.at + 0.05 && this.flickT < b.at) {
        this.flickT = b.at;
      }
    }

    // Left hand HEIGHT → dynamics. Two overlapping swells give an organic
    // crescendo/decrescendo arc rather than a metronomic sine.
    const swell =
      0.5 +
      0.32 * Math.sin(phase * Math.PI * 2 - 0.6) +
      0.12 * Math.sin(phase * Math.PI * 6.1);
    const leftY = clamp01(0.82 - swell * 0.6); // higher swell → smaller y (raised)
    const leftX = 0.12 + 0.02 * Math.sin(tSec * 0.9);

    // Right hand X → foreground section (slow sweep).
    const rightX = this.sweepSection(phase);

    // Right hand Y → resting height plus a sharp downward flick when a beat
    // was just thrown. The flick is a quick down-then-settle the detector reads.
    const sinceFlick = loopT - this.flickT;
    let flick = 0;
    if (sinceFlick >= 0 && sinceFlick < 0.42) {
      const p = sinceFlick / 0.42;
      // Fast plunge (0→1) then ease back: a downbeat trajectory.
      flick = Math.sin(Math.min(1, p * 1.35) * Math.PI) * (1 - p * 0.25);
    }
    const rightY = clamp01(0.4 + flick * 0.34 + 0.03 * Math.sin(tSec * 1.7));

    // Pinch drifts slowly (articulation colour).
    const pinch = clamp01(0.45 + 0.4 * Math.sin(phase * Math.PI * 2 + 1.2));

    return {
      leftPresent: true,
      leftX,
      leftY,
      rightPresent: true,
      rightX,
      rightY,
      pinch,
      source: "ghost",
    };
  }
}

// ---------------------------------------------------------------------------
// Beat detector — DTW-gated velocity-peak + reversal
// ---------------------------------------------------------------------------

// Canonical downbeat velocity trajectory (normalized): a small preparatory
// lift (negative = upward), a strong plunge (positive = downward), then settle.
const DOWNBEAT_TEMPLATE = normalize([
  -0.18, -0.28, -0.12, 0.35, 0.82, 1.0, 0.74, 0.32, 0.02, -0.14,
]);

export class BeatDetector {
  private buf: number[] = [];
  private readonly cap = 14; // ~0.23s of velocity history at 60fps
  private prevY = 0.5;
  private haveY = false;
  private peak = 0; // running peak downward velocity since last reset
  private armed = false; // saw a strong downstroke, waiting for reversal
  private cooldownUntil = 0;
  private lastConfidence = 0;

  /** Feed the current right-wrist y (0..1, down = larger) and time (ms).
   *  Returns a positive strength in [0,1] on the frame a beat fires, else 0. */
  push(y: number, tMs: number, dtMs: number): number {
    if (!this.haveY) {
      this.prevY = y;
      this.haveY = true;
      return 0;
    }
    const dt = Math.max(0.008, dtMs / 1000);
    const vy = (y - this.prevY) / dt; // >0 means moving DOWN
    this.prevY = y;

    this.buf.push(vy);
    if (this.buf.length > this.cap) this.buf.shift();

    // Robust gate: track the downward peak, arm on a fast plunge, fire on the
    // reversal (the baton's "hit" point), throttled by a cooldown.
    const DOWN_ARM = 1.35; // normalized units / second
    const REVERSAL = 0.25;

    if (vy > this.peak) this.peak = vy;
    if (vy > DOWN_ARM) this.armed = true;

    let fired = 0;
    if (
      this.armed &&
      vy < REVERSAL && // velocity has collapsed → the plunge just settled
      tMs > this.cooldownUntil
    ) {
      // Confirm shape with a tiny DTW against the downbeat template.
      const conf = this.dtwConfidence();
      this.lastConfidence = conf;
      if (conf > 0.35 || this.peak > 2.4) {
        fired = clamp01(0.35 + Math.min(1, this.peak / 4) * 0.65);
        this.cooldownUntil = tMs + 320;
      }
      this.armed = false;
      this.peak = 0;
    }

    // Decay the armed state if the plunge never resolves.
    if (this.armed && vy < -0.2) {
      this.armed = false;
      this.peak = 0;
    }
    return fired;
  }

  get confidence(): number {
    return this.lastConfidence;
  }

  /** Tiny DTW distance between the recent normalized velocity window and the
   *  canonical downbeat template → confidence in [0,1]. */
  private dtwConfidence(): number {
    if (this.buf.length < 6) return 0;
    const win = normalize(this.buf.slice());
    const d = dtw(win, DOWNBEAT_TEMPLATE);
    // Map distance → confidence. Empirically ~0.5 is a good match, ~2.5 poor.
    return clamp01(1 - d / 2.2);
  }

  reset() {
    this.buf.length = 0;
    this.haveY = false;
    this.armed = false;
    this.peak = 0;
  }
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Peak-normalize a signal to roughly [-1,1] by its max absolute value. */
function normalize(a: number[]): number[] {
  let m = 1e-6;
  for (const v of a) m = Math.max(m, Math.abs(v));
  return a.map((v) => v / m);
}

/** Classic O(n·m) dynamic-time-warping distance between two 1-D sequences. */
function dtw(a: number[], b: number[]): number {
  const n = a.length;
  const m = b.length;
  const INF = 1e9;
  let prev = new Array<number>(m + 1).fill(INF);
  let cur = new Array<number>(m + 1).fill(INF);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur[0] = INF;
    for (let j = 1; j <= m; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      cur[j] = cost + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  // Normalize by path length so window/template sizing doesn't skew the score.
  return prev[m] / (n + m);
}
