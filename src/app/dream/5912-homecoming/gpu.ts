// WebGPU setup for the nebula: a GPGPU compute pipeline advecting a large
// particle buffer, and an additive render pipeline drawing soft-glow billboards.
// End-to-end WebGPU — no Canvas2D on the primary path.

import { COMPUTE_WGSL, RENDER_WGSL } from "./field.wgsl";
import { mulberry32 } from "./rng";

const WG = 64;
const FLOATS_PER_PARTICLE = 8; // pos.vec4 + vel.vec4
const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4;

export type SimParams = {
  dt: number;
  time: number;
  fieldScale: number;
  flowStrength: number;
  inwardPull: number;
  coreRadius: number;
  rimRadius: number;
  swirl: number;
  breath: number;
  deepen: number;
  pointerX: number;
  pointerY: number;
  seed: number;
  count: number;
};

export type GpuCtx = {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  format: GPUTextureFormat;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
  simUniBuf: GPUBuffer;
  camUniBuf: GPUBuffer;
  count: number;
  dispatch: number;
  destroy(): void;
};

// Seed particles on a rim shell with staggered life so respawns never pulse.
function buildInitialParticles(count: number, seed: number): Float32Array<ArrayBuffer> {
  const rng = mulberry32(seed);
  const data = new Float32Array(count * FLOATS_PER_PARTICLE);
  const rim = 9.0;
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const b = (rng() - 0.5) * Math.PI;
    const r = rim * (0.55 + 0.5 * rng());
    const o = i * FLOATS_PER_PARTICLE;
    data[o + 0] = Math.cos(a) * Math.cos(b) * r;
    data[o + 1] = Math.sin(b) * 0.55 * r;
    data[o + 2] = Math.sin(a) * Math.cos(b) * r;
    data[o + 3] = 0.15 + 0.85 * rng(); // life
    // vel starts at zero; w (colour-speed) fills in on first compute step
    data[o + 4] = 0;
    data[o + 5] = 0;
    data[o + 6] = 0;
    data[o + 7] = 0;
  }
  return data;
}

// Choose a particle count adapted to the device's capability.
function chooseCount(adapter: GPUAdapter): number {
  const base = adapter.isFallbackAdapter ? 150_000 : 400_000;
  const maxBind = adapter.limits.maxStorageBufferBindingSize ?? 134_217_728;
  const capByLimit = Math.floor((maxBind / BYTES_PER_PARTICLE) * 0.75);
  const count = Math.min(base, capByLimit);
  return Math.max(WG, Math.floor(count / WG) * WG);
}

export async function buildGpu(canvas: HTMLCanvasElement, seed: number): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format, alphaMode: "opaque" });

  const count = chooseCount(adapter);
  const initial = buildInitialParticles(count, seed);
  const particleBuf = device.createBuffer({
    size: initial.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initial);

  const simUniBuf = device.createBuffer({
    size: 64, // 16 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camUniBuf = device.createBuffer({
    size: 96, // mat4 (64) + 8 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs_main" },
    fragment: {
      module: renderModule,
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
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
      { binding: 1, resource: { buffer: simUniBuf } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: camUniBuf } },
    ],
  });

  let destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    particleBuf.destroy();
    simUniBuf.destroy();
    camUniBuf.destroy();
    device.destroy();
  }

  return {
    device,
    ctx,
    format,
    computePipeline,
    renderPipeline,
    computeBG,
    renderBG,
    simUniBuf,
    camUniBuf,
    count,
    dispatch: Math.ceil(count / WG),
    destroy,
  };
}

export function packSim(p: SimParams): Float32Array<ArrayBuffer> {
  const u = new Float32Array(16);
  u[0] = p.dt;
  u[1] = p.time;
  u[2] = p.fieldScale;
  u[3] = p.flowStrength;
  u[4] = p.inwardPull;
  u[5] = p.coreRadius;
  u[6] = p.rimRadius;
  u[7] = p.swirl;
  u[8] = p.breath;
  u[9] = p.deepen;
  u[10] = p.pointerX;
  u[11] = p.pointerY;
  u[12] = p.seed;
  u[13] = p.count;
  return u;
}

export type CamParams = {
  pointSize: number;
  brightness: number;
  time: number;
  coreGlow: number;
  aspect: number;
  coreRadius: number;
  rimRadius: number;
};

export function packCam(viewProj: Float32Array, c: CamParams): Float32Array<ArrayBuffer> {
  const u = new Float32Array(24);
  u.set(viewProj, 0);
  u[16] = c.pointSize;
  u[17] = c.brightness;
  u[18] = c.time;
  u[19] = c.coreGlow;
  u[20] = c.aspect;
  u[21] = c.coreRadius;
  u[22] = c.rimRadius;
  return u;
}

// ── minimal column-major mat4 helpers (no external math dependency) ──────────
function mul(a: Float32Array, b: Float32Array): Float32Array<ArrayBuffer> {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array<ArrayBuffer> {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function rotY(t: number): Float32Array<ArrayBuffer> {
  const c = Math.cos(t), s = Math.sin(t);
  const m = new Float32Array(16);
  m[0] = c; m[2] = s; m[5] = 1; m[8] = -s; m[10] = c; m[15] = 1;
  return m;
}

function rotX(t: number): Float32Array<ArrayBuffer> {
  const c = Math.cos(t), s = Math.sin(t);
  const m = new Float32Array(16);
  m[0] = 1; m[5] = c; m[6] = s; m[9] = -s; m[10] = c; m[15] = 1;
  return m;
}

function translate(x: number, y: number, z: number): Float32Array<ArrayBuffer> {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

// Slowly orbiting camera; pointer adds a gentle parallax steer.
export function makeViewProj(
  time: number,
  aspect: number,
  pointerX: number,
  pointerY: number,
  camDist: number,
): Float32Array<ArrayBuffer> {
  const angle = time * 0.035 + pointerX * 0.5;
  const tilt = 0.28 + pointerY * 0.25;
  const view = mul(translate(0, 0, -camDist), mul(rotX(tilt), rotY(angle)));
  const proj = perspective((52 * Math.PI) / 180, aspect, 0.1, 200);
  return mul(proj, view);
}
