// hands.ts — MediaPipe HandLandmarker + ghost auto-demo for Star Reach
//
// PRIVACY: the camera stream is analysis-only. Frames are NEVER drawn,
// stored, or transmitted — only 21 landmark points per hand are read, then
// the video frame is discarded.
//
// Each hand becomes a HandState: a palm position over the star field, a
// "height" register (raise = higher), and an openness (fist = 0, open = 1).
// We additionally emit discrete GESTURE EVENTS:
//   • "gather" — the hand just CLOSED into a fist  → scoop nearest stars + bells
//   • "spill"  — the hand just OPENED wide          → spill stars + rising arc

export type GestureKind = "gather" | "spill";

export interface GestureEvent {
  kind: GestureKind;
  hand: 0 | 1;
  x: number;        // 0..1 screen x (mirrored)
  y: number;        // 0..1 screen y
  height: number;   // 0..1, raise = high
  pan: number;      // -1..1 stereo pan
}

export interface HandState {
  x: number;        // palm-center x, 0..1 (mirrored: matches what kid sees)
  y: number;        // palm-center y, 0..1
  height: number;   // 0..1, raise = high (1 - y)
  openness: number; // 0=fist, 1=open wide
  active: boolean;
  hand: 0 | 1;
}

export interface HandsOutput {
  hands: [HandState, HandState];
  events: GestureEvent[];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const INACTIVE: HandState = {
  x: 0.5, y: 0.5, height: 0.5, openness: 0.5, active: false, hand: 0,
};

// Openness = mean fingertip distance from palm, normalised by hand size.
function computeOpenness(lm: Array<{ x: number; y: number; z: number }>): number {
  const tips = [4, 8, 12, 16, 20];
  const wrist = lm[0];
  const palm = lm[9]; // palm-center proxy (middle-finger MCP)
  // hand "size" = wrist→palm distance (robust to distance from camera)
  const size = Math.hypot(palm.x - wrist.x, palm.y - wrist.y) || 0.001;
  let spread = 0;
  for (const ti of tips) spread += Math.hypot(lm[ti].x - palm.x, lm[ti].y - palm.y);
  spread /= tips.length;
  // normalise: a closed fist ~ 0.9..1.3, an open hand ~ 1.8..2.6 (in size units)
  return clamp01((spread / size - 1.0) / 1.4);
}

// Hysteresis thresholds so gestures fire once, cleanly.
const CLOSE_T = 0.32; // below this = fist
const OPEN_T = 0.62;  // above this = open wide

type Tracked = {
  state: "open" | "fist";
  ox: number;
  oy: number;
};

function detectGesture(
  prev: Tracked,
  openness: number,
  hand: 0 | 1,
  x: number,
  y: number,
): { tracked: Tracked; event: GestureEvent | null } {
  const height = clamp01(1 - y);
  const pan = (x - 0.5) * 1.6;
  let event: GestureEvent | null = null;
  let s = prev.state;
  if (prev.state !== "fist" && openness < CLOSE_T) {
    s = "fist";
    event = { kind: "gather", hand, x, y, height, pan };
  } else if (prev.state !== "open" && openness > OPEN_T) {
    s = "open";
    event = { kind: "spill", hand, x, y, height, pan };
  }
  return { tracked: { state: s, ox: x, oy: y }, event };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ghost hands — autonomous demo so the field is alive + singing on load.
// Two virtual hands slowly drift up into the sky, scoop (fist) then spill (open).
// ─────────────────────────────────────────────────────────────────────────────

export function makeGhostHands(): (dt?: number) => HandsOutput {
  let t = 0;
  const trk: [Tracked, Tracked] = [
    { state: "open", ox: 0.35, oy: 0.4 },
    { state: "open", ox: 0.65, oy: 0.5 },
  ];

  return function sampleGhost(dt = 0.016): HandsOutput {
    t += dt;
    const events: GestureEvent[] = [];

    // Hand 0: reaches up, scoops, holds, spills — slow ~7s cycle
    const x0 = 0.34 + Math.sin(t * 0.21) * 0.20;
    const y0 = 0.55 - (Math.sin(t * 0.18) * 0.5 + 0.5) * 0.35; // drifts upward
    // openness pulses: open → fist (scoop) → open (spill)
    const open0 = (Math.cos(t * 0.55) * 0.5 + 0.5); // 0..1 smooth

    // Hand 1: offset phase so they alternate
    const x1 = 0.66 + Math.sin(t * 0.17 + 2.1) * 0.18;
    const y1 = 0.5 - (Math.sin(t * 0.15 + 1.0) * 0.5 + 0.5) * 0.32;
    const open1 = (Math.cos(t * 0.47 + 3.1) * 0.5 + 0.5);

    const raw: Array<{ x: number; y: number; open: number; hand: 0 | 1 }> = [
      { x: x0, y: y0, open: open0, hand: 0 },
      { x: x1, y: y1, open: open1, hand: 1 },
    ];

    const hands: [HandState, HandState] = [{ ...INACTIVE }, { ...INACTIVE }];
    for (let i = 0; i < 2; i++) {
      const r = raw[i];
      const x = clamp01(r.x);
      const y = clamp01(r.y);
      const { tracked, event } = detectGesture(trk[i], r.open, r.hand, x, y);
      trk[i] = tracked;
      if (event) events.push(event);
      hands[i] = {
        x, y, height: clamp01(1 - y), openness: r.open, active: true, hand: r.hand,
      };
    }
    return { hands, events };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real MediaPipe hand tracking
// ─────────────────────────────────────────────────────────────────────────────

export interface TrackingResult {
  sample: (dt: number) => HandsOutput;
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
    onError("Camera off — ghost hands keep reaching for the stars");
    return null;
  }

  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stream.getTracks().forEach((tk) => tk.stop());
    onError("Camera could not start — ghost hands keep reaching");
    return null;
  }

  let handLandmarker: MPHandLandmarker;
  try {
    // Dynamic import of the CDN ES module. Using new Function avoids TS trying
    // to resolve the remote URL at build time (it would fail tsc otherwise).
    const dynamicImport = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
    const visionRaw = await Promise.race<unknown>([
      dynamicImport("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vision = visionRaw as any;
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
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
    stream.getTracks().forEach((tk) => tk.stop());
    onError("Hand model unavailable — ghost hands keep reaching for the stars");
    return null;
  }

  let active = true;
  let lastDetect = 0;
  let cached: [HandState, HandState] = [{ ...INACTIVE }, { ...INACTIVE }];
  const trk: [Tracked, Tracked] = [
    { state: "open", ox: 0.5, oy: 0.5 },
    { state: "open", ox: 0.5, oy: 0.5 },
  ];

  function sample(_dt: number): HandsOutput {
    void _dt;
    if (!active || video.readyState < 2) {
      return { hands: [{ ...INACTIVE }, { ...INACTIVE }], events: [] };
    }
    const now = performance.now();
    // throttle detection to ~33ms (~30fps), reuse cached state between
    if (now - lastDetect < 33) {
      return { hands: cached, events: [] };
    }
    lastDetect = now;

    let result: { landmarks?: MPLandmark[][] } = {};
    try {
      result = handLandmarker.detectForVideo(video, now);
    } catch {
      return { hands: cached, events: [] };
    }

    const lms = result.landmarks ?? [];
    const hands: [HandState, HandState] = [{ ...INACTIVE }, { ...INACTIVE }];
    const events: GestureEvent[] = [];

    for (let i = 0; i < Math.min(2, lms.length); i++) {
      const lm = lms[i];
      // mirror x so it matches a front-camera "mirror" mental model
      const x = clamp01(1 - lm[9].x);
      const y = clamp01(lm[9].y);
      const openness = computeOpenness(lm);
      const hand: 0 | 1 = i === 0 ? 0 : 1;
      const { tracked, event } = detectGesture(trk[i], openness, hand, x, y);
      trk[i] = tracked;
      if (event) events.push(event);
      hands[i] = { x, y, height: clamp01(1 - y), openness, active: true, hand };
    }
    cached = hands;
    return { hands, events };
  }

  function destroy() {
    active = false;
    stream.getTracks().forEach((tk) => tk.stop());
    try { handLandmarker.close(); } catch { /* ignore */ }
    video.srcObject = null;
  }

  return { sample, destroy };
}
