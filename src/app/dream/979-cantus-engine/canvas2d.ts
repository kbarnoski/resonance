// canvas2d.ts — Canvas2D fallback for the scrolling piano-roll, used when
// WebGL2 is unavailable. Mirrors RollRenderer's model so the page can swap
// transparently.

import { RollNote, VOICE_COLORS } from "./gl";

export class RollRenderer2D {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  midiLow = 36;
  midiHigh = 84;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number) {
    const c = this.ctx.canvas;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    this.w = c.width;
    this.h = c.height;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  render(notes: RollNote[], nowBeat: number, windowBeats: number) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.fillStyle = "#141210";
    ctx.fillRect(0, 0, w, h);

    const range = this.midiHigh - this.midiLow;
    const toX = (beat: number) =>
      ((beat - (nowBeat - windowBeats)) / windowBeats) * w;
    const toY = (midi: number) =>
      h - ((midi - this.midiLow) / range) * h;
    const noteH = (h / range) * 0.8;

    // faint staff hairlines on octave C's
    ctx.strokeStyle = "rgba(255,245,230,0.06)";
    ctx.lineWidth = 1;
    for (let m = this.midiLow; m <= this.midiHigh; m++) {
      if (m % 12 === 0) {
        const y = toY(m);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }

    for (const n of notes) {
      if (n.startBeat + n.durBeats < nowBeat - windowBeats) continue;
      if (n.startBeat > nowBeat + 1) continue;
      const x0 = toX(n.startBeat);
      const x1 = toX(n.startBeat + n.durBeats);
      const c = VOICE_COLORS[Math.min(n.voice, VOICE_COLORS.length - 1)];
      const recency = 1 - Math.min(1, Math.abs(nowBeat - n.startBeat) / windowBeats);
      const a = 0.5 + 0.45 * recency;
      ctx.fillStyle = `rgba(${Math.round(c[0] * 255)},${Math.round(
        c[1] * 255,
      )},${Math.round(c[2] * 255)},${a})`;
      const y = toY(n.midi) - noteH / 2;
      ctx.fillRect(x0, y, Math.max(x1 - x0, 3), noteH);
    }

    // "now" line at the right edge
    ctx.strokeStyle = "rgba(255,245,230,0.18)";
    ctx.beginPath();
    ctx.moveTo(toX(nowBeat), 0);
    ctx.lineTo(toX(nowBeat), h);
    ctx.stroke();
  }

  dispose() {
    /* nothing to free */
  }
}
