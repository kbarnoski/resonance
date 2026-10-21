// ─────────────────────────────────────────────────────────────────────────────
// 23440-fluxmesh — WebGPU compute core.
//
// A large mass-spring mesh (a pinned membrane of CxR nodes) is integrated every
// frame ENTIRELY on the GPU with a semi-implicit compute shader: structural +
// diagonal neighbour springs, damping, a weak anchor to the rest shape, a gentle
// ambient breathing force so the idle field stays alive, and up to 8 external
// "push" points (a wrist or the mouse reaching into the field). The integrator
// ping-pongs two position / velocity storage buffers across several substeps.
//
// The field is BOTH the visual and the audio driver:
//
//   1. integrate (compute, N substeps)  — advance the mesh on the GPU.
//   2. reduce    (compute, 1 workgroup) — collapse the whole field down to a
//      handful of scalars (total kinetic energy, energy-weighted vertical
//      centroid, left/right energy balance, mean displacement) using a
//      shared-memory tree reduction. Only these ~5 floats are read back.
//   3. render    (render pass)          — draw the mesh as a line-list wireframe,
//      each segment lit by its node velocity (schematic teal → hot cyan).
//
// The scalars genuinely emerge from the GPU simulation — you cannot know a node's
// velocity without stepping the physics — so they are copied to a mapped buffer
// and read back (~1 frame latency) to drive the CPU-side Web-Audio DSP graph.
//
// create() throws a typed WebGPUUnsupportedError the page catches to fall back to
// a smaller CPU mesh + Canvas2D instead of showing a blank screen.
// ─────────────────────────────────────────────────────────────────────────────

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

/** One force injected into the field, in sim space (x,y ∈ [0,1]; fx,fy = force). */
export interface Push {
  x: number;
  y: number;
  fx: number;
  fy: number;
}

/** Scalars for one conducted half of the membrane (cycle 2). */
export interface RegionScalars {
  /** Kinetic energy summed over this region (raw; the page normalises it). */
  energy: number;
  /** Energy-weighted vertical centroid within this region, 0 (top) … 1 (bottom). */
  centroidY: number;
  /** Mean per-node displacement from rest within this region. */
  stretch: number;
}

/** The small set of scalars the GPU field is reduced to each frame. */
export interface Scalars {
  /** Total kinetic energy of the field (raw sum; the page normalises it). */
  energy: number;
  /** Energy-weighted vertical centroid, 0 (top) … 1 (bottom). */
  centroidY: number;
  /** Left/right energy balance, −1 (all left) … +1 (all right). */
  balance: number;
  /** Mean per-node displacement from the rest shape (a proxy for spring stretch). */
  stretch: number;
  /**
   * Cycle 2 — the membrane is split at rest-x = 0.5 into two independently
   * conducted regions. The LEFT region drives the biquad SOS filter cascade;
   * the RIGHT region drives the feedforward-comb FIR stage. Two body signals,
   * two parts of the Fluxion graph.
   */
  left: RegionScalars;
  right: RegionScalars;
}

/** Common surface implemented by both the GPU and the CPU-fallback mesh. */
export interface MeshSim {
  /** Advance the field, inject pushes, and draw one frame. */
  frame(dt: number, pushes: Push[], timeSec: number): void;
  /** Latest reduced scalars (GPU path updates these ~1 frame behind). */
  readonly scalars: Scalars;
  resize(): void;
  dispose(): void;
  readonly backend: "gpu" | "cpu";
}

// Mesh dimensions. ~10k nodes — a genuinely parallel load for the GPU path.
const COLS = 128;
const ROWS = 80;
const COUNT = COLS * ROWS;
const MAX_PUSH = 8;
const SUBSTEPS = 3;
const WG = 64; // integrate workgroup size
const RWG = 256; // reduction workgroup size

// ── WGSL: shared simulation uniform block ────────────────────────────────────
const SIM_STRUCT = /* wgsl */ `
struct Sim {
  cols       : u32,
  rows       : u32,
  count      : u32,
  pushCount  : u32,
  dt         : f32,
  time       : f32,
  springK    : f32,
  damping    : f32,
  restAnchor : f32,
  ambient    : f32,
  pushRadius : f32,
  _pad       : f32,
  pushes     : array<vec4<f32>, 8>,
};
`;

// ── WGSL: integrate one substep (read In → write Out) ────────────────────────
const INTEGRATE_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S : Sim;
@group(0) @binding(1) var<storage, read> posIn : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> velIn : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> posOut : array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> velOut : array<vec2<f32>>;

fn restOf(gx: u32, gy: u32) -> vec2<f32> {
  return vec2<f32>(f32(gx) / f32(S.cols - 1u), f32(gy) / f32(S.rows - 1u));
}

fn nodeAt(gx: i32, gy: i32) -> vec2<f32> {
  return posIn[u32(gy) * S.cols + u32(gx)];
}

fn spring(p: vec2<f32>, q: vec2<f32>, rest: f32) -> vec2<f32> {
  let d = q - p;
  let len = length(d) + 1e-6;
  return (d / len) * (len - rest) * S.springK;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= S.count) { return; }
  let gx = i % S.cols;
  let gy = i / S.cols;
  let rest = restOf(gx, gy);

  // Pin the border → an anchored membrane (waves reflect, nothing drifts off).
  if (gx == 0u || gy == 0u || gx == S.cols - 1u || gy == S.rows - 1u) {
    posOut[i] = rest;
    velOut[i] = vec2<f32>(0.0);
    return;
  }

  let p = posIn[i];
  var v = velIn[i];

  let sx = 1.0 / f32(S.cols - 1u);
  let sy = 1.0 / f32(S.rows - 1u);
  let sd = sqrt(sx * sx + sy * sy);
  let ix = i32(gx);
  let iy = i32(gy);

  var force = vec2<f32>(0.0);
  force += spring(p, nodeAt(ix - 1, iy),     sx);
  force += spring(p, nodeAt(ix + 1, iy),     sx);
  force += spring(p, nodeAt(ix,     iy - 1), sy);
  force += spring(p, nodeAt(ix,     iy + 1), sy);
  force += spring(p, nodeAt(ix - 1, iy - 1), sd);
  force += spring(p, nodeAt(ix + 1, iy - 1), sd);
  force += spring(p, nodeAt(ix - 1, iy + 1), sd);
  force += spring(p, nodeAt(ix + 1, iy + 1), sd);

  // Weak restoring anchor to the rest shape (keeps the membrane recognisable).
  force += (rest - p) * S.restAnchor;

  // Ambient breathing so the idle field is never static.
  let ph = S.time * 0.9 + rest.x * 6.2831853 + rest.y * 3.3;
  force += vec2<f32>(0.0, sin(ph)) * S.ambient;

  // External pushes (a wrist or the mouse reaching into the field).
  for (var k = 0u; k < S.pushCount; k = k + 1u) {
    let pu = S.pushes[k];
    let d = p - pu.xy;
    let g = exp(-dot(d, d) / (2.0 * S.pushRadius * S.pushRadius));
    force += pu.zw * g;
  }

  // Damping, then semi-implicit Euler.
  force -= v * S.damping;
  v = v + force * S.dt;
  posOut[i] = p + v * S.dt;
  velOut[i] = v;
}
`;

// ── WGSL: reduce the field to PER-REGION scalars (one workgroup) ─────────────
// Cycle 2: the membrane is split at rest-x = 0.5 into a LEFT and a RIGHT half,
// each reduced independently to { energy, energy·y, stretch }. Six accumulators
// instead of five; region membership is keyed on the REST x (fixed) so a node
// never flips regions as it moves. The page derives the global energy / centroid
// / balance / stretch from the two halves, and feeds each half to its own part
// of the DSP graph.
const REDUCE_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S : Sim;
@group(0) @binding(1) var<storage, read> pos : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> vel : array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> outv : array<f32>;

var<workgroup> sLKE  : array<f32, ${RWG}>;
var<workgroup> sLYKE : array<f32, ${RWG}>;
var<workgroup> sLST  : array<f32, ${RWG}>;
var<workgroup> sRKE  : array<f32, ${RWG}>;
var<workgroup> sRYKE : array<f32, ${RWG}>;
var<workgroup> sRST  : array<f32, ${RWG}>;

@compute @workgroup_size(${RWG})
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let tid = lid.x;
  var lke = 0.0; var lyke = 0.0; var lst = 0.0;
  var rke = 0.0; var ryke = 0.0; var rst = 0.0;

  var i = tid;
  loop {
    if (i >= S.count) { break; }
    let gx = i % S.cols;
    let gy = i / S.cols;
    let p = pos[i];
    let v = vel[i];
    let e = 0.5 * dot(v, v);
    let rest = vec2<f32>(f32(gx) / f32(S.cols - 1u), f32(gy) / f32(S.rows - 1u));
    let stretch = length(p - rest);
    if (rest.x < 0.5) {
      lke += e; lyke += e * p.y; lst += stretch;
    } else {
      rke += e; ryke += e * p.y; rst += stretch;
    }
    i += ${RWG}u;
  }

  sLKE[tid] = lke; sLYKE[tid] = lyke; sLST[tid] = lst;
  sRKE[tid] = rke; sRYKE[tid] = ryke; sRST[tid] = rst;
  workgroupBarrier();

  var stride = ${RWG}u >> 1u;
  loop {
    if (stride == 0u) { break; }
    if (tid < stride) {
      sLKE[tid]  += sLKE[tid + stride];
      sLYKE[tid] += sLYKE[tid + stride];
      sLST[tid]  += sLST[tid + stride];
      sRKE[tid]  += sRKE[tid + stride];
      sRYKE[tid] += sRYKE[tid + stride];
      sRST[tid]  += sRST[tid + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (tid == 0u) {
    outv[0] = sLKE[0];
    outv[1] = sLYKE[0];
    outv[2] = sLST[0];
    outv[3] = sRKE[0];
    outv[4] = sRYKE[0];
    outv[5] = sRST[0];
  }
}
`;

// ── WGSL: render the mesh as a velocity-lit line-list wireframe ──────────────
const RENDER_WGSL = /* wgsl */ `
struct RU {
  time      : f32,
  glowScale : f32,
  _p0       : f32,
  _p1       : f32,
};
@group(0) @binding(0) var<uniform> R : RU;
@group(0) @binding(1) var<storage, read> pos : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> vel : array<vec2<f32>>;

struct VO {
  @builtin(position) pos : vec4<f32>,
  @location(0) glow : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VO {
  let p = pos[vi];
  let speed = length(vel[vi]);
  var o : VO;
  // sim [0,1]² → clip (y=0 is the top of the field)
  o.pos = vec4<f32>(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  o.glow = clamp(speed * R.glowScale, 0.0, 1.0);
  return o;
}

@fragment
fn fs(in : VO) -> @location(0) vec4<f32> {
  // Schematic register: cool teal at rest, hot cyan where the field is moving.
  let base = vec3<f32>(0.10, 0.42, 0.52);
  let hot  = vec3<f32>(0.40, 0.95, 1.0);
  let col = mix(base, hot, in.glow);
  let a = 0.13 + in.glow * 0.72;
  return vec4<f32>(col * a, a);
}
`;

const SIM_BYTES = 48 + MAX_PUSH * 16; // header (48) + 8 * vec4
const RU_BYTES = 16;

export async function createGpuMesh(canvas: HTMLCanvasElement): Promise<MeshSim> {
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
      console.warn("[fluxmesh] WebGPU device lost:", info.message);
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
  const posA = device.createBuffer({ size: COUNT * 8, usage: stateUsage });
  const posB = device.createBuffer({ size: COUNT * 8, usage: stateUsage });
  const velA = device.createBuffer({ size: COUNT * 8, usage: stateUsage });
  const velB = device.createBuffer({ size: COUNT * 8, usage: stateUsage });

  // Seed positions at the rest shape (velocities are zero by WebGPU spec).
  const rest = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    const gx = i % COLS;
    const gy = Math.floor(i / COLS);
    rest[i * 2] = gx / (COLS - 1);
    rest[i * 2 + 1] = gy / (ROWS - 1);
  }
  device.queue.writeBuffer(posA, 0, rest);

  // Per-region node counts (rest-x < 0.5), for per-region stretch normalisation.
  let leftCols = 0;
  for (let gx = 0; gx < COLS; gx++) if (gx / (COLS - 1) < 0.5) leftCols++;
  const LEFT_COUNT = Math.max(1, leftCols * ROWS);
  const RIGHT_COUNT = Math.max(1, COUNT - LEFT_COUNT);

  const simBuf = device.createBuffer({
    size: SIM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const ruBuf = device.createBuffer({
    size: RU_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const outBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // ── bind group layouts ───────────────────────────────────────────────────────
  const integLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const reduceLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
    ],
  });

  // ── pipelines ──────────────────────────────────────────────────────────────
  const integModule = device.createShaderModule({ code: INTEGRATE_WGSL });
  const reduceModule = device.createShaderModule({ code: REDUCE_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const integPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [integLayout] }),
    compute: { module: integModule, entryPoint: "main" },
  });
  const reducePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [reduceLayout] }),
    compute: { module: reduceModule, entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "line-list" },
  });

  // ── bind groups (ping-pong parity) ───────────────────────────────────────────
  const integAB = device.createBindGroup({
    layout: integLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posA } },
      { binding: 2, resource: { buffer: velA } },
      { binding: 3, resource: { buffer: posB } },
      { binding: 4, resource: { buffer: velB } },
    ],
  });
  const integBA = device.createBindGroup({
    layout: integLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posB } },
      { binding: 2, resource: { buffer: velB } },
      { binding: 3, resource: { buffer: posA } },
      { binding: 4, resource: { buffer: velA } },
    ],
  });
  const reduceA = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posA } },
      { binding: 2, resource: { buffer: velA } },
      { binding: 3, resource: { buffer: outBuf } },
    ],
  });
  const reduceB = device.createBindGroup({
    layout: reduceLayout,
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: posB } },
      { binding: 2, resource: { buffer: velB } },
      { binding: 3, resource: { buffer: outBuf } },
    ],
  });
  const renderA = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: ruBuf } },
      { binding: 1, resource: { buffer: posA } },
      { binding: 2, resource: { buffer: velA } },
    ],
  });
  const renderB = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: ruBuf } },
      { binding: 1, resource: { buffer: posB } },
      { binding: 2, resource: { buffer: velB } },
    ],
  });

  // ── line index buffer (horizontal + vertical grid segments) ──────────────────
  const hSeg = ROWS * (COLS - 1);
  const vSeg = COLS * (ROWS - 1);
  const indexData = new Uint32Array((hSeg + vSeg) * 2);
  let w = 0;
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS - 1; gx++) {
      indexData[w++] = gy * COLS + gx;
      indexData[w++] = gy * COLS + gx + 1;
    }
  }
  for (let gx = 0; gx < COLS; gx++) {
    for (let gy = 0; gy < ROWS - 1; gy++) {
      indexData[w++] = gy * COLS + gx;
      indexData[w++] = (gy + 1) * COLS + gx;
    }
  }
  const indexBuf = device.createBuffer({
    size: indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuf, 0, indexData);
  const indexCount = indexData.length;

  // ── CPU-side uniform packing ─────────────────────────────────────────────────
  const simData = new ArrayBuffer(SIM_BYTES);
  const simView = new DataView(simData);
  const ruData = new Float32Array(4);

  const writeSim = (dt: number, time: number, pushes: Push[]) => {
    simView.setUint32(0, COLS, true);
    simView.setUint32(4, ROWS, true);
    simView.setUint32(8, COUNT, true);
    const n = Math.min(MAX_PUSH, pushes.length);
    simView.setUint32(12, n, true);
    simView.setFloat32(16, dt, true);
    simView.setFloat32(20, time, true);
    simView.setFloat32(24, 2600.0, true); // springK
    simView.setFloat32(28, 2.3, true); // damping
    simView.setFloat32(32, 60.0, true); // restAnchor
    simView.setFloat32(36, 0.09, true); // ambient
    simView.setFloat32(40, 0.07, true); // pushRadius
    for (let k = 0; k < MAX_PUSH; k++) {
      const base = 48 + k * 16;
      const p = k < n ? pushes[k] : null;
      simView.setFloat32(base, p ? p.x : 0, true);
      simView.setFloat32(base + 4, p ? p.y : 0, true);
      simView.setFloat32(base + 8, p ? p.fx : 0, true);
      simView.setFloat32(base + 12, p ? p.fy : 0, true);
    }
    device.queue.writeBuffer(simBuf, 0, simData);
  };

  const scalars: Scalars = {
    energy: 0,
    centroidY: 0.5,
    balance: 0,
    stretch: 0,
    left: { energy: 0, centroidY: 0.5, stretch: 0 },
    right: { energy: 0, centroidY: 0.5, stretch: 0 },
  };
  let mapInFlight = false;
  let currentIsA = true;

  const integGroups = Math.ceil(COUNT / WG);

  const frame = (dt: number, pushes: Push[], timeSec: number) => {
    if (disposed || deviceLost) return;
    // Stability: integrate with a clamped substep so a long frame cannot explode.
    const sdt = Math.min(dt, 1 / 60) / SUBSTEPS;
    writeSim(sdt, timeSec, pushes);

    const enc = device.createCommandEncoder();

    for (let s = 0; s < SUBSTEPS; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(integPipeline);
      pass.setBindGroup(0, currentIsA ? integAB : integBA);
      pass.dispatchWorkgroups(integGroups);
      pass.end();
      currentIsA = !currentIsA;
    }

    // Reduce the freshly-written field down to the scalars.
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(reducePipeline);
      pass.setBindGroup(0, currentIsA ? reduceA : reduceB);
      pass.dispatchWorkgroups(1);
      pass.end();
    }

    // Render.
    ruData[0] = timeSec;
    ruData[1] = 7.5; // glowScale: node speed → brightness
    device.queue.writeBuffer(ruBuf, 0, ruData);

    const view = context.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.035, g: 0.045, b: 0.055, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, currentIsA ? renderA : renderB);
    rpass.setIndexBuffer(indexBuf, "uint32");
    rpass.drawIndexed(indexCount);
    rpass.end();

    device.queue.submit([enc.finish()]);

    // Kick a readback of the scalars when none is pending (≈1 frame latency).
    if (!mapInFlight) {
      mapInFlight = true;
      const enc2 = device.createCommandEncoder();
      enc2.copyBufferToBuffer(outBuf, 0, readBuf, 0, 32);
      device.queue.submit([enc2.finish()]);
      readBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (disposed) return;
          const a = new Float32Array(readBuf.getMappedRange().slice(0));
          readBuf.unmap();
          // a = [ lke, lyke, lst, rke, ryke, rst ] (per-region)
          const lke = a[0];
          const lyke = a[1];
          const lst = a[2];
          const rke = a[3];
          const ryke = a[4];
          const rst = a[5];
          const ke = lke + rke;
          scalars.energy = ke;
          scalars.centroidY = ke > 1e-6 ? (lyke + ryke) / ke : 0.5;
          scalars.balance = (rke - lke) / (rke + lke + 1e-6);
          scalars.stretch = (lst + rst) / COUNT;
          scalars.left.energy = lke;
          scalars.left.centroidY = lke > 1e-6 ? lyke / lke : 0.5;
          scalars.left.stretch = lst / LEFT_COUNT;
          scalars.right.energy = rke;
          scalars.right.centroidY = rke > 1e-6 ? ryke / rke : 0.5;
          scalars.right.stretch = rst / RIGHT_COUNT;
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
    posA.destroy();
    posB.destroy();
    velA.destroy();
    velB.destroy();
    simBuf.destroy();
    ruBuf.destroy();
    outBuf.destroy();
    indexBuf.destroy();
    try {
      readBuf.destroy();
    } catch {
      /* may be mapped-pending */
    }
    device.destroy();
  };

  return {
    frame,
    scalars,
    resize: () => {
      if (!disposed && !deviceLost) configure();
    },
    dispose,
    backend: "gpu",
  };
}
