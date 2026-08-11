"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10088 · Resonograph — sing a shape into being.
//
//   ONE QUESTION
//   What if you could SING a shape into being — hold a pitch and watch tens of
//   thousands of sand grains crawl across a vibrating brass plate and settle onto
//   the exact nodal lines of that tone's standing wave?
//
//   A virtual Chladni plate you play with your voice. Tens of thousands of grains
//   are simulated on the GPU; each descends the |ψ| gradient of the plate's
//   standing wave and hops randomly in proportion to the local vibration, so it
//   wanders away from antinodes and freezes on the still NODAL LINES. Over a few
//   seconds the sand self-organizes into the crisp geometric Chladni figure.
//
//   Your sung/hummed/whistled pitch is the sensor. Autocorrelation finds the
//   fundamental; it picks the eigenmode (m, n) whose Kirchhoff–Love modal
//   frequency f_mn ∝ (m² + n²) is closest, so higher notes summon busier figures.
//   Slide your pitch up and the figure visibly reorganizes into finer lattices.
//
//   The plate answers in METAL: when a mode locks it is struck and rings with an
//   INHARMONIC bell/plate partial series (1, 2.76, 5.40, 8.93, 13.34), sustained
//   by your own voice. Not a chord — resonance.
//
//   SUBSTRATE  WebGPU compute (ping-pong storage buffers) → WebGL2 transform
//   feedback → CPU, each badged. Render is WebGPU/WebGL point additive; never
//   Canvas2D. No mic → seeded pitch sweep + manual (m,n) slider, still sings.
//
//   REFS  Ernst Chladni, *Entdeckungen über die Theorie des Klanges* (1787);
//   "ChladniSonify: A Visual-Acoustic Mapping Method for Chladni Patterns in New
//   Media Art Creation," arXiv:2605.09846 (2026) — which maps patterns → freq via
//   Kirchhoff–Love plate theory; this piece runs the mapping the OTHER direction.
//   Seeded by this cycle's research dive into ChladniSonify (2026). See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MODES, pickModeIndex, detectPitch } from "./chladni";
import { makeWebglBackend, type Backend, type StepParams } from "./webgl";
import { PlateAudio } from "./audio";

// ── Deterministic PRNG (mulberry32) — never Math.random for seeded scatter ────

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

const GPU_COUNT = 42000;
const WEBGL_COUNT = 24000;
const CPU_COUNT = 4200;

// ── WebGPU compute backend ────────────────────────────────────────────────────

const COMPUTE_WGSL = /* wgsl */ `
struct Params { m:f32, n:f32, lr:f32, jitter:f32, strike:f32, frame:u32, count:u32, pad:u32 };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> src: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2<f32>>;
const PI = 3.14159265;
fn pcg(v0: u32) -> u32 { var v = v0 * 747796405u + 2891336453u; let s = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u; return (s >> 22u) ^ s; }
fn u2f(u: u32) -> f32 { return f32(u) / 4294967295.0; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var p = src[i];
  let a = PI * P.m; let b = PI * P.n;
  let cmx = cos(a*p.x); let smx = sin(a*p.x);
  let cny = cos(b*p.y); let sny = sin(b*p.y);
  let cnx = cos(b*p.x); let snx = sin(b*p.x);
  let cmy = cos(a*p.y); let smy = sin(a*p.y);
  let psi = cmx*cny - cnx*cmy;
  let g = vec2<f32>(-a*smx*cny + b*snx*cmy, -b*cmx*sny + a*cnx*smy);
  let g2 = dot(g, g) + 1e-3;
  p = p - P.lr * psi * g / g2;
  let amp = clamp(abs(psi) / 2.0, 0.0, 1.0);
  let h1 = pcg(i*2u + P.frame*19349663u);
  let h2 = pcg(i*2u + 1u + P.frame*83492791u);
  let r = vec2<f32>(u2f(h1), u2f(h2)) * 2.0 - 1.0;
  p = p + r * (P.jitter * (amp + 0.02) * (1.0 + P.strike * 6.0));
  if (p.x < 0.0) { p.x = -p.x; } if (p.x > 1.0) { p.x = 2.0 - p.x; }
  if (p.y < 0.0) { p.y = -p.y; } if (p.y > 1.0) { p.y = 2.0 - p.y; }
  dst[i] = clamp(p, vec2<f32>(0.0), vec2<f32>(1.0));
}`;

const RENDER_WGSL = /* wgsl */ `
struct Params { m:f32, n:f32, lr:f32, jitter:f32, strike:f32, frame:u32, count:u32, pad:u32 };
@group(0) @binding(0) var<uniform> P: Params;
const PI = 3.14159265;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn plate_vs(@builtin(vertex_index) vi: u32) -> VOut {
  var q = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: VOut; let p = q[vi];
  o.pos = vec4<f32>(p, 0.0, 1.0); o.uv = p * 0.5 + 0.5; return o;
}
@fragment fn plate_fs(i: VOut) -> @location(0) vec4<f32> {
  let x = i.uv.x; let y = i.uv.y;
  let psi = cos(PI*P.m*x)*cos(PI*P.n*y) - cos(PI*P.n*x)*cos(PI*P.m*y);
  let amp = clamp(abs(psi) / 2.0, 0.0, 1.0);
  let brass = vec3<f32>(0.30, 0.205, 0.085);
  var col = brass * (0.42 + 0.72 * amp);
  col = col + vec3<f32>(0.06, 0.035, 0.0) * pow(amp, 3.0);
  let d = i.uv - 0.5; col = col * (1.0 - 0.5 * dot(d, d));
  return vec4<f32>(col, 1.0);
}

struct GOut { @builtin(position) pos: vec4<f32>, @location(0) amp: f32 };
@vertex fn grain_vs(@location(0) p: vec2<f32>) -> GOut {
  var o: GOut;
  o.pos = vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);
  let psi = cos(PI*P.m*p.x)*cos(PI*P.n*p.y) - cos(PI*P.n*p.x)*cos(PI*P.m*p.y);
  o.amp = clamp(abs(psi) / 2.0, 0.0, 1.0);
  return o;
}
@fragment fn grain_fs(i: GOut) -> @location(0) vec4<f32> {
  let sand = mix(vec3<f32>(0.96, 0.90, 0.74), vec3<f32>(0.72, 0.62, 0.42), i.amp);
  return vec4<f32>(sand * 0.22, 1.0);
}`;

async function makeWebgpuBackend(
  canvas: HTMLCanvasElement,
  count: number,
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

  const init = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    init[i * 2] = rng();
    init[i * 2 + 1] = rng();
  }
  const mkGrains = () =>
    device.createBuffer({
      size: init.byteLength,
      usage:
        GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  const grainsA = mkGrains();
  const grainsB = mkGrains();
  device.queue.writeBuffer(grainsA, 0, init.buffer as ArrayBuffer);
  device.queue.writeBuffer(grainsB, 0, init.buffer as ArrayBuffer);

  const paramsBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const computePl = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: device.createShaderModule({ code: COMPUTE_WGSL }),
      entryPoint: "main",
    },
  });
  const renderMod = device.createShaderModule({ code: RENDER_WGSL });
  const platePl = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "plate_vs" },
    fragment: { module: renderMod, entryPoint: "plate_fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });
  const grainPl = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: renderMod,
      entryPoint: "grain_vs",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
      ],
    },
    fragment: {
      module: renderMod,
      entryPoint: "grain_fs",
      targets: [
        {
          format: fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "point-list" },
  });

  const scopeErr = await device.popErrorScope();
  if (scopeErr) throw new Error("WGSL validation: " + scopeErr.message);

  let parity = 0;
  let frame = 0;

  const step = (P: StepParams) => {
    frame += 1;
    const buf = new ArrayBuffer(32);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    f[0] = P.m; f[1] = P.n; f[2] = P.lr; f[3] = P.jitter; f[4] = P.strike;
    u[5] = frame; u[6] = count; u[7] = 0;
    device.queue.writeBuffer(paramsBuf, 0, buf);

    const src = parity === 0 ? grainsA : grainsB;
    const dst = parity === 0 ? grainsB : grainsA;
    const enc = device.createCommandEncoder();

    {
      const bg = device.createBindGroup({
        layout: computePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: src } },
          { binding: 2, resource: { buffer: dst } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(computePl);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(count / 64));
      pass.end();
    }

    {
      const view = ctx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view,
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.02, g: 0.013, b: 0.006, a: 1 },
          },
        ],
      });
      const plateBg = device.createBindGroup({
        layout: platePl.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: paramsBuf } }],
      });
      pass.setPipeline(platePl);
      pass.setBindGroup(0, plateBg);
      pass.draw(3);

      const grainBg = device.createBindGroup({
        layout: grainPl.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: paramsBuf } }],
      });
      pass.setPipeline(grainPl);
      pass.setBindGroup(0, grainBg);
      pass.setVertexBuffer(0, dst);
      pass.draw(count);
      pass.end();
    }

    device.queue.submit([enc.finish()]);
    parity ^= 1;
  };

  const destroy = () => {
    grainsA.destroy();
    grainsB.destroy();
    paramsBuf.destroy();
    device.destroy();
  };

  return { kind: "webgpu", step, destroy };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";
type Tier = "webgpu" | "webgl" | "cpu";

export default function ResonographPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [tier, setTier] = useState<Tier | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const [pitchUi, setPitchUi] = useState(0);
  const [modeUi, setModeUi] = useState<{ m: number; n: number }>({ m: 1, n: 2 });
  const [autoUi, setAutoUi] = useState(true);
  const [sliderUi, setSliderUi] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<Backend | null>(null);
  const audioRef = useRef<PlateAudio | null>(null);
  const rafRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const micActiveRef = useRef(false);

  const startTsRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const reducedRef = useRef(false);

  const pitchEmaRef = useRef(220);
  const voiceAmpRef = useRef(0);
  const strikeRef = useRef(0);
  const modeIdxRef = useRef(0);
  const candIdxRef = useRef(0);
  const candCountRef = useRef(0);

  const manualRef = useRef(false); // user grabbed the slider
  const manualIdxRef = useRef(0);

  const stop = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    micActiveRef.current = false;
    if (backendRef.current) {
      backendRef.current.destroy();
      backendRef.current = null;
    }
    if (audioRef.current) {
      await audioRef.current.stop();
      audioRef.current = null;
    }
    setPhase("idle");
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

    // One AudioContext shared by the mic analyser and the plate synth.
    let audioCtx: AudioContext;
    try {
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new Ctx();
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    audioRef.current = new PlateAudio(audioCtx);
    audioRef.current.start();

    // Try the microphone (primary sensor); fall back to manual + sweep.
    let micOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // not connected to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4),
      );
      micOk = true;
    } catch {
      setError("No microphone — driving the plate with a seeded pitch sweep. Use the slider to steer it.");
    }
    micActiveRef.current = micOk;
    setMicOn(micOk);
    manualRef.current = false;

    // Reset run state.
    startTsRef.current = null;
    pitchEmaRef.current = 220;
    voiceAmpRef.current = micOk ? 0 : 0.5;
    strikeRef.current = 1;
    modeIdxRef.current = pickModeIndex(220);
    candIdxRef.current = modeIdxRef.current;
    candCountRef.current = 0;
    manualIdxRef.current = modeIdxRef.current;
    setSliderUi(modeIdxRef.current);
    setAutoUi(true);

    // Build the simulation backend: WebGPU → WebGL2 → CPU.
    let backend: Backend;
    try {
      backend = await makeWebgpuBackend(canvas, GPU_COUNT, makeRng(0x51ce));
    } catch {
      try {
        backend = makeWebglBackend(canvas, {
          count: WEBGL_COUNT,
          pointSize: Math.max(1.5, dpr),
          gpuUpdate: true,
          rng: makeRng(0x51ce),
        });
      } catch {
        try {
          backend = makeWebglBackend(canvas, {
            count: CPU_COUNT,
            pointSize: Math.max(2, dpr * 1.5),
            gpuUpdate: false,
            rng: makeRng(0x51ce),
          });
        } catch {
          setError("Neither WebGPU nor WebGL2 could start on this device.");
          if (audioRef.current) {
            await audioRef.current.stop();
            audioRef.current = null;
          }
          streamRef.current?.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
      }
    }
    backendRef.current = backend;
    setTier(backend.kind);
    setPhase("running");

    // Strike the opening mode so sound + figure appear immediately.
    audioRef.current.strike(MODES[modeIdxRef.current].f, 1);

    let detectPhase = 0;
    let hudFrame = 0;

    const loop = (ts: number) => {
      const be = backendRef.current;
      const audio = audioRef.current;
      if (!be || !audio) return;
      if (startTsRef.current == null) startTsRef.current = ts;
      const elapsed = (ts - startTsRef.current) / 1000;
      const dt = Math.min(0.05, Math.max(0.001, (ts - lastTsRef.current) / 1000));
      lastTsRef.current = ts;

      // ── Determine the target pitch ──────────────────────────────────────
      let targetPitch = pitchEmaRef.current;
      let autopilot = false;

      if (micActiveRef.current && analyserRef.current && timeBufRef.current) {
        const analyser = analyserRef.current;
        const tb = timeBufRef.current;
        analyser.getFloatTimeDomainData(
          tb as unknown as Float32Array<ArrayBuffer>,
        );
        // RMS for voice-driven excitation.
        let rms = 0;
        for (let i = 0; i < tb.length; i++) rms += tb[i] * tb[i];
        rms = Math.sqrt(rms / tb.length);
        voiceAmpRef.current +=
          (Math.min(1, rms * 6) - voiceAmpRef.current) * 0.2;
        // Pitch detection every 2 frames on a 1024 window.
        detectPhase = (detectPhase + 1) % 2;
        if (detectPhase === 0) {
          const hz = detectPitch(
            tb.subarray(0, 1024) as unknown as Float32Array,
            audioCtx.sampleRate,
          );
          if (hz > 0) {
            pitchEmaRef.current += (hz - pitchEmaRef.current) * 0.3;
          }
        }
        targetPitch = pitchEmaRef.current;
      } else if (manualRef.current) {
        targetPitch = MODES[manualIdxRef.current].f;
        voiceAmpRef.current += (0.55 - voiceAmpRef.current) * 0.05;
      } else {
        // Seeded pitch sweep across the modal range (log space).
        autopilot = true;
        const s = 0.5 + 0.5 * Math.sin(elapsed * 0.16 - 1.4);
        const lo = Math.log(MODES[0].f);
        const hi = Math.log(MODES[MODES.length - 1].f);
        targetPitch = Math.exp(lo + (hi - lo) * s);
        voiceAmpRef.current =
          0.45 + 0.35 * (0.5 + 0.5 * Math.sin(elapsed * 1.3));
        pitchEmaRef.current += (targetPitch - pitchEmaRef.current) * 0.2;
        targetPitch = pitchEmaRef.current;
      }

      // ── Map pitch → mode, with a short hold to prevent flicker ──────────
      const want = manualRef.current
        ? manualIdxRef.current
        : pickModeIndex(targetPitch);
      if (want !== modeIdxRef.current) {
        if (want === candIdxRef.current) {
          candCountRef.current += 1;
        } else {
          candIdxRef.current = want;
          candCountRef.current = 0;
        }
        if (candCountRef.current >= 3 || manualRef.current) {
          modeIdxRef.current = want;
          strikeRef.current = 1; // throw the sand up → it re-settles
          audio.strike(MODES[want].f, 0.9);
          candCountRef.current = 0;
        }
      }

      // ── Advance the grain simulation ────────────────────────────────────
      strikeRef.current *= Math.exp(-dt / 0.55);
      const mode = MODES[modeIdxRef.current];
      const motion = reducedRef.current ? 0.6 : 1.0;
      const P: StepParams = {
        m: mode.m,
        n: mode.n,
        lr: 0.34,
        jitter: 0.0045 * motion,
        strike: strikeRef.current,
      };
      be.step(P);

      // ── Sustain the metallic voice from the singer ──────────────────────
      const bright = Math.min(1, modeIdxRef.current / (MODES.length - 1));
      audio.sustain(voiceAmpRef.current, bright);

      hudFrame += 1;
      if (hudFrame % 10 === 0) {
        setPitchUi(pitchEmaRef.current);
        setModeUi({ m: mode.m, n: mode.n });
        setAutoUi(autopilot);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Slider override (manual mode only). Grabbing it disables the sweep.
  const onSlider = useCallback((v: number) => {
    manualRef.current = true;
    manualIdxRef.current = v;
    setSliderUi(v);
    setAutoUi(false);
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (backendRef.current) {
        backendRef.current.destroy();
        backendRef.current = null;
      }
      if (audioRef.current) {
        void audioRef.current.stop();
        audioRef.current = null;
      }
    };
  }, []);

  const tierLabel =
    tier === "webgpu"
      ? "webgpu · compute"
      : tier === "webgl"
        ? "webgl · transform feedback"
        : "cpu · point sim";
  const sensorLabel = micOn ? "voice" : "manual (no mic)";
  const modeLabel = `mode (${modeUi.m},${modeUi.n})`;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Resonograph
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Hold a pitch and watch tens of thousands of sand grains crawl across a
            vibrating brass plate and settle onto the nodal lines of that tone&apos;s
            standing wave. Sing higher and the figure reorganizes into a finer
            lattice; the plate answers in inharmonic metal.
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
            Sing, hum, or whistle a steady note. The plate finds the closest
            Chladni eigenmode and the sand settles into its figure. No microphone?
            A seeded pitch sweep plays it for you, and a slider lets you steer.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play the plate
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            Best with headphones. The plate rings a metallic, inharmonic tone —
            smooth glow, no flashing.
          </p>
          {error && <p className="max-w-sm text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {tierLabel}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {sensorLabel}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {Math.round(pitchUi)} hz · {modeLabel}
            {autoUi ? " · sweep" : ""}
          </div>

          {!micOn && (
            <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              figure
              <input
                type="range"
                min={0}
                max={MODES.length - 1}
                step={1}
                value={sliderUi}
                onChange={(e) => onSlider(Number(e.target.value))}
                className="h-1 w-40 cursor-pointer accent-primary"
                aria-label="Chladni mode"
              />
            </label>
          )}

          <div className="flex-1" />
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          <button
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        </div>
      )}

      {phase === "running" && error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-6 max-w-xl">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              how it works
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Sand descending the |ψ| gradient
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A square plate in eigenmode (m, n) carries the standing wave
                ψ = cos(mπx)cos(nπy) − cos(nπx)cos(mπy). Each of tens of thousands
                of grains projects a step toward the nearest zero of ψ — the still
                nodal line — and hops randomly in proportion to the local
                vibration |ψ|, so it flees the antinodes and freezes on the nodes.
                The crisp Chladni figure is emergent, not drawn.
              </p>
              <p>
                Your voice is the sensor. Autocorrelation finds your fundamental;
                the plate locks to the mode whose Kirchhoff–Love modal frequency
                f_mn ∝ (m² + n²) is closest, so higher pitches summon busier
                figures. When a mode locks the plate is struck and rings with an
                inharmonic bell/plate partial series, sustained by your own voice —
                metal, not harmony.
              </p>
              <p>
                Grains run on a WebGPU compute shader (ping-pong storage buffers),
                falling back to WebGL2 transform feedback, then a CPU point sim —
                see the badge. References: Ernst Chladni, <em>Entdeckungen über
                die Theorie des Klanges</em> (1787); &ldquo;ChladniSonify&rdquo;
                (arXiv:2605.09846, 2026), which maps figures → frequency; this
                piece runs it the other direction. Full write-up in the README.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
