// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the slime-mold network.
//   PRIMARY: a Physarum (Jones/Jenson) agent simulation in WebGPU compute
//     shaders (WGSL). Agents sense ahead-left / center / right of a shared
//     trail field, steer toward the strongest chemoattractant, deposit as they
//     move; the field diffuses + decays each frame. Food nodes inject a strong
//     attractant so veins grow toward them and join them into the network. A
//     render pass draws the glowing trail field + food nodes.
//   FALLBACK: a smaller CPU agent sim drawn to Canvas2D, same model, same
//     connectivity read-out — so a no-WebGPU review device still gets the real
//     thing (just fewer agents).
//
//   The piece's idea lives in `sampleConnections()`: for each food node we read
//   the trail intensity in a small disc around it. High local intensity == the
//   slime has reached/joined that node == its voice swells in. That Float32Array
//   is fed straight to the harmony engine, so the chord == the connectivity graph.
//
//   This file is honest about lineage: physarum already exists in this lab at
//   260-kids-slime-garden (a WebGL CPU/agent sim). What's new here is (a) the
//   WebGPU *compute* implementation and (b) mapping the connectivity graph to a
//   just-intonation harmony engine — the slime as composer.
// ─────────────────────────────────────────────────────────────────────────────

/// <reference types="@webgpu/types" />

import type { Seed } from "./source";

// Trail-field resolution. WebGPU runs a large square field; the CPU fallback
// uses a much smaller one for frame budget.
export const FIELD_GPU = 1024;
export const FIELD_CPU = 256;

export const AGENTS_GPU = 1 << 20; // ~1.05M agents on the GPU path
export const AGENTS_CPU = 4000; // gentle on the CPU fallback

/** A food node placed on the field: a tone-source the slime grows toward. */
export interface FoodNode {
  /** field-space position, [0,1] */
  x: number;
  y: number;
  seed: Seed;
}

/** What every backend exposes to page.tsx. */
export interface SlimeBackend {
  readonly kind: "webgpu" | "cpu";
  /** advance the sim + draw one frame */
  step(): void;
  /** trail intensity [0,1] in a disc around each food node, in node order */
  sampleConnections(): Float32Array;
  /** add a food node at field-space [0,1] (click-to-plant) */
  addFood(food: FoodNode): void;
  /** tear everything down */
  dispose(): void;
}

// ── shared CPU helpers (also used to seed GPU buffers) ──────────────────────────

function makeAgents(n: number): Float32Array {
  // [x, y, heading] per agent, x/y in field cells (filled per-field-size later)
  const a = new Float32Array(n * 4); // 4th lane = pad / future use
  for (let i = 0; i < n; i++) {
    a[i * 4 + 0] = Math.random();
    a[i * 4 + 1] = Math.random();
    a[i * 4 + 2] = Math.random() * Math.PI * 2;
    a[i * 4 + 3] = 0;
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
// WGSL
// ─────────────────────────────────────────────────────────────────────────────

// Params layout (std140-ish, 16-byte aligned). Mirrored by writeParams().
//   field      : f32  (field size in cells)
//   agentCount : f32
//   time       : f32
//   foodCount  : f32
//   sensorDist : f32
//   sensorAngle: f32
//   turnAngle  : f32
//   stepSize   : f32
//   deposit    : f32
//   decay      : f32
//   foodPull   : f32
//   _pad       : f32
const PARAMS_FLOATS = 12;

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  field : f32,
  agentCount : f32,
  time : f32,
  foodCount : f32,
  sensorDist : f32,
  sensorAngle : f32,
  turnAngle : f32,
  stepSize : f32,
  deposit : f32,
  decay : f32,
  foodPull : f32,
  _pad : f32,
};

// agents: vec4 per agent (x, y, heading, _)
@group(0) @binding(0) var<storage, read_write> agents : array<vec4<f32>>;
// trail field as fixed-point u32 (atomic deposits avoid races)
@group(0) @binding(1) var<storage, read_write> trail : array<atomic<u32>>;
@group(0) @binding(2) var<uniform> P : Params;
// food: vec4 per node (x, y, strength, _)  — x/y in [0,1]
@group(0) @binding(3) var<storage, read> food : array<vec4<f32>>;

const FIXED : f32 = 4096.0; // u32 fixed-point scale for trail

fn fieldI(x : i32, y : i32) -> i32 {
  let n = i32(P.field);
  // wrap (toroidal field keeps agents alive at the edges)
  let xx = (x % n + n) % n;
  let yy = (y % n + n) % n;
  return yy * n + xx;
}

fn sampleTrail(px : f32, py : f32) -> f32 {
  let n = i32(P.field);
  let xi = i32(floor(px));
  let yi = i32(floor(py));
  let raw = atomicLoad(&trail[fieldI(xi, yi)]);
  return f32(raw) / FIXED;
}

fn hash(n : u32) -> f32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x + (x << 3u);
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x & 0xffffffu) / f32(0xffffff);
}

@compute @workgroup_size(64)
fn moveAgents(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= u32(P.agentCount)) { return; }

  var a = agents[idx];
  let n = P.field;
  let px = a.x;        // [0,1]
  let py = a.y;
  let h = a.z;

  // sense in field-cell space
  let cx = px * n;
  let cy = py * n;
  let d = P.sensorDist;

  let fl = h - P.sensorAngle;
  let fc = h;
  let fr = h + P.sensorAngle;

  let wl = sampleTrail(cx + cos(fl) * d, cy + sin(fl) * d);
  let wc = sampleTrail(cx + cos(fc) * d, cy + sin(fc) * d);
  let wr = sampleTrail(cx + cos(fr) * d, cy + sin(fr) * d);

  var newH = h;
  let rnd = hash(idx + u32(P.time * 60.0));
  if (wc > wl && wc > wr) {
    // keep heading
  } else if (wc < wl && wc < wr) {
    // both sides better than center: random turn (break symmetry)
    if (rnd < 0.5) { newH = h - P.turnAngle; } else { newH = h + P.turnAngle; }
  } else if (wl > wr) {
    newH = h - P.turnAngle;
  } else if (wr > wl) {
    newH = h + P.turnAngle;
  } else {
    newH = h + (rnd - 0.5) * P.turnAngle;
  }

  // bias heading toward the nearest food node so veins reach the tones
  var bestD = 1e9;
  var bx = 0.0;
  var by = 0.0;
  let fcount = i32(P.foodCount);
  for (var i = 0; i < fcount; i = i + 1) {
    let f = food[i];
    let dx = f.x - px;
    let dy = f.y - py;
    let dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; bx = dx; by = dy; }
  }
  if (fcount > 0 && bestD < 0.09) { // only when reasonably close (~0.3 of field)
    let targetH = atan2(by, bx);
    var diff = targetH - newH;
    // wrap to [-pi, pi]
    diff = diff - 6.28318530718 * round(diff / 6.28318530718);
    newH = newH + diff * P.foodPull * P.turnAngle;
  }

  // step forward (field-cell step converted back to [0,1])
  let stepN = P.stepSize / n;
  var nx = px + cos(newH) * stepN;
  var ny = py + sin(newH) * stepN;

  // wrap into [0,1)
  nx = fract(nx + 1.0);
  ny = fract(ny + 1.0);

  a.x = nx;
  a.y = ny;
  a.z = newH;
  agents[idx] = a;

  // deposit at the new position (atomic add in fixed point)
  let xi = i32(floor(nx * n));
  let yi = i32(floor(ny * n));
  let add = u32(P.deposit * FIXED);
  atomicAdd(&trail[fieldI(xi, yi)], add);
}
`;

// Diffuse (3x3 box blur) + decay, ping-ponging src -> dst.
const DIFFUSE_WGSL = /* wgsl */ `
struct Params {
  field : f32, agentCount : f32, time : f32, foodCount : f32,
  sensorDist : f32, sensorAngle : f32, turnAngle : f32, stepSize : f32,
  deposit : f32, decay : f32, foodPull : f32, _pad : f32,
};
@group(0) @binding(0) var<storage, read> srcT : array<u32>;
@group(0) @binding(1) var<storage, read_write> dstT : array<atomic<u32>>;
@group(0) @binding(2) var<uniform> P : Params;
@group(0) @binding(3) var<storage, read> food : array<vec4<f32>>;

fn idxOf(x : i32, y : i32, n : i32) -> i32 {
  let xx = (x % n + n) % n;
  let yy = (y % n + n) % n;
  return yy * n + xx;
}

@compute @workgroup_size(8, 8)
fn diffuse(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(P.field);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= n || y >= n) { return; }

  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + f32(srcT[idxOf(x + dx, y + dy, n)]);
    }
  }
  var v = (sum / 9.0) * P.decay;

  // food injection: keep a hot spot at each tone source so veins are drawn in
  let fcount = i32(P.foodCount);
  let fx = f32(x) / P.field;
  let fy = f32(y) / P.field;
  for (var i = 0; i < fcount; i = i + 1) {
    let f = food[i];
    let dx = f.x - fx;
    let dy = f.y - fy;
    let r2 = dx * dx + dy * dy;
    let rad = 0.012;
    if (r2 < rad * rad) {
      v = v + f.z * 4096.0 * 0.9 * (1.0 - sqrt(r2) / rad);
    }
  }

  atomicStore(&dstT[idxOf(x, y, n)], u32(clamp(v, 0.0, 16777215.0)));
}
`;

// Fullscreen render: map trail intensity -> bioluminescent glow + draw food.
const RENDER_WGSL = /* wgsl */ `
struct Params {
  field : f32, agentCount : f32, time : f32, foodCount : f32,
  sensorDist : f32, sensorAngle : f32, turnAngle : f32, stepSize : f32,
  deposit : f32, decay : f32, foodPull : f32, _pad : f32,
};
@group(0) @binding(0) var<storage, read> trailR : array<u32>;
@group(0) @binding(1) var<uniform> P : Params;
@group(0) @binding(2) var<storage, read> food : array<vec4<f32>>;

struct VOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32> };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VOut {
  var p = array<vec2<f32>, 4>(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0)
  );
  var o : VOut;
  o.pos = vec4(p[vi], 0.0, 1.0);
  o.uv = p[vi] * 0.5 + 0.5;
  return o;
}

fn fieldVal(uv : vec2<f32>) -> f32 {
  let n = i32(P.field);
  let x = clamp(i32(uv.x * P.field), 0, n - 1);
  let y = clamp(i32((1.0 - uv.y) * P.field), 0, n - 1);
  return f32(trailR[y * n + x]) / 4096.0;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let t = fieldVal(in.uv);
  // tone-mapped intensity
  let g = 1.0 - exp(-t * 2.2);

  // bioluminescent ramp: deep indigo -> teal -> gold -> warm white
  let c1 = vec3(0.04, 0.06, 0.14);
  let c2 = vec3(0.10, 0.55, 0.55);
  let c3 = vec3(0.95, 0.78, 0.35);
  var col = mix(c1, c2, smoothstep(0.0, 0.45, g));
  col = mix(col, c3, smoothstep(0.45, 0.95, g));
  col = col * (0.35 + 1.5 * g);

  // food nodes: soft halos, brighter when the local field is hot (connected)
  let fcount = i32(P.foodCount);
  for (var i = 0; i < fcount; i = i + 1) {
    let f = food[i];
    let fp = vec2(f.x, 1.0 - f.y);
    let d = distance(in.uv, fp);
    let conn = clamp(fieldVal(fp) * 0.7, 0.0, 1.0);
    let halo = exp(-d * d / 0.0009) * (0.4 + 0.9 * conn);
    col = col + vec3(0.9, 0.85, 1.0) * halo;
    let core = exp(-d * d / 0.00004);
    col = col + vec3(1.0, 0.95, 0.85) * core;
  }

  return vec4(col, 1.0);
}
`;

// ── param packing ───────────────────────────────────────────────────────────

interface SimTuning {
  sensorDist: number;
  sensorAngle: number;
  turnAngle: number;
  stepSize: number;
  deposit: number;
  decay: number;
  foodPull: number;
}

const TUNING: SimTuning = {
  sensorDist: 9,
  sensorAngle: 0.5,
  turnAngle: 0.42,
  stepSize: 1.4,
  deposit: 0.12,
  decay: 0.92,
  foodPull: 1.4,
};

function packParams(
  field: number,
  agentCount: number,
  time: number,
  foodCount: number,
): Float32Array {
  const p = new Float32Array(PARAMS_FLOATS);
  p[0] = field;
  p[1] = agentCount;
  p[2] = time;
  p[3] = foodCount;
  p[4] = TUNING.sensorDist;
  p[5] = TUNING.sensorAngle;
  p[6] = TUNING.turnAngle;
  p[7] = TUNING.stepSize;
  p[8] = TUNING.deposit;
  p[9] = TUNING.decay;
  p[10] = TUNING.foodPull;
  p[11] = 0;
  return p;
}

const MAX_FOOD = 24;

function packFood(foods: FoodNode[]): Float32Array {
  const f = new Float32Array(MAX_FOOD * 4);
  for (let i = 0; i < Math.min(foods.length, MAX_FOOD); i++) {
    f[i * 4 + 0] = foods[i].x;
    f[i * 4 + 1] = foods[i].y;
    f[i * 4 + 2] = 1.0; // strength
    f[i * 4 + 3] = 0;
  }
  return f;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU backend
// ─────────────────────────────────────────────────────────────────────────────

export async function makeWebgpuBackend(
  canvas: HTMLCanvasElement,
  foods: FoodNode[],
): Promise<SlimeBackend> {
  if (!navigator.gpu) throw new Error("WebGPU not supported.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter.");
  const device = await adapter.requestDevice();

  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context.");
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const field = FIELD_GPU;
  const cells = field * field;
  const agentCount = AGENTS_GPU;

  // agent buffer
  const agentData = makeAgents(agentCount);
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData.buffer as ArrayBuffer);

  // two trail buffers (u32) for ping-pong diffuse
  const trailBytes = cells * 4;
  const mkTrail = () =>
    device.createBuffer({
      size: trailBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
  const trailA = mkTrail();
  const trailB = mkTrail();

  // food buffer
  const foodBuf = device.createBuffer({
    size: MAX_FOOD * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(foodBuf, 0, packFood(foods).buffer as ArrayBuffer);

  // params uniform
  const paramsBuf = device.createBuffer({
    size: PARAMS_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // readback buffer for connectivity sampling (we read a downsampled copy)
  const READ = 128; // we read back a 128x128 reduced field
  const readBuf = device.createBuffer({
    size: READ * READ * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const mapBuf = device.createBuffer({
    size: READ * READ * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // pipelines
  const moveMod = device.createShaderModule({ code: COMPUTE_WGSL });
  const movePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: moveMod, entryPoint: "moveAgents" },
  });

  const diffMod = device.createShaderModule({ code: DIFFUSE_WGSL });
  const diffPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: diffMod, entryPoint: "diffuse" },
  });

  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: { module: renderMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-strip" },
  });

  // reduce pipeline: average field blocks into READ x READ for cheap readback
  const reduceMod = device.createShaderModule({
    code: /* wgsl */ `
      @group(0) @binding(0) var<storage, read> src : array<u32>;
      @group(0) @binding(1) var<storage, read_write> dst : array<u32>;
      override FIELD : u32 = 1024u;
      override READ : u32 = 128u;
      @compute @workgroup_size(8, 8)
      fn reduce(@builtin(global_invocation_id) gid : vec3<u32>) {
        if (gid.x >= READ || gid.y >= READ) { return; }
        let block = FIELD / READ;
        var mx = 0u;
        for (var by = 0u; by < block; by = by + 1u) {
          for (var bx = 0u; bx < block; bx = bx + 1u) {
            let sx = gid.x * block + bx;
            let sy = gid.y * block + by;
            let v = src[sy * FIELD + sx];
            if (v > mx) { mx = v; }
          }
        }
        dst[gid.y * READ + gid.x] = mx;
      }
    `,
  });
  const reducePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: reduceMod,
      entryPoint: "reduce",
      constants: { FIELD: field, READ },
    },
  });

  // mutable state
  let foodList = foods.slice();
  let foodCount = foodList.length;
  let src = trailA;
  let dst = trailB;
  let time = 0;
  let lastConn = new Float32Array(foodList.length);
  let readPending = false;
  let disposed = false;

  // last reduced field on CPU, for connectivity sampling
  let reduced = new Uint32Array(READ * READ);

  function writeFood() {
    foodCount = foodList.length;
    device.queue.writeBuffer(foodBuf, 0, packFood(foodList).buffer as ArrayBuffer);
  }

  async function kickReadback() {
    if (readPending || disposed) return;
    readPending = true;
    try {
      await mapBuf.mapAsync(GPUMapMode.READ);
      if (disposed) {
        mapBuf.unmap();
        readPending = false;
        return;
      }
      reduced = new Uint32Array(mapBuf.getMappedRange().slice(0));
      mapBuf.unmap();
    } catch {
      /* device lost / unmapped */
    } finally {
      readPending = false;
    }
  }

  function step() {
    if (disposed) return;
    time += 1 / 60;

    device.queue.writeBuffer(
      paramsBuf,
      0,
      packParams(field, agentCount, time, foodCount).buffer as ArrayBuffer,
    );

    const enc = device.createCommandEncoder();

    // 1) move + deposit (reads & writes src)
    {
      const bg = device.createBindGroup({
        layout: movePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: agentBuf } },
          { binding: 1, resource: { buffer: src } },
          { binding: 2, resource: { buffer: paramsBuf } },
          { binding: 3, resource: { buffer: foodBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(movePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(agentCount / 64));
      pass.end();
    }

    // 2) diffuse + decay + food injection: src -> dst
    {
      const bg = device.createBindGroup({
        layout: diffPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: paramsBuf } },
          { binding: 3, resource: { buffer: foodBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(diffPl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(field / 8), Math.ceil(field / 8));
      pass.end();
    }

    // 3) reduce dst -> readBuf (for connectivity)
    {
      const bg = device.createBindGroup({
        layout: reducePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: dst } },
          { binding: 1, resource: { buffer: readBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(reducePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(READ / 8), Math.ceil(READ / 8));
      pass.end();
    }

    // 4) render dst -> canvas
    {
      const view = ctx!.getCurrentTexture().createView();
      const bg = device.createBindGroup({
        layout: renderPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: dst } },
          { binding: 1, resource: { buffer: paramsBuf } },
          { binding: 2, resource: { buffer: foodBuf } },
        ],
      });
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bg);
      pass.draw(4);
      pass.end();
    }

    // copy reduced field for async readback (skip if a map is in flight)
    if (!readPending) {
      enc.copyBufferToBuffer(readBuf, 0, mapBuf, 0, READ * READ * 4);
    }

    device.queue.submit([enc.finish()]);

    if (!readPending) void kickReadback();

    // ping-pong
    const t = src;
    src = dst;
    dst = t;
  }

  function sampleConnections(): Float32Array {
    const n = foodList.length;
    const out = new Float32Array(n);
    if (reduced.length === 0) return out;
    for (let i = 0; i < n; i++) {
      const f = foodList[i];
      const cx = Math.floor(f.x * READ);
      const cy = Math.floor(f.y * READ);
      // disc max over a small neighborhood, skipping the food's own hot core
      let mx = 0;
      const R = 3;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const r = Math.hypot(dx, dy);
          if (r < 1.2 || r > R) continue; // ring: read the vein, not the food core
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= READ || y >= READ) continue;
          const v = reduced[y * READ + x] / 4096;
          if (v > mx) mx = v;
        }
      }
      // map raw vein intensity to [0,1] connection, smoothed in time
      const target = Math.max(0, Math.min(1, mx / 6));
      lastConn[i] = (lastConn[i] || 0) * 0.85 + target * 0.15;
      out[i] = lastConn[i];
    }
    return out;
  }

  function addFood(food: FoodNode) {
    if (foodList.length >= MAX_FOOD) return;
    foodList = foodList.concat(food);
    const nc = new Float32Array(foodList.length);
    nc.set(lastConn);
    lastConn = nc;
    writeFood();
  }

  function dispose() {
    disposed = true;
    try { agentBuf.destroy(); } catch { /* */ }
    try { trailA.destroy(); } catch { /* */ }
    try { trailB.destroy(); } catch { /* */ }
    try { foodBuf.destroy(); } catch { /* */ }
    try { paramsBuf.destroy(); } catch { /* */ }
    try { readBuf.destroy(); } catch { /* */ }
    try { mapBuf.destroy(); } catch { /* */ }
    try { device.destroy(); } catch { /* */ }
  }

  return { kind: "webgpu", step, sampleConnections, addFood, dispose };
}

// ─────────────────────────────────────────────────────────────────────────────
// CPU / Canvas2D fallback backend — same model, fewer agents, full degradation.
// ─────────────────────────────────────────────────────────────────────────────

export function makeCpuBackend(
  canvas: HTMLCanvasElement,
  foods: FoodNode[],
): SlimeBackend {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("No 2D context.");
  const ctx2d: CanvasRenderingContext2D = maybeCtx;

  const N = FIELD_CPU;
  const agentCount = AGENTS_CPU;
  let foodList = foods.slice();

  // trail field (two buffers for diffuse ping-pong)
  let trail = new Float32Array(N * N);
  let next = new Float32Array(N * N);

  // agents stored as x,y in [0,N), heading
  const ax = new Float32Array(agentCount);
  const ay = new Float32Array(agentCount);
  const ah = new Float32Array(agentCount);
  for (let i = 0; i < agentCount; i++) {
    ax[i] = Math.random() * N;
    ay[i] = Math.random() * N;
    ah[i] = Math.random() * Math.PI * 2;
  }

  const img = ctx2d.createImageData(N, N);
  const off = document.createElement("canvas");
  off.width = N;
  off.height = N;
  const offCtx = off.getContext("2d")!;

  let lastConn = new Float32Array(foodList.length);
  let disposed = false;

  const wrap = (v: number) => ((v % N) + N) % N;
  const idx = (x: number, y: number) => wrap(Math.floor(y)) * N + wrap(Math.floor(x));

  const T = TUNING;

  function step() {
    if (disposed) return;

    // move + deposit
    for (let i = 0; i < agentCount; i++) {
      const x = ax[i];
      const y = ay[i];
      const h = ah[i];
      const d = T.sensorDist;
      const wl = trail[idx(x + Math.cos(h - T.sensorAngle) * d, y + Math.sin(h - T.sensorAngle) * d)];
      const wc = trail[idx(x + Math.cos(h) * d, y + Math.sin(h) * d)];
      const wr = trail[idx(x + Math.cos(h + T.sensorAngle) * d, y + Math.sin(h + T.sensorAngle) * d)];

      let nh = h;
      const rnd = Math.random();
      if (wc > wl && wc > wr) {
        // straight
      } else if (wc < wl && wc < wr) {
        nh = h + (rnd < 0.5 ? -T.turnAngle : T.turnAngle);
      } else if (wl > wr) {
        nh = h - T.turnAngle;
      } else if (wr > wl) {
        nh = h + T.turnAngle;
      } else {
        nh = h + (rnd - 0.5) * T.turnAngle;
      }

      // food pull
      let bestD = 1e9;
      let bx = 0;
      let by = 0;
      for (let f = 0; f < foodList.length; f++) {
        const fx = foodList[f].x * N;
        const fy = foodList[f].y * N;
        const dx = fx - x;
        const dy = fy - y;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) { bestD = dd; bx = dx; by = dy; }
      }
      if (foodList.length > 0 && bestD < (N * 0.3) * (N * 0.3)) {
        const targetH = Math.atan2(by, bx);
        let diff = targetH - nh;
        diff -= Math.PI * 2 * Math.round(diff / (Math.PI * 2));
        nh += diff * T.foodPull * T.turnAngle;
      }

      let nx = x + Math.cos(nh) * T.stepSize;
      let ny = y + Math.sin(nh) * T.stepSize;
      nx = wrap(nx);
      ny = wrap(ny);
      ax[i] = nx;
      ay[i] = ny;
      ah[i] = nh;
      trail[idx(nx, ny)] += T.deposit;
    }

    // diffuse (3x3) + decay + food injection
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += trail[idx(x + dx, y + dy)];
          }
        }
        next[y * N + x] = (sum / 9) * T.decay;
      }
    }
    for (let f = 0; f < foodList.length; f++) {
      const fx = Math.floor(foodList[f].x * N);
      const fy = Math.floor(foodList[f].y * N);
      const rad = Math.max(2, Math.floor(N * 0.012));
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const r = Math.hypot(dx, dy);
          if (r > rad) continue;
          next[idx(fx + dx, fy + dy)] += 0.9 * (1 - r / rad);
        }
      }
    }
    const tmp = trail;
    trail = next;
    next = tmp;

    drawField();
  }

  function drawField() {
    const data = img.data;
    for (let i = 0; i < N * N; i++) {
      const t = trail[i];
      const g = 1 - Math.exp(-t * 2.2);
      // indigo -> teal -> gold
      let r: number, gg: number, b: number;
      if (g < 0.45) {
        const k = g / 0.45;
        r = 0.04 + (0.10 - 0.04) * k;
        gg = 0.06 + (0.55 - 0.06) * k;
        b = 0.14 + (0.55 - 0.14) * k;
      } else {
        const k = Math.min(1, (g - 0.45) / 0.5);
        r = 0.10 + (0.95 - 0.10) * k;
        gg = 0.55 + (0.78 - 0.55) * k;
        b = 0.55 + (0.35 - 0.55) * k;
      }
      const amp = 0.35 + 1.5 * g;
      data[i * 4 + 0] = Math.min(255, r * amp * 255);
      data[i * 4 + 1] = Math.min(255, gg * amp * 255);
      data[i * 4 + 2] = Math.min(255, b * amp * 255);
      data[i * 4 + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);

    // scale field up to the visible canvas + draw food halos
    ctx2d.imageSmoothingEnabled = true;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(off, 0, 0, canvas.width, canvas.height);

    const conn = sampleConnections();
    for (let f = 0; f < foodList.length; f++) {
      const px = foodList[f].x * canvas.width;
      const py = foodList[f].y * canvas.height;
      const c = conn[f];
      const rad = 6 + c * 16;
      const grad = ctx2d.createRadialGradient(px, py, 0, px, py, rad * 2.5);
      grad.addColorStop(0, `rgba(255,250,235,${0.9})`);
      grad.addColorStop(0.4, `rgba(230,217,255,${0.3 + 0.5 * c})`);
      grad.addColorStop(1, "rgba(230,217,255,0)");
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.arc(px, py, rad * 2.5, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  function sampleConnections(): Float32Array {
    const n = foodList.length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const cx = foodList[i].x * N;
      const cy = foodList[i].y * N;
      let mx = 0;
      const R = 7;
      for (let dy = -R; dy <= R; dy += 2) {
        for (let dx = -R; dx <= R; dx += 2) {
          const r = Math.hypot(dx, dy);
          if (r < 3 || r > R) continue; // ring: read the vein, not the food core
          const v = trail[idx(cx + dx, cy + dy)];
          if (v > mx) mx = v;
        }
      }
      const target = Math.max(0, Math.min(1, mx / 1.2));
      lastConn[i] = (lastConn[i] || 0) * 0.85 + target * 0.15;
      out[i] = lastConn[i];
    }
    return out;
  }

  function addFood(food: FoodNode) {
    if (foodList.length >= MAX_FOOD) return;
    foodList = foodList.concat(food);
    const nc = new Float32Array(foodList.length);
    nc.set(lastConn);
    lastConn = nc;
  }

  function dispose() {
    disposed = true;
    trail = new Float32Array(0);
    next = new Float32Array(0);
  }

  return { kind: "cpu", step, sampleConnections, addFood, dispose };
}
