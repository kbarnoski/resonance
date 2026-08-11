"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10248 · Sunprint — a self-developing anthotype photogram from the live camera.
//
// THE ONE QUESTION: What if your phone camera were a sheet of light-sensitive
// plant dye — and pointing it at the world slowly *developed* a warm anthotype
// photogram that sings as it forms?
//
// An anthotype (Mary Somerville, 1842) is a coating of crushed-flower pigment —
// marigold, beet, turmeric — that BLEACHES under bright light while shadows stay
// saturated, printing a warm monochrome image over hours. This is that process,
// time-lapsed to ~25s and driven live: per-pixel luminance from the camera
// cumulatively bleaches a warm dye plate (the plate has MEMORY and re-coats only
// on demand). A WebGL warm ramp — oxblood → rust → marigold → bleached cream —
// renders the developing print, and the *rate of change* of development rings
// soft, slightly-inharmonic mallet tones over a low wood drone.
//
// See README.md for the Somerville / Anna Atkins (cyanotype photogram, 1843)
// lineage and the full technique notes.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

// ── Seeded PRNG (no Math.random — the build expects determinism) ─────────────
const SEED = 0x10248;
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Plate geometry ───────────────────────────────────────────────────────────
const W = 160;
const H = 120;
const N = W * H;

// ── Shaders (GLSL ES 1.00 — runs on both WebGL1 and WebGL2) ──────────────────
const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_plate;   // R = bleach 0..1, G = fresh change
uniform float u_time;
uniform vec2 u_res;

// warm photochemical ramp: unexposed oxblood -> bleached cream
vec3 dyeRamp(float t) {
  vec3 oxblood  = vec3(0.20, 0.045, 0.05);
  vec3 umber    = vec3(0.37, 0.14, 0.07);
  vec3 rust     = vec3(0.64, 0.27, 0.09);
  vec3 marigold = vec3(0.92, 0.57, 0.19);
  vec3 amberlit = vec3(0.96, 0.76, 0.42);
  vec3 cream    = vec3(0.97, 0.92, 0.80);
  vec3 c;
  if (t < 0.2)      c = mix(oxblood,  umber,    t / 0.2);
  else if (t < 0.4) c = mix(umber,    rust,     (t - 0.2) / 0.2);
  else if (t < 0.6) c = mix(rust,     marigold, (t - 0.4) / 0.2);
  else if (t < 0.8) c = mix(marigold, amberlit, (t - 0.6) / 0.2);
  else              c = mix(amberlit, cream,    (t - 0.8) / 0.2);
  return c;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// low-frequency fibrous paper mottle
float paper(vec2 uv) {
  float a = sin(uv.x * 11.0 + uv.y * 3.0);
  float b = sin(uv.y * 17.0 - uv.x * 5.0);
  float c = sin((uv.x + uv.y) * 7.0);
  return (a * 0.5 + b * 0.3 + c * 0.2) * 0.5 + 0.5;
}

void main() {
  // aspect-correct cover of the 4:3 plate into the screen
  float texAspect = float(${W}) / float(${H});
  float screenAspect = u_res.x / u_res.y;
  vec2 p = v_uv - 0.5;
  if (screenAspect > texAspect) p.y *= texAspect / screenAspect;
  else                          p.x *= screenAspect / texAspect;
  vec2 uv = p + 0.5;
  vec2 suv = vec2(uv.x, 1.0 - uv.y); // flip Y to match camera framing

  vec4 plate = texture2D(u_plate, suv);
  float bleach = plate.r;
  float fresh = plate.g;

  vec3 col = dyeRamp(bleach);

  // paper grain: warm fibrous ground, stronger where dye is saturated
  float pap = paper(uv * 1.0);
  col *= mix(0.90, 1.06, pap) * mix(1.0, 0.94 + 0.06 * pap, 1.0 - bleach);

  // developing bloom on freshly-changing edges — a warm marigold glow
  float bloom = smoothstep(0.02, 0.5, fresh);
  col += vec3(0.85, 0.5, 0.18) * bloom * 0.55;

  // fine photochemical grain, gently animated
  float g = hash(uv * u_res * 0.5 + fract(u_time) * 91.0);
  col += (g - 0.5) * 0.045;

  // soft warm vignette (edges of the coated sheet stay a touch deeper)
  float vig = smoothstep(1.15, 0.25, length(v_uv - 0.5) * 1.4);
  col *= mix(0.72, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}`;

// ── Types ────────────────────────────────────────────────────────────────────
interface AudioBundle {
  ctx: AudioContext;
  master: GainNode;
  droneFilter: BiquadFilterNode;
  malletBus: GainNode;
}

interface LightBlob {
  x: number;
  y: number;
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  px: number;
  py: number;
  r2: number;
  amp: number;
}

interface Engine {
  gl: WebGLRenderingContext | null;
  program: WebGLProgram | null;
  tex: WebGLTexture | null;
  posBuf: WebGLBuffer | null;
  uPlate: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
  uRes: WebGLUniformLocation | null;
  canvas: HTMLCanvasElement | null;
  plate: Float32Array; // cumulative bleach 0..1 (memory)
  bytes: Uint8Array; // RGBA upload buffer
  lum: Float32Array; // per-frame luminance
  px: Float32Array; // pixel x in 0..1
  py: Float32Array; // pixel y in 0..1
  sampleCanvas: HTMLCanvasElement | null;
  sampleCtx: CanvasRenderingContext2D | null;
  video: HTMLVideoElement | null;
  stream: MediaStream | null;
  synthetic: boolean;
  blobs: LightBlob[];
  rng: () => number;
  raf: number;
  last: number;
  start: number;
  smoothChange: number;
  nextMallet: number;
  recoat: number; // >0 while a slow re-coat is decaying the plate
  audio: AudioBundle | null;
}

// Slightly-inharmonic mallet/bar partials (free-free bar ratios — NOT a
// just-intonation lattice) and equal-tempered fundamentals (octave-stretched).
const MALLET_PARTIALS: Array<[number, number]> = [
  [1.0, 1.0],
  [2.76, 0.34],
  [5.4, 0.12],
  [8.93, 0.05],
];
const MALLET_FUNDAMENTALS = [174.6, 233.1, 277.2, 329.6, 415.3, 466.2];

function makeProgram(
  gl: WebGLRenderingContext,
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
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// Warm wood drone + mallet bus. Never silent while running.
function runAudioSetup(): AudioBundle {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  // fade the bed in
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 2.5);

  // ── low warm wood drone (deliberately not a clean lattice) ────────────
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 340;
  droneFilter.Q.value = 0.6;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.5;
  droneFilter.connect(droneGain);
  droneGain.connect(master);

  const droneFreqs = [58, 87.4, 116.7]; // root, wide fifth, stretched octave
  droneFreqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "triangle" : "sine";
    o.frequency.value = f;
    o.detune.value = (i - 1) * 5;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.6 : 0.28;
    o.connect(g);
    g.connect(droneFilter);
    o.start();
    // slow breathing LFO on the wood body
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
  });

  const malletBus = ctx.createGain();
  malletBus.gain.value = 0.9;
  const malletFilter = ctx.createBiquadFilter();
  malletFilter.type = "lowpass";
  malletFilter.frequency.value = 3200;
  malletFilter.Q.value = 0.4;
  malletBus.connect(malletFilter);
  malletFilter.connect(master);

  return { ctx, master, droneFilter, malletBus };
}

function runMalletHit(
  bundle: AudioBundle,
  freq: number,
  vel: number,
  rng: () => number,
) {
  const { ctx, malletBus } = bundle;
  const t0 = ctx.currentTime;
  const detune = (rng() - 0.5) * 16; // ±8 cents, breaks any clean lattice
  const pan = ctx.createStereoPanner();
  pan.pan.value = (rng() - 0.5) * 1.2;
  pan.connect(malletBus);

  MALLET_PARTIALS.forEach(([ratio, pgain], i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    // partials stretch slightly sharp with height (bar inharmonicity)
    o.frequency.value = freq * ratio;
    o.detune.value = detune + i * 3;
    const g = ctx.createGain();
    const peak = vel * pgain * 0.5;
    const decay = 1.4 / (1.0 + i * 0.9); // higher partials die faster
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02 + decay);
    o.connect(g);
    g.connect(pan);
    o.start(t0);
    o.stop(t0 + 0.05 + decay);
  });
}

function makeBlobs(rng: () => number): LightBlob[] {
  const blobs: LightBlob[] = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    blobs.push({
      x: 0.5,
      y: 0.5,
      ax: 0.18 + rng() * 0.22,
      ay: 0.14 + rng() * 0.2,
      sx: 0.05 + rng() * 0.14,
      sy: 0.05 + rng() * 0.14,
      px: rng() * 6.28,
      py: rng() * 6.28,
      r2: 0.006 + rng() * 0.02,
      amp: 0.7 + rng() * 0.5,
    });
  }
  return blobs;
}

export default function SunprintPage() {
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [source, setSource] = useState<"camera" | "synthetic" | "audio-only">(
    "camera",
  );
  const [hasWebGL, setHasWebGL] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);

  // probe WebGL availability once
  useEffect(() => {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl");
    setHasWebGL(!!gl);
  }, []);

  const stop = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    if (e.raf) cancelAnimationFrame(e.raf);
    if (e.stream)
      e.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    if (e.video) {
      e.video.pause();
      e.video.srcObject = null;
    }
    if (e.audio) {
      const { ctx, master } = e.audio;
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        if (ctx.state !== "closed") ctx.close().catch(() => {});
      }, 500);
    }
    engineRef.current = null;
    setPhase("idle");
  }, []);

  const frame = useCallback((now: number) => {
    const e = engineRef.current;
    if (!e) return;
    const dt = Math.min(0.05, (now - e.last) / 1000);
    e.last = now;
    const tSec = (now - e.start) / 1000;

    // ── 1. gather luminance ────────────────────────────────────────────
    if (!e.synthetic && e.video && e.sampleCtx && e.video.readyState >= 2) {
      try {
        e.sampleCtx.drawImage(e.video, 0, 0, W, H);
        const data = e.sampleCtx.getImageData(0, 0, W, H).data;
        for (let i = 0; i < N; i++) {
          const j = i * 4;
          e.lum[i] =
            (0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]) / 255;
        }
      } catch {
        e.synthetic = true; // e.g. tainted canvas — fall back
      }
    }
    if (e.synthetic) {
      // deterministic self-developing light source (seeded blobs)
      for (const b of e.blobs) {
        b.x = 0.5 + b.ax * Math.sin(tSec * b.sx + b.px);
        b.y = 0.5 + b.ay * Math.sin(tSec * b.sy + b.py);
      }
      for (let i = 0; i < N; i++) {
        const x = e.px[i];
        const y = e.py[i];
        let v = 0.12; // dim ambient
        for (const b of e.blobs) {
          const dx = x - b.x;
          const dy = y - b.y;
          const d2 = dx * dx + dy * dy;
          v += b.amp * Math.exp(-d2 / (2 * b.r2));
        }
        e.lum[i] = v > 1 ? 1 : v;
      }
    }

    // ── 2. cumulative bleach with memory + re-coat ─────────────────────
    let change = 0;
    const developRate = 0.05; // ~integral to 1 over ~20s at full light
    const recoating = e.recoat > 0;
    if (recoating) e.recoat = Math.max(0, e.recoat - dt);
    for (let i = 0; i < N; i++) {
      const L = e.lum[i];
      let p = e.plate[i];
      if (recoating) {
        // slow re-coat: pull the dye back toward saturated, leave faint memory
        p += (0.04 - p) * Math.min(1, dt * 1.6);
      } else {
        // bright light bleaches (emphasise highlights); shadows hold saturation
        p += developRate * dt * (L * L * 1.4);
        if (p > 1) p = 1;
      }
      const d = p - e.plate[i];
      change += d > 0 ? d : -d;
      e.plate[i] = p;
      const j = i * 4;
      e.bytes[j] = (p * 255) | 0;
      e.bytes[j + 1] = Math.min(1, d * 42) * 255; // fresh change -> bloom
      e.bytes[j + 2] = 0;
      e.bytes[j + 3] = 255;
    }
    const changeNorm = change / N; // ~0..0.01

    // ── 3. render the developing plate ─────────────────────────────────
    const gl = e.gl;
    if (gl && e.program && e.canvas) {
      const canvas = e.canvas;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.floor(canvas.clientWidth * dpr);
      const ch = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        W,
        H,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        e.bytes,
      );
      gl.useProgram(e.program);
      gl.uniform1i(e.uPlate, 0);
      gl.uniform1f(e.uTime, tSec);
      gl.uniform2f(e.uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ── 4. sonify the rate of development ──────────────────────────────
    if (e.audio) {
      const bundle = e.audio;
      e.smoothChange = e.smoothChange * 0.9 + changeNorm * 0.1;
      const energy = Math.min(1, e.smoothChange * 220);
      // drone opens up as the plate develops faster
      bundle.droneFilter.frequency.setTargetAtTime(
        280 + energy * 520,
        bundle.ctx.currentTime,
        0.3,
      );
      const ct = bundle.ctx.currentTime;
      if (ct >= e.nextMallet) {
        // denser + louder shimmer when development is fast
        const interval = 0.9 - energy * 0.72; // 0.9s (settled) -> 0.18s (active)
        const gate = 0.12 + energy * 0.85;
        if (e.rng() < gate) {
          const fi = (e.rng() * MALLET_FUNDAMENTALS.length) | 0;
          const vel = 0.3 + energy * 0.7;
          runMalletHit(bundle, MALLET_FUNDAMENTALS[fi], vel, e.rng);
        }
        e.nextMallet = ct + interval * (0.7 + e.rng() * 0.6);
      }
    }

    e.raf = requestAnimationFrame(frame);
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;

    const rng = mulberry32(SEED);

    // seeded pixel coordinate tables (for synthetic mode)
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      px[i] = (i % W) / W;
      py[i] = Math.floor(i / W) / H;
    }

    const engine: Engine = {
      gl: null,
      program: null,
      tex: null,
      posBuf: null,
      uPlate: null,
      uTime: null,
      uRes: null,
      canvas: null,
      plate: new Float32Array(N).fill(0.02),
      bytes: new Uint8Array(N * 4),
      lum: new Float32Array(N),
      px,
      py,
      sampleCanvas: null,
      sampleCtx: null,
      video: null,
      stream: null,
      synthetic: false,
      blobs: makeBlobs(rng),
      rng,
      raf: 0,
      last: performance.now(),
      start: performance.now(),
      smoothChange: 0,
      nextMallet: 0,
      recoat: 0,
      audio: null,
    };
    engineRef.current = engine;

    // audio bed first (inside the user gesture)
    try {
      engine.audio = runAudioSetup();
    } catch {
      engine.audio = null;
    }

    // WebGL setup
    const canvas = document.getElementById(
      "sunprint-canvas",
    ) as HTMLCanvasElement | null;
    if (canvas && hasWebGL) {
      const gl = (canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext(
          "experimental-webgl",
        )) as unknown as WebGLRenderingContext | null;
      if (gl) {
        const program = makeProgram(gl, VERT_SRC, FRAG_SRC);
        if (program) {
          engine.gl = gl;
          engine.canvas = canvas;
          engine.program = program;
          engine.posBuf = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, engine.posBuf);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 3, -1, -1, 3]),
            gl.STATIC_DRAW,
          );
          const loc = gl.getAttribLocation(program, "a_pos");
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          engine.tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, engine.tex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            W,
            H,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            engine.bytes,
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          engine.uPlate = gl.getUniformLocation(program, "u_plate");
          engine.uTime = gl.getUniformLocation(program, "u_time");
          engine.uRes = gl.getUniformLocation(program, "u_res");
        }
      }
    }

    // try the camera
    let gotCamera = false;
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices?.getUserMedia
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: 320, height: 240 },
          audio: false,
        });
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = W;
        sampleCanvas.height = H;
        const sampleCtx = sampleCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        engine.stream = stream;
        engine.video = video;
        engine.sampleCanvas = sampleCanvas;
        engine.sampleCtx = sampleCtx;
        gotCamera = !!sampleCtx;
      } catch {
        gotCamera = false;
      }
    }

    if (!gotCamera) engine.synthetic = true;

    setSource(
      !engine.gl ? "audio-only" : gotCamera ? "camera" : "synthetic",
    );
    setPhase("running");

    engine.last = performance.now();
    engine.start = performance.now();
    engine.raf = requestAnimationFrame(frame);
  }, [frame, hasWebGL]);

  const recoat = useCallback(() => {
    const e = engineRef.current;
    if (e) e.recoat = 1.6;
  }, []);

  // teardown on unmount
  useEffect(() => stop, [stop]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        id="sunprint-canvas"
        className="fixed inset-0 -z-10 h-full w-full"
        style={{ background: "#150605" }}
      />

      {/* Idle hero */}
      {phase === "idle" && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            10248 · anthotype photogram
          </p>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Sunprint
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            Your camera becomes a sheet of light-sensitive plant dye. Point it at
            the world and a warm anthotype photogram slowly develops — bright
            light bleaches, shadows stay saturated — singing softly as it forms.
          </p>

          {!hasWebGL && (
            <p className="mt-4 max-w-xl text-sm text-destructive">
              WebGL is unavailable on this device, so the print cannot be drawn —
              but the warm audio bed will still play.
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start camera
            </button>
            <button
              onClick={() => setNotesOpen(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {/* Running controls */}
      {phase === "running" && (
        <div className="relative z-10 flex min-h-screen flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-md bg-background/40 px-3 py-1.5 backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {source === "camera"
                  ? "developing from camera"
                  : source === "synthetic"
                    ? "camera unavailable — self-developing"
                    : "no WebGL — audio bed only"}
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Notes
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={recoat}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Re-coat plate
            </button>
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Design notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-popover p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              A self-developing anthotype
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                An anthotype is a 19th-century photographic process: a sheet
                coated in crushed-flower pigment — marigold, beet, turmeric — is
                exposed to light for hours. Bright light bleaches the dye while
                shadows stay saturated, printing a warm monochrome image. Mary
                Somerville made the first anthotypes in 1842; the same year
                Anna Atkins began her cyanotype photograms (1843), the lineage
                this piece borrows from.
              </p>
              <p>
                Here that process is time-lapsed to about twenty-five seconds
                and driven live. Each camera frame is reduced to a{" "}
                {W}×{H} luminance plate; bright regions cumulatively bleach a
                warm dye, dark regions hold their oxblood saturation. The plate
                has memory and only lightens — a slow &ldquo;re-coat&rdquo;
                resets it on demand.
              </p>
              <p>
                The WebGL ramp runs deep oxblood → rust → marigold → bleached
                cream over paper grain, with a warm bloom on freshly-resolving
                edges. The rate of development is sonified: soft, slightly
                inharmonic mallet tones ring as edges settle, over a low wood
                drone that never falls silent.
              </p>
              <p>
                With no camera it falls back to a seeded, deterministic moving
                light source so a muted phone still watches a photogram form.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
