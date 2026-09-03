"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16768-harmonicswarm — Karel's sounding chord progression becomes the rules of
// attraction for a living GPU swarm. A raw-WebGPU compute step drives ~6k–16k
// particles across 6 species; a 6×6 inter-species attraction matrix is rewritten
// every time the chord changes. Consonant triads (major / simple) pull the
// species into glowing filaments; dissonant / altered chords flip the matrix
// negative and the field scatters into churn. Audio is Karel's REAL catalog,
// routed through the ear-safe master bus — never a synth.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WELCOME_HOME_TRACKS,
  SNOWFLAKE_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackChord,
} from "../_shared/trackAnalysis";

// ── Constants ────────────────────────────────────────────────────────────────

const N_SPECIES = 6;
const MATRIX_LEN = N_SPECIES * N_SPECIES; // 36
const R_MAX_NORM = 0.13; // interaction radius in normalized [0,1] space
const FRICTION = 0.965;
const TRAIL_FADE = 0.9; // per-frame trail persistence (slow, no strobe)
const MATRIX_LERP_TAU = 0.7; // seconds — chord change reads as a morph
const NEUTRAL_CONSONANCE = 0.55; // no-analysis fallback: gentle drift

const COUNT_OPTIONS = [6000, 12000, 16000] as const;
const DEFAULT_COUNT = 12000;

// ── WGSL: compute — particle-life physics (workgroup-tiled interaction) ────────

const COMPUTE_WGSL = /* wgsl */ `
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
  bass: f32,
  velScale: f32,
  wellX: f32,
  wellY: f32,
  wellStr: f32,
  driftX: f32,
  driftY: f32,
  seed: f32,
  pad: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> matrix: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

var<workgroup> tile: array<Particle, 64>;

// Reynolds/Ventrella-style asymmetric force curve: a hard repulsive core stops
// collapse; beyond it the sign of the matrix weight g decides attract vs repel.
fn particleForce(r: f32, g: f32) -> f32 {
  if (r < 0.3) { return r / 0.3 - 1.0; }
  return g * (1.0 - abs(2.0 * r - 1.3) / 0.7);
}

fn wrapDelta(dIn: vec2f) -> vec2f {
  var d = dIn;
  if (d.x >  0.5) { d.x -= 1.0; } else if (d.x < -0.5) { d.x += 1.0; }
  if (d.y >  0.5) { d.y -= 1.0; } else if (d.y < -0.5) { d.y += 1.0; }
  return d;
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
        let d = wrapDelta(q.pos - p.pos);
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

  // Pointer / drag gravity well.
  if (abs(params.wellStr) > 0.0001) {
    let dw = wrapDelta(vec2f(params.wellX, params.wellY) - p.pos);
    let dwl = length(dw);
    if (dwl > 0.0005) {
      let fall = 1.0 - smoothstep(0.0, 0.5, dwl);
      force += (dw / dwl) * params.wellStr * fall * 0.02;
    }
  }

  // Bass-driven micro-turbulence keeps the field alive and reactive.
  let seed = f32(i) * 0.01234 + params.seed;
  let noise = vec2f(sin(seed * 127.1 + f32(si)), cos(seed * 311.7 + f32(si)))
              * params.bass * 0.0016;

  var v = (p.vel + force * 0.0006 + noise) * params.friction;
  v += vec2f(params.driftX, params.driftY) * 0.0004; // tilt drift
  let maxSpd = 0.005 * (0.6 + params.velScale);
  let spd = length(v);
  if (spd > maxSpd) { v *= maxSpd / spd; }
  p.vel = v;
  p.pos = fract(p.pos + p.vel);
  particles[i] = p;
}
`;

// ── WGSL: fade — darken the trail texture each frame ───────────────────────────

const FADE_WGSL = /* wgsl */ `
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

// ── WGSL: particles — additive soft-glow point sprites ─────────────────────────

const PARTICLE_WGSL = /* wgsl */ `
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
  let corners = array<vec2f,4>(vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1), vec2f(1,1));
  let corner = corners[vi];
  let spd = length(p.vel);
  let size = 0.0045 + spd * 0.22;
  let ndc = vec2f(p.pos.x * 2.0 - 1.0, 1.0 - p.pos.y * 2.0);
  let si = u32(p.species + 0.5);
  return VO(vec4f(ndc + corner * size, 0.0, 1.0), corner, colUni.cols[si].xyz);
}

@fragment fn fs(v: VO) -> @location(0) vec4f {
  let d = length(v.corner);
  if (d > 1.0) { discard; }
  let a = (1.0 - d * d) * 0.8;
  return vec4f(v.color * a, a);
}
`;

// ── WGSL: display — Reinhard tone-map the trail to the swapchain ───────────────

const DISPLAY_WGSL = /* wgsl */ `
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
  c = c / (1.0 + dot(c, vec3f(0.299, 0.587, 0.114))); // Reinhard
  let mapped = pow(max(c, vec3f(0.0)), vec3f(0.45));
  return vec4f(mapped, 1.0);
}
`;

// ── GPU state ──────────────────────────────────────────────────────────────────

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  canvasFmt: GPUTextureFormat;
  particleBuf: GPUBuffer;
  matrixBuf: GPUBuffer;
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
  count: number;
  texW: number;
  texH: number;
}

const TRAIL_FMT: GPUTextureFormat = "rgba16float";

// ── Colour helpers ─────────────────────────────────────────────────────────────

/** HSL (h 0..360, s/l 0..1) → linear-ish rgb 0..1 for the species tint. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// ── Chord → matrix + palette ───────────────────────────────────────────────────

interface ChordTarget {
  matrix: Float32Array; // 36
  colors: Float32Array; // 24 (6 × rgba)
  consonance: number;
  triad: number[]; // pitch classes
  root: number | null;
}

/** Consonance scalar c∈[0,1]: bright, simple triads high; altered/dim low. */
function chordConsonance(sym: string, minor: boolean): number {
  let c = 1;
  if (minor) c -= 0.32;
  const body = sym.replace(/^[A-Ga-g][#b]?/, "");
  if (/dim|°|o\b/i.test(body)) c -= 0.4;
  if (/b5|#5|#11|b9|#9|alt/i.test(body)) c -= 0.22;
  const ext = body.match(/(7|9|11|13)/g);
  if (ext) c -= Math.min(0.3, ext.length * 0.14);
  if (/sus/i.test(body)) c -= 0.08;
  // long, dense symbols read as more coloured / less resolved
  c -= Math.min(0.15, Math.max(0, body.length - 3) * 0.02);
  return Math.max(0, Math.min(1, c));
}

/** Build the target attraction matrix + species palette for one chord. */
function buildChordTarget(sym: string | null): ChordTarget {
  const root = sym === null ? null : chordRoot(sym);
  const minor = sym === null ? false : chordIsMinor(sym);
  const c = sym === null || root === null
    ? NEUTRAL_CONSONANCE
    : chordConsonance(sym, minor);

  // Triad pitch-class set.
  const triad = root === null
    ? [0, 4, 7]
    : minor
      ? [root % 12, (root + 3) % 12, (root + 7) % 12]
      : [root % 12, (root + 4) % 12, (root + 7) % 12];

  // Matrix: 6 species map to 3 triad "voice roles" (root/third/fifth), doubled.
  // High c → same-role clustering + a directed root→third→fifth→root chain
  // (asymmetry breeds filaments). Low c → mostly negative → scatter / churn.
  const matrix = new Float32Array(MATRIX_LEN);
  for (let i = 0; i < N_SPECIES; i++) {
    for (let j = 0; j < N_SPECIES; j++) {
      const ri = i % 3;
      const rj = j % 3;
      let m: number;
      if (i === j) {
        m = 0.2 * c;
      } else if (ri === rj) {
        m = 0.5 + 0.5 * c; // same voice — cohere into a filament
      } else {
        const forward = rj === (ri + 1) % 3;
        const base = forward ? 1.0 : -0.4;
        m = base * c + -0.5 * (1 - c); // consonant chain vs dissonant repulsion
      }
      matrix[i * N_SPECIES + j] = Math.max(-1, Math.min(1, m));
    }
  }

  // Palette: each species tinted by its triad pitch class's hue. Consonant
  // chords render more saturated & luminous; dissonant ones desaturate slightly.
  const colors = new Float32Array(24);
  for (let i = 0; i < N_SPECIES; i++) {
    const pc = triad[i % 3];
    const hue = pitchClassHue(pc);
    const sat = 0.55 + 0.4 * c;
    const lum = 0.5 + 0.12 * c;
    const [r, g, b] = hslToRgb(hue, sat, lum);
    colors[i * 4 + 0] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = 1;
  }

  return { matrix, colors, consonance: c, triad, root };
}

const PC_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// ── GPU builders ────────────────────────────────────────────────────────────────

function spawnParticles(count: number): Float32Array {
  // Each particle: [posX, posY, velX, velY, species, pad] = 6 f32.
  const buf = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    buf[i * 6 + 0] = Math.random();
    buf[i * 6 + 1] = Math.random();
    buf[i * 6 + 2] = 0;
    buf[i * 6 + 3] = 0;
    buf[i * 6 + 4] = i % N_SPECIES;
    buf[i * 6 + 5] = 0;
  }
  return buf;
}

function makeParticleBuffer(device: GPUDevice, count: number): GPUBuffer {
  const buf = device.createBuffer({
    size: count * 6 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, spawnParticles(count).buffer as ArrayBuffer);
  return buf;
}

function makeTrailTextures(
  device: GPUDevice,
  w: number,
  h: number,
): [GPUTexture, GPUTexture] {
  const mk = (): GPUTexture =>
    device.createTexture({
      size: [w, h],
      format: TRAIL_FMT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
  return [mk(), mk()];
}

async function buildGpu(
  canvas: HTMLCanvasElement,
  count: number,
): Promise<GpuState> {
  const gpu = navigator.gpu;
  if (!gpu) throw new Error("no-webgpu");
  const adapter = await gpu.requestAdapter();
  if (!adapter) throw new Error("no-adapter");
  const device = await adapter.requestDevice();

  const canvasFmt = gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-context");
  ctx.configure({ device, format: canvasFmt, alphaMode: "premultiplied" });

  const texW = Math.max(1, canvas.width);
  const texH = Math.max(1, canvas.height);
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

  const particleBuf = makeParticleBuffer(device, count);

  const matrixBuf = device.createBuffer({
    size: MATRIX_LEN * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const initTarget = buildChordTarget(null);
  device.queue.writeBuffer(matrixBuf, 0, initTarget.matrix.buffer as ArrayBuffer);

  // params: 12 × 4 = 48 bytes.
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
  device.queue.writeBuffer(colBuf, 0, initTarget.colors.buffer as ArrayBuffer);

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
    fragment: { module: fadeMod, entryPoint: "fs", targets: [{ format: TRAIL_FMT }] },
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
          format: TRAIL_FMT,
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
    fragment: { module: dispMod, entryPoint: "fs", targets: [{ format: canvasFmt }] },
    primitive: { topology: "triangle-strip" },
  });

  return {
    device,
    ctx,
    canvasFmt,
    particleBuf,
    matrixBuf,
    paramsBuf,
    fadeBuf,
    colBuf,
    trail: makeTrailTextures(device, texW, texH),
    trailR: 0,
    sampler,
    computePl,
    fadePl,
    particlePl,
    displayPl,
    count,
    texW,
    texH,
  };
}

interface FrameParams {
  bass: number;
  velScale: number;
  wellX: number;
  wellY: number;
  wellStr: number;
  driftX: number;
  driftY: number;
  seed: number;
}

function stepGpu(g: GpuState, fp: FrameParams): void {
  const { device } = g;

  const pu = new Uint32Array(12);
  const pf = new Float32Array(pu.buffer);
  pu[0] = g.count;
  pf[1] = FRICTION;
  pf[2] = R_MAX_NORM;
  pf[3] = fp.bass;
  pf[4] = fp.velScale;
  pf[5] = fp.wellX;
  pf[6] = fp.wellY;
  pf[7] = fp.wellStr;
  pf[8] = fp.driftX;
  pf[9] = fp.driftY;
  pf[10] = fp.seed;
  device.queue.writeBuffer(g.paramsBuf, 0, pu.buffer as ArrayBuffer);

  const trR = g.trailR;
  const trW = (1 - trR) as 0 | 1;
  const enc = device.createCommandEncoder();

  // 1. Compute — physics.
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
    pass.dispatchWorkgroups(Math.ceil(g.count / 64));
    pass.end();
  }

  // 2. Fade previous trail + additive particle render into trail[trW].
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
    pass.draw(4, g.count);
    pass.end();
  }

  // 3. Display — tone-map trail to the swapchain.
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

function destroyGpu(g: GpuState): void {
  try {
    g.particleBuf.destroy();
    g.matrixBuf.destroy();
    g.paramsBuf.destroy();
    g.fadeBuf.destroy();
    g.colBuf.destroy();
    g.trail[0].destroy();
    g.trail[1].destroy();
    g.device.destroy?.();
  } catch {
    /* already torn down */
  }
}

// Binary-search the time-sorted chord list for the one sounding at `pos`.
function chordAt(chords: TrackChord[], pos: number): TrackChord | null {
  if (chords.length === 0) return null;
  let lo = 0;
  let hi = chords.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].time <= pos) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  return chords[idx];
}

// ── Runtime (mutable, non-React) ────────────────────────────────────────────────

interface Runtime {
  audioCtx: AudioContext | null;
  safeMaster: SafeMaster | null;
  source: AudioBufferSourceNode | null;
  freq: Uint8Array<ArrayBuffer> | null;
  chords: TrackChord[];
  startTime: number; // audioCtx.currentTime at source.start
  offset: number; // seconds already played before current start (pause)
  playing: boolean;
  curMatrix: Float32Array;
  curColors: Float32Array;
  wellX: number;
  wellY: number;
  wellStr: number;
  wellTargetStr: number;
  driftX: number;
  driftY: number;
  tiltDriftX: number;
  tiltDriftY: number;
  seed: number;
  lastChordSym: string | null;
}

function makeRuntime(): Runtime {
  const init = buildChordTarget(null);
  return {
    audioCtx: null,
    safeMaster: null,
    source: null,
    freq: null,
    chords: [],
    startTime: 0,
    offset: 0,
    playing: false,
    curMatrix: init.matrix.slice(),
    curColors: init.colors.slice(),
    wellX: 0.5,
    wellY: 0.5,
    wellStr: 0,
    wellTargetStr: 0,
    driftX: 0,
    driftY: 0,
    tiltDriftX: 0,
    tiltDriftY: 0,
    seed: 0,
    lastChordSym: null,
  };
}

interface OrientationEventCtor {
  requestPermission?: () => Promise<"granted" | "denied">;
}

// ── Component ────────────────────────────────────────────────────────────────────

type TrackOpt = { id: string; title: string; group: string };

const TRACK_OPTS: TrackOpt[] = [
  ...WELCOME_HOME_TRACKS.map((t) => ({ ...t, group: "Welcome Home" })),
  ...SNOWFLAKE_TRACKS.map((t) => ({ ...t, group: "Snowflake" })),
];

export default function HarmonicSwarmPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuRef = useRef<GpuState | null>(null);
  const rtRef = useRef<Runtime>(makeRuntime());
  const rafRef = useRef(0);
  const countRef = useRef<number>(DEFAULT_COUNT);

  const [gpuReady, setGpuReady] = useState(false);
  const [gpuUnavailable, setGpuUnavailable] = useState(false);
  const [deviceLost, setDeviceLost] = useState(false);

  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [analysisWarn, setAnalysisWarn] = useState<string | null>(null);
  const [nowTitle, setNowTitle] = useState<string | null>(null);

  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [tilt, setTilt] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const [chordLabel, setChordLabel] = useState<string>("—");
  const [consonance, setConsonance] = useState<number>(NEUTRAL_CONSONANCE);
  const [rootLabel, setRootLabel] = useState<string>("—");
  const [fps, setFps] = useState(0);

  // ── Render loop: built once GPU is ready; reads mutable refs for audio. ──────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const gpu = navigator.gpu;
    if (!gpu) {
      setGpuUnavailable(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const applySize = (): { w: number; h: number } => {
      const w = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      const h = Math.max(1, Math.round(canvas.offsetHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      return { w, h };
    };
    applySize();

    const fpsState = { count: 0, epoch: 0 };
    const hudState = { last: 0 };

    buildGpu(canvas, countRef.current)
      .then((g) => {
        if (cancelled) {
          destroyGpu(g);
          return;
        }
        gpuRef.current = g;
        setGpuReady(true);

        g.device.lost.then((info) => {
          if (cancelled) return;
          if (info.reason !== "destroyed") setDeviceLost(true);
        });

        const tick = (now: number) => {
          const gg = gpuRef.current;
          const rt = rtRef.current;
          if (!gg) return;

          // Resize / count-swap handling.
          const wantW = Math.max(1, Math.round(canvas.offsetWidth * dpr));
          const wantH = Math.max(1, Math.round(canvas.offsetHeight * dpr));
          if (wantW !== gg.texW || wantH !== gg.texH) {
            canvas.width = wantW;
            canvas.height = wantH;
            gg.trail[0].destroy();
            gg.trail[1].destroy();
            gg.trail = makeTrailTextures(gg.device, wantW, wantH);
            gg.trailR = 0;
            gg.texW = wantW;
            gg.texH = wantH;
          }
          if (countRef.current !== gg.count) {
            gg.particleBuf.destroy();
            gg.particleBuf = makeParticleBuffer(gg.device, countRef.current);
            gg.count = countRef.current;
          }

          // Audio → bands.
          let bass = 0.06;
          let energy = 0.0;
          if (rt.playing && rt.safeMaster && rt.freq) {
            rt.safeMaster.analyser.getByteFrequencyData(rt.freq);
            const bins = rt.freq.length;
            const avg = (a: number, b: number): number => {
              let s = 0;
              const lo = Math.max(0, Math.floor(a));
              const hi = Math.min(bins, Math.floor(b));
              for (let k = lo; k < hi; k++) s += rt.freq![k];
              return hi > lo ? s / (hi - lo) / 255 : 0;
            };
            bass = avg(0, bins * 0.08);
            const mid = avg(bins * 0.08, bins * 0.35);
            const treble = avg(bins * 0.35, bins);
            energy = bass * 0.6 + mid * 0.3 + treble * 0.1;
          }

          // Chord → target matrix + palette.
          let target: ChordTarget | null = null;
          if (rt.playing && rt.audioCtx && rt.chords.length > 0) {
            const pos = rt.offset + (rt.audioCtx.currentTime - rt.startTime);
            const ch = chordAt(rt.chords, pos);
            const sym = ch?.chord ?? null;
            if (sym !== rt.lastChordSym) rt.lastChordSym = sym;
            target = buildChordTarget(sym);
          } else {
            target = buildChordTarget(null);
          }

          // Smooth morph toward the target: per-frame lerp for a ~MATRIX_LERP_TAU
          // time constant, so a chord change reads as a transformation not a snap.
          const k = Math.min(1, 1 / 60 / MATRIX_LERP_TAU);
          for (let i = 0; i < MATRIX_LEN; i++) {
            rt.curMatrix[i] += (target.matrix[i] - rt.curMatrix[i]) * k;
          }
          for (let i = 0; i < 24; i++) {
            rt.curColors[i] += (target.colors[i] - rt.curColors[i]) * k;
          }
          gg.device.queue.writeBuffer(gg.matrixBuf, 0, rt.curMatrix.buffer as ArrayBuffer);
          gg.device.queue.writeBuffer(gg.colBuf, 0, rt.curColors.buffer as ArrayBuffer);

          // Well + tilt-drift easing.
          rt.wellStr += (rt.wellTargetStr - rt.wellStr) * 0.12;
          rt.driftX += (rt.tiltDriftX - rt.driftX) * 0.05;
          rt.driftY += (rt.tiltDriftY - rt.driftY) * 0.05;
          rt.seed += 0.013;

          stepGpu(gg, {
            bass,
            velScale: energy,
            wellX: rt.wellX,
            wellY: rt.wellY,
            wellStr: rt.wellStr,
            driftX: rt.driftX,
            driftY: rt.driftY,
            seed: rt.seed,
          });

          // HUD ~4 Hz.
          fpsState.count++;
          if (fpsState.epoch === 0) fpsState.epoch = now;
          const el = now - fpsState.epoch;
          if (el > 1000) {
            setFps(Math.round((fpsState.count * 1000) / el));
            fpsState.count = 0;
            fpsState.epoch = now;
          }
          if (now - hudState.last > 250) {
            hudState.last = now;
            setConsonance(target.consonance);
            setChordLabel(rt.lastChordSym ?? "—");
            setRootLabel(target.root === null ? "—" : PC_NAMES[target.root]);
          }

          if (!cancelled) rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "no-webgpu" || msg === "no-adapter") setGpuUnavailable(true);
        else setDeviceLost(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (gpuRef.current) {
        destroyGpu(gpuRef.current);
        gpuRef.current = null;
      }
    };
    // Mount-once: the loop reads live audio state from refs, not props, so it
    // depends only on stable refs / setState setters.
  }, []);

  // ── Pointer gravity well ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const toNorm = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      ];
    };
    const down = (e: PointerEvent) => {
      const rt = rtRef.current;
      const [x, y] = toNorm(e);
      rt.wellX = x;
      rt.wellY = y;
      rt.wellTargetStr = 1;
    };
    const move = (e: PointerEvent) => {
      const rt = rtRef.current;
      if (rt.wellTargetStr === 0) return;
      const [x, y] = toNorm(e);
      rt.wellX = x;
      rt.wellY = y;
    };
    const up = () => {
      rtRef.current.wellTargetStr = 0;
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ── Device-orientation tilt (opt-in) ───────────────────────────────────────────
  useEffect(() => {
    if (!tilt) {
      rtRef.current.tiltDriftX = 0;
      rtRef.current.tiltDriftY = 0;
      return;
    }
    const onOrient = (e: DeviceOrientationEvent) => {
      const rt = rtRef.current;
      const gamma = e.gamma ?? 0; // left/right [-90,90]
      const beta = e.beta ?? 0; // front/back [-180,180]
      rt.tiltDriftX = Math.max(-1, Math.min(1, gamma / 45));
      rt.tiltDriftY = Math.max(-1, Math.min(1, beta / 45));
    };
    let active = true;
    const attach = () => {
      if (active) window.addEventListener("deviceorientation", onOrient);
    };
    const ctor = (typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as OrientationEventCtor)
      : null);
    if (ctor?.requestPermission) {
      ctor.requestPermission().then((res) => {
        if (res === "granted") attach();
      }).catch(() => {});
    } else {
      attach();
    }
    return () => {
      active = false;
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [tilt]);

  // ── Keep the swarm's particle count in sync with the control. ──────────────────
  useEffect(() => {
    countRef.current = count;
  }, [count]);

  // ── Teardown audio only (helper). ──────────────────────────────────────────────
  const teardownAudio = useCallback(() => {
    const rt = rtRef.current;
    try {
      rt.source?.stop();
    } catch {
      /* not started */
    }
    try {
      rt.source?.disconnect();
    } catch {
      /* already gone */
    }
    rt.safeMaster?.disconnect();
    if (rt.audioCtx && rt.audioCtx.state !== "closed") void rt.audioCtx.close();
    rt.source = null;
    rt.safeMaster = null;
    rt.audioCtx = null;
    rt.freq = null;
    rt.chords = [];
    rt.playing = false;
    rt.lastChordSym = null;
  }, []);

  // ── Play / stop ─────────────────────────────────────────────────────────────────
  const runPlay = useCallback(async () => {
    if (loading) return;
    setAudioError(null);
    setAnalysisWarn(null);
    // Stop anything already playing.
    teardownAudio();
    setPlaying(false);
    setLoading(true);
    try {
      const ctx = new AudioContext();
      const master = createSafeMaster(ctx);
      const { buffer, title, id } = await loadRealTrackBuffer(ctx, trackId);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master.input); // EVERY audible node → safeMaster.input
      source.onended = () => {
        // Natural end: mark stopped (guard against manual stop double-fire).
        if (rtRef.current.source === source) {
          rtRef.current.playing = false;
          setPlaying(false);
        }
      };

      // Analysis (may be null / empty → neutral drift).
      const analysis = await loadTrackAnalysis(id).catch(() => null);
      const chords = analysis?.chords ?? [];
      if (!analysis || chords.length === 0) {
        setAnalysisWarn(
          "No chord analysis for this track — the swarm drifts on a neutral matrix.",
        );
      }

      const rt = rtRef.current;
      rt.audioCtx = ctx;
      rt.safeMaster = master;
      rt.source = source;
      rt.freq = new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount));
      rt.chords = chords;
      rt.offset = 0;
      rt.lastChordSym = null;

      if (ctx.state === "suspended") await ctx.resume();
      rt.startTime = ctx.currentTime;
      source.start();
      rt.playing = true;

      setNowTitle(title);
      setPlaying(true);
    } catch (e) {
      teardownAudio();
      setAudioError(
        e instanceof Error && e.message.startsWith("audio")
          ? "Couldn't load that track's audio. Try another, or check your connection."
          : "Audio failed to start. Try again or pick another track.",
      );
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [loading, trackId, teardownAudio]);

  const runStop = useCallback(() => {
    teardownAudio();
    setPlaying(false);
    setNowTitle(null);
  }, [teardownAudio]);

  // ── Full teardown on unmount. ──────────────────────────────────────────────────
  useEffect(() => {
    const teardown = teardownAudio;
    return () => {
      teardown();
    };
  }, [teardownAudio]);

  // ── No-WebGPU / device-lost notice ─────────────────────────────────────────────
  const hardError = gpuUnavailable || deviceLost;

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ background: "#04060d" }}
        aria-hidden
      />

      {/* Hard error overlay — clean centered house-style notice. */}
      {hardError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Harmonic Swarm
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            {deviceLost
              ? "The WebGPU device was lost. Reload the page to restart the swarm."
              : "This piece needs WebGPU — open in Safari 26+/Chrome/Edge on a recent device."}
          </p>
          <Link
            href="/dream"
            className="mt-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← back to dream lab
          </Link>
        </div>
      )}

      {/* Header — top-left. */}
      {!hardError && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col gap-1 p-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow">
            Harmonic Swarm
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            Karel&apos;s chord progression is the law of attraction for a living
            GPU swarm — consonance pulls the species into filaments, dissonance
            scatters them into churn.
          </p>
        </div>
      )}

      {/* Chord / consonance readout — top-right. */}
      {!hardError && (
        <div className="pointer-events-none absolute right-5 top-5 z-10 flex flex-col items-end gap-1 text-right">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Sounding chord
          </span>
          <span className="font-mono text-lg text-foreground">{chordLabel}</span>
          <span className="font-mono text-xs text-muted-foreground">
            root {rootLabel} · {fps} fps
          </span>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${Math.round(consonance * 100)}%` }}
            />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            consonance
          </span>
        </div>
      )}

      {/* Control dock — bottom. */}
      {!hardError && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-end justify-between gap-4 p-5">
          <div className="flex flex-wrap items-end gap-3">
            {/* Track picker. */}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Track
              </span>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/80 px-3 text-sm text-foreground backdrop-blur"
              >
                <optgroup label="Welcome Home">
                  {TRACK_OPTS.filter((t) => t.group === "Welcome Home").map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Snowflake">
                  {TRACK_OPTS.filter((t) => t.group === "Snowflake").map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>

            {/* Play / stop. */}
            {!playing ? (
              <button
                type="button"
                onClick={() => void runPlay()}
                disabled={loading || !gpuReady}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Play"}
              </button>
            ) : (
              <button
                type="button"
                onClick={runStop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-6 text-sm font-medium text-foreground backdrop-blur hover:bg-muted"
              >
                Stop
              </button>
            )}

            {/* Particle-count control. */}
            <div className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Particles
              </span>
              <div className="flex overflow-hidden rounded-md border border-border">
                {COUNT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCount(c)}
                    className={`min-h-[44px] px-3 text-sm backdrop-blur ${
                      count === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {c / 1000}k
                  </button>
                ))}
              </div>
            </div>

            {/* Tilt toggle. */}
            <button
              type="button"
              onClick={() => setTilt((v) => !v)}
              className={`min-h-[44px] rounded-md border border-border px-4 text-sm backdrop-blur ${
                tilt
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              Tilt {tilt ? "on" : "off"}
            </button>
          </div>

          <div className="flex flex-col items-end gap-2">
            {nowTitle && (
              <span className="font-mono text-xs text-muted-foreground">
                ♪ {nowTitle} — drag the field to steer the swarm
              </span>
            )}
            {audioError && <span className="text-sm text-destructive">{audioError}</span>}
            {analysisWarn && (
              <span className="max-w-xs text-right text-sm text-destructive">
                {analysisWarn}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="rounded-md border border-border bg-background/60 px-4 py-2 text-sm text-muted-foreground backdrop-blur hover:bg-muted"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {/* Design-notes modal. */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Harmonic Swarm — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Tens of thousands of GPU particles are split into six species. A
                6×6 matrix says how strongly each species is drawn to (or pushed
                from) every other — the classic &ldquo;Particle Life&rdquo; rule
                set. Here that matrix is not random: it is rewritten every time
                Karel&apos;s sounding chord changes.
              </p>
              <p>
                The chord is parsed into its triad and a consonance scalar. Bright,
                simple triads write a mostly-positive, structured matrix and the
                species knit into glowing filaments; minor, diminished, and altered
                chords flip weights negative and the field scatters into churn. The
                matrix morphs smoothly across ~0.7s so a chord change reads as a
                transformation, not a snap. Each species is tinted by a triad
                pitch-class hue; the bass band drives velocity and turbulence.
              </p>
              <p>
                Everything runs in raw WebGPU: a compute shader steps the physics
                (workgroup-tiled interaction with a repulsive core), particles are
                drawn additively into an rgba16float trail buffer, and a Reinhard
                pass tone-maps to the screen. Audio is Karel&apos;s real catalog,
                routed through the ear-safe master bus — never a synth.
              </p>
              <p className="text-xs">
                References: Craig Reynolds (Boids), Jeffrey Ventrella & Tom Mohr
                (Particle Life), Codrops &ldquo;Run Rob Run&rdquo; music-reactive
                WebGPU goo (2026-08-20), the SYTHM strange-attractor visualizer.
                This is not the lab&apos;s first GPU-compute particle physics
                (16-particle-life-gpu predates it) — it is the first to put a real
                sounding chord progression in the driver&apos;s seat of the
                attraction matrix.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
