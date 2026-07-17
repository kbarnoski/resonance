"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAG_SRC, VERT_SRC, FAMILIES, computeArc } from "./atlas";
import { AtlasAudio } from "./audio";
import {
  createSafeFlicker,
  type SafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 1862 — Strobe Atlas
//
// THE QUESTION: Klüver's four form constants are only PART of the map — what
// does the newly-mapped flicker geometry look and sound like when we morph a
// safe photic field through BOTH the classic four AND the Cartesian/hyperbolic
// motifs a 2026 large-scale computer-vision study found the taxonomy misses?
//
// A seeded, deterministic self-running arc crossfades through all seven
// planform families in one WebGL2 fragment shader. The Atlas readout names the
// current motif and tags it log-polar (classic) vs Cartesian/hyperbolic
// (newly-mapped) — the label that the classic exp() engine can't make IS the
// concept. See README.md for the references and design notes.
// ════════════════════════════════════════════════════════════════════════════

// Compile + link the program. (Not a hook -> not named useX.)
function makeProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("shader compile error:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

interface Readout {
  name: string;
  tag: string;
  newlyMapped: boolean;
  transitionTo: string | null;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);
  const audioRef = useRef<AtlasAudio | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const uLocRef = useRef<Record<string, WebGLUniformLocation | null>>({});
  const lastHudRef = useRef<number>(-999);

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [pulseOn, setPulseOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    name: FAMILIES[0].name,
    tag: FAMILIES[0].tag,
    newlyMapped: FAMILIES[0].newlyMapped,
    transitionTo: null,
  });

  // ── render loop (deterministic: driven by an integer frame counter) ─────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    const frame = frameRef.current;
    const tSec = frame / 60; // deterministic "time" — never Date.now()
    const arc = computeArc(frame);

    // SafeFlicker: 1.0 (steady) unless the opt-in Photic pulse is engaged.
    const flicker = flickerRef.current;
    const flick = flicker ? flicker.value(tSec) : 1;

    const u = uLocRef.current;
    gl.useProgram(prog);
    gl.uniform2f(u.uRes ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.uTime ?? null, tSec);
    gl.uniform1i(u.uFamA ?? null, arc.famA);
    gl.uniform1i(u.uFamB ?? null, arc.famB);
    gl.uniform1f(u.uMix ?? null, arc.mix);
    gl.uniform1f(u.uPhase ?? null, arc.phase);
    gl.uniform1f(u.uAberr ?? null, 0.006);
    gl.uniform1f(u.uFlicker ?? null, flick);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // throttle the Atlas readout (~6/s)
    if (frame - lastHudRef.current > 10) {
      lastHudRef.current = frame;
      const cur = FAMILIES[arc.current];
      setReadout({
        name: cur.name,
        tag: cur.tag,
        newlyMapped: cur.newlyMapped,
        transitionTo: arc.transitioning
          ? FAMILIES[arc.mix < 0.5 ? arc.famB : arc.famA].name
          : null,
      });
    }

    frameRef.current = frame + 1;
    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init (once) — visuals animate immediately, no gesture needed ──────
  useEffect(() => {
    setReduced(prefersReducedMotion());
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 2, floor: 0.55 });

    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) {
      setWebglOk(false);
      return;
    }

    const prog = makeProgram(gl);
    if (!prog) {
      setWebglOk(false);
      return;
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      "uRes",
      "uTime",
      "uFamA",
      "uFamB",
      "uMix",
      "uPhase",
      "uAberr",
      "uFlicker",
    ]) {
      uLocRef.current[name] = gl.getUniformLocation(prog, name);
    }

    glRef.current = gl;
    progRef.current = prog;
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const g = glRef.current;
      if (g) {
        g.deleteProgram(prog);
        g.deleteBuffer(buf);
        g.deleteVertexArray(vao);
        const lose = g.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      }
      glRef.current = null;
      progRef.current = null;
    };
  }, [renderFrame]);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.dispose();
        audioRef.current = null;
      }
    };
  }, []);

  const onStart = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = new AtlasAudio();
      } catch (err) {
        console.error(err);
        setStarted(true); // visuals still run even if audio fails
        return;
      }
    }
    try {
      await audioRef.current.start();
    } catch (err) {
      console.error(err);
    }
    setStarted(true);
  }, []);

  const onTogglePulse = useCallback(() => {
    const flicker = flickerRef.current;
    if (!flicker) return;
    setPulseOn((prev) => {
      const next = !prev;
      if (next) flicker.enable();
      else flicker.kill();
      audioRef.current?.setPulse(next, flicker.rateHz);
      return next;
    });
  }, []);

  const onStopPulse = useCallback(() => {
    flickerRef.current?.kill();
    audioRef.current?.setPulse(false, 0);
    setPulseOn(false);
  }, []);

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL2 is unavailable in this browser, so the atlas engine cannot
            run. The generative audio still plays. Try a recent desktop Chrome,
            Edge, Firefox, or Safari.
          </p>
        </div>
      )}

      {/* Atlas readout — always visible; the label IS the concept */}
      {webglOk && (
        <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-background/60 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Atlas
          </p>
          <p className="mt-1 text-base font-semibold tracking-tight text-foreground">
            {readout.transitionTo ? (
              <>
                {readout.name}{" "}
                <span className="text-muted-foreground">→</span>{" "}
                {readout.transitionTo}
              </>
            ) : (
              readout.name
            )}
          </p>
          <p
            className={`mt-1 font-mono text-xs uppercase tracking-[0.18em] ${
              readout.newlyMapped ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {readout.tag}
          </p>
        </div>
      )}

      {/* Design-notes corner link */}
      {webglOk && (
        <button
          onClick={() => setShowNotes(true)}
          className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      )}

      {/* Intro chrome (before the audio gesture); visuals already animate */}
      {webglOk && !started && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-6 pb-12 sm:items-center">
          <div className="pointer-events-auto max-w-lg rounded-lg border border-border bg-background/80 p-6 shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resonance · Dream Lab · 1862
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Strobe Atlas
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A safe photic field morphs through all seven planform families of
              flicker geometry — Klüver&apos;s classic four, plus the concentric
              squares, crosses, and hyperbolic forms the classic log-polar
              engine can&apos;t make.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start sound
              </button>
              <span className="text-sm text-muted-foreground">
                The atlas is already running.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Running controls (after start): the Photic-pulse opt-in + warning */}
      {webglOk && started && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
          {!reduced ? (
            <>
              {!pulseOn ? (
                <button
                  onClick={onTogglePulse}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Engage Photic pulse
                </button>
              ) : (
                <button
                  onClick={onStopPulse}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Stop pulse
                </button>
              )}
              <p className="max-w-xs text-center text-sm text-destructive">
                {pulseOn
                  ? "Photic pulse active — soft, capped at 3 flashes/sec."
                  : "Opt-in. May affect people with photosensitive epilepsy."}
              </p>
            </>
          ) : (
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Reduced-motion is on — the field drifts gently and photic pulsing
              is disabled.
            </p>
          )}
        </div>
      )}

      {/* Notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Strobe Atlas — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The retina-to-V1 map is a complex logarithm (Bressloff &amp;
                Cowan), so Klüver&apos;s four form constants are one periodic
                pattern seen through an <span className="text-foreground">exp()</span>{" "}
                warp: rings become tunnels, spokes become funnels, diagonals
                become spirals, a hex lattice becomes honeycomb. Because that
                warp is purely radial, it can only make radial forms.
              </p>
              <p>
                A 2026 computer-vision study of 10,598 flicker-hallucination
                drawings found the taxonomy is incomplete: real flicker geometry
                also holds <span className="text-foreground">concentric squares</span>{" "}
                (Chebyshev / L∞ rings), <span className="text-foreground">crosses</span>{" "}
                (an axis-aligned Cartesian grid), and{" "}
                <span className="text-foreground">hyperbolic planforms</span>{" "}
                (saddle level-sets). This piece computes all seven in one
                fragment shader and crossfades a seeded, deterministic arc
                through them. The Atlas badge tags each as{" "}
                <span className="text-primary">newly-mapped</span> or log-polar —
                the forms the classic engine cannot produce.
              </p>
              <p>
                Safety: the field defaults to a slow luminance drift, never
                flicker. The Photic pulse is opt-in, routed through the shared
                safe-flicker engine (soft sine, capped at 3 Hz, floor-limited so
                it never blacks out), honors reduced-motion, and stops instantly.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
