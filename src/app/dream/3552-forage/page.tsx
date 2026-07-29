"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 3552 · Forage
//
//   ONE QUESTION
//   What if you don't PLAY an instrument and don't WITNESS one — but CULTIVATE
//   a living, autonomous swarm that composes a long-form piece on its own, and
//   your only verb is to seed where it grows?
//
//   You never play a note. You tap to place FOOD ATTRACTORS. Thousands of
//   Physarum (slime-mould) agents forage toward that food — each one senses the
//   chemo-trail ahead, turns toward the strongest, moves, and deposits its own
//   trail; the field diffuses and decays. From that ONE rule a transport network
//   self-organises: tubes thicken between food, redundant paths get pruned, the
//   topology continuously reorganises. The network SINGS its own topology:
//     • local trail density at a food node  → that voice's presence/amplitude
//     • total trail mass / active agents     → overall density + filter brightness
//     • a thick tube bridging two nodes      → a shared harmonic interval between
//                                              their two voices (topology = harmony)
//   Food slowly exhausts, so what you planted keeps evolving after you stop:
//   minute 5 does not sound like minute 1. Long-form, generative, two-way.
//
//   SUBSTRATE  WebGPU compute (agent sim + trail diffuse/decay + async readback
//   probe for sonification), with a mandatory Canvas2D CPU fallback running the
//   IDENTICAL agent model at reduced agent count. Sonification runs in BOTH.
//
//   REFS  MusicSwarm (Buehler 2026, arXiv:2509.11973); "Swarm-Inspired Generation
//   of Collective Behaviors in Graph Dynamical Systems" (arXiv:2606.24958, 2026);
//   Jones 2010, "Characteristics of pattern formation and evolution in
//   approximations of Physarum transport networks". See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Tunables ────────────────────────────────────────────────────────────────

const MAX_NODES = 6; // food attractors == resource-node voices
const N_PAIRS = 15; // C(6,2)

const GPU_GRID = 512;
const GPU_AGENTS = 65536;
const CPU_GRID = 240;
const CPU_AGENTS = 2600;

const FIXED = 1024; // fixed-point scale for GPU atomic trail buffer
const FOOD_HALF_LIFE = 42; // seconds — food strength decays; tubes then prune

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

function pairIndexOf(i: number, j: number): number {
  // upper-triangular index for 6 nodes
  const a = Math.min(i, j);
  const b = Math.max(i, j);
  let idx = 0;
  for (let r = 0; r < a; r++) idx += MAX_NODES - 1 - r;
  return idx + (b - a - 1);
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface Food {
  x: number; // 0..1 field coords
  y: number;
  strength: number; // 0..1, decays
  bornAt: number; // seconds
  degree: number; // scale-degree seed for its voice
  active: boolean;
}

interface Readout {
  density: Float32Array; // [MAX_NODES] local trail density at each node
  conn: Float32Array; // [N_PAIRS] tube density along each node-pair segment
  mass: number; // total network trail mass proxy (brightness driver)
}

interface StepParams {
  now: number; // seconds
  foods: Food[];
  motionScale: number; // reduced-motion damping
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
  gridW: u32, gridH: u32, nAgents: u32, nFoods: u32,
  frame: f32, decay: f32, moveSpd: f32, senseDist: f32,
  senseAngle: f32, turnSpd: f32, deposit: f32, motion: f32,
};
`;

const DIFFUSE_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;
@group(0) @binding(3) var<uniform> foods: array<vec4f, 6>;

fn at(x: i32, y: i32) -> f32 {
  let W = i32(P.gridW); let H = i32(P.gridH);
  let xx = ((x % W) + W) % W;
  let yy = ((y % H) + H) % H;
  return f32(src[u32(yy * W + xx)]) / ${FIXED}.0;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.gridW || gid.y >= P.gridH) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  // 3x3 box blur
  var s = 0.0;
  s += at(x-1,y-1)+at(x,y-1)+at(x+1,y-1);
  s += at(x-1,y  )+at(x,y  )+at(x+1,y  );
  s += at(x-1,y+1)+at(x,y+1)+at(x+1,y+1);
  var v = (s / 9.0) * P.decay;

  // food wells deposit continuously — bright chemo-sources agents forage toward
  let fx = f32(x); let fy = f32(y);
  for (var k = 0u; k < P.nFoods; k++) {
    let f = foods[k];
    if (f.z <= 0.001) { continue; }
    let dx = fx - f.x; let dy = fy - f.y;
    let d2 = dx*dx + dy*dy;
    let r2 = f.w * f.w;
    v += f.z * 6.0 * exp(-d2 / r2);
  }
  dst[u32(y * i32(P.gridW) + x)] = u32(clamp(v, 0.0, 4000000.0) * ${FIXED}.0);
}
`;

const AGENT_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
struct Agent { pos: vec2f, ang: f32, pad: f32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read_write> field: array<atomic<u32>>;

fn hash11(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }

fn sampleField(pos: vec2f) -> f32 {
  let W = i32(P.gridW); let H = i32(P.gridH);
  let xx = ((i32(pos.x) % W) + W) % W;
  let yy = ((i32(pos.y) % H) + H) % H;
  return f32(atomicLoad(&field[u32(yy * W + xx)])) / ${FIXED}.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.nAgents) { return; }
  var a = agents[i];

  let sd = P.senseDist;
  let fwd = vec2f(cos(a.ang), sin(a.ang));
  let lft = vec2f(cos(a.ang + P.senseAngle), sin(a.ang + P.senseAngle));
  let rgt = vec2f(cos(a.ang - P.senseAngle), sin(a.ang - P.senseAngle));

  let cF = sampleField(a.pos + fwd * sd);
  let cL = sampleField(a.pos + lft * sd);
  let cR = sampleField(a.pos + rgt * sd);

  let rnd = hash11(f32(i) * 0.017 + P.frame * 0.13);
  var turn = 0.0;
  if (cF >= cL && cF >= cR) {
    turn = 0.0;
  } else if (cL > cR) {
    turn = P.turnSpd;
  } else if (cR > cL) {
    turn = -P.turnSpd;
  } else {
    turn = (rnd - 0.5) * P.turnSpd * 2.0;
  }
  a.ang += turn;

  let dir = vec2f(cos(a.ang), sin(a.ang));
  var np = a.pos + dir * P.moveSpd * P.motion;

  let W = f32(P.gridW); let H = f32(P.gridH);
  // wrap toroidally
  if (np.x < 0.0) { np.x += W; a.ang += (rnd - 0.5); }
  if (np.x >= W) { np.x -= W; }
  if (np.y < 0.0) { np.y += H; }
  if (np.y >= H) { np.y -= H; }
  np.x = np.x - floor(np.x / W) * W;
  np.y = np.y - floor(np.y / H) * H;
  a.pos = np;
  agents[i] = a;

  // deposit
  let ci = u32(i32(np.y) * i32(P.gridW) + i32(np.x));
  atomicAdd(&field[ci], u32(P.deposit * ${FIXED}.0));
}
`;

const RENDER_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<uniform> foods: array<vec4f, 6>;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VO {
  var c = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let xy = c[vi];
  return VO(vec4f(xy, 0.0, 1.0), vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5));
}

fn cell(x: i32, y: i32) -> f32 {
  let W = i32(P.gridW); let H = i32(P.gridH);
  let xx = ((x % W) + W) % W;
  let yy = ((y % H) + H) % H;
  return f32(field[u32(yy * W + xx)]) / ${FIXED}.0;
}

// violet ramp (Resonance accent) — art layer only
fn ramp(t: f32) -> vec3f {
  let deep    = vec3f(0.043, 0.027, 0.075);
  let indigo  = vec3f(0.388, 0.400, 0.945);
  let violet  = vec3f(0.545, 0.361, 0.965);
  let magenta = vec3f(0.690, 0.263, 0.878);
  let light   = vec3f(0.878, 0.820, 1.000);
  let u = clamp(t, 0.0, 1.0);
  if (u < 0.30) { return mix(deep, indigo, u / 0.30); }
  if (u < 0.60) { return mix(indigo, violet, (u - 0.30) / 0.30); }
  if (u < 0.82) { return mix(violet, magenta, (u - 0.60) / 0.22); }
  return mix(magenta, light, (u - 0.82) / 0.18);
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let gx = v.uv.x * f32(P.gridW) - 0.5;
  let gy = v.uv.y * f32(P.gridH) - 0.5;
  let x0 = i32(floor(gx)); let y0 = i32(floor(gy));
  let fx = gx - f32(x0); let fy = gy - f32(y0);
  let a = mix(cell(x0,y0), cell(x0+1,y0), fx);
  let b = mix(cell(x0,y0+1), cell(x0+1,y0+1), fx);
  var val = mix(a, b, fy);

  // slow luminance drift (<=0.2 Hz), no strobe
  let drift = 0.86 + 0.14 * sin(P.frame * 0.016 * 0.6);
  let lum = (1.0 - exp(-val * 0.11)) * drift;
  var col = ramp(pow(lum, 0.85));

  // food wells: soft bright markers so you see where you planted
  for (var k = 0u; k < P.nFoods; k++) {
    let f = foods[k];
    if (f.z <= 0.001) { continue; }
    let dx = gx - f.x; let dy = gy - f.y;
    let d2 = dx*dx + dy*dy;
    let g = exp(-d2 / (36.0)) * f.z;
    col += vec3f(0.55, 0.42, 0.85) * g * 0.9;
  }
  return vec4f(col, 1.0);
}
`;

const REDUCE_WGSL = /* wgsl */ `
${SIM_UNIFORMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<uniform> foods: array<vec4f, 6>;
@group(0) @binding(3) var<storage, read_write> outv: array<f32>;

fn cellv(x: i32, y: i32) -> f32 {
  let W = i32(P.gridW); let H = i32(P.gridH);
  let xx = ((x % W) + W) % W;
  let yy = ((y % H) + H) % H;
  return f32(field[u32(yy * W + xx)]) / ${FIXED}.0;
}

// out layout: [0..6) node density, [6..21) pair conn, [21] mass proxy
@compute @workgroup_size(32)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  if (t < 6u) {
    // node local density: disk sum radius 7
    let f = foods[t];
    var s = 0.0;
    if (f.z > 0.001) {
      let cx = i32(f.x); let cy = i32(f.y);
      for (var dy = -7; dy <= 7; dy++) {
        for (var dx = -7; dx <= 7; dx++) {
          if (dx*dx + dy*dy <= 49) { s += cellv(cx+dx, cy+dy); }
        }
      }
    }
    outv[t] = s;
  } else if (t < 21u) {
    // pair conn: sample along segment between the two foods
    let pi = t - 6u;
    // decode upper-triangular pair index -> (a,b)
    var a = 0u; var rem = pi; var span = 5u;
    loop {
      if (rem < span) { break; }
      rem = rem - span; a = a + 1u; span = span - 1u;
    }
    let b = a + 1u + rem;
    let fa = foods[a]; let fb = foods[b];
    var s = 0.0;
    if (fa.z > 0.001 && fb.z > 0.001) {
      let steps = 24;
      for (var k = 1; k < steps; k++) {
        let tt = f32(k) / f32(steps);
        let px = mix(fa.x, fb.x, tt);
        let py = mix(fa.y, fb.y, tt);
        // min density along a short perpendicular window (a real tube must be continuous)
        var mn = 1.0e9;
        for (var w = -1; w <= 1; w++) {
          let v = cellv(i32(px) + w, i32(py) + w);
          if (v < mn) { mn = v; }
        }
        s += mn;
      }
      s = s / f32(steps - 1);
    }
    outv[t] = s;
  } else if (t == 21u) {
    // coarse mass proxy: sparse grid sample
    var s = 0.0;
    let W = i32(P.gridW); let H = i32(P.gridH);
    var y = 0; loop {
      if (y >= H) { break; }
      var x = 0; loop {
        if (x >= W) { break; }
        s += cellv(x, y);
        x = x + 16;
      }
      y = y + 16;
    }
    outv[21] = s;
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

  const W = GPU_GRID;
  const H = GPU_GRID;
  const cells = W * H;

  // two trail buffers (ping-pong) as u32 fixed-point
  const mkField = () =>
    device.createBuffer({
      size: cells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  const fieldA = mkField();
  const fieldB = mkField();
  device.queue.writeBuffer(fieldA, 0, new Uint32Array(cells).buffer as ArrayBuffer);
  device.queue.writeBuffer(fieldB, 0, new Uint32Array(cells).buffer as ArrayBuffer);

  // agents
  const agentData = new Float32Array(GPU_AGENTS * 4);
  for (let i = 0; i < GPU_AGENTS; i++) {
    // seed near centre so the network has to grow outward toward food
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.18;
    agentData[i * 4 + 0] = (0.5 + Math.cos(ang) * r) * W;
    agentData[i * 4 + 1] = (0.5 + Math.sin(ang) * r) * H;
    agentData[i * 4 + 2] = rng() * Math.PI * 2;
    agentData[i * 4 + 3] = 0;
  }
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData.buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const foodsBuf = device.createBuffer({
    size: 6 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const outBuf = device.createBuffer({
    size: 32 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const staging = [0, 1].map(() =>
    device.createBuffer({
      size: 32 * 4,
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

  let parity = 0; // 0: src=A dst=B ; agents/render on dst
  const readCur: Readout = {
    density: new Float32Array(MAX_NODES),
    conn: new Float32Array(N_PAIRS),
    mass: 0,
  };

  function writeParams(P: StepParams, frame: number) {
    const buf = new ArrayBuffer(48);
    const u = new Uint32Array(buf);
    const f = new Float32Array(buf);
    u[0] = W; u[1] = H; u[2] = GPU_AGENTS; u[3] = P.foods.length;
    f[4] = frame;
    f[5] = 0.90; // decay
    f[6] = 1.0; // moveSpd (grid units)
    f[7] = 9.0; // senseDist
    f[8] = 0.45; // senseAngle
    f[9] = 0.38; // turnSpd
    f[10] = 5.0; // deposit
    f[11] = P.motionScale; // motion
    device.queue.writeBuffer(paramsBuf, 0, buf);

    const fd = new Float32Array(6 * 4);
    for (let k = 0; k < P.foods.length; k++) {
      const fo = P.foods[k];
      fd[k * 4 + 0] = fo.x * W;
      fd[k * 4 + 1] = fo.y * H;
      fd[k * 4 + 2] = fo.strength;
      fd[k * 4 + 3] = 22.0; // radius
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

    // 1. diffuse + decay + food deposit  (src -> dst)
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
      pass.dispatchWorkgroups(Math.ceil(W / 8), Math.ceil(H / 8));
      pass.end();
    }
    // 2. agents sense dst + deposit into dst
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
    // 3. reduce (topology readout) from dst
    {
      const bg = device.createBindGroup({
        layout: reducePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: foodsBuf } },
          { binding: 3, resource: { buffer: outBuf } },
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
          clearValue: { r: 0.016, g: 0.011, b: 0.03, a: 1 },
        }],
      });
      pass.setPipeline(renderPl);
      pass.setBindGroup(0, bg);
      pass.draw(4);
      pass.end();
    }

    // copy readout into a free staging buffer (only every 2nd frame to relieve bus)
    let probeSlot = -1;
    if (frame % 2 === 0) {
      probeSlot = freeStagingSlot();
      if (probeSlot >= 0) {
        enc.copyBufferToBuffer(outBuf, 0, staging[probeSlot], 0, 32 * 4);
      }
    }

    device.queue.submit([enc.finish()]);
    parity ^= 1;

    // AFTER submit: map the staging buffer we just copied into, read it back async
    if (probeSlot >= 0) {
      stagingBusy[probeSlot] = true;
      const buf = staging[probeSlot];
      buf.mapAsync(GPUMapMode.READ).then(() => {
        const arr = new Float32Array(buf.getMappedRange().slice(0));
        buf.unmap();
        for (let i = 0; i < MAX_NODES; i++) readCur.density[i] = arr[i];
        for (let i = 0; i < N_PAIRS; i++) readCur.conn[i] = arr[6 + i];
        readCur.mass = arr[21];
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

// ── CPU (Canvas2D) backend — identical agent model, fewer agents ──────────────

function makeCpuBackend(canvas: HTMLCanvasElement, rng: () => number): Backend {
  const W = CPU_GRID;
  const H = CPU_GRID;
  const cells = W * H;
  let fieldA = new Float32Array(cells);
  let fieldB = new Float32Array(cells);

  const ax = new Float32Array(CPU_AGENTS);
  const ay = new Float32Array(CPU_AGENTS);
  const aa = new Float32Array(CPU_AGENTS);
  for (let i = 0; i < CPU_AGENTS; i++) {
    const ang = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 0.18;
    ax[i] = (0.5 + Math.cos(ang) * r) * W;
    ay[i] = (0.5 + Math.sin(ang) * r) * H;
    aa[i] = rng() * Math.PI * 2;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const off = document.createElement("canvas");
  off.width = W; off.height = H;
  const offCtx = off.getContext("2d", { willReadFrequently: true })!;
  const img = offCtx.createImageData(W, H);

  const readCur: Readout = {
    density: new Float32Array(MAX_NODES),
    conn: new Float32Array(N_PAIRS),
    mass: 0,
  };

  const DECAY = 0.90;
  const SENSE = 8;
  const SENSE_ANG = 0.45;
  const TURN = 0.38;
  const DEPOSIT = 5.0;
  let frame = 0;

  function wrapI(v: number, m: number): number {
    const r = v % m;
    return r < 0 ? r + m : r;
  }
  function at(f: Float32Array, x: number, y: number): number {
    return f[wrapI(y, H) * W + wrapI(x, W)];
  }

  // violet ramp for CPU render
  function ramp(t: number): [number, number, number] {
    const stops: [number, number, number][] = [
      [11, 7, 19], [99, 102, 241], [139, 92, 246], [176, 67, 224], [224, 209, 255],
    ];
    const u = Math.min(0.999, Math.max(0, t)) * (stops.length - 1);
    const i = Math.floor(u);
    const f = u - i;
    const a = stops[i];
    const b = stops[Math.min(stops.length - 1, i + 1)];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  const step = (P: StepParams) => {
    frame += 1;
    // 1. diffuse + decay + food deposit  (fieldA -> fieldB)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        s += at(fieldA, x - 1, y - 1) + at(fieldA, x, y - 1) + at(fieldA, x + 1, y - 1);
        s += at(fieldA, x - 1, y) + at(fieldA, x, y) + at(fieldA, x + 1, y);
        s += at(fieldA, x - 1, y + 1) + at(fieldA, x, y + 1) + at(fieldA, x + 1, y + 1);
        let v = (s / 9) * DECAY;
        for (let k = 0; k < P.foods.length; k++) {
          const fo = P.foods[k];
          if (fo.strength <= 0.001) continue;
          const dx = x - fo.x * W;
          const dy = y - fo.y * H;
          const r2 = 22 * 22 * (W / GPU_GRID) * (W / GPU_GRID);
          v += fo.strength * 6 * Math.exp(-(dx * dx + dy * dy) / r2);
        }
        fieldB[y * W + x] = v;
      }
    }
    // 2. agents on fieldB
    for (let i = 0; i < CPU_AGENTS; i++) {
      const px = ax[i], py = ay[i], an = aa[i];
      const fx = Math.cos(an), fy = Math.sin(an);
      const lx = Math.cos(an + SENSE_ANG), ly = Math.sin(an + SENSE_ANG);
      const rx = Math.cos(an - SENSE_ANG), ry = Math.sin(an - SENSE_ANG);
      const cF = at(fieldB, (px + fx * SENSE) | 0, (py + fy * SENSE) | 0);
      const cL = at(fieldB, (px + lx * SENSE) | 0, (py + ly * SENSE) | 0);
      const cR = at(fieldB, (px + rx * SENSE) | 0, (py + ry * SENSE) | 0);
      let na = an;
      const rnd = rng();
      if (cF >= cL && cF >= cR) { /* keep */ }
      else if (cL > cR) na += TURN;
      else if (cR > cL) na -= TURN;
      else na += (rnd - 0.5) * TURN * 2;
      const dx = Math.cos(na), dy = Math.sin(na);
      let nx = px + dx * P.motionScale;
      let ny = py + dy * P.motionScale;
      nx = wrapI(nx, W); ny = wrapI(ny, H);
      ax[i] = nx; ay[i] = ny; aa[i] = na;
      fieldB[(ny | 0) * W + (nx | 0)] += DEPOSIT;
    }
    // swap
    const tmp = fieldA; fieldA = fieldB; fieldB = tmp;

    // 3. topology readout from fieldA (freshest)
    let mass = 0;
    for (let i = 0; i < cells; i += 16) mass += fieldA[i];
    readCur.mass = mass;
    for (let k = 0; k < P.foods.length; k++) {
      const fo = P.foods[k];
      let s = 0;
      if (fo.strength > 0.001) {
        const cx = (fo.x * W) | 0, cy = (fo.y * H) | 0;
        for (let dy = -7; dy <= 7; dy++)
          for (let dx = -7; dx <= 7; dx++)
            if (dx * dx + dy * dy <= 49) s += at(fieldA, cx + dx, cy + dy);
      }
      readCur.density[k] = s;
    }
    for (let a = 0; a < MAX_NODES; a++) {
      for (let b = a + 1; b < MAX_NODES; b++) {
        const pi = pairIndexOf(a, b);
        const fa = P.foods[a], fb = P.foods[b];
        let s = 0;
        if (fa && fb && fa.strength > 0.001 && fb.strength > 0.001) {
          const steps = 24;
          for (let k = 1; k < steps; k++) {
            const tt = k / steps;
            const pxx = (fa.x + (fb.x - fa.x) * tt) * W;
            const pyy = (fa.y + (fb.y - fa.y) * tt) * H;
            let mn = 1e9;
            for (let w = -1; w <= 1; w++) {
              const v = at(fieldA, (pxx | 0) + w, (pyy | 0) + w);
              if (v < mn) mn = v;
            }
            s += mn;
          }
          s /= steps - 1;
        }
        readCur.conn[pi] = s;
      }
    }

    // 4. render fieldA -> offscreen -> canvas
    const drift = 0.86 + 0.14 * Math.sin(frame * 0.016 * 0.6);
    const d = img.data;
    for (let p = 0; p < cells; p++) {
      const val = fieldA[p];
      const lum = (1 - Math.exp(-val * 0.11)) * drift;
      const [r, g, bl] = ramp(Math.pow(Math.min(1, lum), 0.85));
      d[p * 4 + 0] = r; d[p * 4 + 1] = g; d[p * 4 + 2] = bl; d[p * 4 + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    // food markers
    for (let k = 0; k < P.foods.length; k++) {
      const fo = P.foods[k];
      if (fo.strength <= 0.001) continue;
      offCtx.beginPath();
      offCtx.fillStyle = `rgba(196,181,253,${0.35 * fo.strength})`;
      offCtx.arc(fo.x * W, fo.y * H, 3, 0, Math.PI * 2);
      offCtx.fill();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  };

  const destroy = () => { /* GC; canvases released with node */ };

  return { kind: "cpu", step, readout: () => readCur, destroy };
}

// ── Sonification — the network sings its topology ─────────────────────────────

// modes as ratio sets over an octave (continuous pitch — never hard-snapped)
const DORIAN = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 5 / 3, 9 / 5];
const LYDIAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 5 / 3, 15 / 8];
const JUST = [1, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

function nearestJust(r: number): number {
  // fold into one octave, snap to nearest just interval, restore octave
  let oct = 0;
  let x = r;
  while (x >= 2) { x /= 2; oct++; }
  while (x < 1) { x *= 2; oct--; }
  let best = JUST[0], bd = Infinity;
  for (const j of JUST) { const dd = Math.abs(j - x); if (dd < bd) { bd = dd; best = j; } }
  return best * Math.pow(2, oct);
}

interface Voice {
  osc: OscillatorNode;
  warm: OscillatorNode;
  gain: GainNode;
  curFreq: number;
}

class SwarmAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private voices: Voice[] = [];
  private root = 130.81; // ~C3
  private modeMix = 0; // 0..1 dorian->lydian, drifts
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(this.filter);
    this.filter.connect(comp);
    comp.connect(ctx.destination);

    for (let i = 0; i < MAX_NODES; i++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      const warm = ctx.createOscillator();
      warm.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.frequency.value = this.root;
      warm.frequency.value = this.root * 0.5;
      osc.connect(gain);
      warm.connect(gain);
      gain.connect(this.master);
      this.voices.push({ osc, warm, gain, curFreq: this.root });
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.voices.forEach((v) => { v.osc.start(t); v.warm.start(t); });
    this.master.gain.setTargetAtTime(0.32, t, 1.2);
  }

  private degreeFreq(degree: number): number {
    const dor = DORIAN;
    const lyd = LYDIAN;
    const idx = degree % dor.length;
    const oct = Math.floor(degree / dor.length) % 3; // spread 3 octaves
    const ratio = dor[idx] * (1 - this.modeMix) + lyd[idx % lyd.length] * this.modeMix;
    return this.root * ratio * Math.pow(2, oct);
  }

  // called each frame
  update(readout: Readout, foods: Food[], now: number, dt: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // slow harmonic-field rotation (<0.05 Hz): root transpose + mode morph
    this.modeMix = 0.5 + 0.5 * Math.sin(now * 0.021);
    const rootTarget = 130.81 * Math.pow(2, Math.round(Math.sin(now * 0.013) * 2) / 12);
    this.root += (rootTarget - this.root) * Math.min(1, dt * 0.4);

    // overall density / brightness from network mass + active agents proxy
    const massNorm = Math.min(1, readout.mass / 4000);
    const cutoff = 320 + massNorm * 2600;
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.4);
    this.master.gain.setTargetAtTime(0.18 + massNorm * 0.28, t, 0.6);

    // per-voice base field pitch
    const fieldFreq: number[] = [];
    for (let i = 0; i < MAX_NODES; i++) {
      const fo = foods[i];
      fieldFreq[i] = fo ? this.degreeFreq(fo.degree) : this.root;
    }

    // connection bends: a thick tube between i & j introduces a shared interval.
    // higher node index bends toward a just interval of the lower's field pitch.
    const bend = fieldFreq.slice();
    let maxConn = 1e-6;
    for (let p = 0; p < N_PAIRS; p++) maxConn = Math.max(maxConn, readout.conn[p]);
    for (let a = 0; a < MAX_NODES; a++) {
      for (let b = a + 1; b < MAX_NODES; b++) {
        const c = readout.conn[pairIndexOf(a, b)] / maxConn; // 0..1
        if (c < 0.25) continue;
        const strength = Math.min(1, (c - 0.25) / 0.75);
        const target = nearestJust(fieldFreq[b] / fieldFreq[a]) * fieldFreq[a];
        bend[b] = bend[b] * (1 - strength * 0.85) + target * (strength * 0.85);
      }
    }

    // apply per voice
    for (let i = 0; i < MAX_NODES; i++) {
      const v = this.voices[i];
      const fo = foods[i];
      const present = fo ? Math.min(1, readout.density[i] / 260) * fo.strength : 0;
      // gentle vibrato keeps pitch continuous & alive
      const vib = 1 + Math.sin(now * (0.7 + i * 0.13) + i) * 0.0018;
      const freq = bend[i] * vib;
      v.curFreq += (freq - v.curFreq) * Math.min(1, dt * 1.5);
      v.osc.frequency.setTargetAtTime(v.curFreq, t, 0.08);
      v.warm.frequency.setTargetAtTime(v.curFreq * 0.5, t, 0.12);
      v.gain.gain.setTargetAtTime(present * 0.5, t, 0.25);
    }
  }

  async stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.3);
    await new Promise((r) => setTimeout(r, 400));
    this.voices.forEach((v) => { try { v.osc.stop(); v.warm.stop(); } catch { /* */ } });
    try { await this.ctx.close(); } catch { /* */ }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";
type Controller = "auto" | "you";

export default function ForagePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backendKind, setBackendKind] = useState<"webgpu" | "cpu" | null>(null);
  const [controller, setController] = useState<Controller>("auto");
  const [error, setError] = useState<string | null>(null);
  const [foodCount, setFoodCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<Backend | null>(null);
  const audioRef = useRef<SwarmAudio | null>(null);
  const foodsRef = useRef<Food[]>([]);
  const rafRef = useRef(0);
  const rngRef = useRef<() => number>(makeRng(0x3552f0));
  const startTsRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const controllerRef = useRef<Controller>("auto");
  const autopilotIdxRef = useRef(0);
  const reducedRef = useRef(false);

  const placeFood = useCallback((x: number, y: number, now: number) => {
    const rng = rngRef.current;
    const foods = foodsRef.current;
    const degree = Math.floor(rng() * 12);
    const food: Food = { x, y, strength: 1, bornAt: now, degree, active: true };
    if (foods.length < MAX_NODES) {
      foods.push(food);
    } else {
      // recycle the weakest slot so cap holds at MAX_NODES
      let wi = 0;
      for (let i = 1; i < foods.length; i++) if (foods[i].strength < foods[wi].strength) wi = i;
      foods[wi] = food;
    }
    setFoodCount(foods.length);
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

    // AudioContext MUST be created inside the user gesture
    let audioCtx: AudioContext;
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    audioRef.current = new SwarmAudio(audioCtx);
    audioRef.current.start();

    // fresh deterministic PRNG per run
    rngRef.current = makeRng(0x3552f0);
    foodsRef.current = [];
    autopilotIdxRef.current = 0;
    controllerRef.current = "auto";
    setController("auto");
    startTsRef.current = null;

    // build backend — WebGPU primary, Canvas2D fallback
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

    // seed 3 food attractors so the network has something to grow toward at once
    const rng = rngRef.current;
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + rng() * 0.6;
      placeFood(0.5 + Math.cos(ang) * 0.28, 0.5 + Math.sin(ang) * 0.28, 0);
    }

    // seeded autopilot: places the remaining food over ~10..40s (hands-off demo)
    const autoTimes = [10, 20, 30, 40];
    const autoPos = autoTimes.map(() => [rng(), rng()] as [number, number]);

    const loop = (ts: number) => {
      const backend = backendRef.current;
      const audio = audioRef.current;
      if (!backend || !audio) return;
      if (startTsRef.current == null) startTsRef.current = ts;
      const elapsed = (ts - startTsRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTsRef.current) / 1000));
      lastTsRef.current = ts;

      // autopilot placement (only while it still holds control)
      if (controllerRef.current === "auto") {
        while (
          autopilotIdxRef.current < autoTimes.length &&
          elapsed >= autoTimes[autopilotIdxRef.current]
        ) {
          const k = autopilotIdxRef.current;
          const [rx, ry] = autoPos[k];
          placeFood(0.14 + rx * 0.72, 0.14 + ry * 0.72, elapsed);
          autopilotIdxRef.current += 1;
        }
      }

      // food strength decay -> tubes prune -> long-form evolution
      const foods = foodsRef.current;
      const lambda = Math.LN2 / FOOD_HALF_LIFE;
      for (const f of foods) {
        const age = elapsed - f.bornAt;
        f.strength = Math.max(0, Math.exp(-lambda * age));
      }

      const motionScale = reducedRef.current ? 0.5 : 1.0;
      backend.step({ now: elapsed, foods, motionScale });
      audio.update(backend.readout(), foods, elapsed, dt);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [placeFood]);

  const stop = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    if (backendRef.current) { backendRef.current.destroy(); backendRef.current = null; }
    if (audioRef.current) { await audioRef.current.stop(); audioRef.current = null; }
    foodsRef.current = [];
    setFoodCount(0);
    setPhase("idle");
  }, []);

  // canvas interaction — first human tap hands control over from autopilot
  const onCanvasPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (controllerRef.current === "auto") {
      controllerRef.current = "you";
      setController("you");
    }
    // time is derived from the rAF clock only (last frame timestamp minus start)
    const elapsed =
      lastTsRef.current && startTsRef.current != null
        ? (lastTsRef.current - startTsRef.current) / 1000
        : 0;
    placeFood(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)), elapsed);
  }, [phase, placeFood]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (backendRef.current) { backendRef.current.destroy(); backendRef.current = null; }
      if (audioRef.current) { audioRef.current.stop(); audioRef.current = null; }
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointer}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: phase === "running" ? "crosshair" : "default" }}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Forage
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            You don&apos;t play it. You seed where it grows — a Physarum swarm forages
            toward the food you plant, and the transport network it self-organises
            sings its own topology.
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
            Start the swarm. A seeded autopilot plants a few food attractors over the
            first ~40 seconds so you can watch the network grow and hear it compose —
            then your first tap hands control to you.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start foraging
          </button>
          {error && <p className="max-w-sm text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {backendKind === "webgpu" ? "webgpu · compute" : "canvas2d · cpu fallback"}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            control: {controller === "auto" ? "auto-demo" : "you"}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            food: {foodCount}/{MAX_NODES}
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

      {/* Design notes overlay */}
      {phase === "running" && showNotes && (
        <div className="absolute inset-x-0 bottom-24 mx-6 max-w-xl rounded-lg border border-border bg-background/85 p-5 backdrop-blur">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            how it sings
          </p>
          <p className="mt-2 text-base text-foreground">
            Tap the field to plant food. Thousands of agents sense the chemo-trail
            ahead, turn toward the strongest, move and deposit — the field diffuses
            and decays. Local trail density at each food is that voice&apos;s presence;
            a thick tube bridging two foods introduces a shared harmonic interval
            between their voices; total trail mass sets brightness. Food slowly
            exhausts, so tubes prune and the piece keeps evolving after you stop.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Physarum transport model (Jones 2010); stigmergic long-form form after
            MusicSwarm arXiv:2509.11973 / arXiv:2606.24958. Full write-up in README.
          </p>
        </div>
      )}
    </div>
  );
}
