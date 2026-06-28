// ════════════════════════════════════════════════════════════════════════════
// render.ts — Canvas2D additive-glow renderer (1027 Kids Chaos Aurora)
//
// Two glowing rods + bobs, a long fading aurora trail of the lower bob in a
// teal→violet→gold gradient driven by speed, soft bloom on each note. Uses
// 'lighter' compositing for an additive aurora look. NOT a fragment shader.
// ════════════════════════════════════════════════════════════════════════════

import { PendulumParams, PendulumState } from "./physics";

export interface TrailPoint {
  x: number;
  y: number;
  speed: number; // for color
  life: number; // 1 → 0 fade
}

export interface Bloom {
  x: number;
  y: number;
  r: number;
  life: number;
}

// Map a normalized speed (0..1) to an aurora color: teal → violet → gold.
export function speedColor(s: number, alpha: number): string {
  const t = Math.max(0, Math.min(1, s));
  // Three control colors.
  const teal = [64, 224, 208];
  const violet = [170, 110, 240];
  const gold = [255, 205, 110];
  let c: number[];
  if (t < 0.5) {
    const k = t / 0.5;
    c = teal.map((v, i) => v + (violet[i] - v) * k);
  } else {
    const k = (t - 0.5) / 0.5;
    c = violet.map((v, i) => v + (gold[i] - v) * k);
  }
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

export interface RenderInputs {
  state: PendulumState;
  params: PendulumParams;
  trail: TrailPoint[];
  blooms: Bloom[];
  speedNorm: number; // current lower-bob speed normalized
  width: number;
  height: number;
}

export function drawScene(ctx: CanvasRenderingContext2D, inp: RenderInputs) {
  const { state, params, trail, blooms, speedNorm, width, height } = inp;

  // Soft persistent dark-aurora background fade (creates motion trails on rods).
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(6, 10, 22, 0.30)";
  ctx.fillRect(0, 0, width, height);

  // Geometry: pivot near top-center, scale rods to fit.
  const pivotX = width / 2;
  const pivotY = height * 0.32;
  const scale = Math.min(width, height) * 0.22;

  const x1 = pivotX + Math.sin(state.t1) * params.l1 * scale;
  const y1 = pivotY + Math.cos(state.t1) * params.l1 * scale;
  const x2 = x1 + Math.sin(state.t2) * params.l2 * scale;
  const y2 = y1 + Math.cos(state.t2) * params.l2 * scale;

  // ── Aurora trail (additive) ────────────────────────────────────────────────
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const ax = pivotX + a.x * scale;
    const ay = pivotY + a.y * scale;
    const bx = pivotX + b.x * scale;
    const by = pivotY + b.y * scale;
    const alpha = b.life * 0.5;
    ctx.strokeStyle = speedColor(b.speed, alpha);
    ctx.lineWidth = 2 + b.life * 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // ── Note blooms (soft additive glow) ────────────────────────────────────────
  for (const bl of blooms) {
    const grad = ctx.createRadialGradient(bl.x, bl.y, 0, bl.x, bl.y, bl.r);
    grad.addColorStop(0, `rgba(255,240,200,${0.35 * bl.life})`);
    grad.addColorStop(0.4, `rgba(170,150,255,${0.18 * bl.life})`);
    grad.addColorStop(1, "rgba(60,120,160,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Rods (glowing) ──────────────────────────────────────────────────────────
  const rodColor = speedColor(speedNorm, 0.85);
  ctx.strokeStyle = rodColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // ── Bobs (glowing orbs) ─────────────────────────────────────────────────────
  drawOrb(ctx, x1, y1, 10, speedColor(speedNorm * 0.6, 0.9));
  drawOrb(ctx, x2, y2, 14, speedColor(speedNorm, 1.0));

  // Pivot dot.
  drawOrb(ctx, pivotX, pivotY, 5, "rgba(200,220,255,0.7)");

  // Restore default for any caller drawing afterward.
  ctx.globalCompositeOperation = "source-over";

  return { x2, y2 }; // lower-bob screen position (for bloom placement)
}

function drawOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  grad.addColorStop(0, color);
  grad.addColorStop(0.3, color.replace(/[\d.]+\)$/, "0.35)"));
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
}

// Compute the lower bob's screen position without drawing (for note bloom spawn).
export function lowerBobScreen(
  state: PendulumState,
  params: PendulumParams,
  width: number,
  height: number,
): { x: number; y: number } {
  const pivotX = width / 2;
  const pivotY = height * 0.32;
  const scale = Math.min(width, height) * 0.22;
  const x1 = pivotX + Math.sin(state.t1) * params.l1 * scale;
  const y1 = pivotY + Math.cos(state.t1) * params.l1 * scale;
  const x2 = x1 + Math.sin(state.t2) * params.l2 * scale;
  const y2 = y1 + Math.cos(state.t2) * params.l2 * scale;
  return { x: x2, y: y2 };
}
