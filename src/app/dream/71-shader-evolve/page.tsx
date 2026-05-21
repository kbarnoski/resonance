"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

// ── Vertex shader (never mutated) ─────────────────────────────────────────────

const VERT_WGSL = `@vertex
fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0));
  return vec4f(p[i], 0.0, 1.0);
}`;

// ── Shader parameterisation ───────────────────────────────────────────────────
// Each param is a numeric constant injected into the WGSL template.
// Mutations perturb 3–5 of them, always producing valid WGSL.

interface ShaderParams {
  ringFreq: number;   // ring spatial frequency
  ringSpeed: number;  // ring animation speed
  bassRing: number;   // bass influence on rings
  gridFreq: number;   // grid spatial frequency
  midGrid: number;    // mid influence on grid
  treGrid: number;    // treble influence on grid
  gridBright: number; // grid brightness multiplier
  baseBright: number; // base brightness
  bassRange: number;  // bass brightness range
  gridMix: number;    // grid contribution to brightness
  onset: number;      // onset flash strength
  hueMid: number;     // mid contribution to hue
  hueTre: number;     // treble contribution to hue
  hueDrift: number;   // passive hue drift speed
  sat: number;        // HSV saturation
  vig: number;        // vignette strength
}

const ROOT_PARAMS: ShaderParams = {
  ringFreq: 18, ringSpeed: 1.5, bassRing: 5,
  gridFreq: 26, midGrid: 4,    treGrid: 4,
  gridBright: 0.35, baseBright: 0.35, bassRange: 0.65,
  gridMix: 0.5,     onset: 0.7,
  hueMid: 0.5,      hueTre: 0.3,  hueDrift: 0.03,
  sat: 0.9,         vig: 0.8,
};

function buildFrag(p: ShaderParams): string {
  const f = (n: number) => n.toFixed(2);
  return `struct Audio {
  uBass: f32, uMid: f32, uTreble: f32, uOnset: f32,
  uTime: f32, uBPM: f32, uResX: f32, uResY: f32,
}
@group(0) @binding(0) var<uniform> a: Audio;

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = (pos.xy - vec2f(a.uResX, a.uResY) * 0.5) / a.uResY;
  let r  = length(uv);
  let t  = a.uTime;
  let ring = sin(r * ${f(p.ringFreq)} - t * ${f(p.ringSpeed)} - a.uBass * ${f(p.bassRing)}) * 0.5 + 0.5;
  let gx = abs(sin(uv.x * ${f(p.gridFreq)} + a.uMid    * ${f(p.midGrid)})) * ${f(p.gridBright)};
  let gy = abs(sin(uv.y * ${f(p.gridFreq)} + a.uTreble  * ${f(p.treGrid)})) * ${f(p.gridBright)};
  var bright = ring * (${f(p.baseBright)} + a.uBass * ${f(p.bassRange)}) + max(gx, gy) * ${f(p.gridMix)} + a.uOnset * ${f(p.onset)};
  bright = clamp(bright, 0.0, 1.0);
  let hue = fract(a.uMid * ${f(p.hueMid)} + a.uTreble * ${f(p.hueTre)} + t * ${f(p.hueDrift)});
  let h6  = hue * 6.0;
  let fi  = floor(h6);
  let ff  = h6 - fi;
  let s   = ${f(p.sat)};
  let v   = bright;
  let p0  = v * (1.0 - s);
  let p1  = v * (1.0 - s * ff);
  let p2  = v * (1.0 - s * (1.0 - ff));
  var col: vec3f;
  if      (fi < 1.0) { col = vec3f(v,  p2, p0); }
  else if (fi < 2.0) { col = vec3f(p1,  v, p0); }
  else if (fi < 3.0) { col = vec3f(p0,  v, p2); }
  else if (fi < 4.0) { col = vec3f(p0, p1,  v); }
  else if (fi < 5.0) { col = vec3f(p2, p0,  v); }
  else               { col = vec3f(v,  p0, p1); }
  col *= 1.0 - r * r * ${f(p.vig)};
  return vec4f(col, 1.0);
}`;
}

function spawnParams(parent: ShaderParams): ShaderParams {
  const keys = Object.keys(parent) as Array<keyof ShaderParams>;
  const count = 3 + Math.floor(Math.random() * 3);
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  const next = { ...parent };
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const k = shuffled[i];
    const factor = 0.4 + Math.random() * 2.1;
    next[k] = Math.max(0.02, next[k] * factor);
  }
  return next;
}

// ── Audio ─────────────────────────────────────────────────────────────────────

interface Bands { bass: number; mid: number; treble: number; onset: number }

function readBands(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>, prev: Bands): Bands {
  analyser.getFloatFrequencyData(buf);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const energy = (lo: number, hi: number): number => {
    const b0 = Math.max(0, Math.floor(lo / binHz));
    const b1 = Math.min(buf.length - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let b = b0; b <= b1; b++) sum += Math.pow(10, Math.max(-120, buf[b]) / 20);
    return b1 >= b0 ? sum / (b1 - b0 + 1) : 0;
  };
  const raw = {
    bass:   Math.min(1, energy(20, 250) * 8),
    mid:    Math.min(1, energy(250, 4000) * 5),
    treble: Math.min(1, energy(4000, 20000) * 10),
  };
  const α = 0.82;
  const bass   = prev.bass   * α + raw.bass   * (1 - α);
  const mid    = prev.mid    * α + raw.mid    * (1 - α);
  const treble = prev.treble * α + raw.treble * (1 - α);
  const sumNow  = raw.bass + raw.mid + raw.treble;
  const sumPrev = prev.bass + prev.mid + prev.treble;
  const ratio   = sumPrev > 0.05 ? sumNow / sumPrev : 0;
  const onset   = ratio > 1.6 && sumNow > 0.3 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

function demoBands(t: number, prev: Bands): Bands {
  const bass   = 0.3 + 0.28 * Math.sin(t * 0.17 * Math.PI * 2);
  const mid    = 0.3 + 0.22 * Math.sin(t * 0.11 * Math.PI * 2 + 1.1);
  const treble = 0.2 + 0.18 * Math.sin(t * 0.29 * Math.PI * 2 + 2.3);
  const beatPhase = (t % 0.75) / 0.75;
  const onset = beatPhase < 0.04 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

// ── WebGPU helpers ────────────────────────────────────────────────────────────

interface SharedGpu {
  device: GPUDevice;
  format: GPUTextureFormat;
  uniformBuf: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  vertMod: GPUShaderModule;
}

async function compileFrag(g: SharedGpu, code: string): Promise<GPURenderPipeline | null> {
  try {
    const mod  = g.device.createShaderModule({ code });
    const info = await mod.getCompilationInfo();
    if (info.messages.some(m => m.type === "error")) return null;
    const layout = g.device.createPipelineLayout({ bindGroupLayouts: [g.bindGroupLayout] });
    return await g.device.createRenderPipelineAsync({
      layout,
      vertex:   { module: g.vertMod, entryPoint: "main" },
      fragment: { module: mod, entryPoint: "main", targets: [{ format: g.format }] },
      primitive: { topology: "triangle-list" },
    });
  } catch { return null; }
}

function drawCanvas(
  g: SharedGpu, ctx: GPUCanvasContext, pipeline: GPURenderPipeline,
  bands: Bands, elapsed: number, w: number, h: number,
) {
  g.device.queue.writeBuffer(g.uniformBuf, 0, new Float32Array([
    bands.bass, bands.mid, bands.treble, bands.onset, elapsed, 80, w, h,
  ]));
  const tex  = ctx.getCurrentTexture();
  const enc  = g.device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: tex.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, g.bindGroup);
  pass.draw(6);
  pass.end();
  g.device.queue.submit([enc.finish()]);
}

// ── Data types ────────────────────────────────────────────────────────────────

interface Variant {
  id: number;
  params: ShaderParams;
  code: string;
  pipeline: GPURenderPipeline | null;
}

interface GalleryItem {
  id: number;
  params: ShaderParams;
  ts: number;
}

let uidSeed = 0;

const GALLERY_KEY = "dream-shader-evolve-gallery";
const GRID_MS     = 1000 / 15; // 15 fps for grid cells

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShaderEvolve() {
  // Canvas elements
  const gridCanvases = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null]);
  const focusRef     = useRef<HTMLCanvasElement>(null);

  // GPU
  const gpuRef      = useRef<SharedGpu | null>(null);
  const gridCtxs    = useRef<(GPUCanvasContext | null)[]>([null, null, null, null]);
  const focusCtxRef = useRef<GPUCanvasContext | null>(null);

  // Live refs (accessed from render loop without stale-closure risk)
  const variantsRef    = useRef<Variant[]>([]);
  const selIdxRef      = useRef(0);
  const parentParamsRef = useRef<ShaderParams>(ROOT_PARAMS);
  const evolvingRef    = useRef(false);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fftBufRef   = useRef<Float32Array<ArrayBuffer> | null>(null);
  const bandsRef    = useRef<Bands>({ bass: 0, mid: 0, treble: 0, onset: 0 });
  const startRef    = useRef(Date.now());
  const animRef     = useRef(0);
  const lastGrid    = useRef([0, 0, 0, 0]);

  // React state (drives UI)
  const [mode, setMode]         = useState<"idle" | "demo" | "mic">("idle");
  const [gpuOk, setGpuOk]       = useState<boolean | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selIdx, setSelIdx]     = useState(0);
  const [gallery, setGallery]   = useState<GalleryItem[]>([]);
  const [evolving, setEvolving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editCode, setEditCode] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  // Keep live refs in sync with state
  useEffect(() => { variantsRef.current = variants; }, [variants]);
  useEffect(() => { selIdxRef.current   = selIdx;   }, [selIdx]);

  // ── GPU init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("gpu" in navigator)) { setGpuOk(false); return; }
    let gone = false;

    (async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (gone || !adapter) { setGpuOk(false); return; }
        const device  = await adapter.requestDevice();
        if (gone) { device.destroy(); return; }

        const format     = navigator.gpu.getPreferredCanvasFormat();
        const uniformBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const bindGroupLayout = device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
        });
        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
        });
        const vertMod = device.createShaderModule({ code: VERT_WGSL });
        const g: SharedGpu = { device, format, uniformBuf, bindGroupLayout, bindGroup, vertMod };
        gpuRef.current = g;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // Configure grid canvas contexts
        for (let i = 0; i < 4; i++) {
          const cv = gridCanvases.current[i];
          if (!cv) continue;
          cv.width  = (cv.clientWidth  || 200) * dpr;
          cv.height = (cv.clientHeight || 200) * dpr;
          const ctx = cv.getContext("webgpu") as GPUCanvasContext;
          ctx.configure({ device, format, alphaMode: "opaque" });
          gridCtxs.current[i] = ctx;
        }

        // Configure focus canvas context
        const fc = focusRef.current;
        if (fc) {
          fc.width  = (fc.clientWidth  || 400) * dpr;
          fc.height = (fc.clientHeight || 400) * dpr;
          const ctx = fc.getContext("webgpu") as GPUCanvasContext;
          ctx.configure({ device, format, alphaMode: "opaque" });
          focusCtxRef.current = ctx;
        }

        // Generate initial 4 mutations from root params
        const init: Variant[] = [];
        for (let i = 0; i < 4; i++) {
          if (gone) break;
          const params   = spawnParams(ROOT_PARAMS);
          const code     = buildFrag(params);
          const pipeline = await compileFrag(g, code);
          init.push({ id: uidSeed++, params, code, pipeline });
        }
        if (gone) { device.destroy(); return; }

        variantsRef.current = init;
        setVariants(init);
        setGpuOk(true);
      } catch {
        if (!gone) setGpuOk(false);
      }
    })();

    return () => {
      gone = true;
      gpuRef.current?.device.destroy();
      gpuRef.current = null;
    };
  }, []);

  // Load saved gallery
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GALLERY_KEY);
      if (raw) setGallery(JSON.parse(raw) as GalleryItem[]);
    } catch { /* noop */ }
  }, []);

  // Resize handler
  useEffect(() => {
    if (gpuOk !== true) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const handleResize = () => {
      const g = gpuRef.current;
      if (!g) return;
      for (let i = 0; i < 4; i++) {
        const cv = gridCanvases.current[i];
        const cx = gridCtxs.current[i];
        if (!cv || !cx) continue;
        cv.width  = (cv.clientWidth  || 200) * dpr;
        cv.height = (cv.clientHeight || 200) * dpr;
        cx.configure({ device: g.device, format: g.format, alphaMode: "opaque" });
      }
      const fc   = focusRef.current;
      const fctx = focusCtxRef.current;
      if (fc && fctx) {
        fc.width  = (fc.clientWidth  || 400) * dpr;
        fc.height = (fc.clientHeight || 400) * dpr;
        fctx.configure({ device: g.device, format: g.format, alphaMode: "opaque" });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [gpuOk]);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const render = () => {
      const g = gpuRef.current;
      if (!g) { animRef.current = requestAnimationFrame(render); return; }

      const elapsed = (Date.now() - startRef.current) / 1000;
      let bands = bandsRef.current;
      if (mode === "demo") {
        bands = demoBands(elapsed, bands);
      } else if (analyserRef.current && fftBufRef.current) {
        bands = readBands(analyserRef.current, fftBufRef.current, bands);
      }
      bandsRef.current = bands;

      const now = performance.now();
      const vs  = variantsRef.current;
      const si  = selIdxRef.current;

      // Focus canvas — full fps
      const selPipeline = vs[si]?.pipeline;
      const fc   = focusRef.current;
      const fctx = focusCtxRef.current;
      if (selPipeline && fc && fctx) {
        drawCanvas(g, fctx, selPipeline, bands, elapsed, fc.width, fc.height);
      }

      // Grid canvases — 15 fps
      for (let i = 0; i < 4; i++) {
        if (now - lastGrid.current[i] < GRID_MS) continue;
        lastGrid.current[i] = now;
        const pp = vs[i]?.pipeline;
        const cv = gridCanvases.current[i];
        const cx = gridCtxs.current[i];
        if (pp && cv && cx) drawCanvas(g, cx, pp, bands, elapsed, cv.width, cv.height);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  // ── Evolve ────────────────────────────────────────────────────────────────
  const evolve = useCallback(async () => {
    const g = gpuRef.current;
    if (!g || evolvingRef.current) return;
    evolvingRef.current = true;
    setEvolving(true);

    const parent = variantsRef.current[selIdxRef.current]?.params ?? parentParamsRef.current;
    const next: Variant[] = [];
    for (let i = 0; i < 4; i++) {
      const params   = spawnParams(parent);
      const code     = buildFrag(params);
      const pipeline = await compileFrag(g, code);
      next.push({ id: uidSeed++, params, code, pipeline });
    }

    parentParamsRef.current = parent;
    variantsRef.current = next;
    setVariants(next);
    selIdxRef.current = 0;
    setSelIdx(0);
    evolvingRef.current = false;
    setEvolving(false);
  }, []);

  // ── Evolve from gallery item ──────────────────────────────────────────────
  const evolveFromGallery = useCallback(async (item: GalleryItem) => {
    const g = gpuRef.current;
    if (!g || evolvingRef.current) return;
    evolvingRef.current = true;
    setEvolving(true);

    const next: Variant[] = [];
    for (let i = 0; i < 4; i++) {
      const params   = spawnParams(item.params);
      const code     = buildFrag(params);
      const pipeline = await compileFrag(g, code);
      next.push({ id: uidSeed++, params, code, pipeline });
    }

    parentParamsRef.current = item.params;
    variantsRef.current = next;
    setVariants(next);
    selIdxRef.current = 0;
    setSelIdx(0);
    evolvingRef.current = false;
    setEvolving(false);
  }, []);

  // ── Save to gallery ───────────────────────────────────────────────────────
  const saveToGallery = useCallback(() => {
    const sel = variantsRef.current[selIdxRef.current];
    if (!sel) return;
    const item: GalleryItem = { id: uidSeed++, params: sel.params, ts: Date.now() };
    setGallery(prev => {
      const next = [...prev, item].slice(-6);
      try { localStorage.setItem(GALLERY_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  // ── Edit selected shader ──────────────────────────────────────────────────
  const openEdit = useCallback(() => {
    const sel = variantsRef.current[selIdxRef.current];
    if (!sel) return;
    setEditCode(sel.code);
    setEditMode(true);
  }, []);

  const applyEdit = useCallback(async () => {
    const g = gpuRef.current;
    if (!g) return;
    const pipeline = await compileFrag(g, editCode);
    if (!pipeline) return; // compile failed — keep editor open
    const si = selIdxRef.current;
    const edited: Variant = { id: uidSeed++, params: { ...ROOT_PARAMS }, code: editCode, pipeline };
    const next = variantsRef.current.map((v, i) => (i === si ? edited : v));
    variantsRef.current = next;
    setVariants(next);
    setEditMode(false);
  }, [editCode]);

  // ── Audio start ───────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    startRef.current = Date.now();
    bandsRef.current = { bass: 0, mid: 0, treble: 0, onset: 0 };
    setMode("demo");
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx     = new AudioContext();
      const src     = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      fftBufRef.current   = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      startRef.current    = Date.now();
      bandsRef.current    = { bass: 0, mid: 0, treble: 0, onset: 0 };
      setMicError(null);
      setMode("mic");
    } catch {
      setMicError("Mic denied — demo mode");
      startDemo();
    }
  }, [startDemo]);

  const selectVariant = useCallback((i: number) => {
    selIdxRef.current = i;
    setSelIdx(i);
  }, []);

  // Cleanup
  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    audioCtxRef.current?.close();
  }, []);

  // ── WebGPU unavailable ────────────────────────────────────────────────────
  if (gpuOk === false) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", background: "#0a0a0a",
        color: "#e8e8e8", fontFamily: "monospace", gap: 14,
      }}>
        <div style={{ fontSize: 13, color: "#f87" }}>WebGPU not available.</div>
        <div style={{ fontSize: 11, color: "#666" }}>
          Try Chrome 113+, Edge 113+, Firefox 121+, or Safari 18+.
        </div>
        <Link href="/dream" style={{ fontSize: 11, color: "#6af" }}>← back to dream</Link>
      </div>
    );
  }

  // Defined inside component so TypeScript infers return type from usage context
  function btn(extra: CSSProperties): CSSProperties {
    return { borderRadius: 3, fontSize: 11, cursor: "pointer", letterSpacing: 1, padding: "3px 11px", border: "none", ...extra };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#0a0a0a", color: "#e8e8e8", fontFamily: "monospace",
      overflow: "hidden",
    }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: "9px 16px", borderBottom: "1px solid #1e1e1e",
        display: "flex", alignItems: "center", gap: 14,
        flexShrink: 0, background: "#0c0c0c",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>SHADER EVOLVE</span>
        <span style={{ fontSize: 11, color: "#555" }}>
          natural selection of audio-reactive shaders
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {mode === "idle" && (
            <>
              <button
                onClick={startDemo}
                style={btn({ background: "#0f2018", color: "#5dba7d", border: "1px solid #1e4030" })}
              >▶ DEMO</button>
              <button
                onClick={() => { void startMic(); }}
                style={btn({ background: "#0f1a28", color: "#5da0ba", border: "1px solid #1e3040" })}
              >🎤 MIC</button>
            </>
          )}
          {mode === "demo" && <span style={{ fontSize: 11, color: "#5dba7d", letterSpacing: 1 }}>▶ DEMO</span>}
          {mode === "mic"  && <span style={{ fontSize: 11, color: "#5da0ba", letterSpacing: 1 }}>🎤 LIVE</span>}
          <Link href="/dream" style={{ fontSize: 11, color: "#444" }}>← dream</Link>
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* 2×2 mutation grid */}
        <div style={{
          width: "42%", display: "grid",
          gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
          gap: 3, padding: 3, background: "#111", flexShrink: 0,
        }}>
          {([0, 1, 2, 3] as const).map(i => (
            <div
              key={i}
              onClick={() => selectVariant(i)}
              style={{
                position: "relative", cursor: "pointer", borderRadius: 2,
                outline: i === selIdx ? "2px solid #5da0ba" : "2px solid #1a1a1a",
              }}
            >
              <canvas
                ref={el => { gridCanvases.current[i] = el; }}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
              {/* Cell label */}
              <div style={{
                position: "absolute", top: 4, left: 5,
                fontSize: 9, color: i === selIdx ? "#5da0ba" : "#2a2a2a",
                userSelect: "none",
              }}>
                {i + 1}
              </div>
              {/* Selected indicator */}
              {i === selIdx && (
                <div style={{
                  position: "absolute", top: 4, right: 5,
                  fontSize: 8, color: "#5da0ba",
                  background: "rgba(0,0,0,0.7)", padding: "1px 4px", borderRadius: 2,
                }}>
                  FOCUS
                </div>
              )}
              {/* Idle overlay */}
              {mode === "idle" && gpuOk === true && (
                <div style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#1e1e1e", fontSize: 22, userSelect: "none",
                  pointerEvents: "none",
                }}>
                  {["◈", "◉", "◎", "⊛"][i]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right: focus view + controls */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          borderLeft: "1px solid #1a1a1a",
        }}>
          {/* Focus canvas */}
          <div style={{ flex: 1, position: "relative", background: "#000" }}>
            <canvas
              ref={focusRef}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
            {gpuOk === null && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#222", fontSize: 12, letterSpacing: 2,
              }}>
                INITIALISING WEBGPU…
              </div>
            )}
            {mode === "idle" && gpuOk === true && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 12, pointerEvents: "none",
              }}>
                <div style={{ color: "#2a2a2a", fontSize: 12, letterSpacing: 2 }}>
                  PRESS ▶ DEMO OR 🎤 MIC
                </div>
                <div style={{ color: "#1e1e1e", fontSize: 10 }}>
                  click grid cell to select · ↻ evolve to breed
                </div>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div style={{
            padding: "8px 12px", borderTop: "1px solid #1a1a1a",
            display: "flex", gap: 8, alignItems: "center",
            flexShrink: 0, background: "#0d0d0d",
          }}>
            <button
              onClick={() => { void evolve(); }}
              disabled={!gpuOk || evolving}
              style={btn({
                background: evolving ? "#111" : "#0f2018",
                color: evolving ? "#333" : "#5dba7d",
                border: `1px solid ${evolving ? "#1a1a1a" : "#1e4030"}`,
              })}
            >
              {evolving ? "EVOLVING…" : "↻ EVOLVE"}
            </button>
            <button
              onClick={saveToGallery}
              disabled={variants.length === 0}
              style={btn({ background: "#1a1208", color: "#c8a050", border: "1px solid #2a2010" })}
            >
              ★ SAVE
            </button>
            <button
              onClick={openEdit}
              disabled={variants.length === 0}
              style={btn({ background: "#110f1a", color: "#8880cc", border: "1px solid #1e1a2c" })}
            >
              ✎ EDIT
            </button>
            {micError && (
              <span style={{ fontSize: 10, color: "#c8a050", marginLeft: 4 }}>{micError}</span>
            )}
          </div>

          {/* Edit panel */}
          {editMode && (
            <div style={{
              height: 220, borderTop: "1px solid #1a1a1a",
              display: "flex", flexDirection: "column", flexShrink: 0,
            }}>
              <div style={{
                padding: "4px 10px", fontSize: 10, color: "#444",
                borderBottom: "1px solid #1a1a1a", background: "#0a0a0a",
              }}>
                edit WGSL · all 8 audio uniforms available (uBass uMid uTreble uOnset uTime uBPM uResX uResY)
              </div>
              <textarea
                value={editCode}
                onChange={e => setEditCode(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                style={{
                  flex: 1, background: "#0d0d0d", color: "#b8cce8",
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Courier New', monospace",
                  fontSize: 11, lineHeight: 1.6, padding: "10px 12px",
                  border: "none", outline: "none", resize: "none",
                }}
              />
              <div style={{
                padding: "4px 10px", borderTop: "1px solid #1a1a1a",
                display: "flex", gap: 8, background: "#0a0a0a",
              }}>
                <button
                  onClick={() => { void applyEdit(); }}
                  style={btn({ background: "#091409", color: "#4da870", border: "1px solid #162816" })}
                >✓ APPLY</button>
                <button
                  onClick={() => setEditMode(false)}
                  style={btn({ background: "#111", color: "#555", border: "1px solid #1a1a1a" })}
                >✗ CANCEL</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Gallery ────────────────────────────────────────────────────── */}
      {gallery.length > 0 && (
        <div style={{
          height: 76, borderTop: "1px solid #1a1a1a",
          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
          background: "#0b0b0b", flexShrink: 0, overflow: "hidden",
        }}>
          <span style={{ fontSize: 9, color: "#333", letterSpacing: 1, marginRight: 2 }}>
            SAVED
          </span>
          {gallery.map(item => {
            const hue = Math.round((item.params.ringFreq * 7 + item.params.gridFreq * 3) % 360);
            const sat = Math.round(20 + item.params.sat * 30);
            return (
              <button
                key={item.id}
                onClick={() => { void evolveFromGallery(item); }}
                title="Breed from this saved shader"
                style={{
                  width: 58, height: "100%", flexShrink: 0,
                  background: `hsl(${hue},${sat}%,12%)`,
                  border: `1px solid hsl(${hue},${sat}%,22%)`,
                  borderRadius: 3, cursor: "pointer",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 3,
                  color: `hsl(${hue},${sat}%,55%)`, fontSize: 10,
                }}
              >
                <span style={{ fontSize: 18 }}>⬡</span>
                <span style={{ fontSize: 8, opacity: 0.7 }}>
                  {new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => {
              setGallery([]);
              try { localStorage.removeItem(GALLERY_KEY); } catch { /* noop */ }
            }}
            style={{
              ...btn({ background: "#111", color: "#2a2a2a", border: "1px solid #1a1a1a" }),
              marginLeft: "auto",
            }}
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
}
