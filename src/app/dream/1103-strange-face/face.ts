// ─────────────────────────────────────────────────────────────────────────────
// face.ts — the reflection source + stillness sensor for the strange-face mirror.
//
//   Two ways to feed the mirror, both exposing the SAME interface so the WebGL
//   dissolution pipeline never has to care which is live:
//
//     • "face" — the webcam, tracked by MediaPipe Tasks-Vision FaceLandmarker
//       (478 mesh points), loaded from CDN at runtime via an indirect
//       `new Function` import so the bundler never resolves the remote URL. The
//       video element itself is the texture source; the landmark mesh is used
//       ONLY to measure facial MOTION (mean per-point displacement) — the signal
//       that drives the Caputo dissolution: hold still → it dissolves, move →
//       it snaps back.
//
//     • "auto" — no camera / model: a procedurally drawn, slowly-morphing
//       pseudo-face luminance field on an offscreen canvas, with a synthetic
//       motion track that mostly rests near zero (so the dissolution builds)
//       and periodically twitches (so the snap-back is demonstrated). Same
//       dissolution, zero hardware.
//
//   Motion is returned smoothed in 0..1: it rises fast on any real movement and
//   falls moderately, so a genuine hold reads as stillness within a second.
// ─────────────────────────────────────────────────────────────────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface Landmark {
  x: number;
  y: number;
  z: number;
}
interface FaceResult {
  faceLandmarks: Landmark[][];
}
interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numFaces?: number;
        outputFaceBlendshapes?: boolean;
      },
    ): Promise<FaceLandmarkerInst>;
  };
}

async function createLandmarker(): Promise<FaceLandmarkerInst> {
  // Indirect dynamic import: the CDN module ships no types, so this is the
  // confined shim (see the MediaPipeVision interface for the shape we rely on).
  const mod = (await (new Function(
    `return import("${MEDIAPIPE_CDN}")`,
  )() as Promise<unknown>)) as unknown as MediaPipeVision;
  const fileset = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return mod.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
}

export type FaceMode = "face" | "auto";

export interface FaceFeatures {
  /** Smoothed facial motion, 0..1. High = you just moved; near 0 = holding still. */
  motion: number;
}

export interface FaceRig {
  mode: FaceMode;
  /** The current frame to upload as the mirror texture (video or canvas). */
  source: HTMLVideoElement | HTMLCanvasElement;
  /** Whether `source` has real dimensions yet. */
  sourceReady(): boolean;
  /** Source aspect ratio (width / height). */
  sourceAspect(): number;
  /** Advance internal state and read the current motion. dt in seconds. */
  read(dt: number): FaceFeatures;
  stop(): void;
}

// ── Procedural pseudo-face ────────────────────────────────────────────────────
// A dim, slowly-morphing face-like luminance field. Not a photo — an oval of
// warm light with two eye hollows (and drifting catchlights), a nose ridge and
// a mouth shadow. Mean brightness is kept low + roughly constant so that, once
// the kaleidoscope + feedback dissolve it, it turns uncanny rather than flashing.
const PSEUDO_SIZE = 320;

function drawPseudoFace(
  g: CanvasRenderingContext2D,
  t: number,
  size: number,
): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  // Slow global drift so the face never sits perfectly locked.
  const dx = Math.sin(t * 0.11) * size * 0.02;
  const dy = Math.cos(t * 0.09) * size * 0.02;
  const breath = 1 + Math.sin(t * 0.23) * 0.03;

  g.fillStyle = "#080810";
  g.fillRect(0, 0, size, size);

  // Face oval — a soft radial glow.
  const fw = size * 0.34 * breath;
  const fh = size * 0.44 * breath;
  const grad = g.createRadialGradient(
    cx + dx,
    cy + dy,
    fw * 0.2,
    cx + dx,
    cy + dy,
    fh,
  );
  grad.addColorStop(0, "rgba(150,138,130,0.95)");
  grad.addColorStop(0.55, "rgba(96,86,84,0.85)");
  grad.addColorStop(1, "rgba(20,18,26,0.0)");
  g.save();
  g.translate(cx + dx, cy + dy);
  g.scale(fw / fh, 1);
  g.beginPath();
  g.arc(0, 0, fh, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  g.restore();

  const eyeY = cy + dy - fh * 0.18;
  const eyeDx = fw * 0.42;
  // Eye hollows.
  for (const sgn of [-1, 1]) {
    const ex = cx + dx + sgn * eyeDx;
    g.save();
    g.translate(ex, eyeY);
    g.scale(1.5, 1);
    g.beginPath();
    g.arc(0, 0, fw * 0.16, 0, Math.PI * 2);
    g.fillStyle = "rgba(10,8,14,0.72)";
    g.fill();
    g.restore();
    // Drifting catchlight — the "gaze" that never quite settles.
    const gx = ex + Math.sin(t * 0.5 + sgn) * fw * 0.05;
    const gy = eyeY + Math.cos(t * 0.4 + sgn) * fw * 0.03;
    g.beginPath();
    g.arc(gx, gy, fw * 0.045, 0, Math.PI * 2);
    g.fillStyle = "rgba(210,205,220,0.8)";
    g.fill();
  }

  // Nose ridge — a faint vertical highlight.
  g.save();
  g.strokeStyle = "rgba(170,158,150,0.28)";
  g.lineWidth = fw * 0.09;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx + dx, eyeY + fh * 0.05);
  g.lineTo(cx + dx + Math.sin(t * 0.3) * fw * 0.04, cy + dy + fh * 0.28);
  g.stroke();
  g.restore();

  // Mouth shadow.
  g.save();
  g.strokeStyle = "rgba(12,8,14,0.5)";
  g.lineWidth = fw * 0.08;
  g.lineCap = "round";
  const my = cy + dy + fh * 0.52;
  g.beginPath();
  g.moveTo(cx + dx - fw * 0.28, my);
  g.quadraticCurveTo(
    cx + dx,
    my + Math.sin(t * 0.35) * fh * 0.04,
    cx + dx + fw * 0.28,
    my,
  );
  g.stroke();
  g.restore();
}

function makeAutoRig(): FaceRig {
  const canvas = document.createElement("canvas");
  canvas.width = PSEUDO_SIZE;
  canvas.height = PSEUDO_SIZE;
  const g = canvas.getContext("2d");
  let t = 0;
  let motion = 0;
  // Twitch scheduler: mostly still, occasional deliberate movement so the
  // snap-back is demonstrated even with no one in the room.
  let nextTwitch = 14;

  const read = (dt: number): FaceFeatures => {
    t += dt;
    if (g) drawPseudoFace(g, t, PSEUDO_SIZE);

    // Baseline micro-motion (never perfectly zero) + scheduled twitches.
    let target = 0.015 + Math.abs(Math.sin(t * 0.7)) * 0.01;
    if (t >= nextTwitch) {
      // A ~1.6 s burst of movement, then schedule the next in 28–46 s.
      const into = t - nextTwitch;
      if (into < 1.6) {
        target = 0.8 * Math.sin((into / 1.6) * Math.PI);
      } else {
        nextTwitch = t + 28 + Math.random() * 18;
      }
    }
    const a = target > motion ? 0.35 : 0.06;
    motion += (target - motion) * a;
    return { motion };
  };

  return {
    mode: "auto",
    source: canvas,
    sourceReady: () => true,
    sourceAspect: () => 1,
    read,
    stop() {},
  };
}

interface CameraDeps {
  landmarker: FaceLandmarkerInst;
  video: HTMLVideoElement;
  stream: MediaStream;
}

// A stable subset of the 478-point mesh (nose, eyes, brows, mouth, jaw, cheeks)
// — enough to measure head/face motion without weighting the noisy silhouette.
const SAMPLE_POINTS = [
  1, 4, 6, 9, 33, 61, 105, 133, 152, 159, 199, 234, 263, 291, 334, 362, 386,
  454, 468, 473,
];

function makeCameraRig(deps: CameraDeps): FaceRig {
  const { landmarker, video, stream } = deps;
  const prev = new Float32Array(SAMPLE_POINTS.length * 2);
  const cur = new Float32Array(SAMPLE_POINTS.length * 2);
  let havePrev = false;
  let motion = 0;
  let lastTs = -1;

  const read = (dt: number): FaceFeatures => {
    let target = motion; // if detection stalls, glide toward rest
    try {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const res = landmarker.detectForVideo(video, ts);
        const lm = res.faceLandmarks[0];
        if (lm && lm.length >= 468) {
          for (let i = 0; i < SAMPLE_POINTS.length; i++) {
            const p = lm[SAMPLE_POINTS[i]];
            cur[i * 2] = p.x;
            cur[i * 2 + 1] = p.y;
          }
          if (havePrev) {
            let disp = 0;
            for (let k = 0; k < cur.length; k++) {
              const d = cur[k] - prev[k];
              disp += d * d;
            }
            const speed =
              Math.sqrt(disp / SAMPLE_POINTS.length) / Math.max(dt, 1e-3);
            // Facial displacement is tiny; scale so a real head move → ~1.
            target = Math.min(1, speed * 9);
          } else {
            target = 0;
          }
          prev.set(cur);
          havePrev = true;
        } else {
          // No face found (looked away / too dark) — treat as gentle motion so
          // the mirror doesn't fully dissolve on a lost track.
          target = Math.max(target, 0.25);
        }
      }
    } catch {
      /* detection hiccup — keep gliding */
    }
    const a = target > motion ? 0.4 : 0.05;
    motion += (target - motion) * a;
    return { motion };
  };

  return {
    mode: "face",
    source: video,
    sourceReady: () => video.videoWidth > 0,
    sourceAspect: () =>
      video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 1,
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
  rig: FaceRig;
  /** Set when we fell back to the autonomous face and why (for the UI notice). */
  fallbackReason: string | null;
}

/** Try camera + FaceLandmarker; on any failure, fall back to the auto face. */
export async function startFace(): Promise<FaceStartResult> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return {
      rig: makeAutoRig(),
      fallbackReason: "No camera API on this device.",
    };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    return {
      rig: makeAutoRig(),
      fallbackReason:
        "Camera access was denied or unavailable — running the autonomous pseudo-face instead.",
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
      rig: makeAutoRig(),
      fallbackReason: "The camera stream could not start.",
    };
  }

  let landmarker: FaceLandmarkerInst;
  try {
    landmarker = await createLandmarker();
  } catch {
    // Camera works but the model didn't load — keep the live video as the
    // mirror source but there is no face-motion signal, so use the auto face
    // (which self-drives the dissolution) to guarantee sound + motion.
    for (const tr of stream.getTracks()) tr.stop();
    return {
      rig: makeAutoRig(),
      fallbackReason:
        "The face-tracking model failed to load — running the autonomous pseudo-face instead.",
    };
  }

  return { rig: makeCameraRig({ landmarker, video, stream }), fallbackReason: null };
}
