// ─────────────────────────────────────────────────────────────────────────────
// wave.ts — the CPU damped-wave-equation "ripple tank" (Canvas2D fallback body).
//
//   A real 2D wave equation on a grid, ping-ponged between two height buffers:
//     u_next = (2*u_curr - u_prev) + c^2 * laplacian(u_curr)   then * damping
//   A strike injects a gaussian impulse into u_curr. This mirrors the WGSL
//   compute shader in page.tsx exactly (same model, lower res) so a device with
//   no WebGPU still gets a fully playable instrument.
//
//   No React, no DOM — pure math, importable from the render loop. The render
//   path warps this height field through the shared log-polar form-constant
//   engine (_shared/psych/logpolar) so ripples read as breathing tunnels /
//   spirals / honeycombs, not flat rings.
// ─────────────────────────────────────────────────────────────────────────────

export interface WaveParams {
  /** wave speed squared * dt^2, the Courant-ish coupling. Keep < 0.5 for stability. */
  c2: number;
  /** per-step amplitude retention, < 1 = energy bleeds away (the pond settles). */
  damping: number;
}

/** A CPU ripple-tank field. Two height buffers ping-ponged each step. */
export class WaveField {
  readonly w: number;
  readonly h: number;
  prev: Float32Array;
  curr: Float32Array;
  private next: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.prev = new Float32Array(w * h);
    this.curr = new Float32Array(w * h);
    this.next = new Float32Array(w * h);
  }

  /** Inject a gaussian impulse (a strike) at grid cell (gx,gy). */
  strike(gx: number, gy: number, radius: number, amp: number): void {
    const { w, h, curr } = this;
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(gx - radius * 3));
    const x1 = Math.min(w - 1, Math.ceil(gx + radius * 3));
    const y0 = Math.max(0, Math.floor(gy - radius * 3));
    const y1 = Math.min(h - 1, Math.ceil(gy + radius * 3));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - gx;
        const dy = y - gy;
        curr[y * w + x] += amp * Math.exp(-(dx * dx + dy * dy) / r2);
      }
    }
  }

  /** Advance one wave-equation step. Edges are damped (absorbing-ish). */
  step(p: WaveParams): void {
    const { w, h, prev, curr, next } = this;
    const { c2, damping } = p;
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        const lap = curr[i - 1] + curr[i + 1] + curr[i - w] + curr[i + w] - 4 * curr[i];
        next[i] = (2 * curr[i] - prev[i] + c2 * lap) * damping;
      }
    }
    // soft absorbing border: copy inward neighbour, attenuated
    for (let x = 0; x < w; x++) {
      next[x] = next[w + x] * 0.5;
      next[(h - 1) * w + x] = next[(h - 2) * w + x] * 0.5;
    }
    for (let y = 0; y < h; y++) {
      next[y * w] = next[y * w + 1] * 0.5;
      next[y * w + w - 1] = next[y * w + w - 2] * 0.5;
    }
    // ping-pong: prev <- curr, curr <- next, reuse old prev as next scratch
    this.prev = curr;
    this.curr = next;
    this.next = prev;
  }

  /** Local wave energy near a normalized point (0..1), for an audio probe. */
  energyAt(nx: number, ny: number, sample = 2): number {
    const { w, h, curr } = this;
    const cx = Math.round(nx * (w - 1));
    const cy = Math.round(ny * (h - 1));
    let acc = 0;
    let n = 0;
    for (let dy = -sample; dy <= sample; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= h) continue;
      for (let dx = -sample; dx <= sample; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= w) continue;
        const v = curr[y * w + x];
        acc += v * v;
        n++;
      }
    }
    return n ? Math.sqrt(acc / n) : 0;
  }
}

/** A just-intonation / pentatonic ratio set — consonant bell pitches. */
export const PENTA_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4] as const;

/** Probe positions on the field (normalized 0..1), spread so different regions
 *  ring different bells. */
export function probePositions(count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const golden = 2.399963229728653; // golden-angle spiral, pleasantly non-grid
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const r = 0.13 + 0.34 * Math.sqrt(t);
    const a = i * golden;
    out.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
  }
  return out;
}
