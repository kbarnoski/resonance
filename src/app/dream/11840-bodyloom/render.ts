// ─────────────────────────────────────────────────────────────────────────────
// 11840-bodyloom · render.ts — the warm room, drawn in Canvas2D.
//
//   A warm-slate room with a receding floor. The present self is drawn bright and
//   near; every committed loop is a translucent ghost skeleton standing where it
//   was recorded, dimmer and further back the deeper it sits. Warm hues (bone,
//   clay, terracotta, sage) live ONLY here in the art layer. Smooth motion only —
//   no flashing.
// ─────────────────────────────────────────────────────────────────────────────

import { BONES, N_JOINTS, type Frame } from "./body";
import { lerp } from "./prng";

// Ghost tints — warm human palette, cycled per committed loop.
export const GHOST_TINTS = [
  "#c67b52", // terracotta
  "#8f9e7d", // sage
  "#cb9463", // clay
  "#b0674c", // rust
  "#cbbda3", // bone-muted
  "#7f8b68", // deep sage
  "#bd8a63", // tan clay
  "#a98a6a", // dust
];
const LIVE_COLOR = "#f1e7d7"; // bright bone

export interface ScreenPt {
  x: number;
  y: number;
  ok: boolean;
}

/** Project a body Frame into the room given its floor slot. */
export function projectFrame(
  f: Frame,
  roomX: number,
  roomZ: number,
  w: number,
  h: number,
): { pts: ScreenPt[]; baseX: number; feetY: number; scale: number } {
  const depthScale = lerp(1.0, 0.46, roomZ);
  const feetY = lerp(h * 0.94, h * 0.52, roomZ);
  const baseX = w * 0.5 + roomX * (w * 0.33) * lerp(1, 0.75, roomZ);
  const bodyH = h * 0.62 * depthScale;
  const bodyW = bodyH * 0.62;

  const pts: ScreenPt[] = new Array(N_JOINTS);
  for (let k = 0; k < N_JOINTS; k++) {
    const jx = f[2 * k];
    const jy = f[2 * k + 1];
    if (Number.isNaN(jx) || Number.isNaN(jy)) {
      pts[k] = { x: 0, y: 0, ok: false };
    } else {
      pts[k] = {
        x: baseX + (jx - 0.5) * bodyW,
        y: feetY - (1 - jy) * bodyH,
        ok: true,
      };
    }
  }
  return { pts, baseX, feetY, scale: depthScale };
}

/** Paint the warm room and its receding floor. `glow` (0..1) softly lifts the
 *  ground with the overall sound level — smooth, never a strobe. */
export function drawRoom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  glow: number,
): void {
  const horizon = h * 0.3;

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1d1815");
  bg.addColorStop(0.42, "#181310");
  bg.addColorStop(1, "#0e0a08");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A soft warm pool on the floor that breathes with the sound.
  const pool = ctx.createRadialGradient(
    w * 0.5,
    h * 0.86,
    0,
    w * 0.5,
    h * 0.86,
    h * 0.7,
  );
  const a = 0.05 + glow * 0.09;
  pool.addColorStop(0, `rgba(198,123,82,${a.toFixed(3)})`);
  pool.addColorStop(1, "rgba(198,123,82,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, horizon, w, h - horizon);

  // Receding floor grid, converging to a centre vanishing point.
  ctx.save();
  ctx.lineWidth = 1;
  const vx = w * 0.5;
  // Depth lines (horizontal, spaced closer toward the horizon).
  for (let i = 1; i <= 7; i++) {
    const z = i / 7;
    const y = lerp(h * 0.98, horizon, Math.pow(z, 1.6));
    ctx.strokeStyle = `rgba(120,92,68,${(0.16 * (1 - z * 0.7)).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // Converging verticals.
  for (let i = -6; i <= 6; i++) {
    const spread = i / 6;
    const xBottom = vx + spread * w * 0.85;
    ctx.strokeStyle = `rgba(120,92,68,${(0.1).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(xBottom, h);
    ctx.lineTo(vx + spread * w * 0.08, horizon);
    ctx.stroke();
  }
  ctx.restore();
}

export interface BodyStyle {
  color: string;
  alpha: number;
  lineWidth: number;
  glow: number; // 0..1 — motion energy, adds a soft halo
  live: boolean;
}

/** Stroke one body skeleton at its projected screen points. */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  proj: { pts: ScreenPt[]; baseX: number; feetY: number; scale: number },
  style: BodyStyle,
): void {
  const { pts, baseX, feetY, scale } = proj;

  // Contact shadow so the body stands on the floor.
  ctx.save();
  ctx.globalAlpha = style.alpha * 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(baseX, feetY + 4 * scale, 46 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (style.glow > 0.02) {
    ctx.shadowColor = style.color;
    ctx.shadowBlur = (style.live ? 18 : 10) * style.glow * scale;
  }
  for (const [a, b] of BONES) {
    const pa = pts[a];
    const pb = pts[b];
    if (!pa.ok || !pb.ok) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  // Joint dots.
  ctx.shadowBlur = 0;
  ctx.fillStyle = style.color;
  const r = (style.live ? 3.4 : 2.4) * scale;
  for (const p of pts) {
    if (!p.ok) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export const LIVE_TINT = LIVE_COLOR;
