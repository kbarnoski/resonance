// ─────────────────────────────────────────────────────────────────────────────
// 5816-astrolabe · the seeded auto-demo
//
// The 06:30 reviewer opens the page on a silent phone and just watches. So the
// beam must play itself: a seeded, stepwise melodic walk across the pitch-stars
// that lights and sounds them in sequence. It reads the whole concept — tilt to
// aim, cross a star, it rings — with zero interaction and even with sound off
// (each visited star pulses as the reticle arrives).
//
// The walk is generated once from a fixed-seed mulberry32 and favours small
// intervals (adjacent scale degrees, neighbouring octave-rings) so it sings
// rather than leaps. Any live user input (tilt / mouse / keys) supersedes it in
// the beam controller — this only drives the idle auto-performance.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./rng";
import { RINGS, DEGREES, type Star } from "./starmap";

const STEP_MS = 1350; // dwell per note
const SEQ_LEN = 28;

/** Star array index for a (ring, degree) — layout builds in ring-major order. */
function indexOf(ring: number, degree: number): number {
  return ring * DEGREES + degree;
}

export class DemoConductor {
  private seq: number[]; // star indices
  private yaws: number[];
  private pitches: number[];

  constructor(stars: Star[]) {
    const rng = mulberry32(0x5816);
    // precompute yaw/pitch of every star
    this.yaws = stars.map((s) => Math.atan2(s.dir[0], s.dir[2]));
    this.pitches = stars.map((s) => Math.asin(Math.max(-1, Math.min(1, s.dir[1]))));

    const seq: number[] = [];
    let ring = 1;
    let degree = 0;
    for (let i = 0; i < SEQ_LEN; i++) {
      seq.push(indexOf(ring, degree));
      // mostly step by one scale degree; occasionally shift octave-ring
      const r = rng();
      if (r < 0.62) {
        degree += rng() < 0.5 ? 1 : -1;
      } else if (r < 0.82) {
        degree += rng() < 0.5 ? 2 : -2;
      } else {
        ring += rng() < 0.5 ? 1 : -1;
      }
      // wrap degree around the ring; clamp ring into range
      degree = ((degree % DEGREES) + DEGREES) % DEGREES;
      if (ring < 0) ring = 1;
      if (ring > RINGS - 1) ring = RINGS - 2;
    }
    this.seq = seq;
  }

  /** Current target star index for a given elapsed-since-start (ms). */
  targetIndex(elapsedMs: number): number {
    const step = Math.floor(elapsedMs / STEP_MS);
    return this.seq[((step % SEQ_LEN) + SEQ_LEN) % SEQ_LEN];
  }

  /** Current beam target (yaw/pitch) for the auto-demo. */
  target(elapsedMs: number): { yaw: number; pitch: number } {
    const idx = this.targetIndex(elapsedMs);
    return { yaw: this.yaws[idx], pitch: this.pitches[idx] };
  }
}
