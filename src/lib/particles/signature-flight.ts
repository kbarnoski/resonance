// ─────────────────────────────────────────────────────────────────────────────
// signature-flight.ts — a journey's emblem TAKES FLIGHT (Karel 2026-10-13:
// "is it easy to have yellow bird fly away in its emblem form or is that
// crazy"). Pure maths, no DOM / GL — the engine evaluates it every frame: it
// moves the image plane the motes are bound to (so the bird stays a bird
// while it flies) and turns the wing motes' targets; vitest steps it.
//
// The moment (Karel: "the bird should flow away in the first sequence and the
// last"): at the end of BOTH emblems — the opening one under the title and
// the closing one in the last ~17 s — the formed bird does not dissolve in
// place: it lifts, flows up a gentle arc the way it faces and glides
// off-frame, shrinking with distance, a few loose motes shed from its tail
// following its path. The closing flight is timed so the bird is gone as the
// music reaches its quietest moment; the opening one lifts off inside the
// boundary settle (video-activity.ts, 10.5 s — clips + parallax hold, so the
// bird is the ONE mover) and is off-frame before the stills start moving.
//
// ITS WINGS ARTICULATE (Karel: "the bird wings need to work like a real bird
// flying"): the motes in the wing region turn about the shoulder hinge in 3D —
// the wing sweeps down through the viewer (foreshortened) to below the body
// and back up — the tip trailing the root (the wing's flex), the body lifting
// on each downstroke. Downstroke 40 % / upstroke 60 %; powerful 2-3 Hz takeoff
// strokes easing to cruise (locked loosely to the song's beat), then
// flap-flap-flap-GLIDE (wings held out, slightly up) as it soars away.
//
// Laws: motion only (no brightness / alpha term here at all), every value
// eased from rest (no jumps; strokes turn with zero velocity; the whole-image
// motion stays a slow glide — only the wings beat fast), before the journey
// ends (the boundary freeze protocol is untouched). Only journeys in
// SIGNATURE_FLIGHTS fly; off by default behind `?birdflight=1` (sessionStorage
// kept, `?birdflight=0` off) — both flights.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bird's anatomy in IMAGE coordinates (fractions of the picture, x right,
 * y DOWN — as you look at it). The wing hinge is a line through `shoulder`
 * along the body axis (`head` → `tail`); the wing is everything on the `tip`
 * side of that line within the along-axis band [aMin, aMax] (image units from
 * the shoulder). A side view flaps its (overlapping) wings together about that
 * hinge, out of the picture plane.
 */
export interface WingAnatomy {
  view: "side";
  head: readonly [number, number];
  tail: readonly [number, number];
  shoulder: readonly [number, number];
  tip: readonly [number, number];
  aMin: number;
  aMax: number;
  /** root band: motes this close above the hinge turn only partly (the joint bends) */
  soft: number;
}

export interface SignatureFlight {
  name: string;
  /** screen direction the emblem faces (it flies the way it looks): x −1 = left, y +1 = up */
  dir: { x: -1 | 1; y: 1 };
  wing: WingAnatomy;
}

/** Per-journey signature flights (extend here). */
export const SIGNATURE_FLIGHTS: Readonly<Record<string, SignatureFlight>> = {
  // emblems/feathery/yellow-bird.jpg (1024²): a SIDE VIEW facing LEFT — beak
  // (0.31, 0.43), head (0.41, 0.45), body down-right to the tail base (0.64,
  // 0.61), tail tip (0.79, 0.70), feet below (0.58, 0.62). Both wings rise from
  // the back (roots along x 0.48-0.60) at the TOP OF THE UPSTROKE — near wing
  // tip (0.79, 0.21), far wing tip (0.66, 0.22) — so the stroke begins with a
  // downstroke. The hinge runs along the back through the shoulder (0.51, 0.465).
  "c80a89bc-2c88-4bde-bec8-4be6916acb62": {
    name: "Yellow Bird",
    dir: { x: -1, y: 1 },
    wing: { view: "side", head: [0.41, 0.45], tail: [0.64, 0.61], shoulder: [0.51, 0.465], tip: [0.79, 0.21], aMin: -0.1, aMax: 0.2, soft: 0.035 },
  },
};

export const FLIGHT = {
  /** closing flight: liftoff → far pose, seconds */
  SEC: 6,
  /** opening flight: liftoff → far pose (8 + 5.5 + the 1.5 s let-go = 15 s, inside the opening's 16 s) */
  OPEN_SEC: 5.5,
  /** the closing emblem is fully formed this long after it begins (D − 17 + this) */
  MIN_HOLD_SEC: 6.5,
  /** the flight is over at least this long before the journey's end */
  END_MARGIN_SEC: 2.5,
  /** the closing emblem's window (image-follow.ts emblemEnvelope) */
  CLOSING_SEC: 17,
  /** the opening flight starts here — worn by ~6.5 s; the emblem's own release
   *  began at 11 s; the opening owns the first 16 s */
  OPEN_START_SEC: 8,
  /** opening only: after the flight the held form lets go over this */
  HOLD_FADE_SEC: 1.5,
  /** travel in screen half-extents (1 = from the centre to the edge) */
  X_END: 1.45,
  Y_END: 0.85,
  /** the arc: y leads x (climb first, then glide out) */
  ARC: 0.3,
  /** plane scale at the end of the flight (perspective: it shrinks with distance) */
  SCALE_END: 0.55,
  /** the tail sheds loose motes after liftoff, over this window (s since start) */
  SHED_FROM: 0.6,
  SHED_TO: 2.2,
  /** WINGS — stroke rate: takeoff = 1.5 × the beat (held 2-3 Hz), easing to
   *  cruise = the beat (held 1.5-2.2 Hz) over TAKEOFF_EASE of the flight */
  TAKEOFF_HZ_MIN: 2,
  TAKEOFF_HZ_MAX: 3,
  CRUISE_HZ_MIN: 1.5,
  CRUISE_HZ_MAX: 2.2,
  TAKEOFF_EASE: 0.6,
  /** downstroke share of a stroke (real birds: fast power stroke, slower recovery) */
  DOWN_SHARE: 0.4,
  /** wing angle about the hinge at the bottom of the stroke, radians (0 = the
   *  picture's raised wing; π/2 = toward the viewer; > π/2 = below the back) */
  DOWN_TAKEOFF: 2.2,
  DOWN_CRUISE: 1.8,
  /** continuous takeoff strokes before the flap-flap-flap-glide pattern */
  TAKEOFF_STROKES: 4,
  /** the pattern: this many flaps, then a glide this many stroke-lengths long */
  PATTERN_FLAPS: 3,
  GLIDE_STROKES: 1.6,
  /** glide pose: wings held out, slightly up */
  GLIDE_ANGLE: 0.8,
  /** the wings settle into the glide pose over the flight's last seconds */
  FINAL_GLIDE_SEC: 0.8,
  /** the tip trails the root by this (the wing's flex) */
  TIP_LAG_SEC: 0.06,
  /** the body lifts this much (image units) at the bottom of the downstroke */
  BOB: 0.02,
} as const;

export const FLIGHT_SESSION_KEY = "resonance-birdflight";
export const FLIGHT_DEFAULT = false;

export interface FlightFlag { closing: boolean; opening: boolean }

/** `?birdflight=1` on (opening + closing), `=0` off — kept for the tab. */
export function birdFlightEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem"> | null): FlightFlag {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("birdflight");
  } catch { q = null; }
  if (q !== "0" && q !== "1") q = null;
  try { if (q) store?.setItem(FLIGHT_SESSION_KEY, q); } catch { /* storage blocked */ }
  let v = q;
  if (!v) { try { const k = store?.getItem(FLIGHT_SESSION_KEY); if (k === "0" || k === "1") v = k; } catch { /* blocked */ } }
  if (!v) return { closing: FLIGHT_DEFAULT, opening: false };
  return { closing: v === "1", opening: v === "1" };
}

export function signatureFlightFor(journeyId: string): SignatureFlight | null {
  return SIGNATURE_FLIGHTS[journeyId] ?? null;
}

/** The subset of the deep-analysis profile the timing reads. */
export interface FlightProfile { duration?: number; quietestTime?: number | null; curve?: ReadonlyArray<readonly [number, number]> }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const ss = (e0: number, e1: number, x: number) => { const u = clamp01((x - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };

function energyAt(curve: ReadonlyArray<readonly [number, number]>, t: number): number {
  if (!curve.length) return 0;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [t1, e1] = curve[i];
    if (t <= t1) { const [t0, e0] = curve[i - 1]; return e0 + (e1 - e0) * ((t - t0) / Math.max(1e-6, t1 - t0)); }
  }
  return curve[curve.length - 1][1];
}

/**
 * When the closing flight starts (track seconds), or null (no closing emblem /
 * no room). MUSICAL ANCHOR: the bird is gone as the music reaches its quietest
 * moment (profile.quietestTime − SEC) when that lies in the closing window;
 * else on the final decay — where the energy has fallen half-way from where
 * the closing emblem began to where the piece ends. Clamped so the emblem has
 * fully formed first and the flight is over END_MARGIN_SEC before the end.
 */
export function closingFlightStart(D: number, profile?: FlightProfile | null): number | null {
  if (!(D > 40)) return null; // no closing emblem (emblemEnvelope)
  const w0 = D - FLIGHT.CLOSING_SEC;
  const lo = w0 + FLIGHT.MIN_HOLD_SEC, hi = D - FLIGHT.END_MARGIN_SEC - FLIGHT.SEC;
  if (lo > hi) return null;
  let at = hi;
  const q = profile?.quietestTime;
  const curve = profile?.curve ?? [];
  if (q != null && q > w0 && q <= D) at = q - FLIGHT.SEC;
  else if (curve.length > 1) {
    const eA = energyAt(curve, w0), eZ = energyAt(curve, D);
    const mid = (eA + eZ) / 2;
    for (let t = w0; t <= D; t += 0.25) if (energyAt(curve, t) <= mid) { at = t; break; }
  }
  return Math.max(lo, Math.min(hi, at));
}

/** The opening flight's start, or null when the piece is too short. */
export function openingFlightStart(D: number): number | null {
  return D > 40 ? FLIGHT.OPEN_START_SEC : null;
}

// ── the path ────────────────────────────────────────────────────────────────

export interface FlightPose {
  /** plane centre offset, screen half-extents (x right, y up) */
  x: number; y: number;
  /** plane scale factor (1 = resting) */
  scale: number;
  /** 0..1: the tail's loose motes let go */
  shed: number;
  /** 0..1 progress of the travel */
  u: number;
}

export const REST_POSE: FlightPose = { x: 0, y: 0, scale: 1, shed: 0, u: 0 };

/** Travel progress: u = 4p³ − 3p⁴ — leaves from rest (no velocity, no
 *  acceleration step), accelerates, peaks at ⅔, eases as it vanishes. */
export function travel(p: number): number {
  const q = clamp01(p);
  return q * q * q * (4 - 3 * q);
}

/** The flight pose `e` seconds after liftoff over a `sec`-long flight (e ≤ 0 = at rest; after it the far pose holds). */
export function flightPose(e: number, f: Pick<SignatureFlight, "dir">, sec: number = FLIGHT.SEC): FlightPose {
  if (!(e > 0)) return REST_POSE;
  const u = travel(e / sec);
  const x = f.dir.x * FLIGHT.X_END * u;
  const y = f.dir.y * FLIGHT.Y_END * (u + FLIGHT.ARC * Math.sin(Math.PI * u));
  const scale = 1 - (1 - FLIGHT.SCALE_END) * u;
  const shed = ss(FLIGHT.SHED_FROM, FLIGHT.SHED_TO, e);
  return { x, y, scale, shed, u };
}

/** Opening only: the emblem is held while it flies, then lets go (1 → 0 over HOLD_FADE_SEC). */
export function flightHold(e: number, sec: number = FLIGHT.OPEN_SEC): number {
  if (!(e > 0)) return 0;
  return 1 - ss(sec, sec + FLIGHT.HOLD_FADE_SEC, e);
}

/**
 * Has the form left the frame? `half` = the form's resting half-extent in
 * screen half-extents (x, y); `cx/cy` = where it rests on screen.
 */
export function offFrame(p: FlightPose, half: { x: number; y: number }, cx = 0, cy = 0): boolean {
  const hx = half.x * p.scale, hy = half.y * p.scale;
  return Math.abs(cx + p.x) - hx > 1 || Math.abs(cy + p.y) - hy > 1;
}

// ── the wings ───────────────────────────────────────────────────────────────

/** Stroke rates (Hz) from the tempo: takeoff 1.5 × the beat, cruise = the beat. */
export function strokeHz(bpm?: number): { takeoff: number; cruise: number } {
  const b = bpm && bpm > 0 ? bpm / 60 : 1.8;
  return {
    takeoff: clamp(b * 1.5, FLIGHT.TAKEOFF_HZ_MIN, FLIGHT.TAKEOFF_HZ_MAX),
    cruise: clamp(b, FLIGHT.CRUISE_HZ_MIN, FLIGHT.CRUISE_HZ_MAX),
  };
}

/** Strokes completed (fractional) `e` s after liftoff: ∫ rate, the rate easing takeoff → cruise. */
export function strokePhase(e: number, sec: number, bpm?: number): number {
  if (!(e > 0)) return 0;
  const { takeoff: f0, cruise: f1 } = strokeHz(bpm);
  const T = Math.max(0.1, sec * FLIGHT.TAKEOFF_EASE);
  const G = (x: number) => x * x * x - 0.5 * x * x * x * x; // ∫₀ˣ smoothstep
  const x = Math.min(e / T, 1);
  return f0 * e + (f1 - f0) * (T * G(x) + Math.max(0, e - T));
}

/** One flap (local phase 0..1): from the raised wing DOWN fast (DOWN_SHARE), back UP slower; zero velocity at both turns. */
export function flapAngle(x: number, down: number): number {
  const D = FLIGHT.DOWN_SHARE;
  if (x <= 0 || x >= 1) return 0;
  if (x < D) { const u = x / D; return down * u * u * (3 - 2 * u); }
  const u = (x - D) / (1 - D);
  return down * (1 - u * u * (3 - 2 * u));
}

export type StrokeKind = "rest" | "flap" | "glide";

/** The wing root's hinge angle `e` s after liftoff: takeoff strokes, then flap-flap-flap-GLIDE, settling into the glide at the end. */
export function wingRootAngle(e: number, sec: number, bpm?: number): { angle: number; kind: StrokeKind } {
  if (!(e > 0)) return { angle: 0, kind: "rest" };
  const phi = strokePhase(e, sec, bpm);
  const down = FLIGHT.DOWN_TAKEOFF + (FLIGHT.DOWN_CRUISE - FLIGHT.DOWN_TAKEOFF) * ss(0, sec * FLIGHT.TAKEOFF_EASE, e);
  let angle: number, kind: StrokeKind;
  if (phi < FLIGHT.TAKEOFF_STROKES) { angle = flapAngle(phi - Math.floor(phi), down); kind = "flap"; }
  else {
    const cyc = FLIGHT.PATTERN_FLAPS + FLIGHT.GLIDE_STROKES;
    const c = (phi - FLIGHT.TAKEOFF_STROKES) % cyc;
    if (c < FLIGHT.PATTERN_FLAPS) { angle = flapAngle(c - Math.floor(c), down); kind = "flap"; }
    else {
      // the glide: ease into the held pose, hold, ease back to the raised wing for the next downstroke
      const g = (c - FLIGHT.PATTERN_FLAPS) / FLIGHT.GLIDE_STROKES;
      angle = FLIGHT.GLIDE_ANGLE * ss(0, 0.25, g) * (1 - ss(0.75, 1, g));
      kind = "glide";
    }
  }
  // the end of the flight: the wings settle into the glide (it soars away)
  const k = ss(sec - FLIGHT.FINAL_GLIDE_SEC, sec, e);
  if (k > 0) { angle += (FLIGHT.GLIDE_ANGLE - angle) * k; if (k >= 1) kind = "glide"; }
  return { angle, kind };
}

export interface WingPose {
  /** hinge angle at the wing root / tip, radians (0 = the picture's wing) */
  root: number;
  tip: number;
  /** body lift, image units (up) — on the downstroke */
  bob: number;
}

export const REST_WINGS: WingPose = { root: 0, tip: 0, bob: 0 };

/** The wings `e` s after liftoff: the tip trails the root (TIP_LAG_SEC); the body lifts as the wings go down. */
export function wingPose(e: number, sec: number, bpm?: number): WingPose {
  const root = wingRootAngle(e, sec, bpm).angle;
  const tip = wingRootAngle(e - FLIGHT.TIP_LAG_SEC, sec, bpm).angle;
  const bob = FLIGHT.BOB * clamp(root / FLIGHT.DOWN_CRUISE, 0, 1.2);
  return { root, tip, bob };
}

/** The anatomy in the engine's terms: q-space (aspect-true, image-centred, y UP) hinge, body axis, wing normal, wing length. */
export interface WingFrame { hinge: [number, number]; axis: [number, number]; normal: [number, number]; aMin: number; aMax: number; rMax: number; soft: number }

/** Image fraction (y down) → q-space (x scaled by the aspect, centred, y up) — the GLSL does the same from the mote's uv. */
export function toQ(p: readonly [number, number], imgAspect = 1): [number, number] {
  return [(p[0] - 0.5) * imgAspect, 0.5 - p[1]];
}

export function wingFrame(w: WingAnatomy, imgAspect = 1): WingFrame {
  const h = toQ(w.shoulder, imgAspect), a = toQ(w.head, imgAspect), b = toQ(w.tail, imgAspect), t = toQ(w.tip, imgAspect);
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  let nx = -dy, ny = dx;
  if ((t[0] - h[0]) * nx + (t[1] - h[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const rMax = Math.max(0.05, (t[0] - h[0]) * nx + (t[1] - h[1]) * ny);
  return { hinge: h, axis: [dx, dy], normal: [nx, ny], aMin: w.aMin, aMax: w.aMax, rMax, soft: w.soft };
}

/**
 * A mote's wing displacement in q-space — the GLSL in shaders.ts (wingDisp)
 * mirrors this exactly: [dx, dy] in the picture plane, dz toward the viewer.
 * The wing turns about the hinge line; the angle bends from the root's to the
 * tip's along the wing. `withBob` adds the body lift (every mote — the wings
 * ride on the body).
 */
export function wingDisplacement(q: readonly [number, number], fr: WingFrame, w: WingPose, withBob = true): [number, number, number] {
  const rx = q[0] - fr.hinge[0], ry = q[1] - fr.hinge[1];
  const a = rx * fr.axis[0] + ry * fr.axis[1];
  const r = rx * fr.normal[0] + ry * fr.normal[1];
  const inWing = ss(0, fr.soft, r) * ss(fr.aMin - 0.04, fr.aMin, a) * (1 - ss(fr.aMax, fr.aMax + 0.04, a));
  let dx = 0, dy = 0, dz = 0;
  if (inWing > 0) {
    const th = w.root + (w.tip - w.root) * ss(0, 1, r / fr.rMax);
    const dn = (r * Math.cos(th) - r) * inWing;
    dx = fr.normal[0] * dn;
    dy = fr.normal[1] * dn;
    dz = r * Math.sin(th) * inWing;
  }
  if (withBob) dy += w.bob;
  return [dx, dy, dz];
}
