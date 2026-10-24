// ─────────────────────────────────────────────────────────────────────────────
// 24680-chromafield — WebGPU Gray-Scott reaction-diffusion core.
//
// A chemical membrane of two reagents A and B lives on a GRID_W × GRID_H lattice.
// Every frame the Gray-Scott PDE is advanced for SUBSTEPS iterations ENTIRELY on
// the GPU in a WGSL compute pass that ping-pongs two storage buffers (each cell is
// a vec2<f32> = concentrations A,B). The viewer DEPOSITS reagent B into the field
// (an arm sweep / a pointer drag seeds the B chemical); the feed/kill regime —
// passed in each frame — slides the emergent morphology between spots, stripes,
// worms and chaos. Stillness (no deposits) lets whatever is there mature.
//
// The field is BOTH the visual and the audio driver:
//
//   1. step   (compute, N substeps)  — advance the chemistry on the GPU.
//   2. reduce (compute, 1 workgroup) — collapse the whole field to six scalars
//      (B coverage, ΣB, ΣB·y, left-B, right-B, edge/turbulence) via a shared-
//      memory tree reduction. Only these six floats are read back (~1 frame).
//   3. render (render pass)          — a full-screen triangle colours the lattice
//      obsidian → indigo → electric violet by B, with bright violet filaments at
//      the membrane boundaries.
//
// The scalars genuinely EMERGE from the simulation — you cannot know the pattern's
// coverage or turbulence without stepping the chemistry — so they are copied to a
// mapped buffer and read back to drive the CPU-side Web-Audio DSP graph.
//
// createGpuRd() throws a typed WebGPUUnsupportedError the page catches to fall
// back to a real low-res CPU reaction-diffusion on a 2D canvas instead of a blank
// screen. The adapter/device request, pipeline creation and teardown follow the
// build-safe pattern proven in 23440-fluxmesh/gpu.ts.
// ─────────────────────────────────────────────────────────────────────────────

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

/** One reagent deposit, in grid-uv space (x,y ∈ [0,1]; r = radius; amount of B). */
export interface Deposit {
  x: number;
  y: number;
  r: number;
  amount: number;
}

/** The handful of scalars the chemical field is reduced to each frame. */
export interface RdStats {
  /** Fraction of the lattice in the B-state (B > threshold), 0 … 1. */
  coverage: number;
  /** Edge-density / turbulence of the B field (mean boundary gradient), 0 … 1. */
  edge: number;
  /** Left/right B balance, −1 (all left) … +1 (all right). */
  balance: number;
  /** B-weighted vertical centroid, 0 (top) … 1 (bottom). */
  centroidY: number;
}

/** Common surface implemented by both the GPU and the CPU-fallback simulation. */
export interface RdSim {
  /** Advance the chemistry, apply deposits, set the feed/kill regime, draw. */
  frame(
    dt: number,
    deposits: Deposit[],
    feed: number,
    kill: number,
    timeSec: number,
  ): void;
  /** Latest reduced scalars (GPU path updates these ~1 frame behind). */
  readonly stats: RdStats;
  resize(): void;
  dispose(): void;
  readonly backend: "gpu" | "cpu";
}

// Lattice. ~57k cells — a genuinely parallel load for the GPU path.
const GRID_W = 320;
const GRID_H = 180;
const COUNT = GRID_W * GRID_H;
const MAX_DEPOSIT = 8;
const SUBSTEPS = 12;
const WG = 64; // step workgroup size
const RWG = 256; // reduction workgroup size
const DA = 1.0; // diffusion rate of A
const DB = 0.5; // diffusion rate of B
const DT = 1.0; // fixed Gray-Scott substep (stable with the stencil weights)
const B_THRESHOLD = 0.25; // "in the B-state" for coverage

// ── WGSL: shared uniform block ───────────────────────────────────────────────
const SIM_STRUCT = /* wgsl */ `
struct Sim {
  w            : u32,
  h            : u32,
  count        : u32,
  depositCount : u32,
  feed         : f32,
  kill         : f32,
  dA           : f32,
  dB           : f32,
  dt           : f32,
  threshold    : f32,
  _p0          : f32,
  _p1          : f32,
  deposits     : array<vec4<f32>, 8>,
};
`;

// ── WGSL: one Gray-Scott substep (read In → write Out) ───────────────────────
const STEP_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S : Sim;
@group(0) @binding(1) var<storage, read> chemIn : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> chemOut : array<vec2<f32>>;

fn at(x: i32, y: i32) -> vec2<f32> {
  // Toroidal wrap → a seamless, border-free membrane.
  let xx = (x + i32(S.w)) % i32(S.w);
  let yy = (y + i32(S.h)) % i32(S.h);
  return chemIn[u32(yy) * S.w + u32(xx)];
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= S.count) { return; }
  let x = i32(i % S.w);
  let y = i32(i / S.w);
  let c = chemIn[i];

  // 3×3 Laplacian (standard Gray-Scott stencil weights).
  var lap = c * -1.0;
  lap += (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.2;
  lap += (at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) * 0.05;

  let A = c.x;
  let B = c.y;
  let reaction = A * B * B;
  var nA = A + (S.dA * lap.x - reaction + S.feed * (1.0 - A)) * S.dt;
  var nB = B + (S.dB * lap.y + reaction - (S.feed + S.kill) * B) * S.dt;

  // Deposits — inject reagent B (and clear a little A so the reaction catches).
  let uv = vec2<f32>((f32(x) + 0.5) / f32(S.w), (f32(y) + 0.5) / f32(S.h));
  for (var d = 0u; d < S.depositCount; d = d + 1u) {
    let dp = S.deposits[d];
    let dd = uv - dp.xy;
    let g = exp(-dot(dd, dd) / (2.0 * dp.z * dp.z));
    nB = nB + dp.w * g;
    nA = nA - dp.w * g * 0.5;
  }

  chemOut[i] = clamp(vec2<f32>(nA, nB), vec2<f32>(0.0), vec2<f32>(1.0));
}
`;

// ── WGSL: reduce the field to six scalars (one workgroup) ────────────────────
const REDUCE_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S : Sim;
@group(0) @binding(1) var<storage, read> chem : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> outv : array<f32>;

var<workgroup> sCov  : array<f32, ${RWG}>;
var<workgroup> sB    : array<f32, ${RWG}>;
var<workgroup> sBy   : array<f32, ${RWG}>;
var<workgroup> sL    : array<f32, ${RWG}>;
var<workgroup> sR    : array<f32, ${RWG}>;
var<workgroup> sEdge : array<f32, ${RWG}>;

fn bAt(x: i32, y: i32) -> f32 {
  let xx = (x + i32(S.w)) % i32(S.w);
  let yy = (y + i32(S.h)) % i32(S.h);
  return chem[u32(yy) * S.w + u32(xx)].y;
}

@compute @workgroup_size(${RWG})
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let tid = lid.x;
  var cov = 0.0; var sb = 0.0; var sby = 0.0; var sl = 0.0; var sr = 0.0; var se = 0.0;

  var i = tid;
  loop {
    if (i >= S.count) { break; }
    let x = i32(i % S.w);
    let y = i32(i / S.w);
    let b = chem[i].y;
    if (b > S.threshold) { cov += 1.0; }
    sb += b;
    let yn = f32(y) / f32(S.h - 1u);
    sby += b * yn;
    if (x < i32(S.w) / 2) { sl += b; } else { sr += b; }
    se += abs(bAt(x + 1, y) - b) + abs(bAt(x, y + 1) - b);
    i += ${RWG}u;
  }

  sCov[tid] = cov; sB[tid] = sb; sBy[tid] = sby;
  sL[tid] = sl; sR[tid] = sr; sEdge[tid] = se;
  workgroupBarrier();

  var stride = ${RWG}u >> 1u;
  loop {
    if (stride == 0u) { break; }
    if (tid < stride) {
      sCov[tid]  += sCov[tid + stride];
      sB[tid]    += sB[tid + stride];
      sBy[tid]   += sBy[tid + stride];
      sL[tid]    += sL[tid + stride];
      sR[tid]    += sR[tid + stride];
      sEdge[tid] += sEdge[tid + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (tid == 0u) {
    outv[0] = sCov[0];
    outv[1] = sB[0];
    outv[2] = sBy[0];
    outv[3] = sL[0];
    outv[4] = sR[0];
    outv[5] = sEdge[0];
  }
}
`;

// ── WGSL: colour the lattice (full-screen triangle) ──────────────────────────
const RENDER_WGSL = /* wgsl */ `
struct RU {
  w    : u32,
  h    : u32,
  time : f32,
  _p0  : f32,
};
@group(0) @binding(0) var<uniform> R : RU;
@group(0) @binding(1) var<storage, read> chem : array<vec2<f32>>;

struct VO {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VO {
  // One oversized triangle covering the viewport.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var o : VO;
  let xy = p[vi];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  // uv: 0,0 at top-left of the field.
  o.uv = vec2<f32>((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);
  return o;
}

fn sampleB(gx: u32, gy: u32) -> f32 {
  return chem[gy * R.w + gx].y;
}

@fragment
fn fs(in : VO) -> @location(0) vec4<f32> {
  let fx = clamp(in.uv.x, 0.0, 0.99999) * f32(R.w);
  let fy = clamp(in.uv.y, 0.0, 0.99999) * f32(R.h);
  let gx = u32(fx);
  let gy = u32(fy);
  let b = sampleB(gx, gy);

  // Cheap boundary gradient for the glowing membrane filaments.
  let bx = sampleB((gx + 1u) % R.w, gy);
  let by = sampleB(gx, (gy + 1u) % R.h);
  let edge = clamp((abs(bx - b) + abs(by - b)) * 7.0, 0.0, 1.0);

  // Obsidian black → indigo → electric violet, high contrast.
  let obsidian = vec3<f32>(0.016, 0.012, 0.035);
  let indigo   = vec3<f32>(0.17, 0.09, 0.44);
  let violet   = vec3<f32>(0.56, 0.22, 1.0);
  var col = mix(obsidian, indigo, smoothstep(0.04, 0.34, b));
  col = mix(col, violet, smoothstep(0.30, 0.62, b));
  // Bright violet filaments where the chemistry turns over.
  col += violet * edge * 0.85;
  // A faint cool breath so the obsidian ground never reads as dead black.
  col += indigo * 0.06;
  return vec4<f32>(col, 1.0);
}
`;

const SIM_BYTES = 48 + MAX_DEPOSIT * 16; // header (48) + 8 * vec4
const RU_BYTES = 16;
const OUT_BYTES = 32; // 6 floats, padded

export async function createGpuRd(canvas: HTMLCanvasElement): Promise<RdSim> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new WebGPUUnsupportedError("navigator.gpu is unavailable");
  }
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw new WebGPUUnsupportedError("no WebGPU adapter (GPU/driver blocked)");
  }
  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch (e) {
    throw new WebGPUUnsupportedError(
      "requestDevice failed: " + (e instanceof Error ? e.message : String(e)),
    );
  }

  const context = canvas.getContext("webgpu");
  if (!context) {
    device.destroy();
    throw new WebGPUUnsupportedError("could not get a webgpu canvas context");
  }
  const format = navigator.gpu.getPreferredCanvasFormat();

  let disposed = false;
  let deviceLost = false;
  device.lost.then((info) => {
    deviceLost = true;
    if (!disposed && info.reason !== "destroyed") {
      console.warn("[chromafield] WebGPU device lost:", info.message);
    }
  });

  const configure = () => {
    const dpr = Math.min(
      2,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    context.configure({ device, format, alphaMode: "opaque" });
  };
  configure();

  // ── buffers ────────────────────────────────────────────────────────────────
  const stateUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const chemA = device.createBuffer({ size: COUNT * 8, usage: stateUsage });
  const chemB = device.createBuffer({ size: COUNT * 8, usage: stateUsage });

  // Seed: A = 1 everywhere, B = 0, with a scatter of B patches so the chemistry
  // has somewhere to begin even before anyone touches it (hands-free drift).
  const seed = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) seed[i * 2] = 1.0; // A
  const blob = (cx: number, cy: number, rad: number, amp: number) => {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) {
      for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y > r2) continue;
        const gx = (cx + x + GRID_W) % GRID_W;
        const gy = (cy + y + GRID_H) % GRID_H;
        const idx = (gy * GRID_W + gx) * 2;
        seed[idx + 1] = Math.min(1, seed[idx + 1] + amp);
        seed[idx] = Math.max(0, seed[idx] - amp * 0.5);
      }
    }
  };
  blob(Math.floor(GRID_W / 2), Math.floor(GRID_H / 2), 10, 0.9);
  for (let k = 0; k < 14; k++) {
    blob(
      Math.floor(Math.random() * GRID_W),
      Math.floor(Math.random() * GRID_H),
      3 + Math.floor(Math.random() * 4),
      0.8,
    );
  }
  device.queue.writeBuffer(chemA, 0, seed);

  const simBuf = device.createBuffer({
    size: SIM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const ruBuf = device.createBuffer({
    size: RU_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const outBuf = device.createBuffer({
    size: OUT_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuf = device.createBuffer({
    size: OUT_BYTES,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // ── bind group layouts ───────────────────────────────────────────────────────
  const stepLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const reduceLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
    ],
  });

  // ── pipelines ──────────────────────────────────────────────────────────────
  const stepModule = device.createShaderModule({ code: STEP_WGSL });
  const reduceModule = device.createShaderModule({ code: REDUCE_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const stepPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [stepLayout] }),
    compute: { module: stepModule, entryPoint: "main" },
  });
  const reducePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [reduceLayout] }),
    compute: { module: reduceModule, entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: { module: renderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // ── bind groups (ping-pong parity) ───────────────────────────────────────────
  const stepAB = device.createBindGroup({
    layout: stepLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: chemA } },
      { binding: 2, resource: { buffer: chemB } },
    ],
  });
  const stepBA = device.createBindGroup({
    layout: stepLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: chemB } },
      { binding: 2, resource: { buffer: chemA } },
    ],
  });
  const reduceA = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: chemA } },
      { binding: 2, resource: { buffer: outBuf } },
    ],
  });
  const reduceB = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: chemB } },
      { binding: 2, resource: { buffer: outBuf } },
    ],
  });
  const renderA = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: ruBuf } },
      { binding: 1, resource: { buffer: chemA } },
    ],
  });
  const renderB = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: ruBuf } },
      { binding: 1, resource: { buffer: chemB } },
    ],
  });

  // ── CPU-side uniform packing ─────────────────────────────────────────────────
  const simData = new ArrayBuffer(SIM_BYTES);
  const simView = new DataView(simData);
  const ruData = new ArrayBuffer(RU_BYTES);
  const ruView = new DataView(ruData);

  const writeSim = (feed: number, kill: number, deposits: Deposit[]) => {
    simView.setUint32(0, GRID_W, true);
    simView.setUint32(4, GRID_H, true);
    simView.setUint32(8, COUNT, true);
    const n = Math.min(MAX_DEPOSIT, deposits.length);
    simView.setUint32(12, n, true);
    simView.setFloat32(16, feed, true);
    simView.setFloat32(20, kill, true);
    simView.setFloat32(24, DA, true);
    simView.setFloat32(28, DB, true);
    simView.setFloat32(32, DT, true);
    simView.setFloat32(36, B_THRESHOLD, true);
    for (let k = 0; k < MAX_DEPOSIT; k++) {
      const base = 48 + k * 16;
      const d = k < n ? deposits[k] : null;
      simView.setFloat32(base, d ? d.x : 0, true);
      simView.setFloat32(base + 4, d ? d.y : 0, true);
      simView.setFloat32(base + 8, d ? d.r : 0.03, true);
      simView.setFloat32(base + 12, d ? d.amount : 0, true);
    }
    device.queue.writeBuffer(simBuf, 0, simData);
  };

  const stats: RdStats = { coverage: 0, edge: 0, balance: 0, centroidY: 0.5 };
  let mapInFlight = false;
  let currentIsA = true; // chemA holds the current (seeded) field
  let edgePeak = 1e-3;

  const stepGroups = Math.ceil(COUNT / WG);

  const frame = (
    _dt: number,
    deposits: Deposit[],
    feed: number,
    kill: number,
    timeSec: number,
  ) => {
    if (disposed || deviceLost) return;
    writeSim(feed, kill, deposits);

    const enc = device.createCommandEncoder();

    for (let s = 0; s < SUBSTEPS; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPipeline);
      pass.setBindGroup(0, currentIsA ? stepAB : stepBA);
      pass.dispatchWorkgroups(stepGroups);
      pass.end();
      currentIsA = !currentIsA;
    }

    // Reduce the freshly-written field to the scalars.
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(reducePipeline);
      pass.setBindGroup(0, currentIsA ? reduceA : reduceB);
      pass.dispatchWorkgroups(1);
      pass.end();
    }

    // Render.
    ruView.setUint32(0, GRID_W, true);
    ruView.setUint32(4, GRID_H, true);
    ruView.setFloat32(8, timeSec, true);
    device.queue.writeBuffer(ruBuf, 0, ruData);

    const view = context.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.016, g: 0.012, b: 0.035, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, currentIsA ? renderA : renderB);
    rpass.draw(3);
    rpass.end();

    device.queue.submit([enc.finish()]);

    // Kick a scalar readback when none is pending (≈1 frame latency).
    if (!mapInFlight) {
      mapInFlight = true;
      const enc2 = device.createCommandEncoder();
      enc2.copyBufferToBuffer(outBuf, 0, readBuf, 0, OUT_BYTES);
      device.queue.submit([enc2.finish()]);
      readBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (disposed) return;
          const a = new Float32Array(readBuf.getMappedRange().slice(0));
          readBuf.unmap();
          // a = [ covCount, sumB, sumBy, leftB, rightB, edgeSum ]
          const covCount = a[0];
          const sumB = a[1];
          const sumBy = a[2];
          const leftB = a[3];
          const rightB = a[4];
          const edgeSum = a[5];
          stats.coverage = covCount / COUNT;
          stats.centroidY = sumB > 1e-4 ? sumBy / sumB : 0.5;
          stats.balance = (rightB - leftB) / (rightB + leftB + 1e-4);
          const edgeMean = edgeSum / COUNT;
          edgePeak = Math.max(edgePeak * 0.995, edgeMean, 1e-3);
          stats.edge = Math.min(1, edgeMean / edgePeak);
          mapInFlight = false;
        })
        .catch(() => {
          mapInFlight = false;
        });
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      context.unconfigure();
    } catch {
      /* ignore */
    }
    chemA.destroy();
    chemB.destroy();
    simBuf.destroy();
    ruBuf.destroy();
    outBuf.destroy();
    try {
      readBuf.destroy();
    } catch {
      /* may be mapped-pending */
    }
    device.destroy();
  };

  return {
    frame,
    stats,
    resize: () => {
      if (!disposed && !deviceLost) configure();
    },
    dispose,
    backend: "gpu",
  };
}
