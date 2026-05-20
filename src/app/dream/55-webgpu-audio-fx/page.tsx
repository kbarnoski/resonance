"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── Audio synthesis ────────────────────────────────────────────────────────────

function buildChord(sr: number): Float32Array {
  const dur = 2.5;
  const n = Math.floor(sr * dur);
  const buf = new Float32Array(n);
  const voices: [number, number][] = [
    [261.63, 0.27], [329.63, 0.22], [392.0, 0.22], [523.25, 0.18],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env =
      Math.min(t / 0.04, 1) *
      Math.max(0, 1 - Math.max(0, t - (dur - 0.5)) / 0.5);
    let s = 0;
    for (const [f, a] of voices) {
      s += a * Math.sin(2 * Math.PI * f * t);
      s += a * 0.12 * Math.sin(2 * Math.PI * f * 2 * t);
    }
    buf[i] = s * env * 0.55;
  }
  return buf;
}

// ── WGSL shaders ───────────────────────────────────────────────────────────────

// Pass 1: speed-adjusted resampling (pitch shift by changing playback rate)
// speed < 1 → lower pitch; speed > 1 → higher pitch
const PITCH_WGSL = `
struct P { numInput: u32, numOutput: u32, speed: f32, pad: f32 }
@group(0) @binding(0) var<storage, read>       src : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst : array<f32>;
@group(0) @binding(2) var<uniform>             p   : P;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= p.numOutput) { return; }
  let fi = f32(i) * p.speed;
  let lo = u32(fi);
  let fr = fi - f32(lo);
  let lc = min(lo,      p.numInput - 1u);
  let hc = min(lo + 1u, p.numInput - 1u);
  let s0 = select(0.0, src[lc], lo < p.numInput);
  let s1 = select(0.0, src[hc], lo + 1u < p.numInput);
  dst[i] = s0 * (1.0 - fr) + s1 * fr;
}`;

// Pass 2: 6-tap FIR delay reverb (parallel feedforward comb)
const REVERB_WGSL = `
struct P { n: u32, mix: f32, p0: f32, p1: f32 }
@group(0) @binding(0) var<storage, read>       src : array<f32>;
@group(0) @binding(1) var<storage, read_write> dst : array<f32>;
@group(0) @binding(2) var<uniform>             p   : P;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= p.n) { return; }
  var s = src[i];
  if (i >= 1009u) { s += p.mix * 0.40 * src[i - 1009u]; }
  if (i >= 1777u) { s += p.mix * 0.32 * src[i - 1777u]; }
  if (i >= 2477u) { s += p.mix * 0.25 * src[i - 2477u]; }
  if (i >= 3089u) { s += p.mix * 0.18 * src[i - 3089u]; }
  if (i >= 4013u) { s += p.mix * 0.12 * src[i - 4013u]; }
  if (i >= 5021u) { s += p.mix * 0.07 * src[i - 5021u]; }
  dst[i] = s;
}`;

// ── GPU processing ─────────────────────────────────────────────────────────────

async function applyEffectsGPU(
  input: Float32Array,
  speed: number,
  reverbMix: number,
): Promise<{ result: Float32Array; ms: number }> {
  if (!navigator.gpu) throw new Error("WebGPU not available");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter");
  const device = await adapter.requestDevice();

  const n = input.length;
  const SZ = n * 4;
  const FL = GPUBufferUsage;
  const alloc = (sz: number, usage: number) =>
    device.createBuffer({ size: sz, usage });

  const srcBuf  = alloc(SZ, FL.STORAGE | FL.COPY_DST);
  const midBuf  = alloc(SZ, FL.STORAGE);
  const outBuf  = alloc(SZ, FL.STORAGE | FL.COPY_SRC);
  const readBuf = alloc(SZ, FL.MAP_READ | FL.COPY_DST);

  device.queue.writeBuffer(srcBuf, 0, input.buffer as ArrayBuffer, input.byteOffset, input.byteLength);

  // Pitch params: u32 numInput, u32 numOutput, f32 speed, f32 pad (16 bytes)
  const pp = new ArrayBuffer(16);
  new Uint32Array(pp, 0, 2).set([n, n]);
  new Float32Array(pp, 8, 1)[0] = speed;
  const ppBuf = alloc(16, FL.UNIFORM | FL.COPY_DST);
  device.queue.writeBuffer(ppBuf, 0, pp);

  // Reverb params: u32 n, f32 mix, f32 p0, f32 p1 (16 bytes)
  const rp = new ArrayBuffer(16);
  new Uint32Array(rp, 0, 1)[0] = n;
  new Float32Array(rp, 4, 3).set([reverbMix, 0, 0]);
  const rpBuf = alloc(16, FL.UNIFORM | FL.COPY_DST);
  device.queue.writeBuffer(rpBuf, 0, rp);

  const bgl = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ],
  });
  const pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });

  const mkPipe = (wgsl: string) =>
    device.createComputePipeline({
      layout: pipeLayout,
      compute: { module: device.createShaderModule({ code: wgsl }), entryPoint: "main" },
    });

  const pitchPipe  = mkPipe(PITCH_WGSL);
  const reverbPipe = mkPipe(REVERB_WGSL);

  const mkBG = (b0: GPUBuffer, b1: GPUBuffer, b2: GPUBuffer) =>
    device.createBindGroup({
      layout: bgl,
      entries: [
        { binding: 0, resource: { buffer: b0 } },
        { binding: 1, resource: { buffer: b1 } },
        { binding: 2, resource: { buffer: b2 } },
      ],
    });

  const pitchBG  = mkBG(srcBuf, midBuf, ppBuf);
  const reverbBG = mkBG(midBuf, outBuf, rpBuf);
  const wg = Math.ceil(n / 64);

  const t0 = performance.now();

  // Pass 1: pitch shift — srcBuf → midBuf
  const enc1 = device.createCommandEncoder();
  const cp1  = enc1.beginComputePass();
  cp1.setPipeline(pitchPipe);
  cp1.setBindGroup(0, pitchBG);
  cp1.dispatchWorkgroups(wg);
  cp1.end();
  device.queue.submit([enc1.finish()]);
  await device.queue.onSubmittedWorkDone();

  // Pass 2: reverb — midBuf → outBuf, then copy to readBuf
  const enc2 = device.createCommandEncoder();
  const cp2  = enc2.beginComputePass();
  cp2.setPipeline(reverbPipe);
  cp2.setBindGroup(0, reverbBG);
  cp2.dispatchWorkgroups(wg);
  cp2.end();
  enc2.copyBufferToBuffer(outBuf, 0, readBuf, 0, SZ);
  device.queue.submit([enc2.finish()]);

  await readBuf.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(readBuf.getMappedRange().slice(0));
  readBuf.unmap();
  const ms = Math.round(performance.now() - t0);

  device.destroy();
  return { result, ms };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Page() {
  const [phase, setPhase]   = useState<"idle" | "processing" | "playing" | "error">("idle");
  const [gpuOk, setGpuOk]   = useState<boolean | null>(null);
  const [speed, setSpeed]   = useState(1.0);
  const [rvMix, setRvMix]   = useState(0.35);
  const [gpuMs, setGpuMs]   = useState<number | null>(null);
  const [waveReady, setWaveReady] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const specRef     = useRef<HTMLCanvasElement>(null);
  const waveOrigRef = useRef<HTMLCanvasElement>(null);
  const waveProcRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef      = useRef<number>(0);

  useEffect(() => {
    setGpuOk("gpu" in navigator);
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  const paintWave = useCallback(
    (canvas: HTMLCanvasElement | null, data: Float32Array, stroke: string) => {
      if (!canvas) return;
      const c = canvas.getContext("2d")!;
      const { width: w, height: h } = canvas;
      c.fillStyle = "#060606";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = stroke;
      c.lineWidth = 1;
      c.beginPath();
      const step = Math.max(1, Math.floor(data.length / w));
      for (let x = 0; x < w; x++) {
        const s = data[x * step] ?? 0;
        const y = h / 2 - s * h * 0.44;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    },
    [],
  );

  const loopSpectrum = useCallback(() => {
    const cv = specRef.current;
    const an = analyserRef.current;
    if (!cv || !an) return;
    const c = cv.getContext("2d")!;
    const { width: w, height: h } = cv;
    const data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(data);
    c.fillStyle = "rgba(0,0,0,0.22)";
    c.fillRect(0, 0, w, h);
    const bw = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = Math.max(0, (data[i] + 100) / 100);
      const hue = 250 - (i / data.length) * 210;
      c.fillStyle = `hsl(${hue},90%,${28 + v * 42}%)`;
      c.fillRect(i * bw, h - v * h, bw + 0.5, v * h);
    }
    rafRef.current = requestAnimationFrame(loopSpectrum);
  }, []);

  const handleProcess = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    analyserRef.current = null;
    setPhase("processing");
    setErrMsg("");

    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const sr = audioCtx.sampleRate;

      const original = buildChord(sr);
      const { result, ms } = await applyEffectsGPU(original, speed, rvMix);
      setGpuMs(ms);

      paintWave(waveOrigRef.current, original, "#3a6a9a");
      paintWave(waveProcRef.current, result, "#c06020");
      setWaveReady(true);

      const audioBuf = audioCtx.createBuffer(1, result.length, sr);
      audioBuf.getChannelData(0).set(result);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
      analyser.connect(audioCtx.destination);

      const src = audioCtx.createBufferSource();
      src.buffer = audioBuf;
      src.loop = true;
      src.connect(analyser);
      src.start();

      setPhase("playing");
      loopSpectrum();
    } catch (e) {
      setErrMsg(String(e));
      setPhase("error");
    }
  }, [speed, rvMix, paintWave, loopSpectrum]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setPhase("idle");
  }, []);

  if (gpuOk === false) {
    return (
      <main style={{ minHeight: "100vh", background: "#000", color: "#ccc", fontFamily: "monospace", padding: "2rem" }}>
        <h1 style={{ fontSize: "1.4rem", letterSpacing: "0.1em" }}>GPU AUDIO FX</h1>
        <p style={{ color: "#666", marginTop: "1rem" }}>
          WebGPU required — open in Chrome 113+, Edge 113+, or Safari 18+.
        </p>
        <Link href="/dream" style={{ color: "#446", fontSize: "0.75rem" }}>← dream</Link>
      </main>
    );
  }

  const busy = phase === "processing";
  const playing = phase === "playing";

  return (
    <main style={{
      minHeight: "100vh",
      background: "#000",
      color: "#ddd",
      fontFamily: "monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "2rem 1rem",
      gap: "1.25rem",
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.35rem", letterSpacing: "0.12em", color: "#bbb", margin: 0 }}>
          GPU AUDIO FX
        </h1>
        <p style={{ color: "#4a4a4a", fontSize: "0.72rem", marginTop: "0.3rem", maxWidth: "480px" }}>
          C-major chord processed by two WGSL compute shaders —
          pitch-shift (resampling) then 6-tap FIR reverb — entirely on the GPU
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1.25rem",
        width: "100%",
        maxWidth: "520px",
      }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.68rem", color: "#555", letterSpacing: "0.08em" }}>
            PITCH SPEED — {speed.toFixed(2)}×
          </span>
          <input
            type="range" min={0.5} max={2.0} step={0.05} value={speed}
            onChange={e => setSpeed(parseFloat(e.target.value))}
            style={{ accentColor: "#4488cc", cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.62rem", color: "#383838" }}>
            0.5× (−oct) → 1.0× (orig) → 2.0× (+oct)
          </span>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.68rem", color: "#555", letterSpacing: "0.08em" }}>
            REVERB — {Math.round(rvMix * 100)}%
          </span>
          <input
            type="range" min={0} max={0.9} step={0.05} value={rvMix}
            onChange={e => setRvMix(parseFloat(e.target.value))}
            style={{ accentColor: "#cc7733", cursor: "pointer" }}
          />
          <span style={{ fontSize: "0.62rem", color: "#383838" }}>
            6 delay taps · 21–105 ms echo comb
          </span>
        </label>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          onClick={handleProcess}
          disabled={busy || gpuOk === null}
          style={{
            padding: "0.45rem 1.3rem",
            background: busy ? "#181818" : "#102030",
            color: busy ? "#444" : "#6ab",
            border: `1px solid ${busy ? "#222" : "#2a5070"}`,
            borderRadius: "4px",
            cursor: busy ? "not-allowed" : "pointer",
            fontSize: "0.78rem",
            letterSpacing: "0.05em",
          }}
        >
          {busy ? "processing…" : playing ? "↺ re-process" : "▶ Process on GPU"}
        </button>

        {playing && (
          <button
            onClick={handleStop}
            style={{
              padding: "0.45rem 1rem",
              background: "#111",
              color: "#666",
              border: "1px solid #2a2a2a",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.78rem",
            }}
          >
            ■ stop
          </button>
        )}
      </div>

      {/* GPU timing */}
      {gpuMs !== null && (
        <p style={{ fontSize: "0.68rem", color: "#333", margin: 0 }}>
          GPU: {gpuMs} ms · {(audioCtxRef.current?.sampleRate ?? 48000) * 2.5 | 0} samples · 2 dispatch passes
        </p>
      )}

      {/* Spectrum canvas */}
      <canvas
        ref={specRef}
        width={560}
        height={160}
        style={{
          width: "100%",
          maxWidth: "560px",
          height: "160px",
          background: "#000",
          borderRadius: "3px",
          border: "1px solid #111",
        }}
      />

      {/* Waveform comparison */}
      {waveReady && (
        <div style={{ width: "100%", maxWidth: "560px", display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontSize: "0.62rem", color: "#2a5070", letterSpacing: "0.06em" }}>ORIGINAL</span>
          <canvas
            ref={waveOrigRef}
            width={560}
            height={48}
            style={{ width: "100%", maxWidth: "560px", height: "48px", background: "#060606", borderRadius: "2px" }}
          />
          <span style={{ fontSize: "0.62rem", color: "#703010", letterSpacing: "0.06em", marginTop: "3px" }}>
            GPU-PROCESSED
          </span>
          <canvas
            ref={waveProcRef}
            width={560}
            height={48}
            style={{ width: "100%", maxWidth: "560px", height: "48px", background: "#060606", borderRadius: "2px" }}
          />
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <p style={{ color: "#b44", fontSize: "0.75rem", maxWidth: "520px", textAlign: "center" }}>
          {errMsg}
        </p>
      )}

      {/* Footer */}
      <p style={{ fontSize: "0.68rem", color: "#282828", marginTop: "auto", paddingTop: "1rem" }}>
        <Link href="/dream" style={{ color: "#334" }}>← dream</Link>
        {" · "}
        <Link href="/dream/55-webgpu-audio-fx/readme" style={{ color: "#334" }}>design notes</Link>
        {" · WebGPU required"}
      </p>
    </main>
  );
}
