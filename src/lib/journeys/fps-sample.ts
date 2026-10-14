/**
 * FPS SAMPLES for the kiosk flight log (2026-10-13 — the 120 fps law: "every
 * journey's real 120 fps certified from the kiosk itself, not the noisy lab").
 * The recorder's existing rAF tick feeds every frame interval in; every
 * WINDOW_MS this hands back one summary — no GPU readbacks, no allocations
 * per frame, a handful of arithmetic ops per frame.
 *
 *   avg    frames / seconds over the window (the presented frame rate)
 *   min1s  the worst whole second inside it
 *   p99    the 99th-percentile frame interval (ms)
 *   slow   frames longer than 10 ms (a 120 Hz frame missed)
 */
export const FPS_WINDOW_MS = 20_000;

export interface FpsSummary { avg: number; min1s: number; p99: number; slow: number; frames: number; ms: number }

/** Interval histogram bins: 0.5 ms wide up to 50 ms (p99 resolution), one overflow bin. */
const BIN_MS = 0.5;
const BINS = 100;

export class FpsWindow {
  private start = -1;
  private frames = 0;
  private slow = 0;
  private secStart = -1;
  private secFrames = 0;
  private minSec = Infinity;
  private hist = new Uint32Array(BINS + 1);

  /** One presented frame `dt` ms after the previous, at time `now`. Returns a
   *  summary when the window closes, else null. */
  add(dt: number, now: number): FpsSummary | null {
    if (this.start < 0) { this.start = now; this.secStart = now; return null; }
    this.frames++;
    if (dt > 10) this.slow++;
    this.hist[Math.min(BINS, Math.floor(dt / BIN_MS))]++;
    this.secFrames++;
    if (now - this.secStart >= 1000) {
      this.minSec = Math.min(this.minSec, (this.secFrames * 1000) / (now - this.secStart));
      this.secStart = now;
      this.secFrames = 0;
    }
    const ms = now - this.start;
    if (ms < FPS_WINDOW_MS) return null;
    let p99 = BINS * BIN_MS, acc = 0;
    const target = this.frames * 0.99;
    for (let i = 0; i <= BINS; i++) { acc += this.hist[i]; if (acc >= target) { p99 = (i + 1) * BIN_MS; break; } }
    const out: FpsSummary = {
      avg: (this.frames * 1000) / ms,
      min1s: Number.isFinite(this.minSec) ? this.minSec : (this.frames * 1000) / ms,
      p99, slow: this.slow, frames: this.frames, ms,
    };
    this.reset(now);
    return out;
  }

  /** Start over from `now` (a hidden window / pause must not count as slow frames). */
  reset(now: number): void {
    this.start = now; this.secStart = now; this.frames = 0; this.slow = 0; this.secFrames = 0; this.minSec = Infinity; this.hist.fill(0);
  }
}

/** The flight-log line: "avg 119.8 min1s 117 p99 9.0ms slow 12/2391 <journey>@<t>". */
export function fpsSampleDetail(s: FpsSummary, journey: string | null, t: number | null): string {
  return `avg ${s.avg.toFixed(1)} min1s ${Math.round(s.min1s)} p99 ${s.p99.toFixed(1)}ms slow ${s.slow}/${s.frames}${journey ? ` ${journey}@${t != null ? Math.round(t) : "?"}` : ""}`;
}
