// viz.ts — the almanac / clock-dial page, drawn in Canvas2D.
//
// A turning day-dial: eight canonical hours set around a ring, a sun/moon that
// travels the dial as the piece plays, a progress arc for the elapsed day, and
// a drifting cloud of grain-motes around the sun whose count tracks granular
// density and whose brightness tracks the live audio level. The whole page is a
// high-key pastel dawn→dusk gradient that slowly shifts with the hour — bright
// and airy, dark ink text for contrast, deliberately not a jewel-on-dark field.

import { HOURS } from "./arc";
import type { ArcState } from "./arc";

type RGB = [number, number, number];

// Per-hour background gradient stops (top, bottom) — high-key pastels.
const SKY: { top: RGB; bottom: RGB }[] = [
  { top: [207, 201, 230], bottom: [233, 228, 242] }, // matins  — lavender-grey
  { top: [247, 224, 201], bottom: [251, 238, 222] }, // lauds   — cream/peach
  { top: [246, 236, 201], bottom: [251, 246, 226] }, // prime   — pale gold
  { top: [214, 236, 223], bottom: [238, 247, 240] }, // terce   — green-blue
  { top: [205, 227, 243], bottom: [232, 242, 250] }, // sext    — noon blue
  { top: [240, 230, 205], bottom: [247, 240, 223] }, // none    — warm amber
  { top: [240, 210, 213], bottom: [246, 229, 229] }, // vespers — dusty rose
  { top: [216, 207, 228], bottom: [230, 223, 238] }, // compline— lavender dusk
];

const INK: RGB = [52, 49, 74];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function css(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;
}

interface Mote {
  ang: number; // orbital angle around the sun
  rad: number; // orbital radius factor 0..1
  speed: number;
  size: number;
  phase: number;
}

export class AlmanacViz {
  private canvas: HTMLCanvasElement;
  private cx2d: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private motes: Mote[] = [];
  private t = 0;
  center: { x: number; y: number; r: number } = { x: 0, y: 0, r: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.cx2d = ctx;
    for (let i = 0; i < 96; i++) {
      this.motes.push({
        ang: Math.random() * Math.PI * 2,
        rad: 0.15 + Math.random() * 0.85,
        speed: (Math.random() * 0.4 + 0.15) * (Math.random() < 0.5 ? -1 : 1),
        size: 0.6 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.W = rect.width;
    this.H = rect.height;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.cx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = this.W / 2;
    const cy = this.H * 0.46;
    const r = Math.min(this.W, this.H) * 0.3;
    this.center = { x: cx, y: cy, r };
  }

  // Convert a dial fraction (0..1, 0 = top, clockwise) to an angle in radians.
  private angleFor(fraction: number): number {
    return fraction * Math.PI * 2 - Math.PI / 2;
  }

  render(state: ArcState, level: number, dt: number): void {
    this.t += dt;
    const g = this.cx2d;
    const { x: cx, y: cy, r } = this.center;

    // --- background: interpolate the sky around the ring ---
    const pos = state.dayFraction * SKY.length;
    const i0 = Math.floor(pos) % SKY.length;
    const i1 = (i0 + 1) % SKY.length;
    const f = pos - Math.floor(pos);
    const top = mix(SKY[i0].top, SKY[i1].top, f);
    const bottom = mix(SKY[i0].bottom, SKY[i1].bottom, f);

    const grad = g.createLinearGradient(0, 0, 0, this.H);
    grad.addColorStop(0, css(top));
    grad.addColorStop(1, css(bottom));
    g.fillStyle = grad;
    g.fillRect(0, 0, this.W, this.H);

    // sun warmth: golden by day (near sext), pale silver by night.
    const altitude = Math.max(0, Math.sin(state.dayFraction * Math.PI * 2 - Math.PI / 2) * -1);
    const sunWarm = mix([214, 222, 236], [255, 214, 150], altitude); // moon → sun
    const sunAng = this.angleFor(state.dayFraction);
    const sunX = cx + Math.cos(sunAng) * r;
    const sunY = cy + Math.sin(sunAng) * r;

    // --- faint outer horizon band + dial ring ---
    g.lineWidth = 1;
    g.strokeStyle = css(INK, 0.16);
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();

    g.strokeStyle = css(INK, 0.1);
    g.beginPath();
    g.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    g.stroke();

    // --- progress arc from dawn-top to the sun ---
    g.lineWidth = 3;
    g.strokeStyle = css(sunWarm, 0.55);
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, sunAng, false);
    g.stroke();

    // --- hour ticks + labels around the ring ---
    for (let h = 0; h < HOURS.length; h++) {
      const frac = h / HOURS.length;
      const a = this.angleFor(frac);
      const inner = r * 0.93;
      const outer = r * 1.0;
      const current = h === state.hourIndex;
      g.lineWidth = current ? 2 : 1;
      g.strokeStyle = css(INK, current ? 0.55 : 0.25);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      g.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
      g.stroke();

      const lx = cx + Math.cos(a) * (r * 1.14);
      const ly = cy + Math.sin(a) * (r * 1.14);
      g.font = `${current ? "600 " : "400 "}13px Georgia, 'Times New Roman', serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = css(INK, current ? 0.85 : 0.4);
      g.fillText(HOURS[h].name, lx, ly);
    }

    // --- the dial hand ---
    g.lineWidth = 1.5;
    g.strokeStyle = css(INK, 0.3);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(sunX, sunY);
    g.stroke();

    // --- grain-motes drifting around the sun ---
    const density01 = Math.min(1, state.density / 26); // total grains/s ~ density*layers
    const visible = Math.floor(this.motes.length * (0.2 + density01 * 0.8));
    const moteR = r * 0.34;
    for (let m = 0; m < visible; m++) {
      const mo = this.motes[m];
      mo.ang += mo.speed * dt * (0.4 + density01);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 1.3 + mo.phase);
      const mx = sunX + Math.cos(mo.ang) * moteR * mo.rad;
      const my = sunY + Math.sin(mo.ang) * moteR * mo.rad;
      const alpha = (0.12 + level * 0.5) * (0.3 + pulse * 0.7);
      g.fillStyle = css(sunWarm, Math.min(0.8, alpha));
      g.beginPath();
      g.arc(mx, my, mo.size * (0.7 + pulse * 0.6), 0, Math.PI * 2);
      g.fill();
    }

    // --- the sun / moon ---
    const sunR = r * 0.09 * (1 + level * 0.35);
    const glow = g.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.2);
    glow.addColorStop(0, css(sunWarm, 0.9));
    glow.addColorStop(0.4, css(sunWarm, 0.35));
    glow.addColorStop(1, css(sunWarm, 0));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(sunX, sunY, sunR * 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = css(sunWarm, 0.95);
    g.beginPath();
    g.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    g.fill();

    // --- centre: current hour name + gloss (the clock face) ---
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.fillStyle = css(INK, 0.9);
    g.font = "italic 400 30px Georgia, 'Times New Roman', serif";
    g.fillText(state.hourName, cx, cy - 2);
    g.font = "400 13px Georgia, 'Times New Roman', serif";
    g.fillStyle = css(INK, 0.55);
    g.fillText(state.hourGloss, cx, cy + 20);
  }
}
