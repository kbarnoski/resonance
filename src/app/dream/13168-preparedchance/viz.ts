// ─────────────────────────────────────────────────────────────────────────────
// viz.ts — the Canvas2D "prepared-strings schematic" + scrolling time-lane.
//
// Palette: graphite / paper / ink. A near-black ground, warm off-white lines,
// and one restrained violet reserved for the moment chance fires. Raw hex lives
// only here, in the canvas-art layer, per house rules.
//
// Top band  — the struck string vibrating, its little preparation-object glyph,
//             and the tossed hexagram rising line-by-line with its verdict.
// Bottom band— a time-lane scrolling left: each note's written onset, an arrow
//             to where chance re-placed it, and its landing mark (violet if the
//             oracle touched it, a hollow ring if it was silenced).
// ─────────────────────────────────────────────────────────────────────────────

import type { Preparation } from "./strings";
import type { ChanceOp } from "./chance";

const BG = "#0e0d10";
const PAPER = "#e9e4d6"; // warm off-white — the "written" ink
const INK = "#8f8c81"; // mid graphite
const FAINT = "#33322e"; // faint rule
const VIOLET = "#8f6bff"; // the one accent: chance fired
const VIOLET_DIM = "#5b47a6";

export interface StringState {
  active: boolean;
  startFrame: number;
  freq: number;
  prep: Preparation;
  amp: number;
}

export interface TossState {
  active: boolean;
  startFrame: number;
  hexagram: number[];
  op: ChanceOp;
  touched: boolean;
  label: string;
}

export interface LaneEvent {
  origFrame: number;
  playFrame: number;
  y: number; // 0..1 normalised pitch
  touched: boolean;
  op: ChanceOp;
  muted: boolean;
  doubled: boolean;
  doubleY: number;
  hexagram: number[];
}

export interface VizState {
  frame: number;
  beatFrames: number;
  pxPerFrame: number;
  events: LaneEvent[];
  str: StringState;
  toss: TossState;
  chanceAmount: number;
  started: boolean;
}

function monoLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  g.font = "600 10px ui-monospace, monospace";
  g.fillStyle = color;
  g.textBaseline = "alphabetic";
  // simulate letter-spacing for the uppercase mono labels
  let cx = x;
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + 2.2;
  }
}

// ── preparation-object glyphs ────────────────────────────────────────────────
function drawPrepGlyph(
  g: CanvasRenderingContext2D,
  prep: Preparation,
  x: number,
  y: number,
  color: string,
) {
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.4;
  if (prep === "felt") {
    // a soft felt pad straddling the string
    g.globalAlpha = 0.5;
    g.fillRect(x - 7, y - 5, 14, 10);
    g.globalAlpha = 1;
    g.strokeRect(x - 7, y - 5, 14, 10);
  } else if (prep === "bolt") {
    // a screw: head + slot + a couple of threads
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(x - 3.5, y);
    g.lineTo(x + 3.5, y);
    g.stroke();
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(x - 4, y + 7 + i * 3);
      g.lineTo(x + 4, y + 8 + i * 3);
      g.stroke();
    }
  } else if (prep === "harmonic") {
    // a triangle touching the string at the node
    g.beginPath();
    g.moveTo(x, y - 8);
    g.lineTo(x - 5, y + 1);
    g.lineTo(x + 5, y + 1);
    g.closePath();
    g.stroke();
  } else {
    // detune: two offset ticks — a chorusing pair
    g.beginPath();
    g.moveTo(x - 4, y - 6);
    g.lineTo(x - 4, y + 6);
    g.moveTo(x + 4, y - 6);
    g.lineTo(x + 4, y + 6);
    g.stroke();
  }
  g.globalAlpha = 1;
}

// ── hexagram (6 stacked yin/yang lines, drawn bottom-to-top) ─────────────────
function drawHexagram(
  g: CanvasRenderingContext2D,
  hex: number[],
  x: number,
  yBottom: number,
  lineW: number,
  gap: number,
  reveal: number, // 0..6, how many lines are shown yet
  scale: number,
) {
  for (let i = 0; i < 6; i++) {
    if (i >= reveal) break;
    const v = hex[i];
    const y = yBottom - i * gap;
    const moving = v === 6 || v === 9;
    const yang = v === 7 || v === 9;
    g.strokeStyle = moving ? VIOLET : PAPER;
    g.lineWidth = Math.max(1, 2 * scale);
    if (yang) {
      g.beginPath();
      g.moveTo(x - lineW / 2, y);
      g.lineTo(x + lineW / 2, y);
      g.stroke();
    } else {
      const seg = lineW * 0.4;
      g.beginPath();
      g.moveTo(x - lineW / 2, y);
      g.lineTo(x - lineW / 2 + seg, y);
      g.moveTo(x + lineW / 2 - seg, y);
      g.lineTo(x + lineW / 2, y);
      g.stroke();
    }
    // moving-line mark: a small ring, the changing line that drives the verdict
    if (moving) {
      g.fillStyle = VIOLET;
      g.beginPath();
      g.arc(x, y, Math.max(1.3, 1.8 * scale), 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ── top band: prepared-string schematic + coin toss ──────────────────────────
function drawSchematic(g: CanvasRenderingContext2D, w: number, bandH: number, s: VizState) {
  const stringY = bandH * 0.52;
  const x0 = w * 0.08;
  const x1 = w * 0.62;
  const nodeX = x0 + (x1 - x0) * 0.34;

  monoLabel(g, "PREPARED STRING", x0, 22, INK);

  // vibration envelope
  const st = s.str;
  let env = 0;
  let modes = 1;
  if (st.active) {
    const el = s.frame - st.startFrame;
    env = Math.exp(-el / 26) * st.amp;
    modes = st.prep === "harmonic" ? 3 : st.prep === "detune" ? 2 : 1;
    if (env < 0.01) env = 0;
  }

  // the string as a standing wave
  g.strokeStyle = env > 0 ? PAPER : INK;
  g.lineWidth = 1.4;
  g.beginPath();
  const el = st.active ? s.frame - st.startFrame : 0;
  const timePhase = Math.cos(el * 0.9);
  for (let x = x0; x <= x1; x += 3) {
    const t = (x - x0) / (x1 - x0);
    const disp = env * 14 * Math.sin(modes * Math.PI * t) * timePhase;
    const y = stringY + disp;
    if (x === x0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();

  // string anchors
  g.fillStyle = INK;
  for (const ax of [x0, x1]) {
    g.fillRect(ax - 2, stringY - 7, 4, 14);
  }

  // the preparation object wedged on the string
  drawPrepGlyph(g, st.prep, nodeX, stringY, env > 0 ? PAPER : INK);
  monoLabel(g, st.prep.toUpperCase(), nodeX - 14, stringY + 30, INK);

  // ── coin toss / hexagram on the right ──
  const hexX = w * 0.8;
  const hexBottom = bandH * 0.78;
  const gap = 12;
  monoLabel(g, "CHANCE", w * 0.72, 22, INK);

  const toss = s.toss;
  if (toss.active && toss.hexagram.length === 6) {
    const el2 = s.frame - toss.startFrame;
    const reveal = Math.min(6, Math.floor(el2 / 6) + 1);
    drawHexagram(g, toss.hexagram, hexX, hexBottom, 46, gap, reveal, 1);

    // three tumbling coins while the lines are still landing
    if (reveal < 6) {
      for (let i = 0; i < 3; i++) {
        const cy = 40 + i * 16;
        const wobble = Math.sin(el2 * 0.6 + i * 2) * 6;
        g.strokeStyle = INK;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(hexX + wobble, cy, 6, 3 + Math.abs(Math.cos(el2 * 0.6 + i)) * 3, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // the verdict label under the hexagram
    const vColor = toss.touched ? VIOLET : INK;
    monoLabel(g, toss.label.toUpperCase(), hexX - 30, hexBottom + 22, vColor);
  } else {
    // resting oracle — a faint empty frame
    g.strokeStyle = FAINT;
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = hexBottom - i * gap;
      g.beginPath();
      g.moveTo(hexX - 23, y);
      g.lineTo(hexX + 23, y);
      g.stroke();
    }
    monoLabel(g, "WAITING", hexX - 26, hexBottom + 22, FAINT);
  }
}

// ── bottom band: the scrolling time-lane ─────────────────────────────────────
function drawLane(g: CanvasRenderingContext2D, w: number, top: number, h: number, s: VizState) {
  const padY = 26;
  const laneTop = top + padY;
  const laneBot = h - padY - 14;
  const nowX = w * 0.8;
  const yFor = (n: number) => laneBot - n * (laneBot - laneTop);

  // frame -> x (newest at nowX, scrolling left)
  const xFor = (f: number) => nowX - (s.frame - f) * s.pxPerFrame;

  monoLabel(g, "TIME-LANE", w * 0.08, top + 16, INK);
  monoLabel(g, "NOW", nowX + 6, top + 16, INK);

  // faint beat grid scrolling with time
  g.strokeStyle = FAINT;
  g.lineWidth = 1;
  const beatPx = s.beatFrames * s.pxPerFrame;
  const phase = (s.frame * s.pxPerFrame) % beatPx;
  for (let x = nowX - phase; x > w * 0.04; x -= beatPx) {
    g.beginPath();
    g.moveTo(x, laneTop - 6);
    g.lineTo(x, laneBot + 6);
    g.stroke();
  }

  // now-playhead
  g.strokeStyle = VIOLET_DIM;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(nowX, laneTop - 10);
  g.lineTo(nowX, laneBot + 10);
  g.stroke();

  for (const ev of s.events) {
    const xOrig = xFor(ev.origFrame);
    const xPlay = xFor(ev.playFrame);
    if (xPlay < w * 0.02 && xOrig < w * 0.02) continue;
    const y = yFor(ev.y);

    // the "written" onset — a faint tick where the player struck
    g.strokeStyle = INK;
    g.globalAlpha = 0.5;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(xOrig, y - 5);
    g.lineTo(xOrig, y + 5);
    g.stroke();
    g.globalAlpha = 1;

    // displacement arrow orig -> played
    if (ev.playFrame !== ev.origFrame) {
      g.strokeStyle = VIOLET;
      g.globalAlpha = 0.7;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xOrig, y);
      g.lineTo(xPlay - 4, y);
      g.stroke();
      g.beginPath();
      g.moveTo(xPlay - 4, y - 2.5);
      g.lineTo(xPlay, y);
      g.lineTo(xPlay - 4, y + 2.5);
      g.stroke();
      g.globalAlpha = 1;
    }

    // transpose tie: a faint slur from written pitch height to played height is
    // implicit (orig tick sits at the played y already after transpose), so we
    // mark transposed notes with a small caret instead.

    // the landing mark
    if (ev.muted) {
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(xPlay, y, 4, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(xPlay - 3, y - 3);
      g.lineTo(xPlay + 3, y + 3);
      g.stroke();
    } else {
      const col = ev.touched ? VIOLET : PAPER;
      g.fillStyle = col;
      g.beginPath();
      g.arc(xPlay, y, 3.4, 0, Math.PI * 2);
      g.fill();
      if (ev.touched) {
        g.strokeStyle = VIOLET;
        g.globalAlpha = 0.4;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(xPlay, y, 7, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    // the doubled voice
    if (ev.doubled) {
      const yd = yFor(ev.doubleY);
      g.fillStyle = VIOLET;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.arc(xPlay, yd, 2.6, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.35;
      g.strokeStyle = VIOLET;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xPlay, y);
      g.lineTo(xPlay, yd);
      g.stroke();
      g.globalAlpha = 1;
    }

    // a miniature hexagram floating above touched notes
    if (ev.touched && ev.hexagram.length === 6 && xPlay > w * 0.05) {
      drawHexagram(g, ev.hexagram, xPlay, y - 12, 10, 2.6, 6, 0.55);
    }
  }
}

/** Paint the whole scene for one frame. `w`/`h` are CSS pixels. */
export function renderScene(g: CanvasRenderingContext2D, w: number, h: number, s: VizState) {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);

  const bandH = h * 0.42;
  drawSchematic(g, w, bandH, s);

  // divider
  g.strokeStyle = FAINT;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(w * 0.04, bandH);
  g.lineTo(w * 0.96, bandH);
  g.stroke();

  drawLane(g, w, bandH, h, s);

  if (!s.started) {
    monoLabel(g, "SEEDED DEMO · MUTED · PLAY OR PRESS A KEY", w * 0.08, h - 8, VIOLET_DIM);
  }
}
