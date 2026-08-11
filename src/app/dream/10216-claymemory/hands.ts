// hands.ts — the input degrade ladder for 10216 · Clay Memory.
//
//   Tier 1  MediaPipe HandLandmarker (opt-in "Enable camera") — landmark 9 = palm
//           cursor that dents the clay; thumb(4)↔index(8) distance = pinch → pull
//           a peak. Up to two hands.
//   Tier 2  Pointer drag (in page.tsx)   — one hand; drag = push, dwell = pinch.
//   Tier 3  Frame-diff blob              — a single bright-motion centroid, dwell
//           to pinch, if MediaPipe can't load but a camera opened.
//   Tier 4  Seeded ghost-hands auto-demo — deterministic phantom hands that knead
//           the clay from frame one and reset it on their own loop, so the plastic
//           "memory" reads on a muted phone with ZERO input. The most important
//           tier for review.
//
// SSR-safe: no window/navigator at module scope. Every CDN / WASM / WebGL call is
// wrapped so a failure degrades instead of throwing.

import { mulberry32, SEED } from "./rng";

// ── Tier 1: MediaPipe Tasks-Vision HandLandmarker (runtime CDN import) ─────────
const CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}
export interface HandResult {
  landmarks: HandLandmark[][];
}
export interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandResult;
  close(): void;
}

interface FilesetResolverLike {
  forVisionTasks(wasmRoot: string): Promise<unknown>;
}
interface HandLandmarkerStatic {
  createFromOptions(
    fileset: unknown,
    options: {
      baseOptions: { modelAssetPath: string; delegate: "GPU" | "CPU" };
      runningMode: "VIDEO" | "IMAGE";
      numHands: number;
    },
  ): Promise<HandLandmarkerLike>;
}
interface VisionModule {
  FilesetResolver: FilesetResolverLike;
  HandLandmarker: HandLandmarkerStatic;
}

function isVisionModule(m: unknown): m is VisionModule {
  if (typeof m !== "object" || m === null) return false;
  const rec = m as Record<string, unknown>;
  return (
    typeof rec.FilesetResolver === "object" &&
    rec.FilesetResolver !== null &&
    typeof rec.HandLandmarker === "object" &&
    rec.HandLandmarker !== null
  );
}

/** Create a two-hand VIDEO-mode landmarker. Throws if the CDN module / WASM /
 *  WebGL is unavailable — callers MUST catch and fall to a lower tier. */
export async function makeHandLandmarker(): Promise<HandLandmarkerLike> {
  const mod = (await import(/* webpackIgnore: true */ CDN)) as unknown;
  if (!isVisionModule(mod)) {
    throw new Error("MediaPipe vision module shape unexpected");
  }
  const fileset = await mod.FilesetResolver.forVisionTasks(WASM_ROOT);
  return mod.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

/** One observed hand in normalized screen space (already mirrored). */
export interface HandObservation {
  x: number;
  y: number;
  grab: boolean;
}

const PINCH_THRESHOLD = 0.06;

/** Read up to two hands from a fresh MediaPipe result. Palm = middle-finger MCP
 *  (landmark 9); pinch = thumb-tip(4)↔index-tip(8) distance below threshold. */
export function readMediaPipeHands(
  lm: HandLandmarkerLike,
  video: HTMLVideoElement,
  timestampMs: number,
): HandObservation[] {
  const result = lm.detectForVideo(video, timestampMs);
  const hands = result.landmarks.map((pts) => {
    const cx = pts[9].x; // palm cursor
    const cy = pts[9].y;
    const dx = pts[4].x - pts[8].x;
    const dy = pts[4].y - pts[8].y;
    const grab = Math.hypot(dx, dy) < PINCH_THRESHOLD;
    return { x: 1 - cx, y: cy, grab }; // mirror X to match the on-screen clay
  });
  hands.sort((a, b) => a.x - b.x);
  return hands.slice(0, 2);
}

// ── Tier 3: frame-diff bright-motion blob, pinch = dwell ───────────────────────
export class FrameDiffTracker {
  private w = 64;
  private h = 48;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private prev: Float32Array | null = null;
  private lastX = 0.5;
  private lastY = 0.5;
  private dwell = 0;
  private lastMs = -1;

  constructor() {
    this.cv = document.createElement("canvas");
    this.cv.width = this.w;
    this.cv.height = this.h;
    const c = this.cv.getContext("2d", { willReadFrequently: true });
    if (!c) throw new Error("2d context unavailable for frame-diff");
    this.cx = c;
  }

  sample(video: HTMLVideoElement, nowMs: number): HandObservation | null {
    const { w, h, cx } = this;
    cx.save();
    cx.setTransform(-1, 0, 0, 1, w, 0); // mirror horizontally
    try {
      cx.drawImage(video, 0, 0, w, h);
    } catch {
      cx.restore();
      return null;
    }
    cx.restore();

    let data: Uint8ClampedArray;
    try {
      data = cx.getImageData(0, 0, w, h).data;
    } catch {
      return null;
    }

    const gray = new Float32Array(w * h);
    let sx = 0;
    let sy = 0;
    let sw = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const l = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
        gray[y * w + x] = l;
        const pl = this.prev ? this.prev[y * w + x] : l;
        const d = Math.abs(l - pl);
        if (d > 18) {
          const wgt = d * (0.4 + l / 255);
          sx += x * wgt;
          sy += y * wgt;
          sw += wgt;
        }
      }
    }
    this.prev = gray;

    const dt = this.lastMs < 0 ? 0.016 : Math.min(0.1, (nowMs - this.lastMs) / 1000);
    this.lastMs = nowMs;

    if (sw < 900) {
      this.dwell = 0;
      return null;
    }
    const nx = sx / sw / w;
    const ny = sy / sw / h;
    const moved = Math.hypot(nx - this.lastX, ny - this.lastY);
    if (moved < 0.06) this.dwell += dt;
    else this.dwell = 0;
    this.lastX = nx;
    this.lastY = ny;
    return { x: nx, y: ny, grab: this.dwell > 0.4 };
  }
}

/** Feature-detect getUserMedia without touching it. */
export function cameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

// ── Tier 4: the seeded ghost sculptor (the muted-phone read) ───────────────────
export interface GhostFrame {
  hands: HandObservation[];
  /** Fires once per loop — the clay is wiped back to a fresh lump. */
  reset: boolean;
}

interface GhostHand {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  phase: number;
  grabAt: number; // 0..1 within loop where this hand pinches
  grabLen: number;
}

/** Two deterministic phantom hands that knead the lump, accumulate a form, then
 *  wipe it clean on a loop — so the plastic memory is legible with no input. */
export class GhostSculptor {
  private loop: number;
  private hands: GhostHand[] = [];
  private lastPhase = 0;

  constructor(reduced: boolean) {
    this.loop = reduced ? 34 : 24;
    const rng = mulberry32(SEED ^ 0x51);
    for (let i = 0; i < 2; i++) {
      this.hands.push({
        cx: 0.42 + i * 0.16 + (rng() - 0.5) * 0.08,
        cy: 0.44 + (rng() - 0.5) * 0.12,
        ax: 0.14 + rng() * 0.12,
        ay: 0.12 + rng() * 0.12,
        fx: 0.5 + rng() * 1.3,
        fy: 0.6 + rng() * 1.3,
        phase: rng() * Math.PI * 2,
        grabAt: 0.28 + i * 0.34 + rng() * 0.1,
        grabLen: 0.1 + rng() * 0.06,
      });
    }
  }

  step(t: number): GhostFrame {
    const phase = (t % this.loop) / this.loop; // 0..1
    const reset = phase < this.lastPhase; // wrapped → wipe to a fresh lump
    this.lastPhase = phase;

    const hands: HandObservation[] = [];
    for (let i = 0; i < this.hands.length; i++) {
      const g = this.hands[i];
      // A slow drifting lissajous over the front of the clay; the palm dwells so
      // dents accumulate. A brief pinch mid-loop pulls a peak that then stays.
      const u = t * 0.55;
      // radius breathes in over the loop so early presses dent, late ones deepen.
      const r = 0.55 + 0.45 * Math.sin(phase * Math.PI);
      const x = g.cx + g.ax * r * Math.sin(u * g.fx + g.phase);
      const y = g.cy + g.ay * r * Math.cos(u * g.fy + g.phase * 1.3);
      const grab = phase > g.grabAt && phase < g.grabAt + g.grabLen;
      // second hand only joins for part of the loop, so the form is asymmetric.
      const active = i === 0 || phase > 0.34;
      if (active) hands.push({ x, y, grab });
    }
    return { hands, reset };
  }
}
