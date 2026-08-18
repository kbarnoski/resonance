"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  type TrackChord,
} from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 15040-slimenerve · "What if your recording grew its own nervous system?"
//
//   Karel's real piano recording plays, and a swarm of ~200k physarum
//   (slime-mold) agents forages across the screen, self-organising into a
//   living transport network — the classic emergent filament web of Jones 2010.
//   Every agent senses a pheromone trail-map three points ahead, steers toward
//   the strongest, moves, and deposits; a diffuse+decay pass grows the web.
//
//   The MUSIC drives the growth, live, from `master.analyser`:
//     · spectral flux / high-frequency energy → sharpen the sensor angle & lift
//       deposit strength in busy passages (tight, nervy filaments);
//     · loudness (RMS) → agent speed and trail brightness;
//     · chord changes (from analysis) → re-seed bright "attractor" nodes the
//       swarm grows toward, so the net reorganises at the piece's real seams;
//     · dragging drops a food attractor the swarm reaches for.
//
//   ENTIRELY WebGPU: two WGSL compute passes per frame (agent sense/steer/move/
//   deposit, then diffuse+decay) plus a render pass with a silver tone curve.
//   No Canvas2D / CPU fallback for the art — if WebGPU is missing we say so.
// ─────────────────────────────────────────────────────────────────────────────

const N_AGENTS = 200_000;
const FP = 1024; // fixed-point scale for the atomic trail buffer
const GRID_MAX = 1024;

// ── WGSL ─────────────────────────────────────────────────────────────────────

const SIM_STRUCT = /* wgsl */ `
struct Sim {
  size: vec2<f32>,
  nAgents: f32,
  dt: f32,
  moveSpeed: f32,
  sensorAngle: f32,
  sensorDist: f32,
  turnSpeed: f32,
  depositAmt: f32,
  decay: f32,
  time: f32,
  reduceMotion: f32,
  brightGain: f32,
  fp: f32,
};`;

// Pass 1 — agents sense 3 points, steer, move (toroidal), deposit.
const AGENT_WGSL = /* wgsl */ `
${SIM_STRUCT}
struct Agent { pos: vec2<f32>, heading: f32, pad: f32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read_write> trail: array<atomic<i32>>;

fn hash(n: u32) -> f32 {
  var x = n;
  x = x ^ (x >> 16u); x = x * 0x7feb352du;
  x = x ^ (x >> 15u); x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return f32(x) / 4294967295.0;
}

fn cellIdx(p: vec2<f32>) -> u32 {
  let W = i32(S.size.x); let H = i32(S.size.y);
  var x = i32(floor(p.x)) % W; if (x < 0) { x = x + W; }
  var y = i32(floor(p.y)) % H; if (y < 0) { y = y + H; }
  return u32(y * W + x);
}

fn sense(pos: vec2<f32>, ang: f32) -> f32 {
  let sp = pos + vec2<f32>(cos(ang), sin(ang)) * S.sensorDist;
  return f32(atomicLoad(&trail[cellIdx(sp)]));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(S.nAgents)) { return; }
  var a = agents[i];

  let fwd = sense(a.pos, a.heading);
  let left = sense(a.pos, a.heading + S.sensorAngle);
  let right = sense(a.pos, a.heading - S.sensorAngle);

  let rnd = hash(i * 2654435761u + u32(S.time * 60.0));
  var h = a.heading;
  if (fwd > left && fwd > right) {
    // hold course
  } else if (fwd < left && fwd < right) {
    h = h + (rnd - 0.5) * 2.0 * S.turnSpeed; // random flick out of a valley
  } else if (left > right) {
    h = h + S.turnSpeed;
  } else if (right > left) {
    h = h - S.turnSpeed;
  }

  var np = a.pos + vec2<f32>(cos(h), sin(h)) * S.moveSpeed;
  np.x = np.x - floor(np.x / S.size.x) * S.size.x; // toroidal wrap
  np.y = np.y - floor(np.y / S.size.y) * S.size.y;

  a.pos = np;
  a.heading = h;
  agents[i] = a;

  atomicAdd(&trail[cellIdx(np)], i32(S.depositAmt * S.fp));
}`;

// Pass 2 — 3x3 diffuse + decay, plus additive food attractors.
const DIFFUSE_WGSL = /* wgsl */ `
${SIM_STRUCT}
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read> src: array<i32>;
@group(0) @binding(2) var<storage, read_write> dst: array<i32>;
@group(0) @binding(3) var<uniform> attractors: array<vec4<f32>, 8>;

fn at(ix: i32, iy: i32) -> f32 {
  let W = i32(S.size.x); let H = i32(S.size.y);
  var x = ix % W; if (x < 0) { x = x + W; }
  var y = iy % H; if (y < 0) { y = y + H; }
  return f32(src[y * W + x]);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = i32(S.size.x); let H = i32(S.size.y);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= W || y >= H) { return; }

  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + at(x + dx, y + dy);
    }
  }
  var v = (sum / 9.0) * S.decay;

  // additive food sources — a persistent bright well the swarm grows toward.
  let p = vec2<f32>(f32(x), f32(y));
  for (var k = 0u; k < 8u; k = k + 1u) {
    let a = attractors[k];
    if (a.w > 0.0) {
      var d = p - a.xy;
      // nearest toroidal image
      d.x = d.x - S.size.x * round(d.x / S.size.x);
      d.y = d.y - S.size.y * round(d.y / S.size.y);
      let r2 = a.z * a.z;
      v = v + a.w * S.fp * exp(-dot(d, d) / (2.0 * r2));
    }
  }

  v = clamp(v, 0.0, 60.0 * S.fp);
  dst[y * W + x] = i32(v);
}`;

// Render — bilinear sample of the trail buffer, silver tone curve on near-black.
const RENDER_WGSL = /* wgsl */ `
${SIM_STRUCT}
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vmain(@builtin(vertex_index) vi: u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = vec2<f32>((p[vi].x + 1.0) * 0.5, 1.0 - (p[vi].y + 1.0) * 0.5);
  return o;
}
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read> src: array<i32>;

fn tex(ix: i32, iy: i32) -> f32 {
  let W = i32(S.size.x); let H = i32(S.size.y);
  var x = ix % W; if (x < 0) { x = x + W; }
  var y = iy % H; if (y < 0) { y = y + H; }
  return f32(src[y * W + x]) / S.fp;
}

@fragment
fn fmain(in: VOut) -> @location(0) vec4<f32> {
  let pp = in.uv * S.size - vec2<f32>(0.5, 0.5);
  let i0 = floor(pp);
  let f = pp - i0;
  let ix = i32(i0.x); let iy = i32(i0.y);
  let a = tex(ix, iy);
  let b = tex(ix + 1, iy);
  let c = tex(ix, iy + 1);
  let d = tex(ix + 1, iy + 1);
  let v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);

  let t = 1.0 - exp(-v * S.brightGain);
  let s = pow(clamp(t, 0.0, 1.0), 0.85);
  let bg = vec3<f32>(0.015, 0.017, 0.022);
  let silver = vec3<f32>(0.86, 0.88, 0.92);
  var col = mix(bg, silver, s);
  col = col + vec3<f32>(-0.03, 0.0, 0.06) * pow(s, 5.0); // faint cool tint at peaks
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}`;

// ── GPU bundle ───────────────────────────────────────────────────────────────

interface Attractor {
  x: number;
  y: number;
  r: number;
  strength: number;
  life: number;
}

interface GpuBundle {
  device: GPUDevice;
  gridW: number;
  gridH: number;
  step: (sim: Float32Array, attractors: Float32Array) => void;
  destroy: () => void;
}

function gridSize(): [number, number] {
  const w = typeof window !== "undefined" ? window.innerWidth : 1024;
  const h = typeof window !== "undefined" ? window.innerHeight : 768;
  const aspect = w / h;
  let gw: number;
  let gh: number;
  if (aspect >= 1) {
    gw = GRID_MAX;
    gh = Math.round(GRID_MAX / aspect);
  } else {
    gh = GRID_MAX;
    gw = Math.round(GRID_MAX * aspect);
  }
  gw = Math.max(64, Math.round(gw / 8) * 8);
  gh = Math.max(64, Math.round(gh / 8) * 8);
  return [gw, gh];
}

async function initGpu(canvas: HTMLCanvasElement): Promise<GpuBundle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const [gridW, gridH] = gridSize();
  const nCells = gridW * gridH;

  // agents: pos.xy, heading, pad  (16 bytes)
  const agentData = new Float32Array(N_AGENTS * 4);
  for (let i = 0; i < N_AGENTS; i++) {
    agentData[i * 4] = Math.random() * gridW;
    agentData[i * 4 + 1] = Math.random() * gridH;
    agentData[i * 4 + 2] = Math.random() * Math.PI * 2;
    agentData[i * 4 + 3] = 0;
  }
  const agentBuf = device.createBuffer({
    size: agentData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(agentBuf, 0, agentData as BufferSource);

  const zero = new Int32Array(nCells);
  const trail: [GPUBuffer, GPUBuffer] = [
    device.createBuffer({
      size: nCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      size: nCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
  ];
  device.queue.writeBuffer(trail[0], 0, zero as BufferSource);
  device.queue.writeBuffer(trail[1], 0, zero as BufferSource);

  const simBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const attrBuf = device.createBuffer({
    size: 8 * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const agentPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: AGENT_WGSL }),
      entryPoint: "main",
    },
  });
  const diffusePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: DIFFUSE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({ code: RENDER_WGSL }),
      entryPoint: "vmain",
    },
    fragment: {
      module: device.createShaderModule({ code: RENDER_WGSL }),
      entryPoint: "fmain",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  const agentLayout = agentPipeline.getBindGroupLayout(0);
  const agentBG: [GPUBindGroup, GPUBindGroup] = [
    device.createBindGroup({
      layout: agentLayout,
      entries: [
        { binding: 0, resource: { buffer: simBuf } },
        { binding: 1, resource: { buffer: agentBuf } },
        { binding: 2, resource: { buffer: trail[0] } },
      ],
    }),
    device.createBindGroup({
      layout: agentLayout,
      entries: [
        { binding: 0, resource: { buffer: simBuf } },
        { binding: 1, resource: { buffer: agentBuf } },
        { binding: 2, resource: { buffer: trail[1] } },
      ],
    }),
  ];

  const diffuseLayout = diffusePipeline.getBindGroupLayout(0);
  const mkDiffuse = (r: number, w: number) =>
    device.createBindGroup({
      layout: diffuseLayout,
      entries: [
        { binding: 0, resource: { buffer: simBuf } },
        { binding: 1, resource: { buffer: trail[r] } },
        { binding: 2, resource: { buffer: trail[w] } },
        { binding: 3, resource: { buffer: attrBuf } },
      ],
    });
  const diffuseBG: [GPUBindGroup, GPUBindGroup] = [mkDiffuse(0, 1), mkDiffuse(1, 0)];

  const renderLayout = renderPipeline.getBindGroupLayout(0);
  const mkRender = (r: number) =>
    device.createBindGroup({
      layout: renderLayout,
      entries: [
        { binding: 0, resource: { buffer: simBuf } },
        { binding: 1, resource: { buffer: trail[r] } },
      ],
    });
  const renderBG: [GPUBindGroup, GPUBindGroup] = [mkRender(0), mkRender(1)];

  let cur: 0 | 1 = 0;
  const wgX = Math.ceil(gridW / 8);
  const wgY = Math.ceil(gridH / 8);
  const agentGroups = Math.ceil(N_AGENTS / 64);

  const step = (sim: Float32Array, attractors: Float32Array) => {
    device.queue.writeBuffer(simBuf, 0, sim as BufferSource);
    device.queue.writeBuffer(attrBuf, 0, attractors as BufferSource);

    const nxt = (1 - cur) as 0 | 1;
    const enc = device.createCommandEncoder();

    const ap = enc.beginComputePass();
    ap.setPipeline(agentPipeline);
    ap.setBindGroup(0, agentBG[cur]);
    ap.dispatchWorkgroups(agentGroups);
    ap.end();

    const dp = enc.beginComputePass();
    dp.setPipeline(diffusePipeline);
    dp.setBindGroup(0, diffuseBG[cur]);
    dp.dispatchWorkgroups(wgX, wgY);
    dp.end();

    const view = ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rp.setPipeline(renderPipeline);
    rp.setBindGroup(0, renderBG[nxt]);
    rp.draw(3);
    rp.end();

    device.queue.submit([enc.finish()]);
    cur = nxt;
  };

  const destroy = () => {
    agentBuf.destroy();
    trail[0].destroy();
    trail[1].destroy();
    simBuf.destroy();
    attrBuf.destroy();
    device.destroy();
  };

  return { device, gridW, gridH, step, destroy };
}

// ── audio-driven parameter reader ────────────────────────────────────────────

interface AudioParams {
  rms: number; // 0..~1 loudness
  flux: number; // 0..1 spectral flux (attack/novelty)
  hf: number; // 0..1 high-frequency energy
}

function readAudio(
  analyser: AnalyserNode,
  freq: Uint8Array,
  time: Uint8Array,
  prevFreq: Float32Array,
): AudioParams {
  analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
  analyser.getByteTimeDomainData(time as Uint8Array<ArrayBuffer>);

  let sq = 0;
  for (let i = 0; i < time.length; i++) {
    const v = (time[i] - 128) / 128;
    sq += v * v;
  }
  const rms = Math.sqrt(sq / time.length);

  const n = freq.length;
  let flux = 0;
  let hf = 0;
  const hfStart = Math.floor(n * 0.45);
  for (let i = 0; i < n; i++) {
    const m = freq[i] / 255;
    const diff = m - prevFreq[i];
    if (diff > 0) flux += diff;
    prevFreq[i] = m;
    if (i >= hfStart) hf += m;
  }
  flux /= n;
  hf /= n - hfStart;

  return {
    rms: Math.min(1, rms * 2.2),
    flux: Math.min(1, flux * 9),
    hf: Math.min(1, hf * 2.4),
  };
}

// ── component ────────────────────────────────────────────────────────────────

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const gpuRef = useRef<GpuBundle | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);

  const freqRef = useRef<Uint8Array | null>(null);
  const timeRef = useRef<Uint8Array | null>(null);
  const prevFreqRef = useRef<Float32Array | null>(null);

  // smoothed live parameters
  const paramRef = useRef({ rms: 0, flux: 0, hf: 0 });
  // 8 food attractors: [x,y,r,strength] packed for the uniform; life tracked here
  const attrRef = useRef<Attractor[]>(
    Array.from({ length: 8 }, () => ({ x: 0, y: 0, r: 1, strength: 0, life: 0 })),
  );
  const attrPacked = useRef(new Float32Array(32));
  const nextChordSlotRef = useRef(1);
  const chordsRef = useRef<TrackChord[]>([]);
  const chordCursorRef = useRef(0);
  const fluxCooldownRef = useRef(0);
  const lastTsRef = useRef(0);
  const simTimeRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, down: false });
  const reduceMotionRef = useRef(false);

  const [track, setTrack] = useState(REAL_TRACKS[0]);
  const [phase, setPhase] = useState<"idle" | "loading" | "playing">("idle");
  const [gpuStatus, setGpuStatus] = useState<"checking" | "ok" | "unsupported">(
    "checking",
  );
  const [analysisMissing, setAnalysisMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // fire a bright attractor node into a rotating slot (chord seam / novelty).
  const seedNode = useCallback((slot: number, gx: number, gy: number) => {
    const gpu = gpuRef.current;
    if (!gpu) return;
    const a = attrRef.current[slot];
    a.x = gx;
    a.y = gy;
    a.r = Math.max(gpu.gridW, gpu.gridH) * 0.045;
    a.strength = 7;
    a.life = 1;
  }, []);

  // ── one-time GPU init + the always-on render loop ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    reduceMotionRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(2, Math.floor(r.width * dpr));
      canvas.height = Math.max(2, Math.floor(r.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    const sim = new Float32Array(16);

    (async () => {
      let gpu: GpuBundle | null = null;
      try {
        gpu = await initGpu(canvas);
      } catch {
        gpu = null;
      }
      if (cancelled) {
        gpu?.destroy();
        return;
      }
      if (!gpu) {
        setGpuStatus("unsupported");
        return;
      }
      gpuRef.current = gpu;
      setGpuStatus("ok");

      const frame = (ts: number) => {
        rafRef.current = requestAnimationFrame(frame);
        if (lastTsRef.current === 0) lastTsRef.current = ts;
        let dt = (ts - lastTsRef.current) / 1000;
        lastTsRef.current = ts;
        if (dt <= 0 || dt > 0.05) dt = 0.016;
        simTimeRef.current += dt;
        const reduce = reduceMotionRef.current;

        // read the live analyser (or ease back to calm when not playing)
        const smooth = reduce ? 0.05 : 0.12;
        const p = paramRef.current;
        if (
          phaseRef.current === "playing" &&
          masterRef.current &&
          freqRef.current &&
          timeRef.current &&
          prevFreqRef.current
        ) {
          const a = readAudio(
            masterRef.current.analyser,
            freqRef.current,
            timeRef.current,
            prevFreqRef.current,
          );
          p.rms += (a.rms - p.rms) * smooth;
          p.flux += (a.flux - p.flux) * (reduce ? 0.08 : 0.25);
          p.hf += (a.hf - p.hf) * smooth;

          // chord-change / novelty re-seeding at the piece's real seams
          const tNow = ctxRef.current
            ? ctxRef.current.currentTime - startedAtRef.current
            : 0;
          const chords = chordsRef.current;
          if (chords.length > 0) {
            let c = chordCursorRef.current;
            while (c < chords.length && chords[c].time <= tNow) {
              const slot = nextChordSlotRef.current;
              const rt = ((chords[c].chord.charCodeAt(0) * 7) % 12) / 12;
              seedNode(
                slot,
                (0.12 + rt * 0.76) * gpu.gridW,
                (0.2 + Math.random() * 0.6) * gpu.gridH,
              );
              nextChordSlotRef.current = slot >= 7 ? 1 : slot + 1;
              c++;
            }
            chordCursorRef.current = c;
          } else {
            // no analysis: use a spectral-flux novelty spike as the seam cue
            fluxCooldownRef.current -= dt;
            if (a.flux > 0.55 && fluxCooldownRef.current <= 0) {
              const slot = nextChordSlotRef.current;
              seedNode(
                slot,
                Math.random() * gpu.gridW,
                Math.random() * gpu.gridH,
              );
              nextChordSlotRef.current = slot >= 7 ? 1 : slot + 1;
              fluxCooldownRef.current = 2.5;
            }
          }
        } else {
          p.rms += (0.18 - p.rms) * smooth;
          p.flux += (0.05 - p.flux) * smooth;
          p.hf += (0.12 - p.hf) * smooth;
        }

        // pointer food attractor lives in slot 0 while dragging, then fades
        const ptr = pointerRef.current;
        const a0 = attrRef.current[0];
        if (ptr.down) {
          a0.x = ptr.x * gpu.gridW;
          a0.y = ptr.y * gpu.gridH;
          a0.r = Math.max(gpu.gridW, gpu.gridH) * 0.05;
          a0.strength = 9;
          a0.life = 1;
        }

        // decay attractor lives and pack the uniform
        const packed = attrPacked.current;
        for (let k = 0; k < 8; k++) {
          const a = attrRef.current[k];
          if (a.life > 0) {
            if (!(k === 0 && ptr.down)) a.life -= dt / (reduce ? 5.5 : 3.5);
            if (a.life < 0) a.life = 0;
          }
          packed[k * 4] = a.x;
          packed[k * 4 + 1] = a.y;
          packed[k * 4 + 2] = a.r;
          packed[k * 4 + 3] = a.strength * a.life;
        }

        // map music → physarum parameters
        const speedBase = reduce ? 0.55 : 1.0;
        const moveSpeed = speedBase * (0.7 + p.rms * 1.1);
        const busy = Math.min(1, p.hf * 0.6 + p.flux * 0.7);
        const sensorAngle = 1.15 - busy * 0.7; // busy → tight/nervy filaments
        const sensorDist = 9.0;
        const turnSpeed = (reduce ? 0.28 : 0.38) + busy * 0.18;
        const depositAmt = 1.1 + busy * 1.9 + p.rms * 0.6;
        const decay = 0.9;
        const brightGain = 0.16 + p.rms * 0.28;

        sim[0] = gpu.gridW;
        sim[1] = gpu.gridH;
        sim[2] = N_AGENTS;
        sim[3] = dt;
        sim[4] = moveSpeed;
        sim[5] = sensorAngle;
        sim[6] = sensorDist;
        sim[7] = turnSpeed;
        sim[8] = depositAmt;
        sim[9] = decay;
        sim[10] = simTimeRef.current;
        sim[11] = reduce ? 1 : 0;
        sim[12] = brightGain;
        sim[13] = FP;

        gpu.step(sim, packed);
      };

      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        sourceRef.current?.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current?.disconnect();
      sourceRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
      gpuRef.current?.destroy();
      gpuRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pointer: drop a food attractor the swarm grows toward ─────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toUV = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (cx - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (cy - r.top) / r.height)),
      };
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const { x, y } = toUV(e.clientX, e.clientY);
      pointerRef.current = { x, y, down: true };
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current.down) return;
      const { x, y } = toUV(e.clientX, e.clientY);
      pointerRef.current.x = x;
      pointerRef.current.y = y;
    };
    const onUp = () => {
      pointerRef.current.down = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const stopAudio = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setPhase("idle");
  }, []);

  const play = useCallback(async () => {
    if (typeof window === "undefined") return;
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
        const bins = master.analyser.frequencyBinCount;
        freqRef.current = new Uint8Array(bins);
        timeRef.current = new Uint8Array(master.analyser.fftSize);
        prevFreqRef.current = new Float32Array(bins);
      }

      // load the musical seams (chord changes) — degrade gracefully if absent
      chordsRef.current = [];
      chordCursorRef.current = 0;
      try {
        const analysis = await loadTrackAnalysis(track.id);
        if (analysis && analysis.chords.length > 0) {
          chordsRef.current = analysis.chords;
          setAnalysisMissing(false);
        } else {
          setAnalysisMissing(true);
        }
      } catch {
        setAnalysisMissing(true);
      }

      const wh = await loadRealTrackBuffer(ctx, track.id);
      try {
        sourceRef.current?.stop();
      } catch {
        /* none playing */
      }
      const src = ctx.createBufferSource();
      src.buffer = wh.buffer;
      src.loop = true;
      src.connect(master.input);
      src.onended = () => {
        if (sourceRef.current === src) stopAudio();
      };
      startedAtRef.current = ctx.currentTime;
      chordCursorRef.current = 0;
      src.start();
      sourceRef.current = src;
      setPhase("playing");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load this recording.",
      );
      setPhase("idle");
    }
  }, [track, stopAudio]);

  const onSelectTrack = useCallback(
    (id: string) => {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (!t) return;
      setTrack(t);
      if (phaseRef.current === "playing") stopAudio();
    },
    [stopAudio],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ cursor: "crosshair", touchAction: "none" }}
      />

      {gpuStatus === "unsupported" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGPU — try desktop Chrome or Edge. The physarum
            swarm is simulated entirely on the GPU, with no Canvas2D fallback.
          </p>
        </div>
      )}

      {/* title block */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            slimenerve · a living transport network
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            What if your recording grew its own nervous system?
          </h1>
          <p className="text-base text-muted-foreground">
            Two hundred thousand slime-mold agents forage across the screen and
            self-organise into a filament web — driven, live, by Karel&apos;s
            piano. Busy passages sharpen the net into nervy threads; loudness
            feeds its speed and glow; chord changes re-seed bright nodes it grows
            toward. Drag to drop food.
          </p>
        </header>
      </div>

      {/* bottom control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {phase === "playing" && analysisMissing && (
          <p className="text-sm text-muted-foreground">
            No published chord map for this track — the network re-seeds on
            spectral novelty instead. Audio is the real recording.
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
              disabled={phase === "loading" || gpuStatus === "unsupported"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading…" : `Play ${track.title}`}
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
            {gpuStatus === "checking"
              ? "starting"
              : gpuStatus === "unsupported"
                ? "no webgpu"
                : phase === "playing"
                  ? "foraging"
                  : "idle web"}
          </span>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
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
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Physarum polycephalum — a single-celled slime mold — solves mazes
                and lays out efficient transport networks with no brain, purely by
                laying and following a chemical trail. Jones (2010) reduced that
                behaviour to a swarm of dumb agents on a shared trail-map, and the
                same filament web emerges. This piece runs that model entirely on
                the GPU and lets Karel&apos;s piano shape it.
              </p>
              <p>
                <strong>The compute.</strong> ~200,000 agents live in a WGSL
                storage buffer (position + heading). Each frame, two compute
                passes: one where every agent{" "}
                <span className="font-mono">senses</span> the trail three points
                ahead, steers toward the strongest, moves, and deposits into an
                atomic trail buffer; then a{" "}
                <span className="font-mono">diffuse + decay</span> pass (3×3 blur)
                grows and fades the web. A render pass draws it with a silver tone
                curve on near-black.
              </p>
              <p>
                <strong>How it reads his playing.</strong> Live from the safety
                bus analyser: spectral flux and high-frequency energy tighten the
                sensor angle and raise deposit strength, so busy passages knot the
                net into nervy threads while calm ones let it breathe wide;
                loudness (RMS) feeds agent speed and overall brightness. His chord
                changes drop bright attractor nodes the swarm grows toward, so the
                network reorganises at the recording&apos;s real structural seams.
                Drag anywhere to place a food source.
              </p>
              <p>
                <strong>Palette.</strong> Achromatic silver luminance on
                near-black — a deliberately rare, monochrome register, with only a
                faint cool tint at the brightest filament peaks.
              </p>
              <p>
                <strong>Reference.</strong> Jones, J. (2010),{" "}
                <em>
                  Characteristics of pattern formation and evolution in
                  approximations of Physarum transport networks
                </em>{" "}
                (Artificial Life 16:2); Sage Jenson&apos;s{" "}
                <span className="font-mono">mold</span> physarum visuals as
                lineage.
              </p>
              <p>
                <strong>Degrades.</strong> No WebGPU adapter → an on-brand notice,
                no broken canvas. No published chord map → the net re-seeds on
                spectral novelty instead. Audio load failure → an inline message,
                never a thrown error.
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

      <PrototypeNav slugs={["15040-slimenerve"]} />
    </main>
  );
}
