// ─────────────────────────────────────────────────────────────────────────────
// 7800-strikefield · plate.ts
// Canvas2D renderer for the live modal standing-wave (Chladni) field.
//
// Each frame we reconstruct the plate's instantaneous transverse displacement
//
//     u(x,y,t) = Σ_i  amp_i · cos(2π f_i t) · sin(m_i π x) · sin(n_i π y)
//
// on a coarse grid, paint it to a small offscreen ImageData, and upscale it with
// smoothing into a soft violet heatmap: antinodes (large |u|) glow, nodes (u≈0)
// stay dark. Where the field changes sign we draw the bright nodal contour — the
// Chladni sand lines — so the viewer literally SEES which mode shapes are ringing.
// Strikes bloom as expanding rings at their contact point.
//
// All colour lives here (raw hsl/hex is allowed inside the canvas art); the DOM
// chrome stays on the Resonance semantic tokens.
// ─────────────────────────────────────────────────────────────────────────────

import type { Mode } from "./modal";

const GW = 104; // field grid columns
const GH = 86; // field grid rows

export interface StrikeBloom {
  sx: number;
  sy: number;
  force: number;
  born: number; // performance.now() ms
}

export class PlateRenderer {
  private ctx: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private img: ImageData;
  private modes: Mode[];
  // precomputed mode-shape tables: colSin[i][j] = sin(m_i π x_j), rowSin[i][k]
  private colSin: Float32Array[];
  private rowSin: Float32Array[];
  private field: Float32Array;
  private peak = 0.5;
  private dpr = 1;
  cssW = 0;
  cssH = 0;

  constructor(canvas: HTMLCanvasElement, modes: Mode[]) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.modes = modes;

    this.off = document.createElement("canvas");
    this.off.width = GW;
    this.off.height = GH;
    const oc = this.off.getContext("2d");
    if (!oc) throw new Error("no offscreen 2d context");
    this.offCtx = oc;
    this.img = this.offCtx.createImageData(GW, GH);
    this.field = new Float32Array(GW * GH);

    this.colSin = modes.map((m) => {
      const t = new Float32Array(GW);
      for (let j = 0; j < GW; j++) {
        const x = (j + 0.5) / GW;
        t[j] = Math.sin(m.m * Math.PI * x);
      }
      return t;
    });
    this.rowSin = modes.map((m) => {
      const t = new Float32Array(GH);
      for (let k = 0; k < GH; k++) {
        const y = (k + 0.5) / GH;
        t[k] = Math.sin(m.n * Math.PI * y);
      }
      return t;
    });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    const cvs = this.ctx.canvas;
    cvs.width = Math.max(1, Math.floor(cssW * dpr));
    cvs.height = Math.max(1, Math.floor(cssH * dpr));
  }

  /**
   * Draw one frame.
   *  amps       live modal amplitudes (envelope), length = modes.length
   *  audioTime  seconds since audio start (drives the cos phase)
   *  blooms     recent strike blooms
   *  now        performance.now() ms
   *  calm       0..1, higher = reduced-motion (freeze phase, slow blooms)
   */
  draw(
    amps: Float32Array,
    audioTime: number,
    blooms: StrikeBloom[],
    now: number,
    calm: number,
  ): void {
    const ctx = this.ctx;
    const W = this.ctx.canvas.width;
    const H = this.ctx.canvas.height;

    // per-mode instantaneous coefficient c_i = amp_i · cos(2π f_i t)
    const nModes = this.modes.length;
    const coef = new Float32Array(nModes);
    const phaseT = audioTime * (1 - 0.85 * calm); // near-freeze when calm
    for (let i = 0; i < nModes; i++) {
      coef[i] = (amps[i] || 0) * Math.cos(2 * Math.PI * this.modes[i].f * phaseT);
    }

    // reconstruct displacement field on the grid
    const field = this.field;
    let fmax = 1e-4;
    for (let k = 0; k < GH; k++) {
      const rowBase = k * GW;
      for (let j = 0; j < GW; j++) {
        let v = 0;
        for (let i = 0; i < nModes; i++) {
          const ci = coef[i];
          if (ci === 0) continue;
          v += ci * this.colSin[i][j] * this.rowSin[i][k];
        }
        field[rowBase + j] = v;
        const av = v < 0 ? -v : v;
        if (av > fmax) fmax = av;
      }
    }
    // auto-scale with a slow-release peak follower
    this.peak = Math.max(fmax, this.peak * 0.94);
    const inv = 1 / (this.peak + 1e-4);

    // paint field → offscreen ImageData (warm violet ramp)
    const data = this.img.data;
    for (let p = 0; p < GW * GH; p++) {
      const v = field[p] * inv; // roughly -1..1
      const a = v < 0 ? -v : v;
      // nodal darkness: |u|→0 dark, antinodes bright. warm violet/magenta glow.
      const g = Math.pow(a, 0.7);
      // hue drifts violet(268)→magenta(300) with sign for an organic warmth
      const hue = 262 + (v > 0 ? 30 * g : 8 * g);
      const light = 6 + 60 * g;
      const sat = 62 + 24 * g;
      const [r, gg, b] = hslToRgb(hue, sat, light);
      const o = p * 4;
      data[o] = r;
      data[o + 1] = gg;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    this.offCtx.putImageData(this.img, 0, 0);

    // upscale the heatmap smoothly to fill the canvas
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#05030a";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this.off, 0, 0, W, H);
    ctx.restore();

    // nodal contour lines (sand): trace grid cells whose field crosses zero
    // while carrying enough amplitude — the visible standing-wave skeleton.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const cw = W / GW;
    const chh = H / GH;
    const thresh = 0.045 * this.peak;
    ctx.fillStyle = "rgba(224,214,255,0.5)";
    for (let k = 1; k < GH; k++) {
      const rowBase = k * GW;
      for (let j = 1; j < GW; j++) {
        const c = field[rowBase + j];
        const l = field[rowBase + j - 1];
        const u = field[rowBase - GW + j];
        const crossX = c * l < 0 && Math.abs(c - l) > thresh;
        const crossY = c * u < 0 && Math.abs(c - u) > thresh;
        if (crossX || crossY) {
          ctx.fillRect(j * cw - cw * 0.5, k * chh - chh * 0.5, cw, chh);
        }
      }
    }
    ctx.restore();

    // strike blooms — expanding warm rings at the contact point
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const bloomMs = 900 + 1400 * calm;
    for (const bl of blooms) {
      const age = (now - bl.born) / bloomMs;
      if (age < 0 || age > 1) continue;
      const px = bl.sx * W;
      const py = bl.sy * H;
      const rad = (0.02 + age * 0.16 * (0.6 + bl.force)) * Math.min(W, H);
      const alpha = (1 - age) * 0.6 * Math.min(1, bl.force + 0.3);
      ctx.strokeStyle = `hsla(288,90%,72%,${alpha})`;
      ctx.lineWidth = Math.max(1, (1 - age) * 3 * this.dpr);
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.stroke();
      // bright contact core, fades fast
      if (age < 0.4) {
        const core = (1 - age / 0.4) * 0.8 * Math.min(1, bl.force + 0.3);
        const grd = ctx.createRadialGradient(
          px,
          py,
          0,
          px,
          py,
          0.05 * Math.min(W, H),
        );
        grd.addColorStop(0, `hsla(300,95%,80%,${core})`);
        grd.addColorStop(1, "hsla(300,95%,80%,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(px, py, 0.05 * Math.min(W, H), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // subtle plate border frame
    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.22)";
    ctx.lineWidth = 1 * this.dpr;
    ctx.strokeRect(
      1 * this.dpr,
      1 * this.dpr,
      W - 2 * this.dpr,
      H - 2 * this.dpr,
    );
    ctx.restore();
  }
}

/** hsl (h 0..360, s/l 0..100) → rgb 0..255. Local to the canvas art. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    Math.round(hk(h + 1 / 3) * 255),
    Math.round(hk(h) * 255),
    Math.round(hk(h - 1 / 3) * 255),
  ];
}
