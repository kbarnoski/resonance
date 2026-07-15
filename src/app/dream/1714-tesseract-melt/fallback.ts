// ─────────────────────────────────────────────────────────────────────────────
// fallback.ts — Canvas2D graceful fallback when WebGL2 is unavailable.
//
//   Draws the same projected tesseract edges as additive glowing lines, mirrored
//   into a small N-fold kaleidoscope so the piece still reads as jeweled and
//   hyperdimensional. No shaders — just lineWidth + 'lighter' compositing.
// ─────────────────────────────────────────────────────────────────────────────

export interface FallbackRig {
  draw(edges: Float32Array, meta: Float32Array, count: number, flick: number): void;
}

export function makeFallbackRig(canvas: HTMLCanvasElement): FallbackRig | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const FOLDS = 6;

  const draw = (edges: Float32Array, meta: Float32Array, count: number, flick: number) => {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.42;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(6, 3, 14, ${0.34})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    for (let f = 0; f < FOLDS; f++) {
      const rot = (f / FOLDS) * Math.PI * 2;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      for (let e = 0; e < count; e++) {
        const o = e * 4;
        const ax = edges[o] * scale;
        const ay = edges[o + 1] * scale;
        const bx = edges[o + 2] * scale;
        const by = edges[o + 3] * scale;
        const wv = meta[e * 2];
        const depth = meta[e * 2 + 1];
        const hue = ((wv * 60 + f * 12 + 260) % 360 + 360) % 360;
        const light = 45 + depth * 30;
        ctx.strokeStyle = `hsla(${hue}, 95%, ${light * flick}%, ${0.5 * flick})`;
        ctx.lineWidth = 1.4 + depth * 2.4;
        ctx.beginPath();
        ctx.moveTo(cx + (ax * cr - ay * sr), cy + (ax * sr + ay * cr));
        ctx.lineTo(cx + (bx * cr - by * sr), cy + (bx * sr + by * cr));
        ctx.stroke();
      }
    }
  };

  return { draw };
}
