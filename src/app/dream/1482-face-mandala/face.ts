// face.ts — MediaPipe FaceLandmarker v2 loaded at RUNTIME from a CDN.
//
// The @mediapipe/tasks-vision package is NOT an npm dependency. We import it
// from a CDN at runtime via a dynamic ESM import whose URL is held in a
// non-static variable + `/* webpackIgnore: true */`, so `next build` never
// tries to resolve or bundle it. All MediaPipe objects are typed `any` (there
// are no bundled @types for this runtime module).
//
// FaceLandmarker gives us, per video frame:
//   • faceBlendshapes[0].categories[] — the 52 ARKit-style coefficients
//     (jawOpen, browInnerUp, mouthSmileLeft, eyeBlinkLeft, mouthPucker, …).
//   • facialTransformationMatrixes[0].data — a column-major 4×4 head-pose matrix
//     from which we read yaw / pitch / roll.

// URLs kept as plain variables so webpack cannot statically analyse them.
const VISION_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/vision_bundle.mjs";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** The facial-affect drive that the mandala + synth both read. All 0..1 unless
 *  noted; yaw/pitch/roll are radians. `present` is false when no face is seen. */
export interface FaceDrive {
  jawOpen: number;
  smile: number; // avg of mouthSmileLeft/Right
  browInnerUp: number;
  browDown: number; // avg of browDownLeft/Right
  pucker: number; // mouthPucker
  blinkL: number;
  blinkR: number;
  yaw: number;
  pitch: number;
  roll: number;
  present: boolean;
}

export function neutralDrive(): FaceDrive {
  return {
    jawOpen: 0,
    smile: 0,
    browInnerUp: 0,
    browDown: 0,
    pucker: 0,
    blinkL: 0,
    blinkR: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    present: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FaceLandmarkerLike = any;

/** Load the MediaPipe module + create a single-face VIDEO-mode landmarker that
 *  emits blendshapes and head pose. Throws on CDN/WebGL failure — callers MUST
 *  catch and fall back to the synthetic self-demo. */
export async function createLandmarker(): Promise<FaceLandmarkerLike> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vision: any = await import(/* webpackIgnore: true */ VISION_URL);
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoreOf(cats: any[], name: string): number {
  for (const c of cats) if (c.categoryName === name) return c.score as number;
  return 0;
}

/** Decompose the column-major 4×4 head-pose matrix into yaw/pitch/roll. */
function poseFromMatrix(m: number[]): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  // element[row + col*4]
  const r00 = m[0];
  const r10 = m[1];
  const r11 = m[5];
  const r12 = m[9];
  const r02 = m[8];
  const r22 = m[10];
  const yaw = Math.atan2(r02, r22);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -r12)));
  const roll = Math.atan2(r10, r00 === 0 && r11 === 0 ? 1 : r00);
  return { yaw, pitch, roll };
}

/** Read one detect result into a FaceDrive. Returns a neutral (absent) drive
 *  when no face is present. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function driveFromResult(res: any): FaceDrive {
  const cats = res?.faceBlendshapes?.[0]?.categories as
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | any[]
    | undefined;
  if (!cats || cats.length === 0) return neutralDrive();
  const mtx = res?.facialTransformationMatrixes?.[0]?.data as
    | number[]
    | undefined;
  const pose = mtx && mtx.length >= 16 ? poseFromMatrix(mtx) : { yaw: 0, pitch: 0, roll: 0 };
  return {
    jawOpen: scoreOf(cats, "jawOpen"),
    smile: 0.5 * (scoreOf(cats, "mouthSmileLeft") + scoreOf(cats, "mouthSmileRight")),
    browInnerUp: scoreOf(cats, "browInnerUp"),
    browDown: 0.5 * (scoreOf(cats, "browDownLeft") + scoreOf(cats, "browDownRight")),
    pucker: scoreOf(cats, "mouthPucker"),
    blinkL: scoreOf(cats, "eyeBlinkLeft"),
    blinkR: scoreOf(cats, "eyeBlinkRight"),
    yaw: pose.yaw,
    pitch: pose.pitch,
    roll: pose.roll,
    present: true,
  };
}

/** Synthetic self-demo: drive the SAME blendshape values from slow sine LFOs so
 *  the mandala always blooms and sings when camera / CDN are unavailable. */
export function demoDrive(tSec: number, calm: boolean): FaceDrive {
  const s = calm ? 0.5 : 1; // reduced-motion: gentler swings
  const jaw = 0.5 + 0.5 * Math.sin(tSec * 0.31);
  const smile = 0.5 + 0.5 * Math.sin(tSec * 0.17 + 1.3);
  const brow = 0.5 + 0.5 * Math.sin(tSec * 0.11 + 2.1);
  const pucker = 0.5 + 0.5 * Math.sin(tSec * 0.23 + 4.0);
  // an occasional slow "blink" pulse
  const blinkPhase = (tSec * 0.37) % 1;
  const blink = blinkPhase > 0.94 ? (blinkPhase - 0.94) / 0.06 : 0;
  return {
    jawOpen: jaw * 0.85 * s + 0.05,
    smile: Math.max(0, smile - 0.35) * 1.4 * s,
    browInnerUp: Math.max(0, brow - 0.4) * 1.3 * s,
    browDown: Math.max(0, -Math.sin(tSec * 0.11 + 2.1)) * 0.4 * s,
    pucker: Math.max(0, pucker - 0.55) * 1.8 * s,
    blinkL: blink,
    blinkR: blink,
    yaw: Math.sin(tSec * 0.13) * 0.5 * s,
    pitch: Math.sin(tSec * 0.09 + 1) * 0.28 * s,
    roll: Math.sin(tSec * 0.07 + 2) * 0.3 * s,
    present: true,
  };
}
