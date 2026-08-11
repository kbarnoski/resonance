// hands.ts — the input degrade ladder for 9864 · Handroom.
//
//   Tier 1  MediaPipe Hands (opt-in)  — makeHandLandmarker(), a runtime CDN
//           import; landmark 9 = palm cursor, thumb↔index distance = pinch/grab.
//   Tier 2  Frame-diff blob fallback  — FrameDiffTracker; one bright-motion
//           centroid, grab = dwell (hold still ~0.4 s).
//   Tier 3  Pointer fallback          — handled in page.tsx (drag = grab).
//   Tier 4  Seeded synthetic conductor — Conductor; a deterministic ghost hand
//           that grabs voices one at a time and orbits them around the head on a
//           ~24 s loop, so the chord re-voices with ZERO input. THE muted-phone
//           read: alive from frame one.
//
// Everything here is SSR-safe (no window at module scope) and every CDN load is
// wrapped so a failure degrades instead of breaking the page.

import { N_SOURCES, sph, baseAzimuth, HELD_RADIUS, type Vec3 } from "./field";
import { handroomRng } from "./prng";

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
 *  WebGL is unavailable — callers MUST catch and fall to Tier 2. */
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

/** Read up to two hands from a fresh MediaPipe result. Returns null when there
 *  is no new camera frame this tick (caller keeps previous hands). */
export function readMediaPipeHands(
  lm: HandLandmarkerLike,
  video: HTMLVideoElement,
  timestampMs: number,
): HandObservation[] {
  const result = lm.detectForVideo(video, timestampMs);
  const hands = result.landmarks.map((pts) => {
    // Palm center = midpoint of wrist(0) and middle-finger MCP(9). Mirror X.
    const cx = (pts[0].x + pts[9].x) / 2;
    const cy = (pts[0].y + pts[9].y) / 2;
    const dx = pts[4].x - pts[8].x;
    const dy = pts[4].y - pts[8].y;
    const grab = Math.hypot(dx, dy) < PINCH_THRESHOLD;
    return { x: 1 - cx, y: cy, grab };
  });
  hands.sort((a, b) => a.x - b.x);
  return hands.slice(0, 2);
}

// ── Tier 2: frame-diff bright-motion blob, grab = dwell ────────────────────────
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

  /** Sample one frame → a single hand observation, or null if nothing moved. */
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
      // nothing moving — decay dwell, no confident observation
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

// ── Tier 4: the seeded synthetic conductor (the muted-phone read) ─────────────
export interface Command {
  heldIndex: number; // -1 while reaching between voices
  target: Vec3 | null;
}

export class Conductor {
  private loop: number;
  private params: {
    sweep: number;
    elAmp: number;
    elPhase: number;
    rWobble: number;
    dir: number;
  }[] = [];

  constructor(reduced: boolean) {
    this.loop = reduced ? 40 : 24;
    const rng = handroomRng();
    for (let i = 0; i < N_SOURCES; i++) {
      this.params.push({
        sweep: (0.7 + rng() * 0.9) * (rng() < 0.5 ? -1 : 1),
        elAmp: 0.5 + rng() * 1.1,
        elPhase: rng() * Math.PI * 2,
        rWobble: rng() * 0.4,
        dir: rng() < 0.5 ? -1 : 1,
      });
    }
  }

  /** Deterministic grab schedule at absolute time t (seconds). */
  step(t: number): Command {
    const phase = (t % this.loop) / this.loop; // 0..1
    const slot = phase * N_SOURCES;
    const idx = Math.floor(slot) % N_SOURCES;
    const local = slot - Math.floor(slot); // 0..1 within this voice's visit
    // Reach in (start) → hold + orbit → release (end): the gaps let the just-
    // released voice spring home, so the chord audibly re-voices.
    if (local < 0.14 || local > 0.86) return { heldIndex: -1, target: null };

    const p = this.params[idx];
    const u = (local - 0.14) / 0.72; // 0..1 during the hold
    const az = baseAzimuth(idx) + Math.sin(u * Math.PI) * p.sweep + u * p.dir * 0.6;
    const height = Math.sin(u * Math.PI * 2 + p.elPhase) * p.elAmp;
    const r =
      HELD_RADIUS * (1 - 0.15 * Math.sin(u * Math.PI)) + p.rWobble * Math.sin(u * 3);
    return { heldIndex: idx, target: sph(az, height, Math.max(1.0, r)) };
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
