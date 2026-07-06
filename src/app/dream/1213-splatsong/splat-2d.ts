// ─────────────────────────────────────────────────────────────────────────────
// splat-2d.ts — reduced Canvas2D fallback for machines without WebGL2.
//
// Projects a subsampled set of the Gaussians, sorts them back-to-front, and
// paints each as a soft radial-gradient blob. Still strikeable + audible; just
// no true anisotropic conic (blobs are isotropic) and fewer splats.
// ─────────────────────────────────────────────────────────────────────────────

import { Mat4, projectToScreen, viewZ } from "./mat";
import { Scene } from "./scene";

export class Splat2D {
  private ctx: CanvasRenderingContext2D;
  private scene: Scene;
  private idx: number[]; // subsampled splat indices
  private size: Float32Array; // world-space characteristic size per subsampled splat
  private order: number[];

  constructor(ctx: CanvasRenderingContext2D, scene: Scene) {
    this.ctx = ctx;
    this.scene = scene;
    // subsample to ~1100 blobs for a responsive fallback
    const target = 1100;
    const step = Math.max(1, Math.floor(scene.count / target));
    this.idx = [];
    for (let i = 0; i < scene.count; i += step) this.idx.push(i);
    this.size = new Float32Array(this.idx.length);
    for (let k = 0; k < this.idx.length; k++) {
      const i = this.idx[k];
      const tr = (scene.cov[i * 6] + scene.cov[i * 6 + 3] + scene.cov[i * 6 + 5]) / 3;
      this.size[k] = Math.sqrt(Math.max(1e-6, tr));
    }
    this.order = this.idx.map((_, k) => k);
  }

  frame(
    view: Mat4,
    proj: Mat4,
    focalPx: number,
    flash: Float32Array,
    shimmer: number,
    cssW: number,
    cssH: number,
    dpr: number,
  ) {
    const ctx = this.ctx;
    const W = cssW * dpr;
    const H = cssH * dpr;

    // studio light-box backdrop (matches the WebGL path)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const top = 0.33 + shimmer;
    const bot = 0.15 + shimmer;
    grad.addColorStop(0, `rgb(${lum(top, 0.985)},${lum(top, 1)},${lum(top, 1.035)})`);
    grad.addColorStop(1, `rgb(${lum(bot, 0.985)},${lum(bot, 1)},${lum(bot, 1.035)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const scene = this.scene;
    const depths = this.order.map((k) => {
      const i = this.idx[k];
      return viewZ(view, scene.positions[i * 3], scene.positions[i * 3 + 1], scene.positions[i * 3 + 2]);
    });
    // back-to-front: most negative view-z first
    this.order.sort((a, b) => depths[a] - depths[b]);

    ctx.globalCompositeOperation = "lighter";
    for (const k of this.order) {
      const i = this.idx[k];
      const p = projectToScreen(proj, view, [scene.positions[i * 3], scene.positions[i * 3 + 1], scene.positions[i * 3 + 2]], W, H);
      if (p.behind) continue;
      const dist = Math.max(0.05, p.w);
      let r = (focalPx * dpr * this.size[k] * 2.4) / dist;
      if (r < 1) continue;
      r = Math.min(r, 220 * dpr);
      const ci = scene.clusterId[i];
      const fl = flash[ci] || 0;
      const cr = Math.min(1, scene.colors[i * 3] * (1 + fl * 1.6));
      const cg = Math.min(1, scene.colors[i * 3 + 1] * (1 + fl * 1.6));
      const cb = Math.min(1, scene.colors[i * 3 + 2] * (1 + fl * 1.6));
      const a = Math.min(0.9, scene.opacity[i] * 0.5 * (1 + fl * 0.5));
      const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, r);
      g.addColorStop(0, `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},${a})`);
      g.addColorStop(1, `rgba(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
}

function lum(v: number, tint: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255 * tint)));
}
