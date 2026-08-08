// Coarse semi-Lagrangian fluid on the CPU.
//
// This grid does double duty:
//   1. It is the *always-on audio shadow field*. Whatever tier draws the
//      visuals (WebGPU / WebGL2 / CPU), every splat is ALSO pushed here, and
//      the granular engine samples this grid at its listening points. So the
//      sound is stirred by the same gestures that stir the picture.
//   2. When neither WebGPU nor WebGL2 is available it becomes the *visual*
//      fallback too — rendered to a 2D canvas so a phone glance still sees a
//      genuine luminous fluid rather than a black screen.

import type { Splat, VisualFluid } from "./shared";

export interface FieldSample {
  /** local flow speed, ~0..1 */
  speed: number;
  /** signed local vorticity (curl), roughly -1..1 after normalization */
  vort: number;
  /** local dye luminance, ~0..1 */
  energy: number;
}

export interface ShadowField {
  readonly N: number;
  splat(s: Splat): void;
  step(dt: number): void;
  sample(nx: number, ny: number): FieldSample;
  // exposed for the CPU visual tier
  readonly dr: Float32Array;
  readonly dg: Float32Array;
  readonly db: Float32Array;
}

function clampIndex(v: number, n: number): number {
  return v < 0 ? 0 : v > n - 1 ? n - 1 : v;
}

/** Bilinear sample of a scalar grid at fractional cell coords. */
function bilinear(f: Float32Array, N: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const i0 = clampIndex(x0, N);
  const i1 = clampIndex(x0 + 1, N);
  const j0 = clampIndex(y0, N);
  const j1 = clampIndex(y0 + 1, N);
  const a = f[i0 + j0 * N];
  const b = f[i1 + j0 * N];
  const c = f[i0 + j1 * N];
  const d = f[i1 + j1 * N];
  return (
    a * (1 - tx) * (1 - ty) +
    b * tx * (1 - ty) +
    c * (1 - tx) * ty +
    d * tx * ty
  );
}

export function makeShadowField(N: number, calm: boolean): ShadowField {
  const size = N * N;
  const vx = new Float32Array(size);
  const vy = new Float32Array(size);
  const vx2 = new Float32Array(size);
  const vy2 = new Float32Array(size);
  const dr = new Float32Array(size);
  const dg = new Float32Array(size);
  const db = new Float32Array(size);
  const dtmp = new Float32Array(size);
  const curl = new Float32Array(size);
  const div = new Float32Array(size);
  const p = new Float32Array(size);
  const p2 = new Float32Array(size);

  const velDiss = calm ? 0.985 : 0.975;
  const dyeDiss = 0.972;
  const confine = calm ? 0.9 : 1.8;

  function advectScalar(
    dst: Float32Array,
    src: Float32Array,
    dt: number,
    diss: number,
  ): void {
    const scale = N * dt;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = i + j * N;
        const px = i - vx[c] * scale;
        const py = j - vy[c] * scale;
        dst[c] = diss * bilinear(src, N, px, py);
      }
    }
  }

  return {
    N,
    dr,
    dg,
    db,
    splat(s: Splat): void {
      const cx = s.x * N;
      const cy = s.y * N;
      const rad = Math.max(1.2, s.radius * N);
      const r2 = rad * rad;
      const i0 = Math.max(0, Math.floor(cx - rad));
      const i1 = Math.min(N - 1, Math.ceil(cx + rad));
      const j0 = Math.max(0, Math.floor(cy - rad));
      const j1 = Math.min(N - 1, Math.ceil(cy + rad));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i - cx;
          const dy = j - cy;
          const g = Math.exp(-(dx * dx + dy * dy) / r2);
          const c = i + j * N;
          vx[c] += s.vx * g;
          vy[c] += s.vy * g;
          dr[c] += s.r * g * 0.25;
          dg[c] += s.g * g * 0.25;
          db[c] += s.b * g * 0.25;
        }
      }
    },
    step(dt: number): void {
      const h = Math.min(dt, 1 / 30);
      // 1. vorticity confinement — reinforce swirls the pressure solve erodes
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const c = i + j * N;
          curl[c] =
            0.5 *
            (vy[c + 1] - vy[c - 1] - (vx[c + N] - vx[c - N]));
        }
      }
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const c = i + j * N;
          const nx = Math.abs(curl[c + 1]) - Math.abs(curl[c - 1]);
          const ny = Math.abs(curl[c + N]) - Math.abs(curl[c - N]);
          const len = Math.hypot(nx, ny) + 1e-5;
          const fx = (ny / len) * curl[c];
          const fy = -(nx / len) * curl[c];
          vx[c] += confine * fx * h;
          vy[c] += confine * fy * h;
        }
      }
      // 2. advect velocity (self)
      advectScalar(vx2, vx, h, velDiss);
      advectScalar(vy2, vy, h, velDiss);
      vx.set(vx2);
      vy.set(vy2);
      // 3. project to (approximately) divergence-free
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const c = i + j * N;
          div[c] =
            -0.5 * (vx[c + 1] - vx[c - 1] + (vy[c + N] - vy[c - N])) / N;
          p[c] = 0;
        }
      }
      for (let k = 0; k < 8; k++) {
        for (let j = 1; j < N - 1; j++) {
          for (let i = 1; i < N - 1; i++) {
            const c = i + j * N;
            p2[c] =
              (div[c] * N * N +
                p[c - 1] +
                p[c + 1] +
                p[c - N] +
                p[c + N]) *
              0.25;
          }
        }
        p.set(p2);
      }
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const c = i + j * N;
          vx[c] -= 0.5 * N * (p[c + 1] - p[c - 1]);
          vy[c] -= 0.5 * N * (p[c + N] - p[c - N]);
        }
      }
      // 4. advect dye through corrected velocity
      advectScalar(dtmp, dr, h, dyeDiss);
      dr.set(dtmp);
      advectScalar(dtmp, dg, h, dyeDiss);
      dg.set(dtmp);
      advectScalar(dtmp, db, h, dyeDiss);
      db.set(dtmp);
    },
    sample(nx: number, ny: number): FieldSample {
      const x = nx * N;
      const y = ny * N;
      const sx = bilinear(vx, N, x, y);
      const sy = bilinear(vy, N, x, y);
      const w = bilinear(curl, N, x, y);
      const lum =
        0.3 * bilinear(dr, N, x, y) +
        0.5 * bilinear(dg, N, x, y) +
        0.2 * bilinear(db, N, x, y);
      const speed = Math.min(1, Math.hypot(sx, sy) * 3.5);
      const vort = Math.max(-1, Math.min(1, w * 4));
      return { speed, vort, energy: Math.min(1, lum) };
    },
  };
}

// ── CPU visual tier ──────────────────────────────────────────────────────────

/** Wrap a ShadowField as the on-screen VisualFluid fallback. */
export function makeCpuFluid(
  canvas: HTMLCanvasElement,
  field: ShadowField,
): VisualFluid {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  const N = field.N;
  const img = ctx.createImageData(N, N);
  const buf = img.data;
  // offscreen at grid resolution, then scale up with smoothing for a soft look
  const off = document.createElement("canvas");
  off.width = N;
  off.height = N;
  const octx = off.getContext("2d");
  if (!octx) throw new Error("2D offscreen context unavailable");

  return {
    kind: "cpu",
    // The page owns the shared shadow field (it is also the audio source), so
    // it splats and steps it. This tier only draws it.
    splat(): void {
      /* handled on the shared field by the page */
    },
    frame(): void {
      const { dr, dg, db } = field;
      for (let idx = 0; idx < N * N; idx++) {
        // deep indigo ground + additive aurora dye, filmic-ish squash
        let r = 0.03 + dr[idx];
        let g = 0.02 + dg[idx];
        let b = 0.09 + db[idx];
        const l = 0.3 * r + 0.5 * g + 0.2 * b;
        const sq = 1 / (1 + l);
        r *= sq;
        g *= sq;
        b *= sq;
        const o = idx * 4;
        buf[o] = Math.min(255, Math.pow(r, 0.45) * 255);
        buf[o + 1] = Math.min(255, Math.pow(g, 0.45) * 255);
        buf[o + 2] = Math.min(255, Math.pow(b, 0.45) * 255);
        buf[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
    },
    destroy(): void {
      /* nothing GPU-side to release */
    },
  };
}
