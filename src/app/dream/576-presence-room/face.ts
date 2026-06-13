// face.ts — head-pose extraction for 576-presence-room.
//
// Turns a MediaPipe FaceLandmarker result (a flat array of normalised
// {x,y,z} points) into a smoothed head POSE the audio listener can ride:
//
//   pos.x / pos.y  — virtual listener translation in the horizontal plane,
//                    derived from where the face sits in the camera frame.
//   pos.z          — forward/back, derived from face SCALE (eye distance):
//                    lean closer → move into the field.
//   yaw            — left/right turn, from the asymmetry of the two eyes
//                    relative to the nose (a turned head foreshortens one side).
//   pitch          — up/down tilt, from the eye-to-nose vertical span.
//
// Everything is EMA-smoothed (heavy, alpha ~0.15) so the room breathes around
// you instead of twitching. No thresholds, no triggers — this prototype has
// nothing to "get wrong"; pose is a continuous field.

// ── Landmark shape (subset; MediaPipe gives ~478 of these) ───────────────────

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

// Canonical FaceLandmarker indices we rely on.
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33; // subject's right eye in a mirrored selfie
const RIGHT_EYE_OUTER = 263; // subject's left eye
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const CHIN = 152;
const FOREHEAD = 10;

// ── Smoothed pose ────────────────────────────────────────────────────────────

export interface HeadPose {
  // Listener translation (world units; small — the room is intimate).
  x: number;
  y: number;
  z: number;
  // Orientation (radians-ish; we keep them modest and feed forward vector).
  yaw: number; // + = looking right
  pitch: number; // + = looking up
  // 0..1 confidence-ish presence (1 when a face is tracked / demo active).
  presence: number;
}

const EMA_ALPHA = 0.15; // heavy smoothing → alive, not jittery.

export class HeadPoseTracker {
  private pose: HeadPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, presence: 0 };

  /** Current smoothed pose (read every render frame). */
  get current(): HeadPose {
    return this.pose;
  }

  /** Feed a raw landmark array from MediaPipe. Returns the smoothed pose. */
  updateFromLandmarks(lm: Landmark[]): HeadPose {
    if (!lm || lm.length < 400) {
      // Lost the face — decay presence but hold last pose.
      this.ema({ ...this.poseTargetHold(), presence: 0 });
      return this.pose;
    }

    const nose = lm[NOSE_TIP];
    const lOut = lm[LEFT_EYE_OUTER];
    const rOut = lm[RIGHT_EYE_OUTER];
    const lIn = lm[LEFT_EYE_INNER];
    const rIn = lm[RIGHT_EYE_INNER];
    const chin = lm[CHIN];
    const brow = lm[FOREHEAD];

    // Eye centroid in normalised screen space (0..1).
    const eyeCx = (lOut.x + rOut.x) / 2;
    const eyeCy = (lOut.y + rOut.y) / 2;

    // Face scale: inter-eye distance. Bigger = closer.
    const eyeDist = Math.hypot(rOut.x - lOut.x, rOut.y - lOut.y);
    // Map eyeDist (~0.12 far .. ~0.28 close) to forward translation.
    const closeness = clamp((eyeDist - 0.12) / 0.14, -1, 1.5);

    // --- Translation in the plane ---
    // Camera is mirrored (selfie), so leaning your head LEFT (your left) moves
    // the eye centroid to the RIGHT of the frame. We map screen-x directly so
    // the field tracks the side of the frame you occupy; sign chosen so leaning
    // toward a voice blooms it.
    const tx = (eyeCx - 0.5) * 4.0; // ±~2 units across the frame
    const ty = -(eyeCy - 0.42) * 2.5; // up in frame → up a touch
    const tz = -closeness * 2.2; // closer face → move forward (−z is "into")

    // --- Yaw: left/right turn ---
    // When you turn right, your left eye (RIGHT_EYE_OUTER) foreshortens toward
    // the nose and your right eye widens. Compare each eye's horizontal span
    // from the nose.
    const leftSpan = Math.abs(nose.x - lOut.x);
    const rightSpan = Math.abs(rOut.x - nose.x);
    const asym = (rightSpan - leftSpan) / (rightSpan + leftSpan + 1e-4);
    const yaw = clamp(asym * 2.4, -1.4, 1.4);

    // --- Pitch: up/down tilt ---
    // Vertical position of nose between brow and chin. Centre ≈ 0.5.
    const span = chin.y - brow.y + 1e-4;
    const noseRel = (nose.y - brow.y) / span; // ~0.45 neutral
    const pitch = clamp(-(noseRel - 0.5) * 3.2, -1.2, 1.2);

    // (lIn / rIn referenced to keep the inner-eye landmarks meaningful for
    //  future refinement and to avoid silent index drift.)
    void lIn;
    void rIn;

    this.ema({ x: tx, y: ty, z: tz, yaw, pitch, presence: 1 });
    return this.pose;
  }

  /** Feed a directly-computed target pose (used by drag + auto-demo). */
  updateFromTarget(target: HeadPose): HeadPose {
    this.ema(target);
    return this.pose;
  }

  private poseTargetHold(): HeadPose {
    return { ...this.pose };
  }

  private ema(t: HeadPose): void {
    const a = EMA_ALPHA;
    this.pose = {
      x: lerp(this.pose.x, t.x, a),
      y: lerp(this.pose.y, t.y, a),
      z: lerp(this.pose.z, t.z, a),
      yaw: lerp(this.pose.yaw, t.yaw, a),
      pitch: lerp(this.pose.pitch, t.pitch, a),
      presence: lerp(this.pose.presence, t.presence, a),
    };
  }

  reset(): void {
    this.pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, presence: 0 };
  }
}

// ── Auto-demo path ────────────────────────────────────────────────────────────
// A gentle Lissajous head-turn so the chord audibly orbits within seconds.
// Returns a target pose for HeadPoseTracker.updateFromTarget.

export function demoPose(tSec: number): HeadPose {
  const yaw = Math.sin(tSec * 0.45) * 1.1;
  const pitch = Math.sin(tSec * 0.31 + 1.0) * 0.45;
  // Slowly drift the body too, so translation-based blooming happens.
  const x = Math.sin(tSec * 0.23) * 1.4;
  const z = Math.sin(tSec * 0.17 + 0.7) * 0.9 - 0.2;
  return { x, y: 0, z, yaw, pitch, presence: 1 };
}

// ── Pointer-drag → pose ────────────────────────────────────────────────────────
// Drag across the canvas to "look around". dx/dy are −1..1 (normalised from
// the canvas centre); we map them to yaw/pitch and a little translation.

export function dragPose(nx: number, ny: number): HeadPose {
  const yaw = clamp(nx * 1.3, -1.4, 1.4);
  const pitch = clamp(-ny * 0.9, -1.2, 1.2);
  const x = nx * 1.6;
  const z = -Math.abs(ny) * 0.6;
  return { x, y: 0, z, yaw, pitch, presence: 1 };
}

// ── Small math helpers ─────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
