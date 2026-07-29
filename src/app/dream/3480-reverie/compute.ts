/* ── 3480-reverie · WebGPU compute-shader particle nebula ─────────────────
 *
 *  ~42k particles in a WGSL compute pipeline. Each act sets a FORCE FIELD
 *  that gives the cloud a distinct FORM, but the field is a WEIGHTED SUM of
 *  four primitive operators:
 *
 *     driftW   — Act I: a slow drifting horizon field
 *     vortexW  — Act II: a rotational curl-noise storm
 *     radialW  — Act III: a collapsing / blooming radial burst (radialDir)
 *     turbW    — curl-noise turbulence overlay
 *
 *  Because every act is just a point in weight-space and the director
 *  interpolates the weights every frame, the TRANSITION is a true GPU MORPH:
 *  the cloud continuously re-forms from one world into the next — no cut.
 *  The palette (violet brand ramp) heats/cools with valence + brightness.
 *
 *  Additive points accumulate into an rgba16float trail texture that fades
 *  each frame (dreamy smear), then a tonemap pass shows it. A Canvas2D
 *  fallback in page.tsx drives the SAME force model on the CPU.
 */

export const PARTICLE_COUNT = 42000;
const WG = 64;

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

// ── shared param + palette WGSL ──────────────────────────────────────────
const PARAMS_WGSL = /* wgsl */ `
struct Params {
  n: u32, time: f32, dt: f32, aspect: f32,
  driftW: f32, vortexW: f32, radialW: f32, turbW: f32,
  radialDir: f32, arousal: f32, valence: f32, brightness: f32,
  density: f32, dwell: f32, reduce: f32, pad0: f32,
}
`;

const PALETTE_WGSL = /* wgsl */ `
fn dreamPalette(x: f32) -> vec3f {
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
struct Particle { pos: vec2f, vel: vec2f, seed: f32, pad: f32 }
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> P: Params;

fn hashf(p: vec2f) -> f32 {
  var q = fract(p * 0.3183099 + vec2f(0.1, 0.1));
  q *= 17.0;
  return fract(q.x * q.y * (q.x + q.y));
}
fn curl(pos: vec2f, t: f32) -> vec2f {
  let e = 0.02;
  let tp = pos + vec2f(t * 0.11, t * 0.08);
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
  let r = max(length(pos), 1e-4);
  let dir = pos / r;
  var force = vec2f(0.0);

  // ── drift: slow horizon field (gentle sideways + banding toward y=0) ──
  let band = sin(pos.x * 1.7 + P.time * 0.15 + pt.seed * 6.283);
  force += vec2f(0.010 + 0.006 * sin(P.time * 0.06 + pt.seed),
                 band * 0.004 - pos.y * 0.012) * P.driftW;

  // ── vortex: rotational storm around the centre ──
  let tang = vec2f(-dir.y, dir.x);
  force += (tang * (0.05 / (r + 0.25)) - dir * 0.003) * P.vortexW;

  // ── radial: collapse (neg) / bloom (pos) ──
  force += dir * (P.radialDir * 0.055) * P.radialW;

  // ── turbulence overlay ──
  force += curl(pos * 1.5 + pt.seed, P.time) * (0.03 * P.turbW);

  // ── soft containment so the bloom breathes instead of escaping ──
  if (r > 1.2) { force -= dir * (r - 1.2) * 0.09; }

  let motion = select(1.0, 0.45, P.reduce > 0.5);
  pt.vel += force * motion;
  let maxs = (0.006 + P.arousal * 0.020) * motion;
  let sp = length(pt.vel);
  if (sp > maxs) { pt.vel *= maxs / sp; }
  pt.vel *= 0.940;
  pt.pos = pt.pos + pt.vel;
  particles[i] = pt;
}
`;

const PARTICLE_WGSL = /* wgsl */ `
${PARAMS_WGSL}
${PALETTE_WGSL}
struct Particle { pos: vec2f, vel: vec2f, seed: f32, pad: f32 }
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
  let sz = 0.005 + sp * 0.35 + P.brightness * 0.004;
  var ndc = p.pos * 0.62;
  ndc.x = ndc.x / P.aspect;
  let t = clamp(P.valence * 0.68 + sp * 6.0 + p.seed * 0.12, 0.0, 1.0);
  let col = dreamPalette(t) * (0.35 + P.brightness * 0.95);
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
  driftW: number;
  vortexW: number;
  radialW: number;
  turbW: number;
  radialDir: number;
  arousal: number;
  valence: number;
  brightness: number;
  density: number;
  dwell: number;
  reduce: number;
  fade: number;
}

function spawnParticles(): Float32Array {
  const rand = mulberry32(0x3480);
  const buf = new Float32Array(PARTICLE_COUNT * 6);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // seed in a soft disc around the centre
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 0.9;
    buf[i * 6 + 0] = Math.cos(ang) * rad;
    buf[i * 6 + 1] = Math.sin(ang) * rad;
    buf[i * 6 + 2] = (rand() - 0.5) * 0.002;
    buf[i * 6 + 3] = (rand() - 0.5) * 0.002;
    buf[i * 6 + 4] = rand() * 10; // per-particle seed
    buf[i * 6 + 5] = 0;
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
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const particleBuf = device.createBuffer({
    size: PARTICLE_COUNT * 6 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    particleBuf,
    0,
    spawnParticles().buffer as ArrayBuffer,
  );

  const paramsBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const fadeBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
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
    fragment: {
      module: fadeMod,
      entryPoint: "fs",
      targets: [{ format: trailFmt }],
    },
    primitive: { topology: "triangle-strip" },
  });
  const dispMod = device.createShaderModule({ code: DISPLAY_WGSL });
  const displayPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: dispMod, entryPoint: "vs" },
    fragment: {
      module: dispMod,
      entryPoint: "fs",
      targets: [{ format: canvasFmt }],
    },
    primitive: { topology: "triangle-strip" },
  });

  return {
    device,
    ctx,
    particleBuf,
    paramsBuf,
    fadeBuf,
    trail: [mkTrail(), mkTrail()],
    trailR: 0,
    sampler,
    computePl,
    fadePl,
    particlePl,
    displayPl,
  };
}

export function stepGpu(g: GpuState, p: FieldParams): void {
  const { device } = g;
  const buf = new Float32Array(16);
  const u = new Uint32Array(buf.buffer);
  u[0] = PARTICLE_COUNT;
  buf[1] = p.time;
  buf[2] = 0.016;
  buf[3] = p.aspect;
  buf[4] = p.driftW;
  buf[5] = p.vortexW;
  buf[6] = p.radialW;
  buf[7] = p.turbW;
  buf[8] = p.radialDir;
  buf[9] = p.arousal;
  buf[10] = p.valence;
  buf[11] = p.brightness;
  buf[12] = p.density;
  buf[13] = p.dwell;
  buf[14] = p.reduce;
  device.queue.writeBuffer(g.paramsBuf, 0, buf.buffer as ArrayBuffer);
  device.queue.writeBuffer(
    g.fadeBuf,
    0,
    new Float32Array([p.fade, 0, 0, 0]).buffer as ArrayBuffer,
  );

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  // 1. compute forces / integrate
  {
    const bg = device.createBindGroup({
      layout: g.computePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.particleBuf } },
        { binding: 1, resource: { buffer: g.paramsBuf } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(g.computePl);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(PARTICLE_COUNT / WG));
    pass.end();
  }

  // 2. fade previous trail + additively draw particles → trail[trW]
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

  // 3. tonemap → canvas
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
