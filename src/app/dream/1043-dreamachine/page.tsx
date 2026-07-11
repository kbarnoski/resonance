"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { DreamAudioEngine } from "./audio";
import { SafeFlicker, clampRate, MAX_HZ, MIN_HZ, type FlickerMode } from "./flicker";
import { computeArc } from "./arc";

// ════════════════════════════════════════════════════════════════════════════
// 1043 — Dreamachine
//
// THE QUESTION: "What if Resonance could move your OWN visual cortex into
// hallucinated geometry — spirals, tunnels, cobwebs, honeycombs — with no drug,
// just safe rhythmic light + a uniform field + drone, the way Brion Gysin's
// Dreamachine (1959) and modern Ganzflicker do?"
//
// The screen does NOT draw the hallucination. It supplies a uniform Ganzfeld
// field + a SAFE photic pulse (hard-capped at ≤3 Hz, soft-sine, low-contrast)
// + a phase-locked drone; the viewer soft-focuses the center and their own
// visual cortex manufactures the Klüver form constants.
//
// SAFETY is the headline: a warning + opt-in gate before any flicker, a default
// non-flicker "drift" mode, a 3 Hz hard cap (flicker.ts), and an always-visible
// instant STOP. See README.md.
// ════════════════════════════════════════════════════════════════════════════

type Stage = "warning" | "running";

// compile + link a WebGL2 program (helper, NOT a hook -> not named useX)
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

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);

  const flickerRef = useRef<SafeFlicker | null>(null);
  const audioRef = useRef<DreamAudioEngine | null>(null);
  const lastHudRef = useRef<number>(0);

  // mutable control state read inside the render loop (no re-render per frame)
  const ctrlRef = useRef({
    mode: "drift" as FlickerMode,
    rateHz: MIN_HZ, // user rate, already clamped
    stopped: false,
    audioOn: true,
  });

  const [stage, setStage] = useState<Stage>("warning");
  const [webglOk, setWebglOk] = useState(true);
  const [audioOk, setAudioOk] = useState(true);
  const [mode, setMode] = useState<FlickerMode>("drift");
  const [rateHz, setRateHz] = useState<number>(MIN_HZ);
  const [stopped, setStopped] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Onset");
  const [progress, setProgress] = useState(0);

  // ── render loop ─────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    const flicker = flickerRef.current;
    if (!gl || !prog || !canvas || !flicker) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    const elapsed = (performance.now() - startWallRef.current) / 1000;
    const arc = computeArc(elapsed);
    const ctrl = ctrlRef.current;

    // drive the safe-flicker engine from arc + user controls
    flicker.setMode(ctrl.mode);
    flicker.setRate(ctrl.rateHz * arc.pulseRate01 + MIN_HZ * (1 - arc.pulseRate01));
    if (ctrl.stopped) {
      flicker.stop();
    } else {
      flicker.run(arc.pulseDepth);
    }
    const fs = flicker.sample();

    // audio: phase-lock amplitude to the very same light level
    const audio = audioRef.current;
    if (audio) audio.update(fs.level, ctrl.stopped ? 0.18 : arc.drone);

    gl.useProgram(prog);
    const set1 = (name: string, v: number) =>
      gl.uniform1f(gl.getUniformLocation(prog, name), v);
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
    set1("uTime", elapsed);
    set1("uLevel", fs.level);
    set1("uField", arc.fieldLift);
    set1("uHint", ctrl.stopped ? 0 : arc.hint);
    set1("uGrain", 0.018);
    set1("uHue", elapsed * 0.006);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // throttle React HUD updates (~5/s)
    if (elapsed - lastHudRef.current > 0.2) {
      lastHudRef.current = elapsed;
      setPhaseLabel(arc.label);
      setProgress(arc.progress);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init once (visuals run even before opt-in: a calm dark field) ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", { antialias: true, powerPreference: "low-power" });
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
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    glRef.current = gl;
    progRef.current = prog;
    startWallRef.current = performance.now();

    // self-clocked flicker until audio supplies a context; stopped (calm) at first
    flickerRef.current = new SafeFlicker(null);
    flickerRef.current.stop();

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

  // ── opt-in: this is the gate. Nothing flickers before this runs. ────────────
  const onBegin = useCallback(async () => {
    // restart the arc clock at opt-in so the journey begins now
    startWallRef.current = performance.now();
    ctrlRef.current.stopped = false;
    setStopped(false);

    // try audio; if it fails, visuals + flicker still run (self-clocked)
    try {
      const a = new DreamAudioEngine();
      await a.start();
      audioRef.current = a;
      // re-clock the flicker engine off the AudioContext for phase-lock
      flickerRef.current = new SafeFlicker(a.getContext());
      flickerRef.current.setMode(ctrlRef.current.mode);
      flickerRef.current.setRate(ctrlRef.current.rateHz);
      flickerRef.current.run(0);
      setAudioOk(true);
    } catch (err) {
      console.error(err);
      setAudioOk(false);
      // keep the self-clocked flicker engine; just enable it
      if (flickerRef.current) flickerRef.current.run(0);
    }

    setStage("running");
  }, []);

  const onStop = useCallback(() => {
    ctrlRef.current.stopped = true;
    setStopped(true);
    if (flickerRef.current) flickerRef.current.stop();
    if (audioRef.current) audioRef.current.hush();
  }, []);

  const onResume = useCallback(() => {
    ctrlRef.current.stopped = false;
    setStopped(false);
  }, []);

  const onSetMode = useCallback((m: FlickerMode) => {
    ctrlRef.current.mode = m;
    setMode(m);
  }, []);

  const onSetRate = useCallback((hz: number) => {
    const safe = clampRate(hz); // single gate — can never exceed MAX_HZ
    ctrlRef.current.rateHz = safe;
    setRateHz(safe);
  }, []);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL2 is not available in this browser, so the Ganzfeld field cannot
            render. Try a recent desktop Chrome, Edge, or Firefox. (The safe-flicker
            engine and drone are unaffected, but there is nothing to show.)
          </p>
        </div>
      )}

      {/* ── WARNING / OPT-IN GATE — shown FIRST, before any flicker ── */}
      {stage === "warning" && webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-2xl bg-black/55 p-7 backdrop-blur-md">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
              Resonance · Dream Lab · 1043
            </p>
            <h1 className="mt-3 font-serif text-3xl text-foreground sm:text-4xl">
              Dreamachine
            </h1>
            <p className="mt-4 text-base leading-relaxed text-foreground">
              A drug-free altered-states field. Dim your lights, soft-focus the
              center, and let your own visual cortex draw the patterns — spirals,
              tunnels, cobwebs, honeycombs. The screen only offers a uniform glow,
              a gentle rhythm, and a drone; the geometry comes from you.
            </p>

            {/* epilepsy warning — clearly visible (amber, not dim) */}
            <div className="mt-6 rounded-xl border border-violet-300/40 bg-violet-300/10 p-4">
              <p className="font-mono text-sm uppercase tracking-widest text-violet-300/95">
                Photosensitive-epilepsy warning
              </p>
              <p className="mt-2 text-base leading-relaxed text-violet-300/95">
                This piece uses rhythmic light. If you have a history of
                photosensitive epilepsy or seizures, please do not proceed. Rates
                are hard-capped at {MAX_HZ.toFixed(0)} flashes per second with soft,
                low-contrast modulation, the gentlest non-flicker mode is the
                default, and you can stop instantly at any time. If you feel unwell,
                stop and look away.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={onBegin}
                className="min-h-[44px] rounded-xl bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-100 ring-1 ring-violet-300/40 transition hover:bg-violet-500/40"
              >
                I understand — begin the field
              </button>
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="min-h-[44px] rounded-xl px-4 py-2.5 text-base text-violet-300 underline-offset-4 hover:underline"
              >
                {showNotes ? "Hide design notes" : "Read the design notes"}
              </button>
            </div>

            {showNotes && (
              <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                After Brion Gysin &amp; Ian Sommerville&apos;s Dreamachine (1959) and
                modern Ganzflicker. Klüver&apos;s four form constants are a property
                of visual cortex (Bressloff–Cowan); a uniform field plus a slow
                alpha-band rhythm coaxes them out. Light and drone pulse together,
                phase-locked off one clock, over a ~5-minute arc. Full notes and the
                exact safety measures are in the folder README.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── RUNNING HUD ── */}
      {stage === "running" && webglOk && (
        <>
          {/* top bar: title + phase + STOP (always visible) */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between gap-3 p-4">
            <div className="rounded-xl bg-black/40 px-3 py-2 backdrop-blur-sm">
              <p className="font-serif text-xl text-foreground">Dreamachine</p>
              <p className="font-mono text-sm text-muted-foreground">
                phase: <span className="text-violet-300">{phaseLabel}</span>
              </p>
              <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-violet-400/80"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>

            <button
              onClick={onStop}
              className="pointer-events-auto min-h-[44px] rounded-xl bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-100 ring-1 ring-violet-300/50 transition hover:bg-violet-500/40"
            >
              Stop
            </button>
          </div>

          {/* bottom controls: mode toggle + capped rate + resume */}
          <div className="pointer-events-auto absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="rounded-xl bg-black/45 p-4 backdrop-blur-sm">
              <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                mode
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onSetMode("drift")}
                  className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base ring-1 transition ${
                    mode === "drift"
                      ? "bg-violet-500/30 text-violet-100 ring-violet-300/50"
                      : "bg-muted text-foreground ring-border hover:bg-accent"
                  }`}
                >
                  Drift (no flicker)
                </button>
                <button
                  onClick={() => onSetMode("pulse")}
                  className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base ring-1 transition ${
                    mode === "pulse"
                      ? "bg-violet-500/30 text-violet-100 ring-violet-300/50"
                      : "bg-muted text-foreground ring-border hover:bg-accent"
                  }`}
                >
                  Gentle pulse
                </button>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="rate"
                  className="flex items-center justify-between font-mono text-sm text-muted-foreground"
                >
                  <span>pulse rate</span>
                  <span className="text-violet-300">
                    {rateHz.toFixed(1)} Hz{" "}
                    <span className="text-muted-foreground">(cap {MAX_HZ.toFixed(0)})</span>
                  </span>
                </label>
                <input
                  id="rate"
                  type="range"
                  min={MIN_HZ}
                  max={MAX_HZ}
                  step={0.1}
                  value={rateHz}
                  disabled={mode === "drift"}
                  onChange={(e) => onSetRate(parseFloat(e.target.value))}
                  className="mt-2 w-56 accent-violet-400 disabled:opacity-40"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  hard-capped well below the 15–20 Hz seizure-risk band
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {stopped && (
                <button
                  onClick={onResume}
                  className="min-h-[44px] rounded-xl bg-violet-500/25 px-5 py-2.5 text-base text-violet-100 ring-1 ring-violet-300/50 transition hover:bg-violet-500/40"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="min-h-[44px] rounded-xl bg-black/45 px-4 py-2.5 text-base text-violet-300 backdrop-blur-sm transition hover:bg-black/60"
              >
                {showNotes ? "Hide notes" : "Design notes"}
              </button>
            </div>
          </div>

          {!audioOk && (
            <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-2 text-center text-base text-violet-300/95">
              Audio is unavailable — the visual field and safe pulse continue
              without the drone.
            </p>
          )}

          {stopped && (
            <p className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/55 px-5 py-3 text-center text-base text-foreground backdrop-blur-sm">
              Stopped — a calm, steady field. Resume when you are ready.
            </p>
          )}

          {showNotes && (
            <div className="pointer-events-auto absolute bottom-44 right-4 max-w-sm rounded-2xl bg-black/65 p-5 text-base leading-relaxed text-muted-foreground backdrop-blur-sm">
              <p>
                The field is uniform on purpose (Ganzfeld); the slow ≤{MAX_HZ.toFixed(0)} Hz
                soft-sine pulse (Ganzflicker) lets your visual cortex generate the
                Klüver form constants. Light and drone are phase-locked. Soft-focus
                the center and stay relaxed. See the README for references.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
