// ─────────────────────────────────────────────────────────────────────────────
// 4376 · Drag — pure logic (no React, no DOM, no Web Audio)
//
// Timing-domain helpers for the tempo-drift instrument: a seeded PRNG, the Chafe
// tempo-gravity law, an inter-onset-interval tempo tracker, and a seeded virtual
// player used by the headless demo. Nothing here reads the wall clock — callers
// pass in monotonic times (performance.now / AudioContext.currentTime).
// ─────────────────────────────────────────────────────────────────────────────

export const EPT_MS = 11.5; // Chafe "ensemble performance threshold", one-way ms
export const ONEWAY_MIN = 5; // narrowest canyon (ms, one-way)
export const ONEWAY_MAX = 500; // widest canyon (ms, one-way)
export const TARGET_MIN = 60; // target-tempo slider bounds (BPM)
export const TARGET_MAX = 160;
export const MAX_DRIFT = 24; // full-scale drift on the gauge (± BPM)
export const LOCK_TOL = 3; // hold within ± this many BPM to lock
export const LOCK_BEATS = 4; // for this many target beats

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// mulberry32 — deterministic, seeded. No Math.random / Date anywhere in this file.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The Chafe result, as a legible pull field: how many BPM the tempo is dragged
// off target at a given one-way delay. SHORT delay (< EPT) → the gap feels empty,
// each player rushes to fill it → POSITIVE (sharp). LONG delay → each waits for
// the other → NEGATIVE (flat). Zero at the ~11.5 ms sweet spot.
export function driftTargetBpm(oneWayMs: number): number {
  const raw = (26 * (EPT_MS - oneWayMs)) / (oneWayMs + EPT_MS);
  return clamp(raw, -20, 20);
}

// Canyon width in SVG px — log-spaced so the near-sweet-spot region reads.
export function canyonPx(oneWayMs: number): number {
  const t =
    (Math.log(oneWayMs) - Math.log(ONEWAY_MIN)) /
    (Math.log(ONEWAY_MAX) - Math.log(ONEWAY_MIN));
  return 90 + t * (820 - 90);
}

// D-major pentatonic — every tap is consonant, so timing is the only thing that
// can be "wrong". Home row A S D F triggers these; Space/pad uses the first.
export const NOTES: { key: string; freq: number; label: string }[] = [
  { key: "a", freq: 293.66, label: "D" }, // D4
  { key: "s", freq: 329.63, label: "E" }, // E4
  { key: "d", freq: 369.99, label: "F♯" }, // F#4
  { key: "f", freq: 440.0, label: "A" }, // A4
];
export const TAP_FREQ = NOTES[0].freq;

// A short melodic pattern the demo taps, so auto-mode is pleasant, not a monotone.
export const DEMO_PATTERN = [0, 2, 1, 3, 0, 1, 3, 2];

// ── Inter-onset-interval tempo tracker ──────────────────────────────────────
// Fed raw onset timestamps (ms). Keeps an EMA of the inter-tap interval and
// derives instantaneous BPM + drift vs. target. This measures whatever the
// human (or demo) actually plays — it never snaps to a grid.
export class TempoTracker {
  private last = -1;
  private ioiEma = -1;
  bpm = 0;
  drift = 0;
  lastTapMs = -1;

  push(nowMs: number, targetBpm: number): void {
    if (this.last > 0) {
      const ioi = nowMs - this.last;
      if (ioi > 120 && ioi < 2500) {
        this.ioiEma = this.ioiEma < 0 ? ioi : this.ioiEma + 0.4 * (ioi - this.ioiEma);
        this.bpm = 60000 / this.ioiEma;
        this.drift = this.bpm - targetBpm;
      }
    }
    this.last = nowMs;
    this.lastTapMs = nowMs;
  }

  reset(): void {
    this.last = -1;
    this.ioiEma = -1;
    this.bpm = 0;
    this.drift = 0;
    this.lastTapMs = -1;
  }
}

// ── Seeded virtual player (headless demo) ────────────────────────────────────
// Taps a pulse whose tempo is pulled off target by the Chafe field for the
// current canyon, plus seeded wobble. Under a narrow canyon it rides sharp;
// under a wide canyon it drags flat — the whole idea reads with zero input.
export class DemoPlayer {
  private rng: () => number;
  private driftState = 0;
  private nextTapMs = -1;
  private patIdx = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed);
  }

  // Emits due taps since the last call via `onTap(scheduledMs, noteIndex)`.
  step(
    nowMs: number,
    targetBpm: number,
    oneWayMs: number,
    onTap: (scheduledMs: number, noteIndex: number) => void,
  ): void {
    if (this.nextTapMs < 0) this.nextTapMs = nowMs;
    let guard = 0;
    while (nowMs >= this.nextTapMs && guard < 4) {
      const tapMs = this.nextTapMs;
      const note = DEMO_PATTERN[this.patIdx % DEMO_PATTERN.length];
      this.patIdx++;
      onTap(tapMs, note);

      const pull = driftTargetBpm(oneWayMs);
      this.driftState += 0.16 * (pull - this.driftState) + (this.rng() * 2 - 1) * 1.3;
      this.driftState = clamp(this.driftState, -MAX_DRIFT, MAX_DRIFT);
      const bpm = clamp(targetBpm + this.driftState, 45, 235);
      this.nextTapMs += 60000 / bpm;
      guard++;
    }
  }

  reset(nowMs: number): void {
    this.driftState = 0;
    this.nextTapMs = nowMs;
    this.patIdx = 0;
  }
}
