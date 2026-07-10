// ─────────────────────────────────────────────────────────────────────────────
// 1418-beat-field — Canvas2D coarse-grid fallback (tier 3, guaranteed to render).
//
// A coarse cell grid evaluates the SAME field kernel (field.ts::sampleFieldAt)
// per cell and paints each as a filled rect with the same cosmic→howl palette.
// This tier renders on anything with a 2D canvas, so the piece is never blank.
// ─────────────────────────────────────────────────────────────────────────────

import { sampleFieldAt, type FieldRenderer, type RenderFrame } from "./field";

const COLS = 72;
const ROWS = 40;

// Mirror of the shader palette, in JS. x is the (scaled) roughness at a cell.
function palette(x: number, drive: number): [number, number, number] {
  const base = [0.035, 0.02, 0.07];
  const cool = [0.36, 0.3, 0.95];
  const warm = [1.0, 0.52, 0.28];
  const hot = [1.0, 0.93, 0.82];
  const ss = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const g = 0.55 + 0.85 * drive;
  const r = (base[0] + cool[0] * ss(0.0, 0.55, x) * 0.75 + warm[0] * ss(0.45, 1.5, x) + hot[0] * ss(1.35, 2.6, x)) * g;
  const gg = (base[1] + cool[1] * ss(0.0, 0.55, x) * 0.75 + warm[1] * ss(0.45, 1.5, x) + hot[1] * ss(1.35, 2.6, x)) * g;
  const b = (base[2] + cool[2] * ss(0.0, 0.55, x) * 0.75 + warm[2] * ss(0.45, 1.5, x) + hot[2] * ss(1.35, 2.6, x)) * g;
  return [r, gg, b];
}

export function createBeatFieldCanvas2D(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  let disposed = false;

  const configure = () => {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  configure();

  const render = (frame: RenderFrame, timeSec: number) => {
    if (disposed) return;
    const w = canvas.width;
    const h = canvas.height;
    const cw = w / COLS;
    const ch = h / ROWS;
    const cx = 0.5;
    const cy = 0.5;

    for (let j = 0; j < ROWS; j++) {
      const uy = (j + 0.5) / ROWS;
      for (let i = 0; i < COLS; i++) {
        const ux = (i + 0.5) / COLS;
        const val = sampleFieldAt(frame.blobs, ux, uy, timeSec);
        // faint nebula so the lock is a calm field, never dead black
        const neb =
          0.012 *
          (0.5 + 0.5 * Math.sin(ux * 7 + timeSec * 0.35)) *
          (0.5 + 0.5 * Math.sin(uy * 5 - timeSec * 0.27));
        const x = (val + neb) * (0.8 + frame.intensity * 1.6);
        const [r, g, b] = palette(x, frame.drive);
        // radial vignette
        const dx = ux - cx;
        const dy = uy - cy;
        const rr = Math.sqrt(dx * dx * 1.96 + dy * dy);
        const vig = 0.4 + 0.6 * (1 - Math.min(1, Math.max(0, (rr - 0.55) / 0.7)));
        const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v * vig)) * 255);
        ctx.fillStyle = `rgb(${to255(r)},${to255(g)},${to255(b)})`;
        ctx.fillRect(Math.floor(i * cw), Math.floor(j * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1);
      }
    }
  };

  const resize = () => {
    if (disposed) return;
    configure();
  };

  const dispose = () => {
    disposed = true;
  };

  return { tier: "canvas", render, resize, dispose };
}
