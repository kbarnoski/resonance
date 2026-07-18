// fallback.ts — lightweight Canvas2D Physarum for browsers without WebGPU.
//
// Same deposit/sense/rotate agent model as the GPU path, just at low
// resolution with a few thousand CPU agents so it stays interactive. It still
// feeds the exact same harmony pipeline (graph.ts) by sampling vein density
// along each node-pair segment, so the piece is never blank and the audio path
// stays alive.

import { mulberry32, MAX_NODES, type FoodNode } from "./graph";

const GRID = 160; // trail field resolution
const EDGE_SAMPLES = 20;

interface Agent {
  x: number;
  y: number;
  ang: number;
}

export class SlimeFallback {
  private canvas: HTMLCanvasElement;
  private cctx: CanvasRenderingContext2D;
  private trail: Float32Array;
  private next: Float32Array;
  private agents: Agent[] = [];
  private food: FoodNode[] = [];
  private img: ImageData;
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("2d context unavailable");
    this.cctx = c;
    this.trail = new Float32Array(GRID * GRID);
    this.next = new Float32Array(GRID * GRID);

    const off = document.createElement("canvas");
    off.width = GRID;
    off.height = GRID;
    const oc = off.getContext("2d");
    if (!oc) throw new Error("2d context unavailable");
    this.off = off;
    this.octx = oc;
    this.img = oc.createImageData(GRID, GRID);

    const rng = mulberry32(0x51_1e5eed);
    const count = reducedMotion ? 1400 : 3200;
    for (let i = 0; i < count; i++) {
      this.agents.push({
        x: (0.5 + (rng() - 0.5) * 0.5) * GRID,
        y: (0.5 + (rng() - 0.5) * 0.5) * GRID,
        ang: rng() * Math.PI * 2,
      });
    }
  }

  setFood(nodes: FoodNode[]): void {
    this.food = nodes.slice(0, MAX_NODES);
  }

  private sample(x: number, y: number): number {
    const xi = Math.max(0, Math.min(GRID - 1, x | 0));
    const yi = Math.max(0, Math.min(GRID - 1, y | 0));
    return this.trail[yi * GRID + xi];
  }

  private runStep(time: number): void {
    const sd = 4;
    const sa = 0.6;
    const rot = 0.5;
    const rng = mulberry32((time * 1000) | 1);
    for (const a of this.agents) {
      const c = this.sample(a.x + Math.cos(a.ang) * sd, a.y + Math.sin(a.ang) * sd);
      const l = this.sample(
        a.x + Math.cos(a.ang - sa) * sd,
        a.y + Math.sin(a.ang - sa) * sd,
      );
      const r = this.sample(
        a.x + Math.cos(a.ang + sa) * sd,
        a.y + Math.sin(a.ang + sa) * sd,
      );
      if (c > l && c > r) {
        /* keep */
      } else if (l > r) a.ang -= rot;
      else if (r > l) a.ang += rot;
      else a.ang += (rng() - 0.5) * 2 * rot;

      a.x = (a.x + Math.cos(a.ang) + GRID) % GRID;
      a.y = (a.y + Math.sin(a.ang) + GRID) % GRID;
      const idx = (a.y | 0) * GRID + (a.x | 0);
      this.trail[idx] += 0.6;
    }

    // Diffuse + decay + food glow.
    const decay = this.reducedMotion ? 0.94 : 0.9;
    const sig2 = 2 * (GRID / 22) * (GRID / 22);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = (x + dx + GRID) % GRID;
            const sy = (y + dy + GRID) % GRID;
            s += this.trail[sy * GRID + sx];
          }
        }
        let glow = 0;
        for (const f of this.food) {
          const fx = f.x * GRID;
          const fy = f.y * GRID;
          const d2 = (fx - x) * (fx - x) + (fy - y) * (fy - y);
          glow += 1.4 * Math.exp(-d2 / sig2);
        }
        this.next[y * GRID + x] = Math.min(8, (s / 9 + glow) * decay);
      }
    }
    const tmp = this.trail;
    this.trail = this.next;
    this.next = tmp;
  }

  private draw(time: number): void {
    const d = this.img.data;
    const drift = 0.92 + 0.08 * Math.sin(time * 0.15);
    for (let i = 0; i < GRID * GRID; i++) {
      const raw = this.trail[i];
      const v = 1 - Math.exp(-raw * 1.6);
      // teal ground → chartreuse → amber → hot
      let r = 0.017,
        g = 0.145,
        b = 0.125;
      const t1 = Math.min(1, Math.max(0, (v - 0.02) / 0.28));
      r = r + (0.541 - r) * t1;
      g = g + (0.804 - g) * t1;
      b = b + (0.298 - b) * t1;
      const t2 = Math.min(1, Math.max(0, (v - 0.3) / 0.32));
      r = r + (0.957 - r) * t2;
      g = g + (0.757 - g) * t2;
      b = b + (0.306 - b) * t2;
      const t3 = Math.min(1, Math.max(0, (v - 0.72) / 0.26)) * 0.85;
      r = r + (1.0 - r) * t3;
      g = g + (0.953 - g) * t3;
      b = b + (0.769 - b) * t3;
      const o = i * 4;
      d[o] = Math.min(237, r * drift * 255);
      d[o + 1] = Math.min(237, g * drift * 255);
      d[o + 2] = Math.min(230, b * drift * 255);
      d[o + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    this.cctx.imageSmoothingEnabled = true;
    this.cctx.drawImage(this.off, 0, 0, cw, ch);
    // Food seeds.
    for (const f of this.food) {
      const px = f.x * cw;
      const py = f.y * ch;
      this.cctx.beginPath();
      this.cctx.fillStyle = "rgba(255,107,71,0.9)";
      this.cctx.arc(px, py, 6, 0, Math.PI * 2);
      this.cctx.fill();
      this.cctx.beginPath();
      this.cctx.fillStyle = "rgba(255,107,71,0.18)";
      this.cctx.arc(px, py, 18, 0, Math.PI * 2);
      this.cctx.fill();
    }
  }

  step(time: number): void {
    this.runStep(time);
    this.draw(time);
  }

  /** Same MAX_NODES² mean-density matrix the GPU path produces. */
  readEdges(): Float32Array {
    const out = new Float32Array(MAX_NODES * MAX_NODES).fill(-1);
    const n = this.food.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ax = this.food[i].x * GRID;
        const ay = this.food[i].y * GRID;
        const bx = this.food[j].x * GRID;
        const by = this.food[j].y * GRID;
        let s = 0;
        for (let t = 1; t < EDGE_SAMPLES; t++) {
          const f = t / EDGE_SAMPLES;
          s += this.sample(ax + (bx - ax) * f, ay + (by - ay) * f);
        }
        out[i * MAX_NODES + j] = s / (EDGE_SAMPLES - 1);
      }
    }
    return out;
  }
}
