// field.ts — the stigmergic "scent" memory field.
//
// A 2-D grid of scalar scent. One axis (rows / y) maps to pitch as
// log-frequency across ~2.5 octaves; the other axis (columns / x) is a free
// spatial dimension used for stereo pan. Every gesture — yours or an
// agent's — deposits a soft gaussian splat of scent. Each frame the whole
// field is multiplied by an evaporation factor so unfed memories fade.

/** Small, fast, deterministic PRNG. Seed once; never touches Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIELD_W = 128;
export const FIELD_H = 72;

const F_LO = 138.6; // ~C#3
const F_HI = F_LO * Math.pow(2, 2.5); // ~2.5 octaves up (~783 Hz)

/** Row index (0 = top) -> frequency. Top of field is the high pitch. */
export function rowToFreq(row: number): number {
  const t = 1 - clamp01(row / (FIELD_H - 1)); // invert: top = high
  return F_LO * Math.pow(F_HI / F_LO, t);
}

/** Column index -> stereo pan in [-1, 1]. */
export function colToPan(col: number): number {
  return clamp01(col / (FIELD_W - 1)) * 2 - 1;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class ScentField {
  readonly w = FIELD_W;
  readonly h = FIELD_H;
  readonly cells: Float32Array;
  /** Rolling maximum used to normalise the visual heat ramp. */
  peak = 1e-3;

  constructor() {
    this.cells = new Float32Array(this.w * this.h);
  }

  idx(cx: number, cy: number): number {
    return cy * this.w + cx;
  }

  /** Multiply every cell by `factor` (< 1) and track the current peak. */
  evaporate(factor: number): void {
    const c = this.cells;
    let mx = 1e-3;
    for (let i = 0; i < c.length; i++) {
      const v = c[i] * factor;
      c[i] = v;
      if (v > mx) mx = v;
    }
    // Ease the tracked peak toward the true peak so the heat ramp breathes
    // rather than jumping.
    this.peak += (mx - this.peak) * 0.08;
    if (this.peak < 1e-3) this.peak = 1e-3;
  }

  /** Deposit a soft gaussian blob of scent centred on grid coords (gx, gy). */
  splat(gx: number, gy: number, radius: number, amount: number): void {
    const c = this.cells;
    const r = Math.max(1, radius);
    const inv = 1 / (2 * r * r);
    const x0 = Math.max(0, Math.floor(gx - r * 2.2));
    const x1 = Math.min(this.w - 1, Math.ceil(gx + r * 2.2));
    const y0 = Math.max(0, Math.floor(gy - r * 2.2));
    const y1 = Math.min(this.h - 1, Math.ceil(gy + r * 2.2));
    for (let y = y0; y <= y1; y++) {
      const dy = y - gy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        const g = Math.exp(-(dx * dx + dy * dy) * inv);
        c[y * this.w + x] += amount * g;
      }
    }
  }

  /** Bilinear-ish sample of scent at continuous grid coords. */
  sample(gx: number, gy: number): number {
    const x = Math.max(0, Math.min(this.w - 1, gx));
    const y = Math.max(0, Math.min(this.h - 1, gy));
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    return this.cells[yi * this.w + xi];
  }
}
