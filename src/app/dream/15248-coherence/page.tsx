"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15248 · Coherence — breathe his music out of a veil.
//
// THE ONE QUESTION: What if Karel's recording only comes into full presence when
// your BREATHING phase-locks to a slow ~6-breaths-per-minute pace — so you
// literally breathe his music out of a veil by achieving cardiac/respiratory
// coherence?
//
// A resonance-frequency pacer runs at 0.1 Hz (one inhale+exhale every ~10 s — the
// HRV-resonance sweet spot, Lehrer & Vaschillo). A hand-written WebGL2 fragment
// shader renders an achromatic "breath lens": near-black, blurred and diffuse at
// rest; focusing toward a single luminous still point as your breathing entrains
// to the pacer. The whole grayscale field gently expands on the inhale and settles
// on the exhale at the ~10 s period — that slow glow IS the breathing guide.
//
// The ONLY audible sound is one of Karel's real catalog takes, lifted through a
// coherence-driven veil (muffled + distant → clear + present). Your microphone is
// a CONTROL signal only — read for a breath envelope, never routed to the speakers.
//
// See README.md for the coherence estimator, the veil-lift chain, and references.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── The resonance pacer ──────────────────────────────────────────────────────
const BREATH_PERIOD_S = 10; // 0.1 Hz — six breaths per minute
const CORR_WINDOW_S = 24; // sliding window for the phase-locking estimate
const SAMPLE_HZ = 20; // rate at which breath + pacer are logged for correlation
const RING_LEN = CORR_WINDOW_S * SAMPLE_HZ;
const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath"

// ── WebGL2 shaders (GLSL ES 3.00) — achromatic breath lens ───────────────────
const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG_SRC = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;      // seconds
uniform float u_coh;       // coherence 0..1
uniform float u_breath;    // pacer lung-fill 0..1 (the visible guide)
uniform float u_audio;     // live audio level 0..1 (his piano shimmer)
uniform float u_reduced;   // 1.0 = prefers-reduced-motion

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y; // aspect-correct, centered
  float r = length(uv);

  float t = (u_reduced > 0.5) ? 0.0 : u_time * 0.05;
  float coh = clamp(u_coh, 0.0, 1.0);

  // Domain-warped value-noise caustic. Detail sharpens as coherence rises.
  float detail = mix(1.3, 3.8, coh);
  vec2 q = vec2(fbm(uv * 1.5 + t),
                fbm(uv * 1.5 + vec2(5.2, 1.3) - t));
  float warp = fbm(uv * detail + q * mix(2.6, 1.0, coh) + t * 0.5);

  // Bright caustic filaments — thin and crisp only when coherent.
  float caustic = pow(1.0 - abs(warp - 0.5) * 2.0, mix(1.5, 6.0, coh));
  // Fine shimmer riding his real piano.
  caustic += caustic * u_audio * 0.35 * (u_reduced > 0.5 ? 0.0 : 1.0);

  // Diffuse veil glow that dominates when coherence is low.
  float diffuse = 0.5 + 0.5 * fbm(uv * 0.8 - t * 0.3);

  // The clarifying still point: gathers to a single bright core near coherence 1.
  float point = exp(-r * r * mix(2.0, 26.0, coh)) * mix(0.15, 1.5, coh);

  float field = mix(diffuse * 0.5, caustic, smoothstep(0.0, 1.0, coh));
  float L = field * mix(0.16, 0.72, coh) + point;

  // The whole field breathes with the pacer — slow expand on inhale, settle on
  // exhale. Frozen to a steady glow under reduced-motion.
  float breath = (u_reduced > 0.5) ? 0.5 : u_breath;
  L *= 0.78 + 0.38 * breath;

  // Soft vignette so the veil falls away at the edges.
  L *= smoothstep(1.35, 0.15, r);

  L = pow(clamp(L, 0.0, 1.0), 0.92);
  fragColor = vec4(vec3(L), 1.0);
}`;

// ── Engine handles held across frames (all torn down on stop) ────────────────
interface Engine {
  ctx: AudioContext | null;
  master: SafeMaster | null;
  src: AudioBufferSourceNode | null;
  filter: BiquadFilterNode | null;
  mainGain: GainNode | null;
  wetGain: GainNode | null;
  delay: DelayNode | null;
  feedback: GainNode | null;
  micStream: MediaStream | null;
  micSource: MediaStreamAudioSourceNode | null;
  breathAnalyser: AnalyserNode | null;
  breathBuf: Uint8Array | null;
  audioBuf: Uint8Array | null;

  gl: WebGL2RenderingContext | null;
  program: WebGLProgram | null;
  vbo: WebGLBuffer | null;
  vao: WebGLVertexArrayObject | null;
  uRes: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uCoh: WebGLUniformLocation | null;
  uBreath: WebGLUniformLocation | null;
  uAudio: WebGLUniformLocation | null;
  uReduced: WebGLUniformLocation | null;
  canvas2d: CanvasRenderingContext2D | null;

  raf: number;
  startTime: number;
  lastSample: number;

  // Breath follower + coherence state.
  breathEnv: number; // heavily smoothed breath envelope
  breathPrev: number;
  ringBreath: Float32Array;
  ringPacer: Float32Array;
  ringPos: number;
  ringFilled: number;
  peakTimes: number[]; // timestamps of inhale peaks (for rate match)
  coherence: number; // smoothed 0..1
  lastSlope: number; // previous breath-envelope slope (peak detection)
  lastUi: number; // last throttled UI update (ms)

  guided: boolean;
  reduced: boolean;
}

function makeEngine(): Engine {
  return {
    ctx: null, master: null, src: null, filter: null, mainGain: null,
    wetGain: null, delay: null, feedback: null, micStream: null,
    micSource: null, breathAnalyser: null, breathBuf: null, audioBuf: null,
    gl: null, program: null, vbo: null, vao: null, uRes: null, uTime: null,
    uCoh: null, uBreath: null, uAudio: null, uReduced: null, canvas2d: null,
    raf: 0, startTime: 0, lastSample: 0,
    breathEnv: 0, breathPrev: 0,
    ringBreath: new Float32Array(RING_LEN),
    ringPacer: new Float32Array(RING_LEN),
    ringPos: 0, ringFilled: 0, peakTimes: [], coherence: 0,
    lastSlope: 0, lastUi: 0,
    guided: false, reduced: false,
  };
}

function compileProgram(
  gl: WebGL2RenderingContext,
  vsrc: string,
  fsrc: string,
): WebGLProgram | null {
  const compile = (type: number, src: string) => {
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
  const vs = compile(gl.VERTEX_SHADER, vsrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// Pearson correlation between two same-length series (mean-removed).
function correlate(a: Float32Array, b: Float32Array, n: number): number {
  if (n < 8) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    cov += da * db; va += da * da; vb += db * db;
  }
  if (va < 1e-6 || vb < 1e-6) return 0;
  return cov / Math.sqrt(va * vb);
}

export default function CoherencePage() {
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>("Bath");
  const [guided, setGuided] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Live display values, updated at a throttled rate from the rAF loop.
  const [cohPct, setCohPct] = useState(0);
  const [inhaling, setInhaling] = useState(true);
  const [webglOk, setWebglOk] = useState(true);

  const engineRef = useRef<Engine>(makeEngine());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guidedRef = useRef(guided);
  guidedRef.current = guided;

  const reducedMotion = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = mq.matches;
    const on = () => { reducedMotion.current = mq.matches; };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ── Full teardown ──────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    const e = engineRef.current;
    if (e.raf) cancelAnimationFrame(e.raf);
    e.raf = 0;
    try { e.src?.stop(); } catch { /* already stopped */ }
    [e.src, e.filter, e.mainGain, e.wetGain, e.delay, e.feedback,
      e.micSource, e.breathAnalyser].forEach((n) => {
      try { n?.disconnect(); } catch { /* closing */ }
    });
    try { e.master?.disconnect(); } catch { /* closing */ }
    e.micStream?.getTracks().forEach((t) => t.stop());
    if (e.ctx && e.ctx.state !== "closed") void e.ctx.close();

    const gl = e.gl;
    if (gl) {
      try {
        if (e.program) gl.deleteProgram(e.program);
        if (e.vbo) gl.deleteBuffer(e.vbo);
        if (e.vao) gl.deleteVertexArray(e.vao);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch { /* context gone */ }
    }
    engineRef.current = makeEngine();
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
    setCohPct(0);
    setNotice(null);
  }, [teardown]);

  // ── Start: load Karel's take, wire the veil-lift chain, open the mic ─────────
  const begin = useCallback(async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    const e = engineRef.current;
    e.reduced = reducedMotion.current;
    e.guided = guidedRef.current;

    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      e.ctx = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const master = createSafeMaster(ctx, { gain: 0.9 });
      e.master = master;

      // Load one of Karel's real takes.
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      setTrackTitle(title);

      // ── Veil-lift chain, all driven by coherence 0→1 ──────────────────────
      //   src → filter(lowpass) → mainGain → master.input        (dry, present)
      //   src → filter          → wetGain  → delay(⟲feedback) → master.input
      //                                                          (distance tail)
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320; // veiled
      filter.Q.value = 0.7;

      const mainGain = ctx.createGain();
      mainGain.gain.value = 0.25; // quiet at rest

      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.5; // far-away tail dominates at rest

      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.33;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.42;

      src.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(master.input);

      filter.connect(wetGain);
      wetGain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay); // regenerating tail = "distance"
      delay.connect(master.input);

      src.start();

      e.src = src;
      e.filter = filter;
      e.mainGain = mainGain;
      e.wetGain = wetGain;
      e.delay = delay;
      e.feedback = feedback;
      e.audioBuf = new Uint8Array(master.analyser.frequencyBinCount);

      // ── Microphone → breath analyser (CONTROL only; never to output) ──────
      if (!e.guided) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          e.micStream = stream;
          const micSource = ctx.createMediaStreamSource(stream);
          const ba = ctx.createAnalyser();
          ba.fftSize = 1024;
          ba.smoothingTimeConstant = 0.3;
          micSource.connect(ba); // DEAD-ENDS here — visitor never hears the mic
          e.micSource = micSource;
          e.breathAnalyser = ba;
          e.breathBuf = new Uint8Array(ba.fftSize);
        } catch {
          // Mic denied / unavailable — fall back to a perfectly-guided breath.
          e.guided = true;
          setGuided(true);
          setNotice(
            "Microphone unavailable — running the guided demo so the veil-lift still plays end to end.",
          );
        }
      }
      if (e.guided && !e.micStream) {
        setNotice((n) =>
          n ??
          "Guided demo: a perfectly-coherent breath is synthesized so the full bloom plays with no microphone.",
        );
      }

      // ── WebGL2 breath lens (or 2D canvas fallback) ────────────────────────
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(canvas.clientWidth * dpr);
        canvas.height = Math.floor(canvas.clientHeight * dpr);
        const gl = canvas.getContext("webgl2", {
          antialias: false,
          premultipliedAlpha: false,
        });
        if (gl) {
          const program = compileProgram(gl, VERT_SRC, FRAG_SRC);
          if (program) {
            const vbo = gl.createBuffer();
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(
              gl.ARRAY_BUFFER,
              new Float32Array([-1, -1, 3, -1, -1, 3]),
              gl.STATIC_DRAW,
            );
            const loc = gl.getAttribLocation(program, "a_pos");
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
            gl.useProgram(program);
            e.gl = gl;
            e.program = program;
            e.vbo = vbo;
            e.vao = vao;
            e.uRes = gl.getUniformLocation(program, "u_res");
            e.uTime = gl.getUniformLocation(program, "u_time");
            e.uCoh = gl.getUniformLocation(program, "u_coh");
            e.uBreath = gl.getUniformLocation(program, "u_breath");
            e.uAudio = gl.getUniformLocation(program, "u_audio");
            e.uReduced = gl.getUniformLocation(program, "u_reduced");
            setWebglOk(true);
          } else {
            gl.getExtension("WEBGL_lose_context")?.loseContext();
          }
        }
        if (!e.gl) {
          // Fallback: 2D glow so the piece still demonstrates.
          e.canvas2d = canvas.getContext("2d");
          setWebglOk(false);
        }
      }

      e.startTime = performance.now();
      e.lastSample = e.startTime;
      e.coherence = e.guided ? 0.08 : 0;
      setPhase("running");
      setLoading(false);
      e.raf = requestAnimationFrame(frame);
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error
          ? `Could not load the recording: ${err.message}`
          : "Could not load the recording.",
      );
      teardown();
      setPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, teardown]);

  // ── The per-frame loop: sense breath, score coherence, lift the veil, draw ──
  const frame = useCallback(() => {
    const e = engineRef.current;
    const ctx = e.ctx;
    if (!ctx) return;

    const now = performance.now();
    const tSec = (now - e.startTime) / 1000;

    // Pacer: lung-fill 0..1, rising through the inhale half, falling on exhale.
    const p = (tSec / BREATH_PERIOD_S) % 1;
    const pacer = 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
    const pacerInhaling = p < 0.5;

    // ── Breath envelope ──────────────────────────────────────────────────────
    let breathTarget: number;
    if (e.guided || !e.breathAnalyser || !e.breathBuf) {
      // Perfectly-coherent synthetic breath = the pacer itself.
      breathTarget = pacer;
    } else {
      const ba = e.breathAnalyser;
      const buf = e.breathBuf;
      ba.getByteTimeDomainData(buf as unknown as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Breath noise is a slow rise/fall of this loudness. Compress into 0..1.
      breathTarget = Math.min(1, rms * 6);
    }
    // Heavy follower (~0.9 s) so only the slow breath rise/fall survives.
    const k = e.guided ? 0.12 : 0.045;
    e.breathPrev = e.breathEnv;
    e.breathEnv += (breathTarget - e.breathEnv) * k;

    // Inhale-peak detection (for the rate match): the envelope turns over from
    // rising to falling. Interval between peaks ≈ one full breath period.
    const slope = e.breathEnv - e.breathPrev;
    if (e.lastSlope > 0 && slope <= 0 && e.breathEnv > 0.15) {
      const last = e.peakTimes[e.peakTimes.length - 1];
      if (last === undefined || now - last > 3000) {
        e.peakTimes.push(now);
        if (e.peakTimes.length > 6) e.peakTimes.shift();
      }
    }
    e.lastSlope = slope;

    // ── Log breath + pacer at SAMPLE_HZ for the phase-locking estimate ───────
    if (now - e.lastSample >= 1000 / SAMPLE_HZ) {
      e.lastSample = now;
      e.ringBreath[e.ringPos] = e.breathEnv;
      e.ringPacer[e.ringPos] = pacer;
      e.ringPos = (e.ringPos + 1) % RING_LEN;
      if (e.ringFilled < RING_LEN) e.ringFilled++;

      // Phase match: correlation of breath vs pacer over the window.
      const n = e.ringFilled;
      const corr = correlate(e.ringBreath, e.ringPacer, n);
      let phaseMatch = Math.max(0, corr);

      // Rate match: how close the visitor's breath period is to ~10 s.
      let rateMatch = phaseMatch; // fall back to phase if we can't measure rate
      if (e.peakTimes.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < e.peakTimes.length; i++) {
          intervals.push((e.peakTimes[i] - e.peakTimes[i - 1]) / 1000);
        }
        intervals.sort((a, b) => a - b);
        const period = intervals[Math.floor(intervals.length / 2)];
        rateMatch = Math.exp(-((period - BREATH_PERIOD_S) ** 2) / (2 * 9));
      }

      // If they are barely breathing, the correlation is just noise — gate it.
      let variance = 0;
      let mean = 0;
      for (let i = 0; i < n; i++) mean += e.ringBreath[i];
      mean /= Math.max(1, n);
      for (let i = 0; i < n; i++) variance += (e.ringBreath[i] - mean) ** 2;
      variance /= Math.max(1, n);
      if (!e.guided && variance < 0.0015) phaseMatch = 0;

      const target = 0.5 * phaseMatch + 0.5 * rateMatch;
      // Heavy smoothing so coherence drifts like a tide, never jitters.
      e.coherence += (target - e.coherence) * 0.06;
    }

    const coh = Math.max(0, Math.min(1, e.coherence));

    // ── Lift the veil (all ramped smoothly with setTargetAtTime) ─────────────
    if (e.filter && e.mainGain && e.wetGain) {
      const tc = 0.6;
      // Muffled 320 Hz → clear 18 kHz. Exponential feels like a tide of clarity.
      const cutoff = 320 * Math.pow(18000 / 320, coh);
      e.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, tc);
      e.mainGain.gain.setTargetAtTime(0.25 + 0.7 * coh, ctx.currentTime, tc);
      // Distant tail recedes as presence arrives.
      e.wetGain.gain.setTargetAtTime(0.5 - 0.45 * coh, ctx.currentTime, tc);
    }

    // ── Audio level for the shimmer uniform ──────────────────────────────────
    let audioLevel = 0;
    if (e.master && e.audioBuf) {
      e.master.analyser.getByteFrequencyData(
        e.audioBuf as unknown as Uint8Array<ArrayBuffer>,
      );
      let s = 0;
      for (let i = 0; i < e.audioBuf.length; i++) s += e.audioBuf[i];
      audioLevel = Math.min(1, s / e.audioBuf.length / 128);
    }

    // ── Draw the breath lens ─────────────────────────────────────────────────
    const gl = e.gl;
    if (gl && e.program) {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(e.uRes, canvas.width, canvas.height);
        gl.uniform1f(e.uTime, tSec);
        gl.uniform1f(e.uCoh, coh);
        gl.uniform1f(e.uBreath, pacer);
        gl.uniform1f(e.uAudio, audioLevel);
        gl.uniform1f(e.uReduced, e.reduced ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    } else if (e.canvas2d) {
      drawCanvasFallback(e.canvas2d, coh, pacer, e.reduced);
    }

    // ── Throttled UI updates ─────────────────────────────────────────────────
    if (now - e.lastUi > 150) {
      e.lastUi = now;
      setCohPct(Math.round(coh * 100));
      setInhaling(pacerInhaling);
    }

    e.raf = requestAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 15248 · biosignal
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Coherence
          </h1>
          <p className="text-base text-muted-foreground">
            Breathe with the slow glow — about six breaths a minute — and Karel&apos;s
            recording lifts out of a veil into full, close presence as your breath
            phase-locks to the pacer.
          </p>
        </header>

        {/* The breath lens */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            aria-label="Achromatic breath lens: a grayscale light field that focuses as your breathing entrains to the pacer."
          />
          {phase === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                the veil is drawn
              </p>
            </div>
          )}
          {phase === "running" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {inhaling ? "inhale…" : "exhale…"}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {trackTitle}
              </span>
            </div>
          )}
        </div>

        {/* Coherence meter */}
        {phase === "running" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                coherence
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {cohPct}%
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-background"
              role="progressbar"
              aria-valuenow={cohPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Respiratory coherence"
            >
              <div
                className="h-full rounded-full bg-foreground/80 transition-[width] duration-200 ease-out"
                style={{ width: `${cohPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {phase === "idle" ? (
              <button
                onClick={begin}
                disabled={loading}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Loading the recording…" : "Begin"}
              </button>
            ) : (
              <button
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Draw the veil
              </button>
            )}

            <button
              onClick={() => setGuided((g) => !g)}
              disabled={phase === "running"}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors disabled:opacity-50 ${
                guided
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
              aria-pressed={guided}
            >
              Guided demo {guided ? "on" : "off"}
            </button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              recording
            </span>
            <select
              value={trackId}
              onChange={(ev) => setTrackId(ev.target.value)}
              disabled={phase === "running"}
              className="min-h-[44px] w-full max-w-sm rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          {notice && (
            <p className="text-base text-muted-foreground">{notice}</p>
          )}
          {!webglOk && phase === "running" && (
            <p className="text-base text-muted-foreground">
              WebGL2 is unavailable here — showing the 2D fallback glow so the piece
              still demonstrates.
            </p>
          )}
          {error && <p className="text-base text-destructive">{error}</p>}
        </div>

        {/* Design notes */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="self-start font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showNotes}
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
          {showNotes && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4 text-base text-muted-foreground">
              <p>
                The pacer runs at 0.1 Hz — one full inhale-and-exhale every ten
                seconds, six breaths a minute. That is the resonance-frequency region
                where heart-rate variability peaks and cardiac and respiratory
                rhythms lock together (Lehrer &amp; Vaschillo). The grayscale field
                expands on the inhale and settles on the exhale so you have a visible
                rhythm to match — no counting.
              </p>
              <p>
                Coherence blends a <em>rate match</em> (how close your measured breath
                period is to ten seconds) with a <em>phase match</em> — a running
                correlation between your breath envelope and the pacer over a
                twenty-four-second window. As it rises, the recording&apos;s low-pass
                veil opens from ~320 Hz toward ~18 kHz, its level lifts, and a distant
                echo tail recedes into dry, intimate presence. The light focuses from
                a diffuse fog toward a single bright still point.
              </p>
              <p>
                Your microphone is read only for the slow rise and fall of breath
                loudness; it is never routed to the speakers. The only sound is
                Karel&apos;s real take.
              </p>
            </div>
          )}
        </div>
      </div>

      <PrototypeNav slugs={["15248-coherence"]} />
    </div>
  );
}

// ── 2D canvas fallback: a slow grayscale glow that focuses with coherence ────
function drawCanvasFallback(
  c2d: CanvasRenderingContext2D,
  coh: number,
  breath: number,
  reduced: boolean,
) {
  const cv = c2d.canvas;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  c2d.fillStyle = "#000";
  c2d.fillRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2;
  const cy = cv.height / 2;
  const b = reduced ? 0.5 : breath;
  const maxR = Math.min(cv.width, cv.height) * (0.55 - 0.28 * coh) * (0.85 + 0.35 * b);
  const core = 0.16 + 0.72 * coh;
  const g = c2d.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, maxR));
  const lum = Math.round(core * 255);
  g.addColorStop(0, `rgb(${lum},${lum},${lum})`);
  g.addColorStop(0.5, `rgba(${lum},${lum},${lum},${0.25 + 0.4 * coh})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c2d.fillStyle = g;
  c2d.fillRect(0, 0, cv.width, cv.height);
}
