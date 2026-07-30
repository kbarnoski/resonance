/* ── 3880-conjure · WebGPU compute-shader particle field ──────────────────
 *
 *  Thousands of particles, each permanently assigned (at spawn) to ONE of
 *  the 21 hand-landmark anchors. Every frame the anchor positions are
 *  uploaded from the live (or synthetic) hand, and a WGSL compute pass pulls
 *  each particle toward its anchor with a strength driven by COHERENCE:
 *
 *    high coherence → strong pull + low turbulence → particles gather into
 *      a tight, luminous, ordered skeleton tracking the hand (the chord
 *      "voices cleanly and blooms")
 *    low coherence  → weak pull + high curl-noise turbulence → the field
 *      scatters into a turbulent scattered cloud (the chord "decoheres")
 *
 *  Particles render additively into an rgba16float trail texture that fades
 *  each frame, then a tonemap pass shows it — same trail-buffer technique as
 *  the lab's other WebGPU pieces (e.g. 3480-reverie). A Canvas2D fallback in
 *  fallback2d.ts runs the IDENTICAL anchor-attraction + turbulence model on
 *  the CPU at a lower particle count.
 */

export const PARTICLE_COUNT = 18000;
export const ANCHOR_COUNT = 21;
const WG = 64;

const PARAMS_WGSL = /* wgsl */ `
struct Params {
  n: u32, time: f32, dt: f32, aspect: f32,
  coherence: f32, brightness: f32, pan: f32, presence: f32,
  reduce: f32, pad0: f32, pad1: f32, pad2: f32,
  pad3: f32, pad4: f32, pad5: f32, pad6: f32,
}
`;

const PALETTE_WGSL = /* wgsl */ `
fn conjurePalette(x: f32) -> vec3f {
  let deep    = vec3f(0.043, 0.027, 0.075);
  let indigo  = vec3f(0.388, 0.400, 0.945);
  let violet  = vec3f(0.545, 0.361, 0.965);
  let magenta = vec3f(0.690, 0.263, 0.878);
  let light   = vec3f(0.769, 0.710, 0.992);
  let t = clamp(x, 0.0, 1.0);
  if (t < 0.33) { return mix(deep, indigo, t / 0.33); }
  if (t < 0.66) { return mix(indigo, violet, (t - 0.33) / 0.33); }
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1.0);
}
`;

const COMPUTE_WGSL = /* wgsl */ `
${PARAMS_WGSL}
struct Particle { pos: vec2f, vel: vec2f, seed: f32, anchor: f32 }
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;
@group(0) @binding(2) var<storage, read> anchors: array<vec2f>;

fn hashf(p: vec2f) -> f32 {
  var q = fract(p * 0.3183099 + vec2f(0.1, 0.1));
  q *= 17.0;
  return fract(q.x * q.y * (q.x + q.y));
}
fn curl(pos: vec2f, t: f32) -> vec2f {
  let e = 0.025;
  let tp = pos + vec2f(t * 0.13, t * 0.09);
  let dy = (hashf(tp + vec2f(0.0, e)) - hashf(tp - vec2f(0.0, e))) / (2.0 * e);
  let dx = (hashf(tp + vec2f(e, 0.0)) - hashf(tp - vec2f(e, 0.0))) / (2.0 * e);
  return vec2f(-dy, dx);
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.n) { return; }
  var pt = particles[i];
  let pos = pt.pos;
  var force = vec2f(0.0);

  let ai = u32(pt.anchor + 0.5) % ${ANCHOR_COUNT}u;
  let target = anchors[ai];
  let toTarget = target - pos;
  // gather strength: strong + coherent, weak + wandering when incoherent
  let pull = mix(0.010, 0.26, P.coherence * P.coherence) * mix(0.25, 1.0, P.presence);
  force += toTarget * pull;

  // curl-noise turbulence — the scatter. Always a little alive; swells hard
  // as coherence collapses.
  let turbAmt = mix(0.06, 1.1, 1.0 - P.coherence);
  force += curl(pos * 2.1 + pt.seed, P.time) * (0.05 * turbAmt);

  // gentle radial noise kick so scattered particles don't just orbit
  let r = max(length(pos), 1e-4);
  let dir = pos / r;
  force += dir * hashf(pos * 3.7 + pt.seed) * 0.01 * (1.0 - P.coherence);

  // hand tilt biases the scatter direction — a decohering field "leans"
  force += vec2f(P.pan, 0.0) * 0.018 * (1.0 - P.coherence);

  // soft containment
  if (r > 1.35) { force -= dir * (r - 1.35) * 0.12; }

  let motion = select(1.0, 0.5, P.reduce > 0.5);
  pt.vel += force * motion;
  let maxs = (0.006 + (1.0 - P.coherence) * 0.03) * motion;
  let sp = length(pt.vel);
  if (sp > maxs) { pt.vel *= maxs / sp; }
  pt.vel *= 0.93;
  pt.pos = pt.pos + pt.vel;
  particles[i] = pt;
}
`;

const PARTICLE_WGSL = /* wgsl */ `
${PARAMS_WGSL}
${PALETTE_WGSL}
struct Particle { pos: vec2f, vel: vec2f, seed: f32, anchor: f32 }
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) corner: vec2f,
  @location(1) col: vec3f,
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let p = particles[ii];
  var corners = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let c = corners[vi];
  let sp = length(p.vel);
  let sz = 0.0045 + sp * 0.28 + P.brightness * 0.0035 + P.coherence * 0.0025;
  var ndc = p.pos * 0.66;
  ndc.x = ndc.x / P.aspect;
  let t = clamp(P.coherence * 0.72 + sp * 5.0 + p.seed * 0.1, 0.0, 1.0);
  let col = conjurePalette(t) * (0.4 + P.brightness * 0.8 + P.coherence * 0.3);
  return VO(vec4f(ndc + c * vec2f(sz / P.aspect, sz), 0.0, 1.0), c, col);
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = 1.0 - d * d;
  let a2 = a * a * 0.55;
  return vec4f(v.col * a2, a2);
}
`;

const FADE_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy, 0, 1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var<uniform> fade: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(trail, smp, uv) * fade.x;
}
`;

const DISPLAY_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy, 0, 1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var col = textureSample(trail, smp, uv).rgb;
  col = col / (1.0 + dot(col, vec3f(0.299, 0.587, 0.114)));
  return vec4f(pow(max(col, vec3f(0.0)), vec3f(0.62)), 1.0);
}
`;

export interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  particleBuf: GPUBuffer;
  paramsBuf: GPUBuffer;
  fadeBuf: GPUBuffer;
  anchorBuf: GPUBuffer;
  trail: [GPUTexture, GPUTexture];
  trailR: 0 | 1;
  sampler: GPUSampler;
  computePl: GPUComputePipeline;
  fadePl: GPURenderPipeline;
  particlePl: GPURenderPipeline;
  displayPl: GPURenderPipeline;
}

export interface FieldParams {
  time: number;
  aspect: number;
  coherence: number;
  brightness: number;
  pan: number;
  presence: number;
  reduce: number;
  fade: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spawnParticles(): Float32Array {
  const rand = mulberry32(0x3880);
  const buf = new Float32Array(PARTICLE_COUNT * 6);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.1;
    buf[i * 6 + 0] = Math.cos(ang) * rad;
    buf[i * 6 + 1] = Math.sin(ang) * rad;
    buf[i * 6 + 2] = (rand() - 0.5) * 0.002;
    buf[i * 6 + 3] = (rand() - 0.5) * 0.002;
    buf[i * 6 + 4] = rand() * 10;
    buf[i * 6 + 5] = i % ANCHOR_COUNT;
  }
  return buf;
}

export async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuState> {
  if (!navigator.gpu) throw new Error("WebGPU not supported");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context");
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const W = canvas.width;
  const H = canvas.height;
  const trailFmt: GPUTextureFormat = "rgba16float";
  const mkTrail = (): GPUTexture =>
    device.createTexture({
      size: [W, H],
      format: trailFmt,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const particleBuf = device.createBuffer({
    size: PARTICLE_COUNT * 6 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, spawnParticles().buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const fadeBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const anchorBuf = device.createBuffer({
    size: ANCHOR_COUNT * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });
  const partMod = device.createShaderModule({ code: PARTICLE_WGSL });
  const particlePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: partMod, entryPoint: "vs" },
    fragment: {
      module: partMod,
      entryPoint: "fs",
      targets: [
        {
          format: trailFmt,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-strip" },
  });
  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const fadePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vs" },
    fragment: { module: fadeMod, entryPoint: "fs", targets: [{ format: trailFmt }] },
    primitive: { topology: "triangle-strip" },
  });
  const dispMod = device.createShaderModule({ code: DISPLAY_WGSL });
  const displayPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: dispMod, entryPoint: "vs" },
    fragment: { module: dispMod, entryPoint: "fs", targets: [{ format: canvasFmt }] },
    primitive: { topology: "triangle-strip" },
  });

  return {
    device,
    ctx,
    particleBuf,
    paramsBuf,
    fadeBuf,
    anchorBuf,
    trail: [mkTrail(), mkTrail()],
    trailR: 0,
    sampler,
    computePl,
    fadePl,
    particlePl,
    displayPl,
  };
}

export function stepGpu(g: GpuState, p: FieldParams, anchorsNdc: Float32Array): void {
  const { device } = g;
  const buf = new Float32Array(16);
  const u = new Uint32Array(buf.buffer);
  u[0] = PARTICLE_COUNT;
  buf[1] = p.time;
  buf[2] = 0.016;
  buf[3] = p.aspect;
  buf[4] = p.coherence;
  buf[5] = p.brightness;
  buf[6] = p.pan;
  buf[7] = p.presence;
  buf[8] = p.reduce;
  device.queue.writeBuffer(g.paramsBuf, 0, buf.buffer as ArrayBuffer);
  device.queue.writeBuffer(g.fadeBuf, 0, new Float32Array([p.fade, 0, 0, 0]).buffer as ArrayBuffer);
  device.queue.writeBuffer(g.anchorBuf, 0, anchorsNdc.buffer as ArrayBuffer);

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  {
    const bg = device.createBindGroup({
      layout: g.computePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.particleBuf } },
        { binding: 1, resource: { buffer: g.paramsBuf } },
        { binding: 2, resource: { buffer: g.anchorBuf } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(g.computePl);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WG));
    pass.end();
  }

  {
    const fadeBg = device.createBindGroup({
      layout: g.fadePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: g.sampler },
        { binding: 1, resource: g.trail[trR].createView() },
        { binding: 2, resource: { buffer: g.fadeBuf } },
      ],
    });
    const partBg = device.createBindGroup({
      layout: g.particlePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.particleBuf } },
        { binding: 1, resource: { buffer: g.paramsBuf } },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: g.trail[trW].createView(),
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(g.fadePl);
    pass.setBindGroup(0, fadeBg);
    pass.draw(4);
    pass.setPipeline(g.particlePl);
    pass.setBindGroup(0, partBg);
    pass.draw(4, PARTICLE_COUNT);
    pass.end();
  }

  {
    const bg = device.createBindGroup({
      layout: g.displayPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: g.sampler },
        { binding: 1, resource: g.trail[trW].createView() },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: g.ctx.getCurrentTexture().createView(),
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(g.displayPl);
    pass.setBindGroup(0, bg);
    pass.draw(4);
    pass.end();
  }

  device.queue.submit([enc.finish()]);
  g.trailR = trW;
}

export function destroyGpu(g: GpuState): void {
  try {
    g.particleBuf.destroy();
    g.paramsBuf.destroy();
    g.fadeBuf.destroy();
    g.anchorBuf.destroy();
    g.trail[0].destroy();
    g.trail[1].destroy();
    g.device.destroy();
  } catch {
    /* already gone */
  }
}
