// ─────────────────────────────────────────────────────────────────────────────
// canvas2d.ts — additive Canvas2D fallback when WebGL2 is unavailable.
//
//   Same simulation, rendered with globalCompositeOperation = "lighter" so the
//   piece still self-demos. A translucent dark rect each frame gives the
//   feedback-trail smear; agents are additive radial sprites; when coherence
//   rises, a set of mirrored copies is drawn around the focus to read as the
//   symmetric gaze-figure (a coarse stand-in for the GL kaleidoscope), with a
//   bright pupil glow on the focus. Luminance flicker is applied as a global
//   brightness veil.
// ─────────────────────────────────────────────────────────────────────────────

import type { SwarmState } from "./swarm";
import type { SwarmRenderer } from "./gl";

export function createCanvas2DRenderer(canvas: HTMLCanvasElement): SwarmRenderer {
  const ctx = canvas.getContext("2d", { alpha: false })!;
  let W = 1;
  let H = 1;

  function resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    H = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
  }
  resize();

  function drawSprites(s: SwarmState, sx: number, sy: number): void {
    const rad = 2.4 * Math.min(2, window.devicePixelRatio || 1);
    for (let i = 0; i < s.n; i++) {
      const a = s.att[i];
      const x = s.x[i] * W;
      const y = s.y[i] * H;
      const r = rad * (0.55 + 1.2 * a);
      // dim violet -> warm pupil
      const R = Math.round(107 + (255 - 107) * a);
      const G = Math.round(76 + (219 - 76) * a);
      const B = Math.round(235 + (158 - 235) * a);
      const alpha = 0.25 + 0.55 * a;
      const g = ctx.createRadialGradient(x + sx, y + sy, 0, x + sx, y + sy, r);
      g.addColorStop(0, `rgba(${R},${G},${B},${alpha})`);
      g.addColorStop(1, `rgba(${R},${G},${B},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + sx - r, y + sy - r, r * 2, r * 2);
    }
  }

  function render(s: SwarmState, brightness: number): void {
    // feedback trail: fade the frame down with a translucent dark veil
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(6,4,14,${0.16 + 0.06 * (1 - brightness)})`;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    drawSprites(s, 0, 0);

    // symmetric gaze-figure: mirrored copies rotated around the focus
    const coh = s.coherence;
    if (coh > 0.05) {
      const fx = s.focusX * W;
      const fy = s.focusY * H;
      const sectors = 6;
      ctx.save();
      ctx.globalAlpha = Math.min(0.9, coh);
      for (let k = 1; k < sectors; k++) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(fx, fy);
        ctx.rotate((k / sectors) * Math.PI * 2);
        ctx.translate(-fx, -fy);
        drawSprites(s, 0, 0);
      }
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // pupil glow
      const pr = Math.max(W, H) * 0.12;
      const pg = ctx.createRadialGradient(fx, fy, 0, fx, fy, pr);
      pg.addColorStop(0, `rgba(255,230,184,${0.7 * coh})`);
      pg.addColorStop(1, "rgba(255,230,184,0)");
      ctx.fillStyle = pg;
      ctx.fillRect(fx - pr, fy - pr, pr * 2, pr * 2);
    }

    // luminance-safe flicker veil (darken toward the floor, never a hard strobe)
    if (brightness < 0.999) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function dispose(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
  }

  return { render, resize, dispose, kind: "canvas2d" };
}
