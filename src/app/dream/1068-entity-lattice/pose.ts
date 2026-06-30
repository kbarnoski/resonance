// ─────────────────────────────────────────────────────────────────────────────
// pose.ts — full-body pose source for the entity-lattice.
//
//   Wraps MediaPipe Tasks-Vision PoseLandmarker (33 landmarks), loaded from CDN
//   at runtime via an indirect `new Function` import so the bundler never
//   resolves the remote URL. If a camera or the model is unavailable, falls back
//   to a synthetic "demo body" driven by slow sinusoids — so the lattice is alive
//   and the audio ascends with ZERO hardware.
//
//   We surface ~12 key joints as a flat Float32Array of XYZ triples in a
//   normalised [-1,1] space (origin at the body centre, +y up, +x right, +z
//   toward camera) plus three scalar "drive" features: overall motion, arm-lift,
//   and arm-spread. The scene reflects those joints across high-fold symmetry;
//   the audio maps the features to a single drive toward breakthrough.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
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
export interface PoseLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): PoseResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  PoseLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numPoses?: number;
      },
    ): Promise<PoseLandmarkerInst>;
  };
}

async function createLandmarker(): Promise<PoseLandmarkerInst> {
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// MediaPipe landmark indices we draw from.
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANKLE = 27;
const R_ANKLE = 28;

// The 12 joints, in the fixed order the scene's uJoints[] uniform expects.
const JOINT_INDICES = [
  NOSE,
  L_SHOULDER,
  R_SHOULDER,
  L_ELBOW,
  R_ELBOW,
  L_WRIST,
  R_WRIST,
  L_HIP,
  R_HIP,
  L_KNEE,
  R_KNEE,
  // last slot = mid-spine (interpolated), filled in below
  -1,
];
export const JOINT_COUNT = JOINT_INDICES.length; // 12

export type PoseMode = "body" | "demo";

export interface PoseFeatures {
  /** Flat XYZ triples for the 12 joints, each component in ~[-1,1]. */
  joints: Float32Array; // length JOINT_COUNT * 3
  /** Overall instantaneous motion energy, smoothed, 0..1. */
  motion: number;
  /** How high the wrists are above the shoulders, 0..1. */
  lift: number;
  /** How wide the wrists are spread, 0..1. */
  spread: number;
}

export interface PoseRig {
  mode: PoseMode;
  /** Advance & read the current features. dt in seconds. */
  read(dt: number): PoseFeatures;
  stop(): void;
}

// Map a MediaPipe normalised landmark (x,y in [0,1], y down; z roughly metres)
// into our centred [-1,1] space with +y up.
function mapLandmark(l: Landmark, out: number[], i: number): void {
  out[i] = (l.x - 0.5) * 2.0;
  out[i + 1] = -(l.y - 0.5) * 2.0;
  out[i + 2] = -l.z * 2.0;
}

interface Internal {
  joints: Float32Array;
  prev: Float32Array;
  motion: number;
  lift: number;
  spread: number;
}

function makeInternal(): Internal {
  return {
    joints: new Float32Array(JOINT_COUNT * 3),
    prev: new Float32Array(JOINT_COUNT * 3),
    motion: 0,
    lift: 0,
    spread: 0,
  };
}

// Derive the three drive features from a fresh joint buffer + the previous one.
function applyFeatures(st: Internal, dt: number): void {
  // Motion: mean per-joint displacement / dt, smoothed and compressed.
  let disp = 0;
  for (let k = 0; k < st.joints.length; k++) {
    const d = st.joints[k] - st.prev[k];
    disp += d * d;
  }
  const speed = Math.sqrt(disp / JOINT_COUNT) / Math.max(dt, 1e-3);
  const targetMotion = Math.min(1, speed * 1.6);
  // Asymmetric smoothing: rise quickly, fall slowly (so a burst lingers).
  const a = targetMotion > st.motion ? 0.35 : 0.04;
  st.motion += (targetMotion - st.motion) * a;

  // Joints laid out as [nose, lSh, rSh, lEl, rEl, lWr, rWr, lHip, rHip, ...].
  const y = (j: number) => st.joints[j * 3 + 1];
  const x = (j: number) => st.joints[j * 3];
  const shoulderY = (y(1) + y(2)) * 0.5;
  const wristY = (y(5) + y(6)) * 0.5;
  const targetLift = Math.min(1, Math.max(0, (wristY - shoulderY) * 0.9 + 0.2));
  st.lift += (targetLift - st.lift) * 0.12;

  const targetSpread = Math.min(1, Math.abs(x(5) - x(6)) * 0.6);
  st.spread += (targetSpread - st.spread) * 0.12;

  st.prev.set(st.joints);
}

/** Synthetic demo body — slow offset sinusoids: arms sweeping, body breathing. */
function makeDemoRig(): PoseRig {
  const st = makeInternal();
  let t = 0;
  const buf: number[] = new Array(JOINT_COUNT * 3).fill(0);

  const read = (dt: number): PoseFeatures => {
    t += dt;
    const breath = Math.sin(t * 0.6) * 0.06;
    const sweep = Math.sin(t * 0.8);
    const sweep2 = Math.sin(t * 0.8 + 0.5);
    const armUp = (Math.sin(t * 0.45) + 1) * 0.5; // 0..1 slow raise

    // Shoulders
    const shY = 0.32 + breath;
    const wristSpread = 0.45 + 0.35 * Math.abs(sweep);
    const wristY = shY + armUp * 1.0 - 0.2;

    // nose
    buf[0] = sweep * 0.05;
    buf[1] = 0.62 + breath;
    buf[2] = 0;
    // l/r shoulder
    buf[3] = -0.28;
    buf[4] = shY;
    buf[5] = 0;
    buf[6] = 0.28;
    buf[7] = shY;
    buf[8] = 0;
    // l/r elbow
    buf[9] = -0.42 - 0.1 * sweep;
    buf[10] = shY - 0.2 + armUp * 0.5;
    buf[11] = 0.1 * sweep;
    buf[12] = 0.42 + 0.1 * sweep2;
    buf[13] = shY - 0.2 + armUp * 0.5;
    buf[14] = -0.1 * sweep2;
    // l/r wrist
    buf[15] = -wristSpread - 0.1 * sweep;
    buf[16] = wristY;
    buf[17] = 0.2 * sweep;
    buf[18] = wristSpread + 0.1 * sweep2;
    buf[19] = wristY;
    buf[20] = -0.2 * sweep2;
    // l/r hip
    buf[21] = -0.18;
    buf[22] = -0.2 + breath * 0.5;
    buf[23] = 0;
    buf[24] = 0.18;
    buf[25] = -0.2 + breath * 0.5;
    buf[26] = 0;
    // l/r knee
    buf[27] = -0.2;
    buf[28] = -0.6;
    buf[29] = 0.05 * sweep;
    buf[30] = 0.2;
    buf[31] = -0.6;
    buf[32] = -0.05 * sweep2;
    // mid-spine
    buf[33] = 0;
    buf[34] = 0.06 + breath;
    buf[35] = 0;

    st.joints.set(buf);
    applyFeatures(st, dt);
    return { joints: st.joints, motion: st.motion, lift: st.lift, spread: st.spread };
  };

  return { mode: "demo", read, stop() {} };
}

interface CameraRigDeps {
  landmarker: PoseLandmarkerInst;
  video: HTMLVideoElement;
  stream: MediaStream;
}

function makeCameraRig(deps: CameraRigDeps): PoseRig {
  const { landmarker, video, stream } = deps;
  const st = makeInternal();
  const flat: number[] = new Array(JOINT_COUNT * 3).fill(0);
  let lastTs = -1;
  let haveJoints = false;

  const read = (dt: number): PoseFeatures => {
    try {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const res = landmarker.detectForVideo(video, ts);
        const lm = res.landmarks[0];
        if (lm && lm.length >= 29) {
          for (let j = 0; j < JOINT_COUNT; j++) {
            const idx = JOINT_INDICES[j];
            if (idx >= 0) {
              mapLandmark(lm[idx], flat, j * 3);
            } else {
              // mid-spine = midpoint of shoulders & hips
              const sx =
                (lm[L_SHOULDER].x + lm[R_SHOULDER].x + lm[L_HIP].x + lm[R_HIP].x) /
                4;
              const sy =
                (lm[L_SHOULDER].y + lm[R_SHOULDER].y + lm[L_HIP].y + lm[R_HIP].y) /
                4;
              const sz =
                (lm[L_SHOULDER].z + lm[R_SHOULDER].z + lm[L_HIP].z + lm[R_HIP].z) /
                4;
              mapLandmark({ x: sx, y: sy, z: sz }, flat, j * 3);
            }
          }
          // Mirror x so the lattice tracks like a mirror (selfie view).
          for (let j = 0; j < JOINT_COUNT; j++) flat[j * 3] *= -1;
          st.joints.set(flat);
          haveJoints = true;
        }
      }
    } catch {
      /* detection hiccup — keep last pose */
    }
    if (haveJoints) applyFeatures(st, dt);
    return { joints: st.joints, motion: st.motion, lift: st.lift, spread: st.spread };
  };

  return {
    mode: "body",
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

// Reference these so they are not flagged as unused when only camera path runs;
// the knee/ankle indices document the full landmark set we sample from.
void L_KNEE;
void R_KNEE;
void L_ANKLE;
void R_ANKLE;

/** Start the pose rig: try camera + MediaPipe, fall back to a demo body. */
export async function startPose(): Promise<PoseRig> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return makeDemoRig();
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    return makeDemoRig();
  }

  const video = document.createElement("video");
  video.style.display = "none";
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    // Wait for dimensions so detectForVideo has a real frame.
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
    for (const t of stream.getTracks()) t.stop();
    return makeDemoRig();
  }

  let landmarker: PoseLandmarkerInst;
  try {
    landmarker = await createLandmarker();
  } catch {
    for (const t of stream.getTracks()) t.stop();
    return makeDemoRig();
  }

  return makeCameraRig({ landmarker, video, stream });
}
