// 1294-indra-descent — render.ts
//
// Sumi-e ink-wash on graphite. Circles are NOT filled discs and NOT a density
// field — they are fine luminous ink STROKES (thin pale rings), drawn with
// `lighter` compositing so overlapping strokes pool brighter at the tangent
// cusps, the way wet ink beads. The ONE accent colour is vermilion: when a
// circle is struck, a resonance wave races OUTWARD along the tangent edges of
// the graph, lighting each edge and ring as it passes and decaying per hop.
// Every luminance change is a smooth eased travelling highlight — never a flash.

import type { Arrival, GasketState } from "./gasket";

export interface Camera {
  scale: number; // world → px
  cx: number;
  cy: number;
}

/** A live resonance wave: the tangency-graph arrivals plus the wall-clock ms the
 *  strike happened. Each arrival lights at startMs + delayMs. */
export interface Ripple {
  arrivals: Arrival[];
  startMs: number;
}

const INK = "#060608";
const GROW_MS = 700;
const SIGMA = 210; // ms width of a ring's light-up as the wave passes
const VERM = { r: 224, g: 64, b: 47 }; // #e0402f

/** How long a whole ripple stays relevant (last arrival + tail). */
export function rippleLifetime(rip: Ripple): number {
  let maxDelay = 0;
  for (const a of rip.arrivals) if (a.delayMs > maxDelay) maxDelay = a.delayMs;
  return maxDelay + 1100;
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GasketState,
  cam: Camera,
  size: { w: number; h: number; dpr: number },
  reduced: boolean,
  nowMs: number,
  ripples: Ripple[],
  target: { x: number; y: number } | null,
): void {
  const { w, h, dpr } = size;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Graphite ground + a faint charcoal well toward centre (a wash, not a field).
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const well = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.72);
  well.addColorStop(0, "rgba(150,160,175,0.05)");
  well.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = well;
  ctx.fillRect(0, 0, w, h);

  const drift = reduced ? 1 : 0.9 + 0.1 * Math.sin(nowMs * 0.0004);
  const cxs = w / 2;
  const cys = h / 2;
  const margin = 48;

  const growMs = reduced ? 260 : GROW_MS;

  // ── Ink strokes: thin pale rings ──────────────────────────────────────────
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  for (const c of state.circles) {
    const rs = c.r * cam.scale;
    if (rs < 0.4) continue;
    const sx = cxs + (c.x - cam.cx) * cam.scale;
    const sy = cys + (c.y - cam.cy) * cam.scale;
    if (sx + rs < -margin || sx - rs > w + margin || sy + rs < -margin || sy - rs > h + margin)
      continue;

    let grow = 1;
    if (c.birth > 0) {
      const age = (nowMs - c.birth) / growMs;
      if (age < 1) grow = 1 - Math.pow(1 - Math.max(0, age), 3);
    }
    const rDraw = rs * grow;
    if (rDraw < 0.4) continue;

    const isOuter = c.b < 0;
    // Perceptual size 0..1 (big ring → 1): bigger rings read brighter + thicker.
    const sz = Math.max(0.12, Math.min(1, 1 - Math.log2(Math.max(2, Math.abs(c.b)) / 2) / 8));
    const freshFlare = c.birth > 0 && grow < 1 ? 0.35 * (1 - grow) : 0;
    const alpha = Math.min(0.72, (isOuter ? 0.16 : 0.1 + 0.34 * sz) + freshFlare) * drift;
    const lw = Math.max(0.5, Math.min(1.7, isOuter ? 1.2 : 0.6 + 1.1 * sz));
    // Faintly cool graphite ink (near-white with a breath of blue).
    const lightness = 196 + Math.round(46 * sz);

    ctx.beginPath();
    ctx.arc(sx, sy, rDraw, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${lightness},${lightness + 6},${lightness + 14},${alpha.toFixed(3)})`;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // ── Vermilion resonance: light rings + tangent edges as the wave passes ────
  for (const rip of ripples) {
    for (const arr of rip.arrivals) {
      const tArr = rip.startMs + arr.delayMs;
      const dt = nowMs - tArr;
      if (dt < -60 || dt > 900) continue;
      const c = state.byId.get(arr.id);
      if (!c) continue;
      const sx = cxs + (c.x - cam.cx) * cam.scale;
      const sy = cys + (c.y - cam.cy) * cam.scale;
      const rs = c.r * cam.scale;
      if (rs < 0.4) continue;
      if (sx + rs < -margin || sx - rs > w + margin || sy + rs < -margin || sy - rs > h + margin)
        continue;

      // Smooth gaussian light-up (no strobe): brightness peaks as the wave hits.
      const env = Math.exp(-(dt * dt) / (2 * SIGMA * SIGMA));
      const bright = arr.amp * env;
      if (bright < 0.015) continue;

      // Edge from the neighbour we came from — the tangent line that lights.
      const from = arr.fromId >= 0 ? state.byId.get(arr.fromId) : undefined;
      if (from) {
        const fx = cxs + (from.x - cam.cx) * cam.scale;
        const fy = cys + (from.y - cam.cy) * cam.scale;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = `rgba(${VERM.r},${VERM.g},${VERM.b},${(0.5 * bright).toFixed(3)})`;
        ctx.lineWidth = 0.8 + 1.6 * bright;
        ctx.stroke();
      }

      // Ring flush: a soft wide glow under a crisp vermilion stroke.
      ctx.beginPath();
      ctx.arc(sx, sy, rs, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${VERM.r},${VERM.g},${VERM.b},${(0.18 * bright).toFixed(3)})`;
      ctx.lineWidth = Math.max(2, rs * 0.5);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, rs, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,${170 + Math.round(50 * bright)},150,${(0.85 * bright).toFixed(3)})`;
      ctx.lineWidth = 0.8 + 1.8 * bright;
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // ── Dive target: a quiet pale cusp marker (reserve vermilion for resonance) ─
  if (target) {
    const tx = cxs + (target.x - cam.cx) * cam.scale;
    const ty = cys + (target.y - cam.cy) * cam.scale;
    if (tx > -20 && tx < w + 20 && ty > -20 && ty < h + 20) {
      const pulse = reduced ? 0.5 : 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(nowMs * 0.004));
      ctx.globalCompositeOperation = "lighter";
      ctx.beginPath();
      ctx.arc(tx, ty, 7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(210,220,235,${(0.4 * pulse).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(tx - 11, ty);
      ctx.lineTo(tx + 11, ty);
      ctx.moveTo(tx, ty - 11);
      ctx.lineTo(tx, ty + 11);
      ctx.strokeStyle = `rgba(210,220,235,${(0.28 * pulse).toFixed(3)})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  }
}
