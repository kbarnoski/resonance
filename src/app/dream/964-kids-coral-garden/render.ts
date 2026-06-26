// Canvas2D luminous renderer for the coral garden.
// Pure Canvas2D (no WebGL/WebGPU) for a bulletproof everywhere-render.
// Glow via shadowBlur + layered semi-transparent strokes; radial-gradient seeds.

import type { CoralGarden, Strand } from "./growth";

// Deep underwater background: indigo -> violet -> teal.
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
  g.addColorStop(0, "#0a0a2e");
  g.addColorStop(0.5, "#1a0f3a");
  g.addColorStop(1, "#04222e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // soft drifting light shafts
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i++) {
    const x = (w * (0.2 + i * 0.3)) + Math.sin(t * 0.0002 + i) * 40;
    const rg = ctx.createRadialGradient(x, -50, 0, x, -50, h * 0.9);
    rg.addColorStop(0, "rgba(80,120,200,0.05)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// Trailing-alpha clear for dreamy persistence (call instead of drawBackground
// once seeded, for the glow trails).
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8,8,30,0.16)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function hueColor(hue: number, light: number, alpha: number): string {
  return `hsla(${hue}, 85%, ${light}%, ${alpha})`;
}

function drawStrand(
  ctx: CanvasRenderingContext2D,
  s: Strand,
  pulse: number,
): void {
  const ns = s.nodes;
  if (ns.length < 2) return;

  // Outer bloom pass — wide, very soft, heavy shadow blur.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowBlur = 18;
  ctx.shadowColor = hueColor(s.hue, 60, 0.9);
  ctx.strokeStyle = hueColor(s.hue, 45, 0.16);
  ctx.lineWidth = 6;
  strokePath(ctx, ns);

  // Mid glow pass.
  ctx.shadowBlur = 8;
  ctx.shadowColor = hueColor((s.hue + 20) % 360, 70, 0.8);
  ctx.strokeStyle = hueColor((s.hue + 15) % 360, 70, 0.32);
  ctx.lineWidth = 2.6;
  strokePath(ctx, ns);

  // Bright core.
  ctx.shadowBlur = 4;
  ctx.shadowColor = "rgba(255,240,230,0.8)";
  ctx.strokeStyle = `rgba(255,250,245,${0.5 + pulse * 0.2})`;
  ctx.lineWidth = 1.1;
  strokePath(ctx, ns);
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, ns: Strand["nodes"]): void {
  ctx.beginPath();
  ctx.moveTo(ns[0].x, ns[0].y);
  for (let i = 1; i < ns.length; i++) {
    // quadratic smoothing between points
    const a = ns[i - 1];
    const b = ns[i];
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    ctx.quadraticCurveTo(a.x, a.y, mx, my);
  }
  ctx.stroke();
}

// Glowing radial seed/tip node.
function drawGlowNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hue: number,
  intensity: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hueColor(hue, 90, 0.9 * intensity));
  g.addColorStop(0.4, hueColor(hue, 70, 0.4 * intensity));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawGarden(
  ctx: CanvasRenderingContext2D,
  garden: CoralGarden,
  t: number,
  activeStrand: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.003);
  for (const s of garden.strands) {
    drawStrand(ctx, s, pulse);
  }
  // glowing roots + active tip
  for (let i = 0; i < garden.strands.length; i++) {
    const s = garden.strands[i];
    if (s.nodes.length === 0) continue;
    const root = s.nodes[0];
    drawGlowNode(ctx, root.x, root.y, 14, s.hue, 0.5);
    const tip = s.nodes[s.nodes.length - 1];
    const isActive = i === activeStrand;
    drawGlowNode(
      ctx,
      tip.x,
      tip.y,
      isActive ? 16 + pulse * 6 : 8,
      (s.hue + 30) % 360,
      isActive ? 1 : 0.5,
    );
  }
}
