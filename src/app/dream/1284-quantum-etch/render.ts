// 1284-quantum-etch — render.ts
//
// The ETCHING. Canvas2D, line-drawing only — no fills, no bloom, no strobe.
// Every frame we march several log-spaced iso levels of |ψ|² and STROKE the
// resulting contour segments as nested topographic rings in warm bone/copper on
// near-black ink. Walls and wells are drawn in their own line styles (bright
// barrier strokes / dashed basins). The nodal set — Re(ψ)=0 — is stroked as a
// brighter, finer curve on top: those moving zero-crossing lines ARE the
// interference pattern (the double-slit fringes read as a fan of them).
//
// A faint, near-opaque ink wash each frame leaves the lines a short ghost so the
// map feels alive without ever smearing into a glow.

import { marchSquares, computeLevels } from "./contour";
import type { QuantumField } from "./schrodinger";

export interface Renderer {
  draw(maxProb: number): void;
  setSize(cssW: number, cssH: number, dpr: number): void;
  /** Map a canvas-relative CSS point to normalised grid coords (clamped 0..1). */
  toNorm(cssX: number, cssY: number): [number, number];
}

export function createRenderer(
  ctx: CanvasRenderingContext2D,
  field: QuantumField,
  levelCount: number,
): Renderer {
  const N = field.N;
  const seg = new Float32Array(N * N * 4);
  const levels = new Float32Array(levelCount);

  let scale = 1;
  let ox = 0;
  let oy = 0;
  let W = 0;
  let H = 0;

  const strokeSegments = (count: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let s = 0; s < count; s++) {
      const o = s << 2;
      ctx.moveTo(ox + seg[o] * scale, oy + seg[o + 1] * scale);
      ctx.lineTo(ox + seg[o + 2] * scale, oy + seg[o + 3] * scale);
    }
    ctx.stroke();
  };

  return {
    toNorm(cssX, cssY) {
      const span = N * scale;
      const nx = Math.max(0, Math.min(1, (cssX - ox) / span));
      const ny = Math.max(0, Math.min(1, (cssY - oy) / span));
      return [nx, ny];
    },

    setSize(cssW, cssH, dpr) {
      W = cssW;
      H = cssH;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const side = Math.min(cssW, cssH) * 0.96;
      scale = side / N;
      ox = (cssW - N * scale) / 2;
      oy = (cssH - N * scale) / 2;
    },

    draw(maxProb: number) {
      // Ink wash — near-opaque so trails are short (crisp lines, not glow).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(10, 8, 7, 0.86)";
      ctx.fillRect(0, 0, W, H);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // ── Potential: wells first (dashed basins), then walls (bright bars) ──
      let hasWell = false;
      let hasWall = false;
      for (let i = 0; i < field.V.length; i++) {
        const v = field.V[i];
        if (v < -1.5) hasWell = true;
        else if (v > 2) hasWall = true;
        if (hasWell && hasWall) break;
      }

      if (hasWell) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = "rgba(196, 142, 96, 0.42)";
        let n = marchSquares(field.V, N, -2.2, seg);
        strokeSegments(n, 1);
        n = marchSquares(field.V, N, -3.4, seg);
        strokeSegments(n, 1);
        ctx.setLineDash([]);
      }

      if (hasWall) {
        ctx.strokeStyle = "rgba(255, 224, 178, 0.82)";
        const n = marchSquares(field.V, N, 2.5, seg);
        strokeSegments(n, 1.8);
      }

      // ── |ψ|² iso-contour etching: nested rings, faint tail → bright crest ──
      const used = computeLevels(maxProb, levels);
      for (let li = 0; li < used; li++) {
        const t = used === 1 ? 0.6 : li / (used - 1); // 0 tail … 1 crest
        // Copper (tail) → bone (crest).
        const r = Math.round(150 + 100 * t);
        const g = Math.round(96 + 128 * t);
        const b = Math.round(52 + 128 * t);
        const a = 0.22 + 0.5 * t;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        const count = marchSquares(field.prob, N, levels[li], seg);
        strokeSegments(count, 0.7 + 0.7 * t);
      }

      // ── Nodal set: Re(ψ)=0 zero-crossing curves (the interference lines) ──
      ctx.strokeStyle = "rgba(255, 243, 220, 0.34)";
      const nodal = marchSquares(field.re, N, 0, seg);
      strokeSegments(nodal, 0.7);
    },
  };
}
