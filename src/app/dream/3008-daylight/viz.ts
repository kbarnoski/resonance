// viz.ts — 3008 · Daylight
//
// A soft cosmic aurora that IS the sound made visible. The same three light
// scalars drive both: the image and the chord are one gesture.
//
//   L → overall luminosity + how far the aurora reaches + core pulse
//   H → colour temperature along the violet arc (indigo when cool, magenta
//        when warm) — raw hsla lives here, inside the art layer, only
//   M → shimmer: ribbon turbulence, sparkle count, and drift speed
//
// DPR-aware. Additive ('lighter') compositing gives the luminous glow; a
// translucent violet wash each frame leaves gentle motion trails.

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

const RIBBONS = 5;

export class AuroraRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private sparks: Spark[] = [];
  private ribbonPhase: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    for (let i = 0; i < RIBBONS; i++) this.ribbonPhase.push(i * 1.7);
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Colour temperature along the violet arc: cool → indigo, warm → magenta. */
  private hue(H: number): number {
    // 250 (indigo) at H=0 up to 305 (magenta) at H=1.
    return 250 + H * 55;
  }

  render(L: number, H: number, M: number, time: number): void {
    const ctx = this.ctx;
    const { w, h } = this;
    const hue = this.hue(H);

    // Motion-trail wash — darker (clears faster) when the room is dark, so a
    // hushed room settles toward black; brighter rooms keep more glow.
    ctx.globalCompositeOperation = "source-over";
    const clear = 0.1 + (1 - L) * 0.14;
    ctx.fillStyle = `hsla(258, 45%, 4%, ${clear})`;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";

    // Aurora ribbons — wavy horizontal bands of light sweeping the frame.
    const cy = h * 0.52;
    const reach = h * (0.16 + L * 0.5);
    for (let i = 0; i < RIBBONS; i++) {
      const phase = this.ribbonPhase[i];
      const speed = 0.06 + M * 0.5;
      const bandY =
        cy +
        Math.sin(time * (0.15 + i * 0.05) + phase) * reach * (0.3 + i * 0.16);
      const thickness = h * (0.06 + 0.05 * L) * (1 + i * 0.2);
      const alpha = (0.05 + 0.14 * L) * (1 - i * 0.12);
      const lightness = 40 + L * 26 + i * 3;
      const ribbonHue = hue + (i - RIBBONS / 2) * 6;

      const grad = ctx.createLinearGradient(0, bandY - thickness, 0, bandY + thickness);
      grad.addColorStop(0, `hsla(${ribbonHue}, 85%, ${lightness}%, 0)`);
      grad.addColorStop(0.5, `hsla(${ribbonHue}, 85%, ${lightness}%, ${alpha})`);
      grad.addColorStop(1, `hsla(${ribbonHue}, 85%, ${lightness}%, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      const steps = 24;
      ctx.moveTo(0, bandY - thickness);
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * w;
        const wob =
          Math.sin(x * 0.006 + time * speed + phase) * thickness * 0.9 +
          Math.sin(x * 0.017 - time * speed * 1.4 + phase) * thickness * 0.5 * M;
        ctx.lineTo(x, bandY - thickness + wob);
      }
      for (let s = steps; s >= 0; s--) {
        const x = (s / steps) * w;
        const wob =
          Math.sin(x * 0.006 + time * speed + phase) * thickness * 0.9 +
          Math.sin(x * 0.017 - time * speed * 1.4 + phase) * thickness * 0.5 * M;
        ctx.lineTo(x, bandY + thickness + wob);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Breathing core — the luminous heart that pulses with the chord's level.
    const pulse = 0.85 + 0.15 * Math.sin(time * 0.6);
    const coreR = Math.min(w, h) * (0.12 + L * 0.4) * pulse;
    const core = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, coreR);
    const coreA = 0.05 + L * 0.32;
    core.addColorStop(0, `hsla(${hue + 8}, 90%, ${55 + L * 25}%, ${coreA})`);
    core.addColorStop(0.5, `hsla(${hue}, 85%, 50%, ${coreA * 0.4})`);
    core.addColorStop(1, `hsla(${hue}, 80%, 45%, 0)`);
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, w, h);

    // Sparkles — spawn on motion, drift, fade. Count scales with L·M.
    const targetSpawn = M * (0.5 + L) * 2.5;
    if (Math.random() < targetSpawn && this.sparks.length < 180) {
      const count = 1 + Math.floor(M * 4);
      for (let k = 0; k < count; k++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * 90 * M;
        this.sparks.push({
          x: w / 2 + (Math.random() - 0.5) * w * 0.5,
          y: cy + (Math.random() - 0.5) * h * 0.5,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          r: 0.6 + Math.random() * 2.2,
          life: 1,
        });
      }
    }
    const dt = 1 / 60;
    const alive: Spark[] = [];
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.97;
      s.vy *= 0.97;
      s.life -= dt * 0.9;
      if (s.life <= 0) continue;
      const a = s.life * (0.3 + L * 0.5);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
      g.addColorStop(0, `hsla(${hue + 20}, 95%, 80%, ${a})`);
      g.addColorStop(1, `hsla(${hue + 20}, 95%, 70%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
      ctx.fill();
      alive.push(s);
    }
    this.sparks = alive;

    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.sparks = [];
  }
}
