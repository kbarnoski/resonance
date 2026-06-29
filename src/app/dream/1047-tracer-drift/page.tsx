"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackRenderer } from "./feedback";
import { TracerAudioEngine } from "./audio";
import { computeArc } from "./arc";

// ════════════════════════════════════════════════════════════════════════════
// 1047 — Tracer Drift
//
// THE QUESTION: "What if a screen could evoke the LSD drift — surfaces breathing
// and slowly drifting, motion leaving lagging colour trails (positive
// afterimages), persistent visual snow, gentle moire — the long weightless
// plateau of an acid come-up, drug-free?"
//
// state: LSD · pole: cosmic-ambient (drifting)
//
// A WebGL2 ping-pong feedback buffer is the engine: each frame composites the
// decayed, slightly warped previous frame UNDER fresh content (a breathing fBm
// surface, two detuned moire lattices, faint visual snow). A slow drifting
// ambient bed drives it: low-band energy -> trail length + warp; loudness ->
// saturation. Mic is analysis-only (breath as a slow swell); no mic -> a
// self-driven LFO swell so it drifts with zero permissions.
//
// See README.md for design notes and named references (Memo Akten; LSD tracer /
// positive-afterimage / visual-snow phenomenology; Carhart-Harris entropic
// brain).
// ════════════════════════════════════════════════════════════════════════════

type Mode = "idle" | "running";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FeedbackRenderer | null>(null);
  const engineRef = useRef<TracerAudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallRef = useRef<number>(0);
  const lastHudRef = useRef<number>(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Onset");
  const [progress, setProgress] = useState(0);
  const [micDriven, setMicDriven] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── render loop ─────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!renderer || !canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderer.resize(canvas.width, canvas.height);

    const elapsed = (performance.now() - startWallRef.current) / 1000;
    const arc = computeArc(elapsed);

    let lowEnergy = 0.4;
    let level = 0.3;
    let mic = false;
    if (engine) {
      const f = engine.read();
      lowEnergy = f.lowEnergy;
      level = f.level;
      mic = f.micDriven;
    }

    renderer.runFrame({
      time: elapsed,
      intensity: arc.intensity,
      lowEnergy,
      level,
    });

    // throttle React updates (~6/s)
    if (elapsed - lastHudRef.current > 0.16) {
      lastHudRef.current = elapsed;
      setPhaseLabel(arc.label);
      setProgress(arc.progress);
      setMicDriven(mic);
    }

    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── WebGL2 init (once) ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = FeedbackRenderer.create(canvas);
    if (!renderer) {
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    startWallRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [renderFrame]);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const ensureEngine = useCallback((): TracerAudioEngine | null => {
    if (engineRef.current) return engineRef.current;
    try {
      const e = new TracerAudioEngine();
      engineRef.current = e;
      return e;
    } catch (err) {
      console.error(err);
      setNotice("Audio is unavailable in this browser.");
      return null;
    }
  }, []);

  // Start the bed always; try the mic, fall back to the self-driven swell.
  const onBegin = useCallback(async () => {
    setNotice(null);
    const e = ensureEngine();
    if (!e) return;
    try {
      await e.startBed();
    } catch (err) {
      console.error(err);
      setNotice("Could not start audio. Try a different browser.");
      return;
    }
    try {
      await e.startMic();
    } catch (err) {
      console.error(err);
      setNotice(
        "No microphone — drifting on a self-driven breath swell instead. (No permissions needed.)"
      );
    }
    setMode("running");
  }, [ensureEngine]);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            WebGL2 is not available in this browser, so the feedback tracer
            engine cannot run. Try a recent desktop Chrome, Edge, or Firefox.
          </p>
        </div>
      )}

      {/* Intro overlay */}
      {mode === "idle" && webglOk && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center">
          <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/45 p-6 backdrop-blur-sm">
            <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-200">
              Resonance · Dream Lab · 1047
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Tracer Drift
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              Surfaces breathing and slowly drifting, motion leaving lagging
              colour trails, a haze of visual snow — the long, weightless plateau
              of an acid come-up, drug-free. Breathe near the mic to swell the
              trails, or just let it drift.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={onBegin}
                className="min-h-[44px] rounded-xl bg-violet-400/25 px-5 py-2.5 text-base font-medium text-violet-50 ring-1 ring-violet-200/40 transition hover:bg-violet-400/40"
              >
                Begin the drift
              </button>
              <p className="text-sm text-white/55">
                Asks for the mic (analysis only — never recorded or played back).
                Works without it.
              </p>
            </div>

            {notice && <p className="mt-4 text-base text-rose-300">{notice}</p>}

            <button
              onClick={() => setShowNotes((s) => !s)}
              className="mt-5 min-h-[44px] text-base text-violet-200 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>

          {showNotes && (
            <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/55 p-5 text-left text-base leading-relaxed text-white/75 backdrop-blur-sm">
              <p>
                A WebGL2{" "}
                <span className="text-white/95">ping-pong feedback buffer</span>{" "}
                drives everything: each frame samples the previous frame with a
                tiny zoom, rotation and fBm warp, fades it (the positive
                afterimage), then composites a breathing fBm surface, two
                slightly-detuned moiré lattices and faint visual snow over it.
                Low-band audio energy lengthens the trails and grows the warp;
                loudness lifts saturation. The arc dwells in a long plateau —
                the weightless middle. Slow luminance drift only; not a strobe.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Running HUD */}
      {mode === "running" && webglOk && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4">
            <div className="rounded-xl bg-black/35 px-3 py-2 backdrop-blur-sm">
              <p className="font-mono text-sm text-white/95">
                Tracer Drift
                <span className="ml-2 text-violet-200">
                  {micDriven ? "· breath" : "· self-drift"}
                </span>
              </p>
              <p className="font-mono text-sm text-white/75">
                phase: <span className="text-violet-200">{phaseLabel}</span>
              </p>
              <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-violet-300/80"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => setShowNotes((s) => !s)}
              className="pointer-events-auto min-h-[44px] rounded-xl bg-black/35 px-4 py-2.5 text-base text-violet-200 backdrop-blur-sm transition hover:bg-black/55"
            >
              {showNotes ? "Hide notes" : "Design notes"}
            </button>
          </div>

          {!micDriven && (
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/45 px-3 py-2 text-base text-rose-300 backdrop-blur-sm">
              Drifting on a self-driven breath swell — no microphone in use.
            </p>
          )}

          {notice && (
            <p className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-lg bg-black/55 px-3 py-2 text-base text-rose-300 backdrop-blur-sm">
              {notice}
            </p>
          )}

          {showNotes && (
            <div className="pointer-events-auto absolute bottom-16 right-4 max-w-sm rounded-2xl bg-black/60 p-5 text-base leading-relaxed text-white/75 backdrop-blur-sm">
              <p>
                Ping-pong feedback: the previous frame is warped, faded and
                re-composited under fresh content every frame — that lag is the
                tracer. Low-band energy → trail length &amp; warp; loudness →
                saturation. See README for references.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
