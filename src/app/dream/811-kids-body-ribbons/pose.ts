// MediaPipe Tasks-Vision loaded from CDN at runtime via webpackIgnore — never in package.json.
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface Landmark { x: number; y: number; z: number; visibility?: number; }
interface PoseResult { landmarks: Landmark[][]; }
export interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown>; };
  PoseLandmarker: {
    createFromOptions(fileset: unknown, opts: {
      baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
      runningMode: "VIDEO" | "IMAGE"; numPoses?: number;
    }): Promise<PoseLandmarkerInst>;
  };
}

export const LM = {
  nose: 0, leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28,
} as const;

export async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const visionMod = (await import(/* webpackIgnore: true */ MEDIAPIPE_CDN)) as unknown as MediaPipeVision;
  const fileset = await visionMod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return visionMod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO", numPoses: 1,
  });
}

export interface Pt { x: number; y: number; z: number; v: number; }
export type Body = Record<number, Pt>;

export function bodyFromLandmarks(lm: Landmark[]): Body {
  const b: Body = {};
  for (let i = 0; i < lm.length; i++) {
    const p = lm[i];
    b[i] = { x: (0.5 - p.x) * 2, y: (0.5 - p.y) * 2, z: p.z, v: p.visibility ?? 1 };
  }
  return b;
}

export function makeGhostBody(t: number): Body {
  const sw = 0.3;
  const breathe = Math.sin(t * 0.4) * 0.05;
  const lArm = t * 0.5, rArm = t * 0.44 + Math.PI * 0.7;
  const reach = 0.55 + Math.sin(t * 0.3) * 0.4;
  const shY = 0.34 + breathe, hipY = -0.2 + breathe;
  const lW = { x: sw + Math.cos(lArm) * reach + 0.1, y: shY + Math.sin(lArm) * reach };
  const rW = { x: -sw - Math.cos(rArm) * reach - 0.1, y: shY + Math.sin(rArm) * reach };
  const mk = (x: number, y: number, z = 0): Pt => ({ x, y, z, v: 1 });
  const b: Body = {};
  b[LM.nose] = mk(Math.sin(t * 0.35) * 0.06, shY + 0.45);
  b[LM.leftShoulder] = mk(sw, shY); b[LM.rightShoulder] = mk(-sw, shY);
  b[LM.leftElbow] = mk((sw + lW.x) / 2, (shY + lW.y) / 2);
  b[LM.rightElbow] = mk((-sw + rW.x) / 2, (shY + rW.y) / 2);
  b[LM.leftWrist] = mk(lW.x, lW.y); b[LM.rightWrist] = mk(rW.x, rW.y);
  b[LM.leftHip] = mk(sw * 0.7, hipY); b[LM.rightHip] = mk(-sw * 0.7, hipY);
  const legSwing = Math.sin(t * 0.6) * 0.12;
  b[LM.leftKnee] = mk(sw * 0.7 + legSwing, hipY - 0.35);
  b[LM.rightKnee] = mk(-sw * 0.7 - legSwing, hipY - 0.35);
  b[LM.leftAnkle] = mk(sw * 0.7 + legSwing, hipY - 0.7);
  b[LM.rightAnkle] = mk(-sw * 0.7 - legSwing, hipY - 0.7);
  return b;
}
