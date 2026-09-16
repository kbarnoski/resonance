// gpu.ts — raw WebGPU, the heart of "Commons".
//
// ~9,000+ particles live in a single GPU storage buffer. A WGSL @compute shader
// integrates them every frame: each particle is OWNED by one present listener
// (owner = i % activeCount) and is drawn toward that listener's on-screen locus.
// As the room's COHERENCE scalar rises, each particle's target LERPs from its
// owner locus toward the shared centroid, and a rotational curl-of-position flow
// binds the separate clouds so they visibly converge and TURN as one woven figure
// of light. Coherence falls → the clouds relax back to N distinct bodies.
//
// The render side deposits particles ADDITIVELY into a ping-pong rgba16float
// accumulation texture (slight per-frame decay → woven ribbon trails, no dots),
// then a fullscreen pass tonemaps that texture through a deliberately NEUTRAL
// graphite→slate→stone→silver→bone ramp with violet ONLY at the brightest,
// densest peaks — warmth-of-togetherness encoded as luminance/density, not hue.
// No film-grain / noise-overlay pass: additive trails + Reinhard tonemap only.
//
// WebGPU globals come from the ambient @webgpu/types (see ./webgpu.d.ts).

export const MAX_PRESENCES = 12;
const WG = 64;

// ── WGSL: shared noise helpers (ported from the hall field) ──────────────────
const NOISE_WGSL = /* wgsl */ `
fn hash2(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(p0: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var p = p0;
  for (var i = 0; i < 4; i = i + 1) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return s;
}
fn curl(p: vec2f) -> vec2f {
  let e = 0.08;
  let dx = fbm(p + vec2f(0.0, e)) - fbm(p - vec2f(0.0, e));
  let dy = fbm(p + vec2f(e, 0.0)) - fbm(p - vec2f(e, 0.0));
  return vec2f(dx, -dy) * (0.5 / e) * 0.2;
}`;

// ── WGSL: compute — weave the owned clouds by coherence ──────────────────────
const COMPUTE_WGSL = /* wgsl */ `
struct Sim {
  dt: f32, time: f32, activeCount: f32, coherence: f32,
  cx: f32, cy: f32, bass: f32, mid: f32,
  treble: f32, energy: f32, motion: f32, swirl: f32,
  bind: f32, damp: f32, attract: f32, aspect: f32,
};
@group(0) @binding(0) var<storage, read_write> state: array<vec4f>; // pos.xy vel.xy
@group(0) @binding(1) var<storage, read>       seed:  array<f32>;
@group(0) @binding(2) var<uniform>             u:     Sim;
@group(0) @binding(3) var<uniform>             pres:  array<vec4f, ${MAX_PRESENCES}>; // xy locus, z gentle, w bright

${NOISE_WGSL}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&state)) { return; }
  let ac = max(1u, u32(u.activeCount));
  let owner = i % ac;
  let loc = pres[owner].xy;
  let s = seed[i];
  let centroid = vec2f(u.cx, u.cy);

  var p = state[i].xy;
  var v = state[i].zw;

  // As coherence rises, the target slides from the owner's locus to the shared
  // centroid — separate clouds fuse into one figure.
  let k = clamp(u.coherence * u.bind, 0.0, 1.0);
  let tgt = mix(loc, centroid, k);
  v += (tgt - p) * u.attract * u.dt * 60.0;

  // Rotational curl-of-position flow around the centroid, gated by coherence:
  // the whole woven figure TURNS as one as the room aligns.
  let rel = p - centroid;
  let perp = vec2f(-rel.y, rel.x);
  v += perp * u.swirl * u.coherence * u.dt * 60.0;

  // Organic curl-noise weave + audio turbulence (frozen under reduced motion).
  let cn = curl(p * 3.0 + vec2f(s * 6.28, u.time * 0.05));
  v += cn * (0.015 + u.energy * 0.05) * u.motion;
  let j = vec2f(hash2(vec2f(s, u.time * 0.7)) - 0.5,
                hash2(vec2f(s + 3.1, u.time * 0.6)) - 0.5);
  v += j * u.energy * 0.028 * u.motion;

  // Bass lifts overall drive; damping keeps the field calm and laminar.
  v *= (1.0 + u.bass * 0.35);
  v *= u.damp;
  p += v * u.dt;

  // Soft reflective bounds so the ensemble stays on the wall.
  if (p.x < 0.0) { p.x = -p.x; v.x = -v.x * 0.5; }
  if (p.x > 1.0) { p.x = 2.0 - p.x; v.x = -v.x * 0.5; }
  if (p.y < 0.0) { p.y = -p.y; v.y = -v.y * 0.5; }
  if (p.y > 1.0) { p.y = 2.0 - p.y; v.y = -v.y * 0.5; }

  state[i] = vec4f(p, v);
}`;

// ── WGSL: particle deposit — additive point sprites into rgba16float ─────────
const PARTICLE_WGSL = /* wgsl */ `
struct RenderU {
  aspect: f32, count: f32, pointSize: f32, mid: f32,
  treble: f32, coherence: f32, energy: f32, time: f32,
};
@group(0) @binding(0) var<storage, read> state: array<vec4f>;
@group(0) @binding(1) var<uniform>       pres:  array<vec4f, ${MAX_PRESENCES}>;
@group(0) @binding(2) var<uniform>       u:     RenderU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) bright: f32,
};

const OFF = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0),  vec2f(1.0, -1.0), vec2f(1.0, 1.0)
);

@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  let pid = vi / 6u;
  let ci = vi % 6u;
  let ac = max(1u, u32(u.count));
  let owner = pid % ac;
  let st = state[pid];
  let uv = st.xy; // 0..1, y up
  var clip = vec2f(uv.x * 2.0 - 1.0, uv.y * 2.0 - 1.0);
  let o = OFF[ci];
  clip += vec2f(o.x * u.pointSize / max(u.aspect, 0.001), o.y * u.pointSize);
  var vo: VO;
  vo.pos = vec4f(clip, 0.0, 1.0);
  vo.uv = o;
  vo.bright = pres[owner].w;
  return vo;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  let fall = pow(1.0 - d, 2.0);
  // Deposit LUMINANCE (density is the message). Mid opens the body brightness.
  let base = 0.011 * (0.35 + u.mid * 1.0) * in.bright * fall;
  // Violet spark rides ONLY on the treble peaks, and only as the room coheres.
  let spark = base * (0.15 + u.treble * 1.5) * (0.25 + u.coherence);
  return vec4f(base, spark, 0.0, 1.0);
}`;

// ── WGSL: fullscreen fade (trail persistence) ────────────────────────────────
const FADE_WGSL = /* wgsl */ `
struct FadeU { decay: f32, p0: f32, p1: f32, p2: f32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: FadeU;

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dim = vec2f(textureDimensions(src));
  let uv = fc.xy / dim;
  return textureSampleLevel(src, samp, uv, 0.0) * u.decay;
}`;

// ── WGSL: tonemap — neutral ramp + violet peaks, Reinhard, vignette ──────────
const TONEMAP_WGSL = /* wgsl */ `
struct ToneU { exposure: f32, treble: f32, coherence: f32, time: f32 };
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: ToneU;

fn ramp(t: f32) -> vec3f {
  let c0 = vec3f(0.020, 0.022, 0.028); // near-black graphite
  let c1 = vec3f(0.120, 0.130, 0.160); // slate
  let c2 = vec3f(0.340, 0.350, 0.390); // stone
  let c3 = vec3f(0.620, 0.630, 0.670); // silver
  let c4 = vec3f(0.860, 0.870, 0.900); // bone highlight
  let c5 = vec3f(0.560, 0.360, 0.960); // violet brand accent (peaks only)
  if (t < 0.20) { return mix(c0, c1, t / 0.20); }
  if (t < 0.42) { return mix(c1, c2, (t - 0.20) / 0.22); }
  if (t < 0.62) { return mix(c2, c3, (t - 0.42) / 0.20); }
  if (t < 0.82) { return mix(c3, c4, (t - 0.62) / 0.20); }
  return mix(c4, c5, (t - 0.82) / 0.18);
}

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dim = vec2f(textureDimensions(src));
  let uv = fc.xy / dim;
  let d = textureSampleLevel(src, samp, uv, 0.0);
  let inten = d.r;
  let violetW = clamp(d.g / (d.r + 1e-3), 0.0, 1.0);

  var col = ramp(clamp(inten * 0.9, 0.0, 1.0));
  // extra violet only where the ensemble is bright AND coherent
  let peak = smoothstep(0.45, 1.1, inten) * violetW * (0.3 + u.coherence);
  col = mix(col, vec3f(0.560, 0.360, 0.960), clamp(peak, 0.0, 0.8));

  col *= pow(clamp(inten, 0.0, 1.6), 0.85) * u.exposure;
  col += vec3f(0.010, 0.011, 0.014); // faint neutral floor for the dark room

  let q = uv - 0.5;
  let vig = smoothstep(0.95, 0.30, length(q) * 1.22);
  col *= mix(0.5, 1.0, vig);
  col = col / (col + vec3f(0.85)); // Reinhard-ish tonemap
  col = pow(col, vec3f(0.9));
  return vec4f(col, 1.0);
}`;

// ── engine ───────────────────────────────────────────────────────────────────

export interface CommonsRenderParams {
  dt: number;
  time: number;
  presences: Float32Array; // MAX_PRESENCES * 4 (x, y, gentleness, brightness)
  activeCount: number;
  coherence: number;
  centroid: [number, number];
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  motion: number; // 0 = reduced-motion freeze, 1 = full drift/tremor
}

export interface CommonsGpu {
  readonly kind: "webgpu";
  render(p: CommonsRenderParams): void;
  resize(): void;
  dispose(): void;
}

const ACCUM_FORMAT: GPUTextureFormat = "rgba16float";

export async function initCommonsGpu(
  canvas: HTMLCanvasElement,
  count: number,
): Promise<CommonsGpu | null> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) return null;

  let device: GPUDevice;
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = nav.gpu.getPreferredCanvasFormat();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cw = 1;
  let ch = 1;
  const sizeCanvas = () => {
    const w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
    const h = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    cw = w;
    ch = h;
  };
  sizeCanvas();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const U = GPUBufferUsage;

  // ── particle state: scatter each particle near an initial synthetic locus ──
  const state0 = new Float32Array(count * 4);
  const seed0 = new Float32Array(count);
  const initLoci: [number, number][] = [];
  const initN = 6;
  for (let k = 0; k < initN; k++) {
    const a = (k / initN) * Math.PI * 2;
    initLoci.push([0.5 + 0.26 * Math.cos(a), 0.5 + 0.22 * Math.sin(a)]);
  }
  for (let i = 0; i < count; i++) {
    const [lx, ly] = initLoci[i % initN];
    const r = Math.sqrt(Math.random()) * 0.10;
    const th = Math.random() * Math.PI * 2;
    state0[i * 4 + 0] = lx + Math.cos(th) * r;
    state0[i * 4 + 1] = ly + Math.sin(th) * r;
    state0[i * 4 + 2] = 0;
    state0[i * 4 + 3] = 0;
    seed0[i] = Math.random();
  }

  const stateBuf = device.createBuffer({ size: count * 16, usage: U.STORAGE | U.COPY_DST });
  device.queue.writeBuffer(stateBuf, 0, state0);
  const seedBuf = device.createBuffer({ size: count * 4, usage: U.STORAGE | U.COPY_DST });
  device.queue.writeBuffer(seedBuf, 0, seed0);

  const simU = device.createBuffer({ size: 64, usage: U.UNIFORM | U.COPY_DST }); // 16 f32
  const presU = device.createBuffer({ size: MAX_PRESENCES * 16, usage: U.UNIFORM | U.COPY_DST });
  const renderU = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST }); // 8 f32
  const fadeU = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
  const toneU = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST }); // 4 f32

  // ── pipelines ──
  const computePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const particleMod = device.createShaderModule({ code: PARTICLE_WGSL });
  const particlePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: particleMod, entryPoint: "vs" },
    fragment: {
      module: particleMod,
      entryPoint: "fs",
      targets: [
        {
          format: ACCUM_FORMAT,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const fadePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vs" },
    fragment: { module: fadeMod, entryPoint: "fs", targets: [{ format: ACCUM_FORMAT }] },
    primitive: { topology: "triangle-list" },
  });

  const toneMod = device.createShaderModule({ code: TONEMAP_WGSL });
  const tonePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: toneMod, entryPoint: "vs" },
    fragment: { module: toneMod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  // ── ping-pong accumulation textures (recreated on resize) ──
  let accumA: GPUTexture;
  let accumB: GPUTexture;
  let viewA: GPUTextureView;
  let viewB: GPUTextureView;
  let fadeBGfromA: GPUBindGroup; // fade reads A → writes B
  let fadeBGfromB: GPUBindGroup; // fade reads B → writes A
  let toneBGA: GPUBindGroup;
  let toneBGB: GPUBindGroup;

  const makeTargets = () => {
    accumA?.destroy();
    accumB?.destroy();
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    accumA = device.createTexture({ size: [cw, ch], format: ACCUM_FORMAT, usage });
    accumB = device.createTexture({ size: [cw, ch], format: ACCUM_FORMAT, usage });
    viewA = accumA.createView();
    viewB = accumB.createView();
    fadeBGfromA = device.createBindGroup({
      layout: fadePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: viewA },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: fadeU } },
      ],
    });
    fadeBGfromB = device.createBindGroup({
      layout: fadePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: viewB },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: fadeU } },
      ],
    });
    toneBGA = device.createBindGroup({
      layout: tonePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: viewA },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: toneU } },
      ],
    });
    toneBGB = device.createBindGroup({
      layout: tonePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: viewB },
        { binding: 1, resource: sampler },
        { binding: 2, resource: { buffer: toneU } },
      ],
    });
  };
  makeTargets();

  // curr = the texture we deposit into this frame; prev is the other.
  let currIsB = true;

  const computeBG = device.createBindGroup({
    layout: computePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuf } },
      { binding: 1, resource: { buffer: seedBuf } },
      { binding: 2, resource: { buffer: simU } },
      { binding: 3, resource: { buffer: presU } },
    ],
  });
  const particleBG = device.createBindGroup({
    layout: particlePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuf } },
      { binding: 1, resource: { buffer: presU } },
      { binding: 2, resource: { buffer: renderU } },
    ],
  });

  const numGroups = Math.ceil(count / WG);
  const simArr = new Float32Array(16);
  const renderArr = new Float32Array(8);
  const fadeArr = new Float32Array(4);
  const toneArr = new Float32Array(4);
  const presArr = new Float32Array(MAX_PRESENCES * 4);

  let disposed = false;

  return {
    kind: "webgpu",

    render(p: CommonsRenderParams) {
      if (disposed) return;
      const aspect = cw / Math.max(1, ch);

      // uniforms
      simArr[0] = Math.min(0.05, p.dt);
      simArr[1] = p.time;
      simArr[2] = p.activeCount;
      simArr[3] = p.coherence;
      simArr[4] = p.centroid[0];
      simArr[5] = p.centroid[1];
      simArr[6] = p.bass;
      simArr[7] = p.mid;
      simArr[8] = p.treble;
      simArr[9] = p.energy;
      simArr[10] = p.motion;
      simArr[11] = 0.55; // swirl strength
      simArr[12] = 0.92; // bind: how far toward centroid coherence pulls
      simArr[13] = 0.90; // velocity damping
      simArr[14] = 0.045; // attraction to target
      simArr[15] = aspect;
      device.queue.writeBuffer(simU, 0, simArr);

      presArr.set(p.presences.subarray(0, MAX_PRESENCES * 4));
      device.queue.writeBuffer(presU, 0, presArr);

      renderArr[0] = aspect;
      renderArr[1] = p.activeCount;
      renderArr[2] = 0.012; // point size (clip units)
      renderArr[3] = p.mid;
      renderArr[4] = p.treble;
      renderArr[5] = p.coherence;
      renderArr[6] = p.energy;
      renderArr[7] = p.time;
      device.queue.writeBuffer(renderU, 0, renderArr);

      fadeArr[0] = 0.90; // trail persistence
      device.queue.writeBuffer(fadeU, 0, fadeArr);

      toneArr[0] = 1.05; // exposure
      toneArr[1] = p.treble;
      toneArr[2] = p.coherence;
      toneArr[3] = p.time;
      device.queue.writeBuffer(toneU, 0, toneArr);

      const currView = currIsB ? viewB : viewA;
      const fadeBG = currIsB ? fadeBGfromA : fadeBGfromB; // read prev → write curr
      const toneBG = currIsB ? toneBGB : toneBGA; // tonemap curr

      const enc = device.createCommandEncoder();

      // 1) compute: advance every particle
      const cp = enc.beginComputePass();
      cp.setPipeline(computePipe);
      cp.setBindGroup(0, computeBG);
      cp.dispatchWorkgroups(numGroups);
      cp.end();

      // 2) fade prev accumulation into curr (loadOp clear — we overwrite fully)
      const fp = enc.beginRenderPass({
        colorAttachments: [
          { view: currView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      fp.setPipeline(fadePipe);
      fp.setBindGroup(0, fadeBG);
      fp.draw(3);
      fp.end();

      // 3) deposit particles additively on top of the faded trail
      const dp = enc.beginRenderPass({
        colorAttachments: [{ view: currView, loadOp: "load", storeOp: "store" }],
      });
      dp.setPipeline(particlePipe);
      dp.setBindGroup(0, particleBG);
      dp.draw(count * 6);
      dp.end();

      // 4) tonemap curr → screen
      const view = ctx.getCurrentTexture().createView();
      const tp = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0.008, g: 0.009, b: 0.012, a: 1 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      tp.setPipeline(tonePipe);
      tp.setBindGroup(0, toneBG);
      tp.draw(3);
      tp.end();

      device.queue.submit([enc.finish()]);
      currIsB = !currIsB;
    },

    resize() {
      if (disposed) return;
      const w = Math.max(1, Math.floor((canvas.clientWidth || window.innerWidth) * dpr));
      const h = Math.max(1, Math.floor((canvas.clientHeight || window.innerHeight) * dpr));
      if (w === cw && h === ch) return;
      sizeCanvas();
      makeTargets();
    },

    dispose() {
      disposed = true;
      const bufs = [stateBuf, seedBuf, simU, presU, renderU, fadeU, toneU];
      for (const b of bufs) { try { b.destroy(); } catch { /* noop */ } }
      try { accumA.destroy(); } catch { /* noop */ }
      try { accumB.destroy(); } catch { /* noop */ }
      try { ctx.unconfigure(); } catch { /* noop */ }
      try { device.destroy(); } catch { /* noop */ }
    },
  };
}
