// Graceful fallback when WebGPU is unavailable. NOT the primary art surface —
// a reduced Canvas2D nebula of additive soft sprites that spiral inward and
// respawn at the rim, so the piece still reads as a cosmic homecoming and still
// pairs with the audio drone. Deterministic (seeded mulberry32).

import { mulberry32 } from "./rng";

export type CouplingState = {
  breath: number;
  deepen: number;
  coreGlow: number;
  pointerX: number;
  pointerY: number;
};

const N = 1400;

// A cached soft radial sprite, tinted white and coloured per-draw via alpha.
function makeSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.5)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

export function runFallback(
  canvas: HTMLCanvasElement,
  getState: () => CouplingState,
): { stop(): void } {
  const g = canvas.getContext("2d")!;
  const rng = mulberry32(0x9e3779b9);
  const sprite = makeSprite(64);

  // polar particles: angle, radius, angular speed, per-particle tint
  const ang = new Float32Array(N);
  const rad = new Float32Array(N);
  const spd = new Float32Array(N);
  const tint = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    ang[i] = rng() * Math.PI * 2;
    rad[i] = 0.25 + 0.75 * rng();
    spd[i] = 0.15 + 0.5 * rng();
    tint[i] = rng();
  }

  let raf = 0;
  let last = performance.now();
  let running = true;

  function mixColor(t: number): [number, number, number] {
    // gold (core, t→0) → violet (rim, t→1)
    const gr = 255, gg = 204, gb = 117;
    const vr = 107, vg = 61, vb = 219;
    return [gr + (vr - gr) * t, gg + (vg - gg) * t, gb + (vb - gb) * t];
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const s = getState();

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2 + s.pointerX * w * 0.06;
    const cy = h / 2 + s.pointerY * h * 0.06;
    const maxR = Math.min(w, h) * 0.46;

    // slow luminance trail — never a hard clear, never a strobe
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(6,4,14,0.16)";
    g.fillRect(0, 0, w, h);

    g.globalCompositeOperation = "lighter";
    const inward = 0.06 + 0.10 * s.breath;
    const bright = 0.5 + 0.35 * s.deepen + 0.2 * s.coreGlow;

    for (let i = 0; i < N; i++) {
      ang[i] += spd[i] * dt * (0.4 + 0.5 * s.breath) / (rad[i] + 0.15);
      rad[i] -= inward * dt * (0.5 + rad[i]);
      if (rad[i] <= 0.03) {
        rad[i] = 0.85 + 0.2 * tint[i];
        ang[i] = tint[i] * Math.PI * 2 + now * 0.0001;
      }
      const r = rad[i] * maxR;
      const x = cx + Math.cos(ang[i]) * r;
      const y = cy + Math.sin(ang[i]) * r * 0.62; // tilt the disc
      const t = Math.min(1, rad[i]);
      const [cr, cg, cb] = mixColor(t);
      const life = Math.min(1, rad[i] * 3) * (1 - rad[i] * 0.4);
      const a = 0.5 * life * bright;
      const size = 6 + 10 * (1 - t);
      g.globalAlpha = a;
      // colour the white sprite by drawing it through a tinted composite
      g.save();
      g.translate(x - size / 2, y - size / 2);
      g.drawImage(sprite, 0, 0, size, size);
      g.restore();
      // second, coloured pass for hue
      g.globalAlpha = a * 0.7;
      g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      g.beginPath();
      g.arc(x, y, size * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
