/**
 * render.ts — Canvas2D rendering of the silk membrane as glowing filaments.
 *
 * Draws the grid links as additive luminous threads whose colour shifts with
 * the local region's tension (cool violet at rest -> warm gold when pulled).
 * Used by both the WebGPU and CPU paths — the GPU path only swaps out the
 * solver, the look stays identical so the piece plays the same everywhere.
 */

import type { Membrane } from "./membrane";
import { VOICE_COUNT } from "./audio";

// Cool->warm palette keyed by tension. Returns "r,g,b".
function tintFor(tension: number): string {
  const t = Math.max(0, Math.min(1, tension));
  // violet (140,120,255) -> warm gold (255,200,130)
  const r = Math.round(140 + (255 - 140) * t);
  const g = Math.round(120 + (200 - 120) * t);
  const b = Math.round(255 + (130 - 255) * t);
  return `${r},${g},${b}`;
}

export function drawMembrane(
  ctx: CanvasRenderingContext2D,
  m: Membrane,
  cssW: number,
  cssH: number,
  tensions: number[],
  timeMs: number,
): void {
  const { cols, rows, pos, width, height } = m;

  // Fade the previous frame for soft motion trails.
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(8,7,16,0.34)";
  ctx.fillRect(0, 0, cssW, cssH);

  // Map membrane world space -> canvas, centred with a little breathing scale.
  const breathe = 1 + Math.sin(timeMs * 0.0006) * 0.012;
  const scale = (Math.min(cssW / width, cssH / height) * 0.96) * breathe;
  const offX = (cssW - width * scale) / 2;
  const offY = (cssH - height * scale) / 2;
  const X = (i: number) => offX + pos[i * 2] * scale;
  const Y = (i: number) => offY + pos[i * 2 + 1] * scale;

  const colPerRegion = cols / VOICE_COUNT;
  const tensionAtCol = (c: number) => {
    const region = Math.min(VOICE_COUNT - 1, Math.floor(c / colPerRegion));
    return tensions[region] ?? 0;
  };

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  // Horizontal filaments (the silk's warp threads) — these are the long glowing
  // lines that read as a sheet.
  for (let r = 0; r < rows; r++) {
    ctx.beginPath();
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c === 0) ctx.moveTo(X(i), Y(i));
      else ctx.lineTo(X(i), Y(i));
    }
    const t = tensionAtCol(cols * 0.5);
    const tint = tintFor(t);
    const rowFade = 0.18 + 0.5 * (r / rows);
    ctx.strokeStyle = `rgba(${tint},${0.16 + t * 0.4})`;
    ctx.lineWidth = (0.8 + t * 1.6) * (0.6 + rowFade);
    ctx.shadowBlur = 8 + t * 16;
    ctx.shadowColor = `rgba(${tint},0.5)`;
    ctx.stroke();
  }

  // Vertical threads, fainter — give it weave.
  for (let c = 0; c < cols; c++) {
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      const i = r * cols + c;
      if (r === 0) ctx.moveTo(X(i), Y(i));
      else ctx.lineTo(X(i), Y(i));
    }
    const t = tensionAtCol(c);
    const tint = tintFor(t);
    ctx.strokeStyle = `rgba(${tint},${0.06 + t * 0.22})`;
    ctx.lineWidth = 0.6 + t * 0.9;
    ctx.shadowBlur = 4 + t * 10;
    ctx.shadowColor = `rgba(${tint},0.4)`;
    ctx.stroke();
  }

  // Bright nodes where the silk is pulled taut — little stars under the hand.
  ctx.shadowBlur = 0;
  for (let c = 0; c < cols; c++) {
    const t = tensionAtCol(c);
    if (t < 0.12) continue;
    for (let r = 0; r < rows; r += 2) {
      const i = r * cols + c;
      const tint = tintFor(t);
      ctx.beginPath();
      ctx.arc(X(i), Y(i), 0.8 + t * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tint},${t * 0.5})`;
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}
