// ─────────────────────────────────────────────────────────────────────────────
// _shared/psych/safeFlicker.ts — the photosensitive-safe flicker engine.
//
//   SAFETY (non-negotiable, AGENT.md + PSYCHEDELIC.md): stroboscopic light
//   reliably evokes the Klüver form constants with NO drug — but it is also a
//   real photosensitive-epilepsy hazard. The most dangerous band is ~15–25 Hz
//   hard square-wave luminance flips. Every prototype that flickers MUST route
//   it through this engine, which guarantees:
//
//     • OFF by default — flicker is opt-in, never auto-on.
//     • Frequency hard-clamped to maxHz (default 3 Hz) — well below the
//       photosensitive danger band.
//     • A *soft* (sine) waveform with a luminance floor, never a hard 0↔1
//       square strobe — gentle drift, not a switch.
//     • Instant kill() — one call, flicker stops the same frame.
//     • prefers-reduced-motion is honored — enable() is downgraded to a slow
//       luminance drift, and the danger band is unreachable.
//
//   value(tSec) returns a luminance multiplier in [floor,1]. Multiply your
//   scene brightness by it. When disabled it returns 1.0 (perfectly steady).
//   No React; safe to instantiate in any render loop.
// ─────────────────────────────────────────────────────────────────────────────

export interface SafeFlickerOptions {
  /** Hard ceiling on flicker rate (Hz). Clamped into [0, 8]; default 3. */
  maxHz?: number;
  /** Initial rate when enabled (Hz). Clamped to [0, maxHz]; default 1.5. */
  defaultHz?: number;
  /** Lowest the luminance multiplier ever dips to (keeps it a drift, not a
   *  blackout strobe). [0,1]; default 0.55. */
  floor?: number;
  /** Honor prefers-reduced-motion (default true). When the user prefers reduced
   *  motion, flicker is forced to a sub-perceptual drift. */
  respectReducedMotion?: boolean;
}

/** True if the environment asks for reduced motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const ABS_MAX_HZ = 8; // a wall — no caller can request a dangerous rate.

export class SafeFlicker {
  readonly maxHz: number;
  readonly floor: number;
  private hz: number;
  private on = false;
  private reduced: boolean;

  constructor(opts: SafeFlickerOptions = {}) {
    this.maxHz = Math.min(ABS_MAX_HZ, Math.max(0, opts.maxHz ?? 3));
    this.floor = Math.min(1, Math.max(0, opts.floor ?? 0.55));
    const def = opts.defaultHz ?? 1.5;
    this.hz = Math.min(this.maxHz, Math.max(0, def));
    this.reduced = (opts.respectReducedMotion ?? true) ? prefersReducedMotion() : false;
  }

  /** Is flicker currently engaged? */
  get enabled(): boolean {
    return this.on;
  }

  /** Current (clamped) rate in Hz. */
  get rateHz(): number {
    return this.effectiveHz();
  }

  enable(): void {
    this.on = true;
  }
  disable(): void {
    this.on = false;
  }
  toggle(): void {
    this.on = !this.on;
  }
  /** Instant kill — stops flicker the same frame. */
  kill(): void {
    this.on = false;
  }

  /** Set the desired rate; always clamped to [0, maxHz]. */
  setHz(hz: number): void {
    this.hz = Math.min(this.maxHz, Math.max(0, hz));
  }

  private effectiveHz(): number {
    // Reduced-motion users get a slow sub-perceptual drift, never real flicker.
    if (this.reduced) return Math.min(this.hz, 0.2);
    return this.hz;
  }

  /** Luminance multiplier in [floor, 1] for absolute time `tSec`.
   *  Returns 1.0 (steady) when disabled. Soft sine, never a hard strobe. */
  value(tSec: number): number {
    if (!this.on) return 1;
    const f = this.effectiveHz();
    if (f <= 0) return 1;
    const s = 0.5 + 0.5 * Math.sin(6.28318530718 * f * tSec);
    return this.floor + (1 - this.floor) * s;
  }
}

export function createSafeFlicker(opts?: SafeFlickerOptions): SafeFlicker {
  return new SafeFlicker(opts);
}
