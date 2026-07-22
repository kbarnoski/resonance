// ─────────────────────────────────────────────────────────────────────────────
// warp.ts — the inverse log-polar form-constant engine (Canvas2D).
//
// The Bressloff–Cowan insight: the Klüver form constants (tunnels, funnels,
// spirals, honeycombs) are what a simple striped/hexagonal pattern in primary
// visual cortex looks like AFTER the retino-cortical map is undone. That map is
// (very nearly) complex-logarithmic: cortical horizontal ≈ log(r), cortical
// vertical ≈ θ. So we run it in reverse — for every screen pixel we take
// (log r, θ) as "cortical" coordinates, evaluate a hexagonal three-plane-wave
// lattice there, and the honeycomb blooms into a receding tunnel with real
// apparent depth. This is the substrate. It is DRIVEN by the live motion field,
// not a time-only autopilot: motion builds `coherence`, coherence resolves the
// lattice, and the motion centroid steers the vanishing point.
//
// Rendered into a modest internal ImageData and upscaled with smoothing on —
// keeps it soft (anti-flicker) and comfortably ≥30fps.
//
// SAFETY: no strobing. `depthPhase` translates the pattern smoothly and slowly
// (a spatial drift, not a luminance flip); overall brightness only tracks
// `coherence`, which changes over seconds. Nothing here flickers.
// ─────────────────────────────────────────────────────────────────────────────

import type { MotionField } from "./motion";
import type { Stage } from "./stages";

export interface WarpParams {
  dt: number;
  energy: number;
  coherence: number;
  stage: Stage;
  cx: number; // motion centroid, -1..1
  cy: number;
  field: MotionField;
}

const SQRT3_2 = 0.8660254037844386;

// Violet-forward palette (raw values live only inside the canvas art layer).
// deep indigo-black → deep violet → violet → magenta-violet → pale highlight.
const RAMP: Array<[number, number, number]> = [
  [8, 6, 16],
  [40, 20, 80],
  [96, 52, 200],
  [176, 104, 246],
  [244, 230, 255],
];

function ramp(t: number, out: [number, number, number]): void {
  const x = t <= 0 ? 0 : t >= 1 ? 0.9999 : t;
  const seg = x * (RAMP.length - 1);
  const i = seg | 0;
  const f = seg - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function sampleField(field: MotionField, nx: number, ny: number): number {
  const c = field.cols;
  const r = field.rows;
  const a = field.accum;
  const fx = clamp01(nx) * (c - 1);
  const fy = clamp01(ny) * (r - 1);
  const x0 = fx | 0;
  const y0 = fy | 0;
  const x1 = x0 + 1 < c ? x0 + 1 : x0;
  const y1 = y0 + 1 < r ? y0 + 1 : y0;
  const tx = fx - x0;
  const ty = fy - y0;
  const v00 = a[y0 * c + x0];
  const v10 = a[y0 * c + x1];
  const v01 = a[y1 * c + x0];
  const v11 = a[y1 * c + x1];
  return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
}

export class WarpRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private iw = 1;
  private ih = 1;
  reduceMotion = false;

  // animation state
  private depthPhase = 0;
  private ripplePhase = 0;
  private vpX = 0;
  private vpY = 0;
  private presX = 0.5;
  private presY = 0.46;
  private presLevel = 0;
  private presT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D unavailable.");
    this.ctx = ctx;
    this.off = document.createElement("canvas");
    const octx = this.off.getContext("2d", { willReadFrequently: false });
    if (!octx) throw new Error("Canvas2D unavailable.");
    this.octx = octx;
  }

  resize(): void {
    const cw = Math.max(1, this.canvas.clientWidth);
    const ch = Math.max(1, this.canvas.clientHeight);
    this.canvas.width = cw;
    this.canvas.height = ch;
    // Internal buffer: capped for performance, aspect-matched, ≤ ~66k px.
    let iw = Math.min(320, cw);
    let ih = Math.round((iw * ch) / cw);
    while (iw * ih > 66000) {
      iw = Math.round(iw * 0.9);
      ih = Math.round((iw * ch) / cw);
    }
    this.iw = Math.max(2, iw);
    this.ih = Math.max(2, ih);
    this.off.width = this.iw;
    this.off.height = this.ih;
    this.img = this.octx.createImageData(this.iw, this.ih);
    this.ctx.imageSmoothingEnabled = true;
  }

  drawFrame(p: WarpParams): void {
    const img = this.img;
    if (!img) return;
    const { dt, coherence, stage, cx, cy, field } = p;
    const iw = this.iw;
    const ih = this.ih;
    const buf = img.data;

    // ── advance animation state (smooth, slow — never a strobe) ──────────────
    const motionScale = this.reduceMotion ? 0.4 : 1;
    this.depthPhase += dt * (0.28 + 0.55 * coherence) * motionScale;
    this.ripplePhase += dt * 0.9 * motionScale;
    this.presT += dt;

    // Vanishing-point drift only engages once a space exists (spatial+).
    const depthDepth = smooth(0.4, 0.82, coherence);
    const maxShift = 0.16 * iw * depthDepth;
    const vpTargetX = cx * maxShift;
    const vpTargetY = cy * maxShift * (ih / iw);
    const ease = Math.min(1, dt * 2.2);
    this.vpX += (vpTargetX - this.vpX) * ease;
    this.vpY += (vpTargetY - this.vpY) * ease;

    // Presence: condenses in the built room, drifts autonomously, biased to
    // (and oriented toward) the motion centroid. Fades — never permanent.
    const presTarget = stage === "presence" ? 1 : 0;
    this.presLevel += (presTarget - this.presLevel) * Math.min(1, dt * 0.7);
    const driftX = 0.5 + 0.13 * Math.sin(this.presT * 0.23);
    const driftY = 0.46 + 0.09 * Math.sin(this.presT * 0.31 + 1.3);
    const biasX = 0.5 + cx * 0.22;
    const biasY = 0.46 + cy * 0.16;
    this.presX += (driftX * 0.55 + biasX * 0.45 - this.presX) * Math.min(1, dt * 0.8);
    this.presY += (driftY * 0.55 + biasY * 0.45 - this.presY) * Math.min(1, dt * 0.8);

    // ── per-frame shaping scalars from the immersion ladder ──────────────────
    const struct = smooth(0.15, 0.78, coherence); // how strongly the lattice shows
    const folds = 3 + struct * 4.5; // angular repeats: ring-ish → honeycomb
    const contrast = 0.35 + 0.65 * struct;
    const baseLum = 0.015 + 0.05 * coherence;
    const ringScale = 2.6;
    const rippleAmt = 0.6 * (1 - 0.7 * coherence); // faint ripples dominate early

    const cxp = iw * 0.5 + this.vpX;
    const cyp = ih * 0.5 + this.vpY;
    const maxR = 0.6 * Math.hypot(iw, ih);
    const presL = this.presLevel;
    const pcx = this.presX * iw;
    const pcy = this.presY * ih;
    const eyeSep = 0.085;
    const gxo = clamp01(cx * 0.5 + 0.5) * 0.03 - 0.015;
    const gyo = clamp01(cy * 0.5 + 0.5) * 0.03 - 0.015;
    const col: [number, number, number] = [0, 0, 0];

    let ptr = 0;
    for (let y = 0; y < ih; y++) {
      const dy0 = y - cyp;
      const ny = y / ih;
      for (let x = 0; x < iw; x++) {
        const dx0 = x - cxp;
        const r = Math.sqrt(dx0 * dx0 + dy0 * dy0) + 1;
        const lr = Math.log(r);
        const th = Math.atan2(dy0, dx0);

        // Hexagonal honeycomb: three plane waves at 60° in (log r, θ) space.
        const u = lr * ringScale - this.depthPhase;
        const v = th * folds;
        const h =
          Math.cos(u) +
          Math.cos(0.5 * u + SQRT3_2 * v) +
          Math.cos(0.5 * u - SQRT3_2 * v);
        let hn = (h + 3) / 6; // 0..1
        hn = hn * hn * (1.1 - 0.1 * hn); // sharpen cells slightly

        // Receding depth: the tunnel's far end (small r, screen centre) sinks
        // into dark — this is what gives the antechamber real apparent depth.
        const rNorm = r > maxR ? 1 : r / maxR;
        const depthShade = 1 - depthDepth * (1 - (0.18 + 0.82 * rNorm));

        // Faint radial ripples where you move (dominant in the early stages).
        const nx = x / iw;
        let intensity = baseLum + struct * hn * depthShade * contrast;
        if (rippleAmt > 0.001) {
          const glow = sampleField(field, nx, ny);
          if (glow > 0.001) {
            const ring = 0.5 + 0.5 * Math.cos(lr * 5 - this.ripplePhase);
            intensity += rippleAmt * glow * (0.4 + 0.6 * ring);
          }
        }

        // Presence: a face/figure gestalt lit within the honeycomb, with two
        // eye hollows that track the motion centroid (its gaze).
        if (presL > 0.002) {
          const edx = (x - pcx) / ih;
          const edy = (y - pcy) / ih;
          const head = Math.exp(-(edx * edx + edy * edy) / (2 * 0.15 * 0.15));
          if (head > 0.004) {
            const eyY = (y - (pcy - 0.055 * ih)) / ih;
            const lEx = (x - (pcx - eyeSep * ih)) / ih - gxo;
            const rEx = (x - (pcx + eyeSep * ih)) / ih - gxo;
            const ey = eyY - gyo;
            const e1 = Math.exp(-((lEx * lEx + ey * ey) / (2 * 0.032 * 0.032)));
            const e2 = Math.exp(-((rEx * rEx + ey * ey) / (2 * 0.032 * 0.032)));
            const eyes = e1 > e2 ? e1 : e2;
            const face = head * (0.5 + 0.5 * hn);
            intensity = intensity + presL * face * 0.85 - presL * eyes * head * 0.85;
          }
        }

        intensity = clamp01(intensity);
        ramp(intensity, col);
        buf[ptr] = col[0];
        buf[ptr + 1] = col[1];
        buf[ptr + 2] = col[2];
        buf[ptr + 3] = 255;
        ptr += 4;
      }
    }

    this.octx.putImageData(img, 0, 0);
    this.ctx.drawImage(this.off, 0, 0, this.canvas.width, this.canvas.height);
  }
}
