"use client";

/**
 * 460 — Kids Ball Pit
 * ~900–1400 glowing marbles in a physics pit. Tilt to pour; tap to drop more;
 * two-finger shake to scramble. Every collision above threshold rings a D-major bell.
 * WebGL2 instanced quads + Web Audio API. CPU spatial-hash physics.
 */

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  stepPhysics,
  spawnHandful,
  scrambleBalls,
  nextBallId,
  type Ball,
  type CollisionEvent,
} from "./physics";
import {
  bootAudio,
  teardownAudio,
  getEngine,
  ringBell,
  playSparkleRun,
  BELL_FREQS,
} from "./audio";

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_COUNT = 900;
const GRAVITY_MAGNITUDE = 980; // px/s²
const AUTO_DEMO_DELAY_MS = 4000;
const TOUCH_THRESHOLD_PX = 10;
const HANDFUL_COUNT = 24;

// ─── WebGL2 shaders ───────────────────────────────────────────────────────────

const VERT_SRC = `#version 300 es
precision mediump float;
in vec2 aCorner;
in vec2 aPos;
in float aRadius;
in float aHue;
in float aFlash;
uniform vec2 uResolution;
out vec2 vUV;
out float vHue;
out float vFlash;
void main() {
  vUV = aCorner;
  vHue = aHue;
  vFlash = aFlash;
  float glowScale = 1.0 + aFlash * 0.65;
  vec2 worldPos = aPos + aCorner * aRadius * glowScale;
  vec2 ndc = (worldPos / uResolution) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
in float vHue;
in float vFlash;
out vec4 fragColor;
vec3 hsv2rgb(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
  return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}
void main() {
  float d = length(vUV);
  if (d > 1.0) discard;
  float core = smoothstep(0.72, 0.62, d);
  float glow = (1.0 - smoothstep(0.0, 1.0, d)) * (0.3 + vFlash * 0.7);
  float light = 0.55 + vFlash * 0.38;
  vec3 ballCol = hsv2rgb(vHue, 0.92, light);
  float spec = smoothstep(0.42, 0.0, length(vUV - vec2(-0.3, -0.32)));
  vec3 col = ballCol * core + ballCol * glow + vec3(1.0) * spec * 0.48;
  float alpha = max(core, glow * 0.65);
  fragColor = vec4(col * alpha, alpha);
}`;

// ─── WebGL2 helpers ───────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error("Shader: " + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}

// 5 floats per instance: x, y, r, hue(0-1), flash
const INST_STRIDE = 5;

interface GlCtx {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  instBuf: WebGLBuffer;
  uRes: WebGLUniformLocation;
  instData: Float32Array;
  maxInst: number;
}

function initWebGL(canvas: HTMLCanvasElement, maxInst: number): GlCtx | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true });
  if (!gl) return null;

  let prog: WebGLProgram;
  try {
    prog = linkProgram(gl);
  } catch {
    return null;
  }

  // Corner buffer (shared quad)
  const corners = new Float32Array([-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1]);
  const cornerBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

  // Instance buffer
  const instData = new Float32Array(maxInst * INST_STRIDE);
  const instBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferData(gl.ARRAY_BUFFER, instData, gl.DYNAMIC_DRAW);

  // VAO
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const stride4 = INST_STRIDE * 4;
  const aCorner = gl.getAttribLocation(prog, "aCorner");
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
  gl.enableVertexAttribArray(aCorner);
  gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  const attrs: [string, number, number][] = [
    ["aPos",    2, 0],
    ["aRadius", 1, 8],
    ["aHue",    1, 12],
    ["aFlash",  1, 16],
  ];
  for (const [name, size, byteOffset] of attrs) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride4, byteOffset);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  const uRes = gl.getUniformLocation(prog, "uResolution")!;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return { gl, prog, vao, instBuf, uRes, instData, maxInst };
}

function renderFrame(ctx: GlCtx, balls: Ball[], W: number, H: number): void {
  const { gl, prog, vao, instBuf, uRes, instData, maxInst } = ctx;
  const count = Math.min(balls.length, maxInst);

  for (let i = 0; i < count; i++) {
    const b = balls[i];
    const o = i * INST_STRIDE;
    instData[o]   = b.x;
    instData[o+1] = b.y;
    instData[o+2] = b.r;
    instData[o+3] = b.hue / 360;
    instData[o+4] = b.flash;
  }

  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.038, 0.04, 0.07, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniform2f(uRes, W, H);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData.subarray(0, count * INST_STRIDE));
  gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  gl.bindVertexArray(null);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KidsBallPit() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const glCtxRef     = useRef<GlCtx | null>(null);
  const ballsRef     = useRef<Ball[]>([]);
  const rafRef       = useRef<number>(0);
  const lastTRef     = useRef<number>(0);

  // Gravity
  const gxRef = useRef(0);
  const gyRef = useRef(GRAVITY_MAGNITUDE);

  // Auto-demo
  const lastInputRef    = useRef<number>(Date.now());
  const demoPhasRef     = useRef<number>(0);

  // Pointer state
  const ptrDownRef      = useRef<{ x: number; y: number; t: number } | null>(null);
  const ptrCountRef     = useRef(0);
  const lastPtrRef      = useRef<{ x: number; y: number; t: number } | null>(null);

  // Note cursor
  const noteOffRef = useRef(0);

  const [started,   setStarted]   = useState(false);
  const [noWebGL,   setNoWebGL]   = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ─── Start handler (user gesture required for AudioContext + iOS orientation) ─
  const handleStart = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    bootAudio();

    // iOS 13+ requires explicit permission for device orientation
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (DeviceOrientationEvent as any).requestPermission();
      } catch {
        // Denied — pointer-drag fallback will handle gravity
      }
    }

    const glCtx = initWebGL(canvas, 1500);
    if (!glCtx) {
      setNoWebGL(true);
      return;
    }
    glCtxRef.current = glCtx;

    // Spawn initial balls distributed across the pit
    const W = canvas.clientWidth  || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight;
    const balls = ballsRef.current;
    for (let i = 0; i < INITIAL_COUNT; i++) {
      const r = 7 + Math.random() * 8;
      balls.push({
        id:      nextBallId(),
        x:       r + Math.random() * (W - r * 2),
        y:       r + Math.random() * (H * 0.75),
        vx:      (Math.random() - 0.5) * 90,
        vy:      (Math.random() - 0.5) * 90,
        r,
        hue:     (i / INITIAL_COUNT) * 360,
        noteIdx: i % BELL_FREQS.length,
        mass:    r * r,
        flash:   0,
      });
    }

    setStarted(true);
  }, []);

  // ─── Physics + render loop ─────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const glCtx  = glCtxRef.current;
    if (!canvas || !glCtx) return;

    function resizeCanvas() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function onOrientation(e: DeviceOrientationEvent) {
      lastInputRef.current = Date.now();
      const gamma = e.gamma ?? 0; // left-right tilt
      const beta  = e.beta  ?? 0; // front-back tilt
      const mag = GRAVITY_MAGNITUDE;
      gxRef.current = Math.sin((gamma / 90) * (Math.PI / 2)) * mag;
      const clampedBeta = Math.max(-90, Math.min(90, beta));
      gyRef.current = Math.sin((clampedBeta / 90) * (Math.PI / 2)) * mag;
      // Guarantee a minimum component so balls always settle
      if (Math.abs(gyRef.current) < 50 && Math.abs(gxRef.current) < 50) {
        gyRef.current = mag * 0.4;
      }
    }
    window.addEventListener("deviceorientation", onOrientation);

    function tick(ts: number) {
      const dt = Math.min((ts - (lastTRef.current || ts)) / 1000, 0.033);
      lastTRef.current = ts;

      const W = canvas ? (canvas.clientWidth  || window.innerWidth)  : window.innerWidth;
      const H = canvas ? (canvas.clientHeight || window.innerHeight) : window.innerHeight;
      if (W < 1 || H < 1) { rafRef.current = requestAnimationFrame(tick); return; }

      // Auto-demo: rock gravity gently after idle period
      const idle = Date.now() - lastInputRef.current;
      if (idle > AUTO_DEMO_DELAY_MS) {
        demoPhasRef.current += dt * 0.42;
        const p = demoPhasRef.current;
        gxRef.current = Math.sin(p)         * GRAVITY_MAGNITUDE * 0.7;
        gyRef.current = Math.cos(p * 0.68)  * GRAVITY_MAGNITUDE * 0.55
                      + GRAVITY_MAGNITUDE * 0.32;
      }

      const balls  = ballsRef.current;
      const events: CollisionEvent[] = stepPhysics(balls, gxRef.current, gyRef.current, W, H, dt);

      // Sonify collisions
      const eng = getEngine();
      if (eng && events.length > 0) {
        for (const ev of events) {
          const vel = Math.min(1, ev.speed / 520);
          ringBell(eng, ev.ballA.noteIdx, vel);
        }
      }

      if (glCtx) renderFrame(glCtx, balls, W, H);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("deviceorientation", onOrientation);
    };
  }, [started]);

  // ─── Pointer handlers ──────────────────────────────────────────────────────
  const onPtrDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    lastInputRef.current = Date.now();
    ptrCountRef.current += 1;
    ptrDownRef.current  = { x: e.clientX, y: e.clientY, t: Date.now() };
    lastPtrRef.current  = { x: e.clientX, y: e.clientY, t: Date.now() };
    bootAudio();
  }, []);

  const onPtrMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    lastInputRef.current = Date.now();
    const prev = lastPtrRef.current;
    if (!prev) return;

    const now  = Date.now();
    const dx   = e.clientX - prev.x;
    const dy   = e.clientY - prev.y;
    const dtMs = Math.max(1, now - prev.t);
    lastPtrRef.current = { x: e.clientX, y: e.clientY, t: now };

    // Single-finger drag → shift gravity vector smoothly
    if (ptrCountRef.current === 1 && ptrDownRef.current) {
      const moved = Math.hypot(e.clientX - ptrDownRef.current.x, e.clientY - ptrDownRef.current.y);
      if (moved > TOUCH_THRESHOLD_PX) {
        const len = Math.hypot(dx, dy);
        if (len > 0.5) {
          const mag = GRAVITY_MAGNITUDE;
          gxRef.current = gxRef.current * 0.82 + (dx / len) * mag * 0.18;
          gyRef.current = gyRef.current * 0.82 + (dy / len) * mag * 0.18;
        }
      }
    }

    // Two-finger fast swipe → scramble
    if (ptrCountRef.current >= 2) {
      const speed = Math.hypot(dx, dy) / dtMs; // px/ms
      if (speed > 1.2) {
        scrambleBalls(ballsRef.current);
        const eng = getEngine();
        if (eng) playSparkleRun(eng);
      }
    }
  }, []);

  const onPtrUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    ptrCountRef.current = Math.max(0, ptrCountRef.current - 1);
    const down = ptrDownRef.current;
    if (!down) return;

    const dist    = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const elapsed = Date.now() - down.t;

    // Short tap → drop a handful of balls
    if (dist < TOUCH_THRESHOLD_PX && elapsed < 380 && ptrCountRef.current === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        spawnHandful(ballsRef.current, cx, cy, HANDFUL_COUNT, canvas.clientWidth, noteOffRef.current, BELL_FREQS);
        noteOffRef.current = (noteOffRef.current + HANDFUL_COUNT) % BELL_FREQS.length;

        // Cascade chimes
        const eng = getEngine();
        if (eng) {
          for (let i = 0; i < 7; i++) {
            const capturedI = i;
            const capturedOff = noteOffRef.current;
            setTimeout(() => {
              const eng2 = getEngine();
              if (eng2) ringBell(eng2, (capturedOff + capturedI) % BELL_FREQS.length, 0.38 + Math.random() * 0.42);
            }, capturedI * 40);
          }
        }
      }
    }

    ptrDownRef.current = null;
    lastPtrRef.current = null;
  }, []);

  // ─── Unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      teardownAudio();
    };
  }, []);

  // ─── No WebGL2 notice ──────────────────────────────────────────────────────
  if (noWebGL) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0b12] px-6 text-center gap-4">
        <p className="text-2xl font-serif text-foreground">WebGL2 not available</p>
        <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
          Your browser does not support WebGL2, which this experience requires for
          hardware-accelerated rendering. Try a recent Chrome or Safari on a modern device.
        </p>
        <Link href="/dream" className="mt-6 text-sm text-muted-foreground hover:text-muted-foreground">
          ← Dream lab
        </Link>
      </div>
    );
  }

  // ─── Start screen ──────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0b12] px-6 select-none">
        {/* Decorative ball row */}
        <div className="flex gap-4 mb-10" aria-hidden="true">
          {[0, 55, 145, 225, 310].map((hue, i) => (
            <div
              key={hue}
              className="rounded-full flex-shrink-0"
              style={{
                width: 50, height: 50,
                background: `hsl(${hue},88%,62%)`,
                boxShadow: `0 0 22px 9px hsl(${hue},88%,52%,0.4)`,
                transform: `translateY(${[4, -10, 0, -7, 6][i]}px)`,
              }}
            />
          ))}
        </div>

        <h1 className="text-3xl font-serif text-foreground text-center mb-3 tracking-tight">
          Ball Pit
        </h1>
        <p className="text-base text-muted-foreground text-center max-w-[300px] mb-10 leading-relaxed">
          Tip the phone to pour a thousand singing marbles — every collision chimes!
        </p>

        <button
          onClick={handleStart}
          className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-bold text-xl rounded-2xl px-10 py-4 min-h-[64px] min-w-[200px] transition-colors shadow-lg shadow-violet-900/60"
        >
          Pour them in!
        </button>

        <p className="mt-5 text-sm text-muted-foreground text-center leading-loose">
          Tap to drop more &nbsp;·&nbsp; Drag to tilt &nbsp;·&nbsp; Two fingers to shake
        </p>

        <Link href="/dream" className="mt-12 text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors">
          ← Dream lab
        </Link>
      </div>
    );
  }

  // ─── Play screen ───────────────────────────────────────────────────────────
  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: "none" }}
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerCancel={onPtrUp}
      />

      {/* Nav back */}
      <Link
        href="/dream"
        className="absolute top-4 left-4 z-10 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        style={{ lineHeight: "44px", paddingInline: "12px" }}
      >
        ← Dream
      </Link>

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute top-4 right-4 z-10 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors min-h-[44px] px-3 py-2"
        aria-label={showNotes ? "Close design notes" : "Design notes"}
      >
        {showNotes ? "×" : "notes"}
      </button>

      {/* Design notes panel */}
      {showNotes && (
        <div
          role="dialog"
          aria-label="Design notes"
          className="absolute inset-x-4 top-14 bottom-4 z-20 rounded-2xl bg-black/88 backdrop-blur border border-border overflow-y-auto p-5 leading-relaxed"
          onClick={() => setShowNotes(false)}
        >
          <p className="font-serif text-xl text-foreground mb-4">Ball Pit — notes</p>

          <p className="text-sm text-muted-foreground mb-3">
            <strong className="text-foreground">Physics:</strong> ~900–1400 circles; CPU
            uniform-grid spatial hash (cell = 2.2× max radius), 3×3 neighbourhood broad-phase,
            narrow-phase circle–circle penetration resolution + mass-weighted impulse response.
            Reference: Müller, Heidelberger, Hennix &amp; Ratcliff,{" "}
            <em>Position Based Dynamics</em> (2007).
          </p>

          <p className="text-sm text-muted-foreground mb-3">
            <strong className="text-foreground">Renderer:</strong> WebGL2 instanced quads — one
            draw call per frame regardless of ball count. Additive blending for glow rings.
            Inspired by: <em>Party: A WebGPU Particle Physics Playground</em>, webgpu.com,
            Jan 23 2026 — thousands of GPU-collided particles as a musical instrument.
          </p>

          <p className="text-sm text-muted-foreground mb-3">
            <strong className="text-foreground">Audio:</strong> D-major just-intonation hexachord
            (D E F♯ A B D′, two octaves = 12 pitches). Each collision above 60 px/s rings a
            bell voice (sine fundamental + inharmonic partial + brief noise click). All routed
            through compressor → brick-wall limiter — celebratory but never harsh.
          </p>

          <p className="text-sm text-muted-foreground mb-3">
            <strong className="text-foreground">Controls:</strong> Tap = drop a handful; single-finger
            drag = tilt gravity; two-finger fast swipe = scramble; DeviceOrientation tilt on mobile.
          </p>

          <p className="text-xs text-muted-foreground/70 mt-5">
            Unverified on real GPU/sensor hardware beyond desktop Chrome.
            Tap anywhere to close.
          </p>
        </div>
      )}

      {/* Hint */}
      <div className="absolute bottom-5 inset-x-0 text-center text-xs text-muted-foreground/70 pointer-events-none select-none">
        Tap · Drag · Shake
      </div>
    </div>
  );
}
