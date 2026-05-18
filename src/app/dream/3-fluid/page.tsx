"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── GLSL ──────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a;
out vec2 uv;
void main() { uv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }`;

// Velocity + dye advection: trace backward through velocity field.
// Velocity stored in UV/sec; dt in seconds; textureSample wraps at edge.
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

// Finite-difference divergence of velocity field.
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

// Jacobi pressure iteration.
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

// Subtract pressure gradient from velocity to enforce incompressibility.
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

// Gaussian splat — adds velocity impulse or dye to a field.
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

// Filmic tone-map + gamma for display.
const DISPLAY = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D u_dye;
out vec4 o;
void main() {
  vec3 c = texture(u_dye, uv).rgb;
  c = c / (1.0 + dot(c, vec3(0.299, 0.587, 0.114)));
  o = vec4(pow(max(c, vec3(0.0)), vec3(0.45)), 1.0);
}`;

// ── WebGL helpers ─────────────────────────────────────────────────────────────

type GL = WebGL2RenderingContext;

function buildProg(gl: GL, fsSrc: string): WebGLProgram {
  const mkShader = (type: number, src: string) => {
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
  gl.attachShader(p, mkShader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, mkShader(gl.FRAGMENT_SHADER, fsSrc));
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

// ── Simulation state ──────────────────────────────────────────────────────────

interface Sim {
  gl: GL;
  vel: DFBO;
  pres: DFBO;
  div: FBO;
  dye: DFBO;
  quad: WebGLBuffer;
  progs: {
    advect: WebGLProgram;
    div: WebGLProgram;
    pres: WebGLProgram;
    grad: WebGLProgram;
    splat: WebGLProgram;
    display: WebGLProgram;
  };
  W: number;
  H: number;
}

function initSim(canvas: HTMLCanvasElement): Sim {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL 2 not supported in this browser.");
  if (!gl.getExtension("EXT_color_buffer_float"))
    throw new Error("Float render targets (EXT_color_buffer_float) not available.");

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
      advect: buildProg(gl, ADVECT),
      div: buildProg(gl, DIVERGENCE),
      pres: buildProg(gl, PRESSURE),
      grad: buildProg(gl, GRADIENT),
      splat: buildProg(gl, SPLAT),
      display: buildProg(gl, DISPLAY),
    },
    W,
    H,
  };
}

// ── Draw helpers ──────────────────────────────────────────────────────────────

function useQuad(gl: GL, prog: WebGLProgram, quad: WebGLBuffer) {
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

// ── Splat + simulation steps ──────────────────────────────────────────────────

function addSplat(
  sim: Sim,
  x: number, y: number,
  vx: number, vy: number,
  r: number, g: number, b: number,
  velRad = 0.012,
  dyeRad = 0.005,
) {
  const { gl, progs, quad, vel, dye, W, H } = sim;
  const ar = W / H; // square sim → 1.0, but keep for future

  useQuad(gl, progs.splat, quad);
  gl.uniform2f(gl.getUniformLocation(progs.splat, "u_pos"), x, y);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_ar"), ar);

  // Velocity splat
  bindTex(gl, 0, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.splat, "u_src"), 0);
  gl.uniform3f(gl.getUniformLocation(progs.splat, "u_col"), vx, vy, 0);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_rad"), velRad);
  blit(gl, vel.write.fb, W, H);
  vel.swap();

  // Dye splat
  bindTex(gl, 0, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.splat, "u_src"), 0);
  gl.uniform3f(gl.getUniformLocation(progs.splat, "u_col"), r, g, b);
  gl.uniform1f(gl.getUniformLocation(progs.splat, "u_rad"), dyeRad);
  blit(gl, dye.write.fb, W, H);
  dye.swap();
}

function stepSim(sim: Sim, dt: number) {
  const { gl, progs, quad, vel, pres, div, dye, W, H } = sim;

  // Advect velocity (self-advection)
  useQuad(gl, progs.advect, quad);
  bindTex(gl, 0, vel.read.tex);
  bindTex(gl, 1, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_vel"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_src"), 1);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_dt"), dt);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_diss"), 0.9);
  blit(gl, vel.write.fb, W, H);
  vel.swap();

  // Divergence
  useQuad(gl, progs.div, quad);
  bindTex(gl, 0, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.div, "u_vel"), 0);
  blit(gl, div.fb, W, H);

  // Pressure solve — 25 Jacobi iterations
  useQuad(gl, progs.pres, quad);
  bindTex(gl, 1, div.tex);
  gl.uniform1i(gl.getUniformLocation(progs.pres, "u_div"), 1);
  for (let i = 0; i < 25; i++) {
    bindTex(gl, 0, pres.read.tex);
    gl.uniform1i(gl.getUniformLocation(progs.pres, "u_pres"), 0);
    blit(gl, pres.write.fb, W, H);
    pres.swap();
  }

  // Gradient subtract → divergence-free velocity
  useQuad(gl, progs.grad, quad);
  bindTex(gl, 0, pres.read.tex);
  bindTex(gl, 1, vel.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.grad, "u_pres"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.grad, "u_vel"), 1);
  blit(gl, vel.write.fb, W, H);
  vel.swap();

  // Advect dye through corrected velocity
  useQuad(gl, progs.advect, quad);
  bindTex(gl, 0, vel.read.tex);
  bindTex(gl, 1, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_vel"), 0);
  gl.uniform1i(gl.getUniformLocation(progs.advect, "u_src"), 1);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_dt"), dt);
  gl.uniform1f(gl.getUniformLocation(progs.advect, "u_diss"), 0.985);
  blit(gl, dye.write.fb, W, H);
  dye.swap();
}

function renderDisplay(sim: Sim, cw: number, ch: number) {
  const { gl, progs, quad, dye } = sim;
  useQuad(gl, progs.display, quad);
  bindTex(gl, 0, dye.read.tex);
  gl.uniform1i(gl.getUniformLocation(progs.display, "u_dye"), 0);
  blit(gl, null, cw, ch);
}

// ── Color helpers ─────────────────────────────────────────────────────────────

// Map spectral centroid Hz to a warm/cool dye color.
function centroidColor(hz: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (hz - 80) / 4000));
  if (t < 0.33) {
    const s = t / 0.33;
    return [0.05 + s * 0.1, 0.3 + s * 0.2, 1.0 - s * 0.1]; // indigo → blue
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [0.1 + s * 0.5, 0.8 - s * 0.2, 0.9 - s * 0.7]; // blue → green
  } else {
    const s = (t - 0.66) / 0.34;
    return [0.6 + s * 0.4, 0.5 - s * 0.4, 0.2 - s * 0.2]; // green → orange/red
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "mic" | "ambient";

export default function FluidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5, lx: 0.5, ly: 0.5, down: false });
  const ambTimerRef = useRef(0);
  const ambPhaseRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [glError, setGlError] = useState<string | null>(null);
  const useMic = mode === "mic";

  const { running, error: micError, start: startMic, stop: stopMic, getFrame, gain, setGain } =
    useMicAnalyser({ smoothing: 0.78, gain: 2.2, onsetThreshold: 1.55 });

  // ── Canvas pointer events ──────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const uv = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: 1.0 - (cy - r.top) / r.height };
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const { x, y } = uv(e.clientX, e.clientY);
      mouseRef.current = { x, y, lx: x, ly: y, down: true };
    };
    const onMove = (e: PointerEvent) => {
      if (!mouseRef.current.down) return;
      const { x, y } = uv(e.clientX, e.clientY);
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

  // ── Main render loop ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Init WebGL once
    if (!simRef.current) {
      try {
        simRef.current = initSim(canvas);
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

      // ── Mouse / touch splat ──────────────────────────────────────────────
      if (m.down) {
        const dvx = Math.max(-3, Math.min(3, (m.x - m.lx) / dt));
        const dvy = Math.max(-3, Math.min(3, (m.y - m.ly) / dt));
        const speed = Math.hypot(dvx, dvy);
        if (speed > 0.01) {
          addSplat(sim, m.x, m.y, dvx * 0.6, dvy * 0.6, 0.25, 0.55, 1.0, 0.016, 0.008);
        }
        mouseRef.current.lx = m.x;
        mouseRef.current.ly = m.y;
      }

      // ── Audio splats ─────────────────────────────────────────────────────
      if (useMic && running) {
        const frame = getFrame();
        if (frame) {
          const bass = frame.bands[0] * 0.4 + frame.bands[1] * 0.6;
          const treble = frame.bands[4] * 0.5 + frame.bands[5] * 0.5;
          const [cr, cg, cb] = centroidColor(frame.centroid);

          // Bass → radial pressure pulse from center
          if (bass > 0.04) {
            const a = Math.random() * Math.PI * 2;
            const d = 0.05 + Math.random() * 0.08;
            addSplat(
              sim,
              0.5 + Math.cos(a) * d,
              0.5 + Math.sin(a) * d,
              Math.cos(a) * bass * 1.4,
              Math.sin(a) * bass * 1.4,
              cr * bass * 1.5, cg * bass, cb * bass * 0.8,
              0.018, 0.008,
            );
          }

          // Treble → small turbulence injections at random positions
          if (treble > 0.06) {
            const px = 0.25 + Math.random() * 0.5;
            const py = 0.25 + Math.random() * 0.5;
            const a = Math.random() * Math.PI * 2;
            addSplat(
              sim, px, py,
              Math.cos(a) * treble * 0.7,
              Math.sin(a) * treble * 0.7,
              cr * 0.4, cg * 0.3, cb * treble,
              0.008, 0.003,
            );
          }

          // Onset → bright burst at random position
          if (frame.onset) {
            const px = 0.2 + Math.random() * 0.6;
            const py = 0.2 + Math.random() * 0.6;
            const a = Math.random() * Math.PI * 2;
            addSplat(
              sim, px, py,
              Math.cos(a) * 2.0, Math.sin(a) * 2.0,
              cr, cg * 0.9, cb,
              0.022, 0.01,
            );
          }
        }
      }

      // ── Ambient drift (no mic or fallback) ───────────────────────────────
      if (!useMic || !running) {
        ambTimerRef.current += dt;
        ambPhaseRef.current += dt * 0.18;
        const p = ambPhaseRef.current;

        if (ambTimerRef.current > 0.7) {
          ambTimerRef.current = 0;
          const px = 0.5 + Math.cos(p * 1.3) * 0.28;
          const py = 0.5 + Math.sin(p * 0.97) * 0.28;
          const a = p * 2.3;
          const hue = (p * 0.5) % 1.0;
          const r = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2);
          const g2 = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2 + 2.094);
          const b2 = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2 + 4.189);
          addSplat(sim, px, py, Math.cos(a) * 0.5, Math.sin(a) * 0.5, r, g2, b2, 0.014, 0.007);
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
        style={{ background: "#000", cursor: mode !== "idle" ? "crosshair" : "default", touchAction: "none" }}
      />

      {/* ── Idle screen ──────────────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Fluid</h1>
          <p className="text-sm text-white/55 max-w-sm mb-8 leading-relaxed">
            Navier-Stokes ink-in-water reacting to sound.
            Bass pulses the center, treble stirs turbulence,
            pitch shifts the color. Drag to stir manually.
          </p>

          {glError && (
            <p className="mb-5 text-xs text-rose-300/70 max-w-xs leading-relaxed border border-rose-400/20 rounded px-4 py-2">
              {glError}
            </p>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => handleStart("mic")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start mic
            </button>
            <button
              onClick={() => handleStart("ambient")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/20 rounded hover:bg-white/5 hover:border-white/40 transition text-white/55"
            >
              Ambient drift
            </button>
          </div>

          {micError && (
            <p className="mt-4 text-xs text-rose-300/70 max-w-xs">{micError}</p>
          )}

          <Link href="/dream" className="mt-12 text-[11px] text-white/30 hover:text-white/60">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running HUD ───────────────────────────────────────────────────── */}
      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 select-none">
          <span className="text-[10px] tracking-widest text-white/35 uppercase">
            {useMic ? (running ? "● mic" : "starting…") : "ambient"}
          </span>

          {useMic && running && (
            <>
              <label className="text-[9px] text-white/35 tracking-wider">
                GAIN {gain.toFixed(1)}
              </label>
              <input
                type="range" min="0.5" max="4" step="0.1"
                value={gain}
                onChange={(e) => setGain(parseFloat(e.target.value))}
                className="w-28 accent-white"
              />
            </>
          )}

          <button
            onClick={handleStop}
            className="text-[10px] uppercase tracking-wider text-white/45 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded transition"
          >
            stop
          </button>
          <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
            ← back
          </Link>
          <a
            href="/dream/3-fluid/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-white/20 hover:text-white/50 transition"
          >
            design notes ↗
          </a>
        </div>
      )}

      {mode !== "idle" && (
        <p className="absolute bottom-4 left-4 text-[9px] text-white/20 pointer-events-none select-none tracking-wider">
          drag to stir
        </p>
      )}
    </div>
  );
}
