"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TwoMindsEngine, type EngineSnapshot } from "./engine";
import { createRenderer, type Renderer } from "./renderer";
import { NOTES_MD } from "./notes";

type Phase = "idle" | "live";

/** Render the design-notes string as austere in-page notes (no markdown dep). */
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
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-white/80">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-white/80">
        {line}
      </p>
    );
  });
}

export default function TwoMindsPage() {
  const engineRef = useRef<TwoMindsEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);

  const begin = useCallback(async () => {
    if (engineRef.current) return;
    setError(null);
    try {
      const AudioCtor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext ??
        AudioContext;
      const ctx = new AudioCtor();
      if (ctx.state === "suspended") await ctx.resume();
      const engine = new TwoMindsEngine(ctx);
      engine.start();
      engineRef.current = engine;

      const canvas = canvasRef.current;
      if (canvas) {
        try {
          rendererRef.current = createRenderer(canvas);
        } catch {
          setError("Canvas2D unavailable — audio still plays.");
        }
      }
      setPhase("live");
    } catch {
      setError("Audio could not start. Check that sound is enabled, then retry.");
    }
  }, []);

  // Render + snapshot loop.
  useEffect(() => {
    if (phase !== "live") return;
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (engine) {
        const s = engine.snapshot();
        if (renderer) renderer.draw(s);
        setSnap(s);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Resize handling.
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Spacebar taps.
  useEffect(() => {
    if (phase !== "live") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        engineRef.current?.tapLocal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // Full cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const engine = engineRef.current;
      engineRef.current = null;
      rendererRef.current = null;
      if (engine) void engine.close();
    };
  }, []);

  const onFieldTap = useCallback(() => {
    engineRef.current?.tapLocal();
  }, []);

  const syncPct = snap ? Math.round(snap.sync * 100) : 0;
  const partnerLabel = snap?.partnerConnected
    ? "● partner connected"
    : "● guide (no partner yet)";
  const partnerClass = snap?.partnerConnected
    ? "text-emerald-300/95"
    : "text-amber-300/95";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#06070c] text-white">
      <canvas
        ref={canvasRef}
        onPointerDown={phase === "live" ? onFieldTap : undefined}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/70 px-6 text-center backdrop-blur-sm">
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Two Minds
          </h1>
          <p className="max-w-md text-base leading-relaxed text-white/80">
            Two beings, apart, whose separate rhythms slowly entrain. Tap a pulse
            and watch the synchrony between you become visible and audible.
          </p>
          <button
            onClick={begin}
            className="rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            Begin
          </button>
          {error && (
            <p className="max-w-sm text-base text-rose-300">{error}</p>
          )}
        </div>
      )}

      {/* Live HUD */}
      {phase === "live" && (
        <>
          {/* Synchrony readout — the emotional core, large and legible. */}
          <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 text-center">
            <div className="font-mono text-6xl font-semibold tabular-nums text-white sm:text-7xl">
              {syncPct}
              <span className="text-2xl text-white/75">%</span>
            </div>
            <div className="mt-1 font-mono text-base text-white/75">
              synchrony
            </div>
            {/* Filling meter */}
            <div className="mx-auto mt-3 h-2 w-56 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-300 via-amber-200 to-violet-300 transition-[width] duration-150"
                style={{ width: `${syncPct}%` }}
              />
            </div>
          </div>

          {/* Partner / guide status */}
          <div
            className={`pointer-events-none absolute left-4 top-4 z-10 font-mono text-base ${partnerClass}`}
          >
            {partnerLabel}
          </div>

          {/* Tap hint */}
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 font-mono text-base text-white/75">
            tap the field or press space to pulse
          </div>

          {error && (
            <div className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2 text-base text-rose-300">
              {error}
            </div>
          )}
        </>
      )}

      {/* Notes toggle */}
      <button
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute right-4 top-4 z-30 rounded-full border border-white/15 bg-black/60 px-4 py-2.5 text-base font-medium text-white/80 backdrop-blur-md transition-colors hover:text-white"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-black/90 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-2xl space-y-1">
            {renderNotes(NOTES_MD)}
            <div className="pt-8">
              <button
                onClick={() => setNotesOpen(false)}
                className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2.5 text-base font-medium text-white/85 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1077-two-minds"]} />
    </main>
  );
}
