// gpu.ts — WebGPU compute Physarum with TWO species. The GPU agent field IS the
// resonating body. WGSL ping-pong via atomic i32 trail buffers.
//
// Per frame:
//   1. Agent pass ×2  — species A and B agents each sense the SUMMED trail,
//                       steer, step, wrap, atomic-add their deposit into their
//                       own i32 trail buffer.
//   2. Diffuse pass   — 3x3 box-blur + decay of BOTH channels, bakes node glow,
//                       and writes a summed float trail (trailF) for render +
//                       connectivity readback.
//   3. Render pass    — colourise trailA/trailB into two filament colours + gold
//                       node cores whose heat scales with connectivity.
//
// Connectivity extraction runs on the CPU from a low-res readback of trailF so
// its logic is byte-for-byte identical to the pure-CPU fallback path.
//
// Minimal local WebGPU typings are declared (we do NOT depend on @webgpu/types).

import { PARAMS, type Node } from "./physarum";

export const MAX_NODES = 20;
// Low-res field we read back to the CPU for connectivity + global stats.
export const READ_W = 96;
export const READ_H = 96;

// ── WGSL ────────────────────────────────────────────────────────────────────

const WGSL = /* wgsl */ `
struct Agent { x: f32, y: f32, heading: f32, pad: f32 };

struct Params {
  dims: vec2f,
  senseAngle: f32,
  senseDist: f32,
  turnSpeed: f32,
  moveSpeed: f32,
  deposit: f32,       // i32 deposit *1024 fixed point
  decay: f32,
  diffuse: f32,
  nutrientPull: f32,
  nNodes: f32,
  time: f32,
  seed: f32,
  agentCount: f32,
};

// nodes: each vec4 = (x_norm, y_norm, strength, degree)
@group(0) @binding(0) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(1) var<storage, read_write> trailSelf: array<atomic<i32>>; // this species' channel
@group(0) @binding(2) var<storage, read> trailOther: array<i32>;               // the other channel (read for sensing sum)
@group(0) @binding(3) var<uniform> P: Params;
@group(0) @binding(4) var<uniform> nodes: array<vec4f, ${MAX_NODES}>;

fn hash(n: u32) -> f32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x + (x << 3u);
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x & 0x00ffffffu) / f32(0x01000000u);
}

fn idx(px: f32, py: f32) -> i32 {
  let w = i32(P.dims.x);
  let h = i32(P.dims.y);
  var x = i32(floor(px)) % w; if (x < 0) { x = x + w; }
  var y = i32(floor(py)) % h; if (y < 0) { y = y + h; }
  return y * w + x;
}

fn senseAt(px: f32, py: f32) -> f32 {
  let i = idx(px, py);
  var v = (f32(atomicLoad(&trailSelf[i])) + f32(trailOther[i])) / 1024.0;
  let nn = i32(P.nNodes);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = nodes[k];
    let dx = px - nu.x * P.dims.x;
    let dy = py - nu.y * P.dims.y;
    let r = 40.0;
    v = v + nu.z * P.nutrientPull * exp(-(dx*dx + dy*dy) / (r*r));
  }
  return v;
}

@compute @workgroup_size(64)
fn agentMain(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (f32(i) >= P.agentCount) { return; }
  var a = agents[i];
  let hd = a.heading;
  let sd = P.senseDist;
  let fC = senseAt(a.x + cos(hd) * sd, a.y + sin(hd) * sd);
  let lA = hd - P.senseAngle;
  let rA = hd + P.senseAngle;
  let fL = senseAt(a.x + cos(lA) * sd, a.y + sin(lA) * sd);
  let fR = senseAt(a.x + cos(rA) * sd, a.y + sin(rA) * sd);

  var nh = hd;
  let rnd = hash(i * 747796405u + u32(P.seed * 4294967.0));
  if (fC > fL && fC > fR) {
    // straight
  } else if (fC < fL && fC < fR) {
    nh = nh + select(-P.turnSpeed, P.turnSpeed, rnd < 0.5);
  } else if (fL > fR) {
    nh = nh - P.turnSpeed;
  } else if (fR > fL) {
    nh = nh + P.turnSpeed;
  }

  var nx = a.x + cos(nh) * P.moveSpeed;
  var ny = a.y + sin(nh) * P.moveSpeed;
  let w = P.dims.x;
  let h = P.dims.y;
  if (nx < 0.0) { nx = nx + w; } else if (nx >= w) { nx = nx - w; }
  if (ny < 0.0) { ny = ny + h; } else if (ny >= h) { ny = ny - h; }

  a.x = nx; a.y = ny; a.heading = nh;
  agents[i] = a;
  atomicAdd(&trailSelf[idx(nx, ny)], i32(P.deposit));
}

@compute @workgroup_size(8, 8)
fn diffuseMain(@builtin(global_invocation_id) gid: vec3u) {
  let w = i32(P.dims.x);
  let h = i32(P.dims.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) { return; }
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      var sx = (x + dx) % w; if (sx < 0) { sx = sx + w; }
      var sy = (y + dy) % h; if (sy < 0) { sy = sy + h; }
      sum = sum + f32(atomicLoad(&trailSelf[sy * w + sx])) / 1024.0;
    }
  }
  let box = sum / 9.0;
  let cur = f32(atomicLoad(&trailSelf[y * w + x])) / 1024.0;
  var nv = (cur * (1.0 - P.diffuse) + box * P.diffuse) * P.decay;

  let nn = i32(P.nNodes);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = nodes[k];
    let dx = f32(x) - nu.x * P.dims.x;
    let dy = f32(y) - nu.y * P.dims.y;
    let r = 9.0;
    nv = nv + nu.z * 0.32 * exp(-(dx*dx + dy*dy) / (r*r));
  }
  atomicStore(&trailSelf[y * w + x], i32(nv * 1024.0));
}
`;

// Render: two channels + sum → cosmic colours, gold node cores.
const RENDER_WGSL = /* wgsl */ `
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
struct RParams { dims: vec2f, nNodes: f32, pad: f32 };

@group(0) @binding(0) var<storage, read> trailA: array<i32>;
@group(0) @binding(1) var<storage, read> trailB: array<i32>;
@group(0) @binding(2) var<uniform> RP: RParams;
@group(0) @binding(3) var<uniform> rnodes: array<vec4f, ${MAX_NODES}>;

@vertex fn vsMain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VOut;
  let xy = p[vi];
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f((xy.x + 1.0) * 0.5, (xy.y + 1.0) * 0.5);
  return o;
}

@fragment fn fsMain(in: VOut) -> @location(0) vec4f {
  let w = i32(RP.dims.x);
  let h = i32(RP.dims.y);
  let x = clamp(i32(in.uv.x * RP.dims.x), 0, w - 1);
  let y = clamp(i32((1.0 - in.uv.y) * RP.dims.y), 0, h - 1);
  let i = y * w + x;
  let ta = f32(trailA[i]) / 1024.0;
  let tb = f32(trailB[i]) / 1024.0;
  let a = 1.0 - exp(-ta * 0.55);   // species A → cyan/teal
  let b = 1.0 - exp(-tb * 0.55);   // species B → violet/magenta
  var col = vec3f(0.024, 0.016, 0.086)
          + vec3f(0.27, 0.75, 0.80) * a
          + vec3f(0.60, 0.24, 0.85) * b;

  // node cores: gold, heat scales with degree (w channel)
  let nn = i32(RP.nNodes);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = rnodes[k];
    let dx = in.uv.x - nu.x;
    let dy = (1.0 - in.uv.y) - nu.y;
    let d2 = dx*dx + dy*dy;
    let g = nu.z * 0.9 * exp(-d2 / 0.0006);
    let heat = clamp(nu.w / 6.0, 0.0, 1.0);
    col = col + vec3f(g, g * (0.82 + heat * 0.15), g * (0.5 + heat * 0.3));
  }
  return vec4f(col, 1.0);
}
`;

// Reduce: downsample the SUM of both channels into a READ_W×READ_H float grid.
const REDUCE_WGSL = /* wgsl */ `
struct RParams { dims: vec2f, gx: f32, gy: f32 };
@group(0) @binding(0) var<storage, read> a: array<i32>;
@group(0) @binding(1) var<storage, read> b: array<i32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@group(0) @binding(3) var<uniform> P: RParams;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let gx = i32(P.gx);
  let gy = i32(P.gy);
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  if (cx >= gx || cy >= gy) { return; }
  let w = i32(P.dims.x);
  let h = i32(P.dims.y);
  let x0 = (cx * w) / gx;
  let x1 = ((cx + 1) * w) / gx;
  let y0 = (cy * h) / gy;
  let y1 = ((cy + 1) * h) / gy;
  var s = 0.0;
  var cnt = 0.0;
  for (var y = y0; y < y1; y = y + 1) {
    for (var x = x0; x < x1; x = x + 1) {
      s = s + (f32(a[y * w + x]) + f32(b[y * w + x])) / 1024.0;
      cnt = cnt + 1.0;
    }
  }
  dst[cy * gx + cx] = select(0.0, s / cnt, cnt > 0.0);
}
`;

// ── Minimal local WebGPU typings (no @webgpu/types dependency) ──────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
type GBuffer = { destroy(): void };
type GDevice = {
  createBuffer(d: unknown): GBuffer & any;
  createShaderModule(d: unknown): any;
  createBindGroupLayout(d: unknown): any;
  createPipelineLayout(d: unknown): any;
  createComputePipeline(d: unknown): any;
  createRenderPipeline(d: unknown): any;
  createBindGroup(d: unknown): any;
  createCommandEncoder(): any;
  queue: { writeBuffer(b: unknown, off: number, data: ArrayBufferView | ArrayBuffer): void; submit(c: unknown[]): void };
  destroy(): void;
};
type GContext = { configure(o: unknown): void; getCurrentTexture(): { createView(): unknown } };
/* eslint-enable @typescript-eslint/no-explicit-any */

// Access navigator.gpu without @webgpu/types installed.
interface GpuNav {
  gpu?: {
    requestAdapter(): Promise<{
      limits: { maxStorageBufferBindingSize: number };
      requestDevice(): Promise<GDevice>;
    } | null>;
    getPreferredCanvasFormat(): string;
  };
}
// Constants normally on GPUBufferUsage / GPUShaderStage globals.
const BUF = {
  STORAGE: 0x080,
  UNIFORM: 0x040,
  COPY_DST: 0x008,
  COPY_SRC: 0x004,
  MAP_READ: 0x001,
} as const;
const STAGE = { COMPUTE: 0x4, FRAGMENT: 0x2 } as const;

export interface GpuPhysarum {
  device: GDevice;
  ctx: GContext;
  w: number;
  h: number;
  agentCount: number;
  agentA: GBuffer;
  agentB: GBuffer;
  trailA: GBuffer;
  trailB: GBuffer;
  paramBuf: GBuffer;
  nodeBuf: GBuffer;
  agentPipe: unknown;
  diffusePipe: unknown;
  bindA: unknown; // agent/diffuse for species A (self=A, other=B)
  bindB: unknown; // species B (self=B, other=A)
  renderPipe: unknown;
  renderBind: unknown;
  rparamBuf: GBuffer;
  reduceBuf: GBuffer;
  reduceParam: GBuffer;
  readBuf: GBuffer;
  readPipe: unknown;
  readBind: unknown;
  mapping: boolean;
}

function f32buf(...vals: number[]): ArrayBuffer {
  return new Float32Array(vals).buffer as ArrayBuffer;
}

export async function buildGpu(
  canvas: HTMLCanvasElement,
  fieldSize: number,
  desiredAgents: number,
): Promise<GpuPhysarum> {
  const nav = navigator as unknown as GpuNav;
  if (!nav.gpu) throw new Error("WebGPU not supported in this browser.");
  const adapter = await nav.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available.");
  const device = await adapter.requestDevice();

  const maxBytes = adapter.limits.maxStorageBufferBindingSize;
  const maxByAgents = Math.floor(maxBytes / 16);
  const agentCount = Math.min(desiredAgents, maxByAgents, 1_000_000);

  const w = fieldSize;
  const h = fieldSize;
  const cells = w * h;

  const fmt = nav.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu") as unknown as GContext | null;
  if (!ctx) throw new Error("Could not get WebGPU canvas context.");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const seedAgents = () => {
    const data = new Float32Array(agentCount * 4);
    const cx = w * 0.5;
    const cy = h * 0.5;
    for (let i = 0; i < agentCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * Math.min(w, h) * 0.32;
      data[i * 4] = cx + Math.cos(a) * r;
      data[i * 4 + 1] = cy + Math.sin(a) * r;
      data[i * 4 + 2] = Math.random() * Math.PI * 2;
      data[i * 4 + 3] = 0;
    }
    const buf = device.createBuffer({ size: data.byteLength, usage: BUF.STORAGE | BUF.COPY_DST });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
  };
  const agentA = seedAgents();
  const agentB = seedAgents();

  const trailA = device.createBuffer({ size: cells * 4, usage: BUF.STORAGE | BUF.COPY_DST });
  const trailB = device.createBuffer({ size: cells * 4, usage: BUF.STORAGE | BUF.COPY_DST });

  const paramBuf = device.createBuffer({ size: 64, usage: BUF.UNIFORM | BUF.COPY_DST });
  const nodeBuf = device.createBuffer({ size: MAX_NODES * 16, usage: BUF.UNIFORM | BUF.COPY_DST });

  const mod = device.createShaderModule({ code: WGSL });
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: STAGE.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: STAGE.COMPUTE, buffer: { type: "uniform" } },
      { binding: 4, visibility: STAGE.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const computePl = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
  const agentPipe = device.createComputePipeline({ layout: computePl, compute: { module: mod, entryPoint: "agentMain" } });
  const diffusePipe = device.createComputePipeline({ layout: computePl, compute: { module: mod, entryPoint: "diffuseMain" } });

  // Per-species bind groups: self channel (deposit), other channel (read for
  // sensing the summed field), shared params + node uniforms.
  const bindA = device.createBindGroup({
    layout: computeLayout,
    entries: [
      { binding: 0, resource: { buffer: agentA } },
      { binding: 1, resource: { buffer: trailA } },
      { binding: 2, resource: { buffer: trailB } },
      { binding: 3, resource: { buffer: paramBuf } },
      { binding: 4, resource: { buffer: nodeBuf } },
    ],
  });
  const bindB = device.createBindGroup({
    layout: computeLayout,
    entries: [
      { binding: 0, resource: { buffer: agentB } },
      { binding: 1, resource: { buffer: trailB } },
      { binding: 2, resource: { buffer: trailA } },
      { binding: 3, resource: { buffer: paramBuf } },
      { binding: 4, resource: { buffer: nodeBuf } },
    ],
  });

  // Render
  const rmod = device.createShaderModule({ code: RENDER_WGSL });
  const rparamBuf = device.createBuffer({ size: 16, usage: BUF.UNIFORM | BUF.COPY_DST });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: STAGE.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: STAGE.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 3, visibility: STAGE.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
  const renderPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: rmod, entryPoint: "vsMain" },
    fragment: { module: rmod, entryPoint: "fsMain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });
  const renderBind = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: trailA } },
      { binding: 1, resource: { buffer: trailB } },
      { binding: 2, resource: { buffer: rparamBuf } },
      { binding: 3, resource: { buffer: nodeBuf } },
    ],
  });

  // Reduce + readback
  const reduceMod = device.createShaderModule({ code: REDUCE_WGSL });
  const reduceLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: STAGE.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: STAGE.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: STAGE.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: STAGE.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const readPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [reduceLayout] }),
    compute: { module: reduceMod, entryPoint: "main" },
  });
  const reduceBuf = device.createBuffer({ size: READ_W * READ_H * 4, usage: BUF.STORAGE | BUF.COPY_SRC });
  const reduceParam = device.createBuffer({ size: 16, usage: BUF.UNIFORM | BUF.COPY_DST });
  device.queue.writeBuffer(reduceParam, 0, f32buf(w, h, READ_W, READ_H));
  const readBind = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: trailA } },
      { binding: 1, resource: { buffer: trailB } },
      { binding: 2, resource: { buffer: reduceBuf } },
      { binding: 3, resource: { buffer: reduceParam } },
    ],
  });
  const readBuf = device.createBuffer({ size: READ_W * READ_H * 4, usage: BUF.MAP_READ | BUF.COPY_DST });

  return {
    device,
    ctx,
    w,
    h,
    agentCount,
    agentA,
    agentB,
    trailA,
    trailB,
    paramBuf,
    nodeBuf,
    agentPipe,
    diffusePipe,
    bindA,
    bindB,
    renderPipe,
    renderBind,
    rparamBuf,
    reduceBuf,
    reduceParam,
    readBuf,
    readPipe,
    readBind,
    mapping: false,
  };
}

export function writeNodes(g: GpuPhysarum, nodes: Node[]): void {
  const arr = new Float32Array(MAX_NODES * 4);
  const alive = nodes.filter((n) => n.alive).slice(0, MAX_NODES);
  for (let i = 0; i < alive.length; i++) {
    arr[i * 4] = alive[i].x;
    arr[i * 4 + 1] = alive[i].y;
    arr[i * 4 + 2] = alive[i].strength;
    arr[i * 4 + 3] = alive[i].degree;
  }
  g.device.queue.writeBuffer(g.nodeBuf, 0, arr.buffer as ArrayBuffer);
  g.device.queue.writeBuffer(g.rparamBuf, 0, f32buf(g.w, g.h, alive.length, 0));
  return;
}

function writeParams(g: GpuPhysarum, senseAngle: number, nNodes: number, time: number): void {
  const depositFixed = Math.round(PARAMS.depositAmount * 1024);
  g.device.queue.writeBuffer(
    g.paramBuf,
    0,
    f32buf(
      g.w, g.h,
      senseAngle, PARAMS.senseDist,
      PARAMS.turnSpeed, PARAMS.moveSpeed,
      depositFixed, PARAMS.decay,
      PARAMS.diffuse, PARAMS.nutrientPull,
      Math.min(nNodes, MAX_NODES), time,
      Math.random(), g.agentCount,
    ),
  );
}

interface Enc {
  beginComputePass(): { setPipeline(p: unknown): void; setBindGroup(i: number, b: unknown): void; dispatchWorkgroups(x: number, y?: number): void; end(): void };
  beginRenderPass(d: unknown): { setPipeline(p: unknown): void; setBindGroup(i: number, b: unknown): void; draw(n: number): void; end(): void };
  copyBufferToBuffer(a: unknown, ao: number, b: unknown, bo: number, size: number): void;
  finish(): unknown;
}

export function stepGpu(g: GpuPhysarum, aliveCount: number, time: number): void {
  // Species A pass
  writeParams(g, PARAMS.senseAngleA, aliveCount, time);
  {
    const enc = g.device.createCommandEncoder() as unknown as Enc;
    const p = enc.beginComputePass();
    p.setPipeline(g.agentPipe);
    p.setBindGroup(0, g.bindA);
    p.dispatchWorkgroups(Math.ceil(g.agentCount / 64));
    p.end();
    g.device.queue.submit([enc.finish()]);
  }
  // Species B pass
  writeParams(g, PARAMS.senseAngleB, aliveCount, time + 0.5);
  {
    const enc = g.device.createCommandEncoder() as unknown as Enc;
    const p = enc.beginComputePass();
    p.setPipeline(g.agentPipe);
    p.setBindGroup(0, g.bindB);
    p.dispatchWorkgroups(Math.ceil(g.agentCount / 64));
    p.end();
    g.device.queue.submit([enc.finish()]);
  }
  // Diffuse both channels (each diffuse pass reads self only)
  {
    const enc = g.device.createCommandEncoder() as unknown as Enc;
    let p = enc.beginComputePass();
    p.setPipeline(g.diffusePipe);
    p.setBindGroup(0, g.bindA);
    p.dispatchWorkgroups(Math.ceil(g.w / 8), Math.ceil(g.h / 8));
    p.end();
    p = enc.beginComputePass();
    p.setPipeline(g.diffusePipe);
    p.setBindGroup(0, g.bindB);
    p.dispatchWorkgroups(Math.ceil(g.w / 8), Math.ceil(g.h / 8));
    p.end();
    g.device.queue.submit([enc.finish()]);
  }
}

export function renderGpu(g: GpuPhysarum): void {
  const enc = g.device.createCommandEncoder() as unknown as Enc;
  const view = g.ctx.getCurrentTexture().createView();
  const p = enc.beginRenderPass({
    colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  });
  p.setPipeline(g.renderPipe);
  p.setBindGroup(0, g.renderBind);
  p.draw(3);
  p.end();
  g.device.queue.submit([enc.finish()]);
}

// Read back the low-res SUMMED field (READ_W×READ_H). The caller runs the SAME
// connectivity extraction + global stats on this buffer as the CPU path does on
// its full field, so degree logic is identical across paths.
export function requestField(g: GpuPhysarum, onField: (field: Float32Array) => void): void {
  if (g.mapping) return;
  g.mapping = true;
  const enc = g.device.createCommandEncoder() as unknown as Enc;
  const p = enc.beginComputePass();
  p.setPipeline(g.readPipe);
  p.setBindGroup(0, g.readBind);
  p.dispatchWorkgroups(Math.ceil(READ_W / 8), Math.ceil(READ_H / 8));
  p.end();
  enc.copyBufferToBuffer(g.reduceBuf, 0, g.readBuf, 0, READ_W * READ_H * 4);
  g.device.queue.submit([enc.finish()]);

  const rb = g.readBuf as unknown as {
    mapAsync(mode: number): Promise<void>;
    getMappedRange(): ArrayBuffer;
    unmap(): void;
  };
  rb.mapAsync(BUF.MAP_READ)
    .then(() => {
      const field = new Float32Array(rb.getMappedRange().slice(0));
      rb.unmap();
      g.mapping = false;
      onField(field);
    })
    .catch(() => {
      g.mapping = false;
    });
}

export function destroyGpu(g: GpuPhysarum): void {
  try {
    g.agentA.destroy();
    g.agentB.destroy();
    g.trailA.destroy();
    g.trailB.destroy();
    g.paramBuf.destroy();
    g.nodeBuf.destroy();
    g.rparamBuf.destroy();
    g.reduceBuf.destroy();
    g.reduceParam.destroy();
    g.readBuf.destroy();
    g.device.destroy();
  } catch {
    // already torn down
  }
}
