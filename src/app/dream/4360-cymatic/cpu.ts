// ─────────────────────────────────────────────────────────────────────────────
// 4360 · Cymatic — Canvas2D fallback backend (REQUIRED when navigator.gpu absent).
//
// Runs the IDENTICAL model as gpu.ts at a reduced particle count (~4k): each grain
// does a damped Newton descent onto the nodal set A(p)=0 (via evalField in
// modes.ts) plus a displacement-proportional jitter, drawn as additive points on
// the violet ramp with globalCompositeOperation "lighter".
// ─────────────────────────────────────────────────────────────────────────────

import { evalField, makeRng } from "./modes";
import type { Backend, StepOpts } from "./gpu";

export const CPU_PARTICLES = 4000;

export function makeCpuBackend(canvas: HTMLCanvasElement, rng: () => number): Backend {
  const N = CPU_PARTICLES;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = rng();
    py[i] = rng();
    seed[i] = rng();
  }

  const ctx = canvas.getContext("2d")!;
  // a private jitter PRNG so the CPU path stays deterministic frame-to-frame
  const jrng = makeRng(0x4360ccc);

  // violet ramp #4c1d95 → #8b5cf6 → #ede9fe
  const ramp = (t: number): [number, number, number] => {
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    const stops: [number, number, number][] = [
      [76, 29, 149],
      [139, 92, 246],
      [237, 233, 254],
    ];
    const x = u * (stops.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };

  const step = (o: StepOpts) => {
    const W = canvas.width;
    const H = canvas.height;
    // plate square, centred; scaleX/scaleY encode the aspect-corrected half-extent
    const plateW = W * o.scaleX;
    const plateH = H * o.scaleY;
    const ox = (W - plateW) / 2;
    const oy = (H - plateH) / 2;

    // clear to the deep-violet plate background
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgb(5,4,9)";
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N; i++) {
      const fo = evalField(px[i], py[i], o.weights);
      const g2 = fo.gx * fo.gx + fo.gy * fo.gy + 1e-3;
      let sx = (o.rate * fo.A * fo.gx) / g2;
      let sy = (o.rate * fo.A * fo.gy) / g2;
      const sl = Math.sqrt(sx * sx + sy * sy);
      if (sl > 0.05) {
        const k = 0.05 / sl;
        sx *= k;
        sy *= k;
      }
      let x = px[i] - sx;
      let y = py[i] - sy;

      const mag = Math.abs(fo.A);
      const ang = jrng() * Math.PI * 2;
      const amp = o.jitter * mag * jrng();
      x += Math.cos(ang) * amp;
      y += Math.sin(ang) * amp;

      if (x < 0) x = -x;
      else if (x > 1) x = 2 - x;
      if (y < 0) y = -y;
      else if (y > 1) y = 2 - y;
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      y = y < 0 ? 0 : y > 1 ? 1 : y;
      px[i] = x;
      py[i] = y;

      const settle = Math.max(0, Math.min(1, 1 - mag / 0.6));
      const [r, g, b] = ramp(settle);
      const a = 0.12 + 0.5 * settle;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
      const sxp = ox + x * plateW;
      const syp = oy + y * plateH;
      ctx.fillRect(sxp, syp, 1.6, 1.6);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const destroy = () => {
    /* nothing retained beyond GC */
  };

  return { kind: "cpu", step, destroy };
}
