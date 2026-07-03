/**
 * render.ts — Canvas2D botanical renderer for the garden.
 *
 * Warm daylight palette: pale sky-cream ground, a low warm sun wash, sage /
 * rose / amber plant tones. The plant is drawn as smooth vector strokes; sway
 * is added at draw time (relative-angle walk so the tip moves most). Blooms are
 * soft filled shapes with a gentle glow that shimmers with live breath drive.
 */

import type { Garden, Branch } from "./growth";

interface DrawOpts {
  time: number; // seconds
  drive: number; // 0..1 live breath drive
  reducedMotion: boolean;
}

// world → screen mapping (world: root at 0,0; +y up)
function makeProjector(w: number, h: number) {
  const groundY = h * 0.9;
  const cx = w * 0.5;
  const scale = h * 0.62; // world unit → px
  return {
    groundY,
    sx: (wx: number) => cx + wx * scale,
    sy: (wy: number) => groundY - wy * scale,
    scale,
  };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  drive: number,
): void {
  // dawn sky → cream ground
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#f4e6d0");
  sky.addColorStop(0.42, "#fbeede");
  sky.addColorStop(0.72, "#f7f0e2");
  sky.addColorStop(1, "#efe6d2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // low warm sun wash, gently breathing with drive
  const sunX = w * 0.72;
  const sunY = h * 0.34;
  const r = h * (0.5 + 0.06 * Math.sin(time * 0.3)) * (1 + 0.08 * drive);
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
  sun.addColorStop(0, `rgba(255,239,205,${0.7 + 0.15 * drive})`);
  sun.addColorStop(0.35, "rgba(255,224,178,0.35)");
  sun.addColorStop(1, "rgba(255,224,178,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // soft ground band
  const groundY = h * 0.9;
  const gnd = ctx.createLinearGradient(0, groundY - h * 0.08, 0, h);
  gnd.addColorStop(0, "rgba(150,138,110,0)");
  gnd.addColorStop(1, "rgba(120,108,84,0.22)");
  ctx.fillStyle = gnd;
  ctx.fillRect(0, groundY - h * 0.08, w, h);
}

/** Walk a branch adding sway; return the on-screen points + directions. */
function branchPoints(
  b: Branch,
  proj: ReturnType<typeof makeProjector>,
  o: DrawOpts,
): { x: number; y: number; dir: number }[] {
  const pts: { x: number; y: number; dir: number }[] = [];
  let dir = b.baseAngle;
  let wx = b.rootX;
  let wy = b.rootY;
  pts.push({ x: proj.sx(wx), y: proj.sy(wy), dir });
  const swayAmp = o.reducedMotion ? 0.01 : 0.05 + 0.09 * o.drive;
  for (let i = 0; i < b.nodes.length; i++) {
    const n = b.nodes[i];
    // sway grows with height index so the tip sways most
    const sway =
      swayAmp *
      (0.2 + i * 0.14) *
      Math.sin(o.time * 0.9 + b.swayPhase + i * 0.35);
    dir += n.turn + sway;
    wx += Math.sin(dir) * n.len;
    wy += Math.cos(dir) * n.len;
    pts.push({ x: proj.sx(wx), y: proj.sy(wy), dir });
  }
  return pts;
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  side: number,
  size: number,
  hue: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dir + side * 0.9);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.5, -size * 0.5, 0, -size * 1.6);
  ctx.quadraticCurveTo(-size * 0.5, -size * 0.5, 0, 0);
  ctx.fillStyle = `hsla(${hue + 8}, 40%, 46%, 0.72)`;
  ctx.fill();
  ctx.restore();
}

function drawBranch(
  ctx: CanvasRenderingContext2D,
  b: Branch,
  proj: ReturnType<typeof makeProjector>,
  o: DrawOpts,
): { x: number; y: number; dir: number }[] {
  const pts = branchPoints(b, proj, o);
  if (pts.length < 2) return pts;

  // stem: taper width from base to tip, draw segment-by-segment
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < pts.length; i++) {
    const wpx = Math.max(1.2, b.nodes[i - 1].width * proj.scale);
    const a = pts[i - 1];
    const mid = pts[i];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // quadratic through the segment for a soft curve
    ctx.quadraticCurveTo(
      (a.x + mid.x) / 2,
      (a.y + mid.y) / 2,
      mid.x,
      mid.y,
    );
    ctx.lineWidth = wpx;
    ctx.strokeStyle = `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0.92)`;
    ctx.stroke();
  }

  // leaves
  for (let i = 1; i < pts.length; i++) {
    const n = b.nodes[i - 1];
    if (n.leaf) {
      const leafSize = (0.03 + n.len * 0.4) * proj.scale;
      drawLeaf(ctx, pts[i].x, pts[i].y, pts[i].dir, n.leafSide, leafSize, b.hue);
    }
  }
  return pts;
}

function drawFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  open: number,
  hue: number,
  sat: number,
  light: number,
  petals: number,
  spin: number,
  time: number,
  drive: number,
  reducedMotion: boolean,
): void {
  if (open <= 0.001) return;
  const shimmer = reducedMotion
    ? 1
    : 1 + 0.12 * drive * Math.sin(time * 2 + spin);
  const r = size * open * shimmer;

  // glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${0.4 * open})`);
  glow.addColorStop(1, `hsla(${hue}, ${sat}%, ${light}%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
  ctx.fill();

  // petals
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin + (reducedMotion ? 0 : time * 0.1));
  for (let p = 0; p < petals; p++) {
    ctx.rotate((Math.PI * 2) / petals);
    ctx.beginPath();
    ctx.ellipse(0, r * 0.72, r * 0.44, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${0.82 * open})`;
    ctx.fill();
  }
  // center
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${(hue + 40) % 360}, ${sat}%, ${Math.min(
    88,
    light + 18,
  )}%, ${0.95 * open})`;
  ctx.fill();
  ctx.restore();
}

export function drawGarden(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  garden: Garden,
  o: DrawOpts,
): void {
  drawBackground(ctx, w, h, o.time, o.drive);
  const proj = makeProjector(w, h);

  // cache each branch's swayed points so flowers can sit exactly on the stem
  const cache: { x: number; y: number; dir: number }[][] = [];
  for (const b of garden.branches) {
    cache.push(drawBranch(ctx, b, proj, o));
  }

  // blooms on top
  for (const f of garden.flowers) {
    const pts = cache[f.branch];
    if (!pts) continue;
    const idx = Math.min(f.node + 1, pts.length - 1);
    const pt = pts[idx];
    if (!pt) continue;
    drawFlower(
      ctx,
      pt.x,
      pt.y,
      f.size * proj.scale,
      f.open,
      f.hue,
      f.sat,
      f.light,
      f.petals,
      f.spin,
      o.time,
      o.drive,
      o.reducedMotion,
    );
  }
}
