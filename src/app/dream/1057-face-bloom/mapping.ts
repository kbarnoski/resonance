// ─────────────────────────────────────────────────────────────────────────────
// mapping.ts — facial EXPRESSION + head pose → form-constant parameters.
//
//   1057-face-bloom turns the face into the controller for a log-polar form-
//   constant kaleidoscope (see ../_shared/psych/logpolar). MediaPipe's Face
//   Landmarker emits 52 ARKit-style blendshape coefficients in [0,1] plus a
//   4×4 facial-transformation matrix (head pose). This module distills those
//   into the handful of expressive parameters the renderer + audio read, and
//   defines the neutral/idle resting state so the instrument is quiet & near-
//   still until you emote.
//
//   No DOM, no React — pure data transforms, easy to reason about & test.
// ─────────────────────────────────────────────────────────────────────────────

import { FORM_CONSTANTS, type FormConstant } from "../_shared/psych/logpolar";

/** The expressive control vector the rest of the prototype consumes. All
 *  fields are normalized to a comfortable working range (mostly [0,1]). */
export interface FaceParams {
  /** Mouth openness → kaleidoscope fold-count bloom + audio swell. [0,1] */
  jawOpen: number;
  /** Inner-brow raise → form-constant freq (ring/spoke density) + warmth. [0,1] */
  browUp: number;
  /** Eye openness (1 = wide, 0 = closed) → entropy / fine detail. [0,1] */
  eyeOpen: number;
  /** Smile width → palette push toward gold + bloom radius. [0,1] */
  smile: number;
  /** Head yaw, left/right turn. ~[-1,1] (left negative). */
  yaw: number;
  /** Head roll, ear-to-shoulder tilt. ~[-1,1] (CCW negative). */
  roll: number;
  /** Head pitch, nod. ~[-1,1] (down negative). */
  pitch: number;
  /** A deliberate slow squint (both eyes mostly shut, held) → opt-in shimmer
   *  trigger amount. [0,1] — only meaningful when the shimmer toggle is on. */
  squint: number;
  /** Is a face currently detected at all? Drives the idle/quiet fallback. */
  present: boolean;
}

/** Resting/idle state: no face, neutral everything. The instrument should be
 *  near-silent and near-still here. */
export function neutralParams(): FaceParams {
  return {
    jawOpen: 0,
    browUp: 0,
    eyeOpen: 1,
    smile: 0,
    yaw: 0,
    roll: 0,
    pitch: 0,
    squint: 0,
    present: false,
  };
}

/** A MediaPipe blendshape category. */
export interface Blendshape {
  categoryName: string;
  score: number;
}

function score(map: Map<string, number>, name: string): number {
  return map.get(name) ?? 0;
}

/** Extract yaw/roll/pitch (radians-ish, then normalized) from the column-major
 *  4×4 facial-transformation matrix MediaPipe returns. We only need the upper
 *  3×3 rotation block. Element layout (column-major):
 *    m[0]=r00 m[1]=r10 m[2]=r20  m[4]=r01 m[5]=r11 m[6]=r21  m[8]=r02 m[9]=r12 m[10]=r22
 */
export function poseFromMatrix(m: number[] | Float32Array): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  if (!m || m.length < 11) return { yaw: 0, pitch: 0, roll: 0 };
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];
  // Standard XYZ Euler extraction.
  const pitch = Math.atan2(-r20, Math.hypot(r21, r22)); // up/down nod
  const yaw = Math.atan2(r10, r00); // left/right turn
  const roll = Math.atan2(r21, r22); // tilt
  // Normalize to roughly [-1,1] over a comfortable ±45° range.
  const k = 1 / (Math.PI / 4);
  return {
    yaw: clamp(yaw * k, -1.5, 1.5),
    pitch: clamp(pitch * k, -1.5, 1.5),
    roll: clamp(roll * k, -1.5, 1.5),
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Map raw blendshapes + pose matrix → FaceParams. */
export function paramsFromFace(
  blendshapes: Blendshape[],
  matrix: number[] | Float32Array | null,
): FaceParams {
  const m = new Map<string, number>();
  for (const b of blendshapes) m.set(b.categoryName, b.score);

  const jawOpen = score(m, "jawOpen");
  const browUp = clamp(
    score(m, "browInnerUp") * 0.7 +
      (score(m, "browOuterUpLeft") + score(m, "browOuterUpRight")) * 0.5 * 0.5,
    0,
    1,
  );
  const blinkL = score(m, "eyeBlinkLeft");
  const blinkR = score(m, "eyeBlinkRight");
  const squintL = score(m, "eyeSquintLeft");
  const squintR = score(m, "eyeSquintRight");
  const eyeOpen = clamp(1 - (blinkL + blinkR) * 0.5, 0, 1);
  const smile = clamp((score(m, "mouthSmileLeft") + score(m, "mouthSmileRight")) * 0.5, 0, 1);
  // Deliberate squint = both eyes substantially narrowed via squint OR blink.
  const squint = clamp(
    Math.min(
      (blinkL + squintL * 0.7),
      (blinkR + squintR * 0.7),
    ),
    0,
    1,
  );

  const pose = matrix ? poseFromMatrix(matrix) : { yaw: 0, pitch: 0, roll: 0 };

  return {
    jawOpen,
    browUp,
    eyeOpen,
    smile,
    yaw: pose.yaw,
    roll: pose.roll,
    pitch: pose.pitch,
    squint,
    present: true,
  };
}

/** Derived render/audio drive values. Centralized so the renderer and the
 *  audio engine read the SAME mapping (keeps sight & sound coupled). */
export interface DriveState {
  /** N-fold kaleidoscope count, 2 → ~12. */
  fold: number;
  /** form-constant ring/spoke density. */
  freq: number;
  /** detail / entropy term, [0,1]. */
  entropy: number;
  /** spiral handedness + drift sign from yaw, [-1,1]. */
  handedness: number;
  /** inward come-up phase velocity. */
  phaseVel: number;
  /** continuous morph position across the four form constants, [0,4). */
  formPos: number;
  /** palette warmth 0..1 (more = hotter gold). */
  warmth: number;
  /** overall bloom / brightness, [0,1]. */
  bloom: number;
}

/** The single source of truth that converts FaceParams → DriveState. Both the
 *  renderer and the synth call this, so a smile sounds like it looks. */
export function deriveDrive(p: FaceParams): DriveState {
  const present = p.present ? 1 : 0;
  // Idle damps everything toward the quiet resting field.
  const fold = 2 + p.jawOpen * 10 * present; // 2 → 12
  const freq = 2.2 + p.browUp * 5.5 + p.smile * 1.0;
  const entropy = clamp((1 - p.eyeOpen) * 0.2 + p.browUp * 0.3 + p.jawOpen * 0.3, 0, 1);
  const handedness = clamp(p.yaw, -1, 1);
  // come-up: turning the head inward (pitch down / strong yaw) speeds drift.
  const phaseVel = (0.25 + Math.abs(p.yaw) * 1.4 + p.jawOpen * 0.8) * present;
  // morph across FORM_CONSTANTS via yaw+roll, so head movement tours the geometry.
  const tour = (p.yaw * 0.5 + 0.5) * 2 + (p.roll * 0.5 + 0.5) * 2; // [0,4]
  const formPos = ((tour % FORM_CONSTANTS.length) + FORM_CONSTANTS.length) %
    FORM_CONSTANTS.length;
  const warmth = clamp(0.45 + p.browUp * 0.35 + p.smile * 0.3, 0, 1);
  const bloom = clamp(
    (0.12 + p.jawOpen * 0.55 + p.browUp * 0.25 + p.smile * 0.2) * (0.3 + 0.7 * present),
    0,
    1,
  );
  return { fold, freq, entropy, handedness, phaseVel, formPos, warmth, bloom };
}

/** The two form constants we are currently blending between, plus the blend t,
 *  from a continuous formPos in [0,4). */
export function formBlend(formPos: number): {
  a: FormConstant;
  b: FormConstant;
  t: number;
} {
  const n = FORM_CONSTANTS.length;
  const i = Math.floor(formPos) % n;
  const t = formPos - Math.floor(formPos);
  return { a: FORM_CONSTANTS[i], b: FORM_CONSTANTS[(i + 1) % n], t };
}
