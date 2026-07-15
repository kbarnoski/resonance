// ─────────────────────────────────────────────────────────────────────────────
// 1740-breath-nebula — WebGPU compute + render core.
//
// A persistent GPU particle storage buffer (hundreds of thousands of points) is
// advected each frame by a WGSL compute shader through a 3-D curl-noise flow
// field plus a signed breath radial force, then drawn additively as soft points
// by a render pipeline that reads the same buffer. createNebulaRenderer() throws
// a typed WebGPUUnsupportedError the page catches to degrade gracefully.
//
// Determinism: the only randomness is the initial particle seeding, done in JS
// with a fixed-seed mulberry32 PRNG (never Math.random). Everything the GPU does
// afterwards is a pure function of position + the time/breath uniforms.
// ─────────────────────────────────────────────────────────────────────────────

import { advectWGSL, renderWGSL, PARTICLE_FLOATS, WORKGROUP } from "./nebula.wgsl";

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

/** Per-frame drive from the breath signal + deterministic clock. */
export interface NebulaFrame {
  /** Absolute animation time (s) — deterministic (frame / 60). */
  timeSec: number;
  /** Signed breath radial force: >0 inhale (outward), <0 exhale (inward). */
  radialForce: number;
  /** Smoothed breath amplitude 0..1 (drives brightness / emitter swell). */
  breathAmp: number;
  /** Camera auto-orbit angle (rad), deterministic. */
  orbitAngle: number;
  /** Slow reduced-motion downgrade of bloom / motion when true. */
  reduced: boolean;
}

export interface NebulaRenderer {
  frame(f: NebulaFrame): void;
  resize(): void;
  dispose(): void;
  readonly count: number;
}

// ── Fixed-seed PRNG (mulberry32) — seeds particle spawn, no Math.random ───────
function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Minimal column-major mat4 helpers (WebGPU NDC z in [0,1]) ─────────────────
type Mat4 = Float32Array;

function makePerspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  // column-major
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ]);
}

function makeLookAt(eye: [number, number, number], center: [number, number, number]): Mat4 {
  const up: [number, number, number] = [0, 1, 0];
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  // column-major view matrix
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function multiply(a: Mat4, b: Mat4): Mat4 {
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

const SIM_BYTES = 48; // 12 × 4-byte scalars (see Sim struct in advectWGSL)
const CAM_BYTES = 80; // mat4 (64) + 4 × f32 (16)
const EMITTER_RADIUS = 1.35;
const BOUND_RADIUS = 3.6;
const MAX_AGE = 9.0;

interface CreateOpts {
  reducedMotion?: boolean;
}

export async function createNebulaRenderer(
  canvas: HTMLCanvasElement,
  opts: CreateOpts = {},
): Promise<NebulaRenderer> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new WebGPUUnsupportedError("navigator.gpu is unavailable");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
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
    throw new WebGPUUnsupportedError("could not acquire a webgpu canvas context");
  }
  const format = navigator.gpu.getPreferredCanvasFormat();

  // ── Adaptive particle count ────────────────────────────────────────────────
  // Target ~500k on a capable GPU, down to ~150k for reduced-motion / weaker
  // devices, clamped to the adapter's storage-buffer budget.
  const target = opts.reducedMotion ? 150_000 : 500_000;
  const maxByBuffer = Math.floor(
    (adapter.limits.maxStorageBufferBindingSize ?? 134_217_728) / (PARTICLE_FLOATS * 4),
  );
  const count = Math.max(50_000, Math.min(target, maxByBuffer, 1_000_000));

  let disposed = false;
  device.lost.then((info) => {
    if (!disposed && info.reason !== "destroyed") {
      console.warn("[breath-nebula] WebGPU device lost:", info.message);
    }
  });

  // ── Particle storage buffer, seeded on a shell with mulberry32 ─────────────
  const particleBytes = count * PARTICLE_FLOATS * 4;
  const particleBuf = device.createBuffer({
    size: particleBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const init = new Float32Array(count * PARTICLE_FLOATS);
  const rnd = makeMulberry32(0x9e3779b1);
  for (let i = 0; i < count; i++) {
    const u = rnd();
    const v = rnd();
    const w = rnd();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const r = EMITTER_RADIUS * (0.55 + 0.5 * w);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.cos(phi);
    const dz = Math.sin(phi) * Math.sin(theta);
    const o = i * PARTICLE_FLOATS;
    init[o + 0] = dx * r;         // pos.x
    init[o + 1] = dy * r;         // pos.y
    init[o + 2] = dz * r;         // pos.z
    init[o + 3] = rnd() * MAX_AGE; // age — staggered so respawns spread out
    init[o + 4] = dx * 0.05;      // vel.x
    init[o + 5] = dy * 0.05;      // vel.y
    init[o + 6] = dz * 0.05;      // vel.z
    init[o + 7] = rnd();          // seed 0..1
  }
  device.queue.writeBuffer(particleBuf, 0, init);

  // ── Uniform buffers ────────────────────────────────────────────────────────
  const simBuf = device.createBuffer({
    size: SIM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const camBuf = device.createBuffer({
    size: CAM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const simData = new ArrayBuffer(SIM_BYTES);
  const simView = new DataView(simData);
  const camData = new ArrayBuffer(CAM_BYTES);
  const camF32 = new Float32Array(camData);

  // ── Compute pipeline ───────────────────────────────────────────────────────
  const computeModule = device.createShaderModule({ code: advectWGSL });
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
    compute: { module: computeModule, entryPoint: "main" },
  });
  const computeBind = device.createBindGroup({
    layout: computeLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: simBuf } },
    ],
  });

  // ── Render pipeline ────────────────────────────────────────────────────────
  const renderModule = device.createShaderModule({ code: renderWGSL });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
    ],
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
    primitive: { topology: "triangle-list" },
  });
  const renderBind = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: camBuf } },
    ],
  });

  let pxW = 1;
  let pxH = 1;
  const configure = () => {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    pxW = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    pxH = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = pxW;
    canvas.height = pxH;
    context.configure({ device, format, alphaMode: "opaque" });
  };
  configure();

  const workgroups = Math.ceil(count / WORKGROUP);

  const frame = (f: NebulaFrame) => {
    if (disposed) return;
    const aspect = pxW / Math.max(1, pxH);
    const dt = 1 / 60;

    // ── Sim uniform ──────────────────────────────────────────────────────────
    const flowStrength = f.reduced ? 0.5 : 0.9;
    const swirl = f.reduced ? 0.05 : 0.12;
    const emitter = EMITTER_RADIUS * (0.9 + 0.25 * f.breathAmp);
    simView.setUint32(0, count, true);
    simView.setFloat32(4, f.timeSec, true);
    simView.setFloat32(8, dt, true);
    simView.setFloat32(12, f.radialForce, true);
    simView.setFloat32(16, 0.9, true);            // flowScale
    simView.setFloat32(20, flowStrength, true);
    simView.setFloat32(24, emitter, true);
    simView.setFloat32(28, MAX_AGE, true);
    simView.setFloat32(32, f.breathAmp, true);
    simView.setFloat32(36, 0.992, true);          // damping
    simView.setFloat32(40, BOUND_RADIUS, true);
    simView.setFloat32(44, swirl, true);
    device.queue.writeBuffer(simBuf, 0, simData);

    // ── Camera uniform (auto-orbit) ──────────────────────────────────────────
    const radius = 5.4;
    const eye: [number, number, number] = [
      Math.cos(f.orbitAngle) * radius,
      1.1 + Math.sin(f.orbitAngle * 0.5) * 0.6,
      Math.sin(f.orbitAngle) * radius,
    ];
    const view = makeLookAt(eye, [0, 0, 0]);
    const proj = makePerspective((55 * Math.PI) / 180, aspect, 0.1, 100);
    const viewProj = multiply(proj, view);
    camF32.set(viewProj, 0);
    camF32[16] = 0.006;                                   // pointSize
    camF32[17] = f.reduced ? 0.7 : 1.0;                  // brightness
    camF32[18] = f.breathAmp;
    camF32[19] = aspect;
    device.queue.writeBuffer(camBuf, 0, camData);

    // ── Encode compute + render ──────────────────────────────────────────────
    const encoder = device.createCommandEncoder();
    const cpass = encoder.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBind);
    cpass.dispatchWorkgroups(workgroups);
    cpass.end();

    const rpass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.015, g: 0.008, b: 0.045, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBind);
    rpass.draw(6, count);
    rpass.end();

    device.queue.submit([encoder.finish()]);
  };

  return {
    frame,
    resize: configure,
    count,
    dispose() {
      disposed = true;
      device.destroy();
    },
  };
}
