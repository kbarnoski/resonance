// renderer.ts — a self-writing piano-roll in Canvas2D.
// Notes scroll right-to-left as the piece composes itself; a fixed playhead
// marks the present. pitch = y, time = x. Violet ramp + neutrals only.

import type { RenderNote, Voice } from "./audio";

const WINDOW_SEC = 13; // total time span visible
const PLAYHEAD_FRAC = 0.66; // where "now" sits across the canvas
const MIDI_LOW = 30;
const MIDI_HIGH = 96;

const VOICE_STYLE: Record<Voice, { fill: string; h: number }> = {
  // violet ramp: lead bright, pad dim, bass mid
  lead: { fill: "168,130,255", h: 7 },
  bass: { fill: "109,74,190", h: 5 },
  pad: { fill: "88,66,150", h: 4 },
};

export interface PianoRoll {
  frame: (now: number, events: readonly RenderNote[]) => void;
  resize: () => void;
  dispose: () => void;
}

export function createPianoRoll(canvas: HTMLCanvasElement): PianoRoll {
  const ctx = canvas.getContext("2d")!;
  let w = 0;
  let h = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  function midiToY(midi: number): number {
    const t = (midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW);
    return h - t * h;
  }

  function frame(now: number, events: readonly RenderNote[]) {
    // background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#08060f";
    ctx.fillRect(0, 0, w, h);

    const windowStart = now - WINDOW_SEC * PLAYHEAD_FRAC;
    const pxPerSec = w / WINDOW_SEC;
    const timeToX = (t: number) => (t - windowStart) * pxPerSec;

    // faint octave grid lines
    ctx.lineWidth = 1;
    for (let m = MIDI_LOW; m <= MIDI_HIGH; m += 12) {
      const y = midiToY(m);
      ctx.strokeStyle = "rgba(150,130,200,0.07)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // notes
    for (const e of events) {
      const x = timeToX(e.startTime);
      const wPx = Math.max(2, e.duration * pxPerSec - 1.5);
      if (x + wPx < 0 || x > w) continue;
      const style = VOICE_STYLE[e.voice];
      const y = midiToY(e.midi) - style.h / 2;

      // fade in the future, glow near the playhead, fade in the past
      const age = now - e.startTime; // >0 = already sounded
      let alpha: number;
      if (e.startTime > now) {
        alpha = 0.28; // upcoming, dim
      } else {
        alpha = Math.max(0.12, 0.95 - age / (WINDOW_SEC * 0.9));
      }
      const near = Math.abs(e.startTime - now) < 0.12 && e.voice === "lead";

      ctx.fillStyle = `rgba(${style.fill},${alpha})`;
      roundRect(ctx, x, y, wPx, style.h, 2);
      ctx.fill();

      if (near) {
        ctx.fillStyle = "rgba(210,190,255,0.9)";
        roundRect(ctx, x, y, wPx, style.h, 2);
        ctx.fill();
      }
    }

    // playhead
    const px = w * PLAYHEAD_FRAC;
    ctx.strokeStyle = "rgba(190,160,255,0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
    // soft glow along the playhead
    const grad = ctx.createLinearGradient(px - 20, 0, px + 4, 0);
    grad.addColorStop(0, "rgba(168,130,255,0)");
    grad.addColorStop(1, "rgba(168,130,255,0.16)");
    ctx.fillStyle = grad;
    ctx.fillRect(px - 20, 0, 24, h);
  }

  function dispose() {
    ctx.clearRect(0, 0, w, h);
  }

  return { frame, resize, dispose };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
