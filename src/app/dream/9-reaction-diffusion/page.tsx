"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Gray-Scott presets ────────────────────────────────────────────────────────
type Preset = { name: string; f: number; k: number };
const PRESETS: Preset[] = [
  { name: "Coral",       f: 0.0545, k: 0.0620 },
  { name: "Fingerprint", f: 0.0370, k: 0.0600 },
  { name: "Spots",       f: 0.0350, k: 0.0650 },
  { name: "Stripes",     f: 0.0600, k: 0.0620 },
  { name: "Mitosis",     f: 0.0280, k: 0.0530 },
  { name: "Maze",        f: 0.0300, k: 0.0565 },
];

const SIM_W = 256;
const SIM_H = 256;
const DU = 0.2100;
const DV = 0.1050;
const STEPS_PER_FRAME = 8;
const DEMO_FREQS = [40, 125, 350, 1000, 3000, 10000];

// ── Shaders ───────────────────────────────────────────────────────────────────

const VS = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Reaction-diffusion update (ping-pong)
const RD_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_f;
uniform float u_k;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 px = vec2(${(1 / SIM_W).toFixed(8)}, ${(1 / SIM_H).toFixed(8)});
  vec4 c  = texture(u_tex, v_uv);
  float u = c.r, v = c.g;

  // 9-point Laplacian: center=-1, cardinal=0.2, diagonal=0.05
  float lu = -u, lv = -v;
  lu += 0.2*(texture(u_tex,v_uv+vec2(-px.x, 0.0)).r
           + texture(u_tex,v_uv+vec2( px.x, 0.0)).r
           + texture(u_tex,v_uv+vec2( 0.0,-px.y)).r
           + texture(u_tex,v_uv+vec2( 0.0, px.y)).r);
  lv += 0.2*(texture(u_tex,v_uv+vec2(-px.x, 0.0)).g
           + texture(u_tex,v_uv+vec2( px.x, 0.0)).g
           + texture(u_tex,v_uv+vec2( 0.0,-px.y)).g
           + texture(u_tex,v_uv+vec2( 0.0, px.y)).g);
  lu += 0.05*(texture(u_tex,v_uv+vec2(-px.x,-px.y)).r
            + texture(u_tex,v_uv+vec2( px.x,-px.y)).r
            + texture(u_tex,v_uv+vec2(-px.x, px.y)).r
            + texture(u_tex,v_uv+vec2( px.x, px.y)).r);
  lv += 0.05*(texture(u_tex,v_uv+vec2(-px.x,-px.y)).g
            + texture(u_tex,v_uv+vec2( px.x,-px.y)).g
            + texture(u_tex,v_uv+vec2(-px.x, px.y)).g
            + texture(u_tex,v_uv+vec2( px.x, px.y)).g);

  float uvv = u * v * v;
  float nu = clamp(u + ${DU.toFixed(4)} * lu - uvv + u_f * (1.0 - u), 0.0, 1.0);
  float nv = clamp(v + ${DV.toFixed(4)} * lv + uvv - (u_f + u_k) * v, 0.0, 1.0);
  o = vec4(nu, nv, 0.0, 1.0);
}`;

// Display: V concentration → color palette
const DISP_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  float v = texture(u_tex, v_uv).g;
  vec3 deep = vec3(0.02, 0.01, 0.12);
  vec3 teal = vec3(0.00, 0.78, 0.88);
  vec3 hot  = vec3(1.00, 0.94, 0.80);
  float t1 = smoothstep(0.08, 0.55, v);
  float t2 = smoothstep(0.48, 0.90, v);
  vec3 col = mix(mix(deep, teal, t1), hot, t2);
  vec2 q = v_uv * 2.0 - 1.0;
  col *= 1.0 - 0.30 * dot(q, q); // vignette
  o = vec4(col, 1.0);
}`;

// ── Module-level WebGL helpers (no hooks, no "use" prefix) ────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(s) ?? "shader compile failed");
  return s;
}

function buildProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
  return p;
}

function makeFloatTex(gl: WebGL2RenderingContext, data: Float32Array | null): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, SIM_W, SIM_H, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return t;
}

function makeFBO(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

function buildSeed(): Float32Array {
  const data = new Float32Array(SIM_W * SIM_H * 4);
  for (let i = 0; i < SIM_W * SIM_H; i++) {
    data[i * 4]     = 1.0; // U = substrate (full)
    data[i * 4 + 1] = 0.0; // V = activator (none)
    data[i * 4 + 3] = 1.0;
  }
  // Seed 6 random activation blobs to ignite pattern formation
  for (let b = 0; b < 6; b++) {
    const cx = Math.floor(Math.random() * SIM_W);
    const cy = Math.floor(Math.random() * SIM_H);
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        if (dx * dx + dy * dy > 100) continue;
        const x = (cx + dx + SIM_W) % SIM_W;
        const y = (cy + dy + SIM_H) % SIM_H;
        const idx = (y * SIM_W + x) * 4;
        const r = Math.sqrt(dx * dx + dy * dy) / 10;
        data[idx]     = 0.5 + 0.5 * r;  // U tapers from 0.5 at center
        data[idx + 1] = 0.5 * (1 - r);  // V tapers from 0.5 at center
      }
    }
  }
  return data;
}

function injectBlob(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  injections: Array<{ cx: number; cy: number }>,
) {
  if (!injections.length) return;
  const R = 12;
  const D = R * 2 + 1;
  const blob = new Float32Array(D * D * 4);
  // Default: background state
  for (let i = 0; i < D * D; i++) {
    blob[i * 4]     = 1.0;
    blob[i * 4 + 3] = 1.0;
  }
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const fall = 1 - Math.sqrt(d2) / R;
      const idx = ((dy + R) * D + (dx + R)) * 4;
      blob[idx]     = 0.5 + 0.5 * (1 - fall); // U
      blob[idx + 1] = 0.5 * fall;              // V
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const { cx, cy } of injections) {
    const x = Math.max(R, Math.min(SIM_W - R - 1, cx));
    const y = Math.max(R, Math.min(SIM_H - R - 1, cy));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x - R, y - R, D, D, gl.RGBA, gl.FLOAT, blob);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
}

// ── GL state type ─────────────────────────────────────────────────────────────

type GLCtx = {
  gl: WebGL2RenderingContext;
  rdProg: WebGLProgram;
  dispProg: WebGLProgram;
  vao: WebGLVertexArrayObject;
  textures: [WebGLTexture, WebGLTexture];
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  rdF: WebGLUniformLocation;
  rdK: WebGLUniformLocation;
  rdTex: WebGLUniformLocation;
  dispTex: WebGLUniformLocation;
  ping: 0 | 1;
};

// ── Component ─────────────────────────────────────────────────────────────────

type AudioMode = "none" | "demo" | "mic";

export default function ReactionDiffusionPage() {
  const [running, setRunning]   = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>("none");
  const [preset, setPreset]     = useState(0);
  const [fps, setFps]           = useState(0);
  const [glError, setGlError]   = useState("");

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const glCtxRef     = useRef<GLCtx | null>(null);
  const animRef      = useRef(0);
  const audioModeRef = useRef<AudioMode>("none");
  const presetRef    = useRef(0);
  const injectRef    = useRef<Array<{ cx: number; cy: number }>>([]);
  const demoRigRef   = useRef<{ ctx: AudioContext; oscs: OscillatorNode[] } | null>(null);
  const lastOnsetMs  = useRef(0);
  const fpsFrames    = useRef(0);
  const fpsEpoch     = useRef(0);

  // Keep refs current without triggering animation loop re-mounts
  useEffect(() => { audioModeRef.current = audioMode; }, [audioMode]);
  useEffect(() => { presetRef.current = preset; }, [preset]);

  const { start: micStart, stop: micStop, getFrame, error: micError } =
    useMicAnalyser({ smoothing: 0.80, gain: 2.0, onsetThreshold: 1.7 });

  // ── WebGL initialisation ──────────────────────────────────────────────────

  const initGL = useCallback((): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!gl) { setGlError("WebGL 2 not available in this browser."); return false; }
    if (!gl.getExtension("EXT_color_buffer_float")) {
      setGlError("Float framebuffers not supported (Chrome 56+, Firefox 51+, Safari 15+ required).");
      return false;
    }
    try {
      const rdProg   = buildProgram(gl, VS, RD_FS);
      const dispProg = buildProgram(gl, VS, DISP_FS);

      // Full-screen quad (shared VAO — both programs use layout(location=0) for a_pos)
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);

      // Ping-pong textures + FBOs
      const seed = buildSeed();
      const t0 = makeFloatTex(gl, seed);
      const t1 = makeFloatTex(gl, null);
      const fbo0 = makeFBO(gl, t0);
      const fbo1 = makeFBO(gl, t1);

      glCtxRef.current = {
        gl, rdProg, dispProg, vao,
        textures: [t0, t1],
        fbos: [fbo0, fbo1],
        rdF:    gl.getUniformLocation(rdProg,   "u_f")!,
        rdK:    gl.getUniformLocation(rdProg,   "u_k")!,
        rdTex:  gl.getUniformLocation(rdProg,   "u_tex")!,
        dispTex: gl.getUniformLocation(dispProg, "u_tex")!,
        ping: 0,
      };
      return true;
    } catch (e) {
      setGlError(e instanceof Error ? e.message : "WebGL init failed");
      return false;
    }
  }, []);

  // ── Launch / stop ─────────────────────────────────────────────────────────

  const launchDemo = useCallback(() => {
    if (running) return;
    const audioCtx = new AudioContext();
    const master = audioCtx.createGain();
    master.gain.value = 0.35;
    master.connect(audioCtx.destination);
    const oscs: OscillatorNode[] = DEMO_FREQS.map((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      g.gain.value = i < 2 ? 0.05 : i < 4 ? 0.03 : 0.015;
      osc.connect(g);
      g.connect(master);
      osc.start();
      return osc;
    });
    demoRigRef.current = { ctx: audioCtx, oscs };
    if (!initGL()) return;
    setAudioMode("demo");
    setRunning(true);
  }, [running, initGL]);

  const launchMic = useCallback(async () => {
    if (running) return;
    await micStart();
    if (!initGL()) return;
    setAudioMode("mic");
    setRunning(true);
  }, [running, micStart, initGL]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (demoRigRef.current) {
      demoRigRef.current.oscs.forEach(o => o.stop());
      void demoRigRef.current.ctx.close();
      demoRigRef.current = null;
    }
    micStop();
    glCtxRef.current = null;
    setAudioMode("none");
    setRunning(false);
    fpsFrames.current = 0;
    fpsEpoch.current  = 0;
  }, [micStop]);

  useEffect(() => () => {
    if (demoRigRef.current) {
      demoRigRef.current.oscs.forEach(o => o.stop());
      void demoRigRef.current.ctx.close();
    }
  }, []);

  // ── Canvas click → inject blob ────────────────────────────────────────────

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const rect = canvas.getBoundingClientRect();
    const cx = Math.floor(((e.clientX - rect.left) / rect.width)  * SIM_W);
    const cy = Math.floor(((e.clientY - rect.top)  / rect.height) * SIM_H);
    injectRef.current.push({ cx, cy });
  }, [running]);

  // ── Animation loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!running) return;
    const ctx = glCtxRef.current;
    if (!ctx) return;
    const { gl, rdProg, dispProg, vao, textures, fbos, rdF, rdK, rdTex, dispTex } = ctx;

    // Size canvas to CSS dimensions
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    // Warmup: run 600 RD steps without display so pattern is visible immediately
    const warmupF = PRESETS[presetRef.current].f;
    const warmupK = PRESETS[presetRef.current].k;
    gl.useProgram(rdProg);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, SIM_W, SIM_H);
    gl.uniform1i(rdTex, 0);
    gl.uniform1f(rdF, warmupF);
    gl.uniform1f(rdK, warmupK);
    for (let s = 0; s < 600; s++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[ctx.ping ^ 1]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[ctx.ping]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.ping = (ctx.ping ^ 1) as 0 | 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const tick = (now: number) => {
      // ── Audio → parameter modulation ───────────────────────────────────
      let bass = 0;
      let treble = 0;
      if (audioModeRef.current === "mic") {
        const frame = getFrame();
        if (frame) {
          bass   = frame.bands[0] * 0.5 + frame.bands[1] * 0.5;
          treble = frame.bands[4] * 0.5 + frame.bands[5] * 0.5;
          // Percussive hit → inject random blob (1.5s refractory)
          if (frame.onset && now - lastOnsetMs.current > 1500) {
            lastOnsetMs.current = now;
            injectRef.current.push({
              cx: Math.floor(Math.random() * SIM_W),
              cy: Math.floor(Math.random() * SIM_H),
            });
          }
        }
      } else {
        // Demo: slow sinusoidal drift so pattern evolves visibly
        const t = now / 9000;
        bass   = 0.10 + 0.08 * Math.sin(t * 0.7);
        treble = 0.05 + 0.04 * Math.sin(t * 1.3 + 1.1);
        // Auto-inject blob every ~6 seconds in demo mode
        if (now - lastOnsetMs.current > 6000) {
          lastOnsetMs.current = now;
          injectRef.current.push({
            cx: Math.floor(Math.random() * SIM_W),
            cy: Math.floor(Math.random() * SIM_H),
          });
        }
      }

      const p   = PRESETS[presetRef.current];
      const fVal = p.f + bass   * 0.012;  // bass raises feed rate
      const kVal = p.k + treble * 0.008;  // treble raises kill rate

      // ── Process pending injections ──────────────────────────────────────
      injectBlob(gl, textures[ctx.ping], injectRef.current);
      injectRef.current = [];

      // ── RD update steps ─────────────────────────────────────────────────
      gl.useProgram(rdProg);
      gl.bindVertexArray(vao);
      gl.viewport(0, 0, SIM_W, SIM_H);
      gl.uniform1f(rdF, fVal);
      gl.uniform1f(rdK, kVal);
      gl.uniform1i(rdTex, 0);
      for (let s = 0; s < STEPS_PER_FRAME; s++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[ctx.ping ^ 1]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textures[ctx.ping]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        ctx.ping = (ctx.ping ^ 1) as 0 | 1;
      }

      // ── Display pass ────────────────────────────────────────────────────
      if (canvas) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(dispProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textures[ctx.ping]);
        gl.uniform1i(dispTex, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // ── FPS counter ─────────────────────────────────────────────────────
      fpsFrames.current++;
      if (!fpsEpoch.current) fpsEpoch.current = now;
      if (now - fpsEpoch.current > 1000) {
        setFps(Math.round(fpsFrames.current * 1000 / (now - fpsEpoch.current)));
        fpsFrames.current = 0;
        fpsEpoch.current  = now;
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [running, getFrame]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000", cursor: running ? "crosshair" : "default" }}
      />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="text-violet-300/80 text-sm max-w-sm text-center leading-relaxed">
            {glError}
          </p>
        </div>
      )}

      {/* ── Idle screen ── */}
      {!running && !glError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Reaction Diffusion</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            Two chemicals: a substrate and an activator. The activator feeds on the
            substrate and diffuses slowly. Patterns — spots, coral, fingerprints, mazes
            — emerge from nothing but diffusion rates.
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-md mb-5 leading-relaxed">
            Bass raises the feed rate (more activation). Treble raises the kill rate
            (pattern erosion). Percussive hits inject new seed blobs. Click the canvas
            to inject manually.
          </p>

          {/* Preset picker */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPreset(i)}
                className={`px-3 py-1.5 text-xs tracking-wider uppercase border rounded transition ${
                  preset === i
                    ? "border-violet-400/60 text-violet-200 bg-violet-900/20"
                    : "border-border text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="flex gap-3 mb-8">
            <button
              onClick={launchDemo}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={launchMic}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start mic
            </button>
          </div>

          {micError && (
            <p className="text-xs text-violet-300/80 max-w-sm mb-4">{micError}</p>
          )}

          <Link
            href="/dream"
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running overlay ── */}
      {running && (
        <>
          {/* Top-right: FPS + mode */}
          <div className="absolute top-3 right-3 text-right text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 pointer-events-none select-none">
            <div>{fps} fps</div>
            <div className="uppercase">{audioMode}</div>
          </div>

          {/* Bottom-left: preset switcher */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 max-w-xs">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPreset(i)}
                className={`px-2 py-1 text-[9px] tracking-wider uppercase border rounded transition ${
                  preset === i
                    ? "border-violet-400/50 text-violet-300"
                    : "border-border text-muted-foreground/70 hover:border-border hover:text-muted-foreground"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Bottom-right: controls */}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
            <p className="text-[9px] text-muted-foreground/70 tracking-wider">
              click canvas to inject
            </p>
            <button
              onClick={stopAll}
              className="text-[10px] tracking-wider uppercase text-muted-foreground border border-border hover:border-border hover:text-foreground px-2.5 py-1 rounded transition"
            >
              stop
            </button>
            <Link
              href="/dream"
              className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition"
            >
              ← back
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
