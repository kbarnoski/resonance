// ════════════════════════════════════════════════════════════════════════════
// curtains.ts — the Canvas2D auroral CURTAIN FIELD for Auroral (1259)
//
// Slow, weightless, boundless vertical auroral curtains drifting across a deep
// near-black sky, over a faint seeded star/void backdrop. Additive glow. Palette
// is the classic desaturated-luminous aurora register: green → teal at rest,
// with violet/magenta CROWNS blooming at the tops only when energy is high —
// NOT a saturated jewel-on-dark object, NOT a flat pale print.
//
// The whole field is driven by the live AuroraState:
//   • intensity (Kp-weighted)  → curtain count, brightness, drift speed, violet
//   • band[] (the real northern oval, folded across longitude) → each curtain's
//     local brightness is sampled from the true oval crest at its longitude.
// So the structure you watch is literally the shape of Earth's aurora right now.
//
// SAFETY: no strobe/flash. All shimmer is smooth sinusoidal motion well under
// 3 Hz; luminance eases toward targets. Honors prefers-reduced-motion (slower
// drift). Never renders a blank canvas — sky + baseline shimmer draw on mount,
// before audio.
// ════════════════════════════════════════════════════════════════════════════

import type { AuroraState, Hotspot } from "./feeds";

const DPR_CAP = 1.6;

interface Curtain {
  // Longitude "home" 0..1 (maps into band[]); the curtain slowly drifts in x.
  u: number;
  drift: number; // u per second (signed)
  widthFrac: number; // fraction of viewport width
  swayAmp: number; // px horizontal sway amplitude
  swayFreq: number; // Hz
  swayPhase: number;
  rayCount: number;
  raySeed: number; // per-ray shimmer phase offset base
  depth: number; // 0 (far/dim/slow) .. 1 (near/bright/fast) — parallax
  bright: number; // eased current brightness
  pulse: number; // transient bloom 0..1 (from a chime hotspot)
}

interface Star {
  x: number; // 0..1
  y: number; // 0..1 (upper sky only)
  r: number;
  tw: number; // twinkle phase
}

// A tiny seeded LCG so the star field + curtain layout are deterministic.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export class CurtainField {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private lastT = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  private reducedMotion = false;
  private curtains: Curtain[] = [];
  private stars: Star[] = [];
  private state: AuroraState | null = null;

  // Eased global values so live-data updates never jump.
  private intensity = 0.32;
  private targetIntensity = 0.32;
  private band: number[] = [];

  // Pre-tinted luminous ray sprites (green core → teal), + a violet crown.
  private raySprites: HTMLCanvasElement[] = [];
  private crownSprite: HTMLCanvasElement | null = null;
  private readonly HUES = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D unavailable");
    this.ctx = ctx;
    if (typeof window !== "undefined" && window.matchMedia) {
      this.reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
    this.buildSprites();
    this.resize();
    this.buildScene();
    // Draw one frame immediately so the sky is never blank before RAF/audio.
    this.render(0);
  }

  /** Feed a fresh AuroraState (live or sample). Eased in — never a jump-cut. */
  setState(s: AuroraState): void {
    this.state = s;
    this.targetIntensity = s.intensity;
    this.band = s.band && s.band.length > 0 ? s.band : this.band;
    // Rebuild curtains only if the count should change materially.
    const want = 3 + Math.round(s.intensity * 8);
    if (Math.abs(want - this.curtains.length) >= 1) this.layoutCurtains(want);
  }

  /** A chime fired for this hotspot → bloom the nearest curtain briefly. */
  pulseAt(hot: Hotspot): void {
    const u = (((hot.lon % 360) + 360) % 360) / 360;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.curtains.length; i++) {
      let d = Math.abs(this.curtains[i].u - u);
      d = Math.min(d, 1 - d);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) this.curtains[best].pulse = 1;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.render(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  resize(): void {
    if (typeof window === "undefined") return;
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const rect = this.canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.floor(rect.width * dpr));
    const ch = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.w = cw;
    this.h = ch;
  }

  // ── sprite baking ─────────────────────────────────────────────────────────
  // One narrow vertical ray: a horizontal gaussian, a vertical gradient that is
  // bright low and fades up. Baked white, then tinted per hue via source-in.
  private buildSprites(): void {
    const SW = 64;
    const SH = 256;

    const base = document.createElement("canvas");
    base.width = SW;
    base.height = SH;
    const bctx = base.getContext("2d");
    if (!bctx) return;
    const img = bctx.createImageData(SW, SH);
    const cx = (SW - 1) / 2;
    for (let y = 0; y < SH; y++) {
      const vy = y / (SH - 1); // 0 top .. 1 bottom
      // Aurora curtains are brightest low, feather up into the sky.
      const vgrad = Math.pow(1 - vy, 0.7) * (0.35 + 0.65 * (1 - vy));
      for (let x = 0; x < SW; x++) {
        const dx = (x - cx) / (SW * 0.28);
        const hg = Math.exp(-dx * dx); // horizontal gaussian falloff
        const a = Math.max(0, Math.min(1, hg * vgrad));
        const idx = (y * SW + x) * 4;
        img.data[idx] = 255;
        img.data[idx + 1] = 255;
        img.data[idx + 2] = 255;
        img.data[idx + 3] = Math.round(a * 255);
      }
    }
    bctx.putImageData(img, 0, 0);

    // Green → teal ramp of tinted ray sprites.
    this.raySprites = [];
    for (let i = 0; i < this.HUES; i++) {
      const t = i / (this.HUES - 1);
      // green (150,255,150-ish) → teal (90,255,210)
      const r = Math.round(150 - 70 * t);
      const g = 255;
      const b = Math.round(140 + 90 * t);
      this.raySprites.push(this.tint(base, r, g, b));
    }
    // Violet/magenta crown (only appears at high energy, at the tops).
    this.crownSprite = this.tint(base, 210, 120, 255);
  }

  private tint(base: HTMLCanvasElement, r: number, g: number, b: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = base.width;
    c.height = base.height;
    const cx = c.getContext("2d");
    if (!cx) return c;
    cx.drawImage(base, 0, 0);
    cx.globalCompositeOperation = "source-in";
    cx.fillStyle = `rgb(${r},${g},${b})`;
    cx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ── scene layout ──────────────────────────────────────────────────────────
  private buildScene(): void {
    const rng = makeRng(0x5eed12);
    this.stars = [];
    const n = 220;
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: rng(),
        y: rng() * 0.62, // upper sky
        r: 0.4 + rng() * 1.3,
        tw: rng() * Math.PI * 2,
      });
    }
    this.layoutCurtains(6);
  }

  private layoutCurtains(count: number): void {
    const rng = makeRng(0xc0ffee ^ count);
    const arr: Curtain[] = [];
    const prev = this.curtains;
    for (let i = 0; i < count; i++) {
      const old = prev[i];
      const depth = rng();
      arr.push(
        old ?? {
          u: rng(),
          drift: (rng() - 0.5) * 0.012 * (0.4 + depth), // slow longitudinal drift
          widthFrac: 0.1 + rng() * 0.16,
          swayAmp: 10 + rng() * 26,
          swayFreq: 0.03 + rng() * 0.07, // very slow sway, well under 3 Hz
          swayPhase: rng() * Math.PI * 2,
          rayCount: 10 + Math.floor(rng() * 12),
          raySeed: rng() * 100,
          depth,
          bright: 0.2,
          pulse: 0,
        },
      );
    }
    this.curtains = arr;
  }

  private sampleBand(u: number): number {
    if (!this.band || this.band.length === 0) return 0.5;
    const n = this.band.length;
    const f = (((u % 1) + 1) % 1) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const frac = f - Math.floor(f);
    return this.band[i0] * (1 - frac) + this.band[i1] * frac;
  }

  // ── the frame ─────────────────────────────────────────────────────────────
  private render(dt: number): void {
    const ctx = this.ctx;
    const W = this.w;
    const H = this.h;
    const now = performance.now() / 1000;
    const motion = this.reducedMotion ? 0.35 : 1;

    // Ease global intensity toward its live target.
    const ease = 1 - Math.exp(-dt / 1.2);
    this.intensity += (this.targetIntensity - this.intensity) * (dt > 0 ? ease : 1);
    const inten = this.intensity;

    // ── deep sky: near-black with a faint cool vertical wash ──
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#03040a");
    sky.addColorStop(0.55, "#04070f");
    sky.addColorStop(1, `rgb(${4 + inten * 6},${10 + inten * 14},${14 + inten * 10})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // ── stars (additive, slow smooth twinkle) ──
    ctx.globalCompositeOperation = "lighter";
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(now * 0.5 * motion + s.tw); // ~0.08 Hz
      const a = tw * (0.5 - inten * 0.28); // stars fade as the sky brightens
      if (a <= 0) continue;
      const px = s.x * W;
      const py = s.y * H;
      const r = s.r * this.dpr;
      ctx.fillStyle = `rgba(200,220,255,${a})`;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── curtains (additive) ──
    const skyTop = H * 0.04;
    const skyBottom = H * 0.9;

    for (const c of this.curtains) {
      // drift the longitude home slowly
      c.u = (c.u + c.drift * dt * motion + 1) % 1;
      if (c.pulse > 0) c.pulse = Math.max(0, c.pulse - dt * 0.6);

      // local brightness = the REAL oval crest at this curtain's longitude
      const local = this.sampleBand(c.u);
      const targetBright = (0.18 + 0.82 * local) * (0.35 + 0.65 * inten);
      c.bright += (targetBright - c.bright) * (dt > 0 ? 1 - Math.exp(-dt / 0.9) : 1);
      const bright = Math.min(1.1, c.bright + c.pulse * 0.7);
      if (bright <= 0.01) continue;

      const sway =
        Math.sin(now * c.swayFreq * 2 * Math.PI * motion + c.swayPhase) * c.swayAmp * this.dpr;
      const centerX = c.u * W + sway;
      const curtainW = c.widthFrac * W;
      const raySpace = curtainW / c.rayCount;

      // hue index rises with energy → green (rest) toward teal (active)
      const hueE = Math.min(1, inten * 0.55 + local * 0.55);
      const hueIdx = Math.min(this.HUES - 1, Math.round(hueE * (this.HUES - 1)));
      const sprite = this.raySprites[hueIdx];
      if (!sprite) continue;

      // parallax: nearer curtains are slightly taller/brighter
      const topJitter = skyTop + (1 - c.depth) * H * 0.06;
      const drawH = skyBottom - topJitter;

      for (let r = 0; r < c.rayCount; r++) {
        // shimmer: each ray's alpha breathes on a slow smooth sinusoid (<1 Hz)
        const phase = c.raySeed + r * 0.9;
        const shimmer =
          0.45 +
          0.55 * (0.5 + 0.5 * Math.sin(now * (0.4 + c.depth * 0.35) * motion + phase));
        // a second, slower undulation folds the curtain vertically
        const fold =
          0.85 + 0.15 * Math.sin(now * 0.12 * motion + phase * 0.4 + c.swayPhase);
        const a = bright * shimmer * (0.5 + 0.5 * c.depth) * 0.5;
        if (a <= 0.004) continue;

        const rx = centerX + (r - c.rayCount / 2) * raySpace;
        const rw = raySpace * 2.2;
        const rh = drawH * fold;

        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(sprite, rx - rw / 2, topJitter, rw, rh);

        // violet crown: only at high energy, drawn short at the top
        if (hueE > 0.62 && this.crownSprite) {
          const crownA = a * (hueE - 0.62) * 2.4;
          if (crownA > 0.01) {
            ctx.globalAlpha = Math.min(0.9, crownA);
            ctx.drawImage(
              this.crownSprite,
              rx - rw / 2,
              topJitter,
              rw,
              rh * 0.42,
            );
          }
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
