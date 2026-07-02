// ─────────────────────────────────────────────────────────────────────────────
// 1101-time-dissolve / scene.ts
//
// A deliberately MINIMAL, luminous Canvas visual. One breathing bloom of light
// in a dark void, plus exponential depth-fog / vignette for vastness and a
// whisper-faint progress arc. The renderer is dumb: it draws whatever `visEnv`
// it is handed. The audio-visual DESYNC is produced upstream (in page.tsx),
// where `visEnv` is a heavily lagged / time-warped copy of the true audio
// envelope unless the "re-bind" toggle is on. At the clarity snap the color
// pushes toward soft-white.
// ─────────────────────────────────────────────────────────────────────────────

export interface SceneFrame {
  /** The (possibly lagged) envelope actually driving the bloom, 0..1. */
  visEnv: number;
  /** Clarity-snap intensity 0..1 (0 = void hue, 1 = soft white + sharp). */
  clarity: number;
  /** Arc position 0..1 for the faint progress arc. */
  progress: number;
  /** Whether audio + visual are currently re-bound (for a subtle cue). */
  bound: boolean;
}

export class DissolveScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private t = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2D canvas unavailable");
    this.ctx = c;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.floor(rect.width));
    this.h = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(f: SceneFrame, dt: number): void {
    const ctx = this.ctx;
    this.t += dt;
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const cy = h / 2;
    const minDim = Math.min(w, h);

    const env = Math.max(0, Math.min(1, f.visEnv));
    const clarity = Math.max(0, Math.min(1, f.clarity));

    // ── Void backdrop ────────────────────────────────────────────────────
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#04030a";
    ctx.fillRect(0, 0, w, h);

    // Very slow breathing that runs on the visual's own clock (adds to the
    // felt drift when unbound; harmless when bound).
    const breath = 0.5 + 0.5 * Math.sin(this.t * 0.22);
    const radius = minDim * (0.12 + 0.34 * env + 0.03 * breath);
    const bright = 0.25 + 0.7 * env;

    // Hue: deep violet-void → soft white as clarity rises.
    const mix = (a: number, b: number) => Math.round(a + (b - a) * clarity);
    const cr = mix(150, 245);
    const cg = mix(120, 244);
    const cb = mix(230, 250);

    // ── Luminous bloom ───────────────────────────────────────────────────
    ctx.globalCompositeOperation = "lighter";
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.55 * bright).toFixed(3)})`);
    grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${(0.28 * bright).toFixed(3)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // A crisp inner core that only resolves as clarity snaps in.
    const coreA = 0.15 + 0.75 * clarity;
    const coreR = radius * (0.16 - 0.08 * clarity + 0.02 * breath);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(2, coreR));
    core.addColorStop(0, `rgba(${cr},${cg},${cb},${(coreA * bright).toFixed(3)})`);
    core.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, coreR), 0, Math.PI * 2);
    ctx.fill();

    // A single breathing ring outline, sharper at clarity.
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1 + 2 * clarity;
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.12 + 0.35 * clarity).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (0.7 + 0.05 * breath), 0, Math.PI * 2);
    ctx.stroke();

    // ── Exponential depth-fog / vignette for vastness ────────────────────
    ctx.globalCompositeOperation = "source-over";
    const vig = ctx.createRadialGradient(
      cx,
      cy,
      minDim * 0.15,
      cx,
      cy,
      minDim * 0.75,
    );
    vig.addColorStop(0, "rgba(4,3,10,0)");
    vig.addColorStop(1, "rgba(2,1,6,0.92)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // ── Faint progress arc, low on screen ────────────────────────────────
    const pr = Math.max(0, Math.min(1, f.progress));
    const arcR = minDim * 0.42;
    const arcY = cy;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(150,130,220,0.10)";
    ctx.beginPath();
    ctx.arc(cx, arcY, arcR, Math.PI * 0.5, Math.PI * 2.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.30)`;
    ctx.beginPath();
    ctx.arc(cx, arcY, arcR, Math.PI * 0.5, Math.PI * 0.5 + pr * Math.PI * 2);
    ctx.stroke();

    // A hair-thin sync cue: a faint dot pulses when bound (eyes+ears agree).
    if (f.bound) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(190,255,220,0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, 2 + 1.5 * breath, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  clear(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = "#04030a";
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  dispose(): void {
    this.clear();
  }
}
