/// <reference types="@webgpu/types" />
/**
 * gpu.ts — WebGPU compute-shader living ember renderer.
 *
 * PRIMARY: Gray-Scott reaction-diffusion in a 512×512 ping-pong field.
 *
 *   Texture strategy (universally supported, no extensions needed):
 *   - Each of texA0/A1/B0/B1 has usage: TEXTURE_BINDING | STORAGE_BINDING | COPY_DST
 *   - Compute shader reads via texture_2d<f32> (textureLoad mip 0) — core spec
 *   - Compute shader writes via texture_storage_2d<r32float, write> — core spec
 *   - Render shader reads via texture_2d<f32> (textureLoad mip 0) — core spec
 *   - No storage-texture read access needed (avoids readonly-and-readwrite feature)
 *
 *   Humming → raised feed rate → field blooms with warm Turing fingers.
 *   Long-form drift (from memory.ts) shifts f/k through morphology zones.
 *
 * FALLBACK: Returns null if WebGPU absent/failed. page.tsx shows CSS ember.
 *
 * References:
 *   Pearson, J.E. (1993). Complex patterns in a simple system. Science 261.
 *   Gray & Scott (1983,1984): U/V autocatalytic reaction-diffusion.
 */

const FIELD_SIZE = 512;
const WORKGROUP_SIZE = 16;

// ── WGSL: Gray-Scott reaction-diffusion compute step ─────────────────────────
// Reads from texture_2d<f32> (textureLoad, mip 0) — universally supported.
// Writes to texture_storage_2d<r32float, write> — core WebGPU.
const RD_COMPUTE_WGSL = /* wgsl */ `
struct Uni {
  f         : f32,
  k         : f32,
  dt        : f32,
  humBoost  : f32,
  seedPulse : f32,
  seed      : f32,
  seedX     : f32,
  seedY     : f32,
};

// Read via texture_2d<f32> — textureLoad needs mip level (always 0)
@group(0) @binding(0) var rdReadA  : texture_2d<f32>;
@group(0) @binding(1) var rdReadB  : texture_2d<f32>;
// Write via texture_storage_2d write — core WebGPU, no extension
@group(0) @binding(2) var rdWriteA : texture_storage_2d<r32float, write>;
@group(0) @binding(3) var rdWriteB : texture_storage_2d<r32float, write>;
@group(0) @binding(4) var<uniform> u : Uni;

fn wrapCoord(coord: vec2<i32>) -> vec2<i32> {
  let sz = i32(${FIELD_SIZE});
  return ((coord % vec2<i32>(sz, sz)) + vec2<i32>(sz, sz)) % vec2<i32>(sz, sz);
}

fn sampleU(coord: vec2<i32>) -> f32 {
  return textureLoad(rdReadA, wrapCoord(coord), 0).r;
}

fn sampleV(coord: vec2<i32>) -> f32 {
  return textureLoad(rdReadB, wrapCoord(coord), 0).r;
}

// 9-point weighted Laplacian for better isotropy
fn lapU(p: vec2<i32>) -> f32 {
  return -sampleU(p)
    + 0.20 * sampleU(p + vec2<i32>( 1,  0))
    + 0.20 * sampleU(p + vec2<i32>(-1,  0))
    + 0.20 * sampleU(p + vec2<i32>( 0,  1))
    + 0.20 * sampleU(p + vec2<i32>( 0, -1))
    + 0.05 * sampleU(p + vec2<i32>( 1,  1))
    + 0.05 * sampleU(p + vec2<i32>(-1,  1))
    + 0.05 * sampleU(p + vec2<i32>( 1, -1))
    + 0.05 * sampleU(p + vec2<i32>(-1, -1));
}

fn lapV(p: vec2<i32>) -> f32 {
  return -sampleV(p)
    + 0.20 * sampleV(p + vec2<i32>( 1,  0))
    + 0.20 * sampleV(p + vec2<i32>(-1,  0))
    + 0.20 * sampleV(p + vec2<i32>( 0,  1))
    + 0.20 * sampleV(p + vec2<i32>( 0, -1))
    + 0.05 * sampleV(p + vec2<i32>( 1,  1))
    + 0.05 * sampleV(p + vec2<i32>(-1,  1))
    + 0.05 * sampleV(p + vec2<i32>( 1, -1))
    + 0.05 * sampleV(p + vec2<i32>(-1, -1));
}

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let p   = vec2<i32>(i32(gid.x), i32(gid.y));
  let sz  = i32(${FIELD_SIZE});
  if (p.x >= sz || p.y >= sz) { return; }

  let U   = sampleU(p);
  let V   = sampleV(p);

  // Gray-Scott: dU/dt = Du*∇²U - U*V² + f*(1-U)
  //             dV/dt = Dv*∇²V + U*V² - (f+k)*V
  let Du  = 0.2100;
  let Dv  = 0.1050;
  let f   = u.f + u.humBoost * 0.012; // hum blooms the field
  let k   = u.k;
  let dt  = u.dt;
  let uvv = U * V * V;

  let newU = clamp(U + dt * (Du * lapU(p) - uvv + f * (1.0 - U)), 0.0, 1.0);
  let newV = clamp(V + dt * (Dv * lapV(p) + uvv - (f + k) * V),   0.0, 1.0);

  // Hum seed: inject inhibitor V in a disc, leaving a permanent bloom trace
  if (u.seedPulse > 0.05) {
    let sx    = u.seedX * f32(sz);
    let sy    = u.seedY * f32(sz);
    let dx    = f32(p.x) - sx;
    let dy    = f32(p.y) - sy;
    let dist2 = dx * dx + dy * dy;
    if (dist2 < 64.0) {
      let str = u.seedPulse * (1.0 - dist2 / 64.0);
      textureStore(rdWriteA, p, vec4<f32>(max(0.0, newU - str * 0.25), 0.0, 0.0, 0.0));
      textureStore(rdWriteB, p, vec4<f32>(min(1.0, newV + str * 0.50), 0.0, 0.0, 0.0));
      return;
    }
  }

  textureStore(rdWriteA, p, vec4<f32>(newU, 0.0, 0.0, 0.0));
  textureStore(rdWriteB, p, vec4<f32>(newV, 0.0, 0.0, 0.0));
}
`;

// ── WGSL: Full-screen render (RD field → ember colors) ───────────────────────
// Reads via texture_2d<f32> + textureLoad mip 0 — core WebGPU, no extension.
const RENDER_WGSL = /* wgsl */ `
struct VertOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv        : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VertOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  let p = positions[vi];
  var out: VertOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv  = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@group(0) @binding(0) var rdTexA : texture_2d<f32>;
@group(0) @binding(1) var rdTexB : texture_2d<f32>;

struct RenderUni {
  humBoost : f32,
  bloom    : f32,
  warmth   : f32,
  time     : f32,
};
@group(0) @binding(2) var<uniform> ru : RenderUni;

// Ember palette: deep crimson → amber → gold → soft white core
fn emberColor(t: f32, hum: f32) -> vec3<f32> {
  let crimson = vec3<f32>(0.35, 0.02, 0.01);
  let amber   = vec3<f32>(0.95, 0.38, 0.02);
  let gold    = vec3<f32>(1.00, 0.82, 0.18);
  let white   = vec3<f32>(1.00, 0.97, 0.90);
  var col: vec3<f32>;
  if (t < 0.33) {
    col = mix(crimson, amber, t / 0.33);
  } else if (t < 0.66) {
    col = mix(amber, gold, (t - 0.33) / 0.33);
  } else {
    col = mix(gold, white, (t - 0.66) / 0.34);
  }
  // Extra golden shimmer when child hums
  col = col + vec3<f32>(0.12, 0.08, 0.00) * hum * t;
  return col;
}

@fragment
fn fs(in: VertOut) -> @location(0) vec4<f32> {
  let sz    = i32(${FIELD_SIZE});
  let cx    = clamp(i32(in.uv.x * f32(sz)), 0, sz - 1);
  let cy    = clamp(i32(in.uv.y * f32(sz)), 0, sz - 1);
  let coord = vec2<i32>(cx, cy);

  let V = textureLoad(rdTexB, coord, 0).r;

  // Radial vignette — darkens corners, ember feels centered
  let uv2      = in.uv * 2.0 - vec2<f32>(1.0, 1.0);
  let vignette = 1.0 - clamp(dot(uv2, uv2) * 0.38, 0.0, 0.82);

  // Gentle breathing pulse from bloom
  let breathe    = 0.92 + ru.bloom * 0.08;
  let brightness = clamp(V * 1.5 * breathe * vignette, 0.0, 1.0);

  let col      = emberColor(brightness, ru.humBoost);
  let exposure = 0.12 + ru.warmth * 0.22 + ru.humBoost * 0.15;
  return vec4<f32>(col * exposure * 3.2, 1.0);
}
`;

// ── Initial field data ─────────────────────────────────────────────────────

function buildInitialField(): { ua: Float32Array; ub: Float32Array } {
  const n = FIELD_SIZE * FIELD_SIZE;
  const ua = new Float32Array(n);
  const ub = new Float32Array(n);
  ua.fill(1.0);
  ub.fill(0.0);

  const cx = FIELD_SIZE / 2;
  const cy = FIELD_SIZE / 2;
  const seeds: [number, number, number][] = [
    [cx,       cy,       20],
    [cx - 30,  cy + 20,  12],
    [cx + 35,  cy - 15,  12],
    [cx + 10,  cy + 40,  10],
    [cx - 20,  cy - 35,  10],
  ];

  for (const [sx, sy, r] of seeds) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = Math.floor(sx + dx);
        const py = Math.floor(sy + dy);
        if (px < 0 || px >= FIELD_SIZE || py < 0 || py >= FIELD_SIZE) continue;
        const idx = py * FIELD_SIZE + px;
        ua[idx] = 0.50;
        ub[idx] = 0.25;
      }
    }
  }
  return { ua, ub };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface EmberGpu {
  frame(params: {
    f: number; k: number; humBoost: number;
    bloom: number; warmth: number; seedPulse: number; time: number;
  }): void;
  dispose(): void;
}

export async function buildEmberGpu(
  canvas: HTMLCanvasElement
): Promise<EmberGpu | null> {
  if (!navigator.gpu) return null;

  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const gpuCtx = canvas.getContext("webgpu");
  if (!gpuCtx) { device.destroy(); return null; }
  const ctx: GPUCanvasContext = gpuCtx;

  const format = navigator.gpu.getPreferredCanvasFormat();
  gpuCtx.configure({ device, format, alphaMode: "opaque" });

  // ── Textures ───────────────────────────────────────────────────────────────
  // Both TEXTURE_BINDING (for reads as texture_2d<f32>) and
  // STORAGE_BINDING (for writes as texture_storage_2d<r32float, write>).
  function makeTex(): GPUTexture {
    return device.createTexture({
      size: [FIELD_SIZE, FIELD_SIZE],
      format: "r32float",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
    });
  }

  const texA0 = makeTex();
  const texA1 = makeTex();
  const texB0 = makeTex();
  const texB1 = makeTex();

  const { ua, ub } = buildInitialField();
  const rowBytes = FIELD_SIZE * 4;

  function uploadTex(tex: GPUTexture, data: Float32Array): void {
    device.queue.writeTexture(
      { texture: tex },
      data as unknown as Float32Array<ArrayBuffer>,
      { bytesPerRow: rowBytes, rowsPerImage: FIELD_SIZE },
      [FIELD_SIZE, FIELD_SIZE]
    );
  }

  uploadTex(texA0, ua);
  uploadTex(texA1, ua);
  uploadTex(texB0, ub);
  uploadTex(texB1, ub);

  // ── Uniform buffers ───────────────────────────────────────────────────────
  const computeUniBuf = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniBuf = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Pipelines ─────────────────────────────────────────────────────────────
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: RD_COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex:   { module: renderModule, entryPoint: "vs" },
    fragment: { module: renderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // ── Bind groups ────────────────────────────────────────────────────────────
  // Compute: read0→write1 and read1→write0
  // For the READ bindings we use a plain texture view (texture_2d<f32>).
  // For the WRITE bindings we use a storage texture view (write).

  function makeComputeBG(
    readA: GPUTexture, readB: GPUTexture,
    writeA: GPUTexture, writeB: GPUTexture
  ): GPUBindGroup {
    return device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: readA.createView() },
        { binding: 1, resource: readB.createView() },
        { binding: 2, resource: writeA.createView() },
        { binding: 3, resource: writeB.createView() },
        { binding: 4, resource: { buffer: computeUniBuf } },
      ],
    });
  }

  function makeRenderBG(texA: GPUTexture, texB: GPUTexture): GPUBindGroup {
    return device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texA.createView() },
        { binding: 1, resource: texB.createView() },
        { binding: 2, resource: { buffer: renderUniBuf } },
      ],
    });
  }

  // computeBG0: reads (A0,B0), writes (A1,B1) — after this, output is in (A1,B1)
  // computeBG1: reads (A1,B1), writes (A0,B0) — after this, output is in (A0,B0)
  const computeBG0 = makeComputeBG(texA0, texB0, texA1, texB1);
  const computeBG1 = makeComputeBG(texA1, texB1, texA0, texB0);
  const renderBG0  = makeRenderBG(texA0, texB0);
  const renderBG1  = makeRenderBG(texA1, texB1);

  // ping = 0: current readable output is (A0,B0), next compute reads 0 writes 1 → ping becomes 1
  // ping = 1: current readable output is (A1,B1), next compute reads 1 writes 0 → ping becomes 0
  let ping = 0;

  const wgCount = Math.ceil(FIELD_SIZE / WORKGROUP_SIZE);
  const computeUniData = new Float32Array(8);
  const renderUniData  = new Float32Array(4);

  let seedX = 0.5 + (Math.random() - 0.5) * 0.3;
  let seedY = 0.5 + (Math.random() - 0.5) * 0.3;

  function frame(params: {
    f: number; k: number; humBoost: number;
    bloom: number; warmth: number; seedPulse: number; time: number;
  }): void {
    seedX = Math.max(0.2, Math.min(0.8, seedX + (Math.random() - 0.5) * 0.01));
    seedY = Math.max(0.2, Math.min(0.8, seedY + (Math.random() - 0.5) * 0.01));

    // Run 3 compute steps per render frame
    for (let s = 0; s < 3; s++) {
      computeUniData[0] = params.f;
      computeUniData[1] = params.k;
      computeUniData[2] = 1.0; // dimensionless dt
      computeUniData[3] = params.humBoost;
      computeUniData[4] = s === 0 ? params.seedPulse : 0;
      computeUniData[5] = Math.random();
      computeUniData[6] = seedX;
      computeUniData[7] = seedY;
      device.queue.writeBuffer(computeUniBuf, 0, computeUniData);

      const enc  = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(computePipeline);
      // ping=0 → readable is 0 → compute reads 0, writes 1 → use computeBG0
      // ping=1 → readable is 1 → compute reads 1, writes 0 → use computeBG1
      pass.setBindGroup(0, ping === 0 ? computeBG0 : computeBG1);
      pass.dispatchWorkgroups(wgCount, wgCount);
      pass.end();
      device.queue.submit([enc.finish()]);

      ping ^= 1; // output now lives in the other buffer
    }

    // Render from current output buffer
    renderUniData[0] = params.humBoost;
    renderUniData[1] = params.bloom;
    renderUniData[2] = params.warmth;
    renderUniData[3] = params.time;
    device.queue.writeBuffer(renderUniBuf, 0, renderUniData);

    const enc   = device.createCommandEncoder();
    const rPass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.05, g: 0.02, b: 0.01, a: 1.0 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    rPass.setPipeline(renderPipeline);
    // ping=0 means output is in (A0,B0) → render renderBG0
    // ping=1 means output is in (A1,B1) → render renderBG1
    rPass.setBindGroup(0, ping === 0 ? renderBG0 : renderBG1);
    rPass.draw(6);
    rPass.end();
    device.queue.submit([enc.finish()]);
  }

  function dispose(): void {
    texA0.destroy();
    texA1.destroy();
    texB0.destroy();
    texB1.destroy();
    computeUniBuf.destroy();
    renderUniBuf.destroy();
    device.destroy();
  }

  return { frame, dispose };
}
