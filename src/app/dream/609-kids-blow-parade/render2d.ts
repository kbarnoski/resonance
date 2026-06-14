// ─────────────────────────────────────────────────────────────────────────────
// render2d.ts — Canvas2D renderer (full-featured fallback).
//
// Draws the same parade as the WebGPU path: each balloon a radial-gradient
// blob with a glossy highlight, a knot, googly eyes (that look toward motion),
// a smile, and squash/stretch. Used when WebGPU is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import type { Balloon, ParadeState } from "./scene";

export function drawScene(
  ctx: CanvasRenderingContext2D,
  st: ParadeState,
  w: number,
  h: number,
  activeStrength: number
) {
  // Background: soft dark playful gradient (NOT warm/cozy — cool & punchy).
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0c1024");
  bg.addColorStop(1, "#12183a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const minDim = Math.min(w, h);

  // Draw flying balloons first (behind), then idle, then the active one on top.
  const order = [...st.balloons].sort((a, b) => phaseRank(a) - phaseRank(b));
  for (const b of order) {
    const isActive = b.id === st.activeId;
    drawBalloon(ctx, b, w, h, minDim, isActive ? activeStrength : 0);
  }
}

function phaseRank(b: Balloon): number {
  if (b.phase === "flying") return 0;
  if (b.phase === "idle") return 1;
  return 2; // inflating active on top
}

function drawBalloon(
  ctx: CanvasRenderingContext2D,
  b: Balloon,
  w: number,
  h: number,
  minDim: number,
  strength: number
) {
  const cx = b.x * w;
  const cy = b.y * h;
  const r = b.radius * minDim;
  // squash from physics + a tiny strength pulse for the active balloon.
  const sx = b.squash * (1 + strength * 0.04);
  const sy = (1 / b.squash) * (1 - strength * 0.02);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(b.spin);
  ctx.scale(sx, sy);

  // Soft glow halo.
  ctx.save();
  ctx.globalAlpha = 0.25;
  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.5);
  glow.addColorStop(0, hsl(b.hue, 90, 60, 0.5));
  glow.addColorStop(1, hsl(b.hue, 90, 60, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Balloon body — slightly teardrop (taller, pointed bottom knot).
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 1.06, 0, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(
    -r * 0.3,
    -r * 0.35,
    r * 0.1,
    0,
    0,
    r * 1.1
  );
  body.addColorStop(0, hsl(b.hue, 95, 72));
  body.addColorStop(0.55, hsl(b.hue, 88, 55));
  body.addColorStop(1, hsl(b.hue, 80, 38));
  ctx.fillStyle = body;
  ctx.fill();

  // Knot at the bottom.
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, r * 1.02);
  ctx.lineTo(r * 0.12, r * 1.02);
  ctx.lineTo(0, r * 1.22);
  ctx.closePath();
  ctx.fillStyle = hsl(b.hue, 80, 42);
  ctx.fill();

  // Glossy highlight.
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.38, r * 0.26, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  // ── Googly face ──────────────────────────────────────────────────────────
  const eyeR = r * 0.26;
  const eyeY = -r * 0.05;
  const eyeDx = r * 0.32;
  // Pupils look toward velocity (or down a touch when idle).
  const lookX = clamp(b.vx * 6, -1, 1) * eyeR * 0.35;
  const lookY = clamp(b.vy * 6, -1, 1) * eyeR * 0.35;
  drawEye(ctx, -eyeDx, eyeY, eyeR, lookX, lookY, b.eyeBlink);
  drawEye(ctx, eyeDx, eyeY, eyeR, lookX, lookY, b.eyeBlink);

  // Mouth: open "O" when inflating, big smile otherwise. Bigger strength = wider O.
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = "rgba(20,10,30,0.7)";
  ctx.fillStyle = "rgba(30,12,40,0.85)";
  if (b.phase === "inflating" || strength > 0.05) {
    const mr = r * (0.12 + strength * 0.16);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.42, mr * 0.8, mr, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, r * 0.28, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  // Rosy cheeks.
  ctx.fillStyle = "rgba(255,120,150,0.35)";
  ctx.beginPath();
  ctx.arc(-r * 0.5, r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.arc(r * 0.5, r * 0.18, r * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  lookX: number,
  lookY: number,
  blink: number
) {
  // Blink: squash the whole eye vertically toward a closed line.
  const open = 1 - Math.min(0.92, blink);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, open);

  // White.
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = "rgba(20,10,30,0.55)";
  ctx.stroke();

  // Pupil (googly — sits low-ish, follows look).
  const pr = r * 0.48;
  ctx.beginPath();
  ctx.arc(lookX, lookY + r * 0.1, pr, 0, Math.PI * 2);
  ctx.fillStyle = "#161020";
  ctx.fill();
  // Catchlight.
  ctx.beginPath();
  ctx.arc(lookX - pr * 0.3, lookY - pr * 0.2, pr * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();

  ctx.restore();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function hsl(h: number, s: number, l: number, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}
