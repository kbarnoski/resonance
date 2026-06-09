// gpu.ts — WebGPU compute particle galaxy + WebGL2 fallback
//
// WebGPU path: 60 000 particles, WGSL compute shader integrates velocities
//   each frame; attractor/repulsor wells from hand positions.
// WebGL2 fallback: 8 000 instanced quads, CPU velocity integration.
// Both render as additive glow quads for aurora/nebula look.

import type { Attractor } from "./hands";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────────────

export interface GalaxyRenderer {
  frame(attractors: Attractor[], dt: number, time: number): void;
  resize(w: number, h: number): void;
  destroy(): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// WGSL — WebGPU compute + render
// ─────────────────────────────────────────────────────────────────────────────

const PARTICLE_COUNT_GPU = 60_000;
const WORKGROUP_SIZE = 256;
const MAX_ATTRACTORS = 4;

const COMPUTE_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  seed: f32,
  _pad: f32,
}

struct Attractor {
  x: f32,
  y: f32,
  strength: f32,
  radius: f32,
  hue: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
}

struct Uniforms {
  count    : u32,
  nAttr    : u32,
  time     : f32,
  dt       : f32,
  aspect   : f32,
  _p0: f32, _p1: f32, _p2: f32,
}

@group(0) @binding(0) var<storage, read_write> particles : array<Particle>;
@group(0) @binding(1) var<storage, read>       attractors: array<Attractor>;
@group(0) @binding(2) var<uniform>             u         : Uniforms;

fn hash2(seed: f32) -> vec2<f32> {
  let s = seed * 127.1 + 311.7;
  return fract(vec2<f32>(sin(s * 0.1307), cos(s * 0.1509)) * 43758.55) * 2.0 - 1.0;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.count) { return; }
  var p = particles[i];

  // ── Ambient curl-noise drift — alive even with no hands ─────────────────
  let sc = 2.5;
  let tp = p.pos * sc + vec2<f32>(0.0, u.time * 0.06);
  let cx = sin(tp.y * 3.1 + u.time * 0.11) * 0.00035;
  let cy = cos(tp.x * 2.7 + u.time * 0.09) * 0.00035;
  var acc = vec2<f32>(cx, cy);

  // tiny per-particle stochastic kick for sparkle
  let jitter = hash2(p.seed + u.time * 0.01) * 0.00008;
  acc += jitter;

  // ── Attractor/repulsor forces ────────────────────────────────────────────
  for (var ai = 0u; ai < u.nAttr; ai++) {
    let a = attractors[ai];
    var d = vec2<f32>(a.x, a.y) - p.pos;
    let dist = max(length(d), 0.0001);
    let r = a.radius;
    if (dist < r * 2.5) {
      let t = dist / r;
      // soft falloff: peaks at t=0.4, zero at t=0 and t=2.5
      let falloff = smoothstep(0.0, 0.4, t) * smoothstep(2.5, 0.6, t);
      let force = a.strength * falloff * 0.0038;
      acc += (d / dist) * force;
    }
  }

  // ── Integrate ────────────────────────────────────────────────────────────
  let damp = 0.965;
  p.vel = (p.vel + acc) * damp;
  let spd = length(p.vel);
  let maxSpd = 0.008;
  if (spd > maxSpd) { p.vel *= maxSpd / spd; }

  p.pos += p.vel * u.dt * 60.0;

  // Wrap at boundaries
  p.pos = fract(p.pos + vec2<f32>(1.0));
  particles[i] = p;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
  seed: f32,
  _pad: f32,
}

struct Attractor {
  x: f32,
  y: f32,
  strength: f32,
  radius: f32,
  hue: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
}

struct Uniforms {
  count    : u32,
  nAttr    : u32,
  time     : f32,
  dt       : f32,
  aspect   : f32,
  _p0: f32, _p1: f32, _p2: f32,
}

@group(0) @binding(0) var<storage, read> particles : array<Particle>;
@group(0) @binding(1) var<storage, read> attractors: array<Attractor>;
@group(0) @binding(2) var<uniform>       u         : Uniforms;

struct VSOut {
  @builtin(position) clip  : vec4<f32>,
  @location(0)       uv    : vec2<f32>,
  @location(1)       speed : f32,
  @location(2)       seed  : f32,
  @location(3)       hue   : f32,
}

fn hsl2rgb(h: f32, s: f32, l: f32) -> vec3<f32> {
  let c = (1.0 - abs(2.0 * l - 1.0)) * s;
  let hp = h * 6.0;
  let x = c * (1.0 - abs(hp % 2.0 - 1.0));
  var rgb = vec3<f32>(0.0);
  if (hp < 1.0) { rgb = vec3<f32>(c, x, 0.0); }
  else if (hp < 2.0) { rgb = vec3<f32>(x, c, 0.0); }
  else if (hp < 3.0) { rgb = vec3<f32>(0.0, c, x); }
  else if (hp < 4.0) { rgb = vec3<f32>(0.0, x, c); }
  else if (hp < 5.0) { rgb = vec3<f32>(x, 0.0, c); }
  else               { rgb = vec3<f32>(c, 0.0, x); }
  let m = l - c * 0.5;
  return rgb + m;
}

@vertex
fn vs(
  @builtin(vertex_index)   vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  let p = particles[ii];

  // Billboard quad corners
  var corners = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>(1.0,  1.0),
  );
  let corner = corners[vi];

  let spd = length(p.vel);
  let sz = (0.004 + spd * 0.35) * (0.6 + 0.4 * fract(p.seed * 13.1));

  // NDC: pos is 0..1, map to -1..1, apply aspect
  let ndc = vec2<f32>(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);
  let clipPos = ndc + corner * vec2<f32>(sz / u.aspect, sz);

  // Colour: blend between two hues from nearest attractors
  var blendHue = fract(p.seed * 5.0) * 0.5 + 0.45; // base nebula hue
  if (u.nAttr > 0u) {
    var nearest = 9999.0;
    var nearHue = blendHue;
    for (var ai = 0u; ai < u.nAttr; ai++) {
      let a = attractors[ai];
      let d = distance(vec2<f32>(a.x, a.y), p.pos);
      if (d < nearest) { nearest = d; nearHue = a.hue; }
    }
    blendHue = mix(blendHue, nearHue, smoothstep(0.35, 0.0, nearest));
  }

  var out: VSOut;
  out.clip  = vec4<f32>(clipPos, 0.0, 1.0);
  out.uv    = corner;
  out.speed = spd;
  out.seed  = p.seed;
  out.hue   = blendHue;
  return out;
}

@fragment
fn fs(v: VSOut) -> @location(0) vec4<f32> {
  let d2 = dot(v.uv, v.uv);
  if (d2 > 1.0) { discard; }
  let glow = pow(1.0 - d2, 1.8);

  // Aurora palette: shift hue subtly by speed for energy indication
  let h = fract(v.hue + v.speed * 0.3);
  let l = 0.42 + v.speed * 0.25;
  let col = hsl2rgb(h, 0.90, l);

  let a = glow * (0.06 + v.speed * 0.55);
  return vec4<f32>(col * glow, a);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// WebGPU renderer
// ─────────────────────────────────────────────────────────────────────────────

// Minimal WebGPU type declarations to avoid TS errors without full @webgpu/types
interface GPUType {
  requestAdapter(opts?: { powerPreference?: string }): Promise<{ requestDevice(): Promise<GPUDeviceType> } | null>;
  getPreferredCanvasFormat(): string;
}
interface GPUDeviceType {
  createBuffer(desc: object): GPUBufType;
  createShaderModule(desc: { code: string }): object;
  createComputePipeline(desc: object): GPUComputePipelineType;
  createRenderPipeline(desc: object): GPURenderPipelineType;
  createBindGroup(desc: object): object;
  createCommandEncoder(): GPUEncoderType;
  queue: { writeBuffer(buf: GPUBufType, offset: number, data: ArrayBuffer | Float32Array | Uint32Array): void; submit(cmds: object[]): void };
  destroy(): void;
}
interface GPUBufType {
  destroy(): void;
}
interface GPUComputePipelineType { getBindGroupLayout(i: number): object; }
interface GPURenderPipelineType { getBindGroupLayout(i: number): object; }
interface GPUEncoderType {
  beginComputePass(): { setPipeline(p: object): void; setBindGroup(i: number, bg: object): void; dispatchWorkgroups(x: number): void; end(): void };
  beginRenderPass(desc: object): { setPipeline(p: object): void; setBindGroup(i: number, bg: object): void; draw(verts: number, instances: number): void; end(): void };
  finish(): object;
}
interface GPUCanvasContextType {
  configure(desc: object): void;
  getCurrentTexture(): { createView(): object };
  unconfigure(): void;
}

async function buildWebGPURenderer(canvas: HTMLCanvasElement): Promise<GalaxyRenderer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navGpu = (navigator as any).gpu as GPUType | undefined;
  if (!navGpu) throw new Error("WebGPU not available");

  const adapter = await navGpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const format = navGpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu") as unknown as GPUCanvasContextType;
  if (!ctx) throw new Error("No WebGPU canvas context");
  ctx.configure({ device, format, alphaMode: "premultiplied" });

  const N = PARTICLE_COUNT_GPU;

  // ── Particle buffer ────────────────────────────────────────────────────────
  const particleData = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    const o = i * 6;
    // Galaxy spiral initial distribution
    const angle = (i / N) * Math.PI * 2 * 8 + Math.random() * 0.4;
    const r = 0.08 + Math.pow(Math.random(), 0.5) * 0.42;
    particleData[o + 0] = 0.5 + Math.cos(angle) * r;
    particleData[o + 1] = 0.5 + Math.sin(angle) * r;
    particleData[o + 2] = 0; // vel x
    particleData[o + 3] = 0; // vel y
    particleData[o + 4] = Math.random(); // seed
    particleData[o + 5] = 0; // pad
  }
  const particleBuf = device.createBuffer({
    size: particleData.byteLength,
    usage: 0x88, // STORAGE | COPY_DST
  });
  device.queue.writeBuffer(particleBuf, 0, particleData.buffer as ArrayBuffer);

  // ── Attractor buffer (MAX_ATTRACTORS × 8 f32) ─────────────────────────────
  const attrData = new Float32Array(MAX_ATTRACTORS * 8);
  const attrBuf = device.createBuffer({
    size: attrData.byteLength,
    usage: 0x48, // STORAGE | COPY_DST
  });

  // ── Uniform buffer (8 f32 = 32 bytes) ────────────────────────────────────
  const uniData = new Float32Array(8);
  const uniBuf = device.createBuffer({
    size: Math.max(uniData.byteLength, 16),
    usage: 0x44, // UNIFORM | COPY_DST
  });

  // ── Pipelines ──────────────────────────────────────────────────────────────
  const computeMod = device.createShaderModule({ code: COMPUTE_WGSL });
  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeMod, entryPoint: "main" },
  });

  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod, entryPoint: "fs",
      targets: [{
        format,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
          alpha: { srcFactor: "one",       dstFactor: "one", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-strip" },
  });

  const computeBG = device.createBindGroup({
    layout: computePl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: attrBuf } },
      { binding: 2, resource: { buffer: uniBuf } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: attrBuf } },
      { binding: 2, resource: { buffer: uniBuf } },
    ],
  });

  let aspect = canvas.width / Math.max(1, canvas.height);
  let destroyed = false;

  return {
    frame(attractors: Attractor[], dt: number, time: number) {
      if (destroyed) return;

      // Write attractor data
      const nAttr = Math.min(attractors.length, MAX_ATTRACTORS);
      for (let i = 0; i < MAX_ATTRACTORS; i++) {
        const o = i * 8;
        if (i < nAttr) {
          const a = attractors[i];
          attrData[o + 0] = a.x;
          attrData[o + 1] = a.y;
          attrData[o + 2] = a.strength;
          attrData[o + 3] = a.radius;
          attrData[o + 4] = a.hue;
        } else {
          attrData[o + 0] = -9; attrData[o + 1] = -9;
          attrData[o + 2] = 0;  attrData[o + 3] = 0;
          attrData[o + 4] = 0;
        }
      }
      device.queue.writeBuffer(attrBuf, 0, attrData.buffer as ArrayBuffer);

      // Write uniforms
      const uniU32 = new Uint32Array(uniData.buffer);
      uniU32[0] = N;
      uniU32[1] = nAttr;
      uniData[2] = time;
      uniData[3] = Math.min(dt, 0.05);
      uniData[4] = aspect;
      device.queue.writeBuffer(uniBuf, 0, uniData.buffer as ArrayBuffer);

      const enc = device.createCommandEncoder();

      // Compute pass
      const cp = enc.beginComputePass();
      cp.setPipeline(computePl);
      cp.setBindGroup(0, computeBG);
      cp.dispatchWorkgroups(Math.ceil(N / WORKGROUP_SIZE));
      cp.end();

      // Render pass
      let view: object;
      try {
        view = ctx.getCurrentTexture().createView();
      } catch { return; }

      const rp = enc.beginRenderPass({
        colorAttachments: [{
          view,
          clearValue: { r: 0.01, g: 0.005, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      rp.setPipeline(renderPl);
      rp.setBindGroup(0, renderBG);
      rp.draw(4, N);
      rp.end();

      device.queue.submit([enc.finish()]);
    },

    resize(w: number, h: number) {
      if (destroyed) return;
      aspect = w / Math.max(1, h);
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { particleBuf.destroy(); } catch { /* ignore */ }
      try { attrBuf.destroy(); } catch { /* ignore */ }
      try { uniBuf.destroy(); } catch { /* ignore */ }
      try { ctx.unconfigure(); } catch { /* ignore */ }
      try { device.destroy(); } catch { /* ignore */ }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WebGL2 fallback — CPU particles, instanced rendering
// ─────────────────────────────────────────────────────────────────────────────

const PARTICLE_COUNT_GL = 8_000;

const GL_VERT = /* glsl */ `#version 300 es
precision highp float;

// Per-quad corners (attribute, 4 verts per instance)
in vec2 aCorner;
// Per-instance particle data
in vec4 aParticle; // xy=pos, zw=vel
in float aSeed;

uniform vec2 uResolution;
uniform float uTime;

out vec2 vUV;
out float vSpeed;
out float vSeed;
out float vHue;

// Attractor uniforms
uniform int   uNAttr;
uniform vec4  uAttr0; // xy=pos, z=strength, w=radius
uniform float uAttr0Hue;
uniform vec4  uAttr1;
uniform float uAttr1Hue;
uniform vec4  uAttr2;
uniform float uAttr2Hue;
uniform vec4  uAttr3;
uniform float uAttr3Hue;

vec4 getAttr(int i) {
  if (i == 0) return uAttr0;
  if (i == 1) return uAttr1;
  if (i == 2) return uAttr2;
  return uAttr3;
}
float getAttrHue(int i) {
  if (i == 0) return uAttr0Hue;
  if (i == 1) return uAttr1Hue;
  if (i == 2) return uAttr2Hue;
  return uAttr3Hue;
}

void main() {
  vec2 pos = aParticle.xy;
  vec2 vel = aParticle.zw;
  float spd = length(vel);

  float aspect = uResolution.x / uResolution.y;
  float sz = (0.006 + spd * 0.5) * (0.6 + 0.4 * fract(aSeed * 13.1));

  vec2 ndc = pos * 2.0 - 1.0;
  ndc.y = -ndc.y;
  vec2 clipPos = ndc + aCorner * vec2(sz / aspect, sz);

  // Hue: blend toward nearest attractor
  float baseHue = fract(aSeed * 5.0) * 0.5 + 0.45;
  float blendHue = baseHue;
  float nearest = 9999.0;
  for (int ai = 0; ai < 4; ai++) {
    if (ai >= uNAttr) break;
    vec4 a = getAttr(ai);
    float d = distance(a.xy, pos);
    if (d < nearest) { nearest = d; blendHue = getAttrHue(ai); }
  }
  float t = smoothstep(0.35, 0.0, nearest);
  blendHue = mix(baseHue, blendHue, t);

  vUV    = aCorner;
  vSpeed = spd;
  vSeed  = aSeed;
  vHue   = blendHue;
  gl_Position = vec4(clipPos, 0.0, 1.0);
}
`;

const GL_FRAG = /* glsl */ `#version 300 es
precision mediump float;

in vec2 vUV;
in float vSpeed;
in float vSeed;
in float vHue;

out vec4 fragColor;

vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0*l - 1.0)) * s;
  float hp = mod(h * 6.0, 6.0);
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb;
  if      (hp < 1.0) rgb = vec3(c,x,0);
  else if (hp < 2.0) rgb = vec3(x,c,0);
  else if (hp < 3.0) rgb = vec3(0,c,x);
  else if (hp < 4.0) rgb = vec3(0,x,c);
  else if (hp < 5.0) rgb = vec3(x,0,c);
  else               rgb = vec3(c,0,x);
  return rgb + (l - c * 0.5);
}

void main() {
  float d2 = dot(vUV, vUV);
  if (d2 > 1.0) discard;
  float glow = pow(1.0 - d2, 1.8);

  float h = fract(vHue + vSpeed * 0.3);
  float l = 0.42 + vSpeed * 0.25;
  vec3 col = hsl2rgb(h, 0.90, l);

  float a = glow * (0.08 + vSpeed * 0.65);
  fragColor = vec4(col * glow, a);
}
`;

interface GL2State {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  particleBuf: WebGLBuffer;
  seedBuf: WebGLBuffer;
  positions: Float32Array; // [x, y, vx, vy] × N
  seeds: Float32Array;
}

function buildGL2Renderer(canvas: HTMLCanvasElement): GalaxyRenderer | null {
  const glRaw = canvas.getContext("webgl2", { premultipliedAlpha: false });
  if (!glRaw) return null;
  const gl: WebGL2RenderingContext = glRaw;

  // Compile shaders
  function compileShader(type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  }
  const vs = compileShader(gl.VERTEX_SHADER, GL_VERT);
  const fs = compileShader(gl.FRAGMENT_SHADER, GL_FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;

  const N = PARTICLE_COUNT_GL;

  // Corner buffer — 4 corners per instance, reused
  const cornerBuf = gl.createBuffer();
  if (!cornerBuf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  // Particle data: [x, y, vx, vy] per particle
  const positions = new Float32Array(N * 4);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 * 6 + Math.random() * 0.5;
    const r = 0.08 + Math.pow(Math.random(), 0.5) * 0.42;
    positions[i * 4 + 0] = 0.5 + Math.cos(angle) * r;
    positions[i * 4 + 1] = 0.5 + Math.sin(angle) * r;
    positions[i * 4 + 2] = 0;
    positions[i * 4 + 3] = 0;
    seeds[i] = Math.random();
  }

  const particleBuf = gl.createBuffer();
  if (!particleBuf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

  const seedBuf = gl.createBuffer();
  if (!seedBuf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

  // VAO
  const vao = gl.createVertexArray();
  if (!vao) return null;
  gl.bindVertexArray(vao);

  // aCorner — per-vertex (location 0)
  const aCorner = gl.getAttribLocation(prog, "aCorner");
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

  // aParticle — per-instance (location 1)
  const aParticle = gl.getAttribLocation(prog, "aParticle");
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuf);
  gl.enableVertexAttribArray(aParticle);
  gl.vertexAttribPointer(aParticle, 4, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(aParticle, 1);

  // aSeed — per-instance (location 2)
  const aSeed = gl.getAttribLocation(prog, "aSeed");
  gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
  gl.enableVertexAttribArray(aSeed);
  gl.vertexAttribPointer(aSeed, 1, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(aSeed, 1);

  gl.bindVertexArray(null);

  const state: GL2State = { gl, prog, vao, particleBuf, seedBuf, positions, seeds };

  let destroyed = false;

  return {
    frame(attractors: Attractor[], dt: number, time: number) {
      if (destroyed) return;
      const { gl: g, prog: pr, vao: va, particleBuf: pb, positions: pos } = state;

      // CPU physics step
      const nAttr = Math.min(attractors.length, MAX_ATTRACTORS);
      const clampedDt = Math.min(dt, 0.05);

      for (let i = 0; i < N; i++) {
        const o = i * 4;
        let px = pos[o + 0], py = pos[o + 1];
        let vx = pos[o + 2], vy = pos[o + 3];

        // Curl-noise drift
        const sc = 2.5;
        const tpx = px * sc, tpy = py * sc;
        const cx = Math.sin(tpy * 3.1 + time * 0.11) * 0.00035;
        const cy = Math.cos(tpx * 2.7 + time * 0.09) * 0.00035;
        vx += cx; vy += cy;

        // Attractor forces
        for (let ai = 0; ai < nAttr; ai++) {
          const a = attractors[ai];
          const dx = a.x - px, dy = a.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const r = a.radius;
          if (dist < r * 2.5) {
            const t = dist / r;
            const falloff = Math.max(0, Math.min(1, t / 0.4)) * Math.max(0, Math.min(1, (2.5 - t) / 1.9));
            const force = a.strength * falloff * 0.0038;
            vx += (dx / dist) * force;
            vy += (dy / dist) * force;
          }
        }

        // Integrate
        vx *= 0.965; vy *= 0.965;
        const spd = Math.sqrt(vx * vx + vy * vy);
        const maxSpd = 0.008;
        if (spd > maxSpd) { vx *= maxSpd / spd; vy *= maxSpd / spd; }

        px = ((px + vx * clampedDt * 60) % 1 + 1) % 1;
        py = ((py + vy * clampedDt * 60) % 1 + 1) % 1;

        pos[o + 0] = px; pos[o + 1] = py;
        pos[o + 2] = vx; pos[o + 3] = vy;
      }

      // Upload particle data
      g.bindBuffer(g.ARRAY_BUFFER, pb);
      g.bufferSubData(g.ARRAY_BUFFER, 0, pos);

      // Render
      g.viewport(0, 0, canvas.width, canvas.height);
      g.clearColor(0.01, 0.005, 0.03, 1);
      g.clear(g.COLOR_BUFFER_BIT);
      g.enable(g.BLEND);
      g.blendFunc(g.SRC_ALPHA, g.ONE);

      g.useProgram(pr);
      g.uniform2f(g.getUniformLocation(pr, "uResolution"), canvas.width, canvas.height);
      g.uniform1f(g.getUniformLocation(pr, "uTime"), time);
      g.uniform1i(g.getUniformLocation(pr, "uNAttr"), nAttr);

      const attrData = [
        attractors[0] ?? null, attractors[1] ?? null,
        attractors[2] ?? null, attractors[3] ?? null,
      ];
      const suffixes = ["0", "1", "2", "3"];
      for (let ai = 0; ai < 4; ai++) {
        const a = attrData[ai];
        const suf = suffixes[ai];
        g.uniform4f(g.getUniformLocation(pr, `uAttr${suf}`),
          a?.x ?? -9, a?.y ?? -9, a?.strength ?? 0, a?.radius ?? 0);
        g.uniform1f(g.getUniformLocation(pr, `uAttr${suf}Hue`), a?.hue ?? 0);
      }

      g.bindVertexArray(va);
      g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, N);
      g.bindVertexArray(null);
    },

    resize() {
      // viewport is set each frame from canvas.width/height
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { gl.deleteProgram(prog); } catch { /* ignore */ }
      try { gl.deleteBuffer(cornerBuf); } catch { /* ignore */ }
      try { gl.deleteBuffer(particleBuf); } catch { /* ignore */ }
      try { gl.deleteBuffer(seedBuf); } catch { /* ignore */ }
      try { gl.deleteVertexArray(vao); } catch { /* ignore */ }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public factory — tries WebGPU, falls back to WebGL2
// ─────────────────────────────────────────────────────────────────────────────

export type RenderPath = "webgpu" | "webgl2" | "none";

export async function createGalaxyRenderer(
  canvas: HTMLCanvasElement,
): Promise<{ renderer: GalaxyRenderer; path: RenderPath }> {
  // Try WebGPU first
  try {
    const renderer = await buildWebGPURenderer(canvas);
    return { renderer, path: "webgpu" };
  } catch {
    // fall through to WebGL2
  }

  // Try WebGL2
  const renderer = buildGL2Renderer(canvas);
  if (renderer) return { renderer, path: "webgl2" };

  // Both failed — return a no-op renderer
  return {
    renderer: {
      frame() { /* no-op */ },
      resize() { /* no-op */ },
      destroy() { /* no-op */ },
    },
    path: "none",
  };
}
