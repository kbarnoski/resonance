// render2d.ts — Canvas2D fallback for when WebGPU is unavailable. Draws the
// same rotating globe + quake pulses (a real fallback, not a blank). Ominous
// oxblood / magma / ash palette on black.

import type { GpuFrameParams } from "./gpu";

export type Renderer2D = {
  render: (params: GpuFrameParams) => void;
  resize: (w: number, h: number) => void;
  dispose: () => void;
};

// project geographic (lon,lat) — with current rotation — to canvas pixels.
// returns [x, y, frontFacing] or null when behind the globe.
function projectPoint(
  lonDeg: number,
  latDeg: number,
  rot: number,
  cx: number,
  cy: number,
  radius: number
): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180 + rot;
  const lat = (latDeg * Math.PI) / 180;
  const x = Math.cos(lat) * Math.sin(lon);
  const z0 = Math.cos(lat) * Math.cos(lon);
  const y0 = Math.sin(lat);
  const tilt = 0.35;
  const yy = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
  const zz = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
  const front = zz >= 0 ? 1 : 0;
  return [cx + x * radius, cy - yy * radius, front];
}

export function initRenderer2D(canvas: HTMLCanvasElement): Renderer2D | null {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return null;
  const g: CanvasRenderingContext2D = ctx2d;
  let disposed = false;

  function render(params: GpuFrameParams) {
    if (disposed) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.4;

    // tremor shake
    const sh = params.shake * radius * 0.04;
    const ox = Math.sin(params.timeSec * 53) * sh;
    const oy = Math.cos(params.timeSec * 47) * sh;
    g.save();
    g.translate(ox, oy);

    // background
    g.fillStyle = "#050203";
    g.fillRect(-ox - 4, -oy - 4, w + 8, h + 8);

    // globe body with limb darkening
    const grad = g.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, "#1a0a08");
    grad.addColorStop(0.7, "#0c0405");
    grad.addColorStop(1, "#050203");
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();

    // tectonic graticule (ash grey ridges)
    g.lineWidth = 1;
    g.strokeStyle = "rgba(150,145,150,0.18)";
    for (let latDeg = -60; latDeg <= 60; latDeg += 30) {
      g.beginPath();
      let started = false;
      for (let lonDeg = -180; lonDeg <= 180; lonDeg += 6) {
        const [px, py, front] = projectPoint(lonDeg, latDeg, params.rotation, cx, cy, radius);
        if (front) {
          if (!started) {
            g.moveTo(px, py);
            started = true;
          } else g.lineTo(px, py);
        } else started = false;
      }
      g.stroke();
    }
    for (let lonDeg = -180; lonDeg < 180; lonDeg += 30) {
      g.beginPath();
      let started = false;
      for (let latDeg = -85; latDeg <= 85; latDeg += 5) {
        const [px, py, front] = projectPoint(lonDeg, latDeg, params.rotation, cx, cy, radius);
        if (front) {
          if (!started) {
            g.moveTo(px, py);
            started = true;
          } else g.lineTo(px, py);
        } else started = false;
      }
      g.stroke();
    }

    // quake pulses
    g.globalCompositeOperation = "lighter";
    for (const q of params.pulses) {
      const age = (params.nowMs - q.startMs) / 1000;
      const lifeMax = 1.2 + q.mag * 0.5;
      if (age > lifeMax) continue;
      const [px, py, front] = projectPoint(q.lon, q.lat, params.rotation, cx, cy, radius);
      if (!front) continue;
      const life = 1 - age / lifeMax;
      // hue: shallow magma orange → deep oxblood
      const r = Math.round(255 - q.depthN * 130);
      const gg = Math.round(115 - q.depthN * 100);
      const b = Math.round(20 + q.depthN * 60);

      // expanding ripple ring
      const ringR = age * radius * 0.5 * (0.6 + q.mag * 0.15);
      g.beginPath();
      g.arc(px, py, ringR, 0, Math.PI * 2);
      g.strokeStyle = `rgba(${r},${gg},${b},${life * 0.5})`;
      g.lineWidth = 1 + q.mag * 0.6;
      g.stroke();

      // central bloom
      const bloomR = (4 + q.mag * 5) * (0.4 + life);
      const bg = g.createRadialGradient(px, py, 0, px, py, bloomR);
      bg.addColorStop(0, `rgba(${r},${gg},${b},${Math.min(1, life * (0.4 + q.mag * 0.18))})`);
      bg.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.beginPath();
      g.arc(px, py, bloomR, 0, Math.PI * 2);
      g.fillStyle = bg;
      g.fill();
    }
    g.globalCompositeOperation = "source-over";

    // atmosphere rim
    g.beginPath();
    g.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    g.strokeStyle = `rgba(140,25,20,${0.35 + params.level * 0.4})`;
    g.lineWidth = 3 + params.level * 4;
    g.stroke();

    g.restore();
  }

  function resize(w: number, h: number) {
    canvas.width = w;
    canvas.height = h;
  }

  function dispose() {
    disposed = true;
  }

  return { render, resize, dispose };
}
