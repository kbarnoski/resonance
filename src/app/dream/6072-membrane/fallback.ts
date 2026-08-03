// Canvas2D soft-gaussian fallback for 6072-membrane.
//
// When no WebGPU adapter is available we still show a living, audio-driven
// membrane: ~900 points are relaxed onto the SAME metaball iso-surface each
// frame (numeric gradient descent), rotated by a slow virtual camera, and
// drawn as additively-composited soft-gaussian sprites. Reduced fidelity —
// no true tangent-flattened covariance — but the felt idea survives.

import { makeRng, SEED } from "./prng";
import { fieldAt } from "./mat";

const POINTS = 900;
const SPRITE_STEPS = 10;

/** Violet-centric iridescent cosine palette, returns "r,g,b". */
function paletteRGB(hue: number): [number, number, number] {
  const h = hue - Math.floor(hue);
  const r = 0.55 + 0.45 * Math.cos(6.2831853 * (h + 0.0));
  const g = 0.35 + 0.4 * Math.cos(6.2831853 * (h + 0.16));
  const b = 0.62 + 0.48 * Math.cos(6.2831853 * (h + 0.36));
  return [
    Math.round(Math.max(0, Math.min(1, r)) * 255),
    Math.round(Math.max(0, Math.min(1, g)) * 255),
    Math.round(Math.max(0, Math.min(1, b)) * 255),
  ];
}

/** Pre-render a soft radial-gaussian sprite tinted with a palette color. */
function makeSprite(hue: number): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const [r, gg, b] = paletteRGB(hue);
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.28)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return c;
}

export class FallbackRenderer {
  private pts: Float32Array; // x,y,z,seed per point
  private sprites: HTMLCanvasElement[] = [];

  constructor() {
    const rng = makeRng(SEED ^ 0x7b21);
    this.pts = new Float32Array(POINTS * 4);
    for (let i = 0; i < POINTS; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const rad = 1.1 + rng() * 0.5;
      this.pts[i * 4] = Math.cos(th) * r * rad;
      this.pts[i * 4 + 1] = u * rad;
      this.pts[i * 4 + 2] = Math.sin(th) * r * rad;
      this.pts[i * 4 + 3] = rng();
    }
    for (let k = 0; k < SPRITE_STEPS; k++) {
      this.sprites.push(makeSprite(k / SPRITE_STEPS));
    }
  }

  frame(
    g: CanvasRenderingContext2D,
    metaballs: Float32Array,
    time: number,
    yaw: number,
    pitch: number,
    paletteRot: number,
    overall: number,
    high: number,
    w: number,
    h: number,
  ): void {
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(4,2,8,1)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";

    const cx = w / 2;
    const cy = h / 2;
    const focal = h * 0.9;
    const camDist = 3.6;
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const cpit = Math.cos(pitch);
    const spit = Math.sin(pitch);
    const eps = 0.03;
    const discBase = (0.05 + overall * 0.09 + high * 0.06) * focal;

    for (let i = 0; i < POINTS; i++) {
      const j = i * 4;
      let px = this.pts[j];
      let py = this.pts[j + 1];
      let pz = this.pts[j + 2];
      const seed = this.pts[j + 3];

      // shimmer + relaxation onto iso-surface (f = 1)
      px += Math.sin(time * 0.7 + seed * 40) * 0.03;
      pz += Math.cos(time * 0.9 + seed * 57) * 0.03;
      for (let k = 0; k < 3; k++) {
        const f = fieldAt(metaballs, px, py, pz);
        const gx =
          (fieldAt(metaballs, px + eps, py, pz) -
            fieldAt(metaballs, px - eps, py, pz)) /
          (2 * eps);
        const gy =
          (fieldAt(metaballs, px, py + eps, pz) -
            fieldAt(metaballs, px, py - eps, pz)) /
          (2 * eps);
        const gz =
          (fieldAt(metaballs, px, py, pz + eps) -
            fieldAt(metaballs, px, py, pz - eps)) /
          (2 * eps);
        const gg = gx * gx + gy * gy + gz * gz + 1e-5;
        const step = (f - 1) / gg;
        px -= step * gx;
        py -= step * gy;
        pz -= step * gz;
      }
      const pl = Math.hypot(px, py, pz);
      if (pl > 3.5) {
        px *= 3.5 / pl;
        py *= 3.5 / pl;
        pz *= 3.5 / pl;
      }
      this.pts[j] = px;
      this.pts[j + 1] = py;
      this.pts[j + 2] = pz;

      // rotate (yaw about Y, then pitch about X)
      const x1 = px * cyaw + pz * syaw;
      const z1 = -px * syaw + pz * cyaw;
      const y2 = py * cpit - z1 * spit;
      const z2 = py * spit + z1 * cpit;

      const depth = camDist - z2;
      if (depth < 0.2) continue;
      const sx = cx + (focal * x1) / depth;
      const sy = cy - (focal * y2) / depth;
      const size = (discBase * (0.7 + seed * 0.6)) / depth;
      if (size < 0.5) continue;

      const hue = paletteRot + py * 0.13 + seed * 0.5;
      const spr =
        this.sprites[
          ((Math.floor(hue * SPRITE_STEPS) % SPRITE_STEPS) + SPRITE_STEPS) %
            SPRITE_STEPS
        ];
      const fog = Math.max(0.15, Math.min(1, 1.6 / depth));
      g.globalAlpha = (0.12 + overall * 0.18) * fog;
      g.drawImage(spr, sx - size, sy - size, size * 2, size * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }
}
