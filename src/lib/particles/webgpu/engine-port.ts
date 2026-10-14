// ─────────────────────────────────────────────────────────────────────────────
// engine-port.ts — the WebGPU particle engine at FULL PARITY with the show.
//
// Architecture (docs/webgpu-engine-plan.md §3.1):
//   CONDUCTOR — the show's own WebGL engine (particle-engine.ts), unmodified,
//               running against a recording WebGL2 context (gl-capture.ts).
//               Every method, follower, glide, staging rule, image timeline
//               and feature envelope is the show's code — this object IS the
//               ParticleEngine the journey layer drives.
//   EXECUTOR  — this module: each draw the conductor issues runs the PORTED
//               pass on the GPU instead —
//                 seedInit / posInit → compute init (wgsl.ts)
//                 sim                → the ported simulation (naga port of
//                                      buildSimFS: every soul + every force)
//                 fade + draw        → trail fade + the ported draw program
//                                      (naga port of DRAW_VS/FS) as quads
//                 taa                → the ported temporal resolve
//                 comp               → exact-mean governor + composite
//               lum / expo / bloom are replaced (governor) or not ported
//               (bloom: off in the show); spatial pairing is compiled out of
//               the conductor (EXT_float_blend absent) until §E.
// The kiosk stall laws hold: pipelines async before anything draws, no read
// back on the frame path (timing probe only), one device per session.
// ─────────────────────────────────────────────────────────────────────────────

import { createParticleEngine, ParticleEngineUnsupported, type ParticleEngine, type ParticleStats } from "../particle-engine";
import { STABLE_LAWS } from "../stable-motes";
import {
  BufferUsage, TextureUsage, ShaderStage, MapMode, navigatorGpu,
  type WDevice, type WBuffer, type WTexture, type WBindGroup, type WBindGroupLayout, type WCanvasContext,
  type WComputePipeline, type WRenderPipeline, type WQuerySet, type WTextureFormat, type WTimestampWrites, type WSampler,
} from "./gpu-types";
import { SIM_LAYOUT, GOVERNOR_LAYOUT, UniformBlock, dispatchSize } from "./layout";
import { buildSimWGSL, buildFadeWGSL, buildGovernWGSL, buildCompositeWGSL, buildTaaWGSL, SIM_BINDINGS, GOVERN_BINDINGS, SPEC_BINS } from "./wgsl";
import { SIM_PORT_BINDINGS, DRAW_PORT_BINDINGS } from "./gl-port";
import { SIM_PORT, DRAW_PORT } from "./port.generated";
import { createGLCapture, packUniforms, type CapDraw, type CapTexture } from "./gl-capture";
import { buildPairWGSL, PAIR_LAYOUT, PAIR_BINDINGS, PAIR_ENTRIES, PAIR_SECTORS, PAIR_RINGS } from "./pair-wgsl";
import type { WebGPUEngineOptions, WebGPUInfo, GpuTimings } from "./engine";

export interface PortedParticleEngine extends ParticleEngine {
  readonly backend: "webgpu-port";
  ready(): Promise<boolean>;
  info(): WebGPUInfo | null;
  failure(): string | null;
  gpuTimings(): GpuTimings | null;
  /** the WebGL source changed since port.generated.ts was made (regenerate) */
  portStale(): string | null;
  /** the conductor (the show engine on the capture context) — tests / diag */
  conductor(): ParticleEngine;
}

const TS_PASSES = ["integrate", "sprites", "govern", "composite"] as const;

export function createPortedParticleEngine(canvas: HTMLCanvasElement, opts: WebGPUEngineOptions = {}): PortedParticleEngine {
  const gpu = navigatorGpu();
  if (!gpu) throw new ParticleEngineUnsupported("WebGPU unavailable (navigator.gpu missing)");
  const transparent = !!opts.transparent;

  // ── GPU state ──────────────────────────────────────────────────────────────
  let device: WDevice | null = null;
  let ctx: WCanvasContext | null = null;
  let format: WTextureFormat = "bgra8unorm";
  let info: WebGPUInfo | null = null;
  let failed: string | null = null;
  let stale: string | null = null;
  let ready = false;
  let disposed = false;
  let pipes: {
    seedInit: WComputePipeline; posInit: WComputePipeline; sim: WComputePipeline;
    fade: WRenderPipeline; draw: WRenderPipeline; taa: WRenderPipeline | null; govern: WComputePipeline; composite: WRenderPipeline;
  } | null = null;
  let L: { sim: WBindGroupLayout; draw: WBindGroupLayout; govern: WBindGroupLayout; composite: WBindGroupLayout; taa: WBindGroupLayout; pair: WBindGroupLayout } | null = null;
  let pairPipes: Record<(typeof PAIR_ENTRIES)[number], WComputePipeline> | null = null;
  let pairBufs: { u: WBuffer; stats: WBuffer; hist: WBuffer; cdf: WBuffer } | null = null;
  // float data textures (image uv, sorted pairing samples, paired uv) → storage buffers
  const fbufs = new Map<CapTexture, WBuffer>();
  const simBGs = new Map<WBuffer, WBindGroup>();
  const pairBGs = new Map<string, WBindGroup>();
  const pairU = new UniformBlock(PAIR_LAYOUT);
  let sampler: WSampler | null = null;
  let U: { sim: WBuffer; init: WBuffer; draw: WBuffer; gov: WBuffer; taa: WBuffer; spec: WBuffer; expo: WBuffer } | null = null;
  let P: { side: number; pos: WBuffer; vel: WBuffer; seed: WBuffer; uv: WBuffer; simBG: WBindGroup; initBG: WBindGroup } | null = null;
  let T: { w: number; h: number; hdr: WTexture; taa: WTexture[]; gov: WBindGroup[]; comp: WBindGroup[]; taaBG: WBindGroup[] } | null = null;
  let tcur = 0;
  let hdrFresh = true;
  let ts: { q: WQuerySet; resolve: WBuffer; read: WBuffer; pending: boolean } | null = null;
  const timings: GpuTimings = { integrate: 0, sprites: 0, govern: 0, composite: 0, total: 0, samples: 0 };
  const gpuTex = new Map<CapTexture, { tex: WTexture; version: number; w: number; h: number }>();
  let blackTex: WTexture | null = null;
  const drawBGs = new Map<string, WBindGroup>();
  const texIds = new WeakMap<WTexture, number>();
  let texSeq = 0;
  const texId = (t: WTexture) => { let k = texIds.get(t); if (k === undefined) { k = ++texSeq; texIds.set(t, k); } return k; };
  let lastSubmit = 0;
  const bufIds = new WeakMap<WBuffer, number>();
  const uvKey = (b: WBuffer) => { let k = bufIds.get(b); if (k === undefined) { k = ++texSeq; bufIds.set(b, k); } return k; };
  let wantSide = 0;
  let pendingSeed = false;
  let pendingInitR: number | null = null;
  let seeded = false, placed = false;
  let frames = 0;

  const simBlock = { data: new ArrayBuffer(SIM_PORT.size) };
  const simF = new Float32Array(simBlock.data), simI = new Int32Array(simBlock.data);
  const drawBlock = new ArrayBuffer(Math.max(DRAW_PORT.plain.size, DRAW_PORT.stable.size));
  const drawF = new Float32Array(drawBlock), drawI = new Int32Array(drawBlock);
  const initU = new UniformBlock(SIM_LAYOUT);
  const gov = new UniformBlock(GOVERNOR_LAYOUT);
  const specData = new Float32Array(SPEC_BINS * 2);
  // what this conductor frame asked for (consumed at its composite draw)
  const fr = {
    sim: false, simUv: null as CapTexture | null, decay: 0,
    draw: null as null | { count: number; tex: Map<string, CapTexture | null> }, taaKeep: null as number | null,
    pair: null as null | { sorted: CapTexture | null; target: CapTexture | null },
  };

  // ── the conductor ────────────────────────────────────────────────────────
  const cap = createGLCapture({ onDraw, onUpload, onDelete });
  const shim = {
    get width() { return canvas.width; },
    set width(v: number) { canvas.width = v; },
    get height() { return canvas.height; },
    set height(v: number) { canvas.height = v; },
    style: canvas.style,
    getBoundingClientRect: () => canvas.getBoundingClientRect(),
    getContext: (kind: string) => (kind === "webgl2" ? cap.gl : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const conductor = createParticleEngine(shim as unknown as HTMLCanvasElement, {
    ...opts,
    glow: false, // bloom is off in the show; not ported
    probe: false,
  });
  const stableOn = conductor.stats().stability.stable;
  const drawPort = DRAW_PORT[stableOn ? "stable" : "plain"];

  const fail = (why: string) => {
    if (failed) return;
    failed = why;
    conductor.stop();
    opts.watchdog?.onStall(why);
  };

  // ── init: device, context, pipelines (all async, before anything draws) ──
  const readyP: Promise<boolean> = (async () => {
    const adapter = opts.adapter ?? (await gpu.requestAdapter({ powerPreference: "high-performance" }));
    if (!adapter) throw new Error("no WebGPU adapter");
    const wantTs = !!opts.gpuTiming && adapter.features.has("timestamp-query");
    const dev = await adapter.requestDevice({
      label: "resonance-particles-port",
      requiredFeatures: wantTs ? ["timestamp-query"] : [],
      requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize },
    });
    if (disposed) { dev.destroy(); return false; }
    device = dev;
    dev.lost.then((l) => {
      if (disposed || l.reason === "destroyed") return;
      conductor.stop();
      opts.onContextLost?.();
    });
    dev.onuncapturederror = (e) => fail(`webgpu error: ${e.error.message}`.slice(0, 400));
    const c = canvas.getContext("webgpu") as unknown as WCanvasContext | null;
    if (!c) throw new Error("canvas.getContext('webgpu') returned null");
    ctx = c;
    format = gpu.getPreferredCanvasFormat();
    c.configure({ device: dev, format, alphaMode: transparent ? "premultiplied" : "opaque" });

    const t0 = performance.now();
    const mod = (code: string, label: string) => dev.createShaderModule({ code, label });
    const m = {
      init: mod(buildSimWGSL([]), "port-init"),
      sim: mod(SIM_PORT.wgsl, "port-sim"),
      drawV: mod(drawPort.vertex, "port-draw-vs"),
      drawF: mod(drawPort.fragment, "port-draw-fs"),
      fade: mod(buildFadeWGSL(), "port-fade"),
      taa: stableOn ? mod(buildTaaWGSL(STABLE_LAWS.TAA_CLAMP_SLACK), "port-taa") : null,
      govern: mod(buildGovernWGSL(), "port-govern"),
      composite: mod(buildCompositeWGSL(), "port-composite"),
      pair: mod(buildPairWGSL(), "port-pair"),
    };
    const C = ShaderStage.COMPUTE, V = ShaderStage.VERTEX, F = ShaderStage.FRAGMENT;
    const ub = (b: number, vis: number) => ({ binding: b, visibility: vis, buffer: { type: "uniform" as const } });
    const sb = (b: number, vis: number, ro = false) => ({ binding: b, visibility: vis, buffer: { type: ro ? ("read-only-storage" as const) : ("storage" as const) } });
    const tb = (b: number, vis: number) => ({ binding: b, visibility: vis, texture: { sampleType: "float" as const } });
    L = {
      // shared by the ported sim and the init passes (same binding table)
      sim: dev.createBindGroupLayout({ label: "port-sim", entries: [ub(0, C), sb(1, C), sb(2, C), sb(3, C), sb(4, C, true), sb(5, C, true)] }),
      draw: dev.createBindGroupLayout({
        label: "port-draw",
        entries: [
          ub(DRAW_PORT_BINDINGS.uniforms, V), sb(DRAW_PORT_BINDINGS.pos, V, true), sb(DRAW_PORT_BINDINGS.vel, V, true), sb(DRAW_PORT_BINDINGS.seed, V, true), sb(DRAW_PORT_BINDINGS.uv, V, true),
          tb(DRAW_PORT_BINDINGS.imgA, V), tb(DRAW_PORT_BINDINGS.imgB, V), tb(DRAW_PORT_BINDINGS.bridgeA, V), tb(DRAW_PORT_BINDINGS.bridgeB, V),
          { binding: DRAW_PORT_BINDINGS.sampler, visibility: V, sampler: { type: "filtering" } },
        ],
      }),
      govern: dev.createBindGroupLayout({ label: "port-govern", entries: [ub(0, C), tb(1, C), sb(2, C)] }),
      composite: dev.createBindGroupLayout({ label: "port-composite", entries: [ub(0, F), tb(1, F), sb(2, F, true)] }),
      taa: dev.createBindGroupLayout({ label: "port-taa", entries: [ub(0, F), tb(1, F), tb(2, F)] }),
      pair: dev.createBindGroupLayout({ label: "port-pair", entries: [ub(0, C), sb(1, C, true), sb(2, C), sb(3, C), sb(4, C), sb(5, C, true), sb(6, C)] }),
    };
    const pl = (l: WBindGroupLayout[]) => dev.createPipelineLayout({ bindGroupLayouts: l });
    const simPL = pl([L.sim]);
    const additive = { color: { srcFactor: "one", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one", operation: "add" } };
    const decay = { color: { srcFactor: "zero", dstFactor: "constant", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "constant", operation: "add" } };
    const checks = Object.entries(m).map(async ([name, sm]) => {
      if (!sm) return;
      const ci = await sm.getCompilationInfo();
      const errs = ci.messages.filter((x) => x.type === "error");
      if (errs.length) throw new Error(`WGSL ${name}: ${errs.slice(0, 3).map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`);
    });
    const [seedInit, posInit, sim, fade, draw, taa, govern, composite] = await Promise.all([
      dev.createComputePipelineAsync({ label: "port-seedInit", layout: simPL, compute: { module: m.init, entryPoint: "seedInit" } }),
      dev.createComputePipelineAsync({ label: "port-posInit", layout: simPL, compute: { module: m.init, entryPoint: "posInit" } }),
      dev.createComputePipelineAsync({ label: "port-sim", layout: simPL, compute: { module: m.sim, entryPoint: "main" } }),
      dev.createRenderPipelineAsync({
        label: "port-fade", layout: pl([]),
        vertex: { module: m.fade, entryPoint: "vsTri" },
        fragment: { module: m.fade, entryPoint: "fsFade", targets: [{ format: "rgba16float", blend: decay }] },
        primitive: { topology: "triangle-list" },
      }),
      dev.createRenderPipelineAsync({
        label: "port-draw", layout: pl([L.draw]),
        vertex: { module: m.drawV, entryPoint: "main" },
        fragment: { module: m.drawF, entryPoint: "main", targets: [{ format: "rgba16float", blend: additive }] },
        primitive: { topology: "triangle-strip" },
      }),
      m.taa
        ? dev.createRenderPipelineAsync({
            label: "port-taa", layout: pl([L.taa]),
            vertex: { module: m.taa, entryPoint: "vsTri" },
            fragment: { module: m.taa, entryPoint: "fsTaa", targets: [{ format: "rgba16float" }] },
            primitive: { topology: "triangle-list" },
          })
        : Promise.resolve(null),
      dev.createComputePipelineAsync({ label: "port-govern", layout: pl([L.govern]), compute: { module: m.govern, entryPoint: "govern" } }),
      dev.createRenderPipelineAsync({
        label: "port-composite", layout: pl([L.composite]),
        vertex: { module: m.composite, entryPoint: "vsTri" },
        fragment: { module: m.composite, entryPoint: "fsComp", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      }),
      ...checks,
    ]);
    const pairList = await Promise.all(PAIR_ENTRIES.map((e) => dev.createComputePipelineAsync({ label: `port-${e}`, layout: pl([L!.pair]), compute: { module: m.pair, entryPoint: e } })));
    if (disposed) return false;
    pairPipes = Object.fromEntries(PAIR_ENTRIES.map((e, i) => [e, pairList[i]])) as Record<(typeof PAIR_ENTRIES)[number], WComputePipeline>;
    pipes = {
      seedInit: seedInit as WComputePipeline, posInit: posInit as WComputePipeline, sim: sim as WComputePipeline,
      fade: fade as WRenderPipeline, draw: draw as WRenderPipeline, taa: (taa as WRenderPipeline | null) ?? null,
      govern: govern as WComputePipeline, composite: composite as WRenderPipeline,
    };
    const B = BufferUsage;
    U = {
      sim: dev.createBuffer({ size: SIM_PORT.size, usage: B.UNIFORM | B.COPY_DST, label: "port-simU" }),
      init: dev.createBuffer({ size: SIM_LAYOUT.size, usage: B.UNIFORM | B.COPY_DST, label: "port-initU" }),
      draw: dev.createBuffer({ size: drawPort.size, usage: B.UNIFORM | B.COPY_DST, label: "port-drawU" }),
      gov: dev.createBuffer({ size: GOVERNOR_LAYOUT.size, usage: B.UNIFORM | B.COPY_DST, label: "port-govU" }),
      taa: dev.createBuffer({ size: 16, usage: B.UNIFORM | B.COPY_DST, label: "port-taaU" }),
      spec: dev.createBuffer({ size: SPEC_BINS * 8, usage: B.STORAGE | B.COPY_DST, label: "port-spec" }),
      expo: dev.createBuffer({ size: 16, usage: B.STORAGE | B.COPY_DST, label: "port-expo" }),
    };
    dev.queue.writeBuffer(U.expo, 0, new Float32Array([1, 0, 0, 0]));
    pairBufs = {
      u: dev.createBuffer({ size: PAIR_LAYOUT.size, usage: B.UNIFORM | B.COPY_DST, label: "pair-u" }),
      stats: dev.createBuffer({ size: 16, usage: B.STORAGE, label: "pair-stats" }),
      hist: dev.createBuffer({ size: PAIR_SECTORS * PAIR_RINGS * 4, usage: B.STORAGE, label: "pair-hist" }),
      cdf: dev.createBuffer({ size: (PAIR_SECTORS + PAIR_SECTORS * PAIR_RINGS) * 8, usage: B.STORAGE, label: "pair-cdf" }),
    };
    sampler = dev.createSampler({ magFilter: "linear", minFilter: "linear" });
    blackTex = dev.createTexture({ size: [1, 1], format: "rgba8unorm", usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST, label: "black" });
    dev.queue.writeTexture({ texture: blackTex }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1]);
    if (wantTs) {
      ts = {
        q: dev.createQuerySet({ type: "timestamp", count: TS_PASSES.length * 2 }),
        resolve: dev.createBuffer({ size: TS_PASSES.length * 16, usage: B.QUERY_RESOLVE | B.COPY_SRC, label: "ts-resolve" }),
        read: dev.createBuffer({ size: TS_PASSES.length * 16, usage: B.MAP_READ | B.COPY_DST, label: "ts-read" }),
        pending: false,
      };
    }
    if (wantSide) allocParticles(wantSide);
    info = {
      adapter: [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.device, adapter.info?.description].filter(Boolean).join(" ") || "unknown",
      format,
      features: [...dev.features],
      maxCount: 1024 * 1024,
      timestamps: wantTs,
      compileMs: Math.round(performance.now() - t0),
    };
    ready = true;
    runInit();
    opts.onReady?.(info);
    return true;
  })().catch((e: unknown) => {
    fail(`webgpu init: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
    return false;
  });

  // ── allocation ────────────────────────────────────────────────────────────
  function allocParticles(side: number) {
    const dev = device;
    if (!dev || !L || !U) return;
    if (P) for (const b of [P.pos, P.vel, P.seed, P.uv]) b.destroy();
    const n = side * side;
    const B = BufferUsage;
    const pos = dev.createBuffer({ size: n * 16, usage: B.STORAGE | B.COPY_SRC, label: "port-pos" });
    const vel = dev.createBuffer({ size: n * 16, usage: B.STORAGE | B.COPY_SRC, label: "port-vel" });
    const seed = dev.createBuffer({ size: n * 16, usage: B.STORAGE, label: "port-seed" });
    const uv = dev.createBuffer({ size: n * 8, usage: B.STORAGE | B.COPY_DST, label: "port-uv" });
    const group = (uni: WBuffer, label: string) => dev.createBindGroup({
      layout: L!.sim, label,
      entries: [
        { binding: SIM_PORT_BINDINGS.uniforms, resource: { buffer: uni } },
        { binding: SIM_PORT_BINDINGS.pos, resource: { buffer: pos } },
        { binding: SIM_PORT_BINDINGS.vel, resource: { buffer: vel } },
        { binding: SIM_PORT_BINDINGS.seed, resource: { buffer: seed } },
        { binding: SIM_PORT_BINDINGS.uv, resource: { buffer: uv } },
        { binding: SIM_PORT_BINDINGS.spec, resource: { buffer: U!.spec } },
      ],
    });
    // (the init module shares the binding table: SIM_BINDINGS == SIM_PORT_BINDINGS)
    void SIM_BINDINGS;
    void group;
    P = { side, pos, vel, seed, uv, simBG: simGroup(U.sim, uv, pos, vel, seed), initBG: simGroup(U.init, uv, pos, vel, seed) };
    for (const b of fbufs.values()) b.destroy();
    fbufs.clear();
    drawBGs.clear();
    simBGs.clear();
    pairBGs.clear();
    seeded = placed = false;
  }

  function simGroup(uni: WBuffer, uv: WBuffer, pos: WBuffer, vel: WBuffer, seed: WBuffer): WBindGroup {
    return device!.createBindGroup({
      layout: L!.sim, label: "port-sim",
      entries: [
        { binding: SIM_PORT_BINDINGS.uniforms, resource: { buffer: uni } },
        { binding: SIM_PORT_BINDINGS.pos, resource: { buffer: pos } },
        { binding: SIM_PORT_BINDINGS.vel, resource: { buffer: vel } },
        { binding: SIM_PORT_BINDINGS.seed, resource: { buffer: seed } },
        { binding: SIM_PORT_BINDINGS.uv, resource: { buffer: uv } },
        { binding: SIM_PORT_BINDINGS.spec, resource: { buffer: U!.spec } },
      ],
    });
  }

  /** The storage buffer mirroring a side² RG32F data texture (created on demand). */
  function fbuf(t: CapTexture | null | undefined, create = false): WBuffer | null {
    if (!t || !P || !device) return null;
    let b = fbufs.get(t);
    if (b && b.size !== P.side * P.side * 8) { b.destroy(); b = undefined; fbufs.delete(t); drawBGs.clear(); simBGs.clear(); pairBGs.clear(); }
    if (!b && create) {
      b = device.createBuffer({ size: P.side * P.side * 8, usage: BufferUsage.STORAGE | BufferUsage.COPY_DST, label: `fbuf${t.id}` });
      fbufs.set(t, b);
    }
    return b ?? null;
  }
  const uvOf = (t: CapTexture | null | undefined) => fbuf(t) ?? P!.uv;
  function simBGFor(uv: WBuffer): WBindGroup {
    let g = simBGs.get(uv);
    if (!g) { g = simGroup(U!.sim, uv, P!.pos, P!.vel, P!.seed); simBGs.set(uv, g); }
    return g;
  }

  function ensureSide(side: number) {
    if (side < 1) return;
    wantSide = side;
    if (ready && (!P || P.side !== side)) allocParticles(side);
  }

  function ensureTargets(w: number, h: number) {
    const dev = device;
    if (!dev || !L || !U) return;
    if (T && T.w === w && T.h === h) return;
    if (T) { T.hdr.destroy(); for (const t of T.taa) t.destroy(); }
    const usage = TextureUsage.RENDER_ATTACHMENT | TextureUsage.TEXTURE_BINDING;
    const hdr = dev.createTexture({ size: [w, h], format: "rgba16float", usage, label: "port-hdr" });
    const taa = stableOn ? [0, 1].map((k) => dev.createTexture({ size: [w, h], format: "rgba16float", usage, label: `port-taa${k}` })) : [];
    const shown = [hdr, ...taa];
    const govBG = (t: WTexture) => dev.createBindGroup({ layout: L!.govern, entries: [
      { binding: GOVERN_BINDINGS.uniforms, resource: { buffer: U!.gov } },
      { binding: GOVERN_BINDINGS.hdr, resource: t.createView() },
      { binding: GOVERN_BINDINGS.expo, resource: { buffer: U!.expo } },
    ] });
    const compBG = (t: WTexture) => dev.createBindGroup({ layout: L!.composite, entries: [
      { binding: GOVERN_BINDINGS.uniforms, resource: { buffer: U!.gov } },
      { binding: GOVERN_BINDINGS.hdr, resource: t.createView() },
      { binding: GOVERN_BINDINGS.expo, resource: { buffer: U!.expo } },
    ] });
    // taa[k] is written from hdr + taa[1-k]
    const taaBG = taa.map((_t, k) => dev.createBindGroup({ layout: L!.taa, entries: [
      { binding: 0, resource: { buffer: U!.taa } },
      { binding: 1, resource: hdr.createView() },
      { binding: 2, resource: taa[1 - k].createView() },
    ] }));
    T = { w, h, hdr, taa, gov: shown.map(govBG), comp: shown.map(compBG), taaBG };
    hdrFresh = true;
  }

  /** The GPU copy of a captured texture, current with its last upload. */
  function texFor(t: CapTexture | null | undefined): WTexture {
    const dev = device!;
    if (!t || t.deleted || (!t.source && !t.data)) return blackTex!;
    let g = gpuTex.get(t);
    if (g && g.version === t.version) return g.tex;
    const w = Math.max(1, t.width), h = Math.max(1, t.height);
    if (!g || g.w !== w || g.h !== h) {
      g?.tex.destroy();
      const tex = dev.createTexture({ size: [w, h], format: "rgba8unorm", usage: TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_DST | TextureUsage.RENDER_ATTACHMENT, label: `cap${t.id}` });
      g = { tex, version: -1, w, h };
      gpuTex.set(t, g);
    }
    try {
      if (t.source) dev.queue.copyExternalImageToTexture({ source: t.source, flipY: t.flipY }, { texture: g.tex }, [w, h]);
      else if (t.data) dev.queue.writeTexture({ texture: g.tex }, t.data, { bytesPerRow: w * 4 }, [w, h]);
    } catch {
      return blackTex!; // an image that cannot be copied (detached, cross-origin) stays black, never throws
    }
    g.version = t.version;
    drawBGs.clear();
    return g.tex;
  }

  // ── capture hooks ─────────────────────────────────────────────────────────
  function onUpload(t: CapTexture, kind: "image" | "data" | "sub" | "alloc") {
    if (!ready || !device || !U) return;
    // the spectrum (RG16F 128×1, every frame)
    if (kind === "sub" && t.width === SPEC_BINS && t.height === 1 && t.data instanceof Float32Array) {
      specData.set(t.data.subarray(0, SPEC_BINS * 2));
      device.queue.writeBuffer(U.spec, 0, specData);
      return;
    }
    // the importance-sampled image uv (RG32F side × side)
    // (the importance-sampled uv and the sorted pairing samples alike: by texture)
    if (kind === "data" && P && t.width === P.side && t.height === P.side && t.data instanceof Float32Array && t.data.length >= P.side * P.side * 2) {
      device.queue.writeBuffer(fbuf(t, true)!, 0, t.data, 0, P.side * P.side * 2);
    }
  }
  function onDelete(t: CapTexture) {
    const g = gpuTex.get(t);
    if (g) { g.tex.destroy(); gpuTex.delete(t); drawBGs.clear(); }
  }

  function runInit() {
    if (!ready || !device || !pipes || !P || !U) return;
    if (!pendingSeed && pendingInitR === null) return;
    initU.set("count", P.side * P.side).set("shape", [0, 0, 1, pendingInitR ?? 1.6]);
    device.queue.writeBuffer(U.init, 0, initU.data);
    const enc = device.createCommandEncoder({ label: "port-init" });
    const pass = enc.beginComputePass({ label: "init" });
    const [gx, gy] = dispatchSize(P.side * P.side);
    pass.setBindGroup(0, P.initBG);
    if (pendingSeed) { pass.setPipeline(pipes.seedInit); pass.dispatchWorkgroups(gx, gy); seeded = true; }
    if (pendingInitR !== null) { pass.setPipeline(pipes.posInit); pass.dispatchWorkgroups(gx, gy); placed = true; }
    pass.end();
    device.queue.submit([enc.finish()]);
    pendingSeed = false;
    pendingInitR = null;
  }

  function onDraw(d: CapDraw) {
    if (d.scissor || failed) return; // warm draws (1-pixel) build nothing here
    switch (d.prog.kind) {
      case "seedInit":
        ensureSide(d.viewport[2]);
        pendingSeed = true;
        runInit();
        return;
      case "posInit": {
        ensureSide(d.viewport[2]);
        const r = d.prog.values.get("uInitR")?.[0] ?? 0;
        pendingInitR = r > 0 ? r : 1.6;
        runInit();
        return;
      }
      case "sim":
        ensureSide(d.viewport[2]);
        packUniforms(d.prog, SIM_PORT.fields, simF, simI);
        fr.sim = true;
        fr.simUv = d.textures.get("uImgUv") ?? null;
        return;
      case "pairAssign": {
        // the last of the five pairing passes: run all five as compute this frame
        const v = d.prog.values;
        pairU.set("planeR", v.get("uPlaneR") ?? [1, 0, 0]).set("planeU", v.get("uPlaneU") ?? [0, 1, 0])
          .set("count", v.get("uCount")?.[0] ?? 1).set("groups", v.get("uGroups")?.[0] ?? 48).set("texW", v.get("uTexW")?.[0] ?? 1);
        fr.pair = { sorted: d.textures.get("uPair") ?? null, target: d.fbo?.color[0] ?? null };
        return;
      }
      case "fade":
        fr.decay = d.prog.values.get("uDecay")?.[0] ?? 0;
        return;
      case "draw":
        packUniforms(d.prog, drawPort.fields, drawF, drawI, { uPortVp: [canvas.width, canvas.height] });
        fr.draw = { count: d.count, tex: d.textures };
        return;
      case "taa":
        fr.taaKeep = d.prog.values.get("uKeep")?.[0] ?? 0;
        return;
      case "comp":
        if (d.fbo === null) submitFrame();
        return;
      default:
        return; // lum / expo (→ the exact-mean governor), bloom (not ported), pairing (§E)
    }
  }

  function drawGroup(tex: Map<string, CapTexture | null>): WBindGroup {
    const dev = device!;
    const a = texFor(tex.get("uImgA")), b = texFor(tex.get("uImgB")), ba = texFor(tex.get("uBridgeA")), bb = texFor(tex.get("uBridgeB"));
    const uvb = uvOf(tex.get("uImgUv"));
    const key = [a, b, ba, bb].map(texId).join("|") + `#${P!.side}#${uvKey(uvb)}`;
    let g = drawBGs.get(key);
    if (!g) {
      const D = DRAW_PORT_BINDINGS;
      g = dev.createBindGroup({
        layout: L!.draw, label: "port-draw",
        entries: [
          { binding: D.uniforms, resource: { buffer: U!.draw } },
          { binding: D.pos, resource: { buffer: P!.pos } },
          { binding: D.vel, resource: { buffer: P!.vel } },
          { binding: D.seed, resource: { buffer: P!.seed } },
          { binding: D.uv, resource: { buffer: uvb } },
          { binding: D.imgA, resource: a.createView() },
          { binding: D.imgB, resource: b.createView() },
          { binding: D.bridgeA, resource: ba.createView() },
          { binding: D.bridgeB, resource: bb.createView() },
          { binding: D.sampler, resource: sampler! },
        ],
      });
      drawBGs.set(key, g);
    }
    return g;
  }

  function tsWrites(k: number): WTimestampWrites | undefined {
    return ts && !ts.pending ? { querySet: ts.q, beginningOfPassWriteIndex: k * 2, endOfPassWriteIndex: k * 2 + 1 } : undefined;
  }

  function submitFrame() {
    const dev = device;
    const want = { ...fr, draw: fr.draw };
    fr.sim = false; fr.draw = null; fr.taaKeep = null; fr.pair = null; fr.simUv = null;
    if (!ready || !dev || !pipes || !P || !U || !ctx || !seeded || !placed) return;
    ensureTargets(Math.max(1, canvas.width), Math.max(1, canvas.height));
    if (!T) return;
    frames++;
    const enc = dev.createCommandEncoder({ label: "port-frame" });
    const n = P.side * P.side;
    if (want.pair && pairPipes && pairBufs) {
      const sorted = fbuf(want.pair.sorted), out = fbuf(want.pair.target, true);
      if (sorted && out) {
        dev.queue.writeBuffer(pairBufs.u, 0, pairU.data);
        const key = `${uvKey(sorted)}>${uvKey(out)}`;
        let g = pairBGs.get(key);
        if (!g) {
          const Q = PAIR_BINDINGS;
          g = dev.createBindGroup({ layout: L!.pair, label: "port-pair", entries: [
            { binding: Q.uniforms, resource: { buffer: pairBufs.u } },
            { binding: Q.pos, resource: { buffer: P.pos } },
            { binding: Q.stats, resource: { buffer: pairBufs.stats } },
            { binding: Q.hist, resource: { buffer: pairBufs.hist } },
            { binding: Q.cdf, resource: { buffer: pairBufs.cdf } },
            { binding: Q.sorted, resource: { buffer: sorted } },
            { binding: Q.out, resource: { buffer: out } },
          ] });
          pairBGs.set(key, g);
        }
        const [px, py] = dispatchSize(n);
        const bins = Math.ceil((PAIR_SECTORS * PAIR_RINGS) / 256);
        const pass = enc.beginComputePass({ label: "pairing" });
        pass.setBindGroup(0, g);
        pass.setPipeline(pairPipes.pairStats); pass.dispatchWorkgroups(1);
        pass.setPipeline(pairPipes.pairClear); pass.dispatchWorkgroups(bins);
        pass.setPipeline(pairPipes.pairHist); pass.dispatchWorkgroups(px, py);
        pass.setPipeline(pairPipes.pairAcdf); pass.dispatchWorkgroups(1);
        pass.setPipeline(pairPipes.pairRcdf); pass.dispatchWorkgroups(bins);
        pass.setPipeline(pairPipes.pairAssign); pass.dispatchWorkgroups(px, py);
        pass.end();
      }
    }
    if (want.sim) {
      dev.queue.writeBuffer(U.sim, 0, simBlock.data);
      const pass = enc.beginComputePass({ label: "sim", timestampWrites: tsWrites(0) });
      pass.setPipeline(pipes.sim);
      pass.setBindGroup(0, simBGFor(uvOf(want.simUv)));
      const [gx, gy] = dispatchSize(n);
      pass.dispatchWorkgroups(gx, gy);
      pass.end();
    }
    {
      const pass = enc.beginRenderPass({
        label: "hdr",
        colorAttachments: [{ view: T.hdr.createView(), loadOp: hdrFresh ? "clear" : "load", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
        timestampWrites: tsWrites(1),
      });
      const k = Math.max(0, Math.min(1, want.decay));
      pass.setPipeline(pipes.fade);
      pass.setBlendConstant([k, k, k, k]);
      pass.draw(3);
      if (want.draw) {
        dev.queue.writeBuffer(U.draw, 0, drawBlock, 0, drawPort.size);
        pass.setPipeline(pipes.draw);
        pass.setBindGroup(0, drawGroup(want.draw.tex));
        pass.draw(4, Math.min(want.draw.count, n));
      }
      pass.end();
    }
    let shown = 0;
    if (pipes.taa && T.taa.length && want.taaKeep !== null) {
      const tn = 1 - tcur;
      dev.queue.writeBuffer(U.taa, 0, new Float32Array([hdrFresh ? 0 : want.taaKeep, 0, 0, 0]));
      const pass = enc.beginRenderPass({ label: "taa", colorAttachments: [{ view: T.taa[tn].createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      pass.setPipeline(pipes.taa);
      pass.setBindGroup(0, T.taaBG[tn]);
      pass.draw(3);
      pass.end();
      tcur = tn;
      shown = 1 + tn;
    }
    const nowMs = performance.now();
    const dt = lastSubmit ? Math.min(0.05, Math.max(1 / 240, (nowMs - lastSubmit) / 1000)) : 1 / 60;
    lastSubmit = nowMs;
    gov.set("viewport", [T.w, T.h]).set("cap", 0.16).set("maxStep", 1 - Math.exp(-0.3 * dt)).set("init", hdrFresh ? 1 : 0).set("transparent", transparent ? 1 : 0);
    dev.queue.writeBuffer(U.gov, 0, gov.data);
    {
      const pass = enc.beginComputePass({ label: "govern", timestampWrites: tsWrites(2) });
      pass.setPipeline(pipes.govern);
      pass.setBindGroup(0, T.gov[shown]);
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
      pass.setBindGroup(0, T.comp[shown]);
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
        if (ms >= 0 && ms < 1000) timings[name] += (ms - timings[name]) * k;
        total += timings[name];
      });
      timings.total = total;
      timings.samples++;
    }).catch(() => { t.pending = false; });
  }

  // freshness: the port must be made from the show's CURRENT GLSL
  void import("./port-sources").then(({ currentPortHashes }) => {
    const h = currentPortHashes();
    const bad = [h.sim !== SIM_PORT.hash ? "sim" : "", h[stableOn ? "stable" : "plain"] !== drawPort.hash ? "draw" : ""].filter(Boolean);
    if (bad.length) {
      stale = `port stale (${bad.join(", ")}): run NAGA_BIN=… node scripts/gen-webgpu-port.mjs`;
      console.warn(`[webgpu] ${stale}`);
    }
  }).catch(() => {});

  // ── the ParticleEngine surface: the conductor's, with GPU lifecycle ───────
  const engine = Object.create(conductor) as PortedParticleEngine;
  Object.assign(engine, {
    backend: "webgpu-port" as const,
    ready: () => readyP,
    info: () => info,
    failure: () => failed,
    portStale: () => stale,
    conductor: () => conductor,
    gpuTimings: () => (ts && timings.samples > 0 ? { ...timings } : null),
    isWarm: () => ready && !failed && seeded && placed && conductor.isWarm(),
    warmBurst: (maxSteps?: number) => { conductor.warmBurst(maxSteps); runInit(); return engine.isWarm(); },
    prewarm: () => { conductor.prewarm(); runInit(); },
    start: () => { if (!failed && !disposed) conductor.start(); },
    stats: (): ParticleStats => conductor.stats(),
    dispose: () => {
      disposed = true;
      conductor.dispose();
      if (P) for (const b of [P.pos, P.vel, P.seed, P.uv]) b.destroy();
      if (U) for (const b of Object.values(U)) b.destroy();
      for (const b of fbufs.values()) b.destroy();
      if (pairBufs) for (const b of Object.values(pairBufs)) b.destroy();
      if (T) { T.hdr.destroy(); for (const t of T.taa) t.destroy(); }
      for (const g of gpuTex.values()) g.tex.destroy();
      blackTex?.destroy();
      ts?.q.destroy(); ts?.resolve.destroy(); ts?.read.destroy();
      try { ctx?.unconfigure(); } catch { /* gone */ }
      device?.destroy();
      device = null;
    },
  });
  // every other method is the conductor's own (prototype delegation)
  return engine;
}
