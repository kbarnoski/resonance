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
// flying" … "compare it against the science of showing a similar bird
// flying"). The emblem is a small yellow songbird (goldfinch / canary-like),
// so the motion follows SMALL-PASSERINE FLAP-BOUNDING flight:
//
//  • INTERMITTENT FLIGHT: bursts of flapping separated by BOUNDS with the wings
//    FOLDED against the body (Tobalske, Peacock & Dial 1999, "Kinematics of
//    flap-bounding flight in the zebra finch over a wide range of speeds",
//    J Exp Biol 202:1725-1739; Rayner 1985, "Bounding and undulating flight in
//    birds", J Theor Biol 117:47-77). The American goldfinch gives two to five
//    wingbeats per burst, folds its wings and coasts — rising on the burst,
//    sinking through the bound: the undulating path (Audubon field guide /
//    Cornell "All About Birds", American Goldfinch). → takeoff burst of
//    TAKEOFF_STROKES, then PATTERN_FLAPS + a folded BOUND; the body path
//    undulates (UNDULATE): rising through a burst, sinking through the bound.
//  • DOWNSTROKE: the wing fully extended and swept forward-down (protraction,
//    SWEEP_FWD); the power stroke is quicker than the recovery (DOWN_SHARE 40 %).
//  • UPSTROKE: passerines flex the wing at the wrist (a "flexed-wing upstroke"
//    at all speeds in the zebra finch, Tobalske et al. 1999) — the hand folds
//    in toward the body and back, reducing span (FLEX, FLEX_SWEEP, WRIST) —
//    not a rigid paddle; the tip trails the root (TIP_LAG_SEC).
//  • TAKEOFF: body pitched nose-up, levelling as speed builds (body angle falls
//    with flight speed in the same studies) — PITCH_TAKEOFF → PITCH_CRUISE; the
//    tail SPREAD at takeoff / slow flight, closed in cruise (TAIL_SPREAD).
//  • RATE IS STYLISED: real small-passerine wingbeats run ~15-25 Hz; here ≤ 2.2
//    strokes/s (the seizure law — a bright wing sweeping the same spot ≥ 3×/s
//    read as flicker on the photosensitive meter). The SHAPE is the science;
//    the takeoff burst runs on the song's beat, the cruise on the half-beat.
//    The folded bound also takes the bright wing out of the sweep.
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
  /** the tail base (the body axis runs head → tail) */
  tail: readonly [number, number];
  /** the tail's tip (the tail fans about the base → tip line) */
  tailTip: readonly [number, number];
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
    wing: { view: "side", head: [0.41, 0.45], tail: [0.64, 0.61], tailTip: [0.79, 0.7], shoulder: [0.51, 0.465], tip: [0.79, 0.21], aMin: -0.1, aMax: 0.2, soft: 0.035 },
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
  /** after the flight (off-frame) the image lets go over ~this; the flown motes
   *  are respawned unseen (engine releaseFlight) and the field rebuilds */
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
  // ≤ 2.2 strokes/s: a bright wing sweeping the same spot 3×/s read as flicker
  // on the photosensitive meter (Karel's seizure law) — takeoff = the beat,
  // cruise = half the beat
  TAKEOFF_HZ_MIN: 1.5,
  TAKEOFF_HZ_MAX: 2.2,
  CRUISE_HZ_MIN: 0.8,
  CRUISE_HZ_MAX: 1.4,
  TAKEOFF_EASE: 0.6,
  /** downstroke share of a stroke (real birds: fast power stroke, slower recovery) */
  DOWN_SHARE: 0.4,
  /** wing angle about the hinge at the bottom of the stroke, radians (0 = the
   *  picture's raised wing; π/2 = toward the viewer; > π/2 = below the back) */
  DOWN_TAKEOFF: 1.8,
  DOWN_CRUISE: 1.5,
  /** continuous takeoff strokes before the burst / bound pattern */
  TAKEOFF_STROKES: 3,
  /** the pattern: a burst of this many flaps, then a folded BOUND this many stroke-lengths long */
  PATTERN_FLAPS: 2,
  BOUND_STROKES: 0.75,
  /** bound: the folded wing lies on the back, barely raised (radians about the hinge) */
  BOUND_ANGLE: 0.25,
  /** the wings fold into a bound over the flight's last seconds (it coasts away) */
  FINAL_BOUND_SEC: 0.8,
  /** the tip trails the root by this (the wing's flex) */
  TIP_LAG_SEC: 0.06,
  /** the body lifts this much (image units) at the bottom of the downstroke */
  BOB: 0.02,
  /** the undulating path: rise through a burst, sink through the bound (image units) */
  UNDULATE: 0.05,
  /** the wrist: this share of the wing from the hinge is the arm; beyond it the hand */
  WRIST: 0.45,
  /** upstroke: the hand folds in (span loss) and back toward the tail */
  FLEX: 0.55,
  FLEX_SWEEP: 0.35,
  /** downstroke: the extended wing sweeps forward (toward the head) */
  SWEEP_FWD: 0.12,
  /** bound: the wing's height above the hinge shrinks to this share, and it lies back along the body */
  FOLD_R: 0.12,
  FOLD_A: 0.5,
  /** takeoff: the tail fans (its width × 1 + this at the tip) */
  TAIL_SPREAD: 0.6,
  /** body pitch, radians nose-up: steep at takeoff, levelling into cruise */
  PITCH_TAKEOFF: 0.35,
  PITCH_CRUISE: 0.08,
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
  /** in-plane body pitch, radians (nose-up for the way it faces) */
  pitch: number;
  /** 0..1 progress of the travel */
  u: number;
}

export const REST_POSE: FlightPose = { x: 0, y: 0, scale: 1, shed: 0, pitch: 0, u: 0 };

/** Body pitch magnitude `e` s after liftoff: rises to PITCH_TAKEOFF, levels to PITCH_CRUISE. */
export function pitchAt(e: number): number {
  if (!(e > 0)) return 0;
  const lv = ss(0.6, 2.2, e);
  return FLIGHT.PITCH_TAKEOFF * ss(0, 0.5, e) * (1 - lv) + FLIGHT.PITCH_CRUISE * lv;
}

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
  // nose-up for the way it faces: facing left (dir.x −1) = a clockwise turn (negative angle)
  const pitch = f.dir.x * pitchAt(e);
  return { x, y, scale, shed, pitch, u };
}

/** The emblem is worn while the bird flies (1), then — off-frame — released at once (0): its motes are
 *  respawned unseen and the image eases out (no stream back across the frame). */
export function flightHold(e: number, sec: number = FLIGHT.OPEN_SEC): number {
  return e > 0 && e < sec ? 1 : 0;
}

/** Has the flight ended (the bird off-frame) — time to release its motes? */
export function flightReleased(e: number, sec: number): boolean {
  return e >= sec;
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

/** Stroke rates (Hz) from the tempo: takeoff = the beat, cruise = half the beat. */
export function strokeHz(bpm?: number): { takeoff: number; cruise: number } {
  const b = bpm && bpm > 0 ? bpm / 60 : 1.8;
  return {
    takeoff: clamp(b, FLIGHT.TAKEOFF_HZ_MIN, FLIGHT.TAKEOFF_HZ_MAX),
    cruise: clamp(b / 2, FLIGHT.CRUISE_HZ_MIN, FLIGHT.CRUISE_HZ_MAX),
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

export type StrokeKind = "rest" | "flap" | "bound";

export interface WingState {
  /** hinge angle, radians (0 = the picture's raised wing) */
  angle: number;
  /** 0..1 upstroke wrist flex (the hand folds in and back) */
  flex: number;
  /** 0..1 bound fold (the wing lies along the body) */
  fold: number;
  /** 0..1 downstroke forward sweep */
  sweep: number;
  kind: StrokeKind;
}

const REST_STATE: WingState = { angle: 0, flex: 0, fold: 0, sweep: 0, kind: "rest" };
const sin2 = (x: number) => { const v = Math.sin(Math.PI * clamp01(x)); return v * v; };

/** Where in the burst / bound pattern `phi` strokes falls. */
function patternAt(phi: number): { kind: "flap" | "bound"; x: number; inBurst: boolean; cyc: number } {
  if (phi < FLIGHT.TAKEOFF_STROKES) return { kind: "flap", x: phi - Math.floor(phi), inBurst: false, cyc: -1 };
  const cyc = FLIGHT.PATTERN_FLAPS + FLIGHT.BOUND_STROKES;
  const c = (phi - FLIGHT.TAKEOFF_STROKES) % cyc;
  if (c < FLIGHT.PATTERN_FLAPS) return { kind: "flap", x: c - Math.floor(c), inBurst: true, cyc: c };
  return { kind: "bound", x: (c - FLIGHT.PATTERN_FLAPS) / FLIGHT.BOUND_STROKES, inBurst: true, cyc: c };
}

/** The wing (root) `e` s after liftoff: the takeoff burst, then bursts + folded bounds; folding into a last bound as it leaves. */
export function wingState(e: number, sec: number, bpm?: number): WingState {
  if (!(e > 0)) return REST_STATE;
  const phi = strokePhase(e, sec, bpm);
  const down = FLIGHT.DOWN_TAKEOFF + (FLIGHT.DOWN_CRUISE - FLIGHT.DOWN_TAKEOFF) * ss(0, sec * FLIGHT.TAKEOFF_EASE, e);
  const at = patternAt(phi);
  let angle = 0, flex = 0, fold = 0, sweep = 0;
  let kind: StrokeKind = at.kind;
  if (at.kind === "flap") {
    angle = flapAngle(at.x, down);
    const D = FLIGHT.DOWN_SHARE;
    if (at.x < D) sweep = sin2(at.x / D); // downstroke: extended, swept forward
    else flex = sin2((at.x - D) / (1 - D)); // upstroke: flexed at the wrist
  } else {
    // the BOUND: fold in, coast, open again at the top for the next downstroke
    fold = ss(0, 0.25, at.x) * (1 - ss(0.75, 1, at.x));
    angle = FLIGHT.BOUND_ANGLE * fold;
  }
  // leaving: fold into a last bound (it coasts away)
  const k = ss(sec - FLIGHT.FINAL_BOUND_SEC, sec, e);
  if (k > 0) {
    angle += (FLIGHT.BOUND_ANGLE - angle) * k;
    fold += (1 - fold) * k;
    flex *= 1 - k;
    sweep *= 1 - k;
    if (k >= 1) kind = "bound";
  }
  return { angle, flex, fold, sweep, kind };
}

/** Back-compat: the root angle + stroke kind. */
export function wingRootAngle(e: number, sec: number, bpm?: number): { angle: number; kind: StrokeKind } {
  const w = wingState(e, sec, bpm);
  return { angle: w.angle, kind: w.kind };
}

/** The undulating path (image units, up): rising through each burst, sinking through the bound. */
export function undulation(e: number, sec: number, bpm?: number): number {
  if (!(e > 0)) return 0;
  const at = patternAt(strokePhase(e, sec, bpm));
  if (!at.inBurst) return 0; // the takeoff climbs on the path itself
  // crest at the end of the burst, trough at the start of the next (C¹: zero slope at both)
  const g = at.kind === "flap" ? 0.5 * (at.cyc / FLIGHT.PATTERN_FLAPS) : 0.5 + 0.5 * at.x;
  const h = FLIGHT.UNDULATE * (1 - Math.cos(2 * Math.PI * g)) / 2;
  return h * (1 - ss(sec - FLIGHT.FINAL_BOUND_SEC, sec, e));
}

/** The tail fan `e` s after liftoff: spread at takeoff, closed in cruise. */
export function tailSpread(e: number): number {
  if (!(e > 0)) return 0;
  return ss(0, 0.4, e) * (1 - ss(1.2, 2.6, e));
}

export interface WingPose {
  /** hinge angle at the wing root / tip, radians (0 = the picture's wing) */
  root: number;
  tip: number;
  /** body lift, image units (up): the downstroke's lift + the undulating path */
  bob: number;
  /** 0..1 upstroke wrist flex, bound fold, downstroke forward sweep, tail fan */
  flex: number;
  fold: number;
  sweep: number;
  tail: number;
}

export const REST_WINGS: WingPose = { root: 0, tip: 0, bob: 0, flex: 0, fold: 0, sweep: 0, tail: 0 };

/** The wings `e` s after liftoff: the tip trails the root (TIP_LAG_SEC); the body lifts as the wings go down. */
export function wingPose(e: number, sec: number, bpm?: number): WingPose {
  const w = wingState(e, sec, bpm);
  const tip = wingState(e - FLIGHT.TIP_LAG_SEC, sec, bpm).angle;
  const lift = FLIGHT.BOB * clamp(w.angle / FLIGHT.DOWN_CRUISE, 0, 1.2) * (1 - w.fold); // (no stroke lift in a bound)
  const bob = lift + undulation(e, sec, bpm);
  return { root: w.angle, tip, bob, flex: w.flex, fold: w.fold, sweep: w.sweep, tail: tailSpread(e) };
}

/** The anatomy in the engine's terms: q-space (aspect-true, image-centred, y UP). */
export interface WingFrame {
  hinge: [number, number]; axis: [number, number]; normal: [number, number];
  aMin: number; aMax: number; rMax: number; soft: number;
  tailBase: [number, number]; tailDir: [number, number]; tailLen: number;
}

/** Image fraction (y down) → q-space (x scaled by the aspect, centred, y up) — the GLSL does the same from the mote's uv. */
export function toQ(p: readonly [number, number], imgAspect = 1): [number, number] {
  return [(p[0] - 0.5) * imgAspect, 0.5 - p[1]];
}

export function wingFrame(w: WingAnatomy, imgAspect = 1): WingFrame {
  const h = toQ(w.shoulder, imgAspect), a = toQ(w.head, imgAspect), b = toQ(w.tail, imgAspect), t = toQ(w.tip, imgAspect), tt = toQ(w.tailTip, imgAspect);
  let dx = b[0] - a[0], dy = b[1] - a[1];
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl; dy /= dl;
  let nx = -dy, ny = dx;
  if ((t[0] - h[0]) * nx + (t[1] - h[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const rMax = Math.max(0.05, (t[0] - h[0]) * nx + (t[1] - h[1]) * ny);
  const tl = Math.hypot(tt[0] - b[0], tt[1] - b[1]) || 1;
  return {
    hinge: h, axis: [dx, dy], normal: [nx, ny], aMin: w.aMin, aMax: w.aMax, rMax, soft: w.soft,
    tailBase: b, tailDir: [(tt[0] - b[0]) / tl, (tt[1] - b[1]) / tl], tailLen: tl,
  };
}

/** The shader's constants, in the order the engine uploads them (uWingK, uWingK2). */
export const WING_K = [FLIGHT.FLEX, FLIGHT.FLEX_SWEEP, FLIGHT.SWEEP_FWD, FLIGHT.FOLD_R] as const;
export const WING_K2 = [FLIGHT.FOLD_A, FLIGHT.TAIL_SPREAD, FLIGHT.WRIST, 0] as const;

/**
 * A mote's displacement in q-space — the GLSL in shaders.ts (wingDisp) mirrors
 * this exactly: [dx, dy] in the picture plane, dz toward the viewer.
 *  • the WING (above the hinge, within the along-axis band): its shape first
 *    (upstroke wrist flex: the hand shortens + sweeps back; downstroke: swept
 *    forward; bound: folded onto the back toward the tail), then turned about
 *    the hinge (root → tip angle: the flex along the wing);
 *  • the TAIL fans about its base → tip line (takeoff);
 *  • `withBob`: the body lift + undulation (every mote — the wings ride on the body).
 */
export function wingDisplacement(q: readonly [number, number], fr: WingFrame, w: WingPose, withBob = true): [number, number, number] {
  const rx = q[0] - fr.hinge[0], ry = q[1] - fr.hinge[1];
  const a = rx * fr.axis[0] + ry * fr.axis[1];
  const r = rx * fr.normal[0] + ry * fr.normal[1];
  const inWing = ss(0, fr.soft, r) * ss(fr.aMin - 0.04, fr.aMin, a) * (1 - ss(fr.aMax, fr.aMax + 0.04, a));
  let dx = 0, dy = 0, dz = 0;
  if (inWing > 0) {
    const hand = Math.max(0, r - FLIGHT.WRIST * fr.rMax);
    let rr = r - hand * FLIGHT.FLEX * w.flex;
    let aa = a + hand * FLIGHT.FLEX_SWEEP * w.flex - FLIGHT.SWEEP_FWD * r * w.sweep;
    rr += (FLIGHT.FOLD_R * r - rr) * w.fold;
    aa += FLIGHT.FOLD_A * r * w.fold;
    const th = w.root + (w.tip - w.root) * ss(0, 1, r / fr.rMax);
    const da = (aa - a) * inWing, dr = (rr * Math.cos(th) - r) * inWing;
    dx = fr.axis[0] * da + fr.normal[0] * dr;
    dy = fr.axis[1] * da + fr.normal[1] * dr;
    dz = rr * Math.sin(th) * inWing;
  }
  if (w.tail > 0) {
    const tx = q[0] - fr.tailBase[0], ty = q[1] - fr.tailBase[1];
    const t = (tx * fr.tailDir[0] + ty * fr.tailDir[1]) / fr.tailLen;
    const pp = -tx * fr.tailDir[1] + ty * fr.tailDir[0];
    const wt = ss(-0.05, 0.15, t) * (1 - ss(1.0, 1.15, t)) * (1 - ss(0.08, 0.14, Math.abs(pp)));
    const k = pp * FLIGHT.TAIL_SPREAD * w.tail * Math.max(0, t) * wt;
    dx += -fr.tailDir[1] * k;
    dy += fr.tailDir[0] * k;
  }
  if (withBob) dy += w.bob;
  return [dx, dy, dz];
}
