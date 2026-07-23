// The looper subsystem — the heart of the piece.
//
// A "record" arms a fixed window; every motion sample inside it is captured.
// When the window closes, the clip is resampled to an even-time path and
// becomes a PERSISTENT, autonomously-replaying layer with its own clock. Each
// layer carries a tiny playback-rate detune so, Steve-Reich-style, the loops
// drift out of phase against one another over minutes. State only accumulates
// (up to a cap) — the piece is genuinely long-form.

import type { FlowSample } from "./flow";

export interface LoopPoint {
  x: number;
  y: number;
  e: number;
}

export interface LoopClip {
  id: number;
  /** Even-time resampled path; length === nPoints. */
  points: LoopPoint[];
  /** Loop length in ms. */
  duration: number;
  /** Playback-rate multiplier (~1) that makes layers phase-drift. */
  rate: number;
  /** performance.now() when the clip began replaying. */
  startedAt: number;
  /** Initial phase offset in [0, 1). */
  phase: number;
}

interface RecState {
  startMs: number;
  samples: { t: number; s: FlowSample }[];
}

export interface LiveState {
  x: number;
  y: number;
  e: number;
  trail: LoopPoint[];
}

/** Linear-interpolate a recorded sample buffer at time t (ms into window). */
function sampleAtTime(
  src: { t: number; s: FlowSample }[],
  t: number,
): LoopPoint {
  if (src.length === 0) return { x: 0, y: 0, e: 0 };
  if (t <= src[0].t) {
    return { x: src[0].s.cx, y: src[0].s.cy, e: src[0].s.energy };
  }
  for (let i = 1; i < src.length; i++) {
    if (src[i].t >= t) {
      const a = src[i - 1];
      const b = src[i];
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      return {
        x: a.s.cx + (b.s.cx - a.s.cx) * f,
        y: a.s.cy + (b.s.cy - a.s.cy) * f,
        e: a.s.energy + (b.s.energy - a.s.energy) * f,
      };
    }
  }
  const last = src[src.length - 1];
  return { x: last.s.cx, y: last.s.cy, e: last.s.energy };
}

export class LoopEngine {
  readonly maxClips: number;
  readonly recordMs: number;
  private readonly nPoints = 96;
  private nextId = 1;
  clips: LoopClip[] = [];
  autoArm: boolean;

  private rec: RecState | null = null;
  private readonly trailLen = 56;
  private trailBuf: LoopPoint[] = [];
  live: LiveState = { x: 0, y: 0, e: 0, trail: [] };

  constructor(
    opts: { maxClips?: number; recordMs?: number; autoArm?: boolean } = {},
  ) {
    this.maxClips = opts.maxClips ?? 6;
    this.recordMs = opts.recordMs ?? 7000;
    this.autoArm = opts.autoArm ?? true;
  }

  get recording(): boolean {
    return this.rec !== null;
  }

  get atCapacity(): boolean {
    return this.clips.length >= this.maxClips;
  }

  recordProgress(now: number): number {
    if (!this.rec) return 0;
    return Math.min(1, (now - this.rec.startMs) / this.recordMs);
  }

  arm(now: number): void {
    if (this.rec || this.atCapacity) return;
    this.rec = { startMs: now, samples: [] };
  }

  private closeRec(now: number): void {
    if (!this.rec) return;
    const rec = this.rec;
    this.rec = null;
    if (rec.samples.length >= 4) {
      const clip = this.buildClip(rec, now);
      this.clips.push(clip);
    }
  }

  private buildClip(rec: RecState, now: number): LoopClip {
    const duration = this.recordMs;
    const pts: LoopPoint[] = [];
    for (let i = 0; i < this.nPoints; i++) {
      const t = (i / this.nPoints) * duration;
      pts.push(sampleAtTime(rec.samples, t));
    }
    const id = this.nextId++;
    // Alternating small detune → genuine phase drift between layers.
    const detune = (id % 2 === 0 ? 1 : -1) * (0.006 + 0.004 * ((id % 3) / 2));
    return {
      id,
      points: pts,
      duration,
      rate: 1 + detune,
      startedAt: now,
      phase: (id * 0.13) % 1,
    };
  }

  /** Feed one motion sample. Updates the live trail and any active recording. */
  push(now: number, s: FlowSample): void {
    this.live.x = s.cx;
    this.live.y = s.cy;
    this.live.e = s.energy;
    this.trailBuf.push({ x: s.cx, y: s.cy, e: s.energy });
    if (this.trailBuf.length > this.trailLen) this.trailBuf.shift();
    this.live.trail = this.trailBuf;

    if (this.rec) {
      this.rec.samples.push({ t: now - this.rec.startMs, s });
      if (now - this.rec.startMs >= this.recordMs) this.closeRec(now);
    }
  }

  /** Interpolated position of a layer on its own drifting clock. */
  sampleClip(clip: LoopClip, now: number): LoopPoint {
    const n = clip.points.length;
    const local =
      ((now - clip.startedAt) * clip.rate) / clip.duration + clip.phase;
    const ph = local - Math.floor(local);
    const f = ph * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const frac = f - Math.floor(f);
    const a = clip.points[i0];
    const b = clip.points[i1];
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
      e: a.e + (b.e - a.e) * frac,
    };
  }

  clearLast(): number | null {
    const gone = this.clips.pop();
    return gone ? gone.id : null;
  }

  clearAll(): number[] {
    const ids = this.clips.map((c) => c.id);
    this.clips = [];
    return ids;
  }
}
