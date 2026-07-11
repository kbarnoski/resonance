// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the luminous field the visitor paints into.
//
//   The single source of truth for what has been painted: two CPU-side grids,
//   `bri` (brightness / luminance) and `hue` (0..1 colour). Painting splats soft
//   gaussian marks. Both the RENDERER (which reads an uploaded RGBA texture) and
//   the AUDIO engine (which reads whatever cell the reading-head is over) sample
//   the SAME field, so eye and ear are looking at one thing.
//
//   Marks PERSIST (no decay) and BREATHE via a slow global LFO applied at read
//   time — the field is alive but never a strobe.
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_SIDE = 128;

export interface FieldSample {
  bri: number; // 0..1 luminance under the head
  hue: number; // 0..1 colour under the head
  density: number; // 0..1 local neighbourhood energy → shimmer
}

/** Simple HSV→RGB (h,s,v all 0..1) for baking the field texture. */
function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

export class PaintField {
  readonly side = FIELD_SIDE;
  readonly bri: Float32Array;
  readonly hue: Float32Array;
  readonly rgba: Uint8Array;
  dirty = true;

  constructor() {
    const n = this.side * this.side;
    this.bri = new Float32Array(n);
    this.hue = new Float32Array(n);
    this.rgba = new Uint8Array(n * 4);
  }

  clear(): void {
    this.bri.fill(0);
    this.hue.fill(0);
    this.dirty = true;
  }

  /**
   * Splat a soft gaussian mark at normalised (nx, ny) ∈ [0,1].
   * `hueVal` colours it; `radiusN` is the mark radius as a fraction of the field.
   */
  paint(nx: number, ny: number, hueVal: number, radiusN = 0.05, strength = 0.9): void {
    const s = this.side;
    const cx = nx * s;
    const cy = ny * s;
    const r = Math.max(1, radiusN * s);
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(s - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(s - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const g = Math.exp(-d2 / (r2 * 0.5)) * strength;
        const idx = y * s + x;
        const nb = Math.min(1, this.bri[idx] + g);
        // blend hue toward the new colour weighted by how much we deposited
        const w = g / (nb + 1e-4);
        this.hue[idx] = this.hue[idx] * (1 - w) + hueVal * w;
        this.bri[idx] = nb;
      }
    }
    this.dirty = true;
  }

  /** Bilinear brightness + neighbourhood density + nearest hue at normalised (fx,fy). */
  sample(fx: number, fy: number): FieldSample {
    const s = this.side;
    const gx = Math.min(s - 1.001, Math.max(0, fx * s - 0.5));
    const gy = Math.min(s - 1.001, Math.max(0, fy * s - 0.5));
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = gx - x0;
    const ty = gy - y0;
    const i00 = y0 * s + x0;
    const i10 = i00 + 1;
    const i01 = i00 + s;
    const i11 = i01 + 1;
    const b = this.bri;
    const bri =
      b[i00] * (1 - tx) * (1 - ty) +
      b[i10] * tx * (1 - ty) +
      b[i01] * (1 - tx) * ty +
      b[i11] * tx * ty;

    // local density: mean brightness in a small window (drives shimmer)
    let sum = 0;
    let cnt = 0;
    const rad = 3;
    for (let y = y0 - rad; y <= y0 + rad; y++) {
      if (y < 0 || y >= s) continue;
      for (let x = x0 - rad; x <= x0 + rad; x++) {
        if (x < 0 || x >= s) continue;
        sum += b[y * s + x];
        cnt++;
      }
    }
    const density = cnt ? sum / cnt : 0;

    return { bri, hue: this.hue[i00], density };
  }

  /** Bake the RGBA texture the renderer uploads. Colour = hue, luminance = bri. */
  buildTexture(): Uint8Array {
    const n = this.side * this.side;
    const out = this.rgba;
    for (let i = 0; i < n; i++) {
      const bv = this.bri[i];
      if (bv <= 0.001) {
        out[i * 4] = 0;
        out[i * 4 + 1] = 0;
        out[i * 4 + 2] = 0;
        out[i * 4 + 3] = 0;
        continue;
      }
      const [r, g, b] = hsv(this.hue[i], 0.55, 1);
      out[i * 4] = Math.round(r * 255);
      out[i * 4 + 1] = Math.round(g * 255);
      out[i * 4 + 2] = Math.round(b * 255);
      out[i * 4 + 3] = Math.round(Math.min(1, bv) * 255);
    }
    this.dirty = false;
    return out;
  }

  /**
   * Pre-paint a luminous glyph so a cold visitor immediately sees the thread
   * weave a real shape — a double spiral crossed by a couple of strokes. Hue
   * follows the vertical axis (top violet → bottom warm), the same axis pitch
   * is mapped to, so colour and pitch move together.
   */
  prePaintGlyph(): void {
    this.clear();
    const hueFor = (ny: number) => 0.72 - ny * 0.62; // 0.72 (violet) → ~0.1 (amber)
    // two interleaved spiral arms
    for (let a = 0; a < 2; a++) {
      const turns = 2.4;
      const steps = 260;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const ang = t * turns * Math.PI * 2 + a * Math.PI;
        const rad = 0.06 + t * 0.32;
        const nx = 0.5 + Math.cos(ang) * rad;
        const ny = 0.5 + Math.sin(ang) * rad * 0.92;
        this.paint(nx, ny, hueFor(ny), 0.028, 0.5);
      }
    }
    // a rising diagonal stroke and a soft horizon
    for (let i = 0; i < 120; i++) {
      const t = i / 120;
      const nx = 0.16 + t * 0.68;
      const ny = 0.82 - t * 0.64;
      this.paint(nx, ny, hueFor(ny), 0.03, 0.42);
    }
    for (let i = 0; i < 90; i++) {
      const t = i / 90;
      const nx = 0.12 + t * 0.28;
      const ny = 0.24 + Math.sin(t * Math.PI) * 0.05;
      this.paint(nx, ny, hueFor(ny), 0.026, 0.38);
    }
    this.dirty = true;
  }
}
