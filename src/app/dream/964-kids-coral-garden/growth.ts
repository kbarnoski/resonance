// Differential growth engine for the coral garden.
//
// Technique references:
//   - Anders Hoff / Inconvergent — "differential line" / differential growth essays.
//   - Entagma — differential growth in TouchDesigner / Houdini tutorials.
//   - arXiv:2504.18040 "Cabbage" (2025) — formalization of differential growth.
//
// A strand is a polyline of nodes {x,y}. Each step we apply:
//   1. attraction to connected neighbors toward a rest length
//   2. repulsion from nearby nodes within a radius (uniform-grid spatial hash, O(n))
//   3. smoothing toward the midpoint of neighbors (curvature smoothing)
//   4. growth — split long edges, and insert at high-curvature points
//   5. branching — a growing tip occasionally splits into a new strand
//
// Forces are deliberately gentle so growth reads as calm/seconds-scale.

export interface Node {
  x: number;
  y: number;
  // accumulated displacement for this step (applied at integration)
  dx: number;
  dy: number;
  // age in steps — used to throttle very young nodes from re-splitting
  age: number;
}

export interface Strand {
  nodes: Node[];
  // heading of the growing tip (radians) — used when branching
  heading: number;
  // hue offset so different strands glow slightly differently
  hue: number;
  alive: boolean;
}

export interface GrowthConfig {
  restLength: number; // target edge length
  repelRadius: number; // nodes within this distance repel each other
  attractK: number; // strength of neighbor attraction
  repelK: number; // strength of repulsion
  smoothK: number; // strength of curvature smoothing
  maxEdge: number; // edge longer than this -> insert a midpoint node
  maxNodes: number; // global node cap (perf)
  branchChance: number; // per-step per-tip probability of branching
  growBias: number; // how strongly the gravity/light vector biases growth
}

export const DEFAULT_CONFIG: GrowthConfig = {
  restLength: 9,
  repelRadius: 18,
  attractK: 0.16,
  repelK: 0.9,
  smoothK: 0.18,
  maxEdge: 13,
  maxNodes: 2200,
  branchChance: 0.014,
  growBias: 0.55,
};

export interface GravityVector {
  // unit-ish vector the tips lean toward (set by tilt / pointer / auto-demo)
  x: number;
  y: number;
}

export class CoralGarden {
  strands: Strand[] = [];
  config: GrowthConfig;
  width: number;
  height: number;
  gravity: GravityVector = { x: 0, y: -0.4 }; // gentle upward default
  // tip activity (delta length) keyed by strand index, refreshed each step
  tipActivity: number[] = [];
  // events surfaced to the audio layer, drained each frame
  branchEvents = 0;
  private cell: number;
  private grid = new Map<number, Node[]>();

  constructor(width: number, height: number, config: GrowthConfig = DEFAULT_CONFIG) {
    this.width = width;
    this.height = height;
    this.config = config;
    this.cell = config.repelRadius;
  }

  get nodeCount(): number {
    let n = 0;
    for (const s of this.strands) n += s.nodes.length;
    return n;
  }

  // Seed a small strand at (x,y) with a given initial heading (radians).
  seed(x: number, y: number, heading: number, hue: number): void {
    const len = 4;
    const nodes: Node[] = [];
    for (let i = 0; i < len; i++) {
      const t = (i - (len - 1) / 2) * this.config.restLength;
      nodes.push({
        x: x + Math.cos(heading) * t,
        y: y + Math.sin(heading) * t,
        dx: 0,
        dy: 0,
        age: 0,
      });
    }
    this.strands.push({ nodes, heading, hue, alive: true });
  }

  private key(cx: number, cy: number): number {
    // pack two grid coords into one number key
    return cx * 73856093 + cy * 19349663;
  }

  private rebuildGrid(): void {
    this.grid.clear();
    const c = this.cell;
    for (const s of this.strands) {
      for (const n of s.nodes) {
        const cx = Math.floor(n.x / c);
        const cy = Math.floor(n.y / c);
        const k = this.key(cx, cy);
        let bucket = this.grid.get(k);
        if (!bucket) {
          bucket = [];
          this.grid.set(k, bucket);
        }
        bucket.push(n);
      }
    }
  }

  // One simulation step.
  step(): void {
    const cfg = this.config;
    this.rebuildGrid();
    this.branchEvents = 0;
    this.tipActivity = new Array(this.strands.length).fill(0);

    const capped = this.nodeCount >= cfg.maxNodes;

    // --- accumulate forces ---
    for (const s of this.strands) {
      const ns = s.nodes;
      const L = ns.length;
      for (let i = 0; i < L; i++) {
        const n = ns[i];
        n.dx = 0;
        n.dy = 0;
        n.age++;

        // 1. attraction to connected neighbors toward rest length
        if (i > 0) this.attract(n, ns[i - 1], cfg);
        if (i < L - 1) this.attract(n, ns[i + 1], cfg);

        // 3. curvature smoothing — toward midpoint of neighbors
        if (i > 0 && i < L - 1) {
          const mx = (ns[i - 1].x + ns[i + 1].x) * 0.5;
          const my = (ns[i - 1].y + ns[i + 1].y) * 0.5;
          n.dx += (mx - n.x) * cfg.smoothK;
          n.dy += (my - n.y) * cfg.smoothK;
        }

        // 2. repulsion from nearby nodes (spatial hash)
        this.repel(n, cfg);
      }
    }

    // --- bias growing tips toward gravity/light vector ---
    if (!capped) {
      for (const s of this.strands) {
        if (!s.alive) continue;
        const tip = s.nodes[s.nodes.length - 1];
        const root = s.nodes[0];
        tip.dx += this.gravity.x * cfg.growBias;
        tip.dy += this.gravity.y * cfg.growBias;
        root.dx -= this.gravity.x * cfg.growBias * 0.3;
        root.dy -= this.gravity.y * cfg.growBias * 0.3;
      }
    }

    // --- integrate + soft bounds ---
    const margin = 14;
    for (let si = 0; si < this.strands.length; si++) {
      const s = this.strands[si];
      const ns = s.nodes;
      const tipIdx = ns.length - 1;
      for (let i = 0; i < ns.length; i++) {
        const n = ns[i];
        const before = i === tipIdx ? Math.hypot(n.dx, n.dy) : 0;
        // clamp per-step movement so nothing snaps
        const mag = Math.hypot(n.dx, n.dy);
        const maxMove = 2.2;
        if (mag > maxMove) {
          n.dx = (n.dx / mag) * maxMove;
          n.dy = (n.dy / mag) * maxMove;
        }
        n.x += n.dx;
        n.y += n.dy;
        // keep inside the canvas with a soft push
        if (n.x < margin) n.x += (margin - n.x) * 0.2;
        if (n.x > this.width - margin) n.x -= (n.x - (this.width - margin)) * 0.2;
        if (n.y < margin) n.y += (margin - n.y) * 0.2;
        if (n.y > this.height - margin) n.y -= (n.y - (this.height - margin)) * 0.2;
        if (i === tipIdx) this.tipActivity[si] = before;
      }
    }

    if (!capped) {
      this.grow(cfg);
      this.branch(cfg);
    }
  }

  private attract(n: Node, m: Node, cfg: GrowthConfig): void {
    const ax = m.x - n.x;
    const ay = m.y - n.y;
    const d = Math.hypot(ax, ay) || 1e-6;
    const f = ((d - cfg.restLength) / d) * cfg.attractK;
    n.dx += ax * f;
    n.dy += ay * f;
  }

  private repel(n: Node, cfg: GrowthConfig): void {
    const c = this.cell;
    const r = cfg.repelRadius;
    const r2 = r * r;
    const cx = Math.floor(n.x / c);
    const cy = Math.floor(n.y / c);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = this.grid.get(this.key(gx, gy));
        if (!bucket) continue;
        for (const o of bucket) {
          if (o === n) continue;
          const ox = n.x - o.x;
          const oy = n.y - o.y;
          const d2 = ox * ox + oy * oy;
          if (d2 > r2 || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const f = ((r - d) / r) * cfg.repelK;
          n.dx += (ox / d) * f;
          n.dy += (oy / d) * f;
        }
      }
    }
  }

  // 4. growth — insert midpoints on long edges + at high-curvature kinks.
  private grow(cfg: GrowthConfig): void {
    const budget = cfg.maxNodes - this.nodeCount;
    if (budget <= 0) return;
    let added = 0;
    for (const s of this.strands) {
      const ns = s.nodes;
      for (let i = ns.length - 1; i > 0; i--) {
        if (added >= budget) break;
        const a = ns[i - 1];
        const b = ns[i];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        let insert = d > cfg.maxEdge;
        // high-curvature insertion: tight bends gather more nodes -> folds
        if (!insert && i > 1 && i < ns.length) {
          const p = ns[i - 2];
          const v1x = a.x - p.x;
          const v1y = a.y - p.y;
          const v2x = b.x - a.x;
          const v2y = b.y - a.y;
          const dot = v1x * v2x + v1y * v2y;
          const m1 = Math.hypot(v1x, v1y) || 1e-6;
          const m2 = Math.hypot(v2x, v2y) || 1e-6;
          const cos = dot / (m1 * m2);
          if (cos < 0.2 && d > cfg.restLength * 1.1 && Math.random() < 0.04) {
            insert = true;
          }
        }
        if (insert) {
          ns.splice(i, 0, {
            x: (a.x + b.x) * 0.5,
            y: (a.y + b.y) * 0.5,
            dx: 0,
            dy: 0,
            age: 0,
          });
          added++;
        }
      }
    }
  }

  // 5. branching — a living tip occasionally spawns a new strand.
  private branch(cfg: GrowthConfig): void {
    if (this.nodeCount >= cfg.maxNodes * 0.92) return;
    const current = [...this.strands];
    for (const s of current) {
      if (!s.alive || s.nodes.length < 5) continue;
      if (Math.random() > cfg.branchChance) continue;
      const tip = s.nodes[s.nodes.length - 1];
      const prev = s.nodes[s.nodes.length - 2];
      const base = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      const turn = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
      this.seed(tip.x, tip.y, base + turn, (s.hue + 20 + Math.random() * 40) % 360);
      this.branchEvents++;
      if (this.strands.length > 26) break; // cap strand count
    }
  }

  // Index of the most-active growing tip (for the melody mapping).
  mostActiveTip(): { strandIndex: number; node: Node } | null {
    let best = -1;
    let bestVal = -1;
    for (let i = 0; i < this.tipActivity.length; i++) {
      if (this.tipActivity[i] > bestVal && this.strands[i]?.alive) {
        bestVal = this.tipActivity[i];
        best = i;
      }
    }
    if (best < 0) return null;
    const s = this.strands[best];
    return { strandIndex: best, node: s.nodes[s.nodes.length - 1] };
  }
}
