// tracking.ts — beat extraction from a conducting gesture + the irrational lock.
//
// Each hand's wrist vertical position is tracked over time. A "beat" (downbeat)
// is the bottom of a conducting stroke: a velocity zero-crossing from
// downward → upward motion (the apex at the bottom), debounced ~150 ms. The
// inter-beat interval averaged over the last few beats gives that hand's tempo.
//
// THE INCOMMENSURABILITY LOCK (the soul of the piece): voice A's tempo is the
// base. Voice B's tempo is NOT taken raw — it is snapped to base × an irrational
// ratio chosen from {√2, φ, e/2, π/2}, picking whichever irrational value is
// NEAREST to the ratio the conductor actually gestured. The human chooses
// roughly how far apart the two pulses sit; the system guarantees they are
// mathematically incommensurable and can never realign on a shared downbeat.

export interface IrrationalRatio {
  name: string;
  value: number;
}

export const IRRATIONAL_RATIOS: IrrationalRatio[] = [
  { name: "e/2", value: Math.E / 2 }, // 1.35914…
  { name: "√2", value: Math.SQRT2 }, // 1.41421…
  { name: "π/2", value: Math.PI / 2 }, // 1.57079…
  { name: "φ", value: 1.6180339887 }, // golden ratio
];

const DEBOUNCE_MS = 150;
const MIN_PERIOD_MS = 200; // fastest believable conducting beat
const MAX_PERIOD_MS = 1600; // slowest before we ignore it
const HISTORY = 3; // average inter-beat interval over the last N beats

// Snap a gestured ratio to the nearest irrational value in the set.
export function snapToIrrational(gesturedRatio: number): IrrationalRatio {
  // Fold ratios < 1 up so the lock always describes B relative to A as > 1.
  const r = gesturedRatio < 1 ? 1 / gesturedRatio : gesturedRatio;
  let best = IRRATIONAL_RATIOS[0];
  let bestDist = Infinity;
  for (const cand of IRRATIONAL_RATIOS) {
    const d = Math.abs(Math.log(cand.value) - Math.log(r));
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best;
}

// Per-hand conducting-stroke beat detector.
export class BeatTracker {
  private lastY: number | null = null;
  private lastVel = 0; // sign of recent vertical velocity (+down, -up)
  private lastBeatTime = 0;
  private intervals: number[] = [];
  // Public so the visual layer can pulse a "just hit a beat" indicator.
  lastBeatAt = 0;
  beatCount = 0;

  // Feed a normalized wrist y (0 top, 1 bottom) at time `nowMs`.
  // Returns the freshly measured beat period in seconds, or null if no beat.
  push(y: number, nowMs: number): number | null {
    if (this.lastY === null) {
      this.lastY = y;
      return null;
    }
    const dy = y - this.lastY; // +ve = moving down the screen
    this.lastY = y;

    // Smooth the velocity sign a touch to avoid jitter near the apex.
    const vel = dy;
    let beat: number | null = null;

    // Downbeat = bottom of the stroke: was moving DOWN, now moving UP.
    if (this.lastVel > 0.002 && vel < -0.002) {
      if (nowMs - this.lastBeatTime > DEBOUNCE_MS) {
        if (this.lastBeatTime > 0) {
          const interval = nowMs - this.lastBeatTime;
          if (interval >= MIN_PERIOD_MS && interval <= MAX_PERIOD_MS) {
            this.intervals.push(interval);
            if (this.intervals.length > HISTORY) this.intervals.shift();
            const avg =
              this.intervals.reduce((a, b) => a + b, 0) /
              this.intervals.length;
            beat = avg / 1000;
          }
        }
        this.lastBeatTime = nowMs;
        this.lastBeatAt = nowMs;
        this.beatCount += 1;
      }
    }

    if (Math.abs(vel) > 0.002) this.lastVel = vel;
    return beat;
  }

  reset(): void {
    this.lastY = null;
    this.lastVel = 0;
    this.lastBeatTime = 0;
    this.intervals = [];
  }
}
