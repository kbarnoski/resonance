"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Constants ──────────────────────────────────────────────────────────────────

const N_SPECIES = 6;
const N_PER_SPECIES = 1500;
const N_TOTAL = N_PER_SPECIES * N_SPECIES; // 9000
const R_MAX_NORM = 0.12; // interaction radius in normalized [0,1] space
const FRICTION = 0.97;
const TRAIL_FADE = 0.92; // per-frame trail persistence

const SPECIES_COLORS_F32: ReadonlyArray<[number, number, number]> = [
  [0.49, 0.23, 0.93], // violet  — sub-bass
  [0.03, 0.57, 0.70], // cyan    — bass
  [0.09, 0.64, 0.29], // green   — low-mid
  [0.79, 0.54, 0.02], // amber   — mid
  [0.92, 0.35, 0.05], // orange  — high-mid
  [0.86, 0.15, 0.47], // pink    — high
];

const SPECIES_NAMES = ["sub-bass", "bass", "low-mid", "mid", "high-mid", "high"];

// ── WGSL: Compute — particle physics (tiled N-body) ───────────────────────────

const COMPUTE_WGSL = /* wgsl */`
struct Particle {
  pos: vec2f,
  vel: vec2f,
  species: f32,
  pad: f32,
}
struct Params {
  n: u32,
  friction: f32,
  rMax: f32,
  noiseSeed: f32,
  b0: f32, b1: f32, b2: f32, b3: f32,
  b4: f32, b5: f32, pad0: f32, pad1: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> matrix: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

var<workgroup> tile: array<Particle, 64>;

fn bandEnergy(si: u32) -> f32 {
  if (si == 0u) { return params.b0; }
  if (si == 1u) { return params.b1; }
  if (si == 2u) { return params.b2; }
  if (si == 3u) { return params.b3; }
  if (si == 4u) { return params.b4; }
  return params.b5;
}

fn particleForce(r: f32, g: f32) -> f32 {
  if (r < 0.3) { return r / 0.3 - 1.0; }
  return g * (1.0 - abs(2.0 * r - 1.3) / 0.7);
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
  var force = vec2f(0.0);

  let nTiles = (n + 63u) / 64u;
  for (var t = 0u; t < nTiles; t++) {
    let j = t * 64u + localI;
    tile[localI] = particles[select(0u, j, j < n)];
    workgroupBarrier();

    if (valid) {
      let tileSize = min(64u, n - t * 64u);
      for (var k = 0u; k < tileSize; k++) {
        let absJ = t * 64u + k;
        if (absJ == i) { continue; }
        let q = tile[k];
        var d = q.pos - p.pos;
        if (d.x >  0.5) { d.x -= 1.0; } else if (d.x < -0.5) { d.x += 1.0; }
        if (d.y >  0.5) { d.y -= 1.0; } else if (d.y < -0.5) { d.y += 1.0; }
        let dist = length(d);
        if (dist < 0.0005 || dist > params.rMax) { continue; }
        let sj = u32(q.species + 0.5);
        let g = matrix[si * 6u + sj];
        force += (d / dist) * particleForce(dist / params.rMax, g);
      }
    }
    workgroupBarrier();
  }

  if (!valid) { return; }

  let e = bandEnergy(si);
  let seed = f32(i) * 0.01234 + params.noiseSeed;
  let noise = vec2f(sin(seed * 127.1 + f32(si)), cos(seed * 311.7 + f32(si))) * e * 0.0018;

  p.vel = (p.vel + force * 0.0006 + noise) * params.friction;
  let spd = length(p.vel);
  if (spd > 0.006) { p.vel *= 0.006 / spd; }
  p.pos = fract(p.pos + p.vel);
  particles[i] = p;
}
`;

// ── WGSL: Fade — darken trail texture each frame ──────────────────────────────

const FADE_WGSL = /* wgsl */`
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@group(0) @binding(2) var<uniform> fade: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSample(trail, smp, uv) * fade.x;
}
`;

// ── WGSL: Particles — instance-rendered soft glow quads ───────────────────────

const PARTICLE_WGSL = /* wgsl */`
struct Particle {
  pos: vec2f,
  vel: vec2f,
  species: f32,
  pad: f32,
}
@group(0) @binding(0) var<storage, read> particles: array<Particle>;

struct ColUni { cols: array<vec4f, 6> }
@group(0) @binding(1) var<uniform> colUni: ColUni;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
}

@vertex fn vs(
  @builtin(vertex_index)   vi: u32,
  @builtin(instance_index) ii: u32,
) -> VO {
  let p = particles[ii];
  let corners = array<vec2f,4>(
    vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1)
  );
  let corner = corners[vi];
  let spd = length(p.vel);
  let size = 0.005 + spd * 0.25;
  let ndc = vec2f(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);
  let si = u32(p.species + 0.5);
  return VO(
    vec4f(ndc + corner * size, 0.0, 1.0),
    corner,
    colUni.cols[si].xyz,
  );
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = (1.0 - d * d) * 0.85;
  return vec4f(v.color * a, a);
}
`;

// ── WGSL: Display — tone-map trail to canvas ──────────────────────────────────

const DISPLAY_WGSL = /* wgsl */`
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), xy * 0.5 + 0.5);
}
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var trail: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSample(trail, smp, uv).rgb;
  c = c / (1.0 + dot(c, vec3f(0.299, 0.587, 0.114)));
  return vec4f(pow(max(c, vec3f(0.0)), vec3f(0.45)), 1.0);
}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  canvasFmt: GPUTextureFormat;
  // Buffers
  particleBuf: GPUBuffer;
  matrixBuf: GPUBuffer;
  paramsBuf: GPUBuffer;
  fadeBuf: GPUBuffer;
  colBuf: GPUBuffer;
  // Trail textures (ping-pong)
  trail: [GPUTexture, GPUTexture];
  trailR: 0 | 1;
  sampler: GPUSampler;
  // Pipelines
  computePl: GPUComputePipeline;
  fadePl: GPURenderPipeline;
  particlePl: GPURenderPipeline;
  displayPl: GPURenderPipeline;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function f32buf(...vals: number[]): ArrayBuffer {
  return new Float32Array(vals).buffer as ArrayBuffer;
}

function buildMatrix(): Float32Array {
  const m = new Float32Array(36);
  for (let i = 0; i < 36; i++) m[i] = Math.random() * 2 - 1;
  return m;
}

function spawnParticles(): Float32Array {
  // Each particle: [posX, posY, velX, velY, species, pad] = 6 f32
  const buf = new Float32Array(N_TOTAL * 6);
  for (let i = 0; i < N_TOTAL; i++) {
    const s = Math.floor(i / N_PER_SPECIES);
    buf[i * 6 + 0] = Math.random();
    buf[i * 6 + 1] = Math.random();
    buf[i * 6 + 2] = 0;
    buf[i * 6 + 3] = 0;
    buf[i * 6 + 4] = s;
    buf[i * 6 + 5] = 0;
  }
  return buf;
}

// ── GPU init ──────────────────────────────────────────────────────────────────

async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuState> {
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

  // ── Buffers ──────────────────────────────────────────────────────────────
  const particleBytes = N_TOTAL * 6 * 4;
  const particleBuf = device.createBuffer({
    size: particleBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, spawnParticles().buffer as ArrayBuffer);

  const matrixBuf = device.createBuffer({
    size: 36 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(matrixBuf, 0, buildMatrix().buffer as ArrayBuffer);

  // params: n(u32), friction, rMax, noiseSeed, b0..b5, pad0, pad1 = 12 × 4 = 48 bytes
  const paramsBuf = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // fade uniform: single f32 (padded to 16 bytes for WebGPU alignment)
  const fadeBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(fadeBuf, 0, f32buf(TRAIL_FADE, 0, 0, 0));

  // color uniform: 6 × vec4f = 96 bytes
  const colBuf = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const colData = new Float32Array(24);
  for (let i = 0; i < 6; i++) {
    const [r, g, b] = SPECIES_COLORS_F32[i];
    colData[i * 4] = r; colData[i * 4 + 1] = g; colData[i * 4 + 2] = b; colData[i * 4 + 3] = 1;
  }
  device.queue.writeBuffer(colBuf, 0, colData.buffer as ArrayBuffer);

  // ── Pipelines ─────────────────────────────────────────────────────────────
  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
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
    particleBuf, matrixBuf, paramsBuf, fadeBuf, colBuf,
    trail: [mkTrail(), mkTrail()],
    trailR: 0,
    sampler,
    computePl, fadePl, particlePl, displayPl,
  };
}

// ── Per-frame step ────────────────────────────────────────────────────────────

function stepGpu(
  g: GpuState,
  bands: Float32Array,
  noiseSeed: number,
): void {
  const { device } = g;

  // Write params: n, friction, rMax, noiseSeed, b0..b5, pad, pad
  const paramsData = new Uint32Array(12);
  const paramsF = new Float32Array(paramsData.buffer);
  paramsData[0] = N_TOTAL;
  paramsF[1] = FRICTION;
  paramsF[2] = R_MAX_NORM;
  paramsF[3] = noiseSeed;
  for (let i = 0; i < 6; i++) paramsF[4 + i] = bands[i];
  device.queue.writeBuffer(g.paramsBuf, 0, paramsData.buffer as ArrayBuffer);

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  // 1. Compute pass — physics
  {
    const bg = device.createBindGroup({
      layout: g.computePl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: g.particleBuf } },
        { binding: 1, resource: { buffer: g.matrixBuf } },
        { binding: 2, resource: { buffer: g.paramsBuf } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(g.computePl);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(N_TOTAL / 64));
    pass.end();
  }

  // 2. Fade + particle render into trail[trW]
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
    // Fade the previous trail
    pass.setPipeline(g.fadePl);
    pass.setBindGroup(0, fadeBg);
    pass.draw(4);
    // Draw particles additively
    pass.setPipeline(g.particlePl);
    pass.setBindGroup(0, partBg);
    pass.draw(4, N_TOTAL);
    pass.end();
  }

  // 3. Display — blit trail to canvas
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

type Mode = "idle" | "demo" | "mic";

export default function ParticleLifeGpuPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuState | null>(null);
  const noiseSeedRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [matrixSnap, setMatrixSnap] = useState<number[]>([]);
  const [energySnap, setEnergySnap] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [fps, setFps] = useState(0);

  const { running, error: micError, start: startMic, stop: stopMic, getFrame } =
    useMicAnalyser({ smoothing: 0.75, gain: 2.0, onsetThreshold: 1.8 });

  const reshuffleMatrix = useCallback(() => {
    const g = gpuRef.current;
    if (!g) return;
    const m = buildMatrix();
    g.device.queue.writeBuffer(g.matrixBuf, 0, m.buffer as ArrayBuffer);
    setMatrixSnap(Array.from(m));
  }, []);

  // ── Main loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);

    // Demo audio: 6 oscillators, not connected to speakers
    let demoCtx: AudioContext | null = null;
    const demoBands = new Float32Array(6);
    let demoAnalyser: AnalyserNode | null = null;
    const demoFft = new Uint8Array(new ArrayBuffer(512));

    if (mode === "demo") {
      demoCtx = new AudioContext();
      const freqs = [40, 125, 350, 1000, 3000, 10000];
      demoAnalyser = demoCtx.createAnalyser();
      demoAnalyser.fftSize = 1024;
      freqs.forEach((freq, i) => {
        const osc = demoCtx!.createOscillator();
        const lfo = demoCtx!.createOscillator();
        const lfoGain = demoCtx!.createGain();
        const g = demoCtx!.createGain();
        osc.frequency.value = freq;
        lfo.frequency.value = 0.2 + i * 0.07;
        lfoGain.gain.value = 0.15;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        g.gain.value = 0.3;
        osc.connect(g);
        g.connect(demoAnalyser!);
        osc.start();
        lfo.start();
      });
    }

    const fpsFrames = { count: 0, epoch: 0 };
    const lastOnset = { t: 0 };
    const bands = new Float32Array(6);

    buildGpu(canvas).then(g => {
      if (cancelled) { g.device.destroy(); return; }
      gpuRef.current = g;

      // Initialize matrix snapshot
      const initMatrix = buildMatrix();
      g.device.queue.writeBuffer(g.matrixBuf, 0, initMatrix.buffer as ArrayBuffer);
      setMatrixSnap(Array.from(initMatrix));

      const tick = (now: number) => {
        if (!gpuRef.current) return;

        // Audio
        if (mode === "mic" && running) {
          const frame = getFrame();
          if (frame) {
            for (let i = 0; i < 6; i++) bands[i] = frame.bands[i];
            if (frame.onset && now - lastOnset.t > 2500) {
              lastOnset.t = now;
              reshuffleMatrix();
            }
          }
        } else if (mode === "demo" && demoAnalyser) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          demoAnalyser.getByteFrequencyData(demoFft as any);
          const step = Math.floor(demoFft.length / 6);
          for (let i = 0; i < 6; i++) {
            let sum = 0;
            for (let k = 0; k < step; k++) sum += demoFft[i * step + k];
            bands[i] = (sum / step) / 255;
          }
          // Periodic demo reshuffle every ~12s
          if (Math.floor(now / 12000) > Math.floor((now - 16) / 12000)) {
            reshuffleMatrix();
          }
        } else {
          for (let i = 0; i < 6; i++) bands[i] = 0.05;
        }

        noiseSeedRef.current += 0.01;
        stepGpu(gpuRef.current, bands, noiseSeedRef.current);

        // FPS + energy display (1 Hz update)
        fpsFrames.count++;
        if (fpsFrames.epoch === 0) fpsFrames.epoch = now;
        const elapsed = now - fpsFrames.epoch;
        if (elapsed > 1000) {
          setFps(Math.round(fpsFrames.count * 1000 / elapsed));
          setEnergySnap(Array.from(bands));
          fpsFrames.count = 0;
          fpsFrames.epoch = now;
        }

        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    }).catch(e => {
      if (!cancelled) {
        setGpuError(e instanceof Error ? e.message : "WebGPU init failed");
        setMode("idle");
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (demoCtx) void demoCtx.close();
      gpuRef.current?.device.destroy();
      gpuRef.current = null;
    };
  }, [mode, running, getFrame, reshuffleMatrix]);

  const startMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === "mic") startMic();
  }, [startMic]);

  const stopMode = useCallback(() => {
    setMode("idle");
    stopMic();
  }, [stopMic]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-2 tracking-tight">
            Particle Life <span className="text-white/30 text-lg">WebGPU</span>
          </h1>
          <p className="text-sm text-white/55 max-w-sm mb-2 leading-relaxed">
            9,000 particles across 6 species on the GPU. A 6×6 attraction/repulsion matrix
            governs emergent flocking, predator-prey spirals, and orbiting clusters —
            none explicitly programmed.
          </p>
          <p className="text-xs text-white/35 max-w-xs mb-8 leading-relaxed">
            Audio energy injects velocity turbulence per species. Onsets reshuffle the
            matrix → the swarm self-organizes into a new emergent pattern.
            Requires WebGPU (Chrome, Edge, Firefox 147+, Safari 26+).
          </p>

          {gpuError && (
            <p className="mb-5 text-xs text-rose-300/70 max-w-xs leading-relaxed border border-rose-400/20 rounded px-4 py-2">
              {gpuError}
            </p>
          )}

          <div className="flex gap-3 flex-wrap justify-center mb-6">
            <button
              onClick={() => startMode("demo")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start demo
            </button>
            <button
              onClick={() => startMode("mic")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/20 rounded hover:bg-white/5 hover:border-white/40 transition text-white/55"
            >
              Start mic
            </button>
          </div>

          {micError && (
            <p className="text-xs text-rose-300/70 max-w-sm mb-4">{micError}</p>
          )}

          <Link href="/dream" className="text-[11px] text-white/30 hover:text-white/60">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <>
          {/* Matrix heatmap — top-left */}
          {matrixSnap.length === 36 && (
            <div className="absolute top-3 left-3 pointer-events-none select-none">
              <p className="text-[9px] tracking-widest text-white/30 mb-1 uppercase">matrix</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 10px)", gap: 1 }}>
                {matrixSnap.map((v, idx) => {
                  const abs = Math.abs(v);
                  const rv = v < 0 ? Math.round(abs * 200) : 0;
                  const gv = v > 0 ? Math.round(abs * 170) : 0;
                  return (
                    <div
                      key={idx}
                      title={`${SPECIES_NAMES[Math.floor(idx / 6)]}→${SPECIES_NAMES[idx % 6]}: ${v.toFixed(2)}`}
                      style={{
                        width: 10, height: 10,
                        background: `rgb(${rv},${gv},30)`,
                        opacity: 0.25 + abs * 0.75,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* FPS + mode — top-right */}
          <div className="absolute top-3 right-3 text-right text-[10px] tracking-wider text-white/40 space-y-0.5 pointer-events-none select-none">
            <div>{fps} fps</div>
            <div className="uppercase">{mode} — 9k GPU</div>
          </div>

          {/* Energy bars + controls — bottom */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="flex gap-1.5 items-end">
              {SPECIES_NAMES.map((name, i) => {
                const [r, gv, b] = SPECIES_COLORS_F32[i];
                const barH = Math.max(3, energySnap[i] * 44);
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div style={{
                      width: 14, height: barH,
                      background: `rgb(${Math.round(r*255)},${Math.round(gv*255)},${Math.round(b*255)})`,
                      opacity: 0.35 + energySnap[i] * 0.65,
                      transition: "height 80ms linear",
                    }} />
                    <span className="text-[7px] text-white/40 tracking-wider uppercase">
                      {name.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col items-end gap-1">
              <button
                onClick={reshuffleMatrix}
                className="text-[10px] tracking-wider uppercase text-white/55 border border-white/20 hover:border-white/60 hover:text-white px-2.5 py-1 rounded transition"
              >
                reshuffle
              </button>
              <button
                onClick={stopMode}
                className="text-[10px] tracking-wider uppercase text-white/55 border border-white/20 hover:border-white/60 hover:text-white px-2.5 py-1 rounded transition"
              >
                stop
              </button>
              <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
                ← back
              </Link>
              <a
                href="/dream/16-particle-life-gpu/README.md"
                target="_blank"
                rel="noreferrer"
                className="text-[9px] text-white/20 hover:text-white/50 transition"
              >
                design notes ↗
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
