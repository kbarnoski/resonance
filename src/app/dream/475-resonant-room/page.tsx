"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Resonant Room (475) — Cycle 1 of "Resonant Room" spine
//
// THE ONE QUESTION: What if Karel's actual recorded piano were played into a
// room that rings back in the SAME KEY — a sympathetic resonance that swells
// while he plays, holds a warm in-key halo, and RESOLVES to the tonic /
// decays to silence when he stops?
//
// Core technique: N=8 Feedback Delay Network (FDN) reverb
//   - Jot / Stautner-Puckette lossless-feedback-matrix architecture
//   - Delay lines TUNED so comb peaks align with scale degrees of the chosen key
//   - Householder mixing matrix (energy-preserving, unitary)
//   - Per-line one-pole lowpass for HF-damps-faster warmth
//   - AudioWorklet (Blob URL) + ScriptProcessorNode fallback
//
// References:
//   Stautner & Puckette, "Designing Multichannel Reverberators,"
//     Computer Music Journal 6(1), 1982 — original N×N FDN concept.
//   Jean-Marc Jot & Antoine Chaigne, "Digital Delay Networks for Designing
//     Artificial Reverberators," AES 90th Convention, 1991 — lossless matrix,
//     per-line attenuation for frequency-dependent decay (the Jot FDN).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { FDN_WORKLET_SRC } from "./fdn-worklet-src";

// ── Key definitions ────────────────────────────────────────────────────────────

type KeyName = "C" | "D" | "E" | "G" | "A" | "Bb";

const KEY_OPTIONS: KeyName[] = ["C", "D", "E", "G", "A", "Bb"];

// ── WebGL2 lattice renderer ────────────────────────────────────────────────────

interface LatticeGL {
  resize: () => void;
  draw: (energies: Float32Array, swellAmount: number) => void;
  dispose: () => void;
}

// ── GLSL sources ──────────────────────────────────────────────────────────────

const EDGE_VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;
in vec2 a_pos;
in float a_energy;
out float v_energy;
void main() {
  v_energy = a_energy;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const EDGE_FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;
in float v_energy;
out vec4 fragColor;
void main() {
  // Deep-indigo background, amber-gold pulse on edges
  float e = clamp(v_energy, 0.0, 1.0);
  vec3 col = mix(vec3(0.08, 0.04, 0.22), vec3(1.0, 0.72, 0.18), e);
  fragColor = vec4(col * e * 1.6, e * 0.85);
}`;

const NODE_VERT_SRC = /* glsl */ `#version 300 es
precision mediump float;
in vec2 a_center;
in float a_energy;
in vec2 a_corner;
out float v_energy;
out vec2 v_uv;
void main() {
  v_energy = a_energy;
  // radius grows with energy, min 8px logical → map to clip space via uniform
  float r = max(0.018, a_energy * 0.12 + 0.018);
  v_uv = a_corner;
  gl_Position = vec4(a_center + a_corner * r, 0.0, 1.0);
}`;

const NODE_FRAG_SRC = /* glsl */ `#version 300 es
precision mediump float;
in float v_energy;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  float dist = length(v_uv);
  if (dist > 1.0) discard;
  float e = clamp(v_energy, 0.0, 1.0);
  // Core: bright warm-white; halo: amber; outer: deep-indigo glow
  float core = smoothstep(0.35, 0.0, dist);
  float halo = smoothstep(1.0, 0.35, dist) * (1.0 - core);
  vec3 coreCol = vec3(1.0, 0.96, 0.82);
  vec3 haloCol = vec3(0.98, 0.58, 0.08);
  vec3 col = coreCol * core + haloCol * halo;
  float alpha = (core + halo * 0.7) * (0.25 + e * 0.75);
  fragColor = vec4(col, alpha);
}`;

// ── Build / link a WebGL2 shader program ──────────────────────────────────────

function buildProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string
): WebGLProgram | null {
  function compile(type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// ── Compute node positions on a ring ──────────────────────────────────────────

function ringPositions(n: number): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    positions.push([Math.cos(angle) * 0.62, Math.sin(angle) * 0.62]);
  }
  return positions;
}

// ── Build draw call data ───────────────────────────────────────────────────────

function buildEdgeData(
  positions: Array<[number, number]>,
  energies: Float32Array
): Float32Array {
  // Connect each node to its two neighbours (ring) + to the opposite (mixing)
  const n = positions.length;
  const lines: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const e = (energies[i] + energies[j]) * 0.5;
    lines.push(positions[i][0], positions[i][1], e);
    lines.push(positions[j][0], positions[j][1], e);
    // Cross-connect opposite node (Householder full-mix feel)
    const k = (i + 4) % n;
    const e2 = (energies[i] + energies[k]) * 0.3;
    lines.push(positions[i][0], positions[i][1], e2);
    lines.push(positions[k][0], positions[k][1], e2);
  }
  return new Float32Array(lines);
}

function buildNodeData(
  positions: Array<[number, number]>,
  energies: Float32Array
): Float32Array {
  // Each node = 2 triangles (quad) with corners in [-1,1]^2
  const corners: Array<[number, number]> = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1,  1], [-1, 1],
  ];
  const verts: number[] = [];
  for (let i = 0; i < positions.length; i++) {
    const [cx, cy] = positions[i];
    const e = energies[i];
    for (const [ux, uy] of corners) {
      verts.push(cx, cy, e, ux, uy);
    }
  }
  return new Float32Array(verts);
}

// ── Create the lattice GL context ──────────────────────────────────────────────

function createLatticeGL(canvas: HTMLCanvasElement): LatticeGL | null {
  const glRaw = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: true,
  }) as WebGL2RenderingContext | null;
  if (!glRaw) return null;
  // Alias as non-nullable so closures see the narrowed type
  const gl: WebGL2RenderingContext = glRaw;

  const edgeProg = buildProgram(gl, EDGE_VERT_SRC, EDGE_FRAG_SRC);
  const nodeProg = buildProgram(gl, NODE_VERT_SRC, NODE_FRAG_SRC);
  if (!edgeProg || !nodeProg) return null;

  // Buffers
  const edgeVao = gl.createVertexArray()!;
  const edgeBuf = gl.createBuffer()!;
  gl.bindVertexArray(edgeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
  const eLoc = gl.getAttribLocation(edgeProg, "a_pos");
  const eELoc = gl.getAttribLocation(edgeProg, "a_energy");
  gl.enableVertexAttribArray(eLoc);
  gl.enableVertexAttribArray(eELoc);
  gl.vertexAttribPointer(eLoc, 2, gl.FLOAT, false, 12, 0);
  gl.vertexAttribPointer(eELoc, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);

  const nodeVao = gl.createVertexArray()!;
  const nodeBuf = gl.createBuffer()!;
  gl.bindVertexArray(nodeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
  const nCLoc = gl.getAttribLocation(nodeProg, "a_center");
  const nELoc = gl.getAttribLocation(nodeProg, "a_energy");
  const nCorLoc = gl.getAttribLocation(nodeProg, "a_corner");
  gl.enableVertexAttribArray(nCLoc);
  gl.enableVertexAttribArray(nELoc);
  gl.enableVertexAttribArray(nCorLoc);
  gl.vertexAttribPointer(nCLoc,   2, gl.FLOAT, false, 20, 0);
  gl.vertexAttribPointer(nELoc,   1, gl.FLOAT, false, 20, 8);
  gl.vertexAttribPointer(nCorLoc, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);

  const positions = ringPositions(8);

  function resize() {
    const w = canvas.clientWidth * window.devicePixelRatio;
    const h = canvas.clientHeight * window.devicePixelRatio;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function draw(energies: Float32Array, swellAmount: number) {
    // Smoothly pump energies for the visual: scale by swellAmount to amplify
    const scaled = new Float32Array(energies.length);
    for (let i = 0; i < energies.length; i++) {
      scaled[i] = Math.min(1.0, energies[i] * (1.0 + swellAmount * 6.0));
    }

    gl.clearColor(0.039, 0.020, 0.078, 1.0); // #0a0514
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive

    // Draw edges
    const edgeData = buildEdgeData(positions, scaled);
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, edgeData, gl.DYNAMIC_DRAW);
    gl.useProgram(edgeProg);
    gl.bindVertexArray(edgeVao);
    gl.drawArrays(gl.LINES, 0, edgeData.length / 3);

    // Draw nodes
    const nodeData = buildNodeData(positions, scaled);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, nodeData, gl.DYNAMIC_DRAW);
    gl.useProgram(nodeProg);
    gl.bindVertexArray(nodeVao);
    gl.drawArrays(gl.TRIANGLES, 0, nodeData.length / 5);

    gl.bindVertexArray(null);
  }

  function dispose() {
    gl.deleteBuffer(edgeBuf);
    gl.deleteBuffer(nodeBuf);
    gl.deleteVertexArray(edgeVao);
    gl.deleteVertexArray(nodeVao);
    gl.deleteProgram(edgeProg);
    gl.deleteProgram(nodeProg);
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }

  resize();

  return { resize, draw, dispose };
}

// ── Warm synthesized piano-chord fallback ─────────────────────────────────────

interface SynthState {
  stop: () => void;
}

// C major progression: C – Am – F – G7 – Cmaj9
const SYNTH_CHORDS: Array<{ freqs: number[]; dur: number }> = [
  { freqs: [130.81, 164.81, 196.00, 261.63], dur: 6.0 },  // C
  { freqs: [110.00, 164.81, 220.00, 261.63], dur: 5.0 },  // Am
  { freqs: [174.61, 220.00, 261.63, 349.23], dur: 5.0 },  // F
  { freqs: [196.00, 246.94, 293.66, 369.99], dur: 4.0 },  // G7
  { freqs: [130.81, 164.81, 196.00, 293.66, 329.63], dur: 8.0 }, // Cmaj9
];

function buildSynthPiano(ctx: AudioContext, dest: AudioNode): SynthState {
  const audioNodes: AudioNode[] = [];
  const timers: number[] = [];
  let chordIdx = 0;
  let stopped = false;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.28, ctx.currentTime);
  masterGain.connect(dest);
  audioNodes.push(masterGain);

  function playChord() {
    if (stopped) return;
    const chord = SYNTH_CHORDS[chordIdx % SYNTH_CHORDS.length];
    chordIdx++;
    const now = ctx.currentTime;

    chord.freqs.forEach((freq, fi) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      // Slight detuning for chorus warmth
      osc.detune.setValueAtTime((fi % 2 === 0 ? 3 : -3), now);
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.18, now + 0.08);
      env.gain.setTargetAtTime(0.10, now + 0.5, 1.2);
      env.gain.setTargetAtTime(0, now + chord.dur - 0.5, 0.8);
      osc.connect(env);
      env.connect(masterGain);
      osc.start(now);
      osc.stop(now + chord.dur + 0.5);
      audioNodes.push(osc, env);
    });

    if (!stopped) {
      timers.push(window.setTimeout(playChord, chord.dur * 1000 - 200));
    }
  }

  playChord();
  return {
    stop() {
      stopped = true;
      timers.forEach((id) => window.clearTimeout(id));
      audioNodes.forEach((n) => {
        try { n.disconnect(); } catch { /* ok */ }
      });
    },
  };
}

// ── ScriptProcessorNode FDN fallback (mirrors worklet DSP exactly) ────────────

interface FdnScriptState {
  node: ScriptProcessorNode;
  getEnergy: () => Float32Array;
  setG: (g: number) => void;
  retune: (key: KeyName) => void;
  disconnect: () => void;
}

function buildFdnScriptProcessor(ctx: AudioContext): FdnScriptState {
  const N = 8;
  const SR = ctx.sampleRate;
  const MAX_DELAY = 4096;
  const bufSize = 512;

  const delays = new Int32Array(N);
  const ptrs   = new Int32Array(N);
  const bufs   = Array.from({ length: N }, () => new Float32Array(MAX_DELAY));
  const lp     = new Float32Array(N);
  const lpState = new Float32Array(N);
  const H      = new Float32Array(N * N);
  const Htmp   = new Float32Array(N);
  let gVal     = 0.0;

  // Householder matrix
  const twoOverN = 2.0 / N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      H[i * N + j] = i === j ? 1.0 - twoOverN : -twoOverN;
    }
  }

  function applyKey(key: KeyName) {
    const TONICS: Record<KeyName, number> = {
      C: 48, D: 50, E: 52, G: 55, A: 57, Bb: 58,
    };
    const tonicMidi = TONICS[key];
    const INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12];
    const PRIME_NUDGE = [0, 1, 3, 5, 7, 11, 13, 17];
    for (let i = 0; i < N; i++) {
      const midi = tonicMidi + INTERVALS[i];
      const freq = 440.0 * Math.pow(2.0, (midi - 69) / 12.0);
      const L = Math.round(SR / freq) + PRIME_NUDGE[i];
      delays[i] = Math.max(32, Math.min(L, MAX_DELAY - 1));
      ptrs[i] = 0;
      bufs[i].fill(0);
      lpState[i] = 0;
      const fc = 8000.0 - (i / (N - 1)) * 4000.0;
      lp[i] = Math.exp(-2.0 * Math.PI * fc / SR);
    }
  }

  applyKey("C");

  // RMS accumulators
  const rmsAcc = new Float32Array(N);
  let rmsCount = 0;
  const rmsInterval = Math.round(SR / 40);
  const energyOut = new Float32Array(N);
  let lastEnergy = new Float32Array(N);

  const spn = ctx.createScriptProcessor(bufSize, 2, 2);

  spn.onaudioprocess = (ev: AudioProcessingEvent) => {
    const inL = ev.inputBuffer.getChannelData(0);
    const outL = ev.outputBuffer.getChannelData(0);
    const outR = ev.outputBuffer.getChannelData(1);
    const len = inL.length;
    const g = gVal;

    for (let n = 0; n < len; n++) {
      const inp = inL[n];
      // Read tails + apply LP
      for (let i = 0; i < N; i++) {
        const buf = bufs[i];
        const len_d = delays[i];
        const readIdx = ptrs[i];
        let s = buf[readIdx];
        const lpC = lp[i];
        s = (1.0 - lpC) * s + lpC * lpState[i];
        lpState[i] = s;
        Htmp[i] = s;
        rmsAcc[i] += s * s;
        ptrs[i] = (readIdx + 1) % len_d;
      }
      // Householder mix + write back
      for (let i = 0; i < N; i++) {
        let mix = 0.0;
        const row = i * N;
        for (let j = 0; j < N; j++) mix += H[row + j] * Htmp[j];
        const writeVal = g * mix + inp * 0.25;
        const buf = bufs[i];
        const len_d = delays[i];
        const writeIdx = (ptrs[i] === 0 ? len_d : ptrs[i]) - 1;
        buf[(writeIdx + len_d) % len_d] = writeVal;
      }
      // Sum wet
      let wet = 0.0;
      for (let i = 0; i < N; i++) wet += Htmp[i];
      wet = wet * (0.6 / N);
      outL[n] = wet;
      outR[n] = wet;
    }

    // RMS report
    rmsCount += len;
    if (rmsCount >= rmsInterval) {
      rmsCount = 0;
      const invC = 1.0 / rmsInterval;
      for (let i = 0; i < N; i++) {
        energyOut[i] = Math.sqrt(rmsAcc[i] * invC);
        rmsAcc[i] = 0;
      }
      lastEnergy = new Float32Array(energyOut);
    }
  };

  return {
    node: spn,
    getEnergy: () => lastEnergy,
    setG: (g: number) => { gVal = g; },
    retune: (key: KeyName) => applyKey(key),
    disconnect: () => {
      try { spn.disconnect(); } catch { /* ok */ }
    },
  };
}

// ── Audio context + graph builder ─────────────────────────────────────────────

type FdnMode = "worklet" | "script";

interface AudioGraph {
  fdnMode: FdnMode;
  setG: (g: number) => void;
  setKey: (key: KeyName) => void;
  getEnergy: () => Float32Array;
  stop: () => void;
}

// ── Build the full audio graph ────────────────────────────────────────────────

async function buildAudioGraph(
  audioBuf: AudioBuffer | null,
  key: KeyName,
  onEnergy: (e: Float32Array) => void
): Promise<AudioGraph> {
  const ctx = new AudioContext({ sampleRate: 44100 });
  await ctx.resume();

  // Master chain: masterGain → limiter → destination
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.85, ctx.currentTime);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-3, ctx.currentTime);
  limiter.knee.setValueAtTime(0, ctx.currentTime);
  limiter.ratio.setValueAtTime(20, ctx.currentTime);
  limiter.attack.setValueAtTime(0.001, ctx.currentTime);
  limiter.release.setValueAtTime(0.05, ctx.currentTime);
  masterGain.connect(limiter);
  limiter.connect(ctx.destination);

  // Dry gain
  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(0.7, ctx.currentTime);
  dryGain.connect(masterGain);

  // Wet gain (FDN output)
  const wetGain = ctx.createGain();
  wetGain.gain.setValueAtTime(0.55, ctx.currentTime);
  wetGain.connect(masterGain);

  let workletNode: AudioWorkletNode | null = null;
  let scriptState: FdnScriptState | null = null;
  let fdnMode: FdnMode = "worklet";
  let fdnInput: AudioNode;
  let fdnOutput: AudioNode;

  // Try AudioWorklet first
  try {
    const blob = new Blob([FDN_WORKLET_SRC], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);
    workletNode = new AudioWorkletNode(ctx, "fdn-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    workletNode.port.onmessage = (ev) => {
      if (ev.data?.type === "energy") {
        onEnergy(ev.data.energy as Float32Array);
      }
    };
    // Retune to chosen key
    workletNode.port.postMessage({ type: "retune", key });
    fdnInput = workletNode;
    fdnOutput = workletNode;
    fdnMode = "worklet";
  } catch {
    // Fallback: ScriptProcessorNode
    fdnMode = "script";
    scriptState = buildFdnScriptProcessor(ctx);
    scriptState.retune(key);
    fdnInput = scriptState.node;
    fdnOutput = scriptState.node;
    // Poll energy at ~40fps
    const energyInterval = window.setInterval(() => {
      if (scriptState) onEnergy(scriptState.getEnergy());
    }, 25);
    // Attach cleanup to scriptState.disconnect
    const origDisconnect = scriptState.disconnect.bind(scriptState);
    scriptState.disconnect = () => {
      window.clearInterval(energyInterval);
      origDisconnect();
    };
  }

  // Source
  let sourceNode: AudioBufferSourceNode | null = null;
  let synthState: SynthState | null = null;

  if (audioBuf) {
    // Real piano via AudioBuffer
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuf;
    sourceNode.loop = true;
    sourceNode.connect(dryGain);
    sourceNode.connect(fdnInput);
    sourceNode.start();
  } else {
    // Synth fallback: pipe synth output through FDN
    synthState = buildSynthPiano(ctx, dryGain);
    // Also pipe synth to FDN input
    const synthFdnGain = ctx.createGain();
    synthFdnGain.gain.setValueAtTime(0.8, ctx.currentTime);
    const synthFdnSource = buildSynthPiano(ctx, synthFdnGain);
    synthFdnGain.connect(fdnInput);
    // Store both synth states
    const originalStop = synthState.stop.bind(synthState);
    synthState.stop = () => {
      originalStop();
      synthFdnSource.stop();
      try { synthFdnGain.disconnect(); } catch { /* ok */ }
    };
  }

  // FDN output → wet gain → master
  fdnOutput.connect(wetGain);

  function setG(g: number) {
    const clamped = Math.max(0, Math.min(0.97, g));
    if (workletNode) {
      const param = workletNode.parameters.get("g");
      if (param) {
        param.setTargetAtTime(clamped, ctx.currentTime, 0.05);
      }
    } else if (scriptState) {
      scriptState.setG(clamped);
    }
  }

  function setKey(k: KeyName) {
    if (workletNode) {
      workletNode.port.postMessage({ type: "retune", key: k });
    } else if (scriptState) {
      scriptState.retune(k);
    }
  }

  function getEnergy(): Float32Array {
    if (scriptState) return scriptState.getEnergy();
    return new Float32Array(8);
  }

  function stop() {
    try { sourceNode?.stop(); } catch { /* ok */ }
    synthState?.stop();
    try { workletNode?.disconnect(); } catch { /* ok */ }
    scriptState?.disconnect();
    try { dryGain.disconnect(); } catch { /* ok */ }
    try { wetGain.disconnect(); } catch { /* ok */ }
    try { masterGain.disconnect(); } catch { /* ok */ }
    try { limiter.disconnect(); } catch { /* ok */ }
    ctx.close().catch(() => { /* ok */ });
  }

  return { fdnMode, setG, setKey, getEnergy, stop };
}

// ── Main page component ───────────────────────────────────────────────────────

type AppState = "idle" | "loading" | "running" | "error";

export default function ResonantRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latticeRef = useRef<LatticeGL | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);
  const energyRef = useRef<Float32Array>(new Float32Array(8));
  const swellRef = useRef(0.0);       // 0..1 — driven by hold gesture
  const gTargetRef = useRef(0.0);     // target feedback gain
  const gCurrentRef = useRef(0.0);    // smoothed actual g sent to DSP
  const rafRef = useRef(0);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isMountedRef = useRef(true);
  const swellingRef = useRef(false);
  const appStateRef = useRef<AppState>("idle");
  const keyRef = useRef<KeyName>("C");

  const [appState, setAppState] = useState<AppState>("idle");
  const [audioMode, setAudioMode] = useState<"real" | "synth">("real");
  const [fdnMode, setFdnMode] = useState<FdnMode>("worklet");
  const [key, setKey] = useState<KeyName>("C");

  // Keep refs in sync with state so async callbacks read fresh values
  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { keyRef.current = key; }, [key]);
  const [webglOk, setWebglOk] = useState(true);
  const [swellHeld, setSwellHeld] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState(3);

  // ── Cancel auto-start on user gesture ──────────────────────────────────────
  const cancelAutoStart = useCallback(() => {
    if (autoStartTimerRef.current !== null) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
  }, []);

  // ── Start function ─────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    cancelAutoStart();
    if (appStateRef.current !== "idle") return;
    setAppState("loading");

    // Try to load Karel's real piano
    let audioBuf: AudioBuffer | null = null;
    let usingRealAudio = false;
    try {
      const ctx0 = new AudioContext();
      const res = await fetch("/api/audio/549fc519-f7fc-4c38-a771-adaad2edbc81");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      audioBuf = await ctx0.decodeAudioData(ab);
      await ctx0.close();
      usingRealAudio = true;
    } catch {
      audioBuf = null;
      usingRealAudio = false;
    }

    if (!isMountedRef.current) return;
    setAudioMode(usingRealAudio ? "real" : "synth");

    // Build audio graph
    let graph: AudioGraph;
    try {
      graph = await buildAudioGraph(audioBuf, keyRef.current, (e: Float32Array) => {
        energyRef.current = e;
      });
    } catch {
      setAppState("error");
      return;
    }

    if (!isMountedRef.current) {
      graph.stop();
      return;
    }
    graphRef.current = graph;
    setFdnMode(graph.fdnMode);

    // Init WebGL2 lattice
    if (canvasRef.current) {
      const lat = createLatticeGL(canvasRef.current);
      if (lat) {
        latticeRef.current = lat;
        setWebglOk(true);
      } else {
        setWebglOk(false);
      }
    }

    setAppState("running");

    // Render loop
    function frame() {
      if (!isMountedRef.current) return;
      rafRef.current = requestAnimationFrame(frame);

      // Smooth g ramp
      const gTarget = gTargetRef.current;
      const gPrev = gCurrentRef.current;
      const speed = gTarget > gPrev ? 0.025 : 0.012; // ramp up faster than down
      const gNew = gPrev + (gTarget - gPrev) * speed;
      gCurrentRef.current = gNew;

      // Swell visual
      swellRef.current = swellRef.current + (swellingRef.current ? 0.04 : -0.03);
      swellRef.current = Math.max(0, Math.min(1, swellRef.current));

      // Apply to DSP
      graphRef.current?.setG(gNew);

      // Augment energy display
      const e = energyRef.current;

      // Draw lattice
      const lat = latticeRef.current;
      if (lat) {
        lat.draw(e, swellRef.current);
      }
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [cancelAutoStart]); // appState and key read via refs; start is one-shot

  // ── Key change handler ─────────────────────────────────────────────────────
  const handleKeyChange = useCallback((k: KeyName) => {
    setKey(k);
    graphRef.current?.setKey(k);
  }, []);

  // ── Swell hold handlers ────────────────────────────────────────────────────
  const handleSwellStart = useCallback(() => {
    cancelAutoStart();
    swellingRef.current = true;
    setSwellHeld(true);
    gTargetRef.current = 0.95;
  }, [cancelAutoStart]);

  const handleSwellEnd = useCallback(() => {
    swellingRef.current = false;
    setSwellHeld(false);
    gTargetRef.current = 0.0;
  }, []);

  // ── Auto-start countdown ───────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "idle") return;

    let count = 3;
    setAutoCountdown(count);

    const tick = () => {
      count--;
      setAutoCountdown(count);
      if (count <= 0) {
        // Use a small timeout so state flush completes before handleStart reads it
        autoStartTimerRef.current = setTimeout(() => {
          void handleStart();
        }, 50);
      } else {
        autoStartTimerRef.current = setTimeout(tick, 1000);
      }
    };
    autoStartTimerRef.current = setTimeout(tick, 1000);

    return () => {
      if (autoStartTimerRef.current !== null) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only run once on mount

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      latticeRef.current?.resize();
    });
    ro.observe(canvas);
    resizeObserverRef.current = ro;
    return () => ro.disconnect();
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAutoStart();
      cancelAnimationFrame(rafRef.current);
      latticeRef.current?.dispose();
      graphRef.current?.stop();
      resizeObserverRef.current?.disconnect();
    };
  }, [cancelAutoStart]);

  // ── Keyboard: space = hold swell ──────────────────────────────────────────
  useEffect(() => {
    if (appState !== "running") return;
    function onDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        handleSwellStart();
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        handleSwellEnd();
      }
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [appState, handleSwellStart, handleSwellEnd]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ background: "#0a0514" }}
      onPointerDown={cancelAutoStart}
      onClick={cancelAutoStart}
    >
      {/* Canvas — WebGL2 lattice */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: webglOk ? "block" : "none" }}
        aria-hidden="true"
      />

      {/* WebGL unavailable notice */}
      {!webglOk && appState === "running" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-amber-300/95 text-base px-6 text-center">
            WebGL2 not available — audio FDN is still playing.
          </p>
        </div>
      )}

      {/* UI overlay */}
      <div className="relative z-10 flex flex-col min-h-screen px-6 py-8 pointer-events-none">

        {/* Header */}
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-white/95 tracking-tight">
            Resonant Room
          </h1>
          <p className="text-base text-white/75">
            Karel&apos;s piano plays into a room tuned to its key — hold Swell to fill
            the space, release to let it ring out and resolve.
          </p>
        </header>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Controls */}
        <div className="flex flex-col gap-4 pointer-events-auto">

          {/* Fallback / FDN mode notices */}
          {appState === "running" && audioMode === "synth" && (
            <p className="text-amber-300/95 text-base">
              Audio fallback — synthesized stand-in playing.
            </p>
          )}
          {appState === "running" && fdnMode === "script" && (
            <p className="text-amber-300/95 text-base">
              AudioWorklet unavailable — ScriptProcessorNode fallback active.
            </p>
          )}

          {/* Key selector */}
          {appState === "running" && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-white/75 text-base mr-1">Key:</span>
              {KEY_OPTIONS.map((k) => (
                <button
                  key={k}
                  onClick={() => handleKeyChange(k)}
                  className={[
                    "min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium transition-all",
                    key === k
                      ? "bg-amber-500/90 text-white shadow-lg shadow-amber-500/30"
                      : "bg-white/10 text-white/80 hover:bg-white/20",
                  ].join(" ")}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          {/* Swell button */}
          {appState === "running" && (
            <div className="flex gap-4 items-center">
              <button
                className={[
                  "min-h-[44px] px-6 py-2.5 rounded-xl text-base font-semibold transition-all select-none",
                  swellHeld
                    ? "bg-amber-500 text-white scale-105 shadow-xl shadow-amber-500/50 ring-2 ring-amber-300"
                    : "bg-white/15 text-white/90 hover:bg-white/25 ring-1 ring-white/20",
                ].join(" ")}
                onPointerDown={(e) => { e.preventDefault(); handleSwellStart(); }}
                onPointerUp={handleSwellEnd}
                onPointerLeave={handleSwellEnd}
                aria-pressed={swellHeld}
              >
                {swellHeld ? "✦ Swelling…" : "Hold to Swell"}
              </button>
              <span className="text-white/60 text-base hidden sm:inline">
                or hold Space
              </span>
            </div>
          )}

          {/* Start button / countdown */}
          {appState === "idle" && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => void handleStart()}
                className="min-h-[44px] w-fit px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-base font-semibold transition-all shadow-lg shadow-amber-500/30"
              >
                Start
              </button>
              {autoCountdown > 0 && (
                <p className="text-white/60 text-base">
                  Auto-starting in {autoCountdown}…
                </p>
              )}
            </div>
          )}

          {/* Loading */}
          {appState === "loading" && (
            <p className="text-white/75 text-base">Loading…</p>
          )}

          {/* Error */}
          {appState === "error" && (
            <p className="text-rose-300 text-base">
              Audio engine failed to start. Please refresh and try again.
            </p>
          )}

          {/* Design notes toggle */}
          <div>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-white/50 text-base hover:text-white/75 transition-colors min-h-[44px] px-2 py-2.5"
            >
              {showNotes ? "Hide notes ↑" : "Design notes ↓"}
            </button>
            {showNotes && (
              <div className="mt-2 p-4 rounded-xl bg-white/5 border border-white/10 max-w-lg">
                <p className="text-white/80 text-base leading-relaxed">
                  <strong className="text-white/95">FDN Architecture:</strong> N=8 delay
                  lines with a Householder mixing matrix (lossless, unitary). Each line is
                  tuned so its first comb peak aligns to a scale degree of the chosen key.
                  Per-line one-pole lowpass causes HF to decay faster — natural room warmth.
                  Hold Swell to ramp feedback gain g → 0.95 (room fills); release to ramp
                  g → 0 (room rings out and resolves to silence).
                </p>
                <p className="text-white/60 text-base mt-2">
                  References: Stautner & Puckette (1982); Jot & Chaigne AES-90 (1991).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-white/40 text-base">
            Resonant Room · dream lab 475 · WebGL2 + FDN reverb
          </p>
        </div>
      </div>
    </main>
  );
}
