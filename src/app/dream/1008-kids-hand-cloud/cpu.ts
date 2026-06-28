// cpu.ts — CPU fallback particle integrator + Canvas2D additive render.
//
// Same forces as the GPU compute kernel (curl-noise advection + attraction
// toward the nearest hand point), but with fewer particles. This drives the
// SAME visual language as the WebGPU path so the piece looks alive everywhere.
//
// Curl-noise reference: Robert Bridson, "Curl-Noise for Procedural Fluid Flow"
// (SIGGRAPH 2007); see also Memo Akten's particle/flow field work.

import { Attractor, AURORA } from "./shared";

const PARTICLE_COUNT = 3200;

type CpuState = {
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  hue: Float32Array; // 0..1 index into aurora palette
};

export class CpuField {
  private s: CpuState;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
    const n = PARTICLE_COUNT;
    this.s = {
      px: new Float32Array(n),
      py: new Float32Array(n),
      vx: new Float32Array(n),
      vy: new Float32Array(n),
      hue: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      this.s.px[i] = (Math.random() * 2 - 1) * 0.95;
      this.s.py[i] = (Math.random() * 2 - 1) * 0.95;
      this.s.vx[i] = 0;
      this.s.vy[i] = 0;
      this.s.hue[i] = Math.random();
    }
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, Math.floor(rect.width * this.dpr));
    this.H = Math.max(1, Math.floor(rect.height * this.dpr));
    this.canvas.width = this.W;
    this.canvas.height = this.H;
  }

  step(dt: number, time: number, attractors: Attractor[]) {
    const s = this.s;
    const n = s.px.length;
    const clampedDt = Math.min(dt, 0.05);
    for (let i = 0; i < n; i++) {
      let x = s.px[i];
      let y = s.py[i];

      // curl-noise flow (cheap pseudo-curl from two offset gradients)
      const c = curl(x * 1.6, y * 1.6, time * 0.12);
      let ax = c[0] * 0.6;
      let ay = c[1] * 0.6;

      // attraction + swirl toward nearest hand point
      let bestD = 1e9;
      let bx = 0;
      let by = 0;
      let bStr = 0;
      let bSwirl = 0;
      for (let a = 0; a < attractors.length; a++) {
        const at = attractors[a];
        const dx = at.x - x;
        const dy = at.y - y;
        const d2 = dx * dx + dy * dy + 0.0001;
        if (d2 < bestD) {
          bestD = d2;
          bx = dx;
          by = dy;
          bStr = at.strength;
          bSwirl = at.swirl;
        }
      }
      if (bStr > 0) {
        const d = Math.sqrt(bestD);
        const inv = 1 / d;
        const nx = bx * inv;
        const ny = by * inv;
        // pull (falls off with distance), plus tangential swirl
        const pull = (bStr * 0.9) / (1 + d * 3.0);
        ax += nx * pull;
        ay += ny * pull;
        const swirl = (bSwirl * 0.8) / (1 + d * 2.5);
        ax += -ny * swirl;
        ay += nx * swirl;
        // tint particles near a hand toward warmer palette stops
        s.hue[i] += (0.62 - s.hue[i]) * Math.min(1, pull) * 0.04;
      }

      // integrate
      let vx = s.vx[i] + ax * clampedDt;
      let vy = s.vy[i] + ay * clampedDt;
      vx *= 0.94; // drag
      vy *= 0.94;
      x += vx * clampedDt;
      y += vy * clampedDt;

      // soft wrap inside the frame so the cloud never empties
      if (x > 1.05) x = -1.05;
      else if (x < -1.05) x = 1.05;
      if (y > 1.05) y = -1.05;
      else if (y < -1.05) y = 1.05;

      s.px[i] = x;
      s.py[i] = y;
      s.vx[i] = vx;
      s.vy[i] = vy;
    }
  }

  render() {
    const ctx = this.ctx;
    const s = this.s;
    const W = this.W;
    const H = this.H;

    // dark fade for trails (slight persistence -> glowing cloud)
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4,6,16,0.32)";
    ctx.fillRect(0, 0, W, H);

    // additive glowing particles
    ctx.globalCompositeOperation = "lighter";
    const n = s.px.length;
    const r = Math.max(1.1, 1.6 * this.dpr);
    for (let i = 0; i < n; i++) {
      const sx = (s.px[i] * 0.5 + 0.5) * W;
      const sy = (1 - (s.py[i] * 0.5 + 0.5)) * H;
      const speed = Math.min(1, Math.hypot(s.vx[i], s.vy[i]) * 2.2);
      const col = palette(s.hue[i]);
      const a = 0.18 + speed * 0.5;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r + speed * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

// pseudo curl noise from a smooth value-noise potential, sampled with offsets
function curl(x: number, y: number, t: number): [number, number] {
  const e = 0.12;
  const n1 = potential(x, y + e, t);
  const n2 = potential(x, y - e, t);
  const n3 = potential(x + e, y, t);
  const n4 = potential(x - e, y, t);
  const dx = (n1 - n2) / (2 * e);
  const dy = (n3 - n4) / (2 * e);
  // curl of scalar potential -> (d/dy, -d/dx)
  return [dx, -dy];
}

function potential(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 1.7 + t) * Math.cos(y * 1.3 - t * 0.7) +
    0.5 * Math.sin(x * 0.7 - y * 1.9 + t * 0.4)
  );
}

function palette(h: number): [number, number, number] {
  const stops = AURORA;
  const f = (h % 1) * (stops.length - 1);
  const i = Math.floor(f);
  const frac = f - i;
  const a = stops[i];
  const b = stops[Math.min(stops.length - 1, i + 1)];
  return [
    Math.round((a[0] + (b[0] - a[0]) * frac) * 255),
    Math.round((a[1] + (b[1] - a[1]) * frac) * 255),
    Math.round((a[2] + (b[2] - a[2]) * frac) * 255),
  ];
}
