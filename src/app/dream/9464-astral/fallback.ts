// fallback.ts — the Canvas2D nebula, for machines without WebGPU.
//
// Same idea as gpu.ts at a fraction of the count (~3.6k agents): a ring emitter
// reseeds onset-spawned stars, a curl-noise flow field advects them, convergence
// pulls them into a tunnel-to-light. We composite the density in an offscreen
// buffer, then lay the SAME Bayer 8x8 ordered dither + indigo→violet→white
// palette over it in one ImageData pass so the quantized-grain veil survives the
// downgrade. WebGPU is the point; this keeps the piece alive everywhere.

import {
  CPU_PARTICLES,
  curl,
  mulberry32,
  type NebulaEngine,
  PARTICLE_LIFE,
  SEED,
  type StepArgs,
} from "./nebula";

const BAYER8 = [
  0, 48, 12, 60, 3, 51, 15, 63, 32, 16, 44, 28, 35, 19, 47, 31, 8, 56, 4, 52, 11, 59, 7, 55, 40,
  24, 36, 20, 43, 27, 39, 23, 2, 50, 14, 62, 1, 49, 13, 61, 34, 18, 46, 30, 33, 17, 45, 29, 10,
  58, 6, 54, 9, 57, 5, 53, 42, 26, 38, 22, 41, 25, 37, 21,
];

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export function createCanvasNebula(canvas: HTMLCanvasElement): NebulaEngine {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");

  const N = CPU_PARTICLES;
  const rnd = mulberry32(SEED);
  const stars: Star[] = new Array(N);
  for (let i = 0; i < N; i++) stars[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };

  // low-res density grid → cheap; upscaled with dither on composite
  let gw = 160;
  let gh = 90;
  let density = new Float32Array(gw * gh);
  let hot = new Float32Array(gw * gh);

  let outW = 0;
  let outH = 0;
  let image: ImageData | null = null;

  // persistent scratch canvas that holds the low-res dithered grid for upscale
  const scratch = document.createElement("canvas");
  const scratchG = scratch.getContext("2d");
  if (!scratchG) throw new Error("no-2d-context");

  let cursor = 0;
  let destroyed = false;

  function resize(w: number, h: number, dpr: number): void {
    const pw = Math.max(2, Math.floor(w * dpr));
    const ph = Math.max(2, Math.floor(h * dpr));
    canvas.width = pw;
    canvas.height = ph;
    outW = pw;
    outH = ph;
    // grid roughly a sixth res, aspect-matched
    gw = Math.max(80, Math.min(320, Math.floor(pw / 6)));
    gh = Math.max(45, Math.min(200, Math.floor(ph / 6)));
    density = new Float32Array(gw * gh);
    hot = new Float32Array(gw * gh);
    image = ctx!.createImageData(gw, gh);
    scratch.width = gw;
    scratch.height = gh;
  }

  {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const rect = canvas.getBoundingClientRect();
    resize(rect.width || 1280, rect.height || 720, dpr);
  }

  function spawnInto(i: number): void {
    const ang = rnd() * Math.PI * 2;
    const rad = 0.55 + 0.5 * rnd();
    const s = stars[i];
    s.x = Math.cos(ang) * rad;
    s.y = Math.sin(ang) * rad;
    s.vx = (rnd() - 0.5) * 0.25;
    s.vy = (rnd() - 0.5) * 0.25;
    s.life = 1.0;
  }

  function step(a: StepArgs): void {
    if (destroyed || !image) return;

    // emit
    const spawn = Math.max(0, Math.min(N, Math.floor(a.spawn)));
    for (let k = 0; k < spawn; k++) {
      spawnInto(cursor);
      cursor = (cursor + 1) % N;
    }

    const conv = Math.min(1, Math.max(0, a.convergence));
    const curlAmp = 0.55 * (1 - conv) + 0.14 * conv;
    const timeScale = a.reduced ? 0.35 : 1.0;
    const lifeRate = 1 / PARTICLE_LIFE;
    const tx = a.time * 0.03 * timeScale;
    const ty = a.time * 0.021 * timeScale;

    density.fill(0);
    hot.fill(0);

    for (let i = 0; i < N; i++) {
      const s = stars[i];
      if (s.life <= 0) continue;
      const [cx, cy] = curl(s.x * 1.7 + tx, s.y * 1.7 + ty);
      const dist = Math.hypot(s.x, s.y) + 1e-4;
      const inx = (-s.x / dist) * conv * 0.42;
      const iny = (-s.y / dist) * conv * 0.42;
      const swx = -s.y * conv * 0.5;
      const swy = s.x * conv * 0.5;
      s.vx = (s.vx + (cx * curlAmp + inx + swx) * a.dt) * 0.965;
      s.vy = (s.vy + (cy * curlAmp + iny + swy) * a.dt) * 0.965;
      s.x += s.vx * a.dt;
      s.y += s.vy * a.dt;
      s.life -= a.dt * lifeRate;
      if (dist < 0.02 || Math.abs(s.x) > 1.6 || Math.abs(s.y) > 1.6) {
        s.life = 0;
        continue;
      }
      // splat into grid (NDC → grid, y down)
      const gx = ((s.x * 0.5 + 0.5) * gw) | 0;
      const gy = ((-s.y * 0.5 + 0.5) * gh) | 0;
      if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
      const gi = gy * gw + gx;
      const fade =
        Math.min(1, s.life / 0.12) * Math.min(1, (1 - s.life + 0.25) / 0.25) * 0.9;
      const heat = Math.max(0, 1 - dist * 0.9);
      density[gi] += fade;
      hot[gi] += fade * heat;
    }

    // composite grid → ImageData with palette + Bayer dither
    const data = image.data;
    const exposure = 1.6 * a.brightness;
    const levels = 8;
    const nlev = levels - 1;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const gi = y * gw + x;
        const dens = density[gi];
        const hm = hot[gi];
        const heat = dens > 1e-3 ? Math.min(1, hm / dens) : 0;
        const lum = 1 - Math.exp(-dens * exposure);
        const s1 = smoothstep(0, 0.55, lum);
        const s2 = smoothstep(0.5, 1, lum) * (0.35 + 0.65 * heat);
        // indigo → violet → hot
        let r = lerp(0.02, 0.4, s1);
        let g = lerp(0.015, 0.16, s1);
        let b = lerp(0.09, 0.8, s1);
        r = lerp(r, 1.0, s2) + 0.02 * 0.5;
        g = lerp(g, 0.96, s2) + 0.015 * 0.5;
        b = lerp(b, 1.0, s2) + 0.09 * 0.5;
        const t = (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) / 64;
        r = Math.floor(clamp01(r) * nlev + t) / nlev;
        g = Math.floor(clamp01(g) * nlev + t) / nlev;
        b = Math.floor(clamp01(b) * nlev + t) / nlev;
        const o = gi * 4;
        data[o] = clamp01(r) * 255;
        data[o + 1] = clamp01(g) * 255;
        data[o + 2] = clamp01(b) * 255;
        data[o + 3] = 255;
      }
    }

    // upscale the dithered grid to the canvas (nearest-neighbour keeps grains crisp)
    scratchG!.putImageData(image, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    ctx!.clearRect(0, 0, outW, outH);
    ctx!.drawImage(scratch, 0, 0, gw, gh, 0, 0, outW, outH);
  }

  function destroy(): void {
    destroyed = true;
  }

  return { backend: "Canvas2D", step, resize, destroy };
}

// tiny helpers (never named use*)
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
