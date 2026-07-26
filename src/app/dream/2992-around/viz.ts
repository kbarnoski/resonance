/**
 * viz.ts — the luminous orrery. A top-down radar (azimuth + distance around
 * the head) plus a horizon band (elevation vs. facing-relative azimuth).
 * Raw hex lives here only: this is the art layer.
 */

import {
  placementToRadar,
  type Geom,
  type Pose,
  D_MAX,
  ELEV_MAX,
} from "./spatial";

// On-palette violet ramp (hue ~245→300). Art-layer hex is sanctioned here.
const RAMP: [number, number, number][] = [
  [0.14, 0.1, 0.32],
  [0.39, 0.4, 0.95],
  [0.55, 0.36, 0.97],
  [0.69, 0.26, 0.88],
  [0.85, 0.78, 1.0],
];

function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(RAMP.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function rgba(c: [number, number, number], alpha: number): string {
  return `rgba(${(c[0] * 255) | 0}, ${(c[1] * 255) | 0}, ${(c[2] * 255) | 0}, ${alpha})`;
}

export type DrawArgs = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  g: Geom;
  poses: Pose[];
  yaw: number;
  loudestId: number | null;
  t: number;
  audioLive: boolean;
  reduce: boolean;
};

export function drawScene(args: DrawArgs): void {
  const { ctx, w, h, g, poses, yaw, loudestId, t, audioLive, reduce } = args;

  // Background wash.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0a0713");
  bg.addColorStop(1, "#05040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  drawRadar(ctx, g, poses, yaw, loudestId, t, audioLive, reduce);
  drawHorizon(ctx, g, poses, yaw, loudestId);
}

function drawRadar(
  ctx: CanvasRenderingContext2D,
  g: Geom,
  poses: Pose[],
  yaw: number,
  loudestId: number | null,
  t: number,
  audioLive: boolean,
  reduce: boolean,
): void {
  const { cx, cy, R } = g;

  // Concentric distance rings.
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const rr = (R * i) / 4;
    ctx.strokeStyle = `rgba(150, 130, 220, ${0.06 + 0.04 * (4 - i)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Radial spokes every 45°.
  ctx.strokeStyle = "rgba(140, 120, 210, 0.07)";
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(ang) * R, cy - Math.cos(ang) * R);
    ctx.stroke();
  }

  // Each voice's orbit path — a faint ring at its radial distance.
  for (const p of poses) {
    const col = ramp(p.hue);
    const rr = (p.distance / D_MAX) * R;
    ctx.strokeStyle = rgba(col, 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Glowing head at centre.
  ctx.globalCompositeOperation = "lighter";
  const headGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
  headGrad.addColorStop(0, "rgba(200, 180, 255, 0.5)");
  headGrad.addColorStop(1, "rgba(120, 90, 240, 0)");
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = "rgba(220, 210, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Facing indicator: a slim cone pointing where the listener looks.
  const fx = -Math.sin(yaw);
  const fy = -Math.cos(yaw);
  ctx.strokeStyle = "rgba(200, 190, 255, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + fx * (R + 14), cy + fy * (R + 14));
  ctx.stroke();
  ctx.fillStyle = "rgba(200, 190, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(cx + fx * (R + 14), cy + fy * (R + 14), 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Orbs.
  ctx.globalCompositeOperation = "lighter";
  for (const p of poses) {
    const pt = placementToRadar(p.az, p.distance, g);
    const col = ramp(p.hue);
    const near = 1 / (1 + p.distance);
    const baseR = 4 + near * 12;
    const isLoud = p.id === loudestId;

    // Elevation stalk — a short vertical line lifts the orb off the plane.
    const lift = (p.elev / ELEV_MAX) * 22;
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x, pt.y - lift);
    ctx.stroke();
    const oy = pt.y - lift;

    // Slow luminance drift (safe: well under 3 Hz).
    const pulse = reduce ? 0.85 : 0.7 + 0.3 * Math.sin(t * 0.7 + p.id);
    const glow = ctx.createRadialGradient(pt.x, oy, 0, pt.x, oy, baseR * 3);
    glow.addColorStop(0, rgba(col, 0.6 * pulse));
    glow.addColorStop(0.4, rgba(col, 0.28 * pulse));
    glow.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pt.x, oy, baseR * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba([Math.min(1, col[0] + 0.3), Math.min(1, col[1] + 0.3), 1], 0.95);
    ctx.beginPath();
    ctx.arc(pt.x, oy, baseR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    if (isLoud) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(230, 220, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pt.x, oy, baseR + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
    }
  }
  ctx.globalCompositeOperation = "source-over";

  if (!audioLive) {
    ctx.fillStyle = "rgba(200, 190, 255, 0.5)";
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("silent preview — press Start to hear the choir", cx, cy + R + 34);
    ctx.textAlign = "left";
  }
}

/** Horizon band: a front-facing side view of elevation. */
function drawHorizon(
  ctx: CanvasRenderingContext2D,
  g: Geom,
  poses: Pose[],
  yaw: number,
  loudestId: number | null,
): void {
  const { hx0, hx1, hy0, hy1 } = g;
  const mid = (hy0 + hy1) / 2;
  const wBand = hx1 - hx0;

  // Frame + ear-level line.
  ctx.strokeStyle = "rgba(150, 130, 220, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(hx0, hy0, wBand, hy1 - hy0);
  ctx.strokeStyle = "rgba(150, 130, 220, 0.18)";
  ctx.beginPath();
  ctx.moveTo(hx0, mid);
  ctx.lineTo(hx1, mid);
  ctx.stroke();

  ctx.globalCompositeOperation = "lighter";
  for (const p of poses) {
    // Azimuth relative to facing → horizontal position across the band.
    let rel = p.az - yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel)); // wrap to -π..π
    const x = hx0 + ((rel + Math.PI) / (2 * Math.PI)) * wBand;
    const y = mid - (p.elev / ELEV_MAX) * ((hy1 - hy0) / 2 - 6);
    const col = ramp(p.hue);
    const near = 1 / (1 + p.distance);
    const rad = 2.5 + near * 6;
    const front = Math.cos(rel); // brighter when in front of the listener
    const a = 0.3 + 0.6 * Math.max(0, front);

    const glow = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.6);
    glow.addColorStop(0, rgba(col, a));
    glow.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, rad * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba([Math.min(1, col[0] + 0.3), Math.min(1, col[1] + 0.3), 1], a);
    ctx.beginPath();
    ctx.arc(x, y, rad * 0.6, 0, Math.PI * 2);
    ctx.fill();

    if (p.id === loudestId) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(230, 220, 255, 0.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, rad + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // Tiny labels for the band.
  ctx.fillStyle = "rgba(160, 150, 200, 0.45)";
  ctx.font = "500 10px system-ui, sans-serif";
  ctx.fillText("behind ← facing → behind", hx0 + 4, hy0 - 6);
}
