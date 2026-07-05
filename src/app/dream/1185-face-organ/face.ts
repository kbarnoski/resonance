// ─────────────────────────────────────────────────────────────────────────────
// face.ts — MediaPipe FaceLandmarker (CDN, runtime) → expressive vocal controls.
//
//   Loads @mediapipe/tasks-vision from a CDN at runtime (NOT an npm dep) via a
//   webpackIgnore'd dynamic import, runs it in VIDEO mode with blendshapes, and
//   reduces each frame's 52 blendshape coefficients + 468 landmarks to the few
//   signals the formant choir needs:
//
//     jawOpen                        → gate/loudness + vowel openness
//     mouthPucker ↔ mouthSmile*      → vowel front/back (F2 axis)
//     browInnerUp / browOuterUp*     → pitch (scale step)
//     eye-corner geometry            → head roll → pan + pitch bend
//     eyeBlinkLeft & eyeBlinkRight   → a real blink → soft accent
//
//   The 468-point landmark array is passed through for the luminous face mask.
//   Everything degrades: if the camera is denied or the model won't load, the
//   caller drives the SAME engine from on-screen vowel pads.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}
interface Blendshape {
  categoryName: string;
  score: number;
}
interface FaceResult {
  faceLandmarks: Landmark[][];
  faceBlendshapes?: { categories: Blendshape[] }[];
}
interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceResult;
  close(): void;
}
interface CreateOptions {
  baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
  runningMode: "VIDEO" | "IMAGE";
  numFaces?: number;
  outputFaceBlendshapes?: boolean;
  outputFacialTransformationMatrixes?: boolean;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: CreateOptions,
    ): Promise<FaceLandmarkerInst>;
  };
}

async function createLandmarker(): Promise<FaceLandmarkerInst> {
  const mod = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_CDN
  )) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  const opts = (delegate: "GPU" | "CPU"): CreateOptions => ({
    baseOptions: { modelAssetPath: FACE_MODEL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await mod.FaceLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch {
    return await mod.FaceLandmarker.createFromOptions(fileset, opts("CPU"));
  }
}

/** The reduced control signals a single frame yields. */
export interface FaceFrame {
  present: boolean;
  gate: number; // 0..1 jawOpen
  frontness: number; // 0..1 vowel axis
  pitch: number; // 0..1 brow raise
  roll: number; // -1..1 head roll (normalised)
  blink: number; // 0..1 both-eye blink
  landmarks: Landmark[] | null;
}

const NEUTRAL_FRAME: FaceFrame = {
  present: false,
  gate: 0,
  frontness: 0.5,
  pitch: 0.4,
  roll: 0,
  blink: 0,
  landmarks: null,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export interface FaceRig {
  video: HTMLVideoElement;
  ready(): boolean;
  read(): FaceFrame;
  stop(): void;
}

function makeCameraRig(
  landmarker: FaceLandmarkerInst,
  video: HTMLVideoElement,
  stream: MediaStream,
): FaceRig {
  let lastTs = -1;
  let last: FaceFrame = { ...NEUTRAL_FRAME };
  let blinkArmed = true;
  let blinkPulse = 0;

  const score = (cats: Blendshape[], name: string): number => {
    for (const c of cats) if (c.categoryName === name) return c.score;
    return 0;
  };

  const read = (): FaceFrame => {
    blinkPulse *= 0.82; // let the accent pulse decay between frames
    try {
      const ts = performance.now();
      if (ts === lastTs || video.videoWidth === 0) {
        return { ...last, blink: blinkPulse };
      }
      lastTs = ts;
      const res = landmarker.detectForVideo(video, ts);
      const lm = res.faceLandmarks[0] ?? null;
      const cats = res.faceBlendshapes?.[0]?.categories ?? [];
      if (!lm || cats.length === 0) {
        last = { ...NEUTRAL_FRAME, present: false };
        return last;
      }

      const jawOpen = score(cats, "jawOpen");
      const pucker = score(cats, "mouthPucker");
      const smile =
        (score(cats, "mouthSmileLeft") + score(cats, "mouthSmileRight")) / 2;
      const browInner = score(cats, "browInnerUp");
      const browOuter =
        (score(cats, "browOuterUpLeft") + score(cats, "browOuterUpRight")) / 2;
      const blinkL = score(cats, "eyeBlinkLeft");
      const blinkR = score(cats, "eyeBlinkRight");

      // jawOpen has a lot of headroom in practice — stretch it a little.
      const gate = clamp01(jawOpen * 1.35);
      // Neutral mouth → /a/ (0.5); smile → front (/i/), pucker → back (/u/).
      const frontness = clamp01(0.5 + (smile - pucker * 1.1) * 1.15);
      const pitch = clamp01(browInner * 0.55 + browOuter * 0.7);

      // Head roll from the two outer eye corners (33 left, 263 right).
      let roll = 0;
      if (lm.length > 263) {
        const dx = lm[263].x - lm[33].x;
        const dy = lm[263].y - lm[33].y;
        roll = Math.max(-1, Math.min(1, Math.atan2(dy, dx) * 3.2));
      }

      // A real blink = both eyes high, briefly. Fire once per closure.
      const bothBlink = Math.min(blinkL, blinkR);
      if (blinkArmed && bothBlink > 0.5) {
        blinkPulse = 1;
        blinkArmed = false;
      } else if (bothBlink < 0.25) {
        blinkArmed = true;
      }

      last = {
        present: true,
        gate,
        frontness,
        pitch,
        roll,
        blink: Math.max(bothBlink, blinkPulse),
        landmarks: lm,
      };
      return last;
    } catch {
      return { ...last, blink: blinkPulse };
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
        /* noop */
      }
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

export interface FaceStartResult {
  rig: FaceRig | null;
  /** Non-null when the camera path failed and the caller must use the pads. */
  fallbackReason: string | null;
}

/** Try camera + FaceLandmarker; on any failure, report the reason for the pads. */
export async function startFace(): Promise<FaceStartResult> {
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
        "Camera access was denied — play with the vowel pads instead.",
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
    return {
      rig: null,
      fallbackReason: "The camera stream could not start.",
    };
  }

  let landmarker: FaceLandmarkerInst;
  try {
    landmarker = await createLandmarker();
  } catch {
    for (const tr of stream.getTracks()) tr.stop();
    return {
      rig: null,
      fallbackReason:
        "The face-tracking model failed to load — using the vowel pads.",
    };
  }

  return { rig: makeCameraRig(landmarker, video, stream), fallbackReason: null };
}

// ── landmark contour index sets (standard MediaPipe FaceMesh topology) ────────
// Used to stroke a luminous mask over the mirrored video.
export const CONTOURS: number[][] = [
  // face oval
  [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109, 10,
  ],
  // outer lips
  [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0,
    37, 39, 40, 185, 61,
  ],
  // inner lips
  [
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13,
    82, 81, 80, 191, 78,
  ],
  // left eye
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  // right eye
  [
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388,
    466, 263,
  ],
  // left brow
  [70, 63, 105, 66, 107],
  // right brow
  [300, 293, 334, 296, 336],
];
