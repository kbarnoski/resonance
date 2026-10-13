// ─────────────────────────────────────────────────────────────────────────────
// signature-flight.ts — a journey's emblem TAKES FLIGHT (Karel 2026-10-13:
// "is it easy to have yellow bird fly away in its emblem form or is that
// crazy"). Pure maths, no DOM / GL — the layer feeds the pose to the engine,
// which moves the image plane the motes are bound to (so the bird stays a
// bird while it flies), and vitest steps it frame by frame.
//
// The moment (Karel: "the bird should flow away in the first sequence and the
// last"): at the end of BOTH emblems — the opening one under the title and
// the closing one in the last ~17 s — the formed bird does not dissolve in
// place: it lifts, flows up a gentle arc the way it faces and glides
// off-frame, shrinking with distance, wings beating slowly (a squash + roll
// of the form, ≤ 1 Hz, motion only), a few loose motes shed from its tail
// following its path. The closing flight is timed so the bird is gone as the
// music reaches its quietest moment; the opening one lifts off inside the
// boundary settle (video-activity.ts, 10.5 s — clips + parallax hold, so the
// bird is the ONE mover) and is off-frame before the stills start moving.
//
// Laws: motion only (no brightness / alpha term here at all), every value
// eased from rest and back (no jumps), wing-beat ≤ 1 Hz, before the journey
// ends (the boundary freeze protocol is untouched). Only journeys in
// SIGNATURE_FLIGHTS fly; off by default behind `?birdflight=1` (sessionStorage
// kept, `?birdflight=0` off) — both flights.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureFlight {
  name: string;
  /** screen direction the emblem faces (it flies the way it looks): x −1 = left, y +1 = up */
  dir: { x: -1 | 1; y: 1 };
}

/** Per-journey signature flights (extend here). */
export const SIGNATURE_FLIGHTS: Readonly<Record<string, SignatureFlight>> = {
  // the emblem (emblems/feathery/yellow-bird.jpg) faces LEFT, wings raised, tail low-right
  "c80a89bc-2c88-4bde-bec8-4be6916acb62": { name: "Yellow Bird", dir: { x: -1, y: 1 } },
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
  /** wing-beat: vertical squash of the form (the engine's motes follow it at ~½) */
  BEAT_AMP: 0.16,
  /** …a gentle roll with it, radians */
  ROLL_AMP: 0.05,
  /** wing-beat rate: one beat per three of the song's beats, held to this range */
  BEAT_HZ_MIN: 0.4,
  BEAT_HZ_MAX: 0.9,
  /** the wing-beat eases in / out over this */
  BEAT_EASE_SEC: 1.2,
  /** the tail sheds loose motes after liftoff, over this window (s since start) */
  SHED_FROM: 0.6,
  SHED_TO: 2.2,
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
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

/** Wing-beat rate from the tempo: one beat per three of the song's beats, ≤ 1 Hz. */
export function wingBeatHz(bpm?: number): number {
  const f = bpm && bpm > 0 ? bpm / 60 / 3 : 0.6;
  return Math.max(FLIGHT.BEAT_HZ_MIN, Math.min(FLIGHT.BEAT_HZ_MAX, f));
}

export interface FlightPose {
  /** plane centre offset, screen half-extents (x right, y up) */
  x: number; y: number;
  /** plane scale factor (1 = resting) */
  scale: number;
  /** vertical squash of the form (1 = none) — the wing-beat */
  squash: number;
  /** in-plane roll, radians */
  roll: number;
  /** 0..1: the tail's loose motes let go */
  shed: number;
  /** 0..1 progress of the travel */
  u: number;
}

export const REST_POSE: FlightPose = { x: 0, y: 0, scale: 1, squash: 1, roll: 0, shed: 0, u: 0 };

/** Travel progress: u = 4p³ − 3p⁴ — leaves from rest (no velocity, no
 *  acceleration step), accelerates, peaks at ⅔, eases as it vanishes. */
export function travel(p: number): number {
  const q = clamp01(p);
  return q * q * q * (4 - 3 * q);
}

/** The flight pose `e` seconds after liftoff over a `sec`-long flight (e ≤ 0 = at rest; after it the far pose holds). */
export function flightPose(e: number, f: SignatureFlight, beatHz = 0.6, sec: number = FLIGHT.SEC): FlightPose {
  if (!(e > 0)) return REST_POSE;
  const u = travel(e / sec);
  const x = f.dir.x * FLIGHT.X_END * u;
  const y = f.dir.y * FLIGHT.Y_END * (u + FLIGHT.ARC * Math.sin(Math.PI * u));
  const scale = 1 - (1 - FLIGHT.SCALE_END) * u;
  // the wing-beat eases in after liftoff and out as it vanishes (sin starts at 0)
  const amp = ss(0, FLIGHT.BEAT_EASE_SEC, e) * (1 - ss(sec - FLIGHT.BEAT_EASE_SEC, sec, e));
  const ph = 2 * Math.PI * Math.min(beatHz, 1) * e;
  const squash = 1 + FLIGHT.BEAT_AMP * amp * Math.sin(ph);
  const roll = -f.dir.x * FLIGHT.ROLL_AMP * amp * Math.sin(ph + Math.PI / 3); // (amp starts at 0)
  const shed = ss(FLIGHT.SHED_FROM, FLIGHT.SHED_TO, e);
  return { x, y, scale, squash, roll, shed, u };
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
  const hx = half.x * p.scale, hy = half.y * p.scale * Math.max(1, p.squash);
  return Math.abs(cx + p.x) - hx > 1 || Math.abs(cy + p.y) - hy > 1;
}
