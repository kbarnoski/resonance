// fallback2d.ts — a reduced, Canvas2D version of the woven field for devices
// with no WebGPU. Same idea, far fewer particles: each is owned by one present
// listener and drawn toward that locus; as coherence rises the targets slide to
// the shared centroid and a gentle rotation binds the clouds into one figure.
// Additive compositing (globalCompositeOperation "lighter") gives the neutral
// graphite→silver→bone glow with violet only at the brightest peaks. No grain.

import type { CommonsRenderParams } from "./gpu";

const COUNT = 900;

// Neutral ramp sampled to CSS rgb — matches the WebGPU tonemap stops.
function rampColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [5, 6, 7]],
    [0.2, [31, 33, 41]],
    [0.42, [87, 89, 99]],
    [0.62, [158, 161, 171]],
    [0.82, [219, 222, 230]],
    [1.0, [143, 92, 245]], // violet peak
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export interface CommonsFallback {
  readonly kind: "canvas2d";
  render(p: CommonsRenderParams): void;
  resize(): void;
  dispose(): void;
}

export function initCommonsFallback(canvas: HTMLCanvasElement): CommonsFallback | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 1;
  let h = 1;
  const sizeCanvas = () => {
    w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    h = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  };
  sizeCanvas();

  // particle state in uv space (0..1, y up)
  const px = new Float32Array(COUNT);
  const py = new Float32Array(COUNT);
  const vx = new Float32Array(COUNT);
  const vy = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2;
    px[i] = 0.5 + 0.24 * Math.cos(a) + (Math.random() - 0.5) * 0.06;
    py[i] = 0.5 + 0.2 * Math.sin(a) + (Math.random() - 0.5) * 0.06;
  }

  let disposed = false;

  return {
    kind: "canvas2d",

    render(p: CommonsRenderParams) {
      if (disposed) return;
      const dt = Math.min(0.05, p.dt);
      const ac = Math.max(1, Math.floor(p.activeCount));
      const [cx, cy] = p.centroid;
      const k = Math.max(0, Math.min(1, p.coherence * 0.92));

      // fade previous frame (trail persistence)
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(5, 6, 8, 0.16)";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < COUNT; i++) {
        const owner = i % ac;
        const lx = p.presences[owner * 4 + 0];
        const ly = p.presences[owner * 4 + 1];
        const bright = p.presences[owner * 4 + 3];
        const tx = lx + (cx - lx) * k;
        const ty = ly + (cy - ly) * k;

        vx[i] += (tx - px[i]) * 0.05 * dt * 60;
        vy[i] += (ty - py[i]) * 0.05 * dt * 60;
        // rotation around centroid gated by coherence
        const rx = px[i] - cx;
        const ry = py[i] - cy;
        vx[i] += -ry * 0.5 * p.coherence * dt * 60;
        vy[i] += rx * 0.5 * p.coherence * dt * 60;
        // gentle turbulence (frozen under reduced motion)
        if (p.motion > 0.5) {
          vx[i] += (Math.random() - 0.5) * (0.004 + p.energy * 0.01);
          vy[i] += (Math.random() - 0.5) * (0.004 + p.energy * 0.01);
        }
        vx[i] *= 0.9;
        vy[i] *= 0.9;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;

        const sx = px[i] * w;
        const sy = (1 - py[i]) * h; // y up → screen y down
        // density-driven luminance; violet only where bright & coherent
        const lum = 0.35 + p.mid * 0.5 + k * 0.25;
        const tone = Math.min(1, lum * (0.55 + 0.45 * bright));
        const violet = Math.min(1, p.treble * (0.3 + p.coherence)) * (tone > 0.7 ? 1 : 0);
        const [r, g, b] = rampColor(Math.min(1, tone + violet * 0.3));
        const rad = (2.2 + p.mid * 2.0) * dpr;
        const alpha = 0.05 + p.mid * 0.06 + k * 0.03;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    },

    resize() {
      if (!disposed) sizeCanvas();
    },

    dispose() {
      disposed = true;
    },
  };
}
