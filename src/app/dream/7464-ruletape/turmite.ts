// ─────────────────────────────────────────────────────────────────────────────
// 7464-ruletape — turmite.ts
//
// A generalized Langton's ant ("turmite"). The whole machine is specified by a
// short symbolic RULETAPE: a string of turn symbols, one per cell-state/colour.
//
//   • The tape length k = number of cell states/colours.
//   • On a cell of state s the ant reads rule[s] and turns:
//       L = 90° left · R = 90° right · U = 180° · N = go straight.
//   • It then increments the cell's state (mod k) — repainting the cell — and
//     steps forward one lattice cell.
//
// Tiny edits to that tape flip the SAME machine between whole aesthetic regimes:
// chaotic space-filling noise, bilateral/spiral order, or a highway marching off
// forever. This file is the instrument's engine + a cheap live "order meter"
// (a straightness-vs-diffusion + edge-density estimate of where the current tape
// sits on the order↔chaos axis).
//
// Pure Canvas2D. No GPU, no external state.
// ─────────────────────────────────────────────────────────────────────────────

import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";

export type Turn = "L" | "R" | "U" | "N";

/** The order symbol tiles cycle through when tapped. */
export const TURN_CYCLE: readonly Turn[] = ["L", "R", "U", "N"];

/** Human labels for the four turn symbols. */
export const TURN_LABEL: Record<Turn, string> = {
  L: "left",
  R: "right",
  U: "u-turn",
  N: "straight",
};

// up, right, down, left (clockwise)
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// turn codes: 0 = left, 1 = right, 2 = u-turn, 3 = straight
function turnCode(t: Turn): number {
  return t === "L" ? 0 : t === "R" ? 1 : t === "U" ? 2 : 3;
}

/** Parse a free-typed string into a valid turn tape (>= 2 symbols). */
export function parseRule(src: string): Turn[] {
  const out: Turn[] = [];
  for (const ch of src.toUpperCase()) {
    if (ch === "L" || ch === "R" || ch === "U" || ch === "N") out.push(ch);
  }
  while (out.length < 2) out.push("L");
  return out.slice(0, 12);
}

export interface Preset {
  rule: string;
  name: string;
  regime: string;
}

/**
 * The preset shelf the instrument self-demos through. Each is labelled with the
 * regime its tape selects. The "generalized ant" tapes (LLRRRL, LLRLRLL, LLLR)
 * are the ones the 2025 papers show admit BOTH highway order and persistent
 * chaos — the tape, not the machine, chooses.
 */
export const PRESETS: readonly Preset[] = [
  { rule: "RL", name: "Langton", regime: "chaos, then a highway" },
  { rule: "RLR", name: "Triad", regime: "restless growth" },
  { rule: "LLRR", name: "Cardioid", regime: "bilateral order" },
  { rule: "RRLL", name: "Mirror", regime: "symmetric bloom" },
  { rule: "LRRRRRLLR", name: "Spiral", regime: "spiral / chaotic" },
  { rule: "LLRRRL", name: "Sideways", regime: "highway or chaos" },
  { rule: "LLRLRLL", name: "Braid", regime: "structured chaos" },
  { rule: "LLLR", name: "LLLR ant", regime: "order & chaos" },
  { rule: "RRLLLRLLLRRR", name: "Lattice", regime: "dense weave" },
  { rule: "RLLR", name: "Weave", regime: "woven symmetry" },
];

export interface TurmiteMetrics {
  /** 0 = chaos … 1 = order. Smoothed; this is the criticality gauge. */
  order: number;
  straightness: number;
  disorder: number;
  activity: number;
  steps: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class Turmite {
  readonly W: number;
  readonly H: number;

  private grid: Uint8Array;
  private k = 2;
  private rule: number[] = [1, 0];
  private ruleTape: Turn[] = ["R", "L"];

  private x: number;
  private y: number;
  private dir = 0;

  // unbounded (non-wrapping) position, for the straightness estimate
  private ux = 0;
  private uy = 0;

  steps = 0;

  private palette: [number, number, number][] = [];
  private off: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private image: ImageData;

  // frame-sampled path of the unbounded centroid, for straightness
  private samples: Array<[number, number]> = [];
  private smOrder = 0.5;
  private disorder = 0.5;
  private activity = 0;

  constructor(W: number, H: number, ruleStr: string) {
    this.W = W;
    this.H = H;
    this.grid = new Uint8Array(W * H);
    this.x = (W / 2) | 0;
    this.y = (H / 2) | 0;

    this.off = document.createElement("canvas");
    this.off.width = W;
    this.off.height = H;
    const octx = this.off.getContext("2d");
    if (!octx) throw new Error("no 2d context");
    this.offCtx = octx;
    this.image = octx.createImageData(W, H);

    this.setRule(ruleStr);
  }

  /** Install a new tape and re-run the lattice from a clean centre. */
  setRule(ruleStr: string): void {
    this.ruleTape = parseRule(ruleStr);
    this.rule = this.ruleTape.map(turnCode);
    this.k = this.ruleTape.length;
    this.buildPalette();
    this.reset();
  }

  get tape(): Turn[] {
    return this.ruleTape;
  }

  get colours(): number {
    return this.k;
  }

  private buildPalette(): void {
    const bg = hexToRgb(VIOLET[950]);
    const stops = [hexToRgb(INDIGO), hexToRgb(VIOLET[500]), hexToRgb(MAGENTA), hexToRgb(VIOLET[300])];
    this.palette = [];
    for (let s = 0; s < this.k; s++) {
      if (s === 0) {
        this.palette.push(bg);
        continue;
      }
      // spread active states across the violet arc by luminance
      const t = this.k > 2 ? (s - 1) / (this.k - 2) : 0.55;
      const seg = t * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(seg));
      this.palette.push(mixRgb(stops[i], stops[i + 1], seg - i));
    }
  }

  /** Colour of a given cell-state, as an rgb string (for the SVG tiles). */
  stateColour(s: number): string {
    const c = this.palette[s % this.k] ?? [255, 255, 255];
    return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
  }

  reset(): void {
    this.grid.fill(0);
    this.x = (this.W / 2) | 0;
    this.y = (this.H / 2) | 0;
    this.dir = 0;
    this.ux = 0;
    this.uy = 0;
    this.steps = 0;
    this.samples = [];
    this.smOrder = 0.5;
    this.disorder = 0.5;
    this.activity = 0;
  }

  private step(): void {
    const idx = this.y * this.W + this.x;
    const s = this.grid[idx];
    const code = this.rule[s];
    if (code === 0) this.dir = (this.dir + 3) & 3;
    else if (code === 1) this.dir = (this.dir + 1) & 3;
    else if (code === 2) this.dir = (this.dir + 2) & 3;
    // code === 3 → straight, no turn
    this.grid[idx] = (s + 1) % this.k;
    const d = DIRS[this.dir];
    this.ux += d[0];
    this.uy += d[1];
    this.x = (this.x + d[0] + this.W) % this.W;
    this.y = (this.y + d[1] + this.H) % this.H;
    this.steps++;
  }

  /** Advance n lattice steps. */
  run(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  /** Called once per rendered frame — updates the order meter. */
  sample(): void {
    this.samples.push([this.ux, this.uy]);
    if (this.samples.length > 80) this.samples.shift();

    // straightness: how collinear the frame-sampled path is (highway → ~1)
    let straight = 0;
    const n = this.samples.length;
    if (n >= 8) {
      const a = this.samples[0];
      const b = this.samples[n - 1];
      const drift = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let path = 0;
      for (let i = 1; i < n; i++) {
        const p = this.samples[i - 1];
        const q = this.samples[i];
        path += Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
      straight = path > 1e-3 ? clamp01(drift / path) : 0;
    }

    // order = ballistic highway OR low edge-density structure; chaos = neither
    const target = clamp01(0.55 * straight + 0.45 * (1 - this.disorder));
    this.smOrder += (target - this.smOrder) * 0.06;

    this.metricsCache = {
      order: this.smOrder,
      straightness: straight,
      disorder: this.disorder,
      activity: this.activity,
      steps: this.steps,
    };
  }

  /** Edge-density (disorder) + activity over a subsample of the lattice. */
  measure(): void {
    const W = this.W;
    const H = this.H;
    const grid = this.grid;
    let edges = 0;
    let counted = 0;
    let nonzero = 0;
    let cells = 0;
    const stride = 3;
    for (let y = 1; y < H - 1; y += stride) {
      for (let x = 1; x < W - 1; x += stride) {
        const i = y * W + x;
        const v = grid[i];
        cells++;
        if (v !== 0) {
          nonzero++;
          let m = 0;
          if (grid[i - 1] !== v) m++;
          if (grid[i + 1] !== v) m++;
          if (grid[i - W] !== v) m++;
          if (grid[i + W] !== v) m++;
          edges += m / 4;
          counted++;
        }
      }
    }
    this.disorder = counted > 0 ? edges / counted : 0;
    this.activity = cells > 0 ? nonzero / cells : 0;
  }

  private metricsCache: TurmiteMetrics = {
    order: 0.5,
    straightness: 0,
    disorder: 0.5,
    activity: 0,
    steps: 0,
  };

  get metrics(): TurmiteMetrics {
    return this.metricsCache;
  }

  get antX(): number {
    return this.x;
  }
  get antY(): number {
    return this.y;
  }
  get antState(): number {
    return this.grid[this.y * this.W + this.x];
  }

  /** Paint the current lattice onto a main Canvas2D context (soft, no flicker). */
  render(ctx: CanvasRenderingContext2D, cssW: number, cssH: number): void {
    const data = this.image.data;
    const grid = this.grid;
    const pal = this.palette;
    for (let i = 0; i < grid.length; i++) {
      const c = pal[grid[i]];
      const j = i * 4;
      data[j] = c[0];
      data[j + 1] = c[1];
      data[j + 2] = c[2];
      data[j + 3] = 255;
    }
    this.offCtx.putImageData(this.image, 0, 0);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.imageSmoothingEnabled = true;
    // bloom pass
    ctx.globalAlpha = 0.55;
    try {
      ctx.filter = "blur(7px) brightness(1.25)";
    } catch {
      /* filter unsupported — skip bloom */
    }
    ctx.drawImage(this.off, 0, 0, cssW, cssH);
    ctx.filter = "none";
    // sharp pass
    ctx.globalAlpha = 1;
    ctx.drawImage(this.off, 0, 0, cssW, cssH);

    // ant head glow
    const px = (this.x / this.W) * cssW;
    const py = (this.y / this.H) * cssH;
    const r = Math.max(6, cssW / this.W) * 3;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, "rgba(237,233,254,0.95)");
    g.addColorStop(0.4, "rgba(167,139,250,0.55)");
    g.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
