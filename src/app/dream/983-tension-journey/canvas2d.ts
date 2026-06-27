// canvas2d.ts — the legible, ink-on-ivory tension-ribbon timeline.
//
// Draws: the faint target arc as a guide curve across the full width; the
// ACHIEVED tension as a filled ribbon that should hug the target; a now-
// marker / playhead; chord annotations near the playhead (name + Roman +
// "why" tag); and the running CE trail. Architectural / score-like — no
// glow-bloom, no nebula.

import { PlacedChord } from "./engine";

// restrained "graphite on parchment" palette (dark register)
const COL = {
  bg: "#14130f",
  panel: "#1c1a14",
  ink: "#e9e4d6", // near-ivory ink
  inkSoft: "rgba(233,228,214,0.55)",
  inkFaint: "rgba(233,228,214,0.22)",
  grid: "rgba(233,228,214,0.10)",
  target: "rgba(233,228,214,0.40)", // dashed guide
  ribbon: "rgba(196,160,92,0.30)", // amber-ish fill
  ribbonLine: "#d8b774",
  accent: "#b48ead", // violet-ish accent (playhead)
  achievedOver: "#cf7f6b", // rose when over target
};

export interface RenderState {
  chords: PlacedChord[]; // all planned chords
  targetSamples: number[]; // dense target arc 0..1
  playhead: number; // 0..1 progress
  liveIndex: number; // index of currently sounding chord
  keyLabel: string;
  arcLabel: string;
  measures: { diameter: number; momentum: number; strain: number; tension: number };
}

export class RibbonRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D context unavailable");
    this.ctx = c;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private yFor(tension: number, top: number, height: number): number {
    // tension 0 at bottom, 1 at top
    return top + height * (1 - tension);
  }

  draw(s: RenderState): void {
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;

    // background
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, W, H);

    // chart area
    const padL = 56;
    const padR = 24;
    const padT = 28;
    const padB = 92;
    const top = padT;
    const left = padL;
    const cw = W - padL - padR;
    const ch = H - padT - padB;

    // horizontal grid + tension axis labels
    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, monospace";
    for (let i = 0; i <= 4; i++) {
      const v = i / 4;
      const y = this.yFor(v, top, ch);
      ctx.strokeStyle = COL.grid;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + cw, y);
      ctx.stroke();
      ctx.fillStyle = COL.inkFaint;
      ctx.fillText(v.toFixed(2), 12, y + 4);
    }
    // axis title
    ctx.save();
    ctx.translate(16, top + ch / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = COL.inkSoft;
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("tonal tension", 0, 0);
    ctx.restore();
    ctx.textAlign = "left";

    // target guide curve (dashed)
    const samples = s.targetSamples;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COL.target;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const x = left + (i / (samples.length - 1)) * cw;
      const y = this.yFor(samples[i], top, ch);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // achieved ribbon (filled area + top line)
    const chords = s.chords;
    if (chords.length > 1) {
      // filled ribbon from baseline
      ctx.beginPath();
      const baseY = this.yFor(0, top, ch);
      ctx.moveTo(left, baseY);
      for (let i = 0; i < chords.length; i++) {
        const x = left + chords[i].tNorm * cw;
        const y = this.yFor(chords[i].achieved.tension, top, ch);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(left + cw, baseY);
      ctx.closePath();
      ctx.fillStyle = COL.ribbon;
      ctx.fill();

      // top line, coloured rose where it overshoots the target
      ctx.lineWidth = 2;
      for (let i = 1; i < chords.length; i++) {
        const x0 = left + chords[i - 1].tNorm * cw;
        const y0 = this.yFor(chords[i - 1].achieved.tension, top, ch);
        const x1 = left + chords[i].tNorm * cw;
        const y1 = this.yFor(chords[i].achieved.tension, top, ch);
        const over =
          chords[i].achieved.tension - chords[i].target > 0.08;
        ctx.strokeStyle = over ? COL.achievedOver : COL.ribbonLine;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }

      // chord onset ticks + modulation marks
      for (let i = 0; i < chords.length; i++) {
        const c = chords[i];
        const x = left + c.tNorm * cw;
        const y = this.yFor(c.achieved.tension, top, ch);
        ctx.fillStyle = i <= s.liveIndex ? COL.ink : COL.inkFaint;
        ctx.beginPath();
        ctx.arc(x, y, i === s.liveIndex ? 4 : 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (c.modulated) {
          ctx.strokeStyle = COL.accent;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + ch);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // playhead
    const px = left + s.playhead * cw;
    ctx.strokeStyle = COL.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, top - 6);
    ctx.lineTo(px, top + ch + 6);
    ctx.stroke();
    // playhead cap
    ctx.fillStyle = COL.accent;
    ctx.beginPath();
    ctx.moveTo(px - 5, top - 6);
    ctx.lineTo(px + 5, top - 6);
    ctx.lineTo(px, top + 1);
    ctx.closePath();
    ctx.fill();

    // ── live chord annotation near the playhead ──
    const live = chords[s.liveIndex];
    if (live) {
      const boxW = 250;
      const boxH = 66;
      let bx = px + 10;
      if (bx + boxW > left + cw) bx = px - boxW - 10;
      const by = Math.max(top, this.yFor(live.achieved.tension, top, ch) - boxH - 10);
      ctx.fillStyle = "rgba(20,19,15,0.92)";
      ctx.strokeStyle = COL.inkFaint;
      ctx.lineWidth = 1;
      roundRect(ctx, bx, by, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = COL.ink;
      ctx.font = "600 15px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(`${live.name}`, bx + 12, by + 22);
      ctx.fillStyle = COL.accent;
      ctx.font = "13px ui-monospace, monospace";
      ctx.fillText(`${live.roman}`, bx + 12 + ctx.measureText(live.name).width + 12, by + 22);

      ctx.fillStyle = COL.inkSoft;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(live.why, bx + 12, by + 42);
      ctx.fillStyle = COL.inkFaint;
      ctx.fillText(
        `target ${live.target.toFixed(2)}  ·  got ${live.achieved.tension.toFixed(2)}`,
        bx + 12,
        by + 58,
      );
    }

    // ── bottom meters: the three live measures ──
    const m = s.measures;
    const meterY = top + ch + 30;
    const meters: Array<[string, number, string]> = [
      ["cloud diameter", m.diameter, COL.ribbonLine],
      ["cloud momentum", m.momentum, COL.accent],
      ["tensile strain", m.strain, COL.achievedOver],
    ];
    const meterW = (cw - 24) / 3;
    meters.forEach(([label, val, col], i) => {
      const mx = left + i * (meterW + 12);
      ctx.fillStyle = COL.inkSoft;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(`${label}`, mx, meterY - 6);
      ctx.fillStyle = COL.grid;
      ctx.fillRect(mx, meterY, meterW, 8);
      ctx.fillStyle = col;
      ctx.fillRect(mx, meterY, meterW * Math.min(1, val), 8);
      ctx.fillStyle = COL.ink;
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(val.toFixed(2), mx + meterW - 30, meterY - 6);
    });

    // header strip
    ctx.fillStyle = COL.inkSoft;
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(
      `${s.arcLabel}  ·  key ${s.keyLabel}  ·  blended tension ${m.tension.toFixed(2)}`,
      left + cw,
      top - 12,
    );
    ctx.textAlign = "left";
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
