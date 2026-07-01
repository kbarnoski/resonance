// ─────────────────────────────────────────────────────────────────────────────
// hands.ts — MediaPipe HandLandmarker wrapper (loaded from CDN at runtime).
//
//   Google MediaPipe Tasks-Vision `HandLandmarker` returns 21 3D keypoints per
//   hand (up to 2 hands). We map each detected hand to a terminal: the palm
//   centroid → terminal position; finger-spread (openness) and hand separation →
//   field voltage. If the CDN import fails, the camera is denied, or no hands are
//   seen, everything degrades to the autonomous performance — this wrapper never
//   throws into the render loop.
//
//   The vendored types are intentionally minimal (no @mediapipe npm dep); we only
//   describe the shape we actually read.
// ─────────────────────────────────────────────────────────────────────────────

interface Landmark {
  x: number;
  y: number;
  z: number;
}
interface HandResult {
  landmarks: Landmark[][];
}
interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, ts: number): HandResult;
  close?: () => void;
}
interface VisionModule {
  FilesetResolver: {
    forVisionTasks(wasmRoot: string): Promise<unknown>;
  };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: Record<string, unknown>,
    ): Promise<HandLandmarkerLike>;
  };
}

const CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface HandTerminal {
  /** normalized [0..1] x, mirrored so it feels like a mirror. */
  x: number;
  y: number;
  /** finger openness 0..1 (spread of fingertips vs. wrist). */
  openness: number;
}

export interface HandsFrame {
  present: boolean;
  hands: HandTerminal[]; // 0..2
  /** separation between the two hands (0..~1.4). */
  separation: number;
}

export class HandTracker {
  private video: HTMLVideoElement;
  private landmarker: HandLandmarkerLike | null = null;
  private stream: MediaStream | null = null;
  private lastTs = -1;
  private disposed = false;

  constructor() {
    this.video = document.createElement("video");
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.width = 640;
    this.video.height = 480;
  }

  /** Attempt to init camera + model. Resolves false if anything is unavailable. */
  async start(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (this.disposed) {
        this.stopStream();
        return false;
      }
      this.video.srcObject = this.stream;
      await this.video.play();

      const vision = (await import(/* webpackIgnore */ CDN)) as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_ROOT);
      if (this.disposed) return false;
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      return !this.disposed;
    } catch {
      this.stopStream();
      return false;
    }
  }

  /** Poll the current frame. Returns an autonomous-safe empty frame on failure. */
  poll(nowMs: number): HandsFrame {
    const empty: HandsFrame = { present: false, hands: [], separation: 0 };
    if (!this.landmarker || this.disposed) return empty;
    if (this.video.readyState < 2) return empty;
    // avoid feeding the same timestamp twice
    const ts = nowMs;
    if (ts <= this.lastTs) return empty;
    this.lastTs = ts;
    let res: HandResult;
    try {
      res = this.landmarker.detectForVideo(this.video, ts);
    } catch {
      return empty;
    }
    if (!res.landmarks || res.landmarks.length === 0) return empty;

    const hands: HandTerminal[] = [];
    for (const lm of res.landmarks) {
      if (lm.length < 21) continue;
      // palm centroid ≈ mean of wrist(0), index_mcp(5), pinky_mcp(17)
      const wrist = lm[0];
      const idxMcp = lm[5];
      const pinkyMcp = lm[17];
      const cx = (wrist.x + idxMcp.x + pinkyMcp.x) / 3;
      const cy = (wrist.y + idxMcp.y + pinkyMcp.y) / 3;

      // openness: mean fingertip distance from wrist, normalized by palm size
      const tips = [lm[4], lm[8], lm[12], lm[16], lm[20]];
      const palmSize =
        Math.hypot(idxMcp.x - wrist.x, idxMcp.y - wrist.y) || 0.001;
      let spread = 0;
      for (const t of tips) spread += Math.hypot(t.x - wrist.x, t.y - wrist.y);
      spread /= tips.length;
      const openness = Math.min(1, Math.max(0, (spread / palmSize - 1.2) / 1.6));

      hands.push({ x: 1 - cx, y: cy, openness }); // mirror x
    }
    if (hands.length === 0) return empty;

    let separation = 0;
    if (hands.length >= 2) {
      separation = Math.hypot(
        hands[0].x - hands[1].x,
        hands[0].y - hands[1].y,
      );
    }
    return { present: true, hands, separation };
  }

  private stopStream(): void {
    if (this.stream) {
      for (const tr of this.stream.getTracks()) tr.stop();
      this.stream = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.landmarker?.close?.();
    } catch {
      /* noop */
    }
    this.landmarker = null;
    this.stopStream();
    try {
      this.video.srcObject = null;
    } catch {
      /* noop */
    }
  }
}
