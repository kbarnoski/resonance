// ─────────────────────────────────────────────────────────────────────────────
// 1348-prism-cortex — WebGPU compute core.
//
// This is the lab's first WGSL *compute-shader* piece. The render substrate is
// the deliverable, not just the look:
//
//   1. A Gray-Scott reaction-diffusion chemistry (two chemicals A/B) lives in a
//      pair of rgba16float storage textures, ping-ponged. A compute shader steps
//      it many iterations per frame with dispatchWorkgroups — the field is a
//      genuine GPU cellular chemistry, not a texture animation.
//   2. Note-on events inject Gaussian "seeds" into B via a uniform the compute
//      shader reads, so playing the keyboard literally sows worms into the
//      chemistry.
//   3. A render pass samples the field through an INVERSE LOG-POLAR (exp) warp —
//      the Bressloff–Cowan retino-cortical form-constant map — turning the
//      planar RD pattern into tunnels, spirals and honeycomb lattices. Thin-film
//      iridescence, chromatic aberration and an additive glow finish the jewel.
//
// Everything degrades: create() throws a typed WebGPUUnsupportedError the page
// catches to show a readable notice instead of a blank screen.
// ─────────────────────────────────────────────────────────────────────────────

export class WebGPUUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGPUUnsupportedError";
  }
}

const SIM = 512; // reaction-diffusion grid is a fixed square, independent of DPR.
const WORKGROUP = 8;

/** One injected perturbation of the chemistry (screen-independent tex space). */
export interface Seed {
  x: number; // 0..1 in RD texture space
  y: number; // 0..1
  radius: number; // gaussian sigma in tex space
  strength: number; // 0..~1
}

export interface StepParams {
  seeds: Seed[];
  feed: number;
  kill: number;
  substeps: number;
  timeSec: number;
  // render / warp controls
  sampleScale: number;
  symmetry: number;
  spiral: number;
  saturation: number;
  chroma: number;
  contrast: number;
  drift: number;
  glow: number;
}

// ─── WGSL: shared param block for the compute passes ─────────────────────────
const PARAMS_WGSL = /* wgsl */ `
struct Params {
  res       : vec2<u32>,
  time      : f32,
  feed      : f32,
  kill      : f32,
  dA        : f32,
  dB        : f32,
  dt        : f32,
  seedCount : u32,
  inject    : f32,
  _pad0     : f32,
  _pad1     : f32,
  seeds     : array<vec4<f32>, 16>,
};
`;

// ─── WGSL: init pass — A = 1 everywhere, B = a few central spots ─────────────
const INIT_WGSL = /* wgsl */ `
${PARAMS_WGSL}
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var dst : texture_storage_2d<rgba16float, write>;

fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= P.res.x || gid.y >= P.res.y) { return; }
  let uv = vec2<f32>(f32(gid.x), f32(gid.y)) / vec2<f32>(f32(P.res.x), f32(P.res.y));
  var b = 0.0;
  // A ring of soft seed blobs so structure grows even before any input.
  for (var i = 0; i < 7; i = i + 1) {
    let a = (f32(i) / 7.0) * 6.2831853;
    let c = vec2<f32>(0.5) + vec2<f32>(cos(a), sin(a)) * 0.16;
    let d = distance(uv, c);
    b = b + exp(-(d * d) / (2.0 * 0.012 * 0.012));
  }
  b = min(0.9, b + hash(uv * 512.0) * 0.02);
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(1.0, b, 0.0, 1.0));
}
`;

// ─── WGSL: Gray-Scott step — read prev (sampled), write next (storage) ───────
const STEP_WGSL = /* wgsl */ `
${PARAMS_WGSL}
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var src : texture_2d<f32>;
@group(0) @binding(2) var dst : texture_storage_2d<rgba16float, write>;

fn wrap(c: vec2<i32>, n: i32) -> vec2<i32> {
  return vec2<i32>((c.x + n) % n, (c.y + n) % n);
}

fn samp(c: vec2<i32>, n: i32) -> vec2<f32> {
  return textureLoad(src, wrap(c, n), 0).xy;
}

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(P.res.x);
  if (gid.x >= P.res.x || gid.y >= P.res.y) { return; }
  let c = vec2<i32>(gid.xy);

  let center = samp(c, n);
  var A = center.x;
  var B = center.y;

  // 9-point Laplacian (toroidal boundary via wrap()).
  var lap = vec2<f32>(0.0);
  lap = lap + samp(c + vec2<i32>(-1,  0), n) * 0.20;
  lap = lap + samp(c + vec2<i32>( 1,  0), n) * 0.20;
  lap = lap + samp(c + vec2<i32>( 0, -1), n) * 0.20;
  lap = lap + samp(c + vec2<i32>( 0,  1), n) * 0.20;
  lap = lap + samp(c + vec2<i32>(-1, -1), n) * 0.05;
  lap = lap + samp(c + vec2<i32>( 1, -1), n) * 0.05;
  lap = lap + samp(c + vec2<i32>(-1,  1), n) * 0.05;
  lap = lap + samp(c + vec2<i32>( 1,  1), n) * 0.05;
  lap = lap - center; // weights sum to 1 → subtract center for the Laplacian

  let reaction = A * B * B;
  A = A + (P.dA * lap.x - reaction + P.feed * (1.0 - A)) * P.dt;
  B = B + (P.dB * lap.y + reaction - (P.kill + P.feed) * B) * P.dt;

  // Inject the held/decaying note seeds into B (and deplete A locally).
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(f32(n));
  let count = i32(P.seedCount);
  for (var i = 0; i < count; i = i + 1) {
    let s = P.seeds[i];
    let sigma = max(0.004, s.z);
    let d = distance(uv, s.xy);
    let g = exp(-(d * d) / (2.0 * sigma * sigma)) * s.w * P.inject;
    B = B + g;
    A = A - g * 0.5;
  }

  A = clamp(A, 0.0, 1.0);
  B = clamp(B, 0.0, 1.0);
  textureStore(dst, c, vec4<f32>(A, B, 0.0, 1.0));
}
`;

// ─── WGSL: render — inverse log-polar form-constant warp + iridescence ───────
const RENDER_WGSL = /* wgsl */ `
struct RParams {
  res        : vec2<f32>,
  time       : f32,
  sampleScale: f32,
  symmetry   : f32,
  spiral     : f32,
  saturation : f32,
  chroma     : f32,
  contrast   : f32,
  drift      : f32,
  glow       : f32,
  _pad       : f32,
};
@group(0) @binding(0) var<uniform> R : RParams;
@group(0) @binding(1) var field : texture_2d<f32>;
@group(0) @binding(2) var samp  : sampler;

struct VSOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  // Full-screen triangle.
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0),
  );
  var out : VSOut;
  let xy = p[vi];
  out.pos = vec4<f32>(xy, 0.0, 1.0);
  out.uv = vec2<f32>(xy.x * 0.5 + 0.5, 1.0 - (xy.y * 0.5 + 0.5));
  return out;
}

const PI = 3.14159265;

// Sample the RD field through the inverse retino-cortical map. A screen point
// (visual field) at radius r, angle theta reads the chemistry at cortical
// coordinate (log r, theta) — so radial structure becomes tunnels, angular
// structure becomes funnels, and the diagonal maze becomes spirals/lattices
// (the Klüver form constants). chromaR nudges the radius per colour channel.
fn warpField(uv: vec2<f32>, chromaR: f32) -> f32 {
  let aspect = R.res.x / max(1.0, R.res.y);
  var p = (uv - vec2<f32>(0.5)) * vec2<f32>(2.0 * aspect, 2.0);
  let r = length(p) + chromaR;
  let theta = atan2(p.y, p.x);
  // cortical coordinates
  let u = log(r + 0.0025) * R.sampleScale - R.time * R.drift;
  let v = theta * (1.0 / (2.0 * PI));
  // spiral coupling + n-fold angular symmetry → honeycomb / spiral lattices
  let su = fract(u + v * R.spiral);
  let sv = fract(v * R.symmetry + 0.5);
  return textureSampleLevel(field, samp, vec2<f32>(su, sv), 0.0).y;
}

// A neon-jewel thin-film palette (iridescent cosine gradient).
fn iridescence(t: f32) -> vec3<f32> {
  let a = vec3<f32>(0.52, 0.42, 0.58);
  let b = vec3<f32>(0.48, 0.52, 0.46);
  let c = vec3<f32>(1.0, 1.05, 1.15);
  let d = vec3<f32>(0.28, 0.55, 0.85);
  return a + b * cos(6.2831853 * (c * t + d));
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let uv = in.uv;
  let aspect = R.res.x / max(1.0, R.res.y);
  let p = (uv - vec2<f32>(0.5)) * vec2<f32>(2.0 * aspect, 2.0);
  let rr = length(p);

  // Chromatic aberration: split the sample radius per channel.
  let ca = R.chroma * (0.01 + rr * 0.02);
  let pr = warpField(uv, -ca);
  let pg = warpField(uv,  0.0);
  let pb = warpField(uv,  ca);

  let tShift = R.time * 0.02 + rr * 0.25;
  var col = vec3<f32>(
    iridescence(pr * 1.6 + tShift).x,
    iridescence(pg * 1.6 + tShift).y,
    iridescence(pb * 1.6 + tShift).z,
  );

  // Additive feedback glow: bright B ridges bloom.
  let ridge = pow(clamp(pg, 0.0, 1.0), 2.2);
  col = col + vec3<f32>(0.45, 0.75, 1.0) * ridge * R.glow;

  // Saturation lift for the jeweled read.
  let lum = dot(col, vec3<f32>(0.299, 0.587, 0.114));
  col = mix(vec3<f32>(lum), col, R.saturation);

  // Contrast control (reduced-motion softens toward mid-grey).
  col = mix(vec3<f32>(0.16), col, R.contrast);

  // Gentle radial vignette so the tunnel mouth reads as depth.
  let vig = 1.0 - smoothstep(0.7, 1.7, rr);
  col = col * (0.35 + 0.65 * vig);

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

// Byte layout of the compute Params uniform (see PARAMS_WGSL).
const PARAMS_BYTES = 48 + 16 * 16; // header (48) + 16 * vec4 = 304
const RPARAMS_BYTES = 48;
const MAX_SEEDS = 16;

export interface PrismRenderer {
  step(params: StepParams): void;
  resize(): void;
  dispose(): void;
}

export async function createPrismRenderer(
  canvas: HTMLCanvasElement,
): Promise<PrismRenderer> {
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
    if (!disposed) {
      // Intentional destroys resolve the lost promise too; only note real loss.
      if (info.reason !== "destroyed") {
        console.warn("[prism-cortex] WebGPU device lost:", info.message);
      }
    }
  });

  const configure = () => {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    context.configure({ device, format, alphaMode: "opaque" });
  };
  configure();

  // ── storage/sampled ping-pong textures ────────────────────────────────────
  const texUsage =
    GPUTextureUsage.STORAGE_BINDING |
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.COPY_SRC;
  const makeTex = () =>
    device.createTexture({
      size: [SIM, SIM],
      format: "rgba16float",
      usage: texUsage,
    });
  const texA = makeTex();
  const texB = makeTex();
  const viewA = texA.createView();
  const viewB = texB.createView();

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  // ── uniforms ───────────────────────────────────────────────────────────────
  const paramsBuf = device.createBuffer({
    size: PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const rparamsBuf = device.createBuffer({
    size: RPARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── bind group layouts ─────────────────────────────────────────────────────
  const initLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "2d" },
      },
    ],
  });
  const stepLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba16float", viewDimension: "2d" },
      },
    ],
  });
  const renderLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
    ],
  });

  // ── pipelines ──────────────────────────────────────────────────────────────
  const initModule = device.createShaderModule({ code: INIT_WGSL });
  const stepModule = device.createShaderModule({ code: STEP_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const initPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [initLayout] }),
    compute: { module: initModule, entryPoint: "main" },
  });
  const stepPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [stepLayout] }),
    compute: { module: stepModule, entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: { module: renderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  // ── bind groups ────────────────────────────────────────────────────────────
  const initBind = device.createBindGroup({
    layout: initLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: viewA },
    ],
  });
  // stepAB reads A, writes B; stepBA reads B, writes A.
  const stepAB = device.createBindGroup({
    layout: stepLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: viewA },
      { binding: 2, resource: viewB },
    ],
  });
  const stepBA = device.createBindGroup({
    layout: stepLayout,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: viewB },
      { binding: 2, resource: viewA },
    ],
  });
  const renderFromA = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: rparamsBuf } },
      { binding: 1, resource: viewA },
      { binding: 2, resource: sampler },
    ],
  });
  const renderFromB = device.createBindGroup({
    layout: renderLayout,
    entries: [
      { binding: 0, resource: { buffer: rparamsBuf } },
      { binding: 1, resource: viewB },
      { binding: 2, resource: sampler },
    ],
  });

  // ── seed initial state via the init pass ───────────────────────────────────
  const paramsData = new ArrayBuffer(PARAMS_BYTES);
  const pf = new Float32Array(paramsData);
  const pu = new Uint32Array(paramsData);
  const writeParams = (p: StepParams) => {
    pu[0] = SIM;
    pu[1] = SIM;
    pf[2] = p.timeSec;
    pf[3] = p.feed;
    pf[4] = p.kill;
    pf[5] = 1.0; // dA
    pf[6] = 0.5; // dB
    pf[7] = 1.0; // dt
    const count = Math.min(MAX_SEEDS, p.seeds.length);
    pu[8] = count;
    pf[9] = 0.12; // inject strength per substep
    // pf[10], pf[11] are padding
    for (let i = 0; i < MAX_SEEDS; i++) {
      const base = 12 + i * 4; // seeds start at byte 48 → float index 12
      const s = i < count ? p.seeds[i] : null;
      pf[base + 0] = s ? s.x : 0;
      pf[base + 1] = s ? s.y : 0;
      pf[base + 2] = s ? s.radius : 0.02;
      pf[base + 3] = s ? s.strength : 0;
    }
    device.queue.writeBuffer(paramsBuf, 0, paramsData);
  };

  // Prime params, run init once.
  writeParams({
    seeds: [], feed: 0.037, kill: 0.06, substeps: 1, timeSec: 0,
    sampleScale: 1, symmetry: 6, spiral: 1, saturation: 1, chroma: 1,
    contrast: 1, drift: 0.02, glow: 0.5,
  });
  {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(initPipeline);
    pass.setBindGroup(0, initBind);
    const groups = Math.ceil(SIM / WORKGROUP);
    pass.dispatchWorkgroups(groups, groups);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  const rparamsData = new ArrayBuffer(RPARAMS_BYTES);
  const rf = new Float32Array(rparamsData);

  // Which texture holds the current state (init wrote into A).
  let currentIsA = true;
  const groups = Math.ceil(SIM / WORKGROUP);

  const step = (p: StepParams) => {
    if (disposed || deviceLost) return;
    writeParams(p);

    const enc = device.createCommandEncoder();

    // Reaction-diffusion substeps: many chemistry iterations per displayed frame.
    const passes = Math.max(1, Math.min(16, p.substeps));
    for (let i = 0; i < passes; i++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPipeline);
      // If current state is in A, read A → write B, then B becomes current.
      pass.setBindGroup(0, currentIsA ? stepAB : stepBA);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
      currentIsA = !currentIsA;
    }

    // Render params.
    rf[0] = canvas.width;
    rf[1] = canvas.height;
    rf[2] = p.timeSec;
    rf[3] = p.sampleScale;
    rf[4] = p.symmetry;
    rf[5] = p.spiral;
    rf[6] = p.saturation;
    rf[7] = p.chroma;
    rf[8] = p.contrast;
    rf[9] = p.drift;
    rf[10] = p.glow;
    device.queue.writeBuffer(rparamsBuf, 0, rparamsData);

    const view = context.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.02, b: 0.04, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    // currentIsA is kept in sync after every substep flip: it is true exactly
    // when the newest chemistry state lives in texA.
    rpass.setBindGroup(0, currentIsA ? renderFromA : renderFromB);
    rpass.draw(3);
    rpass.end();

    device.queue.submit([enc.finish()]);
  };

  const resize = () => {
    if (disposed || deviceLost) return;
    configure();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    try {
      context.unconfigure();
    } catch {
      /* ignore */
    }
    texA.destroy();
    texB.destroy();
    paramsBuf.destroy();
    rparamsBuf.destroy();
    device.destroy();
  };

  return { step, resize, dispose };
}
