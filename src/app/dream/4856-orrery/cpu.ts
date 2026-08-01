// cpu.ts — Canvas2D fallback planetary field for browsers without WebGPU.
//
// Same discretised wave equation and the SAME three forcings as the GPU path
// (quake impulses + advecting solar-wind undulation + polar Kp bloom), on a
// coarser grid, painted into an ImageData with the shared violet ramp. Slower
// and softer, but the piece plays and paints exactly the same idea.

import {
  dreamPaletteRGB,
  POLE_BAND_FRAC,
  windAmpFor,
  windPhaseStep,
  auroraAmpFor,
  auroraPhaseStep,
  type FieldForcing,
  type WaveField,
} from "./field";

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

  let forcing: FieldForcing = { windSpeed: 0, windDensity: 0, kp: 0 };
  let windPhase = 0;
  let auroraPhase = 0;
  const windKx = (6.2831853 * 3) / CW;
  const windKy = (6.2831853 * 1) / CH;
  const auroraKx = (6.2831853 * 9) / CW;
  const poleBand = CH * POLE_BAND_FRAC;

  function inject(cellX: number, cellY: number, amp: number): void {
    // GPU-grid cells (512×256) arrive; rescale to the coarse grid
    const x = Math.floor((cellX / 512) * CW);
    const y = Math.floor((cellY / 256) * CH);
    pending.push({ x, y, amp });
  }

  function setForcing(f: FieldForcing): void {
    forcing = f;
  }

  function applyImpulses(): void {
    const radius = 1.4;
    for (const im of pending) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = (((im.x + dx) % CW) + CW) % CW;
          const yy = im.y + dy;
          if (yy < 0 || yy >= CH) continue;
          const d2 = dx * dx + dy * dy;
          cur[yy * CW + xx] += im.amp * Math.exp(-d2 / (2 * radius * radius));
        }
      }
    }
    pending.length = 0;
  }

  function step(): void {
    windPhase += windPhaseStep(forcing);
    auroraPhase += auroraPhaseStep(forcing);
    const windAmp = windAmpFor(forcing);
    const auroraAmp = auroraAmpFor(forcing);
    const s = poleBand * 0.5;
    for (let y = 0; y < CH; y++) {
      const yu = y > 0 ? y - 1 : 0;
      const yd = y < CH - 1 ? y + 1 : CH - 1;
      const dpole = Math.min(y, CH - 1 - y);
      const band = dpole < poleBand ? Math.exp(-(dpole * dpole) / (2 * s * s)) : 0;
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        const xl = (x > 0 ? x - 1 : CW - 1) + y * CW;
        const xr = (x < CW - 1 ? x + 1 : 0) + y * CW;
        const lap = cur[xl] + cur[xr] + cur[yu * CW + x] + cur[yd * CW + x] - 4 * cur[i];
        let v = (2 * cur[i] - prev[i] + c2 * lap) * damping;
        // solar-wind undulation (advecting, energy-floor)
        v += windAmp * Math.sin(windKx * x + windKy * y - windPhase);
        // geomagnetic polar bloom
        if (band > 0) v += auroraAmp * band * Math.sin(auroraKx * x + auroraPhase);
        if (v > 12) v = 12;
        else if (v < -12) v = -12;
        next[i] = v;
      }
    }
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
    setForcing,
    frame,
    resize: () => {},
    destroy,
  };
}
