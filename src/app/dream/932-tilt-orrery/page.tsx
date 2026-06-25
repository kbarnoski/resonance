"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ════════════════════════════════════════════════════════════════════════════
//  TILT ORRERY — raw WebGPU N-body cosmos whose orbital perihelion passes
//  become a polyrhythm. Tilt the device to tip the bowl; bodies bunch and the
//  gravitational rhythm thickens. A subset of bodies are seeded in TRAPPIST-1
//  mean-motion resonance ratios → a hypnotic locked pulse inside the chaos.
// ════════════════════════════════════════════════════════════════════════════

const GPU_BODIES = 3000;      // WebGPU body count
const CPU_BODIES = 360;       // CPU-fallback body count (≤400)
const WG = 64;                // workgroup size
const RESONANT = 7;           // bodies locked in TRAPPIST-1 resonance chain

// TRAPPIST-1 adjacent mean-motion ratios (b:c:d:e:f:g:h ≈ 8:5,5:3,3:2,3:2,4:3,3:2).
// We turn the chain into absolute period multipliers relative to a base period,
// so a handful of bodies repeat against each other (Kepler's "harmony of spheres").
// Cumulative product of period ratios outward from the innermost resonant body:
const RESONANCE_PERIODS = [1.0, 1.6, 2.667, 4.0, 6.0, 8.0, 12.0];

const PENTATONIC = [0, 2, 4, 7, 9]; // dumb-by-design scale for the bells (semitones)

// ── WGSL compute shader: central-gravity orbits + tilt + perihelion flagging ──
// Body layout (vec4 × 3 = 48 bytes):
//   a: pos.xy, vel.xy
//   b: prevInvR, phase(unused), kind(0=field,1=resonant), seedHz
//   c: forced flag write happens in a separate flag buffer, not here.
const COMPUTE_WGSL = /* wgsl */ `
struct Body { a: vec4f, b: vec4f, c: vec4f }
struct U {
  dt: f32, gm: f32, tiltX: f32, tiltY: f32,
  soft: f32, count: f32, time: f32, _pad: f32,
}
@group(0) @binding(0) var<storage, read>       inB:   array<Body>;
@group(0) @binding(1) var<storage, read_write> outB:  array<Body>;
@group(0) @binding(2) var<storage, read_write> flags: array<vec4f>; // r,speed,pan,active
@group(0) @binding(3) var<uniform>             u:     U;

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(u.count)) { return; }
  var bd = inB[i];
  var pos = bd.a.xy;
  var vel = bd.a.zw;
  let kind = bd.c.z;

  // Resonant bodies follow a clean analytic ellipse so their period is locked;
  // the rest obey the central inverse-square field (chaotic-feeling cluster).
  if (kind > 0.5) {
    // Analytic circular-ish orbit at fixed radius & angular rate (seedHz drives rate)
    let r0 = bd.c.x;          // stored orbit radius
    let w  = bd.c.w;          // angular rate (rad/s) → sets period
    let th = atan2(pos.y, pos.x) + w * u.dt;
    pos = vec2f(cos(th), sin(th)) * r0;
    // Tilt eccentricity: tilt squashes the orbit so radius modulates → perihelion.
    let ecc = clamp(length(vec2f(u.tiltX, u.tiltY)) * 0.9, 0.0, 0.6);
    let tdir = normalize(vec2f(u.tiltX, u.tiltY) + vec2f(1e-5, 0.0));
    let along = dot(pos, tdir) / r0;
    pos = pos * (1.0 - ecc * 0.5 * along);
    vel = (pos - inB[i].a.xy) / max(u.dt, 1e-4);
  } else {
    let r2 = dot(pos, pos) + u.soft;
    let r  = sqrt(r2);
    let inv = 1.0 / r;
    // central inverse-square pull + tilt acceleration (the "tipped bowl")
    let acc = -pos * (u.gm * inv / r2) + vec2f(u.tiltX, u.tiltY);
    vel += acc * u.dt;
    pos += vel * u.dt;
  }

  // ── perihelion detection: rising edge of 1/r (radius minimum) ──
  let r  = max(length(pos), 1e-4);
  let invR = 1.0 / r;
  let prevInv = bd.b.x;
  let prevInv2 = bd.b.y;   // 1/r two steps ago — used to confirm a true peak
  // A local max of invR (=min radius): was rising, now falling.
  let rising = prevInv > prevInv2;
  let falling = invR < prevInv;
  if (rising && falling && prevInv > 0.0) {
    let speed = length(vel);
    let ang = atan2(pos.y, pos.x);     // for stereo pan
    let pan = clamp(cos(ang), -1.0, 1.0);
    // record the perihelion at radius = 1/prevInv (the actual minimum)
    flags[i] = vec4f(1.0 / prevInv, speed, pan, 1.0);
  }
  bd.b.y = prevInv;
  bd.b.x = invR;
  bd.a = vec4f(pos, vel);
  outB[i] = bd;
}`;

// ── WGSL vertex: instanced glowing quads ──
const VERT_WGSL = /* wgsl */ `
struct Body { a: vec4f, b: vec4f, c: vec4f }
struct VU { scale: f32, aspect: f32, ptSize: f32, _p: f32 }
struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) glow: f32,
  @location(2) kind: f32,
}
@group(0) @binding(0) var<storage, read> bodies: array<Body>;
@group(0) @binding(1) var<uniform> u: VU;
const OFF = array<vec2f,6>(
  vec2f(-1,-1), vec2f(1,-1), vec2f(-1,1),
  vec2f(-1,1),  vec2f(1,-1), vec2f(1,1)
);
@vertex fn main(@builtin(vertex_index) vi: u32) -> VO {
  let bi = vi / 6u;
  let ci = vi % 6u;
  let bd = bodies[bi];
  let p  = bd.a.xy * u.scale;
  let r  = max(length(bd.a.xy), 0.001);
  let glow = clamp(1.4 / r, 0.15, 2.2);  // brighter near perihelion
  let o  = OFF[ci];
  let sz = u.ptSize * (1.0 + select(0.0, 1.0, bd.c.z > 0.5)); // resonant bodies bigger
  var vo: VO;
  vo.pos  = vec4f(p.x * u.aspect + o.x * sz * u.aspect, p.y + o.y * sz, 0.0, 1.0);
  vo.uv   = o;
  vo.glow = glow;
  vo.kind = bd.c.z;
  return vo;
}`;

// ── WGSL fragment: additive amber/violet glow ──
const FRAG_WGSL = /* wgsl */ `
@fragment fn main(
  @location(0) uv: vec2f,
  @location(1) glow: f32,
  @location(2) kind: f32
) -> @location(0) vec4f {
  let d = length(uv);
  if (d > 1.0) { discard; }
  let core = pow(1.0 - d, 2.4);
  // field bodies: cool violet; resonant bodies: warm amber/gold
  let cField = vec3f(0.55, 0.42, 0.95);
  let cRes   = vec3f(1.0, 0.72, 0.30);
  let col = mix(cField, cRes, kind);
  let a = core * glow * 0.5;
  return vec4f(col * a, a);
}`;

// ── WGSL fade quad (motion trails) ──
const FADE_WGSL = /* wgsl */ `
struct VO { @builtin(position) pos: vec4f }
@vertex fn vmain(@builtin(vertex_index) vi: u32) -> VO {
  var p = array<vec2f,3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var o: VO; o.pos = vec4f(p[vi], 0.0, 1.0); return o;
}
@fragment fn fmain() -> @location(0) vec4f {
  return vec4f(0.02, 0.012, 0.05, 0.10); // deep indigo veil
}`;

// ── perihelion hit type shared CPU/GPU ──
interface Hit {
  radius: number;
  speed: number;
  pan: number; // -1..1
}

// ════════════════════════════════════════════════════════════════════════════
//  Audio engine — low drone + pentatonic bells, master gain → compressor → out
// ════════════════════════════════════════════════════════════════════════════
interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  fireHit: (h: Hit) => void;
  close: () => void;
}

function makeAudio(): AudioEngine {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.26;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  master.connect(comp);
  comp.connect(ctx.destination);

  // ── low drone bed (two detuned saws through a lowpass) ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 260;
  droneFilter.Q.value = 0.7;
  droneFilter.connect(droneGain);
  droneGain.connect(master);
  const droneOscs: OscillatorNode[] = [];
  [55, 55.4, 82.5].forEach((f) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.connect(droneFilter);
    o.start();
    droneOscs.push(o);
  });
  droneGain.gain.setTargetAtTime(0.14, ctx.currentTime, 1.2);

  // ── one bell/thud hit ──
  function fireHit(h: Hit) {
    const now = ctx.currentTime;
    // close+fast => bright short bell; far+slow => soft low thud
    const closeness = 1 / (1 + h.radius * 1.4);      // 0..1, larger = closer
    const energy = Math.min(1, h.speed * 0.5);
    const bright = Math.max(0, Math.min(1, closeness * 0.7 + energy * 0.3));

    // pitch held deliberately dumb: pentatonic degree from radius bucket
    const deg = PENTATONIC[Math.floor(closeness * PENTATONIC.length) % PENTATONIC.length];
    const baseMidi = 48 + (1 - bright) * 12; // closer => higher register
    const freq = 440 * Math.pow(2, (baseMidi + deg - 69) / 12);

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, h.pan));
    panner.connect(master);

    const g = ctx.createGain();
    const peak = 0.18 + bright * 0.18;
    const dur = 0.18 + (1 - bright) * 1.4; // bright = short, dark = long thud
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    g.connect(panner);

    // bell partial(s) for bright, single low sine for thud
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600 + bright * 5200;
    lp.connect(g);

    const o1 = ctx.createOscillator();
    o1.type = bright > 0.5 ? "triangle" : "sine";
    o1.frequency.value = freq;
    o1.connect(lp);
    o1.start(now);
    o1.stop(now + dur + 0.05);

    if (bright > 0.45) {
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2.01; // inharmonic shimmer
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, now);
      g2.gain.linearRampToValueAtTime(peak * 0.4 * bright, now + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0008, now + dur * 0.6);
      o2.connect(g2);
      g2.connect(panner);
      o2.start(now);
      o2.stop(now + dur);
    }
  }

  function close() {
    droneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    setTimeout(() => {
      droneOscs.forEach((o) => {
        try { o.stop(); } catch { /* already stopped */ }
      });
      ctx.close().catch(() => { /* ignore */ });
    }, 400);
  }

  return { ctx, master, fireHit, close };
}

// ════════════════════════════════════════════════════════════════════════════
//  Initial body data
// ════════════════════════════════════════════════════════════════════════════
function makeBodies(count: number): Float32Array {
  // 12 floats per body (3 × vec4)
  const data = new Float32Array(count * 12);
  for (let i = 0; i < count; i++) {
    const isRes = i < RESONANT;
    let x: number, y: number, vx: number, vy: number;
    let radius: number, w: number, kind: number;

    if (isRes) {
      // resonance chain: period multipliers → angular rate w = 2π / period
      const period = RESONANCE_PERIODS[i] * 2.6; // scale to musical seconds
      w = (2 * Math.PI) / period;
      radius = 0.18 + i * 0.085; // outward chain
      const th = (i / RESONANT) * Math.PI * 2;
      x = Math.cos(th) * radius;
      y = Math.sin(th) * radius;
      vx = 0; vy = 0; // analytic, vel recomputed in shader
      kind = 1;
    } else {
      // chaotic field: random radius, near-circular velocity for orbiting
      radius = 0.12 + Math.random() * 0.78;
      const th = Math.random() * Math.PI * 2;
      x = Math.cos(th) * radius;
      y = Math.sin(th) * radius;
      // circular orbital speed v = sqrt(GM/r), GM≈0.5, plus jitter for variety
      const v = Math.sqrt(0.5 / radius) * (0.7 + Math.random() * 0.5);
      vx = -Math.sin(th) * v;
      vy = Math.cos(th) * v;
      kind = 0;
      w = 0;
    }

    const o = i * 12;
    // a: pos.xy, vel.xy
    data[o + 0] = x; data[o + 1] = y; data[o + 2] = vx; data[o + 3] = vy;
    // b: prevInvR, prevInvR2, unused, unused
    data[o + 4] = 1 / Math.max(radius, 1e-4);
    data[o + 5] = 1 / Math.max(radius, 1e-4);
    data[o + 6] = 0; data[o + 7] = 0;
    // c: orbitRadius, unused, kind, angularRate
    data[o + 8] = radius; data[o + 9] = 0; data[o + 10] = kind; data[o + 11] = w;
  }
  return data;
}

// ════════════════════════════════════════════════════════════════════════════
//  GPU context
// ════════════════════════════════════════════════════════════════════════════
interface GpuCtx {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  computePipe: GPUComputePipeline;
  renderPipe: GPURenderPipeline;
  fadePipe: GPURenderPipeline;
  bufA: GPUBuffer;
  bufB: GPUBuffer;
  flagBuf: GPUBuffer;
  flagClear: GPUBuffer;
  readBuf: GPUBuffer;
  computeUni: GPUBuffer;
  renderUni: GPUBuffer;
  cbgAB: GPUBindGroup; // read A, write B
  cbgBA: GPUBindGroup; // read B, write A
  rbgA: GPUBindGroup;  // render from A
  rbgB: GPUBindGroup;  // render from B
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

  const init = makeBodies(GPU_BODIES);
  const mkBody = () =>
    device.createBuffer({
      size: init.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  const bufA = mkBody();
  const bufB = mkBody();
  device.queue.writeBuffer(bufA, 0, init.buffer);
  device.queue.writeBuffer(bufB, 0, init.buffer);

  const flagBytes = GPU_BODIES * 16; // vec4f per body
  const flagBuf = device.createBuffer({
    size: flagBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  const flagClear = device.createBuffer({
    size: flagBytes,
    usage: GPUBufferUsage.COPY_SRC,
  });
  device.queue.writeBuffer(flagClear, 0, new Float32Array(GPU_BODIES * 4).buffer);
  const readBuf = device.createBuffer({
    size: flagBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const computeUni = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renderUni = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePipe = device.createComputePipeline({
    layout: "auto",
    compute: { module: device.createShaderModule({ code: COMPUTE_WGSL }), entryPoint: "main" },
  });

  const renderPipe = device.createRenderPipeline({
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
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const fadeMod = device.createShaderModule({ code: FADE_WGSL });
  const fadePipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: fadeMod, entryPoint: "vmain" },
    fragment: {
      module: fadeMod,
      entryPoint: "fmain",
      targets: [
        {
          format: fmt,
          blend: {
            color: { operation: "add", srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" },
            alpha: { operation: "add", srcFactor: "one", dstFactor: "one" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const mkCompute = (read: GPUBuffer, write: GPUBuffer) =>
    device.createBindGroup({
      layout: computePipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: read } },
        { binding: 1, resource: { buffer: write } },
        { binding: 2, resource: { buffer: flagBuf } },
        { binding: 3, resource: { buffer: computeUni } },
      ],
    });
  const mkRender = (buf: GPUBuffer) =>
    device.createBindGroup({
      layout: renderPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buf } },
        { binding: 1, resource: { buffer: renderUni } },
      ],
    });

  return {
    device, ctx, computePipe, renderPipe, fadePipe,
    bufA, bufB, flagBuf, flagClear, readBuf, computeUni, renderUni,
    cbgAB: mkCompute(bufA, bufB),
    cbgBA: mkCompute(bufB, bufA),
    rbgA: mkRender(bufA),
    rbgB: mkRender(bufB),
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Component
// ════════════════════════════════════════════════════════════════════════════
type Phase = "idle" | "gpu" | "cpu";
type TiltSource = "sensor" | "auto" | "manual";

export default function TiltOrrery() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltSource, setTiltSource] = useState<TiltSource>("auto");
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [hitRate, setHitRate] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });
  const tiltSrcRef = useRef<TiltSource>("auto");
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const startTimeRef = useRef(0);
  const hitCountRef = useRef(0);

  useEffect(() => { tiltSrcRef.current = tiltSource; }, [tiltSource]);

  // keep manual sliders synced to the live tilt ref
  useEffect(() => {
    if (tiltSrcRef.current === "manual") tiltRef.current = { x: tiltX, y: tiltY };
  }, [tiltX, tiltY]);

  // ── device orientation listener (attached after Start) ──
  function applyOrientation(e: DeviceOrientationEvent) {
    if (tiltSrcRef.current !== "sensor") return;
    // gamma: left-right [-90,90]; beta: front-back [-180,180]
    const gx = (e.gamma ?? 0) / 45;
    const gy = (e.beta ?? 0) / 45;
    tiltRef.current = {
      x: Math.max(-1.2, Math.min(1.2, gx)),
      y: Math.max(-1.2, Math.min(1.2, -gy)),
    };
  }

  // ── main loop (GPU or CPU) ──
  useEffect(() => {
    if (phase === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);

    // shared: turn flags/hits into audio, throttled per body to avoid machine-gun
    const lastFireAt = new Float32Array(GPU_BODIES); // ms timestamp gate
    function emitHit(idx: number, h: Hit, nowMs: number) {
      if (nowMs - lastFireAt[idx] < 90) return; // min 90ms between same-body hits
      lastFireAt[idx] = nowMs;
      hitCountRef.current++;
      audioRef.current?.fireHit(h);
    }

    // auto-tilt: slow Lissajous so an unattended phone is moving + sounding
    function autoTilt(tSec: number): { x: number; y: number } {
      return {
        x: Math.sin(tSec * 0.31) * 0.7,
        y: Math.sin(tSec * 0.23 + 1.1) * 0.7,
      };
    }

    // ════════ GPU PATH ════════
    if (phase === "gpu") {
      let gpu: GpuCtx | null = null;
      let useAB = true;       // which compute direction this frame
      let last = performance.now();
      let mapInFlight = false;
      let hudT = 0;

      const run = async () => {
        try {
          gpu = await buildGpu(canvas);
        } catch {
          if (!cancelled) { setNotice("WebGPU unavailable — running CPU cosmos."); setPhase("cpu"); }
          return;
        }
        if (cancelled) { gpu.device.destroy(); return; }

        const frame = (now: number) => {
          if (cancelled || !gpu) return;
          const dt = Math.min((now - last) / 1000, 0.04);
          last = now;
          const tSec = (now - startTimeRef.current) / 1000;

          // resolve tilt
          let tx = tiltRef.current.x, ty = tiltRef.current.y;
          if (tiltSrcRef.current === "auto") {
            const a = autoTilt(tSec);
            tx = a.x; ty = a.y;
            tiltRef.current = a;
          }

          gpu.device.queue.writeBuffer(
            gpu.computeUni, 0,
            new Float32Array([dt, 0.5, tx * 0.6, ty * 0.6, 0.0025, GPU_BODIES, tSec, 0]).buffer
          );
          const aspect = canvas.height / Math.max(canvas.width, 1);
          gpu.device.queue.writeBuffer(
            gpu.renderUni, 0,
            new Float32Array([0.92, aspect, 0.012, 0]).buffer
          );

          const cmd = gpu.device.createCommandEncoder();
          // compute
          const cp = cmd.beginComputePass();
          cp.setPipeline(gpu.computePipe);
          cp.setBindGroup(0, useAB ? gpu.cbgAB : gpu.cbgBA);
          cp.dispatchWorkgroups(Math.ceil(GPU_BODIES / WG));
          cp.end();

          const view = gpu.ctx.getCurrentTexture().createView();
          // fade veil (trails) — load previous, draw translucent dark quad
          const fp = cmd.beginRenderPass({
            colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
          });
          fp.setPipeline(gpu.fadePipe);
          fp.draw(3);
          fp.end();
          // bodies (additive) into the freshly-written buffer
          const rp = cmd.beginRenderPass({
            colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
          });
          rp.setPipeline(gpu.renderPipe);
          rp.setBindGroup(0, useAB ? gpu.rbgB : gpu.rbgA);
          rp.draw(GPU_BODIES * 6);
          rp.end();

          // copy flags to readback, then clear flags for next frame
          if (!mapInFlight) {
            cmd.copyBufferToBuffer(gpu.flagBuf, 0, gpu.readBuf, 0, GPU_BODIES * 16);
          }
          cmd.copyBufferToBuffer(gpu.flagClear, 0, gpu.flagBuf, 0, GPU_BODIES * 16);
          gpu.device.queue.submit([cmd.finish()]);

          // async readback of LAST frame's flags — never blocks
          if (!mapInFlight) {
            mapInFlight = true;
            gpu.readBuf.mapAsync(GPUMapMode.READ).then(() => {
              if (cancelled || !gpu) return;
              const arr = new Float32Array(gpu.readBuf.getMappedRange().slice(0));
              gpu.readBuf.unmap();
              mapInFlight = false;
              const nowMs = performance.now();
              let fired = 0;
              for (let i = 0; i < GPU_BODIES && fired < 24; i++) {
                if (arr[i * 4 + 3] > 0.5) {
                  emitHit(i, { radius: arr[i * 4], speed: arr[i * 4 + 1], pan: arr[i * 4 + 2] }, nowMs);
                  fired++;
                }
              }
            }).catch(() => { mapInFlight = false; });
          }

          useAB = !useAB;

          // HUD: hits/sec
          hudT += dt;
          if (hudT > 0.5) {
            setHitRate(Math.round(hitCountRef.current / Math.max(tSec, 0.5)));
            if (tiltSrcRef.current !== "manual") {
              setTiltX(Math.round(tiltRef.current.x * 100) / 100);
              setTiltY(Math.round(tiltRef.current.y * 100) / 100);
            }
            hudT = 0;
          }

          animRef.current = requestAnimationFrame(frame);
        };
        animRef.current = requestAnimationFrame(frame);
      };
      run();

      return () => {
        cancelled = true;
        cancelAnimationFrame(animRef.current);
        gpu?.device.destroy();
      };
    }

    // ════════ CPU FALLBACK PATH ════════
    const g2d = canvas.getContext("2d");
    if (!g2d) return;
    const N = CPU_BODIES;
    const buf = makeBodies(N); // reuse layout (12 floats/body)
    const prevInv = new Float32Array(N);
    const prevInv2 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      prevInv[i] = buf[i * 12 + 4];
      prevInv2[i] = buf[i * 12 + 5];
    }
    let last = performance.now();
    let hudT = 0;

    const frame = (now: number) => {
      if (cancelled) return;
      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      const tSec = (now - startTimeRef.current) / 1000;

      let tx = tiltRef.current.x, ty = tiltRef.current.y;
      if (tiltSrcRef.current === "auto") {
        tx = Math.sin(tSec * 0.31) * 0.7;
        ty = Math.sin(tSec * 0.23 + 1.1) * 0.7;
        tiltRef.current = { x: tx, y: ty };
      }
      const ax = tx * 0.6, ay = ty * 0.6;

      // fade veil
      g2d.globalCompositeOperation = "source-over";
      g2d.fillStyle = "rgba(5,3,13,0.20)";
      g2d.fillRect(0, 0, canvas.width, canvas.height);
      g2d.globalCompositeOperation = "lighter";

      const cx = canvas.width / 2, cy = canvas.height / 2;
      const sc = Math.min(canvas.width, canvas.height) * 0.46;
      const nowMs = now;

      for (let i = 0; i < N; i++) {
        const o = i * 12;
        let x = buf[o], y = buf[o + 1], vx = buf[o + 2], vy = buf[o + 3];
        const kind = buf[o + 10];

        if (kind > 0.5) {
          const r0 = buf[o + 8], w = buf[o + 11];
          const th = Math.atan2(y, x) + w * dt;
          let nx = Math.cos(th) * r0, ny = Math.sin(th) * r0;
          const ecc = Math.min(0.6, Math.hypot(tx, ty) * 0.9);
          const tl = Math.hypot(tx, ty) + 1e-5;
          const along = (nx * (tx / tl) + ny * (ty / tl)) / r0;
          nx *= 1 - ecc * 0.5 * along; ny *= 1 - ecc * 0.5 * along;
          vx = (nx - x) / Math.max(dt, 1e-4); vy = (ny - y) / Math.max(dt, 1e-4);
          x = nx; y = ny;
        } else {
          const r2 = x * x + y * y + 0.0025;
          const r = Math.sqrt(r2);
          const f = (0.5 / r) / r2;
          vx += (-x * f + ax) * dt; vy += (-y * f + ay) * dt;
          x += vx * dt; y += vy * dt;
        }

        const r = Math.max(Math.hypot(x, y), 1e-4);
        const invR = 1 / r;
        if (prevInv[i] > prevInv2[i] && invR < prevInv[i] && prevInv[i] > 0) {
          const speed = Math.hypot(vx, vy);
          const ang = Math.atan2(y, x);
          emitHit(i, { radius: 1 / prevInv[i], speed, pan: Math.max(-1, Math.min(1, Math.cos(ang))) }, nowMs);
        }
        prevInv2[i] = prevInv[i];
        prevInv[i] = invR;
        buf[o] = x; buf[o + 1] = y; buf[o + 2] = vx; buf[o + 3] = vy;

        // draw glow
        const glow = Math.max(0.15, Math.min(2.2, 1.4 / r));
        const px = cx + x * sc, py = cy - y * sc;
        const rad = (kind > 0.5 ? 4 : 2.2) * (0.6 + glow * 0.6);
        const grad = g2d.createRadialGradient(px, py, 0, px, py, rad * 3);
        const col = kind > 0.5 ? "255,184,80" : "150,118,242";
        grad.addColorStop(0, `rgba(${col},${Math.min(0.9, glow * 0.45)})`);
        grad.addColorStop(1, `rgba(${col},0)`);
        g2d.fillStyle = grad;
        g2d.beginPath();
        g2d.arc(px, py, rad * 3, 0, Math.PI * 2);
        g2d.fill();
      }

      hudT += dt;
      if (hudT > 0.5) {
        setHitRate(Math.round(hitCountRef.current / Math.max(tSec, 0.5)));
        if (tiltSrcRef.current !== "manual") {
          setTiltX(Math.round(tiltRef.current.x * 100) / 100);
          setTiltY(Math.round(tiltRef.current.y * 100) / 100);
        }
        hudT = 0;
      }
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
    };
  }, [phase]);

  // ── Start: audio + tilt source + GPU/CPU decision (all in user gesture) ──
  async function handleStart() {
    hitCountRef.current = 0;
    startTimeRef.current = performance.now();

    // 1. audio context inside the gesture
    try {
      const a = makeAudio();
      await a.ctx.resume();
      audioRef.current = a;
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    // 2. tilt: try iOS permission inside the same gesture; default to auto demo
    let gotSensor = false;
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", applyOrientation);
          gotSensor = true;
        }
      } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
        // non-iOS: just attach; if no events arrive, auto-tilt keeps it alive
        window.addEventListener("deviceorientation", applyOrientation);
      }
    } catch {
      /* sensor unavailable — auto demo carries it */
    }
    // start in auto so an unattended phone is moving in ~0.6s; sensor (if granted)
    // promotes itself the first time a real reading arrives.
    setTiltSource(gotSensor ? "sensor" : "auto");

    // 3. choose render path
    if (typeof navigator !== "undefined" && navigator.gpu) {
      setPhase("gpu");
    } else {
      setNotice("WebGPU unavailable — running CPU cosmos.");
      setPhase("cpu");
    }
  }

  function handleStop() {
    cancelAnimationFrame(animRef.current);
    window.removeEventListener("deviceorientation", applyOrientation);
    audioRef.current?.close();
    audioRef.current = null;
    setPhase("idle");
    setNotice(null);
  }

  // ── pointer drag → manual tilt vector ──
  function handlePointerDown(e: React.PointerEvent) {
    if (phase === "idle") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
    setTiltSource("manual");
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const x = Math.max(-1.2, Math.min(1.2, nx * 1.2));
    const y = Math.max(-1.2, Math.min(1.2, -ny * 1.2));
    tiltRef.current = { x, y };
    setTiltX(Math.round(x * 100) / 100);
    setTiltY(Math.round(y * 100) / 100);
  }
  function handlePointerUp() { dragRef.current = null; }

  const running = phase !== "idle";

  return (
    <div className="relative w-full bg-[#05030d]" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none", cursor: running ? "crosshair" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* idle / start */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="font-serif text-3xl md:text-4xl text-white mb-3 tracking-tight">
            Tilt Orrery
          </h1>
          <p className="text-base text-white/75 max-w-md mb-2 leading-relaxed">
            Tip a little cosmos like a bowl. Each time a body sweeps through its
            closest approach, it rings — and the whole field becomes a polyrhythm.
          </p>
          <p className="text-base text-white/60 max-w-md mb-8 leading-relaxed">
            A handful of bodies are locked in TRAPPIST-1 resonance, so a steady
            pulse hides inside the chaos.
          </p>
          <button
            onClick={handleStart}
            className="px-6 py-2.5 min-h-[44px] text-base text-white border border-violet-400/50 bg-violet-500/20 rounded hover:bg-violet-500/30 hover:border-violet-400 transition"
          >
            Start
          </button>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-5 text-base text-white/60 hover:text-white/90 underline underline-offset-4"
          >
            Design notes
          </button>
          <Link href="/dream" className="mt-10 text-base text-white/60 hover:text-white/90">
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* running HUD + controls */}
      {running && (
        <>
          <div className="absolute top-4 left-4 text-base text-white/75 space-y-1 pointer-events-none select-none">
            <div className="font-serif text-2xl text-white/95">Tilt Orrery</div>
            <div className="text-sm text-white/60 font-mono">
              {phase === "gpu" ? `WebGPU · ${GPU_BODIES} bodies` : `CPU · ${CPU_BODIES} bodies`}
            </div>
            <div className="text-sm text-white/60 font-mono">
              tilt {tiltX.toFixed(2)}, {tiltY.toFixed(2)} · {hitRate} hits/s · {tiltSource}
            </div>
          </div>

          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto bg-black/30 rounded-lg p-3">
            <div className="flex gap-2">
              <button
                onClick={() => setTiltSource("auto")}
                className={`text-sm px-3 py-2 min-h-[44px] rounded border transition ${
                  tiltSource === "auto"
                    ? "border-violet-400 text-violet-300 bg-violet-500/20"
                    : "border-white/20 text-white/70 hover:border-white/50"
                }`}
              >
                auto-drift
              </button>
              <button
                onClick={() => setTiltSource("manual")}
                className={`text-sm px-3 py-2 min-h-[44px] rounded border transition ${
                  tiltSource === "manual"
                    ? "border-violet-400 text-violet-300 bg-violet-500/20"
                    : "border-white/20 text-white/70 hover:border-white/50"
                }`}
              >
                drag/sliders
              </button>
            </div>
            <label className="text-sm text-white/70 font-mono w-full">
              tilt x
              <input
                type="range" min="-1.2" max="1.2" step="0.01" value={tiltX}
                onChange={(e) => { setTiltSource("manual"); setTiltX(parseFloat(e.target.value)); }}
                className="w-40 accent-violet-400 block"
              />
            </label>
            <label className="text-sm text-white/70 font-mono w-full">
              tilt y
              <input
                type="range" min="-1.2" max="1.2" step="0.01" value={tiltY}
                onChange={(e) => { setTiltSource("manual"); setTiltY(parseFloat(e.target.value)); }}
                className="w-40 accent-violet-400 block"
              />
            </label>
            <button
              onClick={handleStop}
              className="text-sm text-white/70 hover:text-white border border-white/20 hover:border-white/50 px-3 py-2 min-h-[44px] rounded w-full"
            >
              Stop
            </button>
          </div>

          <Link
            href="/dream"
            className="absolute bottom-4 left-4 text-base text-white/60 hover:text-white/90"
          >
            ← back
          </Link>
        </>
      )}

      {/* amber notice (graceful, not a crash) */}
      {notice && (
        <div className="absolute top-4 right-4 max-w-xs text-base text-amber-300/95 bg-black/40 rounded px-3 py-2">
          {notice}
        </div>
      )}

      {/* design notes overlay */}
      {showNotes && phase === "idle" && (
        <div className="absolute inset-0 bg-black/85 flex items-center justify-center px-6 overflow-y-auto">
          <div className="max-w-lg text-left py-10">
            <h2 className="font-serif text-2xl text-white mb-4">Design notes</h2>
            <p className="text-base text-white/75 mb-3 leading-relaxed">
              A raw-WebGPU N-body field orbits a central mass. A compute shader
              integrates {GPU_BODIES} bodies (semi-implicit Euler, inverse-square
              gravity plus a tilt acceleration vector). It tracks each body&apos;s
              previous 1/r and flags a <span className="text-violet-300">rising edge</span> —
              a perihelion (closest approach) — into a buffer that the CPU reads
              back asynchronously each frame and turns into a bell.
            </p>
            <p className="text-base text-white/75 mb-3 leading-relaxed">
              Pitch is kept deliberately dumb (a low drone + a fixed pentatonic),
              so the music lives in rhythm, density and space. Timbre comes from
              radius and speed (close+fast = bright bell, far+slow = soft thud);
              stereo pan comes from the body&apos;s angular position, so you hear
              the cosmos rotate around you.
            </p>
            <p className="text-base text-white/75 mb-4 leading-relaxed">
              Seven bodies are seeded in the <span className="text-amber-300">TRAPPIST-1
              resonance chain</span> (≈8:5, 5:3, 3:2, 3:2, 4:3, 3:2), so a steady
              hypnotic pulse emerges from the chaotic field — Kepler&apos;s 1619
              &ldquo;harmony of the spheres.&rdquo;
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="text-base text-violet-300 hover:text-violet-200 underline underline-offset-4 min-h-[44px]"
            >
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
