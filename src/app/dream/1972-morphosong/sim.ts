// ─────────────────────────────────────────────────────────────────────────────
// 1972-morphosong / sim.ts — the living organism substrate.
//
//   Two interchangeable implementations of one `Organism` interface:
//     • WebGpuOrganism   — the real thing: a Gray–Scott reaction-diffusion field
//       stepped in a WGSL COMPUTE shader (ping-pong storage buffers), rendered
//       through a log-polar cortical warp, with a compute reduction reading the
//       field's spatial statistics back for audio re-voicing.
//     • CanvasOrganism   — a lightweight Canvas2D fallback (small CPU RD + warped
//       blit) for when navigator.gpu is missing (e.g. the headless 06:30 review),
//       so the piece is NEVER blank and audio still couples to real field stats.
//
//   Determinism: initial seeding uses a fixed-seed mulberry32 — no Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { UPDATE_WGSL, STATS_WGSL, RENDER_WGSL } from "./wgsl";

export interface StepParams {
  feed: number;
  kill: number;
  rate: number; // reaction-rate multiplier (vocal energy → growth)
  twist: number; // spiral shear of the cortical warp
  rings: number; // radial frequency of the cortical warp
  bright: number; // bloom brightness
  time: number; // seconds, for slow luminance drift only
}

export interface FieldStats {
  meanV: number; // overall "how much organism"
  varV: number; // spottiness / contrast
  grad: number; // edge density / worminess
  spot: number; // fraction of high-V cells
  stripe: number; // fraction of mid-V cells
}

export interface Organism {
  readonly kind: "webgpu" | "canvas2d";
  resize(): void;
  step(p: StepParams): void;
  readonly stats: FieldStats;
  destroy(): void;
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// Deterministic PRNG for the seed pattern (no Math.random / Date.now).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── pitch → morphology ───────────────────────────────────────────────────────
// Different sung pitches breed different Gray–Scott regimes. This curated path
// through (feed, kill) space visits maze → honeycomb → coral/worms → spots.
const FK_KEYS = [
  { p: 0.0, f: 0.026, k: 0.055 }, // stripes / maze
  { p: 0.34, f: 0.039, k: 0.058 }, // holes / honeycomb
  { p: 0.67, f: 0.055, k: 0.062 }, // worms / coral
  { p: 1.0, f: 0.037, k: 0.065 }, // spots / mitosis
];

export function pitchToFK(pitchNorm: number): { feed: number; kill: number } {
  const p = clamp(pitchNorm, 0, 1);
  for (let i = 0; i < FK_KEYS.length - 1; i++) {
    const a = FK_KEYS[i];
    const b = FK_KEYS[i + 1];
    if (p <= b.p) {
      const t = (p - a.p) / (b.p - a.p || 1);
      return { feed: a.f + (b.f - a.f) * t, kill: a.k + (b.k - a.k) * t };
    }
  }
  const last = FK_KEYS[FK_KEYS.length - 1];
  return { feed: last.f, kill: last.k };
}

/** Map the current voice (sung pitch + energy) to a full step-parameter set. */
export function morphoParams(
  pitchNorm: number,
  rms: number,
  timeSec: number,
): StepParams {
  const fk = pitchToFK(pitchNorm);
  const e = clamp(rms, 0, 1);
  return {
    feed: fk.feed,
    kill: fk.kill,
    rate: 0.82 + 0.55 * e, // energy → growth speed
    twist: 0.12 + pitchNorm * 1.75, // pitch → spiral tightness
    rings: 2.3 + pitchNorm * 2.4, // pitch → tunnel frequency
    bright: 0.7 + 0.5 * e, // energy → bloom brightness
    time: timeSec,
  };
}

/** Build a deterministic initial field: U=1, V=0, with scattered V blobs. */
function seedField(grid: number): Float32Array {
  const data = new Float32Array(grid * grid * 2);
  for (let i = 0; i < grid * grid; i++) {
    data[i * 2] = 1.0; // U
    data[i * 2 + 1] = 0.0; // V
  }
  const rnd = mulberry32(0x1972c0de);
  const blobs = 26;
  for (let b = 0; b < blobs; b++) {
    const cx = Math.floor(rnd() * grid);
    const cy = Math.floor(rnd() * grid);
    const rad = 3 + Math.floor(rnd() * 6);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const x = (cx + dx + grid) % grid;
        const y = (cy + dy + grid) % grid;
        const idx = (y * grid + x) * 2;
        data[idx] = 0.34;
        data[idx + 1] = 0.68;
      }
    }
  }
  return data;
}

// ═════════════════════════════════════════════════════════════════════════════
// WebGPU organism
// ═════════════════════════════════════════════════════════════════════════════

const GRID = 256;
const ITER_PER_FRAME = 8;
const STATS_EVERY = 6;

export class WebGpuOrganism implements Organism {
  readonly kind = "webgpu" as const;

  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;

  private fieldA: GPUBuffer;
  private fieldB: GPUBuffer;
  private paramBuf: GPUBuffer;
  private dimsBuf: GPUBuffer;
  private rparamBuf: GPUBuffer;
  private statsBuf: GPUBuffer;
  private statsRead: GPUBuffer;

  private updatePipe: GPUComputePipeline;
  private statsPipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;

  private updateAB: GPUBindGroup; // read A → write B
  private updateBA: GPUBindGroup; // read B → write A
  private statsA: GPUBindGroup;
  private statsB: GPUBindGroup;
  private renderA: GPUBindGroup;
  private renderB: GPUBindGroup;

  private curIsA = true;
  private frame = 0;
  private pending = false;
  private destroyed = false;

  private _stats: FieldStats = {
    meanV: 0,
    varV: 0,
    grad: 0,
    spot: 0,
    stripe: 0,
  };

  private constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    ctx: GPUCanvasContext,
    format: GPUTextureFormat,
  ) {
    this.canvas = canvas;
    this.device = device;
    this.ctx = ctx;
    this.format = format;

    const fieldBytes = GRID * GRID * 2 * 4;
    const seed = seedField(GRID);

    const makeField = (): GPUBuffer => {
      const buf = device.createBuffer({
        size: fieldBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(buf.getMappedRange()).set(seed);
      buf.unmap();
      return buf;
    };
    this.fieldA = makeField();
    this.fieldB = makeField();

    this.paramBuf = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.dimsBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.rparamBuf = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.statsBuf = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.statsRead = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // dims uniform is constant: width, height, downsample step, pad
    device.queue.writeBuffer(
      this.dimsBuf,
      0,
      new Float32Array([GRID, GRID, 3, 0]),
    );

    const updateMod = device.createShaderModule({ code: UPDATE_WGSL });
    const statsMod = device.createShaderModule({ code: STATS_WGSL });
    const renderMod = device.createShaderModule({ code: RENDER_WGSL });

    this.updatePipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: updateMod, entryPoint: "main" },
    });
    this.statsPipe = device.createComputePipeline({
      layout: "auto",
      compute: { module: statsMod, entryPoint: "main" },
    });
    this.renderPipe = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: {
        module: renderMod,
        entryPoint: "fs",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    const uLayout = this.updatePipe.getBindGroupLayout(0);
    this.updateAB = device.createBindGroup({
      layout: uLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.fieldA } },
        { binding: 2, resource: { buffer: this.fieldB } },
      ],
    });
    this.updateBA = device.createBindGroup({
      layout: uLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramBuf } },
        { binding: 1, resource: { buffer: this.fieldB } },
        { binding: 2, resource: { buffer: this.fieldA } },
      ],
    });

    const sLayout = this.statsPipe.getBindGroupLayout(0);
    this.statsA = device.createBindGroup({
      layout: sLayout,
      entries: [
        { binding: 0, resource: { buffer: this.dimsBuf } },
        { binding: 1, resource: { buffer: this.fieldA } },
        { binding: 2, resource: { buffer: this.statsBuf } },
      ],
    });
    this.statsB = device.createBindGroup({
      layout: sLayout,
      entries: [
        { binding: 0, resource: { buffer: this.dimsBuf } },
        { binding: 1, resource: { buffer: this.fieldB } },
        { binding: 2, resource: { buffer: this.statsBuf } },
      ],
    });

    const rLayout = this.renderPipe.getBindGroupLayout(0);
    this.renderA = device.createBindGroup({
      layout: rLayout,
      entries: [
        { binding: 0, resource: { buffer: this.rparamBuf } },
        { binding: 1, resource: { buffer: this.fieldA } },
      ],
    });
    this.renderB = device.createBindGroup({
      layout: rLayout,
      entries: [
        { binding: 0, resource: { buffer: this.rparamBuf } },
        { binding: 1, resource: { buffer: this.fieldB } },
      ],
    });

    this.resize();
  }

  static async create(
    canvas: HTMLCanvasElement,
  ): Promise<WebGpuOrganism | null> {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    let adapter: GPUAdapter | null = null;
    try {
      adapter = await navigator.gpu.requestAdapter({
        powerPreference: "high-performance",
      });
    } catch {
      return null;
    }
    if (!adapter) return null;
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice();
    } catch {
      return null;
    }
    const ctx = canvas.getContext("webgpu") as unknown as GPUCanvasContext | null;
    if (!ctx) return null;
    const format = navigator.gpu.getPreferredCanvasFormat();
    try {
      ctx.configure({ device, format, alphaMode: "opaque" });
      return new WebGpuOrganism(canvas, device, ctx, format);
    } catch {
      // shader/pipeline/buffer validation failure → let the caller fall back.
      try {
        device.destroy();
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  resize(): void {
    const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
    const w = Math.max(1, Math.floor((this.canvas.clientWidth || 1) * dpr));
    const h = Math.max(1, Math.floor((this.canvas.clientHeight || 1) * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  get stats(): FieldStats {
    return this._stats;
  }

  step(p: StepParams): void {
    if (this.destroyed) return;
    const device = this.device;

    device.queue.writeBuffer(
      this.paramBuf,
      0,
      new Float32Array([p.feed, p.kill, 1.0, 0.5, p.rate, 0, GRID, GRID]),
    );
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    device.queue.writeBuffer(
      this.rparamBuf,
      0,
      new Float32Array([
        GRID,
        GRID,
        p.time,
        p.twist,
        p.rings,
        p.bright,
        aspect,
        0,
      ]),
    );

    const enc = device.createCommandEncoder();

    // reaction-diffusion sub-steps
    const groups = Math.ceil(GRID / 8);
    for (let i = 0; i < ITER_PER_FRAME; i++) {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.updatePipe);
      cp.setBindGroup(0, this.curIsA ? this.updateAB : this.updateBA);
      cp.dispatchWorkgroups(groups, groups);
      cp.end();
      this.curIsA = !this.curIsA;
    }

    // spatial-statistics reduction + copy to a mappable buffer (throttled)
    const doStats = this.frame % STATS_EVERY === 0 && !this.pending;
    if (doStats) {
      const sp = enc.beginComputePass();
      sp.setPipeline(this.statsPipe);
      sp.setBindGroup(0, this.curIsA ? this.statsA : this.statsB);
      sp.dispatchWorkgroups(1);
      sp.end();
      enc.copyBufferToBuffer(this.statsBuf, 0, this.statsRead, 0, 32);
    }

    // cortical-warp render of the current field
    const view = this.ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.01, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(this.renderPipe);
    rp.setBindGroup(0, this.curIsA ? this.renderA : this.renderB);
    rp.draw(3);
    rp.end();

    device.queue.submit([enc.finish()]);

    if (doStats) {
      this.pending = true;
      this.statsRead
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (this.destroyed) return;
          const arr = new Float32Array(this.statsRead.getMappedRange().slice(0));
          this.statsRead.unmap();
          this.absorbStats(arr);
          this.pending = false;
        })
        .catch(() => {
          this.pending = false;
        });
    }
    this.frame++;
  }

  private absorbStats(a: Float32Array): void {
    const n = Math.max(1, a[3]);
    const meanV = a[0] / n;
    const meanV2 = a[1] / n;
    this._stats = {
      meanV,
      varV: Math.max(0, meanV2 - meanV * meanV),
      grad: a[2] / n,
      spot: a[4] / n,
      stripe: a[5] / n,
    };
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.fieldA.destroy();
      this.fieldB.destroy();
      this.paramBuf.destroy();
      this.dimsBuf.destroy();
      this.rparamBuf.destroy();
      this.statsBuf.destroy();
      this.statsRead.destroy();
      this.device.destroy();
    } catch {
      /* already gone */
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Canvas2D fallback organism (CPU reaction-diffusion + warped blit)
// ═════════════════════════════════════════════════════════════════════════════

const CGRID = 108; // CPU field resolution (kept small — this is the fallback)
const COUT = 240; // rendered pixels (CSS-stretched to fill)
const CITER = 6;

export class CanvasOrganism implements Organism {
  readonly kind = "canvas2d" as const;

  private canvas: HTMLCanvasElement;
  private c2d: CanvasRenderingContext2D;
  private u: Float32Array;
  private v: Float32Array;
  private u2: Float32Array;
  private v2: Float32Array;
  private img: ImageData;
  private destroyed = false;

  private _stats: FieldStats = {
    meanV: 0,
    varV: 0,
    grad: 0,
    spot: 0,
    stripe: 0,
  };

  constructor(canvas: HTMLCanvasElement, c2d: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.c2d = c2d;
    const n = CGRID * CGRID;
    this.u = new Float32Array(n);
    this.v = new Float32Array(n);
    this.u2 = new Float32Array(n);
    this.v2 = new Float32Array(n);
    const seed = seedField(CGRID);
    for (let i = 0; i < n; i++) {
      this.u[i] = seed[i * 2];
      this.v[i] = seed[i * 2 + 1];
    }
    this.img = c2d.createImageData(COUT, COUT);
    this.resize();
  }

  static create(canvas: HTMLCanvasElement): CanvasOrganism | null {
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    return new CanvasOrganism(canvas, c2d);
  }

  resize(): void {
    if (this.canvas.width !== COUT) this.canvas.width = COUT;
    if (this.canvas.height !== COUT) this.canvas.height = COUT;
  }

  get stats(): FieldStats {
    return this._stats;
  }

  step(p: StepParams): void {
    if (this.destroyed) return;
    const w = CGRID;
    const h = CGRID;
    const feed = p.feed;
    const kill = p.kill;
    const rate = p.rate;

    for (let it = 0; it < CITER; it++) {
      const u = this.u;
      const v = this.v;
      const un = this.u2;
      const vn = this.v2;
      for (let y = 0; y < h; y++) {
        const yu = ((y - 1 + h) % h) * w;
        const yd = ((y + 1) % h) * w;
        const yc = y * w;
        for (let x = 0; x < w; x++) {
          const xl = (x - 1 + w) % w;
          const xr = (x + 1) % w;
          const i = yc + x;
          const cu = u[i];
          const cv = v[i];
          // 5-point Laplacian
          const lu =
            u[yc + xl] + u[yc + xr] + u[yu + x] + u[yd + x] - 4 * cu;
          const lv =
            v[yc + xl] + v[yc + xr] + v[yu + x] + v[yd + x] - 4 * cv;
          const uvv = cu * cv * cv;
          let nu = cu + (0.16 * lu - uvv + feed * (1 - cu)) * rate;
          let nv = cv + (0.08 * lv + uvv - (feed + kill) * cv) * rate;
          nu = nu < 0 ? 0 : nu > 1 ? 1 : nu;
          nv = nv < 0 ? 0 : nv > 1 ? 1 : nv;
          un[i] = nu;
          vn[i] = nv;
        }
      }
      this.u = un;
      this.v = vn;
      this.u2 = u;
      this.v2 = v;
    }

    this.computeStats();
    this.render(p);
  }

  private computeStats(): void {
    const v = this.v;
    const w = CGRID;
    const h = CGRID;
    let sumV = 0;
    let sumV2 = 0;
    let sumG = 0;
    let spot = 0;
    let stripe = 0;
    let n = 0;
    const s = 2;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const val = v[y * w + x];
        const vx = v[y * w + ((x + s) % w)];
        const vy = v[((y + s) % h) * w + x];
        sumV += val;
        sumV2 += val * val;
        sumG += Math.abs(val - vx) + Math.abs(val - vy);
        if (val > 0.42) spot++;
        else if (val > 0.16) stripe++;
        n++;
      }
    }
    n = Math.max(1, n);
    const meanV = sumV / n;
    this._stats = {
      meanV,
      varV: Math.max(0, sumV2 / n - meanV * meanV),
      grad: sumG / n,
      spot: spot / n,
      stripe: stripe / n,
    };
  }

  private render(p: StepParams): void {
    const v = this.v;
    const w = CGRID;
    const data = this.img.data;
    const half = COUT / 2;
    const breathe = 0.86 + 0.14 * Math.sin(p.time * 0.3);
    const twist = p.twist;
    const rings = p.rings;
    const bright = p.bright * breathe;

    for (let py = 0; py < COUT; py++) {
      const ny = (py - half) / half;
      for (let px = 0; px < COUT; px++) {
        const nx = (px - half) / half;
        const r = Math.sqrt(nx * nx + ny * ny) + 0.055;
        const theta = Math.atan2(ny, nx);
        const lr = Math.log(r);
        let fx = theta / (Math.PI * 2) + p.time * 0.008;
        let fy = lr * rings + theta * twist + p.time * 0.01;
        fx -= Math.floor(fx);
        fy -= Math.floor(fy);
        const gx = Math.min(w - 1, Math.floor(fx * w));
        const gy = Math.min(w - 1, Math.floor(fy * w));
        const val = v[gy * w + gx];

        const col = palette(val);
        const vig = 1 - 0.35 * smoothstep(0.7, 1.6, Math.sqrt(nx * nx + ny * ny));
        const m = bright * vig;
        const o = (py * COUT + px) * 4;
        data[o] = clamp8(col[0] * m);
        data[o + 1] = clamp8(col[1] * m);
        data[o + 2] = clamp8(col[2] * m);
        data[o + 3] = 255;
      }
    }
    this.c2d.putImageData(this.img, 0, 0);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

// ── shared warm palette (mirror of the WGSL palette) ─────────────────────────
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
}
function clamp8(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : x;
}
function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function palette(v: number): [number, number, number] {
  const base: [number, number, number] = [13, 6, 15];
  const amber: [number, number, number] = [245, 140, 41];
  const magenta: [number, number, number] = [219, 33, 133];
  const violet: [number, number, number] = [117, 41, 199];
  let col = mix3(base, amber, smoothstep(0.08, 0.35, v));
  col = mix3(col, magenta, smoothstep(0.3, 0.62, v));
  col = mix3(col, violet, smoothstep(0.5, 0.85, v));
  return col;
}
