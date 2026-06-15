// ─────────────────────────────────────────────────────────────────────────────
// render2d.ts — Canvas2D fallback for the monster stage.
//
// A REAL fallback (not a blank): draws the same shadow-puppet monster — the
// filled silhouette from the mask grid, a glowing wobbling outline, a warm
// stage spotlight + curtain vignette, whoosh smear with motion, and the two
// procedural GOOGLY EYES near the top of the mask. Auto-selected when WebGPU is
// absent or its init fails. Friendly purple/teal/gold palette.
// ─────────────────────────────────────────────────────────────────────────────

import { MASK_W, MASK_H } from "./mask";
import type { MonsterFrame, GpuRenderer } from "./gpu";

export function initRenderer2D(canvas: HTMLCanvasElement): GpuRenderer | null {
  const c = canvas.getContext("2d");
  if (!c) return null;
  const g: CanvasRenderingContext2D = c;
  let disposed = false;

  // offscreen mask buffer we paint the silhouette into, then composite scaled up
  const off = document.createElement("canvas");
  off.width = MASK_W;
  off.height = MASK_H;
  const octx = off.getContext("2d");
  const img = octx ? octx.createImageData(MASK_W, MASK_H) : null;

  function hueColor(t: number, l: number): string {
    // friendly cycling hue (purple→teal→gold), lightness l 0..1
    const h = ((t * 40) % 360 + 360) % 360;
    return `hsl(${h} 70% ${Math.round(l * 100)}%)`;
  }

  function render(f: MonsterFrame) {
    if (disposed) return;
    const W = canvas.width;
    const H = canvas.height;

    // ── stage backdrop ──────────────────────────────────────────────────────
    g.fillStyle = "#0a0712";
    g.fillRect(0, 0, W, H);
    // warm spotlight pool
    const spot = g.createRadialGradient(
      W * 0.5,
      H * 0.46,
      0,
      W * 0.5,
      H * 0.46,
      Math.max(W, H) * 0.6,
    );
    const sa = 0.18 + f.level * 0.18;
    spot.addColorStop(0, `rgba(255,210,120,${sa})`);
    spot.addColorStop(1, "rgba(255,210,120,0)");
    g.fillStyle = spot;
    g.fillRect(0, 0, W, H);
    // stage floor glow
    const floor = g.createLinearGradient(0, H * 0.78, 0, H);
    floor.addColorStop(0, "rgba(120,60,40,0)");
    floor.addColorStop(1, "rgba(120,60,40,0.25)");
    g.fillStyle = floor;
    g.fillRect(0, 0, W, H);

    // ── paint mask into offscreen with glow colour, then draw scaled ─────────
    if (octx && img) {
      const data = img.data;
      const wob = f.wobble;
      for (let y = 0; y < MASK_H; y++) {
        for (let x = 0; x < MASK_W; x++) {
          const i = y * MASK_W + x;
          const v = f.grid[i];
          const o = i * 4;
          if (v > 0.5) {
            // dark friendly puppet body with a faint warm inner glow
            const glow = 30 + f.roar * 90 * (0.6 + 0.4 * Math.sin(f.timeSec * 2));
            data[o] = 18 + glow * 0.4;
            data[o + 1] = 10 + glow * 0.2;
            data[o + 2] = 30 + glow * 0.5;
            data[o + 3] = 255;
          } else {
            data[o + 3] = 0;
          }
        }
      }
      octx.putImageData(img, 0, 0);

      // glowing outline: draw the scaled silhouette a few times with blur+colour
      g.save();
      g.imageSmoothingEnabled = true;
      const rimL = 0.55 + f.roar * 0.3 + f.motion * 0.2;
      g.shadowColor = hueColor(f.timeSec, rimL);
      g.shadowBlur = 24 + f.roar * 40 + f.motion * 24;
      // tiny wobble offset for squash-stretch life
      const jx = Math.sin(f.timeSec * 3.5) * wob * 6;
      const jy = Math.cos(f.timeSec * 3.0) * wob * 6;
      g.globalAlpha = 0.9;
      g.drawImage(off, jx, jy, W, H);
      // second pass brighter core, no blur
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      g.drawImage(off, 0, 0, W, H);
      g.restore();

      // whoosh smear: translucent streaks across the body with motion
      if (f.motion > 0.05) {
        g.save();
        g.globalCompositeOperation = "screen";
        g.globalAlpha = f.motion * 0.4;
        g.strokeStyle = hueColor(f.timeSec + 1, 0.6);
        g.lineWidth = 3;
        const n = 6;
        for (let k = 0; k < n; k++) {
          const yy = ((k / n + ((f.timeSec * 0.3) % 1)) % 1) * H;
          g.beginPath();
          g.moveTo(0, yy);
          g.lineTo(W, yy - 40 - f.motion * 60);
          g.stroke();
        }
        g.restore();
      }
    }

    // ── googly eyes ───────────────────────────────────────────────────────────
    const er = f.eyeR2 * Math.max(W, H) * 0.5;
    const wobE = 1 + 0.06 * Math.sin(f.timeSec * 7);
    drawEye(g, f.eyeL[0] * W, f.eyeL[1] * H, er * wobE, f.pupil, f.timeSec);
    drawEye(
      g,
      f.eyeR[0] * W,
      f.eyeR[1] * H,
      er * (1 + 0.06 * Math.sin(f.timeSec * 7 + 2)),
      f.pupil,
      f.timeSec,
    );

    // curtain vignette
    const vig = g.createRadialGradient(
      W * 0.5,
      H * 0.5,
      Math.min(W, H) * 0.3,
      W * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.75,
    );
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
  }

  function drawEye(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    pupil: [number, number],
    t: number,
  ) {
    if (r <= 0) return;
    // white
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fafaf2";
    ctx.fill();
    // friendly coloured ring
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = `hsl(${((t * 40) % 360 + 360) % 360} 70% 65%)`;
    ctx.stroke();
    // pupil (rolls around → googly)
    const pr = r * 0.42;
    const px = x + pupil[0] * r * 0.42;
    const py = y + pupil[1] * r * 0.42;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = "#08080f";
    ctx.fill();
    // catch-light
    ctx.beginPath();
    ctx.arc(px - pr * 0.3, py - pr * 0.4, pr * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230,230,255,0.95)";
    ctx.fill();
  }

  function resize(w: number, h: number) {
    canvas.width = w;
    canvas.height = h;
  }

  function dispose() {
    disposed = true;
  }

  return { render, resize, dispose };
}
