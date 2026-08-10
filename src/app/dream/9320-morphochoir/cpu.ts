// cpu.ts — the graceful-degradation field, when navigator.gpu is absent.
//
// The SAME Gray-Scott equations on a small grid, stepped on the CPU and painted
// with Canvas2D so the piece still reads and still sings. Lower resolution and
// fewer steps keep it light; the probes and the choir behave identically.

import {
  DU,
  DV,
  type Field,
  PROBE_COUNT,
  PROBE_POS,
  REGIMES,
  type Seed,
} from "./field";

const RES = 96;
const STEPS = 6;
const SIM_DT = 1.0;

export function createCpuField(canvas: HTMLCanvasElement): Field {
  const maybe2d = canvas.getContext("2d");
  if (!maybe2d) throw new Error("no-2d");
  const ctx2d: CanvasRenderingContext2D = maybe2d;

  const N = RES * RES;
  let U = new Float32Array(N);
  let V = new Float32Array(N);
  let U2 = new Float32Array(N);
  let V2 = new Float32Array(N);
  U.fill(1);
  // seeded central bloom
  const cx = (RES / 2) | 0;
  const cy = (RES / 2) | 0;
  for (let y = -5; y <= 5; y++) {
    for (let x = -5; x <= 5; x++) {
      if (x * x + y * y <= 25) V[(cy + y) * RES + (cx + x)] = 0.9;
    }
  }

  const img = ctx2d.createImageData(RES, RES);
  const seeds: Seed[] = [];
  let regime = 0;
  const latestProbes = new Float32Array(PROBE_COUNT * 4);
  let destroyed = false;

  const idx = (x: number, y: number) => ((y + RES) % RES) * RES + ((x + RES) % RES);

  function lap(arr: Float32Array, x: number, y: number, c: number): number {
    return (
      (arr[idx(x - 1, y)] + arr[idx(x + 1, y)] + arr[idx(x, y - 1)] + arr[idx(x, y + 1)]) * 0.2 +
      (arr[idx(x - 1, y - 1)] + arr[idx(x + 1, y - 1)] + arr[idx(x - 1, y + 1)] + arr[idx(x + 1, y + 1)]) *
        0.05 -
      c
    );
  }

  function simStep(): void {
    const r = REGIMES[regime];
    const F = r.feed;
    const k = r.kill;
    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const i = y * RES + x;
        const u = U[i];
        const v = V[i];
        const lu = lap(U, x, y, u);
        const lv = lap(V, x, y, v);
        const uvv = u * v * v;
        let nu = u + (DU * lu - uvv + F * (1 - u)) * SIM_DT;
        let nv = v + (DV * lv + uvv - (F + k) * v) * SIM_DT;
        // seeds
        const ux = (x + 0.5) / RES;
        const uy = (y + 0.5) / RES;
        for (const s of seeds) {
          const dx = ux - s.x;
          const dy = uy - s.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < s.radius) {
            const f = (1 - d / s.radius) * s.strength;
            nv += f;
            nu -= f * 0.5;
          }
        }
        U2[i] = nu < 0 ? 0 : nu > 1 ? 1 : nu;
        V2[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
    }
    let t = U;
    U = U2;
    U2 = t;
    t = V;
    V = V2;
    V2 = t;
  }

  function render(bright: number): void {
    const d = img.data;
    // ground (near-black) -> amber -> gold -> cream, matching the GPU ramp
    for (let i = 0; i < N; i++) {
      const v = V[i];
      const t1 = smooth(0.05, 0.22, v);
      const t2 = smooth(0.22, 0.45, v);
      const t3 = smooth(0.45, 0.72, v);
      let r = 0.02;
      let g = 0.012;
      let b = 0.008;
      r = mix(r, 0.85, t1);
      g = mix(g, 0.34, t1);
      b = mix(b, 0.07, t1);
      r = mix(r, 1.0, t2);
      g = mix(g, 0.72, t2);
      b = mix(b, 0.24, t2);
      r = mix(r, 1.0, t3);
      g = mix(g, 0.95, t3);
      b = mix(b, 0.82, t3);
      const bloom = Math.pow(v, 3) * 0.45;
      r = (r + 1.0 * bloom) * bright;
      g = (g + 0.72 * bloom) * bright;
      b = (b + 0.24 * bloom) * bright;
      const o = i * 4;
      d[o] = clamp255(r);
      d[o + 1] = clamp255(g);
      d[o + 2] = clamp255(b);
      d[o + 3] = 255;
    }
    // draw the small field scaled to the canvas
    ctx2d.putImageData(img, 0, 0);
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.drawImage(
      canvas,
      0,
      0,
      RES,
      RES,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  function sampleProbes(): void {
    for (let p = 0; p < PROBE_COUNT; p++) {
      const px = Math.floor(PROBE_POS[p][0] * RES);
      const py = Math.floor(PROBE_POS[p][1] * RES);
      const vc = V[idx(px, py)];
      const vl = V[idx(px - 1, py)];
      const vr = V[idx(px + 1, py)];
      const vu = V[idx(px, py - 1)];
      const vd = V[idx(px, py + 1)];
      const gx = (vr - vl) * 0.5;
      const gy = (vd - vu) * 0.5;
      latestProbes[p * 4] = vc;
      latestProbes[p * 4 + 1] = Math.sqrt(gx * gx + gy * gy);
      latestProbes[p * 4 + 2] = (vc + vl + vr + vu + vd) * 0.2;
      latestProbes[p * 4 + 3] = 0;
    }
  }

  function step(dtSec: number, timeSec: number, reduce: boolean): void {
    if (destroyed) return;
    for (let i = seeds.length - 1; i >= 0; i--) {
      seeds[i].life -= dtSec;
      if (seeds[i].life <= 0) seeds.splice(i, 1);
    }
    for (let s = 0; s < STEPS; s++) simStep();
    sampleProbes();
    const amp = reduce ? 0.02 : 0.06;
    render(0.95 + amp * Math.sin(timeSec * 0.35));
  }

  return {
    backend: "CPU",
    step,
    addSeed(x, y, strength) {
      if (seeds.length >= 8) seeds.shift();
      seeds.push({
        x: Math.min(0.97, Math.max(0.03, x)),
        y: Math.min(0.97, Math.max(0.03, y)),
        strength,
        radius: 0.05,
        life: 0.35,
      });
    },
    setRegime(index) {
      regime = ((index % REGIMES.length) + REGIMES.length) % REGIMES.length;
    },
    probes: () => latestProbes,
    resize(w, h) {
      // canvas backing store is set by the page; nothing grid-side to resize
      void w;
      void h;
    },
    destroy() {
      destroyed = true;
    },
  };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp255(v: number): number {
  const x = v * 255;
  return x < 0 ? 0 : x > 255 ? 255 : x | 0;
}
