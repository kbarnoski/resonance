// gpu.ts — WebGPU compute particle simulation + additive render pass.
//
// A compute pass integrates ~500k particle positions/velocities each frame.
// The velocity field is curl-noise (Bridson 2007) advection plus radial forces
// driven by 8 FFT bands: bass swells push a slow billowing core outward, highs
// scatter sparkle at the rim. Onset spikes bloom the whole cloud then it settles
// (velocity damping gives the system memory). A render pass draws particles as
// additive glow point-sprites coloured by band/velocity.
//
// References:
//   Refik Anadol — latent / particle flow aesthetic (Machine Hallucinations).
//   Robert Bridson — "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007.

import { NUM_BANDS } from "./audio";

export const PARTICLE_COUNT = 500_000;
const WG = 64;

// ── compute shader ───────────────────────────────────────────────────────────────
// Particle = { pos: vec4f (xyz + life/seed in w), vel: vec4f (xyz + speed in w) }.

const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f }

struct U {
  dt: f32, time: f32, bloom: f32, energy: f32,
  b0: f32, b1: f32, b2: f32, b3: f32,
  b4: f32, b5: f32, b6: f32, b7: f32,
}

@group(0) @binding(0) var<storage, read_write> ps: array<Particle>;
@group(0) @binding(1) var<uniform> u: U;

fn hash3(p: vec3f) -> vec3f {
  var q = vec3f(
    dot(p, vec3f(127.1, 311.7, 74.7)),
    dot(p, vec3f(269.5, 183.3, 246.1)),
    dot(p, vec3f(113.5, 271.9, 124.6)));
  return fract(sin(q) * 43758.5453123) * 2.0 - 1.0;
}

// gradient noise (Perlin-ish) returning a scalar in ~[-1,1]
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let n000 = dot(hash3(i + vec3f(0,0,0)), f - vec3f(0,0,0));
  let n100 = dot(hash3(i + vec3f(1,0,0)), f - vec3f(1,0,0));
  let n010 = dot(hash3(i + vec3f(0,1,0)), f - vec3f(0,1,0));
  let n110 = dot(hash3(i + vec3f(1,1,0)), f - vec3f(1,1,0));
  let n001 = dot(hash3(i + vec3f(0,0,1)), f - vec3f(0,0,1));
  let n101 = dot(hash3(i + vec3f(1,0,1)), f - vec3f(1,0,1));
  let n011 = dot(hash3(i + vec3f(0,1,1)), f - vec3f(0,1,1));
  let n111 = dot(hash3(i + vec3f(1,1,1)), f - vec3f(1,1,1));
  let x00 = mix(n000, n100, w.x);
  let x10 = mix(n010, n110, w.x);
  let x01 = mix(n001, n101, w.x);
  let x11 = mix(n011, n111, w.x);
  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z);
}

// scalar potential field; curl of this gives a divergence-free flow (Bridson 2007)
fn potential(p: vec3f) -> vec3f {
  let t = u.time * 0.12;
  // mid bands modulate the flow scale → texture of the billows
  let s = 0.55 + u.b3 * 0.5 + u.b4 * 0.4;
  return vec3f(
    noise(p * s + vec3f(t, 0.0, 0.0)),
    noise(p * s + vec3f(0.0, t + 11.3, 0.0)),
    noise(p * s + vec3f(0.0, 0.0, t + 31.7))
  );
}

// curl of the potential via finite differences
fn curlNoise(p: vec3f) -> vec3f {
  let e = 0.18;
  let dx = vec3f(e, 0.0, 0.0);
  let dy = vec3f(0.0, e, 0.0);
  let dz = vec3f(0.0, 0.0, e);
  let px0 = potential(p - dx); let px1 = potential(p + dx);
  let py0 = potential(p - dy); let py1 = potential(p + dy);
  let pz0 = potential(p - dz); let pz1 = potential(p + dz);
  let cx = (py1.z - py0.z) - (pz1.y - pz0.y);
  let cy = (pz1.x - pz0.x) - (px1.z - px0.z);
  let cz = (px1.y - px0.y) - (py1.x - py0.x);
  return vec3f(cx, cy, cz) / (2.0 * e);
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${PARTICLE_COUNT}u) { return; }
  var pos = ps[i].pos.xyz;
  var vel = ps[i].vel.xyz;
  let seed = ps[i].pos.w;
  let dt = u.dt;

  let r = length(pos) + 1e-4;
  let dir = pos / r;

  // curl-noise advection (the latent-flow billow)
  let flow = curlNoise(pos * 0.5) * (0.8 + u.energy * 1.6);

  // sub-bass + bass: slow outward swell of the core
  let bass = (u.b0 * 1.3 + u.b1 * 0.9);
  let coreCore = dir * bass * 1.1 * smoothstep(2.4, 0.0, r);

  // low-mids pull a gentle gravity back to centre so the cloud breathes, not explodes
  let gravity = -dir * (0.6 + u.b2 * 0.4) * smoothstep(0.6, 2.6, r);

  // highs (b5..b7): scatter sparkle at the rim
  let rim = smoothstep(1.2, 2.4, r);
  let scatter = hash3(pos * 3.1 + vec3f(seed * 17.0)) * (u.b5 * 0.8 + u.b6 * 1.1 + u.b7 * 1.4) * rim;

  // onset bloom: radial kick scaled by the global bloom envelope
  let bloom = dir * u.bloom * 2.2;

  let force = flow + coreCore + gravity + scatter + bloom;
  vel = vel + force * dt;
  // damping gives the system memory: loud passages stay expanded, quiet ones settle
  vel = vel * (0.965 - u.energy * 0.02);

  pos = pos + vel * dt;

  // soft containment so nothing escapes the frame forever
  let maxR = 3.2;
  let rr = length(pos);
  if (rr > maxR) {
    pos = pos * (maxR / rr);
    vel = vel * 0.5;
  }

  let spd = clamp(length(vel) * 0.9, 0.0, 1.0);
  ps[i].pos = vec4f(pos, seed);
  ps[i].vel = vec4f(vel, spd);
}`;

// ── vertex shader ─────────────────────────────────────────────────────────────────
const VERT_WGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f }

struct VU { mvp: mat4x4f, size: f32, pad0: f32, pad1: f32, pad2: f32 }

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) spd: f32,
  @location(1) uv: vec2f,
  @location(2) seed: f32,
}

@group(0) @binding(0) var<storage, read> ps: array<Particle>;
@group(0) @binding(1) var<uniform> u: VU;

const OFF = array<vec2f, 6>(
  vec2f(-0.5,-0.5), vec2f(0.5,-0.5), vec2f(-0.5,0.5),
  vec2f(-0.5,0.5),  vec2f(0.5,-0.5), vec2f(0.5,0.5)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let p = ps[pi];
  let cl = u.mvp * vec4f(p.pos.xyz, 1.0);
  let o = OFF[ci];
  let sz = u.size * cl.w;
  var vo: VO;
  vo.pos = cl + vec4f(o.x * sz, o.y * sz, 0.0, 0.0);
  vo.spd = p.vel.w;
  vo.uv = o + 0.5;
  vo.seed = p.pos.w;
  return vo;
}`;

// ── fragment shader ───────────────────────────────────────────────────────────────
// Cosmic latent-flow palette: deep indigo core → violet → magenta → warm gold rim.
const FRAG_WGSL = /* wgsl */ `
@fragment fn main(
  @location(0) spd: f32,
  @location(1) uv: vec2f,
  @location(2) seed: f32
) -> @location(0) vec4f {
  let d = length(uv - 0.5);
  if (d > 0.5) { discard; }
  let glow = (1.0 - smoothstep(0.05, 0.5, d));
  let a = glow * 0.22;

  let c0 = vec3f(0.16, 0.10, 0.42); // deep indigo
  let c1 = vec3f(0.45, 0.18, 0.78); // violet
  let c2 = vec3f(0.88, 0.30, 0.66); // magenta
  let c3 = vec3f(1.0,  0.78, 0.45); // warm gold
  let t = clamp(spd, 0.0, 1.0);
  var col = mix(c0, c1, smoothstep(0.0, 0.4, t));
  col = mix(col, c2, smoothstep(0.35, 0.7, t));
  col = mix(col, c3, smoothstep(0.7, 1.0, t));
  // per-particle hue jitter from seed for that shimmering latent texture
  col = col + vec3f(seed * 0.06, -seed * 0.03, seed * 0.05);
  return vec4f(col * a, a);
}`;

// ── initial particle cloud ────────────────────────────────────────────────────────
function buildInitialParticles(): Float32Array {
  // 8 floats per particle: pos.xyzw + vel.xyzw
  const data = new Float32Array(PARTICLE_COUNT * 8);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // distribute in a fuzzy sphere shell
    const u1 = Math.random();
    const u2 = Math.random();
    const theta = 2 * Math.PI * u1;
    const phi = Math.acos(2 * u2 - 1);
    const rad = 0.5 + Math.pow(Math.random(), 0.6) * 1.4;
    const x = rad * Math.sin(phi) * Math.cos(theta);
    const y = rad * Math.sin(phi) * Math.sin(theta);
    const z = rad * Math.cos(phi);
    const o = i * 8;
    data[o] = x;
    data[o + 1] = y;
    data[o + 2] = z;
    data[o + 3] = Math.random(); // seed in w
    data[o + 4] = 0;
    data[o + 5] = 0;
    data[o + 6] = 0;
    data[o + 7] = 0;
  }
  return data;
}

// ── camera / MVP (column-major, WebGPU depth [0,1]) ──────────────────────────────
export function buildMvp(az: number, el: number, aspect: number, dist: number): Float32Array {
  const fov = 52 * (Math.PI / 180);
  const f = 1 / Math.tan(fov / 2);
  const nr = 0.05;
  const fr = 30.0;
  const A = fr / (nr - fr);
  const B = (nr * fr) / (nr - fr);
  const P = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, A, -1, 0, 0, B, 0]);

  const r = dist;
  const ex = r * Math.cos(el) * Math.sin(az);
  const ey = r * Math.sin(el);
  const ez = r * Math.cos(el) * Math.cos(az);
  const fx = -ex / r;
  const fy = -ey / r;
  const fz = -ez / r;
  let rx = -fz;
  let rz = fx;
  const rl = Math.sqrt(rx * rx + rz * rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const tx = -(rx * ex + rz * ez);
  const ty = -(ux * ex + uy * ey + uz * ez);
  const tz = fx * ex + fy * ey + fz * ez;
  const V = new Float32Array([rx, ux, -fx, 0, 0, uy, -fy, 0, rz, uz, -fz, 0, tx, ty, tz, 1]);

  const M = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let rr = 0; rr < 4; rr++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += P[k * 4 + rr] * V[c * 4 + k];
      M[c * 4 + rr] = s;
    }
  }
  return M;
}

// ── GPU context ──────────────────────────────────────────────────────────────────
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

export async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const initialData = buildInitialParticles();
  const particleBuf = device.createBuffer({
    size: initialData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initialData.buffer);

  // compute uniforms: dt,time,bloom,energy + 8 bands = 12 floats → 48 bytes (round to 48)
  const computeUniBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // render uniforms: mat4 (64) + size + pad×3 = 80 bytes
  const renderUniBuf = device.createBuffer({
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: VERT_WGSL }), entryPoint: "main" },
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
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    particleBuf.destroy();
    computeUniBuf.destroy();
    renderUniBuf.destroy();
    device.destroy();
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

// Pack the 12-float compute uniform from a frame's bands + envelopes.
export function packComputeUniform(
  dt: number,
  time: number,
  bloom: number,
  energy: number,
  bands: Float32Array,
): ArrayBuffer {
  const u = new Float32Array(12);
  u[0] = dt;
  u[1] = time;
  u[2] = bloom;
  u[3] = energy;
  for (let b = 0; b < NUM_BANDS && b < 8; b++) u[4 + b] = bands[b] ?? 0;
  return u.buffer;
}

export const WORKGROUP_DISPATCH = Math.ceil(PARTICLE_COUNT / WG);
