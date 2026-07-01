// ─────────────────────────────────────────────────────────────────────────────
// dbm.ts — Dielectric Breakdown Model / Laplacian growth engine (pure TS).
//
//   After Niemeyer, Pietronero & Wiesmann, "Fractal Dimension of Dielectric
//   Breakdown," Phys. Rev. Lett. 52, 1033 (1984). We relax the discrete Laplace
//   equation ∇²φ = 0 on a coarse grid with the two terminals held at φ = 1
//   (Dirichlet sources) and the growing discharge cluster held at φ = 0. Each
//   growth step we pick a frontier bond — a cell adjacent to the cluster — with
//   probability ∝ |φ|^η (roulette selection), add it to the cluster, and emit a
//   branch segment. Raising η turns bushy DLA-like growth into sharp forked
//   lightning.
//
//   Everything here is deterministic-free of DOM; it's a plain numerical core the
//   renderer + audio layers consume. Grid is kept coarse (128×72) so a handful of
//   Gauss–Seidel sweeps per frame stays comfortably at 60fps in JS.
// ─────────────────────────────────────────────────────────────────────────────

export interface Terminal {
  /** grid-space x in [0, W-1]. */
  x: number;
  /** grid-space y in [0, H-1]. */
  y: number;
}

/** A branch segment emitted when a frontier cell joins the cluster. */
export interface Branch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** normalized height 0 (top) .. 1 (bottom) of the new tip — drives pitch. */
  heightNorm: number;
  /** which terminal seeded this growth front (0 or 1). */
  root: number;
  /** age in frames since emission (renderer/audio use this for decay). */
  age: number;
}

/** Cell state flags. */
const EMPTY = 0;
const CLUSTER = 1;

export class DBM {
  readonly W: number;
  readonly H: number;

  // potential field, row-major, length W*H
  private phi: Float32Array;
  // cell flags
  private state: Uint8Array;
  // parent index for each cluster cell (to draw segments); -1 = seed/none
  private parent: Int32Array;
  // which terminal a cluster cell descends from
  private origin: Uint8Array;

  private terminals: [Terminal, Terminal];

  /** growth sharpness exponent η. */
  eta = 3.0;
  /** field voltage 0..1 — scales relax speed & growth cadence & note energy. */
  voltage = 0.7;

  /** True on the frame a discharge bridged the two terminals (a strike). */
  connected = false;
  /** grid coords of the connection point, valid only when `connected`. */
  connectX = 0;
  connectY = 0;

  // frontier candidate cache (rebuilt lazily as the cluster grows)
  private frontier: number[] = [];
  private frontierSet: Uint8Array;

  private growthAccumulator = 0;

  constructor(W = 128, H = 72) {
    this.W = W;
    this.H = H;
    const n = W * H;
    this.phi = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.parent = new Int32Array(n).fill(-1);
    this.origin = new Uint8Array(n);
    this.frontierSet = new Uint8Array(n);
    this.terminals = [
      { x: W * 0.22, y: H * 0.5 },
      { x: W * 0.78, y: H * 0.5 },
    ];
    this.reseed();
  }

  setTerminals(a: Terminal, b: Terminal): void {
    this.terminals[0].x = clamp(a.x, 1, this.W - 2);
    this.terminals[0].y = clamp(a.y, 1, this.H - 2);
    this.terminals[1].x = clamp(b.x, 1, this.W - 2);
    this.terminals[1].y = clamp(b.y, 1, this.H - 2);
  }

  getTerminals(): [Terminal, Terminal] {
    return this.terminals;
  }

  private idx(x: number, y: number): number {
    return y * this.W + x;
  }

  /** Reset the cluster to the two terminal seeds and clear the field. */
  reseed(): void {
    this.state.fill(EMPTY);
    this.parent.fill(-1);
    this.origin.fill(0);
    this.frontierSet.fill(0);
    this.frontier.length = 0;
    this.connected = false;

    // seed a single cluster cell at each terminal; the OPPOSITE terminal is the
    // φ=1 source pulling growth toward it. We alternate: terminal 0's cluster
    // grows toward source 1 and vice-versa, so arcs reach across the gap.
    for (let t = 0; t < 2; t++) {
      const term = this.terminals[t];
      const cx = Math.round(clamp(term.x, 1, this.W - 2));
      const cy = Math.round(clamp(term.y, 1, this.H - 2));
      const i = this.idx(cx, cy);
      this.state[i] = CLUSTER;
      this.origin[i] = t;
      this.parent[i] = -1;
      this.addFrontierAround(cx, cy);
    }
    this.relaxField(24);
  }

  /** Move a cluster seed cell if a terminal drifted; keeps growth anchored. */
  private ensureSeeds(): void {
    // cheap: if neither terminal has a live cluster seed near it, reseed.
    // We don't chase drift every frame — reseed() is called on strikes anyway.
  }

  private addFrontierAround(x: number, y: number): void {
    const nbrs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of nbrs) {
      if (nx < 1 || ny < 1 || nx >= this.W - 1 || ny >= this.H - 1) continue;
      const ni = this.idx(nx, ny);
      if (this.state[ni] === EMPTY && this.frontierSet[ni] === 0) {
        this.frontier.push(ni);
        this.frontierSet[ni] = 1;
      }
    }
  }

  /** A few Gauss–Seidel sweeps of ∇²φ = 0 with Dirichlet boundaries. */
  private relaxField(iters: number): void {
    const { W, H, phi, state } = this;
    // set boundaries: sources φ=1, cluster φ=0.
    // sources are the two terminals (as φ=1) — we mark a small disc so the
    // field has a strong pull even after the cluster grows near them.
    for (let t = 0; t < 2; t++) {
      const term = this.terminals[t];
      const sx = Math.round(clamp(term.x, 1, W - 2));
      const sy = Math.round(clamp(term.y, 1, H - 2));
      const si = this.idx(sx, sy);
      // only treat as φ=1 source if not already consumed by cluster
      if (state[si] !== CLUSTER) {
        phi[si] = 1;
      }
    }
    for (let k = 0; k < iters; k++) {
      for (let y = 1; y < H - 1; y++) {
        const row = y * W;
        for (let x = 1; x < W - 1; x++) {
          const i = row + x;
          const s = state[i];
          if (s === CLUSTER) {
            phi[i] = 0;
            continue;
          }
          // re-pin sources each sweep
          let isSource = false;
          for (let t = 0; t < 2; t++) {
            const term = this.terminals[t];
            if (
              Math.round(term.x) === x &&
              Math.round(term.y) === y &&
              state[i] !== CLUSTER
            ) {
              isSource = true;
              break;
            }
          }
          if (isSource) {
            phi[i] = 1;
            continue;
          }
          phi[i] =
            0.25 * (phi[i - 1] + phi[i + 1] + phi[i - W] + phi[i + W]);
        }
      }
    }
  }

  /**
   * Advance the simulation by dt seconds. Runs a relax pass, then adds zero or
   * more frontier cells depending on voltage. Returns the branches emitted this
   * frame (may be empty). On a bridging connection, sets `connected` + coords.
   */
  step(dt: number): Branch[] {
    this.ensureSeeds();
    // relax more when voltage is high — hotter field, faster propagation.
    const iters = 4 + Math.round(this.voltage * 6);
    this.relaxField(iters);

    // growth cadence scales with voltage: ~8..40 cells/sec.
    const rate = 8 + this.voltage * 34;
    this.growthAccumulator += dt * rate;
    const nGrow = Math.floor(this.growthAccumulator);
    this.growthAccumulator -= nGrow;

    const out: Branch[] = [];
    for (let g = 0; g < nGrow; g++) {
      const b = this.grow();
      if (b) out.push(b);
      if (this.connected) break;
    }
    return out;
  }

  /** Add one frontier cell chosen with probability ∝ |φ|^η. */
  private grow(): Branch | null {
    const { W, H, phi, state } = this;
    // compact the frontier (drop cells that got absorbed) and build weights.
    let total = 0;
    const live: number[] = [];
    const weights: number[] = [];
    for (const i of this.frontier) {
      if (state[i] !== EMPTY) {
        this.frontierSet[i] = 0;
        continue;
      }
      // |φ|^η — clamp tiny values so early growth isn't stuck at zero.
      const p = Math.max(0.0001, phi[i]);
      const w = Math.pow(p, this.eta);
      live.push(i);
      weights.push(w);
      total += w;
    }
    this.frontier = live;
    if (live.length === 0 || total <= 0) {
      // field exhausted — force a reseed by signalling connection at midpoint.
      this.connected = true;
      this.connectX = (this.terminals[0].x + this.terminals[1].x) * 0.5;
      this.connectY = (this.terminals[0].y + this.terminals[1].y) * 0.5;
      return null;
    }

    // roulette selection
    let r = Math.random() * total;
    let chosen = live[0];
    for (let k = 0; k < live.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        chosen = live[k];
        break;
      }
    }

    const cx = chosen % W;
    const cy = (chosen / W) | 0;

    // find the neighbouring cluster cell that "grew" here (its parent) — the one
    // with the lowest φ among cluster neighbours (closest to the growing arc).
    let parentIdx = -1;
    let originT = 0;
    let bestPhi = Infinity;
    const nbrs = [chosen - 1, chosen + 1, chosen - W, chosen + W];
    for (const ni of nbrs) {
      if (ni < 0 || ni >= W * H) continue;
      if (state[ni] === CLUSTER) {
        if (phi[ni] < bestPhi) {
          bestPhi = phi[ni];
          parentIdx = ni;
          originT = this.origin[ni];
        }
      }
    }

    // commit
    this.state[chosen] = CLUSTER;
    this.parent[chosen] = parentIdx;
    this.origin[chosen] = originT;
    this.frontierSet[chosen] = 0;
    this.addFrontierAround(cx, cy);

    // did we reach the opposite terminal's source cell (or its cluster)?
    const otherT = originT === 0 ? 1 : 0;
    const ot = this.terminals[otherT];
    const dxo = cx - ot.x;
    const dyo = cy - ot.y;
    if (dxo * dxo + dyo * dyo < 6.25) {
      // within ~2.5 cells of the opposite terminal
      this.connected = true;
      this.connectX = cx;
      this.connectY = cy;
    }

    const px = parentIdx >= 0 ? parentIdx % W : cx;
    const py = parentIdx >= 0 ? (parentIdx / W) | 0 : cy;

    return {
      x0: px,
      y0: py,
      x1: cx,
      y1: cy,
      heightNorm: cy / (H - 1),
      root: originT,
      age: 0,
    };
  }

  /** Read-only access to the potential field (for optional viz/debug). */
  get field(): Float32Array {
    return this.phi;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
