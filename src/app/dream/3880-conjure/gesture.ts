// ── 3880-conjure · hand-geometry → coherence-scored gesture reader ─────────
//
// Turns 21 raw hand landmarks into (a) a small set of continuous geometric
// controls that drive sound + visuals, and (b) a single "coherence" score in
// [0,1]: how cleanly the hand forms a stable, recognizable open "conjuring"
// shape (fingers extended, evenly fanned, held steady) versus a sloppy,
// ambiguous, jittery shape (or no hand at all).
//
// Coherence = 0.5 × TEMPLATE MATCH (per-finger straightness + even fan
// spacing, compared against the canonical open-hand "conjure" template) +
// 0.5 × STABILITY (how little the scale-normalized landmark configuration
// has moved since the last frame, i.e. how "held" the shape is).
//
// Landmark indices (MediaPipe Hands, 21 points):
//   0 wrist
//   1-4  thumb  (cmc, mcp, ip, tip)
//   5-8  index  (mcp, pip, dip, tip)
//   9-12 middle (mcp, pip, dip, tip)
//   13-16 ring  (mcp, pip, dip, tip)
//   17-20 pinky (mcp, pip, dip, tip)

import type { HandLandmark } from "./handLoader";

export interface GestureFrame {
  present: boolean;
  /** 0 (sloppy / absent) .. 1 (a clean, held, evenly-spread open hand). */
  coherence: number;
  /** 0 (bottom of frame) .. 1 (top of frame) — drives CONTINUOUS root pitch. */
  height: number;
  /** 0 (fingers together) .. 1 (fingers fanned wide) — chord voicing width. */
  spread: number;
  /** 0 (thumb+index apart) .. 1 (pinched together) — extra voicing accent. */
  pinch: number;
  /** 0 (fist-like) .. 1 (fingers extended away from palm) — filter brightness. */
  openness: number;
  /** -1 (tilted left) .. 1 (tilted right) — stereo pan. */
  tilt: number;
  palmCenter: { x: number; y: number };
  /** the raw (mirrored) skeleton, for HUD / particle-anchor use. */
  landmarks: HandLandmark[] | null;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

const FINGERS: [number, number, number, number][] = [
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // pinky
];

function fingerStraightness(lm: HandLandmark[], chain: number[]): number {
  // average cosine similarity between consecutive bone segments — a fully
  // extended finger has nearly-collinear segments (cos ~1); a curled or
  // ambiguously bent finger has lower similarity.
  let sum = 0;
  let n = 0;
  for (let i = 0; i + 2 < chain.length; i++) {
    const a = lm[chain[i]];
    const b = lm[chain[i + 1]];
    const c = lm[chain[i + 2]];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 1e-6;
    const l2 = Math.hypot(v2x, v2y) || 1e-6;
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
    sum += (cos + 1) / 2; // map -1..1 -> 0..1
    n++;
  }
  return n > 0 ? sum / n : 0;
}

function templateMatch(lm: HandLandmark[], wrist: HandLandmark): number {
  // (a) per-finger straightness, averaged
  let straight = 0;
  for (const f of FINGERS) straight += fingerStraightness(lm, f);
  straight /= FINGERS.length;

  // (b) even fan: angles from wrist to each fingertip should be roughly
  // evenly spaced for a clean, deliberate "conjure" shape rather than a
  // random clump.
  const tips = [8, 12, 16, 20].map((i) => lm[i]);
  const angles = tips.map((t) => Math.atan2(t.y - wrist.y, t.x - wrist.x));
  const gaps: number[] = [];
  for (let i = 0; i < angles.length - 1; i++) {
    let d = angles[i + 1] - angles[i];
    while (d < -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    gaps.push(Math.abs(d));
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length || 1e-6;
  let variance = 0;
  for (const g of gaps) variance += (g - meanGap) ** 2;
  variance /= gaps.length;
  const evenness = clamp01(1 - variance / (meanGap * meanGap + 1e-6));

  return clamp01(0.55 * straight + 0.45 * evenness);
}

export interface GestureTracker {
  update(landmarks: HandLandmark[] | null, nowMs: number): GestureFrame;
}

export function createGestureTracker(): GestureTracker {
  let coherence = 0;
  let lastMs: number | null = null;
  let prevNorm: { x: number; y: number }[] | null = null;
  // smoothed continuous outputs (avoid single-frame jitter reaching audio)
  let sHeight = 0.5;
  let sSpread = 0.3;
  let sPinch = 0;
  let sOpenness = 0.5;
  let sTilt = 0;

  function update(landmarks: HandLandmark[] | null, nowMs: number): GestureFrame {
    const dt = lastMs == null ? 1 / 60 : Math.max(0.001, (nowMs - lastMs) / 1000);
    lastMs = nowMs;

    if (!landmarks || landmarks.length < 21) {
      // hand absent — coherence relaxes to 0, everything else holds its
      // last smoothed value so the sound doesn't jump when it returns.
      coherence += (0 - coherence) * (1 - Math.exp(-3.5 * dt));
      prevNorm = null;
      return {
        present: false,
        coherence,
        height: sHeight,
        spread: sSpread,
        pinch: sPinch,
        openness: sOpenness,
        tilt: sTilt,
        palmCenter: { x: 0.5, y: 0.5 },
        landmarks: null,
      };
    }

    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const pinkyMcp = landmarks[17];
    const scale = Math.max(dist(indexMcp, pinkyMcp), 0.02);

    const palmCenter = {
      x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
      y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
    };

    // ── continuous geometric controls ──
    const tipIdxs = [8, 12, 16, 20];
    let spreadSum = 0;
    for (let i = 0; i < tipIdxs.length - 1; i++) {
      spreadSum += dist(landmarks[tipIdxs[i]], landmarks[tipIdxs[i + 1]]);
    }
    const rawSpread = clamp01((spreadSum / 3 / scale - 0.35) / 1.1);

    const rawPinch = clamp01(1 - dist(landmarks[4], landmarks[8]) / scale / 1.4);

    let openSum = 0;
    for (const i of tipIdxs) openSum += dist(landmarks[i], palmCenter);
    const rawOpenness = clamp01((openSum / tipIdxs.length / scale - 0.6) / 1.6);

    const knuckleDx = pinkyMcp.x - indexMcp.x;
    const knuckleDy = pinkyMcp.y - indexMcp.y;
    const rawTilt = clamp01(0.5 + Math.atan2(knuckleDy, knuckleDx) / Math.PI) * 2 - 1;

    const rawHeight = clamp01(1 - wrist.y);

    // ease toward raw values (fast enough to feel live, slow enough to
    // damp per-frame landmark jitter before it reaches the synth)
    const k = 1 - Math.exp(-10 * dt);
    sHeight += (rawHeight - sHeight) * k;
    sSpread += (rawSpread - sSpread) * k;
    sPinch += (rawPinch - sPinch) * k;
    sOpenness += (rawOpenness - sOpenness) * k;
    sTilt += (rawTilt - sTilt) * k;

    // ── coherence: template match + frame-to-frame stability ──
    const match = templateMatch(landmarks, wrist);

    const norm = landmarks.map((p) => ({
      x: (p.x - wrist.x) / scale,
      y: (p.y - wrist.y) / scale,
    }));
    let stability = 1;
    if (prevNorm) {
      let motion = 0;
      for (let i = 0; i < norm.length; i++) {
        motion += Math.hypot(norm[i].x - prevNorm[i].x, norm[i].y - prevNorm[i].y);
      }
      motion /= norm.length;
      const motionPerSec = motion / dt;
      stability = clamp01(Math.exp(-motionPerSec * 0.55));
    }
    prevNorm = norm;

    const rawCoherence = clamp01(0.55 * match + 0.45 * stability);
    const rate = rawCoherence > coherence ? 2.2 : 4.0; // decoheres faster than it blooms
    coherence += (rawCoherence - coherence) * (1 - Math.exp(-rate * dt));

    return {
      present: true,
      coherence,
      height: sHeight,
      spread: sSpread,
      pinch: sPinch,
      openness: sOpenness,
      tilt: sTilt,
      palmCenter,
      landmarks,
    };
  }

  return { update };
}
