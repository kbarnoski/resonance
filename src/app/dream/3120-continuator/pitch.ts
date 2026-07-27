// ─────────────────────────────────────────────────────────────────────────────
// pitch.ts — monophonic vocal pitch tracking + note segmentation for 3096.
//
//   • trackPitch(): normalised autocorrelation with parabolic peak interpolation
//     over a time-domain frame → continuous Hz (never snapped to a scale) plus a
//     clarity (periodicity) value and RMS. Voice-range gated (~80–500 Hz).
//   • NoteSegmenter: turns the ~60 fps stream of (hz, rms) readings into discrete
//     NoteEvents using pitch stability + an energy gate — a new note begins when
//     the pitch jumps past a tolerance or after a voiced gap; a note closes when
//     the voice goes quiet or moves on.
//   • Turn detection lives in the page: a silence gap > ~450 ms ends the human's
//     turn. The segmenter exposes the running silence duration to drive that.
// ─────────────────────────────────────────────────────────────────────────────

import { hzToCents, type NoteEvent } from './model';

const F0_MIN = 80;
const F0_MAX = 500;

export interface PitchResult {
  hz: number; // 0 when unvoiced
  clarity: number; // 0..1
  rms: number; // 0..1-ish
}

/** Estimate f0 from a time-domain frame via normalised autocorrelation with
 *  parabolic interpolation. Continuous Hz — never quantized to a scale. */
export function trackPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const n = buf.length;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / n);
  if (rms < 0.008) return { hz: 0, clarity: 0, rms };

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / F0_MIN));
  const minLag = Math.max(2, Math.floor(sampleRate / F0_MAX));

  let r0 = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    r0 += v * v;
  }
  if (r0 <= 0) return { hz: 0, clarity: 0, rms };

  let bestLag = -1;
  let bestVal = 0;
  let prev = 1;
  let descending = true;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      acc += (buf[i] - mean) * (buf[i + lag] - mean);
    }
    const norm = acc / r0;
    if (descending) {
      if (norm < prev) prev = norm;
      else descending = false;
    }
    if (!descending && norm > bestVal) {
      bestVal = norm;
      bestLag = lag;
    }
  }

  if (bestLag < 0 || bestVal < 0.55) return { hz: 0, clarity: bestVal, rms };

  // Parabolic interpolation around the peak for sub-sample lag precision.
  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = acAt(buf, mean, bestLag - 1) / r0;
    const y1 = bestVal;
    const y2 = acAt(buf, mean, bestLag + 1) / r0;
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-9) {
      refined = bestLag + (0.5 * (y0 - y2)) / denom;
    }
  }

  const hz = sampleRate / refined;
  if (hz < F0_MIN || hz > F0_MAX) return { hz: 0, clarity: bestVal, rms };
  return { hz, clarity: bestVal, rms };
}

function acAt(buf: Float32Array, mean: number, lag: number): number {
  let acc = 0;
  const lim = buf.length - lag;
  for (let i = 0; i < lim; i++) acc += (buf[i] - mean) * (buf[i + lag] - mean);
  return acc;
}

// ── note segmentation ─────────────────────────────────────────────────────────

const PITCH_TOL_CENTS = 75; // pitch move past this starts a new note
const MIN_NOTE_MS = 90; // ignore blips shorter than this
const RMS_GATE = 0.012; // below this = silence

interface PendingNote {
  centsSum: number;
  hzSum: number;
  frames: number;
  startMs: number;
  lastMs: number;
  centsAnchor: number;
}

/**
 * Streaming segmenter. Feed it every analysis frame; it emits NoteEvents as they
 * close and tracks the running silence gap so the page can detect end-of-turn.
 */
export class NoteSegmenter {
  private pending: PendingNote | null = null;
  private lastVoicedMs = 0;
  private silenceStartMs = 0;
  private started = false;

  /** Feed one frame. Returns a closed NoteEvent when a note just ended. */
  push(hz: number, rms: number, clarity: number, nowMs: number): NoteEvent | null {
    if (!this.started) {
      this.started = true;
      this.silenceStartMs = nowMs;
    }

    const voiced = hz > 0 && rms >= RMS_GATE && clarity >= 0.6;

    if (!voiced) {
      // going quiet — close any pending note and start counting silence
      const closed = this.closePending(nowMs);
      if (this.silenceStartMs === 0 || this.lastVoicedMs >= this.silenceStartMs) {
        this.silenceStartMs = nowMs;
      }
      return closed;
    }

    this.lastVoicedMs = nowMs;
    const cents = hzToCents(hz);

    if (!this.pending) {
      this.pending = {
        centsSum: cents,
        hzSum: hz,
        frames: 1,
        startMs: nowMs,
        lastMs: nowMs,
        centsAnchor: cents,
      };
      return null;
    }

    // pitch jumped → close the old note, open a new one; report the closed note
    if (Math.abs(cents - this.pending.centsAnchor) > PITCH_TOL_CENTS) {
      const closed = this.closePending(nowMs);
      this.pending = {
        centsSum: cents,
        hzSum: hz,
        frames: 1,
        startMs: nowMs,
        lastMs: nowMs,
        centsAnchor: cents,
      };
      return closed;
    }

    // same note continuing — accumulate, slowly track the anchor (glissando ok)
    this.pending.centsSum += cents;
    this.pending.hzSum += hz;
    this.pending.frames += 1;
    this.pending.lastMs = nowMs;
    this.pending.centsAnchor = this.pending.centsAnchor * 0.8 + cents * 0.2;
    return null;
  }

  /** Milliseconds of continuous silence since the last voiced frame. */
  silenceMs(nowMs: number): number {
    if (this.lastVoicedMs === 0) return 0;
    return nowMs - this.lastVoicedMs;
  }

  /** Force-close any note in progress (e.g. when the turn ends). */
  flush(nowMs: number): NoteEvent | null {
    return this.closePending(nowMs);
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  reset(nowMs: number): void {
    this.pending = null;
    this.lastVoicedMs = 0;
    this.silenceStartMs = nowMs;
  }

  private closePending(nowMs: number): NoteEvent | null {
    const p = this.pending;
    this.pending = null;
    if (!p) return null;
    const durMs = Math.max(nowMs - p.startMs, p.lastMs - p.startMs);
    if (durMs < MIN_NOTE_MS) return null;
    const cents = p.centsSum / p.frames;
    const hz = p.hzSum / p.frames;
    return { hz, cents, dur: durMs / 1000 };
  }
}
