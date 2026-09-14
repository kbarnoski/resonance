"use client";

/*
 * 17200-hall — "Hall"
 *
 * A venue installation: Karel's real piano take is projected room-scale across
 * the whole viewport as a neutral, slowly-advecting field of light, and the room's
 * own movement — read from the webcam as a coarse optical-flow field — ripples
 * that light in real time. The visitor becomes a co-creator of the wall.
 *
 * Four subsystems working together:
 *   1. Catalog loader/decoder  — fetch + decode one of Karel's verified tracks
 *      (Welcome Home / Snowflake) into an AudioBuffer, looped for the room.
 *   2. Audio analyser bus       — every path terminates in safeMaster; its
 *      analyser drives the field's base motion, brightness and intensity.
 *   3. Webcam optical-flow      — a 64x48 frame-to-frame flow field (optical-flow
 *      constraint estimate) injected as velocity so motion pushes the light.
 *   4. GPU wall renderer        — a WebGL2 ping-pong advection field: curl-noise
 *      drift + audio emitters + injected room-flow, tonemapped in a neutral palette.
 *
 * Camera is a SECONDARY layer — the piece plays and glows with no camera at all
 * (autonomous gentle drift). No WebGL2 -> a still neutral fallback. Audio fail ->
 * an on-brand error, never a synth.
 */

import { useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { loadTrackAnalysis, type TrackAnalysis } from "../_shared/trackAnalysis";

// ── flow-field constants ─────────────────────────────────────────────────────
const FLOW_W = 64;
const FLOW_H = 48;

// ── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const NOISE_GLSL = /* glsl */ `
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0));
  float c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return s;
}
vec2 curl(vec2 p){
  float e = 0.06;
  float dx = fbm(p + vec2(0.0,e)) - fbm(p - vec2(0.0,e));
  float dy = fbm(p + vec2(e,0.0)) - fbm(p - vec2(e,0.0));
  return vec2(dx, -dy) * (0.5 / e) * 0.2;
}`;

// Update / advection pass: field state is RGBA8 where R = intensity, G = warmth.
const UPDATE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uField;
uniform sampler2D uFlow;
uniform float uTime, uStep, uDrift, uNoiseScale, uFlowStrength;
uniform float uAspect, uBass, uMid, uTreble, uEnergy;
uniform float uDissip, uSourceGain, uEmitTight, uBaseWarm;
${NOISE_GLSL}
float d2(vec2 uv, vec2 c){
  vec2 a = vec2(uAspect, 1.0);
  vec2 dd = (uv - c) * a;
  return dot(dd, dd);
}
void main(){
  vec2 uv = vUv;
  // room motion: mirror x + flip y so a visitor's motion reads as their reflection
  vec2 fuv = vec2(1.0 - uv.x, 1.0 - uv.y);
  vec2 flow = (texture(uFlow, fuv).rg * 2.0 - 1.0) * uFlowStrength;

  // base velocity = neutral curl drift, energised by the music, plus the room
  vec2 baseVel = curl(uv * uNoiseScale + vec2(0.0, uTime * 0.03));
  baseVel *= uDrift * (0.35 + uEnergy * 1.25);
  vec2 vel = baseVel + flow;

  // advect the previous field
  vec2 prevUv = uv - vel * uStep;
  vec2 dye = texture(uField, prevUv).rg;

  // audio emitters — three slow orbits pulsed by bass / mid / treble
  vec2 e0 = vec2(0.30 + 0.12 * sin(uTime * 0.13), 0.44 + 0.10 * cos(uTime * 0.11));
  vec2 e1 = vec2(0.54 + 0.14 * sin(uTime * 0.09 + 2.0), 0.56 + 0.12 * sin(uTime * 0.15 + 1.0));
  vec2 e2 = vec2(0.72 + 0.10 * cos(uTime * 0.17 + 4.0), 0.42 + 0.13 * sin(uTime * 0.08 + 3.0));
  float g0 = exp(-d2(uv, e0) * uEmitTight);
  float g1 = exp(-d2(uv, e1) * uEmitTight);
  float g2 = exp(-d2(uv, e2) * uEmitTight);

  float src  = g0 * uBass * 1.2 + g1 * uMid * 1.0 + g2 * uTreble * 0.9;
  float srcW = g0 * uBass * 1.2 * 0.12 + g1 * uMid * 1.0 * 0.45 + g2 * uTreble * 0.9 * 0.82;

  // room movement lights the wall where it happens (toward the bright silver/violet end)
  float fm = length(flow);
  src  += fm * 2.2;
  srcW += fm * 2.2 * 0.62;

  // ambient shimmer so the wall breathes even in silence
  float amb = smoothstep(0.62, 1.0, fbm(uv * uNoiseScale + uTime * 0.04));
  float ambAmt = amb * (0.015 + uEnergy * 0.06);
  src  += ambAmt;
  srcW += ambAmt * 0.4;

  float ni = clamp(dye.r * uDissip + src * uSourceGain, 0.0, 1.0);
  float wTarget = src > 1e-4 ? srcW / max(src, 1e-4) : uBaseWarm;
  float mixAmt  = src > 1e-4 ? clamp(src * uSourceGain * 4.0, 0.0, 0.6) : 0.01;
  float nw = clamp(mix(dye.g, wTarget, mixAmt), 0.0, 1.0);

  fragColor = vec4(ni, nw, 0.0, 1.0);
}`;

// Render pass: colorise the field in a deliberately NEUTRAL graphite→silver→bone
// palette (violet only at the brightest peaks) and tonemap for projection. Neutral,
// not warm and not cool-luminous — the third temperature the 2026-09-14 jury asked for.
const RENDER_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uField;
uniform vec2 uTexel;
uniform float uExposure;
vec3 fieldPalette(float t){
  vec3 c0 = vec3(0.020, 0.022, 0.028); // near-black graphite
  vec3 c1 = vec3(0.120, 0.130, 0.160); // slate
  vec3 c2 = vec3(0.340, 0.350, 0.390); // stone
  vec3 c3 = vec3(0.620, 0.630, 0.670); // silver
  vec3 c4 = vec3(0.860, 0.870, 0.900); // bone highlight
  vec3 c5 = vec3(0.560, 0.360, 0.960); // violet brand accent (peaks only)
  if(t < 0.20) return mix(c0, c1, t / 0.20);
  if(t < 0.42) return mix(c1, c2, (t - 0.20) / 0.22);
  if(t < 0.62) return mix(c2, c3, (t - 0.42) / 0.20);
  if(t < 0.82) return mix(c3, c4, (t - 0.62) / 0.20);
  return mix(c4, c5, (t - 0.82) / 0.18);
}
void main(){
  vec2 d0 = texture(uField, vUv).rg;
  float glow = 0.0;
  glow += texture(uField, vUv + uTexel * vec2( 2.0, 0.0)).r;
  glow += texture(uField, vUv + uTexel * vec2(-2.0, 0.0)).r;
  glow += texture(uField, vUv + uTexel * vec2( 0.0, 2.0)).r;
  glow += texture(uField, vUv + uTexel * vec2( 0.0,-2.0)).r;
  glow *= 0.25;
  float inten = d0.r + glow * 0.4;
  vec3 col = fieldPalette(clamp(d0.g, 0.0, 1.0)) * pow(clamp(inten, 0.0, 1.5), 0.85);
  col *= uExposure;
  col += vec3(0.010, 0.011, 0.014); // faint neutral floor for the dark room
  vec2 q = vUv - 0.5;
  float vig = smoothstep(0.95, 0.32, length(q) * 1.25);
  col *= mix(0.5, 1.0, vig);
  col = col / (col + vec3(0.85));   // reinhard-ish tonemap
  col = pow(col, vec3(0.9));
  fragColor = vec4(col, 1.0);
}`;

// ── WebGL helpers (non-hook names) ───────────────────────────────────────────

function buildShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function buildProgram(gl: WebGL2RenderingContext, fragSrc: string) {
  const vs = buildShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = buildShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("program link failed: " + log);
  }
  return prog;
}

function makeFieldTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── engine type ──────────────────────────────────────────────────────────────

interface Engine {
  gl: WebGL2RenderingContext;
  updateProg: WebGLProgram;
  renderProg: WebGLProgram;
  vao: WebGLVertexArrayObject;
  texA: WebGLTexture;
  texB: WebGLTexture;
  fboA: WebGLFramebuffer;
  fboB: WebGLFramebuffer;
  flowTex: WebGLTexture;
  simW: number;
  simH: number;
  raf: number;
  frame: number;
  disposed: boolean;
  // optical flow
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  ofCanvas: HTMLCanvasElement;
  ofCtx: CanvasRenderingContext2D;
  curGray: Float32Array;
  prevGray: Float32Array;
  flowSmooth: Float32Array;
  flowData: Uint8Array;
  cameraLive: boolean;
  cleanupResize: (() => void) | null;
}

// ── React component ──────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "playing" | "error";

export default function HallInstallation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<ReturnType<typeof createSafeMaster> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lowpassRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const startTimeRef = useRef(0);
  const trackDurRef = useRef(0);

  // live-read control refs (loop reads these without re-creating the engine)
  const brightnessRef = useRef(1.0);
  const scaleRef = useRef(0.7);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [noWebgl, setNoWebgl] = useState(false);
  const [trackId, setTrackId] = useState(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState(REAL_TRACKS[0].title);
  const [switching, setSwitching] = useState(false);

  const [brightness, setBrightness] = useState(1.0);
  const [scale, setScale] = useState(0.7);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraNote, setCameraNote] = useState("");
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [installMode, setInstallMode] = useState(false);
  const [chromeAwake, setChromeAwake] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    brightnessRef.current = brightness;
  }, [brightness]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // auto-hide chrome in installation mode; wake it on movement / Escape
  useEffect(() => {
    if (!installMode) {
      setChromeAwake(true);
      return;
    }
    let t: number;
    const wake = () => {
      setChromeAwake(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setChromeAwake(false), 2600);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInstallMode(false);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, [installMode]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopEverything() {
    const eng = engineRef.current;
    if (eng) {
      eng.disposed = true;
      cancelAnimationFrame(eng.raf);
      eng.cleanupResize?.();
      stopCameraStream(eng);
      const gl = eng.gl;
      gl.deleteProgram(eng.updateProg);
      gl.deleteProgram(eng.renderProg);
      gl.deleteTexture(eng.texA);
      gl.deleteTexture(eng.texB);
      gl.deleteTexture(eng.flowTex);
      gl.deleteFramebuffer(eng.fboA);
      gl.deleteFramebuffer(eng.fboB);
      gl.deleteVertexArray(eng.vao);
      engineRef.current = null;
    }
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    lowpassRef.current?.disconnect();
    masterRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    sourceRef.current = null;
    lowpassRef.current = null;
    masterRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }

  function stopCameraStream(eng: Engine) {
    if (eng.stream) {
      eng.stream.getTracks().forEach((tr) => tr.stop());
      eng.stream = null;
    }
    if (eng.video) {
      eng.video.srcObject = null;
      eng.video = null;
    }
    eng.cameraLive = false;
  }

  // ── audio ──────────────────────────────────────────────────────────────────

  async function playTrack(id: string, reuseCtx: AudioContext | null) {
    const ctx =
      reuseCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const { buffer, title } = await loadRealTrackBuffer(ctx, id);

    // master bus (terminates the chain safely — never ctx.destination directly)
    if (!masterRef.current) {
      masterRef.current = createSafeMaster(ctx);
      analyserRef.current = masterRef.current.analyser;
      freqRef.current = new Uint8Array(masterRef.current.analyser.frequencyBinCount);
    }

    // stop any existing source
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current.disconnect();
    }
    lowpassRef.current?.disconnect();

    // gentle warm lowpass -> safe master
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7200;
    lp.Q.value = 0.6;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(lp);
    lp.connect(masterRef.current!.input);
    src.start();
    sourceRef.current = src;
    lowpassRef.current = lp;
    startTimeRef.current = ctx.currentTime;
    trackDurRef.current = buffer.duration;
    setTrackTitle(title);

    // enrich (non-chord): onset density -> turbulence, best-effort
    analysisRef.current = null;
    loadTrackAnalysis(id)
      .then((a) => {
        analysisRef.current = a;
      })
      .catch(() => {});
  }

  async function handleStart() {
    setStatus("loading");
    setErrorMsg("");
    try {
      await playTrack(trackId, null);
    } catch {
      setStatus("error");
      setErrorMsg(
        "The take could not be loaded from Karel's catalog. Check the connection and try again.",
      );
      return;
    }
    // start visuals
    const started = startEngine();
    if (!started) {
      // audio still plays; a neutral still fallback is shown by the DOM layer
      setNoWebgl(true);
    }
    setStatus("playing");
  }

  async function handleSwitchTrack(id: string) {
    setTrackId(id);
    if (status !== "playing") {
      const t = REAL_TRACKS.find((x) => x.id === id);
      if (t) setTrackTitle(t.title);
      return;
    }
    setSwitching(true);
    try {
      await playTrack(id, audioCtxRef.current);
    } catch {
      setErrorMsg("That take could not be loaded. The previous one keeps playing.");
    } finally {
      setSwitching(false);
    }
  }

  // ── camera ───────────────────────────────────────────────────────────────

  async function toggleCamera() {
    const eng = engineRef.current;
    if (!eng) return;
    if (cameraOn) {
      stopCameraStream(eng);
      setCameraOn(false);
      setCameraNote("");
      // clear the flow field to neutral (no injection)
      eng.flowData.fill(128);
      for (let i = 3; i < eng.flowData.length; i += 4) eng.flowData[i] = 255;
      const gl = eng.gl;
      gl.bindTexture(gl.TEXTURE_2D, eng.flowTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FLOW_W, FLOW_H, gl.RGBA, gl.UNSIGNED_BYTE, eng.flowData);
      return;
    }
    setCameraNote("Requesting camera...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false,
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      eng.stream = stream;
      eng.video = video;
      eng.cameraLive = true;
      setCameraOn(true);
      setCameraNote("");
    } catch {
      setCameraNote("Camera unavailable — the field keeps its autonomous drift.");
      setCameraOn(false);
    }
  }

  // ── optical flow (input processing only; never drawn to screen) ─────────────

  function stepFlow(eng: Engine) {
    const v = eng.video;
    if (!v || v.readyState < 2) return;
    eng.ofCtx.drawImage(v, 0, 0, FLOW_W, FLOW_H);
    const px = eng.ofCtx.getImageData(0, 0, FLOW_W, FLOW_H).data;
    const cur = eng.curGray;
    for (let i = 0, p = 0; i < FLOW_W * FLOW_H; i++, p += 4) {
      cur[i] = (px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114) / 255;
    }
    const prev = eng.prevGray;
    const sm = eng.flowSmooth;
    const out = eng.flowData;
    for (let y = 1; y < FLOW_H - 1; y++) {
      for (let x = 1; x < FLOW_W - 1; x++) {
        const i = y * FLOW_W + x;
        // spatial + temporal gradients -> single-point optical-flow estimate
        const ix = cur[i + 1] - cur[i - 1];
        const iy = cur[i + FLOW_W] - cur[i - FLOW_W];
        const it = cur[i] - prev[i];
        const denom = ix * ix + iy * iy + 0.0015;
        let fx = (-it * ix) / denom;
        let fy = (-it * iy) / denom;
        // scale + clamp into a sane range
        fx = Math.max(-1, Math.min(1, fx * 0.6));
        fy = Math.max(-1, Math.min(1, fy * 0.6));
        // temporal smoothing to calm the noise
        sm[i * 2] += (fx - sm[i * 2]) * 0.4;
        sm[i * 2 + 1] += (fy - sm[i * 2 + 1]) * 0.4;
        const o = i * 4;
        out[o] = Math.round((sm[i * 2] * 0.5 + 0.5) * 255);
        out[o + 1] = Math.round((sm[i * 2 + 1] * 0.5 + 0.5) * 255);
        out[o + 2] = 0;
        out[o + 3] = 255;
      }
    }
    eng.prevGray = cur;
    eng.curGray = prev;
    const gl = eng.gl;
    gl.bindTexture(gl.TEXTURE_2D, eng.flowTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FLOW_W, FLOW_H, gl.RGBA, gl.UNSIGNED_BYTE, out);
  }

  // ── engine setup + loop ─────────────────────────────────────────────────────

  function resizeCanvas(eng: Engine) {
    const canvas = canvasRef.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    // display buffer, capped for projection performance
    const maxDisp = 1600;
    let dw = Math.round(cssW * dpr);
    let dh = Math.round(cssH * dpr);
    if (dw > maxDisp) {
      dh = Math.round((dh * maxDisp) / dw);
      dw = maxDisp;
    }
    if (canvas.width !== dw || canvas.height !== dh) {
      canvas.width = dw;
      canvas.height = dh;
    }
    // sim buffer: scale control sets feature size + resolution
    const simFactor = 0.55 + scaleRef.current * 0.45; // 0.4->~0.73, 1.0->1.0
    const aspect = cssW / Math.max(1, cssH);
    let simH = Math.round(Math.min(cssH, 720) * simFactor);
    simH = Math.max(200, Math.min(700, simH));
    let simW = Math.round(simH * aspect);
    if (simW > 1200) {
      simW = 1200;
      simH = Math.round(simW / aspect);
    }
    if (simW !== eng.simW || simH !== eng.simH) {
      const gl = eng.gl;
      gl.deleteTexture(eng.texA);
      gl.deleteTexture(eng.texB);
      eng.texA = makeFieldTex(gl, simW, simH);
      eng.texB = makeFieldTex(gl, simW, simH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.fboA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, eng.texA, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.fboB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, eng.texB, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      eng.simW = simW;
      eng.simH = simH;
    }
  }

  function startEngine(): boolean {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    let updateProg: WebGLProgram;
    let renderProg: WebGLProgram;
    try {
      updateProg = buildProgram(gl, UPDATE_FRAG);
      renderProg = buildProgram(gl, RENDER_FRAG);
    } catch {
      return false;
    }

    // fullscreen quad
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const texA = makeFieldTex(gl, 4, 4);
    const texB = makeFieldTex(gl, 4, 4);
    const fboA = gl.createFramebuffer()!;
    const fboB = gl.createFramebuffer()!;

    // flow texture, seeded neutral (128 = zero flow)
    const flowData = new Uint8Array(FLOW_W * FLOW_H * 4);
    flowData.fill(128);
    for (let i = 3; i < flowData.length; i += 4) flowData[i] = 255;
    const flowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, flowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FLOW_W, FLOW_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, flowData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const ofCanvas = document.createElement("canvas");
    ofCanvas.width = FLOW_W;
    ofCanvas.height = FLOW_H;
    const ofCtx = ofCanvas.getContext("2d", { willReadFrequently: true })!;

    const eng: Engine = {
      gl,
      updateProg,
      renderProg,
      vao,
      texA,
      texB,
      fboA,
      fboB,
      flowTex,
      simW: 4,
      simH: 4,
      raf: 0,
      frame: 0,
      disposed: false,
      video: null,
      stream: null,
      ofCanvas,
      ofCtx,
      curGray: new Float32Array(FLOW_W * FLOW_H),
      prevGray: new Float32Array(FLOW_W * FLOW_H),
      flowSmooth: new Float32Array(FLOW_W * FLOW_H * 2),
      flowData,
      cameraLive: false,
      cleanupResize: null,
    };
    engineRef.current = eng;
    resizeCanvas(eng);

    const onResize = () => {
      if (!eng.disposed) resizeCanvas(eng);
    };
    window.addEventListener("resize", onResize);
    eng.cleanupResize = () => window.removeEventListener("resize", onResize);

    // cache uniform locations
    const uU = {
      field: gl.getUniformLocation(updateProg, "uField"),
      flow: gl.getUniformLocation(updateProg, "uFlow"),
      time: gl.getUniformLocation(updateProg, "uTime"),
      step: gl.getUniformLocation(updateProg, "uStep"),
      drift: gl.getUniformLocation(updateProg, "uDrift"),
      noiseScale: gl.getUniformLocation(updateProg, "uNoiseScale"),
      flowStrength: gl.getUniformLocation(updateProg, "uFlowStrength"),
      aspect: gl.getUniformLocation(updateProg, "uAspect"),
      bass: gl.getUniformLocation(updateProg, "uBass"),
      mid: gl.getUniformLocation(updateProg, "uMid"),
      treble: gl.getUniformLocation(updateProg, "uTreble"),
      energy: gl.getUniformLocation(updateProg, "uEnergy"),
      dissip: gl.getUniformLocation(updateProg, "uDissip"),
      sourceGain: gl.getUniformLocation(updateProg, "uSourceGain"),
      emitTight: gl.getUniformLocation(updateProg, "uEmitTight"),
      baseWarm: gl.getUniformLocation(updateProg, "uBaseWarm"),
    };
    const uR = {
      field: gl.getUniformLocation(renderProg, "uField"),
      texel: gl.getUniformLocation(renderProg, "uTexel"),
      exposure: gl.getUniformLocation(renderProg, "uExposure"),
    };

    const t0 = performance.now();

    const loop = () => {
      if (eng.disposed) return;
      eng.frame++;
      const now = performance.now();
      const time = (now - t0) / 1000;

      // audio bands
      let bass = 0,
        mid = 0,
        treble = 0,
        energy = 0;
      const an = analyserRef.current;
      const freq = freqRef.current;
      if (an && freq) {
        an.getByteFrequencyData(freq);
        const avg = (a: number, b: number) => {
          let s = 0;
          for (let i = a; i < b; i++) s += freq[i];
          return s / ((b - a) * 255);
        };
        bass = avg(1, 8);
        mid = avg(10, 42);
        treble = avg(60, 160);
        energy = avg(1, 180);
      }

      // onset-density turbulence (non-chord enrichment)
      let turb = 0;
      const anal = analysisRef.current;
      if (anal && anal.notes.length && trackDurRef.current > 0) {
        const ctx = audioCtxRef.current!;
        const pos = (ctx.currentTime - startTimeRef.current) % trackDurRef.current;
        let c = 0;
        for (const n of anal.notes) {
          if (Math.abs(n.time - pos) < 1.5) c++;
          else if (n.time > pos + 1.5) break;
        }
        turb = Math.min(1, c / 10);
      }

      // optical flow (every other frame, only when camera live)
      if (eng.cameraLive && eng.frame % 2 === 0) stepFlow(eng);

      const scaleNorm = scaleRef.current;
      const noiseScale = 6.0 - scaleNorm * 4.0; // bigger scale -> bigger features
      const emitTight = 60.0 - scaleNorm * 34.0; // bigger scale -> broader blobs
      const drift = 1.0 * (1.0 + turb * 0.8);
      const flowStrength = 2.4;

      // ── update pass (ping-pong) ──
      gl.bindVertexArray(eng.vao);
      gl.useProgram(eng.updateProg);
      gl.viewport(0, 0, eng.simW, eng.simH);
      gl.bindFramebuffer(gl.FRAMEBUFFER, eng.fboB);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, eng.texA);
      gl.uniform1i(uU.field, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, eng.flowTex);
      gl.uniform1i(uU.flow, 1);
      gl.uniform1f(uU.time, time);
      gl.uniform1f(uU.step, 0.0028);
      gl.uniform1f(uU.drift, drift);
      gl.uniform1f(uU.noiseScale, noiseScale);
      gl.uniform1f(uU.flowStrength, flowStrength);
      gl.uniform1f(uU.aspect, eng.simW / Math.max(1, eng.simH));
      gl.uniform1f(uU.bass, bass);
      gl.uniform1f(uU.mid, mid);
      gl.uniform1f(uU.treble, treble);
      gl.uniform1f(uU.energy, energy);
      gl.uniform1f(uU.dissip, 0.986);
      gl.uniform1f(uU.sourceGain, 0.16);
      gl.uniform1f(uU.emitTight, emitTight);
      gl.uniform1f(uU.baseWarm, 0.5);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // swap
      const tmpT = eng.texA;
      eng.texA = eng.texB;
      eng.texB = tmpT;
      const tmpF = eng.fboA;
      eng.fboA = eng.fboB;
      eng.fboB = tmpF;

      // ── render pass to screen ──
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(eng.renderProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, eng.texA);
      gl.uniform1i(uR.field, 0);
      gl.uniform2f(uR.texel, 1 / eng.simW, 1 / eng.simH);
      gl.uniform1f(uR.exposure, brightnessRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      eng.raf = requestAnimationFrame(loop);
    };

    eng.raf = requestAnimationFrame(loop);
    return true;
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* fullscreen denied */
    }
  }

  const chromeVisible = status === "playing" && (!installMode || chromeAwake);

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground"
    >
      {/* GPU wall (or still fallback backdrop underneath it) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 42% 46%, #2a2c33 0%, #121317 45%, #050506 100%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── pre-roll overlay ────────────────────────────────────────────── */}
      {status !== "playing" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="w-full max-w-xl text-center">
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Installation
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Hall
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
              Karel&apos;s piano projected across the venue wall as a field
              of light — and the room&apos;s own movement ripples it.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4">
              <label className="w-full max-w-sm text-left">
                <span className="mb-1 block text-sm text-muted-foreground">
                  Source take
                </span>
                <select
                  value={trackId}
                  onChange={(e) => handleSwitchTrack(e.target.value)}
                  className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
                >
                  {COLLECTIONS.map((col) => (
                    <optgroup key={col.name} label={col.name}>
                      {col.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <button
                onClick={handleStart}
                disabled={status === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {status === "loading" ? "Loading the take..." : "Open the hall"}
              </button>

              {status === "error" && (
                <p className="max-w-sm text-sm text-destructive">{errorMsg}</p>
              )}
            </div>

            <button
              onClick={() => setShowNotes(true)}
              className="mt-8 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {/* ── still fallback notice (no WebGL2) ───────────────────────────── */}
      {status === "playing" && noWebgl && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
          <p className="max-w-md rounded-md border border-border bg-background/70 px-4 py-3 text-center text-sm text-muted-foreground">
            The take is playing. This device can&apos;t run the projection field
            (no WebGL2), so the wall is holding a still neutral glow.
          </p>
        </div>
      )}

      {/* ── top bar chrome ──────────────────────────────────────────────── */}
      {chromeVisible && (
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 transition-opacity duration-500"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
        >
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">Hall</h1>
            <p className="truncate text-sm text-muted-foreground">
              {trackTitle}
              {switching ? " — loading..." : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={toggleCamera}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {cameraOn ? "Camera on" : "Camera off"}
            </button>
            <button
              onClick={() => setOperatorOpen((v) => !v)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Operator
            </button>
            <button
              onClick={toggleFullscreen}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Fullscreen
            </button>
            <button
              onClick={() => {
                setInstallMode(true);
                setOperatorOpen(false);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Installation
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Notes
            </button>
          </div>
        </div>
      )}

      {/* ── operator / calibration panel ────────────────────────────────── */}
      {chromeVisible && operatorOpen && (
        <div className="absolute bottom-4 left-4 z-20 w-72 rounded-lg border border-border bg-background/85 p-4 shadow-lg backdrop-blur-sm">
          <p className="mb-3 text-sm font-semibold tracking-tight">Calibration</p>

          <label className="mb-3 block">
            <span className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>Source take</span>
            </span>
            <select
              value={trackId}
              onChange={(e) => handleSwitchTrack(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            >
              {COLLECTIONS.map((col) => (
                <optgroup key={col.name} label={col.name}>
                  {col.tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="mb-3 block">
            <span className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>Brightness</span>
              <span>{brightness.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0.4}
              max={1.6}
              step={0.02}
              value={brightness}
              onChange={(e) => setBrightness(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 flex justify-between text-sm text-muted-foreground">
              <span>Field scale</span>
              <span>{scale.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0.4}
              max={1.0}
              step={0.02}
              value={scale}
              onChange={(e) => {
                setScale(parseFloat(e.target.value));
                const eng = engineRef.current;
                if (eng) resizeCanvas(eng);
              }}
              className="w-full accent-primary"
            />
          </label>

          <button
            onClick={toggleCamera}
            className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {cameraOn ? "Turn room camera off" : "Turn room camera on"}
          </button>
          {cameraNote && (
            <p className="mt-2 text-sm text-muted-foreground">{cameraNote}</p>
          )}
          {errorMsg && status === "playing" && (
            <p className="mt-2 text-sm text-destructive">{errorMsg}</p>
          )}
        </div>
      )}

      {/* ── installation-mode hint ──────────────────────────────────────── */}
      {status === "playing" && installMode && chromeAwake && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center">
          <p className="rounded-md border border-border bg-background/70 px-4 py-2 text-sm text-muted-foreground">
            Installation mode — press Esc to show controls
          </p>
        </div>
      )}

      {/* ── design-notes modal ──────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Hall — design notes
            </h2>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                An installation-mode piece. Karel&apos;s real take plays looped
                and fills the whole wall as a neutral, slowly-advecting field of
                light — graphite through slate and silver to bone, with violet
                sparking only at the peaks. The music drives the field&apos;s
                base motion, brightness and intensity.
              </p>
              <p>
                Grant the camera and the room joins in: a coarse 64&times;48
                optical-flow field reads where the space is moving and injects
                that motion as velocity, so a wave of the hand pushes and ripples
                the light. The webcam image is never shown — only its motion. Go
                still and the field settles back to its own gentle drift.
              </p>
              <p>
                It plays with no camera at all. Without WebGL2 the wall holds a
                still neutral glow while the take keeps playing; if the take
                can&apos;t load you get a plain error, never a synthesized
                stand-in.
              </p>
              <p className="text-sm">
                Reference: Refik Anadol&apos;s data-driven wall works, where a
                projected field is fed by live signal and the audience&apos;s
                presence becomes part of the piece. Field technique echoes the
                Codrops study &ldquo;Run Rob Run: Music-Reactive Goo&rdquo; — a
                GPU field deformed by the music.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
