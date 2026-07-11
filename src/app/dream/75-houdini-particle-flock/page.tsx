"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Constants ──────────────────────────────────────────────────────────────────

const N_SPECIES = 6;
const N_PER_SPECIES = 1000;
const N_TOTAL = N_SPECIES * N_PER_SPECIES; // 6 000
const TRAIL_FADE = 0.93;

// ── Journey themes ─────────────────────────────────────────────────────────────

interface Theme {
  id: string;
  name: string;
  subtitle: string;
  colors: ReadonlyArray<readonly [number, number, number]>;
  prompt: string;
}

const THEMES: readonly Theme[] = [
  {
    id: "cosmic-homecoming",
    name: "Cosmic Homecoming",
    subtitle: "rise through golden light",
    colors: [
      [0.55, 0.23, 0.93],
      [0.93, 0.68, 0.10],
      [0.93, 0.28, 0.55],
      [0.85, 0.75, 0.95],
      [0.98, 0.50, 0.10],
      [0.95, 0.90, 0.75],
    ],
    prompt:
      "cosmic void clusters crystalline mineral formations catching violet gold bioluminescence fibonacci spiral particles rising stardust vast dark space macro crystal texture photorealistic cinematic no text no watermarks",
  },
  {
    id: "earth-grounding",
    name: "Earth Grounding",
    subtitle: "the network awakens",
    colors: [
      [0.10, 0.75, 0.35],
      [0.90, 0.65, 0.10],
      [0.20, 0.85, 0.20],
      [0.60, 0.90, 0.15],
      [0.95, 0.45, 0.10],
      [0.85, 0.78, 0.60],
    ],
    prompt:
      "phosphorescent bioluminescent mycorrhizal network brown-black void green-gold luminous nodes connected hair-thin filaments warm amber pulses bioluminescent spores vast dark space photorealistic cinematic no text no watermarks",
  },
  {
    id: "ocean-breath",
    name: "Ocean Breath",
    subtitle: "into the deep",
    colors: [
      [0.05, 0.82, 0.92],
      [0.05, 0.60, 0.82],
      [0.15, 0.40, 0.92],
      [0.40, 0.92, 0.92],
      [0.05, 0.75, 0.62],
      [0.35, 0.35, 0.92],
    ],
    prompt:
      "deep ocean bioluminescent aurora blue-black water electric cyan violet ribbons undulating millions luminous plankton spiraling streams deep sea darkness photorealistic cinematic no text no watermarks",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    subtitle: "crystalline silence",
    colors: [
      [0.72, 0.87, 0.97],
      [0.87, 0.92, 1.00],
      [0.52, 0.67, 0.92],
      [0.80, 0.92, 1.00],
      [0.67, 0.67, 0.97],
      [0.97, 0.92, 0.72],
    ],
    prompt:
      "crystalline ice formations deep dark space intricate snowflake geometry prismatic light refraction fine silver ice particles spiral patterns cold blue light vast darkness photorealistic cinematic no text no watermarks",
  },
  {
    id: "inner-fire",
    name: "Inner Fire",
    subtitle: "alone in the burning",
    colors: [
      [1.00, 0.42, 0.05],
      [0.95, 0.18, 0.10],
      [0.98, 0.65, 0.08],
      [1.00, 0.85, 0.15],
      [0.90, 0.28, 0.20],
      [0.98, 0.52, 0.20],
    ],
    prompt:
      "interconnected ember constellation deep black void fractal fire filaments white-hot nodes fine ash particles geometric pathways cosmic scale ember network dying star skeleton no volcanoes no landscapes photorealistic cinematic no text no watermarks",
  },
  {
    id: "deep-cosmos",
    name: "Deep Cosmos",
    subtitle: "expand into everything",
    colors: [
      [0.45, 0.10, 0.92],
      [0.25, 0.15, 0.87],
      [0.10, 0.35, 0.97],
      [0.77, 0.10, 0.92],
      [0.30, 0.25, 0.97],
      [0.05, 0.77, 0.92],
    ],
    prompt:
      "vast cosmic nebula embedded neural networks electric violet deep blue filaments connecting luminous nodes billions particles spiral arms dark space ultradetailed photorealistic cinematic no text no watermarks",
  },
];

// ── WGSL: Boids compute ────────────────────────────────────────────────────────

const COMPUTE_WGSL = /* wgsl */`
struct Particle { pos: vec2f, vel: vec2f, species: f32, pad: f32 }
struct Params {
  n: u32,     _dt: f32,
  bass: f32,  treble: f32,  mid: f32, onset: f32,
  time: f32,  noiseSeed: f32,
  _p0: f32, _p1: f32, _p2: f32, _p3: f32,
}
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;
var<workgroup> tile: array<Particle, 64>;

fn hashf(p: vec2f) -> f32 {
  var q = fract(p * 0.3183099 + vec2f(0.1, 0.1));
  q *= 17.0;
  return fract(q.x * q.y * (q.x + q.y));
}

fn curlNoise(pos: vec2f, t: f32) -> vec2f {
  let e = 0.008;
  let tp = pos * 3.5 + vec2f(t * 0.18, t * 0.12);
  let dy = (hashf(tp + vec2f(0.0, e)) - hashf(tp - vec2f(0.0, e))) / (2.0 * e);
  let dx = (hashf(tp + vec2f(e, 0.0)) - hashf(tp - vec2f(e, 0.0))) / (2.0 * e);
  return vec2f(-dy, dx);
}

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let i = gid.x;
  let localI = lid.x;
  let n = params.n;
  let valid = i < n;
  var p = particles[select(0u, i, valid)];
  let si = u32(p.species + 0.5);

  var sepF = vec2f(0.0); var aliV = vec2f(0.0); var cohD = vec2f(0.0);
  var sepN = 0u; var aliN = 0u; var cohN = 0u;

  let nTiles = (n + 63u) / 64u;
  for (var t = 0u; t < nTiles; t++) {
    let j = t * 64u + localI;
    tile[localI] = particles[select(0u, j, j < n)];
    workgroupBarrier();
    if (valid) {
      let tSz = min(64u, n - t * 64u);
      for (var k = 0u; k < tSz; k++) {
        let absJ = t * 64u + k;
        if (absJ == i) { continue; }
        let q = tile[k];
        var d = q.pos - p.pos;
        if (d.x > 0.5) { d.x -= 1.0; } else if (d.x < -0.5) { d.x += 1.0; }
        if (d.y > 0.5) { d.y -= 1.0; } else if (d.y < -0.5) { d.y += 1.0; }
        let dist = length(d);
        if (dist < 0.0001) { continue; }
        let dn = d / dist;
        let sj = u32(q.species + 0.5);
        if (dist < 0.025) { sepF -= dn; sepN++; }
        if (sj == si) {
          if (dist < 0.07) { aliV += q.vel; aliN++; }
          if (dist < 0.13) { cohD += dn; cohN++; }
        }
      }
    }
    workgroupBarrier();
  }
  if (!valid) { return; }

  var force = vec2f(0.0);
  if (sepN > 0u) { force += (sepF / f32(sepN)) * 0.005; }
  if (aliN > 0u) {
    let avgV = aliV / f32(aliN);
    let len = length(avgV);
    if (len > 0.0001) {
      force += (normalize(avgV) * 0.003 - p.vel) * (0.002 + params.mid * 0.003);
    }
  }
  if (cohN > 0u) { force += (cohD / f32(cohN)) * (0.0007 + params.bass * 0.0015); }
  force += curlNoise(p.pos, params.time) * (0.0008 + params.treble * 0.003);
  if (params.onset > 0.5) {
    let s = params.noiseSeed + f32(i) * 0.01234;
    force += vec2f(sin(s * 127.1), cos(s * 311.7)) * 0.003;
  }

  p.vel += force;
  let maxSpd = 0.003 + params.mid * 0.0015;
  let spd = length(p.vel);
  if (spd > maxSpd) { p.vel *= maxSpd / spd; }
  p.vel *= 0.975;
  p.pos = fract(p.pos + p.vel);
  particles[i] = p;
}
`;

// ── WGSL: Trail fade ──────────────────────────────────────────────────────────

const FADE_WGSL = /* wgsl */`
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

// ── WGSL: Particle render ─────────────────────────────────────────────────────

const PARTICLE_WGSL = /* wgsl */`
struct Particle { pos: vec2f, vel: vec2f, species: f32, pad: f32 }
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
struct ColUni { cols: array<vec4f, 6> }
@group(0) @binding(1) var<uniform> colUni: ColUni;
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
}
@vertex fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VO {
  let p = particles[ii];
  let corners = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let corner = corners[vi];
  let spd = length(p.vel);
  let sz = 0.004 + spd * 0.35;
  let ndc = vec2f(p.pos.x*2.0-1.0, 1.0-p.pos.y*2.0);
  let si = u32(p.species + 0.5);
  return VO(vec4f(ndc + corner*sz, 0.0, 1.0), corner, colUni.cols[si].xyz);
}
@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = (1.0 - d*d) * 0.88;
  return vec4f(v.color * a, a);
}
`;

// ── WGSL: Display (tonemap) ───────────────────────────────────────────────────

const DISPLAY_WGSL = /* wgsl */`
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
  return vec4f(pow(max(c, vec3f(0.0)), vec3f(0.45)), 1.0);
}
`;

// ── GPU types ─────────────────────────────────────────────────────────────────

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  canvasFmt: GPUTextureFormat;
  particleBuf: GPUBuffer;
  paramsBuf: GPUBuffer;
  fadeBuf: GPUBuffer;
  colBuf: GPUBuffer;
  trail: [GPUTexture, GPUTexture];
  trailR: 0 | 1;
  sampler: GPUSampler;
  computePl: GPUComputePipeline;
  fadePl: GPURenderPipeline;
  particlePl: GPURenderPipeline;
  displayPl: GPURenderPipeline;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function spawnParticles(): Float32Array {
  const buf = new Float32Array(N_TOTAL * 6);
  for (let i = 0; i < N_TOTAL; i++) {
    buf[i * 6 + 0] = Math.random();
    buf[i * 6 + 1] = Math.random();
    buf[i * 6 + 2] = (Math.random() - 0.5) * 0.002;
    buf[i * 6 + 3] = (Math.random() - 0.5) * 0.002;
    buf[i * 6 + 4] = Math.floor(i / N_PER_SPECIES);
    buf[i * 6 + 5] = 0;
  }
  return buf;
}

async function buildGpu(canvas: HTMLCanvasElement, theme: Theme): Promise<GpuState> {
  if (!navigator.gpu) throw new Error("WebGPU not supported in this browser.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter found.");
  const device = await adapter.requestDevice();

  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("Could not get WebGPU canvas context.");
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const W = canvas.width;
  const H = canvas.height;
  const trailFmt: GPUTextureFormat = "rgba16float";
  const mkTrail = (): GPUTexture =>
    device.createTexture({
      size: [W, H],
      format: trailFmt,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const particleBuf = device.createBuffer({
    size: N_TOTAL * 6 * 4,
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
  device.queue.writeBuffer(fadeBuf, 0, new Float32Array([TRAIL_FADE, 0, 0, 0]).buffer as ArrayBuffer);

  const colBuf = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const colData = new Float32Array(24);
  for (let i = 0; i < N_SPECIES; i++) {
    const [r, g, b] = theme.colors[i];
    colData[i * 4] = r; colData[i * 4 + 1] = g; colData[i * 4 + 2] = b; colData[i * 4 + 3] = 1;
  }
  device.queue.writeBuffer(colBuf, 0, colData.buffer as ArrayBuffer);

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const fadePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vs" },
    fragment: { module: fadeMod, entryPoint: "fs", targets: [{ format: trailFmt }] },
    primitive: { topology: "triangle-strip" },
  });

  const partMod = device.createShaderModule({ code: PARTICLE_WGSL });
  const particlePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: partMod, entryPoint: "vs" },
    fragment: {
      module: partMod, entryPoint: "fs",
      targets: [{
        format: trailFmt,
        blend: {
          color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
        },
      }],
    },
    primitive: { topology: "triangle-strip" },
  });

  const dispMod = device.createShaderModule({ code: DISPLAY_WGSL });
  const displayPl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: dispMod, entryPoint: "vs" },
    fragment: { module: dispMod, entryPoint: "fs", targets: [{ format: canvasFmt }] },
    primitive: { topology: "triangle-strip" },
  });

  return {
    device, ctx, canvasFmt,
    particleBuf, paramsBuf, fadeBuf, colBuf,
    trail: [mkTrail(), mkTrail()],
    trailR: 0,
    sampler,
    computePl, fadePl, particlePl, displayPl,
  };
}

function stepGpu(
  g: GpuState,
  bands: Float32Array,
  time: number,
  onset: boolean,
  noiseSeed: number,
): void {
  const { device } = g;
  const p = new Float32Array(12);
  const pu = new Uint32Array(p.buffer);
  pu[0] = N_TOTAL;
  // p[1] = 0 (_dt unused)
  p[2] = bands[1];                          // bass
  p[3] = (bands[4] + bands[5]) * 0.5;      // treble
  p[4] = (bands[2] + bands[3]) * 0.5;      // mid
  p[5] = onset ? 1.0 : 0.0;
  p[6] = time;
  p[7] = noiseSeed;
  device.queue.writeBuffer(g.paramsBuf, 0, p.buffer as ArrayBuffer);

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  // 1. Boids compute
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
    pass.dispatchWorkgroups(Math.ceil(N_TOTAL / 64));
    pass.end();
  }

  // 2. Fade + particle render → trail[trW]
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
        { binding: 1, resource: { buffer: g.colBuf } },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: g.trail[trW].createView(),
        loadOp: "clear" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(g.fadePl);
    pass.setBindGroup(0, fadeBg);
    pass.draw(4);
    pass.setPipeline(g.particlePl);
    pass.setBindGroup(0, partBg);
    pass.draw(4, N_TOTAL);
    pass.end();
  }

  // 3. Display → canvas
  {
    const bg = device.createBindGroup({
      layout: g.displayPl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: g.sampler },
        { binding: 1, resource: g.trail[trW].createView() },
      ],
    });
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: g.ctx.getCurrentTexture().createView(),
        loadOp: "clear" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(g.displayPl);
    pass.setBindGroup(0, bg);
    pass.draw(4);
    pass.end();
  }

  device.queue.submit([enc.finish()]);
  g.trailR = trW;
}

// ── Component ──────────────────────────────────────────────────────────────────

type RunMode = "idle" | "demo" | "mic";

export default function HoudiniParticleFlock() {
  const [themeIdx, setThemeIdx] = useState(0);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("idle");
  const [energySnap, setEnergySnap] = useState([0, 0, 0, 0, 0, 0]);

  const { running, error: micError, start: startMic, stop: stopMic, getFrame } =
    useMicAnalyser({ smoothing: 0.78, gain: 2.0, onsetThreshold: 1.7 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuState | null>(null);
  const noiseSeedRef = useRef(Math.random() * 100);
  const energyTickRef = useRef(0);

  // ── Main animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);

    // Demo audio: 6 oscillators → analyser (not connected to speakers)
    let demoCtx: AudioContext | null = null;
    let demoAnalyser: AnalyserNode | null = null;
    const demoFft = new Uint8Array(512);

    if (mode === "demo") {
      demoCtx = new AudioContext();
      demoAnalyser = demoCtx.createAnalyser();
      demoAnalyser.fftSize = 1024;
      const freqs = [40, 120, 350, 900, 3000, 9000];
      freqs.forEach((freq, i) => {
        const osc = demoCtx!.createOscillator();
        const lfo = demoCtx!.createOscillator();
        const lfoGain = demoCtx!.createGain();
        const gain = demoCtx!.createGain();
        osc.frequency.value = freq;
        lfo.frequency.value = 0.12 + i * 0.09;
        lfoGain.gain.value = 0.22;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.gain.value = 0.35;
        osc.connect(gain);
        gain.connect(demoAnalyser!);
        osc.start(); lfo.start();
      });
    }

    const bands = new Float32Array(6);
    const theme = THEMES[themeIdx];

    buildGpu(canvas, theme).then(g => {
      if (cancelled) { g.device.destroy(); return; }
      gpuRef.current = g;

      const tick = (now: number) => {
        if (!gpuRef.current || cancelled) return;

        let onset = false;
        if (mode === "mic" && running) {
          const frame = getFrame();
          if (frame) {
            for (let i = 0; i < 6; i++) bands[i] = frame.bands[i];
            onset = !!frame.onset;
          }
        } else if (mode === "demo" && demoAnalyser) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          demoAnalyser.getByteFrequencyData(demoFft as any);
          const step = Math.floor(demoFft.length / 6);
          for (let i = 0; i < 6; i++) {
            let sum = 0;
            for (let k = 0; k < step; k++) sum += demoFft[i * step + k];
            bands[i] = sum / step / 255;
          }
          // Simulated onsets: random ~every 2s
          if (now - energyTickRef.current > 2000 + Math.random() * 1000) {
            onset = true;
            energyTickRef.current = now;
          }
        } else {
          for (let i = 0; i < 6; i++) bands[i] = 0.05;
        }

        noiseSeedRef.current += 0.009;
        stepGpu(gpuRef.current, bands, now * 0.001, onset, noiseSeedRef.current);

        if (Math.floor(now / 400) !== Math.floor((now - 16) / 400)) {
          setEnergySnap(Array.from(bands));
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(err => {
      if (!cancelled) setGpuError(String(err));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (gpuRef.current) {
        gpuRef.current.device.destroy();
        gpuRef.current = null;
      }
      demoCtx?.close();
    };
  }, [mode, themeIdx, running, getFrame]);

  // ── Background generation ─────────────────────────────────────────────────
  const generateBg = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/dream/75-houdini-particle-flock/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: THEMES[themeIdx].prompt }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) setBgUrl(data.url);
    } catch {
      // backdrop is optional — fail silently
    } finally {
      setGenerating(false);
    }
  }, [themeIdx]);

  const theme = THEMES[themeIdx];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* Journey backdrop (Flux Schnell image) */}
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt="Journey backdrop"
          className="absolute inset-0 w-full h-full object-cover opacity-45 select-none pointer-events-none"
        />
      )}

      {/* Slight dark veil so UI stays legible over the backdrop */}
      {bgUrl && <div className="absolute inset-0 bg-black/25 pointer-events-none" />}

      {/* WebGPU canvas — screen-blend composites glowing particles over backdrop */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ mixBlendMode: bgUrl ? "screen" : "normal" }}
      />

      {/* WebGPU error state */}
      {gpuError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8 z-10">
          <p className="text-violet-300 text-xl font-mono">WebGPU unavailable</p>
          <p className="text-muted-foreground text-base max-w-sm">{gpuError}</p>
          <Link
            href="/dream/16-particle-life-gpu"
            className="text-violet-300 underline text-base hover:text-violet-200"
          >
            Try particle-life-gpu instead →
          </Link>
          <Link href="/dream" className="text-muted-foreground text-sm hover:text-foreground">
            ← dream lab
          </Link>
        </div>
      )}

      {/* Header */}
      {!gpuError && (
        <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-6 z-10">
          <div>
            <h1 className="text-2xl font-mono text-foreground mb-1">Houdini Particle Flock</h1>
            <p className="text-base text-muted-foreground max-w-md leading-snug">
              {theme.subtitle} · Boids + curl-noise · {N_TOTAL.toLocaleString()} particles
            </p>
          </div>
          <Link
            href="/dream"
            className="text-muted-foreground hover:text-foreground text-sm font-mono transition-colors mt-1"
          >
            ← dream lab
          </Link>
        </div>
      )}

      {/* Bottom control panel */}
      {!gpuError && (
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-6 pt-4 bg-gradient-to-t from-black/85 to-transparent z-10">

          {/* Theme selector */}
          <div className="flex flex-wrap gap-2 mb-4">
            {THEMES.map((t, i) => (
              <button
                key={t.id}
                onClick={() => {
                  setThemeIdx(i);
                  setBgUrl(null);
                }}
                className={`px-3 py-2 rounded text-sm font-mono transition-all min-h-[44px] ${
                  i === themeIdx
                    ? "bg-muted text-foreground ring-1 ring-border"
                    : "bg-black/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Demo mode */}
            <button
              onClick={() => {
                if (mode === "demo") { setMode("idle"); }
                else { if (running) stopMic(); setMode("demo"); }
              }}
              className={`px-4 py-2.5 rounded font-mono text-base min-h-[44px] transition-colors ${
                mode === "demo"
                  ? "bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/50"
                  : "bg-muted text-foreground hover:bg-accent"
              }`}
            >
              {mode === "demo" ? "● Demo" : "Demo"}
            </button>

            {/* Mic mode */}
            <button
              onClick={() => {
                if (mode === "mic") { stopMic(); setMode("idle"); }
                else { startMic(); setMode("mic"); }
              }}
              className={`px-4 py-2.5 rounded font-mono text-base min-h-[44px] transition-colors ${
                mode === "mic"
                  ? "bg-violet-500/30 text-violet-200 ring-1 ring-violet-400/50"
                  : "bg-muted text-foreground hover:bg-accent"
              }`}
            >
              {mode === "mic" ? "● Mic" : "Start Mic"}
            </button>

            {/* Backdrop generation */}
            <button
              onClick={generateBg}
              disabled={generating}
              className="px-4 py-2.5 rounded font-mono text-base min-h-[44px] bg-violet-500/20 text-violet-300/95 hover:bg-violet-500/30 disabled:opacity-50 transition-colors ring-1 ring-violet-400/30"
            >
              {generating ? "Generating…" : bgUrl ? "New Backdrop" : "Generate Backdrop"}
            </button>

            {/* Live band energy bars */}
            {mode !== "idle" && (
              <div className="flex gap-1.5 items-end ml-2 h-8">
                {energySnap.map((e, i) => {
                  const [r, g, b] = theme.colors[i];
                  return (
                    <div
                      key={i}
                      className="w-2 rounded-full transition-all duration-100"
                      style={{
                        height: `${Math.max(4, Math.round(e * 32))}px`,
                        backgroundColor: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
                        opacity: 0.85 + e * 0.15,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Mic error */}
          {micError && (
            <p className="text-violet-300 text-sm mt-2 font-mono">{micError}</p>
          )}

          {/* Backdrop hint */}
          {!bgUrl && !generating && mode !== "idle" && (
            <p className="text-muted-foreground text-sm mt-2 font-mono">
              ↑ Generate a Flux backdrop themed to {theme.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
