// cpu.ts — Canvas2D fallback ripple tank for browsers without WebGPU.
//
// Same discretised wave equation as the GPU path, on a coarser grid, painted
// into an ImageData with the shared violet ramp and drawn (image-smoothed) to
// fill the display canvas. Slower and softer, but the piece still plays and
// paints exactly the same idea.

import { dreamPaletteRGB, type WaveField } from "./field";

// coarser than the GPU grid — comfortable for a per-cell JS loop at ~30fps
const CW = 192;
const CH = 96;

function need2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = c.getContext("2d");
  if (!x) throw new Error("no-2d");
  return x;
}

export function makeCpuField(canvas: HTMLCanvasElement): WaveField {
  const ctx = need2d(canvas);

  const n = CW * CH;
  const cur = new Float32Array(n);
  const prev = new Float32Array(n);
  const next = new Float32Array(n);

  // offscreen buffer at grid resolution, upscaled to the display canvas
  const off = document.createElement("canvas");
  off.width = CW;
  off.height = CH;
  const octx = need2d(off);
  const img = octx.createImageData(CW, CH);

  const c2 = 0.22;
  const damping = 0.9992;
  let destroyed = false;

  interface Imp {
    x: number;
    y: number;
    amp: number;
  }
  const pending: Imp[] = [];

  function inject(cellX: number, cellY: number, amp: number): void {
    // GPU grid cells arrive; rescale to the coarse grid
    const x = Math.floor((cellX / 512) * CW);
    const y = Math.floor((cellY / 256) * CH);
    pending.push({ x, y, amp });
  }

  function applyImpulses(): void {
    const radius = 1.4;
    for (const im of pending) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = ((im.x + dx) % CW + CW) % CW;
          const yy = im.y + dy;
          if (yy < 0 || yy >= CH) continue;
          const d2 = dx * dx + dy * dy;
          cur[yy * CW + xx] +=
            im.amp * Math.exp(-d2 / (2 * radius * radius));
        }
      }
    }
    pending.length = 0;
  }

  function step(): void {
    for (let y = 0; y < CH; y++) {
      const yu = y > 0 ? y - 1 : 0;
      const yd = y < CH - 1 ? y + 1 : CH - 1;
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        const xl = (x > 0 ? x - 1 : CW - 1) + y * CW;
        const xr = (x < CW - 1 ? x + 1 : 0) + y * CW;
        const lap = cur[xl] + cur[xr] + cur[yu * CW + x] + cur[yd * CW + x] - 4 * cur[i];
        let v = (2 * cur[i] - prev[i] + c2 * lap) * damping;
        if (v > 12) v = 12;
        else if (v < -12) v = -12;
        next[i] = v;
      }
    }
    // rotate buffers: prev <- cur, cur <- next
    prev.set(cur);
    cur.set(next);
  }

  function paint(): void {
    const data = img.data;
    const gain = 0.09;
    for (let i = 0; i < n; i++) {
      const t = 0.5 + cur[i] * gain;
      const [r, g, b] = dreamPaletteRGB(t);
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function frame(): void {
    if (destroyed) return;
    applyImpulses();
    step();
    paint();
  }

  function destroy(): void {
    destroyed = true;
  }

  return {
    backend: "CPU",
    gridW: 512, // report GPU-grid coordinates so callers map identically
    gridH: 256,
    inject,
    frame,
    resize: () => {},
    destroy,
  };
}
