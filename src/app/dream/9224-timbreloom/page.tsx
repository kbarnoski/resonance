"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9224 · Timbreloom
//
//   ONE QUESTION
//   What if Resonance could re-voice your live singing/playing into another
//   instrument in real time — a DDSP-style additive resynthesizer you hear AND
//   see?
//
//   MECHANISM (pure Web Audio DSP, no neural net — the spirit of the DDSP
//   decoder, Engel et al. 2020):
//     1. Extract two live control signals per frame from the mic:
//        • FUNDAMENTAL PITCH f0 (autocorrelation / YIN-lite over a 2048 buffer)
//        • LOUDNESS (RMS envelope, smoothed, asymmetric attack/release)
//     2. Feed them to a harmonic-plus-noise decoder:
//        • a bank of up to 64 harmonic sine PARTIALS at integer multiples of f0,
//          amplitudes = a per-voice spectral-envelope PRESET scaled by loudness
//          (rendered efficiently as one band-limited PeriodicWave oscillator);
//        • a FILTERED-NOISE band (seeded noise → BiquadFilter tracking loudness)
//          for breath / bow / air.
//        Your PITCH and DYNAMICS survive; your TIMBRE is replaced by the voice.
//        No drone: silence in → silence out (both gains gate on loudness).
//     3. VISUAL is raw WebGPU: the live 64-partial stack rendered as a glowing
//        ember spectrum that drifts left over time — you literally watch your
//        timbre. Graceful Canvas2D fallback from the SAME partial data when
//        navigator.gpu is absent.
//
//   SEEDED SELF-DEMO drives the full mechanism from a deterministic synthetic
//   pitch+loudness stream (mulberry32(0x9224)) so the art animates within ~1s on
//   a muted phone, no mic required.
//
//   REFS  Engel, Hantrakul, Gu, Roberts — "DDSP: Differentiable Digital Signal
//   Processing" (ICLR 2020); arXiv:2503.11562 "Designing Neural Synthesizers for
//   Low-Latency Interaction" (2025). See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── Constants ────────────────────────────────────────────────────────────────
const N_PARTIALS = 64; // harmonic partials in the stack
const HISTORY = 256; // time columns (= bytesPerRow, 256-aligned for WebGPU)
const LOUD_GATE = 0.02; // below this, output is silenced

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Instrument voices: spectral-envelope presets (the DDSP "decoder output") ──
interface Voice {
  id: string;
  label: string;
  blurb: string;
  weights: Float32Array; // per-partial amplitude envelope, peak-normalized
  noiseMix: number; // 0..1 relative breath/air amount
  noiseType: BiquadFilterType;
  noiseBase: number; // Hz — filter centre at unit loudness
}

function makeVoice(
  id: string,
  label: string,
  blurb: string,
  shape: (k: number) => number,
  noiseMix: number,
  noiseType: BiquadFilterType,
  noiseBase: number,
): Voice {
  const w = new Float32Array(N_PARTIALS);
  let max = 0;
  for (let i = 0; i < N_PARTIALS; i++) {
    const v = Math.max(0, shape(i + 1)); // k = harmonic number (1-based)
    w[i] = v;
    if (v > max) max = v;
  }
  if (max > 0) for (let i = 0; i < N_PARTIALS; i++) w[i] /= max;
  return { id, label, blurb, weights: w, noiseMix, noiseType, noiseBase };
}

// Four distinct harmonic-plus-noise voices. Each is a different partial-amplitude
// envelope + noise mix — the same pitch/loudness produces very different timbres.
const VOICES: Voice[] = [
  makeVoice(
    "glass",
    "glass",
    "bell-like: strong fundamental, sparse ringing overtones, airy hiss",
    (k) => Math.exp(-0.22 * (k - 1)) + (k === 3 || k === 4 ? 0.5 : 0) + 0.06 / k,
    0.05,
    "highpass",
    4200,
  ),
  makeVoice(
    "reed",
    "reed",
    "clarinet-like: odd harmonics dominate, breathy band of noise",
    (k) => (k % 2 === 1 ? 1 / k : 0.22 / k),
    0.2,
    "bandpass",
    1600,
  ),
  makeVoice(
    "metal",
    "metal",
    "bright & buzzing: slow high-partial rolloff, shimmering air",
    (k) => 1 / Math.pow(k, 0.65) + (k > 8 && k < 20 ? 0.15 : 0),
    0.14,
    "bandpass",
    3200,
  ),
  makeVoice(
    "wood",
    "wood",
    "warm mallet: fundamental-heavy, fast rolloff, soft breath",
    (k) => Math.exp(-0.5 * (k - 1)),
    0.1,
    "lowpass",
    1300,
  ),
];

// ── Seeded demo control stream: a deterministic phrase of notes ──────────────
interface DemoNote {
  freq: number;
  dur: number; // frames
  peak: number; // loudness peak 0..1
}
function buildDemo(): DemoNote[] {
  const rng = mulberry32(0x9224);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16]; // pentatonic over two octaves
  const base = 196; // G3
  const notes: DemoNote[] = [];
  for (let i = 0; i < 48; i++) {
    const deg = scale[Math.floor(rng() * scale.length)];
    const freq = base * Math.pow(2, deg / 12);
    const dur = 26 + Math.floor(rng() * 46);
    const peak = 0.45 + rng() * 0.55;
    notes.push({ freq, dur, peak });
  }
  return notes;
}
const DEMO = buildDemo();

// ── Pitch (YIN-lite autocorrelation) + loudness from a time-domain buffer ────
function detectPitch(
  buf: Float32Array,
  sampleRate: number,
): { f0: number; rms: number } {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return { f0: 0, rms };

  const minLag = Math.floor(sampleRate / 1000); // up to 1000 Hz
  const maxLag = Math.min(Math.floor(sampleRate / 70), n - 1); // down to 70 Hz

  // Energy at lag 0 for normalization.
  let e0 = 0;
  for (let i = 0; i < n - maxLag; i++) e0 += buf[i] * buf[i];
  if (e0 <= 0) return { f0: 0, rms };

  let bestLag = -1;
  let bestVal = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < n - maxLag; i++) sum += buf[i] * buf[i + lag];
    const norm = sum / e0;
    if (norm > bestVal) {
      bestVal = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestVal < 0.3) return { f0: 0, rms }; // unvoiced

  // Parabolic interpolation around the peak for sub-sample precision.
  let lag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const s = (i: number) => {
      let acc = 0;
      for (let j = 0; j < n - maxLag; j++) acc += buf[j] * buf[j + i];
      return acc;
    };
    const ym1 = s(bestLag - 1);
    const y0 = s(bestLag);
    const yp1 = s(bestLag + 1);
    const denom = ym1 - 2 * y0 + yp1;
    if (denom !== 0) lag = bestLag + (0.5 * (ym1 - yp1)) / denom;
  }
  return { f0: sampleRate / lag, rms };
}

// ── Ember palette (JS mirror for the Canvas2D fallback) ──────────────────────
function emberRGB(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [6, 3, 1]],
    [0.25, [90, 14, 2]],
    [0.5, [216, 72, 6]],
    [0.75, [255, 166, 40]],
    [1.0, [255, 244, 200]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (x - t0) / (t1 - t0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// ── WGSL: fullscreen ember spectrum from the r8unorm history texture ─────────
const SPECTRUM_WGSL = /* wgsl */ `
struct U { res: vec2f, time: f32, _pad: f32 };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  return vec4f(p[i], 0.0, 1.0);
}

fn ember(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0);
  let c0 = vec3f(0.024, 0.012, 0.004);
  let c1 = vec3f(0.353, 0.055, 0.008);
  let c2 = vec3f(0.847, 0.282, 0.024);
  let c3 = vec3f(1.0, 0.651, 0.157);
  let c4 = vec3f(1.0, 0.957, 0.784);
  if (x < 0.25) { return mix(c0, c1, x / 0.25); }
  if (x < 0.5)  { return mix(c1, c2, (x - 0.25) / 0.25); }
  if (x < 0.75) { return mix(c2, c3, (x - 0.5) / 0.25); }
  return mix(c3, c4, (x - 0.75) / 0.25);
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / u.res;      // 0..1, y down
  let px = uv.x;                // time: 0 = oldest (left), 1 = newest (right)
  let py = 1.0 - uv.y;          // 0 = bottom (fundamental), 1 = top

  // Vertical bloom: sample the partial band plus neighbours.
  var amp = 0.0;
  let dv = 1.0 / f32(${N_PARTIALS});
  amp += textureSample(tex, samp, vec2f(px, py)).r * 1.0;
  amp += textureSample(tex, samp, vec2f(px, py + dv)).r * 0.45;
  amp += textureSample(tex, samp, vec2f(px, py - dv)).r * 0.45;
  amp = amp / 1.9;

  // Comet trail: newer columns burn brighter toward the right edge.
  let recency = 0.55 + 0.45 * px;
  var v = amp * recency;

  // Faint horizontal partial gridlines so the harmonic stack reads as discrete.
  let band = fract(py * f32(${N_PARTIALS}));
  let line = smoothstep(0.0, 0.12, band) * smoothstep(1.0, 0.88, band);
  v *= (0.72 + 0.28 * line);

  var col = ember(v);
  // Additive core glow for hot partials.
  col += vec3f(0.6, 0.28, 0.08) * pow(v, 3.0);

  // Vignette toward near-black frame.
  let d = distance(uv, vec2f(0.5, 0.5));
  col *= 1.0 - 0.35 * smoothstep(0.4, 0.95, d);

  return vec4f(col, 1.0);
}
`;

// ── WebGPU backend handle ────────────────────────────────────────────────────
interface GpuBackend {
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  texture: GPUTexture;
  uniform: GPUBuffer;
  format: GPUTextureFormat;
}

async function initWebGPU(canvas: HTMLCanvasElement): Promise<GpuBackend> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    throw new Error("no navigator.gpu");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("no webgpu context");
  context.configure({ device, format, alphaMode: "opaque" });

  const texture = device.createTexture({
    size: { width: HISTORY, height: N_PARTIALS },
    format: "r8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const uniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shaderModule = device.createShaderModule({ code: SPECTRUM_WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: shaderModule, entryPoint: "vs" },
    fragment: { module: shaderModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniform } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: texture.createView() },
    ],
  });

  return { device, context, pipeline, bindGroup, texture, uniform, format };
}

// ── Audio graph handle ───────────────────────────────────────────────────────
interface AudioGraph {
  ctx: AudioContext;
  osc: OscillatorNode;
  oscGain: GainNode;
  noiseSrc: AudioBufferSourceNode;
  noiseFilter: BiquadFilterNode;
  noiseGain: GainNode;
  master: GainNode;
}

// Build a band-limited PeriodicWave from a voice's spectral envelope.
function makePeriodicWave(ctx: AudioContext, voice: Voice): PeriodicWave {
  const real = new Float32Array(N_PARTIALS + 1);
  const imag = new Float32Array(N_PARTIALS + 1);
  for (let k = 1; k <= N_PARTIALS; k++) imag[k] = voice.weights[k - 1];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TimbreloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // UI state
  const [source, setSource] = useState<"demo" | "mic">("demo");
  const [audioOn, setAudioOn] = useState(false);
  const [voiceIdx, setVoiceIdx] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [gpuStatus, setGpuStatus] = useState<"init" | "gpu" | "fallback">(
    "init",
  );
  const [readout, setReadout] = useState({ f0: 0, loud: 0 });

  // Refs that live across frames (avoid stale closures / re-renders).
  const sourceRef = useRef(source);
  const voiceRef = useRef(voiceIdx);
  const audioOnRef = useRef(audioOn);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  useEffect(() => {
    voiceRef.current = voiceIdx;
  }, [voiceIdx]);
  useEffect(() => {
    audioOnRef.current = audioOn;
  }, [audioOn]);

  const rafRef = useRef<number | null>(null);
  const gpuRef = useRef<GpuBackend | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const audioRef = useRef<AudioGraph | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const wavesRef = useRef<PeriodicWave[]>([]);

  // Live control + spectrum state.
  const f0Ref = useRef(0);
  const loudRef = useRef(0);
  const partialsRef = useRef(new Float32Array(N_PARTIALS));
  const historyRef = useRef(new Uint8Array(N_PARTIALS * HISTORY));

  // Seeded demo cursor.
  const demoIdxRef = useRef(0);
  const demoFrameRef = useRef(0);
  const frameCountRef = useRef(0);

  // ── Compute current partial amplitudes from f0 + loudness + voice ──────────
  const computePartials = useCallback((f0: number, loud: number) => {
    const voice = VOICES[voiceRef.current];
    const nyq = (audioRef.current?.ctx.sampleRate ?? 48000) / 2;
    const out = partialsRef.current;
    for (let k = 0; k < N_PARTIALS; k++) {
      const partialHz = f0 * (k + 1);
      const alive = f0 > 0 && partialHz < nyq ? 1 : 0;
      // Perceptual sqrt so quiet upper partials remain visible.
      out[k] = Math.sqrt(voice.weights[k] * loud) * alive;
    }
  }, []);

  // ── Push the current partial column into the scrolling history buffer ──────
  const pushHistory = useCallback(() => {
    const buf = historyRef.current;
    const p = partialsRef.current;
    for (let r = 0; r < N_PARTIALS; r++) {
      const base = r * HISTORY;
      buf.copyWithin(base, base + 1, base + HISTORY); // scroll left
      buf[base + HISTORY - 1] = Math.min(255, Math.round(p[r] * 255));
    }
  }, []);

  // ── Advance the seeded demo control stream by one frame ────────────────────
  const stepDemo = useCallback((): { f0: number; loud: number } => {
    let note = DEMO[demoIdxRef.current];
    let fi = demoFrameRef.current;
    if (fi >= note.dur) {
      demoIdxRef.current = (demoIdxRef.current + 1) % DEMO.length;
      demoFrameRef.current = 0;
      note = DEMO[demoIdxRef.current];
      fi = 0;
    }
    const prog = fi / note.dur;
    // ADSR-ish envelope across the note.
    let env: number;
    if (prog < 0.15) env = prog / 0.15;
    else if (prog > 0.75) env = 1 - (prog - 0.75) / 0.25;
    else env = 0.85;
    const loud = Math.max(0, env) * note.peak;
    // Gentle deterministic vibrato (sin is deterministic).
    const vib = 1 + 0.006 * Math.sin(frameCountRef.current * 0.35);
    demoFrameRef.current = fi + 1;
    return { f0: note.freq * vib, loud };
  }, []);

  // ── Read the mic and derive f0 + loudness ──────────────────────────────────
  const stepMic = useCallback((): { f0: number; loud: number } => {
    const analyser = analyserRef.current;
    const timeBuf = timeBufRef.current;
    const ctx = audioRef.current?.ctx;
    if (!analyser || !timeBuf || !ctx) return { f0: f0Ref.current, loud: 0 };
    analyser.getFloatTimeDomainData(
      timeBuf as unknown as Float32Array<ArrayBuffer>,
    );
    const { f0, rms } = detectPitch(timeBuf, ctx.sampleRate);
    const loud = Math.min(1, Math.pow(rms, 0.5) * 1.8);
    return { f0: f0 > 0 ? f0 : f0Ref.current, loud };
  }, []);

  // ── Apply the current control signals to the live audio graph ──────────────
  const applyAudio = useCallback((f0: number, loud: number) => {
    const g = audioRef.current;
    if (!g) return;
    const t = g.ctx.currentTime;
    const gated = loud < LOUD_GATE ? 0 : loud;
    const voice = VOICES[voiceRef.current];
    if (f0 > 0) g.osc.frequency.setTargetAtTime(f0, t, 0.02);
    g.oscGain.gain.setTargetAtTime(gated * 0.32, t, 0.02);
    g.noiseGain.gain.setTargetAtTime(gated * voice.noiseMix, t, 0.03);
    g.noiseFilter.frequency.setTargetAtTime(
      Math.min(18000, voice.noiseBase * (0.5 + gated * 1.5)),
      t,
      0.05,
    );
  }, []);

  // ── Render one frame (WebGPU primary, Canvas2D fallback) ───────────────────
  const drawFrame = useCallback((timeMs: number) => {
    const gpu = gpuRef.current;
    if (gpu) {
      gpu.device.queue.writeTexture(
        { texture: gpu.texture },
        historyRef.current,
        { bytesPerRow: HISTORY, rowsPerImage: N_PARTIALS },
        { width: HISTORY, height: N_PARTIALS },
      );
      const canvas = canvasRef.current!;
      const ub = new ArrayBuffer(16);
      const f = new Float32Array(ub);
      f[0] = canvas.width;
      f[1] = canvas.height;
      f[2] = timeMs * 0.001;
      gpu.device.queue.writeBuffer(gpu.uniform, 0, ub);

      const enc = gpu.device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: gpu.context.getCurrentTexture().createView(),
            clearValue: { r: 0.015, g: 0.008, b: 0.004, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(gpu.pipeline);
      pass.setBindGroup(0, gpu.bindGroup);
      pass.draw(3);
      pass.end();
      gpu.device.queue.submit([enc.finish()]);
      return;
    }

    // Canvas2D fallback — same history data, ember palette.
    const c2d = ctx2dRef.current;
    const off = offscreenRef.current;
    const canvas = canvasRef.current;
    if (!c2d || !off || !canvas) return;
    const octx = off.getContext("2d");
    if (!octx) return;
    const img = octx.createImageData(HISTORY, N_PARTIALS);
    const buf = historyRef.current;
    for (let r = 0; r < N_PARTIALS; r++) {
      for (let x = 0; x < HISTORY; x++) {
        const amp = buf[r * HISTORY + x] / 255;
        const recency = 0.55 + 0.45 * (x / HISTORY);
        const [rr, gg, bb] = emberRGB(amp * recency);
        // Flip vertically: partial 0 at bottom.
        const dst = ((N_PARTIALS - 1 - r) * HISTORY + x) * 4;
        img.data[dst] = rr;
        img.data[dst + 1] = gg;
        img.data[dst + 2] = bb;
        img.data[dst + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    c2d.imageSmoothingEnabled = true;
    c2d.fillStyle = "rgb(4,2,1)";
    c2d.fillRect(0, 0, canvas.width, canvas.height);
    c2d.drawImage(off, 0, 0, HISTORY, N_PARTIALS, 0, 0, canvas.width, canvas.height);
  }, []);

  // ── Main animation loop ────────────────────────────────────────────────────
  const loop = useCallback(() => {
    frameCountRef.current++;
    const control =
      sourceRef.current === "mic" && streamRef.current
        ? stepMic()
        : stepDemo();

    // Smooth f0 (glide) and loudness (fast attack, slow release).
    const prevF0 = f0Ref.current;
    f0Ref.current = control.f0 > 0 ? prevF0 + (control.f0 - prevF0) * 0.35 : prevF0;
    const prevLoud = loudRef.current;
    const k = control.loud > prevLoud ? 0.4 : 0.12;
    loudRef.current = prevLoud + (control.loud - prevLoud) * k;

    computePartials(f0Ref.current, loudRef.current);
    pushHistory();
    if (audioOnRef.current) applyAudio(f0Ref.current, loudRef.current);
    drawFrame(performance.now());

    // Throttled UI readout.
    if (frameCountRef.current % 6 === 0) {
      setReadout({
        f0: Math.round(f0Ref.current),
        loud: Math.round(loudRef.current * 100),
      });
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [applyAudio, computePartials, drawFrame, pushHistory, stepDemo, stepMic]);

  // ── Set up rendering (WebGPU or fallback) + start the loop on mount ─────────
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);

    (async () => {
      try {
        const backend = await initWebGPU(canvas);
        if (cancelled) {
          backend.device.destroy();
          return;
        }
        gpuRef.current = backend;
        setGpuStatus("gpu");
      } catch {
        if (cancelled) return;
        const c2d = canvas.getContext("2d");
        ctx2dRef.current = c2d;
        const off = document.createElement("canvas");
        off.width = HISTORY;
        off.height = N_PARTIALS;
        offscreenRef.current = off;
        setGpuStatus("fallback");
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const g = audioRef.current;
      if (g) {
        try {
          g.osc.stop();
        } catch {
          /* already stopped */
        }
        try {
          g.noiseSrc.stop();
        } catch {
          /* already stopped */
        }
        g.osc.disconnect();
        g.oscGain.disconnect();
        g.noiseSrc.disconnect();
        g.noiseFilter.disconnect();
        g.noiseGain.disconnect();
        g.master.disconnect();
        analyserRef.current?.disconnect();
        g.ctx.close();
      }
      const gpu = gpuRef.current;
      if (gpu) {
        gpu.texture.destroy();
        gpu.device.destroy();
      }
    };
  }, []);

  // ── Build the audio graph (lazily, from a user gesture) ────────────────────
  const ensureAudio = useCallback(async () => {
    if (audioRef.current) {
      await audioRef.current.ctx.resume();
      return audioRef.current;
    }
    const ctx = new AudioContext();
    await ctx.resume();

    // Cache one PeriodicWave per voice.
    wavesRef.current = VOICES.map((v) => makePeriodicWave(ctx, v));

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wavesRef.current[voiceRef.current]);
    osc.frequency.value = f0Ref.current || 220;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0;
    osc.connect(oscGain).connect(master);
    osc.start();

    // Seeded noise buffer (deterministic — no Math.random).
    const rng = mulberry32(0x9224 ^ 0x51ac);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = nb;
    noiseSrc.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    const voice = VOICES[voiceRef.current];
    noiseFilter.type = voice.noiseType;
    noiseFilter.frequency.value = voice.noiseBase;
    noiseFilter.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseSrc.connect(noiseFilter).connect(noiseGain).connect(master);
    noiseSrc.start();

    const graph: AudioGraph = {
      ctx,
      osc,
      oscGain,
      noiseSrc,
      noiseFilter,
      noiseGain,
      master,
    };
    audioRef.current = graph;
    return graph;
  }, []);

  // ── Switch voice: rebuild the oscillator's periodic wave + noise filter ────
  const applyVoice = useCallback((idx: number) => {
    const g = audioRef.current;
    if (!g) return;
    if (wavesRef.current[idx]) g.osc.setPeriodicWave(wavesRef.current[idx]);
    const voice = VOICES[idx];
    g.noiseFilter.type = voice.noiseType;
    g.noiseFilter.frequency.value = voice.noiseBase;
  }, []);

  const handleVoice = useCallback(
    (idx: number) => {
      setVoiceIdx(idx);
      voiceRef.current = idx;
      applyVoice(idx);
    },
    [applyVoice],
  );

  // ── Buttons ────────────────────────────────────────────────────────────────
  const handleDemo = useCallback(async () => {
    setMicError(null);
    try {
      await ensureAudio();
      setSource("demo");
      sourceRef.current = "demo";
      setAudioOn(true);
      audioOnRef.current = true;
    } catch {
      setMicError("Audio could not start on this device.");
    }
  }, [ensureAudio]);

  const handleMic = useCallback(async () => {
    setMicError(null);
    try {
      const graph = await ensureAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const srcNode = graph.ctx.createMediaStreamSource(stream);
      const analyser = graph.ctx.createAnalyser();
      analyser.fftSize = 2048;
      srcNode.connect(analyser); // analysis only — NOT connected to destination
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(analyser.fftSize);
      setSource("mic");
      sourceRef.current = "mic";
      setAudioOn(true);
      audioOnRef.current = true;
    } catch {
      setMicError(
        "Mic unavailable or permission denied — the seeded demo still runs.",
      );
    }
  }, [ensureAudio]);

  const handleStop = useCallback(() => {
    const g = audioRef.current;
    if (g) {
      const t = g.ctx.currentTime;
      g.oscGain.gain.setTargetAtTime(0, t, 0.03);
      g.noiseGain.gain.setTargetAtTime(0, t, 0.03);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    setSource("demo");
    sourceRef.current = "demo";
    setAudioOn(false);
    audioOnRef.current = false;
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const btnSecondary =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors";
  const label = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 pb-24">
      <PrototypeNav slugs={["9224-timbreloom"]} />

      <header className="mb-6">
        <p className={label}>9224 · timbreloom</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Timbreloom — a DDSP re-voicer you hear and see
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          Sing or play into the mic. Timbreloom extracts your live{" "}
          <span className="text-foreground">pitch</span> and{" "}
          <span className="text-foreground">loudness</span>, then rebuilds the
          sound from a bank of {N_PARTIALS} harmonic partials plus a filtered
          noise band — a harmonic-plus-noise DDSP decoder. Your melody and
          dynamics survive; your timbre is replaced by the chosen voice. Silence
          in, silence out.
        </p>
      </header>

      <div className="relative mb-4 aspect-[16/9] w-full overflow-hidden rounded-md border border-border bg-black">
        <canvas ref={canvasRef} className="h-full w-full" />
        {gpuStatus === "fallback" && (
          <p className="absolute left-3 top-3 text-destructive font-mono text-xs">
            WebGPU unavailable — showing fallback
          </p>
        )}
        <p className="pointer-events-none absolute bottom-2 right-3 font-mono text-xs text-muted-foreground">
          f0 {readout.f0 || "—"} Hz · loud {readout.loud}% ·{" "}
          {source === "mic" ? "MIC" : "DEMO"}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={handleMic}>
          Start mic
        </button>
        <button type="button" className={btnSecondary} onClick={handleDemo}>
          Play a seeded demo
        </button>
        {audioOn && (
          <button type="button" className={btnSecondary} onClick={handleStop}>
            Stop
          </button>
        )}
      </div>

      {micError && <p className="mb-4 text-destructive text-sm">{micError}</p>}

      <div className="mb-6">
        <p className={label}>Instrument voice</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VOICES.map((v, i) => (
            <button
              key={v.id}
              type="button"
              onClick={() => handleVoice(i)}
              className={i === voiceIdx ? btnPrimary : btnSecondary}
              title={v.blurb}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {VOICES[voiceIdx].blurb}
        </p>
      </div>

      <section className="space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p className={label}>How it works</p>
        <p>
          Per frame, a YIN-lite autocorrelation over a 2048-sample buffer yields
          the fundamental pitch and an RMS envelope yields loudness. These two
          control signals drive a band-limited additive oscillator (its harmonic
          amplitudes are the voice&apos;s spectral-envelope preset) and a noise
          band shaped by a biquad filter — the harmonic-plus-noise model from
          DDSP. The glowing ember column is the live {N_PARTIALS}-partial stack
          drifting through time: brightness is each partial&apos;s current
          amplitude, so you watch your timbre.
        </p>
        <p className="text-muted-foreground/70">
          Refs: Engel, Hantrakul, Gu, Roberts — &ldquo;DDSP: Differentiable
          Digital Signal Processing&rdquo; (ICLR 2020); arXiv:2503.11562,
          &ldquo;Designing Neural Synthesizers for Low-Latency Interaction&rdquo;
          (2025).
        </p>
      </section>
    </main>
  );
}
