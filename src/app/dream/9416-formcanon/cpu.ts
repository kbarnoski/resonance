// cpu.ts — graceful degradation when navigator.gpu is absent.
//
// The SAME blended log-polar form-constant field, computed per-pixel on a small
// buffer via the TS helpers in _shared/visionary/logpolar.ts (through
// field.ts::blendField), painted with Canvas2D and CSS-upscaled. Lower
// resolution, identical math and identical iridescent HSV coloring, so the
// piece still reads and never blanks. No flicker — slow phase + luminance drift.

import { screenToCortex } from "../_shared/visionary/logpolar";
import { blendField, hsv2rgb, type RenderParams, type Stage } from "./field";

const RES = 132; // square field buffer, upscaled to the canvas

export function createCpuStage(canvas: HTMLCanvasElement): Stage {
  const maybe2d = canvas.getContext("2d");
  if (!maybe2d) throw new Error("no-2d");
  const ctx2d: CanvasRenderingContext2D = maybe2d;

  // off-screen buffer at RES×RES; drawImage stretches it to the wide canvas.
  const buf = document.createElement("canvas");
  buf.width = RES;
  buf.height = RES;
  const maybeBuf2d = buf.getContext("2d");
  if (!maybeBuf2d) throw new Error("no-2d-buffer");
  const bctx: CanvasRenderingContext2D = maybeBuf2d;
  const img = bctx.createImageData(RES, RES);
  const data = img.data;

  let destroyed = false;

  function render(rp: RenderParams): void {
    if (destroyed) return;
    const aspect = canvas.width / Math.max(1, canvas.height);

    for (let y = 0; y < RES; y++) {
      const py = ((y + 0.5) / RES) * 2 - 1; // [-1,1]
      for (let x = 0; x < RES; x++) {
        const px = (((x + 0.5) / RES) * 2 - 1) * aspect; // aspect-corrected
        const field = blendField(px, py, rp.w, rp.freq, rp.phases);

        // hue shimmer uses cortical coords, matching the WGSL fragment exactly
        const [cu, cv] = screenToCortex(px, py);
        const hue =
          rp.hueBase +
          field * 0.22 +
          0.04 * Math.sin(cu * 1.5) +
          0.05 * Math.sin(cv * 2 + rp.time * 0.25) +
          rp.time * 0.012;
        let val = Math.pow(Math.min(1, Math.max(0, field)), 1.35) * rp.bright;

        const r = Math.hypot(px / Math.max(aspect, 1e-4), py);
        // calm the center singularity + gentle vignette (mirror the shader)
        const cen = smooth(0, 0.06, Math.hypot(px, py));
        val *= 0.55 + 0.45 * cen;
        val *= 1 - 0.28 * Math.min(1, r);

        const [cr, cg, cb] = hsv2rgb(hue, rp.sat, Math.min(1, Math.max(0, val)));
        const o = (y * RES + x) * 4;
        data[o] = clamp255(cr);
        data[o + 1] = clamp255(cg);
        data[o + 2] = clamp255(cb);
        data[o + 3] = 255;
      }
    }

    bctx.putImageData(img, 0, 0);
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(buf, 0, 0, RES, RES, 0, 0, canvas.width, canvas.height);
  }

  function resize(w: number, h: number): void {
    canvas.width = w;
    canvas.height = h;
  }

  function destroy(): void {
    destroyed = true;
  }

  return { backend: "CPU", render, resize, destroy };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function clamp255(v: number): number {
  const x = v * 255;
  return x < 0 ? 0 : x > 255 ? 255 : x | 0;
}
