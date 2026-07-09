// Retro-808 renderer: amber/red glowing step buttons on near-black, a bright
// playhead column sweeping in time, and your silhouette as a soft glowing mask
// over the grid. Beat pulses are smooth luminance drift (single exponential
// decay), never a strobe.

import { STEPS, VOICES, VOICE_DEFS, type SeqSnapshot } from "./sequencer";
import type { MotionSample } from "./silhouette";

export interface GridLayout {
  ml: number;
  mt: number;
  cellW: number;
  cellH: number;
  gap: number;
}

export function layoutGrid(w: number, h: number): GridLayout {
  const ml = Math.max(52, Math.min(96, w * 0.15));
  const mt = h * 0.16;
  const mb = h * 0.08;
  const mr = w * 0.04;
  const gridW = w - ml - mr;
  const gridH = h - mt - mb;
  const cellW = gridW / STEPS;
  const cellH = gridH / VOICES;
  const gap = Math.min(cellW, cellH) * 0.16;
  return { ml, mt, cellW, cellH, gap };
}

// pointer (row,col) hit test — used by the touch step-sequencer fallback
export function hitCell(
  lay: GridLayout,
  px: number,
  py: number,
): { row: number; col: number } | null {
  const col = Math.floor((px - lay.ml) / lay.cellW);
  const row = Math.floor((py - lay.mt) / lay.cellH);
  if (col < 0 || col >= STEPS || row < 0 || row >= VOICES) return null;
  return { row, col };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface DrawInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  snap: SeqSnapshot;
  motion: MotionSample | null;
  playhead: number; // float column
  now: number; // ctx.currentTime
  reduced: boolean;
}

export function drawScene(input: DrawInput) {
  const { ctx, w, h, snap, motion, playhead, now, reduced } = input;
  const lay = layoutGrid(w, h);

  // background
  ctx.fillStyle = "#08060a";
  ctx.fillRect(0, 0, w, h);

  // silhouette glow (additive) sampled from the presence field
  if (motion) {
    ctx.globalCompositeOperation = "lighter";
    const cellW = (lay.cellW * STEPS) / motion.lw;
    const cellH = (lay.cellH * VOICES) / motion.lh;
    for (let y = 0; y < motion.lh; y += 2) {
      for (let x = 0; x < motion.lw; x += 2) {
        const p = motion.presence[y * motion.lw + x];
        if (p < 0.12) continue;
        const px = lay.ml + x * cellW;
        const py = lay.mt + y * cellH;
        const a = Math.min(0.5, p * 0.5) * (reduced ? 0.55 : 1);
        ctx.fillStyle = `hsla(28, 95%, 60%, ${a})`;
        ctx.fillRect(px, py, cellW * 2.2, cellH * 2.2);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  const phaseSilence = snap.phase === "silence";
  const phaseSlam = snap.phase === "slam";

  // step buttons
  for (let r = 0; r < VOICES; r++) {
    const voice = VOICES - 1 - r; // top row = tom, bottom = kick
    const def = VOICE_DEFS[voice];
    for (let cIdx = 0; cIdx < STEPS; cIdx++) {
      const x = lay.ml + cIdx * lay.cellW + lay.gap / 2;
      const y = lay.mt + r * lay.cellH + lay.gap / 2;
      const cw = lay.cellW - lay.gap;
      const ch = lay.cellH - lay.gap;
      const armed = snap.armed[voice][cIdx];

      // beat flash: exponential decay since last fire (smooth, <=3Hz)
      const ft = snap.flash[voice][cIdx];
      let flash = 0;
      if (ft >= 0) {
        const dt = now - ft;
        if (dt >= 0) flash = Math.exp(-dt / 0.22);
      }
      if (reduced) flash *= 0.5;

      // downbeat column tint
      const onBeat = cIdx % 2 === 0;

      let light: number;
      let sat: number;
      let alpha: number;
      if (armed) {
        const ghost = snap.prob[voice][cIdx] < 0.75 ? 0.72 : 1;
        light = (26 + flash * 34) * ghost;
        sat = 92;
        alpha = 0.9;
      } else {
        light = onBeat ? 12 : 9;
        sat = 30;
        alpha = 0.85;
      }

      roundRect(ctx, x, y, cw, ch, Math.min(cw, ch) * 0.22);
      ctx.fillStyle = `hsla(${def.hue}, ${sat}%, ${light}%, ${alpha})`;
      ctx.fill();

      if (armed) {
        ctx.save();
        ctx.shadowColor = `hsla(${def.hue}, 95%, 55%, ${0.5 + flash * 0.4})`;
        ctx.shadowBlur = 10 + flash * 26;
        roundRect(ctx, x, y, cw, ch, Math.min(cw, ch) * 0.22);
        ctx.fillStyle = `hsla(${def.hue}, 95%, ${34 + flash * 30}%, 0.95)`;
        ctx.fill();
        ctx.restore();
      }

      // subtle rim
      ctx.strokeStyle = "rgba(255,180,120,0.10)";
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, cw, ch, Math.min(cw, ch) * 0.22);
      ctx.stroke();
    }
  }

  // playhead column
  if (!phaseSilence) {
    const col = ((playhead % STEPS) + STEPS) % STEPS;
    const x = lay.ml + col * lay.cellW;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(x, 0, x + lay.cellW, 0);
    const bright = phaseSlam ? 0.5 : 0.3;
    g.addColorStop(0, `hsla(45,100%,65%,0)`);
    g.addColorStop(0.5, `hsla(45,100%,65%,${bright})`);
    g.addColorStop(1, `hsla(45,100%,65%,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, lay.mt - 6, lay.cellW, lay.cellH * VOICES + 12);
    ctx.globalCompositeOperation = "source-over";
  }

  // voice labels (left gutter)
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.max(10, Math.min(14, lay.cellH * 0.26))}px ui-monospace, monospace`;
  for (let r = 0; r < VOICES; r++) {
    const voice = VOICES - 1 - r;
    const def = VOICE_DEFS[voice];
    const y = lay.mt + r * lay.cellH + lay.cellH / 2;
    ctx.fillStyle = `hsla(${def.hue}, 60%, 72%, 0.85)`;
    ctx.fillText(def.label, lay.ml - 10, y);
  }

  // step numbers along the top
  ctx.textAlign = "center";
  ctx.font = `500 ${Math.max(9, Math.min(12, lay.cellW * 0.22))}px ui-monospace, monospace`;
  for (let cIdx = 0; cIdx < STEPS; cIdx++) {
    const x = lay.ml + cIdx * lay.cellW + lay.cellW / 2;
    const isBeat = cIdx % 2 === 0;
    ctx.fillStyle = isBeat
      ? "rgba(255,210,160,0.7)"
      : "rgba(255,210,160,0.32)";
    ctx.fillText(String(cIdx + 1), x, lay.mt - 12);
  }
}
