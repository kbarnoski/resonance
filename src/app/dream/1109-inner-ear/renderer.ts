/**
 * 1109 · Inner Ear — Canvas2D "gallery placard" renderer.
 *
 * Deliberately the opposite of the lab house style: warm paper-white ground,
 * ink-colored marks, museum-exhibit typography. Each illusion gets its own
 * clean diagram. No WebGL anywhere.
 */

import { InnerEarEngine, ToneEvent } from "./audio";
import {
  midiToFreq,
  ModeId,
  NOTE_NAMES,
  ZWICKER_CENTER,
  ZWICKER_NOTCH_HIGH,
  ZWICKER_NOTCH_LOW,
} from "./illusions";

const PAPER = "#f4efe6";
const PAPER_EDGE = "#e9e1d2";
const INK = "#2b2723";
const INK_SOFT = "#6f675c";
const BLUE = "#2f5da8"; // left ear
const RED = "#b0413a"; // right ear
const VIOLET = "#6a4ba0"; // what you probably hear
const GREEN = "#4a7a4a"; // calibration "up"
const ORANGE = "#c07a2b"; // calibration "down"

export interface CalibState {
  answers: (null | "up" | "down")[];
  current: number;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function drawBackground(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, w, h);
  // subtle inner placard frame
  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = 2;
  g.strokeRect(14, 14, w - 28, h - 28);
}

function caveat(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = INK_SOFT;
  g.font = "italic 13px Georgia, 'Times New Roman', serif";
  g.textAlign = "center";
  g.fillText(
    "“What you hear” is the typical right-hander model — a prediction, not a measurement.",
    w / 2,
    h - 26,
  );
  g.textAlign = "left";
}

// --- three-lane scrolling score (octave + scale) ---------------------------
const WINDOW = 4; // seconds visible
const NOW_FRAC = 0.34; // now-line position across the plot

function drawScore(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: InnerEarEngine,
  now: number,
  mode: ModeId,
): void {
  const laneDefs: { key: "L" | "R" | "P"; label: string; color: string }[] = [
    { key: "L", label: "Left ear · what the speaker sends", color: BLUE },
    { key: "R", label: "Right ear · what the speaker sends", color: RED },
    { key: "P", label: "What you probably hear", color: VIOLET },
  ];

  const top = 96;
  const bottom = h - 64;
  const laneGap = 16;
  const laneH = (bottom - top - laneGap * 2) / 3;
  const plotL = 150;
  const plotR = w - 40;
  const plotW = plotR - plotL;
  const nowX = plotL + plotW * NOW_FRAC;

  // frequency range for vertical mapping
  const fMin = mode === "octave" ? 360 : midiToFreq(58);
  const fMax = mode === "octave" ? 880 : midiToFreq(74);
  const lMin = Math.log2(fMin);
  const lMax = Math.log2(fMax);

  laneDefs.forEach((lane, li) => {
    const ly = top + li * (laneH + laneGap);
    // lane card
    g.fillStyle = "#fbf8f1";
    roundRect(g, plotL - 6, ly, plotW + 12, laneH, 10);
    g.fill();
    g.strokeStyle = PAPER_EDGE;
    g.lineWidth = 1;
    g.stroke();

    // label
    g.fillStyle = lane.color;
    g.font = "600 13px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "right";
    g.fillText(lane.label.split(" · ")[0], plotL - 14, ly + 18);
    g.fillStyle = INK_SOFT;
    g.font = "11px 'Helvetica Neue', Arial, sans-serif";
    const sub = lane.label.split(" · ")[1];
    if (sub) g.fillText(sub, plotL - 14, ly + 34);
    g.textAlign = "left";

    const yFor = (freq: number) => {
      const t = (Math.log2(freq) - lMin) / (lMax - lMin);
      return ly + laneH - 12 - t * (laneH - 24);
    };

    const evs = engine.events.filter(
      (e: ToneEvent) => e.lane === lane.key && e.start > now - WINDOW && e.start < now + WINDOW,
    );
    for (const e of evs) {
      const xs = nowX + ((e.start - now) / WINDOW) * plotW;
      const xe = nowX + ((e.end - now) / WINDOW) * plotW;
      const x = Math.max(plotL, xs);
      const wRect = Math.max(4, Math.min(plotR, xe) - x);
      if (xe < plotL || xs > plotR) continue;
      const y = yFor(e.freq);
      const active = now >= e.start && now <= e.end;
      g.globalAlpha = e.start > now ? 0.42 : 1;
      g.fillStyle = lane.color;
      roundRect(g, x, y - 5, wRect, 10, 5);
      g.fill();
      if (lane.key === "P" && e.side) {
        g.globalAlpha = 1;
        g.fillStyle = "#fbf8f1";
        g.font = "700 10px 'Helvetica Neue', Arial, sans-serif";
        g.textAlign = "center";
        g.fillText(e.side, x + wRect / 2, y + 3);
        g.textAlign = "left";
      }
      if (active && e.start <= now) {
        g.globalAlpha = 0.5;
        g.strokeStyle = INK;
        g.lineWidth = 1.5;
        roundRect(g, x - 1.5, y - 6.5, wRect + 3, 13, 6);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  });

  // now-line
  g.strokeStyle = "rgba(43,39,35,0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(nowX, top - 8);
  g.lineTo(nowX, bottom + 6);
  g.stroke();
  g.fillStyle = INK_SOFT;
  g.font = "10px 'Helvetica Neue', Arial, sans-serif";
  g.fillText("now", nowX + 4, top - 12);
}

// --- tritone paradox diagram ------------------------------------------------
function drawTritone(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: InnerEarEngine,
  now: number,
): void {
  const cx = w / 2;
  const cy = h / 2 - 6;
  const R = Math.min(w, h) * 0.24;

  // pitch-class dial
  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();

  const trials = engine.events.filter((e) => e.lane === "T");
  const activeNow = trials.find((e) => now >= e.start && now <= e.end);
  const recent = trials.slice(-2);

  for (let pc = 0; pc < 12; pc++) {
    const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R;
    const inPair = recent.some((e) => e.pc === pc);
    const isActive = activeNow?.pc === pc;
    g.beginPath();
    g.arc(px, py, isActive ? 11 : 7, 0, Math.PI * 2);
    g.fillStyle = isActive ? VIOLET : inPair ? "#c9bfae" : "#ddd4c4";
    g.fill();
    g.fillStyle = inPair ? INK : INK_SOFT;
    g.font = `${isActive ? "700 " : ""}13px 'Helvetica Neue', Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lx = cx + Math.cos(a) * (R + 22);
    const ly = cy + Math.sin(a) * (R + 22);
    g.fillText(NOTE_NAMES[pc], lx, ly);
  }
  g.textBaseline = "alphabetic";

  // connecting tritone chord
  if (recent.length === 2) {
    const [e1, e2] = recent;
    const a1 = ((e1.pc ?? 0) / 12) * Math.PI * 2 - Math.PI / 2;
    const a2 = ((e2.pc ?? 0) / 12) * Math.PI * 2 - Math.PI / 2;
    g.strokeStyle = "rgba(106,75,160,0.5)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    g.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R);
    g.stroke();
  }

  // big central "?"
  g.fillStyle = VIOLET;
  g.font = "700 64px Georgia, serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("?", cx, cy);
  g.textBaseline = "alphabetic";

  g.fillStyle = INK;
  g.font = "15px 'Helvetica Neue', Arial, sans-serif";
  g.textAlign = "center";
  g.fillText(
    "Ascending or descending? It depends on the listener.",
    cx,
    cy + R + 62,
  );
  g.textAlign = "left";
}

// --- Zwicker tone diagram ---------------------------------------------------
function drawZwicker(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: InnerEarEngine,
  now: number,
): void {
  const active = engine.events.find(
    (e) => e.lane === "Z" && now >= e.start && now <= e.end,
  );
  const inNoise = active ? now < (active.noiseEnd ?? 0) : false;

  const stripL = 90;
  const stripR = w - 90;
  const stripW = stripR - stripL;
  const baseY = h * 0.44;
  const stripH = 120;

  // spectrum strip
  g.fillStyle = "#fbf8f1";
  roundRect(g, stripL, baseY - stripH, stripW, stripH, 10);
  g.fill();
  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = 1;
  g.stroke();

  // frequency axis 0..3000 Hz (log-ish linear here for clarity)
  const fToX = (f: number) => stripL + (Math.min(f, 3000) / 3000) * stripW;
  const notchX1 = fToX(ZWICKER_NOTCH_LOW);
  const notchX2 = fToX(ZWICKER_NOTCH_HIGH);
  const centerX = fToX(ZWICKER_CENTER);

  if (inNoise) {
    // noise energy bars with a clear gap
    for (let x = stripL + 3; x < stripR - 3; x += 5) {
      const inGap = x > notchX1 && x < notchX2;
      if (inGap) continue;
      // deterministic pseudo-height from x so it shimmers but stays legible
      const hgt = 26 + 30 * (0.5 + 0.5 * Math.sin(x * 0.7 + now * 6));
      g.fillStyle = "rgba(47,93,168,0.5)";
      g.fillRect(x, baseY - 6 - hgt, 3, hgt);
    }
    // gap marker
    g.strokeStyle = RED;
    g.setLineDash([4, 4]);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(notchX1, baseY - stripH + 8);
    g.lineTo(notchX1, baseY - 6);
    g.moveTo(notchX2, baseY - stripH + 8);
    g.lineTo(notchX2, baseY - 6);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = RED;
    g.font = "12px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "center";
    g.fillText("notch: 600–1200 Hz removed", centerX, baseY - stripH - 8);
    g.fillStyle = INK;
    g.font = "15px 'Helvetica Neue', Arial, sans-serif";
    g.fillText("① Pink noise with a hole cut in it", (stripL + stripR) / 2, baseY + 34);
  } else if (active) {
    // silence + phantom tone rising at the notch center
    g.fillStyle = INK_SOFT;
    g.font = "13px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "center";
    g.fillText("silence (no signal)", (stripL + stripR) / 2, baseY - stripH / 2 - 6);

    const sinceSilence = now - (active.noiseEnd ?? now);
    const pulse = Math.max(0, 1 - sinceSilence / 2.4);
    const glow = 0.25 + 0.55 * pulse * (0.6 + 0.4 * Math.sin(now * 9));
    g.strokeStyle = `rgba(106,75,160,${glow})`;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(centerX, baseY - 12);
    g.lineTo(centerX, baseY - stripH + 14);
    g.stroke();
    g.fillStyle = VIOLET;
    g.font = "12px 'Helvetica Neue', Arial, sans-serif";
    g.fillText("phantom tone ≈ 850 Hz", centerX, baseY - stripH - 8);
    g.fillStyle = INK;
    g.font = "15px 'Helvetica Neue', Arial, sans-serif";
    g.fillText(
      "② …then the tone your brain adds in the silence",
      (stripL + stripR) / 2,
      baseY + 34,
    );
  }
  g.textAlign = "left";

  // timeline bar under the strip
  if (active) {
    const total = active.end - active.start;
    const tlL = stripL;
    const tlW = stripW;
    const tlY = baseY + 66;
    const noiseFrac = ((active.noiseEnd ?? active.start) - active.start) / total;
    g.fillStyle = "rgba(47,93,168,0.35)";
    roundRect(g, tlL, tlY, tlW * noiseFrac, 12, 3);
    g.fill();
    g.fillStyle = "rgba(106,75,160,0.22)";
    roundRect(g, tlL + tlW * noiseFrac, tlY, tlW * (1 - noiseFrac), 12, 3);
    g.fill();
    const px = tlL + ((now - active.start) / total) * tlW;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, tlY - 4);
    g.lineTo(px, tlY + 16);
    g.stroke();
    g.fillStyle = INK_SOFT;
    g.font = "11px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "left";
    g.fillText("noise", tlL + 2, tlY + 28);
    g.textAlign = "right";
    g.fillText("silence → phantom", tlR(tlL, tlW), tlY + 28);
    g.textAlign = "left";
  }
}
function tlR(l: number, w: number): number {
  return l + w - 2;
}

// --- calibration pitch-class circle ----------------------------------------
function drawCalibration(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  calib: CalibState,
): void {
  const cx = w / 2;
  const cy = h / 2 - 4;
  const R = Math.min(w, h) * 0.26;

  g.strokeStyle = PAPER_EDGE;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();

  for (let pc = 0; pc < 12; pc++) {
    const a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * R;
    const py = cy + Math.sin(a) * R;
    const ans = calib.answers[pc];
    const isCurrent = pc === calib.current;
    let fill = "#ddd4c4";
    if (ans === "up") fill = GREEN;
    else if (ans === "down") fill = ORANGE;
    g.beginPath();
    g.arc(px, py, isCurrent ? 13 : 9, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (isCurrent) {
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.stroke();
    }
    g.fillStyle = ans ? "#fbf8f1" : INK_SOFT;
    g.font = "700 11px 'Helvetica Neue', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(NOTE_NAMES[pc], px, py);
  }
  g.textBaseline = "alphabetic";

  const done = calib.answers.filter((a) => a !== null).length;
  g.fillStyle = INK;
  g.font = "700 22px Georgia, serif";
  g.textAlign = "center";
  g.fillText(`${done} / 12`, cx, cy - 6);
  g.font = "13px 'Helvetica Neue', Arial, sans-serif";
  g.fillStyle = INK_SOFT;
  g.fillText(done === 12 ? "your template" : "pairs judged", cx, cy + 16);

  // legend
  g.textAlign = "left";
  const ly = h - 58;
  g.fillStyle = GREEN;
  g.beginPath();
  g.arc(cx - 120, ly, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.font = "13px 'Helvetica Neue', Arial, sans-serif";
  g.fillText("heard rising", cx - 108, ly + 4);
  g.fillStyle = ORANGE;
  g.beginPath();
  g.arc(cx + 24, ly, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.fillText("heard falling", cx + 36, ly + 4);
}

// --- title + dispatch -------------------------------------------------------
export function drawFrame(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: InnerEarEngine,
  mode: ModeId,
  calib: CalibState,
): void {
  const now = engine.now();
  drawBackground(g, w, h);

  // title block
  const meta = {
    octave: ["Octave illusion", "Diana Deutsch · 1974"],
    scale: ["Scale illusion", "Diana Deutsch · 1975"],
    tritone: ["Tritone paradox", "Diana Deutsch · 1986"],
    zwicker: ["Zwicker tone", "Zwicker 1964 · phantom perception"],
    calibration: ["Your tritone template", "measure your own template"],
  }[mode];
  g.fillStyle = INK;
  g.font = "700 26px Georgia, 'Times New Roman', serif";
  g.textAlign = "left";
  g.fillText(meta[0], 40, 56);
  g.fillStyle = INK_SOFT;
  g.font = "13px 'Helvetica Neue', Arial, sans-serif";
  g.fillText(meta[1].toUpperCase(), 40, 76);

  if (mode === "octave" || mode === "scale") {
    drawScore(g, w, h, engine, now, mode);
    caveat(g, w, h);
  } else if (mode === "tritone") {
    drawTritone(g, w, h, engine, now);
  } else if (mode === "zwicker") {
    drawZwicker(g, w, h, engine, now);
  } else {
    drawCalibration(g, w, h, calib);
  }
}
