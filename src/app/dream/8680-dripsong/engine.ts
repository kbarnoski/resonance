// engine.ts — the water-clock logic for Dripsong.
//
// Everything here is deterministic: a seeded mulberry32 PRNG drives the
// auto-demo, and all timing is passed in from performance.now(). No
// Math.random(), no argless Date. The physics lives in two tiny functions
// (minnaertFreq / bubbleRadiusForFreq) and the rest is bookkeeping for taps
// and ripples.

/** Seeded PRNG — the only source of "randomness" in the piece. */
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── The Minnaert bubble physics (the whole point) ─────────────────────────
// A dripping tap's "plink" is the ring of an air bubble entrained on impact,
// oscillating at the Minnaert resonance frequency. At 1 atm in water this
// reduces to f · r ≈ 3.26 (Hz·metre). Big drop → big bubble → LOW plink.

const MINNAERT_CONST = 3.26; // Hz · metre

/** Minnaert resonance frequency (Hz) of an air bubble of radius r (metres). */
export function minnaertFreq(radiusM: number): number {
  return MINNAERT_CONST / radiusM;
}

/** Inverse: bubble radius (metres) that resonates at a given frequency. */
export function bubbleRadiusForFreq(freqHz: number): number {
  return MINNAERT_CONST / freqHz;
}

// Musical band the plink is clamped to.
export const FREQ_MIN = 180;
export const FREQ_MAX = 2600;

// ── Quantized, pleasant scale ─────────────────────────────────────────────
// The physics sets the timbre + glide; quantizing the reachable bubble sizes
// keeps the pitches musical. A minor-pentatonic set spanning the band.
export function makeScale(): number[] {
  const root = 220; // A3
  const degrees = [0, 3, 5, 7, 10]; // minor pentatonic (semitones)
  const out: number[] = [];
  for (let oct = -1; oct <= 3; oct++) {
    for (const d of degrees) {
      const f = root * Math.pow(2, oct) * Math.pow(2, d / 12);
      if (f >= FREQ_MIN && f <= FREQ_MAX) out.push(f);
    }
  }
  out.sort((x, y) => x - y);
  return out;
}

// ── Tap + ripple models ───────────────────────────────────────────────────
export type Tap = {
  id: number;
  x: number; // normalized 0..1 across the pool
  y: number; // normalized 0..1
  noteIndex: number; // index into the scale (low index = big drop = low pitch)
  periodMs: number; // drip period
  nextAt: number; // performance.now() timestamp of next drip
};

export type Ripple = {
  x: number;
  y: number;
  start: number; // ms (performance.now)
  freq: number;
};

export type DripEvent = { tap: Tap; freq: number };

export const RIPPLE_LIFE_MS = 4200;
export const RIPPLE_LIFE_MS_CALM = 6400;

const MAX_RIPPLES = 140;
const PERIOD_MIN = 700;
const PERIOD_MAX = 6000;
const PERIOD_STEP = 250;

export class DripEngine {
  taps: Tap[] = [];
  ripples: Ripple[] = [];
  readonly scale: number[];
  private nextId = 1;
  private rand: () => number;

  constructor(seed: number) {
    this.rand = mulberry32(seed);
    this.scale = makeScale();
  }

  freqOf(t: Tap): number {
    return this.scale[clamp(t.noteIndex, 0, this.scale.length - 1)];
  }

  /** Entrained-bubble radius for this tap, in millimetres (for the readout). */
  bubbleMm(t: Tap): number {
    return bubbleRadiusForFreq(this.freqOf(t)) * 1000;
  }

  addTap(
    x: number,
    y: number,
    noteIndex: number,
    periodMs: number,
    now: number,
  ): Tap {
    const t: Tap = {
      id: this.nextId++,
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      noteIndex: clamp(noteIndex, 0, this.scale.length - 1),
      periodMs: clamp(periodMs, PERIOD_MIN, PERIOD_MAX),
      nextAt: now + 120, // first drip comes almost immediately
    };
    this.taps.push(t);
    return t;
  }

  removeTap(id: number): void {
    this.taps = this.taps.filter((t) => t.id !== id);
  }

  find(id: number): Tap | undefined {
    return this.taps.find((t) => t.id === id);
  }

  adjustNote(id: number, delta: number): void {
    const t = this.find(id);
    if (t) t.noteIndex = clamp(t.noteIndex + delta, 0, this.scale.length - 1);
  }

  setNote(id: number, noteIndex: number): void {
    const t = this.find(id);
    if (t) t.noteIndex = clamp(noteIndex, 0, this.scale.length - 1);
  }

  adjustPeriod(id: number, deltaMs: number): void {
    const t = this.find(id);
    if (t) {
      const raw = Math.round((t.periodMs + deltaMs) / PERIOD_STEP) * PERIOD_STEP;
      t.periodMs = clamp(raw, PERIOD_MIN, PERIOD_MAX);
    }
  }

  /** Advance the clock: fire any due drips, cull dead ripples. */
  tick(now: number, rippleLife: number): DripEvent[] {
    const events: DripEvent[] = [];
    for (const t of this.taps) {
      // If the tab was backgrounded, don't machine-gun a catch-up burst.
      if (now - t.nextAt > t.periodMs * 3) t.nextAt = now;
      if (now >= t.nextAt) {
        const freq = this.freqOf(t);
        events.push({ tap: t, freq });
        this.spawnRipple(t.x, t.y, now, freq);
        t.nextAt += t.periodMs;
      }
    }
    if (this.ripples.length > 0) {
      this.ripples = this.ripples.filter((r) => now - r.start < rippleLife);
    }
    return events;
  }

  private spawnRipple(x: number, y: number, now: number, freq: number): void {
    this.ripples.push({ x, y, start: now, freq });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  /** Pre-place ~3–4 taps at incommensurate periods so the pool is already
   *  weaving a canon on frame 1, with zero user input. Deterministic. */
  seedDemo(now: number): void {
    const n = this.scale.length;
    // Positions spread around the pool; periods chosen to be mutually
    // incommensurate so the polyrhythm never quite repeats.
    const specs: Array<{ x: number; y: number; note: number; period: number }> =
      [
        { x: 0.28, y: 0.34, note: Math.floor(n * 0.2), period: 1700 },
        { x: 0.68, y: 0.3, note: Math.floor(n * 0.55), period: 2300 },
        { x: 0.4, y: 0.68, note: Math.floor(n * 0.4), period: 2900 },
        { x: 0.74, y: 0.66, note: Math.floor(n * 0.72), period: 3700 },
      ];
    for (const s of specs) {
      const t = this.addTap(s.x, s.y, s.note, s.period, now);
      // stagger first strikes so they don't all land on frame 1
      t.nextAt = now + 200 + this.rand() * s.period;
    }
  }

  dispose(): void {
    this.taps = [];
    this.ripples = [];
  }
}
