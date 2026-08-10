// gpu.ts — WebGPU compute particle FLOW-FIELD for 9560 · Handflux.
//
// ~48k particles live in a GPU storage buffer as (posx, posy, velx, vely),
// positions in normalized image space [0,1]×[0,1] (y down, matching the mirrored
// hand landmarks). A compute pass advects every particle each frame:
//
//   base drift = 2-D CURL NOISE (divergence-free → a boundless swirling river),
//   plus, per detected hand, a local CURL VORTEX + gentle attraction so the
//   hands STIR the current, a downward-current term driven by hand velocity, and
//   an outward BURST impulse fired on pinch.
//
// A render pass draws each particle as an additive glowing point-sprite quad,
// coloured deep indigo → violet → pale-gold by speed. Additive blend = bloom.
//
// References:
//   Robert Bridson — "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007.
//   @webgpu/types is present in this repo, so the global GPU* types are used.

import { mulberry32 } from "./rng";

export const PARTICLE_COUNT = 48_000;
const WG = 64;
export const WORKGROUP_DISPATCH = Math.ceil(PARTICLE_COUNT / WG);

// Per-particle stride: pos.xy + vel.xy = 4 floats.
const FLOATS_PER_PARTICLE = 4;

// ── compute shader ───────────────────────────────────────────────────────────
const COMPUTE_WGSL = /* wgsl */ `
struct CU {
  dt: f32, time: f32, reduced: f32, energy: f32,
  h0x: f32, h0y: f32, h0act: f32, h0force: f32,
  h0vx: f32, h0vy: f32, h0burst: f32, pad0: f32,
  h1x: f32, h1y: f32, h1act: f32, h1force: f32,
  h1vx: f32, h1vy: f32, h1burst: f32, pad1: f32,
}

@group(0) @binding(0) var<storage, read_write> ps: array<vec4f>;
@group(0) @binding(1) var<uniform> u: CU;

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

// scalar value noise
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash2(i + vec2f(0.0, 0.0));
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;
}

// scalar potential; its 2-D curl is a divergence-free flow field (Bridson 2007)
fn potential(p: vec2f) -> f32 {
  let t = u.time * 0.08;
  return vnoise(p + vec2f(t, t * 0.6))
       + 0.5 * vnoise(p * 2.03 + vec2f(-t * 0.7, t * 0.4));
}

fn curl2d(p: vec2f) -> vec2f {
  let e = 0.02;
  let dpdx = (potential(p + vec2f(e, 0.0)) - potential(p - vec2f(e, 0.0))) / (2.0 * e);
  let dpdy = (potential(p + vec2f(0.0, e)) - potential(p - vec2f(0.0, e))) / (2.0 * e);
  // curl of a 2-D scalar potential: (dP/dy, -dP/dx)
  return vec2f(dpdy, -dpdx);
}

fn handForce(
  pos: vec2f, hx: f32, hy: f32, act: f32, force: f32,
  hvx: f32, hvy: f32, burst: f32
) -> vec2f {
  if (act < 0.5) { return vec2f(0.0); }
  let to = vec2f(hx, hy) - pos;
  let d = length(to) + 1e-4;
  let dir = to / d;
  let radius = 0.34;
  let fall = smoothstep(radius, 0.0, d);
  // tangential swirl (vortex) + a little inward pull → hands stir the current
  let perp = vec2f(-dir.y, dir.x);
  let stir = (0.55 + force * 2.2);
  var f = (perp * 1.3 + dir * 0.5) * fall * stir;
  // downward-current term: a fast downward hand sweep drags the river down
  f = f + vec2f(hvx, hvy) * fall * 1.6;
  // pinch burst: outward fountain within a tighter radius
  let bfall = smoothstep(radius * 0.7, 0.0, d);
  f = f - dir * burst * bfall * 6.0;
  return f;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${PARTICLE_COUNT}u) { return; }
  var p = ps[i];
  var pos = p.xy;
  var vel = p.zw;
  let dt = min(u.dt, 0.033);

  let calm = mix(1.0, 0.12, u.reduced);

  // boundless base drift
  let flow = curl2d(pos * 5.0) * (0.09 + u.energy * 0.05) * calm;

  var force = flow;
  force = force + handForce(pos, u.h0x, u.h0y, u.h0act, u.h0force, u.h0vx, u.h0vy, u.h0burst) * calm;
  force = force + handForce(pos, u.h1x, u.h1y, u.h1act, u.h1force, u.h1vx, u.h1vy, u.h1burst) * calm;

  vel = vel + force * dt;
  // damping gives the field memory; stronger when calmed for reduced-motion
  let damp = mix(0.92, 0.80, u.reduced);
  vel = vel * damp;
  // clamp so nothing rockets away
  let sp = length(vel);
  let maxSp = 1.4;
  if (sp > maxSp) { vel = vel * (maxSp / sp); }

  pos = pos + vel * dt;

  // boundless river: wrap softly around the frame edges (with a margin)
  let m = 0.06;
  if (pos.x < -m) { pos.x = pos.x + (1.0 + 2.0 * m); }
  if (pos.x > 1.0 + m) { pos.x = pos.x - (1.0 + 2.0 * m); }
  if (pos.y < -m) { pos.y = pos.y + (1.0 + 2.0 * m); }
  if (pos.y > 1.0 + m) { pos.y = pos.y - (1.0 + 2.0 * m); }

  ps[i] = vec4f(pos, vel);
}`;

// ── vertex shader ─────────────────────────────────────────────────────────────
const VERT_WGSL = /* wgsl */ `
struct RU { aspect: f32, size: f32, brightness: f32, time: f32 }

@group(0) @binding(0) var<storage, read> ps: array<vec4f>;
@group(0) @binding(1) var<uniform> u: RU;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) spd: f32,
  @location(1) uv: vec2f,
  @location(2) seed: f32,
}

const OFF = array<vec2f, 6>(
  vec2f(-0.5,-0.5), vec2f(0.5,-0.5), vec2f(-0.5,0.5),
  vec2f(-0.5,0.5),  vec2f(0.5,-0.5), vec2f(0.5,0.5)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let p = ps[pi];
  // normalized image space (y down) → clip space (y up)
  let cx = p.x * 2.0 - 1.0;
  let cy = 1.0 - p.y * 2.0;
  let o = OFF[ci];
  let sz = u.size;
  var vo: VO;
  vo.pos = vec4f(cx + o.x * sz / u.aspect, cy + o.y * sz, 0.0, 1.0);
  vo.spd = clamp(length(p.zw) * 1.6, 0.0, 1.0);
  vo.uv = o + 0.5;
  vo.seed = fract(f32(pi) * 0.61803398875);
  return vo;
}`;

// ── fragment shader ───────────────────────────────────────────────────────────
// Cosmic aurora: deep indigo → violet → pale-gold, additive.
const FRAG_WGSL = /* wgsl */ `
struct RU { aspect: f32, size: f32, brightness: f32, time: f32 }
@group(0) @binding(1) var<uniform> u: RU;

@fragment fn main(
  @location(0) spd: f32,
  @location(1) uv: vec2f,
  @location(2) seed: f32
) -> @location(0) vec4f {
  let d = length(uv - 0.5);
  if (d > 0.5) { discard; }
  let glow = 1.0 - smoothstep(0.02, 0.5, d);
  let a = glow * 0.16 * u.brightness;

  let c0 = vec3f(0.13, 0.09, 0.40); // deep indigo
  let c1 = vec3f(0.42, 0.20, 0.80); // violet
  let c2 = vec3f(0.72, 0.42, 0.92); // orchid
  let c3 = vec3f(0.98, 0.86, 0.60); // pale gold
  let t = clamp(spd, 0.0, 1.0);
  var col = mix(c0, c1, smoothstep(0.0, 0.4, t));
  col = mix(col, c2, smoothstep(0.4, 0.72, t));
  col = mix(col, c3, smoothstep(0.72, 1.0, t));
  col = col + vec3f(seed * 0.05, seed * 0.02, seed * 0.06);
  return vec4f(col * a, a);
}`;

// ── initial particle field (seeded) ───────────────────────────────────────────
function buildInitialParticles(seed: number): Float32Array {
  const rng = mulberry32(seed);
  const data = new Float32Array(PARTICLE_COUNT * FLOATS_PER_PARTICLE);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * FLOATS_PER_PARTICLE;
    data[o] = rng(); // pos.x in [0,1]
    data[o + 1] = rng(); // pos.y in [0,1]
    data[o + 2] = 0; // vel.x
    data[o + 3] = 0; // vel.y
  }
  return data;
}

// Narrow shape for the per-frame compute uniform.
export interface HandUniform {
  x: number;
  y: number;
  active: number;
  force: number;
  vx: number;
  vy: number;
  burst: number;
}

export interface FieldUniform {
  dt: number;
  time: number;
  reduced: number;
  energy: number;
  hands: [HandUniform, HandUniform];
}

export function packComputeUniform(f: FieldUniform): ArrayBuffer {
  const u = new Float32Array(20);
  u[0] = f.dt;
  u[1] = f.time;
  u[2] = f.reduced;
  u[3] = f.energy;
  for (let h = 0; h < 2; h++) {
    const b = 4 + h * 8;
    const hand = f.hands[h];
    u[b] = hand.x;
    u[b + 1] = hand.y;
    u[b + 2] = hand.active;
    u[b + 3] = hand.force;
    u[b + 4] = hand.vx;
    u[b + 5] = hand.vy;
    u[b + 6] = hand.burst;
    u[b + 7] = 0;
  }
  return u.buffer;
}

export function packRenderUniform(
  aspect: number,
  size: number,
  brightness: number,
  time: number,
): ArrayBuffer {
  return new Float32Array([aspect, size, brightness, time]).buffer;
}

export interface GpuCtx {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  particleBuf: GPUBuffer;
  computeUniBuf: GPUBuffer;
  renderUniBuf: GPUBuffer;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
  destroy(): void;
}

export async function buildGpu(
  canvas: HTMLCanvasElement,
  seed: number,
): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const initial = buildInitialParticles(seed);
  const particleBuf = device.createBuffer({
    size: initial.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initial.buffer);

  const computeUniBuf = device.createBuffer({
    size: 80, // 20 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUniBuf = device.createBuffer({
    size: 16, // 4 f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: VERT_WGSL }),
      entryPoint: "main",
    },
    fragment: {
      module: device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "main",
      targets: [
        {
          format: fmt,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
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
      { binding: 1, resource: { buffer: computeUniBuf } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: renderUniBuf } },
    ],
  });

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    try {
      particleBuf.destroy();
      computeUniBuf.destroy();
      renderUniBuf.destroy();
      device.destroy();
    } catch {
      /* device already lost */
    }
  }

  return {
    device,
    ctx,
    computePipeline,
    renderPipeline,
    particleBuf,
    computeUniBuf,
    renderUniBuf,
    computeBG,
    renderBG,
    destroy,
  };
}
