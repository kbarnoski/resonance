// gpu.ts — the particle nebula on WebGPU compute.
//
// ~90k star-agents live in a storage buffer. Each frame a COMPUTE pass advects
// them through a curl-noise flow field (divergence-free swirl), biased inward
// by a slowly-ramping "convergence" so the scattered cloud gathers into a
// tunnel-to-light. Onsets emit fresh agents through a lock-free ring emitter
// (no atomics): the uniform names a [start,count) window of indices to reseed.
//
// RENDER is four passes: additive point-splat of every agent into an HDR
// accumulation texture; a separable Gaussian blur (H then V) for bloom; and a
// composite that tone-maps the density, ramps it deep-indigo → violet →
// white-hot, and lays an ORDERED (Bayer 8x8) dither over it so the cloud reads
// as a shifting veil of quantized light-grains — the ASTRODITHER signature.
//
// Mirrors the structure of 9320-morphochoir/gpu.ts (adapter/device/pipelines/
// storage buffers/ping-pong). Everything seeded — no Math.random on the hot
// path — so a performance is reproducible.

import {
  GPU_PARTICLES,
  mulberry32,
  type NebulaEngine,
  PARTICLE_LIFE,
  SEED,
  type StepArgs,
} from "./nebula";

const WORKGROUP = 64;
const ACCUM_FMT: GPUTextureFormat = "rgba16float";

// ── compute: advect + ring-emitter reseed ───────────────────────────────────
const SIM_WGSL = /* wgsl */ `
struct Particle { pos: vec2f, vel: vec2f, life: f32, age: f32, seed: f32, pad: f32 };
struct Sim {
  dt: f32, time: f32, convergence: f32, count: f32,
  spawnStart: f32, spawnCount: f32, spawnSeed: f32, lifeRate: f32,
  curlLo: f32, curlHi: f32, reduced: f32, _pad: f32,
};
@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> u: Sim;

fn hash1(p: vec2f) -> f32 {
  let s = sin(p.x * 127.1 + p.y * 311.7) * 43758.5453;
  return fract(s);
}
fn smooth3(t: f32) -> f32 { return t * t * (3.0 - 2.0 * t); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let a = hash1(i);
  let b = hash1(i + vec2f(1.0, 0.0));
  let c = hash1(i + vec2f(0.0, 1.0));
  let d = hash1(i + vec2f(1.0, 1.0));
  let u = smooth3(f.x);
  let v = smooth3(f.y);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
fn curl(p: vec2f) -> vec2f {
  let e = 0.08;
  let dydx = (vnoise(p + vec2f(0.0, e)) - vnoise(p - vec2f(0.0, e))) / (2.0 * e);
  let dxdy = (vnoise(p + vec2f(e, 0.0)) - vnoise(p - vec2f(e, 0.0))) / (2.0 * e);
  return vec2f(dydx, -dxdy);
}
// two random floats for particle i and this spawn batch
fn rnd2(i: u32) -> vec2f {
  let a = hash1(vec2f(f32(i) * 0.017, u.spawnSeed));
  let b = hash1(vec2f(u.spawnSeed * 1.31, f32(i) * 0.029 + 3.7));
  return vec2f(a, b);
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let N = u32(u.count);
  if (i >= N) { return; }
  var p = parts[i];

  // ── ring emitter: reseed the [spawnStart, spawnStart+spawnCount) window ──
  let s = u32(u.spawnStart);
  let c = u32(u.spawnCount);
  let rel = (i + N - s) % N;
  if (rel < c) {
    let r = rnd2(i);
    let ang = r.x * 6.2831853;
    // spawn across a wide diffuse ring so the field starts scattered
    let rad = 0.55 + 0.5 * r.y;
    p.pos = vec2f(cos(ang), sin(ang)) * rad;
    let r2 = rnd2(i * 2u + 11u);
    p.vel = vec2f(r2.x - 0.5, r2.y - 0.5) * 0.25;
    p.life = 1.0;
    p.age = 0.0;
    p.seed = r.x;
  }

  if (p.life > 0.0) {
    let timeScale = select(1.0, 0.35, u.reduced > 0.5);
    let flow = curl(p.pos * 1.7 + vec2f(u.time * 0.03 * timeScale, u.time * 0.021 * timeScale));
    let curlAmp = mix(u.curlLo, u.curlHi, u.convergence); // shrinks as it converges
    let dist = length(p.pos) + 1e-4;
    let inward = (-p.pos / dist) * u.convergence * 0.42;
    let swirl = vec2f(-p.pos.y, p.pos.x) * u.convergence * 0.5; // tunnel rotation
    p.vel = p.vel + (flow * curlAmp + inward + swirl) * u.dt;
    p.vel = p.vel * 0.965;
    p.pos = p.pos + p.vel * u.dt;
    p.age = p.age + u.dt;
    p.life = p.life - u.dt * u.lifeRate;
    // reaching the core = arriving at the light; recycle it
    if (dist < 0.02) { p.life = 0.0; }
    // drifted off the field; recycle
    if (abs(p.pos.x) > 1.6 || abs(p.pos.y) > 1.6) { p.life = 0.0; }
  }

  parts[i] = p;
}`;

// ── render: additive point-splat of every agent into the HDR accumulator ────
const SPLAT_WGSL = /* wgsl */ `
struct Particle { pos: vec2f, vel: vec2f, life: f32, age: f32, seed: f32, pad: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) energy: f32,
  @location(1) heat: f32,
};

@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var o: VO;
  let p = parts[vi];
  if (p.life <= 0.0) {
    o.pos = vec4f(2.0, 2.0, 0.0, 1.0); // off-clip → discarded
    o.energy = 0.0;
    o.heat = 0.0;
    return o;
  }
  // NDC y is up; our sim space already is. flip y for the framebuffer.
  o.pos = vec4f(p.pos.x, -p.pos.y, 0.0, 1.0);
  let fade = smoothstep(0.0, 0.12, p.life) * smoothstep(0.0, 0.25, 1.0 - p.life + 0.25);
  o.energy = fade * 0.9;
  // closer to the core burns hotter (drives the white-hot centre)
  o.heat = clamp(1.0 - length(p.pos) * 0.9, 0.0, 1.0);
  return o;
}

@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  // .r = density, .g = hot mass. Additive blend accumulates both.
  return vec4f(v.energy, v.energy * v.heat, 0.0, 1.0);
}`;

// ── render: separable Gaussian blur (bloom) ─────────────────────────────────
const BLUR_WGSL = /* wgsl */ `
struct BU { texel: vec2f, _p: vec2f };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: BU;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = p[vi];
  var o: VO;
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = xy * 0.5 + vec2f(0.5, 0.5);
  return o;
}
@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  let w = array<f32, 5>(0.227027, 0.194594, 0.121622, 0.054054, 0.016216);
  var acc = textureSample(src, samp, v.uv) * w[0];
  for (var k = 1; k < 5; k = k + 1) {
    let off = u.texel * f32(k);
    acc = acc + textureSample(src, samp, v.uv + off) * w[k];
    acc = acc + textureSample(src, samp, v.uv - off) * w[k];
  }
  return acc;
}`;

// ── render: composite — tone-map, palette ramp, Bayer 8x8 ordered dither ────
const COMPOSITE_WGSL = /* wgsl */ `
struct CU { exposure: f32, bloom: f32, levels: f32, _p: f32 };
@group(0) @binding(0) var accum: texture_2d<f32>;
@group(0) @binding(1) var bloom: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> u: CU;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = p[vi];
  var o: VO;
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = xy * 0.5 + vec2f(0.5, 0.5);
  return o;
}

fn bayer8(px: vec2u) -> f32 {
  // classic 8x8 ordered-dither threshold matrix, normalized to [0,1)
  var m = array<f32, 64>(
     0.0,48.0,12.0,60.0, 3.0,51.0,15.0,63.0,
    32.0,16.0,44.0,28.0,35.0,19.0,47.0,31.0,
     8.0,56.0, 4.0,52.0,11.0,59.0, 7.0,55.0,
    40.0,24.0,36.0,20.0,43.0,27.0,39.0,23.0,
     2.0,50.0,14.0,62.0, 1.0,49.0,13.0,61.0,
    34.0,18.0,46.0,30.0,33.0,17.0,45.0,29.0,
    10.0,58.0, 6.0,54.0, 9.0,57.0, 5.0,53.0,
    42.0,26.0,38.0,22.0,41.0,25.0,37.0,21.0);
  let idx = (px.y % 8u) * 8u + (px.x % 8u);
  return (m[idx] + 0.5) / 64.0;
}

@fragment
fn fmain(v: VO) -> @location(0) vec4f {
  let a = textureSample(accum, samp, v.uv);
  let b = textureSample(bloom, samp, v.uv);
  let density = a.r + b.r * u.bloom;
  let hotmass = a.g + b.g * u.bloom;
  let heat = clamp(hotmass / max(density, 1e-3), 0.0, 1.0);

  // tone-map density → luminance
  let lum = 1.0 - exp(-density * u.exposure);

  // palette: deep indigo → violet → white-hot core
  let indigo = vec3f(0.02, 0.015, 0.09);
  let violet = vec3f(0.40, 0.16, 0.80);
  let hot    = vec3f(1.00, 0.96, 1.00);
  var col = mix(indigo, violet, smoothstep(0.0, 0.55, lum));
  col = mix(col, hot, smoothstep(0.5, 1.0, lum) * (0.35 + 0.65 * heat));
  // a faint indigo ground so empty space isn't pure black
  col = col + indigo * 0.5;

  // ORDERED DITHER — quantize into visible light-grains (the veil)
  let t = bayer8(vec2u(u32(v.pos.x), u32(v.pos.y)));
  let n = max(u.levels - 1.0, 1.0);
  col = floor(col * n + t) / n;

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

export async function createGpuNebula(canvas: HTMLCanvasElement): Promise<NebulaEngine> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "low-power" });
  if (!adapter) throw new Error("no-adapter");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const maybeCtx = canvas.getContext("webgpu");
  if (!maybeCtx) throw new Error("no-context");
  const cctx: GPUCanvasContext = maybeCtx;
  cctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const N = GPU_PARTICLES;

  // ── particle storage buffer, seeded all-dead ──────────────────────────────
  const FLOATS = 8; // pos2, vel2, life, age, seed, pad
  const partBuf = device.createBuffer({
    size: N * FLOATS * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  {
    const rnd = mulberry32(SEED);
    const init = new Float32Array(N * FLOATS);
    for (let i = 0; i < N; i++) {
      const o = i * FLOATS;
      init[o + 6] = rnd(); // seed; everything else 0 → life 0 (dead)
    }
    device.queue.writeBuffer(partBuf, 0, init);
  }

  // ── pipelines ──────────────────────────────────────────────────────────────
  const simPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: SIM_WGSL }), entryPoint: "main" },
  });

  const splatMod = device.createShaderModule({ code: SPLAT_WGSL });
  const splatPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: splatMod, entryPoint: "vmain" },
    fragment: {
      module: splatMod,
      entryPoint: "fmain",
      targets: [
        {
          format: ACCUM_FMT,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "point-list" },
  });

  const blurMod = device.createShaderModule({ code: BLUR_WGSL });
  const blurPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: blurMod, entryPoint: "vmain" },
    fragment: { module: blurMod, entryPoint: "fmain", targets: [{ format: ACCUM_FMT }] },
    primitive: { topology: "triangle-list" },
  });

  const compMod = device.createShaderModule({ code: COMPOSITE_WGSL });
  const compPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: compMod, entryPoint: "vmain" },
    fragment: { module: compMod, entryPoint: "fmain", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  // ── uniforms ───────────────────────────────────────────────────────────────
  const simUni = device.createBuffer({
    size: 48, // 12 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const simArr = new Float32Array(12);

  const blurUniH = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const blurUniV = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const compUni = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const compArr = new Float32Array(4);

  const simBG = device.createBindGroup({
    layout: simPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: partBuf } },
      { binding: 1, resource: { buffer: simUni } },
    ],
  });
  const splatBG = device.createBindGroup({
    layout: splatPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: partBuf } }],
  });

  // ── size-dependent textures (recreated on resize) ─────────────────────────
  let accumTex: GPUTexture | null = null;
  let blurTexA: GPUTexture | null = null;
  let blurTexB: GPUTexture | null = null;
  let blurBGh: GPUBindGroup | null = null;
  let blurBGv: GPUBindGroup | null = null;
  let compBG: GPUBindGroup | null = null;

  function makeTargets(w: number, h: number): void {
    accumTex?.destroy();
    blurTexA?.destroy();
    blurTexB?.destroy();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    accumTex = device.createTexture({ size: { width: w, height: h }, format: ACCUM_FMT, usage });
    blurTexA = device.createTexture({ size: { width: w, height: h }, format: ACCUM_FMT, usage });
    blurTexB = device.createTexture({ size: { width: w, height: h }, format: ACCUM_FMT, usage });

    blurBGh = device.createBindGroup({
      layout: blurPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accumTex.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: blurUniH } },
      ],
    });
    blurBGv = device.createBindGroup({
      layout: blurPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: blurTexA.createView() },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: blurUniV } },
      ],
    });
    compBG = device.createBindGroup({
      layout: compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accumTex.createView() },
        { binding: 1, resource: blurTexB.createView() },
        { binding: 2, resource: sampler },
        { binding: 3, resource: { buffer: compUni } },
      ],
    });

    device.queue.writeBuffer(blurUniH, 0, new Float32Array([2.0 / w, 0, 0, 0]));
    device.queue.writeBuffer(blurUniV, 0, new Float32Array([0, 2.0 / h, 0, 0]));
  }

  function resize(w: number, h: number, dpr: number): void {
    const pw = Math.max(2, Math.floor(w * dpr));
    const ph = Math.max(2, Math.floor(h * dpr));
    canvas.width = pw;
    canvas.height = ph;
    makeTargets(pw, ph);
  }

  {
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const rect = canvas.getBoundingClientRect();
    resize(rect.width || 1280, rect.height || 720, dpr);
  }

  // ── mutable ring-emitter cursor ────────────────────────────────────────────
  let cursor = 0;
  let destroyed = false;

  function step(a: StepArgs): void {
    if (destroyed || !accumTex || !blurTexA || !blurTexB || !compBG || !blurBGh || !blurBGv) return;

    const spawn = Math.max(0, Math.min(N, Math.floor(a.spawn)));
    // pack sim uniform
    simArr[0] = a.dt;
    simArr[1] = a.time;
    simArr[2] = Math.min(1, Math.max(0, a.convergence));
    simArr[3] = N;
    simArr[4] = cursor;
    simArr[5] = spawn;
    simArr[6] = (a.time * 0.618) % 1.0; // rolling spawn seed
    simArr[7] = 1 / PARTICLE_LIFE;
    simArr[8] = 0.55; // curl amplitude at convergence 0 (diffuse)
    simArr[9] = 0.14; // curl amplitude at convergence 1 (ordered tunnel)
    simArr[10] = a.reduced ? 1 : 0;
    simArr[11] = 0;
    device.queue.writeBuffer(simUni, 0, simArr);
    cursor = (cursor + spawn) % N;

    // composite exposure follows loudness; bloom + quantization fixed
    compArr[0] = 1.6 * a.brightness; // exposure
    compArr[1] = 1.5; // bloom gain
    compArr[2] = 8.0; // dither levels
    compArr[3] = 0;
    device.queue.writeBuffer(compUni, 0, compArr);

    const enc = device.createCommandEncoder();

    // 1) advect
    {
      const pass = enc.beginComputePass();
      pass.setPipeline(simPipe);
      pass.setBindGroup(0, simBG);
      pass.dispatchWorkgroups(Math.ceil(N / WORKGROUP));
      pass.end();
    }
    // 2) additive splat → accum (cleared each frame)
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: accumTex.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(splatPipe);
      pass.setBindGroup(0, splatBG);
      pass.draw(N);
      pass.end();
    }
    // 3) blur H accum → blurA
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: blurTexA.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(blurPipe);
      pass.setBindGroup(0, blurBGh);
      pass.draw(3);
      pass.end();
    }
    // 4) blur V blurA → blurB
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view: blurTexB.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(blurPipe);
      pass.setBindGroup(0, blurBGv);
      pass.draw(3);
      pass.end();
    }
    // 5) composite → canvas
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: cctx.getCurrentTexture().createView(),
            clearValue: { r: 0.008, g: 0.006, b: 0.03, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(compPipe);
      pass.setBindGroup(0, compBG);
      pass.draw(3);
      pass.end();
    }

    device.queue.submit([enc.finish()]);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    try {
      partBuf.destroy();
      simUni.destroy();
      blurUniH.destroy();
      blurUniV.destroy();
      compUni.destroy();
      accumTex?.destroy();
      blurTexA?.destroy();
      blurTexB?.destroy();
    } catch {
      /* device may be gone */
    }
    device.destroy();
  }

  return { backend: "GPU", step, resize, destroy };
}
