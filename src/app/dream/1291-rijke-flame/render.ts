// 1291-rijke-flame — render.ts (Canvas2D)
//
// Draws a tall vertical open–open Rijke tube: brushed copper rails + open-end
// rings, a luminous PRESSURE standing wave inside whose lobes track the audio
// amplitude, a glowing gauze/flame at the heat position that flickers harder as
// the tube drives, and heat-shimmer rising above it. Palette: brushed copper /
// brass + ember heat-shimmer on deep charcoal — deliberately industrial/warm.
//
// All fast motion here is SHAPE motion (position wobble), never a full-screen
// luminance strobe. The one macro-brightness modulation (the ember glow) is fed
// in as `flamePulse`, driven by _shared/psych/safeFlicker (≤3 Hz, gentle).

import type { TubeState } from "./model";

export interface TubeGeometry {
  cx: number;
  left: number;
  right: number;
  tubeW: number;
  topY: number;
  bottomY: number;
  tubeLen: number;
}

export function computeGeometry(w: number, h: number, lengthNorm: number): TubeGeometry {
  const tubeW = Math.max(120, Math.min(240, w * 0.22));
  const cx = w * 0.5;
  const bottomY = h * 0.9;
  const maxLen = h * 0.74;
  const tubeLen = lengthNorm * maxLen;
  const topY = bottomY - tubeLen;
  return { cx, left: cx - tubeW / 2, right: cx + tubeW / 2, tubeW, topY, bottomY, tubeLen };
}

/** Screen-y of the heat source for a heat position 0..1 (0 bottom, 1 top). */
export function heatToY(g: TubeGeometry, heat: number): number {
  return g.bottomY - heat * g.tubeLen;
}
/** Inverse: a screen-y back to a heat position 0..1. */
export function yToHeat(g: TubeGeometry, y: number): number {
  return Math.max(0, Math.min(1, (g.bottomY - y) / g.tubeLen));
}

export interface DrawOpts {
  hoverCap: boolean;
  hoverFlame: boolean;
  auto: boolean;
  flamePulse: number; // 0..1 gentle ≤3Hz ember brightness (safeFlicker)
  reduced: boolean;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: TubeState,
  t: number,
  opts: DrawOpts,
) {
  const g = computeGeometry(w, h, state.lengthNorm);

  // ── Background: deep charcoal with a faint warm floor glow ──
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#0d0b09");
  bg.addColorStop(0.6, "#14100c");
  bg.addColorStop(1, "#1c130c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // A low ember pool at the base, warms with drive.
  const floor = ctx.createRadialGradient(g.cx, g.bottomY + 20, 10, g.cx, g.bottomY + 20, w * 0.6);
  floor.addColorStop(0, `rgba(120,45,12,${0.1 + 0.22 * state.drive})`);
  floor.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, h);

  // ── Tube interior (dark warm glass) ──
  ctx.save();
  rr(ctx, g.left, g.topY, g.tubeW, g.tubeLen, 14);
  ctx.clip();

  const inner = ctx.createLinearGradient(g.left, 0, g.right, 0);
  inner.addColorStop(0, "#1a1109");
  inner.addColorStop(0.5, "#241811");
  inner.addColorStop(1, "#160f08");
  ctx.fillStyle = inner;
  ctx.fillRect(g.left, g.topY, g.tubeW, g.tubeLen);

  // ── Pressure standing wave (glow lobes) ──
  ctx.globalCompositeOperation = "lighter";
  const pulse = 0.86 + 0.14 * opts.flamePulse;
  const maxHalf = g.tubeW * 0.5 - 10;
  const step = 5;
  for (let y = g.topY; y <= g.bottomY; y += step) {
    const p = (g.bottomY - y) / g.tubeLen; // 0 at bottom, 1 at top
    const env1 = Math.abs(Math.sin(Math.PI * p));
    const env2 = Math.abs(Math.sin(2 * Math.PI * p));
    const amp = state.a1 * env1 + state.a2 * 0.7 * env2;
    if (amp < 0.004) continue;
    const half = maxHalf * (0.06 + 0.94 * Math.min(1, amp)) * pulse;
    const glow = ctx.createLinearGradient(g.cx - half, 0, g.cx + half, 0);
    const core = 0.5 + 0.5 * Math.min(1, amp);
    glow.addColorStop(0, "rgba(255,150,60,0)");
    glow.addColorStop(0.5, `rgba(255,${Math.round(180 + 60 * core)},110,${0.16 * core})`);
    glow.addColorStop(1, "rgba(255,150,60,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(g.cx - half, y, half * 2, step + 1);
  }

  // Node markers (pressure zeros) when singing — small ticks at the open ends /
  // centre for the octave — subtle, brass.
  if (state.drive > 0.05) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(210,170,90,${0.12 + 0.2 * state.a2})`;
    ctx.lineWidth = 1;
    const midY = heatToY(g, 0.5);
    ctx.beginPath();
    ctx.moveTo(g.left + 6, midY);
    ctx.lineTo(g.right - 6, midY);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
  }

  // ── Flame / gauze at heat position ──
  const fy = heatToY(g, state.heat);
  const flick = opts.reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 17.3 + Math.sin(t * 6.1) * 2);
  const bright = (0.55 + 0.45 * opts.flamePulse) * (0.7 + 0.5 * state.drive);
  // Gauze bar (the heat source itself) — always glowing, hotter with drive.
  const gaugeGrad = ctx.createLinearGradient(g.left, fy, g.right, fy);
  gaugeGrad.addColorStop(0, "rgba(255,120,40,0)");
  gaugeGrad.addColorStop(0.5, `rgba(255,${Math.round(150 + 80 * bright)},70,${0.55 + 0.4 * bright})`);
  gaugeGrad.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = gaugeGrad;
  ctx.fillRect(g.left, fy - 4, g.tubeW, 8);

  // Flame tongues licking upward, taller & wilder with drive.
  const flameH = Math.min(g.tubeW * 1.6, g.tubeW * (0.28 + 1.35 * state.drive));
  const tongues = 5;
  for (let i = 0; i < tongues; i++) {
    const fx = g.cx + (i - (tongues - 1) / 2) * (g.tubeW / (tongues + 0.5));
    const wob = opts.reduced ? 0 : Math.sin(t * (4 + i) + i * 2) * 6 * (0.5 + state.drive);
    const hh = flameH * (0.6 + 0.4 * ((i % 2) === 0 ? 1 : 0.7)) * (0.7 + 0.6 * flick);
    const fg = ctx.createLinearGradient(0, fy, 0, fy - hh);
    fg.addColorStop(0, `rgba(255,220,140,${0.5 * bright})`);
    fg.addColorStop(0.35, `rgba(255,140,40,${0.4 * bright})`);
    fg.addColorStop(1, "rgba(200,40,10,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(fx - 9, fy);
    ctx.quadraticCurveTo(fx - 5 + wob, fy - hh * 0.5, fx + wob * 0.5, fy - hh);
    ctx.quadraticCurveTo(fx + 5 + wob, fy - hh * 0.5, fx + 9, fy);
    ctx.closePath();
    ctx.fill();
  }
  // Bright core at the gauze.
  const coreGlow = ctx.createRadialGradient(g.cx, fy, 2, g.cx, fy, g.tubeW * 0.55);
  coreGlow.addColorStop(0, `rgba(255,235,180,${0.5 * bright})`);
  coreGlow.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = coreGlow;
  ctx.fillRect(g.left - 10, fy - g.tubeW, g.tubeW + 20, g.tubeW * 2);

  // ── Heat shimmer: wavy translucent streaks rising above the flame ──
  if (state.drive > 0.02 && !opts.reduced) {
    ctx.strokeStyle = `rgba(255,190,120,${0.05 + 0.12 * state.drive})`;
    ctx.lineWidth = 1.2;
    const shimTop = Math.max(g.topY, fy - flameH - 60);
    for (let sx = -2; sx <= 2; sx++) {
      const baseX = g.cx + sx * (g.tubeW * 0.18);
      ctx.beginPath();
      for (let yy = fy; yy >= shimTop; yy -= 6) {
        const prog = (fy - yy) / (fy - shimTop + 1);
        const off = Math.sin(yy * 0.06 + t * 3 + sx) * 6 * prog;
        if (yy === fy) ctx.moveTo(baseX + off, yy);
        else ctx.lineTo(baseX + off, yy);
      }
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.restore(); // un-clip

  // ── Copper rails (tube walls) on the interior edges ──
  const railW = 10;
  for (const rx of [g.left, g.right - railW]) {
    const rg = ctx.createLinearGradient(rx, 0, rx + railW, 0);
    rg.addColorStop(0, "#5a3418");
    rg.addColorStop(0.35, "#c9863f");
    rg.addColorStop(0.5, "#f0c078");
    rg.addColorStop(0.65, "#b06a2c");
    rg.addColorStop(1, "#3d2410");
    ctx.fillStyle = rg;
    rr(ctx, rx, g.topY, railW, g.tubeLen, 5);
    ctx.fill();
  }
  // Faint brushed-metal specular streaks on the rails.
  ctx.strokeStyle = "rgba(255,225,170,0.10)";
  ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) {
    const sx = g.left + 3 + k * 2;
    ctx.beginPath();
    ctx.moveTo(sx, g.topY + 6);
    ctx.lineTo(sx, g.bottomY - 6);
    ctx.stroke();
  }

  // ── Open-end rings (top & bottom) ──
  for (const [ey, isTop] of [
    [g.topY, true],
    [g.bottomY, false],
  ] as [number, boolean][]) {
    ctx.save();
    ctx.translate(g.cx, ey);
    const ringGrad = ctx.createLinearGradient(-g.tubeW / 2, 0, g.tubeW / 2, 0);
    ringGrad.addColorStop(0, "#6b3d1c");
    ringGrad.addColorStop(0.5, "#e6b46a");
    ringGrad.addColorStop(1, "#5a3418");
    ctx.fillStyle = ringGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, g.tubeW / 2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // dark opening
    ctx.fillStyle = "#0b0703";
    ctx.beginPath();
    ctx.ellipse(0, 0, g.tubeW / 2 - railW, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Length handle knob sits on the top ring.
    if (isTop) {
      ctx.fillStyle = opts.hoverCap ? "#ffe0a0" : "#f0c078";
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Flame drag handle ring (so it reads as grabbable) ──
  ctx.strokeStyle = opts.hoverFlame ? "rgba(255,220,150,0.9)" : "rgba(255,180,110,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(g.cx, fy, g.tubeW / 2 + 6, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
}
