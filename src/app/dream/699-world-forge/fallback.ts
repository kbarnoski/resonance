// fallback.ts — Canvas2D starfield-with-blooms used when WebGL/three is
// unavailable, so the glance is never blank. Same event-driven blooms,
// placed by the deterministic pseudo geo-loc projected onto a flat disc.

import { geoFor, type ForgeEvent } from "./feed";

const TYPE_COLOR: Record<string, string> = {
  PushEvent: "120, 184, 255",
  WatchEvent: "255, 235, 153",
  PullRequestEvent: "140, 255, 178",
  IssuesEvent: "255, 140, 115",
  IssueCommentEvent: "216, 153, 255",
  ForkEvent: "153, 128, 255",
  CreateEvent: "128, 216, 255",
};

interface Bloom {
  x: number;
  y: number;
  born: number;
  life: number;
  color: string;
}

export interface FallbackHandle {
  spawn: (e: ForgeEvent) => void;
  setIntensity: (x: number) => void;
  dispose: () => void;
}

export function createFallback(canvas: HTMLCanvasElement): FallbackHandle {
  const ctx = canvas.getContext("2d");
  let disposed = false;
  let rafId = 0;
  let intensity = 0;
  const blooms: Bloom[] = [];
  const start = performance.now();

  // a soft static starfield
  const stars: Array<{ x: number; y: number; r: number; a: number }> = [];
  for (let i = 0; i < 160; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.4 + 0.2,
      a: Math.random() * 0.5 + 0.2,
    });
  }

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
  };
  resize();
  window.addEventListener("resize", resize);

  const spawn = (e: ForgeEvent) => {
    const { lat, lon } = geoFor(e);
    // orthographic-ish projection onto a disc
    const r = (90 - Math.abs(lat)) / 90; // 0 at poles, 1 at equator
    const ang = (lon / 180) * Math.PI;
    blooms.push({
      x: 0.5 + Math.sin(ang) * 0.34 * r,
      y: 0.5 - (lat / 90) * 0.34,
      born: performance.now(),
      life: 2600,
      color: TYPE_COLOR[e.type] ?? TYPE_COLOR.PushEvent,
    });
    if (blooms.length > 260) blooms.shift();
  };

  const setIntensity = (x: number) => {
    intensity = Math.max(0, Math.min(1, x));
  };

  const draw = () => {
    if (disposed || !ctx) return;
    rafId = requestAnimationFrame(draw);
    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now();
    const t = (now - start) / 1000;

    ctx.clearRect(0, 0, W, H);
    // backdrop
    ctx.fillStyle = "rgba(4, 8, 18, 1)";
    ctx.fillRect(0, 0, W, H);

    // stars
    for (const s of stars) {
      ctx.globalAlpha = s.a * (0.6 + 0.4 * Math.sin(t + s.x * 10));
      ctx.fillStyle = "#9fc4ff";
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the planet disc
    const cxp = W / 2;
    const cyp = H / 2;
    const rad = Math.min(W, H) * 0.34;
    const grad = ctx.createRadialGradient(
      cxp - rad * 0.3,
      cyp - rad * 0.3,
      rad * 0.1,
      cxp,
      cyp,
      rad,
    );
    grad.addColorStop(0, `rgba(30,60,120,${0.5 + intensity * 0.3})`);
    grad.addColorStop(1, "rgba(8,16,34,0.95)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cxp, cyp, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(70,130,230,${0.25 + intensity * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // blooms (additive)
    ctx.globalCompositeOperation = "lighter";
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i];
      const k = (now - b.born) / b.life;
      if (k >= 1) {
        blooms.splice(i, 1);
        continue;
      }
      const env = k < 0.12 ? k / 0.12 : Math.pow(1 - (k - 0.12) / 0.88, 1.6);
      const px = b.x * W;
      const py = b.y * H;
      const br = (Math.min(W, H) * 0.012) * (1 + 1.6 * env);
      const bg = ctx.createRadialGradient(px, py, 0, px, py, br * 3);
      bg.addColorStop(0, `rgba(${b.color},${env * 0.9})`);
      bg.addColorStop(1, `rgba(${b.color},0)`);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(px, py, br * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };
  draw();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
  };

  return { spawn, setIntensity, dispose };
}
