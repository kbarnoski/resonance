// ─────────────────────────────────────────────────────────────────────────────
// stroke.ts — the KINEMATICS core for 7992-quillsvg ("Inscribe", DOM/SVG variant)
//
// A quill stroke is sampled as a stream of raw pointer samples; from consecutive
// samples we derive speed, curvature (turn rate), acceleration and an ink
// half-width. These four scalars are the whole instrument: they drive both the
// variable-width SVG ribbon AND (via the Eventizer below) the note stream fed to
// the synth. Following Gesture2Music (arXiv:2511.00793), the kinematic-EVENT
// stream is produced HERE and kept separate from audio playback — the same
// SoundEvent[] a live stroke emits is what a canon layer later loops.
//
// Determinism: the ghost quill's shape is seeded with mulberry32(0x7992). No
// Math.random / Date.now / new Date() anywhere. Timing is paced by the caller
// with performance.now().
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG — the ONLY source of randomness in this prototype. */
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

/** The logical paper coordinate box the SVG viewBox is drawn in. */
export const VIEW_W = 1000;
export const VIEW_H = 640;

/** Fixed broad-nib angle (radians). Tilt rotates it for asymmetric width. */
const NIB0 = -0.62;
/** Ink half-width bounds (paper units). */
const MIN_HW = 1.6;
const MAX_HW = 15;

/** One raw pointer (or ghost) sample. */
export interface RawSample {
  x: number;
  y: number;
  t: number; // ms, from performance.now()
  pressure: number; // 0..1 (real or synthesized)
  tiltX: number; // degrees, 0 when unavailable
}

/** A processed centreline point carrying its derived kinematics + ink geometry. */
export interface StrokePoint {
  x: number;
  y: number;
  t: number;
  pressure: number;
  speed: number; // paper units / ms
  curv: number; // signed turn rate (rad / paper unit)
  accel: number; // change in speed / ms
  hw: number; // ink half-width at this point
  nib: number; // nib normal angle at this point (rad)
}

/** A note event — the kinematic stream, decoupled from playback. */
export interface SoundEvent {
  tMs: number; // offset from stroke start
  degree: number; // scale degree index (see audio.ts)
  pressure: number; // → amplitude
  accel: number; // → attack sharpness
  speed: number; // → brightness at trigger
}

/** A completed stroke: its ink geometry AND its recorded event stream. */
export interface Stroke {
  points: StrokePoint[];
  events: SoundEvent[];
  durationMs: number;
  ghost: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Internal point carrying the running tangent used for curvature. */
type IPoint = StrokePoint & { _tang: number };

/**
 * Incrementally turns raw samples into StrokePoints. Keeps just enough history
 * to derive speed/curvature/acceleration, so it works live (past-only) during
 * drawing and identically when replaying the ghost.
 */
export class Kinematizer {
  private prev: IPoint | null = null;
  readonly startT: number;

  constructor(startT: number) {
    this.startT = startT;
  }

  /** Feed one raw sample; returns the processed point (never null). */
  push(s: RawSample): StrokePoint {
    const p = this.prev;
    let speed = 0;
    let curv = 0;
    let accel = 0;
    let tang = p ? p._tang : NIB0 + Math.PI / 2;

    if (p) {
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const dist = Math.hypot(dx, dy);
      const dt = Math.max(1, s.t - p.t);
      speed = dist / dt;
      accel = (speed - p.speed) / dt;
      if (dist > 0.01) {
        tang = Math.atan2(dy, dx);
        // signed smallest angle between successive tangents, per unit length
        let dA = tang - p._tang;
        while (dA > Math.PI) dA -= 2 * Math.PI;
        while (dA < -Math.PI) dA += 2 * Math.PI;
        curv = dA / dist;
      }
    }

    // Pressure: real when the device supplies it, else synthesized so that a
    // slower, more deliberate hand lays down fatter, wetter ink.
    const synthP = clamp(1 - speed * 0.9, 0.12, 1);
    const pressure = s.pressure > 0 ? s.pressure : synthP;

    // Nib angle rotates with pen tilt → asymmetric calligraphic width.
    const nib = NIB0 + (s.tiltX / 90) * 0.8;
    const hw = MIN_HW + pressure * (MAX_HW - MIN_HW);

    const point: IPoint = {
      x: s.x,
      y: s.y,
      t: s.t,
      pressure,
      speed,
      curv,
      accel,
      hw,
      nib,
      _tang: tang,
    };
    this.prev = point;
    return point;
  }
}

// ─── Ink ribbon geometry ─────────────────────────────────────────────────────

interface Pt {
  x: number;
  y: number;
}

/** Quadratic-smoothed edge through a polyline (assumes first point already placed). */
function smoothEdge(pts: Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `L ${f(pts[1].x)} ${f(pts[1].y)}`;
  let d = "";
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += `Q ${f(pts[i].x)} ${f(pts[i].y)} ${f(mx)} ${f(my)} `;
  }
  const last = pts[pts.length - 1];
  d += `L ${f(last.x)} ${f(last.y)}`;
  return d;
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the filled variable-width ribbon path. Each edge is offset from the
 * centreline along the (per-point) NIB NORMAL — a fixed-direction offset, which
 * is exactly what a broad-nib pen does: the visible width swells and thins as
 * the stroke direction turns relative to the nib, on top of the pressure term.
 */
export function ribbonPath(pts: StrokePoint[]): string {
  if (pts.length < 2) {
    if (pts.length === 1) {
      const p = pts[0];
      return `M ${f(p.x - p.hw)} ${f(p.y)} A ${f(p.hw)} ${f(p.hw)} 0 1 0 ${f(
        p.x + p.hw,
      )} ${f(p.y)} A ${f(p.hw)} ${f(p.hw)} 0 1 0 ${f(p.x - p.hw)} ${f(p.y)} Z`;
    }
    return "";
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (const p of pts) {
    const nx = Math.cos(p.nib + Math.PI / 2);
    const ny = Math.sin(p.nib + Math.PI / 2);
    left.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
    right.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
  }
  right.reverse();
  let d = `M ${f(left[0].x)} ${f(left[0].y)} `;
  d += smoothEdge(left) + " ";
  d += `L ${f(right[0].x)} ${f(right[0].y)} `;
  d += smoothEdge(right) + " Z";
  return d;
}

/** The bright wet-core centreline (drawn over the ribbon). */
export function centrePath(pts: StrokePoint[]): string {
  if (pts.length < 2) return "";
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)} `;
  d += smoothEdge(pts.map((p) => ({ x: p.x, y: p.y })));
  return d;
}

// ─── The Eventizer: kinematics → note stream (Gesture2Music separation) ──────

const EVENT_SPACING = 34; // paper units of travel between notes at rest density

/**
 * Emits a SoundEvent when enough ink has been laid down, so faster strokes fire
 * more notes (density ∝ speed). Curvature selects pitch: a straight run repeats
 * a held degree; a sharp turn leaps up (turning one way) or down (the other).
 */
export class Eventizer {
  private acc = 0;
  private degree = 12; // start mid-range
  private startT: number;

  constructor(startT: number) {
    this.startT = startT;
  }

  push(p: StrokePoint, prev: StrokePoint | null): SoundEvent | null {
    if (!prev) return null;
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    this.acc += dist;
    // A sharp corner forces a note even mid-segment.
    const corner = Math.abs(p.curv) > 0.06;
    if (this.acc < EVENT_SPACING && !corner) return null;
    this.acc = 0;

    // Curvature → melodic step. Straight (curv≈0) ⇒ step 0 ⇒ held tone.
    const turn = clamp(p.curv * 55, -1, 1);
    const step = Math.round(turn * 4);
    this.degree = clamp(this.degree + step, 0, 27); // ~5.5 octaves of a pentatonic

    return {
      tMs: p.t - this.startT,
      degree: this.degree,
      pressure: p.pressure,
      accel: Math.abs(p.accel),
      speed: p.speed,
    };
  }
}

// ─── The seeded ghost quill ──────────────────────────────────────────────────

/**
 * A parametric flowing gesture that writes itself across the sheet — sums of
 * seeded harmonics plus a rightward drift give a cursive, handwriting-like line.
 * Returns a position for phase u ∈ [0,1]. Deterministic for a given seed.
 */
export function makeGhost(seed: number): (u: number) => RawSample {
  const rnd = mulberry32(seed);
  // Seeded harmonic bank for x and y wobble.
  const harm = (n: number) =>
    Array.from({ length: n }, () => ({
      a: 0.4 + rnd() * 0.8,
      k: 1 + Math.floor(rnd() * 5),
      ph: rnd() * Math.PI * 2,
    }));
  const hx = harm(3);
  const hy = harm(4);
  const x0 = VIEW_W * 0.12;
  const x1 = VIEW_W * 0.88;
  const midY = VIEW_H * 0.52;
  const yAmp = VIEW_H * 0.2;

  return (u: number): RawSample => {
    const uu = clamp(u, 0, 1);
    // Ease the horizontal drift so the hand accelerates then settles.
    const drift = uu;
    let x = x0 + (x1 - x0) * drift;
    let y = midY;
    let wob = 0;
    for (const h of hx) {
      x += h.a * 26 * Math.sin(2 * Math.PI * (h.k * uu) + h.ph);
      wob += h.a;
    }
    void wob;
    for (const h of hy) {
      y += (h.a / 2) * yAmp * Math.sin(2 * Math.PI * (h.k * uu) + h.ph);
    }
    // Envelope the vertical amplitude so the ends settle toward the baseline.
    const env = Math.sin(Math.PI * uu);
    y = midY + (y - midY) * (0.35 + 0.65 * env);

    // Synthesized pressure that breathes with the gesture (no real sensor).
    const pressure = clamp(0.42 + 0.4 * Math.sin(2 * Math.PI * (2.3 * uu + 0.1)), 0.12, 1);
    // A gentle tilt sway so the nib angle drifts, showing off asymmetric width.
    const tiltX = 22 * Math.sin(2 * Math.PI * (0.8 * uu));
    return { x, y, t: 0, pressure, tiltX };
  };
}
