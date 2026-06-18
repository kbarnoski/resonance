"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Papa's Piano Garden · src/app/dream/721-kids-piano-garden/page.tsx
//
// ONE question: what if a 4-year-old could grow a glowing garden of light by
// humming into the tablet — and every petal that blooms is made from Karel's
// OWN real recorded piano?
//
// A near-dark deep field of luminous motes. The child hums or blows into the
// mic (analysis-only, NEVER recorded or sent). Breath ENERGY stirs more motes
// and a wider scatter; voice PITCH lifts the bloom high (bright) or settles it
// low (dark, warm). Each bloom SOUNDS as concatenative grains of Karel's real
// solo-piano "Welcome Home" recording — CataRT-style descriptor navigation —
// never a beat, never a loop, just a breathing texture of light and warmth.
//
// OUTPUT: WebGPU compute-shader particle field (PRIMARY) with a first-class
// Canvas2D particle fallback (same gather-and-bloom behaviour). Mic denied or
// idle → a scripted ghost "breath" keeps the garden alive with zero permission.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildGrainCorpus,
  fetchPianoBuffer,
  renderFallbackBuffer,
  selectNearest,
  type Corpus,
} from "./audio";

// ─── Minimal local WebGPU surface ────────────────────────────────────────────
// We deliberately do NOT depend on @webgpu/types (zero new deps). We touch the
// API through one typed boundary; the single `any` below is annotated, as the
// project's ESLint requires, and is the ONLY one in this file.
type GpuCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computePipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderPipeline: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  particleBuf: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uniformBuf: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  computeBind: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderBind: any;
  count: number;
};

const PARTICLE_COUNT = 8192;

// A single live "stir" — one breath pushing seeds toward a bloom point.
type Stir = {
  cx: number; // 0..1 target x in the field
  cy: number; // 0..1 target y (1 = top/bright, 0 = bottom/dark)
  energy: number; // 0..1 breath loudness → scatter + count
  born: number; // performance.now() ms
};

// ─── WGSL: compute (gather + drift) and render (additive glow) ───────────────
const COMPUTE_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32>, glow: f32, hue: f32 };
struct Uniforms {
  stir: vec4<f32>,   // x, y, energy, time
  misc: vec4<f32>,   // dt, count, _, _
};
@group(0) @binding(0) var<storage, read_write> parts: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u32(u.misc.y)) { return; }
  var p = parts[i];
  let dt = u.misc.x;
  let stirPos = u.stir.xy;
  let energy = u.stir.z;

  // Gentle pull toward the active bloom point, strength scaled by breath.
  let toStir = stirPos - p.pos;
  let d = length(toStir) + 0.0001;
  let pull = energy * 0.9 * exp(-d * 3.0);
  p.vel = p.vel + normalize(toStir) * pull * dt;

  // Slow ambient drift so the field always breathes, even when silent.
  let t = u.stir.w;
  p.vel = p.vel + vec2<f32>(
    sin(t * 0.3 + p.seed.x * 6.28) * 0.004,
    cos(t * 0.27 + p.seed.y * 6.28) * 0.004
  ) * dt * 60.0;

  p.vel = p.vel * 0.94; // soft damping — nothing ever flings
  p.pos = p.pos + p.vel * dt;

  // Soft-wrap the unit field so motes never vanish at an edge.
  p.pos = fract(p.pos + vec2<f32>(1.0, 1.0));

  // Glow swells with proximity to the bloom, then eases back down.
  let near = exp(-d * 4.0) * energy;
  p.glow = max(p.glow * 0.96, near);
  parts[i] = p;
}
`;

const RENDER_WGSL = /* wgsl */ `
struct Particle { pos: vec2<f32>, vel: vec2<f32>, seed: vec2<f32>, glow: f32, hue: f32 };
@group(0) @binding(0) var<storage, read> parts: array<Particle>;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) glow: f32,
  @location(2) hue: f32,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  // Two-triangle quad per particle.
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let p = parts[ii];
  let c = corners[vi];
  let size = 0.010 + p.glow * 0.030;
  // field 0..1 → clip -1..1, y up.
  let center = vec2<f32>(p.pos.x * 2.0 - 1.0, (1.0 - p.pos.y) * 2.0 - 1.0);
  var out: VsOut;
  out.clip = vec4<f32>(center + c * size, 0.0, 1.0);
  out.uv = c;
  out.glow = p.glow;
  out.hue = p.hue;
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  let soft = smoothstep(1.0, 0.0, r);
  let base = 0.10 + in.glow * 0.9;
  // Warm low / luminous high petal palette.
  let warm = vec3<f32>(1.0, 0.78, 0.52);
  let cool = vec3<f32>(0.66, 0.82, 1.0);
  let col = mix(warm, cool, in.hue);
  let a = soft * base;
  return vec4<f32>(col * a, a);
}
`;

// ─── WebGPU init ─────────────────────────────────────────────────────────────
async function makeGpu(canvas: HTMLCanvasElement): Promise<GpuCtx | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (!nav.gpu) return null;
  try {
    const adapter = await nav.gpu.requestAdapter();
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = canvas.getContext("webgpu") as any;
    if (!ctx) return null;
    const format = nav.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "premultiplied" });

    // particle struct = 8 floats (pos2, vel2, seed2, glow, hue) = 32 bytes
    const stride = 8 * 4;
    const init = new Float32Array(PARTICLE_COUNT * 8);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * 8;
      init[o + 0] = Math.random();
      init[o + 1] = Math.random();
      init[o + 2] = 0;
      init[o + 3] = 0;
      init[o + 4] = Math.random();
      init[o + 5] = Math.random();
      init[o + 6] = 0;
      init[o + 7] = Math.random();
    }
    // WebGPU buffer-usage flag bits (avoids depending on @webgpu/types globals).
    const STORAGE = 0x80;
    const COPY_DST = 0x8;
    const UNIFORM = 0x40;
    const particleBuf = device.createBuffer({
      size: PARTICLE_COUNT * stride,
      usage: STORAGE | COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(particleBuf.getMappedRange()).set(init);
    particleBuf.unmap();

    const uniformBuf = device.createBuffer({
      size: 8 * 4, // two vec4
      usage: UNIFORM | COPY_DST,
    });

    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const renderModule = device.createShaderModule({ code: RENDER_WGSL });

    const computePipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: computeModule, entryPoint: "main" },
    });
    const renderPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: renderModule, entryPoint: "vs" },
      fragment: {
        module: renderModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "one", dstFactor: "one", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    const computeBind = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: particleBuf } },
        { binding: 1, resource: { buffer: uniformBuf } },
      ],
    });
    const renderBind = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: particleBuf } }],
    });

    return {
      device,
      ctx,
      format,
      computePipeline,
      renderPipeline,
      particleBuf,
      uniformBuf,
      computeBind,
      renderBind,
      count: PARTICLE_COUNT,
    };
  } catch {
    return null;
  }
}

function drawGpuFrame(
  g: GpuCtx,
  stir: { x: number; y: number; energy: number },
  t: number,
  dt: number,
) {
  const uni = new Float32Array([
    stir.x,
    stir.y,
    stir.energy,
    t,
    dt,
    g.count,
    0,
    0,
  ]);
  g.device.queue.writeBuffer(g.uniformBuf, 0, uni);

  const enc = g.device.createCommandEncoder();
  const cpass = enc.beginComputePass();
  cpass.setPipeline(g.computePipeline);
  cpass.setBindGroup(0, g.computeBind);
  cpass.dispatchWorkgroups(Math.ceil(g.count / 64));
  cpass.end();

  const view = g.ctx.getCurrentTexture().createView();
  const rpass = enc.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0.01, g: 0.012, b: 0.03, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  rpass.setPipeline(g.renderPipeline);
  rpass.setBindGroup(0, g.renderBind);
  rpass.draw(6, g.count, 0, 0);
  rpass.end();
  g.device.queue.submit([enc.finish()]);
}

// ─── Canvas2D fallback particle field (same gather-and-bloom behaviour) ──────
type Mote = { x: number; y: number; vx: number; vy: number; glow: number; hue: number };

function makeMotes(n: number): Mote[] {
  const motes: Mote[] = [];
  for (let i = 0; i < n; i++) {
    motes.push({
      x: Math.random(),
      y: Math.random(),
      vx: 0,
      vy: 0,
      glow: 0,
      hue: Math.random(),
    });
  }
  return motes;
}

function drawCanvas2dFrame(
  cx: CanvasRenderingContext2D,
  motes: Mote[],
  stir: { x: number; y: number; energy: number },
  t: number,
  dt: number,
  w: number,
  h: number,
) {
  // Soft trailing fade — leaves luminous ghosts, never a hard clear.
  cx.globalCompositeOperation = "source-over";
  cx.fillStyle = "rgba(3, 4, 9, 0.22)";
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = "lighter";

  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    const dx = stir.x - m.x;
    const dy = stir.y - m.y;
    const d = Math.hypot(dx, dy) + 0.0001;
    const pull = stir.energy * 0.9 * Math.exp(-d * 3.0);
    m.vx += (dx / d) * pull * dt;
    m.vy += (dy / d) * pull * dt;
    m.vx += Math.sin(t * 0.3 + i) * 0.004 * dt * 60;
    m.vy += Math.cos(t * 0.27 + i * 1.3) * 0.004 * dt * 60;
    m.vx *= 0.94;
    m.vy *= 0.94;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.x = (m.x + 1) % 1;
    m.y = (m.y + 1) % 1;
    const near = Math.exp(-d * 4.0) * stir.energy;
    m.glow = Math.max(m.glow * 0.96, near);

    const px = m.x * w;
    const py = (1 - m.y) * h;
    const size = 1.2 + m.glow * 9;
    const a = 0.06 + m.glow * 0.85;
    // warm low → cool high petal palette
    const r = Math.round(255 * (1 - m.hue * 0.34) * a);
    const gg = Math.round(255 * (0.78 + m.hue * 0.04) * a);
    const b = Math.round(255 * (0.52 + m.hue * 0.48) * a);
    const grad = cx.createRadialGradient(px, py, 0, px, py, size);
    grad.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = grad;
    cx.beginPath();
    cx.arc(px, py, size, 0, Math.PI * 2);
    cx.fill();
  }
  cx.globalCompositeOperation = "source-over";
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PianoGardenPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [started, setStarted] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgpu" | "canvas2d" | "">("");
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [usingFallbackTone, setUsingFallbackTone] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Audio graph + analysis refs (kept off React state for rAF speed).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const grainBusRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const droneNodesRef = useRef<{ osc: OscillatorNode[]; gain: GainNode } | null>(null);

  // Render + interaction refs.
  const rafRef = useRef<number | null>(null);
  const gpuRef = useRef<GpuCtx | null>(null);
  const motesRef = useRef<Mote[] | null>(null);
  const stirRef = useRef<Stir>({ cx: 0.5, cy: 0.5, energy: 0, born: 0 });
  const lastVoiceMsRef = useRef<number>(0);
  const lastGrainMsRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number>(0);

  // ─── Grain triggering: energy → count + radius, pitch → ny (brightness) ────
  const triggerGrains = useCallback(
    (energy: number, pitch01: number) => {
      const ctx = audioCtxRef.current;
      const corpus = corpusRef.current;
      const bus = grainBusRef.current;
      if (!ctx || !corpus || !bus) return;

      const now = performance.now();
      // Rate-limit so a sustained hum is a gentle shower, not a wall.
      if (now - lastGrainMsRef.current < 55) return;
      lastGrainMsRef.current = now;

      // descriptor point: x wanders slowly through the piece; y = pitch.
      const cx = (Math.sin(now * 0.0004) * 0.5 + 0.5);
      const cy = Math.min(1, Math.max(0, pitch01));
      const radius = 0.08 + energy * 0.28; // louder hum → scatter more seeds
      const count = Math.max(1, Math.round(1 + energy * 7));
      const idx = selectNearest(corpus.grains, cx, cy, radius, count);
      if (idx.length === 0) return;

      const t0 = ctx.currentTime;
      for (let k = 0; k < idx.length; k++) {
        const grain = corpus.grains[idx[k]];
        const src = ctx.createBufferSource();
        src.buffer = corpus.buffer;
        // Brighter/faster grains from busier parts when humming loud & high.
        src.playbackRate.value = 0.96 + grain.brightness * 0.12;

        const env = ctx.createGain();
        // Hann-ish window via two ramps — soft in, soft out, never a click.
        const dur = grain.duration;
        const peak = 0.10 + energy * 0.22;
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.linearRampToValueAtTime(peak, t0 + dur * 0.5);
        env.gain.linearRampToValueAtTime(0.0001, t0 + dur);

        // pan low grains warm-left/right gently by descriptor x.
        const pan = ctx.createStereoPanner();
        pan.pan.value = (cx - 0.5) * 0.6;

        src.connect(env);
        env.connect(pan);
        pan.connect(bus);
        src.start(t0, grain.offset, dur);
        src.stop(t0 + dur + 0.02);
      }

      // Move the visual bloom point to match the sound's descriptor location.
      stirRef.current = {
        cx,
        cy,
        energy: Math.min(1, energy * 1.3),
        born: now,
      };
    },
    [],
  );

  // ─── Ghost auto-demo: a scripted breath that keeps the garden alive ────────
  const ghostBreath = useCallback(
    (now: number) => {
      // Slow, tender swells — a breathing sine of energy with a wandering pitch.
      const slow = now * 0.00045;
      const energy = 0.18 + 0.42 * (0.5 + 0.5 * Math.sin(slow));
      const pitch01 = 0.5 + 0.4 * Math.sin(now * 0.00021 + 1.3);
      triggerGrains(energy, Math.min(1, Math.max(0, pitch01)));
    },
    [triggerGrains],
  );

  // ─── Live mic analysis: RMS energy + zero-crossing pitch estimate ──────────
  const analyzeMic = useCallback(() => {
    const an = analyserRef.current;
    if (!an) return null;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);

    let sumSq = 0;
    let crossings = 0;
    let prev = buf[0];
    for (let i = 1; i < buf.length; i++) {
      const s = buf[i];
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) crossings++;
      prev = s;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    // Cheap pitch proxy: zero-crossing rate → 0..1 (low hum low, high hum high).
    const zcr = crossings / buf.length;
    const pitch01 = Math.min(1, zcr / 0.12);
    return { rms, pitch01 };
  }, []);

  // ─── The render + audio loop ───────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const tick = () => {
      const now = performance.now();
      const dtRaw = lastFrameMsRef.current ? (now - lastFrameMsRef.current) / 1000 : 0.016;
      const dt = Math.min(0.05, dtRaw);
      lastFrameMsRef.current = now;
      const t = now / 1000;

      // 1) Drive audio: live mic if loud enough, else ghost demo when idle.
      const mic = analyzeMic();
      const VOICE_GATE = 0.012;
      if (mic && mic.rms > VOICE_GATE) {
        lastVoiceMsRef.current = now;
        triggerGrains(Math.min(1, mic.rms * 6), mic.pitch01);
      } else if (now - lastVoiceMsRef.current > 2500) {
        // Idle > 2.5s (or mic denied) → keep it alive with a scripted breath.
        ghostBreath(now);
      }

      // 2) Ease the stir energy down so blooms relax tenderly between breaths.
      const s = stirRef.current;
      const age = (now - s.born) / 1000;
      const liveEnergy = s.energy * Math.exp(-age * 1.6);

      // 3) Render — GPU primary, Canvas2D fallback, same behaviour.
      const g = gpuRef.current;
      if (g) {
        drawGpuFrame(g, { x: s.cx, y: s.cy, energy: liveEnergy }, t, dt);
      } else {
        const canvas = canvasRef.current;
        const cx2d = canvas?.getContext("2d");
        const motes = motesRef.current;
        if (canvas && cx2d && motes) {
          drawCanvas2dFrame(
            cx2d,
            motes,
            { x: s.cx, y: s.cy, energy: liveEnergy },
            t,
            dt,
            canvas.width,
            canvas.height,
          );
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [analyzeMic, triggerGrains, ghostBreath]);

  // ─── Build the kids-safe audio graph + load Karel's real piano ─────────────
  const buildAudio = useCallback(async (ctx: AudioContext) => {
    // Master safety chain: gain → lowpass(≤7.5k) → compressor(20:1) → out.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    lp.Q.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);

    // Grains route through their own bus into the master safety chain.
    const grainBus = ctx.createGain();
    grainBus.gain.value = 0.85;
    grainBus.connect(master);
    grainBusRef.current = grainBus;

    // Always-on soft ambient drone pad — the garden is never silent.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.connect(master);
    const oscs: OscillatorNode[] = [];
    [98, 147, 196].forEach((hz, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;
      osc.detune.value = i * 4 - 4;
      const og = ctx.createGain();
      og.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(og);
      og.connect(droneGain);
      osc.start();
      oscs.push(osc);
    });
    droneGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.5);
    droneNodesRef.current = { osc: oscs, gain: droneGain };

    // Load Karel's real recording; fall back to a real harmonic tone on failure.
    try {
      const buffer = await fetchPianoBuffer(ctx);
      if (buffer) {
        corpusRef.current = buildGrainCorpus(buffer, "piano");
        setUsingFallbackTone(false);
        return;
      }
    } catch {
      // fall through to fallback synthesis
    }
    const fb = await renderFallbackBuffer(ctx.sampleRate);
    corpusRef.current = buildGrainCorpus(fb, "fallback");
    setUsingFallbackTone(true);
  }, []);

  // ─── Start (must run inside the first user gesture for iOS unlock) ──────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // 1) AudioContext created/resumed inside the gesture.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    await buildAudio(ctx);

    // 2) Renderer: try WebGPU, fall back to Canvas2D.
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      const gpu = await makeGpu(canvas);
      if (gpu) {
        gpuRef.current = gpu;
        setRendererKind("webgpu");
      } else {
        motesRef.current = makeMotes(2400);
        setRendererKind("canvas2d");
      }
    }

    // 3) Mic — analysis only, clean breath onsets. Denied → ghost demo stays on.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const srcNode = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      srcNode.connect(an);
      analyserRef.current = an;
      setMicState("on");
    } catch {
      setMicState("denied");
    }

    // 4) Go. Loop runs regardless of mic outcome (ghost demo guarantees life).
    lastVoiceMsRef.current = 0; // force immediate ghost stir on first idle check
    runLoop();
  }, [started, buildAudio, runLoop]);

  // ─── Full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const stream = micStreamRef.current;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      const drone = droneNodesRef.current;
      if (drone) {
        try {
          drone.osc.forEach((o) => o.stop());
        } catch {
          /* already stopped */
        }
      }
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#03040a] font-mono text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Title — labeling, not gating. Always readable. */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white drop-shadow">
          Papa&apos;s Piano Garden
        </h1>
        <p className="mt-1 max-w-md text-base text-white/75">
          Hum or blow softly into the tablet — watch the light bloom from Papa&apos;s real piano.
        </p>
      </header>

      {/* Start affordance — big & friendly, holds the iOS audio/mic unlock. */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleStart}
            className="flex min-h-[44px] flex-col items-center gap-2 rounded-3xl bg-white/10 px-10 py-8 text-center ring-1 ring-white/20 transition hover:bg-white/15"
          >
            <span className="text-5xl" aria-hidden="true">
              🌱
            </span>
            <span className="text-xl font-semibold text-white">Start the garden</span>
            <span className="text-base text-white/75">Tap, then hum</span>
          </button>
        </div>
      )}

      {/* Status strip — small, readable, never blocks play. */}
      {started && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-1 px-4 pb-6 text-center">
          {micState === "denied" && (
            <p className="text-base text-rose-300">
              No microphone — the garden keeps blooming on its own. Tap allow to hum along.
            </p>
          )}
          {usingFallbackTone && (
            <p className="text-base text-rose-300">
              Playing a gentle demo tone (Papa&apos;s recording is unavailable right now).
            </p>
          )}
          <p className="text-base text-white/75">
            {rendererKind === "webgpu"
              ? "Glowing with WebGPU"
              : rendererKind === "canvas2d"
                ? "Glowing with Canvas"
                : "Waking the garden…"}
            {micState === "on" ? " · listening for your hum" : " · auto-breathing"}
          </p>
        </div>
      )}

      {/* "Read the design notes" — corner toggle, lightweight. */}
      <div className="absolute right-3 top-3 z-30">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-white/75 ring-1 ring-white/15 transition hover:bg-white/15"
        >
          {showNotes ? "Close notes" : "Design notes"}
        </button>
      </div>

      {showNotes && (
        <div className="absolute right-3 top-20 z-30 max-h-[70vh] w-[min(92vw,28rem)] overflow-auto rounded-2xl bg-black/80 p-5 text-base leading-relaxed text-white/75 ring-1 ring-white/15 backdrop-blur">
          <h2 className="mb-2 text-xl font-semibold text-white">Design notes</h2>
          <p className="mb-3 text-white/95">
            One question: what if a 4-year-old could grow a glowing garden of light by humming
            into the tablet — and every petal that blooms is made from Karel&apos;s OWN real
            recorded piano?
          </p>
          <p className="mb-3">
            <span className="text-white/95">Input</span> · microphone, breath/hum, analysis-only
            (never recorded or sent). <span className="text-white/95">Output</span> · WebGPU
            compute-shader particle field with a first-class Canvas2D fallback.{" "}
            <span className="text-white/95">Technique</span> · concatenative grain resynthesis of
            Karel&apos;s real &ldquo;Welcome Home&rdquo; recording (CataRT-style descriptor
            navigation). <span className="text-white/95">Vibe</span> · tender, luminous,
            contemplative — no beat, no loop.
          </p>
          <p className="mb-3">
            Breath ENERGY scatters more seeds; voice PITCH lifts blooms bright-and-high or settles
            them dark-and-low. Idle or mic-denied → a scripted ghost breath keeps the garden alive.
          </p>
          <p>
            References: Diemo Schwarz&apos;s CataRT concatenative synthesis; Refik Anadol&apos;s
            luminous particle fields; WebGPU shipping on iOS Safari 26 (2026) as the enabling fact.
            Full notes live in <span className="text-white/95">README.md</span> in this folder.
          </p>
        </div>
      )}
    </main>
  );
}
