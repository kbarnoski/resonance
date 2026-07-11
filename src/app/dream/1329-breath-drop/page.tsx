"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeProgram } from "./shader";
import { DropAudio } from "./audio";
import { BreathInput } from "./breath";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// 1329-breath-drop
//
// THE QUESTION: "What if you had to *breathe the drop into being*?"
//
// The EDM build-and-drop tension is not a self-running timer — it is a scalar
// T in [0,1] you CHARGE with a sustained rising hum into the mic and RELEASE
// with a sharp exhale that fires the drop. A real 126-BPM step-sequencer adds
// layers as T climbs (kick -> hats -> riser -> fill), and the drop slams a
// log-polar Klüver form-constant field into cosmic bloom. The played,
// embodied counterpart to the lab's self-running 387-drop-engine.
//
// See README.md for the mechanic, safety notes, and named references.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running" | "error-fatal";

const NOISE_FLOOR = 0.06;
const CHARGE_RATE = 0.7; // T units/sec at a strong steady hum
const DECAY_RATE = 0.13; // T units/sec of slow decay in silence / breakdown
const DROP_TENSION_MIC = 0.7; // T needed for a mic exhale to fire the drop
const DROP_TENSION_KEY = 0.6; // T needed for an ENTER tap to fire the drop
const DEMO_AFTER_MS = 2500; // auto-demo kicks in after this much no-input

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const progRef = useRef<WebGLProgram | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioRef = useRef<DropAudio | null>(null);
  const breathRef = useRef<BreathInput | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);

  const startWallRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastHudRef = useRef(0);

  // authoritative control state (mutated per frame, no re-render)
  const ctrlRef = useRef({
    T: 0,
    dropVisual: 0,
    pitch: 0.4,
    lastRealInputMs: 0,
    demoPhase: 0,
    demoCycle: -1,
    demoDropFired: false,
    spaceHeld: false,
    pendingDrop: false,
  });

  // smoothed uniforms
  const uRef = useRef({ tension: 0, drop: 0, pitch: 0.4, level: 0, beat: 0 });

  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);

  const [hud, setHud] = useState({
    tension: 0,
    level: 0,
    layer: "silent" as string,
    bpm: 126,
    dropActive: false,
    inputActive: false,
    demo: false,
    mic: false,
  });

  // ── render + control loop ───────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = progRef.current;
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!gl || !prog || !canvas) return;

    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - lastFrameRef.current) / 1000 || 0.016);
    lastFrameRef.current = nowMs;
    const elapsed = (nowMs - startWallRef.current) / 1000;

    // resize backing store (DPR-capped)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    const c = ctrlRef.current;

    // ---- gather input (mic > keyboard) ----
    let level = 0;
    let pitchNorm = c.pitch;
    let onset = false;
    let realInput = false;

    const breath = breathRef.current;
    if (breath) {
      const f = breath.update();
      level = f.level;
      pitchNorm = f.pitchNorm;
      onset = f.onset;
      if (f.level > NOISE_FLOOR) realInput = true;
    }
    if (c.spaceHeld) {
      level = Math.max(level, 0.6);
      realInput = true;
    }
    if (c.pendingDrop) {
      c.pendingDrop = false;
      if (c.T >= DROP_TENSION_KEY && audio && !audio.dropActive) {
        audio.triggerDrop();
        c.dropVisual = 1;
      }
    }

    // ---- auto-demo when there's no real input ----
    let demoActive = false;
    if (realInput) {
      c.lastRealInputMs = nowMs;
    } else if (nowMs - c.lastRealInputMs > DEMO_AFTER_MS) {
      demoActive = true;
      c.demoPhase += dt;
      const CYCLE = 12; // 7s charge · drop · ~5s breakdown
      const cycleIdx = Math.floor(c.demoPhase / CYCLE);
      if (cycleIdx !== c.demoCycle) {
        c.demoCycle = cycleIdx;
        c.demoDropFired = false;
      }
      const cyc = c.demoPhase % CYCLE;
      if (cyc < 7) {
        level = 0.55 + 0.28 * Math.sin(cyc * 1.4);
        pitchNorm = clamp01(0.25 + (cyc / 7) * 0.6); // hum audibly/visually climbs
        if (cyc > 6.6 && !c.demoDropFired) onset = true;
      } else {
        level = 0; // breakdown silence
      }
    }

    // ---- update T (identical pipeline for mic / keyboard / demo) ----
    if (audio && !audio.dropActive && level > NOISE_FLOOR) {
      const above = (level - NOISE_FLOOR) / (1 - NOISE_FLOOR);
      c.T = clamp01(c.T + CHARGE_RATE * above * dt);
    } else {
      c.T = clamp01(c.T - DECAY_RATE * dt);
    }

    // ---- onset -> drop (mic exhale, or demo) ----
    if (onset && c.T >= DROP_TENSION_MIC && audio && !audio.dropActive) {
      audio.triggerDrop();
      c.dropVisual = 1;
      if (demoActive) c.demoDropFired = true;
    }

    c.pitch = pitchNorm;
    c.dropVisual = Math.max(0, c.dropVisual - dt * 0.75);

    // ---- drive audio ----
    if (audio) {
      audio.setTension(c.T);
      audio.setPitch(c.pitch);
      audio.frame(dt);
    }

    // ---- smooth uniforms ----
    const u = uRef.current;
    u.tension = lerp(u.tension, c.T, 0.12);
    u.drop = lerp(u.drop, c.dropVisual, 0.3);
    u.pitch = lerp(u.pitch, c.pitch, 0.08);
    u.level = lerp(u.level, level, 0.2);
    const vis = audio ? audio.getVisualState() : null;
    u.beat = vis ? vis.beat : 0;

    const reduced = reducedRef.current;
    const speed = reduced ? 0.3 : 1.0;
    const satBase = reduced ? 0.55 : 1.0;
    const flick = flickerRef.current ? flickerRef.current.value(elapsed) : 1;

    gl.useProgram(prog);
    const set1 = (name: string, v: number) =>
      gl.uniform1f(gl.getUniformLocation(prog, name), v);
    gl.uniform2f(gl.getUniformLocation(prog, "uRes"), canvas.width, canvas.height);
    set1("uTime", elapsed);
    set1("uTension", u.tension);
    set1("uDrop", u.drop);
    set1("uPitch", u.pitch);
    set1("uLevel", u.level);
    set1("uFlicker", flick);
    set1("uSpeed", speed);
    set1("uSatBase", satBase);
    set1("uBeat", u.beat);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // throttle HUD updates (~10/s)
    if (elapsed - lastHudRef.current > 0.1) {
      lastHudRef.current = elapsed;
      setHud({
        tension: c.T,
        level,
        layer: vis ? vis.layer : "silent",
        bpm: vis ? vis.bpm : 126,
        dropActive: vis ? vis.dropActive : false,
        inputActive: realInput || demoActive,
        demo: demoActive,
        mic: !!breathRef.current,
      });
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init (once) ──────────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 2, floor: 0.6 });

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

    glRef.current = gl;
    progRef.current = prog;
    startWallRef.current = performance.now();
    lastFrameRef.current = performance.now();

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

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      breathRef.current?.stop();
      breathRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      flickerRef.current?.kill();
    };
  }, []);

  // ── keyboard fallback (SPACE = charge, ENTER = drop) ────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        ctrlRef.current.spaceHeld = true;
      } else if (e.code === "Enter") {
        e.preventDefault();
        ctrlRef.current.pendingDrop = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") ctrlRef.current.spaceHeld = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase]);

  // ── begin ───────────────────────────────────────────────────────────────────
  const onBegin = useCallback(async () => {
    setMicError(null);
    if (!webglOk) return;
    try {
      const audio = new DropAudio();
      audioRef.current = audio;
      await audio.start();
      // request the mic INSIDE the begin gesture
      try {
        const breath = await BreathInput.open(audio.context);
        breathRef.current = breath;
      } catch {
        setMicError(
          "Microphone denied or unavailable — use the keyboard (hold SPACE to charge, tap ENTER to drop). The auto-demo will run hands-free until then.",
        );
      }
      ctrlRef.current.lastRealInputMs = performance.now();
      setPhase("running");
    } catch (err) {
      console.error(err);
      audioRef.current?.stop();
      audioRef.current = null;
      setPhase("error-fatal");
    }
  }, [webglOk]);

  // ── stop (instant kill) ─────────────────────────────────────────────────────
  const onStop = useCallback(() => {
    breathRef.current?.stop();
    breathRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    flickerRef.current?.kill();
    setFlickerOn(false);
    const c = ctrlRef.current;
    c.T = 0;
    c.dropVisual = 0;
    c.spaceHeld = false;
    c.pendingDrop = false;
    setMicError(null);
    setPhase("idle");
  }, []);

  const onToggleFlicker = useCallback(() => {
    const f = flickerRef.current;
    if (!f) return;
    if (f.enabled) {
      f.disable();
      setFlickerOn(false);
    } else {
      f.enable();
      setFlickerOn(true);
    }
  }, []);

  const pct = (x: number) => `${Math.round(clamp01(x) * 100)}%`;

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL2 is not available in this browser, so the breath-drop visual
            cannot run. Try a recent desktop Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Idle: title + Begin */}
      {phase === "idle" && webglOk && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/50 p-6 backdrop-blur-sm">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
              Resonance · Dream Lab · 1329
            </p>
            <h1 className="mt-3 font-semibold text-2xl font-semibold text-foreground sm:text-4xl">
              Breath Drop
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Breathe the drop into being. A sustained{" "}
              <span className="text-violet-300">rising hum</span> into the mic
              charges the tension and stacks the beat; a sharp{" "}
              <span className="text-violet-300/95">exhale</span> at the peak
              releases the drop. No timer — the build is yours.
            </p>
            <p className="mt-3 text-sm text-violet-300/95">
              Headphones recommended (keeps the mic from hearing the beat).
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={onBegin}
                className="min-h-[44px] rounded-xl bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-100 ring-1 ring-violet-300/40 transition hover:bg-violet-500/40"
              >
                Begin — allow the mic
              </button>
              <p className="text-sm text-muted-foreground">
                No mic? Hold{" "}
                <span className="font-mono text-muted-foreground">SPACE</span> to charge,
                tap <span className="font-mono text-muted-foreground">ENTER</span> to
                drop. An auto-demo runs hands-free.
              </p>
            </div>

            {micError && <p className="mt-4 text-base text-violet-300">{micError}</p>}

            <button
              onClick={() => setShowNotes((s) => !s)}
              className="mt-5 min-h-[44px] text-base text-violet-300 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>

          {showNotes && <DesignNotes />}
        </div>
      )}

      {phase === "error-fatal" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            Audio could not start in this browser. Try a recent desktop Chrome,
            Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && webglOk && (
        <>
          {/* top-left: state */}
          <div className="pointer-events-none absolute left-0 top-0 p-4">
            <div className="rounded-xl bg-black/45 px-3 py-2 backdrop-blur-sm">
              <p className="font-mono text-sm text-foreground">
                Breath Drop
                <span className="ml-2 text-violet-300">
                  {hud.mic ? "· mic" : "· keys"}
                  {hud.demo ? " · auto-demo" : ""}
                </span>
              </p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                layer:{" "}
                <span
                  className={
                    hud.dropActive ? "text-violet-300/95" : "text-violet-300"
                  }
                >
                  {hud.layer}
                </span>
                <span className="ml-3 text-muted-foreground">{hud.bpm} BPM</span>
              </p>
            </div>
          </div>

          {/* top-right: controls */}
          <div className="pointer-events-auto absolute right-0 top-0 flex flex-col items-end gap-2 p-4">
            <button
              onClick={onStop}
              className="min-h-[44px] rounded-xl bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-300/40 transition hover:bg-violet-500/35"
            >
              Stop
            </button>
            <button
              onClick={onToggleFlicker}
              className="min-h-[44px] rounded-xl bg-black/45 px-4 py-2.5 text-sm text-muted-foreground ring-1 ring-border backdrop-blur-sm transition hover:bg-black/65"
            >
              {flickerOn ? "Flicker: on (≤3 Hz)" : "Flicker: off"}
            </button>
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-xl bg-black/45 px-4 py-2.5 text-sm text-violet-300 backdrop-blur-sm transition hover:bg-black/65"
            >
              {showNotes ? "Hide notes" : "Design notes"}
            </button>
          </div>

          {/* bottom: big tension meter + input level */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <div className="mx-auto max-w-2xl rounded-2xl bg-black/45 p-4 backdrop-blur-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
                  Tension
                </span>
                <span
                  className={`font-mono text-sm ${
                    hud.tension >= DROP_TENSION_MIC
                      ? "text-violet-300/95"
                      : "text-muted-foreground"
                  }`}
                >
                  {hud.tension >= DROP_TENSION_MIC
                    ? "READY — release the drop"
                    : "keep the hum going"}
                </span>
              </div>
              <div className="relative mt-2 h-5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    hud.dropActive
                      ? "bg-violet-300/90"
                      : hud.tension >= DROP_TENSION_MIC
                        ? "bg-violet-400/85"
                        : "bg-violet-400/80"
                  }`}
                  style={{ width: pct(hud.tension) }}
                />
                {/* drop threshold marker */}
                <div
                  className="absolute top-0 h-full w-px bg-muted"
                  style={{ left: pct(DROP_TENSION_MIC) }}
                />
              </div>

              <div className="mt-3 flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">input</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${
                      hud.inputActive ? "bg-violet-300/80" : "bg-muted"
                    }`}
                    style={{ width: pct(hud.level) }}
                  />
                </div>
                <span className="font-mono text-sm text-muted-foreground">
                  {hud.inputActive ? (hud.demo ? "demo" : "live") : "quiet"}
                </span>
              </div>
            </div>
          </div>

          {micError && (
            <p className="pointer-events-none absolute left-1/2 top-20 max-w-md -translate-x-1/2 rounded-lg bg-black/70 px-3 py-2 text-center text-base text-violet-300 backdrop-blur-sm">
              {micError}
            </p>
          )}

          {showNotes && (
            <div className="pointer-events-auto absolute right-4 top-40 max-h-[70vh] overflow-auto">
              <DesignNotes />
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ── design-notes overlay (toggle, not a route) ────────────────────────────────
function DesignNotes() {
  return (
    <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/65 p-5 text-left text-base leading-relaxed text-muted-foreground backdrop-blur-sm">
      <p>
        The build-and-drop tension{" "}
        <code className="font-mono text-violet-300">T ∈ [0,1]</code> is not a
        clock — a sustained rising hum charges it, silence lets it decay. At{" "}
        <code className="font-mono text-violet-300">126 BPM</code> a lookahead
        step-sequencer adds layers as T climbs (kick → hats → riser → fill), and
        a sharp exhale onset above an adaptive spectral-flux threshold, while T
        is high, fires the drop: a hard downbeat, full four-on-the-floor, and a
        cosmic-gold bloom of the log-polar Klüver form-constant field.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Safety: the drop is a luminance/saturation/scale bloom, never a strobe.
        Optional flicker is capped at ≤3 Hz and honors reduced-motion. In the
        lineage of Imogen Heap, Holly Herndon, and Max Cooper — voice/gesture as
        the live instrument. See README for references.
      </p>
    </div>
  );
}
