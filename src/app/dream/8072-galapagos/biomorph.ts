// ─────────────────────────────────────────────────────────────────────────────
// 8072-galapagos · biomorph.ts
//
// Genome → a recursive branching line-creature, in the spirit of Dawkins'
// Biomorphs (The Blind Watchmaker, 1986). Pure geometry: we emit an array of
// line segments (with a width + shade per segment) that page.tsx renders as
// inline <svg> — no canvas, no WebGL.
//
// The trunk grows upward from the base; at each node it splits into `branches`
// children rotated by ±angle, drifted by `curl`, each shorter by `falloff`.
// Bilateral symmetry falls out naturally from the symmetric ±angle split.
// ─────────────────────────────────────────────────────────────────────────────

import { readTraits, type Genome } from "./genome";

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number; // stroke width
  s: number; // 0..1 shade position (depth-normalised)
}

// Violet ramp — cool indigo core → warm magenta tips. Raw hsl is allowed
// INSIDE the SVG art (house rule: tokens only for chrome, not the artwork).
const RAMP = [
  "hsl(248 70% 62%)",
  "hsl(258 72% 66%)",
  "hsl(270 74% 68%)",
  "hsl(282 72% 70%)",
  "hsl(294 70% 72%)",
];

/** Pick a violet-ramp colour from a genome's shade gene + a per-tip offset. */
export function shadeColor(base: number, tip: number): string {
  const t = base * 0.6 + tip * 0.4;
  const i = Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))));
  return RAMP[i];
}

export const VIEW = 100; // square viewBox side

/**
 * Build the creature's segment list. Deterministic — no randomness; the genome
 * fully determines the form.
 */
export function buildBiomorph(g: Genome): Segment[] {
  const t = readTraits(g);
  const segs: Segment[] = [];
  const maxDepth = t.depth;

  const grow = (
    x: number,
    y: number,
    dir: number, // heading in degrees; -90 = straight up
    len: number,
    level: number,
  ): void => {
    if (level > maxDepth || len < 1.2) return;
    const rad = (dir * Math.PI) / 180;
    const x2 = x + Math.cos(rad) * len;
    const y2 = y + Math.sin(rad) * len;
    const shade = level / maxDepth;
    const w = Math.max(0.5, t.thick * Math.pow(t.falloff, level));
    segs.push({ x1: x, y1: y, x2, y2, w, s: shade });

    const childLen = len * t.falloff;
    if (t.branches === 2) {
      grow(x2, y2, dir - t.angleDeg + t.curl, childLen, level + 1);
      grow(x2, y2, dir + t.angleDeg + t.curl, childLen, level + 1);
    } else {
      grow(x2, y2, dir - t.angleDeg + t.curl, childLen, level + 1);
      grow(x2, y2, dir + t.curl, childLen * 0.92, level + 1);
      grow(x2, y2, dir + t.angleDeg + t.curl, childLen, level + 1);
    }
  };

  grow(VIEW / 2, VIEW - 6, -90, t.trunk, 0);

  return normalize(segs);
}

// Fit the segment cloud into the viewBox with a small margin, preserving aspect.
function normalize(segs: Segment[]): Segment[] {
  if (segs.length === 0) return segs;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const s of segs) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const margin = 10;
  const scale = Math.min((VIEW - margin * 2) / w, (VIEW - margin * 2) / h);
  const ox = (VIEW - w * scale) / 2 - minX * scale;
  const oy = (VIEW - h * scale) / 2 - minY * scale;
  return segs.map((s) => ({
    x1: s.x1 * scale + ox,
    y1: s.y1 * scale + oy,
    x2: s.x2 * scale + ox,
    y2: s.y2 * scale + oy,
    w: s.w * scale,
    s: s.s,
  }));
}
