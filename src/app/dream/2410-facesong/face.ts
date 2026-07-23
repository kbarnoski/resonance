// face.ts — the expressive control surface for 2410-facesong.
//
// This is the lab's first real MediaPipe FaceLandmarker integration driven by
// the 52 BLENDSHAPE coefficients (jawOpen, mouthSmileLeft/Right, browInnerUp,
// browDownLeft/Right, eyeBlinkLeft/Right, mouthPucker, …) plus head pose read
// from the 478-point landmark geometry. Everything here is pure data + drawing:
//
//   • createLandmarker()        — runtime CDN load (webpackIgnore), raced to 12s.
//   • blendshapeLookup()        — {name → score} map from result.faceBlendshapes.
//   • computeHeadPose()         — roll / yaw from nose vs eye-line geometry.
//   • computeFaceParams()       — blendshapes + pose → the FaceParams the synth
//                                 and the mesh both consume.
//   • buildLiveGeometry()       — the real 478-point cloud + contour polylines.
//   • buildParametricGeometry() — a clean synthetic face (auto-demo / fallback)
//                                 deformed by the SAME FaceParams, so the mesh
//                                 always "sings back" what the expression does.
//   • drawFaceMesh()            — glowing bioluminescent phosphor renderer.
//   • mulberry32() / makeAutoDriver() — SEEDED deterministic auto-demo (no
//                                 Math.random, no Date.now).
//
// Privacy: camera frames are analysed in-browser only — never recorded, stored,
// or transmitted.

// ── CDN endpoints ────────────────────────────────────────────────────────────

const MEDIAPIPE_MODULE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// ── Minimal typings for the untyped CDN module ───────────────────────────────

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

interface FaceResult {
  faceLandmarks: Landmark[][];
  faceBlendshapes: Array<{ categories: BlendshapeCategory[] }>;
}

export interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceResult;
  close(): void;
}

interface MpVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
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

// ── Runtime loader (raced against a timeout so a blocked CDN can't hang) ──────

async function loadLandmarker(): Promise<FaceLandmarkerInst> {
  const vision = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_MODULE
  )) as unknown as MpVision;
  const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
  return vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
}

export async function createLandmarker(
  timeoutMs = 12000,
): Promise<FaceLandmarkerInst> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("MediaPipe load timed out")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([loadLandmarker(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── Blendshape lookup ────────────────────────────────────────────────────────

export function blendshapeLookup(
  categories: BlendshapeCategory[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of categories) map.set(c.categoryName, c.score);
  return map;
}

// ── The control surface every consumer reads ─────────────────────────────────

export interface FaceParams {
  /** Mouth open, 0..1 — gate + amplitude + open vowel. */
  jawOpen: number;
  /** Smile, 0..1 — brightness, pulls the vowel toward "ee". */
  smile: number;
  /** Lip round, 0..1 — darker, rounder "oo" vowel. */
  pucker: number;
  /** Brow, signed -1..1 — raise = up bend, lower = down bend. */
  brow: number;
  /** Both-eye blink, 0..1 — a soft accent when it spikes. */
  blink: number;
  /** Head tilt → stereo pan, -1..1. */
  pan: number;
  /** Visual head-roll in radians (for the mesh tilt). */
  roll: number;
  /** Head yaw, -1..1 — a secondary drone detune. */
  yaw: number;
  /** Overall expressive energy, 0..1. */
  energy: number;
}

export function neutralParams(): FaceParams {
  return {
    jawOpen: 0,
    smile: 0,
    pucker: 0,
    brow: 0,
    blink: 0,
    pan: 0,
    roll: 0,
    yaw: 0,
    energy: 0,
  };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampS = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

// ── Head pose from landmark geometry ─────────────────────────────────────────
// Landmark indices: 1 = nose tip, 33 = right-eye outer corner (image space),
// 263 = left-eye outer corner. All coords normalised 0..1, x already mirrored
// by the caller so the piece reads like a mirror.

export interface HeadPose {
  roll: number; // radians, eye-line tilt
  yaw: number; // -1..1, nose offset from the eye midpoint
}

export function computeHeadPose(pts: Array<{ x: number; y: number }>): HeadPose {
  const nose = pts[1];
  const eyeR = pts[33];
  const eyeL = pts[263];
  if (!nose || !eyeR || !eyeL) return { roll: 0, yaw: 0 };
  const roll = Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x);
  const midX = (eyeL.x + eyeR.x) / 2;
  const eyeSpan = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeR.y) || 1e-3;
  const yaw = clampS(((nose.x - midX) / eyeSpan) * 2.4);
  return { roll, yaw };
}

// ── Blendshapes + pose → FaceParams ──────────────────────────────────────────

export function computeFaceParams(
  landmarks: Landmark[],
  blend: Map<string, number>,
): FaceParams {
  const g = (name: string): number => blend.get(name) ?? 0;

  // Mirror x so head-tilt-right pans right and the mesh reads as a mirror.
  const mirrored = landmarks.map((p) => ({ x: 1 - p.x, y: p.y }));
  const pose = computeHeadPose(mirrored);

  const smile = clamp01((g("mouthSmileLeft") + g("mouthSmileRight")) / 2);
  const browUp = g("browInnerUp");
  const browDn = (g("browDownLeft") + g("browDownRight")) / 2;
  const brow = clampS(browUp - browDn * 1.15);
  const blink = clamp01((g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2);
  const jawOpen = clamp01(g("jawOpen"));
  const pucker = clamp01(g("mouthPucker"));

  // Head roll ~ ±0.5 rad in practice → pan. Negate so tilting the top of the
  // head toward an ear pans toward that ear.
  const pan = clampS(-pose.roll * 2.6);

  const energy = clamp01(
    jawOpen * 0.5 + smile * 0.25 + Math.abs(brow) * 0.15 + pucker * 0.1,
  );

  return {
    jawOpen,
    smile,
    pucker,
    brow,
    blink,
    pan,
    roll: pose.roll,
    yaw: pose.yaw,
    energy,
  };
}

// ── Seeded deterministic PRNG (auto-demo only) ───────────────────────────────

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

/**
 * Builds a deterministic auto-demo driver. The returned fn maps elapsed
 * seconds → a breathing FaceParams: mouth opens/closes, brows drift, an
 * occasional blink, gentle head sway. Fully seeded — no Math.random / Date.
 */
export function makeAutoDriver(seed: number): (t: number) => FaceParams {
  const rand = mulberry32(seed);
  const phase: number[] = [];
  for (let i = 0; i < 8; i++) phase.push(rand() * Math.PI * 2);

  return (t: number): FaceParams => {
    const s = (k: number, f: number) => Math.sin(t * f + phase[k]);

    // Mouth: mostly open/close swells with a shaped floor.
    const jawRaw = 0.5 + 0.5 * s(0, 0.62);
    const jawOpen = clamp01(0.08 + Math.pow(jawRaw, 1.6) * 0.82);

    const smile = clamp01(0.32 + 0.32 * s(1, 0.29));
    const puckerRaw = s(2, 0.21);
    const pucker = clamp01(Math.max(0, puckerRaw) * 0.55 * (1 - smile));
    const brow = clampS(s(3, 0.44) * 0.72);

    // Blink: a quick spike roughly every ~5 s.
    const bt = (t * 0.2 + phase[4]) % (Math.PI * 2);
    const bn = bt / (Math.PI * 2);
    const blink = bn < 0.03 ? 1 - bn / 0.03 : 0;

    const roll = s(5, 0.17) * 0.32;
    const pan = clampS(-roll * 2.6);
    const yaw = clampS(s(6, 0.12) * 0.5);
    const energy = clamp01(jawOpen * 0.5 + smile * 0.25 + Math.abs(brow) * 0.2);

    return { jawOpen, smile, pucker, brow, blink, pan, roll, yaw, energy };
  };
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

export interface FaceGeometry {
  /** Normalised 0..1 points, already oriented for display. */
  points: Pt[];
  /** Ordered polylines (index lists into `points`). */
  contours: number[][];
  /** Indices in `points` to render as bright vertex nodes. */
  nodes: number[];
  /** Faint background dot field (the "tesselation" cloud). */
  cloud: Pt[];
}

// A tasteful subset of the FaceLandmarker 478-point mesh: face oval, brows,
// eyes, nose bridge, and both lip loops. Ordered as polylines.
const LIVE_CONTOURS: number[][] = [
  // Face oval
  [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109, 10,
  ],
  // Left brow (image left)
  [70, 63, 105, 66, 107],
  // Right brow
  [336, 296, 334, 293, 300],
  // Left eye
  [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 33],
  // Right eye
  [
    362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381,
    382, 362,
  ],
  // Nose bridge
  [168, 6, 197, 195, 5, 4, 1],
  // Outer lips
  [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
    181, 91, 146, 61,
  ],
  // Inner lips
  [
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14,
    87, 178, 88, 95, 78,
  ],
];

const LIVE_NODES = [1, 33, 263, 61, 291, 13, 14, 70, 300, 105, 334, 152, 168];

export function buildLiveGeometry(landmarks: Landmark[]): FaceGeometry {
  // Mirror x so the mesh tracks like a mirror.
  const points: Pt[] = landmarks.map((p) => ({ x: 1 - p.x, y: p.y }));
  return {
    points,
    contours: LIVE_CONTOURS,
    nodes: LIVE_NODES.filter((i) => i < points.length),
    cloud: points, // the true 478-point cloud
  };
}

// ── Parametric face (auto-demo / fallback) ───────────────────────────────────
// Built in normalised 0..1 space, centred and roll-rotated, then deformed by
// FaceParams so it visibly enacts the expression.

function rot(p: Pt, c: Pt, a: number): Pt {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const co = Math.cos(a);
  const si = Math.sin(a);
  return { x: c.x + dx * co - dy * si, y: c.y + dx * si + dy * co };
}

export function buildParametricGeometry(
  fp: FaceParams,
  phase: number,
): FaceGeometry {
  const points: Pt[] = [];
  const contours: number[][] = [];
  const nodes: number[] = [];
  const cloud: Pt[] = [];

  const breath = 1 + Math.sin(phase * 0.9) * 0.012;
  const cx = 0.5 + fp.pan * 0.04;
  const cy = 0.5;
  const center: Pt = { x: cx, y: cy };
  const roll = fp.roll * 0.55;

  const push = (p: Pt): number => {
    points.push(rot(p, center, roll));
    return points.length - 1;
  };
  const line = (pts: Pt[], asNode = false): void => {
    const idx = pts.map(push);
    contours.push(idx);
    if (asNode) nodes.push(idx[0], idx[idx.length - 1]);
  };

  const rx = 0.225 * breath;
  const ry = 0.315 * breath;

  // Face oval — the lower jaw drops with jawOpen.
  {
    const N = 40;
    const oval: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      const s = Math.sin(ang);
      const lower = s > 0 ? 1 + fp.jawOpen * 0.24 * s : 1;
      const narrow = s > 0 ? 1 - fp.jawOpen * 0.04 : 1;
      oval.push({
        x: cx + Math.cos(ang) * rx * narrow,
        y: cy + s * ry * lower,
      });
    }
    line(oval);
  }

  // Eyes — vertical squash on blink.
  const eyeY = cy - 0.06;
  const eyeH = 0.03 * (1 - 0.92 * fp.blink);
  for (const sgn of [-1, 1]) {
    const ecx = cx + sgn * 0.1;
    const eye: Pt[] = [];
    const M = 14;
    for (let i = 0; i <= M; i++) {
      const a = (i / M) * Math.PI * 2;
      eye.push({ x: ecx + Math.cos(a) * 0.055, y: eyeY + Math.sin(a) * eyeH });
    }
    line(eye);
    // Iris node.
    nodes.push(push({ x: ecx, y: eyeY }));
  }

  // Brows — inner ends lift with brow, arch shape.
  for (const sgn of [-1, 1]) {
    const bcx = cx + sgn * 0.105;
    const brow: Pt[] = [];
    const K = 6;
    const lift = fp.brow * 0.03;
    for (let i = 0; i <= K; i++) {
      const u = i / K; // 0 = inner, 1 = outer
      const x = bcx + sgn * (u - 0.5) * 0.14;
      const arch = -Math.sin(u * Math.PI) * 0.012;
      const inner = (1 - u) * lift; // inner end lifts most
      brow.push({ x, y: cy - 0.115 + arch - inner });
    }
    line(brow, true);
  }

  // Nose bridge.
  line([
    { x: cx, y: cy - 0.095 },
    { x: cx - 0.006, y: cy - 0.02 },
    { x: cx, y: cy + 0.055 },
  ]);
  nodes.push(push({ x: cx, y: cy + 0.055 }));

  // Lips — width from smile/pucker, opening from jawOpen.
  {
    const mcx = cx;
    const mcy = cy + 0.19;
    const w = 0.075 * (1 + fp.smile * 0.42 - fp.pucker * 0.4);
    const open = (fp.jawOpen * 0.1 + 0.004) * (1 + fp.pucker * 0.5);
    const lift = fp.smile * 0.028;

    const sampleQuad = (a: Pt, ctrl: Pt, b: Pt, n: number): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const mt = 1 - t;
        out.push({
          x: mt * mt * a.x + 2 * mt * t * ctrl.x + t * t * b.x,
          y: mt * mt * a.y + 2 * mt * t * ctrl.y + t * t * b.y,
        });
      }
      return out;
    };
    const left: Pt = { x: mcx - w, y: mcy - lift };
    const right: Pt = { x: mcx + w, y: mcy - lift };
    const upper = sampleQuad(
      left,
      { x: mcx, y: mcy - 0.02 - open * 0.35 },
      right,
      10,
    );
    const lower = sampleQuad(
      right,
      { x: mcx, y: mcy + 0.022 + open },
      left,
      10,
    );
    line([...upper, ...lower.slice(1)]);
    nodes.push(push(left), push(right));

    // Inner opening when the mouth is meaningfully open.
    if (open > 0.02) {
      const inner: Pt[] = [];
      const P = 16;
      for (let i = 0; i <= P; i++) {
        const a = (i / P) * Math.PI * 2;
        inner.push({
          x: mcx + Math.cos(a) * w * 0.62,
          y: mcy + Math.sin(a) * open * 0.92,
        });
      }
      line(inner);
    }
  }

  // Interior phosphor cloud — concentric rings clipped to the oval, evoking a
  // tesselation without drawing all 478 edges. Deterministic.
  {
    const rings = [0.32, 0.52, 0.72, 0.9];
    for (const rr of rings) {
      const count = Math.round(10 + rr * 22);
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + rr * 1.3;
        const p = rot(
          { x: cx + Math.cos(ang) * rx * rr, y: cy + Math.sin(ang) * ry * rr },
          center,
          roll,
        );
        cloud.push(p);
      }
    }
  }

  return { points, contours, nodes, cloud };
}

// ── Renderer — cool bioluminescent phosphor (teal / indigo / white) ──────────

const BG = "#05070f";
const CLOUD_COLOR = "rgba(45, 212, 191, 0.30)";
const LINE_TEAL = "rgba(94, 234, 212, 0.85)";
const LINE_INDIGO = "rgba(129, 140, 248, 0.55)";
const CORE = "rgba(240, 253, 250, 0.95)";
const NODE_COLOR = "rgba(165, 243, 252, 0.95)";

export function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  geom: FaceGeometry,
  glow: number,
  phase: number,
): void {
  // Fit the normalised face into the canvas with a little margin, preserving
  // a portrait-ish framing.
  const pad = 0.08;
  const sx = W * (1 - pad * 2);
  const sy = H * (1 - pad * 2);
  const ox = W * pad;
  const oy = H * pad;
  const X = (p: Pt) => ox + p.x * sx;
  const Y = (p: Pt) => oy + p.y * sy;

  // Trails-free dark clear with a faint vignette breath.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  const rg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.1,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.62,
  );
  rg.addColorStop(0, `rgba(20, 40, 60, ${0.22 + glow * 0.14})`);
  rg.addColorStop(1, "rgba(5, 7, 15, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = "lighter";

  // Cloud dots — the phosphor tesselation field.
  ctx.fillStyle = CLOUD_COLOR;
  const shimmer = 0.6 + 0.4 * Math.sin(phase * 1.7);
  for (let i = 0; i < geom.cloud.length; i++) {
    const p = geom.cloud[i];
    const r = 0.9 + (i % 3 === 0 ? shimmer : 0.4);
    ctx.beginPath();
    ctx.arc(X(p), Y(p), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Contour polylines — indigo halo, teal body, white core.
  const drawPass = (color: string, width: number, blur: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    for (const contour of geom.contours) {
      ctx.beginPath();
      for (let i = 0; i < contour.length; i++) {
        const p = geom.points[contour[i]];
        if (!p) continue;
        const px = X(p);
        const py = Y(p);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  };

  drawPass(LINE_INDIGO, 6 + glow * 3, 14 + glow * 12);
  drawPass(LINE_TEAL, 2.4, 8);
  ctx.shadowBlur = 0;
  drawPass(CORE, 1, 0);

  // Vertex nodes.
  ctx.fillStyle = NODE_COLOR;
  ctx.shadowColor = NODE_COLOR;
  ctx.shadowBlur = 10;
  for (const n of geom.nodes) {
    const p = geom.points[n];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(X(p), Y(p), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
}
