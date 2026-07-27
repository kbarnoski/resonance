// ─────────────────────────────────────────────────────────────────────────────
// 3200-downbeat · pll.ts
//
//   A phase-locked-loop tempo tracker + a seeded auto-conductor.
//
//   The conductor gives BEATS (space-bar taps, phone tilt, or the seeded demo).
//   From the inter-beat intervals this estimates the current tempo (period) and
//   locks the beat-phase, then exposes a continuous GRID — gridTimeOf(index) —
//   that the ensemble scheduler plays on. The loop deliberately SMOOTHS: the
//   period follows the human with a low gain, so a sudden rush or drag makes the
//   ensemble's grid lag behind the conductor. That lag is the whole point — you
//   can feel yourself fighting the groove.
//
//   Everything here is pure TypeScript (no DOM, no Web Audio, no globals) so the
//   same code drives the browser and a headless timing test. Time is always an
//   AudioContext-style seconds clock passed in by the caller.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — the lab forbids Math.random. */
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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Tempo bounds: ~46 → ~176 bpm.
export const P_MIN = 0.34;
export const P_MAX = 1.3;

// Loop gains. Low period gain = the smoothing that makes rushing visibly lag.
const PERIOD_GAIN = 0.14;
const PHASE_GAIN = 0.13;

export interface Conductor {
  /** Seconds per beat — the smoothed tempo the ensemble plays on. */
  period: number;
  /** The conductor's raw most-recent inter-beat interval (for the wheel). */
  instPeriod: number;
  /** Audio time of beat index `anchorIndex`; the grid is anchor + k·period. */
  anchorTime: number;
  anchorIndex: number;
  /** Audio time of the previous tap, or -1 before the first tap. */
  lastTapTime: number;
  tapCount: number;
  /** Last signed phase error (seconds): tap − nearest grid beat. */
  phaseError: number;
  /** 0…1 steadiness estimate — high when the human keeps clear, even time. */
  confidence: number;
  ibiHistory: number[];
}

export function makeConductor(period = 0.6, startTime = 0): Conductor {
  return {
    period,
    instPeriod: period,
    anchorTime: startTime,
    anchorIndex: 0,
    lastTapTime: -1,
    tapCount: 0,
    phaseError: 0,
    confidence: 0,
    ibiHistory: [],
  };
}

/** Audio time of an (integer or fractional) beat index on the current grid. */
export function gridTimeOf(c: Conductor, beatIndex: number): number {
  return c.anchorTime + (beatIndex - c.anchorIndex) * c.period;
}

/** Re-anchor the grid to `index` without moving it — keeps the phase-lever
 *  short so period changes only bend the NEAR future, not distant beats. */
export function reanchor(c: Conductor, index: number): void {
  c.anchorTime = gridTimeOf(c, index);
  c.anchorIndex = index;
}

/** Register one conductor beat at audio time `t`; update tempo + phase. */
export function applyTap(c: Conductor, t: number): void {
  if (c.lastTapTime >= 0) {
    const ibi = t - c.lastTapTime;
    if (ibi >= P_MIN * 0.9 && ibi <= P_MAX * 1.1) {
      c.instPeriod = ibi;
      c.ibiHistory.push(ibi);
      if (c.ibiHistory.length > 6) c.ibiHistory.shift();
      const clamped = Math.min(P_MAX, Math.max(P_MIN, ibi));
      // Smoothed period follow — the lag that makes rushing feel like fighting.
      c.period = c.period + PERIOD_GAIN * (clamped - c.period);
    }
  }

  // Phase: pull the grid toward the tap by a fraction of the error.
  const k = Math.round((t - c.anchorTime) / c.period);
  const predicted = c.anchorTime + k * c.period;
  const err = t - predicted;
  c.phaseError = err;
  c.anchorTime += PHASE_GAIN * err;

  // Confidence: even inter-beat spacing AND taps landing near the grid.
  const n = c.ibiHistory.length;
  const jitter =
    n >= 2 ? Math.abs(c.ibiHistory[n - 1] - c.ibiHistory[n - 2]) : c.period;
  const target =
    clamp01(1 - Math.abs(err) / (0.35 * c.period)) *
    clamp01(1 - jitter / (0.3 * c.period));
  c.confidence += 0.25 * (target - c.confidence);

  c.lastTapTime = t;
  c.tapCount++;
}

/** Confidence bleeds toward 0 when the conductor goes quiet (loses the beat). */
export function decayConfidence(c: Conductor, t: number): void {
  if (c.lastTapTime < 0) return;
  const silence = t - c.lastTapTime;
  if (silence > c.period * 2.5) {
    c.confidence *= 0.94;
  }
}

// ── Seeded auto-conductor ────────────────────────────────────────────────────
// A virtual maestro that (1) holds steady time so the ensemble LOCKS, then
// (2) rushes and (3) drags so the "getting it wrong" flam is audible with no
// human. All humanising jitter comes from mulberry32 — never Math.random.

export const AUTO_CYCLE = 34; // seconds per full demonstration loop

export interface AutoConductor {
  rng: () => number;
  startTime: number;
  nextTapTime: number;
}

export function makeAuto(seed: number, startTime: number): AutoConductor {
  return {
    rng: mulberry32(seed),
    startTime,
    nextTapTime: startTime,
  };
}

/** The target beat period at a point in the demo cycle — a scripted arc:
 *  hold steady → rush (accelerate) → settle → drag (decelerate) → settle. */
export function autoPeriodAt(elapsed: number): number {
  const e = ((elapsed % AUTO_CYCLE) + AUTO_CYCLE) % AUTO_CYCLE;
  const steady = 0.6; // 100 bpm
  const lerp = (a: number, b: number, u: number) => a + (b - a) * clamp01(u);
  if (e < 9) return steady; // hold — ensemble locks tight
  if (e < 11) return steady; // brief hold before the mistake
  if (e < 17) return lerp(steady, 0.42, (e - 11) / 6); // RUSH → 143 bpm
  if (e < 20) return lerp(0.42, 0.56, (e - 17) / 3); // settle
  if (e < 27) return lerp(0.56, 0.84, (e - 20) / 7); // DRAG → 71 bpm
  if (e < 30) return lerp(0.84, 0.6, (e - 27) / 3); // settle
  return steady; // hold again
}

/** A short human label for where the demo is in its arc. */
export function autoPhaseLabel(elapsed: number): string {
  const e = ((elapsed % AUTO_CYCLE) + AUTO_CYCLE) % AUTO_CYCLE;
  if (e < 11) return "holding steady";
  if (e < 17) return "rushing — pushing ahead";
  if (e < 20) return "settling";
  if (e < 27) return "dragging — pulling back";
  return "settling";
}

/** Advance the auto-conductor to time `t`, returning any tap times that are
 *  now due (their intended audio time, usually 0 or 1 per call). */
export function stepAuto(auto: AutoConductor, t: number): number[] {
  const taps: number[] = [];
  let guard = 0;
  while (auto.nextTapTime <= t && guard < 8) {
    const tapTime = auto.nextTapTime;
    taps.push(tapTime);
    const elapsed = tapTime - auto.startTime;
    const base = autoPeriodAt(elapsed);
    // Tiny seeded humanising jitter — bigger through the mistakes.
    const e = ((elapsed % AUTO_CYCLE) + AUTO_CYCLE) % AUTO_CYCLE;
    const unsteady = e >= 11 && e < 30 ? 0.02 : 0.006;
    const jit = (auto.rng() - 0.5) * 2 * unsteady * base;
    auto.nextTapTime = tapTime + base + jit;
    guard++;
  }
  return taps;
}

/** Shortest signed phase difference a − b, folded to (−0.5, 0.5] of a beat. */
export function phaseGap(a: number, b: number): number {
  let d = a - b;
  d -= Math.round(d);
  return d;
}
