"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FRAG_SRC, VERT_SRC } from "./shader";
import { FormAudioEngine, type AudioBands } from "./audio";
import { computeArc } from "./arc";

// ════════════════════════════════════════════════════════════════════════════
// 1038 — Form Constant
//
// THE QUESTION: "What if Resonance could turn your music into the actual
// geometry your visual cortex hallucinates -- tunnels, spirals, funnels,
// honeycomb lattices -- with no drug?"
//
// The lab's first altered-states prototype and the foundational log-polar /
// form-constant engine. All Kluver form constants are ONE periodic pattern
// seen through a complex-log (retina->V1) warp (Bressloff & Cowan). A WebGL2
// fragment shader builds plane waves + a hex lattice in cortical (lr, theta)
// space; wave orientation chooses the form constant and `formMix` sweeps
// between them. Audio (mic, or a Shepard-Risset drone fallback) drives the
// uniforms; a ~5-min entropy arc gives minute-5 != minute-1 evolution.
//
// See README.md for the design notes and named references.
// ════════════════════════════════════════════════════════════════════════════

type Mode = "idle" | "mic" | "drone";

// Helper: compile + link the WebGL2 program. (Not a hook -> not named useX.)
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<FormAudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const startWallRef = useRef<number>(0);
  const lastHudRef = useRef<number>(0);

  // smoothed uniform values live in a ref (mutated per frame, no re-render)
  const uRef = useRef({
    flow: 0,
    formMix: 0,
    fold: 6,
    detail: 0,
    grain: 0.02,
    sat: 0.3,
    entropy: 0.05,
    level: 0,
  });

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Onset");
  const [progress, setProgress] = useState(0);
  const [bands, setBands] = useState<AudioBands>({
    bass: 0,
    mids: 0,
    highs: 0,
    level: 0,
  });

  // ── render loop ─────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!gl || !prog || !canvas) return;

    // resize backing store to display size (DPR-capped for perf)
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

    // audio -> targets
    let b: AudioBands = { bass: 0, mids: 0, highs: 0, level: 0 };
    if (engine) b = engine.read();

    // a faint idle drift so even pre-start the field breathes a little
    const idleBass = engine ? 0 : 0.15 + 0.1 * Math.sin(elapsed * 0.4);

    const u = uRef.current;
    const k = 0.06; // global smoothing toward targets (transitions never abrupt)

    // bass -> flow / warp amplitude
    u.flow = lerp(u.flow, (b.bass + idleBass) * (0.6 + arc.entropy * 0.8), k);
    // mids -> form-constant morph (also slowly self-sweeps so all four appear)
    const selfSweep = (Math.sin(elapsed * 0.045) * 0.5 + 0.5);
    const formTarget = Math.min(1, selfSweep * 0.6 + b.mids * 0.6);
    u.formMix = lerp(u.formMix, formTarget, k * 0.6);
    // mids -> fold count (kaleidoscope bloom rises with entropy at peak)
    const foldTarget = 4 + Math.round(b.mids * 6) + arc.entropy * 8;
    u.fold = lerp(u.fold, foldTarget, k);
    // highs -> fine detail + grain (visual snow)
    u.detail = lerp(u.detail, b.highs * 1.1 + arc.entropy * 0.3, k);
    u.grain = lerp(u.grain, 0.02 + b.highs * 0.08 + arc.entropy * 0.04, k);
    // loudness -> saturation / neural gain
    u.sat = lerp(u.sat, 0.3 + b.level * 1.2 + arc.entropy * 0.6, k);
    // arc -> entropy + breathing level
    u.entropy = lerp(u.entropy, arc.entropy, 0.02);
    u.level = lerp(u.level, b.level + idleBass * 0.4, k);

    gl.useProgram(prog);
    const set1 = (name: string, v: number) =>
      gl.uniform1f(gl.getUniformLocation(prog, name), v);
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
    set1("uTime", elapsed);
    set1("uFlow", u.flow);
    set1("uFormMix", u.formMix);
    set1("uFold", u.fold);
    set1("uDetail", u.detail);
    set1("uGrain", u.grain);
    set1("uSat", u.sat);
    set1("uEntropy", u.entropy);
    set1("uLevel", u.level);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // throttle React state updates (~6/s) for the HUD
    if (elapsed - lastHudRef.current > 0.16) {
      lastHudRef.current = elapsed;
      setPhaseLabel(arc.label);
      setProgress(arc.progress);
      setBands(b);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init (once) ──────────────────────────────────────────────────────
  useEffect(() => {
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

    // single full-screen triangle
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    glRef.current = gl;
    progRef.current = prog;
    startWallRef.current = performance.now();

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
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, []);

  const ensureEngine = useCallback((): FormAudioEngine | null => {
    if (engineRef.current) return engineRef.current;
    try {
      const e = new FormAudioEngine();
      engineRef.current = e;
      return e;
    } catch (err) {
      console.error(err);
      setError("Audio is unavailable in this browser.");
      return null;
    }
  }, []);

  const onStartMic = useCallback(async () => {
    setError(null);
    const e = ensureEngine();
    if (!e) return;
    try {
      await e.startMic();
      setMode("mic");
    } catch (err) {
      console.error(err);
      setError(
        "Microphone unavailable or permission denied — starting the generative drone instead."
      );
      try {
        await e.startDrone();
        setMode("drone");
      } catch (err2) {
        console.error(err2);
        setError("Could not start audio. Try a different browser.");
      }
    }
  }, [ensureEngine]);

  const onStartDrone = useCallback(async () => {
    setError(null);
    const e = ensureEngine();
    if (!e) return;
    try {
      await e.startDrone();
      setMode("drone");
    } catch (err) {
      console.error(err);
      setError("Could not start the generative drone.");
    }
  }, [ensureEngine]);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            WebGL2 is not available in this browser, so the form-constant engine
            cannot run. Try a recent desktop Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Title + intro overlay (before start) */}
      {mode === "idle" && webglOk && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/45 p-6 backdrop-blur-sm">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
              Resonance · Dream Lab · 1038
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-white sm:text-4xl">
              Form Constant
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              The geometry your visual cortex draws on the dark — tunnels,
              spirals, funnels, honeycomb lattices — sung out of sound through a
              log-polar warp. Make a noise, play music, or let it sing to itself.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={onStartMic}
                className="min-h-[44px] rounded-xl bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-100 ring-1 ring-violet-300/40 transition hover:bg-violet-500/40"
              >
                Start mic
              </button>
              <button
                onClick={onStartDrone}
                className="min-h-[44px] rounded-xl bg-white/10 px-5 py-2.5 text-base font-medium text-white/95 ring-1 ring-white/20 transition hover:bg-white/20"
              >
                Play generative drone instead
              </button>
            </div>

            {error && (
              <p className="mt-4 text-base text-rose-300">{error}</p>
            )}

            <button
              onClick={() => setShowNotes((s) => !s)}
              className="mt-5 min-h-[44px] text-base text-violet-300 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>

          {showNotes && (
            <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/55 p-5 text-left text-base leading-relaxed text-white/75 backdrop-blur-sm">
              <p>
                The retina-to-V1 cortical map is approximately a complex
                logarithm (Bressloff &amp; Cowan). So Klüver&apos;s four form
                constants are{" "}
                <span className="text-white/95">one</span> periodic pattern seen
                through that warp. We take screen UV, compute cortical
                coordinates{" "}
                <code className="font-mono text-violet-300">
                  (log r, θ)
                </code>
                , and build plane-wave stripes plus a hex lattice there. Stripe
                orientation chooses the constant — rings → tunnel, diagonal →
                spiral, spokes → funnel, lattice → honeycomb — and{" "}
                <code className="font-mono text-violet-300">formMix</code> sweeps
                between them. Audio drives flow, fold, detail and gain; a ~5-min
                entropy arc shapes the journey.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Running HUD */}
      {mode !== "idle" && webglOk && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4">
            <div className="rounded-xl bg-black/40 px-3 py-2 backdrop-blur-sm">
              <p className="font-mono text-sm text-white/95">
                Form Constant
                <span className="ml-2 text-violet-300">
                  {mode === "mic" ? "· mic" : "· drone"}
                </span>
              </p>
              <p className="font-mono text-sm text-white/75">
                phase: <span className="text-violet-300">{phaseLabel}</span>
              </p>
              <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-violet-400/80"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
              {mode === "mic" && (
                <button
                  onClick={onStartDrone}
                  className="min-h-[44px] rounded-xl bg-white/10 px-4 py-2.5 text-base text-white/95 ring-1 ring-white/20 transition hover:bg-white/20"
                >
                  Add generative drone
                </button>
              )}
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="min-h-[44px] rounded-xl bg-black/40 px-4 py-2.5 text-base text-violet-300 backdrop-blur-sm transition hover:bg-black/60"
              >
                {showNotes ? "Hide notes" : "Design notes"}
              </button>
            </div>
          </div>

          {/* band meters */}
          <div className="pointer-events-none absolute bottom-4 left-4 flex items-end gap-2">
            {(
              [
                ["bass", bands.bass],
                ["mid", bands.mids],
                ["high", bands.highs],
              ] as const
            ).map(([name, v]) => (
              <div key={name} className="flex flex-col items-center gap-1">
                <div className="flex h-20 w-3 items-end overflow-hidden rounded-full bg-white/10">
                  <div
                    className="w-full bg-violet-400/80"
                    style={{ height: `${Math.min(100, v * 140)}%` }}
                  />
                </div>
                <span className="font-mono text-sm text-white/55">{name}</span>
              </div>
            ))}
          </div>

          {error && (
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-2 text-base text-rose-300">
              {error}
            </p>
          )}

          {showNotes && (
            <div className="pointer-events-auto absolute bottom-16 right-4 max-w-sm rounded-2xl bg-black/65 p-5 text-base leading-relaxed text-white/75 backdrop-blur-sm">
              <p>
                Cortical coordinates{" "}
                <code className="font-mono text-violet-300">(log r, θ)</code>{" "}
                turn one periodic pattern into all four Klüver form constants.
                Bass → flow, mids → morph &amp; fold, highs → detail/grain,
                loudness → saturation. See README for references.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
