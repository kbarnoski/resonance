// ════════════════════════════════════════════════════════════════════════════
// 5384 — Cartograph · render.ts   (Canvas2D only — no WebGL/three.js)
//
// Draws the analysis as a map you can read:
//   · the self-similarity matrix as a violet heat-map (bright off-diagonal
//     stripes = repeats, blocks = sections),
//   · thin boundary crosshairs on both axes,
//   · a Foote novelty curve beneath the matrix with boundary peaks marked,
//   · a linear timeline of section blocks (repeated sections share a shade) with
//     mm:ss labels, and
//   · a playhead: a dot on the main diagonal + a cursor on the timeline.
// ════════════════════════════════════════════════════════════════════════════

import type { AnalysisResult } from "./analysis";

export interface Layout {
  pad: number;
  size: number; // matrix side (px, CSS)
  matrixX: number;
  matrixY: number;
  novY: number;
  novH: number;
  tlY: number;
  tlH: number;
  totalH: number;
  width: number;
}

const PAD = 20;
const NOV_H = 60;
const TL_H = 66;
const GAP = 14;

export function computeLayout(width: number): Layout {
  const size = Math.max(120, width - PAD * 2);
  const matrixX = PAD;
  const matrixY = PAD;
  const novY = matrixY + size + GAP;
  const tlY = novY + NOV_H + GAP;
  const totalH = tlY + TL_H + PAD;
  return {
    pad: PAD,
    size,
    matrixX,
    matrixY,
    novY,
    novH: NOV_H,
    tlY,
    tlH: TL_H,
    totalH,
    width,
  };
}

// violet ramp on near-black: low similarity → dark, high → bright violet.
function ssmColor(v: number, out: Uint8ClampedArray, o: number): void {
  // deep(0.043,0.027,0.075) → indigo(0.388,0.400,0.945) → violet(0.545,0.361,0.965) → light(0.85,0.80,1.0)
  const t = v < 0 ? 0 : v > 1 ? 1 : v;
  let r: number;
  let g: number;
  let b: number;
  if (t < 0.4) {
    const k = t / 0.4;
    r = 0.043 + (0.388 - 0.043) * k;
    g = 0.027 + (0.4 - 0.027) * k;
    b = 0.075 + (0.945 - 0.075) * k;
  } else if (t < 0.72) {
    const k = (t - 0.4) / 0.32;
    r = 0.388 + (0.545 - 0.388) * k;
    g = 0.4 + (0.361 - 0.4) * k;
    b = 0.945 + (0.965 - 0.945) * k;
  } else {
    const k = (t - 0.72) / 0.28;
    r = 0.545 + (0.86 - 0.545) * k;
    g = 0.361 + (0.82 - 0.361) * k;
    b = 0.965 + (1.0 - 0.965) * k;
  }
  out[o] = r * 255;
  out[o + 1] = g * 255;
  out[o + 2] = b * 255;
  out[o + 3] = 255;
}

// repeated-section palette (violet family, varied by luminance)
const SEG_COLORS = [
  "rgba(139,92,246,0.55)", // violet-500
  "rgba(99,102,241,0.5)", // indigo
  "rgba(176,67,224,0.5)", // magenta
  "rgba(196,181,253,0.42)", // violet-300
  "rgba(91,46,201,0.55)", // violet-600
  "rgba(167,139,250,0.45)", // violet-400
];

/** Build the N×N heat-map once into an offscreen canvas (with contrast stretch). */
export function buildHeatmap(result: AnalysisResult): HTMLCanvasElement {
  const { n, ssm, ssmLo, ssmHi } = result;
  const cv = document.createElement("canvas");
  cv.width = n;
  cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const img = ctx.createImageData(n, n);
  const data = img.data;
  const span = ssmHi - ssmLo || 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const raw = ssm[i * n + j];
      const stretched = (raw - ssmLo) / span;
      ssmColor(stretched, data, (i * n + j) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  result: AnalysisResult,
  heatmap: HTMLCanvasElement,
  playTime: number,
): void {
  const { size, matrixX, matrixY, novY, novH, tlY, tlH, width, totalH } = layout;
  const { n, novelty, boundaries, frameTimes, segments, duration } = result;

  // background
  ctx.fillStyle = "#0a0a0b";
  ctx.fillRect(0, 0, width, totalH);

  // ── self-similarity heat-map ──
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(heatmap, matrixX, matrixY, size, size);

  // subtle frame
  ctx.strokeStyle = "rgba(139,92,246,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(matrixX + 0.5, matrixY + 0.5, size, size);

  // boundary crosshairs on both axes
  ctx.strokeStyle = "rgba(221,214,254,0.32)";
  ctx.lineWidth = 1;
  for (const b of boundaries) {
    const p = (b / n) * size;
    ctx.beginPath();
    ctx.moveTo(matrixX + p, matrixY);
    ctx.lineTo(matrixX + p, matrixY + size);
    ctx.moveTo(matrixX, matrixY + p);
    ctx.lineTo(matrixX + size, matrixY + p);
    ctx.stroke();
  }

  // playhead dot on the main diagonal
  const frac = duration > 0 ? Math.max(0, Math.min(1, playTime / duration)) : 0;
  const dpx = matrixX + frac * size;
  const dpy = matrixY + frac * size;
  ctx.beginPath();
  ctx.arc(dpx, dpy, 5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(237,233,254,0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(139,92,246,0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── novelty curve ──
  ctx.fillStyle = "rgba(20,20,22,0.6)";
  ctx.fillRect(matrixX, novY, size, novH);
  ctx.strokeStyle = "rgba(139,92,246,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = matrixX + (i / (n - 1 || 1)) * size;
    const y = novY + novH - novelty[i] * (novH - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // mark boundary peaks
  for (const b of boundaries) {
    const x = matrixX + (b / (n - 1 || 1)) * size;
    const y = novY + novH - novelty[b] * (novH - 6) - 3;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(196,181,253,0.95)";
    ctx.fill();
  }
  // novelty label
  ctx.fillStyle = "rgba(138,138,147,0.9)";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText("NOVELTY", matrixX + 4, novY + 12);

  // ── timeline of section blocks ──
  const tlX = matrixX;
  const tlW = size;
  ctx.fillStyle = "rgba(20,20,22,0.6)";
  ctx.fillRect(tlX, tlY, tlW, tlH);
  const blockH = tlH - 22;
  for (const seg of segments) {
    const x0 = tlX + (seg.startT / duration) * tlW;
    const x1 = tlX + (seg.endT / duration) * tlW;
    ctx.fillStyle = SEG_COLORS[seg.label % SEG_COLORS.length];
    ctx.fillRect(x0, tlY, Math.max(1, x1 - x0), blockH);
    // section letter label (A, B, C…) reused for repeats
    ctx.fillStyle = "rgba(237,233,254,0.9)";
    ctx.font = "600 11px ui-sans-serif, system-ui";
    const letter = String.fromCharCode(65 + (seg.label % 26));
    if (x1 - x0 > 12) ctx.fillText(letter, x0 + 4, tlY + 14);
  }
  // boundary ticks + time labels
  ctx.strokeStyle = "rgba(221,214,254,0.5)";
  ctx.fillStyle = "rgba(138,138,147,0.95)";
  ctx.font = "10px ui-monospace, monospace";
  for (const b of boundaries) {
    const t = frameTimes[b] ?? 0;
    const x = tlX + (t / duration) * tlW;
    ctx.beginPath();
    ctx.moveTo(x, tlY);
    ctx.lineTo(x, tlY + blockH);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillText(fmtTime(t), Math.min(x + 2, tlX + tlW - 24), tlY + tlH - 5);
  }
  // start + end labels
  ctx.fillText("0:00", tlX + 2, tlY + tlH - 5);
  const endLbl = fmtTime(duration);
  ctx.fillText(endLbl, tlX + tlW - ctx.measureText(endLbl).width - 2, tlY + 14);

  // playhead cursor on the timeline
  const px = tlX + frac * tlW;
  ctx.strokeStyle = "rgba(237,233,254,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, tlY - 2);
  ctx.lineTo(px, tlY + tlH);
  ctx.stroke();
}

/** Map a click to a seek time (seconds), or null if outside interactive regions. */
export function hitTest(
  layout: Layout,
  x: number,
  y: number,
  result: AnalysisResult,
): number | null {
  const { matrixX, matrixY, size, tlY, tlH } = layout;
  const { duration } = result;
  // timeline strip
  if (y >= tlY && y <= tlY + tlH && x >= matrixX && x <= matrixX + size) {
    return Math.max(0, Math.min(duration, ((x - matrixX) / size) * duration));
  }
  // matrix: project click onto the main diagonal (use the x fraction)
  if (
    x >= matrixX &&
    x <= matrixX + size &&
    y >= matrixY &&
    y <= matrixY + size
  ) {
    return Math.max(0, Math.min(duration, ((x - matrixX) / size) * duration));
  }
  return null;
}
