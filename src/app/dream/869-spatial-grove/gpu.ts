// gpu.ts — WebGPU compute particle field rendering the grove's canopies.
//
// Tens of thousands of glow particles are clustered into TREE_COUNT canopies at
// the trees' fixed world positions. A WGSL @compute pass each frame swirls every
// particle around its home tree (slow turbulent drift) and pulls it toward that
// tree's live bloom/brightness — so when the listener walks near a tree, its
// canopy brightens and blooms. A WGSL render pass draws particles as additive
// glow point-quads, dusk palette indigo → violet → warm-gold.
//
// No three.js: the WGSL and the camera matrix are hand-written.

import { TREE_COUNT } from "./audio";

export const PARTICLES_PER_TREE = 2600;
export const PARTICLE_COUNT = TREE_COUNT * PARTICLES_PER_TREE;
const WG = 64;

// Per-tree uniform block packed into a storage buffer the shaders read:
//   pos.xyz + canopyRadius (w) ; col.xyz (hue→rgb) + glow (w)
export const TREE_STRIDE_FLOATS = 8; // 2 × vec4
export const TREE_BUFFER_FLOATS = TREE_COUNT * TREE_STRIDE_FLOATS;

// ── compute shader ───────────────────────────────────────────────────────────
// Particle = { pos: vec4f (xyz + treeIndex in w), vel: vec4f (xyz + seed in w) }.
const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f }
struct Tree { posR: vec4f, colGlow: vec4f } // xyz+radius , rgb+glow

struct U { dt: f32, time: f32, count: f32, pad: f32 }

@group(0) @binding(0) var<storage, read_write> ps: array<Particle>;
@group(0) @binding(1) var<storage, read> trees: array<Tree>;
@group(0) @binding(2) var<uniform> u: U;

fn hash3(p: vec3f) -> vec3f {
  let q = vec3f(
    dot(p, vec3f(127.1, 311.7, 74.7)),
    dot(p, vec3f(269.5, 183.3, 246.1)),
    dot(p, vec3f(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453123) * 2.0 - 1.0;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }
  var pos = ps[i].pos.xyz;
  var vel = ps[i].vel.xyz;
  let ti = u32(ps[i].pos.w);
  let seed = ps[i].vel.w;
  let dt = u.dt;

  let tree = trees[ti];
  let home = tree.posR.xyz;
  let radius = tree.posR.w;
  let glow = tree.colGlow.w;

  // local offset from the tree centre
  let off = pos - home;
  let r = length(off) + 1e-4;

  // slow turbulent swirl around the canopy (gives the living-leaf shimmer)
  let t = u.time * 0.25 + seed * 6.2831;
  let swirl = vec3f(
    sin(off.y * 1.6 + t),
    sin(off.z * 1.5 - t * 0.9),
    sin(off.x * 1.7 + t * 1.1)
  ) * (0.15 + glow * 0.5);

  // keep the canopy roughly spherical: pull back when too far, push out when collapsing
  let targetR = radius * (0.55 + glow * 0.55);
  let dir = off / r;
  let restore = dir * (targetR - r) * 1.4;

  // a gentle upward lift so canopies feel like trees, not clouds
  let lift = vec3f(0.0, 0.08, 0.0) * (1.0 - smoothstep(targetR * 0.8, targetR * 1.3, r));

  let force = swirl + restore + lift;
  vel = vel + force * dt;
  vel = vel * 0.90; // damping → memory
  pos = pos + vel * dt;

  ps[i].pos = vec4f(pos, f32(ti));
  ps[i].vel = vec4f(vel, seed);
}`;

// ── vertex shader ────────────────────────────────────────────────────────────
const VERT_WGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f }
struct Tree { posR: vec4f, colGlow: vec4f }
struct VU { mvp: mat4x4f, size: f32, pad0: f32, pad1: f32, pad2: f32 }

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) glow: f32,
}

@group(0) @binding(0) var<storage, read> ps: array<Particle>;
@group(0) @binding(1) var<storage, read> trees: array<Tree>;
@group(0) @binding(2) var<uniform> u: VU;

const OFF = array<vec2f, 6>(
  vec2f(-0.5,-0.5), vec2f(0.5,-0.5), vec2f(-0.5,0.5),
  vec2f(-0.5,0.5),  vec2f(0.5,-0.5), vec2f(0.5,0.5)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let p = ps[pi];
  let ti = u32(p.pos.w);
  let tree = trees[ti];
  let cl = u.mvp * vec4f(p.pos.xyz, 1.0);
  let o = OFF[ci];
  let sz = u.size * (0.6 + tree.colGlow.w * 0.9) * cl.w;
  var vo: VO;
  vo.pos = cl + vec4f(o.x * sz, o.y * sz, 0.0, 0.0);
  vo.uv = o + 0.5;
  vo.col = tree.colGlow.xyz;
  vo.glow = tree.colGlow.w;
  return vo;
}`;

// ── fragment shader — dusk palette (indigo→violet→warm gold) ─────────────────
const FRAG_WGSL = /* wgsl */ `
@fragment fn main(
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) glow: f32
) -> @location(0) vec4f {
  let d = length(uv - 0.5);
  if (d > 0.5) { discard; }
  let g = 1.0 - smoothstep(0.04, 0.5, d);
  let a = g * (0.07 + glow * 0.30);
  // brighter canopies tip toward warm gold at the core
  let warm = mix(col, vec3f(1.0, 0.82, 0.5), glow * g * 0.6);
  return vec4f(warm * a, a);
}`;

// hue (0..1) → dusk rgb: indigo → violet → warm gold
export function hueToRgb(h: number): [number, number, number] {
  const c0 = [0.14, 0.1, 0.42]; // deep indigo
  const c1 = [0.45, 0.2, 0.78]; // violet
  const c2 = [1.0, 0.78, 0.45]; // warm gold
  const t = Math.max(0, Math.min(1, h));
  if (t < 0.5) {
    const k = t / 0.5;
    return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
  }
  const k = (t - 0.5) / 0.5;
  return [c1[0] + (c2[0] - c1[0]) * k, c1[1] + (c2[1] - c1[1]) * k, c1[2] + (c2[2] - c1[2]) * k];
}

// ── initial particle field: clusters around each tree ────────────────────────
function buildInitialParticles(
  trees: { x: number; y: number; z: number }[],
): Float32Array {
  const data = new Float32Array(PARTICLE_COUNT * 8);
  let n = 0;
  for (let ti = 0; ti < trees.length; ti++) {
    const T = trees[ti];
    for (let k = 0; k < PARTICLES_PER_TREE; k++) {
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const rad = Math.pow(Math.random(), 0.5) * 1.5;
      const x = T.x + rad * Math.sin(phi) * Math.cos(theta);
      const y = T.y + 0.9 + rad * Math.sin(phi) * Math.sin(theta) * 1.1;
      const z = T.z + rad * Math.cos(phi);
      const o = n * 8;
      data[o] = x;
      data[o + 1] = y;
      data[o + 2] = z;
      data[o + 3] = ti; // tree index in w
      data[o + 4] = 0;
      data[o + 5] = 0;
      data[o + 6] = 0;
      data[o + 7] = Math.random(); // seed in vel.w
      n++;
    }
  }
  return data;
}

// ── camera / MVP (column-major, WebGPU depth [0,1]) ──────────────────────────
// First-person-ish: eye sits at the listener, looking into the grove (-z), tilted
// slightly up at the canopies.
export function buildMvp(lx: number, lz: number, aspect: number): Float32Array {
  const fov = 62 * (Math.PI / 180);
  const f = 1 / Math.tan(fov / 2);
  const nr = 0.05;
  const fr = 60.0;
  const A = fr / (nr - fr);
  const B = (nr * fr) / (nr - fr);
  const P = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, A, -1, 0, 0, B, 0]);

  // eye at listener, lifted to head height; look toward grove centre.
  const ex = lx;
  const ey = 1.5;
  const ez = lz + 0.2;
  // target: a point ahead and slightly up into the canopies
  const tx = lx * 0.4;
  const ty = 1.9;
  const tz = lz - 6.0;
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward × up(0,1,0)
  let rx = fy * 0 - fz * 1;
  let ry = fz * 0 - fx * 0;
  let rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  // up = right × forward
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const tX = -(rx * ex + ry * ey + rz * ez);
  const tY = -(ux * ex + uy * ey + uz * ez);
  const tZ = fx * ex + fy * ey + fz * ez;
  const V = new Float32Array([rx, ux, -fx, 0, ry, uy, -fy, 0, rz, uz, -fz, 0, tX, tY, tZ, 1]);

  const M = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let rr = 0; rr < 4; rr++) {
      let s = 0;
      for (let kk = 0; kk < 4; kk++) s += P[kk * 4 + rr] * V[c * 4 + kk];
      M[c * 4 + rr] = s;
    }
  }
  return M;
}

// ── GPU context ──────────────────────────────────────────────────────────────
export interface GpuCtx {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  particleBuf: GPUBuffer;
  treeBuf: GPUBuffer;
  computeUniBuf: GPUBuffer;
  renderUniBuf: GPUBuffer;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
  destroy(): void;
}

export async function buildGpu(
  canvas: HTMLCanvasElement,
  trees: { x: number; y: number; z: number }[],
): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const initialData = buildInitialParticles(trees);
  const particleBuf = device.createBuffer({
    size: initialData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initialData.buffer);

  const treeBuf = device.createBuffer({
    size: TREE_BUFFER_FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const computeUniBuf = device.createBuffer({
    size: 16, // dt,time,count,pad
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniBuf = device.createBuffer({
    size: 80, // mat4 (64) + size + pad×3
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: VERT_WGSL }), entryPoint: "main" },
    fragment: {
      module: device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "main",
      targets: [
        {
          format: fmt,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: treeBuf } },
      { binding: 2, resource: { buffer: computeUniBuf } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: treeBuf } },
      { binding: 2, resource: { buffer: renderUniBuf } },
    ],
  });

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    particleBuf.destroy();
    treeBuf.destroy();
    computeUniBuf.destroy();
    renderUniBuf.destroy();
    device.destroy();
  }

  return {
    device,
    ctx,
    computePipeline,
    renderPipeline,
    particleBuf,
    treeBuf,
    computeUniBuf,
    renderUniBuf,
    computeBG,
    renderBG,
    destroy,
  };
}

export const WORKGROUP_DISPATCH = Math.ceil(PARTICLE_COUNT / WG);
