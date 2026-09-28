"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 18304-murmuration · "What if you could STIR a living flock of your own
// recording — calm your hands and the swarm falls into coherent flight and the
// music comes clear and present; stir it into turbulence and the music
// dissolves into a diffuse, spectrally-blurred cloud?"
//
//   ~140,000 self-driven agents (position + heading) obey a mean-field Vicsek
//   rule on the GPU: each aligns to the average heading of its local neighbourhood
//   plus a NOISE term η. Your two hands (MediaPipe) are that noise term — the
//   faster you stir, the higher η, and above a critical value the flock's global
//   ORDER PARAMETER φ = |mean of unit heading vectors| collapses from coherent
//   flight (φ→1) into turbulence (φ→0). φ is reduced on the GPU into a small
//   bucket buffer and read back tiny + throttled.
//
//   φ CONDUCTS Karel's real piano: an equal-power crossfade between a DRY/clear
//   path (φ high) and a WET/diffuse path — a convolver whose impulse response is
//   built from a decaying slice of the SAME take, plus a lowpass that closes as
//   turbulence rises (φ low). High order = clear/present; low order = a spectrally
//   blurred, reverberant cloud.
//
//   Render: additive thermal points on near-black with frame-feedback trails —
//   a blackbody ramp (ember-crimson → gold → white-hot) keyed to per-agent
//   turbulence. WebGPU compute is the whole point; a reduced Canvas2D CPU flock
//   is the mandatory graceful fallback (audio + hands still drive it).
//
//   Refs: Vicsek et al. 1995 (order parameter φ, noise-driven phase transition);
//   Reynolds 1987 (boids: alignment / cohesion / separation).
// ─────────────────────────────────────────────────────────────────────────────

const N_AGENTS = 140_000;
const GRID_MAX = 640; // flow-field resolution (long edge)
const N_BUCKETS = 1024; // order-parameter reduction buckets
const FIELD_FP = 1024; // fixed-point scale for the atomic flow field
const ORDER_FP = 4096; // fixed-point scale for the order accumulator

const N_CPU = 2600; // reduced fallback flock

// ── shared control surface (identical for GPU + CPU + demo drive) ────────────

interface HandState {
  x: number; // normalized [0,1]
  y: number; // normalized [0,1]
  vx: number; // normalized units / second
  vy: number;
  active: number; // 1 active, 0 not
}

interface Controls {
  dt: number;
  time: number;
  moveSpeed: number;
  alignStrength: number;
  noiseAmp: number;
  hands: [HandState, HandState];
}

interface FlockBundle {
  kind: "gpu" | "cpu";
  gridW: number;
  gridH: number;
  stepAndDraw: (c: Controls) => void;
  getOrder: () => number;
  destroy: () => void;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const SIM_STRUCT = /* wgsl */ `
struct Sim {
  size: vec2<f32>,
  nAgents: f32,
  dt: f32,
  time: f32,
  moveSpeed: f32,
  alignStrength: f32,
  noiseAmp: f32,
  fieldFP: f32,
  orderFP: f32,
  nBuckets: f32,
  maxDim: f32,
  pushK: f32,
  localNoiseK: f32,
  handTurnK: f32,
  pad: f32,
};
struct Hands { data: array<vec4<f32>, 4> };
`;

const HELPERS_WGSL = /* wgsl */ `
fn hash(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u); x = x * 0x7feb352du;
  x = x ^ (x >> 15u); x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}
fn wrapCell(ix: i32, iy: i32, W: i32, H: i32) -> i32 {
  var x = ix % W; if (x < 0) { x = x + W; }
  var y = iy % H; if (y < 0) { y = y + H; }
  return y * W + x;
}
fn angWrap(a: f32) -> f32 { return atan2(sin(a), cos(a)); }
`;

// Pass 0 — clear the atomic flow field (both channels).
const CLEAR_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> field: array<atomic<i32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let total = u32(S.size.x) * u32(S.size.y) * 2u;
  let i = gid.x;
  if (i >= total) { return; }
  atomicStore(&field[i], 0);
}`;

// Pass 1 — every agent deposits its unit heading vector into its field cell.
const DEPOSIT_WGSL = /* wgsl */ `
${SIM_STRUCT}
${HELPERS_WGSL}
struct Agent { pos: vec2<f32>, heading: f32, pad: f32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read> agents: array<Agent>;
@group(0) @binding(2) var<storage, read_write> field: array<atomic<i32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(S.nAgents)) { return; }
  let a = agents[i];
  let W = i32(S.size.x); let H = i32(S.size.y);
  let c = wrapCell(i32(floor(a.pos.x)), i32(floor(a.pos.y)), W, H);
  atomicAdd(&field[c * 2],     i32(cos(a.heading) * S.fieldFP));
  atomicAdd(&field[c * 2 + 1], i32(sin(a.heading) * S.fieldFP));
}`;

// Pass 2 — Vicsek update: align to the local mean heading + noise η + hand
// stirring, move, then reduce heading into the order buckets.
const MOVE_WGSL = /* wgsl */ `
${SIM_STRUCT}
${HELPERS_WGSL}
struct Agent { pos: vec2<f32>, heading: f32, pad: f32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read> field: array<i32>;
@group(0) @binding(3) var<uniform> hands: Hands;
@group(0) @binding(4) var<storage, read_write> order: array<atomic<i32>>;

fn fval(ix: i32, iy: i32, W: i32, H: i32) -> vec2<f32> {
  let c = wrapCell(ix, iy, W, H);
  return vec2<f32>(f32(field[c * 2]), f32(field[c * 2 + 1])) / S.fieldFP;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(S.nAgents)) { return; }
  var a = agents[i];
  let W = i32(S.size.x); let H = i32(S.size.y);
  let cx = i32(floor(a.pos.x)); let cy = i32(floor(a.pos.y));

  // local mean heading over a 3x3 neighbourhood (mean-field Vicsek alignment)
  var acc = vec2<f32>(0.0, 0.0);
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      acc = acc + fval(cx + dx, cy + dy, W, H);
    }
  }
  let mag = length(acc);
  let meanAngle = atan2(acc.y, acc.x);

  var h = a.heading;
  if (mag > 0.001) {
    let d = angWrap(meanAngle - h);
    h = h + d * S.alignStrength;
  }

  // Vicsek noise term η (global stirring energy from the hands)
  let seed = i * 2654435761u + u32(S.time * 90.0);
  h = h + (hash(seed) - 0.5) * S.noiseAmp;

  // hand stirring: local advection + local turbulence, and a positional push
  var handHeat = 0.0;
  for (var k = 0u; k < 2u; k = k + 1u) {
    let pv = hands.data[k * 2u];
    let meta = hands.data[k * 2u + 1u];
    if (meta.x < 0.5) { continue; }
    let hp = pv.xy * S.size;
    let hv = pv.zw * S.size; // grid units / second
    let radius = meta.y * S.maxDim;
    var d = a.pos - hp;
    d.x = d.x - S.size.x * round(d.x / S.size.x);
    d.y = d.y - S.size.y * round(d.y / S.size.y);
    let dist = length(d);
    if (dist < radius) {
      let prox = 1.0 - dist / radius;
      let hs = length(hv);
      if (hs > 0.001) {
        let va = atan2(hv.y, hv.x);
        h = h + angWrap(va - h) * prox * S.handTurnK * clamp(hs / S.maxDim * 4.0, 0.0, 1.0);
        h = h + (hash(seed ^ 0x9e3779b9u) - 0.5) * prox * hs / S.maxDim * S.localNoiseK;
        a.pos = a.pos + hv * prox * S.dt * S.pushK;
        handHeat = max(handHeat, prox * clamp(hs / S.maxDim * 3.0, 0.0, 1.0));
      }
    }
  }

  // advance (self-driven, constant speed) with toroidal wrap
  var np = a.pos + vec2<f32>(cos(h), sin(h)) * S.moveSpeed;
  np.x = np.x - floor(np.x / S.size.x) * S.size.x;
  np.y = np.y - floor(np.y / S.size.y) * S.size.y;

  // per-agent turbulence for the thermal colour ramp
  var turb = 1.0;
  if (mag > 0.001) { turb = 0.5 * (1.0 - cos(angWrap(h - meanAngle))); }
  turb = clamp(max(turb, handHeat), 0.0, 1.0);

  a.pos = np;
  a.heading = h;
  a.pad = turb;
  agents[i] = a;

  // reduce heading into a bucket for the global order parameter φ
  let b = (i % u32(S.nBuckets)) * 2u;
  atomicAdd(&order[b],      i32(cos(h) * S.orderFP));
  atomicAdd(&order[b + 1u], i32(sin(h) * S.orderFP));
}`;

// Fade pass — copy the previous frame dimmed (feedback trails).
const FADE_WGSL = /* wgsl */ `
struct RU { vpW: f32, vpH: f32, radius: f32, order: f32, exposure: f32, fade: f32, p0: f32, p1: f32 };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var prev: texture_2d<f32>;
@group(0) @binding(2) var<uniform> R: RU;
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(prev, samp, in.uv, 0.0);
  return vec4<f32>(c.rgb * R.fade, 1.0);
}`;

// Points pass — additive thermal blackbody splats, one instanced quad per agent.
const POINTS_WGSL = /* wgsl */ `
${SIM_STRUCT}
struct RU { vpW: f32, vpH: f32, radius: f32, order: f32, exposure: f32, fade: f32, p0: f32, p1: f32 };
struct Agent { pos: vec2<f32>, heading: f32, pad: f32 };
@group(0) @binding(0) var<storage, read> agents: array<Agent>;
@group(0) @binding(1) var<uniform> S: Sim;
@group(0) @binding(2) var<uniform> R: RU;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) col: vec3<f32> };

fn thermal(t: f32) -> vec3<f32> {
  let ember = vec3<f32>(0.42, 0.045, 0.02);
  let gold  = vec3<f32>(1.05, 0.58, 0.12);
  let white = vec3<f32>(1.45, 1.32, 1.08);
  if (t < 0.5) { return mix(ember, gold, t / 0.5); }
  return mix(gold, white, (t - 0.5) / 0.5);
}

@vertex
fn vmain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0),
    vec2<f32>(-1.0,1.0),  vec2<f32>(1.0,-1.0), vec2<f32>(1.0,1.0));
  let a = agents[ii];
  let ndc = vec2<f32>(a.pos.x / S.size.x * 2.0 - 1.0, 1.0 - a.pos.y / S.size.y * 2.0);
  let corner = corners[vi];
  let off = corner * vec2<f32>(R.radius / R.vpW, R.radius / R.vpH) * 2.0;
  var o: VOut;
  o.pos = vec4<f32>(ndc + off, 0.0, 1.0);
  o.uv = corner;
  o.col = thermal(clamp(a.pad + (1.0 - R.order) * 0.15, 0.0, 1.0));
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  let alpha = smoothstep(1.0, 0.0, d);
  let intensity = 0.55;
  return vec4<f32>(in.col * alpha * intensity, alpha * intensity);
}`;

// Present pass — tonemap the HDR accumulation texture onto the canvas.
const PRESENT_WGSL = /* wgsl */ `
struct RU { vpW: f32, vpH: f32, radius: f32, order: f32, exposure: f32, fade: f32, p0: f32, p1: f32 };
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> R: RU;
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let hdr = textureSampleLevel(tex, samp, in.uv, 0.0).rgb;
  let mapped = vec3<f32>(1.0) - exp(-hdr * R.exposure);
  let bg = vec3<f32>(0.012, 0.010, 0.014);
  var col = bg + pow(clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(0.85));
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

// ── GPU init ─────────────────────────────────────────────────────────────────

function computeGrid(): [number, number] {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 720;
  const aspect = w / h;
  let gw: number;
  let gh: number;
  if (aspect >= 1) {
    gw = GRID_MAX;
    gh = Math.round(GRID_MAX / aspect);
  } else {
    gh = GRID_MAX;
    gw = Math.round(GRID_MAX * aspect);
  }
  gw = Math.max(64, gw);
  gh = Math.max(64, gh);
  return [gw, gh];
}

async function initGpu(canvas: HTMLCanvasElement): Promise<FlockBundle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const [gridW, gridH] = computeGrid();
  const nCells = gridW * gridH;
  const maxDim = Math.max(gridW, gridH);

  // agents: pos.xy, heading, pad(turbulence) — 16 bytes
  const agentData = new Float32Array(N_AGENTS * 4);
  for (let i = 0; i < N_AGENTS; i++) {
    agentData[i * 4] = Math.random() * gridW;
    agentData[i * 4 + 1] = Math.random() * gridH;
    agentData[i * 4 + 2] = Math.random() * Math.PI * 2;
    agentData[i * 4 + 3] = 0;
  }
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData as BufferSource);

  const fieldBuf = device.createBuffer({
    size: nCells * 2 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const orderBuf = device.createBuffer({
    size: N_BUCKETS * 2 * 4,
    usage:
      GPUBufferUsage.STORAGE |
      GPUBufferUsage.COPY_DST |
      GPUBufferUsage.COPY_SRC,
  });
  const orderZero = new Int32Array(N_BUCKETS * 2);
  const stagingBuf = device.createBuffer({
    size: N_BUCKETS * 2 * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const simBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const handsBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const ruBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const clearPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: CLEAR_WGSL }), entryPoint: "main" },
  });
  const depositPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: DEPOSIT_WGSL }), entryPoint: "main" },
  });
  const movePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: MOVE_WGSL }), entryPoint: "main" },
  });

  const HDR: GPUTextureFormat = "rgba16float";
  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const pointsMod = device.createShaderModule({ code: POINTS_WGSL });
  const presentMod = device.createShaderModule({ code: PRESENT_WGSL });

  const fadePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vmain" },
    fragment: { module: fadeMod, entryPoint: "fmain", targets: [{ format: HDR }] },
    primitive: { topology: "triangle-list" },
  });
  const pointsPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: pointsMod, entryPoint: "vmain" },
    fragment: {
      module: pointsMod,
      entryPoint: "fmain",
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
  const presentPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: presentMod, entryPoint: "vmain" },
    fragment: { module: presentMod, entryPoint: "fmain", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const clearBG = device.createBindGroup({
    layout: clearPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: fieldBuf } },
    ],
  });
  const depositBG = device.createBindGroup({
    layout: depositPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: agentBuf } },
      { binding: 2, resource: { buffer: fieldBuf } },
    ],
  });
  const moveBG = device.createBindGroup({
    layout: movePipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: agentBuf } },
      { binding: 2, resource: { buffer: fieldBuf } },
      { binding: 3, resource: { buffer: handsBuf } },
      { binding: 4, resource: { buffer: orderBuf } },
    ],
  });
  const pointsBG = device.createBindGroup({
    layout: pointsPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: agentBuf } },
      { binding: 1, resource: { buffer: simBuf } },
      { binding: 2, resource: { buffer: ruBuf } },
    ],
  });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  // ping-pong HDR accumulation targets (rebuilt on resize)
  let tex: [GPUTexture, GPUTexture] | null = null;
  let fadeBG: [GPUBindGroup, GPUBindGroup] | null = null;
  let presentBG: [GPUBindGroup, GPUBindGroup] | null = null;
  let texW = 0;
  let texH = 0;

  const rebuildTargets = () => {
    const w = Math.max(2, canvas.width);
    const h = Math.max(2, canvas.height);
    if (w === texW && h === texH && tex) return;
    texW = w;
    texH = h;
    tex?.[0].destroy();
    tex?.[1].destroy();
    const mk = () =>
      device.createTexture({
        size: { width: w, height: h },
        format: HDR,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    tex = [mk(), mk()];
    const mkFade = (i: 0 | 1) =>
      device.createBindGroup({
        layout: fadePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: tex![i].createView() },
          { binding: 2, resource: { buffer: ruBuf } },
        ],
      });
    const mkPresent = (i: 0 | 1) =>
      device.createBindGroup({
        layout: presentPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: tex![i].createView() },
          { binding: 2, resource: { buffer: ruBuf } },
        ],
      });
    fadeBG = [mkFade(0), mkFade(1)];
    presentBG = [mkPresent(0), mkPresent(1)];
  };
  rebuildTargets();

  const sim = new Float32Array(16);
  const handsArr = new Float32Array(16);
  const ru = new Float32Array(8);

  let cur: 0 | 1 = 0;
  let orderValue = 0.85;
  let mapPending = false;
  let frameNo = 0;
  const agentGroups = Math.ceil(N_AGENTS / 64);
  const clearGroups = Math.ceil((nCells * 2) / 64);

  const stepAndDraw = (c: Controls) => {
    rebuildTargets();
    if (!tex || !fadeBG || !presentBG) return;

    sim[0] = gridW;
    sim[1] = gridH;
    sim[2] = N_AGENTS;
    sim[3] = c.dt;
    sim[4] = c.time;
    sim[5] = c.moveSpeed;
    sim[6] = c.alignStrength;
    sim[7] = c.noiseAmp;
    sim[8] = FIELD_FP;
    sim[9] = ORDER_FP;
    sim[10] = N_BUCKETS;
    sim[11] = maxDim;
    sim[12] = 0.9; // pushK
    sim[13] = 1.4; // localNoiseK
    sim[14] = 0.6; // handTurnK
    sim[15] = 0;
    device.queue.writeBuffer(simBuf, 0, sim as BufferSource);

    for (let k = 0; k < 2; k++) {
      const hnd = c.hands[k];
      handsArr[k * 8] = hnd.x;
      handsArr[k * 8 + 1] = hnd.y;
      handsArr[k * 8 + 2] = hnd.vx;
      handsArr[k * 8 + 3] = hnd.vy;
      handsArr[k * 8 + 4] = hnd.active;
      handsArr[k * 8 + 5] = 0.28; // stir radius (normalized)
      handsArr[k * 8 + 6] = 0;
      handsArr[k * 8 + 7] = 0;
    }
    device.queue.writeBuffer(handsBuf, 0, handsArr as BufferSource);

    ru[0] = texW;
    ru[1] = texH;
    ru[2] = 2.2; // point radius px
    ru[3] = orderValue;
    ru[4] = 1.35; // exposure
    ru[5] = 0.9; // trail fade
    ru[6] = 0;
    ru[7] = 0;
    device.queue.writeBuffer(ruBuf, 0, ru as BufferSource);

    device.queue.writeBuffer(orderBuf, 0, orderZero as BufferSource);

    const nxt = (1 - cur) as 0 | 1;
    const enc = device.createCommandEncoder();

    const clearPass = enc.beginComputePass();
    clearPass.setPipeline(clearPipe);
    clearPass.setBindGroup(0, clearBG);
    clearPass.dispatchWorkgroups(clearGroups);
    clearPass.end();

    const depositPass = enc.beginComputePass();
    depositPass.setPipeline(depositPipe);
    depositPass.setBindGroup(0, depositBG);
    depositPass.dispatchWorkgroups(agentGroups);
    depositPass.end();

    const movePass = enc.beginComputePass();
    movePass.setPipeline(movePipe);
    movePass.setBindGroup(0, moveBG);
    movePass.dispatchWorkgroups(agentGroups);
    movePass.end();

    // fade previous frame + additive points into the next HDR target
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view: tex[nxt].createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(fadePipe);
    rp.setBindGroup(0, fadeBG[cur]);
    rp.draw(3);
    rp.setPipeline(pointsPipe);
    rp.setBindGroup(0, pointsBG);
    rp.draw(6, N_AGENTS);
    rp.end();

    // present to canvas
    const view = ctx.getCurrentTexture().createView();
    const pp = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    pp.setPipeline(presentPipe);
    pp.setBindGroup(0, presentBG[nxt]);
    pp.draw(3);
    pp.end();

    // throttled, tiny order-parameter readback (never per-frame, never stalling)
    frameNo++;
    const wantReadback = !mapPending && frameNo % 5 === 0;
    if (wantReadback) {
      enc.copyBufferToBuffer(orderBuf, 0, stagingBuf, 0, N_BUCKETS * 2 * 4);
    }
    device.queue.submit([enc.finish()]);

    if (wantReadback) {
      mapPending = true;
      stagingBuf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const arr = new Int32Array(stagingBuf.getMappedRange().slice(0));
          let sc = 0;
          let ss = 0;
          for (let b = 0; b < N_BUCKETS; b++) {
            sc += arr[b * 2];
            ss += arr[b * 2 + 1];
          }
          stagingBuf.unmap();
          const phi = Math.hypot(sc, ss) / ORDER_FP / N_AGENTS;
          orderValue = Math.min(1, Math.max(0, phi));
          mapPending = false;
        })
        .catch(() => {
          mapPending = false;
        });
    }

    cur = nxt;
  };

  return {
    kind: "gpu",
    gridW,
    gridH,
    stepAndDraw,
    getOrder: () => orderValue,
    destroy: () => {
      agentBuf.destroy();
      fieldBuf.destroy();
      orderBuf.destroy();
      stagingBuf.destroy();
      simBuf.destroy();
      handsBuf.destroy();
      ruBuf.destroy();
      tex?.[0].destroy();
      tex?.[1].destroy();
      device.destroy();
    },
  };
}

// ── CPU fallback flock (Canvas2D, reduced) ───────────────────────────────────

function initCpu(canvas: HTMLCanvasElement): FlockBundle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const GW = 48;
  const GH = 27;
  const px = new Float32Array(N_CPU);
  const py = new Float32Array(N_CPU);
  const ph = new Float32Array(N_CPU);
  const pt = new Float32Array(N_CPU); // turbulence
  for (let i = 0; i < N_CPU; i++) {
    px[i] = Math.random();
    py[i] = Math.random();
    ph[i] = Math.random() * Math.PI * 2;
  }
  const binC = new Float32Array(GW * GH);
  const binS = new Float32Array(GW * GH);
  let orderValue = 0.85;

  const thermal = (t: number): string => {
    const c = t < 0.5 ? t / 0.5 : 1;
    const c2 = t < 0.5 ? 0 : (t - 0.5) / 0.5;
    const r = 0.42 + (1.05 - 0.42) * c + (1.45 - 1.05) * c2;
    const g = 0.045 + (0.58 - 0.045) * c + (1.32 - 0.58) * c2;
    const b = 0.02 + (0.12 - 0.02) * c + (1.08 - 0.12) * c2;
    return `rgba(${Math.min(255, r * 255) | 0},${Math.min(255, g * 255) | 0},${Math.min(255, b * 255) | 0},0.65)`;
  };

  const stepAndDraw = (c: Controls) => {
    const W = canvas.width;
    const H = canvas.height;
    const speed = c.moveSpeed * 0.004;

    binC.fill(0);
    binS.fill(0);
    for (let i = 0; i < N_CPU; i++) {
      const bx = Math.min(GW - 1, Math.max(0, (px[i] * GW) | 0));
      const by = Math.min(GH - 1, Math.max(0, (py[i] * GH) | 0));
      const b = by * GW + bx;
      binC[b] += Math.cos(ph[i]);
      binS[b] += Math.sin(ph[i]);
    }

    let sc = 0;
    let ss = 0;
    for (let i = 0; i < N_CPU; i++) {
      const bx = Math.min(GW - 1, Math.max(0, (px[i] * GW) | 0));
      const by = Math.min(GH - 1, Math.max(0, (py[i] * GH) | 0));
      const b = by * GW + bx;
      const mc = binC[b];
      const ms = binS[b];
      const mag = Math.hypot(mc, ms);
      let h = ph[i];
      let mean = h;
      if (mag > 0.001) {
        mean = Math.atan2(ms, mc);
        let d = mean - h;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        h += d * c.alignStrength;
      }
      h += (Math.random() - 0.5) * c.noiseAmp;

      let heat = 0;
      for (let k = 0; k < 2; k++) {
        const hnd = c.hands[k];
        if (hnd.active < 0.5) continue;
        let dx = px[i] - hnd.x;
        let dy = py[i] - hnd.y;
        dx -= Math.round(dx);
        dy -= Math.round(dy);
        const dist = Math.hypot(dx, dy);
        const radius = 0.28;
        if (dist < radius) {
          const prox = 1 - dist / radius;
          const hs = Math.hypot(hnd.vx, hnd.vy);
          if (hs > 0.001) {
            const va = Math.atan2(hnd.vy, hnd.vx);
            let dd = va - h;
            dd = Math.atan2(Math.sin(dd), Math.cos(dd));
            h += dd * prox * 0.6 * Math.min(1, hs * 4);
            h += (Math.random() - 0.5) * prox * hs * 1.4;
            px[i] += hnd.vx * prox * c.dt * 0.9;
            py[i] += hnd.vy * prox * c.dt * 0.9;
            heat = Math.max(heat, prox * Math.min(1, hs * 3));
          }
        }
      }

      let nx = px[i] + Math.cos(h) * speed;
      let ny = py[i] + Math.sin(h) * speed;
      nx -= Math.floor(nx);
      ny -= Math.floor(ny);

      let turb = 1;
      if (mag > 0.001) {
        turb = 0.5 * (1 - Math.cos(Math.atan2(Math.sin(h - mean), Math.cos(h - mean))));
      }
      pt[i] = Math.min(1, Math.max(0, Math.max(turb, heat)));

      px[i] = nx;
      py[i] = ny;
      ph[i] = h;
      sc += Math.cos(h);
      ss += Math.sin(h);
    }
    orderValue = Math.min(1, Math.hypot(sc, ss) / N_CPU);

    // draw: dark fade for trails, then additive thermal dots
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(3,3,4,0.22)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N_CPU; i++) {
      ctx.fillStyle = thermal(pt[i]);
      ctx.fillRect(px[i] * W - 1.5, py[i] * H - 1.5, 3, 3);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  return {
    kind: "cpu",
    gridW: GW,
    gridH: GH,
    stepAndDraw,
    getOrder: () => orderValue,
    destroy: () => {},
  };
}

// ── demo drive (autonomous virtual stirring hands, Lissajous) ────────────────

function computeDemoHands(t: number): [HandState, HandState] {
  // time-varying speed so φ visibly rises (calm) and falls (turbulent)
  const rush = 0.5 + 0.5 * Math.sin(t * 0.18); // 0 calm … 1 fast
  const spd = 0.25 + rush * 1.15;
  const mk = (phase: number): HandState => {
    const x = 0.5 + 0.28 * Math.sin(t * spd + phase);
    const y = 0.5 + 0.24 * Math.sin(t * spd * 1.37 + phase * 1.7);
    // analytic velocity (d/dt) in normalized units per second
    const vx = 0.28 * spd * Math.cos(t * spd + phase);
    const vy = 0.24 * spd * 1.37 * Math.cos(t * spd * 1.37 + phase * 1.7);
    return { x, y, vx: vx * rush, vy: vy * rush, active: 1 };
  };
  return [mk(0), mk(Math.PI)];
}

// ── component ────────────────────────────────────────────────────────────────

type TrackingMode = "demo" | "live" | "lost";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bundleRef = useRef<FlockBundle | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const lpRef = useRef<BiquadFilterNode | null>(null);
  const panRef = useRef<StereoPannerNode | null>(null);

  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);
  const handPrevRef = useRef<
    { x: number; y: number; t: number; has: boolean }[]
  >([
    { x: 0, y: 0, t: 0, has: false },
    { x: 0, y: 0, t: 0, has: false },
  ]);
  const trackModeRef = useRef<TrackingMode>("demo");

  const lastTsRef = useRef(0);
  const simTimeRef = useRef(0);
  const orderSmoothRef = useRef(0.85);
  const noiseSmoothRef = useRef(0.12);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const trackRef = useRef(track);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const [gpuStatus, setGpuStatus] = useState<"checking" | "gpu" | "cpu">(
    "checking",
  );
  const [trackMode, setTrackMode] = useState<TrackingMode>("demo");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderUi, setOrderUi] = useState(0.85);
  const [showNotes, setShowNotes] = useState(false);

  const { immersive, toggle } = useImmersive();

  // ── init substrate + always-on render loop ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(r.width * dpr));
      canvas.height = Math.max(2, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    let uiTick = 0;

    (async () => {
      let bundle: FlockBundle | null = null;
      try {
        bundle = await initGpu(canvas);
      } catch {
        bundle = null;
      }
      if (cancelled) {
        bundle?.destroy();
        return;
      }
      if (bundle) {
        setGpuStatus("gpu");
      } else {
        bundle = initCpu(canvas);
        setGpuStatus("cpu");
      }
      if (!bundle) return;
      bundleRef.current = bundle;

      const frame = (ts: number) => {
        rafRef.current = requestAnimationFrame(frame);
        if (lastTsRef.current === 0) lastTsRef.current = ts;
        let dt = (ts - lastTsRef.current) / 1000;
        lastTsRef.current = ts;
        if (dt <= 0 || dt > 0.05) dt = 0.016;
        simTimeRef.current += dt;
        const t = simTimeRef.current;

        // ── gather stirring hands ──────────────────────────────────────────
        let hands: [HandState, HandState];
        let mode: TrackingMode;

        const tracker = trackerRef.current;
        const video = videoRef.current;
        if (
          cameraOnRef.current &&
          tracker &&
          video &&
          video.readyState >= 2
        ) {
          let res: { landmarks: { x: number; y: number; z: number }[][] } | null =
            null;
          try {
            res = tracker.detectForVideo(video, performance.now());
          } catch {
            res = null;
          }
          const lms = res?.landmarks ?? [];
          const out: HandState[] = [];
          for (let i = 0; i < 2; i++) {
            const prev = handPrevRef.current[i];
            if (i < lms.length && lms[i]) {
              const f = computeHandFeatures(lms[i]);
              // map mirrored [-1.2,1.2] → normalized [0,1]
              const nx = f.cx / 1.2 / 2 + 0.5;
              const ny = 1 - (f.cy / 1.2 / 2 + 0.5);
              let vx = 0;
              let vy = 0;
              if (prev.has) {
                const pdt = Math.max(0.008, (t - prev.t));
                vx = (nx - prev.x) / pdt;
                vy = (ny - prev.y) / pdt;
              }
              prev.x = nx;
              prev.y = ny;
              prev.t = t;
              prev.has = true;
              out.push({ x: nx, y: ny, vx, vy, active: 1 });
            } else {
              prev.has = false;
              out.push({ x: 0.5, y: 0.5, vx: 0, vy: 0, active: 0 });
            }
          }
          hands = [out[0], out[1]];
          mode = lms.length > 0 ? "live" : "lost";
        } else {
          hands = computeDemoHands(t);
          mode = "demo";
        }

        if (mode !== trackModeRef.current) {
          trackModeRef.current = mode;
          setTrackMode(mode);
        }

        // stirring energy → Vicsek noise η (the order↔disorder control param)
        let stir = 0;
        for (const h of hands) {
          if (h.active > 0.5) stir += Math.hypot(h.vx, h.vy);
        }
        const noiseTarget = Math.min(2.8, 0.12 + stir * 1.05);
        noiseSmoothRef.current += (noiseTarget - noiseSmoothRef.current) * 0.15;

        const controls: Controls = {
          dt,
          time: t,
          moveSpeed: bundle!.kind === "gpu" ? 1.6 : 1.0,
          alignStrength: 0.42,
          noiseAmp: noiseSmoothRef.current,
          hands,
        };

        bundle!.stepAndDraw(controls);

        // ── read the global order parameter φ and conduct the audio ─────────
        const phi = bundle!.getOrder();
        orderSmoothRef.current += (phi - orderSmoothRef.current) * 0.08;
        const phiS = orderSmoothRef.current;

        const ac = ctxRef.current;
        if (
          phaseRef.current === "playing" &&
          ac &&
          dryRef.current &&
          wetRef.current &&
          lpRef.current &&
          panRef.current
        ) {
          const now = ac.currentTime;
          const angle = (1 - phiS) * (Math.PI / 2); // equal-power crossfade
          dryRef.current.gain.setTargetAtTime(Math.cos(angle), now, 0.08);
          wetRef.current.gain.setTargetAtTime(Math.sin(angle) * 1.1, now, 0.08);
          // lowpass on the wet/diffuse path closes as turbulence rises (φ low)
          const cutoff = 320 + phiS * phiS * 6800;
          lpRef.current.frequency.setTargetAtTime(cutoff, now, 0.1);
          // turbulence sways the stereo image
          const pan = Math.sin(t * 0.6) * (1 - phiS) * 0.85;
          panRef.current.pan.setTargetAtTime(pan, now, 0.12);
        }

        uiTick++;
        if (uiTick % 12 === 0) setOrderUi(phiS);
      };

      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      trackerRef.current?.close();
      trackerRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
      bundleRef.current?.destroy();
      bundleRef.current = null;
    };
  }, []);

  // ── audio: dry/clear + wet/diffuse crossfade, all into safeMaster ──────────
  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }

      const wh = await loadRealTrackBuffer(ctx, trackRef.current.id);

      try {
        sourceRef.current?.stop();
      } catch {
        /* none */
      }
      sourceRef.current?.disconnect();

      // build a convolution impulse from a decaying ~2s slice of the SAME take
      const ir = buildImpulseFromBuffer(ctx, wh.buffer);

      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.loop = true;

      const dry = ctx.createGain();
      dry.gain.value = 1;
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 6000;
      lp.Q.value = 0.7;
      const pan = ctx.createStereoPanner();
      const wet = ctx.createGain();
      wet.gain.value = 0;

      // DRY / clear path
      src.connect(dry);
      dry.connect(master.input);
      // WET / diffuse path: convolver → lowpass → panner → wet gain
      src.connect(conv);
      conv.connect(lp);
      lp.connect(pan);
      pan.connect(wet);
      wet.connect(master.input);

      src.onended = () => {
        if (sourceRef.current === src) setPhase("idle");
      };
      src.start();

      sourceRef.current = src;
      dryRef.current = dry;
      wetRef.current = wet;
      lpRef.current = lp;
      panRef.current = pan;
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this recording.");
      setPhase("idle");
    }
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setPhase("idle");
  }, []);

  const enableCamera = useCallback(async () => {
    if (cameraOnRef.current || cameraBusy) return;
    setCameraBusy(true);
    setError(null);
    try {
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      await startCamera(video);
      streamRef.current = video.srcObject as MediaStream | null;
      const tracker = await createHandTracker(2);
      trackerRef.current = tracker;
      cameraOnRef.current = true;
    } catch {
      setError(
        "Camera or hand model unavailable — the demo drive keeps stirring the flock.",
      );
      cameraOnRef.current = false;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stopAudio();
    },
    [stopAudio],
  );

  const orderLabel =
    orderUi > 0.66 ? "coherent flight" : orderUi > 0.33 ? "unsettled" : "turbulent";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: "none" }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* tracking status line — always visible while the flock is stirred */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {trackMode === "live" && (
          <span className="text-muted-foreground">tracking · live</span>
        )}
        {trackMode === "lost" && (
          <span className="text-destructive">
            tracking lost · show both hands to the camera
          </span>
        )}
        {trackMode === "demo" && (
          <span className="text-primary">demo · autonomous stirring</span>
        )}
        <span className="ml-3 text-muted-foreground/70">
          φ {orderUi.toFixed(2)} · {orderLabel}
        </span>
      </div>

      {/* functional error notice — kept visible even in fullscreen */}
      {error && (
        <p className="pointer-events-none absolute inset-x-4 top-12 z-30 text-sm text-destructive">
          {error}
        </p>
      )}

      {!immersive && (
        <>
          {/* title block — a light overlay, never a big header */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-12">
            <header className="max-w-2xl space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                murmuration · stir a living flock of your recording
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Calm your hands and the swarm coheres — the music comes clear.
                Stir it to turbulence and the sound dissolves.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                {gpuStatus === "gpu"
                  ? "140,000 self-driven agents obey a Vicsek alignment rule on the GPU."
                  : gpuStatus === "cpu"
                    ? "WebGPU unavailable — reduced preview: a smaller CPU flock, same mechanism."
                    : "Starting the flock…"}{" "}
                Your two hands are the noise term η; the flock&apos;s global order
                parameter φ conducts an equal-power crossfade of Karel&apos;s piano
                between a clear/dry path and a diffuse/reverberant one.
              </p>
            </header>
          </div>

          {/* bottom control strip */}
          <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6 pb-16">
            {gpuStatus === "cpu" && (
              <p className="text-sm text-muted-foreground">
                WebGPU unavailable — reduced preview.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  track
                </span>
                <select
                  value={track.id}
                  onChange={(e) => onSelectTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {phase !== "playing" ? (
                <button
                  onClick={() => void play()}
                  disabled={phase === "loading"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading…" : `Play ${track.title}`}
                </button>
              ) : (
                <button
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Stop
                </button>
              )}

              <button
                onClick={() => void enableCamera()}
                disabled={cameraBusy || trackMode !== "demo"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                {cameraBusy
                  ? "Enabling camera…"
                  : trackMode === "demo"
                    ? "Stir with your hands"
                    : "Camera on"}
              </button>

              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
          </div>

          <PrototypeNav
            slugs={["18296-slowbloom", "18272-tidewell", "18264-gazehall"]}
          />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Murmuration"
        description="A living flock of ~140,000 self-driven agents obeys a Vicsek alignment rule on the GPU. Your two hands inject the noise term η: stir slowly and the flock's global order parameter φ climbs toward coherent flight; stir fast and it collapses into turbulence. φ conducts Karel's piano — high order plays clear and dry, low order dissolves into a diffuse, spectrally-blurred cloud."
        howTo={[
          "Stir slowly with both hands to calm the flock and hear the take come clear",
          "Stir fast to break the flock into turbulence and blur the sound",
          "Press f for fullscreen, i for info",
        ]}
      />

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Each agent carries a position and a heading and moves at constant
                speed — Vicsek&apos;s self-driven particle. Every frame it aligns
                its heading toward the mean heading of its local neighbourhood
                (read from a GPU flow-field of deposited unit vectors) and then
                adds a random noise kick of amplitude η. Below a critical η the
                flock self-organises into coherent flight; above it, order
                collapses into turbulence — the phase transition Vicsek et&nbsp;al.
                (1995) measured with the order parameter φ = |mean of the unit
                heading vectors|.
              </p>
              <p>
                <strong>Your hands are η.</strong> The faster you stir, the higher
                the noise term, so calm hands let φ climb toward 1 (coherent) and
                fast stirring drives φ toward 0 (turbulent). Hands also inject
                local advection and a positional push near where they move, so you
                can carve vortices into the swarm. φ is reduced on the GPU into
                1,024 buckets and read back tiny + throttled (never a per-frame
                stall).
              </p>
              <p>
                <strong>φ conducts the take.</strong> An equal-power crossfade
                (dry = cos, wet = sin of the same angle) moves the mix between a
                clear/dry path and a diffuse path — a convolver whose impulse
                response is a decaying slice of the SAME recording, then a lowpass
                that closes as turbulence rises and a stereo sway that widens with
                disorder. High φ = present and clear; low φ = a reverberant,
                spectrally-blurred cloud. Rate stays 1.0.
              </p>
              <p>
                <strong>Palette.</strong> A thermal blackbody ramp — near-black ink
                where the flock is sparse, deep ember-crimson for coherent flow,
                gold in dense streams, white-hot where vorticity spikes.
              </p>
              <p>
                <strong>References.</strong> Vicsek, Czirók, Ben-Jacob, Cohen &amp;
                Shochet (1995), <em>Novel type of phase transition in a system of
                self-driven particles</em> (Phys. Rev. Lett. 75:1226). Reynolds
                (1987), <em>Flocks, Herds and Schools: A Distributed Behavioral
                Model</em> (boids: alignment, cohesion, separation).
              </p>
              <p>
                <strong>Degrades.</strong> No WebGPU adapter → a reduced Canvas2D
                flock (&quot;WebGPU unavailable — reduced preview&quot;) with the
                identical hands → φ → audio chain. No camera / denied / model fail
                → a labelled autonomous demo drive keeps stirring.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── build a convolution impulse from a decaying slice of the same take ───────
function buildImpulseFromBuffer(
  ctx: AudioContext,
  src: AudioBuffer,
): AudioBuffer {
  const dur = Math.min(2, src.duration);
  const len = Math.max(1, Math.floor(dur * ctx.sampleRate));
  const nCh = Math.max(1, Math.min(2, src.numberOfChannels));
  const ir = ctx.createBuffer(nCh, len, ctx.sampleRate);
  // sample the slice from ~1/3 into the piece so it has body, not just an onset
  const srcLen = src.length;
  const start = Math.min(srcLen - len, Math.floor(srcLen / 3));
  for (let c = 0; c < nCh; c++) {
    const sc = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    const dst = ir.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.2); // exponential-ish decay tail
      const s = start + i >= 0 && start + i < srcLen ? sc[start + i] : 0;
      dst[i] = s * env;
    }
  }
  return ir;
}
