// ════════════════════════════════════════════════════════════════════════════
// Mirror Hall — Canvas2D radar (3328)
//
// A calm, top-down architect's plan: the room polygon with draggable corner
// handles, the source S and listener L, the valid image sources drawn as ghost
// dots OUTSIDE the walls, the reflection ray paths, and energy pips that travel
// each ray timed to that tap's delay when a phrase plays. Not a fragment
// shader — thin hairlines, violet accents, near-black ground.
// ════════════════════════════════════════════════════════════════════════════

import type { Tap, Vec } from "./acoustics";

const VIOLET = "#a78bfa";
const VIOLET_DIM = "rgba(167, 139, 250, 0.35)";
const VIOLET_FAINT = "rgba(167, 139, 250, 0.14)";
const INK = "#e5e5ef";

export interface Transform {
  scale: number; // px per metre
  cx: number; // screen centre x (px)
  cy: number; // screen centre y (px)
}

export function worldToScreen(p: Vec, tf: Transform): Vec {
  return { x: tf.cx + p.x * tf.scale, y: tf.cy - p.y * tf.scale };
}

export function screenToWorld(sx: number, sy: number, tf: Transform): Vec {
  return { x: (sx - tf.cx) / tf.scale, y: (tf.cy - sy) / tf.scale };
}

export interface Pip {
  tapIndex: number;
  start: number; // performance.now() ms when it launched
  durationMs: number; // travel time along the ray (visually scaled)
  order: number;
}

export interface DrawState {
  poly: Vec[];
  source: Vec;
  listener: Vec;
  taps: Tap[];
  pips: Pip[];
  now: number; // performance.now() ms
  hover: string | null; // id of hovered/dragged handle
}

function dot(ctx: CanvasRenderingContext2D, p: Vec, r: number, fill: string) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  tf: Transform,
  st: DrawState,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0a0f";
  ctx.fillRect(0, 0, w, h);

  // Faint metre grid.
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  const step = tf.scale;
  for (let x = tf.cx % step; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = tf.cy % step; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Ghost image sources + reflection ray paths (1st & 2nd order).
  for (const tap of st.taps) {
    if (tap.order === 0) continue;
    if (tap.order > 2) continue; // keep the plan legible
    const pts = tap.points.map((p) => worldToScreen(p, tf));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = tap.order === 1 ? VIOLET_DIM : VIOLET_FAINT;
    ctx.lineWidth = 1;
    ctx.setLineDash(tap.order === 1 ? [] : [3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // The image source itself, a ghost dot outside the walls.
    const img = worldToScreen(tap.image, tf);
    dot(ctx, img, tap.order === 1 ? 2.5 : 1.8, VIOLET_FAINT);
  }

  // Room polygon.
  const screenPoly = st.poly.map((p) => worldToScreen(p, tf));
  ctx.beginPath();
  ctx.moveTo(screenPoly[0].x, screenPoly[0].y);
  for (let i = 1; i < screenPoly.length; i++) {
    ctx.lineTo(screenPoly[i].x, screenPoly[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(167,139,250,0.04)";
  ctx.fill();

  // Corner handles.
  screenPoly.forEach((p, i) => {
    const active = st.hover === `corner-${i}`;
    ctx.beginPath();
    ctx.rect(p.x - 5, p.y - 5, 10, 10);
    ctx.fillStyle = active ? VIOLET : "#0a0a0f";
    ctx.fill();
    ctx.strokeStyle = VIOLET;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // Energy pips travelling along rays.
  for (const pip of st.pips) {
    const tap = st.taps[pip.tapIndex];
    if (!tap) continue;
    const prog = (st.now - pip.start) / pip.durationMs;
    if (prog < 0 || prog > 1) continue;
    const pos = pointAlongPath(tap.points, prog);
    const s = worldToScreen(pos, tf);
    const alpha = 1 - Math.abs(prog - 0.5) * 0.6;
    dot(ctx, s, 3.2, `rgba(196,181,253,${alpha})`);
    // soft halo
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(167,139,250,${alpha * 0.4})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Source & listener.
  const sS = worldToScreen(st.source, tf);
  const sL = worldToScreen(st.listener, tf);
  dot(ctx, sS, st.hover === "source" ? 8 : 6, VIOLET);
  dot(ctx, sL, st.hover === "listener" ? 8 : 6, "#0a0a0f");
  ctx.beginPath();
  ctx.arc(sL.x, sL.y, st.hover === "listener" ? 8 : 6, 0, Math.PI * 2);
  ctx.strokeStyle = VIOLET;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = INK;
  ctx.fillText("S", sS.x + 9, sS.y + 4);
  ctx.fillText("L", sL.x + 9, sL.y + 4);
}

function pointAlongPath(points: Vec[], prog: number): Vec {
  // Total length then find the segment holding `prog`.
  let total = 0;
  const segLen: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLen.push(d);
    total += d;
  }
  let target = prog * total;
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i] || i === segLen.length - 1) {
      const f = segLen[i] > 0 ? target / segLen[i] : 0;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * f,
        y: points[i].y + (points[i + 1].y - points[i].y) * f,
      };
    }
    target -= segLen[i];
  }
  return points[points.length - 1];
}
