// fallback.ts — Canvas2D growing glowing sprout, used when WebGL/three.js is
// unavailable. Still shows a creature that grows, breathes, listens & sings.

export interface FallbackFrame {
  time: number;
  growth: number;
  listening: number;
  singing: number;
  leanX: number;
}

interface Dot {
  ang: number;
  rad: number;
  seed: number;
}

export interface Fallback {
  draw: (f: FallbackFrame) => void;
  resize: () => void;
}

function growthRGB(growth: number): [number, number, number] {
  // baby blue -> violet -> warm gold (matches three.js path)
  const young: [number, number, number] = [140, 200, 255];
  const mid: [number, number, number] = [205, 178, 255];
  const old: [number, number, number] = [255, 210, 140];
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  if (growth < 0.5) {
    const t = growth / 0.5;
    return [lerp(young[0], mid[0], t), lerp(young[1], mid[1], t), lerp(young[2], mid[2], t)];
  }
  const t = (growth - 0.5) / 0.5;
  return [lerp(mid[0], old[0], t), lerp(mid[1], old[1], t), lerp(mid[2], old[2], t)];
}

export function makeFallback(canvas: HTMLCanvasElement): Fallback {
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;

  const dots: Dot[] = [];
  for (let i = 0; i < 2200; i++) {
    dots.push({
      ang: Math.random() * Math.PI * 2,
      rad: 0.5 + Math.random() * 0.5,
      seed: Math.random() * Math.PI * 2,
    });
  }

  const resize = () => {
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const draw = (f: FallbackFrame) => {
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    ctx.fillStyle = "#02040a";
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2 + f.leanX * 40;
    const cy = H / 2;
    const baseR = Math.min(W, H) * (0.08 + f.growth * 0.14);
    const breathe = 1 + Math.sin(f.time * 1.1) * 0.05;
    const R = baseR * breathe * (1 + f.listening * 0.25 + f.singing * 0.18);
    const [r, g, b] = growthRGB(f.growth);

    const active = Math.floor(500 + f.growth * (dots.length - 500));
    const bright = 0.5 + f.listening * 0.5 + f.singing * 0.6;

    // halo
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
    halo.addColorStop(0, `rgba(${r},${g},${b},${0.22 + f.singing * 0.25})`);
    halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < active; i++) {
      const d = dots[i];
      const wob = 1 + Math.sin(f.time * 1.6 + d.seed) * 0.08;
      const rr = R * d.rad * wob;
      const x = cx + Math.cos(d.ang + f.time * 0.15) * rr;
      const y = cy + Math.sin(d.ang + f.time * 0.15) * rr * 1.1;
      const tw = (0.7 + 0.3 * Math.sin(f.time * 3 + d.seed * 2)) * bright;
      const a = Math.min(1, 0.22 * tw);
      const sz = 1.4 + f.growth * 1.6 + f.singing * 1.2;
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    // core
    const coreR = R * 0.55 * (1 + f.singing * 0.5);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, `rgba(255,255,255,${0.6 + f.singing * 0.3})`);
    core.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
    core.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  };

  return { draw, resize };
}
