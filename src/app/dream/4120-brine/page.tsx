"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4120 · Brine
//
//   ONE QUESTION
//   What if you could sing a body of water into motion — your voice churning a
//   real, GPU-simulated fluid whose viscosity, gravity, and turbulence are set
//   by the pitch and loudness of what you sing?
//
//   A WebGPU compute-shader SPH (Smoothed-Particle Hydrodynamics) 2D fluid of
//   ~8k particles, simulated ENTIRELY on the GPU (density/pressure → force →
//   integrate, three compute passes per substep). The mic drives the brine:
//     • loudness (RMS)      → an upward "breath" force at the bottom-center,
//                             so louder = more violent churn (+ lifts gravity).
//     • brightness (centroid) → viscosity: bright/high = thin & splashy,
//                             dark/low = thick & gloopy.
//     • pitch (dominant Hz) → the direction of a swirling vortex, so a rising
//                             glissando visibly REVERSES the swirl.
//   The fluid sings back: its aggregate kinetic energy swells a soft low drone
//   and opens a lowpass — the churn you cause becomes an audible wash.
//
//   Fallbacks are load-bearing: no WebGPU → a CPU SPH (~1,200 particles) on
//   Canvas2D; no mic → a seeded synthetic envelope self-demos hands-free.
//   Reference: Müller, Charypar & Gross, "Particle-Based Fluid Simulation for
//   Interactive Applications" (SPH, 2003). See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Deterministic PRNG (no Math.random / Date anywhere) ──────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ── SPH constants (Müller 2003 kernels, pixel-scale) ─────────────────────────
// Physics is made robust by construction: the rest density is measured from the
// initial lattice (so the fluid starts at equilibrium and can't collapse), the
// pressure/viscosity forces are the standard SPH kernels, and the external
// forcing (gravity/breath/swirl) is applied as a direct body acceleration —
// decoupled from mass — then both acceleration and velocity are clamped so the
// solver stays bounded whatever the audio throws at it.

const H = 16;
const HSQ = H * H;
const SPACING = H * 0.6; // lattice spacing → ~12 neighbours inside the radius
const MASS = 2.5;
const POLY6 = 4 / (Math.PI * Math.pow(H, 8));
const SPIKY = -10 / (Math.PI * Math.pow(H, 5));
const VLAP = 40 / (Math.PI * Math.pow(H, 5));
const GAS = 15000; // pressure stiffness
const BOUND_DAMP = -0.4;
const EPS = H;
const DT = 0.0008;
const SUBSTEPS = 3;
const VMAX = 1000; // velocity clamp (also colour normaliser)
const AMAX = 5000; // acceleration clamp — keeps the solver bounded
const GRAV_BASE = -350; // gravity as a direct acceleration

// Rest density sampled from an infinite lattice at SPACING (equilibrium ρ₀).
function estimateRestDensity(): number {
  let rho = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const r2 = (dx * SPACING) * (dx * SPACING) + (dy * SPACING) * (dy * SPACING);
      if (r2 < HSQ) {
        const d = HSQ - r2;
        rho += MASS * POLY6 * d * d * d;
      }
    }
  }
  return rho;
}
const REST_DENS = estimateRestDensity();

// Audio-driven ranges (accelerations / kernel constants)
const VISC_THICK = 0.35; // dark / low sounds → gloopy
const VISC_THIN = 0.03; // bright / high sounds → splashy
const BREATH_MAX = 1200; // upward breath acceleration
const SWIRL_MAX = 900; // vortex acceleration

const N_GPU = 8192;
const N_CPU = 1200;

// ── Dynamic (per-frame) parameters derived from audio ────────────────────────

interface DynParams {
  visc: number; // viscosity kernel constant
  breath: number; // upward breath acceleration
  swirl: number; // signed vortex acceleration (- = clockwise / low pitch)
  gravY: number; // gravity acceleration (loudness lifts it)
  aspect: number; // canvas aspect for square fit
}

interface Backend {
  kind: "webgpu" | "cpu";
  count: number;
  step: (d: DynParams) => void;
  ke: () => number; // raw aggregate kinetic energy (backend-relative)
  destroy: () => void;
}

// ── Initial dam-block layout (shared by both backends) ───────────────────────

function buildBlock(n: number, boxW: number, boxH: number, prng: () => number) {
  const pos = new Float32Array(n * 2);
  const s = SPACING;
  const cols = Math.floor(Math.sqrt(n * (boxW / boxH)));
  const blockW = cols * s;
  const originX = (boxW - blockW) * 0.5;
  const originY = EPS + s;
  for (let i = 0; i < n; i++) {
    const cx = i % cols;
    const cy = Math.floor(i / cols);
    pos[i * 2] = originX + cx * s + (prng() - 0.5) * s * 0.35;
    pos[i * 2 + 1] = originY + cy * s + (prng() - 0.5) * s * 0.35;
  }
  return pos;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────
// Params are packed as array<vec4f,8> to sidestep uniform alignment rules.
//   P0 (N, DT, H, HSQ)          P1 (MASS, POLY6, SPIKY, VLAP)
//   P2 (RESTD, GAS, VISC, AMAX) P3 (GX, GY, EPS, KESCALE)
//   P4 (BOXW, BOXH, BREATH, SWIRL)  P5 (CX, CY, BREATHR, SWIRLR)
//   P6 (RRAD, ASPECT, VMAX, TIME)

const PARAMS_DECL = `@group(0) @binding(0) var<uniform> P: array<vec4f, 8>;`;

const DENSITY_WGSL = `
${PARAMS_DECL}
@group(0) @binding(1) var<storage, read> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dens: array<f32>;
@group(0) @binding(3) var<storage, read_write> pres: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let N = u32(P[0].x);
  if (i >= N) { return; }
  let HSQ_ = P[0].w;
  let MASS_ = P[1].x;
  let POLY6_ = P[1].y;
  let RESTD = P[2].x;
  let GAS_ = P[2].y;
  let pi = pos[i];
  var rho = 0.0;
  for (var j: u32 = 0u; j < N; j = j + 1u) {
    let rij = pi - pos[j];
    let r2 = dot(rij, rij);
    if (r2 < HSQ_) {
      let d = HSQ_ - r2;
      rho = rho + MASS_ * POLY6_ * d * d * d;
    }
  }
  dens[i] = rho;
  pres[i] = GAS_ * (rho - RESTD);
}`;

const FORCE_WGSL = `
${PARAMS_DECL}
@group(0) @binding(1) var<storage, read> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read> vel: array<vec2f>;
@group(0) @binding(3) var<storage, read> dens: array<f32>;
@group(0) @binding(4) var<storage, read> pres: array<f32>;
@group(0) @binding(5) var<storage, read_write> force: array<vec2f>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let N = u32(P[0].x);
  if (i >= N) { return; }
  let H_ = P[0].z;
  let MASS_ = P[1].x;
  let SPIKY_ = P[1].z;
  let VLAP_ = P[1].w;
  let VISC_ = P[2].z;

  let pi = pos[i];
  let vi = vel[i];
  var fpress = vec2f(0.0, 0.0);
  var fvisc = vec2f(0.0, 0.0);
  for (var j: u32 = 0u; j < N; j = j + 1u) {
    if (j == i) { continue; }
    let rij = pi - pos[j];
    let r = length(rij);
    if (r < H_ && r > 1e-4) {
      let dir = rij / r;
      let hr = H_ - r;
      fpress = fpress - dir * MASS_ * (pres[i] + pres[j]) / (2.0 * dens[j]) * SPIKY_ * hr * hr * hr;
      fvisc = fvisc + VISC_ * MASS_ * (vel[j] - vi) / dens[j] * VLAP_ * hr;
    }
  }
  // Only the internal SPH forces here; gravity/breath/swirl are body
  // accelerations applied in the integrate pass (decoupled from mass).
  force[i] = fpress + fvisc;
}`;

const INTEGRATE_WGSL = `
${PARAMS_DECL}
@group(0) @binding(1) var<storage, read_write> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec2f>;
@group(0) @binding(3) var<storage, read> force: array<vec2f>;
@group(0) @binding(4) var<storage, read> dens: array<f32>;
@group(0) @binding(5) var<storage, read_write> ke: atomic<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let N = u32(P[0].x);
  if (i >= N) { return; }
  let DT_ = P[0].y;
  let AMAX = P[2].w;
  let GX = P[3].x; let GY = P[3].y;
  let EPS_ = P[3].z;
  let KESCALE = P[3].w;
  let BOXW = P[4].x; let BOXH = P[4].y;
  let BREATH = P[4].z; let SWIRL = P[4].w;
  let CX = P[5].x; let CY = P[5].y;
  let BREATHR = P[5].z; let SWIRLR = P[5].w;
  let VMAX_ = P[6].z;

  let pos_i = pos[i];
  // SPH internal acceleration + external body accelerations.
  var a = force[i] / dens[i];
  a = a + vec2f(GX, GY);
  let db = length(pos_i - vec2f(CX, 0.0));
  if (db < BREATHR) {
    a = a + vec2f(0.0, BREATH) * (1.0 - db / BREATHR);
  }
  let toC = pos_i - vec2f(CX, CY);
  let dc = length(toC);
  if (dc > 1e-3 && dc < SWIRLR) {
    a = a + vec2f(-toC.y, toC.x) / dc * SWIRL * (1.0 - dc / SWIRLR);
  }
  let alen = length(a);
  if (alen > AMAX) { a = a / alen * AMAX; }

  var v = vel[i] + DT_ * a;
  let sp = length(v);
  if (sp > VMAX_) { v = v / sp * VMAX_; }
  var p = pos_i + DT_ * v;

  let BDMP = ${BOUND_DAMP.toFixed(3)};
  if (p.x < EPS_) { v.x = v.x * BDMP; p.x = EPS_; }
  if (p.x > BOXW - EPS_) { v.x = v.x * BDMP; p.x = BOXW - EPS_; }
  if (p.y < EPS_) { v.y = v.y * BDMP; p.y = EPS_; }
  if (p.y > BOXH - EPS_) { v.y = v.y * BDMP; p.y = BOXH - EPS_; }

  vel[i] = v;
  pos[i] = p;

  let k = clamp(dot(v, v) * KESCALE, 0.0, 60000.0);
  atomicAdd(&ke, u32(k));
}`;

const RENDER_WGSL = `
${PARAMS_DECL}
@group(0) @binding(1) var<storage, read> pos: array<vec2f>;
@group(0) @binding(2) var<storage, read> vel: array<vec2f>;
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) speed: f32,
};
@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corners = array<vec2f, 4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let BOXW = P[4].x; let BOXH = P[4].y;
  let RRAD = P[6].x; let ASPECT = P[6].y;
  let p = pos[ii];
  let speed = length(vel[ii]);
  let sx = 2.0 / BOXW;
  let sy = 2.0 / BOXH;
  var fx = 1.0; var fy = 1.0;
  if (ASPECT > 1.0) { fx = 1.0 / ASPECT; } else { fy = ASPECT; }
  let c = corners[vi];
  let nx = (p.x * sx - 1.0 + c.x * RRAD * sx) * fx;
  let ny = (p.y * sy - 1.0 + c.y * RRAD * sy) * fy;
  var o: VOut;
  o.clip = vec4f(nx, ny, 0.0, 1.0);
  o.uv = c;
  o.speed = speed;
  return o;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let VMAX_ = P[6].z;
  let d = length(in.uv);
  let fall = clamp(1.0 - d, 0.0, 1.0);
  let a = fall * fall * fall;
  let spb = pow(clamp(in.speed / VMAX_, 0.0, 1.0), 0.5);
  let slow = vec3f(0.10, 0.03, 0.32);
  let fast = vec3f(0.72, 0.55, 1.0);
  let col = mix(slow, fast, spb);
  let inten = a * (0.30 + 0.70 * spb);
  return vec4f(col * inten, inten);
}`;

// ── Params packer (shared) ───────────────────────────────────────────────────

function packParams(
  out: Float32Array,
  n: number,
  boxW: number,
  boxH: number,
  d: DynParams,
  rrad: number,
  time: number,
) {
  out[0] = n; out[1] = DT; out[2] = H; out[3] = HSQ;
  out[4] = MASS; out[5] = POLY6; out[6] = SPIKY; out[7] = VLAP;
  out[8] = REST_DENS; out[9] = GAS; out[10] = d.visc; out[11] = AMAX;
  out[12] = 0; out[13] = d.gravY; out[14] = EPS; out[15] = 0.02;
  out[16] = boxW; out[17] = boxH; out[18] = d.breath; out[19] = d.swirl;
  out[20] = boxW * 0.5; out[21] = boxH * 0.5; out[22] = boxH * 0.42; out[23] = boxH * 0.55;
  out[24] = rrad; out[25] = d.aspect; out[26] = VMAX; out[27] = time;
  out[28] = 0; out[29] = 0; out[30] = 0; out[31] = 0;
}

// ── WebGPU backend ───────────────────────────────────────────────────────────

async function buildGpuBackend(canvas: HTMLCanvasElement, prng: () => number): Promise<Backend> {
  if (!navigator.gpu) throw new Error("navigator.gpu missing");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();

  device.pushErrorScope("validation");

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no webgpu context");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const N = N_GPU;
  const BOXW = 1100;
  const BOXH = 1100;

  const posData = buildBlock(N, BOXW, BOXH, prng);

  const posBuf = device.createBuffer({
    size: N * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(posBuf, 0, posData.buffer as ArrayBuffer);
  const velBuf = device.createBuffer({
    size: N * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(velBuf, 0, new Float32Array(N * 2).buffer as ArrayBuffer);
  const densBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE });
  const presBuf = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.STORAGE });
  const forceBuf = device.createBuffer({ size: N * 8, usage: GPUBufferUsage.STORAGE });

  const keBuf = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const staging = [0, 1].map(() =>
    device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
  );
  const stagingBusy = [false, false];

  const paramsBuf = device.createBuffer({
    size: 128,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const densPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: DENSITY_WGSL }), entryPoint: "main" },
  });
  const forcePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: FORCE_WGSL }), entryPoint: "main" },
  });
  const intPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: INTEGRATE_WGSL }), entryPoint: "main" },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
      entryPoint: "fs",
      targets: [
        {
          format: fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-strip" },
  });

  const scopeErr = await device.popErrorScope();
  if (scopeErr) {
    device.destroy();
    throw new Error("WGSL validation: " + scopeErr.message);
  }

  const bgDens = device.createBindGroup({
    layout: densPl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: densBuf } },
      { binding: 3, resource: { buffer: presBuf } },
    ],
  });
  const bgForce = device.createBindGroup({
    layout: forcePl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: velBuf } },
      { binding: 3, resource: { buffer: densBuf } },
      { binding: 4, resource: { buffer: presBuf } },
      { binding: 5, resource: { buffer: forceBuf } },
    ],
  });
  const bgInt = device.createBindGroup({
    layout: intPl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: velBuf } },
      { binding: 3, resource: { buffer: forceBuf } },
      { binding: 4, resource: { buffer: densBuf } },
      { binding: 5, resource: { buffer: keBuf } },
    ],
  });
  const bgRender = device.createBindGroup({
    layout: renderPl.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: posBuf } },
      { binding: 2, resource: { buffer: velBuf } },
    ],
  });

  const paramArr = new Float32Array(32);
  const zero = new Uint32Array([0]);
  const groups = Math.ceil(N / 64);
  let time = 0;
  let keVal = 0;
  let destroyed = false;

  const step = (d: DynParams) => {
    if (destroyed) return;
    time += 1;
    const rrad = 9.0;
    packParams(paramArr, N, BOXW, BOXH, d, rrad, time);
    device.queue.writeBuffer(paramsBuf, 0, paramArr.buffer as ArrayBuffer);
    device.queue.writeBuffer(keBuf, 0, zero.buffer as ArrayBuffer);

    const enc = device.createCommandEncoder();
    for (let s = 0; s < SUBSTEPS; s++) {
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(densPl);
        pass.setBindGroup(0, bgDens);
        pass.dispatchWorkgroups(groups);
        pass.end();
      }
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(forcePl);
        pass.setBindGroup(0, bgForce);
        pass.dispatchWorkgroups(groups);
        pass.end();
      }
      {
        const pass = enc.beginComputePass();
        pass.setPipeline(intPl);
        pass.setBindGroup(0, bgInt);
        pass.dispatchWorkgroups(groups);
        pass.end();
      }
    }

    {
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.02, g: 0.012, b: 0.05, a: 1 },
          },
        ],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bgRender);
      pass.draw(4, N);
      pass.end();
    }

    let slot = -1;
    if (time % 2 === 0) {
      slot = !stagingBusy[0] ? 0 : !stagingBusy[1] ? 1 : -1;
      if (slot >= 0) enc.copyBufferToBuffer(keBuf, 0, staging[slot], 0, 4);
    }

    device.queue.submit([enc.finish()]);

    if (slot >= 0) {
      stagingBusy[slot] = true;
      const buf = staging[slot];
      buf
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (destroyed) {
            stagingBusy[slot] = false;
            return;
          }
          const raw = new Uint32Array(buf.getMappedRange().slice(0))[0];
          buf.unmap();
          keVal = raw / (N * SUBSTEPS * 0.02);
          stagingBusy[slot] = false;
        })
        .catch(() => {
          stagingBusy[slot] = false;
        });
    }
  };

  const destroy = () => {
    destroyed = true;
    [posBuf, velBuf, densBuf, presBuf, forceBuf, keBuf, paramsBuf].forEach((b) => {
      try {
        b.destroy();
      } catch {
        /* already gone */
      }
    });
    staging.forEach((b) => {
      try {
        b.destroy();
      } catch {
        /* mapped */
      }
    });
    try {
      device.destroy();
    } catch {
      /* already destroyed */
    }
  };

  return { kind: "webgpu", count: N, step, ke: () => keVal, destroy };
}

// ── CPU backend (Canvas2D, O(N²) SPH at N_CPU) ───────────────────────────────

function buildCpuBackend(canvas: HTMLCanvasElement, prng: () => number): Backend {
  const N = N_CPU;
  const BOXW = 560;
  const BOXH = 560;
  const posData = buildBlock(N, BOXW, BOXH, prng);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const dens = new Float32Array(N);
  const pres = new Float32Array(N);
  const fx = new Float32Array(N);
  const fy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = posData[i * 2];
    py[i] = posData[i * 2 + 1];
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  // Pre-render violet blob sprites (indigo → violet-white) for additive draw.
  const BUCKETS = 8;
  const sprites: HTMLCanvasElement[] = [];
  for (let b = 0; b < BUCKETS; b++) {
    const t = b / (BUCKETS - 1);
    const r = Math.round(mix(0.10, 0.72, t) * 255);
    const g = Math.round(mix(0.03, 0.55, t) * 255);
    const bl = Math.round(mix(0.32, 1.0, t) * 255);
    const sp = document.createElement("canvas");
    const SS = 32;
    sp.width = SS;
    sp.height = SS;
    const sc = sp.getContext("2d")!;
    const grad = sc.createRadialGradient(SS / 2, SS / 2, 0, SS / 2, SS / 2, SS / 2);
    grad.addColorStop(0, `rgba(${r},${g},${bl},0.9)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${bl},0.35)`);
    grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
    sc.fillStyle = grad;
    sc.fillRect(0, 0, SS, SS);
    sprites.push(sp);
  }

  let keVal = 0;
  let destroyed = false;

  const step = (d: DynParams) => {
    if (destroyed) return;
    const CX = BOXW * 0.5;
    const CY = BOXH * 0.5;
    const BREATHR = BOXH * 0.42;
    const SWIRLR = BOXH * 0.55;

    for (let s = 0; s < SUBSTEPS; s++) {
      // density + pressure
      for (let i = 0; i < N; i++) {
        let rho = 0;
        const pix = px[i];
        const piy = py[i];
        for (let j = 0; j < N; j++) {
          const dx = pix - px[j];
          const dy = piy - py[j];
          const r2 = dx * dx + dy * dy;
          if (r2 < HSQ) {
            const dd = HSQ - r2;
            rho += MASS * POLY6 * dd * dd * dd;
          }
        }
        dens[i] = rho;
        pres[i] = GAS * (rho - REST_DENS);
      }
      // forces
      for (let i = 0; i < N; i++) {
        let fpx = 0;
        let fpy = 0;
        let fvx = 0;
        let fvy = 0;
        const pix = px[i];
        const piy = py[i];
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = pix - px[j];
          const dy = piy - py[j];
          const r2 = dx * dx + dy * dy;
          if (r2 < HSQ && r2 > 1e-8) {
            const r = Math.sqrt(r2);
            const hr = H - r;
            const pf = (MASS * (pres[i] + pres[j])) / (2 * dens[j]) * SPIKY * hr * hr * hr;
            fpx -= (dx / r) * pf;
            fpy -= (dy / r) * pf;
            const vf = (d.visc * MASS * VLAP * hr) / dens[j];
            fvx += (vx[j] - vx[i]) * vf;
            fvy += (vy[j] - vy[i]) * vf;
          }
        }
        fx[i] = fpx + fvx;
        fy[i] = fpy + fvy;
      }
      // integrate — SPH accel + external body accel, both clamped
      let ke = 0;
      for (let i = 0; i < N; i++) {
        let ax = fx[i] / dens[i];
        let ay = fy[i] / dens[i] + d.gravY;
        const pix = px[i];
        const piy = py[i];
        const bdx = pix - CX;
        const db = Math.sqrt(bdx * bdx + piy * piy);
        if (db < BREATHR) ay += d.breath * (1 - db / BREATHR);
        const tx = pix - CX;
        const ty = piy - CY;
        const dc = Math.sqrt(tx * tx + ty * ty);
        if (dc > 1e-3 && dc < SWIRLR) {
          const f = (d.swirl * (1 - dc / SWIRLR)) / dc;
          ax += -ty * f;
          ay += tx * f;
        }
        const al2 = ax * ax + ay * ay;
        if (al2 > AMAX * AMAX) {
          const inv = AMAX / Math.sqrt(al2);
          ax *= inv;
          ay *= inv;
        }
        let nvx = vx[i] + DT * ax;
        let nvy = vy[i] + DT * ay;
        const sp2 = nvx * nvx + nvy * nvy;
        if (sp2 > VMAX * VMAX) {
          const inv = VMAX / Math.sqrt(sp2);
          nvx *= inv;
          nvy *= inv;
        }
        let nx = px[i] + DT * nvx;
        let ny = py[i] + DT * nvy;
        if (nx < EPS) {
          nvx *= BOUND_DAMP;
          nx = EPS;
        }
        if (nx > BOXW - EPS) {
          nvx *= BOUND_DAMP;
          nx = BOXW - EPS;
        }
        if (ny < EPS) {
          nvy *= BOUND_DAMP;
          ny = EPS;
        }
        if (ny > BOXH - EPS) {
          nvy *= BOUND_DAMP;
          ny = BOXH - EPS;
        }
        vx[i] = nvx;
        vy[i] = nvy;
        px[i] = nx;
        py[i] = ny;
        ke += nvx * nvx + nvy * nvy;
      }
      keVal = ke / N;
    }

    // render
    const cw = canvas.width;
    const ch = canvas.height;
    ctx.fillStyle = "#05030d";
    ctx.fillRect(0, 0, cw, ch);
    const S = Math.min(cw, ch);
    const offX = (cw - S) / 2;
    const offY = (ch - S) / 2;
    const rad = (9 / BOXW) * S * 2.4;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < N; i++) {
      const sx = offX + (px[i] / BOXW) * S;
      const sy = offY + (1 - py[i] / BOXH) * S;
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      let b = Math.floor(clamp01(Math.sqrt(sp / VMAX)) * (BUCKETS - 1));
      if (b < 0) b = 0;
      if (b > BUCKETS - 1) b = BUCKETS - 1;
      ctx.drawImage(sprites[b], sx - rad, sy - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const destroy = () => {
    destroyed = true;
  };

  return { kind: "cpu", count: N, step, ke: () => keVal, destroy };
}

// ── Audio feature extraction ─────────────────────────────────────────────────

interface Features {
  rms: number; // normalised loudness 0..1
  centroid: number; // spectral centroid (Hz)
  pitch: number; // dominant frequency (Hz)
}

function readAudioFeatures(
  analyser: AnalyserNode,
  freq: Uint8Array<ArrayBuffer>,
  time: Float32Array<ArrayBuffer>,
  sampleRate: number,
): Features {
  analyser.getFloatTimeDomainData(time);
  analyser.getByteFrequencyData(freq);

  let sumSq = 0;
  for (let i = 0; i < time.length; i++) sumSq += time[i] * time[i];
  const rms = clamp01(Math.sqrt(sumSq / time.length) * 4.0);

  const binHz = sampleRate / (analyser.fftSize);
  let num = 0;
  let den = 0;
  let peak = 0;
  let peakBin = 1;
  const lo = Math.max(1, Math.floor(50 / binHz));
  const hi = Math.min(freq.length - 1, Math.floor(4000 / binHz));
  for (let i = lo; i <= hi; i++) {
    const m = freq[i];
    num += i * m;
    den += m;
    if (m > peak) {
      peak = m;
      peakBin = i;
    }
  }
  const centroid = den > 0 ? (num / den) * binHz : 200;
  // parabolic interpolation around the peak for a smoother pitch estimate
  let interp = peakBin;
  if (peakBin > 1 && peakBin < freq.length - 1) {
    const a = freq[peakBin - 1];
    const b = freq[peakBin];
    const c = freq[peakBin + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-3) interp = peakBin + (0.5 * (a - c)) / denom;
  }
  const pitch = peak > 8 ? interp * binHz : 0;
  return { rms, centroid, pitch };
}

function syntheticFeatures(frame: number, prng: () => number): Features {
  const t = frame * 0.016;
  // slow glissando that reverses the swirl about the 220 Hz pivot
  const gliss = 0.5 + 0.5 * Math.sin(t * 0.35);
  const pitch = 90 * Math.pow(2, gliss * 2.3);
  const rms = clamp01(0.3 + 0.22 * Math.sin(t * 0.9) + (prng() - 0.5) * 0.05);
  const centroid = 420 + 2100 * (0.5 + 0.5 * Math.sin(t * 0.55 + 1.7));
  return { rms, centroid, pitch };
}

// ── Map features → dynamic sim params ────────────────────────────────────────

function mapFeatures(f: Features): { d: DynParams; brightness: number; swirlDir: number } {
  const brightness = clamp01((f.centroid - 200) / 3000);
  const visc = mix(VISC_THICK, VISC_THIN, brightness);
  const breath = f.rms * BREATH_MAX;
  // pitch → signed swirl about 220 Hz pivot (low = clockwise, high = CCW)
  const s = f.pitch > 0 ? clamp(Math.log2(f.pitch / 220) / 2, -1, 1) : 0;
  const swirl = s * SWIRL_MAX * (0.4 + 0.6 * f.rms);
  const gravY = GRAV_BASE * (1 - 0.5 * f.rms);
  return { d: { visc, breath, swirl, gravY, aspect: 1 }, brightness, swirlDir: s };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Hud {
  rms: number;
  brightness: number;
  visc: number;
  pitch: number;
  swirlDir: number;
  ke: number;
}

export default function BrinePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [backendKind, setBackendKind] = useState<"init" | "webgpu" | "cpu">("init");
  const [started, setStarted] = useState(false);
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Hud>({ rms: 0, brightness: 0, visc: VISC_THICK, pitch: 0, swirlDir: 0, ke: 0 });

  // Long-lived mutable state (refs so the RAF loop never restarts).
  const backendRef = useRef<Backend | null>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);
  const prngRef = useRef(mulberry32(0x4120));
  const featureModeRef = useRef<"synthetic" | "mic">("synthetic");
  const keMaxRef = useRef(1e-3);
  const hudThrottleRef = useRef(0);

  // Audio graph refs.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timeRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const droneFilterRef = useRef<BiquadFilterNode | null>(null);

  // ── Init backend + start the render loop on mount ─────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.offsetHeight * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const startLoop = () => {
      const tick = () => {
        const backend = backendRef.current;
        if (!backend) return;
        frameRef.current += 1;

        // Derive audio features (mic or seeded synthetic).
        let feats: Features;
        const analyser = analyserRef.current;
        if (
          featureModeRef.current === "mic" &&
          analyser &&
          freqRef.current &&
          timeRef.current &&
          audioCtxRef.current
        ) {
          feats = readAudioFeatures(
            analyser,
            freqRef.current,
            timeRef.current,
            audioCtxRef.current.sampleRate,
          );
          // If the mic is dead silent, keep the piece breathing.
          if (feats.rms < 0.015 && feats.pitch === 0) {
            const syn = syntheticFeatures(frameRef.current, prngRef.current);
            feats = { rms: syn.rms * 0.5, centroid: syn.centroid, pitch: syn.pitch };
          }
        } else {
          feats = syntheticFeatures(frameRef.current, prngRef.current);
        }

        const { d, brightness, swirlDir } = mapFeatures(feats);
        d.aspect = canvas.width / canvas.height;
        backend.step(d);

        // Fluid sings back: normalise aggregate KE, swell the drone.
        const rawKe = backend.ke();
        keMaxRef.current = Math.max(keMaxRef.current * 0.995, rawKe, 1e-3);
        const keNorm = clamp01(rawKe / keMaxRef.current);
        const gain = droneGainRef.current;
        const filter = droneFilterRef.current;
        const actx = audioCtxRef.current;
        if (gain && filter && actx) {
          const now = actx.currentTime;
          gain.gain.setTargetAtTime(keNorm * 0.22, now, 0.15);
          filter.frequency.setTargetAtTime(120 + keNorm * 900, now, 0.2);
        }

        // Throttle HUD updates (~8 fps) to keep React light.
        hudThrottleRef.current += 1;
        if (hudThrottleRef.current >= 8) {
          hudThrottleRef.current = 0;
          setHud({
            rms: feats.rms,
            brightness,
            visc: d.visc,
            pitch: feats.pitch,
            swirlDir,
            ke: keNorm,
          });
        }

        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    buildGpuBackend(canvas, prngRef.current)
      .then((b) => {
        if (cancelled) {
          b.destroy();
          return;
        }
        backendRef.current = b;
        setBackendKind("webgpu");
        startLoop();
      })
      .catch((e) => {
        if (cancelled) return;
        setGpuNotice(
          `WebGPU unavailable — running the CPU fallback fluid (${
            e instanceof Error ? e.message : "no device"
          }).`,
        );
        try {
          const b = buildCpuBackend(canvas, prngRef.current);
          backendRef.current = b;
          setBackendKind("cpu");
          startLoop();
        } catch {
          setGpuNotice("Neither WebGPU nor Canvas2D is available in this browser.");
        }
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      backendRef.current?.destroy();
      backendRef.current = null;
    };
  }, []);

  // ── Start audio (must run inside the user gesture) ────────────────────────
  const startAudio = useCallback(async () => {
    if (started) return;
    setStarted(true);
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const actx = new Ctx();
      await actx.resume();
      audioCtxRef.current = actx;

      // Sing-back drone: two low sines → lowpass → gain → out.
      const osc1 = actx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 46;
      const osc2 = actx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 69;
      const filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 120;
      filter.Q.value = 5;
      const gain = actx.createGain();
      gain.gain.value = 0;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(filter);
      filter.connect(actx.destination);
      osc1.start();
      osc2.start();
      droneGainRef.current = gain;
      droneFilterRef.current = filter;

      // Mic (optional).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        streamRef.current = stream;
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser); // analyser is a sink; NOT wired to destination (no feedback)
        analyserRef.current = analyser;
        freqRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        timeRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        featureModeRef.current = "mic";
        setMicNotice(null);
      } catch {
        featureModeRef.current = "synthetic";
        setMicNotice("Microphone unavailable — singing with a seeded synthetic voice instead.");
      }
    } catch {
      setMicNotice("Audio could not start in this browser.");
    }
  }, [started]);

  // ── Full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const actx = audioCtxRef.current;
      if (actx) {
        try {
          actx.close();
        } catch {
          /* already closed */
        }
      }
      audioCtxRef.current = null;
      backendRef.current?.destroy();
      backendRef.current = null;
    };
  }, []);

  const swirlLabel =
    hud.swirlDir > 0.05 ? "↺ ccw" : hud.swirlDir < -0.05 ? "↻ cw" : "· still";

  return (
    <div className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#05030d", touchAction: "none" }}
      />

      {/* Header / title */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex flex-col gap-1 p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Brine</h1>
        <p className="max-w-md text-base text-muted-foreground">
          Sing a body of water into motion — pitch steers the swirl, loudness churns the
          breath, brightness thins the fluid. A GPU fluid that sings back.
        </p>
      </div>

      {/* Live HUD */}
      <div className="pointer-events-none absolute bottom-5 left-5 flex flex-col gap-2 font-mono text-xs">
        <Readout label="loudness" value={bar(hud.rms)} />
        <Readout label="brightness → viscosity" value={`${hud.brightness.toFixed(2)} · ${Math.round(hud.visc)}`} />
        <Readout label="pitch → swirl" value={`${hud.pitch > 0 ? Math.round(hud.pitch) + " hz" : "—"} ${swirlLabel}`} />
        <Readout label="fluid drone" value={bar(hud.ke)} />
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.18em] text-muted-foreground">backend</span>
          <span
            className={`rounded-md border border-border px-2 py-0.5 ${
              backendKind === "webgpu" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {backendKind === "init"
              ? "starting…"
              : backendKind === "webgpu"
                ? `WebGPU · ${backendRef.current?.count ?? N_GPU} particles`
                : `CPU · ${N_CPU} particles`}
          </span>
        </div>
      </div>

      {/* Notices */}
      <div className="absolute right-5 top-5 flex max-w-xs flex-col items-end gap-2 text-right">
        {gpuNotice && <p className="text-xs leading-relaxed text-destructive">{gpuNotice}</p>}
        {micNotice && <p className="text-xs leading-relaxed text-destructive">{micNotice}</p>}
      </div>

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-background/40 backdrop-blur-[2px]">
          <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
            The brine is already churning on a seeded voice. Enter to lend it{" "}
            <span className="text-primary">your</span> mic and hear it sing back.
          </p>
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter
          </button>
        </div>
      )}

      {/* Corner affordances */}
      <div className="absolute bottom-5 right-5 flex items-center gap-3">
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
        <Link
          href="/dream"
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm leading-[44px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ← back
        </Link>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">
              Brine — design notes
            </h2>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              mic → GPU SPH fluid → drone
            </p>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Brine is a 2D Smoothed-Particle Hydrodynamics fluid — {N_GPU.toLocaleString()}{" "}
                particles when WebGPU is present, each frame stepped through three compute
                passes (density/pressure → force → integrate) entirely on the GPU in WGSL.
                The kernels are the classic Müller, Charypar &amp; Gross (2003) set: a Poly6
                kernel for density, a Spiky gradient for pressure, and a Laplacian for
                viscosity.
              </p>
              <p>
                Your voice sets the physics. Loudness injects an upward breath force at the
                bottom-centre (louder = more violent churn) and lightens gravity. Brightness
                (spectral centroid) sets viscosity — bright sounds thin the water to a splash,
                dark sounds thicken it to a gloop. Pitch aims a vortex: below the 220&nbsp;Hz
                pivot it swirls clockwise, above it reverses — a rising glissando visibly turns
                the current around.
              </p>
              <p>
                The fluid sings back: its aggregate kinetic energy swells a soft low drone and
                opens a lowpass, so the churn you cause becomes an audible wash under your
                voice. No mic → a seeded <span className="text-primary">mulberry32(0x4120)</span>{" "}
                envelope self-demos hands-free. No WebGPU → a smaller CPU fluid on Canvas2D
                with the same mapping.
              </p>
              <p>
                Aesthetic contemporary: Robert Borghesi&apos;s <em>ASTRODITHER</em> (WebGPU TSL
                fluid, 2026).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function bar(v: number): string {
  const n = Math.round(clamp01(v) * 12);
  return "▮".repeat(n) + "▯".repeat(12 - n);
}
