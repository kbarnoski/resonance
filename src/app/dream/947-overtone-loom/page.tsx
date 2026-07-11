"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  F_MAX,
  F_MIN,
  fieldAt,
  totalDissonance,
  voicePartials,
  xToFreq,
  type Partial,
} from "./dissonance";

// ── Keyboard layout ──────────────────────────────────────────────────────────
// ~1.75 octaves of chromatic note strips, A3 (MIDI 57) upward.
const KEY_START_MIDI = 57; // A3
const KEY_COUNT = 22;
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function midiName(m: number): string {
  return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}
function isBlackKey(m: number): boolean {
  const pc = m % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => {
  const midi = KEY_START_MIDI + i;
  return {
    midi,
    name: midiName(midi),
    freq: midiToFreq(midi),
    black: isBlackKey(midi),
  };
});

const FIELD_BINS = 512; // GPU/field resolution along the frequency axis
const MAX_PARTIALS_TOTAL = 256; // hard cap fed to the GPU each frame

type RenderTier = "webgpu" | "webgl2" | "canvas2d";

// ── Audio voice ───────────────────────────────────────────────────────────────
interface Voice {
  midi: number;
  oscs: OscillatorNode[];
  gain: GainNode;
  partials: Partial[]; // freq/amp at full gain (before decay envelope)
  releasing: boolean;
  startedAt: number;
}

// ── WGSL compute + render shaders ─────────────────────────────────────────────
// Compute: one invocation per frequency bin; for that bin's probe frequency it
// sums Sethares roughness against every sounding partial → the interference
// field. Render: a fullscreen triangle samples the field buffer into vertical
// bands (Ikeda spectral-lab look).
const WGSL_COMPUTE = /* wgsl */ `
struct Params {
  partialCount : u32,
  bins : u32,
  fMin : f32,
  fMax : f32,
};
@group(0) @binding(0) var<uniform> params : Params;
// partials: x=freq, y=amp packed as vec2 per partial
@group(0) @binding(1) var<storage, read> partials : array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> field : array<f32>;

fn pairRoughness(f1 : f32, a1 : f32, f2 : f32, a2 : f32) -> f32 {
  let df = abs(f2 - f1);
  let fmin = min(f1, f2);
  let s = 0.24 / (0.0207 * fmin + 18.96);
  return a1 * a2 * (exp(-3.5 * s * df) - exp(-5.75 * s * df));
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.bins) { return; }
  let x = f32(idx) / f32(params.bins - 1u);
  let fp = params.fMin * pow(params.fMax / params.fMin, x);
  var sum = 0.0;
  let n = params.partialCount;
  for (var k : u32 = 0u; k < n; k = k + 1u) {
    let p = partials[k];
    sum = sum + pairRoughness(fp, 1.0, p.x, p.y);
  }
  field[idx] = sum;
}
`;

const WGSL_RENDER = /* wgsl */ `
struct RParams { bins : u32, maxVal : f32, time : f32, pad : f32, };
@group(0) @binding(0) var<uniform> rp : RParams;
@group(0) @binding(1) var<storage, read> field : array<f32>;

struct VOut { @builtin(position) pos : vec4<f32>, @location(0) uv : vec2<f32>, };

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> VOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  o.uv = (p[vi] + vec2<f32>(1.0, 1.0)) * 0.5;
  return o;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  let x = in.uv.x;
  let y = 1.0 - in.uv.y;
  let bi = clamp(u32(x * f32(rp.bins)), 0u, rp.bins - 1u);
  var v = field[bi] / max(rp.maxVal, 1e-4);
  v = clamp(v, 0.0, 1.0);
  // churning roughness: animate where v is high
  let churn = 0.5 + 0.5 * sin(rp.time * 6.0 + x * 90.0 + v * 30.0);
  let activity = v * (0.65 + 0.35 * churn);
  // column "fills" from the baseline; height encodes roughness
  let band = smoothstep(1.0 - activity - 0.02, 1.0 - activity + 0.02, y);
  let glow = activity * exp(-abs(y - (1.0 - activity)) * 5.0);
  // clinical cyan/white palette on near-black
  let cyan = vec3<f32>(0.20, 0.85, 1.0);
  let white = vec3<f32>(0.85, 0.97, 1.0);
  var col = cyan * (band * 0.5 + glow * 1.4);
  col = col + white * glow * activity * 1.2;
  // faint baseline grid lumens
  col = col + cyan * 0.03;
  return vec4<f32>(col, 1.0);
}
`;

// ── WebGL2 fragment shader (same field math, CPU-uploaded partials) ───────────
const GL_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const GL_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform float u_fMin;
uniform float u_fMax;
uniform float u_maxVal;
uniform int u_count;
uniform vec2 u_partials[${MAX_PARTIALS_TOTAL}]; // x=freq y=amp
float pairR(float f1, float a1, float f2, float a2){
  float df = abs(f2 - f1);
  float fmin = min(f1, f2);
  float s = 0.24 / (0.0207 * fmin + 18.96);
  return a1 * a2 * (exp(-3.5 * s * df) - exp(-5.75 * s * df));
}
void main(){
  float x = v_uv.x;
  float y = v_uv.y;
  float fp = u_fMin * pow(u_fMax / u_fMin, x);
  float sum = 0.0;
  for (int k = 0; k < ${MAX_PARTIALS_TOTAL}; k++){
    if (k >= u_count) break;
    sum += pairR(fp, 1.0, u_partials[k].x, u_partials[k].y);
  }
  float v = clamp(sum / max(u_maxVal, 1e-4), 0.0, 1.0);
  float churn = 0.5 + 0.5 * sin(u_time * 6.0 + x * 90.0 + v * 30.0);
  float activity = v * (0.65 + 0.35 * churn);
  float band = smoothstep(activity - 0.02, activity + 0.02, y);
  float glow = activity * exp(-abs(y - activity) * 5.0);
  vec3 cyan = vec3(0.20, 0.85, 1.0);
  vec3 white = vec3(0.85, 0.97, 1.0);
  vec3 col = cyan * (band * 0.5 + glow * 1.4);
  col += white * glow * activity * 1.2;
  col += cyan * 0.03;
  outColor = vec4(col, 1.0);
}`;

// ── GPU resource bundles ──────────────────────────────────────────────────────
interface GpuBundle {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  computePl: GPUComputePipeline;
  renderPl: GPURenderPipeline;
  paramsBuf: GPUBuffer;
  partialsBuf: GPUBuffer;
  fieldBuf: GPUBuffer;
  rParamsBuf: GPUBuffer;
  computeBg: GPUBindGroup;
  renderBg: GPUBindGroup;
  canvasFmt: GPUTextureFormat;
}

interface GlBundle {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  loc: {
    time: WebGLUniformLocation | null;
    fMin: WebGLUniformLocation | null;
    fMax: WebGLUniformLocation | null;
    maxVal: WebGLUniformLocation | null;
    count: WebGLUniformLocation | null;
    partials: WebGLUniformLocation | null;
  };
}

// ── Auto-demo program ─────────────────────────────────────────────────────────
// Each step: a chord (semitone offsets from a root) + a label. Cycles to show
// the consonance→dissonance gradient.
const DEMO_ROOT = 60; // C4
const DEMO_STEPS: { offs: number[]; label: string }[] = [
  { offs: [0], label: "unison · single voice" },
  { offs: [0, 12], label: "octave · 2:1 · smooth" },
  { offs: [0, 7], label: "perfect fifth · 3:2 · smooth" },
  { offs: [0, 4, 7], label: "major triad · locked" },
  { offs: [0, 6], label: "tritone · churning" },
  { offs: [0, 1], label: "minor 2nd · very rough" },
  { offs: [0, 1, 2], label: "semitone cluster · maximal roughness" },
];

export default function OvertoneLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [tier, setTier] = useState<RenderTier | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [heldNames, setHeldNames] = useState<string[]>([]);
  const [dissReadout, setDissReadout] = useState(0);
  const [timbre, setTimbre] = useState(0.45); // 0=dark .. 1=bright
  const [partialCount, setPartialCount] = useState(8);
  const [autoDemo, setAutoDemo] = useState(true);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  // Live mirrors of UI knobs for the rAF/audio closures (avoid stale deps).
  const timbreRef = useRef(timbre);
  const partialCountRef = useRef(partialCount);
  const autoDemoRef = useRef(autoDemo);

  // Render refs
  const gpuRef = useRef<GpuBundle | null>(null);
  const glRef = useRef<GlBundle | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastInteractRef = useRef<number>(0);
  const demoIdxRef = useRef<number>(0);
  const demoNextAtRef = useRef<number>(0);
  const maxValRef = useRef<number>(0.5); // adaptive normalization

  useEffect(() => {
    timbreRef.current = timbre;
  }, [timbre]);
  useEffect(() => {
    partialCountRef.current = partialCount;
  }, [partialCount]);
  useEffect(() => {
    autoDemoRef.current = autoDemo;
  }, [autoDemo]);

  // ── Gather every sounding partial across all voices, applying decay env ────
  const gatherPartials = useCallback((): Partial[] => {
    const ctx = ctxRef.current;
    if (!ctx) return [];
    const now = ctx.currentTime;
    const all: Partial[] = [];
    for (const v of voicesRef.current.values()) {
      // approximate current envelope amplitude (matches gain ramp below)
      const age = now - v.startedAt;
      const env = Math.max(0, Math.exp(-age * 0.55));
      if (env < 0.01) continue;
      for (const p of v.partials) {
        all.push({ freq: p.freq, amp: p.amp * env });
        if (all.length >= MAX_PARTIALS_TOTAL) return all;
      }
    }
    return all;
  }, []);

  const refreshHeld = useCallback(() => {
    const names: string[] = [];
    for (const v of voicesRef.current.values()) {
      if (!v.releasing) names.push(midiName(v.midi));
    }
    setHeldNames(names);
  }, []);

  // ── Additive voice synthesis ──────────────────────────────────────────────
  const startNote = useCallback(
    (midi: number, velocity = 0.8) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master) return;
      // retrigger: stop an existing voice on the same key
      const existing = voicesRef.current.get(midi);
      if (existing) {
        try {
          existing.gain.gain.cancelScheduledValues(ctx.currentTime);
          existing.oscs.forEach((o) => o.stop(ctx.currentTime + 0.02));
        } catch {
          /* already stopped */
        }
        voicesRef.current.delete(midi);
      }
      const fund = midiToFreq(midi);
      const partials = voicePartials(
        fund,
        partialCountRef.current,
        timbreRef.current,
      );
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const peak = 0.16 * velocity;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.012);
      // gentle decay so a strummed chord sustains a moment, then rings down
      gain.gain.setTargetAtTime(0.0001, now + 0.012, 2.2);
      gain.connect(master);

      const oscs: OscillatorNode[] = [];
      for (const p of partials) {
        if (p.freq > 18000) continue;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(p.freq, now);
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(p.amp, now);
        osc.connect(pg);
        pg.connect(gain);
        osc.start(now);
        osc.stop(now + 9); // safety horizon; voice removed earlier on release
        oscs.push(osc);
      }
      voicesRef.current.set(midi, {
        midi,
        oscs,
        gain,
        partials,
        releasing: false,
        startedAt: now,
      });
      refreshHeld();
    },
    [refreshHeld],
  );

  const stopNote = useCallback((midi: number) => {
    const ctx = ctxRef.current;
    const v = voicesRef.current.get(midi);
    if (!ctx || !v) return;
    const now = ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.0001, now, 0.35);
      v.oscs.forEach((o) => o.stop(now + 1.6));
    } catch {
      /* ignore */
    }
    v.releasing = true;
    // fully remove shortly after release ramp completes
    window.setTimeout(() => {
      voicesRef.current.delete(midi);
      refreshHeld();
    }, 1700);
    refreshHeld();
  }, [refreshHeld]);

  // ── Auto-demo: pluck a chord, hold briefly, release ───────────────────────
  const runDemoStep = useCallback(() => {
    // release everything currently sounding
    for (const midi of Array.from(voicesRef.current.keys())) stopNote(midi);
    const step = DEMO_STEPS[demoIdxRef.current % DEMO_STEPS.length];
    demoIdxRef.current += 1;
    step.offs.forEach((o, i) => {
      window.setTimeout(() => startNote(DEMO_ROOT + o, 0.85), i * 70);
    });
    setNotice(null);
  }, [startNote, stopNote]);

  // ── Frame loop: compute + render the dissonance field ─────────────────────
  const frame = useCallback(
    (t: number) => {
      const time = t / 1000;
      // auto-demo scheduling
      if (autoDemoRef.current) {
        const idle = performance.now() - lastInteractRef.current;
        if (idle > 1500 && performance.now() >= demoNextAtRef.current) {
          runDemoStep();
          demoNextAtRef.current = performance.now() + 2600;
        }
      }

      const partials = gatherPartials();
      // total scalar dissonance (the chord's roughness number/meter)
      const total = totalDissonance(partials);
      // adaptive normalization for the field (smooth peak follower)
      // estimate field peak for color scaling
      let fieldPeak = 0.0001;
      if (partials.length > 0) {
        // sample a coarse set of probe freqs to find peak
        for (let i = 0; i < 48; i++) {
          const fp = xToFreq(i / 47);
          const r = fieldAt(fp, partials);
          if (r > fieldPeak) fieldPeak = r;
        }
      }
      maxValRef.current += (Math.max(fieldPeak, 0.05) - maxValRef.current) * 0.08;

      const gpu = gpuRef.current;
      const gl = glRef.current;
      if (gpu) {
        renderGpu(gpu, partials, maxValRef.current, time);
      } else if (gl) {
        renderGl(gl, partials, maxValRef.current, time);
      } else {
        renderCanvas2d(partials, maxValRef.current, time);
      }

      // throttle React readout updates a touch
      setDissReadout(total);
      rafRef.current = requestAnimationFrame(frame);
    },
    [gatherPartials, runDemoStep],
  );

  // ── GPU render path ───────────────────────────────────────────────────────
  const renderGpu = (
    g: GpuBundle,
    partials: Partial[],
    maxVal: number,
    time: number,
  ) => {
    const { device } = g;
    const n = Math.min(partials.length, MAX_PARTIALS_TOTAL);
    // upload params
    const params = new ArrayBuffer(16);
    const pv = new DataView(params);
    pv.setUint32(0, n, true);
    pv.setUint32(4, FIELD_BINS, true);
    pv.setFloat32(8, F_MIN, true);
    pv.setFloat32(12, F_MAX, true);
    device.queue.writeBuffer(g.paramsBuf, 0, params);
    // upload partials (vec2 each), pad rest with zeros
    const pdata = new Float32Array(MAX_PARTIALS_TOTAL * 2);
    for (let i = 0; i < n; i++) {
      pdata[i * 2] = partials[i].freq;
      pdata[i * 2 + 1] = partials[i].amp;
    }
    device.queue.writeBuffer(g.partialsBuf, 0, pdata.buffer);
    // render params
    const rp = new ArrayBuffer(16);
    const rv = new DataView(rp);
    rv.setUint32(0, FIELD_BINS, true);
    rv.setFloat32(4, maxVal, true);
    rv.setFloat32(8, time, true);
    rv.setFloat32(12, 0, true);
    device.queue.writeBuffer(g.rParamsBuf, 0, rp);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(g.computePl);
    cpass.setBindGroup(0, g.computeBg);
    cpass.dispatchWorkgroups(Math.ceil(FIELD_BINS / 64));
    cpass.end();

    const view = g.ctx.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.01, g: 0.012, b: 0.02, a: 1 },
          loadOp: "clear" as GPULoadOp,
          storeOp: "store" as GPUStoreOp,
        },
      ],
    });
    rpass.setPipeline(g.renderPl);
    rpass.setBindGroup(0, g.renderBg);
    rpass.draw(3);
    rpass.end();
    device.queue.submit([enc.finish()]);
  };

  // ── WebGL2 render path ────────────────────────────────────────────────────
  const renderGl = (
    b: GlBundle,
    partials: Partial[],
    maxVal: number,
    time: number,
  ) => {
    const { gl, program, vao, loc } = b;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.01, 0.012, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    const n = Math.min(partials.length, MAX_PARTIALS_TOTAL);
    const arr = new Float32Array(MAX_PARTIALS_TOTAL * 2);
    for (let i = 0; i < n; i++) {
      arr[i * 2] = partials[i].freq;
      arr[i * 2 + 1] = partials[i].amp;
    }
    gl.uniform1f(loc.time, time);
    gl.uniform1f(loc.fMin, F_MIN);
    gl.uniform1f(loc.fMax, F_MAX);
    gl.uniform1f(loc.maxVal, maxVal);
    gl.uniform1i(loc.count, n);
    if (loc.partials) gl.uniform2fv(loc.partials, arr);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  // ── Canvas2D CPU fallback ─────────────────────────────────────────────────
  const renderCanvas2d = (partials: Partial[], maxVal: number, time: number) => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const c2d = cvs.getContext("2d");
    if (!c2d) return;
    const w = cvs.width;
    const h = cvs.height;
    c2d.fillStyle = "#020305";
    c2d.fillRect(0, 0, w, h);
    const cols = 192; // coarse field
    const cw = w / cols;
    for (let i = 0; i < cols; i++) {
      const x = i / (cols - 1);
      const fp = xToFreq(x);
      const r = Math.max(0, fieldAt(fp, partials));
      const v = Math.min(1, r / Math.max(maxVal, 1e-4));
      const churn = 0.5 + 0.5 * Math.sin(time * 6 + x * 90 + v * 30);
      const activity = v * (0.65 + 0.35 * churn);
      const bh = activity * h;
      // cyan/white band rising from baseline
      const alpha = 0.25 + 0.7 * activity;
      const lum = Math.round(120 + 135 * activity);
      c2d.fillStyle = `rgba(${Math.round(lum * 0.35)},${Math.round(
        lum * 0.95,
      )},${lum},${alpha})`;
      c2d.fillRect(i * cw, h - bh, cw + 1, bh);
    }
    // faint baseline
    c2d.fillStyle = "rgba(60,160,200,0.10)";
    c2d.fillRect(0, h - 1, w, 1);
  };

  // ── Init audio + renderer behind the Start gesture ────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);
    // leave lastInteract at 0 so a hands-off viewer sees the auto-demo fire
    // promptly (~1.2s after Start); any key press resets it and pauses demo.
    lastInteractRef.current = 0;
    demoNextAtRef.current = performance.now() + 1200;

    // --- Audio ---
    try {
      type WindowWithWebkit = Window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor =
        window.AudioContext ||
        (window as WindowWithWebkit).webkitAudioContext;
      if (!Ctor) throw new Error("Web Audio API unavailable.");
      const ctx = new Ctor();
      await ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.22; // ear-safe cap
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 7000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.18;
      master.connect(lp);
      lp.connect(comp);
      comp.connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
    } catch (e) {
      setAudioError(
        "Audio unavailable — the dissonance field is shown silently. " +
          (e instanceof Error ? e.message : ""),
      );
    }

    // --- Renderer cascade: WebGPU → WebGL2 → Canvas2D ---
    const cvs = canvasRef.current;
    if (cvs) sizeCanvas(cvs);
    let chosen: RenderTier = "canvas2d";
    if (cvs) {
      const gpuOk = await tryInitWebGpu(cvs);
      if (gpuOk) {
        chosen = "webgpu";
      } else {
        const glOk = tryInitWebGl(cvs);
        if (glOk) {
          chosen = "webgl2";
          setNotice(
            "WebGPU unavailable — running the field on WebGL2 (same math, fragment shader).",
          );
        } else {
          chosen = "canvas2d";
          setNotice(
            "WebGPU & WebGL2 unavailable — CPU Canvas2D fallback (coarse field).",
          );
        }
      }
    }
    setTier(chosen);
    rafRef.current = requestAnimationFrame(frame);
  }, [started, frame]);

  // ── Canvas backing-store sizing ───────────────────────────────────────────
  const sizeCanvas = (cvs: HTMLCanvasElement) => {
    const rect = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (cvs.width !== w || cvs.height !== h) {
      cvs.width = w;
      cvs.height = h;
    }
  };

  // ── WebGPU init ────────────────────────────────────────────────────────────
  const tryInitWebGpu = async (cvs: HTMLCanvasElement): Promise<boolean> => {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      const device = await adapter.requestDevice();
      const ctx = cvs.getContext("webgpu") as GPUCanvasContext | null;
      if (!ctx) return false;
      const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

      const paramsBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const partialsBuf = device.createBuffer({
        size: MAX_PARTIALS_TOTAL * 2 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      const fieldBuf = device.createBuffer({
        size: FIELD_BINS * 4,
        usage: GPUBufferUsage.STORAGE,
      });
      const rParamsBuf = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const computeMod = device.createShaderModule({ code: WGSL_COMPUTE });
      const renderMod = device.createShaderModule({ code: WGSL_RENDER });
      const computePl = device.createComputePipeline({
        layout: "auto",
        compute: { module: computeMod, entryPoint: "main" },
      });
      const renderPl = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: renderMod, entryPoint: "vs" },
        fragment: {
          module: renderMod,
          entryPoint: "fs",
          targets: [{ format: canvasFmt }],
        },
        primitive: { topology: "triangle-list" },
      });

      const computeBg = device.createBindGroup({
        layout: computePl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: paramsBuf } },
          { binding: 1, resource: { buffer: partialsBuf } },
          { binding: 2, resource: { buffer: fieldBuf } },
        ],
      });
      const renderBg = device.createBindGroup({
        layout: renderPl.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: rParamsBuf } },
          { binding: 1, resource: { buffer: fieldBuf } },
        ],
      });

      gpuRef.current = {
        device,
        ctx,
        computePl,
        renderPl,
        paramsBuf,
        partialsBuf,
        fieldBuf,
        rParamsBuf,
        computeBg,
        renderBg,
        canvasFmt,
      };
      return true;
    } catch {
      return false;
    }
  };

  // ── WebGL2 init ────────────────────────────────────────────────────────────
  const tryInitWebGl = (cvs: HTMLCanvasElement): boolean => {
    try {
      const gl = cvs.getContext("webgl2");
      if (!gl) return false;
      const compile = (type: number, src: string): WebGLShader | null => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = compile(gl.VERTEX_SHADER, GL_VERT);
      const fs = compile(gl.FRAGMENT_SHADER, GL_FRAG);
      if (!vs || !fs) return false;
      const program = gl.createProgram();
      if (!program) return false;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "a_pos");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;

      const vao = gl.createVertexArray();
      if (!vao) return false;
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      // fullscreen triangle
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW,
      );
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      glRef.current = {
        gl,
        program,
        vao,
        loc: {
          time: gl.getUniformLocation(program, "u_time"),
          fMin: gl.getUniformLocation(program, "u_fMin"),
          fMax: gl.getUniformLocation(program, "u_fMax"),
          maxVal: gl.getUniformLocation(program, "u_maxVal"),
          count: gl.getUniformLocation(program, "u_count"),
          partials: gl.getUniformLocation(program, "u_partials"),
        },
      };
      return true;
    } catch {
      return false;
    }
  };

  // ── Web MIDI (bonus) ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    if (!navigator.requestMIDIAccess) return;
    const attached: MIDIInput[] = [];
    let cancelled = false;
    const handler = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const [status, note, vel] = e.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && vel > 0) {
        lastInteractRef.current = performance.now();
        startNote(note, Math.max(0.2, vel / 127));
      } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
        stopNote(note);
      }
    };
    navigator
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        access.inputs.forEach((inp) => {
          inp.onmidimessage = handler;
          attached.push(inp);
        });
      })
      .catch(() => {
        /* MIDI optional */
      });
    return () => {
      cancelled = true;
      attached.forEach((inp) => {
        inp.onmidimessage = null;
      });
    };
  }, [started, startNote, stopNote]);

  // ── Resize handling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onResize = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      sizeCanvas(cvs);
      const gpu = gpuRef.current;
      if (gpu) {
        gpu.ctx.configure({
          device: gpu.device,
          format: gpu.canvasFmt,
          alphaMode: "opaque",
        });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  // ── Teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      for (const v of voicesRef.current.values()) {
        try {
          v.oscs.forEach((o) => o.stop());
        } catch {
          /* ignore */
        }
      }
      voicesRef.current.clear();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* ignore */
        });
      }
      const gpu = gpuRef.current;
      if (gpu) {
        try {
          gpu.paramsBuf.destroy();
          gpu.partialsBuf.destroy();
          gpu.fieldBuf.destroy();
          gpu.rParamsBuf.destroy();
          gpu.device.destroy();
        } catch {
          /* ignore */
        }
      }
      gpuRef.current = null;
      glRef.current = null;
      ctxRef.current = null;
      masterRef.current = null;
    };
  }, []);

  // ── Keyboard pointer handlers ─────────────────────────────────────────────
  const onKeyDown = useCallback(
    (midi: number) => {
      lastInteractRef.current = performance.now();
      setAutoDemo(false);
      autoDemoRef.current = false;
      startNote(midi, 0.85);
    },
    [startNote],
  );
  const onKeyUp = useCallback(
    (midi: number) => {
      stopNote(midi);
    },
    [stopNote],
  );

  const tierLabel =
    tier === "webgpu"
      ? "WebGPU compute"
      : tier === "webgl2"
        ? "WebGL2 fragment"
        : tier === "canvas2d"
          ? "Canvas2D (CPU)"
          : "—";

  return (
    <main className="min-h-screen bg-[#040507] text-foreground px-4 py-6 sm:px-8 font-sans">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <Link
            href="/dream"
            className="text-muted-foreground hover:text-foreground text-sm font-mono"
          >
            ← dream lab
          </Link>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            Overtone Loom
          </h1>
          <p className="mt-2 text-base text-foreground max-w-3xl">
            Play notes and watch the live spectral-interference dissonance field
            between their overtones — consonant intervals lock dark and still,
            dissonant ones churn bright. The roughness is computed on the GPU.
          </p>
        </header>

        {!started ? (
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-lg bg-violet-400/15 border border-violet-300/40 px-6 py-2.5 text-base font-medium text-violet-200 hover:bg-violet-400/25 transition-colors"
          >
            ▸ Start — sound + GPU field
          </button>
        ) : (
          <>
            {/* status row */}
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-sm">
              <span className="text-violet-300/95">renderer: {tierLabel}</span>
              <span className="text-muted-foreground">
                held:{" "}
                <span className="text-foreground">
                  {heldNames.length ? heldNames.join(" ") : "—"}
                </span>
              </span>
              <span className="text-muted-foreground">
                total dissonance:{" "}
                <span className="text-violet-300/95 tabular-nums">
                  {dissReadout.toFixed(3)}
                </span>
              </span>
            </div>

            {notice && (
              <p className="mb-3 text-base text-violet-300/95 font-mono">
                ⚠ {notice}
              </p>
            )}
            {audioError && (
              <p className="mb-3 text-base text-violet-300 font-mono">
                {audioError}
              </p>
            )}

            {/* the field */}
            <div className="relative rounded-lg overflow-hidden border border-border bg-black">
              <canvas
                ref={canvasRef}
                className="block w-full"
                style={{ height: "320px" }}
              />
              {/* scalar dissonance meter */}
              <div className="absolute left-3 top-3 right-3 flex items-center gap-3 font-mono text-xs text-muted-foreground">
                <span>roughness</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-violet-300/90"
                    style={{
                      width: `${Math.min(100, dissReadout * 90)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="absolute left-3 bottom-2 font-mono text-xs text-muted-foreground/70">
                {F_MIN.toFixed(0)} Hz · log freq axis · {F_MAX.toFixed(0)} Hz
              </div>
            </div>

            {/* timbre controls */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted p-3">
                <label className="block text-sm font-mono text-foreground">
                  timbre brightness:{" "}
                  <span className="text-violet-300/95">{timbre.toFixed(2)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={timbre}
                  onChange={(e) => setTimbre(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-violet-400"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  shifts spectral energy up — bright timbres make more intervals
                  read as dissonant (the 2026 spectrum finding).
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted p-3">
                <label className="block text-sm font-mono text-foreground">
                  partials / voice:{" "}
                  <span className="text-violet-300/95">{partialCount}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={partialCount}
                  onChange={(e) => setPartialCount(parseInt(e.target.value, 10))}
                  className="mt-2 w-full accent-violet-400"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  additive harmonic stack per note. More partials → more
                  overtone pairs that can clash.
                </p>
              </div>
            </div>

            {/* keyboard */}
            <div className="mt-4 select-none">
              <div className="flex h-40 w-full gap-[2px] rounded-lg overflow-hidden border border-border">
                {KEYS.map((k) => (
                  <button
                    key={k.midi}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      onKeyDown(k.midi);
                    }}
                    onPointerUp={() => onKeyUp(k.midi)}
                    onPointerCancel={() => onKeyUp(k.midi)}
                    onPointerLeave={(e) => {
                      if (e.buttons) onKeyUp(k.midi);
                    }}
                    className={`flex-1 min-w-0 flex items-end justify-center pb-2 transition-colors ${
                      k.black
                        ? "bg-[#0a0d10] hover:bg-violet-400/20 text-muted-foreground"
                        : "bg-[#14181c] hover:bg-violet-400/25 text-muted-foreground"
                    }`}
                  >
                    <span className="font-mono text-[10px] leading-none">
                      {k.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setAutoDemo((a) => {
                      const next = !a;
                      // when re-enabling, fire the demo promptly
                      if (next) lastInteractRef.current = 0;
                      return next;
                    });
                  }}
                  className="min-h-[44px] rounded-lg border border-border px-4 py-2.5 text-base text-foreground hover:bg-accent"
                >
                  {autoDemo ? "⏸ pause auto-demo" : "▸ resume auto-demo"}
                </button>
                <p className="text-sm text-muted-foreground">
                  Press keys to stack a chord. Web MIDI is auto-connected if a
                  controller is present.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
