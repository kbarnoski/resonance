// gpu.ts — Gray-Scott reaction-diffusion inkblot on WebGPU (primary renderer).
//
// The reaction-diffusion field (u,v) lives in a ping-pong pair of storage
// buffers, GRID x GRID. A WGSL compute shader advances Gray-Scott several
// sub-steps per frame. A full-screen render pass then folds the screen UV with
// kaleidoscope/mirror symmetry and samples v -> contemplative ink-on-light.
//
// No @webgpu/types dependency: we declare just-enough local interfaces and
// hardcode usage bit values numerically (STORAGE=0x80, COPY_DST=0x08,
// UNIFORM=0x40, RENDER_ATTACHMENT=0x10 ... combined below).
//
// Lineage: Bileam Tschepe (elekktronaut) feedback/inkblot TouchDesigner work +
// Entagma "Easy Houdini: Inkblots — Steal from TouchDesigner" (2026); the
// reaction model is Gray-Scott (Pearson 1993 / Turing 1952).

export const GRID = 256;

/** A seed = drop of "v" ink injected at a grid cell. */
export interface InkSeed {
  /** grid-space 0..1 */
  x: number;
  y: number;
  /** radius in grid cells */
  r: number;
  /** amount 0..1 */
  amount: number;
}

/** A bloom event surfaced back to the app for sonification. */
export interface FieldBloom {
  /** 0..1 normalized radius from centre */
  radius: number;
  /** 0..1 strength (front activity) */
  strength: number;
}

export interface InkRenderer {
  readonly kind: "webgpu";
  /** Inject seeds (CPU writes into a seed staging buffer). */
  seed(seeds: InkSeed[]): void;
  /** Advance + render one frame. `folds` = kaleidoscope segments (>=1). */
  frame(folds: number, lift: number, t: number): void;
  resize(w: number, h: number): void;
  /** Pull blooms detected this period (cheap CPU sampler, see app). */
  destroy(): void;
}

// ── Minimal WebGPU types (avoids @webgpu/types) ──────────────────────────────
interface GPUType {
  requestAdapter(opts?: {
    powerPreference?: string;
  }): Promise<GPUAdapterType | null>;
  getPreferredCanvasFormat(): string;
}
interface GPUAdapterType {
  requestDevice(): Promise<GPUDeviceType>;
}
interface GPUBufType {
  destroy(): void;
}
interface GPUQueueType {
  writeBuffer(
    buf: GPUBufType,
    offset: number,
    data: ArrayBuffer | ArrayBufferView,
  ): void;
  submit(cmds: object[]): void;
}
interface GPUPipelineType {
  getBindGroupLayout(i: number): object;
}
interface GPUComputePassType {
  setPipeline(p: object): void;
  setBindGroup(i: number, bg: object): void;
  dispatchWorkgroups(x: number, y?: number): void;
  end(): void;
}
interface GPURenderPassType {
  setPipeline(p: object): void;
  setBindGroup(i: number, bg: object): void;
  draw(verts: number, instances?: number): void;
  end(): void;
}
interface GPUEncoderType {
  beginComputePass(): GPUComputePassType;
  beginRenderPass(desc: object): GPURenderPassType;
  finish(): object;
}
interface GPUDeviceType {
  createBuffer(desc: object): GPUBufType;
  createShaderModule(desc: { code: string }): object;
  createComputePipeline(desc: object): GPUPipelineType;
  createRenderPipeline(desc: object): GPUPipelineType;
  createBindGroup(desc: object): object;
  createCommandEncoder(): GPUEncoderType;
  queue: GPUQueueType;
  destroy(): void;
}
interface GPUCanvasContextType {
  configure(desc: object): void;
  getCurrentTexture(): { createView(): object };
  unconfigure(): void;
}

// Usage bit values (from the WebGPU spec) — hardcoded so no types pkg needed.
const U_STORAGE = 0x80;
const U_COPY_DST = 0x08;
const U_UNIFORM = 0x40;

// ── WGSL: Gray-Scott compute step ────────────────────────────────────────────
// Two storage buffers of vec2<f32> (u,v) ping-ponged. Plus a seed staging buffer
// and uniforms (feed/kill/dt/grid + up to N seeds).
const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  grid    : u32,
  nSeed   : u32,
  feed    : f32,
  kill    : f32,
  du      : f32,
  dv      : f32,
  dt      : f32,
  _pad    : f32,
};
struct Seed { x: f32, y: f32, r: f32, amount: f32 };

@group(0) @binding(0) var<storage, read>        src : array<vec2<f32>>;
@group(0) @binding(1) var<storage, read_write>  dst : array<vec2<f32>>;
@group(0) @binding(2) var<uniform>              P   : Params;
@group(0) @binding(3) var<storage, read>        seeds : array<Seed>;

fn idx(x: i32, y: i32, g: i32) -> u32 {
  // wrap edges -> seamless, symmetric bloom
  let xx = (x + g) % g;
  let yy = (y + g) % g;
  return u32(yy * g + xx);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(P.grid);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= g || y >= g) { return; }
  let me = idx(x, y, g);
  let c = src[me];

  // 9-point Laplacian (TouchDesigner-ish diffusion kernel).
  var lap = vec2<f32>(0.0, 0.0);
  lap += src[idx(x-1, y, g)] * 0.2;
  lap += src[idx(x+1, y, g)] * 0.2;
  lap += src[idx(x, y-1, g)] * 0.2;
  lap += src[idx(x, y+1, g)] * 0.2;
  lap += src[idx(x-1, y-1, g)] * 0.05;
  lap += src[idx(x+1, y-1, g)] * 0.05;
  lap += src[idx(x-1, y+1, g)] * 0.05;
  lap += src[idx(x+1, y+1, g)] * 0.05;
  lap += c * -1.0;

  let u = c.x;
  let v = c.y;
  let uvv = u * v * v;
  var du = P.du * lap.x - uvv + P.feed * (1.0 - u);
  var dv = P.dv * lap.y + uvv - (P.kill + P.feed) * v;

  var nu = u + du * P.dt;
  var nv = v + dv * P.dt;

  // Inject seeds (drops of v ink).
  let fx = f32(x);
  let fy = f32(y);
  let n = i32(P.nSeed);
  for (var i = 0; i < n; i = i + 1) {
    let s = seeds[i];
    let sx = s.x * f32(g);
    let sy = s.y * f32(g);
    let d = distance(vec2<f32>(fx, fy), vec2<f32>(sx, sy));
    if (d < s.r) {
      let fall = 1.0 - d / s.r;
      nv = nv + s.amount * fall * fall;
      nu = nu - s.amount * 0.4 * fall;
    }
  }

  dst[me] = vec2<f32>(clamp(nu, 0.0, 1.0), clamp(nv, 0.0, 1.0));
}
`;

// ── WGSL: full-screen render with kaleidoscope/mirror fold ────────────────────
const RENDER_WGSL = /* wgsl */ `
struct RParams {
  grid  : f32,
  folds : f32,
  lift  : f32,
  t     : f32,
};
@group(0) @binding(0) var<storage, read> field : array<vec2<f32>>;
@group(0) @binding(1) var<uniform>       R     : RParams;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Full-screen triangle.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = (xy + vec2<f32>(1.0, 1.0)) * 0.5;
  return out;
}

fn sampleField(uv: vec2<f32>) -> f32 {
  let g = i32(R.grid);
  let fx = clamp(uv.x, 0.0, 0.999) * R.grid;
  let fy = clamp(uv.y, 0.0, 0.999) * R.grid;
  let xi = i32(fx);
  let yi = i32(fy);
  let i = u32(yi * g + xi);
  return field[i].y;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Centre-origin coords.
  var c = in.uv * 2.0 - vec2<f32>(1.0, 1.0);

  // Kaleidoscope fold: wedge angle, then mirror within wedge.
  let folds = max(R.folds, 1.0);
  var ang = atan2(c.y, c.x);
  let rad = length(c);
  let seg = 6.2831853 / folds;
  ang = ang - seg * floor(ang / seg);
  ang = abs(ang - seg * 0.5); // mirror within the wedge -> butterfly symmetry
  let fc = vec2<f32>(cos(ang), sin(ang)) * rad;

  // Sample the reaction field (centred), with a gentle breathing zoom.
  let zoom = 0.92 + 0.05 * sin(R.t * 0.25);
  let uv = fc * 0.5 * zoom + vec2<f32>(0.5, 0.5);
  var v = sampleField(uv);

  // Soft ink-on-light: paper warm white, ink a deep indigo/teal that shifts
  // with the hum lift. Brightness of fronts -> a faint luminous edge glow.
  let paper = vec3<f32>(0.96, 0.95, 0.92);
  let inkA = vec3<f32>(0.10, 0.12, 0.28);   // deep indigo
  let inkB = vec3<f32>(0.06, 0.20, 0.26);   // deep teal
  let ink = mix(inkA, inkB, clamp(R.lift, 0.0, 1.0));

  let dens = smoothstep(0.06, 0.34, v);
  var col = mix(paper, ink, dens);

  // Luminous front: thin bright ring where v is mid -> glowing edges.
  let edge = exp(-pow((v - 0.22) * 9.0, 2.0)) * (0.5 + 0.5 * R.lift);
  col += vec3<f32>(0.55, 0.7, 0.85) * edge * 0.5;

  // Soft vignette toward the centre keeps it calm & focused.
  let vig = 1.0 - 0.25 * rad * rad;
  col *= vig;

  return vec4<f32>(col, 1.0);
}
`;

const MAX_SEEDS = 24;
const SUBSTEPS = 8;

export async function buildWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<InkRenderer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navGpu = (navigator as any).gpu as GPUType | undefined;
  if (!navGpu) throw new Error("WebGPU not available");
  const adapter = await navGpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const format = navGpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu") as unknown as GPUCanvasContextType;
  if (!ctx) throw new Error("No WebGPU canvas context");
  ctx.configure({ device, format, alphaMode: "opaque" });

  const cells = GRID * GRID;

  // Ping-pong field buffers (vec2<f32> per cell -> 8 bytes).
  const initData = new Float32Array(cells * 2);
  for (let i = 0; i < cells; i++) {
    initData[i * 2] = 1.0; // u = 1 everywhere (substrate)
    initData[i * 2 + 1] = 0.0; // v = 0 (no ink yet)
  }
  // A faint central seed so the very first frame already has a bloom forming.
  const cx = GRID / 2;
  const cy = GRID / 2;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        const i = ((cy + dy) * GRID + (cx + dx)) * 2;
        initData[i + 1] = 0.6 * (1 - d / 6);
      }
    }
  }

  const fieldBufs = [0, 1].map(() => {
    const b = device.createBuffer({
      size: initData.byteLength,
      usage: U_STORAGE | U_COPY_DST,
    });
    return b;
  });
  device.queue.writeBuffer(fieldBufs[0], 0, initData.buffer as ArrayBuffer);
  device.queue.writeBuffer(fieldBufs[1], 0, initData.buffer as ArrayBuffer);

  // Compute uniforms: 8 x 4 bytes = 32.
  const paramBuf = device.createBuffer({
    size: 32,
    usage: U_UNIFORM | U_COPY_DST,
  });
  // Seed staging buffer (MAX_SEEDS x 4 f32).
  const seedData = new Float32Array(MAX_SEEDS * 4);
  const seedBuf = device.createBuffer({
    size: seedData.byteLength,
    usage: U_STORAGE | U_COPY_DST,
  });

  // Render uniforms: 4 f32 = 16 bytes.
  const rparamBuf = device.createBuffer({
    size: 16,
    usage: U_UNIFORM | U_COPY_DST,
  });

  const computeMod = device.createShaderModule({ code: COMPUTE_WGSL });
  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeMod, entryPoint: "main" },
  });

  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
      entryPoint: "fs",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  // Two compute bind groups (A->B and B->A).
  const computeBG = [0, 1].map((i) =>
    device.createBindGroup({
      layout: computePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldBufs[i] } },
        { binding: 1, resource: { buffer: fieldBufs[1 - i] } },
        { binding: 2, resource: { buffer: paramBuf } },
        { binding: 3, resource: { buffer: seedBuf } },
      ],
    }),
  );
  // Render bind group references whichever buffer currently holds the latest
  // state; we rebuild per-frame cheaply by selecting from a precomputed pair.
  const renderBG = [0, 1].map((i) =>
    device.createBindGroup({
      layout: renderPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: fieldBufs[i] } },
        { binding: 1, resource: { buffer: rparamBuf } },
      ],
    }),
  );

  let cur = 0; // index of buffer holding current state
  let pendingSeeds: InkSeed[] = [];
  let destroyed = false;

  const pBuf = new ArrayBuffer(32);
  const pU32 = new Uint32Array(pBuf);
  const pF32 = new Float32Array(pBuf);
  const rBuf = new Float32Array(4);

  return {
    kind: "webgpu",

    seed(seeds: InkSeed[]) {
      for (const s of seeds) pendingSeeds.push(s);
      if (pendingSeeds.length > MAX_SEEDS) {
        pendingSeeds = pendingSeeds.slice(-MAX_SEEDS);
      }
    },

    frame(folds: number, lift: number, t: number) {
      if (destroyed) return;

      // Pack the seeds active THIS frame (consumed once).
      const ns = Math.min(pendingSeeds.length, MAX_SEEDS);
      seedData.fill(0);
      for (let i = 0; i < ns; i++) {
        const s = pendingSeeds[i];
        seedData[i * 4 + 0] = s.x;
        seedData[i * 4 + 1] = s.y;
        seedData[i * 4 + 2] = s.r;
        seedData[i * 4 + 3] = s.amount;
      }
      pendingSeeds = [];
      device.queue.writeBuffer(seedBuf, 0, seedData.buffer as ArrayBuffer);

      // Compute params. Feed/kill tuned for soft growing spots/worms.
      pU32[0] = GRID;
      pU32[1] = ns;
      pF32[2] = 0.0367; // feed
      pF32[3] = 0.0649; // kill -> mitosis/coral regime, gentle
      pF32[4] = 0.16; // Du
      pF32[5] = 0.08; // Dv
      pF32[6] = 1.0; // dt
      pF32[7] = 0.0;

      const enc = device.createCommandEncoder();

      // Several Gray-Scott sub-steps for smooth growth. Seeds only injected on
      // the first substep (nSeed set to 0 afterward).
      for (let step = 0; step < SUBSTEPS; step++) {
        if (step === 1) {
          pU32[1] = 0; // stop re-injecting seeds after the first substep
          device.queue.writeBuffer(paramBuf, 0, pBuf);
        }
        if (step === 0) device.queue.writeBuffer(paramBuf, 0, pBuf);
        const cp = enc.beginComputePass();
        cp.setPipeline(computePl);
        cp.setBindGroup(0, computeBG[cur]);
        cp.dispatchWorkgroups(Math.ceil(GRID / 8), Math.ceil(GRID / 8));
        cp.end();
        cur = 1 - cur;
      }

      // Render uniforms.
      rBuf[0] = GRID;
      rBuf[1] = Math.max(1, folds);
      rBuf[2] = Math.max(0, Math.min(1, lift));
      rBuf[3] = t;
      device.queue.writeBuffer(rparamBuf, 0, rBuf.buffer as ArrayBuffer);

      let view: object;
      try {
        view = ctx.getCurrentTexture().createView();
      } catch {
        return;
      }
      const rp = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            clearValue: { r: 0.04, g: 0.04, b: 0.06, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      rp.setPipeline(renderPl);
      rp.setBindGroup(0, renderBG[cur]);
      rp.draw(3, 1);
      rp.end();

      device.queue.submit([enc.finish()]);
    },

    resize() {
      /* field is fixed-grid; CSS handles canvas scaling */
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      try {
        ctx.unconfigure();
      } catch {
        /* ignore */
      }
      for (const b of fieldBufs) b.destroy();
      paramBuf.destroy();
      seedBuf.destroy();
      rparamBuf.destroy();
      try {
        device.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
