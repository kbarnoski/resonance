"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { makeAuroraAudio } from "./audio";
import type { AuroraAudio } from "./audio";
import { VERT_SRC, FRAG_SRC, compileShader, linkProgram, buildQuad } from "./shader";

// ── One-pole low-pass smoother ────────────────────────────────────────────────
function applyOnePole(current: number, target: number, alpha: number): number {
  return current + alpha * (target - current);
}

// ── Tilt magnitude → tension 0..1 ────────────────────────────────────────────
function computeTension(beta: number, gamma: number): number {
  const mag = Math.sqrt(beta * beta + gamma * gamma);
  return Math.min(mag / 45, 1);
}

// ── Auto-demo Lissajous wander (gentle virtual tilt) ─────────────────────────
function demoBeta(t: number): number  { return Math.sin(t * 0.31) * 28; }
function demoGamma(t: number): number { return Math.sin(t * 0.19 + 1.2) * 22; }

// ── GL uniform locations bundle ───────────────────────────────────────────────
interface GLState {
  gl:       WebGL2RenderingContext;
  prog:     WebGLProgram;
  vao:      WebGLVertexArrayObject;
  uRes:     WebGLUniformLocation | null;
  uTime:    WebGLUniformLocation | null;
  uTension: WebGLUniformLocation | null;
  uBeta:    WebGLUniformLocation | null;
  uGamma:   WebGLUniformLocation | null;
  cw: number;
  ch: number;
}

export default function AuroraTiltPage() {
  const [phase,    setPhase]    = useState<"idle" | "running">("idle");
  const [noGyro,   setNoGyro]   = useState(false);
  const [noWebGL2, setNoWebGL2] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef     = useRef<GLState | null>(null);
  const rafRef    = useRef(0);

  // Mutable live state — read/written each frame, never causes re-renders
  const liveRef = useRef({
    betaRaw:    0,
    gammaRaw:   0,
    betaSmooth: 0,
    gammaSmooth:0,
    tension:    0,
    hasInput:   false,
    startMs:    0,
    audio:      null as AuroraAudio | null,
  });

  // Pointer-drag fallback
  const dragRef = useRef({ active: false, startX: 0, startY: 0 });

  // ── Drag fallback handlers ────────────────────────────────────────────────
  const onPtrDown = useCallback((e: PointerEvent) => {
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY };
    liveRef.current.hasInput = true;
    (e.currentTarget as HTMLElement | null)?.setPointerCapture(e.pointerId);
  }, []);

  const onPtrMove = useCallback((e: PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    liveRef.current.betaRaw  = -dy * 0.25;
    liveRef.current.gammaRaw =  dx * 0.25;
  }, []);

  const onPtrUp = useCallback(() => {
    dragRef.current.active = false;
    liveRef.current.betaRaw  = 0;
    liveRef.current.gammaRaw = 0;
  }, []);

  // ── Start (must be inside user gesture for AudioContext + iOS permission) ──
  const handleStart = useCallback(async () => {
    const actx  = new AudioContext();
    await actx.resume();
    const audio = makeAuroraAudio(actx);
    liveRef.current.audio   = audio;
    liveRef.current.startMs = performance.now();

    // iOS 13+ orientation permission
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DOE.requestPermission === "function") {
      try {
        const r = await DOE.requestPermission();
        if (r !== "granted") setNoGyro(true);
      } catch {
        setNoGyro(true);
      }
    } else if (typeof window !== "undefined" && !("DeviceOrientationEvent" in window)) {
      setNoGyro(true);
    }

    setPhase("running");
  }, []);

  // ── Main effect: WebGL2 init + event wiring + render loop ──────────────────
  useEffect(() => {
    if (phase !== "running") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Capture the stable mutable-state object for use in cleanup
    const live = liveRef.current;

    // WebGL2
    let glOk = false;
    const gl = canvas.getContext("webgl2");

    if (gl) {
      try {
        const vert = compileShader(gl, gl.VERTEX_SHADER,   VERT_SRC);
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        const prog = linkProgram(gl, vert, frag);
        const vao  = buildQuad(gl, prog);
        gl.useProgram(prog);

        glRef.current = {
          gl, prog, vao,
          uRes:     gl.getUniformLocation(prog, "uRes"),
          uTime:    gl.getUniformLocation(prog, "uTime"),
          uTension: gl.getUniformLocation(prog, "uTension"),
          uBeta:    gl.getUniformLocation(prog, "uBeta"),
          uGamma:   gl.getUniformLocation(prog, "uGamma"),
          cw: 0, ch: 0,
        };
        glOk = true;
      } catch (err) {
        console.error("WebGL2 shader error:", err);
        setNoWebGL2(true);
      }
    } else {
      setNoWebGL2(true);
    }

    // Resize handler
    const applyResize = () => {
      const g = glRef.current;
      if (!g) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * 0.65;
      g.cw = Math.max(1, Math.floor(window.innerWidth  * dpr));
      g.ch = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width  = g.cw;
      canvas.height = g.ch;
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      g.gl.viewport(0, 0, g.cw, g.ch);
    };
    if (glOk) {
      applyResize();
      window.addEventListener("resize", applyResize);
    }

    // Device orientation
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      liveRef.current.betaRaw  = e.beta  ?? 0;
      liveRef.current.gammaRaw = e.gamma ?? 0;
      liveRef.current.hasInput = true;
    };
    window.addEventListener("deviceorientation", onOrientation);

    // Pointer drag fallback
    canvas.addEventListener("pointerdown",   onPtrDown);
    canvas.addEventListener("pointermove",   onPtrMove);
    canvas.addEventListener("pointerup",     onPtrUp);
    canvas.addEventListener("pointercancel", onPtrUp);

    // Render loop
    const ALPHA = 0.08;

    const runFrame = (ts: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const s = liveRef.current;
      const elapsedSec = (ts - s.startMs) / 1000;

      // Auto-demo sweep
      if (!s.hasInput) {
        s.betaRaw  = demoBeta(elapsedSec);
        s.gammaRaw = demoGamma(elapsedSec);
      }

      // Smooth tilt
      s.betaSmooth  = applyOnePole(s.betaSmooth,  s.betaRaw,  ALPHA);
      s.gammaSmooth = applyOnePole(s.gammaSmooth, s.gammaRaw, ALPHA);

      // Tension
      s.tension = computeTension(s.betaSmooth, s.gammaSmooth);

      // Audio
      s.audio?.setTension(s.tension);

      // WebGL render
      const g = glRef.current;
      if (g) {
        const { gl: wgl, vao, cw, ch } = g;
        wgl.bindVertexArray(vao);
        wgl.uniform2f(g.uRes,     cw, ch);
        wgl.uniform1f(g.uTime,    elapsedSec);
        wgl.uniform1f(g.uTension, s.tension);
        wgl.uniform1f(g.uBeta,    s.betaSmooth  / 45);
        wgl.uniform1f(g.uGamma,   s.gammaSmooth / 45);
        wgl.drawArrays(wgl.TRIANGLES, 0, 6);
        wgl.bindVertexArray(null);
      }
    };

    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize",            applyResize);
      window.removeEventListener("deviceorientation", onOrientation);
      canvas.removeEventListener("pointerdown",   onPtrDown);
      canvas.removeEventListener("pointermove",   onPtrMove);
      canvas.removeEventListener("pointerup",     onPtrUp);
      canvas.removeEventListener("pointercancel", onPtrUp);
      glRef.current = null;
      live.audio?.close();
      live.audio = null;
    };
  }, [phase, onPtrDown, onPtrMove, onPtrUp]);

  // ── Idle splash screen ─────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#04011a] text-white gap-8 px-6 text-center">
        <div
          aria-hidden="true"
          className="select-none text-7xl"
          style={{ filter: "drop-shadow(0 0 32px #7c3aed)" }}
        >
          🌌
        </div>

        <div className="flex flex-col gap-2 items-center">
          <h1 className="text-3xl font-bold text-white/95 tracking-wide">
            Aurora Sky
          </h1>
          <p className="text-xl text-white/80">
            Tilt to bend the light
          </p>
        </div>

        <p className="text-base text-white/75 max-w-sm leading-relaxed">
          Hold your tablet and tilt it — the northern lights stretch and shimmer.{" "}
          Tilt far and the sky goes electric and bright.{" "}
          Hold it flat and still, and everything comes to rest.
        </p>

        {/* Colour hint palette */}
        <div className="flex gap-3 items-center select-none" aria-hidden="true">
          {(["#1fde9a","#11d4cc","#7c3aed","#d946ef","#2563eb"] as const).map((col, i) => (
            <div
              key={i}
              style={{
                width: 14, height: 14, borderRadius: "50%",
                backgroundColor: col,
                boxShadow: `0 0 10px ${col}`,
              }}
            />
          ))}
        </div>

        <button
          onClick={handleStart}
          className="min-h-[72px] min-w-[240px] bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 rounded-3xl px-10 py-5 text-white text-xl font-semibold transition-colors"
          style={{ boxShadow: "0 0 24px rgba(139,92,246,0.3)" }}
        >
          ✨ Start
        </button>

        <p className="text-base text-white/55">
          no microphone • for kids 4+
        </p>
      </div>
    );
  }

  // ── Running screen ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#04011a] overflow-hidden">
      {/* Full-screen WebGL2 canvas */}
      <canvas
        ref={canvasRef}
        className="touch-none"
        style={{
          display: "block",
          cursor: "none",
          width: "100vw",
          height: "100vh",
        }}
      />

      {/* WebGL2 unavailable notice */}
      {noWebGL2 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-rose-300 text-base max-w-xs text-center px-6 leading-relaxed">
            WebGL2 not available in this browser — but the aurora music is playing!
            Try Chrome or Safari for the full visual experience.
          </p>
        </div>
      )}

      {/* No gyro: drag-fallback hint */}
      {noGyro && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-white/75 text-base bg-black/50 rounded-xl px-4 py-2.5 backdrop-blur-sm">
            Drag across the screen to tilt the sky
          </p>
        </div>
      )}
    </div>
  );
}
