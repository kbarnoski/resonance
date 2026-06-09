// hands.ts — MediaPipe HandLandmarker integration + ghost-hands fallback
//
// Privacy: camera frames NEVER stored, drawn, or transmitted.
// The webcam stream is analysis-only — landmarks extracted, video discarded.
//
// Exports:
//   HandState       — normalised snapshot of one hand
//   startHandTracking() — loads MediaPipe from CDN, returns cleanup fn
//   makeGhostHands() — autonomous attractor demo used when camera unavailable

export interface HandState {
  /** palm centre x, 0=left 1=right (screen space) */
  x: number;
  /** palm centre y, 0=top 1=bottom (screen space, flipped to 0=bottom 1=top for audio) */
  y: number;
  /** height: 0=bottom 1=top — y flipped for intuitive "raise = high" mapping */
  height: number;
  /** openness: 0=fist/pinch, 1=fully open */
  openness: number;
  /** motion speed, 0..1 */
  speed: number;
  /** is this hand slot currently active */
  active: boolean;
  /** hand colour for rendering hint: 0=magenta/left, 1=cyan/right */
  hue: number;
}

export interface Attractor {
  /** 0..1 screen x */
  x: number;
  /** 0..1 screen y */
  y: number;
  /** strength: positive = attract, negative = repel */
  strength: number;
  /** radius of influence, 0..1 */
  radius: number;
  /** 0..1 hue hint for colour-coding */
  hue: number;
}

export interface HandsOutput {
  hands: [HandState, HandState];
  attractors: Attractor[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// Compute openness from 21-landmark array
function computeOpenness(lm: Array<{ x: number; y: number; z: number }>): number {
  const tips = [4, 8, 12, 16, 20];
  const palm = lm[0];
  const mid = lm[9];
  const span = Math.hypot(mid.x - palm.x, mid.y - palm.y) || 0.001;
  let spread = 0;
  for (const ti of tips) spread += Math.hypot(lm[ti].x - palm.x, lm[ti].y - palm.y);
  spread /= tips.length;
  return clamp01((spread / span - 1.0) / 2.0);
}

// Convert landmarks array to HandState
function landmarksToHandState(
  lm: Array<{ x: number; y: number; z: number }>,
  prevHand: HandState,
  hue: number,
  dt: number,
): HandState {
  const x = clamp01(lm[0].x);
  const y = clamp01(lm[0].y);
  const height = clamp01(1 - y); // flip: y=0 = top of screen = high
  const openness = computeOpenness(lm);
  const dx = x - prevHand.x;
  const dy = y - prevHand.y;
  const rawSpeed = Math.hypot(dx, dy) / Math.max(dt, 0.001);
  const speed = clamp01(prevHand.speed * 0.85 + rawSpeed * 0.5);
  return { x, y, height, openness, speed, active: true, hue };
}

// Build attractor from hand state
function handToAttractor(hand: HandState): Attractor {
  // open hand → repels (push), closed/pinched → attracts (pull)
  const strength = hand.openness > 0.5 ? -0.6 : 0.8;
  const radius = 0.15 + hand.openness * 0.15;
  return { x: hand.x, y: hand.y, strength, radius, hue: hand.hue };
}

const INACTIVE_HAND: HandState = {
  x: 0.5, y: 0.5, height: 0.5, openness: 0.5, speed: 0, active: false, hue: 0,
};

// ── Ghost hands: autonomous wandering attractors for self-demo ────────────────

export function makeGhostHands(): (dt?: number) => HandsOutput {
  let t = 0;

  return function sampleGhostHands(dt = 0.016): HandsOutput {
    t += dt;

    // Hand 0: slow elliptical orbit
    const x0 = 0.35 + Math.sin(t * 0.18) * 0.28;
    const y0 = 0.45 + Math.cos(t * 0.13) * 0.22;
    const open0 = (Math.sin(t * 0.31) + 1) / 2;

    // Hand 1: slightly faster figure-8
    const x1 = 0.65 + Math.sin(t * 0.22 + 1.7) * 0.22;
    const y1 = 0.48 + Math.cos(t * 0.17 + 0.9) * 0.25;
    const open1 = (Math.sin(t * 0.27 + 2.1) + 1) / 2;

    const h0: HandState = {
      x: clamp01(x0), y: clamp01(y0),
      height: clamp01(1 - y0), openness: open0,
      speed: 0.1, active: true, hue: 0,
    };
    const h1: HandState = {
      x: clamp01(x1), y: clamp01(y1),
      height: clamp01(1 - y1), openness: open1,
      speed: 0.1, active: true, hue: 0.55,
    };

    return {
      hands: [h0, h1],
      attractors: [handToAttractor(h0), handToAttractor(h1)],
    };
  };
}

// ── MediaPipe hand tracking ───────────────────────────────────────────────────

export interface TrackingResult {
  /** Call each frame with delta time in seconds; returns current output */
  sample: (dt: number) => HandsOutput;
  /** Stop tracking and release camera */
  destroy: () => void;
}

type MPLandmark = { x: number; y: number; z: number };
type MPHandLandmarker = {
  detectForVideo: (video: HTMLVideoElement, ts: number) => { landmarks?: MPLandmark[][] };
  close: () => void;
};

export async function startHandTracking(
  video: HTMLVideoElement,
  onError: (msg: string) => void,
): Promise<TrackingResult | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch {
    onError("Camera not available — enjoying ghost-hand demo");
    return null;
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    onError("Video playback failed — enjoying ghost-hand demo");
    return null;
  }

  // Load MediaPipe from CDN (dynamic import, no local types needed)
  let handLandmarker: MPHandLandmarker;
  try {
    // Load MediaPipe via Function to avoid TS module-resolution on CDN URL
    const dynamicImport = new Function("url", "return import(url)") as (url: string) => Promise<unknown>;
    const visionRaw = await Promise.race<unknown>([
      dynamicImport("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/+esm"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vision = visionRaw as any;
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm",
    );
    handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    }) as MPHandLandmarker;
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    onError("Hand tracking model unavailable — enjoying ghost-hand demo");
    return null;
  }

  let prevHands: [HandState, HandState] = [{ ...INACTIVE_HAND }, { ...INACTIVE_HAND }];
  let active = true;

  function sample(dt: number): HandsOutput {
    if (!active || video.readyState < 2) {
      return { hands: [{ ...INACTIVE_HAND }, { ...INACTIVE_HAND }], attractors: [] };
    }

    let result: { landmarks?: MPLandmark[][] } = {};
    try {
      result = handLandmarker.detectForVideo(video, performance.now());
    } catch {
      return { hands: prevHands, attractors: prevHands.filter(h => h.active).map(handToAttractor) };
    }

    const lms = result.landmarks ?? [];
    const newHands: [HandState, HandState] = [{ ...INACTIVE_HAND }, { ...INACTIVE_HAND }];

    for (let i = 0; i < Math.min(2, lms.length); i++) {
      const hue = i === 0 ? 0 : 0.55; // magenta / cyan
      newHands[i] = landmarksToHandState(lms[i], prevHands[i], hue, dt);
    }

    prevHands = newHands;
    const attractors = newHands.filter(h => h.active).map(handToAttractor);
    return { hands: newHands, attractors };
  }

  function destroy() {
    active = false;
    stream.getTracks().forEach((t) => t.stop());
    try { handLandmarker.close(); } catch { /* ignore */ }
    video.srcObject = null;
  }

  return { sample, destroy };
}
