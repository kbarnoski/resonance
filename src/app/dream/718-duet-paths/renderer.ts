// renderer.ts — Canvas2D horizontally-flowing piano-roll "river".
// Rounded note-bars flow right-to-left past a vertical now-line.
// Human notes warm (amber/rose); shadow grains cool (cyan/violet).
// No per-frame React; the page mutates these refs and calls drawRiver().

export type Voice = "human" | "shadow";

export interface RiverNote {
  /** MIDI pitch -> vertical position. */
  midi: number;
  /** AudioContext time the note started (seconds). */
  startT: number;
  /** Length in seconds (may grow while held). */
  durT: number;
  voice: Voice;
  /** 0..1 velocity-ish, scales height/brightness. */
  vel: number;
  /** True while a held human key is still down (bar keeps growing). */
  live: boolean;
}

const MIDI_LO = 36; // C2
const MIDI_HI = 88; // E6
const SECONDS_VISIBLE = 6; // window width in time

function midiToY(midi: number, h: number): number {
  const t = (midi - MIDI_LO) / (MIDI_HI - MIDI_LO);
  const clamped = Math.max(0, Math.min(1, t));
  // higher pitch -> higher on screen
  return h - (0.08 * h + clamped * 0.84 * h);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw one frame. `now` is the current AudioContext time; notes flow so that
 * `now` sits on the vertical now-line near the right edge.
 */
export function drawRiver(
  ctx: CanvasRenderingContext2D,
  notes: RiverNote[],
  now: number,
  w: number,
  h: number,
  bound: number, // 0..1 binding-pad intensity, animates background glow
) {
  ctx.clearRect(0, 0, w, h);

  // Background gradient.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0a0a12");
  bg.addColorStop(1, "#06060c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Faint horizontal pitch-class guide lines (octave Cs).
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let m = 36; m <= MIDI_HI; m += 12) {
    const y = midiToY(m, h);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const nowX = w * 0.82; // now-line position
  const pxPerSec = (w * 0.82) / SECONDS_VISIBLE;

  // Soft binding-pad glow behind the now-line.
  const glow = ctx.createRadialGradient(nowX, h / 2, 10, nowX, h / 2, h * 0.7);
  const a = 0.04 + bound * 0.06;
  glow.addColorStop(0, `rgba(140,120,255,${a})`);
  glow.addColorStop(1, "rgba(140,120,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // Note bars.
  for (const n of notes) {
    const dur = n.live ? Math.max(n.durT, now - n.startT) : n.durT;
    const endT = n.startT + dur;
    // x position: time relative to now, scrolling left.
    const xEnd = nowX - (now - endT) * pxPerSec;
    const xStart = nowX - (now - n.startT) * pxPerSec;
    const barW = Math.max(6, xStart - xEnd);
    const xLeft = xEnd;
    if (xLeft > w || xLeft + barW < 0) continue;

    const y = midiToY(n.midi, h);
    const barH = 7 + n.vel * 9;

    const onLine = xLeft <= nowX && xLeft + barW >= nowX;

    if (n.voice === "human") {
      // warm amber -> rose
      const g = ctx.createLinearGradient(xLeft, 0, xLeft + barW, 0);
      g.addColorStop(0, `rgba(251,191,120,${0.55 + n.vel * 0.35})`);
      g.addColorStop(1, `rgba(251,146,160,${0.55 + n.vel * 0.35})`);
      ctx.fillStyle = g;
      if (onLine) {
        ctx.shadowColor = "rgba(251,191,120,0.7)";
        ctx.shadowBlur = 16;
      }
    } else {
      // cool cyan -> violet
      const g = ctx.createLinearGradient(xLeft, 0, xLeft + barW, 0);
      g.addColorStop(0, `rgba(103,232,249,${0.5 + n.vel * 0.35})`);
      g.addColorStop(1, `rgba(167,139,250,${0.5 + n.vel * 0.35})`);
      ctx.fillStyle = g;
      if (onLine) {
        ctx.shadowColor = "rgba(167,139,250,0.7)";
        ctx.shadowBlur = 16;
      }
    }
    roundRect(ctx, xLeft, y - barH / 2, barW, barH, barH / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Now-line.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nowX, 0);
  ctx.lineTo(nowX, h);
  ctx.stroke();

  // Now-line cap labels.
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText("now", nowX + 6, 16);
}

export { MIDI_LO, MIDI_HI };
