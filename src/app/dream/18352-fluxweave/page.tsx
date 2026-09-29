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
// 18352-fluxweave · "What if you could POUR your own recording into a body of
// flowing luminous light and HARMONIZE it with your two hands — pull your hands
// apart and the single piano take fans open into a chord of itself, a shimmering
// harmonic stack woven into the current; bring them together and it collapses
// back to a clear unison?"
//
//   AUDIO. Karel's real piano plays back at rate 1.0 — the source take is never
//   pitched or re-timed; it always sounds through a DRY path untouched. The
//   harmony is ADDED as extra voices layered on top: four granular pitch-shifters
//   (an AudioWorklet each) read the SAME decoded buffer and transpose it into a
//   consonant stack — +7 (fifth), +12 (octave), +4 (major third), −5 (fourth
//   below). Each shifter is a two-tap, triangular-windowed overlap-add reader
//   (~100 ms grains): silent at the wrap, so it stays glitch-free. Hand SEPARATION
//   is harmonic SPREAD — hands together → unison (only the dry take audible); as
//   they part, the voices fan in one by one into a full chord. Average hand HEIGHT
//   is the overall voices level and the flow energy. Hand SPEED breathes a gentle
//   ±cents shimmer across the voices so the chord shimmers rather than sits.
//
//   VISUAL. A WebGPU compute shader advects ~200,000 particles through a
//   divergence-free CURL-NOISE velocity field — v = curl(potential), so the flow
//   is incompressible and unconditionally stable, never exploding. Your two hands
//   are vortex sources: near each hand the field gains a rotational swirl whose
//   strength is the hand's speed, warping the current locally. Particles render as
//   luminous additive splats with gentle feedback trails — a living body of light.
//
//   PALETTE. Nacreous / pearlescent: a mercury-white base where light pools dense,
//   with a faint low-saturation interference sheen (pale gold-green-rose) only in
//   the highlights — the inside of a shell, not a rainbow.
//
//   Refs: Bridson, Hourihan & Nordenstam (2007) "Curl-Noise for Procedural Fluid
//   Flow"; WebGPU GPGPU particle patterns.
// ─────────────────────────────────────────────────────────────────────────────

const N_PARTICLES = 200_000;
const GRID_MAX = 1024; // domain resolution (long edge)
const N_CPU = 3200; // reduced fallback current

// harmonic stack: consonant voices added ON TOP of the dry take.
interface Voice {
  semitones: number;
  baseGain: number; // relative loudness within the stack
  threshold: number; // spread at which this voice begins to fan in
  shimmerRate: number; // detune LFO rate (Hz-ish) for this voice
  shimmerPhase: number;
}
const VOICES: Voice[] = [
  { semitones: 7, baseGain: 0.5, threshold: 0.02, shimmerRate: 0.23, shimmerPhase: 0.0 },
  { semitones: 12, baseGain: 0.46, threshold: 0.22, shimmerRate: 0.31, shimmerPhase: 1.7 },
  { semitones: 4, baseGain: 0.4, threshold: 0.42, shimmerRate: 0.19, shimmerPhase: 3.1 },
  { semitones: -5, baseGain: 0.5, threshold: 0.6, shimmerRate: 0.27, shimmerPhase: 4.6 },
];
const SPREAD_RAMP = 0.26; // how quickly each voice fades in past its threshold

// ── shared control surface (identical for GPU + CPU + demo drive) ────────────

interface HandState {
  x: number; // screen-normalized [0,1], y down
  y: number;
  vx: number; // screen-normalized units / second
  vy: number;
  height: number; // 0 bottom … 1 top (conducting height)
  active: number; // 1 active, 0 not
}

interface Controls {
  dt: number;
  time: number;
  flowSpeed: number; // grid units / second (base)
  hands: [HandState, HandState];
}

interface FlowBundle {
  kind: "gpu" | "cpu";
  gridW: number;
  gridH: number;
  stepAndDraw: (c: Controls, exposure: number) => void;
  destroy: () => void;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const SIM_STRUCT = /* wgsl */ `
struct Sim {
  size: vec2<f32>,
  nParticles: f32,
  dt: f32,
  time: f32,
  flowSpeed: f32,
  noiseScale: f32,
  timeScale: f32,
  curlEps: f32,
  maxDim: f32,
  vortexRadius: f32,
  vortexK: f32,
  frame: f32,
  p0: f32,
  p1: f32,
  p2: f32,
};
struct Hands { data: array<vec4<f32>, 4> };
`;

const NOISE_WGSL = /* wgsl */ `
// Dave Hoskins hash → value noise → 2-octave fbm → scalar potential.
fn hash3(p: vec3<f32>) -> f32 {
  var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(x: vec3<f32>) -> f32 {
  let p = floor(x);
  let f = fract(x);
  let ff = f * f * (3.0 - 2.0 * f);
  let n000 = hash3(p + vec3<f32>(0.0, 0.0, 0.0));
  let n100 = hash3(p + vec3<f32>(1.0, 0.0, 0.0));
  let n010 = hash3(p + vec3<f32>(0.0, 1.0, 0.0));
  let n110 = hash3(p + vec3<f32>(1.0, 1.0, 0.0));
  let n001 = hash3(p + vec3<f32>(0.0, 0.0, 1.0));
  let n101 = hash3(p + vec3<f32>(1.0, 0.0, 1.0));
  let n011 = hash3(p + vec3<f32>(0.0, 1.0, 1.0));
  let n111 = hash3(p + vec3<f32>(1.0, 1.0, 1.0));
  let x00 = mix(n000, n100, ff.x);
  let x10 = mix(n010, n110, ff.x);
  let x01 = mix(n001, n101, ff.x);
  let x11 = mix(n011, n111, ff.x);
  let y0 = mix(x00, x10, ff.y);
  let y1 = mix(x01, x11, ff.y);
  return mix(y0, y1, ff.z) * 2.0 - 1.0;
}
fn fbm(p: vec3<f32>) -> f32 {
  var s = 0.0; var a = 0.6; var q = p;
  for (var o = 0; o < 2; o = o + 1) { s = s + a * vnoise(q); q = q * 2.03; a = a * 0.5; }
  return s;
}
`;

// Advect: sample a divergence-free curl-noise velocity, add hand vortices,
// integrate, wrap, respawn to keep the current dense.
const ADVECT_WGSL = /* wgsl */ `
${SIM_STRUCT}
${NOISE_WGSL}
struct P { pos: vec2<f32>, age: f32, spd: f32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> parts: array<P>;
@group(0) @binding(2) var<uniform> hands: Hands;

fn field(pos: vec2<f32>) -> f32 {
  return fbm(vec3<f32>(pos.x * S.noiseScale, pos.y * S.noiseScale, S.time * S.timeScale));
}
fn hash1(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u); x = x * 0x7feb352du;
  x = x ^ (x >> 15u); x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(S.nParticles)) { return; }
  var p = parts[i];

  // divergence-free curl of the scalar potential (finite differences)
  let e = S.curlEps;
  let dPdx = (field(p.pos + vec2<f32>(e, 0.0)) - field(p.pos - vec2<f32>(e, 0.0))) / (2.0 * e);
  let dPdy = (field(p.pos + vec2<f32>(0.0, e)) - field(p.pos - vec2<f32>(0.0, e))) / (2.0 * e);
  let raw = vec2<f32>(dPdy, -dPdx);
  let sp = length(raw);
  var dir = vec2<f32>(1.0, 0.0);
  if (sp > 1e-6) { dir = raw / sp; }
  // predictable base speed, with organic slow/fast variation from the field
  var vel = dir * S.flowSpeed * (0.55 + 0.85 * clamp(sp * 90.0, 0.0, 1.0));

  // hands are vortex sources: local rotational swirl + advection by hand motion
  for (var k = 0u; k < 2u; k = k + 1u) {
    let pv = hands.data[k * 2u];
    let meta = hands.data[k * 2u + 1u];
    if (meta.x < 0.5) { continue; }
    let hp = pv.xy * S.size;
    let hv = pv.zw * S.size; // grid units / second
    let radius = S.vortexRadius;
    let d = p.pos - hp;
    let dist = length(d);
    if (dist < radius && dist > 1e-3) {
      let fall = 1.0 - dist / radius;
      let f2 = fall * fall;
      let tang = vec2<f32>(-d.y, d.x) / dist; // rotational (curl-free-safe swirl)
      let hspeed = meta.z; // normalized hand speed
      vel = vel + tang * f2 * S.vortexK * hspeed * S.maxDim;
      vel = vel + hv * f2 * 0.5;
    }
  }

  var np = p.pos + vel * S.dt;
  // toroidal wrap keeps the body of light full-frame
  np.x = np.x - floor(np.x / S.size.x) * S.size.x;
  np.y = np.y - floor(np.y / S.size.y) * S.size.y;

  // respawn to preserve density (incompressible flow still forms voids over time)
  p.age = p.age + S.dt;
  let life = 6.0 + hash1(i * 747796405u) * 8.0;
  if (p.age > life) {
    let salt = i * 2654435761u + u32(S.frame) * 40503u;
    np = vec2<f32>(hash1(salt) * S.size.x, hash1(salt ^ 0x9e3779b9u) * S.size.y);
    p.age = 0.0;
  }

  p.pos = np;
  p.spd = clamp(length(vel) / S.maxDim, 0.0, 1.5);
  parts[i] = p;
}`;

// Fade the previous frame (feedback trails).
const FADE_WGSL = /* wgsl */ `
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, p0: f32, p1: f32 };
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

// Additive nacreous splats — one instanced quad per particle.
const POINTS_WGSL = /* wgsl */ `
${SIM_STRUCT}
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, p0: f32, p1: f32 };
struct P { pos: vec2<f32>, age: f32, spd: f32 };
@group(0) @binding(0) var<storage, read> parts: array<P>;
@group(0) @binding(1) var<uniform> S: Sim;
@group(0) @binding(2) var<uniform> R: RU;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) col: vec3<f32> };

// pearl base + faint low-saturation interference sheen (near-white pastels).
fn nacre(a: f32) -> vec3<f32> {
  let base = vec3<f32>(0.80, 0.82, 0.86);
  let sheen = vec3<f32>(
    0.13 * cos(6.28318 * a + 0.0),
    0.11 * cos(6.28318 * a + 2.20),
    0.13 * cos(6.28318 * a + 4.30));
  return base + sheen;
}

@vertex
fn vmain(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0),
    vec2<f32>(-1.0,1.0),  vec2<f32>(1.0,-1.0), vec2<f32>(1.0,1.0));
  let a = parts[ii];
  let ndc = vec2<f32>(a.pos.x / S.size.x * 2.0 - 1.0, 1.0 - a.pos.y / S.size.y * 2.0);
  let corner = corners[vi];
  let off = corner * vec2<f32>(R.radius / R.vpW, R.radius / R.vpH) * 2.0;
  var o: VOut;
  o.pos = vec4<f32>(ndc + off, 0.0, 1.0);
  o.uv = corner;
  // hue drifts slowly with speed — thin edges catch the sheen, dense cores whiten
  let t = fract(a.spd * 1.6 + f32(ii) * 0.0000037);
  o.col = nacre(t);
  return o;
}
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let d = length(in.uv);
  let alpha = smoothstep(1.0, 0.0, d);
  let intensity = R.intensity;
  return vec4<f32>(in.col * alpha * intensity, alpha * intensity);
}`;

// Tonemap the HDR accumulation onto the canvas; add sheen only in highlights.
const PRESENT_WGSL = /* wgsl */ `
struct RU { vpW: f32, vpH: f32, radius: f32, exposure: f32, fade: f32, intensity: f32, p0: f32, p1: f32 };
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
  let lum = dot(mapped, vec3<f32>(0.333, 0.333, 0.333));
  // faint pearlescent interference ONLY in the specular highlights
  let hl = smoothstep(0.4, 0.95, lum);
  let ph = lum * 3.4 + hdr.r * 0.7;
  let sheen = vec3<f32>(cos(ph), cos(ph + 2.1), cos(ph + 4.2)) * 0.045 * hl;
  let bg = vec3<f32>(0.018, 0.020, 0.027); // deep cool charcoal
  var col = bg + mapped + sheen;
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
  return [Math.max(64, gw), Math.max(64, gh)];
}

async function initGpu(canvas: HTMLCanvasElement): Promise<FlowBundle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const [gridW, gridH] = computeGrid();
  const maxDim = Math.max(gridW, gridH);

  // particles: pos.xy, age, spd — 16 bytes
  const data = new Float32Array(N_PARTICLES * 4);
  for (let i = 0; i < N_PARTICLES; i++) {
    data[i * 4] = Math.random() * gridW;
    data[i * 4 + 1] = Math.random() * gridH;
    data[i * 4 + 2] = Math.random() * 12; // staggered ages
    data[i * 4 + 3] = 0;
  }
  const partBuf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(partBuf, 0, data as BufferSource);

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

  const advectPipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: ADVECT_WGSL }), entryPoint: "main" },
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

  const advectBG = device.createBindGroup({
    layout: advectPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: simBuf } },
      { binding: 1, resource: { buffer: partBuf } },
      { binding: 2, resource: { buffer: handsBuf } },
    ],
  });
  const pointsBG = device.createBindGroup({
    layout: pointsPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: partBuf } },
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
    const mkBG = (pipe: GPURenderPipeline, i: 0 | 1) =>
      device.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: tex![i].createView() },
          { binding: 2, resource: { buffer: ruBuf } },
        ],
      });
    fadeBG = [mkBG(fadePipe, 0), mkBG(fadePipe, 1)];
    presentBG = [mkBG(presentPipe, 0), mkBG(presentPipe, 1)];
  };
  rebuildTargets();

  const sim = new Float32Array(16);
  const handsArr = new Float32Array(16);
  const ru = new Float32Array(8);
  let cur: 0 | 1 = 0;
  let frameNo = 0;
  const groups = Math.ceil(N_PARTICLES / 64);

  const stepAndDraw = (c: Controls, exposure: number) => {
    rebuildTargets();
    if (!tex || !fadeBG || !presentBG) return;

    sim[0] = gridW;
    sim[1] = gridH;
    sim[2] = N_PARTICLES;
    sim[3] = c.dt;
    sim[4] = c.time;
    sim[5] = c.flowSpeed;
    sim[6] = 3.4 / maxDim; // noiseScale: features span ~maxDim/3.4 grid units
    sim[7] = 0.05; // timeScale — how fast the field evolves
    sim[8] = Math.max(1.0, maxDim * 0.0016); // curlEps
    sim[9] = maxDim;
    sim[10] = maxDim * 0.26; // vortexRadius
    sim[11] = 0.9; // vortexK
    sim[12] = frameNo;
    sim[13] = 0;
    sim[14] = 0;
    sim[15] = 0;
    device.queue.writeBuffer(simBuf, 0, sim as BufferSource);

    for (let k = 0; k < 2; k++) {
      const hnd = c.hands[k];
      const speed = Math.hypot(hnd.vx, hnd.vy);
      handsArr[k * 8] = hnd.x;
      handsArr[k * 8 + 1] = hnd.y;
      handsArr[k * 8 + 2] = hnd.vx;
      handsArr[k * 8 + 3] = hnd.vy;
      handsArr[k * 8 + 4] = hnd.active;
      handsArr[k * 8 + 5] = 0;
      handsArr[k * 8 + 6] = Math.min(1.4, speed);
      handsArr[k * 8 + 7] = 0;
    }
    device.queue.writeBuffer(handsBuf, 0, handsArr as BufferSource);

    ru[0] = texW;
    ru[1] = texH;
    ru[2] = 1.35; // splat radius px
    ru[3] = exposure;
    ru[4] = 0.9; // trail fade
    ru[5] = 0.28; // splat intensity
    ru[6] = 0;
    ru[7] = 0;
    device.queue.writeBuffer(ruBuf, 0, ru as BufferSource);

    const nxt = (1 - cur) as 0 | 1;
    const enc = device.createCommandEncoder();

    const cp = enc.beginComputePass();
    cp.setPipeline(advectPipe);
    cp.setBindGroup(0, advectBG);
    cp.dispatchWorkgroups(groups);
    cp.end();

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
    rp.draw(6, N_PARTICLES);
    rp.end();

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

    device.queue.submit([enc.finish()]);
    cur = nxt;
    frameNo++;
  };

  return {
    kind: "gpu",
    gridW,
    gridH,
    stepAndDraw,
    destroy: () => {
      partBuf.destroy();
      simBuf.destroy();
      handsBuf.destroy();
      ruBuf.destroy();
      tex?.[0].destroy();
      tex?.[1].destroy();
      device.destroy();
    },
  };
}

// ── CPU fallback current (Canvas2D, reduced curl-noise advection) ────────────

function initCpu(canvas: HTMLCanvasElement): FlowBundle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const px = new Float32Array(N_CPU);
  const py = new Float32Array(N_CPU);
  const page = new Float32Array(N_CPU);
  const psp = new Float32Array(N_CPU);
  for (let i = 0; i < N_CPU; i++) {
    px[i] = Math.random();
    py[i] = Math.random();
    page[i] = Math.random() * 10;
  }

  // tiny 3D value noise for the potential
  const h3 = (x: number, y: number, z: number): number => {
    const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };
  const smooth = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  const vn = (x: number, y: number, z: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const c = (dx: number, dy: number, dz: number) => h3(xi + dx, yi + dy, zi + dz);
    const x00 = smooth(c(0, 0, 0), c(1, 0, 0), xf);
    const x10 = smooth(c(0, 1, 0), c(1, 1, 0), xf);
    const x01 = smooth(c(0, 0, 1), c(1, 0, 1), xf);
    const x11 = smooth(c(0, 1, 1), c(1, 1, 1), xf);
    const y0 = smooth(x00, x10, yf);
    const y1 = smooth(x01, x11, yf);
    return smooth(y0, y1, zf);
  };
  const pot = (x: number, y: number, t: number) =>
    0.6 * vn(x * 3.0, y * 3.0, t) + 0.3 * vn(x * 6.06, y * 6.06, t);

  const stepAndDraw = (c: Controls, exposure: number) => {
    const W = canvas.width;
    const H = canvas.height;
    const t = c.time * 0.05;
    const e = 0.004;
    const base = 0.11 * (c.flowSpeed / 220); // normalized units/sec-ish

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(5,6,8,0.16)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < N_CPU; i++) {
      const x = px[i], y = py[i];
      const dPdx = (pot(x + e, y, t) - pot(x - e, y, t)) / (2 * e);
      const dPdy = (pot(x, y + e, t) - pot(x, y - e, t)) / (2 * e);
      let vx = dPdy * base;
      let vy = -dPdx * base;

      for (let k = 0; k < 2; k++) {
        const hnd = c.hands[k];
        if (hnd.active < 0.5) continue;
        const dx = x - hnd.x;
        const dy = y - hnd.y;
        const dist = Math.hypot(dx, dy);
        const radius = 0.26;
        if (dist < radius && dist > 1e-3) {
          const fall = 1 - dist / radius;
          const f2 = fall * fall;
          const speed = Math.min(1.4, Math.hypot(hnd.vx, hnd.vy));
          vx += (-dy / dist) * f2 * 0.9 * speed;
          vy += (dx / dist) * f2 * 0.9 * speed;
          vx += hnd.vx * f2 * 0.5;
          vy += hnd.vy * f2 * 0.5;
        }
      }

      let nx = x + vx * c.dt;
      let ny = y + vy * c.dt;
      nx -= Math.floor(nx);
      ny -= Math.floor(ny);

      page[i] += c.dt;
      if (page[i] > 9) {
        nx = Math.random();
        ny = Math.random();
        page[i] = 0;
      }
      px[i] = nx;
      py[i] = ny;
      psp[i] = Math.min(1, Math.hypot(vx, vy) * 3);

      const sh = psp[i];
      const r = Math.min(255, (0.80 + 0.13 * Math.cos(6.28 * sh)) * 255 * exposure * 0.5);
      const g = Math.min(255, (0.82 + 0.11 * Math.cos(6.28 * sh + 2.2)) * 255 * exposure * 0.5);
      const b = Math.min(255, (0.86 + 0.13 * Math.cos(6.28 * sh + 4.3)) * 255 * exposure * 0.5);
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.5)`;
      ctx.fillRect(nx * W - 1, ny * H - 1, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  return {
    kind: "cpu",
    gridW: 0,
    gridH: 0,
    stepAndDraw,
    destroy: () => {},
  };
}

// ── granular pitch-shift AudioWorklet (built from a blob, self-contained) ─────
// Two-tap, triangular-windowed overlap-add reader over a ring buffer. The delay
// ramps as a sawtooth; the window is 0 at the wrap, so the seam is silent →
// glitch-free. detune (cents) is an a-rate param → a live shimmer LFO.
const PITCH_WORKLET_SRC = `
function sampleLerp(ring, pos, size) {
  var p = pos;
  while (p < 0) { p += size; }
  var i0 = Math.floor(p);
  var frac = p - i0;
  var a = ring[i0 & (size - 1)];
  var b = ring[(i0 + 1) & (size - 1)];
  return a + (b - a) * frac;
}
class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'detune', defaultValue: 0, minValue: -2400, maxValue: 2400, automationRate: 'a-rate' }];
  }
  constructor(options) {
    super();
    var opt = (options && options.processorOptions) || {};
    this.semitones = opt.semitones || 0;
    this.bufSize = 32768; // power of two
    this.grain = Math.max(256, Math.floor(sampleRate * 0.10)); // ~100 ms
    this.ring = [new Float32Array(this.bufSize), new Float32Array(this.bufSize)];
    this.writePos = 0;
    this.phase = 0;
  }
  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];
    var nCh = output.length;
    var frames = output[0].length;
    var det = parameters.detune;
    var grain = this.grain;
    var mask = this.bufSize - 1;
    for (var i = 0; i < frames; i++) {
      var detune = det.length > 1 ? det[i] : det[0];
      var ratio = Math.pow(2, (this.semitones + detune / 100) / 12);
      for (var c = 0; c < nCh; c++) {
        var inCh = input && (input[c] || input[0]);
        this.ring[c][this.writePos] = inCh ? inCh[i] : 0;
      }
      this.phase += (1 - ratio) / grain;
      this.phase -= Math.floor(this.phase);
      var phase2 = this.phase + 0.5;
      phase2 -= Math.floor(phase2);
      var delay1 = this.phase * grain;
      var delay2 = phase2 * grain;
      var w1 = 1 - Math.abs(2 * this.phase - 1); // triangular → sum == 1
      var w2 = 1 - Math.abs(2 * phase2 - 1);
      for (var c2 = 0; c2 < nCh; c2++) {
        var ring = this.ring[c2];
        output[c2][i] = w1 * sampleLerp(ring, this.writePos - delay1, this.bufSize)
                      + w2 * sampleLerp(ring, this.writePos - delay2, this.bufSize);
      }
      this.writePos = (this.writePos + 1) & mask;
    }
    return true;
  }
}
registerProcessor('fluxweave-pitch', PitchShiftProcessor);
`;

// ── demo drive (autonomous virtual hands) ─────────────────────────────────────
// Their SEPARATION breathes open and shut so the chord audibly fans and collapses;
// their HEIGHT rises and falls so the voices swell; both warp the current.
function computeDemoRaw(t: number): [
  { x: number; y: number; height: number },
  { x: number; y: number; height: number },
] {
  const half = 0.16 + 0.15 * Math.sin(t * 0.3); // half-separation 0.01 … 0.31
  const bob = 0.16 * Math.sin(t * 0.5);
  const drift = 0.05 * Math.sin(t * 0.7);
  const x0 = 0.5 - half + drift;
  const y0 = 0.5 + bob;
  const x1 = 0.5 + half - drift * 0.8;
  const y1 = 0.5 - bob * 0.8 + 0.04 * Math.sin(t * 0.9 + 1.0);
  return [
    { x: x0, y: y0, height: 1 - y0 },
    { x: x1, y: y1, height: 1 - y1 },
  ];
}

// ── component ────────────────────────────────────────────────────────────────

type TrackingMode = "demo" | "live" | "lost";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const bundleRef = useRef<FlowBundle | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const dryRef = useRef<GainNode | null>(null);
  const voiceNodesRef = useRef<AudioWorkletNode[]>([]);
  const voiceGainsRef = useRef<GainNode[]>([]);
  const harmonizerRef = useRef(false); // worklet voices active

  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);
  const handPrevRef = useRef<{ x: number; y: number; t: number; has: boolean }[]>([
    { x: 0, y: 0, t: 0, has: false },
    { x: 0, y: 0, t: 0, has: false },
  ]);
  const trackModeRef = useRef<TrackingMode>("demo");

  const lastTsRef = useRef(0);
  const simTimeRef = useRef(0);
  const spreadUiRef = useRef(0);

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

  const [gpuStatus, setGpuStatus] = useState<"checking" | "gpu" | "cpu">("checking");
  const [trackMode, setTrackMode] = useState<TrackingMode>("demo");
  const [cameraBusy, setCameraBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadUi, setSpreadUi] = useState(0);
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
    const freqBuf = new Uint8Array(1024);

    (async () => {
      let bundle: FlowBundle | null = null;
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

        // ── gather the two hands (live tracking or demo drive) ───────────────
        let raw: [
          { x: number; y: number; height: number; active: boolean },
          { x: number; y: number; height: number; active: boolean },
        ];
        let mode: TrackingMode;

        const tracker = trackerRef.current;
        const video = videoRef.current;
        if (cameraOnRef.current && tracker && video && video.readyState >= 2) {
          let res: { landmarks: { x: number; y: number; z: number }[][] } | null = null;
          try {
            res = tracker.detectForVideo(video, performance.now());
          } catch {
            res = null;
          }
          const lms = res?.landmarks ?? [];
          const mk = (i: number) => {
            if (i < lms.length && lms[i]) {
              const f = computeHandFeatures(lms[i]);
              const nx = f.cx / 1.2 / 2 + 0.5;
              const ny = 1 - (f.cy / 1.2 / 2 + 0.5);
              return { x: nx, y: ny, height: f.height, active: true };
            }
            return { x: 0.5, y: 0.5, height: 0.5, active: false };
          };
          raw = [mk(0), mk(1)];
          mode = lms.length > 0 ? "live" : "lost";
        } else {
          const d = computeDemoRaw(t);
          raw = [
            { ...d[0], active: true },
            { ...d[1], active: true },
          ];
          mode = "demo";
        }

        if (mode !== trackModeRef.current) {
          trackModeRef.current = mode;
          setTrackMode(mode);
        }

        // velocities from previous positions (shared by live + demo)
        const hands: [HandState, HandState] = [
          { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 },
          { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 },
        ];
        for (let i = 0; i < 2; i++) {
          const prev = handPrevRef.current[i];
          const r = raw[i];
          if (r.active) {
            let vx = 0;
            let vy = 0;
            if (prev.has) {
              const pdt = Math.max(0.008, t - prev.t);
              vx = (r.x - prev.x) / pdt;
              vy = (r.y - prev.y) / pdt;
            }
            prev.x = r.x;
            prev.y = r.y;
            prev.t = t;
            prev.has = true;
            hands[i] = { x: r.x, y: r.y, vx, vy, height: r.height, active: 1 };
          } else {
            prev.has = false;
            hands[i] = { x: 0.5, y: 0.5, vx: 0, vy: 0, height: 0.5, active: 0 };
          }
        }

        // ── derive the conducting parameters ─────────────────────────────────
        const bothActive = hands[0].active > 0.5 && hands[1].active > 0.5;
        const sep = bothActive ? Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y) : 0;
        const spread = Math.min(1, Math.max(0, (sep - 0.05) / 0.55));
        let heightAvg = 0;
        let nAct = 0;
        for (const h of hands) {
          if (h.active > 0.5) {
            heightAvg += h.height;
            nAct++;
          }
        }
        heightAvg = nAct > 0 ? heightAvg / nAct : 0.4;
        let turbulence = 0;
        for (const h of hands) {
          if (h.active > 0.5) turbulence += Math.hypot(h.vx, h.vy);
        }
        turbulence = Math.min(1, turbulence * 0.7);

        // flow energy rises with hand height
        const baseFlow = bundle!.kind === "gpu" ? bundle!.gridW * 0.45 : 220;
        const flow = baseFlow * (0.5 + heightAvg * 0.95);

        // audio level → a small exposure lift so the light breathes with the music
        let level = 0;
        const master = masterRef.current;
        if (master) {
          master.analyser.getByteFrequencyData(freqBuf);
          let s = 0;
          for (let i = 0; i < 220; i++) s += freqBuf[i];
          level = s / 220 / 255;
        }
        const exposure = 1.3 + level * 0.9;

        bundle!.stepAndDraw({ dt, time: t, flowSpeed: flow, hands }, exposure);

        // ── conduct the harmonizer (all params smoothed) ─────────────────────
        const ac = ctxRef.current;
        if (
          phaseRef.current === "playing" &&
          ac &&
          harmonizerRef.current &&
          voiceGainsRef.current.length === VOICES.length
        ) {
          const now = ac.currentTime;
          const voicesLevel = 0.16 + heightAvg * 0.84; // hand height = overall wet level
          for (let i = 0; i < VOICES.length; i++) {
            const v = VOICES[i];
            const fan = Math.min(1, Math.max(0, (spread - v.threshold) / SPREAD_RAMP));
            const target = fan * voicesLevel * v.baseGain;
            voiceGainsRef.current[i].gain.setTargetAtTime(target, now, 0.12);
            const node = voiceNodesRef.current[i];
            const det = node.parameters.get("detune");
            if (det) {
              const cents = Math.sin(t * v.shimmerRate * 6.283 + v.shimmerPhase) * turbulence * 14;
              det.setTargetAtTime(cents, now, 0.12);
            }
          }
        }

        spreadUiRef.current = spread;
        uiTick++;
        if (uiTick % 12 === 0) setSpreadUi(spreadUiRef.current);
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
      voiceNodesRef.current.forEach((n) => n.disconnect());
      voiceGainsRef.current.forEach((g) => g.disconnect());
      voiceNodesRef.current = [];
      voiceGainsRef.current = [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── audio: dry take (rate 1.0, untouched) + four granular harmonic voices ──
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

      // register the granular pitch-shift worklet once
      if (!harmonizerRef.current) {
        try {
          const blob = new Blob([PITCH_WORKLET_SRC], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);
          harmonizerRef.current = true;
        } catch {
          harmonizerRef.current = false;
          setError(
            "Harmonic voices unavailable in this browser — the dry take still plays and the current still flows.",
          );
        }
      }

      const wh = await loadRealTrackBuffer(ctx, trackRef.current.id);

      // tear down any prior chain
      try {
        sourceRef.current?.stop();
      } catch {
        /* none */
      }
      sourceRef.current?.disconnect();
      voiceNodesRef.current.forEach((n) => n.disconnect());
      voiceGainsRef.current.forEach((g) => g.disconnect());
      voiceNodesRef.current = [];
      voiceGainsRef.current = [];

      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.loop = true;
      src.playbackRate.value = 1.0; // SOURCE pitch/melody never changes

      // DRY / clear path — always audible, the untouched take
      const dry = ctx.createGain();
      dry.gain.value = 1.0;
      src.connect(dry);
      dry.connect(master.input);
      dryRef.current = dry;

      // HARMONIC voices — pitch-shifted copies of the SAME buffer, layered on top
      if (harmonizerRef.current) {
        for (const v of VOICES) {
          const node = new AudioWorkletNode(ctx, "fluxweave-pitch", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            processorOptions: { semitones: v.semitones },
          });
          const g = ctx.createGain();
          g.gain.value = 0; // start at unison (silent) — fans in with spread
          src.connect(node);
          node.connect(g);
          g.connect(master.input);
          voiceNodesRef.current.push(node);
          voiceGainsRef.current.push(g);
        }
      }

      src.onended = () => {
        if (sourceRef.current === src) setPhase("idle");
      };
      src.start();
      sourceRef.current = src;
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
    voiceNodesRef.current.forEach((n) => n.disconnect());
    voiceGainsRef.current.forEach((g) => g.disconnect());
    voiceNodesRef.current = [];
    voiceGainsRef.current = [];
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
        "Camera or hand model unavailable — the demo drive keeps weaving the chord.",
      );
      cameraOnRef.current = false;
    } finally {
      setCameraBusy(false);
    }
  }, [cameraBusy]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const tk = REAL_TRACKS.find((x) => x.id === id);
      if (!tk) return;
      setTrack(tk);
      if (phaseRef.current === "playing") stopAudio();
    },
    [stopAudio],
  );

  const spreadLabel =
    spreadUi < 0.12 ? "unison" : spreadUi < 0.45 ? "opening" : spreadUi < 0.75 ? "chord" : "full stack";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: "none" }}
      />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* tracking status — always visible */}
      <div className="pointer-events-none absolute left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
        {trackMode === "live" && <span className="text-muted-foreground">tracking · live</span>}
        {trackMode === "lost" && (
          <span className="text-destructive">
            tracking lost · show both hands, palms to camera
          </span>
        )}
        {trackMode === "demo" && (
          <span className="text-primary">demo · autonomous</span>
        )}
        <span className="ml-3 text-muted-foreground/70">
          spread {spreadUi.toFixed(2)} · {spreadLabel}
        </span>
      </div>

      {error && (
        <p className="pointer-events-none absolute inset-x-4 top-12 z-30 text-sm text-destructive">
          {error}
        </p>
      )}

      {!immersive && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-12">
            <header className="max-w-2xl space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                fluxweave · harmonize your recording in a current of light
              </p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Pull your hands apart and the take fans open into a chord of itself;
                bring them together and it collapses back to a clear unison.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground">
                {gpuStatus === "gpu"
                  ? "200,000 particles flow through a divergence-free curl-noise field on the GPU."
                  : gpuStatus === "cpu"
                    ? "WebGPU unavailable — reduced preview: a smaller CPU current, same mechanism."
                    : "Starting the current…"}{" "}
                Karel&apos;s piano plays untouched at rate 1.0; your hands add pitch-shifted
                copies of it — a consonant harmonic stack woven into the flow.
              </p>
            </header>
          </div>

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
                      {col.tracks.map((tk) => (
                        <option key={tk.id} value={tk.id}>
                          {tk.title}
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
                    ? "Harmonize with your hands"
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

          <PrototypeNav slugs={["18352-fluxweave", "18304-murmuration"]} />
        </>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Fluxweave"
        description="Karel's piano is poured into a divergence-free curl-noise current of ~200,000 luminous particles. The take plays untouched at rate 1.0; your two hands add pitch-shifted copies of it woven into the flow. Hand separation is harmonic spread — hands together sound a clear unison; pull them apart and a consonant chord (fifth, octave, third, fourth-below) fans open. Hand height swells the voices and the flow energy; hand speed breathes a gentle shimmer across the chord and stirs vortices into the current."
        howTo={[
          "Bring your hands together to hear the take clear, in unison",
          "Pull your hands apart to fan the recording open into a shimmering chord of itself",
          "Raise both hands to swell the harmony and quicken the current",
          "Move faster to stir vortices into the light and let the chord shimmer",
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
                The recording plays back at rate 1.0 through a dry path that is never
                touched — its pitch and melody are always exactly Karel&apos;s take. The
                harmony is <strong>added</strong>: four granular pitch-shifters read the
                same decoded buffer and transpose it into a consonant stack — a fifth
                (+7), an octave (+12), a major third (+4) and a fourth below (−5).
              </p>
              <p>
                Each shifter is a two-tap, triangular-windowed overlap-add reader over a
                ring buffer (~100&nbsp;ms grains). The read delay ramps as a sawtooth; the
                window is zero exactly where the delay wraps, so the seam is silent and the
                shift stays glitch-free. A small ±cents shimmer, driven by how fast your
                hands move, is LFO&apos;d across the voices so the chord breathes.
              </p>
              <p>
                <strong>Your hands harmonize.</strong> The distance between your two hands
                is the harmonic spread: together → unison (only the dry take audible); as
                they part, the voices fan in one by one into a full chord. The average
                height of your hands is the overall level of the added voices and the energy
                of the flow.
              </p>
              <p>
                <strong>The current.</strong> ~200,000 particles are advected on the GPU by
                a divergence-free velocity field, v = curl(potential), where the potential
                is 2-octave value noise in space and time. Because the field is
                incompressible by construction, the flow is unconditionally stable — it
                never explodes. Your hands are vortex sources: near each hand the field
                gains a rotational swirl whose strength is the hand&apos;s speed.
              </p>
              <p>
                <strong>Palette.</strong> Nacreous — a mercury-white base where light pools
                dense, with a faint low-saturation interference sheen (pale gold-green-rose)
                only in the highlights. The inside of a shell, not a rainbow.
              </p>
              <p>
                <strong>References.</strong> Bridson, Hourihan &amp; Nordenstam (2007),{" "}
                <em>Curl-Noise for Procedural Fluid Flow</em> (SIGGRAPH). Harmony-aware
                anchor: MIDIBack (arXiv:2609.28008, 2026-09-23).
              </p>
              <p>
                <strong>Degrades.</strong> No WebGPU adapter → a reduced Canvas2D current
                with the identical hands → harmonizer chain. No camera / denied / model fail
                → a labelled autonomous demo drive keeps weaving the chord. No AudioWorklet →
                the dry take still plays and the current still flows.
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
