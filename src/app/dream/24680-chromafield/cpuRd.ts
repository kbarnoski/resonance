// ─────────────────────────────────────────────────────────────────────────────
// 24680-chromafield — CPU fallback reaction-diffusion.
//
// When WebGPU is unavailable, a REAL (just smaller) Gray-Scott membrane is
// integrated in plain JS and painted to a 2D canvas via an ImageData buffer. The
// chemistry and the scalar reduction mirror the GPU path exactly (same stencil,
// same feed/kill regime, same deposits, the same four emergent scalars), so the
// audio is still genuinely conducted by an emergent chemical field — just on a
// lighter lattice at fewer substeps.
// ─────────────────────────────────────────────────────────────────────────────

import type { Deposit, RdSim, RdStats } from "./gpu";

const GRID_W = 160;
const GRID_H = 90;
const COUNT = GRID_W * GRID_H;
const SUBSTEPS = 10;
const DA = 1.0;
const DB = 0.5;
const DT = 1.0;
const B_THRESHOLD = 0.25;

export function createCpuRd(canvas: HTMLCanvasElement): RdSim {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("could not get a 2d canvas context");

  // Ping-pong chemical state (A,B interleaved).
  let A = new Float32Array(COUNT);
  let B = new Float32Array(COUNT);
  let A2 = new Float32Array(COUNT);
  let B2 = new Float32Array(COUNT);
  A.fill(1);

  const blob = (cx: number, cy: number, rad: number, amp: number) => {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y > r2) continue;
        const gx = (cx + x + GRID_W) % GRID_W;
        const gy = (cy + y + GRID_H) % GRID_H;
        const i = gy * GRID_W + gx;
        B[i] = Math.min(1, B[i] + amp);
        A[i] = Math.max(0, A[i] - amp * 0.5);
      }
    }
  };
  blob(Math.floor(GRID_W / 2), Math.floor(GRID_H / 2), 7, 0.9);
  for (let k = 0; k < 10; k++) {
    blob(
      Math.floor(Math.random() * GRID_W),
      Math.floor(Math.random() * GRID_H),
      2 + Math.floor(Math.random() * 3),
      0.8,
    );
  }

  const stats: RdStats = { coverage: 0, edge: 0, balance: 0, centroidY: 0.5 };
  let disposed = false;
  let edgePeak = 1e-3;

  // Offscreen ImageData at lattice resolution — scaled up on blit.
  const img = ctx2d.createImageData(GRID_W, GRID_H);
  const off = document.createElement("canvas");
  off.width = GRID_W;
  off.height = GRID_H;
  const offCtx = off.getContext("2d");

  const configure = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  configure();

  const wrap = (v: number, n: number) => (v + n) % n;

  const step = (feed: number, kill: number, deposits: Deposit[]) => {
    const n = Math.min(8, deposits.length);
    for (let y = 0; y < GRID_H; y++) {
      const yUp = wrap(y - 1, GRID_H) * GRID_W;
      const yDn = wrap(y + 1, GRID_H) * GRID_W;
      const yC = y * GRID_W;
      const uvy = (y + 0.5) / GRID_H;
      for (let x = 0; x < GRID_W; x++) {
        const xL = wrap(x - 1, GRID_W);
        const xR = wrap(x + 1, GRID_W);
        const i = yC + x;
        const a = A[i];
        const b = B[i];
        // 3×3 Laplacian stencil.
        const lapA =
          -a +
          0.2 * (A[yC + xL] + A[yC + xR] + A[yUp + x] + A[yDn + x]) +
          0.05 * (A[yUp + xL] + A[yUp + xR] + A[yDn + xL] + A[yDn + xR]);
        const lapB =
          -b +
          0.2 * (B[yC + xL] + B[yC + xR] + B[yUp + x] + B[yDn + x]) +
          0.05 * (B[yUp + xL] + B[yUp + xR] + B[yDn + xL] + B[yDn + xR]);
        const reaction = a * b * b;
        let nA = a + (DA * lapA - reaction + feed * (1 - a)) * DT;
        let nB = b + (DB * lapB + reaction - (feed + kill) * b) * DT;

        const uvx = (x + 0.5) / GRID_W;
        for (let k = 0; k < n; k++) {
          const d = deposits[k];
          const dx = uvx - d.x;
          const dy = uvy - d.y;
          const g = Math.exp(-(dx * dx + dy * dy) / (2 * d.r * d.r));
          nB += d.amount * g;
          nA -= d.amount * g * 0.5;
        }

        A2[i] = nA < 0 ? 0 : nA > 1 ? 1 : nA;
        B2[i] = nB < 0 ? 0 : nB > 1 ? 1 : nB;
      }
    }
    // swap
    let t = A;
    A = A2;
    A2 = t;
    t = B;
    B = B2;
    B2 = t;
  };

  const reduce = () => {
    let cov = 0;
    let sumB = 0;
    let sumBy = 0;
    let leftB = 0;
    let rightB = 0;
    let edge = 0;
    const halfW = GRID_W / 2;
    for (let y = 0; y < GRID_H; y++) {
      const yC = y * GRID_W;
      const yDn = wrap(y + 1, GRID_H) * GRID_W;
      const yn = y / (GRID_H - 1);
      for (let x = 0; x < GRID_W; x++) {
        const i = yC + x;
        const b = B[i];
        if (b > B_THRESHOLD) cov++;
        sumB += b;
        sumBy += b * yn;
        if (x < halfW) leftB += b;
        else rightB += b;
        const br = B[yC + wrap(x + 1, GRID_W)];
        const bd = B[yDn + x];
        edge += Math.abs(br - b) + Math.abs(bd - b);
      }
    }
    stats.coverage = cov / COUNT;
    stats.centroidY = sumB > 1e-4 ? sumBy / sumB : 0.5;
    stats.balance = (rightB - leftB) / (rightB + leftB + 1e-4);
    const edgeMean = edge / COUNT;
    edgePeak = Math.max(edgePeak * 0.995, edgeMean, 1e-3);
    stats.edge = Math.min(1, edgeMean / edgePeak);
  };

  const draw = () => {
    const data = img.data;
    for (let i = 0; i < COUNT; i++) {
      const b = B[i];
      // Obsidian → indigo → electric violet.
      const s1 = Math.min(1, Math.max(0, (b - 0.04) / 0.3));
      const s2 = Math.min(1, Math.max(0, (b - 0.3) / 0.32));
      let r = 0.016 + (0.17 - 0.016) * s1 + (0.56 - 0.17) * s2;
      let g = 0.012 + (0.09 - 0.012) * s1 + (0.22 - 0.09) * s2;
      let bl = 0.035 + (0.44 - 0.035) * s1 + (1.0 - 0.44) * s2;
      r += 0.17 * 0.06;
      g += 0.09 * 0.06;
      bl += 0.44 * 0.06;
      const o = i * 4;
      data[o] = Math.min(255, r * 255);
      data[o + 1] = Math.min(255, g * 255);
      data[o + 2] = Math.min(255, bl * 255);
      data[o + 3] = 255;
    }
    if (offCtx) {
      offCtx.putImageData(img, 0, 0);
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.drawImage(off, 0, 0, canvas.width, canvas.height);
    }
  };

  return {
    frame(_dt: number, deposits: Deposit[], feed: number, kill: number) {
      if (disposed) return;
      for (let s = 0; s < SUBSTEPS; s++) step(feed, kill, deposits);
      reduce();
      draw();
    },
    stats,
    resize: () => {
      if (!disposed) configure();
    },
    dispose: () => {
      disposed = true;
    },
    backend: "cpu",
  };
}
