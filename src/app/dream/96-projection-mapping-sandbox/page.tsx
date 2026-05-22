"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Audio helpers ─────────────────────────────────────────────────────────────

interface Bands { bass: number; mid: number; treble: number; onset: number }

function readBands(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>, prev: Bands): Bands {
  analyser.getFloatFrequencyData(buf);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const energy = (lo: number, hi: number) => {
    const b0 = Math.max(0, Math.floor(lo / binHz));
    const b1 = Math.min(buf.length - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let b = b0; b <= b1; b++) sum += Math.pow(10, Math.max(-120, buf[b]) / 20);
    return b1 >= b0 ? sum / (b1 - b0 + 1) : 0;
  };
  const α = 0.82;
  const bass   = prev.bass   * α + Math.min(1, energy(20, 250) * 8)     * (1 - α);
  const mid    = prev.mid    * α + Math.min(1, energy(250, 4000) * 5)    * (1 - α);
  const treble = prev.treble * α + Math.min(1, energy(4000, 20000) * 10) * (1 - α);
  const sumNow  = bass + mid + treble;
  const sumPrev = prev.bass + prev.mid + prev.treble;
  const ratio   = sumPrev > 0.05 ? sumNow / sumPrev : 0;
  const onset   = ratio > 1.6 && sumNow > 0.3 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

function demoBands(t: number, prev: Bands): Bands {
  const bass   = 0.28 + 0.22 * Math.sin(t * 0.17 * Math.PI * 2);
  const mid    = 0.20 + 0.18 * Math.sin(t * 0.11 * Math.PI * 2 + 1.1);
  const treble = 0.14 + 0.12 * Math.sin(t * 0.29 * Math.PI * 2 + 2.3);
  const beatPhase = (t % 1.33) / 1.33;
  const onset = beatPhase < 0.04 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

// ── WGSL ──────────────────────────────────────────────────────────────────────

const VERT_WGSL = `@vertex
fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),
                          vec2f(-1,1), vec2f(1,-1),vec2f(1,1));
  return vec4f(p[i], 0.0, 1.0);
}`;

// Feedback pass uniform (12 × f32 = 48 bytes):
//   [rotSpeed, zoomFactor, hueDrift, decay, bass, mid, treble, onset,
//    time, themeShift, resX, resY]
const FB_WGSL = `
struct U {
  rotSpeed: f32, zoomFactor: f32, hueDrift: f32, decay: f32,
  bass: f32, mid: f32, treble: f32, onset: f32,
  time: f32, themeShift: f32, resX: f32, resY: f32,
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

fn h2rgb(h: f32, s: f32, v: f32) -> vec3f {
  let h6 = fract(h) * 6.0;
  let fi = floor(h6); let ff = h6 - fi;
  let p0 = v*(1.0-s); let p1 = v*(1.0-s*ff); let p2 = v*(1.0-s*(1.0-ff));
  var c: vec3f;
  if      (fi < 1.0) { c = vec3f(v,p2,p0); }
  else if (fi < 2.0) { c = vec3f(p1,v,p0); }
  else if (fi < 3.0) { c = vec3f(p0,v,p2); }
  else if (fi < 4.0) { c = vec3f(p0,p1,v); }
  else if (fi < 5.0) { c = vec3f(p2,p0,v); }
  else               { c = vec3f(v,p0,p1); }
  return c;
}

fn rgb2hsv(c: vec3f) -> vec3f {
  let M = max(c.r, max(c.g, c.b));
  let m = min(c.r, min(c.g, c.b));
  let C = M - m;
  var H: f32 = 0.0;
  if (C > 0.001) {
    if      (M == c.r) { H = (c.g - c.b) / C; }
    else if (M == c.g) { H = (c.b - c.r) / C + 2.0; }
    else               { H = (c.r - c.g) / C + 4.0; }
  }
  let S = select(0.0, C / M, M > 0.001);
  return vec3f(fract(H / 6.0), S, M);
}

@fragment
fn main(@builtin(position) fpos: vec4f) -> @location(0) vec4f {
  let res   = vec2f(u.resX, u.resY);
  let uv    = fpos.xy / res;
  let center = vec2f(0.5);

  // Rotate + zoom from center
  let c2  = uv - center;
  let ang = u.rotSpeed * 0.016;
  let ca  = cos(ang); let sa = sin(ang);
  let rot = vec2f(ca*c2.x - sa*c2.y, sa*c2.x + ca*c2.y);
  let zoomed = rot / u.zoomFactor + center;

  let prev = textureSample(tex, smp, zoomed).rgb;
  let hsv  = rgb2hsv(prev);

  // Theme-aware hue drift
  let newHue = fract(hsv.x + u.hueDrift * 0.016 + u.themeShift * 0.001);
  var col = h2rgb(newHue, hsv.y, hsv.z * u.decay);

  // Audio bloom injection at center
  let d2center = length(c2);
  let bloom = exp(-d2center * 12.0) * (u.bass * 0.5 + u.onset * 0.4);
  let hBloom = fract(0.72 + u.themeShift + u.time * 0.008);
  col += h2rgb(hBloom, 0.8, 1.0) * bloom;

  // Treble shimmer at edges
  let edge = smoothstep(0.28, 0.5, d2center) * u.treble * 0.3;
  let hEdge = fract(hBloom + 0.35);
  col += h2rgb(hEdge, 0.7, 1.0) * edge;

  // Mid fill
  col = mix(col, h2rgb(fract(hBloom + 0.18), 0.6, 1.0), u.mid * 0.08);

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

// Warp+present pass uniform (12 × f32 = 48 bytes):
//   [p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, blendW, _a, _b, _c]
// Corner convention: P0=TL, P1=TR, P2=BR, P3=BL  (physical px, top-left origin)
// Q(u,v) = mix(mix(P0,P1,u), mix(P3,P2,u), v)
const WARP_WGSL = `
struct WU {
  p0x: f32, p0y: f32, p1x: f32, p1y: f32,
  p2x: f32, p2y: f32, p3x: f32, p3y: f32,
  blendW: f32, _a: f32, _b: f32, _c: f32,
}
@group(0) @binding(0) var<uniform> wu: WU;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

// Bilinear inverse mapping via Newton iterations.
// Finds (u,v) such that Q(u,v) == tgt where
//   Q(u,v) = mix(mix(p0,p1,u), mix(p3,p2,u), v)
fn blerp_inv(tgt: vec2f, p0: vec2f, p1: vec2f, p2: vec2f, p3: vec2f) -> vec2f {
  var uv = vec2f(0.5);
  for (var i = 0; i < 8; i += 1) {
    let u = uv.x; let v = uv.y;
    let q  = mix(mix(p0, p1, u), mix(p3, p2, u), v);
    let du = mix(p1 - p0, p2 - p3, v);
    let dv = mix(p3 - p0, p2 - p1, u);
    let err = tgt - q;
    let det = du.x * dv.y - du.y * dv.x;
    if (abs(det) < 0.0001) { break; }
    let delta = vec2f(
      (dv.y * err.x - dv.x * err.y) / det,
      (du.x * err.y - du.y * err.x) / det,
    );
    uv = clamp(uv + delta, vec2f(-0.1), vec2f(1.1));
  }
  return uv;
}

@fragment
fn main(@builtin(position) fpos: vec4f) -> @location(0) vec4f {
  let p0 = vec2f(wu.p0x, wu.p0y);
  let p1 = vec2f(wu.p1x, wu.p1y);
  let p2 = vec2f(wu.p2x, wu.p2y);
  let p3 = vec2f(wu.p3x, wu.p3y);

  let uv = blerp_inv(fpos.xy, p0, p1, p2, p3);

  // Outside the quad → black
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // Edge blend (vignette inside quad margins)
  let bw = wu.blendW;
  let blend =
    smoothstep(0.0, bw + 0.001, uv.x) *
    smoothstep(0.0, bw + 0.001, 1.0 - uv.x) *
    smoothstep(0.0, bw + 0.001, uv.y) *
    smoothstep(0.0, bw + 0.001, 1.0 - uv.y);

  let col = textureSample(tex, smp, uv).rgb * blend;
  return vec4f(col, 1.0);
}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Corner { x: number; y: number }   // CSS pixels

// Corner index: 0=TL 1=TR 2=BR 3=BL
const CORNER_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"] as const;
const CORNER_LABELS = ["TL", "TR", "BR", "BL"] as const;
// Fractional default positions (so we can scale to any canvas size)
const DEFAULT_FRAC: Corner[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.85 },
  { x: 0.15, y: 0.85 },
];

const THEME_SHIFT = [0.0, 0.22, 0.52] as const;
const THEME_NAMES = ["Cosmic", "Earth", "Ocean"] as const;

type AudioMode = "idle" | "demo" | "mic";

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectionMappingSandbox() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);

  // GPU
  const deviceRef       = useRef<GPUDevice | null>(null);
  const ctxRef          = useRef<GPUCanvasContext | null>(null);
  const pingRef         = useRef<GPUTexture | null>(null);
  const pongRef         = useRef<GPUTexture | null>(null);
  const fbUBufRef       = useRef<GPUBuffer | null>(null);
  const warpUBufRef     = useRef<GPUBuffer | null>(null);
  const fbPipeRef       = useRef<GPURenderPipeline | null>(null);
  const warpPipeRef     = useRef<GPURenderPipeline | null>(null);
  const samplerRef      = useRef<GPUSampler | null>(null);
  const rafRef          = useRef<number>(0);
  const dprRef          = useRef<number>(1);
  const sizeRef         = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  // Audio
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const analyserRef     = useRef<AnalyserNode | null>(null);
  const freqBufRef      = useRef<Float32Array<ArrayBuffer> | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const bandsRef        = useRef<Bands>({ bass: 0, mid: 0, treble: 0, onset: 0 });
  const startTimeRef    = useRef<number>(0);

  // Live-ref copies of state (read inside rAF without stale closures)
  const modeRef         = useRef<AudioMode>("idle");
  const cornersRef      = useRef<Corner[]>([]);
  const themeRef        = useRef<number>(0);
  const blendRef        = useRef<number>(0.06);
  const rotSpeedRef     = useRef<number>(0.18);
  const zoomRef         = useRef<number>(1.004);
  const decayRef        = useRef<number>(0.97);
  const draggingRef     = useRef<number>(-1);   // corner index being dragged, -1=none

  // UI state
  const [gpuOk, setGpuOk]           = useState<boolean | null>(null);
  const [mode, setMode]              = useState<AudioMode>("idle");
  const [calibrating, setCalibrating] = useState(false);
  const [corners, setCorners]        = useState<Corner[]>([]);
  const [theme, setTheme]            = useState(0);
  const [blend, setBlend]            = useState(0.06);
  const [rotSpeed, setRotSpeed]      = useState(0.18);
  const [zoom, setZoom]              = useState(1.004);
  const [decay, setDecay]            = useState(0.97);
  const [micError, setMicError]      = useState<string | null>(null);

  // Keep live-refs in sync with state
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { cornersRef.current = corners; }, [corners]);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { blendRef.current = blend; }, [blend]);
  useEffect(() => { rotSpeedRef.current = rotSpeed; }, [rotSpeed]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { decayRef.current = decay; }, [decay]);

  // ── GPU init ──────────────────────────────────────────────────────────────

  const initGPU = useCallback(async () => {
    if (!("gpu" in navigator)) { setGpuOk(false); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { setGpuOk(false); return; }
    const device = await adapter.requestDevice();
    deviceRef.current = device;

    const gpuCtx = canvas.getContext("webgpu") as GPUCanvasContext;
    ctxRef.current = gpuCtx;
    const fmt = navigator.gpu.getPreferredCanvasFormat();
    gpuCtx.configure({ device, format: fmt, alphaMode: "opaque" });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    dprRef.current = dpr;
    const w = Math.floor(canvas.offsetWidth * dpr);
    const h = Math.floor(canvas.offsetHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    sizeRef.current = { w, h };

    // Ping-pong textures
    const mkTex = () => device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    pingRef.current = mkTex();
    pongRef.current = mkTex();

    // Uniform buffers (48 bytes each)
    const mkUBuf = () => device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    fbUBufRef.current   = mkUBuf();
    warpUBufRef.current = mkUBuf();

    // Sampler (clamp-to-edge, linear)
    samplerRef.current = device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });

    // Shader modules
    const vertMod = device.createShaderModule({ code: VERT_WGSL });
    const fbMod   = device.createShaderModule({ code: FB_WGSL   });
    const warpMod = device.createShaderModule({ code: WARP_WGSL });

    const mkLayout = (uBuf: GPUBuffer, tex: GPUTexture) =>
      device.createBindGroup({
        layout: device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          ],
        }),
        entries: [
          { binding: 0, resource: { buffer: uBuf } },
          { binding: 1, resource: samplerRef.current! },
          { binding: 2, resource: tex.createView() },
        ],
      });

    // Feedback pipeline
    const fbBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    fbPipeRef.current = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [fbBGL] }),
      vertex:   { module: vertMod, entryPoint: "main" },
      fragment: { module: fbMod,   entryPoint: "main", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-list" },
    });

    // Warp pipeline
    const warpBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    warpPipeRef.current = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [warpBGL] }),
      vertex:   { module: vertMod,  entryPoint: "main" },
      fragment: { module: warpMod,  entryPoint: "main", targets: [{ format: fmt }] },
      primitive: { topology: "triangle-list" },
    });

    void mkLayout; // unused — BGs are built per-frame (texture refs change per swap)

    // Default corners in CSS px
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const initCorners = DEFAULT_FRAC.map(f => ({ x: f.x * cw, y: f.y * ch }));
    setCorners(initCorners);
    cornersRef.current = initCorners;

    setGpuOk(true);
  }, []);

  useEffect(() => {
    void initGPU();
  }, [initGPU]);

  // ── Render loop ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!gpuOk) return;
    const gone = { v: false };
    startTimeRef.current = performance.now();

    const loop = () => {
      if (gone.v) return;
      const device = deviceRef.current;
      const gpuCtx = ctxRef.current;
      const ping   = pingRef.current;
      const pong   = pongRef.current;
      const fbPipe = fbPipeRef.current;
      const warpPipe = warpPipeRef.current;
      const fbUBuf   = fbUBufRef.current;
      const warpUBuf = warpUBufRef.current;
      const smp      = samplerRef.current;
      if (!device || !gpuCtx || !ping || !pong || !fbPipe || !warpPipe || !fbUBuf || !warpUBuf || !smp) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const t      = (performance.now() - startTimeRef.current) / 1000;
      const md     = modeRef.current;
      let bands    = bandsRef.current;

      if (md === "demo") {
        bands = demoBands(t, bands);
        bandsRef.current = bands;
      } else if (md === "mic" && analyserRef.current && freqBufRef.current) {
        bands = readBands(analyserRef.current, freqBufRef.current, bands);
        bandsRef.current = bands;
      } else {
        bands = { bass: 0.05, mid: 0.04, treble: 0.03, onset: 0 };
      }

      const { w, h } = sizeRef.current;
      const dpr      = dprRef.current;
      const crnrs    = cornersRef.current;
      const themeIdx = themeRef.current;
      const thShift  = THEME_SHIFT[themeIdx];

      // Write feedback uniform
      const fbData = new Float32Array([
        rotSpeedRef.current, zoomRef.current, 1.0, decayRef.current,
        bands.bass, bands.mid, bands.treble, bands.onset,
        t, thShift, w, h,
      ]);
      device.queue.writeBuffer(fbUBuf, 0, fbData.buffer, 0, 48);

      // Write warp uniform (CSS corners → physical pixels)
      const [p0, p1, p2, p3] = crnrs.length === 4 ? crnrs : DEFAULT_FRAC.map(f => ({ x: f.x * (w / dpr), y: f.y * (h / dpr) }));
      const warpData = new Float32Array([
        p0.x * dpr, p0.y * dpr,
        p1.x * dpr, p1.y * dpr,
        p2.x * dpr, p2.y * dpr,
        p3.x * dpr, p3.y * dpr,
        blendRef.current, 0, 0, 0,
      ]);
      device.queue.writeBuffer(warpUBuf, 0, warpData.buffer, 0, 48);

      // Bind groups (rebuilt each frame because ping/pong swap)
      const fbBGL = fbPipe.getBindGroupLayout(0);
      const fbBG  = device.createBindGroup({
        layout: fbBGL,
        entries: [
          { binding: 0, resource: { buffer: fbUBuf } },
          { binding: 1, resource: smp },
          { binding: 2, resource: ping.createView() },
        ],
      });

      const warpBGL = warpPipe.getBindGroupLayout(0);
      const warpBG  = device.createBindGroup({
        layout: warpBGL,
        entries: [
          { binding: 0, resource: { buffer: warpUBuf } },
          { binding: 1, resource: smp },
          { binding: 2, resource: pong.createView() },
        ],
      });

      const enc = device.createCommandEncoder();

      // Pass 1: feedback ping → pong
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: pong.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          }],
        });
        pass.setPipeline(fbPipe);
        pass.setBindGroup(0, fbBG);
        pass.draw(6);
        pass.end();
      }

      // Pass 2: warp pong → canvas
      {
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: gpuCtx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          }],
        });
        pass.setPipeline(warpPipe);
        pass.setBindGroup(0, warpBG);
        pass.draw(6);
        pass.end();
      }

      device.queue.submit([enc.finish()]);

      // Swap ping/pong
      const tmp = pingRef.current!;
      pingRef.current = pongRef.current!;
      pongRef.current = tmp;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      gone.v = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [gpuOk]);

  // ── Audio ─────────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctx();
      audioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an  = ac.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.4;
      src.connect(an);
      analyserRef.current = an;
      freqBufRef.current  = new Float32Array(new ArrayBuffer(an.frequencyBinCount * 4));
      setMode("mic");
      modeRef.current = "mic";
      setMicError(null);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Mic unavailable");
    }
  }, []);

  const stopAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    freqBufRef.current  = null;
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── Corner dragging ───────────────────────────────────────────────────────

  const onCornerPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = idx;
  }, []);

  const onCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    const idx = draggingRef.current;
    if (idx < 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width,  e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    setCorners(prev => {
      const next = [...prev];
      next[idx] = { x, y };
      cornersRef.current = next;
      return next;
    });
  }, []);

  const onCanvasPointerUp = useCallback(() => {
    draggingRef.current = -1;
  }, []);

  // ── Reset corners ─────────────────────────────────────────────────────────

  const resetCorners = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    const next = DEFAULT_FRAC.map(f => ({ x: f.x * cw, y: f.y * ch }));
    setCorners(next);
    cornersRef.current = next;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (gpuOk === false) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-white/75 text-lg">WebGPU not available in this browser.</p>
        <p className="text-white/55 text-sm">Try Chrome 113+ or Edge 113+ on desktop.</p>
        <Link href="/dream" className="text-white/55 text-sm underline mt-4">← back to dream</Link>
      </div>
    );
  }

  const canvasW = containerRef.current?.offsetWidth  ?? 0;
  const canvasH = containerRef.current?.offsetHeight ?? 0;

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/10">
        <Link href="/dream" className="text-white/55 text-sm hover:text-white/80 transition-colors">
          ← dream
        </Link>
        <span className="text-white/95 text-sm font-medium">96 · Projection Mapping Sandbox</span>

        <div className="flex gap-1 ml-auto">
          {THEME_NAMES.map((name, i) => (
            <button
              key={name}
              onClick={() => setTheme(i)}
              className={`px-3 py-1 rounded text-xs transition-colors ${
                theme === i ? "bg-white/20 text-white/95" : "text-white/55 hover:text-white/80"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <button
          onClick={() => setCalibrating(c => !c)}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            calibrating ? "bg-violet-500/40 text-violet-200" : "text-white/55 hover:text-white/80"
          }`}
        >
          {calibrating ? "● Calibrating" : "Calibrate"}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="relative flex-1"
          onPointerMove={calibrating ? onCanvasPointerMove : undefined}
          onPointerUp={calibrating ? onCanvasPointerUp : undefined}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ touchAction: "none" }}
          />

          {/* Calibration overlay */}
          {calibrating && corners.length === 4 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ overflow: "visible" }}
            >
              {/* Quad outline */}
              <polygon
                points={corners.map(c => `${c.x},${c.y}`).join(" ")}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              {/* Centre cross */}
              {(() => {
                const cx = corners.reduce((s, c) => s + c.x, 0) / 4;
                const cy = corners.reduce((s, c) => s + c.y, 0) / 4;
                return (
                  <>
                    <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                    <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  </>
                );
              })()}
            </svg>
          )}

          {/* Corner handles */}
          {calibrating && corners.map((c, i) => (
            <div
              key={i}
              onPointerDown={e => onCornerPointerDown(e, i)}
              style={{
                position: "absolute",
                left: c.x,
                top: c.y,
                transform: "translate(-50%,-50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: CORNER_COLORS[i],
                border: "2px solid rgba(255,255,255,0.9)",
                cursor: "grab",
                touchAction: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                userSelect: "none",
                boxShadow: "0 0 8px rgba(0,0,0,0.6)",
              }}
            >
              <span style={{ color: "#fff", fontSize: 9, fontWeight: 700, lineHeight: 1 }}>
                {CORNER_LABELS[i]}
              </span>
            </div>
          ))}

          {/* GPU loading */}
          {gpuOk === null && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/40 text-sm">Initialising WebGPU…</span>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-56 border-l border-white/10 flex flex-col gap-5 p-4 overflow-y-auto shrink-0">
          {/* Audio */}
          <div className="flex flex-col gap-2">
            <p className="text-white/55 text-xs uppercase tracking-wider">Audio</p>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => { setMode("demo"); modeRef.current = "demo"; stopAudio(); }}
                className={`w-full py-1.5 rounded text-xs transition-colors ${
                  mode === "demo" ? "bg-white/20 text-white/95" : "text-white/55 hover:text-white/80"
                }`}
              >
                Demo
              </button>
              <button
                onClick={async () => {
                  if (mode === "mic") {
                    stopAudio(); setMode("idle"); modeRef.current = "idle";
                  } else {
                    await startMic();
                  }
                }}
                className={`w-full py-1.5 rounded text-xs transition-colors ${
                  mode === "mic" ? "bg-emerald-500/30 text-emerald-300" : "text-white/55 hover:text-white/80"
                }`}
              >
                {mode === "mic" ? "● Mic On" : "Mic Input"}
              </button>
            </div>
            {micError && <p className="text-red-400/80 text-xs">{micError}</p>}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <p className="text-white/55 text-xs uppercase tracking-wider">Feedback</p>

            <label className="flex flex-col gap-1">
              <span className="text-white/75 text-xs">Rotation <span className="text-white/40">{rotSpeed.toFixed(2)}</span></span>
              <input type="range" min={-1} max={1} step={0.01} value={rotSpeed}
                onChange={e => setRotSpeed(parseFloat(e.target.value))}
                className="w-full accent-violet-400" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-white/75 text-xs">Zoom <span className="text-white/40">{zoom.toFixed(4)}</span></span>
              <input type="range" min={0.990} max={1.020} step={0.0005} value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className="w-full accent-violet-400" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-white/75 text-xs">Decay <span className="text-white/40">{decay.toFixed(3)}</span></span>
              <input type="range" min={0.90} max={0.999} step={0.001} value={decay}
                onChange={e => setDecay(parseFloat(e.target.value))}
                className="w-full accent-violet-400" />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-white/55 text-xs uppercase tracking-wider">Warp</p>

            <label className="flex flex-col gap-1">
              <span className="text-white/75 text-xs">Edge blend <span className="text-white/40">{(blend * 100).toFixed(0)}%</span></span>
              <input type="range" min={0} max={0.25} step={0.005} value={blend}
                onChange={e => setBlend(parseFloat(e.target.value))}
                className="w-full accent-cyan-400" />
            </label>

            <button
              onClick={resetCorners}
              className="w-full py-1.5 rounded text-xs text-white/55 hover:text-white/80 transition-colors border border-white/10"
            >
              Reset corners
            </button>
          </div>

          {/* About */}
          <div className="mt-auto pt-3 border-t border-white/10">
            <p className="text-white/40 text-xs leading-relaxed">
              Drag the{" "}
              <span style={{ color: CORNER_COLORS[0] }}>TL</span>,{" "}
              <span style={{ color: CORNER_COLORS[1] }}>TR</span>,{" "}
              <span style={{ color: CORNER_COLORS[2] }}>BR</span>,{" "}
              <span style={{ color: CORNER_COLORS[3] }}>BL</span>{" "}
              handles to match a real-world projection surface. The journey shader fills the quad using bilinear inverse mapping on the GPU.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
