// The magic: a no-buttons live looper. We record the TIMING of the child's
// beats over a rolling window, lightly quantize to an inferred tempo, and loop
// the rhythm back continuously so the child has a steady pulse to lock onto.
//
// This is the interaction model of a TR-808 / loop-station ("record your
// rhythm, it plays back and you layer more"), but the loop *is* a growing
// garden. We loop rhythm only — no pitch, no melody.

export interface LoopBeat {
  // Position within the loop, 0..1 (fraction of the loop length).
  pos: number;
  velocity: number;
  centroid: number;
}

export interface LooperState {
  beats: LoopBeat[];
  loopMs: number; // loop length in ms
}

const WINDOW_MS = 7000; // rolling memory window (~7s)
const MIN_LOOP_MS = 1200;
const MAX_LOOP_MS = 7000;
const QUANTIZE_DIV = 8; // light quantize to 1/8 grid of the loop

export class Looper {
  // Raw recent hits (absolute time, ms).
  private raw: { t: number; velocity: number; centroid: number }[] = [];
  private state: LooperState = { beats: [], loopMs: MIN_LOOP_MS };

  /** Record a fresh onset (absolute time in ms from performance.now()). */
  add(t: number, velocity: number, centroid: number) {
    this.raw.push({ t, velocity, centroid });
    // Drop hits older than the window.
    const cutoff = t - WINDOW_MS;
    while (this.raw.length && this.raw[0].t < cutoff) this.raw.shift();
    this.recompute(t);
  }

  /** Expire stale hits even when nothing new arrives. */
  tick(now: number) {
    const cutoff = now - WINDOW_MS;
    let changed = false;
    while (this.raw.length && this.raw[0].t < cutoff) {
      this.raw.shift();
      changed = true;
    }
    if (changed) this.recompute(now);
  }

  getState(): LooperState {
    return this.state;
  }

  /** Do we have enough to loop yet? (need a few beats) */
  get active(): boolean {
    return this.state.beats.length >= 3;
  }

  private recompute(now: number) {
    if (this.raw.length < 3) {
      this.state = { beats: [], loopMs: this.state.loopMs };
      return;
    }

    // Infer a tempo from the median inter-onset interval.
    const intervals: number[] = [];
    for (let i = 1; i < this.raw.length; i++) {
      intervals.push(this.raw[i].t - this.raw[i - 1].t);
    }
    intervals.sort((a, b) => a - b);
    const medianIoi = intervals[Math.floor(intervals.length / 2)] || 600;

    // Loop length: span the recent hits, fold to a sensible multiple of the
    // median beat so a steady clap makes a tidy loop.
    const span = this.raw[this.raw.length - 1].t - this.raw[0].t;
    let loopMs = Math.max(span + medianIoi, medianIoi * 4);
    loopMs = Math.min(MAX_LOOP_MS, Math.max(MIN_LOOP_MS, loopMs));

    // Map each raw hit into loop position, lightly quantized.
    const t0 = this.raw[0].t;
    const beats: LoopBeat[] = this.raw.map((h) => {
      let pos = ((h.t - t0) % loopMs) / loopMs; // 0..1
      // Light quantize toward the nearest grid line (blend, don't snap hard).
      const grid = Math.round(pos * QUANTIZE_DIV) / QUANTIZE_DIV;
      pos = pos * 0.4 + grid * 0.6;
      return { pos, velocity: h.velocity, centroid: h.centroid };
    });

    this.state = { beats, loopMs };
    void now;
  }
}
