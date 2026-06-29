/* ── 1042-hyperspace-bloom · Canvas2D fallback ───────────────────────────
 *
 *  When WebGL2 is unavailable we still show *something* moving: the same
 *  24-cell, rotated in 4D and stereographically projected, drawn as an
 *  additive glowing wireframe. Far cheaper than the raymarch but it keeps
 *  the hyperdimensional morph readable, and the audio still plays.
 */

import {
  type Polytope,
  type Angles6,
  rotate4,
  project4to3,
} from "./polytope";

export interface FallbackRig {
  /** Draw one frame. `time` seconds, `peak` 0..1 from the timeline. */
  draw(time: number, peak: number, sat: number): void;
}

export function makeFallbackRig(
  canvas: HTMLCanvasElement,
  poly: Polytope,
): FallbackRig | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  return {
    draw(time: number, peak: number, sat: number) {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * (0.12 + 0.03 * peak);

      ctx.fillStyle = "rgba(4, 2, 10, 0.32)"; // motion trails, no harsh flash
      ctx.fillRect(0, 0, w, h);

      const r = time * 0.25 * (0.6 + peak);
      const ang: Angles6 = {
        xy: r * 0.5,
        xz: r * 0.3,
        xw: r * 0.8, // the hyper planes morph the slice
        yz: r * 0.4,
        yw: r * 0.6,
        zw: r * 0.7,
      };

      // project all verts once
      const pts = poly.verts.map((v) => project4to3(rotate4(v, ang)));

      ctx.globalCompositeOperation = "lighter"; // additive neon
      const hueBase = (time * 18) % 360;

      for (const [i, j] of poly.edges) {
        const a = pts[i];
        const b = pts[j];
        // simple perspective on the projected 3D point
        const za = 3.4 / (3.4 - a[2]);
        const zb = 3.4 / (3.4 - b[2]);
        const ax = cx + a[0] * scale * za;
        const ay = cy + a[1] * scale * za;
        const bx = cx + b[0] * scale * zb;
        const by = cy + b[1] * scale * zb;

        const depth = (za + zb) * 0.5;
        const hue = (hueBase + depth * 70) % 360;
        const light = 55 + 15 * peak;
        const satPct = 70 + sat * 28;
        ctx.strokeStyle = `hsla(${hue}, ${satPct}%, ${light}%, ${0.25 + 0.4 * peak})`;
        ctx.lineWidth = 1 + depth * 0.8 + peak;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
}
