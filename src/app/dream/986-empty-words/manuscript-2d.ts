// ─────────────────────────────────────────────────────────────────────────────
// manuscript-2d.ts — Canvas2D fallback for the engraved-manuscript renderer.
//
// Used when WebGL2 is unavailable. It renders the same warm-ink-on-charcoal
// manuscript with scrolling glyphs and an amber highlight around the
// currently-singing token. Less ornate than the GLSL version (no procedural
// grain/staff shading) but visually consistent and fully functional.
// ─────────────────────────────────────────────────────────────────────────────

import type { GlyphBox } from "./manuscript-gl";
import type { Token } from "./composer";

export type Canvas2DLayout = {
  tokens: Token[];
  dpr: number;
  cssW: number;
  cssH: number;
};

type Measured = { boxes: GlyphBox[]; docHeightUv: number };

/**
 * Draw (or, when measureOnly, just lay out) the manuscript.
 * @param scrollUv vertical scroll in viewport-height units
 * @param activeTokenIndex token currently singing (-1 none)
 * @param glowIntensity 0..1
 */
export function drawCanvas2DManuscript(
  canvas: HTMLCanvasElement,
  layout: Canvas2DLayout,
  time: number,
  activeTokenIndex: number,
  scrollUv: number,
  glowIntensity: number,
  measureOnly: boolean,
): Measured {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { boxes: [], docHeightUv: 1 };

  const dpr = layout.dpr;
  const W = canvas.width; // device px
  const viewH = canvas.height;

  const fontPx = Math.max(20 * dpr, Math.round(W / 30));
  const lineH = fontPx * 1.9;
  const marginX = W * 0.08;
  const maxX = W - marginX;

  ctx.font = `${fontPx}px Georgia, "Times New Roman", serif`;
  const spaceW = ctx.measureText(" ").width;

  // layout pass
  let penX = marginX;
  let penY = lineH;
  const placed: { tok: Token; tokenIndex: number; x: number; y: number; w: number }[] = [];
  for (let i = 0; i < layout.tokens.length; i++) {
    const tok = layout.tokens[i];
    if (tok.kind === "newline") {
      penX = marginX;
      penY += lineH;
      continue;
    }
    if (tok.kind === "space") {
      penX += spaceW * tok.raw.length;
      continue;
    }
    const w = ctx.measureText(tok.raw).width;
    if (tok.kind === "word" && penX + w > maxX && penX > marginX) {
      penX = marginX;
      penY += lineH;
    }
    placed.push({ tok, tokenIndex: i, x: penX, y: penY, w });
    penX += w;
  }
  const docH = Math.max(viewH, penY + lineH);
  const docHeightUv = docH / viewH;

  const boxes: GlyphBox[] = placed.map((p) => ({
    tokenIndex: p.tokenIndex,
    cx: (p.x + p.w / 2) / W,
    cy: (p.y - fontPx * 0.32) / docH,
    w: Math.max(p.w / 2 / W, 0.01),
  }));

  if (measureOnly) return { boxes, docHeightUv };

  // ── paint ──────────────────────────────────────────────────────────────
  // charcoal background with warm vignette
  ctx.fillStyle = "#16150F";
  ctx.fillRect(0, 0, W, viewH);
  const grad = ctx.createRadialGradient(W / 2, viewH / 2, viewH * 0.1, W / 2, viewH / 2, W * 0.7);
  grad.addColorStop(0, "rgba(40,36,30,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, viewH);

  // scroll offset in device px
  const scrollPx = scrollUv * viewH;

  // faint ruled staff lines
  ctx.strokeStyle = "rgba(120,110,95,0.10)";
  ctx.lineWidth = Math.max(1, dpr);
  for (let y = lineH * 1.3 - (scrollPx % lineH); y < viewH; y += lineH) {
    ctx.beginPath();
    ctx.moveTo(marginX * 0.5, y);
    ctx.lineTo(W - marginX * 0.5, y);
    ctx.stroke();
  }

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  for (const p of placed) {
    const y = p.y - scrollPx;
    if (y < -lineH || y > viewH + lineH) continue;
    const isActive = p.tokenIndex === activeTokenIndex;

    if (isActive && glowIntensity > 0.01) {
      // amber halo
      const cx = p.x + p.w / 2;
      const cy = y - fontPx * 0.32;
      const r = Math.max(p.w * 0.9, fontPx);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(220,160,80,${0.4 * glowIntensity})`);
      g.addColorStop(1, "rgba(220,160,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.fillStyle = isActive
      ? `rgba(255,247,219,${0.85 + 0.15 * glowIntensity})`
      : p.tok.kind === "punct"
        ? "rgba(237,230,209,0.72)"
        : p.tok.allCaps
          ? "rgba(240,232,214,1)"
          : "rgba(237,230,209,0.92)";
    ctx.fillText(p.tok.raw, p.x, y);
  }

  return { boxes, docHeightUv };
}
