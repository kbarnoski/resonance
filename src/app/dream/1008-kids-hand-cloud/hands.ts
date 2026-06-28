// hands.ts — hand tracking via MediaPipe tasks-vision HandLandmarker (CDN),
// with a graceful ghost-hand auto-demo fallback.
//
// We load @mediapipe/tasks-vision from a CDN at runtime (no package.json change).
// If the CDN, the model, or camera permission fails, we surface a reason and the
// caller runs the ghost-hand Lissajous demo so the cloud still swirls and sings.
//
// Reference: MediaPipe Hands (Google) — on-device, real-time 21-landmark hand
// tracking. https://developers.google.com/mediapipe/solutions/vision/hand_landmarker

const VISION_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// A normalized hand: a few key points (in 0..1 frame coords, x already mirrored)
// plus openness and pinch state. We keep it small — the cloud only needs a few
// attractors per hand.
export type Hand = {
  // attractor points in clip-ish space: x,y in [-1,1], y up.
  points: { x: number; y: number }[];
  // palm/index centroid in [0,1], y down (screen-ish) for audio mapping.
  cx: number;
  cy: number;
  openness: number; // 0 (closed) .. 1 (wide open)
  pinch: number; // thumb-tip <-> index-tip distance (normalized)
  isPinching: boolean;
};

export type HandsResult = {
  hands: Hand[];
};

type LandmarkerLike = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => { landmarks?: { x: number; y: number; z: number }[][] };
  close?: () => void;
};

export class HandTracker {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: LandmarkerLike | null = null;
  private disposed = false;
  public mode: "camera" | "ghost" = "ghost";
  public reason = "";

  /**
   * Try to start real camera hand-tracking. Returns true on success.
   * On any failure sets `this.reason` and returns false (caller -> ghost mode).
   */
  async start(): Promise<boolean> {
    try {
      // 1) Camera permission + stream.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
    } catch {
      this.reason = "Camera permission denied or unavailable.";
      this.mode = "ghost";
      return false;
    }

    try {
      // 2) Load MediaPipe tasks-vision from CDN.
      const vision = (await import(/* webpackIgnore: true */ VISION_CDN)) as {
        FilesetResolver: {
          forVisionTasks: (root: string) => Promise<unknown>;
        };
        HandLandmarker: {
          createFromOptions: (
            fileset: unknown,
            opts: Record<string, unknown>,
          ) => Promise<LandmarkerLike>;
        };
      };
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
    } catch {
      this.reason = "Could not load the MediaPipe hand model (CDN/model).";
      this.cleanupStream();
      this.mode = "ghost";
      return false;
    }

    // 3) Wire up a hidden video element playing the stream.
    try {
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = this.stream;
      await video.play();
      this.video = video;
    } catch {
      this.reason = "Could not start the camera video stream.";
      this.cleanupStream();
      this.mode = "ghost";
      return false;
    }

    this.mode = "camera";
    return true;
  }

  /** Read the current hands. Empty array if nothing detected this frame. */
  detect(nowMs: number): HandsResult {
    if (this.disposed || this.mode !== "camera" || !this.landmarker || !this.video) {
      return { hands: [] };
    }
    if (this.video.readyState < 2) return { hands: [] };

    let res: { landmarks?: { x: number; y: number; z: number }[][] };
    try {
      res = this.landmarker.detectForVideo(this.video, nowMs);
    } catch {
      return { hands: [] };
    }
    const out: Hand[] = [];
    const lms = res.landmarks ?? [];
    for (const lm of lms) {
      if (!lm || lm.length < 21) continue;
      out.push(normalizeHand(lm));
    }
    return { hands: out };
  }

  private cleanupStream() {
    if (this.stream) {
      for (const tr of this.stream.getTracks()) tr.stop();
      this.stream = null;
    }
  }

  dispose() {
    this.disposed = true;
    try {
      this.landmarker?.close?.();
    } catch {
      /* ignore */
    }
    this.landmarker = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.cleanupStream();
  }
}

// MediaPipe landmark indices we care about.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const INDEX_MCP = 5;
const PINKY_MCP = 17;

function normalizeHand(lm: { x: number; y: number; z: number }[]): Hand {
  // MediaPipe gives x,y in [0,1] with origin top-left. Mirror x (selfie view).
  const mx = (p: { x: number }) => 1 - p.x;

  // Palm width as a scale reference (knuckle span) to make openness/pinch
  // roughly distance-invariant.
  const palmW =
    Math.hypot(lm[INDEX_MCP].x - lm[PINKY_MCP].x, lm[INDEX_MCP].y - lm[PINKY_MCP].y) ||
    0.001;

  // Openness: average fingertip distance from wrist, normalized by palm width.
  const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
  let spread = 0;
  for (const ti of tips) {
    spread += Math.hypot(lm[ti].x - lm[WRIST].x, lm[ti].y - lm[WRIST].y);
  }
  spread /= tips.length;
  // Map ratio ~[1.4 (fist) .. 2.6 (open)] -> [0..1].
  const openness = clamp01((spread / palmW - 1.4) / 1.2);

  // Pinch: thumb tip <-> index tip distance, normalized by palm width.
  const pinch =
    Math.hypot(lm[THUMB_TIP].x - lm[INDEX_TIP].x, lm[THUMB_TIP].y - lm[INDEX_TIP].y) /
    palmW;
  const isPinching = pinch < 0.45;

  // Attractor points: wrist + 5 fingertips, in clip space x,y in [-1,1], y up.
  const idxs = [WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
  const points = idxs.map((i) => ({
    x: mx(lm[i]) * 2 - 1,
    y: (1 - lm[i].y) * 2 - 1,
  }));

  // Centroid for audio mapping (screen coords, y down, 0..1).
  let cx = 0;
  let cy = 0;
  for (const i of idxs) {
    cx += mx(lm[i]);
    cy += lm[i].y;
  }
  cx /= idxs.length;
  cy /= idxs.length;

  return { points, cx, cy, openness, pinch, isPinching };
}

// --- Ghost hands: slow Lissajous drift so the cloud lives without a camera ---

export function ghostHands(timeSec: number): Hand[] {
  const make = (phase: number, speed: number, ax: number, ay: number): Hand => {
    const t = timeSec * speed + phase;
    const x = Math.sin(t * 0.7) * ax;
    const y = Math.sin(t * 0.9 + 1.3) * ay;
    // breathing openness + occasional pinch via a slow sine
    const breath = 0.5 + 0.5 * Math.sin(t * 0.5);
    const openness = 0.25 + 0.75 * breath;
    const pinchSig = Math.sin(t * 0.33 + phase);
    const isPinching = pinchSig > 0.92; // brief, rare gathers -> chimes
    const pinch = isPinching ? 0.3 : 0.8;
    // a little fanned cluster of attractor points around (x,y)
    const points = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t;
      const r = 0.06 + 0.05 * breath;
      points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    const cx = (x + 1) / 2;
    const cy = 1 - (y + 1) / 2;
    return { points, cx, cy, openness, pinch, isPinching };
  };
  return [make(0, 1.0, 0.55, 0.42), make(2.1, 0.78, 0.5, 0.5)];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
