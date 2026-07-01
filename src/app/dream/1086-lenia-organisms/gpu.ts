// ─────────────────────────────────────────────────────────────────────────────
// gpu.ts — the Lenia simulation on WebGPU (WGSL compute).
//
//   The field A lives in two ping-pong storage buffers of f32. Each frame:
//     1. `leniaStep` compute pass reads src, does the direct ring-kernel
//        convolution + Gaussian growth + integrate, writes dst.
//     2. `render` pass samples the field into a full-screen quad, colouring it
//        luminous-organism style (indigo void → teal → gold by local mass).
//     3. periodically a `reduce` pass shrinks the field into a small readback
//        buffer so the CPU can compute cheap global summaries for the audio,
//        without stalling the GPU.
//
//   The kernel weights are uploaded as a storage buffer (built by lenia.ts, the
//   exact same kernel the CPU fallback uses). Seeds (taps) are applied by a tiny
//   `seed` compute pass so we never read the whole field back to add a blob.
//
//   `@webgpu/types` is not a dependency in this repo, so the minimal WebGPU
//   surface this file uses is declared locally below (no `any`, no ts-ignore).
// ─────────────────────────────────────────────────────────────────────────────

import { type Regime, type Kernel, buildKernel, type FieldStats } from "./lenia";

// ── Minimal local WebGPU typings (only what this file touches) ───────────────
// Declared locally because @webgpu/types isn't installed. Kept narrow on
// purpose; casts are localized to the entry points.
interface GpuBufferLike {
  destroy(): void;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  mapAsync(mode: number): Promise<void>;
}
interface GpuQueueLike {
  writeBuffer(b: GpuBufferLike, offset: number, data: ArrayBufferView | ArrayBuffer): void;
  submit(buffers: unknown[]): void;
}
interface GpuBindGroupLike {
  readonly __bg?: never;
}
interface GpuPipelineLike {
  getBindGroupLayout(i: number): unknown;
}
interface GpuPassLike {
  setPipeline(p: GpuPipelineLike): void;
  setBindGroup(i: number, bg: GpuBindGroupLike): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  draw(count: number): void;
  end(): void;
}
interface GpuEncoderLike {
  beginComputePass(): GpuPassLike;
  beginRenderPass(desc: unknown): GpuPassLike;
  copyBufferToBuffer(
    src: GpuBufferLike,
    srcOff: number,
    dst: GpuBufferLike,
    dstOff: number,
    size: number,
  ): void;
  finish(): unknown;
}
interface GpuDeviceLike {
  createBuffer(desc: { size: number; usage: number; mappedAtCreation?: boolean }): GpuBufferLike;
  createShaderModule(desc: { code: string }): unknown;
  createComputePipeline(desc: unknown): GpuPipelineLike;
  createRenderPipeline(desc: unknown): GpuPipelineLike;
  createBindGroup(desc: unknown): GpuBindGroupLike;
  createCommandEncoder(): GpuEncoderLike;
  queue: GpuQueueLike;
}
interface GpuContextLike {
  configure(desc: unknown): void;
  getCurrentTexture(): { createView(): unknown };
}
interface GpuAdapterLike {
  requestDevice(): Promise<GpuDeviceLike>;
}
interface GpuNavLike {
  requestAdapter(): Promise<GpuAdapterLike | null>;
  getPreferredCanvasFormat(): string;
}

// GPUBufferUsage / GPUMapMode flags (stable numeric constants from the spec).
const USAGE = {
  STORAGE: 0x0080,
  UNIFORM: 0x0040,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  MAP_READ: 0x0001,
} as const;
const MAP_READ_MODE = 0x0001;

// ── Public handle ─────────────────────────────────────────────────────────────
export interface GpuLenia {
  readonly size: number;
  step(): void;
  render(): void;
  /** Seed a gaussian blob of living matter at normalized (nx, ny). */
  seed(nx: number, ny: number, radius: number, amp: number): void;
  /** Swap to a different growth regime (rebuilds kernel buffer). */
  setRegime(reg: Regime): void;
  /** Zero the field (both ping-pong buffers). */
  clear(): void;
  /** Kick off an async readback; resolves with stats or null if none ready. */
  sampleStats(): Promise<FieldStats | null>;
  destroy(): void;
}

const READ = 48; // reduced-field side used for cheap stats readback

// ── WGSL ──────────────────────────────────────────────────────────────────────
const STEP_WGSL = /* wgsl */ `
struct Params {
  size : u32,
  R : u32,
  mu : f32,
  sigma : f32,
  dt : f32,
  _pad0 : u32, _pad1 : u32, _pad2 : u32,
};
@group(0) @binding(0) var<storage, read> src : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst : array<f32>;
@group(0) @binding(2) var<storage, read> kern : array<f32>;
@group(0) @binding(3) var<uniform> p : Params;

fn wrap(v : i32, n : i32) -> i32 {
  return ((v % n) + n) % n;
}

@compute @workgroup_size(8, 8)
fn leniaStep(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(p.size);
  if (i32(gid.x) >= n || i32(gid.y) >= n) { return; }
  let R = i32(p.R);
  let side = 2 * R + 1;
  var u : f32 = 0.0;
  for (var ky = 0; ky < side; ky = ky + 1) {
    let sy = wrap(i32(gid.y) + ky - R, n);
    let rowA = sy * n;
    let rowK = ky * side;
    for (var kx = 0; kx < side; kx = kx + 1) {
      let sx = wrap(i32(gid.x) + kx - R, n);
      u = u + src[rowA + sx] * kern[rowK + kx];
    }
  }
  let d = (u - p.mu) / p.sigma;
  let g = 2.0 * exp(-0.5 * d * d) - 1.0;
  let idx = i32(gid.y) * n + i32(gid.x);
  var a = src[idx] + p.dt * g;
  a = clamp(a, 0.0, 1.0);
  dst[idx] = a;
}
`;

const SEED_WGSL = /* wgsl */ `
struct Seed { cx : f32, cy : f32, rad : f32, amp : f32, size : f32, _p0 : f32, _p1 : f32, _p2 : f32, };
@group(0) @binding(0) var<storage, read_write> field : array<f32>;
@group(0) @binding(1) var<uniform> s : Seed;
@compute @workgroup_size(8, 8)
fn seed(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = u32(s.size);
  if (gid.x >= n || gid.y >= n) { return; }
  let dx = f32(gid.x) - s.cx;
  let dy = f32(gid.y) - s.cy;
  let d2 = (dx * dx + dy * dy) / (s.rad * s.rad);
  let add = s.amp * exp(-0.5 * d2);
  let idx = gid.y * n + gid.x;
  field[idx] = clamp(field[idx] + add, 0.0, 1.0);
}
`;

const REDUCE_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> src : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst : array<f32>;
override FIELD : u32 = 256u;
override READ : u32 = 48u;
@compute @workgroup_size(8, 8)
fn reduce(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= READ || gid.y >= READ) { return; }
  let block = FIELD / READ;
  var acc = 0.0;
  var cnt = 0.0;
  for (var by = 0u; by < block; by = by + 1u) {
    for (var bx = 0u; bx < block; bx = bx + 1u) {
      let sx = gid.x * block + bx;
      let sy = gid.y * block + by;
      acc = acc + src[sy * FIELD + sx];
      cnt = cnt + 1.0;
    }
  }
  dst[gid.y * READ + gid.x] = acc / cnt;
}
`;

const RENDER_WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> field : array<f32>;
struct U { size : u32, _p0 : u32, _p1 : u32, _p2 : u32, };
@group(0) @binding(1) var<uniform> u : U;

struct VSOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32>, };
@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -3.0), vec2<f32>(-1.0, 1.0), vec2<f32>(3.0, 1.0));
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

fn palette(a : f32) -> vec3<f32> {
  // deep indigo void → teal → gold as local mass rises
  let void_c = vec3<f32>(0.03, 0.02, 0.09);
  let teal = vec3<f32>(0.10, 0.72, 0.68);
  let gold = vec3<f32>(1.0, 0.80, 0.35);
  let t = clamp(a, 0.0, 1.0);
  var c = mix(void_c, teal, smoothstep(0.03, 0.45, t));
  c = mix(c, gold, smoothstep(0.5, 0.95, t));
  // subtle inner glow
  c = c + teal * 0.12 * smoothstep(0.15, 0.6, t);
  return c;
}

@fragment
fn fs(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
  let n = i32(u.size);
  let fx = clamp(uv.x, 0.0, 0.9999) * f32(n);
  let fy = clamp(uv.y, 0.0, 0.9999) * f32(n);
  // bilinear sample for a smooth organism look
  let x0 = i32(fx); let y0 = i32(fy);
  let x1 = min(x0 + 1, n - 1); let y1 = min(y0 + 1, n - 1);
  let tx = fx - f32(x0); let ty = fy - f32(y0);
  let a00 = field[y0 * n + x0]; let a10 = field[y0 * n + x1];
  let a01 = field[y1 * n + x0]; let a11 = field[y1 * n + x1];
  let a = mix(mix(a00, a10, tx), mix(a01, a11, tx), ty);
  return vec4<f32>(palette(a), 1.0);
}
`;

function packKernel(k: Kernel): Float32Array {
  return k.data;
}

export async function buildGpu(
  canvas: HTMLCanvasElement,
  size: number,
  reg: Regime,
): Promise<GpuLenia | null> {
  const gpuNav = (navigator as unknown as { gpu?: GpuNavLike }).gpu;
  if (!gpuNav) return null;
  const adapter = await gpuNav.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();

  const ctx = canvas.getContext("webgpu") as unknown as GpuContextLike | null;
  if (!ctx) return null;
  const fmt = gpuNav.getPreferredCanvasFormat();
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const cells = size * size;

  const mkField = () =>
    device.createBuffer({
      size: cells * 4,
      usage: USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST,
    });
  let fieldA = mkField();
  let fieldB = mkField();

  let kernel = buildKernel(reg);
  const kernelBuf = device.createBuffer({
    size: Math.max(4, kernel.data.length * 4),
    usage: USAGE.STORAGE | USAGE.COPY_DST,
  });
  device.queue.writeBuffer(kernelBuf, 0, packKernel(kernel));

  // params uniform: size(u32) R(u32) mu(f32) sigma(f32) dt(f32) + 3 pad = 8*4
  const paramsBuf = device.createBuffer({
    size: 8 * 4,
    usage: USAGE.UNIFORM | USAGE.COPY_DST,
  });
  const writeParams = (r: Regime, k: Kernel) => {
    const ab = new ArrayBuffer(8 * 4);
    const u32 = new Uint32Array(ab);
    const f32 = new Float32Array(ab);
    u32[0] = size;
    u32[1] = k.R;
    f32[2] = r.mu;
    f32[3] = r.sigma;
    f32[4] = r.dt;
    device.queue.writeBuffer(paramsBuf, 0, ab);
  };
  writeParams(reg, kernel);

  const seedBuf = device.createBuffer({
    size: 8 * 4,
    usage: USAGE.UNIFORM | USAGE.COPY_DST,
  });
  const renderUBuf = device.createBuffer({
    size: 4 * 4,
    usage: USAGE.UNIFORM | USAGE.COPY_DST,
  });
  {
    const ab = new ArrayBuffer(4 * 4);
    new Uint32Array(ab)[0] = size;
    device.queue.writeBuffer(renderUBuf, 0, ab);
  }

  // reduced readback buffers
  const reducedBuf = device.createBuffer({
    size: READ * READ * 4,
    usage: USAGE.STORAGE | USAGE.COPY_SRC,
  });
  const mapBuf = device.createBuffer({
    size: READ * READ * 4,
    usage: USAGE.MAP_READ | USAGE.COPY_DST,
  });

  // pipelines
  const stepPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: STEP_WGSL }), entryPoint: "leniaStep" },
  });
  const seedPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: SEED_WGSL }), entryPoint: "seed" },
  });
  const reducePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: REDUCE_WGSL }),
      entryPoint: "reduce",
      constants: { FIELD: size, READ },
    },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: { module: renderMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const stepBind = (from: GpuBufferLike, to: GpuBufferLike) =>
    device.createBindGroup({
      layout: stepPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: from } },
        { binding: 1, resource: { buffer: to } },
        { binding: 2, resource: { buffer: kernelBuf } },
        { binding: 3, resource: { buffer: paramsBuf } },
      ],
    });

  let mapPending = false;
  let prevReduced: Float32Array | null = null;
  let disposed = false;

  const wg = Math.ceil(size / 8);

  const handle: GpuLenia = {
    size,
    step() {
      if (disposed) return;
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPl);
      pass.setBindGroup(0, stepBind(fieldA, fieldB));
      pass.dispatchWorkgroups(wg, wg);
      pass.end();
      device.queue.submit([enc.finish()]);
      const t = fieldA;
      fieldA = fieldB;
      fieldB = t;
    },
    render() {
      if (disposed) return;
      const bind = device.createBindGroup({
        layout: renderPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: fieldA } },
          { binding: 1, resource: { buffer: renderUBuf } },
        ],
      });
      const enc = device.createCommandEncoder();
      const view = ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0.02, g: 0.015, b: 0.06, a: 1 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bind);
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    seed(nx, ny, radius, amp) {
      if (disposed) return;
      const ab = new ArrayBuffer(8 * 4);
      const f = new Float32Array(ab);
      f[0] = nx * size;
      f[1] = ny * size;
      f[2] = Math.max(1, radius * size);
      f[3] = amp;
      f[4] = size;
      device.queue.writeBuffer(seedBuf, 0, ab);
      const bind = device.createBindGroup({
        layout: seedPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: fieldA } },
          { binding: 1, resource: { buffer: seedBuf } },
        ],
      });
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(seedPl);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(wg, wg);
      pass.end();
      device.queue.submit([enc.finish()]);
    },
    setRegime(r) {
      if (disposed) return;
      kernel = buildKernel(r);
      device.queue.writeBuffer(kernelBuf, 0, packKernel(kernel));
      writeParams(r, kernel);
    },
    clear() {
      if (disposed) return;
      const zeros = new Float32Array(cells);
      device.queue.writeBuffer(fieldA, 0, zeros);
      device.queue.writeBuffer(fieldB, 0, zeros);
    },
    async sampleStats() {
      if (disposed || mapPending) return null;
      mapPending = true;
      const enc = device.createCommandEncoder();
      const rbind = device.createBindGroup({
        layout: reducePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: fieldA } },
          { binding: 1, resource: { buffer: reducedBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(reducePl);
      pass.setBindGroup(0, rbind);
      pass.dispatchWorkgroups(Math.ceil(READ / 8), Math.ceil(READ / 8));
      pass.end();
      enc.copyBufferToBuffer(reducedBuf, 0, mapBuf, 0, READ * READ * 4);
      device.queue.submit([enc.finish()]);
      try {
        await mapBuf.mapAsync(MAP_READ_MODE);
      } catch {
        mapPending = false;
        return null;
      }
      const arr = new Float32Array(mapBuf.getMappedRange().slice(0));
      mapBuf.unmap();
      mapPending = false;
      const stats = reduceStats(arr, READ, prevReduced);
      prevReduced = arr;
      return stats;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      fieldA.destroy();
      fieldB.destroy();
      kernelBuf.destroy();
      paramsBuf.destroy();
      seedBuf.destroy();
      renderUBuf.destroy();
      reducedBuf.destroy();
      mapBuf.destroy();
    },
  };
  return handle;
}

/** Turn the small reduced field into the same FieldStats the CPU path emits. */
function reduceStats(a: Float32Array, side: number, prev: Float32Array | null): FieldStats {
  let mass = 0;
  let mx = 0;
  let my = 0;
  let motion = 0;
  let activity = 0;
  const n = side * side;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      const v = a[i];
      mass += v;
      mx += v * x;
      my += v * y;
      if (prev) motion += Math.abs(v - prev[i]);
      if (v > 0.35) activity += 1;
    }
  }
  const total = mass > 1e-6 ? mass : 1e-6;
  return {
    mass: mass / n,
    centroidX: mx / total / side,
    centroidY: my / total / side,
    motion: prev ? motion / n : 0,
    activity: activity / n,
  };
}
