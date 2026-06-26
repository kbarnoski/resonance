// Canvas2D fallback phosphor scope (used when WebGL2 / float targets are
// unavailable). Approximates CRT persistence by painting a translucent black
// rectangle each frame (decay) and stroking the beam additively with shadowBlur
// for a glow. Less authentic than the WebGL2 path but still reads as a scope.

import type { DrawOpts } from "./phosphor-gl";

export type Phosphor2D = {
  resize: (w: number, h: number) => void;
  draw: (xs: Float32Array, ys: Float32Array, n: number, opts: DrawOpts) => void;
  dispose: () => void;
};

export function createPhosphor2D(canvas: HTMLCanvasElement): Phosphor2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  let W = canvas.width || 2;
  let H = canvas.height || 2;

  function resize(w: number, h: number) {
    W = Math.max(2, Math.floor(w));
    H = Math.max(2, Math.floor(h));
    canvas.width = W;
    canvas.height = H;
    ctx!.fillStyle = "#000";
    ctx!.fillRect(0, 0, W, H);
  }

  function draw(xs: Float32Array, ys: Float32Array, n: number, opts: DrawOpts) {
    if (n < 2) return;
    // Decay: paint translucent black. Higher persistence → fainter fade.
    const fade = 0.06 + (1 - opts.persistence) * 0.22;
    ctx!.globalCompositeOperation = "source-over";
    ctx!.fillStyle = `rgba(0,0,0,${fade})`;
    ctx!.fillRect(0, 0, W, H);

    const r = Math.min(W, H) / 2;
    const cx = W / 2;
    const cy = H / 2;
    const [cr, cg, cb] = opts.hue;
    const col = `rgb(${Math.round(cr * 255)},${Math.round(cg * 255)},${Math.round(cb * 255)})`;

    ctx!.globalCompositeOperation = "lighter";
    ctx!.lineWidth = 1.6;
    ctx!.lineJoin = "round";
    ctx!.lineCap = "round";
    ctx!.shadowColor = col;
    ctx!.shadowBlur = 8 + opts.brightness * 14;
    ctx!.strokeStyle = col;
    ctx!.globalAlpha = 0.5 + opts.brightness * 0.5;

    ctx!.beginPath();
    ctx!.moveTo(cx + xs[0] * r, cy - ys[0] * r);
    for (let i = 1; i < n; i++) {
      ctx!.lineTo(cx + xs[i] * r, cy - ys[i] * r);
    }
    ctx!.closePath();
    ctx!.stroke();
    ctx!.globalAlpha = 1;
    ctx!.shadowBlur = 0;
  }

  function dispose() {
    /* nothing persistent to release */
  }

  return { resize, draw, dispose };
}
