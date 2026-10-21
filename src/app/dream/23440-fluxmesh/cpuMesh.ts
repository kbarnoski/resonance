// ─────────────────────────────────────────────────────────────────────────────
// 23440-fluxmesh — CPU fallback mesh.
//
// When WebGPU is unavailable, a smaller mass-spring membrane is integrated in
// plain JS and drawn to a 2D canvas. The physics and the scalar reduction mirror
// the GPU path exactly (semi-implicit springs, pinned border, the same four
// scalars), so the audio is still genuinely conducted by an emergent field —
// just on a lighter grid at lower node counts.
// ─────────────────────────────────────────────────────────────────────────────

import type { MeshSim, Push, Scalars } from "./gpu";

const COLS = 56;
const ROWS = 36;
const COUNT = COLS * ROWS;
const SUBSTEPS = 3;

const SPRING_K = 2600;
const DAMPING = 2.3;
const REST_ANCHOR = 60;
const AMBIENT = 0.09;
const PUSH_RADIUS = 0.07;

export function createCpuMesh(canvas: HTMLCanvasElement): MeshSim {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("could not get a 2d canvas context");

  // State in sim space [0,1]².
  const px = new Float32Array(COUNT);
  const py = new Float32Array(COUNT);
  const vx = new Float32Array(COUNT);
  const vy = new Float32Array(COUNT);
  const rx = new Float32Array(COUNT);
  const ry = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const gx = i % COLS;
    const gy = Math.floor(i / COLS);
    rx[i] = gx / (COLS - 1);
    ry[i] = gy / (ROWS - 1);
    px[i] = rx[i];
    py[i] = ry[i];
  }

  const sx = 1 / (COLS - 1);
  const sy = 1 / (ROWS - 1);
  const sd = Math.hypot(sx, sy);

  // Per-region node counts (rest-x < 0.5) — mirrors the GPU path.
  let leftCols = 0;
  for (let gx = 0; gx < COLS; gx++) if (gx / (COLS - 1) < 0.5) leftCols++;
  const LEFT_COUNT = Math.max(1, leftCols * ROWS);
  const RIGHT_COUNT = Math.max(1, COUNT - LEFT_COUNT);

  const scalars: Scalars = {
    energy: 0,
    centroidY: 0.5,
    balance: 0,
    stretch: 0,
    left: { energy: 0, centroidY: 0.5, stretch: 0 },
    right: { energy: 0, centroidY: 0.5, stretch: 0 },
  };
  let disposed = false;

  const configure = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  };
  configure();

  const neighbour = (
    i: number,
    gx: number,
    gy: number,
    dx: number,
    dy: number,
    rest: number,
    fout: { x: number; y: number },
  ) => {
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    const j = ny * COLS + nx;
    const ex = px[j] - px[i];
    const ey = py[j] - py[i];
    const len = Math.hypot(ex, ey) + 1e-6;
    const f = ((len - rest) * SPRING_K) / len;
    fout.x += ex * f;
    fout.y += ey * f;
  };

  const integrate = (dt: number, time: number, pushes: Push[]) => {
    const f = { x: 0, y: 0 };
    const n = Math.min(8, pushes.length);
    for (let i = 0; i < COUNT; i++) {
      const gx = i % COLS;
      const gy = Math.floor(i / COLS);
      if (gx === 0 || gy === 0 || gx === COLS - 1 || gy === ROWS - 1) {
        px[i] = rx[i];
        py[i] = ry[i];
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      f.x = 0;
      f.y = 0;
      neighbour(i, gx, gy, -1, 0, sx, f);
      neighbour(i, gx, gy, 1, 0, sx, f);
      neighbour(i, gx, gy, 0, -1, sy, f);
      neighbour(i, gx, gy, 0, 1, sy, f);
      neighbour(i, gx, gy, -1, -1, sd, f);
      neighbour(i, gx, gy, 1, -1, sd, f);
      neighbour(i, gx, gy, -1, 1, sd, f);
      neighbour(i, gx, gy, 1, 1, sd, f);

      f.x += (rx[i] - px[i]) * REST_ANCHOR;
      f.y += (ry[i] - py[i]) * REST_ANCHOR;

      const ph = time * 0.9 + rx[i] * 6.2831853 + ry[i] * 3.3;
      f.y += Math.sin(ph) * AMBIENT;

      for (let k = 0; k < n; k++) {
        const pu = pushes[k];
        const dxp = px[i] - pu.x;
        const dyp = py[i] - pu.y;
        const g = Math.exp(
          -(dxp * dxp + dyp * dyp) / (2 * PUSH_RADIUS * PUSH_RADIUS),
        );
        f.x += pu.fx * g;
        f.y += pu.fy * g;
      }

      f.x -= vx[i] * DAMPING;
      f.y -= vy[i] * DAMPING;
      vx[i] += f.x * dt;
      vy[i] += f.y * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
    }
  };

  const reduce = () => {
    // Per-region accumulators (membership keyed on rest-x, like the GPU path).
    let lke = 0;
    let lyke = 0;
    let lst = 0;
    let rke = 0;
    let ryke = 0;
    let rst = 0;
    for (let i = 0; i < COUNT; i++) {
      const e = 0.5 * (vx[i] * vx[i] + vy[i] * vy[i]);
      const stretch = Math.hypot(px[i] - rx[i], py[i] - ry[i]);
      if (rx[i] < 0.5) {
        lke += e;
        lyke += e * py[i];
        lst += stretch;
      } else {
        rke += e;
        ryke += e * py[i];
        rst += stretch;
      }
    }
    const ke = lke + rke;
    scalars.energy = ke;
    scalars.centroidY = ke > 1e-6 ? (lyke + ryke) / ke : 0.5;
    scalars.balance = (rke - lke) / (rke + lke + 1e-6);
    scalars.stretch = (lst + rst) / COUNT;
    scalars.left.energy = lke;
    scalars.left.centroidY = lke > 1e-6 ? lyke / lke : 0.5;
    scalars.left.stretch = lst / LEFT_COUNT;
    scalars.right.energy = rke;
    scalars.right.centroidY = rke > 1e-6 ? ryke / rke : 0.5;
    scalars.right.stretch = rst / RIGHT_COUNT;
  };

  const draw = () => {
    const W = canvas.width;
    const H = canvas.height;
    ctx2d.fillStyle = "rgb(9, 11, 14)";
    ctx2d.fillRect(0, 0, W, H);
    ctx2d.globalCompositeOperation = "lighter";
    ctx2d.lineWidth = Math.max(1, W / 1400);

    const seg = (a: number, b: number) => {
      const speed = Math.hypot(
        (vx[a] + vx[b]) * 0.5,
        (vy[a] + vy[b]) * 0.5,
      );
      const glow = Math.min(1, speed * 7.5);
      const rc = Math.round((0.1 + glow * 0.3) * 255);
      const gc = Math.round((0.42 + glow * 0.53) * 255);
      const bc = Math.round((0.52 + glow * 0.48) * 255);
      ctx2d.strokeStyle = `rgba(${rc},${gc},${bc},${0.18 + glow * 0.7})`;
      ctx2d.beginPath();
      ctx2d.moveTo(px[a] * W, py[a] * H);
      ctx2d.lineTo(px[b] * W, py[b] * H);
      ctx2d.stroke();
    };

    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS - 1; gx++) seg(gy * COLS + gx, gy * COLS + gx + 1);
    }
    for (let gx = 0; gx < COLS; gx++) {
      for (let gy = 0; gy < ROWS - 1; gy++)
        seg(gy * COLS + gx, (gy + 1) * COLS + gx);
    }
    ctx2d.globalCompositeOperation = "source-over";
  };

  return {
    frame(dt: number, pushes: Push[], timeSec: number) {
      if (disposed) return;
      const sdt = Math.min(dt, 1 / 60) / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) integrate(sdt, timeSec, pushes);
      reduce();
      draw();
    },
    scalars,
    resize: () => {
      if (!disposed) configure();
    },
    dispose: () => {
      disposed = true;
    },
    backend: "cpu",
  };
}
