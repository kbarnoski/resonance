// motion.ts — the control surface for 2590-tremor.
//
// The human moves; the machine sings what the motion means. Everything here
// turns real (or synthetic) movement into a single normalized MotionState that
// both the voice (audio.ts) and the voice-field (glfield.ts) consume:
//
//   • mulberry32() / makeAutoDriver() — the SEEDED deterministic auto-demo: a
//     synthetic gesture that rises, opens, accelerates, then stills. No
//     Math.random, no Date.now — performance.now() is the only clock.
//   • createHandTracker()             — PREFERRED: MediaPipe HandLandmarker via
//     a runtime ESM CDN import (webpackIgnore), raced against a timeout so a
//     blocked CDN can never hang. Degrades to the flow tracker, then the demo.
//   • makeFlowTracker()               — FALLBACK: a frame-difference motion
//     field computed from camera pixels in an OFFSCREEN canvas (pixel READ for
//     analysis only — never a visible drawing surface).
//
// Privacy: camera frames are analysed in-browser only — never recorded, stored,
// or transmitted.

// ── The one state every consumer reads ───────────────────────────────────────

export interface MotionState {
  /** Motion centroid, normalized 0..1. cy: 0 = top of frame. */
  cx: number;
  cy: number;
  /** Overall motion energy, 0..1 — drives gain. */
  energy: number;
  /** Openness / spread of the motion, 0..1 — drives the vowel/formants. */
  spread: number;
  /** Speed of the centroid, 0..1 — drives roughness/growl. */
  velocity: number;
}

export function restState(): MotionState {
  return { cx: 0.5, cy: 0.6, energy: 0, spread: 0.1, velocity: 0 };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Seeded PRNG (deterministic — seed 0x2590) ────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The seeded auto-demo gesture ─────────────────────────────────────────────
//
// A looping ~13s gesture: rest → rise → open → accelerate (clash) → still.
// Keyframes are interpolated with smoothstep; a little seeded value-noise keeps
// it organic without any live randomness.

interface Key {
  t: number;
  cy: number;
  spread: number;
  energy: number;
  velocity: number;
}

const KEYS: Key[] = [
  { t: 0.0, cy: 0.8, spread: 0.08, energy: 0.04, velocity: 0.02 },
  { t: 3.0, cy: 0.3, spread: 0.14, energy: 0.34, velocity: 0.3 },
  { t: 6.0, cy: 0.27, spread: 0.86, energy: 0.55, velocity: 0.36 },
  { t: 8.6, cy: 0.42, spread: 0.92, energy: 0.96, velocity: 0.96 },
  { t: 11.0, cy: 0.56, spread: 0.28, energy: 0.07, velocity: 0.04 },
  { t: 13.0, cy: 0.8, spread: 0.08, energy: 0.04, velocity: 0.02 },
];

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function makeAutoDriver(seed: number): (tSeconds: number) => MotionState {
  const rnd = mulberry32(seed);
  // Seeded value-noise table for gentle organic drift.
  const noise = Array.from({ length: 32 }, () => rnd() * 2 - 1);
  const period = KEYS[KEYS.length - 1].t;

  const valNoise = (u: number) => {
    const x = u * noise.length;
    const i = Math.floor(x) % noise.length;
    const j = (i + 1) % noise.length;
    const f = x - Math.floor(x);
    const s = f * f * (3 - 2 * f);
    return noise[i] * (1 - s) + noise[j] * s;
  };

  return (tSeconds: number): MotionState => {
    const t = ((tSeconds % period) + period) % period;
    let k = 0;
    while (k < KEYS.length - 1 && t >= KEYS[k + 1].t) k++;
    const a = KEYS[k];
    const b = KEYS[Math.min(k + 1, KEYS.length - 1)];
    const s = smoothstep(a.t, b.t, t);
    const lerp = (p: number, q: number) => p + (q - p) * s;

    const energy = clamp01(lerp(a.energy, b.energy) + valNoise(t * 0.15) * 0.03);
    const spread = clamp01(lerp(a.spread, b.spread) + valNoise(t * 0.21 + 5) * 0.04);
    const velocity = clamp01(lerp(a.velocity, b.velocity));
    const cy = clamp01(lerp(a.cy, b.cy) + valNoise(t * 0.11 + 9) * 0.03);
    // Horizontal sweep grows with energy; seeded wobble on top.
    const cx = clamp01(
      0.5 +
        Math.sin(tSeconds * 0.9) * (0.12 + energy * 0.28) +
        valNoise(t * 0.5 + 2) * 0.05,
    );
    return { cx, cy, energy, spread, velocity };
  };
}

// ── Optical-flow / frame-difference tracker (fallback) ───────────────────────

export interface Tracker {
  /** Read the next frame and return the current MotionState. */
  read(): MotionState;
  dispose(): void;
}

const FLOW_W = 64;
const FLOW_H = 48;

export function makeFlowTracker(video: HTMLVideoElement): Tracker {
  const canvas = document.createElement("canvas");
  canvas.width = FLOW_W;
  canvas.height = FLOW_H;
  // Offscreen 2D context used ONLY to read pixels for motion analysis — this is
  // not a visible renderer.
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let prev: Uint8ClampedArray | null = null;
  const smooth = restState();
  let lastCx = 0.5;
  let lastCy = 0.6;

  const read = (): MotionState => {
    if (!ctx || video.videoWidth === 0) return smooth;
    ctx.drawImage(video, 0, 0, FLOW_W, FLOW_H);
    const frame = ctx.getImageData(0, 0, FLOW_W, FLOW_H).data;

    if (!prev) {
      prev = frame.slice();
      return smooth;
    }

    let total = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    for (let y = 0; y < FLOW_H; y++) {
      for (let x = 0; x < FLOW_W; x++) {
        const i = (y * FLOW_W + x) * 4;
        const d =
          Math.abs(frame[i] - prev[i]) +
          Math.abs(frame[i + 1] - prev[i + 1]) +
          Math.abs(frame[i + 2] - prev[i + 2]);
        if (d > 28) {
          const w = d;
          total += w;
          sumX += x * w;
          sumY += y * w;
          sumXX += x * x * w;
          sumYY += y * y * w;
        }
      }
    }
    prev = frame.slice();

    const cells = FLOW_W * FLOW_H;
    const energyRaw = total / (cells * 160);
    const energy = clamp01(Math.sqrt(energyRaw));

    let cx = lastCx;
    let cy = lastCy;
    let spread = smooth.spread;
    if (total > 0) {
      const mx = sumX / total;
      const my = sumY / total;
      // Mirror x for a natural, face-you feel.
      cx = clamp01(1 - mx / FLOW_W);
      cy = clamp01(my / FLOW_H);
      const varX = Math.max(0, sumXX / total - mx * mx);
      const varY = Math.max(0, sumYY / total - my * my);
      const spreadRaw = (Math.sqrt(varX) / FLOW_W + Math.sqrt(varY) / FLOW_H) * 1.6;
      spread = clamp01(spreadRaw);
    }

    const dx = cx - lastCx;
    const dy = cy - lastCy;
    const velocity = clamp01(Math.hypot(dx, dy) * 14 + energy * 0.3);
    lastCx = cx;
    lastCy = cy;

    // EMA smoothing so the field/voice glides rather than jitters.
    const a = 0.35;
    smooth.cx += (cx - smooth.cx) * a;
    smooth.cy += (cy - smooth.cy) * a;
    smooth.energy += (energy - smooth.energy) * a;
    smooth.spread += (spread - smooth.spread) * a;
    smooth.velocity += (velocity - smooth.velocity) * (a * 1.4);
    return { ...smooth };
  };

  return {
    read,
    dispose: () => {
      prev = null;
    },
  };
}

// ── MediaPipe HandLandmarker (preferred) ─────────────────────────────────────

const MP_MODULE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MP_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

interface MpLandmark {
  x: number;
  y: number;
  z: number;
}
interface HandResult {
  landmarks: MpLandmark[][];
}
interface HandLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandResult;
  close(): void;
}
interface MpVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numHands?: number;
      },
    ): Promise<HandLandmarkerInst>;
  };
}

async function loadHandLandmarker(): Promise<HandLandmarkerInst> {
  const vision = (await import(
    /* webpackIgnore: true */ MP_MODULE
  )) as unknown as MpVision;
  const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

export async function createHandTracker(
  video: HTMLVideoElement,
  timeoutMs = 12000,
): Promise<Tracker> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("MediaPipe load timed out")), timeoutMs);
  });
  let inst: HandLandmarkerInst;
  try {
    inst = await Promise.race([loadHandLandmarker(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const smooth = restState();
  let lastCx = 0.5;
  let lastCy = 0.6;

  const read = (): MotionState => {
    if (video.videoWidth === 0) return { ...smooth };
    let cx = lastCx;
    let cy = lastCy;
    let spread = smooth.spread;
    try {
      const res = inst.detectForVideo(video, performance.now());
      const hands = res.landmarks;
      if (hands && hands.length > 0) {
        let sx = 0;
        let sy = 0;
        let n = 0;
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (const hand of hands) {
          for (const p of hand) {
            sx += p.x;
            sy += p.y;
            n++;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
        }
        // Mirror x for a natural, face-you feel.
        cx = clamp01(1 - sx / n);
        cy = clamp01(sy / n);
        // Openness = bounding-box area of the hand(s), amplified.
        spread = clamp01(((maxX - minX) + (maxY - minY)) * 1.3);
      } else {
        // No hand — relax openness toward rest.
        spread = smooth.spread * 0.9;
      }
    } catch {
      return { ...smooth };
    }

    const dx = cx - lastCx;
    const dy = cy - lastCy;
    const velocity = clamp01(Math.hypot(dx, dy) * 12);
    const energy = clamp01(velocity * 0.85 + spread * 0.12);
    lastCx = cx;
    lastCy = cy;

    const a = 0.4;
    smooth.cx += (cx - smooth.cx) * a;
    smooth.cy += (cy - smooth.cy) * a;
    smooth.spread += (spread - smooth.spread) * a;
    smooth.energy += (energy - smooth.energy) * a;
    smooth.velocity += (velocity - smooth.velocity) * (a * 1.3);
    return { ...smooth };
  };

  return {
    read,
    dispose: () => {
      try {
        inst.close();
      } catch {
        /* noop */
      }
    },
  };
}
