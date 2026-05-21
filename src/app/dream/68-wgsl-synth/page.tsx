"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Vertex shader — fullscreen quad, never edited ─────────────────────────────

const VERT_WGSL = `@vertex
fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0));
  return vec4f(p[i], 0.0, 1.0);
}`;

// ── Default fragment shader (user-editable) ───────────────────────────────────

const DEFAULT_FRAG = `// Audio uniforms — updated every frame from mic or demo oscillators.
// Edit the @fragment function below. Recompiles 400ms after each keystroke.
//
//  a.uBass   : f32  — bass energy  20-250 Hz  (0.0 – 1.0)
//  a.uMid    : f32  — mid energy  250-4kHz    (0.0 – 1.0)
//  a.uTreble : f32  — treble energy 4k-20kHz  (0.0 – 1.0)
//  a.uOnset  : f32  — beat strength (1=hit, decays to 0)
//  a.uTime   : f32  — elapsed seconds
//  a.uBPM    : f32  — tempo estimate
//  a.uResX   : f32  — canvas width  in pixels
//  a.uResY   : f32  — canvas height in pixels

struct Audio {
  uBass: f32, uMid: f32, uTreble: f32, uOnset: f32,
  uTime: f32, uBPM: f32, uResX: f32, uResY: f32,
}
@group(0) @binding(0) var<uniform> a: Audio;

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = (pos.xy - vec2f(a.uResX, a.uResY) * 0.5) / a.uResY;
  let r  = length(uv);
  let t  = a.uTime;

  // Rings that expand outward as bass energy rises
  let ring = sin(r * 18.0 - t * 1.5 - a.uBass * 5.0) * 0.5 + 0.5;

  // Orthogonal grid lines that shimmer with mid / treble
  let gx = abs(sin(uv.x * 26.0 + a.uMid    * 4.0)) * 0.35;
  let gy = abs(sin(uv.y * 26.0 + a.uTreble  * 4.0)) * 0.35;

  // Brightness: rings + grid + onset flash
  var bright = ring * (0.35 + a.uBass * 0.65) + max(gx, gy) * 0.5 + a.uOnset * 0.7;
  bright = clamp(bright, 0.0, 1.0);

  // Hue drifts slowly, pushed by mid and treble
  let hue = fract(a.uMid * 0.5 + a.uTreble * 0.3 + t * 0.03);
  let h6  = hue * 6.0;
  let fi  = floor(h6);
  let ff  = h6 - fi;
  let s   = 0.9;
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

  // Vignette: dim toward edges
  col *= 1.0 - r * r * 0.8;
  return vec4f(col, 1.0);
}`;

// ── WebGPU state held in a ref ────────────────────────────────────────────────

interface GpuState {
  device: GPUDevice;
  canvasCtx: GPUCanvasContext;
  format: GPUTextureFormat;
  uniformBuf: GPUBuffer;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;
  vertMod: GPUShaderModule;
  pipeline: GPURenderPipeline | null;
}

// ── Audio band data ───────────────────────────────────────────────────────────

interface Bands { bass: number; mid: number; treble: number; onset: number }

// ── Band extraction from live FFT ─────────────────────────────────────────────

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
  const a = 0.82;
  const bass   = prev.bass   * a + raw.bass   * (1 - a);
  const mid    = prev.mid    * a + raw.mid    * (1 - a);
  const treble = prev.treble * a + raw.treble * (1 - a);
  const sumNow  = raw.bass + raw.mid + raw.treble;
  const sumPrev = prev.bass + prev.mid + prev.treble;
  const ratio   = sumPrev > 0.05 ? sumNow / sumPrev : 0;
  const onset   = ratio > 1.6 && sumNow > 0.3 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

// ── Demo LFO bands ────────────────────────────────────────────────────────────

function demoBands(t: number, prev: Bands): Bands {
  const bass   = 0.3 + 0.28 * Math.sin(t * 0.17 * Math.PI * 2);
  const mid    = 0.3 + 0.22 * Math.sin(t * 0.11 * Math.PI * 2 + 1.1);
  const treble = 0.2 + 0.18 * Math.sin(t * 0.29 * Math.PI * 2 + 2.3);
  const beatPhase = (t % 0.75) / 0.75; // ~80 BPM
  const onset = beatPhase < 0.04 ? 1.0 : prev.onset * 0.87;
  return { bass, mid, treble, onset };
}

// ── Pipeline builder (module-level — no React hooks) ─────────────────────────

async function compilePipeline(
  g: GpuState,
  fragCode: string,
): Promise<{ pipeline: GPURenderPipeline | null; error: string | null }> {
  try {
    const fragMod = g.device.createShaderModule({ code: fragCode });
    const info = await fragMod.getCompilationInfo();
    const errs = info.messages.filter(m => m.type === "error");
    if (errs.length > 0) {
      return {
        pipeline: null,
        error: errs.map(e => `Line ${e.lineNum}: ${e.message}`).join("\n"),
      };
    }
    const layout = g.device.createPipelineLayout({
      bindGroupLayouts: [g.bindGroupLayout],
    });
    const pipeline = await g.device.createRenderPipelineAsync({
      layout,
      vertex: { module: g.vertMod, entryPoint: "main" },
      fragment: {
        module: fragMod,
        entryPoint: "main",
        targets: [{ format: g.format }],
      },
      primitive: { topology: "triangle-list" },
    });
    return { pipeline, error: null };
  } catch (e) {
    return { pipeline: null, error: String(e) };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WgslSynth() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const gpuRef      = useRef<GpuState | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fftBufRef   = useRef<Float32Array<ArrayBuffer> | null>(null);
  const bandsRef    = useRef<Bands>({ bass: 0, mid: 0, treble: 0, onset: 0 });
  const animRef     = useRef(0);
  const startRef    = useRef(Date.now());
  const recompRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fragRef     = useRef(DEFAULT_FRAG);

  const [mode, setMode]             = useState<"idle" | "demo" | "mic">("idle");
  const [gpuOk, setGpuOk]           = useState<boolean | null>(null);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [micError, setMicError]       = useState<string | null>(null);
  const [compileOk, setCompileOk]     = useState(false);

  // ── WebGPU init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!("gpu" in navigator)) { setGpuOk(false); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gone = false;

    (async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (gone || !adapter) { setGpuOk(false); return; }

        const device = await adapter.requestDevice();
        if (gone) { device.destroy(); return; }

        const format   = navigator.gpu.getPreferredCanvasFormat();
        const canvasCtx = canvas.getContext("webgpu") as GPUCanvasContext;
        const dpr       = Math.min(window.devicePixelRatio || 1, 2);

        const resize = () => {
          canvas.width  = canvas.clientWidth  * dpr;
          canvas.height = canvas.clientHeight * dpr;
          canvasCtx.configure({ device, format, alphaMode: "opaque" });
        };
        resize();
        window.addEventListener("resize", resize);

        // Uniform buffer: 8 × f32 = 32 bytes
        const uniformBuf = device.createBuffer({
          size: 32,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroupLayout = device.createBindGroupLayout({
          entries: [{
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          }],
        });

        const bindGroup = device.createBindGroup({
          layout: bindGroupLayout,
          entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
        });

        const vertMod = device.createShaderModule({ code: VERT_WGSL });

        const g: GpuState = {
          device, canvasCtx, format, uniformBuf,
          bindGroupLayout, bindGroup, vertMod, pipeline: null,
        };
        gpuRef.current = g;
        setGpuOk(true);

        const { pipeline, error } = await compilePipeline(g, fragRef.current);
        if (gone) return;
        if (pipeline) { g.pipeline = pipeline; setCompileOk(true); }
        setShaderError(error);
      } catch {
        if (!gone) setGpuOk(false);
      }
    })();

    return () => {
      gone = true;
      window.removeEventListener("resize", () => {});
      gpuRef.current?.device.destroy();
      gpuRef.current = null;
    };
  }, []);

  // ── Render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const render = () => {
      const g = gpuRef.current;
      if (!g?.pipeline) { animRef.current = requestAnimationFrame(render); return; }

      const elapsed = (Date.now() - startRef.current) / 1000;
      const canvas  = canvasRef.current!;

      let bands = bandsRef.current;
      if (mode === "demo") {
        bands = demoBands(elapsed, bands);
        bandsRef.current = bands;
      } else if (analyserRef.current && fftBufRef.current) {
        bands = readBands(analyserRef.current, fftBufRef.current, bands);
        bandsRef.current = bands;
      }

      g.device.queue.writeBuffer(
        g.uniformBuf, 0,
        new Float32Array([
          bands.bass, bands.mid, bands.treble, bands.onset,
          elapsed, 80, canvas.width, canvas.height,
        ]),
      );

      const tex  = g.canvasCtx.getCurrentTexture();
      const enc  = g.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [{
          view: tex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.setPipeline(g.pipeline);
      pass.setBindGroup(0, g.bindGroup);
      pass.draw(6);
      pass.end();
      g.device.queue.submit([enc.finish()]);

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  // ── Shader editor change ─────────────────────────────────────────────────────
  const handleEdit = useCallback((code: string) => {
    fragRef.current = code;
    clearTimeout(recompRef.current);
    recompRef.current = setTimeout(async () => {
      const g = gpuRef.current;
      if (!g) return;
      const { pipeline, error } = await compilePipeline(g, code);
      if (pipeline) { g.pipeline = pipeline; setCompileOk(true); }
      setShaderError(error);
    }, 400);
  }, []);

  // ── Start demo ───────────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    startRef.current = Date.now();
    bandsRef.current = { bass: 0, mid: 0, treble: 0, onset: 0 };
    setMode("demo");
  }, []);

  // ── Start mic ────────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx    = new AudioContext();
      const src    = ctx.createMediaStreamSource(stream);
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
      setMicError("Mic denied — running demo mode");
      startDemo();
    }
  }, [startDemo]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      clearTimeout(recompRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  // ── WebGPU unavailable screen ────────────────────────────────────────────────
  if (gpuOk === false) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100vh", background: "#0a0a0a",
        color: "#e8e8e8", fontFamily: "monospace", gap: 14,
      }}>
        <div style={{ fontSize: 13, color: "#f87" }}>WebGPU not available in this browser.</div>
        <div style={{ fontSize: 11, color: "#666" }}>
          Try Chrome 113+, Edge 113+, Firefox 121+, or Safari 18+.
        </div>
        <Link href="/dream" style={{ fontSize: 11, color: "#6af" }}>← back to dream</Link>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#0a0a0a", color: "#e8e8e8", fontFamily: "monospace",
    }}>
      {/* Header bar */}
      <div style={{
        padding: "9px 16px", borderBottom: "1px solid #1e1e1e",
        display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        background: "#0c0c0c",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: "#e8e8e8" }}>
          WGSL SYNTH
        </span>
        <span style={{ fontSize: 11, color: "#555" }}>
          write a WebGPU shader that responds to your playing
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {mode === "idle" && (
            <>
              <button
                onClick={startDemo}
                style={{
                  background: "#0f2018", color: "#5dba7d",
                  border: "1px solid #1e4030", padding: "3px 11px",
                  borderRadius: 3, fontSize: 11, cursor: "pointer", letterSpacing: 1,
                }}
              >
                ▶ DEMO
              </button>
              <button
                onClick={() => { void startMic(); }}
                style={{
                  background: "#0f1a28", color: "#5da0ba",
                  border: "1px solid #1e3040", padding: "3px 11px",
                  borderRadius: 3, fontSize: 11, cursor: "pointer", letterSpacing: 1,
                }}
              >
                🎤 MIC
              </button>
            </>
          )}
          {mode === "demo" && (
            <span style={{ fontSize: 11, color: "#5dba7d", letterSpacing: 1 }}>▶ DEMO</span>
          )}
          {mode === "mic" && (
            <span style={{ fontSize: 11, color: "#5da0ba", letterSpacing: 1 }}>🎤 LIVE</span>
          )}
          <Link href="/dream" style={{ fontSize: 11, color: "#444" }}>← dream</Link>
        </div>
      </div>

      {/* Split: editor | canvas */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Left — shader editor */}
        <div style={{
          width: "42%", minWidth: 320,
          borderRight: "1px solid #1a1a1a",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Status bar */}
          {shaderError ? (
            <div style={{
              padding: "5px 12px", background: "#1e0808",
              color: "#f07070", fontSize: 11, whiteSpace: "pre-wrap",
              borderBottom: "1px solid #3a1010", flexShrink: 0, maxHeight: 96, overflowY: "auto",
            }}>
              {shaderError}
            </div>
          ) : compileOk ? (
            <div style={{
              padding: "3px 12px", background: "#091409",
              color: "#4da870", fontSize: 10, letterSpacing: 1,
              borderBottom: "1px solid #162816", flexShrink: 0,
            }}>
              ✓ COMPILED
            </div>
          ) : null}

          {micError && (
            <div style={{
              padding: "3px 12px", background: "#16120a",
              color: "#c8a050", fontSize: 10,
              borderBottom: "1px solid #2a2010", flexShrink: 0,
            }}>
              {micError}
            </div>
          )}

          {/* Textarea */}
          <textarea
            defaultValue={DEFAULT_FRAG}
            onChange={(e) => handleEdit(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            style={{
              flex: 1,
              background: "#0d0d0d",
              color: "#b8cce8",
              fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Courier New', monospace",
              fontSize: 12,
              lineHeight: 1.65,
              padding: "14px 16px",
              border: "none",
              outline: "none",
              resize: "none",
              tabSize: 2,
              overflowY: "auto",
            }}
          />

          {/* Footer hint */}
          <div style={{
            padding: "5px 12px", borderTop: "1px solid #181818",
            fontSize: 10, color: "#383838", flexShrink: 0,
            background: "#0a0a0a",
          }}>
            edit WGSL · recompiles 400ms after each keystroke ·{" "}
            <a
              href="https://google.github.io/tour-of-wgsl/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#484848" }}
            >
              WGSL tour →
            </a>
          </div>
        </div>

        {/* Right — WebGPU canvas */}
        <div style={{ flex: 1, position: "relative", background: "#000" }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
          {gpuOk === null && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#333", fontSize: 12, letterSpacing: 2,
            }}>
              INITIALISING WEBGPU…
            </div>
          )}
          {mode === "idle" && gpuOk && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 12, pointerEvents: "none",
            }}>
              <div style={{ color: "#2a2a2a", fontSize: 12, letterSpacing: 2 }}>
                PRESS ▶ DEMO OR 🎤 MIC TO BEGIN
              </div>
              <div style={{ color: "#1e1e1e", fontSize: 11 }}>
                edit the shader on the left — it recompiles live
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
