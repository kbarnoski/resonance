// canvas2d.ts — CPU particle flow-field fallback for when WebGPU is absent.
//
// Same soul as the compute version at a smaller scale: a few thousand particles
// drift on a curl-noise river and are stirred by hand vortices, drawn as
// additive radial dots (a pre-rendered glow sprite blitted with "lighter").

import { mulberry32 } from "./rng";

export const CANVAS2D_COUNT = 2600;

export interface HandForceInput {
  x: number;
  y: number;
  active: number;
  force: number;
  vx: number;
  vy: number;
  burst: number;
}

function makeSprite(): HTMLCanvasElement {
  const s = document.createElement("canvas");
  const R = 24;
  s.width = R * 2;
  s.height = R * 2;
  const g = s.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.35, "rgba(190,150,255,0.5)");
    grad.addColorStop(1, "rgba(60,40,140,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
  }
  return s;
}

// cheap smooth potential; its analytic 2-D curl gives a divergence-free flow.
function potential(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 3.1 + t * 0.4) * Math.cos(y * 2.7 - t * 0.3) +
    0.5 * Math.sin(x * 6.0 - t * 0.25) * Math.cos(y * 5.3 + t * 0.35)
  );
}

function curlX(x: number, y: number, t: number): number {
  const e = 0.02;
  return (potential(x, y + e, t) - potential(x, y - e, t)) / (2 * e);
}
function curlY(x: number, y: number, t: number): number {
  const e = 0.02;
  return -(potential(x + e, y, t) - potential(x - e, y, t)) / (2 * e);
}

export class Canvas2DField {
  private px: Float32Array;
  private py: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private sprite: HTMLCanvasElement;

  constructor(seed: number) {
    const rng = mulberry32(seed);
    const n = CANVAS2D_COUNT;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = rng();
      this.py[i] = rng();
    }
    this.sprite = makeSprite();
  }

  step(
    dt: number,
    time: number,
    hands: [HandForceInput, HandForceInput],
    energy: number,
    reduced: boolean,
  ): void {
    const n = CANVAS2D_COUNT;
    const d = Math.min(dt, 0.033);
    const calm = reduced ? 0.12 : 1;
    const damp = reduced ? 0.8 : 0.92;
    const flowK = (0.09 + energy * 0.05) * calm;
    for (let i = 0; i < n; i++) {
      let x = this.px[i];
      let y = this.py[i];
      let vx = this.vx[i];
      let vy = this.vy[i];

      let fx = curlX(x * 5, y * 5, time) * flowK;
      let fy = curlY(x * 5, y * 5, time) * flowK;

      for (let h = 0; h < 2; h++) {
        const hd = hands[h];
        if (hd.active < 0.5) continue;
        const tx = hd.x - x;
        const ty = hd.y - y;
        const dist = Math.hypot(tx, ty) + 1e-4;
        const dirx = tx / dist;
        const diry = ty / dist;
        const radius = 0.34;
        const fall = Math.max(0, 1 - dist / radius);
        const stir = (0.55 + hd.force * 2.2) * calm;
        // tangential vortex + inward pull
        fx += (-diry * 1.3 + dirx * 0.5) * fall * stir;
        fy += (dirx * 1.3 + diry * 0.5) * fall * stir;
        // downward-current from hand velocity
        fx += hd.vx * fall * 1.6 * calm;
        fy += hd.vy * fall * 1.6 * calm;
        // burst fountain (outward)
        const bfall = Math.max(0, 1 - dist / (radius * 0.7));
        fx -= dirx * hd.burst * bfall * 6 * calm;
        fy -= diry * hd.burst * bfall * 6 * calm;
      }

      vx = (vx + fx * d) * damp;
      vy = (vy + fy * d) * damp;
      const sp = Math.hypot(vx, vy);
      if (sp > 1.4) {
        vx *= 1.4 / sp;
        vy *= 1.4 / sp;
      }
      x += vx * d;
      y += vy * d;
      const m = 0.06;
      if (x < -m) x += 1 + 2 * m;
      if (x > 1 + m) x -= 1 + 2 * m;
      if (y < -m) y += 1 + 2 * m;
      if (y > 1 + m) y -= 1 + 2 * m;

      this.px[i] = x;
      this.py[i] = y;
      this.vx[i] = vx;
      this.vy[i] = vy;
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, brightness: number): void {
    // fade-to-black trail rather than a hard clear → luminous smear
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,4,18,0.32)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    const n = CANVAS2D_COUNT;
    const sprite = this.sprite;
    for (let i = 0; i < n; i++) {
      const sp = Math.min(1, Math.hypot(this.vx[i], this.vy[i]) * 1.6);
      const size = (5 + sp * 10) * (0.7 + brightness * 0.5);
      g.globalAlpha = (0.14 + sp * 0.28) * brightness;
      const sx = this.px[i] * w - size / 2;
      const sy = this.py[i] * h - size / 2;
      g.drawImage(sprite, sx, sy, size, size);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
