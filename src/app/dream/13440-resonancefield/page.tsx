"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 13440-resonancefield · "Sympathetic Resonance" (WebGPU-compute candidate)
//
//   Karel's REAL piano recording plays, and its note-roll excites a physical
//   model of the WHOLE instrument: a bank of damped resonators (MIDI 21..108),
//   coupled so a struck string bleeds energy into harmonically-related strings
//   that share partials (octave, twelfth, fifth …). What you SEE is the
//   sympathetic AFTERGLOW an ordinary note-visualizer misses — a blooming 2D
//   energy field, pitch on the vertical axis, a scrolling time-bloom on the
//   horizontal.
//
//   COMPUTE = the resonator-bank integration + sympathetic coupling run on the
//             GPU in a WGSL compute shader, ping-ponging two storage buffers for
//             the state each frame, writing the bloom into a storage texture.
//   FALLBACK = if WebGPU is absent (headless CI, no adapter), the SAME model
//              runs on the CPU at lower resolution into a Canvas2D bloom, so the
//              piece still demos. A small note marks the fallback path.
//
//   The math IS the reading: structure comes from HIS note-roll, not an FFT.
// ─────────────────────────────────────────────────────────────────────────────

// ── the resonator bank ──────────────────────────────────────────────────────
const MIDI_LOW = 21;
const MIDI_HIGH = 108;
const N = MIDI_HIGH - MIDI_LOW + 1; // 88 resonators
const K = 12; // max coupled partners stored per resonator (flattened for GPU)

// per-frame dynamics (dt-normalised so GPU and CPU read identically)
const TAU_TAIL = 3.2; // seconds — the slow sympathetic decay you see linger
const SPREAD = 0.8; // fraction of a struck onset that bleeds to coupled strings
const INJECT_GAIN = 1.5; // scales velocity^2 onset impulses
const HELD_SUSTAIN = 0.35; // gentle feed while a key is still down

// ART palette — warm-through-violet bloom on graphite (canvas/WGSL only, never
// in className). Non-cosmic: no gold nebula, no cyan void.
const GRAPHITE: [number, number, number] = [11, 10, 16];
const COLOR_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, GRAPHITE],
  [0.18, [40, 20, 74]], // deep violet ember
  [0.42, [91, 46, 201]], // resonance violet (#5b2ec9)
  [0.62, [176, 67, 224]], // magenta (#b043e0)
  [0.8, [255, 110, 90]], // warm rose
  [1.0, [255, 202, 150]], // hot amber highlight at the peaks
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Precompute the sympathetic coupling kernel. Two strings couple when their
// frequency ratio lands near a simple ratio (shared partials). Octave / twelfth
// / fifth dominate; the transfer is mutual (a lattice of coupled oscillators).
const COUPLE_RATIOS: Array<{ r: number; w: number }> = [
  { r: 2, w: 0.55 }, // octave (2:1)
  { r: 3, w: 0.42 }, // twelfth (3:1)
  { r: 1.5, w: 0.38 }, // perfect fifth (3:2)
  { r: 4, w: 0.3 }, // double octave (4:1)
  { r: 4 / 3, w: 0.22 }, // perfect fourth (4:3)
  { r: 2.5, w: 0.18 }, // major tenth (5:2)
  { r: 1.25, w: 0.16 }, // major third (5:4)
];
const CENTS_TOL = 24; // how close a ratio must land to count as coupled

interface Coupling {
  idx: Int32Array<ArrayBuffer>; // N*K partner indices (or -1 padding)
  w: Float32Array<ArrayBuffer>; // N*K partner weights
}

function buildCoupling(): Coupling {
  const freqs = new Float32Array(N);
  for (let i = 0; i < N; i++) freqs[i] = midiToFreq(MIDI_LOW + i);

  const edges: Array<Array<{ j: number; w: number }>> = [];
  for (let i = 0; i < N; i++) edges.push([]);

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const ratio = freqs[j] / freqs[i];
      let best = 0;
      for (const { r, w } of COUPLE_RATIOS) {
        const cents = Math.abs(1200 * Math.log2(ratio / r));
        if (cents < CENTS_TOL && w > best) best = w;
      }
      if (best > 0) {
        // sympathy is mutual — both strings ring the other
        edges[i].push({ j, w: best });
        edges[j].push({ j: i, w: best });
      }
    }
  }

  const idx = new Int32Array(N * K).fill(-1);
  const w = new Float32Array(N * K);
  for (let i = 0; i < N; i++) {
    const list = edges[i].sort((a, b) => b.w - a.w).slice(0, K);
    for (let k = 0; k < list.length; k++) {
      idx[i * K + k] = list[k].j;
      w[i * K + k] = list[k].w;
    }
  }
  return { idx, w };
}

// ── colour ramp (shared math; WGSL mirrors it) ──────────────────────────────
function colormap(x: number): [number, number, number] {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  for (let s = 1; s < COLOR_STOPS.length; s++) {
    const [t1, c1] = COLOR_STOPS[s];
    if (t <= t1) {
      const [t0, c0] = COLOR_STOPS[s - 1];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
}

// ── a seeded synthetic note-roll for tracks with no published analysis ───────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticNotes(): TrackNote[] {
  const rnd = mulberry32(0x13440);
  const out: TrackNote[] = [];
  // a slow deterministic arpeggio wandering a pentatonic scale, so the field
  // still blooms and shows coupling even without his real note-roll.
  const scale = [0, 2, 4, 7, 9];
  let t = 0.4;
  let center = 52;
  for (let n = 0; n < 260; n++) {
    center += Math.round((rnd() - 0.5) * 5);
    center = Math.max(30, Math.min(84, center));
    const deg = scale[(n * 3 + Math.floor(rnd() * 5)) % scale.length];
    const oct = 12 * Math.floor(rnd() * 3);
    const midi = Math.max(MIDI_LOW, Math.min(MIDI_HIGH, 24 + deg + oct + (center - 52)));
    out.push({
      midi,
      time: t,
      duration: 0.4 + rnd() * 1.6,
      velocity: 46 + Math.floor(rnd() * 70),
    });
    t += 0.16 + rnd() * 0.5;
  }
  return out;
}

// ── CPU model step (mirrors the compute shader exactly) ──────────────────────
function stepModelCPU(
  energy: Float32Array,
  prev: Float32Array,
  inject: Float32Array,
  coup: Coupling,
  dt: number,
): void {
  const damp = Math.exp(-dt / TAU_TAIL);
  prev.set(energy);
  for (let i = 0; i < N; i++) {
    // decay the slow tail + this string's own fresh onset energy, then pull a
    // fraction of every harmonic PARTNER's fresh onset (the sympathetic bleed).
    // Coupling reads the onset vector, not accumulated energy, so partners get a
    // single selective impulse and then ring down on their own tail — no runaway
    // and no washing-out to a uniform field.
    let e = prev[i] * damp + inject[i];
    let sym = 0;
    for (let k = 0; k < K; k++) {
      const j = coup.idx[i * K + k];
      if (j < 0) break;
      sym += inject[j] * coup.w[i * K + k];
    }
    e += sym * SPREAD;
    energy[i] = e;
  }
}

// energy -> normalised brightness (shared with WGSL)
function brightness(e: number): number {
  return 1 - Math.exp(-e * 2.1);
}

// ── WGSL: the compute shader IS the physics ──────────────────────────────────
const FIELD_W = 320; // scroll columns (time axis) on the GPU field texture

const COLORMAP_WGSL = /* wgsl */ `
fn colormap(x: f32) -> vec3<f32> {
  let t = clamp(x, 0.0, 1.0);
  let g = vec3<f32>(0.043, 0.039, 0.063);
  let a = vec3<f32>(0.157, 0.078, 0.290);
  let b = vec3<f32>(0.357, 0.180, 0.788);
  let c = vec3<f32>(0.690, 0.263, 0.878);
  let d = vec3<f32>(1.000, 0.431, 0.353);
  let e = vec3<f32>(1.000, 0.792, 0.588);
  if (t < 0.18) { return mix(g, a, t / 0.18); }
  if (t < 0.42) { return mix(a, b, (t - 0.18) / 0.24); }
  if (t < 0.62) { return mix(b, c, (t - 0.42) / 0.20); }
  if (t < 0.80) { return mix(c, d, (t - 0.62) / 0.18); }
  return mix(d, e, (t - 0.80) / 0.20);
}`;

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  damp: f32, spread: f32, dt: f32, col: f32,
  width: f32, ncells: f32, kmax: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> prevE: array<f32>;
@group(0) @binding(2) var<storage, read_write> nextE: array<f32>;
@group(0) @binding(3) var<storage, read> inj: array<f32>;
@group(0) @binding(4) var<storage, read> coupIdx: array<i32>;
@group(0) @binding(5) var<storage, read> coupW: array<f32>;
@group(0) @binding(6) var field: texture_storage_2d<rgba8unorm, write>;
${COLORMAP_WGSL}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let n = u32(P.ncells);
  if (i >= n) { return; }
  let km = u32(P.kmax);
  // decay + own onset, then pull a fraction of each harmonic partner's fresh
  // onset — the sympathetic bleed, selective and stable (coupling on the GPU).
  var e = prevE[i] * P.damp + inj[i];
  var sym = 0.0;
  for (var k: u32 = 0u; k < km; k = k + 1u) {
    let j = coupIdx[i * km + k];
    if (j < 0) { break; }
    sym = sym + inj[u32(j)] * coupW[i * km + k];
  }
  e = e + sym * P.spread;
  nextE[i] = e;
  let v = 1.0 - exp(-e * 2.1);
  let rgb = colormap(v);
  textureStore(field, vec2<i32>(i32(P.col), i32(i)), vec4<f32>(rgb, 1.0));
}`;

const RENDER_WGSL = /* wgsl */ `
struct Params {
  damp: f32, spread: f32, dt: f32, col: f32,
  width: f32, ncells: f32, kmax: f32, pad: f32,
};
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, (p[vi].y + 1.0) * 0.5);
  return o;
}
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var field: texture_2d<f32>;
@group(0) @binding(2) var<uniform> R: Params;
@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let W = R.width;
  // newest column sits at the right edge; scroll leftward through history.
  let colf = R.col - (1.0 - in.uv.x) * (W - 1.0);
  let u = fract(colf / W + 1.0);
  let vpix = 1.0 - in.uv.y;               // low pitch at the bottom
  let base = textureSample(field, samp, vec2<f32>(u, vpix)).rgb;
  let texel = vec2<f32>(1.0 / W, 1.0 / R.ncells);
  var glow = vec3<f32>(0.0);
  for (var dx = -3; dx <= 3; dx = dx + 1) {
    for (var dy = -3; dy <= 3; dy = dy + 1) {
      let wgt = 1.0 / (1.0 + f32(dx * dx + dy * dy));
      let uu = fract(u + f32(dx) * texel.x + 1.0);
      let vv = clamp(vpix + f32(dy) * texel.y, 0.0, 1.0);
      glow = glow + textureSample(field, samp, vec2<f32>(uu, vv)).rgb * wgt;
    }
  }
  glow = glow * 0.05;
  let graphite = vec3<f32>(0.043, 0.039, 0.063);
  let col = graphite + base * 0.85 + glow * 0.75;
  return vec4<f32>(col, 1.0);
}`;

// ── GPU renderer bundle ──────────────────────────────────────────────────────
interface GpuBundle {
  device: GPUDevice;
  step: (inject: Float32Array<ArrayBuffer>, col: number, dt: number) => void;
  destroy: () => void;
}

async function initGpu(
  canvas: HTMLCanvasElement,
  coup: Coupling,
): Promise<GpuBundle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const stateA = device.createBuffer({
    size: N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const stateB = device.createBuffer({
    size: N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const injBuf = device.createBuffer({
    size: N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const idxBuf = device.createBuffer({
    size: coup.idx.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const wBuf = device.createBuffer({
    size: coup.w.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(idxBuf, 0, coup.idx);
  device.queue.writeBuffer(wBuf, 0, coup.w);
  const paramBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const fieldTex = device.createTexture({
    size: [FIELD_W, N],
    format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const fieldView = fieldTex.createView();
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "clamp-to-edge",
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: RENDER_WGSL }), entryPoint: "vmain" },
    fragment: {
      module: device.createShaderModule({ code: RENDER_WGSL }),
      entryPoint: "fmain",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  const cLayout = computePipeline.getBindGroupLayout(0);
  const mkCompute = (prev: GPUBuffer, next: GPUBuffer) =>
    device.createBindGroup({
      layout: cLayout,
      entries: [
        { binding: 0, resource: { buffer: paramBuf } },
        { binding: 1, resource: { buffer: prev } },
        { binding: 2, resource: { buffer: next } },
        { binding: 3, resource: { buffer: injBuf } },
        { binding: 4, resource: { buffer: idxBuf } },
        { binding: 5, resource: { buffer: wBuf } },
        { binding: 6, resource: fieldView },
      ],
    });
  const bgAB = mkCompute(stateA, stateB);
  const bgBA = mkCompute(stateB, stateA);
  const renderBg = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: fieldView },
      { binding: 2, resource: { buffer: paramBuf } },
    ],
  });

  let pingpong = 0;
  const params = new Float32Array(8);

  const step = (inject: Float32Array<ArrayBuffer>, col: number, dt: number) => {
    device.queue.writeBuffer(injBuf, 0, inject);
    params[0] = Math.exp(-dt / TAU_TAIL); // damp
    params[1] = SPREAD;
    params[2] = dt;
    params[3] = col;
    params[4] = FIELD_W;
    params[5] = N;
    params[6] = K;
    params[7] = 0;
    device.queue.writeBuffer(paramBuf, 0, params);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, pingpong === 0 ? bgAB : bgBA);
    cpass.dispatchWorkgroups(Math.ceil(N / 64));
    cpass.end();

    const view = ctx.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBg);
    rpass.draw(3);
    rpass.end();
    device.queue.submit([enc.finish()]);
    pingpong ^= 1;
  };

  const destroy = () => {
    stateA.destroy();
    stateB.destroy();
    injBuf.destroy();
    idxBuf.destroy();
    wBuf.destroy();
    paramBuf.destroy();
    fieldTex.destroy();
    device.destroy();
  };

  return { device, step, destroy };
}

// ── CPU renderer bundle (the fallback the headless reviewer sees) ─────────────
interface CpuBundle {
  step: (inject: Float32Array<ArrayBuffer>, col: number, dt: number) => void;
  destroy: () => void;
}

const CPU_W = 220; // scroll columns at fallback resolution

function initCpu(canvas: HTMLCanvasElement, coup: Coupling): CpuBundle | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // offscreen field at model resolution (CPU_W x N), scaled up with a bloom.
  const field = document.createElement("canvas");
  field.width = CPU_W;
  field.height = N;
  const fctx = field.getContext("2d");
  if (!fctx) return null;
  const img = fctx.createImageData(CPU_W, N);
  // opaque graphite base
  for (let p = 0; p < CPU_W * N; p++) {
    img.data[p * 4] = GRAPHITE[0];
    img.data[p * 4 + 1] = GRAPHITE[1];
    img.data[p * 4 + 2] = GRAPHITE[2];
    img.data[p * 4 + 3] = 255;
  }

  const energy = new Float32Array(N);
  const prev = new Float32Array(N);

  const step = (inject: Float32Array<ArrayBuffer>, colRaw: number, dt: number) => {
    stepModelCPU(energy, prev, inject, coup, dt);
    const col = colRaw % CPU_W;
    // write the newest energies into this ring column (row 0 = low pitch)
    for (let i = 0; i < N; i++) {
      const [r, g, b] = colormap(brightness(energy[i]));
      const p = (i * CPU_W + col) * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
    }
    fctx.putImageData(img, 0, 0);

    // draw scaled to the visible canvas, newest column at the right edge.
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = `rgb(${GRAPHITE[0]},${GRAPHITE[1]},${GRAPHITE[2]})`;
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // flip vertically (low pitch at bottom) and unwrap the ring in two slices.
    ctx.save();
    ctx.translate(0, h);
    ctx.scale(1, -1);
    const older = col + 1; // oldest column index
    const rightCount = CPU_W - older; // columns older..end -> left of the image
    const sliceX = (rightCount / CPU_W) * w;
    // left part of screen: oldest columns
    if (rightCount > 0) {
      ctx.drawImage(field, older, 0, rightCount, N, 0, 0, sliceX, h);
    }
    // right part of screen: newest columns 0..col
    ctx.drawImage(field, 0, 0, older, N, sliceX, 0, w - sliceX, h);
    ctx.restore();

    // additive bloom pass — soft glow lifted off the field itself.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5;
    if (typeof ctx.filter === "string") ctx.filter = "blur(7px)";
    ctx.translate(0, h);
    ctx.scale(1, -1);
    if (rightCount > 0) ctx.drawImage(field, older, 0, rightCount, N, 0, 0, sliceX, h);
    ctx.drawImage(field, 0, 0, older, N, sliceX, 0, w - sliceX, h);
    ctx.restore();
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  };

  const destroy = () => {
    /* nothing retained beyond the closures; GC reclaims the offscreen canvas */
  };

  return { step, destroy };
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);

  const coupRef = useRef<Coupling | null>(null);
  const notesRef = useRef<TrackNote[]>([]);
  const injectRef = useRef<Float32Array<ArrayBuffer>>(new Float32Array(N));
  const cursorRef = useRef(0);
  const lastNoteTRef = useRef(0);
  const demoTRef = useRef(0);
  const loopLenRef = useRef(30);
  const colRef = useRef(0);
  const lastTsRef = useRef(0);

  const gpuRef = useRef<GpuBundle | null>(null);
  const cpuRef = useRef<CpuBundle | null>(null);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const [usingFallback, setUsingFallback] = useState<boolean | null>(null);
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Load a track's note-roll into the model (or a seeded synthetic roll).
  const loadRoll = useCallback(async (id: string) => {
    let notes: TrackNote[] | null = null;
    try {
      const analysis = await loadTrackAnalysis(id);
      if (analysis && analysis.notes.length > 0) notes = analysis.notes;
    } catch {
      notes = null;
    }
    if (!notes) {
      notes = syntheticNotes();
      setAnalysisMissing(true);
    } else {
      setAnalysisMissing(false);
    }
    notesRef.current = notes;
    const last = notes.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
    loopLenRef.current = Math.max(20, last + 4);
    cursorRef.current = 0;
    lastNoteTRef.current = 0;
    demoTRef.current = 0;
  }, []);

  // Walk the note-roll up to time `t`, accumulating onset + sustain energy.
  const collectInject = useCallback((t: number, dt: number) => {
    const inject = injectRef.current;
    inject.fill(0);
    const notes = notesRef.current;
    const last = lastNoteTRef.current;
    if (t < last) cursorRef.current = 0; // clock wrapped (demo loop)

    // fresh onsets since the last frame -> velocity^2 impulse
    let c = cursorRef.current;
    while (c < notes.length && notes[c].time <= t) {
      const n = notes[c];
      if (n.time > last) {
        const idx = n.midi - MIDI_LOW;
        if (idx >= 0 && idx < N) {
          const vn = Math.min(1, n.velocity / 127);
          inject[idx] += vn * vn * INJECT_GAIN;
        }
      }
      c++;
    }
    cursorRef.current = c;
    lastNoteTRef.current = t;

    // gentle sustain while a key is still held (struck string keeps ringing).
    // scan a small window backward from the cursor.
    const start = Math.max(0, c - 48);
    for (let k = start; k < c; k++) {
      const n = notes[k];
      if (n.time <= t && t < n.time + n.duration) {
        const idx = n.midi - MIDI_LOW;
        if (idx >= 0 && idx < N) {
          const vn = Math.min(1, n.velocity / 127);
          inject[idx] += vn * vn * HELD_SUSTAIN * dt;
        }
      }
    }
  }, []);

  const frame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt <= 0 || dt > 0.05) dt = 0.016;

      // clock: real audio time when playing, else a looping muted demo clock.
      let t: number;
      if (phaseRef.current === "playing" && ctxRef.current) {
        t = ctxRef.current.currentTime - startedAtRef.current;
      } else {
        demoTRef.current += dt;
        if (demoTRef.current > loopLenRef.current) demoTRef.current = 0;
        t = demoTRef.current;
      }

      collectInject(t, dt);
      const col = colRef.current;
      if (gpuRef.current) gpuRef.current.step(injectRef.current, col, dt);
      else if (cpuRef.current) cpuRef.current.step(injectRef.current, col, dt);
      colRef.current = col + 1;
    },
    [collectInject],
  );

  // one-time setup: coupling kernel, renderer (GPU or CPU), seeded demo loop.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    coupRef.current = buildCoupling();

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(r.width * dpr));
      canvas.height = Math.max(2, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    (async () => {
      await loadRoll(REAL_TRACKS[0].id);
      if (cancelled) return;
      const coup = coupRef.current;
      if (!coup) return;
      let gpu: GpuBundle | null = null;
      try {
        gpu = await initGpu(canvas, coup);
      } catch {
        gpu = null; // any GPU init failure → CPU fallback
      }
      if (cancelled) {
        gpu?.destroy();
        return;
      }
      if (gpu) {
        gpuRef.current = gpu;
        setUsingFallback(false);
      } else {
        cpuRef.current = initCpu(canvas, coup);
        setUsingFallback(true);
      }
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      gpuRef.current?.destroy();
      gpuRef.current = null;
      cpuRef.current?.destroy();
      cpuRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    setPhase("idle");
    demoTRef.current = 0;
  }, []);

  const play = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();
      let master = masterRef.current;
      if (!master) {
        master = createSafeMaster(ctx);
        masterRef.current = master;
      }
      await loadRoll(track.id);
      const wh = await loadRealTrackBuffer(ctx, track.id);
      try {
        sourceRef.current?.stop();
      } catch {
        /* none playing */
      }
      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.connect(master.input);
      src.onended = () => {
        if (sourceRef.current === src) stopAudio();
      };
      startedAtRef.current = ctx.currentTime;
      cursorRef.current = 0;
      lastNoteTRef.current = 0;
      src.start();
      sourceRef.current = src;
      setPhase("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start playback.");
      setPhase("idle");
    }
  }, [track, stopAudio, loadRoll]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stopAudio();
      void loadRoll(id);
    },
    [stopAudio, loadRoll],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* title block */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            resonancefield · sympathetic resonance
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            His sound as a resonance bloom
          </h1>
          <p className="text-base text-muted-foreground">
            Karel&apos;s real recording excites a physical model of the whole
            piano: 88 coupled, damped resonators. When he strikes a key, its
            energy bleeds into harmonically-related strings — so you see the
            sympathetic afterglow ordinary note-visualizers miss. Pitch runs
            vertically; the bloom scrolls through time.
          </p>
        </header>
      </div>

      {/* bottom control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {analysisMissing && (
          <p className="text-sm text-muted-foreground">
            No published note-roll for this track — the field is running a
            seeded synthetic roll for the visual. Audio still plays the real
            recording.
          </p>
        )}
        {usingFallback === true && (
          <p className="text-sm text-muted-foreground">
            WebGPU unavailable here — running the same resonator model on the
            CPU + Canvas2D at lower resolution.
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              track
            </span>
            <select
              value={track.id}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>

          {phase !== "playing" ? (
            <button
              onClick={() => void play()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading…" : "Play his recording"}
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop
            </button>
          )}

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {phase === "playing" ? "playing" : "muted bloom"} ·{" "}
            {usingFallback === null ? "starting" : usingFallback ? "cpu" : "webgpu"} ·{" "}
            {track.title}
          </span>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Every piano string is a resonator. Lift the dampers and a struck
                note sets neighbouring strings ringing wherever they share a
                partial — this is <em>sympathetic resonance</em>, and it&apos;s
                the physical basis of the instrument&apos;s bloom. We model the
                whole soundboard as a{" "}
                <span className="font-mono">coupled-oscillator lattice</span>:
                one damped resonator per key (MIDI 21–108), with a precomputed
                coupling kernel where octave, twelfth and fifth relations
                dominate.
              </p>
              <p>
                <strong>The compute.</strong> Each frame the resonator bank
                integrates on the GPU in a WGSL compute shader —{" "}
                <span className="font-mono">e ·= damp</span>, inject his onset
                energy (<span className="font-mono">velocity²</span>), then pull
                a fraction along every coupling edge — ping-ponging two storage
                buffers for the state and writing the coloured bloom straight
                into a storage texture. Per-cell integration is embarrassingly
                parallel, which is exactly what a compute shader is for.
              </p>
              <p>
                <strong>Why it reads HIS playing.</strong> The excitation is his
                real note-roll (<span className="font-mono">midi / time /
                duration / velocity</span>), synced to the audio clock — not an
                FFT. So the vertical harmonic ridges that light up above each
                struck key are the sympathetic afterglow of <em>his</em> actual
                touch, not a spectrum readout.
              </p>
              <p>
                <strong>Honest caveat.</strong> This is a plausibility model of
                coupled strings, not a measurement of Karel&apos;s specific
                instrument — the coupling weights and decay are tuned by ear, so
                read the bloom as an expressive lens, not acoustics.
              </p>
              <p>
                <strong>Fallback.</strong> Many machines lack WebGPU, so if{" "}
                <span className="font-mono">navigator.gpu</span> is missing or no
                adapter is returned, the identical model runs on the CPU into a
                Canvas2D bloom at lower resolution.
              </p>
              <p>
                <strong>Reference.</strong> CHI 2026, <em>Visualising
                Pianists&apos; Touch</em> (audio → key-motion reconstruction) —
                a fresh take on reading expressive piano gesture from sound
                alone, which is the same spirit as excitation-driven
                visualisation here.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13440-resonancefield"]} />
    </main>
  );
}
