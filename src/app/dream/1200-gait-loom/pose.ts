// ─────────────────────────────────────────────────────────────────────────────
// pose.ts — MediaPipe PoseLandmarker (CDN, runtime) → a stream of 33 landmarks.
//
//   Loads @mediapipe/tasks-vision from a CDN at runtime (NOT an npm dep) via a
//   webpackIgnore'd dynamic import, runs it in VIDEO mode for a single body, and
//   hands each frame's 33 normalized landmarks straight to the gait engine. The
//   loader tries the GPU delegate first and falls back to CPU. Everything
//   degrades: if the camera is denied or the model won't load, the caller drives
//   the SAME gait clock + granular loom from on-screen limb pads / spacebar.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}
interface PoseResult {
  landmarks: Landmark[][];
}
interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface CreateOptions {
  baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
  runningMode: "VIDEO" | "IMAGE";
  numPoses?: number;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: CreateOptions,
    ): Promise<PoseLandmarkerInst>;
  };
}

async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const mod = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_CDN
  )) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const opts = (delegate: "GPU" | "CPU"): CreateOptions => ({
    baseOptions: { modelAssetPath: POSE_MODEL, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  try {
    return await mod.PoseLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch {
    return await mod.PoseLandmarker.createFromOptions(fileset, opts("CPU"));
  }
}

/** Standard MediaPipe Pose landmark indices we care about. */
export const LM = {
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

/** Skeleton bone pairs for the faint overlay (a reduced, stable subset). */
export const BONES: [number, number][] = [
  [11, 12], // shoulders
  [11, 23],
  [12, 24], // torso sides
  [23, 24], // hips
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [23, 25],
  [25, 27], // left leg
  [24, 26],
  [26, 28], // right leg
  [27, 31],
  [28, 32], // feet
];

export interface PoseFrame {
  present: boolean;
  landmarks: Landmark[] | null;
}

const ABSENT: PoseFrame = { present: false, landmarks: null };

export interface PoseRig {
  video: HTMLVideoElement;
  ready(): boolean;
  read(): PoseFrame;
  stop(): void;
}

function makeCameraRig(
  landmarker: PoseLandmarkerInst,
  video: HTMLVideoElement,
  stream: MediaStream,
): PoseRig {
  let lastTs = -1;
  let last: PoseFrame = ABSENT;

  const read = (): PoseFrame => {
    try {
      const ts = performance.now();
      if (ts === lastTs || video.videoWidth === 0) return last;
      lastTs = ts;
      const res = landmarker.detectForVideo(video, ts);
      const lm = res.landmarks[0] ?? null;
      last = lm ? { present: true, landmarks: lm } : ABSENT;
      return last;
    } catch {
      return last;
    }
  };

  return {
    video,
    ready: () => video.videoWidth > 0,
    read,
    stop() {
      try {
        landmarker.close();
      } catch {
        /* already closed */
      }
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

export interface PoseStartResult {
  rig: PoseRig | null;
  /** Non-null when the camera path failed and the caller must use the pads. */
  fallbackReason: string | null;
}

/** Try camera + PoseLandmarker; on any failure, report the reason for the pads. */
export async function startPose(): Promise<PoseStartResult> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return { rig: null, fallbackReason: "No camera API on this device." };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
    });
  } catch {
    return {
      rig: null,
      fallbackReason:
        "Camera access was denied — drive the loom with the limb pads or spacebar instead.",
    };
  }

  const video = document.createElement("video");
  video.style.display = "none";
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.videoWidth > 0) {
        resolve();
        return;
      }
      const onReady = () => {
        video.removeEventListener("loadeddata", onReady);
        resolve();
      };
      video.addEventListener("loadeddata", onReady);
    });
  } catch {
    for (const tr of stream.getTracks()) tr.stop();
    return { rig: null, fallbackReason: "The camera stream could not start." };
  }

  let landmarker: PoseLandmarkerInst;
  try {
    landmarker = await createLandmarker();
  } catch {
    for (const tr of stream.getTracks()) tr.stop();
    return {
      rig: null,
      fallbackReason:
        "The body-tracking model failed to load — using the limb pads.",
    };
  }

  return { rig: makeCameraRig(landmarker, video, stream), fallbackReason: null };
}
