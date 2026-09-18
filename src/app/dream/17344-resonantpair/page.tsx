"use client";

/* ── 17344 · Resonant Pair ───────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your two hands held DIFFERENT powers over one solo-piano
 *  recording — one hand the melodic VOICE, one hand the harmonic GROUND — and the
 *  two only fused into one coherent standing figure when you negotiated them into
 *  resonance?
 *
 *  This is an ASYMMETRIC two-hand camera-conducting piece: each hand does a
 *  genuinely DIFFERENT job (not a mirror). Karel's one real take is loaded once
 *  into an AudioBuffer and both hands act on the SAME buffer.
 *
 *    · RIGHT hand = the VOICE (figure / melody). A granular scrubber reading his
 *      take: cx → playhead, height → playback rate (0.6×…1.8×, pitch), open →
 *      grain density (~6…50/s), fist → mute. Bright, articulated, panned RIGHT.
 *    · LEFT hand = the GROUND (harmonic bed). A sustained resonant wash of the
 *      SAME take through a BiquadFilter: cx → filter center (~120…3000 Hz, log),
 *      height → wash level, open → resonance Q (0.5…12), fist → mute. Dark,
 *      sustained, panned LEFT.
 *
 *  NEGOTIATION → resolve ∈ [0,1]: rises when the two hands ALIGN — primarily when
 *  the LEFT filter center matches the spectral centroid the RIGHT granular voice
 *  is producing (centroid read from master.analyser each frame), secondarily when
 *  their levels balance. Smoothed with a ~0.15 s time constant.
 *    High resolve → the two shader wave systems CONSTRUCTIVELY interfere into a
 *      coherent warm standing-wave / moiré lattice; pans collapse toward center;
 *      a tame, safeMaster-capped harmonic reinforcement rings.
 *    Low resolve  → DESTRUCTIVE: the field tears into two contending wave bodies
 *      drifting apart, desaturating toward warm-ash.
 *
 *  VISUAL: a raw WebGL2 full-viewport fragment shader computing the two wave
 *  systems and their interference, warm palette only (ember → amber → gold →
 *  near-white at lock). NO film-grain / noise overlay — ordered structure only.
 *  Canvas2D interference fallback if WebGL2 is unavailable.
 *
 *  AUDIO is only Karel's real decoded take, granulated + filtered, always through
 *  the shared safeMaster ear-safety bus. No oscillators, no mic. See README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  computeHandFeatures,
  type HandLandmarkerInst,
  type Landmark,
  type Category,
} from "../_shared/cameraTracking";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Interplay")?.id ?? REAL_TRACKS[0].id;

const LOOKAHEAD = 0.1; // s — grain scheduling horizon (latency budget)
const GRAIN_MIN = 0.03; // s (30 ms)
const GRAIN_MAX = 0.12; // s (120 ms)
const DENSITY_MIN = 6; // grains/s at fist-closed
const DENSITY_MAX = 50; // grains/s at fully open
const VOICE_RATE_LO = 0.6;
const VOICE_RATE_HI = 1.8;
const GROUND_HZ_LO = 120;
const GROUND_HZ_HI = 3000;
const GROUND_Q_LO = 0.5;
const GROUND_Q_HI = 12;

const RESOLVE_TC = 0.15; // s — negotiation smoothing time constant
const SMOOTH_TC = 0.12; // s — gesture → parameter smoothing

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
// raised-cosine (Hann) window, unit peak
const HANN_N = 24;
const HANN = (() => {
  const a = new Float32Array(HANN_N);
  for (let i = 0; i < HANN_N; i++) {
    a[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (HANN_N - 1));
  }
  return a;
})();

// ── audio engine ──────────────────────────────────────────────────────────────
interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  title: string;
  // VOICE (right hand, granular)
  voiceGain: GainNode;
  voicePan: StereoPannerNode;
  nextGrain: number;
  // GROUND (left hand, resonant wash)
  groundSrc: AudioBufferSourceNode;
  groundFilter: BiquadFilterNode;
  groundGain: GainNode;
  groundPan: StereoPannerNode;
  // harmonic reinforcement ring (rings at lock)
  ringFilter: BiquadFilterNode;
  ringGain: GainNode;
}

// smoothed control state driving both audio + shader
interface Controls {
  // VOICE
  voicePresent: boolean;
  voiceFist: boolean;
  play: number; // 0..1 playhead
  rate: number; // 0.6..1.8
  density: number; // grains/s
  voiceLevel: number; // 0..1 (derived loudness)
  // GROUND
  groundPresent: boolean;
  groundFist: boolean;
  centerHz: number; // 120..3000
  washLevel: number; // 0..1
  q: number; // 0.5..12
  // negotiation
  resolve: number; // 0..1
}

function makeAudioEngine(
  ctx: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
  title: string,
): AudioEngine {
  // VOICE bus
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0;
  const voicePan = ctx.createStereoPanner();
  voicePan.pan.value = 0.35;
  voiceGain.connect(voicePan);
  voicePan.connect(master.input);

  // GROUND bus — a resonant band of his SAME take, sustained
  const groundSrc = ctx.createBufferSource();
  groundSrc.buffer = buffer;
  groundSrc.loop = true;
  groundSrc.playbackRate.value = 0.7; // slow / dark, background
  const groundFilter = ctx.createBiquadFilter();
  groundFilter.type = "bandpass";
  groundFilter.frequency.value = 500;
  groundFilter.Q.value = 3;
  const groundGain = ctx.createGain();
  groundGain.gain.value = 0;
  const groundPan = ctx.createStereoPanner();
  groundPan.pan.value = -0.35;
  groundSrc.connect(groundFilter);
  groundFilter.connect(groundGain);
  groundGain.connect(groundPan);
  groundPan.connect(master.input);

  // harmonic reinforcement ring — a tame parallel peaking resonance of his own
  // signal at the matched frequency, only audible near lock (safeMaster-capped)
  const ringFilter = ctx.createBiquadFilter();
  ringFilter.type = "peaking";
  ringFilter.frequency.value = 500;
  ringFilter.Q.value = 10;
  ringFilter.gain.value = 8;
  const ringGain = ctx.createGain();
  ringGain.gain.value = 0;
  groundSrc.connect(ringFilter);
  ringFilter.connect(ringGain);
  ringGain.connect(master.input);

  groundSrc.start();

  return {
    ctx,
    master,
    buffer,
    title,
    voiceGain,
    voicePan,
    nextGrain: 0,
    groundSrc,
    groundFilter,
    groundGain,
    groundPan,
    ringFilter,
    ringGain,
  };
}

// schedule granular VOICE grains within the lookahead window (synchronous path)
function scheduleVoice(a: AudioEngine, c: Controls, now: number): void {
  const active = c.voicePresent && !c.voiceFist;
  a.voiceGain.gain.setTargetAtTime(active ? 0.95 : 0, now, 0.08);
  if (!active) {
    a.nextGrain = Math.max(a.nextGrain, now);
    return;
  }
  const density = clamp(c.density, DENSITY_MIN, DENSITY_MAX);
  const interval = 1 / density;
  if (a.nextGrain < now) a.nextGrain = now;
  const dur = a.buffer.duration;
  const rate = c.rate;
  // denser grains individually quieter so the voice stays balanced
  const amp = 0.55 * Math.sqrt(8 / density);

  while (a.nextGrain < now + LOOKAHEAD) {
    const t = a.nextGrain;
    const gdur = GRAIN_MIN + Math.random() * (GRAIN_MAX - GRAIN_MIN);
    const jitter = (Math.random() - 0.5) * 0.012;
    let offset = c.play * dur + jitter;
    offset = clamp(offset, 0, Math.max(0, dur - gdur * rate - 0.01));

    const src = a.ctx.createBufferSource();
    src.buffer = a.buffer;
    src.playbackRate.value = rate;
    const env = a.ctx.createGain();
    env.gain.value = 0;
    src.connect(env);
    env.connect(a.voiceGain);

    // raised-cosine (Hann) envelope
    const curve = new Float32Array(HANN_N);
    for (let i = 0; i < HANN_N; i++) curve[i] = HANN[i] * amp;
    try {
      env.gain.setValueCurveAtTime(curve, t, gdur);
    } catch {
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(amp, t + gdur * 0.4);
      env.gain.linearRampToValueAtTime(0, t + gdur);
    }
    src.start(t, offset, gdur * rate + 0.02);
    src.stop(t + gdur + 0.03);
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
      } catch {
        /* already gone */
      }
    };
    a.nextGrain += interval;
  }
}

// apply the GROUND + resolve-driven reinforcement, all smoothed
function applyGroundAndResolve(a: AudioEngine, c: Controls): void {
  const now = a.ctx.currentTime;
  const TC = SMOOTH_TC;
  const gActive = c.groundPresent && !c.groundFist;
  a.groundFilter.frequency.setTargetAtTime(c.centerHz, now, TC);
  a.groundFilter.Q.setTargetAtTime(c.q, now, TC);
  a.groundGain.gain.setTargetAtTime(gActive ? c.washLevel * 0.9 : 0, now, TC);

  // pans collapse toward center as the pair locks
  const split = 0.35 * (1 - c.resolve * 0.85);
  a.voicePan.pan.setTargetAtTime(split, now, TC);
  a.groundPan.pan.setTargetAtTime(-split, now, TC);

  // harmonic reinforcement ring — tracks the matched frequency, tame + only
  // near lock, and only when the ground is actually sounding.
  a.ringFilter.frequency.setTargetAtTime(c.centerHz, now, TC);
  const ring = gActive ? c.resolve * c.resolve * 0.14 : 0;
  a.ringGain.gain.setTargetAtTime(ring, now, TC);

  // a gentle overall lift as the two fuse (safeMaster caps the ceiling)
  a.master.setGain(0.55 + c.resolve * 0.2);
}

function teardownAudio(a: AudioEngine): void {
  try {
    a.groundSrc.stop();
  } catch {
    /* already stopped */
  }
  for (const n of [
    a.voiceGain,
    a.voicePan,
    a.groundSrc,
    a.groundFilter,
    a.groundGain,
    a.groundPan,
    a.ringFilter,
    a.ringGain,
  ]) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  a.master.disconnect();
}

// ── spectral analysis from the tamed master signal ───────────────────────────
interface Spectrum {
  centroidHz: number;
  rms: number;
  low: number;
  mid: number;
  high: number;
}
function analyse(
  analyser: AnalyserNode,
  freq: Uint8Array<ArrayBuffer>,
  sampleRate: number,
): Spectrum {
  analyser.getByteFrequencyData(freq);
  const bins = freq.length;
  const nyq = sampleRate / 2;
  const hzPerBin = nyq / bins;
  let mag = 0;
  let weighted = 0;
  let low = 0;
  let lowN = 0;
  let mid = 0;
  let midN = 0;
  let high = 0;
  let highN = 0;
  let rms = 0;
  for (let i = 0; i < bins; i++) {
    const m = freq[i] / 255;
    const hz = i * hzPerBin;
    mag += m;
    weighted += m * hz;
    rms += m * m;
    if (hz < 250) {
      low += m;
      lowN++;
    } else if (hz < 2000) {
      mid += m;
      midN++;
    } else {
      high += m;
      highN++;
    }
  }
  return {
    centroidHz: mag > 1e-4 ? weighted / mag : 0,
    rms: Math.sqrt(rms / bins),
    low: lowN ? low / lowN : 0,
    mid: midN ? mid / midN : 0,
    high: highN ? high / highN : 0,
  };
}

// ── WebGL2 interference field ─────────────────────────────────────────────────
const VERT_SRC = `#version 300 es
void main(){
  float x = (gl_VertexID == 1) ? 3.0 : -1.0;
  float y = (gl_VertexID == 2) ? 3.0 : -1.0;
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uResolve;
uniform float uRms;
uniform vec3  uBands;         // low, mid, high (0..1)
uniform float uVoicePlay;     // 0..1
uniform float uVoiceRate;     // 0..1 normalized
uniform float uVoiceLevel;    // 0..1
uniform float uVoicePresent;  // 0/1
uniform float uGroundCenter;  // 0..1 log-normalized
uniform float uGroundLevel;   // 0..1
uniform float uGroundQ;       // 0..1
uniform float uGroundPresent; // 0/1

vec3 warm(float t){
  vec3 ash   = vec3(0.10, 0.055, 0.040);
  vec3 ember = vec3(0.55, 0.135, 0.050);
  vec3 amber = vec3(0.93, 0.44,  0.13 );
  vec3 gold  = vec3(1.00, 0.80,  0.34 );
  vec3 white = vec3(1.00, 0.965, 0.88 );
  t = clamp(t, 0.0, 1.0);
  if (t < 0.34) return mix(ash,   ember, t / 0.34);
  if (t < 0.62) return mix(ember, amber, (t - 0.34) / 0.28);
  if (t < 0.84) return mix(amber, gold,  (t - 0.62) / 0.22);
  return mix(gold, white, (t - 0.84) / 0.16);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5);
  p.x *= aspect;

  float resolve = uResolve;
  float tear = 1.0 - resolve;

  // VOICE radiates from the playhead position; when torn it drifts RIGHT.
  float vx = (uVoicePlay - 0.5) * 1.4 * aspect;
  vec2 vcenter = vec2(vx, 0.0);
  vec2 pv = p;  pv.x -= tear * 0.42 * aspect;

  // GROUND is a broad standing wave; when torn it drifts LEFT.
  vec2 pg = p;  pg.x += tear * 0.42 * aspect;

  // ── VOICE: fast, fine, bright ripples; freq/phase follow playhead + rate ──
  float vfreq  = 26.0 + uVoiceRate * 46.0;
  float vphase = uTime * (2.2 + uVoiceRate * 3.0) + uVoicePlay * 24.0;
  float vd = length(pv - vcenter);
  float voice = sin(vd * vfreq - vphase);
  voice += 0.6 * sin(pv.x * vfreq * 0.5 + vphase * 0.7);
  voice *= 0.62;
  float vAmp = (0.35 + uVoiceLevel * 0.9 + uBands.z * 0.7) * uVoicePresent;

  // ── GROUND: slow, broad, warm standing waves; spatial freq follows center ──
  float gfreq = 2.2 + uGroundCenter * 13.0;
  float gph   = uTime * 0.6;
  float ground = sin(pg.x * gfreq + gph) * cos(pg.y * gfreq * 0.72 - gph * 0.5);
  // resonance Q sharpens the standing-wave crests
  ground = sign(ground) * pow(abs(ground), mix(1.0, 0.45, uGroundQ));
  float gAmp = (0.40 + uGroundLevel * 0.95 + uBands.x * 0.7) * uGroundPresent;

  // when torn, weight each body to its own half of the field (two contenders)
  float voiceZone  = mix(1.0, smoothstep(-0.30, 0.40, p.x / aspect), tear);
  float groundZone = mix(1.0, smoothstep(0.30, -0.40, p.x / aspect), tear);
  float v = voice  * vAmp * voiceZone;
  float g = ground * gAmp * groundZone;

  // interference: sum (beating, destructive) → product (moiré lattice, lock)
  float beat    = (v + g) * 0.5;
  float lattice = (v * g) * 1.6 + (v + g) * 0.25;
  float field   = mix(beat, lattice, resolve);

  float t = field * 0.5 + 0.5;

  float bright = 0.55 + uRms * 0.9 + resolve * 0.5;
  float shade = t * bright;

  // ridge contours make the interference structure legible (ordered, not noise)
  float ridge = abs(fract(field * 3.0) - 0.5);
  shade += (0.15 + resolve * 0.25) *
           smoothstep(0.02, 0.0, ridge - (0.05 + resolve * 0.1));

  vec3 col = warm(shade);

  // near-white bloom at crests when locked
  col += vec3(0.9, 0.8, 0.6) * pow(max(0.0, t - 0.6), 2.0) * resolve;

  // desaturate toward WARM-ASH when unresolved (never cool)
  vec3 ash = vec3(0.16, 0.10, 0.075);
  float lum = dot(col, vec3(0.4, 0.4, 0.2));
  col = mix(mix(vec3(lum), ash, 0.5), col, 0.35 + resolve * 0.65);

  // gentle vignette to seat the figure
  float vig = smoothstep(1.35, 0.2, length(p));
  col *= 0.55 + 0.45 * vig;

  fragColor = vec4(col, 1.0);
}`;

interface GlUniforms {
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uResolve: WebGLUniformLocation | null;
  uRms: WebGLUniformLocation | null;
  uBands: WebGLUniformLocation | null;
  uVoicePlay: WebGLUniformLocation | null;
  uVoiceRate: WebGLUniformLocation | null;
  uVoiceLevel: WebGLUniformLocation | null;
  uVoicePresent: WebGLUniformLocation | null;
  uGroundCenter: WebGLUniformLocation | null;
  uGroundLevel: WebGLUniformLocation | null;
  uGroundQ: WebGLUniformLocation | null;
  uGroundPresent: WebGLUniformLocation | null;
}
interface GlState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  u: GlUniforms;
}

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "unknown";
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function buildGl(canvas: HTMLCanvasElement): GlState {
  const gl = canvas.getContext("webgl2", {
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 unavailable");
  const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram();
  if (!program) throw new Error("program alloc failed");
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown";
    throw new Error("program link: " + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("vao alloc failed");
  const loc = (n: string) => gl.getUniformLocation(program, n);
  const u: GlUniforms = {
    uRes: loc("uRes"),
    uTime: loc("uTime"),
    uResolve: loc("uResolve"),
    uRms: loc("uRms"),
    uBands: loc("uBands"),
    uVoicePlay: loc("uVoicePlay"),
    uVoiceRate: loc("uVoiceRate"),
    uVoiceLevel: loc("uVoiceLevel"),
    uVoicePresent: loc("uVoicePresent"),
    uGroundCenter: loc("uGroundCenter"),
    uGroundLevel: loc("uGroundLevel"),
    uGroundQ: loc("uGroundQ"),
    uGroundPresent: loc("uGroundPresent"),
  };
  return { gl, program, vao, u };
}

interface FieldFrame {
  time: number;
  resolve: number;
  rms: number;
  bands: [number, number, number];
  voicePlay: number;
  voiceRate: number; // normalized 0..1
  voiceLevel: number;
  voicePresent: number;
  groundCenter: number; // normalized 0..1
  groundLevel: number;
  groundQ: number; // normalized 0..1
  groundPresent: number;
}

function renderGl(s: GlState, f: FieldFrame): void {
  const { gl, u } = s;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.useProgram(s.program);
  gl.bindVertexArray(s.vao);
  gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(u.uTime, f.time);
  gl.uniform1f(u.uResolve, f.resolve);
  gl.uniform1f(u.uRms, f.rms);
  gl.uniform3f(u.uBands, f.bands[0], f.bands[1], f.bands[2]);
  gl.uniform1f(u.uVoicePlay, f.voicePlay);
  gl.uniform1f(u.uVoiceRate, f.voiceRate);
  gl.uniform1f(u.uVoiceLevel, f.voiceLevel);
  gl.uniform1f(u.uVoicePresent, f.voicePresent);
  gl.uniform1f(u.uGroundCenter, f.groundCenter);
  gl.uniform1f(u.uGroundLevel, f.groundLevel);
  gl.uniform1f(u.uGroundQ, f.groundQ);
  gl.uniform1f(u.uGroundPresent, f.groundPresent);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function destroyGl(s: GlState): void {
  try {
    s.gl.deleteProgram(s.program);
    s.gl.deleteVertexArray(s.vao);
    const lose = s.gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
  } catch {
    /* already gone */
  }
}

// ── Canvas2D interference fallback (low-res, warm) ────────────────────────────
interface FbState {
  low: HTMLCanvasElement;
  lowCtx: CanvasRenderingContext2D;
  img: ImageData;
  w: number;
  h: number;
}
function warmJs(t: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [26, 14, 10],
    [140, 34, 13],
    [237, 112, 33],
    [255, 204, 87],
    [255, 246, 224],
  ];
  const c = clamp01(t) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(c));
  const fr = c - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [
    a[0] + (b[0] - a[0]) * fr,
    a[1] + (b[1] - a[1]) * fr,
    a[2] + (b[2] - a[2]) * fr,
  ];
}
function makeFallback(aspect: number): FbState {
  const w = 220;
  const h = Math.max(60, Math.round(w / Math.max(0.5, aspect)));
  const low = document.createElement("canvas");
  low.width = w;
  low.height = h;
  const lowCtx = low.getContext("2d");
  if (!lowCtx) throw new Error("2d context unavailable");
  return { low, lowCtx, img: lowCtx.createImageData(w, h), w, h };
}
function renderFallback(
  fb: FbState,
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  f: FieldFrame,
): void {
  const { w, h, img } = fb;
  const data = img.data;
  const aspect = w / h;
  const tear = 1 - f.resolve;
  const vx = (f.voicePlay - 0.5) * 1.4 * aspect;
  const vfreq = 26 + f.voiceRate * 46;
  const vphase = f.time * (2.2 + f.voiceRate * 3) + f.voicePlay * 24;
  const gfreq = 2.2 + f.groundCenter * 13;
  const gph = f.time * 0.6;
  const vAmp = (0.35 + f.voiceLevel * 0.9 + f.bands[2] * 0.7) * f.voicePresent;
  const gAmp = (0.4 + f.groundLevel * 0.95 + f.bands[0] * 0.7) * f.groundPresent;
  for (let yi = 0; yi < h; yi++) {
    for (let xi = 0; xi < w; xi++) {
      const px = (xi / w - 0.5) * aspect;
      const py = yi / h - 0.5;
      const pvx = px - tear * 0.42 * aspect;
      const pgx = px + tear * 0.42 * aspect;
      const vdx = pvx - vx;
      const vd = Math.hypot(vdx, py);
      let voice = Math.sin(vd * vfreq - vphase);
      voice += 0.6 * Math.sin(pvx * vfreq * 0.5 + vphase * 0.7);
      voice *= 0.62;
      let ground =
        Math.sin(pgx * gfreq + gph) * Math.cos(py * gfreq * 0.72 - gph * 0.5);
      ground = Math.sign(ground) * Math.pow(Math.abs(ground), 1 - 0.55 * f.groundQ);
      const hx = px / aspect;
      const voiceZone =
        1 - tear * (1 - clamp01((hx + 0.3) / 0.7));
      const groundZone = 1 - tear * (1 - clamp01((0.3 - hx) / 0.7));
      const v = voice * vAmp * voiceZone;
      const gg = ground * gAmp * groundZone;
      const beat = (v + gg) * 0.5;
      const lattice = v * gg * 1.6 + (v + gg) * 0.25;
      const field = beat * (1 - f.resolve) + lattice * f.resolve;
      const t = field * 0.5 + 0.5;
      const bright = 0.55 + f.rms * 0.9 + f.resolve * 0.5;
      const shade = t * bright;
      let [r, g, b] = warmJs(shade);
      // desaturate toward warm-ash when unresolved
      const lum = 0.4 * r + 0.4 * g + 0.2 * b;
      const mixk = 0.35 + f.resolve * 0.65;
      r = (lum * 0.5 + 41 * 0.5) * (1 - mixk) + r * mixk;
      g = (lum * 0.5 + 25 * 0.5) * (1 - mixk) + g * mixk;
      b = (lum * 0.5 + 19 * 0.5) * (1 - mixk) + b * mixk;
      const idx = (yi * w + xi) * 4;
      data[idx] = clamp(r, 0, 255);
      data[idx + 1] = clamp(g, 0, 255);
      data[idx + 2] = clamp(b, 0, 255);
      data[idx + 3] = 255;
    }
  }
  fb.lowCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fb.low, 0, 0, outW, outH);
}

// ── hand → role assignment (asymmetric: right=VOICE, left=GROUND) ─────────────
interface HandFeat {
  cx: number;
  cy: number;
  open: number;
  fist: boolean;
  height: number;
}
function assignRoles(
  feats: HandFeat[],
  labels: (string | undefined)[],
): { voice: HandFeat | null; ground: HandFeat | null } {
  if (feats.length === 0) return { voice: null, ground: null };
  if (feats.length === 1) return { voice: feats[0], ground: null };
  const l0 = labels[0];
  const l1 = labels[1];
  const distinct = l0 && l1 && l0 !== l1;
  if (distinct) {
    // MediaPipe categoryName "Right" = the visitor's right hand = VOICE.
    const voiceIdx = l0 === "Right" ? 0 : 1;
    return { voice: feats[voiceIdx], ground: feats[1 - voiceIdx] };
  }
  // fall back to mirrored position: your right hand = SMALLER cx (canon convention)
  const voiceIdx = feats[0].cx <= feats[1].cx ? 0 : 1;
  return { voice: feats[voiceIdx], ground: feats[1 - voiceIdx] };
}

// ── engine ────────────────────────────────────────────────────────────────────
interface Engine {
  ac: AudioContext;
  master: SafeMaster;
  audio: AudioEngine;
  freq: Uint8Array<ArrayBuffer>;
  gl: GlState | null;
  ctx2d: CanvasRenderingContext2D | null;
  fb: FbState | null;
  tracker: HandLandmarkerInst | null;
  stream: MediaStream | null;
  raf: number;
  time: number;
  lastMs: number;
  usingPointer: boolean;
  ctrl: Controls;
  centroidHz: number; // smoothed
  // pointer + slider fallback state
  pointer: { x: number; y: number; active: boolean };
  ground: { pos: number; level: number; q: number; muted: boolean };
}

type Mode = "idle" | "loading" | "running";

function hzToNorm(hz: number): number {
  return clamp01(
    (Math.log(hz) - Math.log(GROUND_HZ_LO)) /
      (Math.log(GROUND_HZ_HI) - Math.log(GROUND_HZ_LO)),
  );
}
function normToHz(n: number): number {
  return (
    GROUND_HZ_LO *
    Math.pow(GROUND_HZ_HI / GROUND_HZ_LO, clamp01(n))
  );
}

export default function ResonantPairPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK);
  const [driver, setDriver] = useState<"pointer" | "hands">("pointer");
  const [using2D, setUsing2D] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [gPos, setGPos] = useState(0.4);
  const [gLevel, setGLevel] = useState(0.6);
  const [gQ, setGQ] = useState(0.4);
  const [gMuted, setGMuted] = useState(false);

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const twoDCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");

  const resolveBarRef = useRef<HTMLDivElement | null>(null);
  const resolveLabelRef = useRef<HTMLSpanElement | null>(null);
  const stateRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const eng = engineRef.current;
    if (eng)
      eng.ground = { pos: gPos, level: gLevel, q: gQ, muted: gMuted };
  }, [gPos, gLevel, gQ, gMuted]);

  const renderLoop = useCallback((nowMs: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
    eng.lastMs = nowMs;
    eng.time += dt;
    const c = eng.ctrl;

    // ── read the two hands (asymmetric roles) or fall back ──
    let voiceT: HandFeat | null = null;
    let groundT: HandFeat | null = null;
    let haveHands = false;
    const video = videoRef.current;
    if (eng.tracker && eng.stream && video && video.readyState >= 2) {
      let res: {
        landmarks: Landmark[][];
        handednesses?: Category[][];
        handedness?: Category[][];
      } | null = null;
      try {
        res = eng.tracker.detectForVideo(video, nowMs);
      } catch {
        res = null;
      }
      if (res && res.landmarks && res.landmarks.length > 0) {
        const feats = res.landmarks.slice(0, 2).map((lm) => computeHandFeatures(lm));
        const handed = res.handednesses ?? res.handedness ?? [];
        const labels = feats.map((_, i) => handed[i]?.[0]?.categoryName);
        const roles = assignRoles(feats, labels);
        voiceT = roles.voice;
        groundT = roles.ground;
        haveHands = true;
        if (eng.usingPointer) {
          eng.usingPointer = false;
          setDriver("hands");
        }
      }
    }

    // ── VOICE target (right hand, or pointer) ──
    if (voiceT) {
      c.voicePresent = true;
      c.voiceFist = voiceT.fist;
      const playT = clamp01((voiceT.cx + 1.2) / 2.4);
      const rateT = VOICE_RATE_LO + voiceT.height * (VOICE_RATE_HI - VOICE_RATE_LO);
      const densT = DENSITY_MIN + voiceT.open * (DENSITY_MAX - DENSITY_MIN);
      const k = 1 - Math.exp(-dt / SMOOTH_TC);
      c.play += (playT - c.play) * k;
      c.rate += (rateT - c.rate) * k;
      c.density += (densT - c.density) * k;
      c.voiceLevel += ((voiceT.fist ? 0 : 0.3 + 0.7 * voiceT.open) - c.voiceLevel) * k;
    } else if (!haveHands && eng.pointer.active) {
      c.voicePresent = true;
      c.voiceFist = false;
      const k = 1 - Math.exp(-dt / SMOOTH_TC);
      c.play += (clamp01(eng.pointer.x) - c.play) * k;
      const rateT =
        VOICE_RATE_LO + clamp01(1 - eng.pointer.y) * (VOICE_RATE_HI - VOICE_RATE_LO);
      c.rate += (rateT - c.rate) * k;
      c.density += (26 - c.density) * k;
      c.voiceLevel += (0.7 - c.voiceLevel) * k;
    } else {
      c.voicePresent = false;
      const k = 1 - Math.exp(-dt / SMOOTH_TC);
      c.voiceLevel += (0 - c.voiceLevel) * k;
    }

    // ── GROUND target (left hand, or sliders) ──
    const k = 1 - Math.exp(-dt / SMOOTH_TC);
    if (groundT) {
      c.groundPresent = true;
      c.groundFist = groundT.fist;
      const centerT = normToHz(clamp01((groundT.cx + 1.2) / 2.4));
      const levelT = groundT.fist ? 0 : groundT.height;
      const qT = GROUND_Q_LO + groundT.open * (GROUND_Q_HI - GROUND_Q_LO);
      c.centerHz += (centerT - c.centerHz) * k;
      c.washLevel += (levelT - c.washLevel) * k;
      c.q += (qT - c.q) * k;
    } else {
      // sliders drive the ground (also whenever the right hand is solo)
      const gm = eng.ground;
      c.groundPresent = !gm.muted;
      c.groundFist = gm.muted;
      const centerT = normToHz(gm.pos);
      const levelT = gm.muted ? 0 : gm.level;
      const qT = GROUND_Q_LO + gm.q * (GROUND_Q_HI - GROUND_Q_LO);
      c.centerHz += (centerT - c.centerHz) * k;
      c.washLevel += (levelT - c.washLevel) * k;
      c.q += (qT - c.q) * k;
    }

    // ── analyse the tamed master signal ──
    const sp = analyse(eng.master.analyser, eng.freq, eng.ac.sampleRate);
    eng.centroidHz += (sp.centroidHz - eng.centroidHz) * 0.25;

    // ── negotiation → resolve ──
    let resolveTarget = 0;
    const bothActive =
      c.voicePresent && !c.voiceFist && c.groundPresent && !c.groundFist;
    if (bothActive && eng.centroidHz > 1e-2) {
      // primary: LEFT filter center matches the VOICE spectral centroid
      const octaves = Math.abs(
        Math.log2(eng.centroidHz / Math.max(1, c.centerHz)),
      );
      const closeness = clamp01(1 - octaves / 1.6);
      // secondary: their levels balance
      const balance = 1 - clamp01(Math.abs(c.voiceLevel - c.washLevel));
      resolveTarget = clamp01(0.68 * closeness + 0.32 * balance);
    }
    c.resolve += (resolveTarget - c.resolve) * (1 - Math.exp(-dt / RESOLVE_TC));

    // ── drive audio ──
    scheduleVoice(eng.audio, c, eng.ac.currentTime);
    applyGroundAndResolve(eng.audio, c);

    // ── render field ──
    const frame: FieldFrame = {
      time: eng.time,
      resolve: c.resolve,
      rms: sp.rms,
      bands: [sp.low, sp.mid, sp.high],
      voicePlay: c.play,
      voiceRate: clamp01((c.rate - VOICE_RATE_LO) / (VOICE_RATE_HI - VOICE_RATE_LO)),
      voiceLevel: c.voiceLevel,
      voicePresent: c.voicePresent && !c.voiceFist ? 1 : 0,
      groundCenter: hzToNorm(c.centerHz),
      groundLevel: c.groundPresent && !c.groundFist ? c.washLevel : 0,
      groundQ: clamp01((c.q - GROUND_Q_LO) / (GROUND_Q_HI - GROUND_Q_LO)),
      groundPresent: c.groundPresent && !c.groundFist ? 1 : 0,
    };
    if (eng.gl) {
      renderGl(eng.gl, frame);
    } else if (eng.ctx2d && eng.fb) {
      const cv = twoDCanvasRef.current;
      if (cv) renderFallback(eng.fb, eng.ctx2d, cv.width, cv.height, frame);
    }

    // ── resolve meter (on-brand chrome) ──
    if (resolveBarRef.current) {
      resolveBarRef.current.style.width = `${Math.round(c.resolve * 100)}%`;
    }
    if (resolveLabelRef.current) {
      resolveLabelRef.current.textContent = `${Math.round(c.resolve * 100)}%`;
    }
    if (stateRef.current) {
      stateRef.current.textContent =
        c.resolve > 0.72
          ? "locked · one figure"
          : c.resolve > 0.35
            ? "negotiating"
            : "two contending fields";
    }

    eng.raf = requestAnimationFrame(renderLoop);
  }, []);

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.tracker) {
      try {
        eng.tracker.close();
      } catch {
        /* ignore */
      }
    }
    teardownAudio(eng.audio);
    if (eng.gl) destroyGl(eng.gl);
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 350);
    }
    engineRef.current = null;
  }, []);

  const tryCamera = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamNotice(
        "No camera here — pointer conducts the VOICE, sliders shape the GROUND.",
      );
      return;
    }
    let tracker: HandLandmarkerInst;
    try {
      tracker = await createHandTracker(2);
    } catch {
      setCamNotice(
        "Hand tracking could not load — pointer conducts the VOICE, sliders shape the GROUND.",
      );
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      tracker.close();
      return;
    }
    const video = videoRef.current;
    if (!video) {
      tracker.close();
      return;
    }
    try {
      const stream = await startCamera(video);
      const eng3 = engineRef.current;
      if (!eng3) {
        stream.getTracks().forEach((t) => t.stop());
        tracker.close();
        return;
      }
      eng3.tracker = tracker;
      eng3.stream = stream;
      setShowPreview(true);
      setCamNotice(null);
    } catch {
      tracker.close();
      setCamNotice(
        "Camera permission denied — pointer conducts the VOICE, sliders shape the GROUND.",
      );
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current !== "idle") return;
    setCamNotice(null);
    setGlNotice(null);
    setAudioNotice(null);
    setUsing2D(false);
    setShowPreview(false);
    setDriver("pointer");
    setMode("loading");

    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioNotice("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setMode("idle");
      return;
    }

    let loaded;
    try {
      loaded = await loadRealTrackBuffer(ac, trackId);
    } catch {
      setAudioNotice("Karel's recording could not load — check the connection and try again.");
      void ac.close();
      setMode("idle");
      return;
    }

    const master = createSafeMaster(ac, { gain: 0.6 });
    const audio = makeAudioEngine(ac, master, loaded.buffer, loaded.title);

    // visual: raw WebGL2, else Canvas2D
    const glCanvas = glCanvasRef.current;
    const twoD = twoDCanvasRef.current;
    let aspect = 16 / 9;
    let gl: GlState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fb: FbState | null = null;

    if (glCanvas) {
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      glCanvas.width = Math.max(2, Math.floor(glCanvas.clientWidth * dpr));
      glCanvas.height = Math.max(2, Math.floor(glCanvas.clientHeight * dpr));
      aspect = Math.max(0.5, glCanvas.clientWidth / Math.max(1, glCanvas.clientHeight));
      try {
        gl = buildGl(glCanvas);
      } catch (err) {
        gl = null;
        setGlNotice(
          "WebGL2 unavailable — showing the Canvas2D interference fallback. " +
            (err instanceof Error ? err.message : ""),
        );
      }
    }
    if (!gl && twoD) {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      twoD.width = Math.floor(twoD.clientWidth * dpr);
      twoD.height = Math.floor(twoD.clientHeight * dpr);
      aspect = Math.max(0.5, twoD.clientWidth / Math.max(1, twoD.clientHeight));
      const g = twoD.getContext("2d");
      if (g) {
        ctx2d = g;
        try {
          fb = makeFallback(aspect);
          setUsing2D(true);
        } catch {
          fb = null;
          setGlNotice("This browser cannot render the visuals — audio still plays.");
        }
      } else {
        setGlNotice("This browser cannot render the visuals — audio still plays.");
      }
    }

    const ctrl: Controls = {
      voicePresent: false,
      voiceFist: false,
      play: 0.35,
      rate: 1.0,
      density: 20,
      voiceLevel: 0,
      groundPresent: !gMuted,
      groundFist: gMuted,
      centerHz: normToHz(gPos),
      washLevel: gLevel,
      q: GROUND_Q_LO + gQ * (GROUND_Q_HI - GROUND_Q_LO),
      resolve: 0,
    };

    const eng: Engine = {
      ac,
      master,
      audio,
      freq: new Uint8Array(master.analyser.frequencyBinCount),
      gl,
      ctx2d,
      fb,
      tracker: null,
      stream: null,
      raf: 0,
      time: 0,
      lastMs: 0,
      usingPointer: true,
      ctrl,
      centroidHz: 0,
      pointer: { x: 0.35, y: 0.4, active: false },
      ground: { pos: gPos, level: gLevel, q: gQ, muted: gMuted },
    };
    engineRef.current = eng;

    setMode("running");
    void tryCamera();
    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, trackId, tryCamera, gPos, gLevel, gQ, gMuted]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setDriver("pointer");
    setUsing2D(false);
    setShowPreview(false);
  }, [stopEverything]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const eng = engineRef.current;
    if (!eng) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    eng.pointer.x = clamp01((e.clientX - rect.left) / rect.width);
    eng.pointer.y = clamp01((e.clientY - rect.top) / rect.height);
    eng.pointer.active = true;
  }, []);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => onPointerMove(e),
    [onPointerMove],
  );
  const onPointerLeave = useCallback(() => {
    const eng = engineRef.current;
    if (eng) eng.pointer.active = false;
  }, []);

  // resize handling
  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const glCanvas = glCanvasRef.current;
      if (eng.gl && glCanvas) {
        const dpr = Math.min(1.75, window.devicePixelRatio || 1);
        glCanvas.width = Math.max(2, Math.floor(glCanvas.clientWidth * dpr));
        glCanvas.height = Math.max(2, Math.floor(glCanvas.clientHeight * dpr));
      }
      const twoD = twoDCanvasRef.current;
      if (eng.ctx2d && twoD) {
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        twoD.width = Math.floor(twoD.clientWidth * dpr);
        twoD.height = Math.floor(twoD.clientHeight * dpr);
        const aspect = Math.max(0.5, twoD.clientWidth / Math.max(1, twoD.clientHeight));
        try {
          eng.fb = makeFallback(aspect);
        } catch {
          /* keep old */
        }
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode]);

  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";
  const loading = mode === "loading";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
        <Link
          href="/dream"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
        >
          ← back to the dream lab
        </Link>

        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          17344 · resonant pair · asymmetric two-hand interference
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Resonant Pair
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Your two hands hold <span className="text-primary">different</span> powers over one
          solo-piano take. Your right hand is the <span className="text-primary">VOICE</span> — a
          granular scrubber, the melodic figure. Your left hand is the{" "}
          <span className="text-primary">GROUND</span> — a resonant harmonic wash of the same
          recording. The two only fuse into a single coherent standing figure when you negotiate
          them into <span className="text-primary">resonance</span>.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "Play & negotiate"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            take
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              disabled={running || loading}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm normal-case tracking-normal text-foreground disabled:opacity-60"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              conducting:{" "}
              <span className="text-primary">
                {driver === "hands" ? "two hands" : "pointer + sliders"}
              </span>
            </span>
          )}
        </div>

        {!running && !loading && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap play — grant the camera for two-hand negotiation, or use pointer + ground sliders
          </p>
        )}
        {audioNotice && (
          <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>
        )}
        {running && driver === "pointer" && camNotice && (
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{camNotice}</p>
        )}
        {glNotice && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {glNotice}
          </p>
        )}

        <div
          className="relative mt-5 aspect-video w-full touch-none overflow-hidden rounded-lg border border-border bg-black"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerLeave={onPointerLeave}
        >
          <canvas
            ref={glCanvasRef}
            className={`absolute inset-0 h-full w-full ${using2D ? "hidden" : ""}`}
          />
          <canvas
            ref={twoDCanvasRef}
            className={`absolute inset-0 h-full w-full ${using2D ? "" : "hidden"}`}
          />

          {/* resolve meter overlay */}
          {running && (
            <div className="pointer-events-none absolute left-3 top-3 w-44 rounded-md border border-border bg-background/70 p-2 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  resolve
                </span>
                <span
                  ref={resolveLabelRef}
                  className="font-mono text-[10px] tracking-tight text-foreground"
                >
                  0%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  ref={resolveBarRef}
                  className="h-full rounded-full bg-primary transition-[width] duration-100"
                  style={{ width: "0%" }}
                />
              </div>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span ref={stateRef}>two contending fields</span>
              </p>
            </div>
          )}

          {/* mirrored webcam preview */}
          <div
            className={`absolute right-2 top-2 h-[26%] w-[26%] overflow-hidden rounded-md border border-border bg-black/40 ${
              showPreview ? "" : "hidden"
            }`}
          >
            <video
              ref={videoRef}
              className="h-full w-full -scale-x-100 object-cover opacity-70"
              playsInline
              muted
            />
            <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 backdrop-blur-sm">
              <span
                className={`h-1.5 w-1.5 rounded-full ${driver === "hands" ? "bg-primary" : "bg-muted-foreground"}`}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground">
                {driver === "hands" ? "hands" : "waiting"}
              </span>
            </div>
          </div>

          {!running && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Play &amp; negotiate — one hand the voice, one hand the ground.
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Decoding his recording…
            </div>
          )}
        </div>

        {running && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  right hand · voice
                </span>
                <p className="mt-1 text-sm text-foreground">
                  granular melody — playhead, pitch, grain density
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/50 p-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  left hand · ground
                </span>
                <p className="mt-1 text-sm text-foreground">
                  resonant wash — filter center, level, resonance Q
                </p>
              </div>
            </div>

            {driver === "pointer" && (
              <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  ground (left hand) — no camera, shape the harmonic bed here
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    filter center
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={gPos}
                      onChange={(e) => setGPos(parseFloat(e.target.value))}
                      className="accent-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    wash level
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={gLevel}
                      onChange={(e) => setGLevel(parseFloat(e.target.value))}
                      className="accent-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                    resonance Q
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.001}
                      value={gQ}
                      onChange={(e) => setGQ(parseFloat(e.target.value))}
                      className="accent-primary"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setGMuted((v) => !v)}
                  className="mt-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {gMuted ? "Un-mute ground" : "Mute ground"}
                </button>
                <p className="mt-2 text-sm text-muted-foreground">
                  Move the pointer over the field to conduct the VOICE (right hand): left–right is
                  the playhead, up–down is pitch. Match the ground&apos;s filter center to the
                  voice&apos;s brightness to raise resolve.
                </p>
              </div>
            )}
          </>
        )}

        {running && using2D && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgl2 absent · canvas 2d interference fallback
          </p>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: MediaPipe two-hand landmarks, asymmetric roles (pointer + slider fallback) ·
          output: raw WebGL2 fragment shader — two interfering wave systems, warm palette (Canvas2D
          fallback) · audio: his one real decoded take, granulated for the voice and resonantly
          filtered for the ground, through the shared ear-safety bus.
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Resonant Pair</span> asks what it would feel like
                if your two hands held genuinely <span className="text-foreground">different</span>{" "}
                powers over one solo-piano recording — not a mirror, an asymmetric pair. Karel&apos;s
                take is decoded once; both hands act on the same buffer.
              </p>
              <p>
                Your <span className="text-foreground">right hand is the VOICE</span> — the melodic
                figure. It is a granular scrubber: horizontal position is the playhead, height is the
                grain playback rate (0.6×–1.8×, pitch), openness is grain density (~6–50 grains/s),
                and a fist mutes it. Each grain is a short (30–120&nbsp;ms) window of his audio with
                a raised-cosine envelope, panned slightly right — bright, articulated, foreground.
              </p>
              <p>
                Your <span className="text-foreground">left hand is the GROUND</span> — the harmonic
                bed. It shapes a sustained resonant wash of the same take through a bandpass filter:
                horizontal position is the filter center (~120&nbsp;Hz–3&nbsp;kHz, log-mapped),
                height is the wash level, openness is the resonance Q (0.5–12), and a fist mutes it —
                dark, sustained, panned slightly left.
              </p>
              <p>
                <span className="text-foreground">Negotiation → resolve.</span> Each frame the
                spectral centroid of the master signal is measured; resolve rises when the left
                hand&apos;s filter center matches the brightness the right hand&apos;s voice is
                producing, and secondarily when the two levels balance, smoothed with a ~0.15&nbsp;s
                time constant. Near <span className="text-foreground">lock</span>, the two shader wave
                systems interfere constructively into a coherent warm standing-wave / moiré lattice,
                the stereo split collapses toward center, and a tame harmonic reinforcement rings
                (capped by the shared safeMaster bus). At{" "}
                <span className="text-foreground">low resolve</span> they beat destructively and tear
                into two contending fields, desaturating toward warm-ash.
              </p>
              <p>
                The visual is a raw WebGL2 full-viewport fragment shader: the voice is fast, fine
                ripples whose frequency and phase follow the playhead and rate; the ground is slow,
                broad standing waves whose spatial frequency follows the filter center. They are
                summed when apart and multiplied into a moiré lattice at lock — no film grain, only
                ordered structure. If WebGL2 is unavailable it falls back to a Canvas2D interference
                render with a visible notice.
              </p>
              <p>
                <span className="text-foreground">Latency is the craft.</span> Detection runs on the
                rAF loop, grains are scheduled with a ~100&nbsp;ms lookahead, and every parameter is
                smoothed (~0.12&nbsp;s) — no <code>await</code> in the gesture→sound path. No camera?
                The pointer conducts the voice and on-screen sliders shape the ground, so the
                negotiation stays demonstrable. All audio is only his real recording, always through
                the shared ear-safety bus. Full references are in the README.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["17344-resonantpair", "17312-timeheads", "15824-canon"]} />
    </main>
  );
}
