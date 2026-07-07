// loom.ts — the Canvas2D weaving engine for 1246 · warp.
//
// The loom is rotated 90° from a floor loom so the two hard mappings both hold:
//   • frequency → vertical axis   (bass at the BOTTOM, treble at the TOP)
//   • time      → horizontal axis (the fell line advances RIGHTWARD)
// So here the WARP threads run horizontally (one per log-frequency band, always
// present as the tensioned ground) and each shuttle pass lays a vertical WEFT
// column of dyed picks. Cells interlace over/under to read as real cloth; the
// weave changes from plain to twill as a band gets busier.
//
// Older columns are never redrawn — the finished cloth is fixed pixels. When the
// fell reaches the right edge the whole cloth scrolls left, so it never blanks.

/** Small deterministic PRNG so no Math.random() lives at module scope. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Natural-dye palette on unbleached linen (non-jewel-on-dark) ─────────────
export const LINEN = "#e9e0cf";
// Ordered bass → treble: walnut brown → indigo → madder red → weld ochre.
const DYES: Array<[number, number, number]> = [
  [0x5c, 0x46, 0x32], // walnut
  [0x2b, 0x3a, 0x67], // indigo
  [0xa8, 0x40, 0x2f], // madder
  [0xc9, 0xa2, 0x4b], // weld
];

/** Linear interpolate the dye ramp for a band fraction in [0,1]. */
function dyeFor(frac: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, frac)) * (DYES.length - 1);
  const i = Math.min(DYES.length - 2, Math.floor(t));
  const f = t - i;
  const a = DYES[i];
  const b = DYES[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

function rgba(c: [number, number, number], alpha: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface LoomStats {
  fellFrac: number; // 0..1 how far the fell has advanced across the visible cloth
  picks: number; // total weft passes laid this session
}

export class Loom {
  private ctx: CanvasRenderingContext2D;
  private w: number;
  private h: number;
  private bands: number;
  private pickW: number;
  private bandH: number;
  private fellX = 0;
  private col = 0; // running weft-column index (drives the weave phase)
  private picks = 0;
  private rand: () => number;
  // Per-band linen tint jitter so the ground is not a flat fill.
  private tint: Float32Array;

  constructor(
    ctx: CanvasRenderingContext2D,
    cssW: number,
    cssH: number,
    bands = 48,
    pickW = 11,
  ) {
    this.ctx = ctx;
    this.w = cssW;
    this.h = cssH;
    this.bands = bands;
    this.pickW = pickW;
    this.bandH = cssH / bands;
    this.rand = mulberry32(0x1246cafe);
    this.tint = new Float32Array(bands);
    for (let b = 0; b < bands; b++) this.tint[b] = (this.rand() - 0.5) * 10;
    this.init();
  }

  /** Paint the bare warped loom: linen ground + faint horizontal warp threads. */
  private init(): void {
    this.paintGround(0, this.w);
    this.fellX = 0;
    this.col = 0;
  }

  /** Fill a horizontal span [x0,x1) with linen + the empty tensioned warp. */
  private paintGround(x0: number, x1: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = LINEN;
    ctx.fillRect(x0, 0, x1 - x0, this.h);
    // faint slub texture
    ctx.fillStyle = "rgba(92,70,50,0.05)";
    for (let i = 0; i < (x1 - x0) * 0.08; i++) {
      const sx = x0 + this.rand() * (x1 - x0);
      const sy = this.rand() * this.h;
      ctx.fillRect(sx, sy, 1, 1);
    }
    // the tensioned warp waiting to be woven — faint horizontal ink lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(58,51,42,0.22)";
    for (let b = 0; b < this.bands; b++) {
      const y = (b + 0.5) * this.bandH;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }
  }

  /**
   * Lay one shuttle pass: a vertical weft column of `bands` interlaced cells.
   * `energies[b]` (0..1) is the band's current spectral energy — band 0 = bass
   * (drawn at the BOTTOM), band n-1 = treble (drawn at the TOP).
   */
  weave(energies: Float32Array): void {
    const ctx = this.ctx;
    const x = this.fellX;
    const w = this.pickW;

    for (let b = 0; b < this.bands; b++) {
      const e = Math.max(0, Math.min(1, energies[b]));
      // band 0 (bass) at bottom → invert row for the y position
      const row = this.bands - 1 - b;
      const y = row * this.bandH;
      const h = this.bandH;

      const dye = dyeFor(b / (this.bands - 1));
      const tint = this.tint[b];

      // linen cell base (with a whisper of the band's ground tint)
      ctx.fillStyle = rgba([233 + tint, 224 + tint, 207 + tint], 1);
      ctx.fillRect(x, y, w, h);

      // Weave pattern: plain weave when the band is quiet, 2/2 twill (diagonal
      // floats) when it's busy — so dense passages grow visible twill texture.
      const twill = e > 0.42;
      const weftOnTop = twill
        ? ((this.col + row * 2) % 4) < 2
        : ((this.col + row) & 1) === 0;

      const cx = x + w / 2;
      const cy = y + h / 2;
      const warpH = h * 0.66;
      const weftW = w * 0.66;
      // weft is more present (opaque, thicker) the louder the band
      const weftAlpha = 0.18 + 0.78 * e;
      const weftW2 = weftW * (0.55 + 0.45 * e);

      const drawWarp = () => {
        roundRect(ctx, x - 0.5, cy - warpH / 2, w + 1, warpH, warpH * 0.4);
        ctx.fillStyle = rgba([58, 51, 42], 0.9);
        ctx.fill();
        // sheen along the top of the thread
        ctx.strokeStyle = "rgba(233,224,207,0.16)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, cy - warpH * 0.32);
        ctx.lineTo(x + w, cy - warpH * 0.32);
        ctx.stroke();
      };
      const drawWeft = () => {
        roundRect(ctx, cx - weftW2 / 2, y - 0.5, weftW2, h + 1, weftW2 * 0.4);
        ctx.fillStyle = rgba(dye, weftAlpha);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,250,240,0.14)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - weftW2 * 0.18, y);
        ctx.lineTo(cx - weftW2 * 0.18, y + h);
        ctx.stroke();
      };

      if (weftOnTop) {
        drawWarp();
        drawWeft();
      } else {
        drawWeft();
        drawWarp();
      }
    }

    // soft "reed" shadow marking the active fell line
    ctx.fillStyle = "rgba(58,51,42,0.10)";
    ctx.fillRect(x + w - 1, 0, 1, this.h);

    this.col++;
    this.picks++;
    this.fellX += w;
    if (this.fellX + w > this.w) {
      // scroll the finished cloth left by one pick, re-warp the fresh edge.
      // Do the self-copy in raw device pixels (identity transform), then
      // restore the DPR transform for the linen repaint.
      const m = ctx.getTransform();
      const dpr = m.a || 1;
      const sw = Math.round((this.w - w) * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(
        ctx.canvas,
        Math.round(w * dpr),
        0,
        sw,
        ctx.canvas.height,
        0,
        0,
        sw,
        ctx.canvas.height,
      );
      ctx.setTransform(m);
      this.paintGround(this.w - w, this.w);
      this.fellX = this.w - w;
    }
  }

  stats(): LoomStats {
    return { fellFrac: this.fellX / this.w, picks: this.picks };
  }
}

/** Configure a canvas for crisp DPR rendering; returns a ready 2D context. */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
