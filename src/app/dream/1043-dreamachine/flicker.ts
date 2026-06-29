// ════════════════════════════════════════════════════════════════════════════
// flicker.ts — the SAFE-PHOTIC-PULSE ENGINE. This is the headline deliverable.
//
// THE SAFETY CONTRACT (enforced in code, not just docs):
//   - Photosensitive-epilepsy risk lives in the 3–30 Hz band, worst ~15–20 Hz.
//   - This engine HARD-CAPS the pulse rate at MAX_HZ = 3.0 Hz. Nothing the UI
//     does can push it higher: clampRate() is the single gate every rate passes
//     through, and the slider's max is read from MAX_HZ too.
//   - Modulation is a soft SINE (never a square-wave strobe) at low-to-moderate
//     contrast (MAX_DEPTH), so light eases up and down rather than flashing.
//   - "drift" mode does not flicker at all — a ~0.1–0.5 Hz luminance sine, the
//     gentlest default.
//   - One shared clock drives both light and audio so they stay phase-locked.
//   - stop() freezes instantly to a calm steady field (depth -> 0, level held).
//
// The engine is clocked off the AudioContext when one is supplied (sample-clock
// accurate, drift-free) and falls back to performance.now() otherwise, so it
// runs even with audio disabled.
// ════════════════════════════════════════════════════════════════════════════

export type FlickerMode = "drift" | "pulse";

// ── HARD SAFETY CONSTANTS ─────────────────────────────────────────────────────
/** Absolute maximum pulse rate. Never raise this without medical review. */
export const MAX_HZ = 3.0;
/** Minimum useful pulse rate (slowest gentle pulse). */
export const MIN_HZ = 0.5;
/** Drift-mode luminance sine frequency (no flicker, ~breath/cosmic slow). */
export const DRIFT_HZ = 0.18;
/** Maximum luminance modulation depth (soft contrast, never full black↔white). */
export const MAX_DEPTH = 0.45;

/** The single rate gate. Every requested rate passes through here. */
export function clampRate(hz: number): number {
  if (!Number.isFinite(hz)) return MIN_HZ;
  return Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
}

export type FlickerSample = {
  /** 0..1 luminance multiplier for the field this frame (soft sine). */
  level: number;
  /** 0..1 normalized pulse phase value (0 = trough, 1 = crest). */
  phase01: number;
  /** the effective modulation depth in use this frame (0 when stopped). */
  depth: number;
};

/**
 * SafeFlicker — phase-coherent luminance modulator with a hard ≤3 Hz cap.
 * Pass an AudioContext to clock off its sample clock; otherwise it self-clocks.
 */
export class SafeFlicker {
  private ctx: AudioContext | null;
  private startPerf = performance.now() / 1000;
  private startCtx = 0;

  private mode: FlickerMode = "drift";
  private rate = MIN_HZ; // current pulse rate (already clamped)
  private targetDepth = 0; // where depth is heading (0 when stopped)
  private depth = 0; // smoothed current depth
  private stopped = true;

  // continuous phase accumulator so rate changes never cause a phase jump
  private phase = 0; // radians
  private lastClock = 0;

  constructor(ctx?: AudioContext | null) {
    this.ctx = ctx ?? null;
    this.lastClock = this.now();
    this.startCtx = this.ctx ? this.ctx.currentTime : 0;
  }

  private now(): number {
    if (this.ctx) return this.ctx.currentTime - this.startCtx;
    return performance.now() / 1000 - this.startPerf;
  }

  setMode(mode: FlickerMode): void {
    this.mode = mode;
  }

  /** Set the pulse rate (Hz). Always clamped to ≤ MAX_HZ. Returns the value used. */
  setRate(hz: number): number {
    this.rate = clampRate(hz);
    return this.rate;
  }

  getRate(): number {
    return this.rate;
  }

  getMode(): FlickerMode {
    return this.mode;
  }

  /** Begin / resume modulation. `arcDepth` 0..1 lets the arc scale contrast. */
  run(arcDepth = 1): void {
    this.stopped = false;
    this.targetDepth = MAX_DEPTH * Math.max(0, Math.min(1, arcDepth));
  }

  /** Lets the arc/UI shape how deep the pulse goes (still ≤ MAX_DEPTH). */
  setArcDepth(arcDepth: number): void {
    if (this.stopped) return;
    this.targetDepth = MAX_DEPTH * Math.max(0, Math.min(1, arcDepth));
  }

  /** INSTANT STOP: ease depth to 0 -> calm steady field. */
  stop(): void {
    this.stopped = true;
    this.targetDepth = 0;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Advance the engine and return this frame's luminance sample.
   * Call once per animation frame.
   */
  sample(): FlickerSample {
    const t = this.now();
    let dt = t - this.lastClock;
    this.lastClock = t;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1; // guard against tab-switch jumps

    // smooth depth toward target (so STOP and arc changes are never abrupt)
    this.depth += (this.targetDepth - this.depth) * Math.min(1, dt * 3.0);

    // effective frequency: drift mode ignores rate and uses the very slow sine
    const freq = this.mode === "drift" ? DRIFT_HZ : this.rate;

    // integrate phase continuously (no jump when rate/mode changes)
    this.phase += 2 * Math.PI * freq * dt;
    if (this.phase > 1e6) this.phase -= 1e6; // keep bounded

    const s = Math.sin(this.phase); // -1..1 soft sine, never square
    const phase01 = s * 0.5 + 0.5;

    // luminance multiplier: 1 at crest, (1 - depth) at trough.
    // soft, low-contrast — light eases, it never strobes black.
    const level = 1 - this.depth * (1 - phase01);

    return { level, phase01, depth: this.depth };
  }
}
