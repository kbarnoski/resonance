"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Audio ─────────────────────────────────────────────────────────────────────

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
  const bass   = prev.bass   * α + Math.min(1, energy(20, 250) * 8)    * (1 - α);
  const mid    = prev.mid    * α + Math.min(1, energy(250, 4000) * 5)   * (1 - α);
  const treble = prev.treble * α + Math.min(1, energy(4000, 20000) * 10) * (1 - α);
  const sumNow  = bass + mid + treble;
  const sumPrev = prev.bass + prev.mid + prev.treble;
  const ratio   = sumPrev > 0.05 ? sumNow / sumPrev : 0;
  const onset   = ratio > 1.6 && sumNow > 0.3 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

function demoBands(t: number, prev: Bands): Bands {
  const bass   = 0.25 + 0.22 * Math.sin(t * 0.17 * Math.PI * 2);
  const mid    = 0.20 + 0.18 * Math.sin(t * 0.11 * Math.PI * 2 + 1.1);
  const treble = 0.15 + 0.12 * Math.sin(t * 0.29 * Math.PI * 2 + 2.3);
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

// Feedback pass: reads from previous texture, applies TD-style transform, adds audio bloom.
// Uniform layout (12 × f32 = 48 bytes, 16-byte aligned):
//   [rotSpeed, zoomFactor, hueDrift, decay, bass, mid, treble, onset, time, _pad, resX, resY]
const FB_WGSL = `
struct U {
  rotSpeed: f32, zoomFactor: f32, hueDrift: f32, decay: f32,
  bass: f32, mid: f32, treble: f32, onset: f32,
  time: f32, _pad: f32, resX: f32, resY: f32,
}
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

fn h2rgb(h: f32, s: f32, v: f32) -> vec3f {
  let h6 = fract(h) * 6.0; let fi = floor(h6); let ff = h6 - fi;
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

fn rgbToHsv(c: vec3f) -> vec3f {
  let M = max(c.r, max(c.g, c.b));
  let m = min(c.r, min(c.g, c.b));
  let C = M - m;
  var H: f32 = 0.0;
  if (C > 0.001) {
    if (M == c.r)      { H = (c.g - c.b) / C; }
    else if (M == c.g) { H = (c.b - c.r) / C + 2.0; }
    else               { H = (c.r - c.g) / C + 4.0; }
    H = fract(H / 6.0);
  }
  let S = C / max(M, 0.001);
  return vec3f(H, select(0.0, S, M > 0.001), M);
}

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let res = vec2f(u.resX, u.resY);
  let uv  = pos.xy / res;
  let ctr = vec2f(0.5);

  // TD-style feedback transform: zoom toward center, then rotate
  var d = (uv - ctr) / u.zoomFactor;
  let ca = cos(u.rotSpeed); let sa = sin(u.rotSpeed);
  d = vec2f(d.x*ca - d.y*sa, d.x*sa + d.y*ca);
  let sUV = clamp(d + ctr, vec2f(0.001), vec2f(0.999));

  // Sample previous frame, decay, hue-shift
  var c = textureSample(tex, smp, sUV).rgb * u.decay;
  let hsv = rgbToHsv(c);
  c = h2rgb(fract(hsv.x + u.hueDrift), hsv.y, hsv.z);

  // Audio injection: layered radial bloom (same band→color mapping as 1-live)
  let r = length(uv - ctr) * 2.0;
  // Bass — violet center
  c += h2rgb(fract(0.72 + u.time * 0.008), 0.95, u.bass * 0.35 * max(0.0, 1.0 - r * 3.0));
  // Mid — cyan ring
  c += h2rgb(fract(0.50 + u.time * 0.012), 0.85, u.mid  * 0.22 * max(0.0, 1.0 - abs(r - 0.38) * 9.0));
  // Treble — orange halo
  c += h2rgb(fract(0.08 + u.time * 0.018), 0.80, u.treble * 0.16 * max(0.0, 1.0 - abs(r - 0.62) * 6.0));
  // Onset flash
  let fl = u.onset * 0.55 * max(0.0, 1.0 - r * 1.8);
  c += vec3f(fl * 0.9, fl * 0.55, fl * 0.1);

  return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

// Present pass: blit the feedback texture to the canvas swapchain.
const PR_WGSL = `
struct R { resX: f32, resY: f32, _a: f32, _b: f32 }
@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var t: texture_2d<f32>;
@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return textureSample(t, s, pos.xy / vec2f(r.resX, r.resY));
}`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function TDFeedback() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // GPU objects
  const deviceRef   = useRef<GPUDevice | null>(null);
  const ctxRef      = useRef<GPUCanvasContext | null>(null);
  const pingRef     = useRef<GPUTexture | null>(null);
  const pongRef     = useRef<GPUTexture | null>(null);
  const fbPipeRef   = useRef<GPURenderPipeline | null>(null);
  const prPipeRef   = useRef<GPURenderPipeline | null>(null);
  const fbBGLRef    = useRef<GPUBindGroupLayout | null>(null);
  const prBGLRef    = useRef<GPUBindGroupLayout | null>(null);
  const fbUniformRef = useRef<GPUBuffer | null>(null);
  const prUniformRef = useRef<GPUBuffer | null>(null);
  const samplerRef  = useRef<GPUSampler | null>(null);
  const fmtRef      = useRef<GPUTextureFormat>("bgra8unorm");

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fftBufRef   = useRef<Float32Array<ArrayBuffer> | null>(null);
  const bandsRef    = useRef<Bands>({ bass: 0, mid: 0, treble: 0, onset: 0 });
  const startRef    = useRef(Date.now());
  const animRef     = useRef(0);

  // UI state
  const [mode, setMode]         = useState<"idle" | "demo" | "mic">("idle");
  const [gpuOk, setGpuOk]       = useState<boolean | null>(null);
  const [rotSpeed, setRotSpeed]  = useState(0.004);
  const [zoom, setZoom]          = useState(1.004);
  const [hueDrift, setHueDrift]  = useState(0.0015);
  const [decay, setDecay]        = useState(0.972);
  const [micError, setMicError]  = useState<string | null>(null);

  // Live-refs avoid stale closures in the render loop
  const rotRef   = useRef(0.004);
  const zoomRef  = useRef(1.004);
  const hueRef   = useRef(0.0015);
  const decayRef = useRef(0.972);
  useEffect(() => { rotRef.current   = rotSpeed;  }, [rotSpeed]);
  useEffect(() => { zoomRef.current  = zoom;      }, [zoom]);
  useEffect(() => { hueRef.current   = hueDrift;  }, [hueDrift]);
  useEffect(() => { decayRef.current = decay;     }, [decay]);

  // ── GPU init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("gpu" in navigator)) { setGpuOk(false); return; }
    let gone = false;

    (async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (gone || !adapter) { setGpuOk(false); return; }
        const device = await adapter.requestDevice();
        if (gone) { device.destroy(); return; }

        const cv  = canvasRef.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width  = Math.round(cv.clientWidth  * dpr);
        cv.height = Math.round(cv.clientHeight * dpr);
        const W = cv.width, H = cv.height;

        const format = navigator.gpu.getPreferredCanvasFormat();
        const ctx    = cv.getContext("webgpu") as GPUCanvasContext;
        ctx.configure({ device, format, alphaMode: "opaque" });

        deviceRef.current = device;
        ctxRef.current    = ctx;
        fmtRef.current    = format;

        samplerRef.current = device.createSampler({
          minFilter: "linear", magFilter: "linear",
          addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge",
        });

        // Ping-pong textures (same format, RENDER_ATTACHMENT + TEXTURE_BINDING)
        const texDesc: GPUTextureDescriptor = {
          size: [W, H], format: "rgba8unorm",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        };
        pingRef.current = device.createTexture(texDesc);
        pongRef.current = device.createTexture(texDesc);

        // Uniform buffers
        fbUniformRef.current = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        prUniformRef.current = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

        const vert = device.createShaderModule({ code: VERT_WGSL });

        // Feedback pipeline
        const fbBGL = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          ],
        });
        fbBGLRef.current = fbBGL;
        fbPipeRef.current = await device.createRenderPipelineAsync({
          layout: device.createPipelineLayout({ bindGroupLayouts: [fbBGL] }),
          vertex:   { module: vert, entryPoint: "main" },
          fragment: { module: device.createShaderModule({ code: FB_WGSL }), entryPoint: "main", targets: [{ format: "rgba8unorm" }] },
          primitive: { topology: "triangle-list" },
        });

        // Present pipeline
        const prBGL = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          ],
        });
        prBGLRef.current = prBGL;
        prPipeRef.current = await device.createRenderPipelineAsync({
          layout: device.createPipelineLayout({ bindGroupLayouts: [prBGL] }),
          vertex:   { module: vert, entryPoint: "main" },
          fragment: { module: device.createShaderModule({ code: PR_WGSL }), entryPoint: "main", targets: [{ format }] },
          primitive: { topology: "triangle-list" },
        });

        if (!gone) setGpuOk(true);
      } catch {
        if (!gone) setGpuOk(false);
      }
    })();

    return () => {
      gone = true;
      pingRef.current?.destroy();
      pongRef.current?.destroy();
      fbUniformRef.current?.destroy();
      prUniformRef.current?.destroy();
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, []);

  // ── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const render = () => {
      const device    = deviceRef.current;
      const ctx       = ctxRef.current;
      const ping      = pingRef.current;
      const pong      = pongRef.current;
      const fbPipe    = fbPipeRef.current;
      const prPipe    = prPipeRef.current;
      const fbBGL     = fbBGLRef.current;
      const prBGL     = prBGLRef.current;
      const fbUniform = fbUniformRef.current;
      const prUniform = prUniformRef.current;
      const sampler   = samplerRef.current;

      if (!device || !ctx || !ping || !pong || !fbPipe || !prPipe ||
          !fbBGL || !prBGL || !fbUniform || !prUniform || !sampler) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const elapsed = (Date.now() - startRef.current) / 1000;
      let bands = bandsRef.current;
      if (mode === "demo") {
        bands = demoBands(elapsed, bands);
      } else if (analyserRef.current && fftBufRef.current) {
        bands = readBands(analyserRef.current, fftBufRef.current, bands);
      }
      bandsRef.current = bands;

      const cv = canvasRef.current!;
      const W = cv.width, H = cv.height;

      // Audio modulates controls additively
      const rot  = rotRef.current   + bands.bass   * 0.009;
      const zm   = zoomRef.current  + bands.mid    * 0.004;
      const hue  = hueRef.current   + bands.treble * 0.003;
      const dec  = decayRef.current;

      device.queue.writeBuffer(fbUniform, 0, new Float32Array([
        rot, zm, hue, dec,
        bands.bass, bands.mid, bands.treble, bands.onset,
        elapsed, 0, W, H,
      ]));
      device.queue.writeBuffer(prUniform, 0, new Float32Array([W, H, 0, 0]));

      const enc = device.createCommandEncoder();

      // Pass 1 — feedback: read ping → write pong
      {
        const bg = device.createBindGroup({
          layout: fbBGL,
          entries: [
            { binding: 0, resource: { buffer: fbUniform } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: ping.createView() },
          ],
        });
        const pass = enc.beginRenderPass({
          colorAttachments: [{ view: pong.createView(), loadOp: "load", storeOp: "store" }],
        });
        pass.setPipeline(fbPipe);
        pass.setBindGroup(0, bg);
        pass.draw(6);
        pass.end();
      }

      // Pass 2 — present: blit pong → canvas
      {
        const bg = device.createBindGroup({
          layout: prBGL,
          entries: [
            { binding: 0, resource: { buffer: prUniform } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: pong.createView() },
          ],
        });
        const pass = enc.beginRenderPass({
          colorAttachments: [{
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store",
          }],
        });
        pass.setPipeline(prPipe);
        pass.setBindGroup(0, bg);
        pass.draw(6);
        pass.end();
      }

      device.queue.submit([enc.finish()]);

      // Swap ping ↔ pong for next frame
      const tmp  = pingRef.current;
      pingRef.current = pongRef.current;
      pongRef.current = tmp;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    startRef.current = Date.now();
    bandsRef.current = { bass: 0, mid: 0, treble: 0, onset: 0 };
    setMode("demo");
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const src      = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser);
      fftBufRef.current   = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      startRef.current    = Date.now();
      bandsRef.current    = { bass: 0, mid: 0, treble: 0, onset: 0 };
      setMicError(null);
      setMode("mic");
    } catch {
      setMicError("Mic denied — using demo mode");
      startDemo();
    }
  }, [startDemo]);

  const resetFeedback = useCallback(() => {
    const device = deviceRef.current;
    const cv     = canvasRef.current;
    if (!device || !cv) return;
    const W = cv.width, H = cv.height;
    pingRef.current?.destroy();
    pongRef.current?.destroy();
    const desc: GPUTextureDescriptor = {
      size: [W, H], format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    };
    pingRef.current = device.createTexture(desc);
    pongRef.current = device.createTexture(desc);
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(animRef.current);
    audioCtxRef.current?.close();
  }, []);

  // ── Fallback ─────────────────────────────────────────────────────────────────
  if (gpuOk === false) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0a0a0a", color:"#e8e8e8", fontFamily:"monospace", gap:12 }}>
        <div style={{ color:"#f87", fontSize:13 }}>WebGPU unavailable in this browser.</div>
        <div style={{ color:"#555", fontSize:11 }}>Try Chrome 113+, Edge 113+, Firefox 121+, or Safari 18+.</div>
        <Link href="/dream" style={{ color:"#6af", fontSize:11 }}>← back to dream</Link>
      </div>
    );
  }

  // Helper — slider row
  function sliderRow(
    label: string, val: number, min: number, max: number, step: number,
    set: (v: number) => void, fmt: (v: number) => string,
  ) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:9, color:"#555", width:76, textAlign:"right", letterSpacing:0.5 }}>{label}</span>
        <input type="range" min={min} max={max} step={step} value={val}
          onChange={e => set(Number(e.target.value))}
          style={{ flex:1, accentColor:"#7a8fcf" }} />
        <span style={{ fontSize:9, color:"#666", width:44, textAlign:"left" }}>{fmt(val)}</span>
      </div>
    );
  }

  const btn = (col: string, bg: string, border: string) => ({
    background: bg, color: col, border: `1px solid ${border}`,
    borderRadius: 3, fontSize: 11, cursor: "pointer",
    padding: "3px 11px", letterSpacing: 1,
  } as React.CSSProperties);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:"#0a0a0a", color:"#e8e8e8", fontFamily:"monospace", overflow:"hidden" }}>

      {/* Header */}
      <div style={{ padding:"9px 16px", borderBottom:"1px solid #1e1e1e", display:"flex", alignItems:"center", gap:14, flexShrink:0, background:"#0c0c0c" }}>
        <span style={{ fontSize:13, fontWeight:700, letterSpacing:1 }}>TD FEEDBACK</span>
        <span style={{ fontSize:11, color:"#444" }}>TouchDesigner TOP feedback loop in WebGPU</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          {mode === "idle" && <>
            <button onClick={startDemo} style={btn("#5dba7d","#0f2018","#1e4030")}>▶ DEMO</button>
            <button onClick={() => { void startMic(); }} style={btn("#5da0ba","#0f1a28","#1e3040")}>🎤 MIC</button>
          </>}
          {mode !== "idle" && <>
            <span style={{ fontSize:11, color: mode === "mic" ? "#5da0ba" : "#5dba7d", letterSpacing:1 }}>
              {mode === "mic" ? "🎤 LIVE" : "▶ DEMO"}
            </span>
            <button onClick={resetFeedback} style={btn("#a878c8","#1a1120","#2e1d3e")}>↺ RESET</button>
          </>}
          <Link href="/dream" style={{ fontSize:11, color:"#444" }}>← dream</Link>
        </div>
      </div>

      {/* Main: canvas + sidebar */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* Canvas */}
        <div style={{ flex:1, position:"relative", background:"#000" }}>
          <canvas ref={canvasRef} style={{ width:"100%", height:"100%", display:"block" }} />
          {gpuOk === null && (
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#1e1e1e", fontSize:12, letterSpacing:2 }}>
              INITIALISING WEBGPU…
            </div>
          )}
          {mode === "idle" && gpuOk === true && (
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, pointerEvents:"none" }}>
              <div style={{ color:"#2a2a2a", fontSize:12, letterSpacing:2 }}>PRESS ▶ DEMO OR 🎤 MIC</div>
              <div style={{ color:"#1e1e1e", fontSize:10 }}>texture self-feeds — each frame becomes the next frame</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width:230, flexShrink:0, borderLeft:"1px solid #181818", background:"#0b0b0b", display:"flex", flexDirection:"column", padding:"16px 14px", gap:16, overflowY:"auto" }}>
          <div style={{ fontSize:9, color:"#333", letterSpacing:1 }}>TRANSFORM</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {sliderRow("ROTATION", rotSpeed, -0.015, 0.015, 0.0001, setRotSpeed, v => (v*1000).toFixed(1)+"‰")}
            {sliderRow("ZOOM", zoom, 0.992, 1.012, 0.0001, setZoom, v => v.toFixed(4)+"×")}
            {sliderRow("HUE DRIFT", hueDrift, 0, 0.008, 0.0001, setHueDrift, v => (v*1000).toFixed(1)+"‰")}
            {sliderRow("DECAY", decay, 0.920, 0.998, 0.001, setDecay, v => (v*100).toFixed(1)+"%")}
          </div>

          <div style={{ borderTop:"1px solid #181818", paddingTop:12 }}>
            <div style={{ fontSize:9, color:"#333", letterSpacing:1, marginBottom:8 }}>AUDIO → TRANSFORM</div>
            <div style={{ fontSize:9, color:"#2e2e2e", lineHeight:1.9 }}>
              bass → +rotation<br/>
              mid → +zoom<br/>
              treble → +hue drift<br/>
              onset → white flash
            </div>
          </div>

          <div style={{ borderTop:"1px solid #181818", paddingTop:12 }}>
            <div style={{ fontSize:9, color:"#333", letterSpacing:1, marginBottom:8 }}>HOW IT WORKS</div>
            <div style={{ fontSize:9, color:"#2a2a2a", lineHeight:1.9 }}>
              Two GPU textures (ping ↔ pong). Each frame: sample the previous frame&apos;s texture at a slightly rotated + zoomed UV, shift the hue, decay brightness, then composite a new audio bloom layer. The result feeds itself forever — infinite visual evolution from a single audio signal.<br/><br/>
              Ported from TouchDesigner&apos;s TOP feedback loop pattern by Bileam Tschepe / Elekktronaut. Zero deps · Zero API · WebGPU required.
            </div>
          </div>

          {micError && (
            <div style={{ fontSize:9, color:"#c8a050", marginTop:4 }}>{micError}</div>
          )}

          <div style={{ marginTop:"auto", paddingTop:8, borderTop:"1px solid #141414" }}>
            <Link href="/dream/74-touchdesigner-feedback/README.md" style={{ fontSize:9, color:"#2a2a2a" }}>
              design notes ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
