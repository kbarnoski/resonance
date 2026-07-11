"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Poem corpus ───────────────────────────────────────────────────────────────
// Ghost-narrative phrases. Markov chain fragments these under turbulence.
const CORPUS = [
  "the resonance here is ancient",
  "let yourself be absorbed by it",
  "something stirs beneath the roots",
  "a low note then silence",
  "the water remembers every sound that has passed through this place",
  "a single breath",
  "the horizon wraps around you",
  "the first light is also the first sound",
  "they arrive together",
  "you are not rising",
  "the world is receding",
  "everything that ever sounded here still does",
  "if you know how to listen",
  "the music is not coming from outside",
  "it has always been here",
  "you are not separate from it",
  "the sound is the silence between",
  "in the dark the note sustains",
  "what you carry is lighter now",
  "the path leads inward",
  "you are the instrument",
  "the silence is also music",
  "listen to what does not end",
  "the deep note holds you",
  "still water reflects everything",
  "here the music slows and opens",
  "below the surface everything connects",
  "the shape of your breath is the shape of the song",
];

type MarkovTable = Record<string, string[]>;

function buildMarkov(sentences: string[]): MarkovTable {
  const table: MarkovTable = { __start__: [] };
  for (const s of sentences) {
    const ws = s.toLowerCase().split(/\s+/).filter(Boolean);
    if (ws.length) table.__start__.push(ws[0]);
    for (let i = 0; i < ws.length - 1; i++) {
      if (!table[ws[i]]) table[ws[i]] = [];
      table[ws[i]].push(ws[i + 1]);
    }
  }
  return table;
}

const MARKOV = buildMarkov(CORPUS);

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePoem(turbulence: number): string {
  // Still water: exact sentence from corpus
  if (turbulence < 0.22) {
    const sentence = pickRandom(CORPUS);
    const ws = sentence.split(" ");
    ws[0] = ws[0].charAt(0).toUpperCase() + ws[0].slice(1);
    return ws.join(" ") + ".";
  }

  // Turbulent: Markov chain fragment (length shrinks with turbulence)
  const maxWords = turbulence > 0.55 ? 1 : turbulence > 0.35 ? 2 : 4;
  const starters = MARKOV.__start__;
  if (!starters || !starters.length) return "silence";
  let word = pickRandom(starters);
  const words = [word];
  for (let i = 1; i < maxWords; i++) {
    const nexts = MARKOV[word];
    if (!nexts || !nexts.length) break;
    word = pickRandom(nexts);
    words.push(word);
  }
  words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  return words.join(" ");
}

// ── GLSL ──────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a;
out vec2 uv;
void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

const ADVECT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform float u_dt;
uniform float u_diss;
out vec4 o;
void main() {
  vec2 vel = texture(u_vel, uv).xy;
  vec2 pos = clamp(uv - u_dt * vel, 0.0, 1.0);
  o = u_diss * texture(u_src, pos);
}`;

const DIVERGENCE = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 ts = 1.0 / vec2(textureSize(u_vel, 0));
  float L = texture(u_vel, uv - vec2(ts.x, 0.0)).x;
  float R = texture(u_vel, uv + vec2(ts.x, 0.0)).x;
  float B = texture(u_vel, uv - vec2(0.0, ts.y)).y;
  float T = texture(u_vel, uv + vec2(0.0, ts.y)).y;
  o = vec4((R - L + T - B) * 0.5, 0.0, 0.0, 1.0);
}`;

const PRESSURE = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_pres;
uniform sampler2D u_div;
out vec4 o;
void main() {
  vec2 ts = 1.0 / vec2(textureSize(u_pres, 0));
  float L = texture(u_pres, uv - vec2(ts.x, 0.0)).x;
  float R = texture(u_pres, uv + vec2(ts.x, 0.0)).x;
  float B = texture(u_pres, uv - vec2(0.0, ts.y)).x;
  float T = texture(u_pres, uv + vec2(0.0, ts.y)).x;
  float d = texture(u_div, uv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_pres;
uniform sampler2D u_vel;
out vec4 o;
void main() {
  vec2 ts = 1.0 / vec2(textureSize(u_pres, 0));
  float L = texture(u_pres, uv - vec2(ts.x, 0.0)).x;
  float R = texture(u_pres, uv + vec2(ts.x, 0.0)).x;
  float B = texture(u_pres, uv - vec2(0.0, ts.y)).x;
  float T = texture(u_pres, uv + vec2(0.0, ts.y)).x;
  vec2 vel = texture(u_vel, uv).xy - 0.5 * vec2(R - L, T - B);
  o = vec4(vel, 0.0, 1.0);
}`;

const SPLAT = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_src;
uniform vec2 u_pos;
uniform vec3 u_col;
uniform float u_rad;
uniform float u_ar;
out vec4 o;
void main() {
  vec2 d = uv - u_pos;
  d.x *= u_ar;
  float g = exp(-dot(d, d) / u_rad);
  o = vec4(texture(u_src, uv).rgb + g * u_col, 1.0);
}`;

// Dark-ocean display: near-black water with deep teal/violet wisps.
// Text reads easily against the dark background.
const DISPLAY = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_dye;
out vec4 o;
void main() {
  vec3 c = texture(u_dye, uv).rgb * 0.62;
  c = c / (1.0 + dot(c, vec3(0.22, 0.52, 0.26)));
  o = vec4(pow(max(c, vec3(0.0)), vec3(0.52)), 1.0);
}`;

// ── WebGL helpers ─────────────────────────────────────────────────────────────

type GL = WebGL2RenderingContext;

function compileProg(gl: GL, fsSrc: string): WebGLProgram {
  const compileShader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("createShader failed");
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "shader compile error");
    return s;
  };
  const p = gl.createProgram();
  if (!p) throw new Error("createProgram failed");
  gl.attachShader(p, compileShader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "link error");
  return p;
}

interface FBO { tex: WebGLTexture; fb: WebGLFramebuffer }
interface DFBO { read: FBO; write: FBO; swap(): void }

function makeFBO(gl: GL, w: number, h: number): FBO {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb };
}

function makeDFBO(gl: GL, w: number, h: number): DFBO {
  let a = makeFBO(gl, w, h);
  let b = makeFBO(gl, w, h);
  return {
    get read() { return a; },
    get write() { return b; },
    swap() { const t = a; a = b; b = t; },
  };
}

interface Sim {
  gl: GL;
  vel: DFBO; pres: DFBO; div: FBO; dye: DFBO;
  quad: WebGLBuffer;
  progs: {
    advect: WebGLProgram; div: WebGLProgram; pres: WebGLProgram;
    grad: WebGLProgram; splat: WebGLProgram; display: WebGLProgram;
  };
  W: number; H: number;
}

function initSim(canvas: HTMLCanvasElement): Sim {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL 2 is not supported in this browser.");
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw new Error("Float render targets not available.");
  const W = 128;
  const H = 128;
  const quad = gl.createBuffer();
  if (!quad) throw new Error("createBuffer failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  return {
    gl,
    vel: makeDFBO(gl, W, H),
    pres: makeDFBO(gl, W, H),
    div: makeFBO(gl, W, H),
    dye: makeDFBO(gl, W, H),
    quad,
    progs: {
      advect: compileProg(gl, ADVECT),
      div: compileProg(gl, DIVERGENCE),
      pres: compileProg(gl, PRESSURE),
      grad: compileProg(gl, GRADIENT),
      splat: compileProg(gl, SPLAT),
      display: compileProg(gl, DISPLAY),
    },
    W,
    H,
  };
}

function drawQuad(gl: GL, prog: WebGLProgram, quad: WebGLBuffer) {
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}

function blit(gl: GL, fb: WebGLFramebuffer | null, w: number, h: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function bindTex(gl: GL, unit: number, tex: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
}

function addSplat(
  sim: Sim,
  x: number, y: number,
  vx: number, vy: number,
  r: number, g: number, b: number,
  velRad = 0.012,
  dyeRad = 0.005,
) {
  const { gl, progs, quad, vel, dye, W, H } = sim;
  const ar = W / H;
  drawQuad(gl, progs.splat, quad);
  gl.uniform2f(gl.getUniformLocation(progs.splat, "u_pos"), x, y);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_ar"), ar);
  bindTex(gl, 0, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.splat, "u_src"), 0);
  gl.uniform3f(gl.getUniformLocation(progs.splat, "u_col"), vx, vy, 0);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_rad"), velRad);
  blit(gl, vel.write.fb, W, H);
  vel.swap();
  bindTex(gl, 0, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.splat, "u_src"), 0);
  gl.uniform3f(gl.getUniformLocation(progs.splat, "u_col"), r, g, b);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_rad"), dyeRad);
  blit(gl, dye.write.fb, W, H);
  dye.swap();
}

function stepSim(sim: Sim, dt: number) {
  const { gl, progs, quad, vel, pres, div, dye, W, H } = sim;

  drawQuad(gl, progs.advect, quad);
  bindTex(gl, 0, vel.read.tex);
  bindTex(gl, 1, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_vel"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_src"), 1);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_dt"), dt);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_diss"), 0.88);
  blit(gl, vel.write.fb, W, H);
  vel.swap();

  drawQuad(gl, progs.div, quad);
  bindTex(gl, 0, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.div, "u_vel"), 0);
  blit(gl, div.fb, W, H);

  drawQuad(gl, progs.pres, quad);
  bindTex(gl, 1, div.tex);
  gl.uniform1i(gl.getUniformLocation(progs.pres, "u_div"), 1);
  for (let i = 0; i < 25; i++) {
    bindTex(gl, 0, pres.read.tex);
    gl.uniform1i(gl.getUniformLocation(progs.pres, "u_pres"), 0);
    blit(gl, pres.write.fb, W, H);
    pres.swap();
  }

  drawQuad(gl, progs.grad, quad);
  bindTex(gl, 0, pres.read.tex);
  bindTex(gl, 1, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.grad, "u_pres"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.grad, "u_vel"), 1);
  blit(gl, vel.write.fb, W, H);
  vel.swap();

  drawQuad(gl, progs.advect, quad);
  bindTex(gl, 0, vel.read.tex);
  bindTex(gl, 1, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_vel"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_src"), 1);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_dt"), dt);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_diss"), 0.989);
  blit(gl, dye.write.fb, W, H);
  dye.swap();
}

function renderDisplay(sim: Sim, cw: number, ch: number) {
  const { gl, progs, quad, dye } = sim;
  drawQuad(gl, progs.display, quad);
  bindTex(gl, 0, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.display, "u_dye"), 0);
  blit(gl, null, cw, ch);
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "mic" | "still";

interface PoemState {
  text: string;
  opacity: number;
  x: number;  // % from left
  y: number;  // % from top
}

export default function PoemFluidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5, lx: 0.5, ly: 0.5, down: false });
  const turbRef = useRef(0); // 0–1 turbulence score; decays toward 0
  const ambTimerRef = useRef(0);
  const ambPhaseRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [glError, setGlError] = useState<string | null>(null);
  const [poem, setPoem] = useState<PoemState>({ text: "", opacity: 0, x: 50, y: 45 });

  const useMic = mode === "mic";
  const { running, error: micError, start: startMic, stop: stopMic, getFrame, gain, setGain } =
    useMicAnalyser({ smoothing: 0.82, gain: 2.0, onsetThreshold: 1.6 });

  // ── Pointer events ──────────────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toUV = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: 1.0 - (cy - r.top) / r.height };
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const { x, y } = toUV(e.clientX, e.clientY);
      mouseRef.current = { x, y, lx: x, ly: y, down: true };
    };
    const onMove = (e: PointerEvent) => {
      if (!mouseRef.current.down) return;
      const { x, y } = toUV(e.clientX, e.clientY);
      mouseRef.current.x = x;
      mouseRef.current.y = y;
    };
    const onUp = () => { mouseRef.current.down = false; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── Poem ticker: two-phase fade-out / fade-in ───────────────────────────────
  // Reads turbulence from turbRef (updated in the render loop) each cycle.

  useEffect(() => {
    if (mode === "idle") return;

    let timeout: ReturnType<typeof setTimeout>;

    const showText = () => {
      const t = turbRef.current;
      const text = generatePoem(t);
      const opacity = t < 0.22 ? 0.88 : t < 0.5 ? 0.68 : 0.42;
      const x = t < 0.3 ? 50 : 35 + Math.random() * 30;
      const y = t < 0.3 ? 45 : 20 + Math.random() * 58;
      setPoem({ text, opacity, x, y });
      // Hold duration: long when still, short when turbulent
      const hold = t < 0.22 ? 5200 + Math.random() * 4500
        : t < 0.5 ? 1400 + Math.random() * 1600
        : 220 + Math.random() * 380;
      timeout = setTimeout(fadeOut, hold);
    };

    const fadeOut = () => {
      setPoem(prev => ({ ...prev, opacity: 0 }));
      timeout = setTimeout(showText, 280);
    };

    timeout = setTimeout(showText, 1000); // initial delay — let fluid settle
    return () => clearTimeout(timeout);
  }, [mode]);

  // ── Main render loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!simRef.current) {
      try {
        simRef.current = initSim(canvas);
        // Seed a faint deep-teal bloom so the canvas isn't pure black on load
        addSplat(simRef.current, 0.5, 0.5, 0, 0, 0.015, 0.09, 0.28, 0.12, 0.08);
      } catch (e) {
        setGlError(e instanceof Error ? e.message : "WebGL init failed");
        setMode("idle");
        return;
      }
    }

    const sim = simRef.current;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    lastTRef.current = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTRef.current) / 1000, 1 / 20);
      lastTRef.current = now;
      const m = mouseRef.current;

      // ── Mouse stir ──────────────────────────────────────────────────────────
      if (m.down) {
        const dvx = Math.max(-3, Math.min(3, (m.x - m.lx) / dt));
        const dvy = Math.max(-3, Math.min(3, (m.y - m.ly) / dt));
        const speed = Math.hypot(dvx, dvy);
        if (speed > 0.01) {
          addSplat(sim, m.x, m.y, dvx * 0.55, dvy * 0.55,
            0.015, 0.22, 0.48, 0.016, 0.008);
          turbRef.current = Math.min(1.0, turbRef.current + speed * dt * 0.55);
        }
        mouseRef.current.lx = m.x;
        mouseRef.current.ly = m.y;
      }

      // ── Turbulence decay (τ ≈ 4s at 60fps) ─────────────────────────────────
      turbRef.current *= Math.pow(0.975, dt * 60);

      // ── Audio splats ─────────────────────────────────────────────────────────
      if (useMic && running) {
        const frame = getFrame();
        if (frame) {
          const bass = frame.bands[0] * 0.5 + frame.bands[1] * 0.5;
          const treble = frame.bands[4] * 0.4 + frame.bands[5] * 0.6;

          if (bass > 0.05) {
            const a = Math.random() * Math.PI * 2;
            const d = 0.04 + Math.random() * 0.06;
            addSplat(sim,
              0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d,
              Math.cos(a) * bass * 1.2, Math.sin(a) * bass * 1.2,
              0.02 * bass, 0.18 * bass, 0.42 * bass, 0.016, 0.007);
          }
          if (treble > 0.07) {
            const px = 0.2 + Math.random() * 0.6;
            const py = 0.2 + Math.random() * 0.6;
            const a = Math.random() * Math.PI * 2;
            addSplat(sim, px, py,
              Math.cos(a) * treble * 0.5, Math.sin(a) * treble * 0.5,
              0.03, 0.07, 0.32 * treble, 0.007, 0.003);
          }
          if (frame.onset) {
            const px = 0.15 + Math.random() * 0.7;
            const py = 0.15 + Math.random() * 0.7;
            const a = Math.random() * Math.PI * 2;
            addSplat(sim, px, py, Math.cos(a) * 1.8, Math.sin(a) * 1.8,
              0.04, 0.18, 0.52, 0.022, 0.01);
            turbRef.current = Math.min(1.0, turbRef.current + 0.42);
          }
        }
      }

      // ── Ambient drift (still mode or mic not yet running) ────────────────────
      // Very slow, dark wisps — preserves stillness for full-sentence surfacing.
      if (!useMic || !running) {
        ambTimerRef.current += dt;
        ambPhaseRef.current += dt * 0.10;
        const p = ambPhaseRef.current;
        if (ambTimerRef.current > 2.2) {
          ambTimerRef.current = 0;
          const px = 0.5 + Math.cos(p * 0.68) * 0.16;
          const py = 0.5 + Math.sin(p * 0.51) * 0.16;
          addSplat(sim, px, py,
            Math.cos(p * 1.3) * 0.12, Math.sin(p * 1.1) * 0.12,
            0.008, 0.09, 0.28, 0.012, 0.006);
        }
      }

      stepSim(sim, dt);
      renderDisplay(sim, canvas.width, canvas.height);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [mode, useMic, running, getFrame]);

  const handleStart = useCallback((m: Mode) => {
    setMode(m);
    if (m === "mic") startMic();
  }, [startMic]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setMode("idle");
    if (useMic) stopMic();
  }, [useMic, stopMic]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          background: "#000",
          cursor: mode !== "idle" ? "crosshair" : "default",
          touchAction: "none",
        }}
      />

      {/* ── Poem text overlay ──────────────────────────────────────────────────
          Centered when still; scattered when turbulent.
          Font-serif for poetic weight. Text-shadow for soft luminescence. */}
      {mode !== "idle" && poem.text && (
        <div
          className="absolute pointer-events-none select-none font-semibold"
          style={{
            left: `${poem.x}%`,
            top: `${poem.y}%`,
            transform: "translate(-50%, -50%)",
            opacity: poem.opacity,
            fontSize: "clamp(18px, 3.2vw, 32px)",
            color: "white",
            letterSpacing: "0.04em",
            lineHeight: 1.6,
            textAlign: "center",
            maxWidth: "72vw",
            textShadow: "0 0 28px rgba(70, 170, 255, 0.32), 0 0 64px rgba(50, 110, 210, 0.18)",
            transition: "opacity 0.65s ease",
          }}
        >
          {poem.text}
        </div>
      )}

      {/* ── Idle screen ────────────────────────────────────────────────────────*/}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl font-semibold mb-3 tracking-tight text-foreground">
            Poem Fluid
          </h1>
          <p className="text-base text-muted-foreground max-w-sm mb-8 leading-relaxed">
            Still water reveals the poem. Stir to fragment it.
          </p>

          {glError && (
            <p className="mb-5 text-sm text-violet-300 max-w-xs leading-relaxed border border-violet-400/20 rounded px-4 py-2">
              {glError}
            </p>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => handleStart("still")}
              className="min-h-[44px] px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-foreground"
            >
              Still water
            </button>
            <button
              onClick={() => handleStart("mic")}
              className="min-h-[44px] px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              + Mic
            </button>
          </div>

          {micError && (
            <p className="mt-4 text-sm text-violet-300 max-w-xs">{micError}</p>
          )}

          <Link
            href="/dream"
            className="mt-12 text-xs text-muted-foreground/70 hover:text-muted-foreground transition"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────────*/}
      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 select-none">
          <span className="text-xs tracking-widest text-muted-foreground/70 uppercase">
            {useMic ? (running ? "● mic" : "starting…") : "still water"}
          </span>
          {useMic && running && (
            <>
              <label className="text-xs text-muted-foreground/70 tracking-wider">
                GAIN {gain.toFixed(1)}
              </label>
              <input
                type="range" min="0.5" max="4" step="0.1"
                value={gain}
                onChange={(e) => setGain(parseFloat(e.target.value))}
                className="w-24 accent-primary"
              />
            </>
          )}
          <button
            onClick={handleStop}
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded transition"
          >
            stop
          </button>
          <Link href="/dream" className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition">
            ← back
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <p className="absolute bottom-4 left-4 text-xs text-muted-foreground/70 pointer-events-none select-none tracking-wider">
          drag to stir · still to read
        </p>
      )}
    </div>
  );
}
