"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 866 · KIDS · RAINSTICK SKY
// "What if a 4-year-old could make a calm rainstorm of music by gently SHAKING
//  the tablet like a rainstick — and stillness settles it into a sleepy drone of
//  glowing stars?"
//
// INPUT  = DeviceMotion shake-energy (jerk of accelerationIncludingGravity).
// OUTPUT = WebGPU compute-shader rain particle field (WebGL2 fallback, then text).
// AUDIO  = warm pentatonic marimba/bell droplets + always-on drone, fixed SAFE
//          envelope: master ≤0.28 → lowpass ≤6.5k → compressor(−10, 20:1) → out.
//
// The shake only ever changes DENSITY (drops/sec) and drift — never loudness,
// never harshness. That bounded mapping is the "auditable safe envelope".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── particle field constants ────────────────────────────────────────────────
const N_GPU = 60_000; // WebGPU compute-driven raindrops/stars
const N_GL = 3_000; // WebGL2 fallback raindrops
const WG = 64;

// ── audio: C pentatonic over a warm bedtime range (no wrong notes ever) ──────
// C  D  E  G  A  across two gentle octaves; low drone roots underneath.
const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.0, 220.0, // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, // C5 D5 E5  (sparkle top, still soft)
];

// ════════════════════════════════════════════════════════════════════════════
//  WGSL — compute pass: integrate falling raindrops with gentle curl drift
// ════════════════════════════════════════════════════════════════════════════
// Particle = vec4f(x, y, vy, life). x,y in [0,1] screen space. Wrap at bottom.
const COMPUTE_WGSL = /* wgsl */ `
struct P { d: vec4f }            // x, y, fallSpeed, twinkle-phase

struct CU {
  dt: f32, density: f32, drift: f32, time: f32,
  windPhase: f32, _p0: f32, _p1: f32, _p2: f32,
}

@group(0) @binding(0) var<storage, read_write> pts: array<P>;
@group(0) @binding(1) var<uniform> u: CU;

fn hash(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.5453); }

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= ${N_GPU}u) { return; }
  var p = pts[i].d;
  let fi = f32(i);

  // gentle horizontal curl/wind drift — calm, never chaotic
  let wind = sin(p.y * 6.2831 + u.windPhase) * 0.12 + sin(p.x * 9.0 + u.time * 0.3) * 0.06;
  p.x = fract(p.x + wind * u.drift * u.dt);

  // fall: speed scales softly with density (denser shake = livelier rain)
  let spd = p.z * (0.35 + u.density * 0.65);
  p.y = p.y + spd * u.dt;

  // twinkle phase advance (for star sparkle in still moments)
  p.w = fract(p.w + u.dt * 0.15);

  // wrap at bottom → recycle near top with fresh randomised x
  if (p.y > 1.05) {
    p.y = -0.05 - hash(fi + u.time) * 0.1;
    p.x = hash(fi * 1.7 + u.time * 0.31);
  }
  pts[i].d = p;
}`;

// ── WGSL vertex: particle → glowing point-quad in NDC ───────────────────────
const VERT_WGSL = /* wgsl */ `
struct P { d: vec4f }
struct VU { aspect: f32, density: f32, size: f32, time: f32 }

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) life: f32,   // 0=top .. 1=bottom (for colour)
  @location(2) tw: f32,     // twinkle
}

@group(0) @binding(0) var<storage, read> pts: array<P>;
@group(0) @binding(1) var<uniform> u: VU;

const OFF = array<vec2f, 6>(
  vec2f(-1.,-1.), vec2f(1.,-1.), vec2f(-1.,1.),
  vec2f(-1.,1.),  vec2f(1.,-1.), vec2f(1.,1.)
);

@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let pi = vi / 6u;
  let ci = vi % 6u;
  let p = pts[pi].d;

  // map [0,1] screen → NDC [-1,1]; y is flipped (0 top)
  let ndc = vec2f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0);
  let o = OFF[ci];
  // stars are a touch bigger when calm (low density), drops smaller/quicker
  let sz = u.size * (0.7 + (1.0 - u.density) * 0.8);
  var vo: VO;
  vo.pos = vec4f(ndc.x + o.x * sz, ndc.y + o.y * sz * u.aspect, 0.0, 1.0);
  vo.uv = o;
  vo.life = clamp(p.y, 0.0, 1.0);
  vo.tw = p.w;
  return vo;
}`;

// ── WGSL fragment: soft additive glow, cool-night → warm-gold sparkle ───────
const FRAG_WGSL = /* wgsl */ `
struct VU { aspect: f32, density: f32, size: f32, time: f32 }
@group(0) @binding(1) var<uniform> u: VU;

@fragment fn main(
  @location(0) uv: vec2f,
  @location(1) life: f32,
  @location(2) tw: f32
) -> @location(0) vec4f {
  let d = length(uv);
  if (d > 1.0) { discard; }
  let glow = pow(1.0 - d, 2.2);

  // palette: deep indigo (top) → soft violet (mid) → warm gold sparkle
  let indigo = vec3f(0.20, 0.18, 0.55);
  let violet = vec3f(0.45, 0.32, 0.78);
  let gold   = vec3f(1.0, 0.82, 0.45);
  var col = mix(indigo, violet, life);
  // twinkle: occasional warm-gold star sparkle, stronger when calm
  let spark = pow(0.5 + 0.5 * sin(tw * 6.2831 + u.time * 1.5), 8.0) * (1.0 - u.density);
  col = mix(col, gold, spark);

  let a = glow * (0.28 + 0.30 * (1.0 - u.density)); // softer overall, calm = brighter stars
  return vec4f(col * a, a);
}`;

// ════════════════════════════════════════════════════════════════════════════
//  WebGL2 fallback shaders (GLSL) — same shake→density mapping, fewer particles
// ════════════════════════════════════════════════════════════════════════════
const GL_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 a_seed;   // (x0, fallSpeed)
uniform float u_time;
uniform float u_density;
uniform float u_drift;
uniform float u_aspect;
out float v_life;
out float v_idx;
void main() {
  float idx = a_seed.x;
  float spd = a_seed.y * (0.35 + u_density * 0.65);
  // deterministic fall using time, wrapped
  float baseY = fract(idx * 7.13);
  float y = fract(baseY + u_time * spd * 0.12);
  float wind = sin(y * 6.2831 + u_time * 0.4) * 0.10 * u_drift;
  float x = fract(idx + wind);
  vec2 ndc = vec2(x * 2.0 - 1.0, 1.0 - y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  gl_PointSize = (4.0 + (1.0 - u_density) * 6.0);
  v_life = y;
  v_idx = idx;
}`;

const GL_FRAG = /* glsl */ `#version 300 es
precision highp float;
in float v_life;
in float v_idx;
uniform float u_time;
uniform float u_density;
out vec4 frag;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;
  float glow = pow(1.0 - d, 2.2);
  vec3 indigo = vec3(0.20, 0.18, 0.55);
  vec3 violet = vec3(0.45, 0.32, 0.78);
  vec3 gold   = vec3(1.0, 0.82, 0.45);
  vec3 col = mix(indigo, violet, v_life);
  float spark = pow(0.5 + 0.5 * sin(v_idx * 30.0 + u_time * 1.5), 8.0) * (1.0 - u_density);
  col = mix(col, gold, spark);
  float a = glow * (0.30 + 0.30 * (1.0 - u_density));
  frag = vec4(col * a, a);
}`;

// ════════════════════════════════════════════════════════════════════════════
//  GPU helpers
// ════════════════════════════════════════════════════════════════════════════
interface GpuCtx {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  particleBuf: GPUBuffer;
  computeUni: GPUBuffer;
  renderUni: GPUBuffer;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
}

function buildRain(n: number): Float32Array {
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.random(); // x
    data[i * 4 + 1] = Math.random() * 1.1 - 0.05; // y
    data[i * 4 + 2] = 0.25 + Math.random() * 0.55; // fall speed
    data[i * 4 + 3] = Math.random(); // twinkle phase
  }
  return data;
}

async function buildGpu(canvas: HTMLCanvasElement): Promise<GpuCtx> {
  if (!navigator.gpu) throw new Error("no-webgpu");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no-webgpu");
  const device = await adapter.requestDevice();
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-webgpu");
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const initial = buildRain(N_GPU);
  const particleBuf = device.createBuffer({
    size: initial.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, initial.buffer);

  const computeUni = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUni = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });
  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: VERT_WGSL }), entryPoint: "main" },
    fragment: {
      module: device.createShaderModule({ code: FRAG_WGSL }),
      entryPoint: "main",
      targets: [
        {
          format: fmt,
          blend: {
            color: { operation: "add", srcFactor: "one", dstFactor: "one" },
            alpha: { operation: "add", srcFactor: "zero", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const computeBG = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: computeUni } },
    ],
  });
  const renderBG = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particleBuf } },
      { binding: 1, resource: { buffer: renderUni } },
    ],
  });

  return {
    device, ctx, computePipeline, renderPipeline,
    particleBuf, computeUni, renderUni, computeBG, renderBG,
  };
}

// ── WebGL2 fallback context ─────────────────────────────────────────────────
interface GlCtx {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  u_time: WebGLUniformLocation | null;
  u_density: WebGLUniformLocation | null;
  u_drift: WebGLUniformLocation | null;
  u_aspect: WebGLUniformLocation | null;
  loseExt: WEBGL_lose_context | null;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("no-shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? "shader-compile");
  }
  return sh;
}

function buildGl(canvas: HTMLCanvasElement): GlCtx {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
  if (!gl) throw new Error("no-webgl2");

  const program = gl.createProgram();
  if (!program) throw new Error("no-program");
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, GL_VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, GL_FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "link");
  }

  // seed buffer: (x0 in [0,1], fallSpeed)
  const seeds = new Float32Array(N_GL * 2);
  for (let i = 0; i < N_GL; i++) {
    seeds[i * 2] = Math.random();
    seeds[i * 2 + 1] = 0.25 + Math.random() * 0.55;
  }
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("no-vao");
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive glow

  return {
    gl,
    program,
    vao,
    u_time: gl.getUniformLocation(program, "u_time"),
    u_density: gl.getUniformLocation(program, "u_density"),
    u_drift: gl.getUniformLocation(program, "u_drift"),
    u_aspect: gl.getUniformLocation(program, "u_aspect"),
    loseExt: gl.getExtension("WEBGL_lose_context"),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  AUDIO — kids-safe chain + rain-density granular chime scheduler
// ════════════════════════════════════════════════════════════════════════════
interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  droneGain: GainNode;
  drones: OscillatorNode[];
  analyser: AnalyserNode;
}

function buildAudio(): AudioRig {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // SAFE ENVELOPE (fixed, auditable): master ≤0.28 → lowpass ≤6.5k → comp → out
  const master = ctx.createGain();
  master.gain.value = 0.26;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 6000; // ≤6.5kHz, no harsh highs
  filter.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;
  comp.knee.value = 6;

  master.connect(filter);
  filter.connect(comp);
  comp.connect(ctx.destination);

  // analyser tapped off master (NEVER routed to destination)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;
  master.connect(analyser);

  // always-on warm drone (Eno-style ambient bed) → never silent
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  const drones: OscillatorNode[] = [];
  // root C2 + perfect fifth G2 + soft octave: a sleepy chord
  [65.41, 98.0, 130.81].forEach((f, idx) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = idx === 0 ? 1.0 : 0.5;
    // gentle detune shimmer
    o.detune.value = (idx - 1) * 4;
    o.connect(og);
    og.connect(droneGain);
    o.start();
    drones.push(o);
  });
  // ease drone in (≥40ms attack — actually a long calm swell)
  droneGain.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2);

  return { ctx, master, filter, comp, droneGain, drones, analyser };
}

// One warm marimba/bell droplet — soft attack, gentle decay, no transient.
function playDroplet(rig: AudioRig, freq: number, vel: number) {
  const ctx = rig.ctx;
  const now = ctx.currentTime;

  const voice = ctx.createGain();
  // peak is bounded — velocity only nudges within a SAFE range, never loud
  const peak = 0.08 + Math.min(vel, 1) * 0.05; // 0.08..0.13, well under master
  voice.gain.setValueAtTime(0.0001, now);
  voice.gain.linearRampToValueAtTime(peak, now + 0.05); // ≥40ms soft attack
  voice.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
  voice.connect(rig.master);

  // warm partials: fundamental + soft octave + faint 3rd partial (bell/marimba)
  const partials: [number, number][] = [
    [1, 1.0],
    [2.0, 0.28],
    [3.01, 0.10],
  ];
  partials.forEach(([mult, amp]) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g);
    g.connect(voice);
    o.start(now);
    o.stop(now + 1.7);
  });
}

// ── shake mapping → drops/sec (DENSITY only; never volume) ──────────────────
// Bounded deterministically: a hard shake just makes more drops, capped.
function densityToRate(density: number): number {
  // calm/still ≈ 0 → ~1.2 drops/s (a few slow drops + drone)
  // full shake = 1 → ~14 drops/s (busy but soft rain), HARD CAP.
  return 1.2 + density * 12.8;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENT
// ════════════════════════════════════════════════════════════════════════════
type Phase = "idle" | "running";
type Backend = "webgpu" | "webgl2" | "none";

export default function KidsRainstickSky() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend>("webgpu");
  const [sensor, setSensor] = useState<"on" | "auto" | "denied">("auto");
  const [shakeHud, setShakeHud] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const animRef = useRef(0);

  // shake-energy signal (smoothed), 0..1
  const shakeRef = useRef(0);
  const densityRef = useRef(0);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const motionLiveRef = useRef(false);
  const dropAccumRef = useRef(0);

  // pointer "shake" affordance (desktop / no-sensor)
  const pointerEnergyRef = useRef(0);

  // ── DeviceMotion handler: shake-energy = jerk magnitude (high-pass of accel) ─
  const onMotion = useCallback((e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity ?? e.acceleration;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    motionLiveRef.current = true;
    const cur = { x: a.x, y: a.y, z: a.z };
    const last = lastAccelRef.current;
    if (last) {
      // jerk = magnitude of change of acceleration (high-pass) → shake, not tilt
      const dx = cur.x - last.x;
      const dy = cur.y - last.y;
      const dz = cur.z - last.z;
      const jerk = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // normalise: ~5 m/s^2 change between frames ≈ vigorous gentle shake
      const e01 = Math.min(jerk / 5, 1);
      // attack-fast / release-slow smoothing → calm settle
      shakeRef.current = Math.max(shakeRef.current * 0.9, e01);
    }
    lastAccelRef.current = cur;
  }, []);

  // ── teardown ────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    window.removeEventListener("devicemotion", onMotion);
    const rig = rigRef.current;
    if (rig) {
      try {
        rig.drones.forEach((o) => {
          try { o.stop(); } catch { /* already stopped */ }
        });
      } catch { /* noop */ }
      rig.ctx.close().catch(() => {});
      rigRef.current = null;
    }
  }, [onMotion]);

  useEffect(() => () => stopAll(), [stopAll]);

  // ── start (must run inside user tap for iOS audio + motion permission) ───────
  const handleStart = useCallback(async () => {
    // 1) audio context created inside the tap
    const rig = buildAudio();
    rigRef.current = rig;
    await rig.ctx.resume().catch(() => {});

    // 2) DeviceMotion permission (feature-detected; iOS 13+ only)
    type MotionPermCtor = {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const dme = DeviceMotionEvent as unknown as MotionPermCtor;
    if (typeof dme.requestPermission === "function") {
      try {
        const res = await dme.requestPermission();
        if (res === "granted") {
          window.addEventListener("devicemotion", onMotion);
          setSensor("on");
        } else {
          setSensor("denied");
        }
      } catch {
        setSensor("denied");
      }
    } else if (typeof window.DeviceMotionEvent !== "undefined") {
      // non-iOS: just listen; auto-demo covers desktops with no sensor
      window.addEventListener("devicemotion", onMotion);
      setSensor("auto");
    } else {
      setSensor("auto");
    }

    setPhase("running");
  }, [onMotion]);

  // ── pointer "shake" affordance: drag/move energy feeds shake when no sensor ──
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    const m = Math.min((Math.abs(e.movementX) + Math.abs(e.movementY)) / 40, 1);
    pointerEnergyRef.current = Math.max(pointerEnergyRef.current, m);
  }, []);

  // ── main render + audio loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: GpuCtx | null = null;
    let glx: GlCtx | null = null;
    let mode: Backend = "none";
    let last = performance.now();
    let demoT = 0;
    let hudT = 0;

    async function run(cv: HTMLCanvasElement) {
      const dpr = Math.min(devicePixelRatio, 2);
      cv.width = Math.floor(cv.clientWidth * dpr);
      cv.height = Math.floor(cv.clientHeight * dpr);

      // try WebGPU → WebGL2 → text notice (audio keeps running regardless)
      try {
        gpu = await buildGpu(cv);
        mode = "webgpu";
      } catch {
        try {
          glx = buildGl(cv);
          mode = "webgl2";
        } catch {
          mode = "none";
        }
      }
      if (cancelled) {
        if (gpu) gpu.device.destroy();
        if (glx) glx.loseExt?.loseContext();
        return;
      }
      setBackend(mode);

      const loop = (now: number) => {
        if (cancelled) return;
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        demoT += dt;

        // ── resolve shake-energy from sensor / pointer / auto-demo ──────────────
        let energy = shakeRef.current;
        // decay (release-slow) so stillness settles toward sleep
        shakeRef.current *= 0.965;

        // pointer affordance contributes
        if (pointerEnergyRef.current > energy) energy = pointerEnergyRef.current;
        pointerEnergyRef.current *= 0.9;

        // auto-demo: if no live motion ever arrived, breathe rain on its own (~<1s)
        if (!motionLiveRef.current) {
          const demo = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(demoT * 0.6));
          energy = Math.max(energy, demo);
        }

        // smoothed density (this is the ONLY thing shake changes — bounded 0..1)
        densityRef.current += (energy - densityRef.current) * 0.12;
        const density = Math.min(Math.max(densityRef.current, 0), 1);

        // ── audio: schedule droplets at density-driven rate (volume FIXED) ──────
        const rig = rigRef.current;
        if (rig) {
          const rate = densityToRate(density);
          dropAccumRef.current += rate * dt;
          let guard = 0;
          while (dropAccumRef.current >= 1 && guard < 6) {
            dropAccumRef.current -= 1;
            guard++;
            const i = Math.floor(Math.random() * PENTA_HZ.length);
            // calmer moments favour lower, warmer notes; busy favours sparkle top
            const biasIdx =
              density < 0.4
                ? Math.floor(Math.random() * 7) // low/warm
                : i;
            playDroplet(rig, PENTA_HZ[biasIdx], 0.4 + density * 0.6);
          }
        }

        // HUD ~10Hz
        hudT += dt;
        if (hudT > 0.1) {
          hudT = 0;
          setShakeHud(Math.round(density * 100));
        }

        // ── visual update ───────────────────────────────────────────────────────
        if (mode === "webgpu" && gpu) {
          const dpr2 = Math.min(devicePixelRatio, 2);
          const nw = Math.floor(cv.clientWidth * dpr2);
          const nh = Math.floor(cv.clientHeight * dpr2);
          if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; }
          const aspect = cv.width / Math.max(cv.height, 1);

          gpu.device.queue.writeBuffer(
            gpu.computeUni, 0,
            new Float32Array([dt, density, 0.6 + density * 0.8, demoT, demoT * 0.5, 0, 0, 0]).buffer
          );
          gpu.device.queue.writeBuffer(
            gpu.renderUni, 0,
            new Float32Array([aspect, density, 0.006, demoT]).buffer
          );

          const cmd = gpu.device.createCommandEncoder();
          const cp = cmd.beginComputePass();
          cp.setPipeline(gpu.computePipeline);
          cp.setBindGroup(0, gpu.computeBG);
          cp.dispatchWorkgroups(Math.ceil(N_GPU / WG));
          cp.end();

          const view = gpu.ctx.getCurrentTexture().createView();
          const rp = cmd.beginRenderPass({
            colorAttachments: [
              {
                view,
                clearValue: { r: 0.02, g: 0.02, b: 0.06, a: 1 },
                loadOp: "clear",
                storeOp: "store",
              },
            ],
          });
          rp.setPipeline(gpu.renderPipeline);
          rp.setBindGroup(0, gpu.renderBG);
          rp.draw(N_GPU * 6);
          rp.end();
          gpu.device.queue.submit([cmd.finish()]);
        } else if (mode === "webgl2" && glx) {
          const dpr2 = Math.min(devicePixelRatio, 2);
          const nw = Math.floor(cv.clientWidth * dpr2);
          const nh = Math.floor(cv.clientHeight * dpr2);
          if (cv.width !== nw || cv.height !== nh) { cv.width = nw; cv.height = nh; }
          const { gl, program, vao } = glx;
          gl.viewport(0, 0, cv.width, cv.height);
          gl.clearColor(0.02, 0.02, 0.06, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(program);
          gl.uniform1f(glx.u_time, demoT);
          gl.uniform1f(glx.u_density, density);
          gl.uniform1f(glx.u_drift, 0.6 + density * 0.8);
          gl.uniform1f(glx.u_aspect, cv.width / Math.max(cv.height, 1));
          gl.bindVertexArray(vao);
          gl.drawArrays(gl.POINTS, 0, N_GL);
          gl.bindVertexArray(null);
        }

        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    }

    run(canvas);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      if (gpu) { try { gpu.device.destroy(); } catch { /* noop */ } }
      if (glx) { try { glx.loseExt?.loseContext(); } catch { /* noop */ } }
    };
  }, [phase]);

  // ════════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#04040c] text-white select-none">
      {/* particle field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={onPointerMove}
      />

      {/* nav */}
      <Link
        href="/dream"
        className="absolute left-3 top-3 z-20 rounded-lg bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur-sm hover:text-white"
      >
        ← lab
      </Link>

      {/* idle: giant kid-friendly Start (≥72px, no reading required) */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-[#04040c]/80 backdrop-blur-sm">
          <div className="text-center">
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              Rainstick Sky
            </h1>
            <p className="mt-3 max-w-md px-6 text-base text-white/75">
              Gently shake the tablet to make a calm rain of music. Hold still for
              sleepy glowing stars.
            </p>
          </div>
          <button
            onClick={handleStart}
            aria-label="Start"
            className="flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-b from-indigo-400 to-violet-600 text-6xl shadow-[0_0_60px_rgba(139,92,246,0.6)] transition active:scale-95"
          >
            🌧️
          </button>
          <p className="text-base text-white/75">tap the cloud</p>
        </div>
      )}

      {/* running HUD overlay */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-4">
          {/* shake meter — color is the language */}
          <div className="h-3 w-48 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-violet-400 to-amber-300 transition-[width] duration-100"
              style={{ width: `${Math.max(shakeHud, 4)}%` }}
            />
          </div>
          <p className="font-mono text-base text-white/75">
            {shakeHud < 15 ? "✨ sleepy stars" : shakeHud < 55 ? "🌧️ soft rain" : "🌧️🌧️ more rain"}
          </p>

          {backend === "none" && (
            <p className="mt-2 max-w-sm text-center text-base text-rose-300">
              No GPU drawing here, but the rain is still playing — listen and
              shake. ✨
            </p>
          )}
          {sensor === "denied" && (
            <p className="mt-1 max-w-sm text-center text-base text-rose-300">
              Motion is off — drag a finger across the sky to make it rain.
            </p>
          )}
          {sensor === "auto" && (
            <p className="mt-1 text-center text-base text-white/75">
              Shake or drag across the sky to make more rain.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
