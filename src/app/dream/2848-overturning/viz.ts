// ─────────────────────────────────────────────────────────────────────────────
// 2848-overturning — Canvas2D rendering (legible with sound MUTED).
//
// Two coupled panels:
//   1. The STABILITY LANDSCAPE (Scheffer "ball in a well"): the effective
//      potential U(q;F); a ball sits in the "on" (overturning) well. As F
//      drifts the well flattens (visible loss of resilience); the ball rattles
//      wider as variance rises; at the fold the well vanishes and the ball
//      rolls to the collapsed basin.
//   2. The TIME-SERIES of q with a widening variance envelope, the shutdown
//      instant marked, plus a hysteresis-loop inset (F on x, q on y) showing
//      the outward collapse vs the non-retracing return.
//
// Palette: dark, violet ramp for the art, cold deep-ocean tint inside the art
// layer only. No luminance oscillation above 3 Hz.
// ─────────────────────────────────────────────────────────────────────────────

import { potentialCurve, type Snapshot } from "./engine";

export interface HistPoint {
  t: number; // arc progress 0..1
  F: number;
  q: number;
  band: number; // sqrt(variance) envelope half-width
}

const VIOLET = "#a78bfa";
const VIOLET_DIM = "#7c6bd0";
const OCEAN = "#3ba7c9"; // cold deep-ocean tint (art layer only)
const OFF_HUE = "#e08a5a"; // salinity / collapsed
const INK = "#0b0a12";
const GRID = "rgba(167,139,250,0.14)";
const MUTE = "rgba(210,205,230,0.55)";

const Q_MIN = -1.2;
const Q_MAX = 1.9;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = MUTE;
  ctx.fillText(text, x, y);
}

// ── the ball-in-a-well stability landscape ─────────────────────────────────────
function drawLandscape(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  s: Snapshot,
  reduced: boolean,
  clock: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();

  const pad = 26;
  const gx0 = x0 + pad;
  const gx1 = x0 + w - pad;
  const gy0 = y0 + 34;
  const gy1 = y0 + h - 30;

  const curve = potentialCurve(s.F, Q_MIN, Q_MAX, 220);
  let uMin = Infinity;
  let uMax = -Infinity;
  for (const p of curve) {
    if (p.u < uMin) uMin = p.u;
    if (p.u > uMax) uMax = p.u;
  }
  const uSpan = Math.max(0.4, uMax - uMin);
  const qx = (q: number) =>
    gx0 + ((q - Q_MIN) / (Q_MAX - Q_MIN)) * (gx1 - gx0);
  // invert so wells sit low on screen
  const uy = (u: number) =>
    gy0 + ((u - uMin) / uSpan) * (gy1 - gy0) * 0.82 + 8;

  // basin shading
  const grd = ctx.createLinearGradient(0, gy0, 0, gy1);
  grd.addColorStop(0, "rgba(59,167,201,0.05)");
  grd.addColorStop(1, "rgba(11,10,18,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);

  // potential curve
  ctx.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const px = qx(curve[i].q);
    const py = uy(curve[i].u);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = s.on ? VIOLET : OFF_HUE;
  ctx.shadowColor = s.on ? "rgba(167,139,250,0.5)" : "rgba(224,138,90,0.5)";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // fill under curve
  ctx.lineTo(qx(Q_MAX), gy1);
  ctx.lineTo(qx(Q_MIN), gy1);
  ctx.closePath();
  ctx.fillStyle = "rgba(124,107,208,0.06)";
  ctx.fill();

  // the ball — position = real q; find U at q by interpolation
  const qBall = clamp(s.q, Q_MIN + 0.02, Q_MAX - 0.02);
  let uBall = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].q >= qBall) {
      const t =
        (qBall - curve[i - 1].q) / (curve[i].q - curve[i - 1].q || 1e-6);
      uBall = curve[i - 1].u + t * (curve[i].u - curve[i - 1].u);
      break;
    }
  }
  // rattle width from real sqrt(variance); slow wobble (≤3 Hz)
  const rattle = clamp(Math.sqrt(s.variance) * 90, 0, 26);
  const wob = reduced ? 0 : Math.sin(clock * 2 * Math.PI * 1.4) * rattle;
  const bx = qx(qBall) + wob;
  const by = uy(uBall) - 9;

  // glow halo grows as resilience drops
  const halo = 10 + (1 - s.resilience) * 22;
  const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, halo);
  g2.addColorStop(0, s.on ? "rgba(167,139,250,0.5)" : "rgba(224,138,90,0.5)");
  g2.addColorStop(1, "rgba(167,139,250,0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(bx, by, halo, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(bx, by, 8, 0, Math.PI * 2);
  ctx.fillStyle = s.on ? "#e9e2ff" : "#ffd9c2";
  ctx.fill();
  ctx.strokeStyle = s.on ? VIOLET : OFF_HUE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // basin labels
  label(ctx, "OFF · salinity", gx0 + 2, gy1 + 20);
  ctx.textAlign = "right";
  label(ctx, "overturning · ON", gx1 - 2, gy1 + 20);
  ctx.textAlign = "left";

  ctx.font =
    "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = OCEAN;
  ctx.fillText("STABILITY LANDSCAPE", gx0, gy0 - 14);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTE;
  ctx.fillText(`F = ${s.F.toFixed(3)}`, gx1, gy0 - 14);
  ctx.textAlign = "left";

  ctx.restore();
}

// ── the q time-series + variance envelope + hysteresis inset ───────────────────
function drawSeries(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  w: number,
  h: number,
  s: Snapshot,
  hist: HistPoint[],
  shutdownT: number | null,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, w, h);
  ctx.clip();

  const pad = 26;
  const gx0 = x0 + pad;
  const gx1 = x0 + w - pad - 118; // leave room for hysteresis inset
  const gy0 = y0 + 34;
  const gy1 = y0 + h - 30;

  const tx = (t: number) => gx0 + t * (gx1 - gx0);
  const qy = (q: number) =>
    gy1 - ((clamp(q, Q_MIN, Q_MAX) - Q_MIN) / (Q_MAX - Q_MIN)) * (gy1 - gy0);

  // grid + zero/saddle line
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = gy0 + (i / 4) * (gy1 - gy0);
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.lineTo(gx1, gy);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(224,138,90,0.35)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(gx0, qy(0.25));
  ctx.lineTo(gx1, qy(0.25));
  ctx.stroke();
  ctx.setLineDash([]);

  // variance envelope band
  if (hist.length > 1) {
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const p = hist[i];
      ctx.lineTo(tx(p.t), qy(p.q + p.band));
    }
    for (let i = hist.length - 1; i >= 0; i--) {
      const p = hist[i];
      ctx.lineTo(tx(p.t), qy(p.q - p.band));
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(167,139,250,0.16)";
    ctx.fill();

    // q line
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const p = hist[i];
      const px = tx(p.t);
      const py = qy(p.q);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = VIOLET;
    ctx.stroke();
  }

  // shutdown marker
  if (shutdownT !== null) {
    const mx = tx(shutdownT);
    ctx.strokeStyle = OFF_HUE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(mx, gy0);
    ctx.lineTo(mx, gy1);
    ctx.stroke();
    ctx.fillStyle = OFF_HUE;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("shutdown", mx + 4, gy0 + 12);
  }

  // playhead
  const hx = tx(s.progress);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, gy0);
  ctx.lineTo(hx, gy1);
  ctx.stroke();

  ctx.font =
    "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = OCEAN;
  ctx.fillText("OVERTURNING q(t)", gx0, gy0 - 14);

  // ── hysteresis inset (F on x, q on y) ──
  const ix0 = gx1 + 26;
  const ix1 = x0 + w - 12;
  const iy0 = gy0 + 6;
  const iy1 = gy1;
  const Fx = (F: number) => ix0 + ((F - 0.5) / (1.85 - 0.5)) * (ix1 - ix0);
  const hqy = (q: number) =>
    iy1 - ((clamp(q, -0.6, 1.4) + 0.6) / 2.0) * (iy1 - iy0);
  ctx.strokeStyle = GRID;
  ctx.strokeRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  ctx.fillStyle = MUTE;
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("hysteresis", ix0, iy0 - 4);
  ctx.fillText("F→", ix1 - 18, iy1 + 12);
  if (hist.length > 1) {
    ctx.lineWidth = 1.3;
    for (let i = 1; i < hist.length; i++) {
      const a = hist[i - 1];
      const b = hist[i];
      ctx.beginPath();
      ctx.moveTo(Fx(a.F), hqy(a.q));
      ctx.lineTo(Fx(b.F), hqy(b.q));
      // outward (rising F) violet, return (falling F) ocean
      ctx.strokeStyle = b.F >= a.F ? VIOLET_DIM : OCEAN;
      ctx.stroke();
    }
    // current point
    ctx.beginPath();
    ctx.arc(Fx(s.F), hqy(s.q), 3, 0, Math.PI * 2);
    ctx.fillStyle = s.on ? "#e9e2ff" : "#ffd9c2";
    ctx.fill();
  }

  ctx.restore();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: Snapshot,
  hist: HistPoint[],
  shutdownT: number | null,
  reduced: boolean,
  clock: number,
): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);

  // vignette
  const vg = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.2,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.7,
  );
  vg.addColorStop(0, "rgba(30,26,52,0.35)");
  vg.addColorStop(1, "rgba(6,6,12,0.6)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const split = h > w ? "v" : "h";
  if (split === "h") {
    drawLandscape(ctx, 0, 0, w * 0.5, h, s, reduced, clock);
    drawSeries(ctx, w * 0.5, 0, w * 0.5, h, s, hist, shutdownT);
  } else {
    drawLandscape(ctx, 0, 0, w, h * 0.5, s, reduced, clock);
    drawSeries(ctx, 0, h * 0.5, w, h * 0.5, s, hist, shutdownT);
  }

  // divider
  ctx.strokeStyle = "rgba(167,139,250,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (split === "h") {
    ctx.moveTo(w * 0.5, 20);
    ctx.lineTo(w * 0.5, h - 20);
  } else {
    ctx.moveTo(20, h * 0.5);
    ctx.lineTo(w - 20, h * 0.5);
  }
  ctx.stroke();
}
