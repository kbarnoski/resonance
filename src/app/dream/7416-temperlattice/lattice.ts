/**
 * 7416 · Temperlattice — the crystal lattice state.
 *
 * The derived scale degrees are laid out as lattice SITES: pitch-class angle
 * around a slowly-outward spiral, radius nudged by degree index so a dense
 * cluster of valleys still separates visibly. Brightness carries the valley
 * depth. As the timbre morphs, `setTargets` re-computes where each degree's
 * valley now sits and `step` eases every persisting site toward its new home —
 * so index-i (the i-th scale degree) MIGRATES across the crystal to its new
 * consonance valley, and the ping-pong feedback pass paints the comet-tail.
 *
 * A newly-appearing degree snaps in at its target (fades up via brightness)
 * rather than flying from the origin; a degree that disappears fades its
 * brightness to zero in place.
 */

import type { Degree } from "./dissonance";

/** Hard cap on lattice sites (the RGBA32F data texture width). */
export const MAX_SITES = 16;

export interface Site {
  x: number;
  y: number;
  bright: number;
}

/** Layout a single degree into aspect-correct art space (uv = frag/res.y). */
export function layoutDegree(
  index: number,
  count: number,
  cents: number,
  bright: number,
): Site {
  // Pitch class 0..1 around the ring; unison at the top, ascending clockwise.
  const frac = Math.min(1, Math.max(0, cents / 1200));
  const angle = frac * Math.PI * 2 - Math.PI / 2;
  // Gentle outward spiral by index so near-coincident pitch classes separate
  // and the ascent reads as a climb outward from the tonic.
  const denom = Math.max(1, count - 1);
  const radius = 0.34 + 0.34 * (index / denom);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    bright,
  };
}

interface Slot {
  x: number;
  y: number;
  bright: number;
  tx: number;
  ty: number;
  tbright: number;
  live: boolean;
}

export class LatticeState {
  /** Current number of live degrees (drives u_count). */
  count = 0;
  private slots: Slot[] = Array.from({ length: MAX_SITES }, () => ({
    x: 0,
    y: 0,
    bright: 0,
    tx: 0,
    ty: 0,
    tbright: 0,
    live: false,
  }));

  /** Recompute per-degree targets from the freshly derived scale. */
  setTargets(degrees: Degree[]): void {
    const n = Math.min(MAX_SITES, degrees.length);
    this.count = n;
    for (let i = 0; i < MAX_SITES; i++) {
      const s = this.slots[i];
      if (i < n) {
        const d = degrees[i];
        const site = layoutDegree(i, n, d.cents, d.bright);
        s.tx = site.x;
        s.ty = site.y;
        s.tbright = site.bright;
        // Snap a genuinely new site to its target so it pops in rather than
        // sweeping in from the origin; persisting sites migrate smoothly.
        if (!s.live || s.bright < 0.02) {
          s.x = site.x;
          s.y = site.y;
        }
        s.live = true;
      } else {
        // Fade out a vanished degree in place.
        s.tbright = 0;
        s.live = false;
      }
    }
  }

  /**
   * Ease every site toward its target. `k` is the per-frame lerp (small = slow
   * migration = longer comet-tail). `activation` (0..1 per slot) is the live
   * played/held glow supplied by the page.
   */
  step(k: number, activation: Float32Array, out: Float32Array): void {
    for (let i = 0; i < MAX_SITES; i++) {
      const s = this.slots[i];
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      s.bright += (s.tbright - s.bright) * k;
      const o = i * 4;
      out[o] = s.x;
      out[o + 1] = s.y;
      out[o + 2] = s.bright;
      out[o + 3] = activation[i];
    }
  }
}
