// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — Resonance's WebGPU COMPUTE particle engine (phase A skeleton).
//
// Behind `?gpu=webgpu` (backend.ts) — never on the show path while the flag is
// off. Same public surface as createParticleEngine (ParticleEngine), so
// particle-lead-layer.tsx can drive either engine; what each method does today
// is recorded in parity.ts and docs/webgpu-engine-plan.md.
//
// One frame (docs/webgpu-engine-plan.md §2):
//   0. [once / on demand] seedInit, posInit           (compute)
//   1. integrate — force stack → semi-implicit Euler    (compute, in place)
//   2. HDR pass  — trail fade (dst × blend constant), then instanced
//                  energy-conserving gaussian sprites, additive, rgba16float
//   3. govern    — exact mean displayed luminance → exposure slew (compute,
//                  never read back: the WCAG 2.3.1 backstop, on the GPU)
//   4. composite — hue-preserving tone map, sRGB, dither → canvas
//
// KIOSK STALL LAWS (docs/particle-perf-audit-2026-10-07.md, the WebGL hang of
// 2026-10-05) carried over:
//   · every pipeline is built with create*PipelineAsync at creation — nothing
//     compiles on a visible frame; isWarm() is false until all are resolved
//     and the init passes have run (the layer keeps the field invisible);
//   · no synchronous read-back exists in WebGPU, and no mapAsync is ever
//     awaited on the frame path — the only map is the opt-in timing probe,
//     one in flight, polled on later frames;
//   · big uploads (image uv: 8 MB at 10⁶ motes) trickle in ≤ 1 MB per frame
//     into the idle half of a double buffer, then swap;
//   · one device + one canvas context per session (shared-engine.ts);
//   · the same watchdog contract as WebGL (frame gaps / CPU time / failures →
//     opts.watchdog.onStall, device loss → opts.onContextLost).
// ─────────────────────────────────────────────────────────────────────────────

import { hiddenSince } from "@/lib/journeys/visibility-epoch";
import { ParticleEngineUnsupported, type ParticleEngine, type ParticleEngineOptions, type ParticleStats } from "../particle-engine";
import { soulById, lerpPalette, type SoulId, type ParticlePalette } from "../souls";
import { critStep, springTau, type Crit } from "../image-follow";
import type { SpectrumFrame } from "../spectrum";
import {
  BufferUsage, TextureUsage, ShaderStage, MapMode, navigatorGpu,
  type WAdapter, type WDevice, type WBuffer, type WTexture, type WBindGroup, type WBindGroupLayout,
  type WCanvasContext, type WComputePipeline, type WRenderPipeline, type WQuerySet, type WShaderModule,
  type WTextureFormat, type WTimestampWrites,
} from "./gpu-types";
import {
  SIM_LAYOUT, RENDER_LAYOUT, GOVERNOR_LAYOUT, UniformBlock, clampCount, maxParticlesFor, dispatchSize, uploadChunks,
} from "./layout";
import {
  buildSimWGSL, buildRenderWGSL, buildFadeWGSL, buildGovernWGSL, buildCompositeWGSL,
  SIM_BINDINGS, RENDER_BINDINGS, GOVERN_BINDINGS, SPEC_BINS, DEFAULT_FORCES, FORM_NAMES, type ForceId,
} from "./wgsl";
import { perspectiveZO, lookAt, mul } from "./math";

export interface WebGPUEngineOptions extends ParticleEngineOptions {
  /** An adapter from probeWebGPU() (saves a round trip; consumed once). */
  adapter?: WAdapter | null;
  /** GPU timestamp queries per pass (lab / measurement runs): async, one in flight. */
  gpuTiming?: boolean;
  /** The force stack compiled into `integrate` (default: all phase A forces). */
  forces?: readonly ForceId[];
  /** Smallest drawn sprite in device px (energy-conserving floor). Default 1.5. */
  minPx?: number;
  /** Called once when the device, pipelines and buffers are ready. */
  onReady?: (info: WebGPUInfo) => void;
}

export interface WebGPUInfo {
  adapter: string;
  format: WTextureFormat;
  features: string[];
  maxCount: number;
  timestamps: boolean;
  /** ms from first module to every pipeline resolved (async — off the frame path) */
  compileMs: number;
}

export interface GpuTimings {
  integrate: number;
  sprites: number;
  govern: number;
  composite: number;
  total: number;
  /** readbacks folded in so far */
  samples: number;
}

export interface WebGPUParticleEngine extends ParticleEngine {
  readonly backend: "webgpu";
  /** Resolves true once the engine can draw (false on failure). */
  ready(): Promise<boolean>;
  info(): WebGPUInfo | null;
  /** Why the engine failed (adapter, compile, device), or null. */
  failure(): string | null;
  /** Phase A stand-in figures / the lab: morph to procedural form `id` (wgsl.ts FORM_NAMES). */
  setProceduralForm(id: number, seconds?: number): void;
  /** Per-pass GPU time (ms, smoothed) when gpuTiming is on and supported. */
  gpuTimings(): GpuTimings | null;
}

// soul → phase A stand-in figure (until the soul library is ported, §A.2)
const SOUL_FORM: Partial<Record<SoulId, number>> = {
  knot: 1, torus: 1, helix: 1, polyhedron: 1,
  rose: 2, blossom: 2, mandala: 2, kaleido: 2, medallion: 2, girih: 2, petals: 2, superformula: 2, cymatics: 2,
  vortex: 3, nebula: 3, orbitals: 3, starburst: 3, attractor: 3, aurora: 3, murmuration: 3,
  lissajous: 4, spirograph: 4, harmonics: 4, ribbons: 4, threads: 4, arcs: 4, waves: 4, rings: 4,
};
export function standInForm(id: SoulId): number {
  return SOUL_FORM[id] ?? 0;
}

const TS_PASSES = ["integrate", "sprites", "govern", "composite"] as const;

/** Throws ParticleEngineUnsupported when navigator.gpu is missing (the caller
 *  falls back to WebGL2 — backend.ts). Adapter / device / compile failures are
 *  asynchronous: they arrive as opts.watchdog.onStall (the session's particles
 *  switch off exactly as for a failed WebGL program). */
export function createWebGPUParticleEngine(canvas: HTMLCanvasElement, opts: WebGPUEngineOptions = {}): WebGPUParticleEngine {
  const gpu = navigatorGpu();
  if (!gpu) throw new ParticleEngineUnsupported("WebGPU unavailable (navigator.gpu missing)");

  const transparent = !!opts.transparent;
  const trailScale = opts.trailScale ?? 1;
  const pointCss = opts.pointSize ?? 2.2;
  const minPx = opts.minPx ?? 1.5;
  const speedCap = opts.maxSpeed ?? 3.5;
  const forces = opts.forces ?? DEFAULT_FORCES;
  let audioFn = opts.audio ?? null;
  let count = clampCount(opts.count ?? 409_600);

  // ── GPU objects (null until init resolves) ──────────────────────────────
  let device: WDevice | null = null;
  let ctx: WCanvasContext | null = null;
  let format: WTextureFormat = "bgra8unorm";
  let info: WebGPUInfo | null = null;
  let pipes: {
    seedInit: WComputePipeline; posInit: WComputePipeline; integrate: WComputePipeline;
    sprites: WRenderPipeline; fade: WRenderPipeline; govern: WComputePipeline; composite: WRenderPipeline;
  } | null = null;
  let bgl: { sim: WBindGroupLayout; render: WBindGroupLayout; govern: WBindGroupLayout; composite: WBindGroupLayout } | null = null;
  let buf: { pos: WBuffer; vel: WBuffer; seed: WBuffer; uv: [WBuffer, WBuffer] } | null = null;
  let simU: WBuffer | null = null, renderU: WBuffer | null = null, govU: WBuffer | null = null;
  let specBuf: WBuffer | null = null, expoBuf: WBuffer | null = null;
  let simBG: [WBindGroup, WBindGroup] | null = null;
  let renderBG: WBindGroup | null = null, governBG: WBindGroup | null = null, compBG: WBindGroup | null = null;
  let hdr: WTexture | null = null;
  let hdrFresh = true;
  let ts: { q: WQuerySet; resolve: WBuffer; read: WBuffer; pending: boolean } | null = null;
  const timings: GpuTimings = { integrate: 0, sprites: 0, govern: 0, composite: 0, total: 0, samples: 0 };

  const sim = new UniformBlock(SIM_LAYOUT);
  const ren = new UniformBlock(RENDER_LAYOUT);
  const gov = new UniformBlock(GOVERNOR_LAYOUT);
  const specData = new Float32Array(SPEC_BINS * 2);

  let ready = false;
  let initDone = false;
  let pendingSeed = true;
  let pendingInitR: number | null = 1.6;
  let activeUv = 0;
  let upload: { data: Float32Array; slot: number; chunks: [number, number][]; k: number } | null = null;
  let imgSampled = 0;

  let failed: string | null = null;
  let stalled = false;
  let lost = false;
  let disposed = false;
  const stall = (why: string) => {
    if (stalled) return;
    stalled = true;
    running = false;
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    opts.watchdog?.onStall(why);
  };
  const fail = (why: string) => {
    if (!failed) failed = why;
    stall(why);
  };

  // ── CPU state (mirrors the WebGL engine's followers) ──────────────────────
  let soulA = soulById(opts.soul ?? "vortex");
  let paletteOverride: ParticlePalette | null = opts.palette ?? null;
  const PAL_OMEGA = 1.2;
  const palShown = new Float32Array(9), palVel = new Float32Array(9);
  let palPrimed = false;
  const palFlat = (p: ParticlePalette, i: number) => (i < 3 ? p.low[i] : i < 6 ? p.mid[i - 3] : p.high[i - 6]);
  const palOut: ParticlePalette = { low: [0, 0, 0], mid: [0, 0, 0], high: [0, 0, 0] };
  function glidePalette(target: ParticlePalette, dt: number): ParticlePalette {
    if (!palPrimed) {
      for (let i = 0; i < 9; i++) { palShown[i] = palFlat(target, i); palVel[i] = 0; }
      palPrimed = true;
    } else {
      const h = Math.min(dt, 0.05), w = PAL_OMEGA;
      for (let i = 0; i < 9; i++) {
        palVel[i] += (w * w * (palFlat(target, i) - palShown[i]) - 2 * w * palVel[i]) * h;
        palShown[i] += palVel[i] * h;
      }
    }
    for (let i = 0; i < 3; i++) { palOut.low[i] = palShown[i]; palOut.mid[i] = palShown[3 + i]; palOut.high[i] = palShown[6 + i]; }
    return palOut;
  }
  const sv = new Float64Array(24);
  const sp = (i: number, x: number, target: number, tau: number, dt: number) => springTau(sv, i, x, target, tau, dt);

  let layerGain = opts.gain ?? 1, layerGainTarget = layerGain;
  let density = 1, densityTarget = 1;
  let hue = 0, hueTarget = 0, sat = 1, satTarget = 1, hueVel = 0, satVel = 0;
  let hueSpreadTarget = 0.35;
  let motion = 1, motionTarget = 1;
  const camScaleBase = opts.camScale ?? 1;
  let camScale = camScaleBase, camScaleTarget = camScaleBase;
  let offX = 0, offY = 0, offTX = 0, offTY = 0;
  let imgScaleS = 1, imgScaleT = 1;
  let sizeScaleS = 1, sizeScaleT = 1;
  let reactS = 1, reactT = 1;
  let imgMirror = 1, imgMirrorT = 1, imgTiltS = 0, imgTiltT = 0;
  let imgPaceK = 1;
  let flashPace = false;
  const imgF: Crit = { x: 0, v: 0 }, imgS: Crit = { x: 0, v: 0 };
  let imgFormTgt = 0, imgShowTgt = 0;
  let imgAspect = 16 / 9;
  let snapPending = false;
  let scatterEnv = 0, scatterTarget = 0, bounceEnv = 0, bounceSign = 1;
  let entryT = 1e9;
  let glideT = 99, pullT = 99;
  const GLIDE_SEC = 4;
  let settledSince = -1;
  let lastEvent = "", lastEventAt = -99;
  let fadeIn = 0;
  let az = 0;
  // procedural form morph (A → B), queued like the WebGL pendingSoul
  let formA = standInForm(soulA.id), formB = formA, formMix = 1, formDur = 4;
  let pendingForm: { id: number; sec: number } | null = null;
  // parity state (CPU only in phase A — see parity.ts)
  const curT = { amount: 0, tension: 0, layering: 0 };
  const brT = { amount: 0, breath: 0, settle: 0 };
  const gravT = new Float32Array(16), gravS = new Float32Array(16);
  let gravGainT = 0, gravGainS = 0;
  let bridgePS = 0, bridgePT = 0, bridgeMS = 0, bridgeMT = 0, bridgeDS = 0, bridgeDT = 0, bridgeFS = 0.2, bridgeFT = 0.2;
  let fireT = 0;
  let cineOn = opts.cine ?? true;

  let time = 0;
  const timeNow = () => time;
  const retarget = (ev: string) => { glideT = 0; lastEvent = ev; lastEventAt = timeNow(); };

  // ── frame bookkeeping ─────────────────────────────────────────────────────
  let W = 1, H = 1;
  const dprCap = opts.dpr ?? Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2);
  let dpr = dprCap;
  let raf = 0;
  let running = false;
  let lastT = 0;
  let frames = 0, framesSinceStart = 0;
  let fpsEma = 60;
  const frameTimes: number[] = [];
  const gapLog: number[] = [], cpuLog: number[] = [];
  let lastFrame: SpectrumFrame | null = null;
  let capNow = 0;

  // ── init: adapter → device → context → pipelines (all async) ─────────────
  const readyP: Promise<boolean> = (async () => {
    const adapter = opts.adapter ?? (await gpu.requestAdapter({ powerPreference: "high-performance" }));
    if (!adapter) throw new Error("no WebGPU adapter");
    const wantTs = !!opts.gpuTiming && adapter.features.has("timestamp-query");
    const dev = await adapter.requestDevice({
      label: "resonance-particles",
      requiredFeatures: wantTs ? ["timestamp-query"] : [],
      // ask for the adapter's real buffer limits (the defaults cap a binding at 128 MiB)
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });
    if (disposed) { dev.destroy(); return false; }
    device = dev;
    dev.lost.then((l) => {
      if (disposed || l.reason === "destroyed") return;
      lost = true;
      running = false;
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
      opts.onContextLost?.();
    });
    dev.onuncapturederror = (e) => fail(`webgpu error: ${e.error.message}`.slice(0, 400));
    const c = canvas.getContext("webgpu") as unknown as WCanvasContext | null;
    if (!c) throw new Error("canvas.getContext('webgpu') returned null");
    ctx = c;
    format = gpu.getPreferredCanvasFormat();
    c.configure({ device: dev, format, alphaMode: transparent ? "premultiplied" : "opaque" });
    count = clampCount(count, dev.limits);

    const t0 = performance.now();
    const mod = (code: string, label: string) => dev.createShaderModule({ code, label });
    const m = {
      sim: mod(buildSimWGSL(forces), "particles-sim"),
      render: mod(buildRenderWGSL(), "particles-sprites"),
      fade: mod(buildFadeWGSL(), "particles-fade"),
      govern: mod(buildGovernWGSL(), "particles-govern"),
      composite: mod(buildCompositeWGSL(), "particles-composite"),
    };
    const C = ShaderStage.COMPUTE, V = ShaderStage.VERTEX, F = ShaderStage.FRAGMENT;
    const layouts = {
      sim: dev.createBindGroupLayout({
        label: "sim",
        entries: [
          { binding: SIM_BINDINGS.uniforms, visibility: C, buffer: { type: "uniform" } },
          { binding: SIM_BINDINGS.pos, visibility: C, buffer: { type: "storage" } },
          { binding: SIM_BINDINGS.vel, visibility: C, buffer: { type: "storage" } },
          { binding: SIM_BINDINGS.seed, visibility: C, buffer: { type: "storage" } },
          { binding: SIM_BINDINGS.uv, visibility: C, buffer: { type: "read-only-storage" } },
          { binding: SIM_BINDINGS.spec, visibility: C, buffer: { type: "read-only-storage" } },
        ],
      }),
      render: dev.createBindGroupLayout({
        label: "sprites",
        entries: [
          { binding: RENDER_BINDINGS.uniforms, visibility: V | F, buffer: { type: "uniform" } },
          { binding: RENDER_BINDINGS.pos, visibility: V, buffer: { type: "read-only-storage" } },
          { binding: RENDER_BINDINGS.seed, visibility: V, buffer: { type: "read-only-storage" } },
        ],
      }),
      govern: dev.createBindGroupLayout({
        label: "govern",
        entries: [
          { binding: GOVERN_BINDINGS.uniforms, visibility: C, buffer: { type: "uniform" } },
          { binding: GOVERN_BINDINGS.hdr, visibility: C, texture: { sampleType: "float" } },
          { binding: GOVERN_BINDINGS.expo, visibility: C, buffer: { type: "storage" } },
        ],
      }),
      composite: dev.createBindGroupLayout({
        label: "composite",
        entries: [
          { binding: GOVERN_BINDINGS.uniforms, visibility: F, buffer: { type: "uniform" } },
          { binding: GOVERN_BINDINGS.hdr, visibility: F, texture: { sampleType: "float" } },
          { binding: GOVERN_BINDINGS.expo, visibility: F, buffer: { type: "read-only-storage" } },
        ],
      }),
    };
    bgl = layouts;
    const pl = (l: WBindGroupLayout[]) => dev.createPipelineLayout({ bindGroupLayouts: l });
    const simPL = pl([layouts.sim]);
    const compute = (entryPoint: string, layout = simPL, module: WShaderModule = m.sim) =>
      dev.createComputePipelineAsync({ label: entryPoint, layout, compute: { module, entryPoint } });
    const additive = { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } };
    const decay = { color: { srcFactor: "zero", dstFactor: "constant", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "constant", operation: "add" } };
    const compileChecks = Object.entries(m).map(async ([name, sm]) => {
      const ci = await sm.getCompilationInfo();
      const errs = ci.messages.filter((x) => x.type === "error");
      if (errs.length) throw new Error(`WGSL ${name}: ${errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`);
    });
    const [seedInit, posInit, integrate, sprites, fade, govern, composite] = await Promise.all([
      compute("seedInit"),
      compute("posInit"),
      compute("integrate"),
      dev.createRenderPipelineAsync({
        label: "sprites",
        layout: pl([layouts.render]),
        vertex: { module: m.render, entryPoint: "vs" },
        fragment: { module: m.render, entryPoint: "fs", targets: [{ format: "rgba16float", blend: additive }] },
        primitive: { topology: "triangle-strip" },
      }),
      dev.createRenderPipelineAsync({
        label: "fade",
        layout: pl([]),
        vertex: { module: m.fade, entryPoint: "vsTri" },
        fragment: { module: m.fade, entryPoint: "fsFade", targets: [{ format: "rgba16float", blend: decay }] },
        primitive: { topology: "triangle-list" },
      }),
      compute("govern", pl([layouts.govern]), m.govern),
      dev.createRenderPipelineAsync({
        label: "composite",
        layout: pl([layouts.composite]),
        vertex: { module: m.composite, entryPoint: "vsTri" },
        fragment: { module: m.composite, entryPoint: "fsComp", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      }),
      ...compileChecks,
    ]);
    if (disposed) return false;
    pipes = {
      seedInit: seedInit as WComputePipeline, posInit: posInit as WComputePipeline, integrate: integrate as WComputePipeline,
      sprites: sprites as WRenderPipeline, fade: fade as WRenderPipeline, govern: govern as WComputePipeline, composite: composite as WRenderPipeline,
    };

    const U = BufferUsage;
    simU = dev.createBuffer({ size: SIM_LAYOUT.size, usage: U.UNIFORM | U.COPY_DST, label: "simU" });
    renderU = dev.createBuffer({ size: RENDER_LAYOUT.size, usage: U.UNIFORM | U.COPY_DST, label: "renderU" });
    govU = dev.createBuffer({ size: GOVERNOR_LAYOUT.size, usage: U.UNIFORM | U.COPY_DST, label: "govU" });
    specBuf = dev.createBuffer({ size: SPEC_BINS * 8, usage: U.STORAGE | U.COPY_DST, label: "spectrum" });
    expoBuf = dev.createBuffer({ size: 16, usage: U.STORAGE | U.COPY_DST, label: "exposure" });
    dev.queue.writeBuffer(expoBuf, 0, new Float32Array([1, 0, 0, 0]));
    if (wantTs) {
      ts = {
        q: dev.createQuerySet({ type: "timestamp", count: TS_PASSES.length * 2 }),
        resolve: dev.createBuffer({ size: TS_PASSES.length * 16, usage: U.QUERY_RESOLVE | U.COPY_SRC, label: "ts-resolve" }),
        read: dev.createBuffer({ size: TS_PASSES.length * 16, usage: U.MAP_READ | U.COPY_DST, label: "ts-read" }),
        pending: false,
      };
    }
    buildParticles();
    resize();
    info = {
      adapter: [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.device, adapter.info?.description].filter(Boolean).join(" ") || "unknown",
      format,
      features: [...dev.features],
      maxCount: Math.min(4_194_304, maxParticlesFor(dev.limits)),
      timestamps: wantTs,
      compileMs: Math.round(performance.now() - t0),
    };
    ready = true;
    opts.onReady?.(info);
    return true;
  })().catch((e: unknown) => {
    fail(`webgpu init: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
    return false;
  });

  function buildParticles() {
    const dev = device;
    if (!dev || !bgl || !simU || !renderU || !specBuf) return;
    if (buf) for (const b of [buf.pos, buf.vel, buf.seed, ...buf.uv]) b.destroy();
    const U = BufferUsage;
    const v4 = count * 16;
    buf = {
      pos: dev.createBuffer({ size: v4, usage: U.STORAGE | U.COPY_SRC, label: "pos" }),
      vel: dev.createBuffer({ size: v4, usage: U.STORAGE | U.COPY_SRC, label: "vel" }),
      seed: dev.createBuffer({ size: v4, usage: U.STORAGE, label: "seed" }),
      uv: [
        dev.createBuffer({ size: count * 8, usage: U.STORAGE | U.COPY_DST, label: "uv0" }),
        dev.createBuffer({ size: count * 8, usage: U.STORAGE | U.COPY_DST, label: "uv1" }),
      ],
    };
    const b = buf;
    const simGroup = (k: number) => dev.createBindGroup({
      layout: bgl!.sim,
      label: `sim-uv${k}`,
      entries: [
        { binding: SIM_BINDINGS.uniforms, resource: { buffer: simU! } },
        { binding: SIM_BINDINGS.pos, resource: { buffer: b.pos } },
        { binding: SIM_BINDINGS.vel, resource: { buffer: b.vel } },
        { binding: SIM_BINDINGS.seed, resource: { buffer: b.seed } },
        { binding: SIM_BINDINGS.uv, resource: { buffer: b.uv[k] } },
        { binding: SIM_BINDINGS.spec, resource: { buffer: specBuf! } },
      ],
    });
    simBG = [simGroup(0), simGroup(1)];
    renderBG = dev.createBindGroup({
      layout: bgl.render,
      label: "sprites",
      entries: [
        { binding: RENDER_BINDINGS.uniforms, resource: { buffer: renderU } },
        { binding: RENDER_BINDINGS.pos, resource: { buffer: b.pos } },
        { binding: RENDER_BINDINGS.seed, resource: { buffer: b.seed } },
      ],
    });
    activeUv = 0;
    upload = null;
    imgSampled = 0;
    pendingSeed = true;
    pendingInitR = 1.6;
    initDone = false;
    fadeIn = 0;
  }

  function resize() {
    dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, dprCap);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(16, Math.round(r.width * dpr));
    const h = Math.max(16, Math.round(r.height * dpr));
    if (w === W && h === H && hdr) return;
    W = w; H = h;
    canvas.width = W;
    canvas.height = H;
    const dev = device;
    if (!dev || !bgl || !govU || !expoBuf) return;
    hdr?.destroy();
    hdr = dev.createTexture({ size: [W, H], format: "rgba16float", usage: TextureUsage.RENDER_ATTACHMENT | TextureUsage.TEXTURE_BINDING, label: "hdr" });
    hdrFresh = true;
    const view = hdr.createView();
    governBG = dev.createBindGroup({
      layout: bgl.govern,
      entries: [
        { binding: GOVERN_BINDINGS.uniforms, resource: { buffer: govU } },
        { binding: GOVERN_BINDINGS.hdr, resource: view },
        { binding: GOVERN_BINDINGS.expo, resource: { buffer: expoBuf } },
      ],
    });
    compBG = dev.createBindGroup({
      layout: bgl.composite,
      entries: [
        { binding: GOVERN_BINDINGS.uniforms, resource: { buffer: govU } },
        { binding: GOVERN_BINDINGS.hdr, resource: view },
        { binding: GOVERN_BINDINGS.expo, resource: { buffer: expoBuf } },
      ],
    });
  }

  /** Encode the one-off init passes (seeds, boot cloud) into `enc`. */
  function encodeInit(enc: ReturnType<WDevice["createCommandEncoder"]>) {
    if (!pipes || !simBG || !device || !simU) return;
    if (!pendingSeed && pendingInitR === null) return;
    // the init passes read count + radius from the sim uniforms: write them now
    sim.set("count", count).set("shape", [formA, formB, 1, pendingInitR ?? 1.6]);
    device.queue.writeBuffer(simU, 0, sim.data);
    const [gx, gy] = dispatchSize(count);
    const pass = enc.beginComputePass({ label: "init" });
    pass.setBindGroup(0, simBG[activeUv]);
    if (pendingSeed) { pass.setPipeline(pipes.seedInit); pass.dispatchWorkgroups(gx, gy); }
    if (pendingInitR !== null) { pass.setPipeline(pipes.posInit); pass.dispatchWorkgroups(gx, gy); }
    pass.end();
    pendingSeed = false;
    pendingInitR = null;
    initDone = true;
  }

  function tsWrites(k: number): WTimestampWrites | undefined {
    return ts && !ts.pending ? { querySet: ts.q, beginningOfPassWriteIndex: k * 2, endOfPassWriteIndex: k * 2 + 1 } : undefined;
  }

  function pollTimings() {
    const t = ts;
    if (!t || t.pending) return;
    t.pending = true;
    t.read.mapAsync(MapMode.READ).then(() => {
      if (disposed) return;
      const v = new BigUint64Array(t.read.getMappedRange().slice(0));
      t.read.unmap();
      t.pending = false;
      let total = 0;
      const k = timings.samples === 0 ? 1 : 0.1;
      TS_PASSES.forEach((name, i) => {
        const ms = Number(v[i * 2 + 1] - v[i * 2]) / 1e6;
        if (ms >= 0 && ms < 1000) { timings[name] += (ms - timings[name]) * k; total += timings[name]; }
      });
      timings.total = total;
      timings.samples++;
    }).catch(() => { t.pending = false; });
  }

  // ── the frame ──────────────────────────────────────────────────────────────
  function frame(now: number) {
    if (!running || lost || stalled) return;
    raf = requestAnimationFrame(frame);
    const frameT0 = performance.now();
    const rawDt = lastT ? (now - lastT) / 1000 : 1 / 60;
    lastT = now;
    framesSinceStart++;
    const wd = opts.watchdog;
    if (wd && framesSinceStart > 3 && rawDt * 1000 > wd.gapMs && typeof document !== "undefined" && !hiddenSince(performance.now() - rawDt * 1000 - 50)) {
      const nowMs = performance.now();
      gapLog.push(nowMs);
      while (gapLog.length && nowMs - gapLog[0] > 60_000) gapLog.shift();
      if (rawDt > 4 || gapLog.length >= 3) { stall(`frame gap ${Math.round(rawDt * 1000)} ms (${gapLog.length} in 60 s)`); return; }
    }
    const dt = Math.min(1 / 20, Math.max(1 / 240, rawDt));
    time += dt;
    frames++;
    if (rawDt > 0 && rawDt < 1) {
      frameTimes.push(rawDt);
      if (frameTimes.length > 120) frameTimes.shift();
      fpsEma += (1 / rawDt - fpsEma) * 0.05;
    }
    resize();

    // audio → spectrum (each mote hears its own band — motion only)
    const f = audioFn ? audioFn(dt) : null;
    lastFrame = f;
    if (f) {
      for (let i = 0; i < SPEC_BINS; i++) {
        const k = Math.min(f.bins - 1, Math.floor((i / SPEC_BINS) * f.bins));
        specData[i * 2] = f.levels[k];
        specData[i * 2 + 1] = f.drive[k] * reactS;
      }
    } else {
      for (let i = 0; i < SPEC_BINS * 2; i++) specData[i] *= 0.94;
    }

    // ── followers (the WebGL engine's glides, same constants) ──────────────
    density = sp(17, density, Math.min(densityTarget, soulA.maxDensity), 2.5, dt);
    {
      const h = Math.min(dt, 0.05), w = PAL_OMEGA;
      hueVel += (w * w * (hueTarget - hue) - 2 * w * hueVel) * h; hue += hueVel * h;
      satVel += (w * w * (satTarget - sat) - 2 * w * satVel) * h; sat += satVel * h;
    }
    motion = sp(8, motion, motionTarget, 2, dt);
    camScale = sp(9, camScale, camScaleTarget, 5, dt);
    offX = sp(10, offX, offTX, 4, dt); offY = sp(11, offY, offTY, 4, dt);
    imgScaleS = sp(12, imgScaleS, imgScaleT, 1.5, dt);
    sizeScaleS = sp(13, sizeScaleS, sizeScaleT, 4, dt);
    imgMirror = sp(14, imgMirror, imgMirrorT, 0.9, dt);
    imgTiltS = sp(16, imgTiltS, imgTiltT, 2, dt);
    reactS += (reactT - reactS) * (1 - Math.exp(-dt / 1.2));
    layerGain += (layerGainTarget - layerGain) * (1 - Math.exp(-dt / 1.5));
    scatterEnv += (scatterTarget - scatterEnv) * (1 - Math.exp(-dt / 0.3));
    scatterTarget *= Math.exp(-dt / 1.8);
    bounceEnv *= Math.exp(-dt / 0.35);
    {
      const kp = 1 - Math.exp(-dt / 0.3);
      for (let i = 0; i < 16; i++) gravS[i] += (gravT[i] - gravS[i]) * kp;
      gravGainS += (gravGainT - gravGainS) * (1 - Math.exp(-dt / 2.5));
      const kb = 1 - Math.exp(-dt / 0.9);
      bridgePS += (bridgePT - bridgePS) * kb;
      if (bridgePS < 0.005) { bridgeMS = bridgeMT; bridgeFS = bridgeFT; } else bridgeMS += (bridgeMT - bridgeMS) * kb;
      bridgeDS += (bridgeDT - bridgeDS) * (1 - Math.exp(-dt / 1.2));
    }
    // image pull: held at 0 while its uv is still trickling in (never pull
    // toward the previous image's targets)
    if (imgFormTgt < 0.01 && imgF.x < 0.02) flashPace = false;
    {
      const h = Math.min(dt, 0.05);
      const wF = flashPace ? 6 : 3 * imgPaceK, wS = flashPace ? 4 : 2.4 * imgPaceK;
      critStep(imgF, upload ? Math.min(imgF.x, imgFormTgt) : imgFormTgt, wF, h);
      critStep(imgS, imgShowTgt, wS, h);
    }
    // procedural form morph (eased), the next one waits its turn
    if (formMix < 1) {
      formMix = Math.min(1, formMix + dt / formDur);
      if (formMix >= 1) formA = formB;
    } else if (pendingForm) {
      const pf = pendingForm;
      pendingForm = null;
      if (pf.id !== formB) { formA = formB; formB = pf.id; formMix = 0; formDur = pf.sec; pullT = 0; lastEvent = "form"; lastEventAt = time; }
    }
    pullT += dt;
    glideT += dt;
    entryT += dt;
    {
      const moving = formMix < 1 || pullT < 2.5 || glideT < 2.5 || Math.abs(imgFormTgt - imgF.x) > 0.02 || Math.abs(imgShowTgt - imgS.x) > 0.02;
      if (moving) settledSince = -1; else if (settledSince < 0) settledSince = time;
    }
    fadeIn = Math.min(1, fadeIn + dt / 2.5);

    if (!ready || !device || !pipes || !buf || !simBG || !renderBG || !governBG || !compBG || !hdr || !ctx || !simU || !renderU || !govU || !specBuf) return;
    const dev = device;

    // one-off init passes in their OWN submit: queue.writeBuffer lands before
    // the next submit, so the init radius must not share a submit with the
    // frame's uniforms (the frame's write would win)
    if (pendingSeed || pendingInitR !== null) {
      const e0 = dev.createCommandEncoder({ label: "particles-init" });
      encodeInit(e0);
      dev.queue.submit([e0.finish()]);
    }

    // ── upload trickle (≤ 1 MB this frame) ──────────────────────────────────
    if (upload) {
      const u = upload;
      const [off, size] = u.chunks[u.k++];
      dev.queue.writeBuffer(buf.uv[u.slot], off, u.data.buffer, u.data.byteOffset + off, size);
      if (u.k >= u.chunks.length) { activeUv = u.slot; imgSampled = 1; upload = null; }
    }
    dev.queue.writeBuffer(specBuf, 0, specData);

    // ── camera ────────────────────────────────────────────────────────────
    az += dt * soulA.camSpin;
    const elev = soulA.camElev;
    const dist = soulA.camDist * camScale;
    const eye = [Math.cos(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.sin(az) * Math.cos(elev) * dist];
    const FOV = 0.85;
    const proj = perspectiveZO(FOV, W / H, 0.05, 50);
    const view0 = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const right = [view0[0], view0[4], view0[8]];
    const up = [view0[1], view0[5], view0[9]];
    const halfH = dist * Math.tan(FOV / 2);
    const halfW = halfH * (W / H);
    const o3 = [0, 1, 2].map((i) => right[i] * offX * halfW + up[i] * offY * halfH);
    const view = lookAt([eye[0] + o3[0], eye[1] + o3[1], eye[2] + o3[2]], o3, [0, 1, 0]);
    const vp = mul(proj, view);
    const ca = Math.cos(imgTiltS), sa = Math.sin(imgTiltS);
    const PR = [0, 1, 2].map((i) => (ca * right[i] + sa * up[i]) * halfW * imgScaleS * imgMirror);
    const PU = [0, 1, 2].map((i) => (-sa * right[i] + ca * up[i]) * halfH * imgScaleS);

    // ── speed / acceleration caps (the WebGL glide laws) ─────────────────────
    const entryK = Math.min(1, entryT / 5);
    const gr = Math.min(1, glideT / GLIDE_SEC);
    const retargetK = 0.8 + 0.2 * gr * gr * (3 - 2 * gr);
    const maxSpeedNow = (0.45 + (speedCap - 0.45) * entryK * entryK * (3 - 2 * entryK)) * retargetK;
    capNow = maxSpeedNow;
    const ts0 = Math.min(pullT, glideT), ak = Math.min(1, ts0 / 3);
    const accCap = ak >= 1 ? 1e6 : 1.6 / Math.max(0.02, 1 - ak * ak * (3 - 2 * ak));
    const em = formMix * formMix * (3 - 2 * formMix);

    sim
      .set("dt", dt * motion).set("time", time).set("count", count).set("frame", frames)
      .set("clock", [time, time, time]).set("swell", Math.min(1, (f?.swell ?? 0) * reactS))
      .set("bands", [(f?.bands.bass ?? 0) * reactS, (f?.bands.mid ?? 0) * reactS, (f?.bands.treble ?? 0) * reactS])
      .set("maxSpeed", maxSpeedNow)
      .set("bandLv", [Math.min(1, (f?.bandLevels.bass ?? 0) * reactS), Math.min(1, (f?.bandLevels.mid ?? 0) * reactS), Math.min(1, (f?.bandLevels.treble ?? 0) * reactS)])
      .set("accCap", accCap)
      .set("planeC", [0, 0, 0]).set("imgAspect", imgAspect)
      .set("planeR", PR).set("scrAspect", W / H)
      .set("planeU", PU).set("imgForm", imgF.x)
      .set("curl", [0.35, 0.9, 0.05, 0.6])
      .set("shape", [formA, formB, em, 1])
      .set("spring", [5, 2.6, imgSampled, snapPending ? 1 : 0])
      .set("react", [reactS, scatterEnv, bounceEnv * bounceSign, density]);
    if (f?.clocks) sim.set("clock", [f.clocks.bass, f.clocks.mid, f.clocks.treble]);
    snapPending = false;

    const pal = glidePalette(paletteOverride ?? soulA.palette, dt);
    const trail = soulA.trail * trailScale * (1 - 0.7 * imgS.x);
    const alpha = 0.06 * layerGain * soulA.intensity * fadeIn * (409_600 / count) * (1 - trail * 0.85);
    ren
      .set("viewProj", vp)
      .set("camRight", right).set("pointPx", pointCss * dpr)
      .set("camUp", up).set("focal", dist)
      .set("eye", eye).set("alpha", alpha)
      .set("palLow", pal.low).set("hue", hue)
      .set("palMid", pal.mid).set("sat", sat)
      .set("palHigh", pal.high).set("density", density)
      .set("viewport", [W, H]).set("minPx", minPx).set("count", count)
      .set("imgShow", imgS.x).set("sizeK", soulA.size * sizeScaleS).set("time", time).set("imgSampled", imgSampled);
    gov
      .set("viewport", [W, H]).set("cap", 0.16)
      .set("maxStep", 1 - Math.exp(-0.3 * Math.min(dt, 0.05)))
      .set("init", hdrFresh ? 1 : 0).set("transparent", transparent ? 1 : 0);

    const enc = dev.createCommandEncoder({ label: "particles-frame" });
    dev.queue.writeBuffer(simU, 0, sim.data);
    dev.queue.writeBuffer(renderU, 0, ren.data);
    dev.queue.writeBuffer(govU, 0, gov.data);

    const [gx, gy] = dispatchSize(count);
    {
      const pass = enc.beginComputePass({ label: "integrate", timestampWrites: tsWrites(0) });
      pass.setPipeline(pipes.integrate);
      pass.setBindGroup(0, simBG[activeUv]);
      pass.dispatchWorkgroups(gx, gy);
      pass.end();
    }
    {
      const pass = enc.beginRenderPass({
        label: "hdr",
        colorAttachments: [{ view: hdr.createView(), loadOp: hdrFresh ? "clear" : "load", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        timestampWrites: tsWrites(1),
      });
      const d = Math.pow(Math.max(0, Math.min(0.995, trail)), dt * 60);
      pass.setPipeline(pipes.fade);
      pass.setBlendConstant([d, d, d, d]);
      pass.draw(3);
      pass.setPipeline(pipes.sprites);
      pass.setBindGroup(0, renderBG);
      pass.draw(4, count);
      pass.end();
    }
    {
      const pass = enc.beginComputePass({ label: "govern", timestampWrites: tsWrites(2) });
      pass.setPipeline(pipes.govern);
      pass.setBindGroup(0, governBG);
      pass.dispatchWorkgroups(1);
      pass.end();
    }
    {
      const pass = enc.beginRenderPass({
        label: "composite",
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: transparent ? 0 : 1 } }],
        timestampWrites: tsWrites(3),
      });
      pass.setPipeline(pipes.composite);
      pass.setBindGroup(0, compBG);
      pass.draw(3);
      pass.end();
    }
    const sample = !!ts && !ts.pending;
    if (ts && sample) {
      enc.resolveQuerySet(ts.q, 0, TS_PASSES.length * 2, ts.resolve, 0);
      enc.copyBufferToBuffer(ts.resolve, 0, ts.read, 0, TS_PASSES.length * 16);
    }
    dev.queue.submit([enc.finish()]);
    if (sample && frames % 15 === 0) pollTimings();
    hdrFresh = false;

    const cpu = performance.now() - frameT0;
    if (wd && framesSinceStart > 3 && cpu > wd.cpuMs) {
      const nowMs = performance.now();
      cpuLog.push(nowMs);
      while (cpuLog.length && nowMs - cpuLog[0] > 60_000) cpuLog.shift();
      if (cpuLog.length >= 5) stall(`frame cpu ${Math.round(cpu)} ms (${cpuLog.length} in 60 s)`);
    }
  }

  /** While invisible: run the init passes so the first visible frame has nothing to build. */
  function warmStep() {
    if (!ready || !device || initDone || lost || stalled) return;
    const enc = device.createCommandEncoder({ label: "particles-warm" });
    encodeInit(enc);
    device.queue.submit([enc.finish()]);
  }

  const stats = (): ParticleStats => {
    const sorted = [...frameTimes].sort((a, b) => b - a);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.05)] : 1 / 60;
    const lf = lastFrame;
    const gr = Math.min(1, glideT / GLIDE_SEC);
    const nPipes = 7;
    return {
      fps: Math.round(fpsEma * 10) / 10,
      fpsLow: Math.round((1 / p95) * 10) / 10,
      motion: { meanSpeed: 0, fastFrac: 0, glide: 0.8 + 0.2 * gr * gr * (3 - 2 * gr), lastEvent, lastEventAgo: time - lastEventAt, cap: capNow },
      frameMs: Math.round((1000 / fpsEma) * 100) / 100,
      count,
      texSide: Math.ceil(Math.sqrt(count)),
      dpr,
      width: W,
      height: H,
      soul: soulA.id,
      transition: formMix < 1 ? formMix : 0,
      bands: lf ? { ...lf.bands } : { bass: 0, mid: 0, treble: 0 },
      bandLevels: lf ? { ...lf.bandLevels } : { bass: 0, mid: 0, treble: 0 },
      rates: lf ? { ...lf.rates } : { bass: 1, mid: 1, treble: 1 },
      swell: lf?.swell ?? 0,
      onsets: lf?.onsets ?? 0,
      audio: !!lf,
      exposure: 1, // governed on the GPU, never read back (probe: §A.6)
      meanLum: 0,
      maxLumStep: 0,
      state: { meanSpeed: 0, maxSpeed: 0, speedByBand: [0, 0, 0], meanRadius: 0, radiusByBand: [0, 0, 0], samples: 0, t: 0 },
      frames,
      density,
      dissolve: null,
      hue,
      sat,
      scatter: scatterEnv,
      bounce: bounceEnv,
      programs: {
        compiling: pipes || failed ? 0 : nPipes,
        ready: pipes ? nPipes : 0,
        warm: pipes && initDone ? nPipes : 0,
        failed: failed ? 1 : 0,
      },
      stability: { stable: true, glow: false, bloom: 0 },
      warmLog: [],
    };
  };

  const engine: WebGPUParticleEngine = {
    backend: "webgpu",
    ready: () => readyP,
    info: () => info,
    failure: () => failed,
    gpuTimings: () => (ts && timings.samples > 0 ? { ...timings } : null),
    setProceduralForm(id, seconds = 4) {
      const n = Math.max(0, Math.min(FORM_NAMES.length - 1, Math.round(id)));
      pendingForm = { id: n, sec: Math.max(0.5, seconds) };
    },
    start() {
      if (running || lost || stalled || disposed) return;
      running = true;
      framesSinceStart = 0;
      lastT = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    },
    dispose() {
      running = false;
      disposed = true;
      if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
      if (buf) for (const b of [buf.pos, buf.vel, buf.seed, ...buf.uv]) b.destroy();
      for (const b of [simU, renderU, govU, specBuf, expoBuf, ts?.resolve, ts?.read]) b?.destroy();
      ts?.q.destroy();
      hdr?.destroy();
      try { ctx?.unconfigure(); } catch { /* already gone */ }
      device?.destroy();
      device = null;
    },
    setSoul(id, seconds = 7) {
      const next = soulById(id);
      if (next === soulA) return;
      soulA = next;
      retarget(`soul:${id}`);
      // TODO(webgpu-plan §A.2): port the soul force library; the stand-in figure morphs meanwhile
      engine.setProceduralForm(standInForm(id), Math.min(8, Math.max(1.5, seconds)));
    },
    setPalette(p) { paletteOverride = p; },
    setCount(n) {
      const c = clampCount(n, device?.limits);
      if (c === count) return;
      count = c;
      buildParticles(); // (call while invisible — the field re-gathers, as WebGL)
    },
    setAudio(fn) { audioFn = fn ?? null; },
    setDensity(d) { densityTarget = Math.max(0, Math.min(1, d)); },
    // TODO(webgpu-plan §A.4): the dissolve timeline (A/B stills, snap at DISSOLVE_SNAP_SEC)
    dissolveTo() { return false; },
    dissolveTime() { return null; },
    startDissolve() { return false; },
    setImagePace(k) { imgPaceK = Math.max(0.3, Math.min(1.5, k)); },
    setHue(h, s = 1) { hueTarget = h; satTarget = Math.max(0.3, Math.min(1.6, s)); },
    setForm() { /* TODO(webgpu-plan §A.2): soul form parameters */ },
    setShape() { /* TODO(webgpu-plan §A.2): figure staging (crossesStep / figureHeld) */ },
    setVariant() { /* TODO(webgpu-plan §A.2): form-variety designs */ },
    imageLevel() { return Math.max(imgF.x, imgS.x, Math.abs(imgF.v) * 0.2, Math.abs(imgS.v) * 0.2); },
    imageShown() { return imgS.x; },
    setFire(k) { fireT = Math.max(0, Math.min(1.5, k)); /* TODO(webgpu-plan §A.5): living fire draw */ },
    snapImage(clear = false, placement = true) {
      if (placement) {
        offX = offTX; offY = offTY; imgScaleS = imgScaleT; imgMirror = imgMirrorT; imgTiltS = imgTiltT;
        for (const i of [10, 11, 12, 14, 16]) sv[i] = 0;
      }
      if (clear) { imgFormTgt = imgShowTgt = 0; imgF.x = imgF.v = imgS.x = imgS.v = 0; fireT = 0; }
    },
    snapToImage() { snapPending = true; imgF.x = imgFormTgt; imgS.x = imgShowTgt; imgF.v = imgS.v = 0; fadeIn = 1; },
    imageState() { return { form: imgF.x, show: imgS.x, formTarget: imgFormTgt, showTarget: imgShowTgt, fire: fireT }; },
    setCamScale(k) { camScaleTarget = camScaleBase * Math.max(0.3, Math.min(2.6, k)); },
    setCine(on) { cineOn = on; void cineOn; /* TODO(webgpu-plan §B.3): DOF via depth bins */ },
    setScore() { /* TODO(webgpu-plan §A.3): living score force module */ },
    scoreCompiled() { return false; },
    setCurrents(c, snap = false) {
      const fin = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
      curT.amount = c ? fin(c.amount) : 0;
      if (c) { curT.tension = fin(c.tension); curT.layering = fin(c.layering); }
      void snap; // TODO(webgpu-plan §A.3): harmonic currents force module
    },
    setBreath(b, snap = false) {
      brT.amount = b && Number.isFinite(b.amount) ? Math.max(0, Math.min(1, b.amount)) : 0;
      if (b) { brT.breath = Math.max(-1, Math.min(1, b.breath || 0)); brT.settle = Math.max(0, Math.min(1, b.settle || 0)); }
      void snap; // TODO(webgpu-plan §A.3): breath force module
    },
    setGravity(packed, gain = 1) {
      const fin = (x: number, a: number, b: number) => (Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : 0);
      if (!packed) { for (let i = 0; i < 4; i++) gravT[i * 4 + 3] = 0; gravGainT = 0; return; }
      for (let i = 0; i < 4; i++) {
        const o = i * 4;
        if (o + 3 >= packed.length) { gravT[o + 3] = 0; continue; }
        gravT[o] = fin(packed[o], -1.5, 1.5); gravT[o + 1] = fin(packed[o + 1], -1.5, 1.5);
        gravT[o + 2] = fin(packed[o + 2], 0, 2); gravT[o + 3] = fin(packed[o + 3], 0, 1);
        if (gravS[o + 3] < 1e-3) { gravS[o] = gravT[o]; gravS[o + 1] = gravT[o + 1]; gravS[o + 2] = gravT[o + 2]; }
      }
      gravGainT = fin(gain, 0, 2);
      // TODO(webgpu-plan §A.3): light gravity force module
    },
    gravityState() { return { gain: gravGainS, points: Array.from(gravS) }; },
    setHands() { /* TODO(webgpu-plan §A.3): two hands force module */ },
    handsCompiled() { return false; },
    setTrails() { /* TODO(webgpu-plan §B.4): velocity streaks */ },
    trailsCompiled() { return false; },
    trailsShown() { return 0; },
    setOffset(x, y) { offTX = Math.max(-0.7, Math.min(0.7, x)); offTY = Math.max(-0.5, Math.min(0.5, y)); },
    setImageScale(k) { imgScaleT = Math.max(0.2, Math.min(1.2, k)); },
    setSizeScale(k) { sizeScaleT = Math.max(0.4, Math.min(2.5, k)); },
    setReact(k) { reactT = Math.max(0.5, Math.min(4, k)); },
    setUnfold() { /* TODO(webgpu-plan §A.2) */ },
    setInstances() { /* TODO(webgpu-plan §A.2): field mode */ },
    setTripwire() { /* TODO(webgpu-plan §A.6): async velocity probe (mapAsync, one in flight) */ },
    lastRetarget() { return { event: lastEvent, ago: time - lastEventAt, at: lastEventAt }; },
    settledFor() { return settledSince < 0 ? 0 : time - settledSince; },
    setImageVariant(mirror, tilt) { imgMirrorT = mirror ? -1 : 1; imgTiltT = Math.max(-3.2, Math.min(3.2, tilt)); },
    setImageTint() { /* TODO(webgpu-plan §A.5) */ },
    loadBridgeStill() { return false; /* TODO(webgpu-plan §A.5): the bridge colour fields */ },
    setBridge(presence, mix, drift, fraction) {
      const c = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
      bridgePT = c(presence); bridgeMT = c(mix); bridgeDT = c(drift); bridgeFT = Math.min(0.5, c(fraction));
    },
    bridgeState() { return { presence: bridgePS, mix: bridgeMS, drift: bridgeDS, fraction: bridgeFS }; },
    setFollow() { /* TODO(webgpu-plan §A.3): follow / melody force module */ },
    loadFormImage(_src, aspect, uv, glide = true) {
      if (lost || disposed) return;
      if (glide) { retarget("image"); flashPace = false; } else flashPace = true;
      imgAspect = aspect > 0 ? aspect : 1;
      if (uv && uv.length === count * 2) {
        // trickle into the idle half; the pull holds until it lands
        const slot = 1 - activeUv;
        upload = { data: uv, slot, chunks: uploadChunks(uv.byteLength), k: 0 };
      } else {
        upload = null;
        imgSampled = 0;
      }
      // TODO(webgpu-plan §A.5): the image's colours (src) for imgShow
    },
    imageSampleCount() { return count; },
    setImageForm(form, show) {
      imgFormTgt = Math.max(0, Math.min(1, form));
      imgShowTgt = Math.max(0, Math.min(1, show));
    },
    setImageLiteral() { /* TODO(webgpu-plan §E): pairing softness */ },
    setHover() { /* TODO(webgpu-plan §A.3) */ },
    setMotion(k) { motionTarget = Math.max(0.4, Math.min(1.6, k)); },
    impulse(kind, strength = 1) {
      const k = Math.max(0, Math.min(1, strength));
      if (kind === "scatter") scatterTarget = Math.max(scatterTarget, k);
      else { bounceSign = -bounceSign; bounceEnv = Math.max(bounceEnv, k); }
    },
    regather() {
      camScale = camScaleTarget = camScaleBase;
      offX = offTX = 0; offY = offTY = 0;
      pendingInitR = 0.35;
      initDone = false;
    },
    setMelody() { /* TODO(webgpu-plan §A.3) */ },
    enter() { pendingInitR = 3.0; initDone = false; entryT = 0; },
    setHueSpread(s) { hueSpreadTarget = Math.max(0, Math.min(3.2, s)); void hueSpreadTarget; /* TODO(webgpu-plan §A.5) */ },
    setGain(k) { layerGainTarget = Math.max(0.2, Math.min(5, k)); },
    prepare() { /* pipelines compile async at creation (no per-soul programs) */ },
    warmBurst() { if (!running) warmStep(); return engine.isWarm(); },
    setWarmPace() { /* nothing to pace: pipelines resolve async */ },
    prewarm() { if (!running) warmStep(); },
    isWarm() { return ready && initDone && !failed; },
    resize,
    stats,
  };
  // the parity state not yet consumed on the GPU stays readable for tests/diag
  void curT; void brT; void fireT;
  return engine;
}
