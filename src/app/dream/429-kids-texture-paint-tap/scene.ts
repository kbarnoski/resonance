/**
 * scene.ts — Canvas2D textured stamp/stroke rendering
 *
 * Each brush has a distinct visual texture designed for cross-modal
 * sound-symbolism (bouba/kiki): spiky look ↔ sharp sound, round look ↔ soft.
 *
 * CRUNCH  — jagged/spiky star cluster (sharp/kiki)
 * POP     — soft round bubble circles (round/bouba)
 * TAP     — dry rectangular block stamp (angular)
 * SCRATCH — thin jagged scratch lines (kiki/angular)
 * SPLASH  — radial drip splatter (organic/round)
 */

export type BrushId = 'crunch' | 'pop' | 'tap' | 'scratch' | 'splash';

export interface StampMark {
  brushId: BrushId;
  x: number;
  y: number;
  size: number;
  rotation: number;
  alpha: number;
  seed: number;
}

// Colour palettes per brush — vivid on dark bg
const BRUSH_COLORS: Record<BrushId, string[]> = {
  crunch:  ['#f59e0b', '#fbbf24', '#d97706', '#fcd34d', '#f97316'],
  pop:     ['#a78bfa', '#c084fc', '#818cf8', '#e879f9', '#7c3aed'],
  tap:     ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#059669'],
  scratch: ['#f472b6', '#fb7185', '#e11d48', '#fda4af', '#be123c'],
  splash:  ['#38bdf8', '#7dd3fc', '#0ea5e9', '#bae6fd', '#0284c7'],
};

function pickColor(brushId: BrushId, seed: number): string {
  const arr = BRUSH_COLORS[brushId];
  return arr[seed % arr.length];
}

// --- STAMP DRAWERS ---

function drawCrunchStamp(
  ctx: CanvasRenderingContext2D,
  mark: StampMark,
): void {
  const { x, y, size, rotation, seed } = mark;
  const rng = seedRng(seed);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Draw a cluster of spiky stars/shards
  const count = 3 + (seed % 4);
  for (let i = 0; i < count; i++) {
    const ox = (rng() - 0.5) * size * 0.8;
    const oy = (rng() - 0.5) * size * 0.8;
    const r = size * (0.15 + rng() * 0.25);
    const spikes = 5 + Math.floor(rng() * 4);
    ctx.fillStyle = pickColor('crunch', seed + i);
    ctx.beginPath();
    for (let s = 0; s < spikes * 2; s++) {
      const angle = (s / (spikes * 2)) * Math.PI * 2;
      const radius = s % 2 === 0 ? r : r * 0.4;
      const px = ox + Math.cos(angle) * radius;
      const py = oy + Math.sin(angle) * radius;
      if (s === 0) { ctx.moveTo(px, py); } else { ctx.lineTo(px, py); }
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawPopStamp(
  ctx: CanvasRenderingContext2D,
  mark: StampMark,
): void {
  const { x, y, size, seed } = mark;
  const rng = seedRng(seed);

  ctx.save();
  ctx.translate(x, y);

  // Soft overlapping circles (bouba)
  const count = 2 + (seed % 3);
  for (let i = 0; i < count; i++) {
    const ox = (rng() - 0.5) * size * 0.5;
    const oy = (rng() - 0.5) * size * 0.5;
    const r = size * (0.25 + rng() * 0.25);
    const col = pickColor('pop', seed + i);
    const grad = ctx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 0, ox, oy, r);
    grad.addColorStop(0, col + 'ff');
    grad.addColorStop(0.7, col + 'aa');
    grad.addColorStop(1, col + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
    ctx.fill();

    // Highlight ring
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ox - r * 0.2, oy - r * 0.2, r * 0.5, Math.PI * 1.1, Math.PI * 1.7);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTapStamp(
  ctx: CanvasRenderingContext2D,
  mark: StampMark,
): void {
  const { x, y, size, rotation, seed } = mark;
  const rng = seedRng(seed);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Dry rectangular blocks (angular/woody)
  const count = 2 + (seed % 3);
  for (let i = 0; i < count; i++) {
    const ox = (rng() - 0.5) * size * 0.6;
    const oy = (rng() - 0.5) * size * 0.6;
    const w = size * (0.18 + rng() * 0.22);
    const h = size * (0.1 + rng() * 0.14);
    const angle = (rng() - 0.5) * 0.8;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(angle);
    ctx.fillStyle = pickColor('tap', seed + i);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // Grain lines
    ctx.strokeStyle = '#00000022';
    ctx.lineWidth = 1;
    for (let g = 0; g < 3; g++) {
      const ly = -h / 2 + (g + 1) * h / 4;
      ctx.beginPath();
      ctx.moveTo(-w / 2, ly);
      ctx.lineTo(w / 2, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawScratchStamp(
  ctx: CanvasRenderingContext2D,
  mark: StampMark,
): void {
  const { x, y, size, rotation, seed } = mark;
  const rng = seedRng(seed);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Jagged scratch lines radiating from centre
  const count = 3 + (seed % 5);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.4;
    const len = size * (0.3 + rng() * 0.5);
    ctx.strokeStyle = pickColor('scratch', seed + i);
    ctx.lineWidth = 1.5 + rng() * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);

    // Jagged path
    const segments = 3 + Math.floor(rng() * 3);
    let cx = 0, cy = 0;
    for (let s = 0; s < segments; s++) {
      const t = (s + 1) / segments;
      const jitter = (rng() - 0.5) * size * 0.12;
      cx = Math.cos(angle) * len * t + Math.cos(angle + Math.PI / 2) * jitter;
      cy = Math.sin(angle) * len * t + Math.sin(angle + Math.PI / 2) * jitter;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawSplashStamp(
  ctx: CanvasRenderingContext2D,
  mark: StampMark,
): void {
  const { x, y, size, seed } = mark;
  const rng = seedRng(seed);

  ctx.save();
  ctx.translate(x, y);

  // Central drip blob
  const blobR = size * 0.22;
  const col = pickColor('splash', seed);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, blobR);
  grad.addColorStop(0, col + 'ee');
  grad.addColorStop(1, col + '44');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, blobR, 0, Math.PI * 2);
  ctx.fill();

  // Radial droplets
  const drops = 5 + (seed % 5);
  for (let i = 0; i < drops; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = size * (0.25 + rng() * 0.35);
    const dr = size * (0.04 + rng() * 0.1);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    ctx.fillStyle = pickColor('splash', seed + i + 1);
    ctx.beginPath();
    // Teardrop shape pointing back toward centre
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(angle + Math.PI);
    ctx.arc(0, 0, dr, 0, Math.PI * 2);
    ctx.restore();
    ctx.fill();
  }

  // Thin connecting trails
  for (let i = 0; i < drops; i++) {
    const angle = (i / drops) * Math.PI * 2;
    const dist = size * (0.22 + rng() * 0.2);
    ctx.strokeStyle = col + '55';
    ctx.lineWidth = 1 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
    ctx.stroke();
  }

  ctx.restore();
}

// --- STAMP SIZE per brush ---
export function getStampSize(brushId: BrushId, pressure: number): number {
  const base: Record<BrushId, number> = {
    crunch: 52, pop: 60, tap: 48, scratch: 58, splash: 64,
  };
  return base[brushId] * (0.7 + pressure * 0.6);
}

// --- DRAW A SINGLE MARK ---
export function drawMark(ctx: CanvasRenderingContext2D, mark: StampMark): void {
  ctx.save();
  ctx.globalAlpha = mark.alpha;
  switch (mark.brushId) {
    case 'crunch':  drawCrunchStamp(ctx, mark);  break;
    case 'pop':     drawPopStamp(ctx, mark);     break;
    case 'tap':     drawTapStamp(ctx, mark);     break;
    case 'scratch': drawScratchStamp(ctx, mark); break;
    case 'splash':  drawSplashStamp(ctx, mark);  break;
  }
  ctx.restore();
}

// Tiny deterministic RNG from a seed (simple LCG)
function seedRng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
