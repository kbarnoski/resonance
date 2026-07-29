"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 3704 · Membrane
//
//   ONE QUESTION
//   What if two Physarum swarms live in TWO adjacent fields separated by a
//   permeable MEMBRANE, and the amount each swarm can "hear" the other across
//   that membrane controls whether their two voices form call-and-response or
//   drift into independent counterpoint?
//
//   Two SEPARATE bodies. Swarm L forages its own left field; swarm R forages its
//   own right field. Down the middle runs a permeable membrane. A controllable
//   fraction of each swarm's trail density LEAKS across the boundary and becomes
//   a faint food-attractant in the other's field:
//     • high permeability → both swarms grow toward each other, their densities
//       meet at the membrane, the measured cross-membrane connectivity rises, and
//       the two voices LOCK into a just interval + antiphase call-and-response.
//     • low permeability → each forages alone, connectivity falls, the voices
//       diverge into two independent, unsynced lines — true counterpoint.
//   The MEMBRANE PERMEABILITY is the master expressive control. It is the
//   coupling itself, not a mood dial.
//
//   SONIFICATION = a DUET. Swarm L → voice 1 panned left; swarm R → voice 2
//   panned right, so the two bodies are audible as two. Each voice's amplitude
//   and brightness track its swarm's trail mass; the emergent cross-membrane
//   connectivity bends voice R toward a just interval of voice L and turns its
//   pulse into an antiphase echo. Pitch is continuous — every bend/glide rides
//   `setTargetAtTime`; the just interval is a glide DESTINATION, never a snap.
//
//   INPUT is NON-POINTER (keyboard): ←/→ or [ ] sweep permeability, digits 1–8
//   plant food in the selected field, Space toggles which swarm you feed. A
//   seeded deterministic autopilot sweeps permeability + plants food so a
//   hands-off reviewer sees and hears the coupling evolve.
//
//   SUBSTRATE  WebGPU compute (two agent sets + two fields packed in one wide
//   buffer, membrane coupling in the diffuse pass, async topology readback), with
//   a mandatory Canvas2D CPU fallback running the IDENTICAL model. Sonification
//   runs in BOTH paths.
//
//   REFS  Jones 2010 (Physarum transport model); "The Agentic Symphony" (Meera
//   Sundar, ADCx India 2026 — emergent call-and-response from coupled agents);
//   MusicSwarm (Buehler 2026, arXiv:2509.11973). Deliberate v2 of 3552-forage.
//   See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Tunables ────────────────────────────────────────────────────────────────

const GPU_FW = 384; // per-field width (grid cells)
const GPU_FH = 384; // field height
const GPU_CW = GPU_FW * 2; // combined width (L | R)
const GPU_AGENTS = 61440; // 30720 per swarm

const CPU_FW = 170;
const CPU_FH = 170;
const CPU_CW = CPU_FW * 2;
const CPU_AGENTS = 2600; // 1300 per swarm

const FIXED = 1024; // fixed-point scale for the atomic u32 trail buffers
const MAX_FOODS = 8;
const FOOD_HALF_LIFE = 46; // seconds — food strength decays; tubes then prune
const MEMB_BAND = 20; // columns each side of the membrane sampled for connectivity

// eight food anchor slots per field (4 columns × 2 rows), in field-local u,v
const SLOT_UV: [number, number][] = [
  [0.2, 0.33], [0.4, 0.33], [0.6, 0.33], [0.8, 0.33],
  [0.2, 0.67], [0.4, 0.67], [0.6, 0.67], [0.8, 0.67],
];

// ── Deterministic PRNG (mulberry32) — NEVER Math.random / Date.now ────────────

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Shared types ──────────────────────────────────────────────────────────────

type Side = "L" | "R";

interface Food {
  x: number; // 0..1 across the COMBINED field (x<0.5 = field L, x>=0.5 = field R)
  y: number; // 0..1
  side: Side;
  strength: number; // 0..1, decays
  bornAt: number; // seconds
}

interface Readout {
  massL: number; // total trail mass proxy, swarm L
  massR: number; // total trail mass proxy, swarm R
  membL: number; // trail density in the membrane band, field L side
  membR: number; // trail density in the membrane band, field R side
}

interface StepParams {
  foods: Food[];
  perm: number; // 0..1 membrane permeability
  motionScale: number;
}

interface Backend {
  kind: "webgpu" | "cpu";
  step(p: StepParams): void;
  readout(): Readout;
  destroy(): void;
}

// ── WGSL ──────────────────────────────────────────────────────────────────────

const SIM_UNIFORMS = /* wgsl */ `
struct Params {
  fw: u32, fh: u32, cw: u32, nAgents: u32,
  nFoods: u32, frame: f32, decay: f32, moveSpd: f32,
  senseDist: f32, senseAngle: f32, turnSpd: f32, deposit: f32,
  motion: f32, perm: f32, pad0: f32, pad1: f32,
};
`;

const DIFFUSE_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;
@group(0) @binding(3) var<uniform> foods: array<vec4f, 8>;

fn wrapY(y: i32) -> i32 { let H = i32(P.fh); return ((y % H) + H) % H; }

// clamp x into the field that owns column 'side' (0 = L, 1 = R); the membrane and
// outer edges are walls — the two bodies never blur into each other directly.
fn clampX(x: i32, side: i32) -> i32 {
  if (side == 0) { return clamp(x, 0, i32(P.fw) - 1); }
  return clamp(x, i32(P.fw), i32(P.cw) - 1);
}

fn at(x: i32, y: i32, side: i32) -> f32 {
  let idx = u32(wrapY(y) * i32(P.cw) + clampX(x, side));
  return f32(src[idx]) / ${FIXED}.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.cw || gid.y >= P.fh) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let fw = i32(P.fw);
  let side = select(0, 1, x >= fw);

  // 3x3 box blur, confined to this field
  var s = 0.0;
  s += at(x-1,y-1,side)+at(x,y-1,side)+at(x+1,y-1,side);
  s += at(x-1,y  ,side)+at(x,y  ,side)+at(x+1,y  ,side);
  s += at(x-1,y+1,side)+at(x,y+1,side)+at(x+1,y+1,side);
  var v = (s / 9.0) * P.decay;

  // food wells deposit continuously — but only within their own field
  let fx = f32(x); let fy = f32(y);
  for (var k = 0u; k < P.nFoods; k++) {
    let f = foods[k];
    if (f.z <= 0.001) { continue; }
    let fSide = select(0, 1, i32(f.x) >= fw);
    if (fSide != side) { continue; }
    let dx = fx - f.x; let dy = fy - f.y;
    let d2 = dx*dx + dy*dy;
    let r2 = f.w * f.w;
    v += f.z * 6.0 * exp(-d2 / r2);
  }

  // ── the MEMBRANE coupling ──────────────────────────────────────────────────
  // a permeability-scaled attractant leaks across the boundary: a faint baseline
  // membrane glow (so each swarm can first sense the boundary) PLUS a term
  // proportional to the OTHER field's trail density at the mirrored cell (so once
  // one side arrives, it reinforces the other → entrainment).
  if (P.perm > 0.001) {
    var dMem: i32; var mirrorX: i32;
    if (side == 0) { dMem = (fw - 1) - x; mirrorX = fw + dMem; }
    else { dMem = x - fw; mirrorX = (fw - 1) - dMem; }
    if (dMem >= 0) {
      let dm = f32(dMem);
      let base = exp(-dm / 26.0) * 2.2;
      let other = f32(src[u32(wrapY(y) * i32(P.cw) + mirrorX)]) / ${FIXED}.0;
      v += P.perm * (base + other * 0.16);
    }
  }

  dst[u32(y * i32(P.cw) + x)] = u32(clamp(v, 0.0, 4000000.0) * ${FIXED}.0);
}
`;

const AGENT_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
struct Agent { pos: vec2f, ang: f32, pad: f32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read_write> field: array<atomic<u32>>;

fn hash11(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }

fn sampleField(pos: vec2f, side: i32) -> f32 {
  var xi = i32(pos.x);
  if (side == 0) { xi = clamp(xi, 0, i32(P.fw) - 1); }
  else { xi = clamp(xi, i32(P.fw), i32(P.cw) - 1); }
  let H = i32(P.fh);
  let yy = ((i32(pos.y) % H) + H) % H;
  return f32(atomicLoad(&field[u32(yy * i32(P.cw) + xi)])) / ${FIXED}.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nAgents) { return; }
  let half = P.nAgents / 2u;
  let side = select(0, 1, i >= half);
  var a = agents[i];

  let sd = P.senseDist;
  let fwd = vec2f(cos(a.ang), sin(a.ang));
  let lft = vec2f(cos(a.ang + P.senseAngle), sin(a.ang + P.senseAngle));
  let rgt = vec2f(cos(a.ang - P.senseAngle), sin(a.ang - P.senseAngle));

  let cF = sampleField(a.pos + fwd * sd, side);
  let cL = sampleField(a.pos + lft * sd, side);
  let cR = sampleField(a.pos + rgt * sd, side);

  let rnd = hash11(f32(i) * 0.017 + P.frame * 0.13);
  var turn = 0.0;
  if (cF >= cL && cF >= cR) { turn = 0.0; }
  else if (cL > cR) { turn = P.turnSpd; }
  else if (cR > cL) { turn = -P.turnSpd; }
  else { turn = (rnd - 0.5) * P.turnSpd * 2.0; }
  a.ang += turn;

  let dir = vec2f(cos(a.ang), sin(a.ang));
  var np = a.pos + dir * P.moveSpd * P.motion;

  // x walls: membrane on the inner side, canvas edge on the outer side (reflect)
  var lo = 0.0; var hi = f32(P.fw) - 1.001;
  if (side == 1) { lo = f32(P.fw); hi = f32(P.cw) - 1.001; }
  if (np.x < lo) { np.x = lo + (lo - np.x); a.ang = 3.14159265 - a.ang + (rnd - 0.5); }
  if (np.x > hi) { np.x = hi - (np.x - hi); a.ang = 3.14159265 - a.ang + (rnd - 0.5); }

  let H = f32(P.fh);
  np.y = np.y - floor(np.y / H) * H; // wrap vertically (toroidal)
  a.pos = np;
  agents[i] = a;

  let ci = u32(i32(np.y) * i32(P.cw) + i32(np.x));
  atomicAdd(&field[ci], u32(P.deposit * ${FIXED}.0));
}
`;

const RENDER_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<uniform> foods: array<vec4f, 8>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[vi];
  return VO(vec4f(xy, 0.0, 1.0), vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5));
}

fn cell(x: i32, y: i32) -> f32 {
  let W = i32(P.cw); let H = i32(P.fh);
  let xx = clamp(x, 0, W - 1);
  let yy = ((y % H) + H) % H;
  return f32(field[u32(yy * W + xx)]) / ${FIXED}.0;
}

// swarm L — cooler violet (indigo-leaning)
fn rampCool(t: f32) -> vec3f {
  let deep   = vec3f(0.031, 0.024, 0.070);
  let indigo = vec3f(0.310, 0.345, 0.945);
  let violet = vec3f(0.505, 0.400, 0.965);
  let light  = vec3f(0.800, 0.815, 1.000);
  let u = clamp(t, 0.0, 1.0);
  if (u < 0.35) { return mix(deep, indigo, u / 0.35); }
  if (u < 0.72) { return mix(indigo, violet, (u - 0.35) / 0.37); }
  return mix(violet, light, (u - 0.72) / 0.28);
}
// swarm R — warmer violet (magenta-leaning)
fn rampWarm(t: f32) -> vec3f {
  let deep    = vec3f(0.060, 0.024, 0.070);
  let violet  = vec3f(0.560, 0.345, 0.945);
  let magenta = vec3f(0.760, 0.255, 0.870);
  let light   = vec3f(0.960, 0.800, 1.000);
  let u = clamp(t, 0.0, 1.0);
  if (u < 0.35) { return mix(deep, violet, u / 0.35); }
  if (u < 0.72) { return mix(violet, magenta, (u - 0.35) / 0.37); }
  return mix(magenta, light, (u - 0.72) / 0.28);
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let gx = v.uv.x * f32(P.cw) - 0.5;
  let gy = v.uv.y * f32(P.fh) - 0.5;
  let x0 = i32(floor(gx)); let y0 = i32(floor(gy));
  let fx = gx - f32(x0); let fy = gy - f32(y0);
  let a = mix(cell(x0,y0), cell(x0+1,y0), fx);
  let b = mix(cell(x0,y0+1), cell(x0+1,y0+1), fx);
  var val = mix(a, b, fy);

  // slow luminance drift (<=0.2 Hz), no strobe
  let drift = 0.86 + 0.14 * sin(P.frame * 0.016 * 0.6);
  let lum = (1.0 - exp(-val * 0.11)) * drift;
  let side = select(0, 1, gx >= f32(P.fw));
  var col: vec3f;
  if (side == 0) { col = rampCool(pow(lum, 0.85)); }
  else { col = rampWarm(pow(lum, 0.85)); }

  // the membrane: a faint dividing line whose glow tracks permeability
  let mx = f32(P.fw);
  let dLine = abs(gx - mx);
  let glow = exp(-dLine * dLine / 90.0) * (0.10 + 0.55 * P.perm);
  col += vec3f(0.62, 0.52, 0.92) * glow;

  // food markers
  for (var k = 0u; k < P.nFoods; k++) {
    let f = foods[k];
    if (f.z <= 0.001) { continue; }
    let dx = gx - f.x; let dy = gy - f.y;
    let d2 = dx*dx + dy*dy;
    let g = exp(-d2 / 36.0) * f.z;
    col += vec3f(0.55, 0.42, 0.85) * g * 0.9;
  }
  return vec4f(col, 1.0);
}
`;

const REDUCE_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<storage, read_write> outv: array<f32>;

fn cellv(x: i32, y: i32) -> f32 {
  let W = i32(P.cw); let H = i32(P.fh);
  let xx = clamp(x, 0, W - 1);
  let yy = ((y % H) + H) % H;
  return f32(field[u32(yy * W + xx)]) / ${FIXED}.0;
}

// out layout: [0] massL, [1] massR, [2] membL, [3] membR
@compute @workgroup_size(4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  let fw = i32(P.fw); let cw = i32(P.cw); let H = i32(P.fh);
  if (t == 0u || t == 1u) {
    // coarse mass over a field half
    let x0 = select(0, fw, t == 1u);
    let x1 = select(fw, cw, t == 1u);
    var s = 0.0;
    var y = 0; loop {
      if (y >= H) { break; }
      var x = x0; loop {
        if (x >= x1) { break; }
        s += cellv(x, y);
        x = x + 12;
      }
      y = y + 12;
    }
    outv[t] = s;
  } else if (t == 2u || t == 3u) {
    // trail density in the membrane band, one side each
    var x0: i32; var x1: i32;
    if (t == 2u) { x0 = fw - ${MEMB_BAND}; x1 = fw; }
    else { x0 = fw; x1 = fw + ${MEMB_BAND}; }
    var s = 0.0;
    var y = 0; loop {
      if (y >= H) { break; }
      var x = x0; loop {
        if (x >= x1) { break; }
        s += cellv(x, y);
        x = x + 2;
      }
      y = y + 3;
    }
    outv[t] = s;
  }
}
`;

// ── WebGPU backend ────────────────────────────────────────────────────────────

async function makeGpuBackend(
  canvas: HTMLCanvasElement,
  rng: () => number,
): Promise<Backend> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("no navigator.gpu");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();

  device.pushErrorScope("validation");

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no webgpu context");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const CW = GPU_CW;
  const FH = GPU_FH;
  const cells = CW * FH;

  const mkField = () =>
    device.createBuffer({
      size: cells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  const fieldA = mkField();
  const fieldB = mkField();
  device.queue.writeBuffer(fieldA, 0, new Uint32Array(cells).buffer as ArrayBuffer);
  device.queue.writeBuffer(fieldB, 0, new Uint32Array(cells).buffer as ArrayBuffer);

  // agents: first half swarm L (seed in field L), second half swarm R
  const agentData = new Float32Array(GPU_AGENTS * 4);
  const half = GPU_AGENTS / 2;
  for (let i = 0; i < GPU_AGENTS; i++) {
    const isR = i >= half;
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.16;
    // centre each swarm inside its own field half
    const cx = isR ? 0.72 : 0.28;
    agentData[i * 4 + 0] = (cx + Math.cos(ang) * r * 0.5) * CW;
    agentData[i * 4 + 1] = (0.5 + Math.sin(ang) * r) * FH;
    agentData[i * 4 + 2] = rng() * Math.PI * 2;
    agentData[i * 4 + 3] = 0;
  }
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData.buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const foodsBuf = device.createBuffer({
    size: MAX_FOODS * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const outBuf = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const staging = [0, 1].map(() =>
    device.createBuffer({
      size: 16 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
  );
  const stagingBusy = [false, false];

  const diffusePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: DIFFUSE_WGSL }), entryPoint: "main" },
  });
  const agentPl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: AGENT_WGSL }), entryPoint: "main" },
  });
  const reducePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: REDUCE_WGSL }), entryPoint: "main" },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const renderPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: { module: renderMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-strip" },
  });

  const scopeErr = await device.popErrorScope();
  if (scopeErr) throw new Error("WGSL validation: " + scopeErr.message);

  let parity = 0;
  const readCur: Readout = { massL: 0, massR: 0, membL: 0, membR: 0 };

  function writeParams(P: StepParams, frame: number) {
    const buf = new ArrayBuffer(64);
    const u = new Uint32Array(buf);
    const f = new Float32Array(buf);
    u[0] = GPU_FW; u[1] = GPU_FH; u[2] = GPU_CW; u[3] = GPU_AGENTS;
    u[4] = P.foods.length;
    f[5] = frame;
    f[6] = 0.90; // decay
    f[7] = 1.0; // moveSpd
    f[8] = 9.0; // senseDist
    f[9] = 0.45; // senseAngle
    f[10] = 0.38; // turnSpd
    f[11] = 5.0; // deposit
    f[12] = P.motionScale; // motion
    f[13] = P.perm; // permeability
    device.queue.writeBuffer(paramsBuf, 0, buf);

    const fd = new Float32Array(MAX_FOODS * 4);
    for (let k = 0; k < P.foods.length; k++) {
      const fo = P.foods[k];
      fd[k * 4 + 0] = fo.x * CW;
      fd[k * 4 + 1] = fo.y * FH;
      fd[k * 4 + 2] = fo.strength;
      fd[k * 4 + 3] = 20.0; // radius
    }
    device.queue.writeBuffer(foodsBuf, 0, fd.buffer as ArrayBuffer);
  }

  let frame = 0;
  function freeStagingSlot(): number {
    if (!stagingBusy[0]) return 0;
    if (!stagingBusy[1]) return 1;
    return -1;
  }

  const step = (P: StepParams) => {
    frame += 1;
    writeParams(P, frame);
    const src = parity === 0 ? fieldA : fieldB;
    const dst = parity === 0 ? fieldB : fieldA;
    const enc = device.createCommandEncoder();

    // 1. diffuse + decay + food + membrane coupling  (src -> dst)
    {
      const bg = device.createBindGroup({
        layout: diffusePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: src } },
          { binding: 2, resource: { buffer: dst } },
          { binding: 3, resource: { buffer: foodsBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(diffusePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(GPU_CW / 8), Math.ceil(GPU_FH / 8));
      pass.end();
    }
    // 2. both swarms sense + deposit into dst
    {
      const bg = device.createBindGroup({
        layout: agentPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: agentBuf } },
          { binding: 2, resource: { buffer: dst } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(agentPl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(GPU_AGENTS / 64));
      pass.end();
    }
    // 3. reduce (masses + membrane bands) from dst
    {
      const bg = device.createBindGroup({
        layout: reducePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: outBuf } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(reducePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(1);
      pass.end();
    }
    // 4. render dst -> canvas
    {
      const bg = device.createBindGroup({
        layout: renderPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: foodsBuf } },
        ],
      });
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view: ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.014, g: 0.010, b: 0.028, a: 1 },
        }],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bg);
      pass.draw(4);
      pass.end();
    }

    let probeSlot = -1;
    if (frame % 2 === 0) {
      probeSlot = freeStagingSlot();
      if (probeSlot >= 0) {
        enc.copyBufferToBuffer(outBuf, 0, staging[probeSlot], 0, 16 * 4);
      }
    }

    device.queue.submit([enc.finish()]);
    parity ^= 1;

    if (probeSlot >= 0) {
      stagingBusy[probeSlot] = true;
      const buf = staging[probeSlot];
      buf.mapAsync(GPUMapMode.READ).then(() => {
        const arr = new Float32Array(buf.getMappedRange().slice(0));
        buf.unmap();
        readCur.massL = arr[0];
        readCur.massR = arr[1];
        readCur.membL = arr[2];
        readCur.membR = arr[3];
        stagingBusy[probeSlot] = false;
      }).catch(() => {
        stagingBusy[probeSlot] = false;
      });
    }
  };

  const destroy = () => {
    fieldA.destroy(); fieldB.destroy(); agentBuf.destroy();
    paramsBuf.destroy(); foodsBuf.destroy(); outBuf.destroy();
    staging.forEach((b) => { try { b.destroy(); } catch { /* mapped */ } });
    device.destroy();
  };

  return { kind: "webgpu", step, readout: () => readCur, destroy };
}

// ── CPU (Canvas2D) backend — identical two-swarm + membrane model ─────────────

function makeCpuBackend(canvas: HTMLCanvasElement, rng: () => number): Backend {
  const CW = CPU_CW;
  const FH = CPU_FH;
  const FW = CPU_FW;
  const cells = CW * FH;
  let fieldA = new Float32Array(cells);
  let fieldB = new Float32Array(cells);

  const ax = new Float32Array(CPU_AGENTS);
  const ay = new Float32Array(CPU_AGENTS);
  const aa = new Float32Array(CPU_AGENTS);
  const half = CPU_AGENTS / 2;
  for (let i = 0; i < CPU_AGENTS; i++) {
    const isR = i >= half;
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.16;
    const cx = isR ? 0.72 : 0.28;
    ax[i] = (cx + Math.cos(ang) * r * 0.5) * CW;
    ay[i] = (0.5 + Math.sin(ang) * r) * FH;
    aa[i] = rng() * Math.PI * 2;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const off = document.createElement("canvas");
  off.width = CW; off.height = FH;
  const offCtx = off.getContext("2d", { willReadFrequently: true })!;
  const img = offCtx.createImageData(CW, FH);

  const readCur: Readout = { massL: 0, massR: 0, membL: 0, membR: 0 };

  const DECAY = 0.90;
  const SENSE = 8;
  const SENSE_ANG = 0.45;
  const TURN = 0.38;
  const DEPOSIT = 5.0;
  const RAD2 = (20 * 20) * (FW / GPU_FW) * (FW / GPU_FW);
  let frame = 0;
  let perm = 0;

  function wrapY(y: number): number {
    const r = y % FH;
    return r < 0 ? r + FH : r;
  }
  function clampX(x: number, side: number): number {
    if (side === 0) return x < 0 ? 0 : x > FW - 1 ? FW - 1 : x;
    return x < FW ? FW : x > CW - 1 ? CW - 1 : x;
  }
  function at(f: Float32Array, x: number, y: number, side: number): number {
    return f[wrapY(y) * CW + clampX(x, side)];
  }

  // cool ramp (L) / warm ramp (R)
  function ramp(t: number, warm: boolean): [number, number, number] {
    const cool: [number, number, number][] = [
      [8, 6, 18], [79, 88, 241], [129, 102, 246], [204, 208, 255],
    ];
    const hot: [number, number, number][] = [
      [15, 6, 18], [143, 88, 241], [194, 65, 222], [245, 204, 255],
    ];
    const stops = warm ? hot : cool;
    const u = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
    const i = Math.floor(u);
    const f = u - i;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  const step = (P: StepParams) => {
    frame += 1;
    perm = P.perm;
    // 1. diffuse + decay + food + membrane coupling (fieldA -> fieldB)
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < CW; x++) {
        const side = x >= FW ? 1 : 0;
        let s = 0;
        s += at(fieldA, x - 1, y - 1, side) + at(fieldA, x, y - 1, side) + at(fieldA, x + 1, y - 1, side);
        s += at(fieldA, x - 1, y, side) + at(fieldA, x, y, side) + at(fieldA, x + 1, y, side);
        s += at(fieldA, x - 1, y + 1, side) + at(fieldA, x, y + 1, side) + at(fieldA, x + 1, y + 1, side);
        let v = (s / 9) * DECAY;
        for (let k = 0; k < P.foods.length; k++) {
          const fo = P.foods[k];
          if (fo.strength <= 0.001) continue;
          const fxp = fo.x * CW;
          const fSide = fxp >= FW ? 1 : 0;
          if (fSide !== side) continue;
          const dx = x - fxp;
          const dy = y - fo.y * FH;
          v += fo.strength * 6 * Math.exp(-(dx * dx + dy * dy) / RAD2);
        }
        if (perm > 0.001) {
          let dMem: number; let mirrorX: number;
          if (side === 0) { dMem = (FW - 1) - x; mirrorX = FW + dMem; }
          else { dMem = x - FW; mirrorX = (FW - 1) - dMem; }
          if (dMem >= 0) {
            const base = Math.exp(-dMem / (26 * FW / GPU_FW)) * 2.2;
            const other = fieldA[wrapY(y) * CW + mirrorX];
            v += perm * (base + other * 0.16);
          }
        }
        fieldB[y * CW + x] = v;
      }
    }
    // 2. both swarms on fieldB
    for (let i = 0; i < CPU_AGENTS; i++) {
      const side = i >= half ? 1 : 0;
      const px = ax[i], py = ay[i], an = aa[i];
      const fx = Math.cos(an), fy = Math.sin(an);
      const lx = Math.cos(an + SENSE_ANG), ly = Math.sin(an + SENSE_ANG);
      const rx = Math.cos(an - SENSE_ANG), ry = Math.sin(an - SENSE_ANG);
      const cF = at(fieldB, (px + fx * SENSE) | 0, (py + fy * SENSE) | 0, side);
      const cL = at(fieldB, (px + lx * SENSE) | 0, (py + ly * SENSE) | 0, side);
      const cR = at(fieldB, (px + rx * SENSE) | 0, (py + ry * SENSE) | 0, side);
      let na = an;
      const rnd = rng();
      if (cF >= cL && cF >= cR) { /* keep */ }
      else if (cL > cR) na += TURN;
      else if (cR > cL) na -= TURN;
      else na += (rnd - 0.5) * TURN * 2;
      const dx = Math.cos(na), dy = Math.sin(na);
      let nx = px + dx * P.motionScale;
      let ny = py + dy * P.motionScale;
      const lo = side === 0 ? 0 : FW;
      const hi = side === 0 ? FW - 1.001 : CW - 1.001;
      if (nx < lo) { nx = lo + (lo - nx); na = Math.PI - na + (rnd - 0.5); }
      if (nx > hi) { nx = hi - (nx - hi); na = Math.PI - na + (rnd - 0.5); }
      ny = wrapY(ny);
      ax[i] = nx; ay[i] = ny; aa[i] = na;
      fieldB[(ny | 0) * CW + (nx | 0)] += DEPOSIT;
    }
    const tmp = fieldA; fieldA = fieldB; fieldB = tmp;

    // 3. readout from fieldA
    let massL = 0, massR = 0;
    for (let y = 0; y < FH; y += 12) {
      for (let x = 0; x < CW; x += 12) {
        if (x < FW) massL += fieldA[y * CW + x];
        else massR += fieldA[y * CW + x];
      }
    }
    readCur.massL = massL; readCur.massR = massR;
    let membL = 0, membR = 0;
    for (let y = 0; y < FH; y += 3) {
      for (let d = 0; d < MEMB_BAND; d += 2) {
        membL += fieldA[y * CW + (FW - 1 - d)];
        membR += fieldA[y * CW + (FW + d)];
      }
    }
    readCur.membL = membL; readCur.membR = membR;

    // 4. render fieldA -> offscreen -> canvas
    const drift = 0.86 + 0.14 * Math.sin(frame * 0.016 * 0.6);
    const d = img.data;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < CW; x++) {
        const p = y * CW + x;
        const val = fieldA[p];
        const lum = (1 - Math.exp(-val * 0.11)) * drift;
        const [r, g, bl] = ramp(Math.pow(Math.min(1, lum), 0.85), x >= FW);
        d[p * 4 + 0] = r; d[p * 4 + 1] = g; d[p * 4 + 2] = bl; d[p * 4 + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    // membrane line glow
    const g = offCtx.createLinearGradient(FW - 6, 0, FW + 6, 0);
    const gm = 0.12 + 0.5 * perm;
    g.addColorStop(0, "rgba(158,133,235,0)");
    g.addColorStop(0.5, `rgba(158,133,235,${gm.toFixed(3)})`);
    g.addColorStop(1, "rgba(158,133,235,0)");
    offCtx.fillStyle = g;
    offCtx.fillRect(FW - 6, 0, 12, FH);
    // food markers
    for (let k = 0; k < P.foods.length; k++) {
      const fo = P.foods[k];
      if (fo.strength <= 0.001) continue;
      offCtx.beginPath();
      offCtx.fillStyle = `rgba(196,181,253,${0.4 * fo.strength})`;
      offCtx.arc(fo.x * CW, fo.y * FH, 2.5, 0, Math.PI * 2);
      offCtx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  };

  const destroy = () => { /* GC with node */ };

  return { kind: "cpu", step, readout: () => readCur, destroy };
}

// ── Sonification — the two swarms sing a duet across the membrane ─────────────

// just modes as ratio sets over an octave (continuous pitch — never hard-snapped)
const DORIAN = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5];
const LYDIAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8];
const JUST = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

function nearestJust(r: number): number {
  let oct = 0;
  let x = r;
  while (x >= 2) { x /= 2; oct++; }
  while (x < 1) { x *= 2; oct--; }
  let best = JUST[0], bd = Infinity;
  for (const j of JUST) { const dd = Math.abs(j - x); if (dd < bd) { bd = dd; best = j; } }
  return best * Math.pow(2, oct);
}

// fully-continuous modal pitch: linear interpolation between adjacent ratios so a
// drifting position glides — it never snaps onto a discrete scale step.
function modePitch(pos: number, mix: number): number {
  const len = DORIAN.length;
  const i = Math.floor(pos);
  const f = pos - i;
  const ratioAt = (n: number): number => {
    const idx = ((n % len) + len) % len;
    const oct = Math.floor(n / len);
    return (DORIAN[idx] * (1 - mix) + LYDIAN[idx] * mix) * Math.pow(2, oct);
  };
  return ratioAt(i) * (1 - f) + ratioAt(i + 1) * f;
}

interface Voice {
  osc: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  pan: StereoPannerNode;
  curFreq: number;
}

class MembraneAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private vL: Voice;
  private vR: Voice;
  private root = 130.81; // ~C3
  private modeMix = 0;
  private started = false;
  private massMaxL = 900;
  private massMaxR = 900;
  private membMax = 260;
  private conn = 0;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    const mkVoice = (panVal: number): Voice => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      const sub = ctx.createOscillator();
      sub.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.7;
      const pan = ctx.createStereoPanner();
      pan.pan.value = panVal;
      osc.frequency.value = this.root;
      sub.frequency.value = this.root * 0.5;
      osc.connect(gain); sub.connect(gain);
      gain.connect(filter); filter.connect(pan); pan.connect(this.master);
      return { osc, sub, gain, filter, pan, curFreq: this.root };
    };
    this.vL = mkVoice(-0.7);
    this.vR = mkVoice(0.7);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    [this.vL, this.vR].forEach((v) => { v.osc.start(t); v.sub.start(t); });
    this.master.gain.setTargetAtTime(0.30, t, 1.4);
  }

  getConnectivity(): number { return this.conn; }

  // called each frame; returns nothing — updates the two panned voices
  update(r: Readout, now: number, dt: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // slow harmonic-field rotation: root transpose + mode morph (<0.05 Hz)
    this.modeMix = 0.5 + 0.5 * Math.sin(now * 0.019);
    const rootTarget = 130.81 * Math.pow(2, Math.round(Math.sin(now * 0.011) * 2) / 12);
    this.root += (rootTarget - this.root) * Math.min(1, dt * 0.4);

    // self-scaling presence (robust across GPU / CPU absolute scales)
    this.massMaxL = Math.max(this.massMaxL * 0.9995, r.massL, 500);
    this.massMaxR = Math.max(this.massMaxR * 0.9995, r.massR, 500);
    this.membMax = Math.max(this.membMax * 0.9993, r.membL, r.membR, 160);
    const massLn = Math.min(1, r.massL / this.massMaxL);
    const massRn = Math.min(1, r.massR / this.massMaxR);

    // cross-membrane CONNECTIVITY: both bodies must reach the membrane. This is
    // the EMERGENT measure (a result of permeability + growth), not the dial.
    const connL = Math.min(1, r.membL / this.membMax);
    const connR = Math.min(1, r.membR / this.membMax);
    const connTarget = Math.min(connL, connR);
    this.conn += (connTarget - this.conn) * Math.min(1, dt * 0.8);
    const k = this.conn;

    // two independent modal positions — different phases so they naturally diverge
    const posL = 1.4 + massLn * 3.0 + Math.sin(now * 0.047) * 0.8;
    const posR = 2.6 + massRn * 3.0 + Math.sin(now * 0.041 + 1.7) * 0.8;
    const freqL = modePitch(posL, this.modeMix) * this.root;
    const freqRfree = modePitch(posR, this.modeMix) * this.root;

    // pitch lock: R bends toward a JUST interval of L as connectivity rises
    const target = nearestJust(freqRfree / freqL) * freqL;
    const freqR = freqRfree * (1 - k * 0.9) + target * (k * 0.9);

    // amplitude: call-and-response vs counterpoint.
    // decoupled → R pulses on its own period (independent line).
    // coupled   → R pulses in antiphase to L (call, then response).
    const periodL = 2.6, periodR = 3.4;
    const envL = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / periodL);
    const envRindep = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / periodR + 0.9);
    const envRresp = 0.5 + 0.5 * Math.sin((2 * Math.PI * (now - periodL * 0.5)) / periodL);
    const envR = envRindep * (1 - k) + envRresp * k;

    // apply L
    {
      const v = this.vL;
      const vib = 1 + Math.sin(now * 0.7) * 0.0016;
      const target2 = freqL * vib;
      v.curFreq += (target2 - v.curFreq) * Math.min(1, dt * 1.5);
      v.osc.frequency.setTargetAtTime(v.curFreq, t, 0.08);
      v.sub.frequency.setTargetAtTime(v.curFreq * 0.5, t, 0.12);
      v.filter.frequency.setTargetAtTime(320 + massLn * 2600, t, 0.4);
      v.gain.gain.setTargetAtTime(massLn * (0.22 + 0.78 * envL) * 0.5, t, 0.2);
    }
    // apply R
    {
      const v = this.vR;
      const vib = 1 + Math.sin(now * 0.63 + 1.1) * 0.0016;
      const target2 = freqR * vib;
      v.curFreq += (target2 - v.curFreq) * Math.min(1, dt * 1.5);
      v.osc.frequency.setTargetAtTime(v.curFreq, t, 0.08);
      v.sub.frequency.setTargetAtTime(v.curFreq * 0.5, t, 0.12);
      v.filter.frequency.setTargetAtTime(320 + massRn * 2600, t, 0.4);
      v.gain.gain.setTargetAtTime(massRn * (0.22 + 0.78 * envR) * 0.5, t, 0.2);
    }

    // overall level swells with total presence
    this.master.gain.setTargetAtTime(0.20 + Math.min(1, (massLn + massRn) * 0.5) * 0.22, t, 0.6);
  }

  async stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.3);
    await new Promise((res) => setTimeout(res, 400));
    [this.vL, this.vR].forEach((v) => { try { v.osc.stop(); v.sub.stop(); } catch { /* */ } });
    try { await this.ctx.close(); } catch { /* */ }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";

export default function MembranePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backendKind, setBackendKind] = useState<"webgpu" | "cpu" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [permUi, setPermUi] = useState(0);
  const [connUi, setConnUi] = useState(0);
  const [feedUi, setFeedUi] = useState<Side>("L");
  const [autoUi, setAutoUi] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<Backend | null>(null);
  const audioRef = useRef<MembraneAudio | null>(null);
  const foodsRef = useRef<Food[]>([]);
  const rafRef = useRef(0);
  const rngRef = useRef<() => number>(makeRng(0x3704ab));
  const startTsRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const reducedRef = useRef(false);

  const permRef = useRef(0);
  const permAutoRef = useRef(true); // autopilot owns permeability until an arrow is pressed
  const foodAutoRef = useRef(true); // autopilot owns food until a digit/space is pressed
  const feedRef = useRef<Side>("L");
  const autoFoodIdxRef = useRef(0);

  const placeFood = useCallback((side: Side, slot: number, now: number) => {
    const [u, v] = SLOT_UV[slot % SLOT_UV.length];
    const x = side === "L" ? 0.03 + u * 0.44 : 0.53 + u * 0.44;
    const y = 0.08 + v * 0.84;
    const foods = foodsRef.current;
    const food: Food = { x, y, side, strength: 1, bornAt: now };
    if (foods.length < MAX_FOODS) {
      foods.push(food);
    } else {
      let wi = 0;
      for (let i = 1; i < foods.length; i++) if (foods[i].strength < foods[wi].strength) wi = i;
      foods[wi] = food;
    }
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);

    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    audioRef.current = new MembraneAudio(audioCtx);
    audioRef.current.start();

    // fresh deterministic PRNG per run
    rngRef.current = makeRng(0x3704ab);
    foodsRef.current = [];
    autoFoodIdxRef.current = 0;
    permAutoRef.current = true;
    foodAutoRef.current = true;
    permRef.current = 0;
    feedRef.current = "L";
    startTsRef.current = null;
    setPermUi(0);
    setConnUi(0);
    setFeedUi("L");
    setAutoUi(true);

    let backend: Backend;
    try {
      backend = await makeGpuBackend(canvas, rngRef.current);
    } catch {
      try {
        backend = makeCpuBackend(canvas, rngRef.current);
      } catch {
        setError("Neither WebGPU nor Canvas2D could start on this device.");
        await audioRef.current.stop();
        audioRef.current = null;
        return;
      }
    }
    backendRef.current = backend;
    setBackendKind(backend.kind);
    setPhase("running");

    // seed one food per field so both bodies have something to grow toward
    placeFood("L", 1, 0);
    placeFood("R", 6, 0);

    // seeded autopilot food schedule (only fires while autopilot owns food)
    const rng = rngRef.current;
    const autoTimes = [8, 16, 24, 34, 44];
    const autoFood = autoTimes.map(() => ({
      side: (rng() < 0.5 ? "L" : "R") as Side,
      slot: Math.floor(rng() * SLOT_UV.length),
    }));

    let hudFrame = 0;

    const loop = (ts: number) => {
      const be = backendRef.current;
      const audio = audioRef.current;
      if (!be || !audio) return;
      if (startTsRef.current == null) startTsRef.current = ts;
      const elapsed = (ts - startTsRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTsRef.current) / 1000));
      lastTsRef.current = ts;

      // autopilot permeability sweep (0 → 1 → 0 over 48s): counterpoint → duet → counterpoint
      if (permAutoRef.current) {
        permRef.current = 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsed) / 48);
      }
      // autopilot food planting
      if (foodAutoRef.current) {
        while (
          autoFoodIdxRef.current < autoTimes.length &&
          elapsed >= autoTimes[autoFoodIdxRef.current]
        ) {
          const a = autoFood[autoFoodIdxRef.current];
          placeFood(a.side, a.slot, elapsed);
          autoFoodIdxRef.current += 1;
        }
      }

      // food strength decay → tubes prune → long-form evolution
      const foods = foodsRef.current;
      const lambda = Math.LN2 / FOOD_HALF_LIFE;
      for (const f of foods) {
        f.strength = Math.max(0, Math.exp(-lambda * (elapsed - f.bornAt)));
      }

      const motionScale = reducedRef.current ? 0.5 : 1.0;
      be.step({ foods, perm: permRef.current, motionScale });
      audio.update(be.readout(), elapsed, dt);

      // throttled HUD updates (avoid per-frame React churn)
      hudFrame += 1;
      if (hudFrame % 12 === 0) {
        setPermUi(permRef.current);
        setConnUi(audio.getConnectivity());
        setAutoUi(permAutoRef.current && foodAutoRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [placeFood]);

  const stop = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    if (backendRef.current) { backendRef.current.destroy(); backendRef.current = null; }
    if (audioRef.current) { await audioRef.current.stop(); audioRef.current = null; }
    foodsRef.current = [];
    setPhase("idle");
  }, []);

  // keyboard — the primary (non-pointer) instrument
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      const now =
        lastTsRef.current && startTsRef.current != null
          ? (lastTsRef.current - startTsRef.current) / 1000
          : 0;
      const k = e.key;
      if (k === "ArrowLeft" || k === "[") {
        e.preventDefault();
        permAutoRef.current = false;
        permRef.current = Math.max(0, permRef.current - 0.08);
        setPermUi(permRef.current);
        setAutoUi(false);
      } else if (k === "ArrowRight" || k === "]") {
        e.preventDefault();
        permAutoRef.current = false;
        permRef.current = Math.min(1, permRef.current + 0.08);
        setPermUi(permRef.current);
        setAutoUi(false);
      } else if (k === " ") {
        e.preventDefault();
        foodAutoRef.current = false;
        feedRef.current = feedRef.current === "L" ? "R" : "L";
        setFeedUi(feedRef.current);
        setAutoUi(false);
      } else if (k >= "1" && k <= "8") {
        e.preventDefault();
        foodAutoRef.current = false;
        setAutoUi(false);
        placeFood(feedRef.current, Number(k) - 1, now);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, placeFood]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (backendRef.current) { backendRef.current.destroy(); backendRef.current = null; }
      if (audioRef.current) { audioRef.current.stop(); audioRef.current = null; }
    };
  }, []);

  const permPct = Math.round(permUi * 100);
  const connPct = Math.round(connUi * 100);
  const coupleWord = connUi > 0.55 ? "call-and-response" : connUi > 0.25 ? "entraining" : "counterpoint";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Membrane
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Two Physarum swarms forage in two adjacent fields split by a permeable
            membrane. How much each can hear the other across it decides whether
            their two voices lock into call-and-response or drift into counterpoint.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* Idle / start */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="max-w-md text-base text-muted-foreground">
            Start the two swarms. A seeded autopilot sweeps the membrane
            permeability from closed to open and back and plants food, so you can
            watch and hear the coupling evolve hands-off — then take the keyboard.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start the membrane
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            Keyboard only: ←/→ (or [ ]) open/close the membrane · 1–8 plant food ·
            Space switches the field you feed.
          </p>
          {error && <p className="max-w-sm text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {backendKind === "webgpu" ? "webgpu · compute" : "canvas2d · cpu fallback"}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            permeability {permPct}%
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            connectivity {connPct}% · {coupleWord}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            feeding {feedUi === "L" ? "left" : "right"} · {autoUi ? "autopilot" : "you"}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
          <button
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        </div>
      )}

      {/* Keyboard legend */}
      {phase === "running" && !showNotes && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-6 max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="text-foreground">←/→ or [ ]</span> membrane permeability ·{" "}
            <span className="text-foreground">1–8</span> plant food ·{" "}
            <span className="text-foreground">space</span> switch field
          </p>
        </div>
      )}

      {/* Design notes overlay */}
      {phase === "running" && showNotes && (
        <div className="absolute inset-x-0 bottom-24 mx-6 max-w-xl rounded-lg border border-border bg-background/85 p-5 backdrop-blur">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            how it couples
          </p>
          <p className="mt-2 text-base text-foreground">
            Left field is swarm L (cooler violet), right is swarm R (warmer). Each
            forages its own trail field. A permeability-scaled fraction of each
            swarm&apos;s density leaks across the central membrane and becomes a faint
            attractant in the other&apos;s field. Open the membrane (→) and both grow
            toward it; the measured cross-membrane connectivity rises, and voice R
            (panned right) bends toward a just interval of voice L (panned left) and
            answers it in antiphase — call-and-response. Close it (←) and each
            forages alone, the voices unlock and drift into independent counterpoint.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Physarum transport model (Jones 2010); emergent call-and-response from
            coupled agents after &quot;The Agentic Symphony&quot; (Sundar, ADCx India 2026)
            and MusicSwarm (Buehler 2026, arXiv:2509.11973). A v2 of 3552-forage.
            Full write-up in README.
          </p>
        </div>
      )}
    </div>
  );
}
