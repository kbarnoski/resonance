// gpu.ts — WebGPU compute Physarum. The GPU agent field IS the resonating body.
//
// Architecture (two compute passes + one render pass per frame):
//   1. Agent pass    — N agents in a storage buffer; each senses the trail at
//                      3 points, steers, steps, wraps, and atomic-adds its
//                      deposit into an i32 trail buffer (atomics = race-free).
//   2. Diffuse pass  — 3x3 box-blur + decay of the trail into a float buffer.
//   3. Render pass   — colorise the float trail into a luminous cosmic palette,
//                      full-canvas.
//
// Nutrient wells (player + autonomous seeds) live in a small uniform array and
// add an attractive halo to the sensed value, so filaments grow between seeds.
//
// Once every few frames we copy a coarse downsample of the trail to a
// mappable buffer and read it back (mapAsync, one in flight) → FieldStats,
// which drives the audio. The sound is literally the network's state.

import { PARAMS, type FieldStats, type Nutrient } from "./physarum";

export const MAX_NUTRIENTS = 16;

// ── WGSL ────────────────────────────────────────────────────────────────────

const WGSL = /* wgsl */ `
struct Agent { x: f32, y: f32, heading: f32, pad: f32 };

struct Params {
  dims: vec2f,        // field width, height (pixels)
  senseAngle: f32,
  senseDist: f32,
  turnSpeed: f32,
  moveSpeed: f32,
  deposit: f32,       // i32 deposit scaled (we store *1024 fixed point)
  decay: f32,
  diffuse: f32,
  nutrientPull: f32,
  nNutrients: f32,
  time: f32,
  seed: f32,
  agentCount: f32,
};

// nutrients: each vec4 = (x_norm, y_norm, strength, _)
@group(0) @binding(0) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(1) var<storage, read_write> trailI: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read_write> trailF: array<f32>;
@group(0) @binding(3) var<uniform> P: Params;
@group(0) @binding(4) var<uniform> nutrients: array<vec4f, ${MAX_NUTRIENTS}>;

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
  var v = f32(atomicLoad(&trailI[idx(px, py)])) / 1024.0;
  let nn = i32(P.nNutrients);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = nutrients[k];
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
  atomicAdd(&trailI[idx(nx, ny)], i32(P.deposit));
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
      sum = sum + f32(atomicLoad(&trailI[sy * w + sx])) / 1024.0;
    }
  }
  let box = sum / 9.0;
  let cur = f32(atomicLoad(&trailI[y * w + x])) / 1024.0;
  var nv = (cur * (1.0 - P.diffuse) + box * P.diffuse) * P.decay;

  // bake nutrient glow so wells stay luminous
  let nn = i32(P.nNutrients);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = nutrients[k];
    let dx = f32(x) - nu.x * P.dims.x;
    let dy = f32(y) - nu.y * P.dims.y;
    let r = 9.0;
    nv = nv + nu.z * 0.35 * exp(-(dx*dx + dy*dy) / (r*r));
  }

  trailF[y * w + x] = nv;
  atomicStore(&trailI[y * w + x], i32(nv * 1024.0));
}

// ── Render: full-canvas triangle, colorise trailF ──────────────────────────

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@group(0) @binding(0) var<storage, read> rtrail: array<f32>;
@group(0) @binding(1) var<uniform> RP: Params;
@group(0) @binding(2) var<uniform> rnut: array<vec4f, ${MAX_NUTRIENTS}>;

@vertex fn vsMain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  var o: VOut;
  let xy = p[vi];
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f((xy.x + 1.0) * 0.5, (xy.y + 1.0) * 0.5);
  return o;
}

fn cosmic(v: f32) -> vec3f {
  let c = clamp(v, 0.0, 1.0);
  if (c < 0.35) {
    let s = c / 0.35;
    return vec3f(0.024 + s*0.157, 0.016 + s*0.07, 0.086 + s*0.353);
  } else if (c < 0.7) {
    let s = (c - 0.35) / 0.35;
    return vec3f(0.18 + s*0.118, 0.086 + s*0.588, 0.44 + s*0.47);
  }
  let s = (c - 0.7) / 0.3;
  return vec3f(0.298 + s*0.702, 0.674 + s*0.306, 0.91 + s*0.09);
}

@fragment fn fsMain(in: VOut) -> @location(0) vec4f {
  let w = i32(RP.dims.x);
  let h = i32(RP.dims.y);
  let x = clamp(i32(in.uv.x * RP.dims.x), 0, w - 1);
  let y = clamp(i32((1.0 - in.uv.y) * RP.dims.y), 0, h - 1);
  let t = rtrail[y * w + x];
  let v = 1.0 - exp(-t * 0.55);
  var col = cosmic(v);
  // nutrient cores glow gold
  let nn = i32(RP.nNutrients);
  for (var k = 0; k < nn; k = k + 1) {
    let nu = rnut[k];
    let dx = in.uv.x - nu.x;
    let dy = (1.0 - in.uv.y) - nu.y;
    let d2 = dx*dx + dy*dy;
    let g = nu.z * 0.9 * exp(-d2 / 0.0006);
    col = col + vec3f(g, g*0.86, g*0.5);
  }
  return vec4f(col, 1.0);
}
`;

// ── Types ───────────────────────────────────────────────────────────────────

export interface GpuPhysarum {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  w: number;
  h: number;
  agentCount: number;
  agentBuf: GPUBuffer;
  trailI: GPUBuffer;
  trailF: GPUBuffer;
  paramBuf: GPUBuffer;
  nutrientBuf: GPUBuffer;
  agentPipe: GPUComputePipeline;
  diffusePipe: GPUComputePipeline;
  renderPipe: GPURenderPipeline;
  agentBind: GPUBindGroup;
  renderBind: GPUBindGroup;
  // readback
  readBuf: GPUBuffer; // mappable, holds coarse downsample
  readPipe: GPUComputePipeline;
  readBind: GPUBindGroup;
  reduceBuf: GPUBuffer; // storage the reduce shader writes
  readW: number;
  readH: number;
  mapping: boolean;
}

const REDUCE_GX = 24;
const REDUCE_GY = 24;

const REDUCE_WGSL = /* wgsl */ `
struct RParams { dims: vec2f, gx: f32, gy: f32 };
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: RParams;
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
      s = s + src[y * w + x];
      cnt = cnt + 1.0;
    }
  }
  dst[cy * gx + cx] = select(0.0, s / cnt, cnt > 0.0);
}
`;

function f32(...vals: number[]): ArrayBuffer {
  return new Float32Array(vals).buffer as ArrayBuffer;
}

export async function buildGpu(
  canvas: HTMLCanvasElement,
  fieldSize: number,
  desiredAgents: number,
): Promise<GpuPhysarum> {
  if (!navigator.gpu) throw new Error("WebGPU not supported in this browser.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available.");
  const device = await adapter.requestDevice();

  // Clamp agents to a safe fraction of the storage-buffer limit.
  const maxBytes = adapter.limits.maxStorageBufferBindingSize;
  const maxByAgents = Math.floor(maxBytes / 16); // 16 bytes/agent
  const agentCount = Math.min(desiredAgents, maxByAgents, 1_000_000);

  const w = fieldSize;
  const h = fieldSize;
  const cells = w * h;

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("Could not get WebGPU canvas context.");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  // Agents: seed in a soft central disc.
  const agentData = new Float32Array(agentCount * 4);
  const cx = w * 0.5;
  const cy = h * 0.5;
  for (let i = 0; i < agentCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * Math.min(w, h) * 0.32;
    agentData[i * 4] = cx + Math.cos(a) * r;
    agentData[i * 4 + 1] = cy + Math.sin(a) * r;
    agentData[i * 4 + 2] = Math.random() * Math.PI * 2;
    agentData[i * 4 + 3] = 0;
  }
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData);

  const trailI = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const trailF = device.createBuffer({
    size: cells * 4,
    usage: GPUBufferUsage.STORAGE,
  });

  const paramBuf = device.createBuffer({
    size: 64, // 16 floats
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const nutrientBuf = device.createBuffer({
    size: MAX_NUTRIENTS * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const mod = device.createShaderModule({ code: WGSL });

  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const computePl = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });

  const agentPipe = device.createComputePipeline({
    layout: computePl,
    compute: { module: mod, entryPoint: "agentMain" },
  });
  const diffusePipe = device.createComputePipeline({
    layout: computePl,
    compute: { module: mod, entryPoint: "diffuseMain" },
  });

  const agentBind = device.createBindGroup({
    layout: computeLayout,
    entries: [
      { binding: 0, resource: { buffer: agentBuf } },
      { binding: 1, resource: { buffer: trailI } },
      { binding: 2, resource: { buffer: trailF } },
      { binding: 3, resource: { buffer: paramBuf } },
      { binding: 4, resource: { buffer: nutrientBuf } },
    ],
  });

  // Render pipeline
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
    ],
  });
  const renderPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: mod, entryPoint: "vsMain" },
    fragment: { module: mod, entryPoint: "fsMain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });
  const renderBind = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: trailF } },
      { binding: 1, resource: { buffer: paramBuf } },
      { binding: 2, resource: { buffer: nutrientBuf } },
    ],
  });

  // Reduce + readback
  const reduceMod = device.createShaderModule({ code: REDUCE_WGSL });
  const reduceLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const readPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [reduceLayout] }),
    compute: { module: reduceMod, entryPoint: "main" },
  });
  const reduceBuf = device.createBuffer({
    size: REDUCE_GX * REDUCE_GY * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const reduceParam = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(reduceParam, 0, f32(w, h, REDUCE_GX, REDUCE_GY));
  const readBind = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: trailF } },
      { binding: 1, resource: { buffer: reduceBuf } },
      { binding: 2, resource: { buffer: reduceParam } },
    ],
  });
  const readBuf = device.createBuffer({
    size: REDUCE_GX * REDUCE_GY * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  return {
    device, ctx, w, h, agentCount,
    agentBuf, trailI, trailF, paramBuf, nutrientBuf,
    agentPipe, diffusePipe, renderPipe, agentBind, renderBind,
    readBuf, readPipe, readBind, reduceBuf,
    readW: REDUCE_GX, readH: REDUCE_GY, mapping: false,
  };
}

export function writeNutrients(g: GpuPhysarum, nutrients: Nutrient[]): void {
  const arr = new Float32Array(MAX_NUTRIENTS * 4);
  const n = Math.min(nutrients.length, MAX_NUTRIENTS);
  for (let i = 0; i < n; i++) {
    arr[i * 4] = nutrients[i].x;
    arr[i * 4 + 1] = nutrients[i].y;
    arr[i * 4 + 2] = nutrients[i].strength;
    arr[i * 4 + 3] = 0;
  }
  g.device.queue.writeBuffer(g.nutrientBuf, 0, arr.buffer as ArrayBuffer);
}

export function stepGpu(g: GpuPhysarum, nutrientCount: number, time: number): void {
  const depositFixed = Math.round(PARAMS.depositAmount * 1024);
  g.device.queue.writeBuffer(
    g.paramBuf,
    0,
    f32(
      g.w, g.h,
      PARAMS.senseAngle, PARAMS.senseDist,
      PARAMS.turnSpeed, PARAMS.moveSpeed,
      depositFixed, PARAMS.decay,
      PARAMS.diffuse, PARAMS.nutrientPull,
      Math.min(nutrientCount, MAX_NUTRIENTS), time,
      Math.random(), g.agentCount,
    ),
  );

  const enc = g.device.createCommandEncoder();
  // 1. Agent pass
  {
    const p = enc.beginComputePass();
    p.setPipeline(g.agentPipe);
    p.setBindGroup(0, g.agentBind);
    p.dispatchWorkgroups(Math.ceil(g.agentCount / 64));
    p.end();
  }
  // 2. Diffuse + decay pass
  {
    const p = enc.beginComputePass();
    p.setPipeline(g.diffusePipe);
    p.setBindGroup(0, g.agentBind);
    p.dispatchWorkgroups(Math.ceil(g.w / 8), Math.ceil(g.h / 8));
    p.end();
  }
  g.device.queue.submit([enc.finish()]);
}

export function renderGpu(g: GpuPhysarum): void {
  const enc = g.device.createCommandEncoder();
  const view = g.ctx.getCurrentTexture().createView();
  const p = enc.beginRenderPass({
    colorAttachments: [{
      view,
      loadOp: "clear",
      storeOp: "store",
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    }],
  });
  p.setPipeline(g.renderPipe);
  p.setBindGroup(0, g.renderBind);
  p.draw(3);
  p.end();
  g.device.queue.submit([enc.finish()]);
}

// Kick off an async readback of the coarse field. Returns FieldStats via the
// callback when the previous map resolves; never blocks, one map in flight.
export function requestStats(
  g: GpuPhysarum,
  onStats: (s: FieldStats) => void,
): void {
  if (g.mapping) return;
  g.mapping = true;

  const enc = g.device.createCommandEncoder();
  const p = enc.beginComputePass();
  p.setPipeline(g.readPipe);
  p.setBindGroup(0, g.readBind);
  p.dispatchWorkgroups(Math.ceil(g.readW / 8), Math.ceil(g.readH / 8));
  p.end();
  enc.copyBufferToBuffer(g.reduceBuf, 0, g.readBuf, 0, g.readW * g.readH * 4);
  g.device.queue.submit([enc.finish()]);

  g.readBuf.mapAsync(GPUMapMode.READ).then(() => {
    const cells = new Float32Array(g.readBuf.getMappedRange().slice(0));
    g.readBuf.unmap();
    g.mapping = false;
    onStats(reduceStats(cells, g.readW, g.readH));
  }).catch(() => {
    g.mapping = false;
  });
}

function reduceStats(cell: Float32Array, gx: number, gy: number): FieldStats {
  let total = 0;
  for (let i = 0; i < gx * gy; i++) total += cell[i];
  const mean = total / (gx * gy);
  let varSum = 0;
  let bright = -1;
  let bx = 0.5;
  let by = 0.5;
  for (let y = 0; y < gy; y++) {
    for (let x = 0; x < gx; x++) {
      const v = cell[y * gx + x];
      const d = v - mean;
      varSum += d * d;
      if (v > bright) {
        bright = v;
        bx = (x + 0.5) / gx;
        by = (y + 0.5) / gy;
      }
    }
  }
  const variance = varSum / (gx * gy);
  return {
    energy: Math.min(1, mean / 6),
    variance: Math.min(1, Math.sqrt(variance) / 6),
    panX: bx,
    panY: by,
  };
}

export function destroyGpu(g: GpuPhysarum): void {
  try {
    g.agentBuf.destroy();
    g.trailI.destroy();
    g.trailF.destroy();
    g.paramBuf.destroy();
    g.nutrientBuf.destroy();
    g.reduceBuf.destroy();
    g.readBuf.destroy();
    g.device.destroy();
  } catch {
    // already torn down
  }
}
