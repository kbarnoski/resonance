"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { PulseEngine, type EngineSnapshot } from "./engine";
import { createRenderer, type Renderer } from "./renderer";
import { NOTES_MD } from "./notes";

type Phase = "idle" | "live";

/** Render the design-notes markdown as austere in-page notes (no deps). */
function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-violet-300">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold text-white">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base text-white/75">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-white/75">
        {line}
      </p>
    );
  });
}

export default function PulseMirrorPage() {
  const engineRef = useRef<PulseEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"mic" | "demo">("demo");
  const [usingGL, setUsingGL] = useState(true);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);

  const begin = useCallback(async (preferMic: boolean) => {
    if (engineRef.current) return;
    setError(null);
    let engine: PulseEngine;
    try {
      engine = await PulseEngine.create(preferMic);
    } catch {
      setError("Audio could not start in this browser.");
      return;
    }
    engineRef.current = engine;
    engine.start();
    setMode(engine.mode);
    if (preferMic && engine.mode === "demo") {
      setError(
        "Microphone unavailable or denied — running the demo performer instead.",
      );
    }
    setPhase("live");

    // Renderer + animation loop.
    const canvas = canvasRef.current;
    if (canvas) {
      const r = createRenderer(canvas);
      rendererRef.current = r;
      setUsingGL(r.usingGL);
      const tick = (tMs: number) => {
        const e = engineRef.current;
        const ren = rendererRef.current;
        if (e && ren) {
          const s = e.snapshot();
          ren.frame(s, tMs);
          setSnap(s);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  // Resize the canvas backing store on viewport changes.
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const bpm = snap ? Math.round(snap.tempo.bpm) : 0;
  const confidence = snap ? snap.tempo.confidence : 0;
  const onsetCount = snap ? snap.tempo.onsetCount : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507] text-white">
      {/* WebGL2 stage. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: phase === "live" ? "block" : "none" }}
      />

      <header className="relative z-10 mx-auto max-w-2xl px-6 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
          dream · 1074
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white/95">
          Pulse Mirror
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-white/75">
          Play a rhythm — clap, tap, sing, or knock — and a duet partner tracks
          your tempo and answers <span className="text-violet-300">on</span> the
          beat, anticipating where your next beat will fall.
        </p>
      </header>

      <section className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-6 pb-32 pt-8">
        {phase === "idle" ? (
          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => begin(true)}
                className="min-h-[44px] rounded-full border border-amber-400/40 bg-amber-500/20 px-6 py-2.5 text-base font-medium text-white/95 transition-colors hover:bg-amber-500/30"
              >
                Start mic
              </button>
              <button
                type="button"
                onClick={() => begin(false)}
                className="min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/20 px-6 py-2.5 text-base font-medium text-white/95 transition-colors hover:bg-violet-500/30"
              >
                Start demo performer
              </button>
            </div>
            <p className="max-w-md text-center text-base text-white/55">
              Mic starts a live listener. No mic (or denied) falls back to a
              self-clocking demo performer so the duet still plays.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            {/* Live-mode badge. */}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base ${
                mode === "mic"
                  ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300/95"
                  : "border-amber-400/30 bg-amber-500/10 text-amber-300/95"
              }`}
            >
              <span aria-hidden>●</span>
              {mode === "mic" ? "listening (mic)" : "demo performer"}
            </span>

            {/* Tempo readout. */}
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[44px] font-light leading-none tabular-nums text-white/95">
                {onsetCount >= 3 && confidence > 0.1 ? bpm : "—"}
              </span>
              <span className="text-xl text-white/55">bpm</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-2 w-52 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-violet-300 transition-[width] duration-200"
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/55">
                tempo confidence · {onsetCount} onsets
              </span>
            </div>

            <p className="max-w-md text-center text-base text-white/75">
              {mode === "mic"
                ? "Keep a steady rhythm going. The violet/rose voice will lock to your pulse and answer on the beat."
                : "The synthetic performer is playing; the violet/rose voice is following and answering it on the beat."}
            </p>

            {!usingGL && (
              <p className="text-base text-amber-300/95">
                WebGL2 unavailable — showing the Canvas2D fallback. Audio is
                still playing.
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-base text-rose-300">{error}</p>}
      </section>

      {/* In-page design notes toggle. */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-full border border-white/10 bg-black/70 px-4 py-2.5 text-base text-white/75 backdrop-blur-md transition-colors hover:text-white/95"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/85 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-6 py-16">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-6 min-h-[44px] rounded-full border border-white/10 bg-white/[0.06] px-4 py-2.5 text-base text-white/75 hover:text-white/95"
            >
              ← Close
            </button>
            <article className="space-y-1">{renderNotes(NOTES_MD)}</article>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1074-pulse-mirror"]} />
    </main>
  );
}
