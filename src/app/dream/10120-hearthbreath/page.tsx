"use client";

/*
 * Hearthbreath — a bed of coals you keep alive with your own breath.
 *
 * The coals are a real combustion-front cellular automaton (Drossel & Schwabl
 * forest-fire lineage): each cell carries FUEL, TEMPERATURE and CHAR. Heat
 * diffuses to neighbours, fuel ignites above a threshold and releases heat,
 * spent cells cool to grey ash. The player's breath is the global oxygen /
 * draft: loud breath makes the burn-front travel and roar, silence lets it
 * stall and die to ash. Runs as a WebGPU compute shader with a CPU/Canvas2D
 * fallback that obeys the identical rules.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* @webgpu/types is NOT installed in this repo, so WebGPU handles are untyped.
 * We use one narrowly-named `any` alias rather than hand-rolling a fragile
 * interface surface. eslint-disable-next-line @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wgpu = any;

/* WebGPU flag constants are spec-stable numbers; declaring them here avoids
 * referencing GPUBufferUsage / GPUMapMode globals that TS can't see. */
const BUF_UNIFORM = 0x0040;
const BUF_STORAGE = 0x0080;
const BUF_COPY_SRC = 0x0004;
const BUF_COPY_DST = 0x0008;
const BUF_MAP_READ = 0x0001;
const MAP_READ = 0x0001;

const GPU_N = 256; // GPU grid resolution
const CPU_N = 128; // CPU fallback grid resolution
const IGNITE = 0.42; // ignition temperature threshold
const RING_SECONDS = 20; // record/replay ring-buffer length
const RING_LEN = RING_SECONDS * 60;

/* Deterministic PRNG (mulberry32) seeded with the slug number. No Math.random
 * anywhere — noise buffers, the self-tending ghost breath and crackle jitter
 * all draw from seeded streams. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const WGSL_COMPUTE = /* wgsl */ `
struct Params {
  dims   : vec2<u32>,
  oxygen : f32,
  time   : f32,
  seed   : vec4<f32>, // x, y, radius, active
};
@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read>       src : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> dst : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> counters : array<atomic<u32>>;

fn cell(x : i32, y : i32) -> u32 {
  let w = i32(P.dims.x);
  let h = i32(P.dims.y);
  let cx = clamp(x, 0, w - 1);
  let cy = clamp(y, 0, h - 1);
  return u32(cy * w + cx);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= P.dims.x || gid.y >= P.dims.y) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let c = src[cell(x, y)];
  var fuel = c.x;
  var temp = c.y;
  var char = c.z;

  // Heat diffusion (Laplacian) — this is what makes a front travel.
  let up = src[cell(x, y - 1)].y;
  let dn = src[cell(x, y + 1)].y;
  let lf = src[cell(x - 1, y)].y;
  let rt = src[cell(x + 1, y)].y;
  let lap = up + dn + lf + rt - 4.0 * temp;

  let oxy = clamp(P.oxygen, 0.0, 1.0);
  let prevTemp = temp;
  var nt = temp + 0.16 * lap;

  // Combustion: hot cells with fuel ignite, consume fuel, release heat.
  var ignitedNow = 0u;
  if (nt > ${IGNITE} && fuel > 0.002) {
    let burn = min(fuel, 0.018 + 0.06 * oxy);
    fuel = fuel - burn;
    char = min(char + burn, 1.0);
    nt = nt + burn * 3.2;
    if (prevTemp <= ${IGNITE}) { ignitedNow = 1u; }
  }

  // Radiative cooling — draft (oxygen) slows the cooling.
  let cool = 0.045 * (1.0 - 0.65 * oxy);
  nt = nt - cool * nt - 0.0025;
  nt = max(nt, 0.0);

  // Fresh fuel + spark painted by the player (bellows / dropped log).
  if (P.seed.w > 0.5) {
    let d = distance(vec2<f32>(f32(x), f32(y)), P.seed.xy);
    if (d < P.seed.z) {
      let g = 1.0 - d / P.seed.z;
      fuel = min(1.0, fuel + 0.85 * g);
      nt = max(nt, 0.9 * g + 0.2);
    }
  }

  dst[cell(x, y)] = vec4<f32>(fuel, nt, char, 0.0);
  if (ignitedNow == 1u) { atomicAdd(&counters[0], 1u); }
  if (nt > 0.02) { atomicAdd(&counters[1], u32(nt * 64.0)); }
}
`;

const WGSL_RENDER = /* wgsl */ `
struct RParams { dims : vec2<u32>, glow : f32, pad : f32 };
@group(0) @binding(0) var<uniform> R : RParams;
@group(0) @binding(1) var<storage, read> state : array<vec4<f32>>;

struct VOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var out : VOut;
  out.pos = vec4<f32>(p[vi], 0.0, 1.0);
  out.uv = 0.5 * (p[vi] + vec2<f32>(1.0, 1.0));
  return out;
}

// Warm ember ramp: char grey -> oxblood -> ember red -> orange -> straw ->
// white-hot core. Mapped purely from temperature, blended over ash.
fn ember(temp : f32, char : f32) -> vec3<f32> {
  let t = clamp(temp, 0.0, 1.3);
  let charCol = mix(vec3<f32>(0.05, 0.04, 0.035), vec3<f32>(0.30, 0.26, 0.23), char);
  var col : vec3<f32>;
  if (t < 0.18) {
    col = mix(vec3<f32>(0.03, 0.02, 0.02), vec3<f32>(0.28, 0.05, 0.03), t / 0.18);
  } else if (t < 0.40) {
    col = mix(vec3<f32>(0.28, 0.05, 0.03), vec3<f32>(0.70, 0.13, 0.03), (t - 0.18) / 0.22);
  } else if (t < 0.65) {
    col = mix(vec3<f32>(0.70, 0.13, 0.03), vec3<f32>(0.96, 0.42, 0.06), (t - 0.40) / 0.25);
  } else if (t < 0.90) {
    col = mix(vec3<f32>(0.96, 0.42, 0.06), vec3<f32>(1.00, 0.82, 0.28), (t - 0.65) / 0.25);
  } else {
    col = mix(vec3<f32>(1.00, 0.82, 0.28), vec3<f32>(1.00, 0.98, 0.92), (t - 0.90) / 0.40);
  }
  let heat = smoothstep(0.05, 0.25, t);
  return mix(charCol, col, heat) * (0.85 + 0.15 * R.glow);
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let u = clamp(in.uv, vec2<f32>(0.0), vec2<f32>(0.999));
  let gx = u32(u.x * f32(R.dims.x));
  let gy = u32((1.0 - u.y) * f32(R.dims.y));
  let s = state[gy * R.dims.x + gx];
  return vec4<f32>(ember(s.y, s.z), 1.0);
}
`;

// ── Types shared by both engines ─────────────────────────────────────────────

type SimStats = { heat: number; ignites: number };

type Driver = {
  step: (oxygen: number, seed: [number, number, number, number] | null) => void;
  stats: () => SimStats;
  dims: () => number;
  dispose: () => void;
};

// ── Ember colour ramp (JS mirror of the WGSL for the CPU path) ────────────────

function emberJs(temp: number, char: number, out: number[]): void {
  const t = Math.min(Math.max(temp, 0), 1.3);
  const cr = 0.05 + (0.3 - 0.05) * char;
  const cg = 0.04 + (0.26 - 0.04) * char;
  const cb = 0.035 + (0.23 - 0.035) * char;
  let r: number, g: number, b: number;
  if (t < 0.18) {
    const k = t / 0.18;
    r = 0.03 + (0.28 - 0.03) * k; g = 0.02 + (0.05 - 0.02) * k; b = 0.02 + (0.03 - 0.02) * k;
  } else if (t < 0.4) {
    const k = (t - 0.18) / 0.22;
    r = 0.28 + (0.7 - 0.28) * k; g = 0.05 + (0.13 - 0.05) * k; b = 0.03;
  } else if (t < 0.65) {
    const k = (t - 0.4) / 0.25;
    r = 0.7 + (0.96 - 0.7) * k; g = 0.13 + (0.42 - 0.13) * k; b = 0.03 + (0.06 - 0.03) * k;
  } else if (t < 0.9) {
    const k = (t - 0.65) / 0.25;
    r = 0.96 + (1 - 0.96) * k; g = 0.42 + (0.82 - 0.42) * k; b = 0.06 + (0.28 - 0.06) * k;
  } else {
    const k = (t - 0.9) / 0.4;
    r = 1; g = 0.82 + (0.98 - 0.82) * k; b = 0.28 + (0.92 - 0.28) * k;
  }
  const heat = smooth01(t, 0.05, 0.25);
  out[0] = (cr + (r - cr) * heat) * 255;
  out[1] = (cg + (g - cg) * heat) * 255;
  out[2] = (cb + (b - cb) * heat) * 255;
}

function smooth01(x: number, a: number, b: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// ── Seed the initial fuel bed (shared by both engines) ────────────────────────

function seedBed(n: number, rng: () => number): Float32Array {
  const data = new Float32Array(n * n * 4);
  const cx = n * 0.5;
  const cy = n * 0.62;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const dx = (x - cx) / (n * 0.5);
      const dy = (y - cy) / (n * 0.5);
      const rad = Math.sqrt(dx * dx + dy * dy);
      // Oval bed of fuel, denser in the middle, ragged at the edges.
      const bed = Math.max(0, 1 - rad * 1.15) * (0.6 + 0.4 * rng());
      data[i] = Math.min(0.98, bed); // fuel
      // A small hot heart so a front is already travelling on load.
      const hd = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      data[i + 1] = hd < n * 0.05 ? 0.95 : 0; // temperature
      data[i + 2] = 0; // char
    }
  }
  return data;
}

// ── CPU / Canvas2D driver (fallback, identical rules) ─────────────────────────

function runCpuDriver(canvas: HTMLCanvasElement, rng: () => number): Driver {
  const n = CPU_N;
  let a: Float32Array = seedBed(n, rng);
  let b: Float32Array = new Float32Array(n * n * 4);
  const off = document.createElement("canvas");
  off.width = n;
  off.height = n;
  const octx = off.getContext("2d")!;
  const img = octx.createImageData(n, n);
  const ctx = canvas.getContext("2d")!;
  const col: number[] = [0, 0, 0];
  let statHeat = 0;
  let statIgnites = 0;

  function step(oxygen: number, seed: [number, number, number, number] | null): void {
    const oxy = Math.min(Math.max(oxygen, 0), 1);
    let heatSum = 0;
    let ignites = 0;
    const cool = 0.045 * (1 - 0.65 * oxy);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        let fuel = a[i];
        const temp = a[i + 1];
        let char = a[i + 2];
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < n - 1 ? x + 1 : n - 1;
        const ym = y > 0 ? y - 1 : 0;
        const yp = y < n - 1 ? y + 1 : n - 1;
        const up = a[(ym * n + x) * 4 + 1];
        const dn = a[(yp * n + x) * 4 + 1];
        const lf = a[(y * n + xm) * 4 + 1];
        const rt = a[(y * n + xp) * 4 + 1];
        const lap = up + dn + lf + rt - 4 * temp;
        let nt = temp + 0.16 * lap;
        if (nt > IGNITE && fuel > 0.002) {
          const burn = Math.min(fuel, 0.018 + 0.06 * oxy);
          fuel -= burn;
          char = Math.min(char + burn, 1);
          nt += burn * 3.2;
          if (temp <= IGNITE) ignites++;
        }
        nt = nt - cool * nt - 0.0025;
        if (nt < 0) nt = 0;
        if (seed && seed[3] > 0.5) {
          const dpx = x - seed[0];
          const dpy = y - seed[1];
          const d = Math.sqrt(dpx * dpx + dpy * dpy);
          if (d < seed[2]) {
            const gg = 1 - d / seed[2];
            fuel = Math.min(1, fuel + 0.85 * gg);
            nt = Math.max(nt, 0.9 * gg + 0.2);
          }
        }
        b[i] = fuel;
        b[i + 1] = nt;
        b[i + 2] = char;
        heatSum += nt;
      }
    }
    const tmp = a; a = b; b = tmp;
    statHeat = heatSum / (n * n);
    statIgnites = ignites;
    // draw
    const px = img.data;
    for (let p = 0; p < n * n; p++) {
      emberJs(a[p * 4 + 1], a[p * 4 + 2], col);
      const o = p * 4;
      px[o] = col[0];
      px[o + 1] = col[1];
      px[o + 2] = col[2];
      px[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  return {
    step,
    stats: () => ({ heat: statHeat, ignites: statIgnites }),
    dims: () => n,
    dispose: () => {},
  };
}

// ── WebGPU driver ─────────────────────────────────────────────────────────────

async function runGpuDriver(canvas: HTMLCanvasElement, rng: () => number): Promise<Driver | null> {
  const gpu = (navigator as unknown as { gpu?: Wgpu }).gpu;
  if (!gpu) return null;
  let adapter: Wgpu;
  let device: Wgpu;
  try {
    adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch {
    return null;
  }
  if (!device) return null;

  const n = GPU_N;
  const format = gpu.getPreferredCanvasFormat();

  const bytes = n * n * 16;
  const bufA = device.createBuffer({ size: bytes, usage: BUF_STORAGE | BUF_COPY_DST });
  const bufB = device.createBuffer({ size: bytes, usage: BUF_STORAGE | BUF_COPY_DST });
  device.queue.writeBuffer(bufA, 0, seedBed(n, rng));

  const paramsBuf = device.createBuffer({ size: 32, usage: BUF_UNIFORM | BUF_COPY_DST });
  const rParamsBuf = device.createBuffer({ size: 16, usage: BUF_UNIFORM | BUF_COPY_DST });
  const counters = device.createBuffer({ size: 16, usage: BUF_STORAGE | BUF_COPY_SRC | BUF_COPY_DST });
  const staging = device.createBuffer({ size: 16, usage: BUF_COPY_DST | BUF_MAP_READ });

  // Static render params (grid dims + glow).
  {
    const rp = new ArrayBuffer(16);
    new Uint32Array(rp, 0, 2).set([n, n]);
    new Float32Array(rp, 8, 2).set([1, 0]);
    device.queue.writeBuffer(rParamsBuf, 0, rp);
  }

  const computePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: WGSL_COMPUTE }), entryPoint: "main" },
  });
  const renderPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: WGSL_RENDER }), entryPoint: "vs" },
    fragment: {
      module: device.createShaderModule({ code: WGSL_RENDER }),
      entryPoint: "fs",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  const cl = computePipe.getBindGroupLayout(0);
  const bindAB = device.createBindGroup({
    layout: cl,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: bufA } },
      { binding: 2, resource: { buffer: bufB } },
      { binding: 3, resource: { buffer: counters } },
    ],
  });
  const bindBA = device.createBindGroup({
    layout: cl,
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: bufB } },
      { binding: 2, resource: { buffer: bufA } },
      { binding: 3, resource: { buffer: counters } },
    ],
  });
  const rl = renderPipe.getBindGroupLayout(0);
  const renderA = device.createBindGroup({
    layout: rl,
    entries: [
      { binding: 0, resource: { buffer: rParamsBuf } },
      { binding: 1, resource: { buffer: bufA } },
    ],
  });
  const renderB = device.createBindGroup({
    layout: rl,
    entries: [
      { binding: 0, resource: { buffer: rParamsBuf } },
      { binding: 1, resource: { buffer: bufB } },
    ],
  });

  // Bind the canvas to a WebGPU context LAST — only after every buffer and
  // pipeline built cleanly. If anything above threw, the canvas stays
  // unbound so the CPU/Canvas2D fallback can still claim a 2d context on it.
  const ctx = canvas.getContext("webgpu") as Wgpu;
  if (!ctx) return null;
  ctx.configure({ device, format, alphaMode: "opaque" });

  const groups = Math.ceil(n / 8);
  const zero = new Uint32Array(4);
  let srcIsA = true; // bufA currently holds latest state
  let time = 0;
  let statHeat = 0;
  let statIgnites = 0;
  let readPending = false;
  let disposed = false;

  const pbuf = new ArrayBuffer(32);
  const pu = new Uint32Array(pbuf, 0, 2);
  const pf = new Float32Array(pbuf);

  function step(oxygen: number, seed: [number, number, number, number] | null): void {
    if (disposed) return;
    time += 1 / 60;
    pu[0] = n; pu[1] = n;
    pf[2] = Math.min(Math.max(oxygen, 0), 1);
    pf[3] = time;
    if (seed) { pf[4] = seed[0]; pf[5] = seed[1]; pf[6] = seed[2]; pf[7] = seed[3]; }
    else { pf[4] = 0; pf[5] = 0; pf[6] = 0; pf[7] = 0; }
    device.queue.writeBuffer(paramsBuf, 0, pbuf);
    device.queue.writeBuffer(counters, 0, zero);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(computePipe);
    cpass.setBindGroup(0, srcIsA ? bindAB : bindBA);
    cpass.dispatchWorkgroups(groups, groups);
    cpass.end();

    // Latest state after this step lives in the "dst" buffer.
    const latestIsA = !srcIsA;
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.02, g: 0.012, b: 0.01, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipe);
    rpass.setBindGroup(0, latestIsA ? renderA : renderB);
    rpass.draw(3);
    rpass.end();

    if (!readPending) enc.copyBufferToBuffer(counters, 0, staging, 0, 16);
    device.queue.submit([enc.finish()]);
    srcIsA = latestIsA;

    if (!readPending) {
      readPending = true;
      staging.mapAsync(MAP_READ).then(() => {
        if (disposed) { readPending = false; return; }
        const arr = new Uint32Array(staging.getMappedRange().slice(0));
        staging.unmap();
        statIgnites = arr[0];
        statHeat = arr[1] / (n * n * 64);
        readPending = false;
      }).catch(() => { readPending = false; });
    }
  }

  return {
    step,
    stats: () => ({ heat: statHeat, ignites: statIgnites }),
    dims: () => n,
    dispose: () => {
      disposed = true;
      try { device.destroy(); } catch { /* already gone */ }
    },
  };
}

// ── Audio engine (inharmonic, physics-driven — no pitched drone) ──────────────

type AudioEngine = {
  update: (heat: number, breath: number, ignites: number) => void;
  dispose: () => void;
};

function runAudio(ctx: AudioContext, rng: () => number): AudioEngine {
  const now = () => ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // Two noise buffers: brownish (warm roar) and white (crackle).
  const sr = ctx.sampleRate;
  const len = sr * 2;
  const brown = ctx.createBuffer(1, len, sr);
  const white = ctx.createBuffer(1, len, sr);
  const bd = brown.getChannelData(0);
  const wd = white.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = rng() * 2 - 1;
    wd[i] = w;
    last = (last + 0.02 * w) / 1.02;
    bd[i] = last * 3.2;
  }

  // Warm roar bed — lowpass noise whose gain tracks total grid heat.
  const roarSrc = ctx.createBufferSource();
  roarSrc.buffer = brown;
  roarSrc.loop = true;
  const roarLp = ctx.createBiquadFilter();
  roarLp.type = "lowpass";
  roarLp.frequency.value = 420;
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0;
  roarSrc.connect(roarLp).connect(roarGain).connect(master);
  roarSrc.start();

  // Breath-wind layer — bandpass noise tracking the player's live breath.
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = white;
  windSrc.loop = true;
  const windBp = ctx.createBiquadFilter();
  windBp.type = "bandpass";
  windBp.frequency.value = 700;
  windBp.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  windSrc.connect(windBp).connect(windGain).connect(master);
  windSrc.start();

  let carry = 0; // fractional crackle accumulator

  function crackle(count: number, level: number): void {
    for (let k = 0; k < count; k++) {
      const src = ctx.createBufferSource();
      src.buffer = white;
      const off = Math.floor(rng() * (len - sr * 0.15));
      src.loop = false;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + rng() * 3600;
      bp.Q.value = 4 + rng() * 8;
      const g = ctx.createGain();
      const t = now();
      const peak = level * (0.35 + 0.45 * rng());
      const dur = 0.03 + rng() * 0.06;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp).connect(g).connect(master);
      const startAt = off / sr;
      src.start(t, startAt, dur + 0.02);
      src.stop(t + dur + 0.05);
    }
  }

  function update(heat: number, breath: number, ignites: number): void {
    const t = now();
    const roarTarget = Math.min(1, Math.max(0, heat) * 1.5) * 0.5;
    roarGain.gain.setTargetAtTime(roarTarget, t, 0.15);
    roarLp.frequency.setTargetAtTime(300 + heat * 500 + breath * 200, t, 0.2);
    const windTarget = Math.min(1, breath) * 0.32;
    windGain.gain.setTargetAtTime(windTarget, t, 0.08);

    // Crackle proportional to newly-ignited cells this frame (rhythm from
    // the physics, not a clock). Fractional part carries stochastically.
    const expected = Math.min(6, ignites * 0.14);
    carry += expected;
    let spawn = Math.floor(carry);
    carry -= spawn;
    if (carry > rng()) { spawn += 1; carry = 0; }
    if (spawn > 0) crackle(spawn, 0.5 + 0.4 * Math.min(1, breath));
  }

  function dispose(): void {
    const t = now();
    master.gain.setTargetAtTime(0.0001, t, 0.15);
    setTimeout(() => {
      try { roarSrc.stop(); } catch { /* already stopped */ }
      try { windSrc.stop(); } catch { /* already stopped */ }
    }, 500);
  }

  return { update, dispose };
}

// ── React component ───────────────────────────────────────────────────────────

type Mode = "auto" | "mic" | "replay";
type Phase = "idle" | "live" | "error";

export default function HearthbreathPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const driverRef = useRef<Driver | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const modeRef = useRef<Mode>("auto");
  const oxygenRef = useRef<number>(0.3); // smoothed oxygen/draft
  const timeRef = useRef<number>(0);
  const rngRef = useRef<() => number>(makeRng(0x10120));
  const oscRng = useRef<() => number>(makeRng(0x10120 ^ 0x9e37));

  // Mic
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Pointer bellows
  const draftRef = useRef<number>(0);
  const seedRef = useRef<[number, number, number, number] | null>(null);
  const lastPtrRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // Record / replay ring buffer
  const ringRef = useRef<Float32Array>(new Float32Array(RING_LEN));
  const ringPosRef = useRef<number>(0);
  const replayRef = useRef<Float32Array | null>(null);
  const replayPosRef = useRef<number>(0);

  const shownLevelRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("auto");
  const [backend, setBackend] = useState<"webgpu" | "cpu" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [level, setLevel] = useState(0);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.dispose();
    audioRef.current = null;
    driverRef.current?.dispose();
    driverRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") {
      setTimeout(() => { c.close().catch(() => {}); }, 700);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const loop = useCallback(() => {
    const driver = driverRef.current;
    if (!driver) return;
    timeRef.current += 1 / 60;
    const t = timeRef.current;

    // 1. Raw breath target for the current mode.
    let raw: number;
    if (modeRef.current === "mic" && analyserRef.current && micDataRef.current) {
      analyserRef.current.getByteTimeDomainData(micDataRef.current);
      const d = micDataRef.current;
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        const v = (d[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / d.length);
      raw = Math.min(1, rms * 6);
    } else if (modeRef.current === "replay" && replayRef.current) {
      const rp = replayRef.current;
      raw = rp[replayPosRef.current % rp.length];
      replayPosRef.current++;
    } else {
      // Self-tending ghost breath: seeded slow oscillation so the hearth is
      // alive on load with no permissions.
      const j = oscRng.current() * 0.04;
      raw =
        0.34 +
        0.26 * (0.5 + 0.5 * Math.sin(t * 0.55)) +
        0.14 * (0.5 + 0.5 * Math.sin(t * 0.17 + 1.3)) +
        j;
      raw = Math.min(1, Math.max(0, raw));
    }

    // Pointer bellows adds draft in any mode; painting seeds fuel.
    raw = Math.min(1, raw + draftRef.current);
    draftRef.current *= 0.86;

    // 2. Attack/release smoothing envelope.
    const prev = oxygenRef.current;
    const k = raw > prev ? 0.28 : 0.06;
    const oxy = prev + (raw - prev) * k;
    oxygenRef.current = oxy;
    // Only nudge React when the meter visibly moves — avoids 60 renders/sec.
    if (Math.abs(oxy - shownLevelRef.current) > 0.03) {
      shownLevelRef.current = oxy;
      setLevel(oxy);
    }

    // 3. Record into the rolling ring buffer.
    ringRef.current[ringPosRef.current % RING_LEN] = oxy;
    ringPosRef.current++;

    // 4. Step the combustion sim.
    driver.step(oxy, seedRef.current);
    seedRef.current = null;

    // 5. Drive audio from the physics.
    const st = driver.stats();
    audioRef.current?.update(st.heat, oxy, st.ignites);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    if (phase === "live") return;
    setNotice(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 512;
    canvas.height = 512;

    // Audio context (needs the user gesture we're inside of).
    let audioCtx: AudioContext;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      await audioCtx.resume();
    } catch {
      setPhase("error");
      setNotice("Audio could not start in this browser.");
      return;
    }
    ctxRef.current = audioCtx;
    audioRef.current = runAudio(audioCtx, makeRng(0x10120 ^ 0x5eed));

    // Rendering: WebGPU first, CPU fallback on any failure.
    let driver: Driver | null = null;
    try {
      driver = await runGpuDriver(canvas, rngRef.current);
    } catch {
      driver = null;
    }
    if (driver) {
      setBackend("webgpu");
    } else {
      try {
        driver = runCpuDriver(canvas, makeRng(0x10120));
        setBackend("cpu");
        setNotice("WebGPU unavailable — running the combustion sim on CPU (lower resolution).");
      } catch {
        setPhase("error");
        setNotice("Could not start a renderer.");
        audioRef.current?.dispose();
        audioRef.current = null;
        return;
      }
    }
    driverRef.current = driver;
    setPhase("live");
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, loop]);

  const enableMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = ctxRef.current;
      if (!ctx) return;
      const srcNode = ctx.createMediaStreamSource(stream);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 0.5;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      srcNode.connect(bp).connect(analyser);
      analyserRef.current = analyser;
      // Allocate over an explicit ArrayBuffer so lib.dom's typed-array method
      // signatures (getByteTimeDomainData) stay happy under TS 5.
      micDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      modeRef.current = "mic";
      setMode("mic");
      setNotice(null);
    } catch {
      setNotice("Microphone denied — fan the coals with your pointer, or use auto breath.");
    }
  }, []);

  const setModeSafe = useCallback((m: Mode) => {
    if (m === "mic") {
      if (!analyserRef.current) { enableMic(); return; }
      modeRef.current = "mic";
      setMode("mic");
    } else if (m === "replay") {
      if (!replayRef.current) return;
      replayPosRef.current = 0;
      modeRef.current = "replay";
      setMode("replay");
    } else {
      modeRef.current = "auto";
      setMode("auto");
    }
  }, [enableMic]);

  const record = useCallback(() => {
    // Snapshot the last ~20s of the breath signal in chronological order.
    const src = ringRef.current;
    const pos = ringPosRef.current;
    const snap = new Float32Array(RING_LEN);
    for (let i = 0; i < RING_LEN; i++) {
      snap[i] = src[(pos + i) % RING_LEN];
    }
    replayRef.current = snap;
    setHasRecording(true);
  }, []);

  // Pointer "fan the coals" + paint fuel.
  const onPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && e.type !== "pointerdown") return;
    const canvas = canvasRef.current;
    const driver = driverRef.current;
    if (!canvas || !driver) return;
    const rect = canvas.getBoundingClientRect();
    const n = driver.dims();
    const gx = ((e.clientX - rect.left) / rect.width) * n;
    const gy = ((e.clientY - rect.top) / rect.height) * n;
    const nowMs = performance.now();
    const last = lastPtrRef.current;
    if (last) {
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const dt = Math.max(1, nowMs - last.t);
      const speed = Math.sqrt(dx * dx + dy * dy) / dt; // px per ms
      draftRef.current = Math.min(1, draftRef.current + Math.min(0.5, speed * 0.5));
    }
    lastPtrRef.current = { x: e.clientX, y: e.clientY, t: nowMs };
    seedRef.current = [gx, gy, n * 0.05, 1];
  }, []);

  const onPointerUp = useCallback(() => {
    lastPtrRef.current = null;
  }, []);

  const modeLabel = mode === "mic" ? "Mic breath" : mode === "replay" ? "Replaying" : "Auto breath";

  return (
    <main className="min-h-screen w-full bg-background px-5 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hearthbreath</h1>
          <p className="text-base text-muted-foreground">
            Keep a bed of coals alive with your breath — a real combustion-front simulation you can hear crackling as it travels, spreads, and dies to ash.
          </p>
        </header>

        <div className="relative w-full overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block aspect-square w-full touch-none bg-[#050303]"
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {phase !== "live" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <button
                type="button"
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Light the hearth
              </button>
            </div>
          )}
          {phase === "live" && (
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {modeLabel}
              </span>
              <span
                className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/20"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
              </span>
            </div>
          )}
        </div>

        {phase === "live" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModeSafe("mic")}
              className={`min-h-[44px] rounded-md border border-border px-4 text-sm transition-colors ${
                mode === "mic"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {analyserRef.current ? "Use mic" : "Start mic"}
            </button>
            <button
              type="button"
              onClick={() => setModeSafe("auto")}
              className={`min-h-[44px] rounded-md border border-border px-4 text-sm transition-colors ${
                mode === "auto"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Auto breath
            </button>
            <button
              type="button"
              onClick={record}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Record breath
            </button>
            <button
              type="button"
              onClick={() => setModeSafe("replay")}
              disabled={!hasRecording}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Replay
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        )}

        {phase === "live" && (
          <p className="text-base text-muted-foreground">
            Blow near the mic to fan the front (or drag across the coals as a bellows). Click and drag to drop a fresh log — fuel plus a spark. Fall quiet and the coals cool to grey ash.
          </p>
        )}

        {backend && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            renderer: {backend}
          </p>
        )}
        {notice && <p className="text-sm text-destructive">{notice}</p>}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A hearth you tend with your own breath. The coals are a combustion-front cellular automaton in the lineage of Drossel &amp; Schwabl&apos;s self-organized-critical forest-fire model (Phys. Rev. Lett. 69, 1629, 1992).
              </p>
              <p>
                Each grid cell holds fuel, temperature, and char. Heat diffuses to its neighbours (a Laplacian); a cell above the ignition threshold with fuel left ignites, consuming fuel and releasing heat, then cooling by radiation each step. Because heat spreads before it decays, a travelling burn-front emerges — fuel turning to glowing coal turning to grey ash — rather than a uniform glow.
              </p>
              <p>
                Your breath is the global oxygen / draft. Loud breath (mic RMS, smoothed with an attack/release envelope) raises the combustion rate and slows cooling, so the front travels and roars; silence lets it stall and die. With no mic, a seeded self-tending oscillation breathes the hearth on its own, and you can fan or re-seed the coals with the pointer.
              </p>
              <p>
                Sound is inharmonic and physics-driven: filtered-noise crackle pops in proportion to how many cells newly ignite each frame, a warm lowpass bed tracks total grid heat, and a bandpass wind layer tracks your live breath. No pitched drone — silent hearth, near silence.
              </p>
              <p>
                Honest limits: the grid is small (256² on GPU, 128² on CPU) with reflective edges, so it is a stylized hearth, not physical fire dynamics; GPU ignition counts are read back a few times per second, so crackle density is an estimate rather than one pop per cell; mic sensitivity varies by device.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
