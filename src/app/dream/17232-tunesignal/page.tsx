"use client";

/*
 * 17232-tunesignal — "Tune the Signal"
 *
 * Karel's real piano take is rendered as a stark achromatic 1-bit / ordered-dither
 * (Bayer 8x8) SIGNAL FIELD across the whole viewport. At rest it reads as dense
 * static — pure high-contrast grain, no legible image. The listener's LIVE BODY is
 * the tuning instrument: tilt the phone (DeviceOrientation beta/gamma) or, on
 * desktop, drag the pointer, hunting for a sweet-spot orientation. As you close in,
 * a log-polar warp unwinds and the dither threshold switches from random to ordered,
 * so the noise RESOLVES into a coherent radial standing-wave figure that reads his
 * music (FFT magnitude + waveform drive the figure). Off-axis = noise; on-axis =
 * the piece snaps into clarity. It is a hunt-with-your-body-for-focus interaction.
 *
 * Four subsystems:
 *   1. Catalog loader/decoder — fetch + decode one of Karel's verified takes
 *      (Welcome Home / Snowflake) into an AudioBuffer, looped.
 *   2. Audio analyser bus     — every path terminates in safeMaster; a focus-driven
 *      lowpass muffles the take off-axis and opens it as you tune in. The analyser
 *      feeds 128 freq bins + a waveform into the shader each frame.
 *   3. Body-tuning input      — DeviceOrientation tilt (primary on phones) or a
 *      pointer-drag fallback, mapped to a deviation from a hidden sweet spot; a
 *      smoothed focus in [0,1] measures how close you are.
 *   4. GPU signal renderer    — a single WebGL2 fragment pass: Bayer 8x8 ordered
 *      dither + log-polar warp, blending per-pixel static into the resolved figure
 *      as focus rises. Achromatic 1-bit black<->white only.
 *
 * No WebGL2 -> on-brand notice. Orientation denied/unavailable -> pointer works
 * fully. Audio load fail -> on-brand error, never a synth stand-in.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster } from "../_shared/visionary/safeMaster";

// ── tuning constants ─────────────────────────────────────────────────────────
// A deliberately non-centred sweet spot so tuning is a genuine hunt (the focus
// meter is the affordance that guides the body toward it).
const SWEET_TILT = { beta: 42, gamma: 0 }; // degrees: comfortable hold, level L/R
const TILT_RANGE = 34; // degrees mapped to one unit of deviation per axis
const SWEET_POINTER = { x: 0.28, y: -0.22 }; // normalised -1..1 across the canvas
const LOCK_TOLERANCE = 0.13; // deviation length at/under which focus reaches 1
const LOSE_RANGE = 0.85; // deviation length beyond which focus is 0
const AUDIO_BINS = 128;

// ── GLSL ─────────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uAudio;  // 128x1 R8 — FFT magnitude
uniform sampler2D uWave;   // 128x1 R8 — waveform (time domain)
uniform vec2  uRes;        // drawing-buffer size in px
uniform float uTime;
uniform float uFocus;      // 0 = pure static, 1 = resolved figure
uniform float uLevel;      // overall RMS 0..1

// hash noise
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

// recursive ordered-dither thresholds (Bayer). bayer8 is an 8x8 matrix in [0,1).
float bayer2(vec2 a){ a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main(){
  vec2 px = gl_FragCoord.xy;

  // aspect-correct centred coords
  vec2 p = vUv - 0.5;
  p.x *= uRes.x / max(uRes.y, 1.0);

  // ── scramble: when unfocused, swirl + jitter the sampling domain so the
  //    radial structure is destroyed; it unwinds smoothly as focus -> 1.
  float sc = 1.0 - uFocus;
  float jn = hash21(floor(vUv * uRes / 6.0) + floor(uTime * 9.0) * 7.13);
  float rot = (jn - 0.5) * 6.2831 * sc + sc * uTime * 0.5;
  float cs = cos(rot), sn = sin(rot);
  vec2 pp = mat2(cs, -sn, sn, cs) * p;
  pp += (vec2(hash21(vUv + uTime * 0.7), hash21(vUv - uTime * 0.7)) - 0.5) * sc * 0.55;

  // ── log-polar coordinates -> concentric / radial standing wave
  float r = length(pp) + 0.0015;
  float ang = atan(pp.y, pp.x);
  float lr = log(r);

  // frequency indexed by radius (concentric rings = spectrum), waveform by angle
  float fc  = clamp(r * 1.35, 0.0, 1.0);
  float mag = texture(uAudio, vec2(fc, 0.5)).r;
  float wv  = texture(uWave, vec2(fract(ang / 6.2831 + 0.5), 0.5)).r * 2.0 - 1.0;

  float rings   = 0.5 + 0.5 * cos(lr * 22.0 - uTime * 0.8 + mag * 9.0);
  float petalN  = floor(4.0 + uLevel * 10.0);
  float petals  = 0.5 + 0.5 * cos(ang * petalN + uTime * 0.15 + wv * 3.0);
  float fig = rings * mix(0.55, 1.0, petals);
  fig *= (0.25 + mag * 1.7);
  fig += wv * 0.15 * smoothstep(0.1, 0.5, r);
  fig = clamp(fig, 0.0, 1.0);

  // ── per-pixel achromatic static (the rest state)
  float stat = hash21(px + floor(uTime * 24.0) * 13.7);

  // ease focus for a satisfying snap-to-clarity
  float fe = uFocus * uFocus * (3.0 - 2.0 * uFocus);

  // grey field: static dissolves into the figure as we tune in
  float grey = mix(stat, fig, fe);

  // dither threshold: random (noise) -> ordered Bayer (legible) with focus
  float rth = hash21(px + floor(uTime * 20.0) * 3.31);
  float bth = bayer8(px);
  float thr = mix(rth, bth, fe);

  // 1-bit resolve with a hair of AA so it does not shimmer
  float aa = fwidth(grey) * 0.5 + 0.0015;
  float bw = smoothstep(thr - aa, thr + aa, grey);

  fragColor = vec4(vec3(bw), 1.0);
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

function buildProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string) {
  const vs = buildShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = buildShader(gl, gl.FRAGMENT_SHADER, fsSrc);
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

function makeAudioTex(gl: WebGL2RenderingContext, n: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(n));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeClamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── engine type ──────────────────────────────────────────────────────────────

interface Engine {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  audioTex: WebGLTexture;
  waveTex: WebGLTexture;
  freqTexData: Uint8Array<ArrayBuffer>;
  waveTexData: Uint8Array<ArrayBuffer>;
  raf: number;
  frame: number;
  disposed: boolean;
  cleanupResize: (() => void) | null;
}

// ── React component ──────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "playing" | "error";

export default function TuneSignal() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<ReturnType<typeof createSafeMaster> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const focusLpRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const waveRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const engineRef = useRef<Engine | null>(null);

  // live-tuning refs (loop reads these without re-creating the engine)
  const offsetRef = useRef({ x: 0.9, y: 0.82 }); // deviation from sweet spot
  const focusRef = useRef(0); // smoothed focus 0..1
  const inputModeRef = useRef<"tilt" | "pointer">("pointer");
  const rawTiltRef = useRef({ beta: 0, gamma: 0 });
  const draggingRef = useRef(false);
  const lockFramesRef = useRef(0);
  const orientListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [noWebgl, setNoWebgl] = useState(false);
  const [trackId, setTrackId] = useState(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState(REAL_TRACKS[0].title);
  const [switching, setSwitching] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // readouts (throttled from the RAF loop)
  const [focusPct, setFocusPct] = useState(0);
  const [locked, setLocked] = useState(false);
  const [inputMode, setInputMode] = useState<"tilt" | "pointer">("pointer");
  const [readout, setReadout] = useState({ a: 0, b: 0 });
  const [orientNote, setOrientNote] = useState("");

  // full teardown on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, []);

  function stopEverything() {
    const eng = engineRef.current;
    if (eng) {
      eng.disposed = true;
      cancelAnimationFrame(eng.raf);
      eng.cleanupResize?.();
      const gl = eng.gl;
      gl.deleteProgram(eng.prog);
      gl.deleteTexture(eng.audioTex);
      gl.deleteTexture(eng.waveTex);
      gl.deleteVertexArray(eng.vao);
      engineRef.current = null;
    }
    if (orientListenerRef.current) {
      window.removeEventListener("deviceorientation", orientListenerRef.current);
      orientListenerRef.current = null;
    }
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current?.disconnect();
    focusLpRef.current?.disconnect();
    masterRef.current?.disconnect();
    audioCtxRef.current?.close().catch(() => {});
    sourceRef.current = null;
    focusLpRef.current = null;
    masterRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
  }

  // ── body-tuning input ────────────────────────────────────────────────────

  function handleOrientation(e: DeviceOrientationEvent) {
    if (e.beta == null || e.gamma == null) return;
    inputModeRef.current = "tilt";
    setInputMode("tilt");
    rawTiltRef.current = { beta: e.beta, gamma: e.gamma };
    offsetRef.current = {
      x: makeClamp((e.gamma - SWEET_TILT.gamma) / TILT_RANGE, -2, 2),
      y: makeClamp((e.beta - SWEET_TILT.beta) / TILT_RANGE, -2, 2),
    };
  }

  function applyPointer(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    inputModeRef.current = "pointer";
    setInputMode("pointer");
    rawTiltRef.current = { beta: 0, gamma: 0 };
    offsetRef.current = { x: nx - SWEET_POINTER.x, y: ny - SWEET_POINTER.y };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (status !== "playing") return;
    draggingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    applyPointer(e.clientX, e.clientY);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!draggingRef.current) return;
    applyPointer(e.clientX, e.clientY);
  }
  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    draggingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
  }

  async function requestOrientation() {
    const AnyDOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (AnyDOE && typeof AnyDOE.requestPermission === "function") {
      try {
        const res = await AnyDOE.requestPermission();
        if (res !== "granted") {
          setOrientNote("Tilt was declined — drag on the field to tune instead.");
          return;
        }
      } catch {
        setOrientNote("Tilt is unavailable — drag on the field to tune instead.");
        return;
      }
    }
    if ("DeviceOrientationEvent" in window) {
      if (!orientListenerRef.current) orientListenerRef.current = handleOrientation;
      window.addEventListener("deviceorientation", orientListenerRef.current);
      setOrientNote("Tilt your body to tune — or drag the field.");
    } else {
      setOrientNote("No tilt sensor — drag on the field to tune.");
    }
  }

  // ── audio ────────────────────────────────────────────────────────────────

  async function playTrack(id: string, reuseCtx: AudioContext | null) {
    const ctx =
      reuseCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    audioCtxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const { buffer, title } = await loadRealTrackBuffer(ctx, id);

    if (!masterRef.current) {
      masterRef.current = createSafeMaster(ctx);
      analyserRef.current = masterRef.current.analyser;
      const bins = masterRef.current.analyser.frequencyBinCount;
      freqRef.current = new Uint8Array(bins);
      waveRef.current = new Uint8Array(masterRef.current.analyser.fftSize);
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
    focusLpRef.current?.disconnect();

    // focus lowpass: muffled off-axis, opens as the body tunes in.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 0.5;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(lp);
    lp.connect(masterRef.current!.input);
    src.start();
    sourceRef.current = src;
    focusLpRef.current = lp;
    setTrackTitle(title);
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
    await requestOrientation();
    const started = startEngine();
    if (!started) setNoWebgl(true);
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

  // ── engine setup + loop ───────────────────────────────────────────────────

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
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

    let prog: WebGLProgram;
    try {
      prog = buildProgram(gl, VERT, FRAG);
    } catch {
      return false;
    }

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

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const audioTex = makeAudioTex(gl, AUDIO_BINS);
    const waveTex = makeAudioTex(gl, AUDIO_BINS);

    const eng: Engine = {
      gl,
      prog,
      vao,
      audioTex,
      waveTex,
      freqTexData: new Uint8Array(AUDIO_BINS),
      waveTexData: new Uint8Array(AUDIO_BINS),
      raf: 0,
      frame: 0,
      disposed: false,
      cleanupResize: null,
    };
    engineRef.current = eng;
    resizeCanvas();

    const onResize = () => {
      if (!eng.disposed) resizeCanvas();
    };
    window.addEventListener("resize", onResize);
    eng.cleanupResize = () => window.removeEventListener("resize", onResize);

    const uAudio = gl.getUniformLocation(prog, "uAudio");
    const uWave = gl.getUniformLocation(prog, "uWave");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uFocus = gl.getUniformLocation(prog, "uFocus");
    const uLevel = gl.getUniformLocation(prog, "uLevel");

    const t0 = performance.now();

    const loop = () => {
      if (eng.disposed) return;
      eng.frame++;
      const time = (performance.now() - t0) / 1000;

      // ── audio -> 128 bins + waveform + level ──
      let level = 0;
      const an = analyserRef.current;
      const freq = freqRef.current;
      const wave = waveRef.current;
      if (an && freq && wave) {
        an.getByteFrequencyData(freq);
        an.getByteTimeDomainData(wave);
        // take the musically useful low ~5.5kHz span, resampled to AUDIO_BINS
        const fSpan = Math.min(freq.length, 256);
        for (let i = 0; i < AUDIO_BINS; i++) {
          const fi = Math.floor((i / AUDIO_BINS) * fSpan);
          eng.freqTexData[i] = freq[fi];
          const wi = Math.floor((i / AUDIO_BINS) * wave.length);
          eng.waveTexData[i] = wave[wi];
        }
        let s = 0;
        for (let i = 1; i < 100; i++) s += freq[i];
        level = s / (99 * 255);
      }

      // ── tuning -> focus ──
      const off = offsetRef.current;
      const dist = Math.hypot(off.x, off.y);
      // 1 within tolerance, 0 beyond LOSE_RANGE
      const denom = Math.max(0.0001, LOSE_RANGE - LOCK_TOLERANCE);
      let target = (LOSE_RANGE - dist) / denom;
      target = makeClamp(target, 0, 1);
      target = target * target * (3 - 2 * target);
      focusRef.current += (target - focusRef.current) * 0.08;
      const focus = focusRef.current;

      // focus opens the audio lowpass (muffled off-axis, clear on-axis)
      const lp = focusLpRef.current;
      const ctx = audioCtxRef.current;
      if (lp && ctx) {
        const hz = 700 + focus * focus * 13300;
        lp.frequency.setTargetAtTime(hz, ctx.currentTime, 0.08);
      }

      // ── upload audio textures ──
      gl.bindTexture(gl.TEXTURE_2D, eng.audioTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AUDIO_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, eng.freqTexData);
      gl.bindTexture(gl.TEXTURE_2D, eng.waveTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, AUDIO_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, eng.waveTexData);

      // ── draw ──
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(eng.prog);
      gl.bindVertexArray(eng.vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, eng.audioTex);
      gl.uniform1i(uAudio, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, eng.waveTex);
      gl.uniform1i(uWave, 1);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uFocus, focus);
      gl.uniform1f(uLevel, makeClamp(level * 1.6, 0, 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);

      // ── readouts (throttled) ──
      const isLocked = focus > 0.9;
      if (isLocked) lockFramesRef.current++;
      else lockFramesRef.current = 0;
      if (eng.frame % 6 === 0) {
        setFocusPct(Math.round(focus * 100));
        setLocked(lockFramesRef.current > 8);
        if (inputModeRef.current === "tilt") {
          setReadout({
            a: Math.round(rawTiltRef.current.beta),
            b: Math.round(rawTiltRef.current.gamma),
          });
        } else {
          setReadout({
            a: Math.round(off.x * 100),
            b: Math.round(off.y * 100),
          });
        }
      }

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

  const playing = status === "playing";

  return (
    <div
      ref={containerRef}
      className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground"
    >
      {/* neutral backdrop under the signal field (also the no-WebGL fallback) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "repeating-conic-gradient(#0a0a0a 0deg 6deg, #121212 6deg 12deg)",
          opacity: 0.5,
        }}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: playing ? "grab" : "default" }}
      />

      {/* locked frame affordance */}
      {playing && locked && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 z-10 rounded-sm border border-foreground/70 transition-opacity duration-500"
        />
      )}

      {/* ── pre-roll overlay ──────────────────────────────────────────────── */}
      {!playing && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="w-full max-w-xl text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Signal / Resolution
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tune the Signal
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
              Karel&apos;s take begins as pure static. Your body is the tuning
              instrument — tilt the phone, or drag the field on a desktop, and hunt
              for the sweet spot where the noise resolves into a clear standing
              image of his music.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4">
              <label className="w-full max-w-sm text-left">
                <span className="mb-1 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
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
                {status === "loading" ? "Loading the take..." : "Begin tuning"}
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

      {/* ── no-WebGL2 notice ──────────────────────────────────────────────── */}
      {playing && noWebgl && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
          <p className="max-w-md rounded-md border border-border bg-background/70 px-4 py-3 text-center text-sm text-muted-foreground">
            The take is playing, but this device can&apos;t run the signal field
            (no WebGL2). The tuning visuals need a WebGL2-capable browser.
          </p>
        </div>
      )}

      {/* ── top bar chrome ────────────────────────────────────────────────── */}
      {playing && (
        <div
          className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)" }}
        >
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              Tune the Signal
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {trackTitle}
              {switching ? " — loading..." : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <select
              value={trackId}
              onChange={(e) => handleSwitchTrack(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
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
            <button
              onClick={toggleFullscreen}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Fullscreen
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Notes
            </button>
          </div>
        </div>
      )}

      {/* ── tuning readout / focus meter ──────────────────────────────────── */}
      {playing && (
        <div className="absolute bottom-4 left-4 z-20 w-64 rounded-lg border border-border bg-background/80 p-4 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {locked ? "Signal locked" : "Tuning"}
            </span>
            <span
              className={
                "font-mono text-xs " +
                (locked ? "text-primary" : "text-muted-foreground")
              }
            >
              {focusPct}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                "h-full transition-[width] duration-150 " +
                (locked ? "bg-primary" : "bg-foreground/70")
              }
              style={{ width: `${focusPct}%` }}
            />
          </div>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {inputMode === "tilt"
              ? `tilt  β ${readout.a}°  γ ${readout.b}°`
              : `drag  x ${readout.a}  y ${readout.b}`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {locked
              ? "Hold here — the piece is clear."
              : inputMode === "tilt"
                ? "Tilt to hunt the sweet spot."
                : "Drag the field to hunt the sweet spot."}
          </p>
          {orientNote && (
            <p className="mt-2 text-xs text-muted-foreground">{orientNote}</p>
          )}
          {errorMsg && (
            <p className="mt-2 text-sm text-destructive">{errorMsg}</p>
          )}
        </div>
      )}

      {/* ── design-notes modal ────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Tune the Signal — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Karel&apos;s real take is rendered as a stark achromatic 1-bit
                field — an ordered-dither (Bayer 8&times;8) signal spread across the
                whole viewport. At rest it reads as dense static: pure grain, no
                legible image.
              </p>
              <p>
                Your body is the tuning instrument. On a phone the DeviceOrientation
                sensor reads your tilt; on a desktop you drag the field. Both map to
                a deviation from a hidden sweet spot, and a smoothed focus value
                measures how close you are. As you tune in, a log-polar warp unwinds
                and the dither threshold switches from random to ordered — so the
                static resolves into a coherent radial standing-wave figure driven by
                the music&apos;s FFT magnitude (concentric rings) and waveform
                (angular petals). Off-axis is noise; on-axis snaps into clarity, and
                the take&apos;s lowpass opens so it clears up audibly too.
              </p>
              <p>
                Four subsystems: a catalog loader/decoder for Karel&apos;s verified
                takes; the safe-master analyser bus feeding 128 frequency bins and a
                waveform to the shader; the body-tuning input (tilt with a full
                pointer-drag fallback); and the single-pass WebGL2 signal renderer.
              </p>
              <p>
                References: Robert Borghesi&apos;s <em>ASTRODITHER</em> (2026) — an
                audio-reactive dither-as-signal aesthetic in WebGPU/TSL — and Ryoji
                Ikeda&apos;s data/signal work, for its test-pattern austerity and the
                idea of raw signal as the subject itself.
              </p>
              <p className="text-xs">
                Degrades gracefully: no WebGL2 shows an on-brand notice; declined or
                absent tilt falls back to pointer-drag; a failed take load shows a
                plain error, never a synthesized stand-in. The generative field stays
                strictly achromatic — a neutral third temperature — with violet
                reserved for tiny UI chrome only.
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
