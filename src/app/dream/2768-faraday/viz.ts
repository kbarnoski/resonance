// viz.ts — shades the Faraday height-field as a lit dish of water.
//
// The field is rendered to a grid-resolution ImageData, then scaled up with
// smoothing so the standing waves read as a continuous fluid surface. Luminance
// is built from |height| and the surface-gradient (a caustic-like specular
// term) — both PHASE-INSENSITIVE, so the subharmonic sign-flip of the cells
// never flashes the whole frame (no strobe). Colour walks the house violet
// ramp: deep troughs indigo, bright caustics toward soft violet/white.

import type { FaradayField } from "./field";

export interface Renderer {
  draw(field: FaradayField, drive: number, time: number): void;
  dispose(): void;
}

// house palette anchors (violet ramp), as 0–255 rgb
const DEEP = [11, 7, 19]; // near-black violet — dry dish / troughs
const MID = [80, 54, 150]; // brand violet body
const HI = [196, 181, 253]; // soft caustic highlight (violet-300)

function mix3(
  a: number[],
  b: number[],
  t: number,
  out: number[],
  o: number,
): void {
  out[o] = a[0] + (b[0] - a[0]) * t;
  out[o + 1] = a[1] + (b[1] - a[1]) * t;
  out[o + 2] = a[2] + (b[2] - a[2]) * t;
}

export function buildRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");

  // offscreen grid-resolution buffer
  const grid = document.createElement("canvas");
  const gctx = grid.getContext("2d");
  if (!gctx) throw new Error("2d canvas unavailable");

  let img: ImageData | null = null;
  let gridN = 0;
  const rgb = [0, 0, 0];

  const draw = (field: FaradayField, drive: number, time: number): void => {
    const n = field.n;
    if (gridN !== n) {
      grid.width = n;
      grid.height = n;
      img = gctx.createImageData(n, n);
      gridN = n;
    }
    const h = field.height;
    const data = img!.data;
    // light direction for the specular caustic
    const lx = Math.cos(time * 0.13) * 0.5;
    const ly = Math.sin(time * 0.11) * 0.5;
    // slow global luminance drift only (never a flash)
    const breathe = 0.86 + 0.14 * Math.sin(time * 0.25);
    // brighten with how "alive" the dish is (drive above threshold)
    const wet = Math.min(1, Math.max(0, (drive - 0.32) / 0.9));

    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    const R = n * 0.47;

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const p = i * 4;
        const rr = Math.hypot(x - cx, y - cy) / R;
        if (rr >= 1) {
          data[p] = DEEP[0] * 0.5;
          data[p + 1] = DEEP[1] * 0.5;
          data[p + 2] = DEEP[2] * 0.6;
          data[p + 3] = 255;
          continue;
        }
        // surface gradient → caustic specular (phase-insensitive magnitude)
        const xl = x > 0 ? h[i - 1] : h[i];
        const xr = x < n - 1 ? h[i + 1] : h[i];
        const yl = y > 0 ? h[i - n] : h[i];
        const yr = y < n - 1 ? h[i + n] : h[i];
        const gx = (xr - xl) * 0.5;
        const gy = (yr - yl) * 0.5;
        const slope = Math.sqrt(gx * gx + gy * gy);
        const spec = Math.abs(gx * lx + gy * ly); // caustic glints
        const amp = Math.abs(h[i]);

        // luminance: base wet fill + crest magnitude + caustic glint
        let lum = 0.10 + wet * 0.16 + amp * 1.5 + slope * 2.2 + spec * 3.0;
        lum = lum * breathe;
        if (lum > 1) lum = 1;

        // colour ramp: DEEP → MID → HI by luminance
        if (lum < 0.5) mix3(DEEP, MID, lum / 0.5, rgb, 0);
        else mix3(MID, HI, (lum - 0.5) / 0.5, rgb, 0);

        // rim vignette so it reads as a dish
        const vig = rr > 0.86 ? 1 - (rr - 0.86) / 0.14 : 1;
        data[p] = rgb[0] * vig;
        data[p + 1] = rgb[1] * vig;
        data[p + 2] = rgb[2] * vig;
        data[p + 3] = 255;
      }
    }
    gctx.putImageData(img!, 0, 0);

    // scale up smoothly to the display canvas
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(grid, 0, 0, n, n, 0, 0, canvas.width, canvas.height);
  };

  return {
    draw,
    dispose() {
      /* nothing retained */
    },
  };
}
