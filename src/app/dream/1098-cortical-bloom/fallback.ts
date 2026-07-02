// ─────────────────────────────────────────────────────────────────────────────
// fallback.ts — Canvas2D degrade path (required: WebGPU is not everywhere).
//
// A CPU value-noise field is grown in CORTICAL space (log r, theta) as slowly
// drifting stripes whose orientation is set by `balance` — then read out through
// the same complex-log warp, so cortical stripes become spirals / tunnels /
// spokes just like the GPU path. Lower resolution, but never blank and never
// silent: it computes the same field statistics and feeds them to the audio.
// ─────────────────────────────────────────────────────────────────────────────

import { screenToCortex } from "./logpolar";

export interface FallbackController {
  start(): void;
  stop(): void;
  seed(nx: number, ny: number): void;
  setBalance(b: number): void;
}

export interface FallbackOptions {
  onStats: (mean: number, energy: number, density: number) => void;
  reducedMotion: boolean;
  getBalance: () => number;
}

// small hash-based 2D value noise (bilinear), tileable-ish in v
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x: number, y: number): number {
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
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

interface Seed {
  u: number;
  v: number;
  born: number;
}

export function makeFallback(
  canvas: HTMLCanvasElement,
  opts: FallbackOptions,
): FallbackController {
  const c2d = canvas.getContext("2d");
  let raf = 0;
  let disposed = false;
  const seeds: Seed[] = [];
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let img: ImageData | null = null;
  let RW = 0;
  let RH = 0;
  let phase = 0;
  let last = performance.now();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);

  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (w === canvas.width && h === canvas.height && img) return;
    canvas.width = w;
    canvas.height = h;
    RW = Math.max(2, Math.floor(w / 4));
    RH = Math.max(2, Math.floor(h / 4));
    off.width = RW;
    off.height = RH;
    if (octx) img = octx.createImageData(RW, RH);
  };

  const frame = () => {
    if (disposed || !c2d || !octx) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    resize();
    if (!img) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const driftScale = opts.reducedMotion ? 0.5 : 1.0;
    phase += dt * 0.35 * driftScale;
    const balance = Math.min(1, Math.max(0, opts.getBalance()));
    // balance rotates the cortical stripe orientation: 0=rings(tunnels),
    // ~0.5=diagonal(spirals), 1=spokes — plus a hex term for the lattice pole.
    const ori = (0.15 + balance * 0.85) * (Math.PI / 2);
    const cphi = Math.cos(ori);
    const sphi = Math.sin(ori);
    const freq = 4.2;
    const hexAmt = Math.max(0, 1 - balance * 1.6); // honeycomb near the lattice pole

    const data = img.data;
    const minRes = Math.min(RW, RH);
    let sMean = 0;
    let sEnergy = 0;
    let sGrad = 0;
    let prevRow = 0;

    for (let py = 0; py < RH; py++) {
      for (let px = 0; px < RW; px++) {
        const sx = (px - 0.5 * RW) / (0.5 * minRes);
        const sy = (py - 0.5 * RH) / (0.5 * minRes);
        const [cu, cv] = screenToCortex(sx, sy);
        const wave = cphi * cu + sphi * cv;
        // organic perturbation grown by drifting value noise
        const n =
          valueNoise(cu * 1.6 + phase * 0.3, cv * 1.6) * 0.9 +
          valueNoise(cu * 3.1, cv * 3.1 - phase * 0.2) * 0.4;
        let stripe = 0.5 + 0.5 * Math.sin(freq * wave + phase + n * 2.2);
        if (hexAmt > 0) {
          const a = freq * cu + phase;
          const b = freq * (0.5 * cu + 0.866 * cv) + phase;
          const d = freq * (-0.5 * cu + 0.866 * cv) + phase;
          const hex = 0.5 + 0.5 * ((Math.cos(a) + Math.cos(b) + Math.cos(d)) / 3);
          stripe = stripe * (1 - hexAmt) + hex * hexAmt;
        }

        // seed nuclei: transient bright blooms
        let seedBoost = 0;
        for (let k = 0; k < seeds.length; k++) {
          const s = seeds[k];
          const age = (now - s.born) / 1000;
          if (age > 3.5) continue;
          let dvv = cv - s.v;
          dvv = dvv - Math.PI * 2 * Math.round(dvv / (Math.PI * 2));
          const dd = (cu - s.u) * (cu - s.u) + dvv * dvv;
          seedBoost += Math.exp(-dd * 6) * Math.exp(-age * 0.9) * 0.8;
        }
        const val = Math.min(1, stripe + seedBoost);

        // palette: violet → teal → amber (calm luminance)
        const t = Math.min(1, val * 1.3);
        const rr = Math.hypot(sx, sy);
        const vig = 0.5 + 0.5 * Math.exp(-rr * rr * 1.1);
        const teal = Math.min(1, Math.max(0, (t - 0.2) * 1.6));
        const amber = Math.min(1, Math.max(0, (t - 0.62) * 1.8));
        const cr = (0.1 * (1 - teal) + 0.08 * teal + 0.72 * amber) * vig;
        const cg = (0.06 * (1 - teal) + 0.42 * teal + 0.44 * amber) * vig;
        const cb = (0.2 * (1 - teal) + 0.46 * teal + 0.22 * amber) * vig;

        const o = (py * RW + px) * 4;
        data[o] = Math.min(255, cr * 255);
        data[o + 1] = Math.min(255, cg * 255);
        data[o + 2] = Math.min(255, cb * 255);
        data[o + 3] = 255;

        sMean += val;
        sEnergy += val * val;
        sGrad += Math.abs(val - prevRow);
        prevRow = val;
      }
    }

    octx.putImageData(img, 0, 0);
    c2d.imageSmoothingEnabled = true;
    c2d.drawImage(off, 0, 0, canvas.width, canvas.height);

    const nPix = RW * RH;
    opts.onStats(sMean / nPix, sEnergy / nPix, (sGrad / nPix) * 0.35);

    // prune old seeds
    for (let k = seeds.length - 1; k >= 0; k--) {
      if ((now - seeds[k].born) / 1000 > 3.5) seeds.splice(k, 1);
    }
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (disposed) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
    },
    seed(nx, ny) {
      // screen-normalised [0,1] tap → centred coords → cortical seed location
      const sx = (nx - 0.5) * 2;
      const sy = (ny - 0.5) * 2;
      const [u, v] = screenToCortex(sx, sy);
      seeds.push({ u, v, born: performance.now() });
      if (seeds.length > 24) seeds.shift();
    },
    setBalance() {
      /* balance is read live from balanceRef each frame */
    },
  };
}
