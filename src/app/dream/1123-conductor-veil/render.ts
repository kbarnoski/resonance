/**
 * 1123 · Conductor-Veil — Canvas2D aurora over a warm-dark sunset.
 *
 * Aurora ribbons stream from the baton, billowing wider/brighter with dynamics;
 * a luminous fading trail follows the baton; each downbeat drops one soft
 * radial bloom that decays over ~1s (slow luminance only — no strobe). The
 * field is a deep-plum → warm-ember vertical gradient (never a black void).
 * prefers-reduced-motion calms ribbon drift and freezes bloom fades.
 *
 * All per-frame randomness comes from a seeded PRNG — no Math.random here.
 */

const RENDER_SEED = 0x5eed1123;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm palette: peach / rose / gold / violet / amber (hue, sat, light).
const RIBBON_HUES = [24, 344, 44, 282, 34];

interface Ribbon {
  hue: number;
  phase: number;
  freq: number; // spatial wiggle frequency
  speed: number; // phase advance rate
  spread: number; // lateral offset base
  len: number; // 0..1 fraction of reach
}

interface TrailPoint {
  x: number;
  y: number;
}

interface Bloom {
  x: number;
  y: number;
  age: number; // 0..1 over lifetime
  intensity: number;
}

export interface RenderState {
  ribbons: Ribbon[];
  trail: TrailPoint[];
  blooms: Bloom[];
  time: number;
}

export interface RenderParams {
  x: number; // baton, normalized 0..1
  y: number;
  energy: number; // 0..1
  brightness: number; // 0..1
  register: number; // 0..1.2
  beatPhase: number; // 0..1
}

const RIBBON_COUNT = 5;
const TRAIL_MAX = 44;

export function makeRenderState(): RenderState {
  const rng = mulberry32(RENDER_SEED);
  const ribbons: Ribbon[] = [];
  for (let i = 0; i < RIBBON_COUNT; i++) {
    ribbons.push({
      hue: RIBBON_HUES[i % RIBBON_HUES.length],
      phase: rng() * Math.PI * 2,
      freq: 1.6 + rng() * 2.4,
      speed: 0.5 + rng() * 0.7,
      spread: (rng() - 0.5) * 0.5,
      len: 0.55 + rng() * 0.4,
    });
  }
  return { ribbons, trail: [], blooms: [], time: 0 };
}

export function pushTrail(rs: RenderState, x: number, y: number): void {
  const last = rs.trail[rs.trail.length - 1];
  if (last && Math.hypot(last.x - x, last.y - y) < 0.002) return;
  rs.trail.push({ x, y });
  if (rs.trail.length > TRAIL_MAX) rs.trail.shift();
}

export function spawnBloom(
  rs: RenderState,
  x: number,
  y: number,
  intensity: number,
): void {
  rs.blooms.push({ x, y, age: 0, intensity });
  if (rs.blooms.length > 8) rs.blooms.shift();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Deep-plum (top) → warm-ember (bottom). Warm dark sunset, not black.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "hsl(280, 42%, 9%)");
  g.addColorStop(0.5, "hsl(330, 46%, 11%)");
  g.addColorStop(1, "hsl(20, 62%, 15%)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // A soft warm horizon glow near the lower third.
  const rg = ctx.createRadialGradient(
    w * 0.5,
    h * 0.92,
    0,
    w * 0.5,
    h * 0.92,
    Math.max(w, h) * 0.7,
  );
  rg.addColorStop(0, "hsla(30, 80%, 40%, 0.22)");
  rg.addColorStop(1, "hsla(30, 80%, 40%, 0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, w, h);
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bx: number,
  by: number,
  r: Ribbon,
  energy: number,
  brightness: number,
) {
  const steps = 46;
  const reach = h * (0.35 + r.len * 0.5);
  const width = w * (0.02 + energy * 0.05);
  const light = 55 + brightness * 22;
  const alpha = 0.1 + energy * 0.28;

  // Ribbon flows upward from the baton, billowing with a travelling wave.
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = by - reach * t;
    const wave =
      Math.sin(r.phase + t * r.freq * Math.PI * 2) *
      width *
      (0.6 + t) *
      (0.5 + energy);
    const drift = r.spread * w * 0.18 * t;
    const x = bx + wave + drift;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  const grad = ctx.createLinearGradient(bx, by, bx, by - reach);
  grad.addColorStop(0, `hsla(${r.hue}, 88%, ${light}%, ${alpha})`);
  grad.addColorStop(0.5, `hsla(${r.hue}, 90%, ${light + 8}%, ${alpha * 0.7})`);
  grad.addColorStop(1, `hsla(${r.hue}, 92%, ${light + 12}%, 0)`);
  ctx.strokeStyle = grad;
  ctx.lineWidth = width * (1.1 + energy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: TrailPoint[],
  w: number,
  h: number,
  energy: number,
) {
  if (trail.length < 2) return;
  for (let i = 1; i < trail.length; i++) {
    const t = i / trail.length; // 0 old .. 1 recent
    const a = trail[i - 1];
    const b = trail[i];
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.strokeStyle = `hsla(42, 95%, 82%, ${t * (0.35 + energy * 0.4)})`;
    ctx.lineWidth = 1 + t * (2 + energy * 4);
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

function drawBaton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  energy: number,
  beatPhase: number,
) {
  const pulse = 1 - beatPhase; // brightest just after a beat
  const r = 6 + energy * 10 + pulse * 6;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, `hsla(44, 100%, 92%, ${0.85})`);
  g.addColorStop(0.35, `hsla(34, 100%, 74%, ${0.5})`);
  g.addColorStop(1, "hsla(28, 100%, 60%, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "hsla(48, 100%, 96%, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2, r * 0.4), 0, Math.PI * 2);
  ctx.fill();
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  b: Bloom,
  w: number,
  h: number,
) {
  // Slow radial fade — luminance only, no flicker.
  const fade = 1 - b.age;
  if (fade <= 0) return;
  const x = b.x * w;
  const y = b.y * h;
  const radius = Math.max(w, h) * (0.08 + b.age * 0.14);
  const a = fade * fade * (0.28 + b.intensity * 0.22);
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `hsla(38, 95%, 78%, ${a})`);
  g.addColorStop(0.5, `hsla(30, 90%, 66%, ${a * 0.5})`);
  g.addColorStop(1, "hsla(24, 90%, 55%, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function drawFrame(
  rs: RenderState,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: RenderParams,
  dt: number,
  reduced: boolean,
): void {
  const motion = reduced ? 0.22 : 1;
  rs.time += dt;

  drawBackground(ctx, w, h);

  const bx = p.x * w;
  const by = p.y * h;

  // Advance ribbon phases (calmed under reduced motion).
  for (const r of rs.ribbons) {
    r.phase += dt * r.speed * (0.6 + p.energy) * motion;
  }

  ctx.globalCompositeOperation = "lighter";

  // Blooms (behind ribbons), aging over ~1s (frozen under reduced motion).
  for (const b of rs.blooms) {
    drawBloom(ctx, b, w, h);
    b.age = Math.min(1, b.age + dt * (reduced ? 0.12 : 1.0));
  }
  rs.blooms = rs.blooms.filter((b) => b.age < 1);

  for (const r of rs.ribbons) {
    drawRibbon(ctx, w, h, bx, by, r, p.energy, p.brightness);
  }

  drawTrail(ctx, rs.trail, w, h, p.energy);
  drawBaton(ctx, bx, by, p.energy, p.beatPhase);

  ctx.globalCompositeOperation = "source-over";
}
