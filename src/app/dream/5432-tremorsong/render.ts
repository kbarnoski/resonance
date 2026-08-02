// ─────────────────────────────────────────────────────────────────────────────
// Tremorsong (5432) — Canvas2D render layer
//
// An equirectangular world map: a faint violet lon/lat graticule with labeled
// hemispheres (no coastline data needed). Each quake plots as a dot at its
// lon/lat, shaded by depth (shallow → VIOLET.300, deep → INDIGO). When a note
// fires, a glowing violet ring blooms (radius ∝ magnitude) and fades. A sweeping
// temporal cursor + a running UTC clock read out the compressed 24-hour window.
// ─────────────────────────────────────────────────────────────────────────────

import { VIOLET, ART_BLACK } from "@/app/dream/_shared/palette";
import { magNorm } from "./audio";
import type { Quake } from "./data";

export interface Ripple {
  lon: number;
  lat: number;
  mag: number;
  age: number; // seconds since fired
  life: number; // total lifetime, seconds
}

export interface MapMetrics {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** equirectangular projection of lon/lat into the map rect. */
export function project(lon: number, lat: number, m: MapMetrics): [number, number] {
  const x = m.x + ((lon + 180) / 360) * m.w;
  const y = m.y + ((90 - lat) / 180) * m.h;
  return [x, y];
}

/** depth (km) → violet→indigo shade. shallow bright, deep cool. */
function depthColor(depth: number, alpha: number): string {
  const d = Math.max(0, Math.min(1, depth / 650));
  // lerp VIOLET.300 (#c4b5fd) → INDIGO (#6366f1)
  const from = [0xc4, 0xb5, 0xfd];
  const to = [0x63, 0x66, 0xf1];
  const r = Math.round(from[0] + (to[0] - from[0]) * d);
  const g = Math.round(from[1] + (to[1] - from[1]) * d);
  const b = Math.round(from[2] + (to[2] - from[2]) * d);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = ART_BLACK;
  ctx.fillRect(0, 0, w, h);
}

/** the static map frame: backdrop wash, graticule, hemisphere + axis labels. */
export function drawMap(ctx: CanvasRenderingContext2D, m: MapMetrics): void {
  // subtle radial-ish backdrop wash on the ocean.
  ctx.fillStyle = VIOLET[950];
  ctx.fillRect(m.x, m.y, m.w, m.h);

  // graticule — faint violet grid every 30° lon, 30° lat.
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(139,92,246,0.10)";
  ctx.beginPath();
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = project(lon, 0, m);
    ctx.moveTo(x, m.y);
    ctx.lineTo(x, m.y + m.h);
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const [, y] = project(0, lat, m);
    ctx.moveTo(m.x, y);
    ctx.lineTo(m.x + m.w, y);
  }
  ctx.stroke();

  // emphasized equator + prime meridian.
  ctx.strokeStyle = "rgba(167,139,250,0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const [, eqY] = project(0, 0, m);
  ctx.moveTo(m.x, eqY);
  ctx.lineTo(m.x + m.w, eqY);
  const [pmX] = project(0, 0, m);
  ctx.moveTo(pmX, m.y);
  ctx.lineTo(pmX, m.y + m.h);
  ctx.stroke();

  // frame.
  ctx.strokeStyle = "rgba(196,181,253,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1);

  // hemisphere / axis labels.
  ctx.fillStyle = "rgba(138,138,147,0.6)";
  ctx.font = "600 10px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const labels: [number, number, string][] = [
    [-179, 84, "180°W"],
    [-92, 84, "90°W"],
    [3, 84, "0°"],
    [92, 84, "90°E"],
    [150, 84, "180°E"],
  ];
  for (const [lon, lat, txt] of labels) {
    const [x, y] = project(lon, lat, m);
    ctx.fillText(txt, x, y);
  }
  ctx.textAlign = "right";
  for (const [lat, txt] of [
    [60, "60°N"],
    [0, "EQ"],
    [-60, "60°S"],
  ] as const) {
    const [, y] = project(-180, lat, m);
    ctx.fillText(txt, m.x + m.w - 6, y);
  }
}

/**
 * base dots for every quake, brightening as the cursor passes their onset.
 * `progress` is 0..1 through the 24h window; a quake at fraction f is "seen"
 * once progress ≥ f.
 */
export function drawQuakeDots(
  ctx: CanvasRenderingContext2D,
  m: MapMetrics,
  quakes: Quake[],
  fracOf: (q: Quake) => number,
  progress: number,
): void {
  for (const q of quakes) {
    const [x, y] = project(q.lon, q.lat, m);
    const seen = progress >= fracOf(q);
    const rad = 1.5 + magNorm(q.mag) * 3;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = depthColor(q.depth, seen ? 0.85 : 0.28);
    ctx.fill();
    if (seen) {
      ctx.strokeStyle = depthColor(q.depth, 0.5);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
}

/** glowing bloom rings for freshly-fired quakes. mutates + culls `ripples`. */
export function drawRipples(
  ctx: CanvasRenderingContext2D,
  m: MapMetrics,
  ripples: Ripple[],
  dt: number,
): void {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.age += dt;
    const t = r.age / r.life;
    if (t >= 1) {
      ripples.splice(i, 1);
      continue;
    }
    const [x, y] = project(r.lon, r.lat, m);
    const maxR = 8 + magNorm(r.mag) * 60;
    const radius = maxR * t;
    const alpha = (1 - t) * 0.7;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(196,181,253,${alpha})`;
    ctx.lineWidth = 1 + magNorm(r.mag) * 2.5;
    ctx.stroke();
    // hot core flash early in life.
    if (t < 0.4) {
      const core = (1 - t / 0.4) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 2 + magNorm(r.mag) * 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(237,233,254,${core})`;
      ctx.fill();
    }
  }
}

/** vertical temporal cursor sweeping left→right across the map. */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  m: MapMetrics,
  progress: number,
): void {
  const x = m.x + progress * m.w;
  const grad = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
  grad.addColorStop(0, "rgba(139,92,246,0)");
  grad.addColorStop(0.5, "rgba(167,139,250,0.22)");
  grad.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x - 14, m.y, 28, m.h);
  ctx.strokeStyle = "rgba(221,214,254,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, m.y);
  ctx.lineTo(x, m.y + m.h);
  ctx.stroke();
}

/** legend: depth→pitch ramp + magnitude→size dots. */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 10px ui-monospace, monospace";

  // depth ramp.
  ctx.fillStyle = "rgba(138,138,147,0.85)";
  ctx.fillText("DEPTH → PITCH", x, y);
  const rampW = 116;
  const rampY = y + 14;
  for (let i = 0; i <= rampW; i++) {
    const d = (i / rampW) * 650;
    ctx.fillStyle = depthColor(d, 0.95);
    ctx.fillRect(x + i, rampY, 1, 8);
  }
  ctx.fillStyle = "rgba(138,138,147,0.7)";
  ctx.font = "600 9px ui-monospace, monospace";
  ctx.fillText("shallow · high", x, rampY + 18);
  ctx.textAlign = "right";
  ctx.fillText("deep · low", x + rampW, rampY + 18);

  // magnitude dots.
  ctx.textAlign = "left";
  ctx.font = "600 10px ui-monospace, monospace";
  ctx.fillStyle = "rgba(138,138,147,0.85)";
  const mx = x + 160;
  ctx.fillText("MAGNITUDE → SIZE", mx, y);
  const dotsY = y + 16;
  let cx = mx + 6;
  for (const mag of [2, 4, 6]) {
    const rad = 1.5 + magNorm(mag) * 3;
    ctx.beginPath();
    ctx.arc(cx, dotsY, rad, 0, Math.PI * 2);
    ctx.fillStyle = VIOLET[300];
    ctx.fill();
    ctx.fillStyle = "rgba(138,138,147,0.7)";
    ctx.font = "600 9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`M${mag}`, cx, dotsY + 14);
    cx += 34;
    ctx.font = "600 10px ui-monospace, monospace";
  }
}
