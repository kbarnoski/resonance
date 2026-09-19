"use client";

/* ── 17536 · Mudra ───────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if a VOCABULARY of discrete, recognized hand gestures — a
 *  musical sign-language / mudra system — let you conduct and transform one of
 *  Karel's own piano recordings, one gesture / one event?
 *
 *  This is the INVERSE of continuous landmark-mapping. MediaPipe's
 *  GestureRecognizer reports a discrete canned gesture per hand; each committed
 *  gesture triggers a distinct, HELD transformation of ONE real recording — a
 *  mudra alphabet for reshaping his take. Two hands can hold two mudras at once.
 *
 *  INPUT:  camera → MediaPipe GestureRecognizer (up to 2 hands, discrete events)
 *  AUDIO:  Karel's real solo-piano recording (looping buffer), transformed live,
 *          always terminating in createSafeMaster (never ctx.destination).
 *  OUTPUT: a WebGPU compute-particle field embodying the active mudra(s), with a
 *          Canvas2D fallback for browsers without WebGPU.
 *
 *  See README.md for the full technique writeup and references.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createGestureTracker,
  startCamera,
  type GestureRecognizerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";

// ── Gesture vocabulary ───────────────────────────────────────────────────────

type GestureName =
  | "Open_Palm"
  | "Closed_Fist"
  | "Pointing_Up"
  | "Thumb_Up"
  | "Thumb_Down"
  | "Victory"
  | "ILoveYou";

interface Mudra {
  name: GestureName;
  glyph: string;
  label: string;
  effect: string;
}

const MUDRAS: readonly Mudra[] = [
  { name: "Open_Palm", glyph: "✋", label: "open", effect: "full bloom · reverb space" },
  { name: "Closed_Fist", glyph: "✊", label: "hold", effect: "choke to near-silence" },
  { name: "Pointing_Up", glyph: "☝", label: "lift", effect: "bright register lift" },
  { name: "Thumb_Up", glyph: "👍", label: "quicken", effect: "tempo up (~1.5×)" },
  { name: "Thumb_Down", glyph: "👎", label: "deepen", effect: "slow / deepen (~0.6×)" },
  { name: "Victory", glyph: "✌", label: "shimmer", effect: "octave-double shimmer" },
  { name: "ILoveYou", glyph: "🤟", label: "widen", effect: "warm chorus / widening" },
];

const MUDRA_BY_NAME: Record<string, Mudra> = Object.fromEntries(
  MUDRAS.map((m) => [m.name, m]),
);

// ── Audio parameter model ────────────────────────────────────────────────────
// Every committed gesture (across both hands) writes into a target-param object.
// Non-conflicting params stack (left = tempo, right = brightness), conflicting
// ones are overwritten in hand order — genuine two-hand richness.

interface AudioParams {
  rate: number; // playbackRate
  master: number; // choke gain
  brightness: number; // high-shelf dB
  reverb: number; // reverb wet
  shimmer: number; // octave-up tap gain
  chorus: number; // widening send
}

const REST_PARAMS: AudioParams = {
  rate: 1.0,
  master: 1.0,
  brightness: 0,
  reverb: 0.12,
  shimmer: 0,
  chorus: 0,
};

/** Fold one gesture's owned params onto the running target. `depth` ∈ ~[0.5,1.2]
 *  is the continuous hand-height modifier scaling the ACTIVE transform depth. */
function applyMudra(p: AudioParams, name: GestureName, depth: number): void {
  switch (name) {
    case "Open_Palm":
      p.reverb = 0.35 + 0.35 * depth;
      p.brightness = 0;
      p.master = 1.0;
      break;
    case "Closed_Fist":
      p.master = 0.03;
      break;
    case "Pointing_Up":
      p.brightness = 4 + 8 * depth;
      p.rate = 1.0 + 0.14 * depth;
      break;
    case "Thumb_Up":
      p.rate = 1.0 + 0.5 * depth;
      break;
    case "Thumb_Down":
      p.rate = 1.0 - 0.4 * depth;
      break;
    case "Victory":
      p.shimmer = 0.35 + 0.35 * depth;
      break;
    case "ILoveYou":
      p.chorus = 0.35 + 0.35 * depth;
      break;
  }
}

// ── Visual force model (derived from the same active mudras) ──────────────────

interface FieldForces {
  bloom: number;
  collapse: number;
  upward: number;
  split: number;
  swirl: number;
  rate: number;
}

const REST_FORCES: FieldForces = {
  bloom: 0.12,
  collapse: 0,
  upward: 0,
  split: 0,
  swirl: 0.15,
  rate: 1,
};

function applyMudraField(f: FieldForces, name: GestureName, depth: number): void {
  switch (name) {
    case "Open_Palm":
      f.bloom = 0.6 + 0.4 * depth;
      break;
    case "Closed_Fist":
      f.collapse = 0.8 + 0.5 * depth;
      break;
    case "Pointing_Up":
      f.upward = 0.7 + 0.5 * depth;
      break;
    case "Thumb_Up":
      f.rate = 1.5;
      f.swirl = 0.5;
      break;
    case "Thumb_Down":
      f.rate = 0.6;
      f.swirl = 0.05;
      break;
    case "Victory":
      f.split = 0.8 + 0.4 * depth;
      break;
    case "ILoveYou":
      f.swirl = 0.7 + 0.4 * depth;
      break;
  }
}

// ── WGSL ──────────────────────────────────────────────────────────────────────

const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec2f, vel: vec2f }
struct Params {
  n: u32, time: f32, rms: f32, rate: f32,
  bloom: f32, collapse: f32, upward: f32, split: f32,
  swirl: f32, seed: f32, aspect: f32, _p: f32,
}
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

fn hashf(p: vec2f) -> f32 {
  var q = fract(p * 0.3183099 + vec2f(0.1, 0.1));
  q *= 17.0;
  return fract(q.x * q.y * (q.x + q.y));
}
fn curl(pos: vec2f, t: f32) -> vec2f {
  let e = 0.02;
  let tp = pos * 1.4 + vec2f(t * 0.12, t * 0.09);
  let dy = (hashf(tp + vec2f(0.0, e)) - hashf(tp - vec2f(0.0, e))) / (2.0 * e);
  let dx = (hashf(tp + vec2f(e, 0.0)) - hashf(tp - vec2f(e, 0.0))) / (2.0 * e);
  return vec2f(-dy, dx);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) { return; }
  var p = particles[i];

  let rl = length(p.pos) + 1e-4;
  let dir = p.pos / rl;
  let energy = 0.5 + params.rms * 1.6;

  var f = vec2f(0.0);
  // base slow swirl (always alive)
  f += curl(p.pos, params.time) * (params.swirl * 0.9 + params.rms * 0.5);
  // Open_Palm — slow radial bloom outward
  f += dir * params.bloom * (0.5 + params.rms * 0.8) * (1.0 - smoothstep(1.1, 1.5, rl));
  // Closed_Fist — collapse into a dense knot
  f -= dir * params.collapse * (0.9 + rl * 0.4);
  // Pointing_Up — upward stream
  f += vec2f(0.0, 1.0) * params.upward * (0.7 + params.rms * 0.5);
  f += vec2f((hashf(vec2f(f32(i), params.seed)) - 0.5) * 0.6, 0.0) * params.upward;
  // Victory — split into two braids toward ±0.55
  let side = select(-0.55, 0.55, p.pos.x > 0.0);
  f += vec2f(side - p.pos.x, -p.pos.y * 0.35) * params.split * 0.9;

  p.vel = p.vel * 0.93 + f * 0.02;
  let spd = length(p.vel);
  let maxSpd = 0.02 * (0.7 + params.rate * 0.6) * energy;
  if (spd > maxSpd) { p.vel *= maxSpd / spd; }

  p.pos += p.vel * (0.6 + params.rate * 0.7);

  // soft reflective boundary — no wrap, keeps the mudra geometry readable
  if (p.pos.x > 1.35) { p.pos.x = 1.35; p.vel.x = -abs(p.vel.x) * 0.6; }
  if (p.pos.x < -1.35) { p.pos.x = -1.35; p.vel.x = abs(p.vel.x) * 0.6; }
  if (p.pos.y > 1.35) { p.pos.y = 1.35; p.vel.y = -abs(p.vel.y) * 0.6; }
  if (p.pos.y < -1.35) { p.pos.y = -1.35; p.vel.y = abs(p.vel.y) * 0.6; }

  particles[i] = p;
}
`;

const FADE_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), xy*0.5+0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var<uniform> fade: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(trail, smp, uv) * fade.x;
}
`;

const PARTICLE_WGSL = /* wgsl */ `
struct Particle { pos: vec2f, vel: vec2f }
struct Params {
  n: u32, time: f32, rms: f32, rate: f32,
  bloom: f32, collapse: f32, upward: f32, split: f32,
  swirl: f32, seed: f32, aspect: f32, _p: f32,
}
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

fn dreamPalette(t: f32) -> vec3f {
  let deep    = vec3f(0.055, 0.035, 0.11);
  let indigo  = vec3f(0.388, 0.400, 0.945);
  let violet  = vec3f(0.545, 0.361, 0.965);
  let magenta = vec3f(0.690, 0.263, 0.878);
  let light   = vec3f(0.85, 0.80, 1.0);
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.33) { return mix(deep, indigo, x / 0.33); }
  if (x < 0.66) { return mix(indigo, violet, (x - 0.33) / 0.33); }
  return mix(violet, mix(magenta, light, (x - 0.66) / 0.34), 1.0);
}

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
  @location(2) glow: f32,
}
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  let p = particles[ii];
  let corners = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let corner = corners[vi];
  let spd = length(p.vel);
  let energy = clamp(spd * 45.0 + params.rms * 0.9, 0.0, 1.0);
  let sz = 0.006 + energy * 0.02 + params.rms * 0.01;
  // aspect-correct x so the radial mudra geometry stays circular on screen
  let ndc = vec2f(p.pos.x / params.aspect, p.pos.y) * 0.62;
  let color = dreamPalette(0.25 + energy * 0.7);
  return VO(vec4f(ndc + corner * sz, 0.0, 1.0), corner, color, 0.35 + energy * 0.65);
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = (1.0 - d * d) * v.glow;
  return vec4f(v.color * a, a);
}
`;

const DISPLAY_WGSL = /* wgsl */ `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), xy*0.5+0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSample(trail, smp, uv).rgb;
  c = c / (1.0 + dot(c, vec3f(0.299,0.587,0.114)));
  return vec4f(pow(max(c, vec3f(0.0)), vec3f(0.5)), 1.0);
}
`;

// ── GPU types & build ──────────────────────────────────────────────────────────

const N_PARTICLES = 24000;
const TRAIL_FADE = 0.9;

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  canvasFmt: GPUTextureFormat;
  trailFmt: GPUTextureFormat;
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

function spawnParticles(): Float32Array {
  const buf = new Float32Array(N_PARTICLES * 4);
  for (let i = 0; i < N_PARTICLES; i++) {
    const r = Math.sqrt(Math.random()) * 0.6;
    const a = Math.random() * Math.PI * 2;
    buf[i * 4 + 0] = Math.cos(a) * r;
    buf[i * 4 + 1] = Math.sin(a) * r;
    buf[i * 4 + 2] = 0;
    buf[i * 4 + 3] = 0;
  }
  return buf;
}

function makeTrailTextures(
  device: GPUDevice,
  fmt: GPUTextureFormat,
  w: number,
  h: number,
): [GPUTexture, GPUTexture] {
  const mk = (): GPUTexture =>
    device.createTexture({
      size: [w, h],
      format: fmt,
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
  return [mk(), mk()];
}

async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuState> {
  if (!navigator.gpu) throw new Error("WebGPU not supported.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter.");
  const device = await adapter.requestDevice();

  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("No WebGPU canvas context.");
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const trailFmt: GPUTextureFormat = "rgba16float";
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const particleBuf = device.createBuffer({
    size: N_PARTICLES * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, spawnParticles().buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const fadeBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    fadeBuf,
    0,
    new Float32Array([TRAIL_FADE, 0, 0, 0]).buffer as ArrayBuffer,
  );

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
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
    canvasFmt,
    trailFmt,
    particleBuf,
    paramsBuf,
    fadeBuf,
    trail: makeTrailTextures(device, trailFmt, canvas.width, canvas.height),
    trailR: 0,
    sampler,
    computePl,
    fadePl,
    particlePl,
    displayPl,
  };
}

function resizeGpuTrails(g: GpuState, w: number, h: number): void {
  g.trail[0].destroy();
  g.trail[1].destroy();
  g.trail = makeTrailTextures(g.device, g.trailFmt, w, h);
  g.trailR = 0;
}

function stepGpu(
  g: GpuState,
  f: FieldForces,
  rms: number,
  time: number,
  seed: number,
  aspect: number,
): void {
  const { device } = g;
  const p = new Float32Array(12);
  const pu = new Uint32Array(p.buffer);
  pu[0] = N_PARTICLES;
  p[1] = time;
  p[2] = rms;
  p[3] = f.rate;
  p[4] = f.bloom;
  p[5] = f.collapse;
  p[6] = f.upward;
  p[7] = f.split;
  p[8] = f.swirl;
  p[9] = seed;
  p[10] = aspect;
  device.queue.writeBuffer(g.paramsBuf, 0, p.buffer as ArrayBuffer);

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

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
    pass.dispatchWorkgroups(Math.ceil(N_PARTICLES / 64));
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
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(g.fadePl);
    pass.setBindGroup(0, fadeBg);
    pass.draw(4);
    pass.setPipeline(g.particlePl);
    pass.setBindGroup(0, partBg);
    pass.draw(4, N_PARTICLES);
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
          loadOp: "clear",
          storeOp: "store",
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

// ── Canvas2D fallback (identical force model, fewer particles) ─────────────────

interface Fallback2D {
  ctx: CanvasRenderingContext2D;
  px: Float32Array; // x,y,vx,vy per particle
  count: number;
}

const FB_COUNT = 2200;

function createFallback(ctx: CanvasRenderingContext2D): Fallback2D {
  const count = FB_COUNT;
  const px = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(Math.random()) * 0.6;
    const a = Math.random() * Math.PI * 2;
    px[i * 4] = Math.cos(a) * r;
    px[i * 4 + 1] = Math.sin(a) * r;
  }
  return { ctx, px, count };
}

function hash2(x: number, y: number): number {
  let qx = (x * 0.3183099 + 0.1) % 1;
  let qy = (y * 0.3183099 + 0.1) % 1;
  qx = (qx * 17) % 1;
  qy = (qy * 17) % 1;
  return (qx * qy * (qx + qy)) % 1;
}

const FB_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#b043e0"];

function stepFallback(
  fb: Fallback2D,
  f: FieldForces,
  rms: number,
  time: number,
  w: number,
  h: number,
): void {
  const { ctx, px, count } = fb;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(5,3,11,0.22)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";

  const aspect = w / h;
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.42;

  for (let i = 0; i < count; i++) {
    let x = px[i * 4];
    let y = px[i * 4 + 1];
    let vx = px[i * 4 + 2];
    let vy = px[i * 4 + 3];

    const rl = Math.hypot(x, y) + 1e-4;
    const dx = x / rl;
    const dy = y / rl;

    let fx = 0;
    let fy = 0;
    const c = hash2(x * 1.4 + time * 0.1, y * 1.4);
    fx += (c - 0.5) * (f.swirl + rms * 0.5) * 0.06;
    fy += (hash2(y * 1.4, x * 1.4 - time * 0.1) - 0.5) * (f.swirl + rms * 0.5) * 0.06;
    fx += dx * f.bloom * (0.5 + rms * 0.8) * 0.02;
    fy += dy * f.bloom * (0.5 + rms * 0.8) * 0.02;
    fx -= dx * f.collapse * 0.025;
    fy -= dy * f.collapse * 0.025;
    fy += f.upward * 0.02;
    const side = x > 0 ? 0.55 : -0.55;
    fx += (side - x) * f.split * 0.018;

    vx = vx * 0.93 + fx;
    vy = vy * 0.93 + fy;
    const spd = Math.hypot(vx, vy);
    const maxSpd = 0.02 * (0.7 + f.rate * 0.6) * (0.6 + rms * 1.4);
    if (spd > maxSpd) {
      vx *= maxSpd / spd;
      vy *= maxSpd / spd;
    }
    x += vx * (0.6 + f.rate * 0.7);
    y += vy * (0.6 + f.rate * 0.7);
    if (x > 1.35) { x = 1.35; vx = -Math.abs(vx) * 0.6; }
    if (x < -1.35) { x = -1.35; vx = Math.abs(vx) * 0.6; }
    if (y > 1.35) { y = 1.35; vy = -Math.abs(vy) * 0.6; }
    if (y < -1.35) { y = -1.35; vy = Math.abs(vy) * 0.6; }

    px[i * 4] = x;
    px[i * 4 + 1] = y;
    px[i * 4 + 2] = vx;
    px[i * 4 + 3] = vy;

    const sx = cx + (x / aspect) * scale;
    const sy = cy + y * scale;
    const energy = Math.min(1, spd * 45 + rms);
    ctx.fillStyle = FB_COLORS[Math.min(FB_COLORS.length - 1, Math.floor(energy * FB_COLORS.length))];
    ctx.globalAlpha = 0.25 + energy * 0.5;
    const r = 1 + energy * 2.2;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
}

// ── Gesture commit (debounce) per hand slot ───────────────────────────────────

const COMMIT_FRAMES = 2;
const SCORE_MIN = 0.6;
const LOST_FRAMES = 12;

interface SlotState {
  candidate: GestureName | null;
  candCount: number;
  committed: GestureName | null;
  lastSeen: number; // frame counter when a hand last appeared in this slot
  height: number; // continuous 0..1 hand height
}

function makeSlot(): SlotState {
  return { candidate: null, candCount: 0, committed: null, lastSeen: -999, height: 0.5 };
}

interface HandFrame {
  slot: 0 | 1;
  name: GestureName | null;
  score: number;
  height: number;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  src: AudioBufferSourceNode;
  octave: AudioBufferSourceNode;
  preGain: GainNode;
  shelf: BiquadFilterNode;
  reverbWet: GainNode;
  shimmer: GainNode;
  chorusWet: GainNode;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  tracker: GestureRecognizerInst | null;
  stream: MediaStream | null;
  slots: [SlotState, SlotState];
  frame: number;
  rms: number;
  seed: number;
  time: number;
  lastMs: number;
  gpu: GpuState | null;
  fb: Fallback2D | null;
  raf: number;
  detectHandle: number;
  detecting: boolean;
  camLive: boolean;
}

function makeImpulse(ac: AudioContext, seconds = 2.4): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5);
    }
  }
  return buf;
}

// ── Status / view types ────────────────────────────────────────────────────────

type Mode = "idle" | "loading" | "running";
type Track = { id: string; title: string };

const PIANO_TRACKS: Track[] = REAL_TRACKS.map((t) => ({ id: t.id, title: t.title }));

export default function MudraPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(PIANO_TRACKS[0].id);
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [using2D, setUsing2D] = useState(false);
  const [camLost, setCamLost] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // display-only mirrors of the two committed mudras (updated ~10Hz)
  const [handLabels, setHandLabels] = useState<[string, string]>(["—", "—"]);

  const { immersive, toggle } = useImmersive();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");
  const labelTickRef = useRef(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── size canvas to its container ────────────────────────────────────────────
  const sizeCanvas = useCallback((): { w: number; h: number } => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return { w: 2, h: 2 };
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(box.clientWidth * dpr));
    const h = Math.max(2, Math.floor(box.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    return { w, h };
  }, []);

  // ── discrete gesture detection + audio control (no async here) ──────────────
  const detectAndControl = useCallback(() => {
    const eng = engineRef.current;
    const video = videoRef.current;
    if (!eng) return;
    eng.frame += 1;

    let sawHand = false;
    if (eng.tracker && video && video.readyState >= 2) {
      let res: ReturnType<GestureRecognizerInst["recognizeForVideo"]> | null = null;
      try {
        res = eng.tracker.recognizeForVideo(video, performance.now());
      } catch {
        res = null;
      }
      if (res && res.gestures && res.gestures.length > 0) {
        const frames: HandFrame[] = [];
        for (let i = 0; i < res.gestures.length; i++) {
          const top = res.gestures[i]?.[0];
          const name = (top?.categoryName ?? "None") as string;
          const score = top?.score ?? 0;
          // assign slot by handedness (Left→0, Right→1) else by index
          const handed =
            res.handednesses?.[i]?.[0]?.categoryName ??
            res.handedness?.[i]?.[0]?.categoryName ??
            (i === 0 ? "Left" : "Right");
          const slot: 0 | 1 = handed === "Right" ? 1 : 0;
          const lm: Landmark[] | undefined = res.landmarks?.[i];
          // hand height: middle-finger MCP (9). higher hand (smaller y) → larger.
          const height = lm ? 1 - lm[9].y : 0.5;
          const gname =
            name !== "None" && MUDRA_BY_NAME[name]
              ? (name as GestureName)
              : null;
          frames.push({ slot, name: gname, score, height });
        }
        // resolve two hands possibly on same slot: keep both by pushing 2nd to other slot
        const used = new Set<number>();
        for (const hf of frames) {
          let s = hf.slot;
          if (used.has(s)) s = (1 - s) as 0 | 1;
          used.add(s);
          sawHand = true;
          const slot = eng.slots[s];
          slot.lastSeen = eng.frame;
          slot.height = slot.height * 0.6 + hf.height * 0.4;
          // debounce commit
          if (hf.name && hf.score >= SCORE_MIN) {
            if (slot.candidate === hf.name) {
              slot.candCount += 1;
            } else {
              slot.candidate = hf.name;
              slot.candCount = 1;
            }
            if (slot.candCount >= COMMIT_FRAMES) slot.committed = hf.name;
          } else {
            // "None"/low score present but no committed gesture change; let it hold
            slot.candidate = null;
            slot.candCount = 0;
          }
        }
      }
    }

    // slots not seen recently → release to rest (null)
    for (const slot of eng.slots) {
      if (eng.frame - slot.lastSeen > LOST_FRAMES) {
        slot.committed = null;
        slot.candidate = null;
        slot.candCount = 0;
      }
    }

    if (sawHand !== eng.camLive) {
      eng.camLive = sawHand;
    }
    // status: lost when camera on but no hand in frame recently
    const recentlySaw =
      eng.frame - Math.max(eng.slots[0].lastSeen, eng.slots[1].lastSeen) <=
      LOST_FRAMES;
    setCamLost((prev) => (prev === !recentlySaw ? prev : !recentlySaw));

    // ── fold committed mudras → audio params (visuals recompute their own) ────
    const params: AudioParams = { ...REST_PARAMS };
    for (const slot of eng.slots) {
      if (slot.committed) {
        const depth = 0.5 + Math.max(0, Math.min(1, slot.height)) * 0.7;
        applyMudra(params, slot.committed, depth);
      }
    }

    // ramp every parameter smoothly (~0.12s) — switching gestures glides
    const now = eng.ac.currentTime;
    const T = 0.12;
    eng.src.playbackRate.setTargetAtTime(params.rate, now, T);
    eng.octave.playbackRate.setTargetAtTime(params.rate * 2, now, T);
    eng.preGain.gain.setTargetAtTime(params.master, now, T);
    eng.shelf.gain.setTargetAtTime(params.brightness, now, T);
    eng.reverbWet.gain.setTargetAtTime(params.reverb, now, T);
    eng.shimmer.gain.setTargetAtTime(params.shimmer, now, T);
    eng.chorusWet.gain.setTargetAtTime(params.chorus, now, T);

    // label mirror ~10Hz
    if (eng.frame - labelTickRef.current > 6) {
      labelTickRef.current = eng.frame;
      const nameOf = (s: SlotState): string =>
        s.committed ? MUDRA_BY_NAME[s.committed].label : "—";
      setHandLabels((prev) => {
        const a = nameOf(eng.slots[0]);
        const b = nameOf(eng.slots[1]);
        return prev[0] === a && prev[1] === b ? prev : [a, b];
      });
    }

    if (eng.detecting) {
      const v = videoRef.current as (HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }) | null;
      if (v && typeof v.requestVideoFrameCallback === "function") {
        eng.detectHandle = v.requestVideoFrameCallback(() => detectAndControl());
      } else {
        eng.detectHandle = requestAnimationFrame(() => detectAndControl());
      }
    }
  }, []);

  // ── render loop (visuals only; reads shared refs) ───────────────────────────
  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;
      eng.time += dt;
      eng.seed += 0.013;

      // RMS from the safe-master analyser
      const bins = eng.freq.length;
      eng.analyser.getByteFrequencyData(eng.freq);
      let sum = 0;
      for (let i = 0; i < bins; i++) sum += eng.freq[i];
      const rmsTarget = sum / bins / 255;
      eng.rms = eng.rms * 0.8 + rmsTarget * 0.2;

      // rebuild forces from committed slots for the visual (audio path owns audio)
      const forces: FieldForces = { ...REST_FORCES };
      for (const slot of eng.slots) {
        if (slot.committed) {
          const depth = 0.5 + Math.max(0, Math.min(1, slot.height)) * 0.7;
          applyMudraField(forces, slot.committed, depth);
        }
      }

      const canvas = canvasRef.current;
      const w = canvas?.width ?? 2;
      const h = canvas?.height ?? 2;
      const aspect = w / h;

      if (eng.gpu) {
        stepGpu(eng.gpu, forces, eng.rms, eng.time, eng.seed, aspect);
      } else if (eng.fb) {
        stepFallback(eng.fb, forces, eng.rms, eng.time, w, h);
      }
      eng.raf = requestAnimationFrame(renderLoop);
    },
    [],
  );

  // ── teardown ────────────────────────────────────────────────────────────────
  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.detecting = false;
    cancelAnimationFrame(eng.raf);
    const video = videoRef.current as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (h: number) => void;
    }) | null;
    if (video?.cancelVideoFrameCallback && eng.detectHandle) {
      try {
        video.cancelVideoFrameCallback(eng.detectHandle);
      } catch {
        /* ignore */
      }
    }
    cancelAnimationFrame(eng.detectHandle);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.tracker) {
      try {
        eng.tracker.close();
      } catch {
        /* ignore */
      }
    }
    try {
      eng.src.stop();
      eng.octave.stop();
    } catch {
      /* already stopped */
    }
    if (eng.gpu) {
      eng.gpu.device.destroy();
    }
    eng.master.disconnect();
    const ac = eng.ac;
    if (ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 300);
    }
    engineRef.current = null;
  }, []);

  // ── start ────────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setMode("loading");
    setLoadError(null);
    setGpuNotice(null);
    setUsing2D(false);

    // audio context + safe master + real track
    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setLoadError("Web Audio is unavailable in this browser.");
      setMode("idle");
      return;
    }

    let buffer: AudioBuffer;
    try {
      const loaded = await loadRealTrackBuffer(ac, trackId);
      buffer = loaded.buffer;
    } catch {
      setLoadError("Could not load the recording — check your connection and retry.");
      void ac.close();
      setMode("idle");
      return;
    }

    const master = createSafeMaster(ac);

    // effect graph — EVERY node terminates in master.input (never ctx.destination)
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const octave = ac.createBufferSource();
    octave.buffer = buffer;
    octave.loop = true;
    octave.playbackRate.value = 2;

    const preGain = ac.createGain();
    preGain.gain.value = REST_PARAMS.master;

    const shelf = ac.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 2600;
    shelf.gain.value = 0;

    const dry = ac.createGain();
    dry.gain.value = 1;

    const convolver = ac.createConvolver();
    convolver.buffer = makeImpulse(ac);
    const reverbWet = ac.createGain();
    reverbWet.gain.value = REST_PARAMS.reverb;

    // widening: two static short delays panned L/R (no oscillators)
    const delayL = ac.createDelay(0.05);
    delayL.delayTime.value = 0.018;
    const delayR = ac.createDelay(0.05);
    delayR.delayTime.value = 0.027;
    const merger = ac.createChannelMerger(2);
    const chorusWet = ac.createGain();
    chorusWet.gain.value = REST_PARAMS.chorus;

    const shimmer = ac.createGain();
    shimmer.gain.value = REST_PARAMS.shimmer;

    const sum = ac.createGain();
    sum.gain.value = 1;

    // wiring
    src.connect(preGain);
    preGain.connect(shelf);
    shelf.connect(dry);
    dry.connect(sum);
    shelf.connect(convolver);
    convolver.connect(reverbWet);
    reverbWet.connect(sum);
    shelf.connect(delayL);
    shelf.connect(delayR);
    delayL.connect(merger, 0, 0);
    delayR.connect(merger, 0, 1);
    merger.connect(chorusWet);
    chorusWet.connect(sum);
    octave.connect(shimmer);
    shimmer.connect(sum);
    sum.connect(master.input); // ← the ONLY path to the speakers

    src.start();
    octave.start();

    // canvas + renderer
    sizeCanvas();
    let gpu: GpuState | null = null;
    let fb: Fallback2D | null = null;
    const canvas = canvasRef.current;
    if (canvas && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        gpu = await buildGpu(canvas);
      } catch {
        gpu = null;
        setGpuNotice("WebGPU init failed — using the Canvas2D fallback field.");
      }
    } else {
      setGpuNotice("WebGPU unavailable here — using the Canvas2D fallback field.");
    }
    if (!gpu && canvas) {
      const g2 = canvas.getContext("2d");
      if (g2) {
        fb = createFallback(g2);
        setUsing2D(true);
      }
    }

    const eng: Engine = {
      ac,
      master,
      src,
      octave,
      preGain,
      shelf,
      reverbWet,
      shimmer,
      chorusWet,
      analyser: master.analyser,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      tracker: null,
      stream: null,
      slots: [makeSlot(), makeSlot()],
      frame: 0,
      rms: 0,
      seed: Math.random() * 100,
      time: 0,
      lastMs: 0,
      gpu,
      fb,
      raf: 0,
      detectHandle: 0,
      detecting: true,
      camLive: false,
    };
    engineRef.current = eng;

    setMode("running");
    eng.raf = requestAnimationFrame(renderLoop);

    // camera + gesture recognizer (async; visuals + audio already live)
    const video = videoRef.current;
    if (video && navigator.mediaDevices) {
      try {
        eng.stream = await startCamera(video);
      } catch {
        setCamLost(true);
      }
      try {
        eng.tracker = await createGestureTracker(2);
      } catch {
        eng.tracker = null;
        setCamLost(true);
      }
    }
    // begin the discrete-gesture control loop
    if (engineRef.current) detectAndControl();
  }, [trackId, sizeCanvas, renderLoop, detectAndControl]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setCamLost(true);
    setHandLabels(["—", "—"]);
  }, [stopEverything]);

  // resize handling — GPU trail textures + 2D canvas follow the viewport
  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const { w, h } = sizeCanvas();
      if (eng.gpu) {
        eng.gpu.ctx.configure({
          device: eng.gpu.device,
          format: eng.gpu.canvasFmt,
          alphaMode: "opaque",
        });
        resizeGpuTrails(eng.gpu, w, h);
      }
    };
    window.addEventListener("resize", onResize);
    // immersive toggling changes the layout box → resize after paint
    const t = window.setTimeout(onResize, 60);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [mode, immersive, sizeCanvas]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";
  const trackTitle = PIANO_TRACKS.find((t) => t.id === trackId)?.title ?? "";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── art layer (always present) ── */}
      <div className="fixed inset-0 z-0 bg-black">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      {/* hidden video feeds MediaPipe only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* ── tracking status line (visible whenever running) ── */}
      {running && (
        <div className="fixed left-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em]">
          {camLost ? (
            <span className="text-destructive">
              sensor lost · show your hands to the camera
            </span>
          ) : (
            <span className="text-primary">
              tracking · live
              <span className="ml-2 text-muted-foreground">
                L:{handLabels[0]} · R:{handLabels[1]}
              </span>
            </span>
          )}
        </div>
      )}

      {/* ── chrome (hidden in immersive) ── */}
      {!immersive && (
        <>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>

          <div className="relative z-20 mx-auto max-w-3xl px-5 py-8 sm:px-8">
            <Link
              href="/dream"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
            >
              ← back to the dream lab
            </Link>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Mudra
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground">
              A vocabulary of discrete hand mudras conducts one of Karel&apos;s
              own piano takes — one gesture, one event. Each recognized shape
              holds a distinct transformation of the real recording; two hands
              hold two mudras at once.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!running ? (
                <button
                  type="button"
                  onClick={() => void handleStart()}
                  disabled={loading}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Start"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>

            {/* track selector */}
            {!running && (
              <div className="mt-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  take
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COLLECTIONS.map((c) => (
                    <div key={c.name} className="flex flex-wrap gap-2">
                      {c.tracks.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTrackId(t.id)}
                          className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                            trackId === t.id
                              ? "border-primary bg-primary/15 text-foreground"
                              : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {t.title}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loadError && (
              <p className="mt-4 text-base leading-relaxed text-destructive">
                {loadError}
              </p>
            )}
            {gpuNotice && (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {gpuNotice}
              </p>
            )}
            {running && using2D && (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                webgpu absent · canvas 2d fallback
              </p>
            )}

            {/* mudra legend */}
            <div className="mt-8">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                the mudra alphabet
              </p>
              <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {MUDRAS.map((m) => (
                  <li key={m.name} className="flex items-baseline gap-3 text-sm">
                    <span aria-hidden className="text-lg leading-none">
                      {m.glyph}
                    </span>
                    <span className="text-foreground">{m.label}</span>
                    <span className="text-muted-foreground">— {m.effect}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-8 text-sm text-muted-foreground">
              input: MediaPipe GestureRecognizer (discrete canned gestures, 2
              hands) · output: WebGPU compute-particle field (Canvas2D fallback)
              · audio: {trackTitle} — Karel&apos;s recording, transformed live
            </p>
          </div>
        </>
      )}

      {/* exit pill lives in ImmersiveToggle while immersive */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {/* ── design notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Mudra</span> treats the hand
                as a <span className="text-foreground">discrete event source</span>,
                not a continuous controller. MediaPipe&apos;s GestureRecognizer
                reports one canned gesture per hand; each committed gesture
                triggers a distinct, held transformation of one of Karel&apos;s
                real piano takes — a musical sign-language for reshaping his
                recording.
              </p>
              <p>
                The vocabulary: <span className="text-foreground">open palm</span>{" "}
                blooms reverb space, <span className="text-foreground">fist</span>{" "}
                chokes to near-silence, <span className="text-foreground">point-up</span>{" "}
                lifts the register, <span className="text-foreground">thumb-up/down</span>{" "}
                quickens or deepens the tempo, <span className="text-foreground">victory</span>{" "}
                adds an octave-double shimmer, and{" "}
                <span className="text-foreground">I-love-you</span> warms it with
                chorus/widening. Every parameter is ramped with{" "}
                <code>setTargetAtTime(…, 0.12)</code> so switching mudras glides
                rather than clicks. A gesture must clear score ≥ 0.6 for a couple
                of frames to commit (debounce), so recognition never flickers.
              </p>
              <p>
                Two hands can hold two mudras at once — left = tempo, right =
                register — that is the richness. Hand{" "}
                <span className="text-foreground">height</span> is a continuous
                modifier scaling the depth of the active transform.
              </p>
              <p>
                Visuals are a WebGPU compute-particle field embodying the active
                mudra(s): open-palm blooms radially, fist collapses to a dense
                knot, point-up streams upward, victory splits into two braids.
                Particle energy and colour (a violet ramp) are modulated by the
                music&apos;s RMS off the safe-master analyser. A Canvas2D
                fallback runs the identical force model where WebGPU is absent.
              </p>
              <p>
                References: the NIME &ldquo;one gesture / one event&rdquo;
                controller paradigm; Gesture2Music (arXiv 2511.00793), which this
                piece <em>inverts</em> — it does continuous gesture→generation,
                Mudra does discrete recognized-gesture events transforming a real
                recording; and the mudra / conducting-gesture lineage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
