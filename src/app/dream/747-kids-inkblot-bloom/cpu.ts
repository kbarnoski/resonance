// cpu.ts — Canvas2D fallback. Same Gray-Scott reaction-diffusion model as the
// WebGPU path, run on a small typed-array grid (96x96) on the CPU at low fps,
// drawn with the SAME kaleidoscope/mirror symmetry so the piece still blooms
// and sings on devices without WebGPU. This is the FALLBACK, not the headline.

import type { InkSeed } from "./gpu";

export const CPU_GRID = 96;

export interface CpuRenderer {
  readonly kind: "canvas2d";
  seed(seeds: InkSeed[]): void;
  /** Step the reaction + draw. `folds` = kaleidoscope segments. Returns nothing. */
  frame(folds: number, lift: number, t: number): void;
  destroy(): void;
}

// Same regime as the GPU shader.
const FEED = 0.0367;
const KILL = 0.0649;
const DU = 0.16;
const DV = 0.08;
const SUBSTEPS = 6;

export function buildCpuRenderer(canvas: HTMLCanvasElement): CpuRenderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  const g = CPU_GRID;
  const n = g * g;
  let u = new Float32Array(n).fill(1);
  let v = new Float32Array(n);
  let u2 = new Float32Array(n);
  let v2 = new Float32Array(n);

  // Faint central seed so frame one already blooms.
  const cc = (g / 2) | 0;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < 4) v[(cc + dy) * g + (cc + dx)] = 0.6 * (1 - d / 4);
    }
  }

  // Offscreen field image we sample when drawing the kaleidoscope.
  const fieldImg = ctx.createImageData(g, g);

  let pending: InkSeed[] = [];
  let destroyed = false;

  const wrap = (x: number) => (x + g) % g;

  function applySeeds() {
    for (const s of pending) {
      const sx = s.x * g;
      const sy = s.y * g;
      const r = Math.max(1, s.r * (g / 256)); // scale GPU-cell radius to CPU grid
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          const d = Math.hypot(dx, dy);
          if (d < r) {
            const xx = wrap(Math.round(sx + dx));
            const yy = wrap(Math.round(sy + dy));
            const i = yy * g + xx;
            const fall = 1 - d / r;
            v[i] = Math.min(1, v[i] + s.amount * fall * fall);
            u[i] = Math.max(0, u[i] - s.amount * 0.4 * fall);
          }
        }
      }
    }
    pending = [];
  }

  function step() {
    for (let y = 0; y < g; y++) {
      const ym = wrap(y - 1) * g;
      const yp = wrap(y + 1) * g;
      const yc = y * g;
      for (let x = 0; x < g; x++) {
        const xm = wrap(x - 1);
        const xp = wrap(x + 1);
        const c = yc + x;
        const uu = u[c];
        const vv = v[c];
        // 9-point Laplacian matching the WGSL kernel.
        const lapU =
          0.2 * (u[yc + xm] + u[yc + xp] + u[ym + x] + u[yp + x]) +
          0.05 * (u[ym + xm] + u[ym + xp] + u[yp + xm] + u[yp + xp]) -
          uu;
        const lapV =
          0.2 * (v[yc + xm] + v[yc + xp] + v[ym + x] + v[yp + x]) +
          0.05 * (v[ym + xm] + v[ym + xp] + v[yp + xm] + v[yp + xp]) -
          vv;
        const uvv = uu * vv * vv;
        let nu = uu + (DU * lapU - uvv + FEED * (1 - uu));
        let nv = vv + (DV * lapV + uvv - (KILL + FEED) * vv);
        nu = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        nv = nv < 0 ? 0 : nv > 1 ? 1 : nv;
        u2[c] = nu;
        v2[c] = nv;
      }
    }
    let t = u;
    u = u2;
    u2 = t;
    t = v;
    v = v2;
    v2 = t;
  }

  function paintFieldImage(lift: number) {
    const data = fieldImg.data;
    // Ink-on-light palette matching the GPU shader.
    const paper = [245, 242, 235];
    const ink = [
      Math.round(26 + 10 * lift),
      Math.round(31 + 20 * lift),
      Math.round(71 - 20 * lift),
    ];
    for (let i = 0; i < n; i++) {
      const vv = v[i];
      const dens = smoothstep(0.06, 0.34, vv);
      const edge = Math.exp(-Math.pow((vv - 0.22) * 9, 2)) * (0.5 + 0.5 * lift);
      const o = i * 4;
      data[o] = Math.min(255, paper[0] + (ink[0] - paper[0]) * dens + 140 * edge);
      data[o + 1] =
        Math.min(255, paper[1] + (ink[1] - paper[1]) * dens + 180 * edge);
      data[o + 2] =
        Math.min(255, paper[2] + (ink[2] - paper[2]) * dens + 215 * edge);
      data[o + 3] = 255;
    }
  }

  // Small offscreen canvas holding the painted field, used as a kaleidoscope src.
  const off = document.createElement("canvas");
  off.width = g;
  off.height = g;
  const offCtx = off.getContext("2d");

  return {
    kind: "canvas2d",

    seed(seeds: InkSeed[]) {
      for (const s of seeds) pending.push(s);
      if (pending.length > 24) pending = pending.slice(-24);
    },

    frame(folds: number, lift: number, t: number) {
      if (destroyed || !offCtx) return;
      applySeeds();
      for (let s = 0; s < SUBSTEPS; s++) step();

      paintFieldImage(lift);
      offCtx.putImageData(fieldImg, 0, 0);

      const W = canvas.width;
      const H = canvas.height;
      ctx.fillStyle = "#0a0a10";
      ctx.fillRect(0, 0, W, H);

      // Kaleidoscope by drawing the field into mirrored wedges around centre.
      const segs = Math.max(1, Math.round(folds));
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.hypot(W, H);
      const seg = (Math.PI * 2) / segs;
      ctx.save();
      ctx.translate(cx, cy);
      const zoom = 0.92 + 0.05 * Math.sin(t * 0.25);
      for (let s = 0; s < segs; s++) {
        for (let m = 0; m < 2; m++) {
          ctx.save();
          ctx.rotate(seg * s);
          if (m === 1) ctx.scale(1, -1); // mirror within wedge -> butterfly
          // Clip to the wedge so reflections tile cleanly.
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, R, 0, seg / 2);
          ctx.closePath();
          ctx.clip();
          // Draw field centred; centre of field maps to canvas centre.
          const drawSize = (R * 2) / zoom;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
          ctx.restore();
        }
      }
      ctx.restore();

      // Soft vignette to match the calm GPU framing.
      const grd = ctx.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, R * 0.55);
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(5,5,10,0.45)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
    },

    destroy() {
      destroyed = true;
    },
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
