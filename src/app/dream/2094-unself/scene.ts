/**
 * The Canvas2D renderer for 2094 · Unself.
 *
 * A luminous point-cloud FIGURE, a ring-buffer GHOST replay of that figure a
 * growing delay behind, and a drifting-mote DISSOLUTION field — all in a plain
 * 2D context, using additive `globalCompositeOperation = "lighter"` for glow and
 * a translucent fill each frame for luminance trails (which lengthen as time
 * dilates). No GL, no shader compile — the safest substrate.
 *
 * Every visual quantity is driven by the arc state, so minute 6 does not look
 * like minute 1: the ghost peels off, the palette drains to grey, the figure
 * flattens behind glass, then disperses into motes and re-coalesces.
 *
 * No Math.random / Date.now — the figure and its mote drift are seeded once via
 * mulberry32 and animated by the slowed animTime only.
 */

import { mulberry32 } from "./arc";

interface FigurePoint {
  bx: number; // base x, normalised (figure space)
  by: number; // base y, normalised (up = positive)
  size: number; // dot radius multiplier
  depth: number; // -1..1 parallax seed (flattened away as "cardboard")
  dAng: number; // mote drift angle
  dMag: number; // mote drift distance
  phase: number; // per-point wander phase
}

export interface RenderInput {
  tMs: number;
  tiltX: number;
  tiltZ: number;
  animTime: number;
  ghostNorm: number;
  ghostDelaySec: number;
  drain: number;
  flatten: number;
  dissolve: number;
  centerGlow: number;
  trailAlpha: number;
  reduced: boolean;
}

type RGB = [number, number, number];

const SELF_WARM: RGB = [224, 198, 255]; // warm violet-white — present, one self
const GHOST_COOL: RGB = [126, 130, 242]; // detached indigo doppelgänger
const DRAINED: RGB = [150, 150, 160]; // unreal grey

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Build the standing humanoid as a normalised point cloud (once, seeded). */
function buildFigure(): FigurePoint[] {
  const rng = mulberry32(0x2094_5e1f);
  const pts: FigurePoint[] = [];

  const push = (x: number, y: number, sz = 1): void => {
    // Outward drift bias (away from the body's vertical axis + up/down spread).
    const outward = Math.atan2(y - 0.1, x + (rng() - 0.5) * 0.4);
    pts.push({
      bx: x,
      by: y,
      size: 0.55 + rng() * 0.9 * sz,
      depth: rng() * 2 - 1,
      dAng: outward + (rng() - 0.5) * 1.4,
      dMag: 0.5 + rng() * 1.1,
      phase: rng() * Math.PI * 2,
    });
  };

  // Head — filled disc.
  const headY = 0.92;
  const headR = 0.15;
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * headR;
    push(Math.cos(a) * r, headY + Math.sin(a) * r * 1.12, 0.85);
  }

  // Torso — tapering column, shoulders to hips.
  for (let i = 0; i < 150; i++) {
    const t = rng();
    const y = lerp(0.72, 0.12, t);
    const halfW = lerp(0.19, 0.13, t);
    push((rng() * 2 - 1) * halfW, y, 1);
  }

  // Arms — shoulder to hand, both sides.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 55; i++) {
      const t = rng();
      const x = lerp(side * 0.18, side * 0.29, t) + (rng() - 0.5) * 0.03;
      const y = lerp(0.7, 0.16, t) + (rng() - 0.5) * 0.02;
      push(x, y, 0.8);
    }
  }

  // Legs — hips to feet, both sides.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 90; i++) {
      const t = rng();
      const x = lerp(side * 0.07, side * 0.1, t) + (rng() - 0.5) * 0.05;
      const y = lerp(0.12, -1.05, t);
      push(x, y, 1);
    }
  }

  return pts;
}

const POSE_RING = 256;

export class UnselfScene {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private figure: FigurePoint[];

  // Pose ring buffer — wall-time tilt history for the ghost replay.
  private pt = new Float64Array(POSE_RING);
  private px = new Float32Array(POSE_RING);
  private pz = new Float32Array(POSE_RING);
  private head = 0;
  private filled = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    this.canvas = canvas;
    this.ctx = ctx;
    this.figure = buildFigure();
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || this.canvas.clientWidth || 640);
    const cssH = Math.max(1, rect.height || this.canvas.clientHeight || 400);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = cssW;
    this.h = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private pushPose(tMs: number, tiltX: number, tiltZ: number): void {
    this.pt[this.head] = tMs;
    this.px[this.head] = tiltX;
    this.pz[this.head] = tiltZ;
    this.head = (this.head + 1) % POSE_RING;
    if (this.filled < POSE_RING) this.filled++;
  }

  private delayedPose(nowMs: number, lagMs: number): { x: number; z: number } {
    if (this.filled === 0) return { x: 0, z: 0 };
    const target = nowMs - lagMs;
    for (let i = 1; i <= this.filled; i++) {
      const idx = (this.head - i + POSE_RING) % POSE_RING;
      if (this.pt[idx] <= target) {
        const nx = (idx + 1) % POSE_RING;
        const span = this.pt[nx] - this.pt[idx];
        const f = span > 1e-3 ? Math.min(1, Math.max(0, (target - this.pt[idx]) / span)) : 0;
        return {
          x: this.px[idx] + (this.px[nx] - this.px[idx]) * f,
          z: this.pz[idx] + (this.pz[nx] - this.pz[idx]) * f,
        };
      }
    }
    const oldest = (this.head - this.filled + POSE_RING) % POSE_RING;
    return { x: this.px[oldest], z: this.pz[oldest] };
  }

  private drawFigure(
    s: RenderInput,
    tiltX: number,
    tiltZ: number,
    col: RGB,
    baseAlpha: number,
  ): void {
    const ctx = this.ctx;
    const cx = this.w / 2;
    const cy = this.h * 0.52;
    const scale = this.h * 0.3;
    const baseR = Math.max(1.1, this.h / 320);
    const wobAmp = s.reduced ? 0.3 : 1;

    const leanTop = tiltX * 0.24;
    const bobZ = 1 + tiltZ * 0.05;
    const breathe = Math.sin(s.animTime * 0.5) * 0.012;
    const colStr = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;

    for (const p of this.figure) {
      // Flatten removes parallax depth — the "cardboard cutout" look.
      const depthAmt = (1 - s.flatten) * p.depth;
      let x = p.bx + breathe * depthAmt;
      let y = p.by;

      // Lean: the top of the figure sways further than the feet.
      x += leanTop * (y + 1.15) * 0.5;

      // Dispersion into drifting motes at the peak.
      if (s.dissolve > 0.001) {
        const wob = 0.5 + 0.5 * Math.sin(s.animTime * 0.7 + p.phase);
        const spread = s.dissolve * (0.7 + 0.7 * wob * wobAmp);
        x += Math.cos(p.dAng) * p.dMag * spread;
        y += Math.sin(p.dAng) * p.dMag * spread * 0.9;
      }

      const sx = cx + x * scale;
      const sy = cy - y * scale * bobZ;

      const sizeVar = lerp(p.size, 1, s.flatten); // flatten → uniform dots
      let r = baseR * sizeVar * (1 + s.dissolve * 0.5);
      // Motes fade a little as they scatter far.
      const fade = 1 - s.dissolve * 0.35;
      const a = baseAlpha * fade * (0.7 + 0.3 * (1 - s.flatten * 0.4));
      if (a <= 0.003) continue;
      if (r < 0.4) r = 0.4;

      ctx.fillStyle = `rgba(${colStr},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  render(s: RenderInput): void {
    const ctx = this.ctx;
    this.pushPose(s.tMs, s.tiltX, s.tiltZ);

    // ── Trail fade: draw a translucent, slowly draining background over the
    // previous frame. Lower alpha (deeper D) = longer luminance smear.
    const bg = mix([11, 7, 19], [24, 24, 28], s.drain);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(${bg[0] | 0},${bg[1] | 0},${bg[2] | 0},${s.trailAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, this.w, this.h);

    // ── Everything luminous is additive from here.
    ctx.globalCompositeOperation = "lighter";

    // Soft centre-out glow — boundaries melting at the dissolution peak.
    if (s.centerGlow > 0.002) {
      const gcol = mix([120, 92, 210], DRAINED, s.drain);
      const rad = this.h * (0.35 + 0.4 * s.centerGlow);
      const grad = ctx.createRadialGradient(
        this.w / 2,
        this.h * 0.5,
        0,
        this.w / 2,
        this.h * 0.5,
        rad,
      );
      grad.addColorStop(0, `rgba(${gcol[0] | 0},${gcol[1] | 0},${gcol[2] | 0},${(0.28 * s.centerGlow).toFixed(3)})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // ── Ghost self — the delayed doppelgänger, drawn behind.
    if (s.ghostNorm > 0.004) {
      const pose = this.delayedPose(s.tMs, s.ghostDelaySec * 1000);
      const ghostCol = mix(GHOST_COOL, DRAINED, s.drain);
      // Brightens toward parity so you cannot tell which one is "you".
      const gAlpha = 0.5 * (0.28 + 0.62 * s.ghostNorm);
      this.drawFigure(s, pose.x, pose.z, ghostCol, gAlpha);
    }

    // ── Present self.
    const selfCol = mix(SELF_WARM, DRAINED, s.drain);
    // As the ghost reaches parity, the "self" is no longer privileged.
    const selfAlpha = 0.52 * (1 - 0.28 * s.ghostNorm);
    this.drawFigure(s, s.tiltX, s.tiltZ, selfCol, selfAlpha);

    // ── Behind-glass sheen — a faint reflective streak across the field.
    if (s.flatten > 0.01) {
      const streak = ctx.createLinearGradient(0, 0, this.w, this.h);
      const sa = 0.1 * s.flatten;
      streak.addColorStop(0, "rgba(0,0,0,0)");
      streak.addColorStop(0.45, "rgba(0,0,0,0)");
      streak.addColorStop(0.5, `rgba(210,210,224,${sa.toFixed(3)})`);
      streak.addColorStop(0.55, "rgba(0,0,0,0)");
      streak.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = streak;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    // Nothing retained beyond the canvas; clear it once.
    try {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.clearRect(0, 0, this.w, this.h);
    } catch {
      /* context already gone */
    }
  }
}
