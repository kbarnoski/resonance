/**
 * Canvas2D renderer for `6664-cohere` — no SVG, no WebGL, no WebGPU.
 *
 * Draws the shared harmonic field, the two glowing presences, and the "bond"
 * between them that visualizes the interval they are forming: taut and
 * magenta-hot when they strain apart, soft and violet-fused when they draw
 * together. Both presences are always visible; the sound visibly tracks both.
 */

import type { Chord, Orb } from "./audio";
import { mulberry32 } from "./net";

export interface DrawState {
  you: Orb;
  partner: Orb;
  chord: Chord;
  timeMs: number;
  connected: boolean;
  audioOn: boolean;
}

const VIOLET_950 = "#0b0713";
const VIOLET_900 = "#150c26";
const YOU_HUE = { r: 167, g: 139, b: 250 }; // violet-400
const PARTNER_HUE = { r: 99, g: 102, b: 241 }; // indigo
const MAGENTA = { r: 176, g: 67, b: 224 };

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rgba(c: { r: number; g: number; b: number }, a: number): string {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export interface Renderer {
  resize(): void;
  draw(state: DrawState): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2D unavailable");
  const g = ctx;

  let w = 0;
  let h = 0;
  let field = { x: 0, y: 0, s: 0 }; // square play-field inset

  const rng = mulberry32(0x57a5);
  const stars: Star[] = Array.from({ length: 90 }, () => ({
    x: rng(),
    y: rng(),
    r: 0.4 + rng() * 1.3,
    tw: rng() * Math.PI * 2,
  }));

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(w, h) * 0.82;
    field = { x: (w - s) / 2, y: (h - s) / 2, s };
  }

  const toPx = (o: Orb) => ({
    x: field.x + o.x * field.s,
    y: field.y + o.y * field.s,
  });

  function drawBackground(state: DrawState): void {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, VIOLET_900);
    bg.addColorStop(1, VIOLET_950);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Faint starfield for depth.
    const tw = state.timeMs * 0.001;
    for (const s of stars) {
      const a = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(tw + s.tw));
      g.fillStyle = rgba({ r: 200, g: 190, b: 255 }, a);
      g.beginPath();
      g.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      g.fill();
    }

    // The field: register bands (horizontal) + circle-of-fifths ring guide.
    const { x, y, s } = field;
    g.save();
    g.globalAlpha = 0.5;
    for (let i = 0; i <= 4; i++) {
      const yy = y + (i / 4) * s;
      g.strokeStyle = rgba({ r: 90, g: 80, b: 140 }, 0.12);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + s, yy);
      g.stroke();
    }
    // Central resonance ring, brightness swells with proximity (bloom).
    const cx = x + s / 2;
    const cy = y + s / 2;
    const ring = g.createRadialGradient(cx, cy, s * 0.02, cx, cy, s * 0.52);
    const bloom = state.chord.proximity;
    ring.addColorStop(0, rgba({ r: 160, g: 130, b: 250 }, 0.06 + bloom * 0.1));
    ring.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = ring;
    g.fillRect(x, y, s, s);
    g.restore();
  }

  function drawBond(state: DrawState, ay: { x: number; y: number }, bp: { x: number; y: number }): void {
    const { chord, timeMs } = state;
    // Bond color: violet (consonant / close) → magenta (tense / far).
    const mix = Math.max(chord.strain, chord.tense ? 0.55 : 0);
    const col = {
      r: lerp(YOU_HUE.r, MAGENTA.r, mix),
      g: lerp(YOU_HUE.g, MAGENTA.g, mix),
      b: lerp(YOU_HUE.b, MAGENTA.b, mix),
    };

    const mx = (ay.x + bp.x) / 2;
    const my = (ay.y + bp.y) / 2;
    const dx = bp.x - ay.x;
    const dy = bp.y - ay.y;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular sag: taut (straight) when far/strained, slack when close.
    const nx = -dy / len;
    const ny = dx / len;
    const vib = Math.sin(timeMs * 0.006) * chord.strain * 10;
    const sag = lerp(26, 4, chord.strain) + vib;
    const cxp = mx + nx * sag;
    const cyp = my + ny * sag;

    // Under-glow.
    g.save();
    g.lineCap = "round";
    g.strokeStyle = rgba(col, 0.16);
    g.lineWidth = lerp(3, 10, chord.proximity);
    g.beginPath();
    g.moveTo(ay.x, ay.y);
    g.quadraticCurveTo(cxp, cyp, bp.x, bp.y);
    g.stroke();

    // Core thread — brighter, thinner as it strains taut.
    g.strokeStyle = rgba(col, 0.5 + chord.strain * 0.3);
    g.lineWidth = lerp(2.4, 1.1, chord.strain);
    g.beginPath();
    g.moveTo(ay.x, ay.y);
    g.quadraticCurveTo(cxp, cyp, bp.x, bp.y);
    g.stroke();

    // Traveling motes along the bond — carry the interval between presences.
    const motes = 5;
    for (let i = 0; i < motes; i++) {
      const tt = ((timeMs * 0.00016 + i / motes) % 1 + 1) % 1;
      const it = 1 - tt;
      const px = it * it * ay.x + 2 * it * tt * cxp + tt * tt * bp.x;
      const py = it * it * ay.y + 2 * it * tt * cyp + tt * tt * bp.y;
      g.fillStyle = rgba(col, 0.5 * (0.4 + 0.6 * Math.sin(tt * Math.PI)));
      g.beginPath();
      g.arc(px, py, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawOrb(
    p: { x: number; y: number },
    hue: { r: number; g: number; b: number },
    energy: number,
    pulse: number,
    label: string,
  ): void {
    const base = field.s * 0.05;
    const radius = base * (1 + energy * 0.5) * (1 + pulse * 0.08);

    const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.4);
    glow.addColorStop(0, rgba(hue, 0.9));
    glow.addColorStop(0.25, rgba(hue, 0.45));
    glow.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(p.x, p.y, radius * 3.4, 0, Math.PI * 2);
    g.fill();

    // Bright core.
    g.fillStyle = rgba({ r: 255, g: 250, b: 255 }, 0.95);
    g.beginPath();
    g.arc(p.x, p.y, radius * 0.42, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = rgba(hue, 0.9);
    g.beginPath();
    g.arc(p.x, p.y, radius * 0.7, 0, Math.PI * 2);
    g.globalAlpha = 0.5;
    g.fill();
    g.globalAlpha = 1;

    g.font = "600 10px ui-monospace, monospace";
    g.fillStyle = rgba(hue, 0.85);
    g.textAlign = "center";
    g.fillText(label, p.x, p.y + radius * 3.4 + 12);
  }

  function draw(state: DrawState): void {
    if (!w || !h) resize();
    drawBackground(state);

    const you = toPx(state.you);
    const partner = toPx(state.partner);
    drawBond(state, you, partner);

    const bloom = state.chord.proximity;
    const pulse = 0.5 + 0.5 * Math.sin(state.timeMs * 0.004);
    drawOrb(partner, state.connected ? PARTNER_HUE : PARTNER_HUE, 0.4 + bloom * 0.4, pulse, state.connected ? "PARTNER" : "GHOST");
    drawOrb(you, YOU_HUE, 0.5 + bloom * 0.4, pulse, "YOU");

    // Subtle chord label centered under the field.
    g.font = "500 12px ui-monospace, monospace";
    g.fillStyle = "rgba(196,181,253,0.5)";
    g.textAlign = "center";
    g.fillText(
      state.chord.chordName,
      field.x + field.s / 2,
      field.y + field.s + 22,
    );
    if (!state.audioOn) {
      g.fillStyle = "rgba(196,181,253,0.35)";
      g.fillText("press Start to hear it", field.x + field.s / 2, field.y - 14);
    }
  }

  return { resize, draw, dispose: () => {} };
}
