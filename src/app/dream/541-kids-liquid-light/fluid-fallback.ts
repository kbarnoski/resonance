// fluid-fallback.ts — Canvas2D "lite fluid" for devices without WebGPU.
// Thousands of glowing dye particles advected by a coarse curl-noise velocity
// field plus the finger impulse. Looks like swirling liquid light; still sings.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1
  r: number;
  g: number;
  b: number;
}

// cheap value-noise gradient -> curl. Deterministic hash noise.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (
    a * (1 - u) * (1 - v) +
    b * u * (1 - v) +
    c * (1 - u) * v +
    d * u * v
  );
}

export class FallbackFluid {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private particles: Particle[] = [];
  private readonly MAX = 2600;
  private t = 0;
  private lastSpeed = 0;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.resize();
  }

  resize(): void {
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  getSpeed(): number {
    return this.lastSpeed;
  }

  // curl of the noise field -> divergence-free-ish swirl
  private curl(x: number, y: number): [number, number] {
    const s = 0.0032; // field scale
    const tt = this.t * 0.15;
    const e = 1.5;
    const n1 = noise2(x * s + tt, y * s);
    const n2 = noise2(x * s, y * s + tt);
    const dx = noise2(x * s, (y + e) * s + tt) - noise2(x * s, (y - e) * s + tt);
    const dy = noise2((x + e) * s + tt, y * s) - noise2((x - e) * s + tt, y * s);
    // curl = (dN/dy, -dN/dx)
    return [(dx - n2 * 0.0) * 60, -(dy - n1 * 0.0) * 60];
  }

  // p in pixel coords; impulse in pixels/frame; color rgb 0..1
  step(
    px: number,
    py: number,
    pdx: number,
    pdy: number,
    pr: number,
    pg: number,
    pb: number,
    down: boolean,
    dt: number,
  ): void {
    this.t += dt;
    const ctx = this.ctx;

    // fade trails (dark, luminous accumulation)
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5, 6, 14, 0.16)";
    ctx.fillRect(0, 0, this.w, this.h);

    // spawn particles at the finger
    if (down) {
      const spd = Math.hypot(pdx, pdy);
      this.lastSpeed = Math.min(1, spd / 26);
      const count = 6 + Math.floor(this.lastSpeed * 18);
      for (let i = 0; i < count && this.particles.length < this.MAX; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.random() * 22;
        this.particles.push({
          x: px + Math.cos(a) * rad,
          y: py + Math.sin(a) * rad,
          vx: pdx * 0.6 + (Math.random() - 0.5) * 1.5,
          vy: pdy * 0.6 + (Math.random() - 0.5) * 1.5,
          life: 1,
          r: pr,
          g: pg,
          b: pb,
        });
      }
    } else {
      this.lastSpeed *= 0.92;
    }

    // advect + draw
    ctx.globalCompositeOperation = "lighter";
    const alive: Particle[] = [];
    for (const p of this.particles) {
      const [cx, cy] = this.curl(p.x, p.y);
      p.vx = p.vx * 0.94 + cx * 0.02 * dt * 60;
      p.vy = p.vy * 0.94 + cy * 0.02 * dt * 60;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life -= dt * 0.35;
      if (
        p.life <= 0 ||
        p.x < -20 ||
        p.x > this.w + 20 ||
        p.y < -20 ||
        p.y > this.h + 20
      ) {
        continue;
      }
      alive.push(p);
      const a = p.life * 0.5;
      const size = 8 + (1 - p.life) * 18;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grd.addColorStop(
        0,
        `rgba(${Math.round(p.r * 255)},${Math.round(p.g * 255)},${Math.round(
          p.b * 255,
        )},${a})`,
      );
      grd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    this.particles = alive;
    ctx.globalCompositeOperation = "source-over";
  }

  dispose(): void {
    this.particles = [];
  }
}
