// ─────────────────────────────────────────────────────────────────────────────
// fallback.ts — the mandatory Canvas2D degrade path (no full-screen fragment
// shader; that surface is banned this cycle).
//
// Runs the SAME driven coupled-oscillator lattice as the GPU path, at a small
// lattice (FX*FV <= ~6k cells), on the CPU, and draws one soft additive point per
// cortical cell through the same r = exp(u) warp. Lower resolution, but never
// blank and — because audio is driven by the shared WaveEngine, not this renderer
// — never silent. Mirrors the GpuField interface so the render loop is identical.
// ─────────────────────────────────────────────────────────────────────────────

import { FX, FV, U_MIN, U_MAX, EXP_UMAX, mulberry32 } from "./sim";
import type { StepArgs, RenderArgs } from "./gpu";

export class FallbackField {
  private ctx: CanvasRenderingContext2D | null;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private phase: Float32Array;
  private next: Float32Array;
  private uu: Float32Array;
  private vv: Float32Array;
  private frame = 0;
  private outW = 2;
  private outH = 2;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const cells = FX * FV;
    this.phase = new Float32Array(cells);
    this.next = new Float32Array(cells);
    this.uu = new Float32Array(FX);
    this.vv = new Float32Array(FV);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let i = 0; i < cells; i++) this.phase[i] = rng() * Math.PI * 2;
    for (let i = 0; i < FX; i++) this.uu[i] = U_MIN + ((i + 0.5) / FX) * (U_MAX - U_MIN);
    for (let j = 0; j < FV; j++) this.vv[j] = ((j + 0.5) / FV) * Math.PI * 2 - Math.PI;
    this.resize();
  }

  resize(): void {
    const w = Math.max(2, Math.floor(this.canvas.clientWidth * this.dpr));
    const h = Math.max(2, Math.floor(this.canvas.clientHeight * this.dpr));
    if (w !== this.outW || h !== this.outH || this.canvas.width !== w) {
      this.outW = w;
      this.outH = h;
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private hash(x: number): number {
    const s = Math.sin(x * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  step(a: StepArgs, substeps: number): void {
    if (this.disposed) return;
    const ph = this.phase;
    const nx = this.next;
    const sub = Math.max(1, Math.floor(substeps / 2));
    for (let s = 0; s < sub; s++) {
      this.frame++;
      for (let j = 0; j < FV; j++) {
        const jm = j === 0 ? FV - 1 : j - 1;
        const jp = j === FV - 1 ? 0 : j + 1;
        const v = this.vv[j];
        for (let i = 0; i < FX; i++) {
          const idx = j * FX + i;
          const th = ph[idx];
          const im = i === 0 ? 0 : i - 1;
          const ip = i === FX - 1 ? FX - 1 : i + 1;
          const coup =
            Math.sin(ph[j * FX + im] - th) +
            Math.sin(ph[j * FX + ip] - th) +
            Math.sin(ph[jm * FX + i] - th) +
            Math.sin(ph[jp * FX + i] - th);
          const uu = this.uu[i];
          let force = 0;
          for (let k = 0; k < a.nSrc; k++) {
            const sk = a.src[k * 4 + 0];
            const sphi = a.src[k * 4 + 1];
            const samp = a.src[k * 4 + 2];
            const sph = a.src[k * 4 + 3];
            const Th = sk * (Math.cos(sphi) * uu + Math.sin(sphi) * v) + sph;
            force += samp * Math.sin(Th - th);
          }
          const n = this.hash(idx * 0.123 + this.frame * 0.731) - 0.5;
          const dth = a.coupling * 0.25 * coup + a.forcing * force + a.noise * n;
          nx[idx] = th + a.dt * dth;
        }
      }
      this.phase.set(nx);
    }
  }

  render(a: RenderArgs): void {
    if (this.disposed || !this.ctx) return;
    this.resize();
    const ctx = this.ctx;
    const W = this.outW;
    const H = this.outH;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgb(3,2,6)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2;
    const cy = H / 2;
    const fit = Math.min(W, H) / 2;
    const ph = this.phase;
    for (let j = 0; j < FV; j++) {
      const v = this.vv[j];
      const cv = Math.cos(v);
      const sv = Math.sin(v);
      for (let i = 0; i < FX; i++) {
        const idx = j * FX + i;
        const cth = Math.cos(ph[idx]);
        const br = 0.5 + 0.5 * cth;
        const r = (Math.exp(this.uu[i]) * (1 + a.breath * cth)) / EXP_UMAX;
        const x = cx + r * cv * fit;
        const y = cy + r * sv * fit;
        if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
        const un = (this.uu[i] - U_MIN) / (U_MAX - U_MIN);
        const hue = (a.hueBase + 0.1 * cth + 0.07 * un) % 1;
        const [rr, gg, bb] = hsv2rgb((hue + 1) % 1, 0.55 + 0.35 * a.satMul, a.bright * (0.22 + 0.9 * br));
        const size = (0.8 + 2.4 * br) * this.dpr;
        ctx.fillStyle = `rgb(${(rr * 255) | 0},${(gg * 255) | 0},${(bb * 255) | 0})`;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.disposed = true;
  }
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}
