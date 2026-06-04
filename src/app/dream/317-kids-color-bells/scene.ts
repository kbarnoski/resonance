// scene.ts — Canvas2D drawing for 317-kids-color-bells
// Draws: live video feed, reticle overlay, color splash, bead strand

import { HUE_COLORS } from "./audio";

export interface BeadItem {
  colorIdx: number;
  id: number;
}

export interface SceneState {
  splashColor: string | null;
  splashAlpha: number;  // 0–1, fades out
  splashStartMs: number;
  activeBinIdx: number; // -1 = none
  playingBeadIdx: number; // index in bead array currently lit, -1 = none
  holdProgress: number; // 0–1 progress toward firing
}

const RETICLE_FRAC = 0.32; // reticle is 32% of smaller canvas dimension

function drawReticle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  activeBin: number,
  holdProgress: number,
  ts: number
): void {
  const color = activeBin >= 0 ? HUE_COLORS[activeBin] : "rgba(255,255,255,0.7)";
  const pulse = 0.7 + 0.3 * Math.sin(ts * 0.004);

  // Outer pulsing ring
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.strokeStyle =
    activeBin >= 0
      ? color
      : `rgba(255,255,255,${0.4 + 0.3 * pulse})`;
  ctx.lineWidth = activeBin >= 0 ? 4 : 2.5;
  ctx.stroke();

  // Corner brackets (magic-circle style)
  const br = r * 0.62; // bracket radius
  const bLen = r * 0.28;
  ctx.strokeStyle = color;
  ctx.lineWidth = activeBin >= 0 ? 3.5 : 2;
  for (let q = 0; q < 4; q++) {
    const angle = (q * Math.PI) / 2 + Math.PI / 4;
    const bx = cx + br * Math.cos(angle);
    const by = cy + br * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(bx + bLen * Math.cos(angle - Math.PI / 4), by + bLen * Math.sin(angle - Math.PI / 4));
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + bLen * Math.cos(angle + Math.PI / 4), by + bLen * Math.sin(angle + Math.PI / 4));
    ctx.stroke();
  }

  // Hold-progress arc (fills clockwise from top)
  if (holdProgress > 0 && holdProgress < 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.92, -Math.PI / 2, -Math.PI / 2 + holdProgress * 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, activeBin >= 0 ? 7 : 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSplash(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: SceneState,
  ts: number
): void {
  if (!state.splashColor || state.splashAlpha <= 0) return;
  const age = ts - state.splashStartMs;
  const alpha = Math.max(0, 1 - age / 900);
  if (alpha <= 0) return;
  // Full-screen color wash, then clear center
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = state.splashColor;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawBeads(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  beads: BeadItem[],
  playingIdx: number
): void {
  if (beads.length === 0) return;
  const beadR = Math.min(24, Math.max(12, (W * 0.7) / (Math.max(beads.length, 1) * 2.4)));
  const gap = beadR * 0.5;
  const totalW = beads.length * (beadR * 2 + gap) - gap;
  const startX = Math.max(beadR + 8, (W - totalW) / 2);
  const y = H - 52;

  beads.forEach((bead, i) => {
    const x = startX + i * (beadR * 2 + gap) + beadR;
    const isPlaying = i === playingIdx;
    const color = HUE_COLORS[bead.colorIdx] ?? "#ffffff";

    // Shadow / glow
    ctx.save();
    if (isPlaying) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
    }

    // Bead circle
    ctx.beginPath();
    ctx.arc(x, y, beadR, 0, Math.PI * 2);
    ctx.fillStyle = isPlaying ? color : color + "bb";
    ctx.fill();

    // White shine
    ctx.beginPath();
    ctx.arc(x - beadR * 0.28, y - beadR * 0.28, beadR * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();

    // Playing pulse ring
    if (isPlaying) {
      ctx.beginPath();
      ctx.arc(x, y, beadR + 5, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  });
}

export function drawScene(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement | null,
  offscreen: HTMLCanvasElement,
  beads: BeadItem[],
  state: SceneState,
  ts: number,
  cameraLive: boolean
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  // ── Background ──────────────────────────────────────────────────────────────
  if (cameraLive && video && video.readyState >= 2) {
    // Draw video to offscreen (mirrored for selfie-cam feel)
    const oc = offscreen;
    oc.width = W;
    oc.height = H;
    const oct = oc.getContext("2d");
    if (oct) {
      oct.save();
      // Mirror horizontally for front camera
      oct.translate(W, 0);
      oct.scale(-1, 1);
      oct.drawImage(video, 0, 0, W, H);
      oct.restore();
    }
    ctx.drawImage(oc, 0, 0);
  } else {
    // Dark gradient background in no-camera mode
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, "#1e1b4b");
    grad.addColorStop(1, "#0a0a14");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Color splash ─────────────────────────────────────────────────────────────
  drawSplash(ctx, W, H, state, ts);

  // ── Reticle ──────────────────────────────────────────────────────────────────
  const minDim = Math.min(W, H);
  const reticleR = (minDim * RETICLE_FRAC) / 2;
  const cx = W / 2;
  const cy = H / 2 - 20;
  drawReticle(ctx, cx, cy, reticleR, state.activeBinIdx, state.holdProgress, ts);

  // ── Reticle label ─────────────────────────────────────────────────────────────
  if (cameraLive) {
    ctx.save();
    ctx.font = "bold 15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("point here →", cx, cy - reticleR - 16);
    ctx.restore();
  }

  // ── Bead strand ──────────────────────────────────────────────────────────────
  drawBeads(ctx, W, H, beads, state.playingBeadIdx);
}

export { RETICLE_FRAC };
