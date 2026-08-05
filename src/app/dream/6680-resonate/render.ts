// render.ts — Canvas2D crystal-lattice mode-shape visualiser (no GPU).
//
// A grid of lattice nodes stands at rest. Every audio mode is mapped to a 2-D
// standing-wave shape across the grid; the node displacement is the weighted sum
// of those shapes, weighted by each mode's LIVE energy (read straight from the
// synth). So the lattice literally dances the same envelope you hear, and each
// material rings its own geometry (fcc / hex / cubic / amorphous) and hue.
//
// All motion is smooth and decaying — nothing flickers. Under
// prefers-reduced-motion the displacement amplitude is damped hard.

import type { Material, LatticeKind } from "./materials";

// spatial mode counts assigned to audio modes 0..9 (increasing complexity).
const SPATIAL: Array<[number, number]> = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 1],
  [1, 3],
  [3, 2],
  [2, 3],
  [4, 1],
  [3, 3],
];

export type RenderState = {
  material: Material;
  energies: Float32Array;
  total: number;
  micLevel: number; // 0..1, drives an input ring
  reduced: boolean;
  timeMs: number;
};

type Node = { bx: number; by: number; u: number; v: number };

export class LatticeRenderer {
  private ctx: CanvasFctx;
  private nodes: Node[] = [];
  private cols = 0;
  private rows = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private latticeKind: LatticeKind | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.ctx = c;
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.w = cssW;
    this.h = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
    this.latticeKind = null; // force lattice rebuild for new aspect
  }

  private buildLattice(kind: LatticeKind) {
    const short = Math.min(this.w, this.h);
    this.cols = short < 520 ? 15 : 19;
    this.rows = this.cols;
    const nodes: Node[] = [];
    const span = Math.min(this.w, this.h) * 0.62;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const step = span / (this.cols - 1);

    // basis vectors per lattice kind (skew / rotation give each its look).
    let e1x = step,
      e1y = 0,
      e2x = 0,
      e2y = step;
    if (kind === "hex") {
      e1x = step;
      e1y = 0;
      e2x = step * 0.5;
      e2y = step * 0.866;
    } else if (kind === "fcc") {
      const a = Math.PI / 9;
      e1x = step * Math.cos(a);
      e1y = step * Math.sin(a);
      e2x = -step * Math.sin(a) * 0.85;
      e2y = step * Math.cos(a);
    }

    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const ci = i - (this.cols - 1) / 2;
        const cj = j - (this.rows - 1) / 2;
        let bx = cx + ci * e1x + cj * e2x;
        let by = cy + ci * e1y + cj * e2y;
        if (kind === "amorphous") {
          // deterministic hash jitter → glassy/irregular wood lattice.
          const hsh = Math.sin((i * 12.9898 + j * 78.233) * 43758.5453);
          const hsh2 = Math.sin((i * 39.346 + j * 11.135) * 24634.6345);
          bx += (hsh - Math.trunc(hsh)) * step * 0.55 - step * 0.14;
          by += (hsh2 - Math.trunc(hsh2)) * step * 0.55 - step * 0.14;
        }
        nodes.push({
          bx,
          by,
          u: i / (this.cols - 1),
          v: j / (this.rows - 1),
        });
      }
    }
    this.nodes = nodes;
    this.latticeKind = kind;
  }

  draw(s: RenderState) {
    const { ctx } = this;
    if (this.latticeKind !== s.material.lattice) {
      this.buildLattice(s.material.lattice);
    }
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // background wash — deep neutral with a faint violet breathe.
    const glow = Math.min(1, s.total * 0.9);
    ctx.fillStyle = "#08090d";
    ctx.fillRect(0, 0, this.w, this.h);
    const bg = ctx.createRadialGradient(
      this.w / 2,
      this.h / 2,
      0,
      this.w / 2,
      this.h / 2,
      Math.max(this.w, this.h) * 0.7,
    );
    const hue = s.material.hue;
    bg.addColorStop(0, `hsla(${hue}, 70%, ${8 + glow * 12}%, 1)`);
    bg.addColorStop(1, "rgba(8,9,13,1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    const M = s.material.ratios.length;
    const ampScale =
      Math.min(this.w, this.h) * (s.reduced ? 0.02 : 0.055);
    const t = s.timeMs / 1000;

    // precompute per-mode phase so displacement animates as a live oscillation
    // (visual only — a slow beat, kept well under 3 Hz).
    const disp = (u: number, v: number): number => {
      let d = 0;
      for (let n = 0; n < M; n++) {
        const e = s.energies[n];
        if (e < 0.0008) continue;
        const [px, py] = SPATIAL[n] ?? SPATIAL[SPATIAL.length - 1];
        const shape =
          Math.sin(Math.PI * px * u) * Math.sin(Math.PI * py * v);
        const beat = Math.cos(t * (1.1 + n * 0.35) + n);
        d += e * shape * beat;
      }
      return d;
    };

    // lattice bonds — faint lines to nearest neighbours in grid order.
    ctx.lineWidth = 1;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const idx = j * this.cols + i;
        const nd = this.nodes[idx];
        const d0 = disp(nd.u, nd.v);
        const off0 = d0 * ampScale;
        const x0 = nd.bx;
        const y0 = nd.by + off0;
        if (i < this.cols - 1) {
          const r = this.nodes[idx + 1];
          const x1 = r.bx;
          const y1 = r.by + disp(r.u, r.v) * ampScale;
          const a = 0.05 + Math.min(0.4, Math.abs(d0) * 0.5);
          ctx.strokeStyle = `hsla(${hue}, 60%, 70%, ${a})`;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        if (j < this.rows - 1) {
          const b = this.nodes[idx + this.cols];
          const x1 = b.bx;
          const y1 = b.by + disp(b.u, b.v) * ampScale;
          const a = 0.05 + Math.min(0.4, Math.abs(d0) * 0.5);
          ctx.strokeStyle = `hsla(${hue}, 60%, 70%, ${a})`;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }

    // nodes — radius & luminance track local displacement magnitude.
    for (const nd of this.nodes) {
      const d = disp(nd.u, nd.v);
      const mag = Math.abs(d);
      const off = d * ampScale;
      const x = nd.bx;
      const y = nd.by + off;
      const rad = 1.5 + Math.min(6, mag * 7);
      const light = 42 + Math.min(48, mag * 90);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${55 + mag * 30}%, ${light}%, ${0.5 + Math.min(0.5, mag)})`;
      ctx.fill();
      if (mag > 0.25) {
        ctx.beginPath();
        ctx.arc(x, y, rad + 4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 72%, ${Math.min(0.22, (mag - 0.25) * 0.3)})`;
        ctx.fill();
      }
    }

    // mic-input ring — a quiet indicator that listening is live.
    if (s.micLevel > 0.001) {
      const rr = 26 + s.micLevel * 120;
      ctx.beginPath();
      ctx.arc(this.w - 46, this.h - 46, rr * 0.24, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${hue}, 80%, 72%, ${0.2 + s.micLevel * 0.6})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}

type CanvasFctx = CanvasRenderingContext2D;
