// 8488-secondear — the taste-space MAP renderer.
//
// This is a LEGIBLE DIAGRAM, not a particle cloud: a 2-D feature plane
// (rhythmic density × register) with a soft inferred "taste field", axes,
// labeled glyphs at each phrase's coordinates, and a thin drift trail showing
// proposals migrating toward the taste region. Palette is a deliberate
// warm graphite-ink + amber-ledger scheme — off the lab's violet default.
// Raw hex here is the ART layer, which house style preserves.

import { predict, AXIS_X, AXIS_Y, type TasteModel } from "./taste";

// ── warm graphite / amber ledger palette (art layer only) ──
const INK_BG = "#17130d";
const INK_PANEL = "#1e1913";
const INK_LINE = "#3a3123";
const INK_TEXT = "#b7a884";
const INK_FAINT = "#6f6551";
const AMBER = "#e6a63a";
const AMBER_HI = "#f6cf76";
const AMBER_DIM = "#8a6a2e";
const COOL = "#4a5a66"; // the "not-you" side of the field

export interface Glyph {
  x: number; // density feature 0..1
  y: number; // register feature 0..1
  state: "current" | "kept" | "passed";
  bold: boolean;
  age: number; // frames since placed
}

export interface Scene {
  glyphs: Glyph[];
  trail: { x: number; y: number }[];
  model: TasteModel;
  phase: number; // 0..1 pulse for the current proposal
  reduced: boolean;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function drawScene(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  scene: Scene,
): void {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = INK_BG;
  g.fillRect(0, 0, W, H);

  const m = Math.min(W, H);
  const padL = Math.max(48, m * 0.11);
  const padR = Math.max(24, m * 0.06);
  const padT = Math.max(36, m * 0.09);
  const padB = Math.max(44, m * 0.1);
  const px = padL;
  const py = padT;
  const pw = W - padL - padR;
  const ph = H - padT - padB;

  const toX = (fx: number) => px + fx * pw;
  const toY = (fy: number) => py + (1 - fy) * ph; // register high = top

  // panel
  g.fillStyle = INK_PANEL;
  g.fillRect(px, py, pw, ph);

  // ── inferred taste field: predicted keep-probability sliced through the
  //    running feature mean, varied only along the two map axes ──
  const N = scene.reduced ? 16 : 26;
  const cw = pw / N;
  const ch = ph / N;
  const base = scene.model.mean.slice();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const fx = (i + 0.5) / N;
      const fy = (j + 0.5) / N;
      const probe = base.slice();
      probe[AXIS_X] = fx;
      probe[AXIS_Y] = fy;
      const p = predict(scene.model, probe);
      const d = p - 0.5;
      if (Math.abs(d) < 0.015) continue;
      if (d > 0) {
        g.fillStyle = AMBER;
        g.globalAlpha = Math.min(0.5, d * 0.9);
      } else {
        g.fillStyle = COOL;
        g.globalAlpha = Math.min(0.32, -d * 0.7);
      }
      g.fillRect(px + i * cw, py + j * ch, cw + 1, ch + 1);
    }
  }
  g.globalAlpha = 1;

  // ── grid ──
  g.strokeStyle = INK_LINE;
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k <= 4; k++) {
    const gx = px + (k / 4) * pw;
    const gy = py + (k / 4) * ph;
    g.moveTo(gx, py);
    g.lineTo(gx, py + ph);
    g.moveTo(px, gy);
    g.lineTo(px + pw, gy);
  }
  g.stroke();

  // panel frame
  g.strokeStyle = INK_FAINT;
  g.strokeRect(px, py, pw, ph);

  // ── drift trail (proposals migrating toward the taste region) ──
  if (scene.trail.length > 1) {
    g.strokeStyle = AMBER_DIM;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.55;
    g.beginPath();
    for (let i = 0; i < scene.trail.length; i++) {
      const t = scene.trail[i];
      const X = toX(t.x);
      const Y = toY(t.y);
      if (i === 0) g.moveTo(X, Y);
      else g.lineTo(X, Y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  // ── glyphs: little notation marks placed at feature coordinates ──
  for (const gl of scene.glyphs) {
    const X = toX(gl.x);
    const Y = toY(gl.y);
    if (gl.state === "passed") {
      g.strokeStyle = INK_FAINT;
      g.globalAlpha = Math.max(0.12, 0.5 - gl.age * 0.004);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(X, Y, gl.bold ? 6 : 4, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    } else if (gl.state === "kept") {
      const r = gl.bold ? 7 : 5;
      g.fillStyle = AMBER;
      g.globalAlpha = 0.9;
      // stem + notehead: reads as a kept phrase anchored on the plane
      g.fillRect(X + r - 1, Y - r * 2.4, 1.6, r * 2.4);
      g.beginPath();
      g.ellipse(X, Y, r, r * 0.78, -0.35, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.22;
      g.beginPath();
      g.arc(X, Y, r + 4, 0, Math.PI * 2);
      g.fillStyle = AMBER_HI;
      g.fill();
      g.globalAlpha = 1;
    }
  }

  // current proposal on top — highlighted crosshair + label
  const cur = scene.glyphs.find((gl) => gl.state === "current");
  if (cur) {
    const X = toX(cur.x);
    const Y = toY(cur.y);
    const pulse = scene.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(scene.phase * Math.PI * 2);
    g.strokeStyle = AMBER_HI;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(X, Y, lerp(9, 15, pulse), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 0.4;
    g.beginPath();
    g.moveTo(X - 20, Y);
    g.lineTo(X + 20, Y);
    g.moveTo(X, Y - 20);
    g.lineTo(X, Y + 20);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = AMBER_HI;
    g.beginPath();
    g.arc(X, Y, 3, 0, Math.PI * 2);
    g.fill();

    g.font = "600 11px ui-monospace, monospace";
    g.fillStyle = INK_TEXT;
    g.textBaseline = "bottom";
    g.fillText(cur.bold ? "IS THIS YOU?" : "proposal", X + 16, Y - 12);
  }

  // ── axis labels ──
  g.fillStyle = INK_TEXT;
  g.font = "600 11px ui-monospace, monospace";
  g.textBaseline = "top";
  g.fillText("RHYTHMIC DENSITY →", px, py + ph + 14);
  g.save();
  g.translate(px - 30, py + ph);
  g.rotate(-Math.PI / 2);
  g.textBaseline = "top";
  g.fillText("REGISTER →", 0, 0);
  g.restore();

  g.fillStyle = INK_FAINT;
  g.font = "10px ui-monospace, monospace";
  g.textBaseline = "top";
  g.fillText("taste-space map", px, py - 18);
}
