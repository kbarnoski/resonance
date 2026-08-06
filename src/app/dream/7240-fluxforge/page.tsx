"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
 * FLUXFORGE — the lab's first WebGPU *compute* prototype.
 *
 * Your sound forges a fluid: a large particle buffer is advected every frame
 * on the GPU through a divergence-free curl-noise flow field, whose strength,
 * fineness, and onset "rings" are driven live by the microphone (or an internal
 * pad synth). A WGSL render pipeline draws the particles as additive quads,
 * coloured on the violet ramp by speed. It reads as a physical velocity field.
 *
 * Everything WebGPU is guarded behind feature checks + effects, so the page
 * renders header + canvas + fallback notice even with no GPU (SSR / build).
 */

/* @webgpu/types is NOT installed in this repo, so the WebGPU objects are
 * untyped. We use one narrowly-named `any` alias for those handles rather than
 * hand-rolling a large, fragile interface surface that could break the build.
 * eslint-disable-next-line @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wgpu = any;

/* WebGPU flag constants are spec-stable numbers; declaring them here avoids
 * referencing the GPUBufferUsage/GPUShaderStage globals that TS can't see. */
const BUF_STORAGE = 0x0080;
const BUF_UNIFORM = 0x0040;
const BUF_COPY_DST = 0x0008;

const PARTICLE_COUNT = 100_000;
const FALLBACK_COUNT = 2600;

/* ------------------------------------------------------------------ WGSL --- */

const WGSL_HEADER = /* wgsl */ `
struct Params {
  time : f32,
  dt : f32,
  bass : f32,
  mid : f32,
  treble : f32,
  onset : f32,
  count : f32,
  aspect : f32,
  pointSize : f32,
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};
struct Particle {
  pos : vec2<f32>,
  vel : vec2<f32>,
};
`;

const WGSL_COMPUTE =
  WGSL_HEADER +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read_write> parts : array<Particle>;

// Scalar flow potential built from a few animated sinusoids. Its analytic
// curl (below) is divergence-free, which is what gives incompressible swirl.
fn potential(p : vec2<f32>, t : f32, freq : f32) -> f32 {
  var v = 0.0;
  v = v + sin(p.x * freq + t) * cos(p.y * freq * 0.9 - t * 0.7);
  v = v + 0.5 * sin(p.x * freq * 2.1 - t * 1.3) * cos(p.y * freq * 1.7 + t * 0.5);
  v = v + 0.25 * sin(p.x * freq * 4.3 + t * 0.6) * cos(p.y * freq * 3.9 - t * 1.1);
  return v;
}

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= u32(params.count)) { return; }
  var pt = parts[idx];

  let t = params.time;
  let freq = 2.0 + params.treble * 6.0;          // treble -> fine curl detail
  let e = 0.02;
  let p = pt.pos;
  let dPdx = (potential(p + vec2<f32>(e, 0.0), t, freq)
            - potential(p - vec2<f32>(e, 0.0), t, freq)) / (2.0 * e);
  let dPdy = (potential(p + vec2<f32>(0.0, e), t, freq)
            - potential(p - vec2<f32>(0.0, e), t, freq)) / (2.0 * e);

  var flow = vec2<f32>(dPdy, -dPdx);             // curl of the potential
  let strength = 0.10 + params.bass * 0.75;      // bass -> global flow strength
  flow = flow * strength;

  // Onset -> an outward radial "ring" pushing particles away from centre.
  let r = max(length(p), 0.001);
  let ring = params.onset * exp(-pow((r - 0.35) * 4.0, 2.0)) * 2.5;
  let radial = (p / r) * ring;

  let target = flow + radial;
  pt.vel = mix(pt.vel, target, 0.25);
  pt.pos = pt.pos + pt.vel * params.dt;

  // Wrap at the box edges so the field stays populated.
  if (pt.pos.x >  1.0) { pt.pos.x = pt.pos.x - 2.0; }
  if (pt.pos.x < -1.0) { pt.pos.x = pt.pos.x + 2.0; }
  if (pt.pos.y >  1.0) { pt.pos.y = pt.pos.y - 2.0; }
  if (pt.pos.y < -1.0) { pt.pos.y = pt.pos.y + 2.0; }

  parts[idx] = pt;
}
`;

const WGSL_RENDER =
  WGSL_HEADER +
  /* wgsl */ `
@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var<storage, read> parts : array<Particle>;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) speed : f32,
};

@vertex
fn vs(@builtin(vertex_index) vi : u32,
      @builtin(instance_index) ii : u32) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>(1.0, -1.0), vec2<f32>( 1.0, 1.0)
  );
  let c = corners[vi];
  let pt = parts[ii];
  let sp = clamp(length(pt.vel) * 0.18, 0.0, 1.0);
  let size = params.pointSize * (0.6 + sp * 0.9);
  var pos = pt.pos;
  pos.x = pos.x + c.x * size / params.aspect;    // keep points circular
  pos.y = pos.y + c.y * size;

  var o : VSOut;
  o.clip = vec4<f32>(pos, 0.0, 1.0);
  o.uv = c;
  o.speed = sp;
  return o;
}

@fragment
fn fs(i : VSOut) -> @location(0) vec4<f32> {
  let d = length(i.uv);
  let a = smoothstep(1.0, 0.0, d);               // soft round disc
  // Violet ramp: slow = deep violet, fast = bright violet / near-white.
  let col = mix(vec3<f32>(0.30, 0.10, 0.55), vec3<f32>(0.85, 0.72, 1.0), i.speed);
  let intensity = a * (0.30 + i.speed * 0.70);
  return vec4<f32>(col * intensity, intensity);
}
`;

/* ---------------------------------------------------------------- audio --- */

interface AudioState {
  analyser: AnalyserNode;
  sampleRate: number;
  stop: () => void;
}

type AudioKind = "mic" | "internal";

/** Wire the mic (or an internal evolving pad) into an AnalyserNode. */
async function initAudio(kind: AudioKind): Promise<AudioState> {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Safari prefix
    (window as any).webkitAudioContext;
  const ctx = new Ctor();
  if (ctx.state === "suspended") await ctx.resume();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;

  if (kind === "mic") {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser); // NOT to destination -> no feedback
    return {
      analyser,
      sampleRate: ctx.sampleRate,
      stop: () => {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      },
    };
  }

  // Internal evolving pad — audible AND analysed. A pulsing sub oscillator
  // creates periodic bass swells so onset "rings" fire even with no mic.
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);
  master.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 2.0);

  const oscs: OscillatorNode[] = [];
  const voices = [110, 165, 220, 277];
  voices.forEach((f, k) => {
    const o = ctx.createOscillator();
    o.type = k % 2 === 0 ? "sawtooth" : "sine";
    o.frequency.value = f;
    o.detune.value = (k - 1.5) * 6;
    const g = ctx.createGain();
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(filter);
    o.start();
    oscs.push(o);
  });

  // slow filter sweep for evolution
  const flfo = ctx.createOscillator();
  flfo.frequency.value = 0.05;
  const flfoGain = ctx.createGain();
  flfoGain.gain.value = 380;
  flfo.connect(flfoGain);
  flfoGain.connect(filter.frequency);
  flfo.start();

  // pulsing sub -> periodic bass swell -> onset detection
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 55;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.18;
  const subLfo = ctx.createOscillator();
  subLfo.type = "triangle";
  subLfo.frequency.value = 0.45;
  const subLfoGain = ctx.createGain();
  subLfoGain.gain.value = 0.18;
  subLfo.connect(subLfoGain);
  subLfoGain.connect(subGain.gain);
  sub.connect(subGain);
  subGain.connect(filter);
  sub.start();
  subLfo.start();

  // gentle chord drift
  const drift = window.setInterval(() => {
    const roots = [110, 98, 123.5, 146.8];
    const root = roots[Math.floor(Math.random() * roots.length)];
    const ratios = [1, 1.5, 2, 2.5];
    oscs.forEach((o, k) => {
      o.frequency.setTargetAtTime(root * ratios[k], ctx.currentTime, 1.2);
    });
  }, 6000);

  const allOscs = [...oscs, flfo, sub, subLfo];
  return {
    analyser,
    sampleRate: ctx.sampleRate,
    stop: () => {
      window.clearInterval(drift);
      allOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      void ctx.close();
    },
  };
}

interface Bands {
  bass: number;
  mid: number;
  treble: number;
  onset: number;
}

/** Split the spectrum into bass/mid/treble and detect bass onsets. */
function makeBandReader(audio: AudioState) {
  const bins = audio.analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  const binHz = audio.sampleRate / (bins * 2);
  const range = (loHz: number, hiHz: number) => {
    const lo = Math.max(1, Math.floor(loHz / binHz));
    const hi = Math.min(bins - 1, Math.ceil(hiHz / binHz));
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += data[i];
    return sum / Math.max(1, (hi - lo + 1) * 255);
  };

  let bassSmooth = 0;
  let prevBass = 0;
  let onsetEnv = 0;

  return function read(): Bands {
    audio.analyser.getByteFrequencyData(data);
    const bass = range(20, 200);
    const mid = range(200, 2000);
    const treble = range(2000, 12000);

    bassSmooth += (bass - bassSmooth) * 0.35;
    const flux = bassSmooth - prevBass;
    prevBass = bassSmooth;
    if (flux > 0.05 && bassSmooth > 0.14) onsetEnv = 1;
    onsetEnv *= 0.9;

    return { bass: bassSmooth, mid, treble, onset: onsetEnv };
  };
}

/* ----------------------------------------------------------- WebGPU sim --- */

interface Runtime {
  stop: () => void;
}

function sizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

/** Build + run the WebGPU compute/render pipeline. Throws if anything fails
 *  (caller then falls back to Canvas2D). */
async function runWebGPU(
  canvas: HTMLCanvasElement,
  audio: AudioState,
  onBands: (b: Bands) => void,
): Promise<Runtime> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped navigator.gpu
  const gpu: Wgpu = (navigator as any).gpu;
  if (!gpu) throw new Error("no-webgpu");
  const adapter: Wgpu = await gpu.requestAdapter();
  if (!adapter) throw new Error("no-adapter");
  const device: Wgpu = await adapter.requestDevice();

  const ctx: Wgpu = canvas.getContext("webgpu");
  if (!ctx) throw new Error("no-context");
  const format: string = gpu.getPreferredCanvasFormat();
  sizeCanvas(canvas);
  ctx.configure({ device, format, alphaMode: "opaque" });

  // Particle storage buffer: [posx, posy, velx, vely] per particle.
  const stride = 4;
  const init = new Float32Array(PARTICLE_COUNT * stride);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    init[i * stride + 0] = Math.random() * 2 - 1;
    init[i * stride + 1] = Math.random() * 2 - 1;
    init[i * stride + 2] = 0;
    init[i * stride + 3] = 0;
  }
  const particleBuf: Wgpu = device.createBuffer({
    size: init.byteLength,
    usage: BUF_STORAGE | BUF_COPY_DST,
  });
  device.queue.writeBuffer(particleBuf, 0, init);

  const uniformArr = new Float32Array(12);
  const uniformBuf: Wgpu = device.createBuffer({
    size: uniformArr.byteLength,
    usage: BUF_UNIFORM | BUF_COPY_DST,
  });

  const computeMod: Wgpu = device.createShaderModule({ code: WGSL_COMPUTE });
  const renderMod: Wgpu = device.createShaderModule({ code: WGSL_RENDER });

  const computePipeline: Wgpu = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeMod, entryPoint: "cs" },
  });
  const renderPipeline: Wgpu = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderMod, entryPoint: "vs" },
    fragment: {
      module: renderMod,
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

  const computeBind: Wgpu = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: particleBuf } },
    ],
  });
  const renderBind: Wgpu = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: particleBuf } },
    ],
  });

  const readBands = makeBandReader(audio);
  const workgroups = Math.ceil(PARTICLE_COUNT / 64);

  let raf = 0;
  let running = true;
  let simTime = 0;
  let last = performance.now();
  let frameNo = 0;

  const onResize = () => {
    sizeCanvas(canvas);
    ctx.configure({ device, format, alphaMode: "opaque" });
  };
  window.addEventListener("resize", onResize);

  const frame = () => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    simTime += dt;

    const b = readBands();
    if (frameNo % 6 === 0) onBands(b);
    frameNo++;

    uniformArr[0] = simTime;
    uniformArr[1] = dt;
    uniformArr[2] = b.bass;
    uniformArr[3] = b.mid;
    uniformArr[4] = b.treble;
    uniformArr[5] = b.onset;
    uniformArr[6] = PARTICLE_COUNT;
    uniformArr[7] = canvas.width / Math.max(1, canvas.height);
    uniformArr[8] = 0.006;
    device.queue.writeBuffer(uniformBuf, 0, uniformArr);

    const enc: Wgpu = device.createCommandEncoder();
    const cpass: Wgpu = enc.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBind);
    cpass.dispatchWorkgroups(workgroups);
    cpass.end();

    const view: Wgpu = ctx.getCurrentTexture().createView();
    const rpass: Wgpu = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.012, b: 0.04, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBind);
    rpass.draw(6, PARTICLE_COUNT);
    rpass.end();

    device.queue.submit([enc.finish()]);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      try {
        device.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

/* --------------------------------------------------------- Canvas2D FB ---- */

/** Tiny CPU curl-noise particle fallback so the page still moves with sound
 *  when WebGPU is unavailable. Same field math, far fewer particles. */
function runCanvas2D(
  canvas: HTMLCanvasElement,
  audio: AudioState,
  onBands: (b: Bands) => void,
): Runtime {
  const g = canvas.getContext("2d");
  if (!g) return { stop: () => {} };
  sizeCanvas(canvas);

  const xs = new Float32Array(FALLBACK_COUNT);
  const ys = new Float32Array(FALLBACK_COUNT);
  const vx = new Float32Array(FALLBACK_COUNT);
  const vy = new Float32Array(FALLBACK_COUNT);
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    xs[i] = Math.random() * 2 - 1;
    ys[i] = Math.random() * 2 - 1;
  }

  const potential = (x: number, y: number, t: number, f: number) =>
    Math.sin(x * f + t) * Math.cos(y * f * 0.9 - t * 0.7) +
    0.5 * Math.sin(x * f * 2.1 - t * 1.3) * Math.cos(y * f * 1.7 + t * 0.5) +
    0.25 * Math.sin(x * f * 4.3 + t * 0.6) * Math.cos(y * f * 3.9 - t * 1.1);

  const readBands = makeBandReader(audio);
  let raf = 0;
  let running = true;
  let simTime = 0;
  let last = performance.now();
  let frameNo = 0;

  const onResize = () => sizeCanvas(canvas);
  window.addEventListener("resize", onResize);

  const frame = () => {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    simTime += dt;

    const b = readBands();
    if (frameNo % 6 === 0) onBands(b);
    frameNo++;

    const W = canvas.width;
    const H = canvas.height;
    // trailing fade
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(5, 3, 10, 0.22)";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "lighter";

    const t = simTime;
    const f = 2.0 + b.treble * 6.0;
    const strength = 0.1 + b.bass * 0.75;
    const e = 0.02;
    const aspect = W / Math.max(1, H);

    for (let i = 0; i < FALLBACK_COUNT; i++) {
      const x = xs[i];
      const y = ys[i];
      const dPdx =
        (potential(x + e, y, t, f) - potential(x - e, y, t, f)) / (2 * e);
      const dPdy =
        (potential(x, y + e, t, f) - potential(x, y - e, t, f)) / (2 * e);
      let fx = dPdy * strength;
      let fy = -dPdx * strength;
      const r = Math.max(Math.hypot(x, y), 0.001);
      const ring =
        b.onset * Math.exp(-Math.pow((r - 0.35) * 4.0, 2)) * 2.5;
      fx += (x / r) * ring;
      fy += (y / r) * ring;
      vx[i] += (fx - vx[i]) * 0.25;
      vy[i] += (fy - vy[i]) * 0.25;
      let nx = x + vx[i] * dt;
      let ny = y + vy[i] * dt;
      if (nx > 1) nx -= 2;
      if (nx < -1) nx += 2;
      if (ny > 1) ny -= 2;
      if (ny < -1) ny += 2;
      xs[i] = nx;
      ys[i] = ny;

      const sp = Math.min(1, Math.hypot(vx[i], vy[i]) * 0.18);
      const px = (nx / aspect * 0.5 + 0.5) * W;
      const py = (ny * 0.5 + 0.5) * H;
      const rr = Math.floor(140 + sp * 115);
      const gg = Math.floor(50 + sp * 135);
      const bb = Math.floor(180 + sp * 75);
      g.fillStyle = `rgba(${rr}, ${gg}, ${bb}, ${0.35 + sp * 0.45})`;
      g.fillRect(px, py, 1.6, 1.6);
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    stop: () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    },
  };
}

/* -------------------------------------------------------------- notes ----- */

const NOTES_MD = `# Fluxforge

What if your sound physically forged a fluid? Fluxforge runs the dream lab's
first **WebGPU compute shader**: 100,000 particles are advected every frame on
the GPU through a divergence-free **curl-noise** flow field. The field is not a
decoration — it *is* your music.

## How to use
- Press **Start (microphone)** and allow mic access, then play or sing into it.
- No mic? Press **Internal pad** for a soft evolving synth that also drives the fluid.
- **Bass** sets global flow strength / turbulence.
- **Treble** sets the fine curl detail (noise frequency).
- A detected **onset** fires an outward radial ring that shoves particles apart.
- Colour is the violet ramp mapped to **speed**: slow = deep violet, fast = near-white.

## Why curl-noise
The velocity field is the analytic **curl of a scalar potential**, which is
divergence-free by construction — so the flow looks incompressible and swirling
without any pressure solve or neighbour search. It is far more robust to ship
than full SPH while still reading as a real velocity field.

## Technique
A compute pipeline updates the particle storage buffer each frame; a WGSL render
pipeline draws the same buffer as additive instanced quads coloured by speed.
Three subsystems cooperate: Web Audio FFT band-split, the WebGPU compute sim,
and the WGSL render + audio-to-force mapping.

## WebGPU required
Needs \`navigator.gpu\` (Chrome / Edge, recent). Without it you get a clear notice
plus a small Canvas2D curl-noise fallback so something still moves with sound.

## References
- Sachin Sharma, *"Beyond WebGL: Real-Time Fluid Simulations Using WebGPU
  Compute Shaders"* (2026, sachinsharma.dev).
- Jos Stam, *"Stable Fluids"* (SIGGRAPH 1999) — the stable-advection lineage.
`;

function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## "))
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-primary">
          {line.slice(3)}
        </h2>
      );
    if (line.startsWith("# "))
      return (
        <h1 key={i} className="text-2xl font-semibold tracking-tight text-foreground">
          {line.slice(2)}
        </h1>
      );
    if (line.startsWith("- "))
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-foreground">
          {line.slice(2)}
        </li>
      );
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-foreground">
        {line}
      </p>
    );
  });
}

/* -------------------------------------------------------------- page ------ */

type Phase = "idle" | "running";
type Backend = "webgpu" | "canvas2d";

export default function FluxforgePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioState | null>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend | null>(null);
  const [gpuSupported, setGpuSupported] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bands, setBands] = useState<Bands>({ bass: 0, mid: 0, treble: 0, onset: 0 });

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped navigator.gpu
    setGpuSupported(!!(navigator as any).gpu);
  }, []);

  const teardown = useCallback(() => {
    runtimeRef.current?.stop();
    runtimeRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    async (kind: AudioKind) => {
      if (phase === "running") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      setError(null);
      setPhase("running");

      let audio: AudioState;
      try {
        audio = await initAudio(kind);
      } catch {
        if (kind === "mic") {
          try {
            audio = await initAudio("internal");
            setError("Microphone unavailable — using the internal pad instead.");
          } catch {
            setError("Could not start audio.");
            setPhase("idle");
            return;
          }
        } else {
          setError("Could not start audio.");
          setPhase("idle");
          return;
        }
      }
      audioRef.current = audio;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped navigator.gpu
      const hasGpu = !!(navigator as any).gpu;
      if (hasGpu) {
        try {
          runtimeRef.current = await runWebGPU(canvas, audio, setBands);
          setBackend("webgpu");
          return;
        } catch {
          // fall through to Canvas2D
        }
      }
      try {
        runtimeRef.current = runCanvas2D(canvas, audio, setBands);
        setBackend("canvas2d");
        if (!hasGpu)
          setError("WebGPU required — try Chrome / Edge. Showing a Canvas2D fallback.");
        else setError("WebGPU failed to start — showing a Canvas2D fallback.");
      } catch {
        setError("Could not start the visual.");
        setPhase("idle");
      }
    },
    [phase],
  );

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
    setBackend(null);
    setBands({ bass: 0, mid: 0, treble: 0, onset: 0 });
  }, [teardown]);

  const meter = (label: string, value: number) => (
    <div className="flex items-center gap-2">
      <span className="w-12 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <main className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                WebGPU compute · curl-noise fluid
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Fluxforge
              </h1>
            </div>
            <button
              onClick={() => setNotesOpen(true)}
              className="shrink-0 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Read the design notes
            </button>
          </div>
          <p className="max-w-2xl text-base text-muted-foreground">
            Your sound forges a fluid — 100k GPU particles advected through a
            divergence-free curl-noise field whose flow is your music.
          </p>
        </header>

        {!gpuSupported && (
          <p className="text-base text-destructive">
            WebGPU required — try Chrome / Edge. A small Canvas2D curl-noise
            fallback runs instead so you still see the field move with sound.
          </p>
        )}
        {error && <p className="text-base text-destructive">{error}</p>}

        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="h-full w-full" />
          {phase === "running" && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5 rounded-md border border-border bg-background/60 p-2.5 backdrop-blur-sm">
              {meter("bass", bands.bass)}
              {meter("mid", bands.mid)}
              {meter("treble", bands.treble)}
              <div className="flex items-center gap-2">
                <span className="w-12 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  ring
                </span>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full bg-primary transition-opacity"
                  style={{ opacity: 0.15 + bands.onset * 0.85 }}
                />
              </div>
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {backend === "webgpu" ? "WebGPU compute" : "Canvas2D fallback"}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <>
              <button
                onClick={() => start("mic")}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start (microphone)
              </button>
              <button
                onClick={() => start("internal")}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Internal pad
              </button>
            </>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">{renderNotes(NOTES_MD)}</div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
