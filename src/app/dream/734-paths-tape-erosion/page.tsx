"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  buildErosionEngine,
  type AudioSourceKind,
  type ErosionEngine,
} from "./audio";
import {
  makeSpectrogramRenderer,
  makeCanvas2DRenderer,
  type SpectrogramRenderer,
  type Canvas2DRenderer,
} from "./webgl";
import { computeMovementState, TOTAL_DURATION, type MovementName } from "./movements";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "intro" | "loading" | "playing";
type RendererKind = "webgl2" | "canvas2d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const MOVEMENT_COLORS: Record<MovementName, string> = {
  Intact: "text-emerald-300",
  Eroding: "text-yellow-300",
  Sparse: "text-amber-400",
  Ghost: "text-violet-300",
  Reforming: "text-sky-300",
};

const MOVEMENT_DESCRIPTIONS: Record<MovementName, string> = {
  Intact: "The recording breathes whole",
  Eroding: "Edges dissolve, harmonics smear",
  Sparse: "Fragments drift in silence",
  Ghost: "Memory traces, barely held",
  Reforming: "Shapes re-cohere from ash",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TapeErosionPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [rendererKind, setRendererKind] = useState<RendererKind | null>(null);
  const [currentMovement, setCurrentMovement] = useState<MovementName>("Intact");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<ErosionEngine | null>(null);
  const fftBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Renderer refs
  const gl2RendererRef = useRef<SpectrogramRenderer | null>(null);
  const c2dRendererRef = useRef<Canvas2DRenderer | null>(null);

  // Loop control
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);

  // HUD state refs (avoid unnecessary re-renders)
  const setElapsedRef = useRef(setElapsedSeconds);
  const setMovementRef = useRef(setCurrentMovement);
  setElapsedRef.current = setElapsedSeconds;
  setMovementRef.current = setCurrentMovement;

  // ── Resize canvas ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      if (gl2RendererRef.current) {
        gl2RendererRef.current.resize(canvas.width, canvas.height);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (gl2RendererRef.current) {
        gl2RendererRef.current.dispose();
        gl2RendererRef.current = null;
      }
      if (c2dRendererRef.current) {
        c2dRendererRef.current.dispose();
        c2dRendererRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => { /* ignore */ });
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ── Start handler ──────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (phase !== "intro") return;
    setPhase("loading");

    try {
      // 1. Create AudioContext
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.resume();

      // 2. Fetch or synthesise buffer
      let buffer = await fetchPianoBuffer(ctx);
      let kind: AudioSourceKind = "piano";
      if (!buffer) {
        buffer = await renderFallbackBuffer(ctx);
        kind = "fallback";
      }
      setSourceKind(kind);

      // 3. Build engine
      const engine = buildErosionEngine(ctx, buffer);
      engineRef.current = engine;
      fftBufRef.current = new Uint8Array(engine.analyser.frequencyBinCount);

      // 4. Setup renderer
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);

        const glCtx = canvas.getContext("webgl2");
        if (glCtx) {
          const renderer = makeSpectrogramRenderer(glCtx, canvas.width, canvas.height);
          if (renderer) {
            gl2RendererRef.current = renderer;
            setRendererKind("webgl2");
          } else {
            // Float textures not supported — fall back to Canvas2D
            const r2d = makeCanvas2DRenderer(canvas);
            c2dRendererRef.current = r2d;
            setRendererKind("canvas2d");
          }
        } else {
          // No WebGL2
          const r2d = makeCanvas2DRenderer(canvas);
          c2dRendererRef.current = r2d;
          setRendererKind("canvas2d");
        }
      }

      // 5. Start render loop
      startTimeRef.current = performance.now() / 1000;
      isRunningRef.current = true;
      setPhase("playing");

      const loop = () => {
        if (!isRunningRef.current) return;

        const eng = engineRef.current;
        const fftBuf = fftBufRef.current;
        if (!eng || !fftBuf) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        const now = performance.now() / 1000;
        const elapsed = now - startTimeRef.current;
        const clamped = Math.min(elapsed, TOTAL_DURATION);

        // Update movement state machine
        const mvState = computeMovementState(clamped);
        eng.setParams(mvState.audio);

        // Read FFT
        eng.analyser.getByteFrequencyData(fftBuf);

        // Render
        if (gl2RendererRef.current) {
          gl2RendererRef.current.drawFrame(fftBuf, mvState.gl, elapsed);
        } else if (c2dRendererRef.current) {
          c2dRendererRef.current.drawFrame(fftBuf, mvState.gl);
        }

        // Update HUD
        setElapsedRef.current(Math.floor(clamped));
        setMovementRef.current(mvState.name);

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);

    } catch (err) {
      console.error("Tape Erosion start error:", err);
      setPhase("intro");
    }
  }, [phase]);

  // ── Progress bar width ─────────────────────────────────────────────────────
  const progressPct = Math.min(100, (elapsedSeconds / TOTAL_DURATION) * 100);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col min-h-screen bg-black text-white overflow-hidden">

      {/* Canvas fills entire background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      />

      {/* Intro overlay */}
      {phase === "intro" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10 px-6">
          <div className="max-w-xl w-full flex flex-col items-center gap-6 text-center">
            <h1 className="text-3xl md:text-4xl font-serif text-white/95 tracking-tight">
              Tape Erosion
            </h1>
            <p className="text-base text-white/80 leading-relaxed max-w-md">
              Karel Barnoski&apos;s solo piano recording &ldquo;Welcome Home&rdquo; plays as a long,
              slow generative arc — slowly disintegrating and re-forming over many minutes.
              The spectrum thins and smears; motifs vanish and ghost back transformed.
              A living, eroding memory of music, rendered as decaying magnetic tape.
            </p>
            <p className="text-sm font-mono text-white/55 tracking-wide uppercase">
              ~7 minutes · Generative · Long-form
            </p>
            <button
              onClick={() => void handleStart()}
              className="min-h-[44px] px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 rounded text-white/95 text-base font-mono tracking-wide transition-all duration-200"
            >
              Begin the erosion
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <p className="text-base font-mono text-white/75 animate-pulse">
            Loading the recording…
          </p>
        </div>
      )}

      {/* HUD — shown while playing */}
      {phase === "playing" && (
        <div className="absolute top-0 left-0 right-0 z-10 flex flex-col pointer-events-none">
          {/* Top bar */}
          <div className="flex items-start justify-between px-5 pt-4">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-serif text-white/90 tracking-tight">
                Tape Erosion
              </h1>
              <p className="text-sm font-mono text-white/55">
                Karel Barnoski · Welcome Home
              </p>
            </div>
            <div className="flex flex-col items-end gap-0.5 pointer-events-auto">
              <span className={`text-base font-mono font-semibold ${MOVEMENT_COLORS[currentMovement]}`}>
                {currentMovement}
              </span>
              <span className="text-sm font-mono text-white/55">
                {MOVEMENT_DESCRIPTIONS[currentMovement]}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 mx-5">
            <div className="h-px bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/30 rounded-full transition-all duration-1000"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs font-mono text-white/35">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="text-xs font-mono text-white/35">
                {formatTime(TOTAL_DURATION)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Notices */}
      <div className="absolute bottom-12 left-0 right-0 z-10 flex flex-col items-center gap-2 px-5 pointer-events-none">
        {sourceKind === "fallback" && (
          <p className="text-amber-300/95 text-sm font-mono text-center">
            Using a fallback tone — Karel&apos;s recording could not load.
          </p>
        )}
        {rendererKind === "canvas2d" && (
          <p className="text-amber-300/95 text-sm font-mono text-center">
            WebGL2 unavailable — using Canvas2D renderer.
          </p>
        )}
      </div>

      {/* Bottom bar — always visible */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 pointer-events-auto">
        <span className="text-xs font-mono text-white/35">
          Basinski · Eno · Ikeda
        </span>
        <button
          onClick={() => setShowNotes(v => !v)}
          className="text-sm font-mono text-white/55 hover:text-white/80 transition-colors duration-150 underline underline-offset-2"
        >
          {showNotes ? "Close notes" : "Read the design notes"}
        </button>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-x-0 bottom-10 z-20 flex justify-center px-4 pb-4">
          <div className="max-w-2xl w-full bg-black/90 border border-white/15 rounded-lg p-6 text-sm font-mono text-white/80 leading-relaxed overflow-y-auto max-h-[60vh]">
            <button
              onClick={() => setShowNotes(false)}
              className="float-right text-white/40 hover:text-white/80 transition-colors duration-150 text-base mb-2"
            >
              ✕
            </button>
            <h2 className="text-base text-white/95 font-sans font-semibold mb-3">
              Design Notes — Tape Erosion
            </h2>
            <p className="mb-3">
              <span className="text-white/95">William Basinski&apos;s</span>{" "}
              <em>Disintegration Loops</em> (2002) accidentally captured the physical
              decay of old magnetic tape as it was being played back to digitize it.
              The tape shed its oxide coating with each pass; the music literally
              fell apart in real time. This piece attempts a software analogue of that
              irreversibility.
            </p>
            <p className="mb-3">
              <span className="text-white/95">Brian Eno&apos;s</span>{" "}
              <em>Music for Airports</em> (1978) and <em>Reflection</em> (2017)
              established generative music as a long-form, self-evolving system —
              never an exact repeat, always alive. The 5-movement arc here borrows
              that sense of gradual, inevitable change.
            </p>
            <p className="mb-3">
              <span className="text-white/95">Ryoji Ikeda&apos;s</span> spectral-feedback
              visuals treat data as material — the spectrogram is not a graph but a
              body. The feedback loop in the fragment shader lets the image accumulate
              memory, smear, and decay just as magnetic domains do.
            </p>
            <p className="mb-3 text-white/60">
              <strong className="text-white/80">Movements:</strong>{" "}
              Intact (1:10) → Eroding (1:30) → Sparse (1:40) → Ghost (1:40) → Reforming (1:30)
            </p>
            <p className="text-white/60">
              <strong className="text-white/80">Renderer:</strong> Raw WebGL2, ping-pong FBO,
              R32F float textures. Feedback fragment shader applies per-frame decay, Gaussian
              smear, horizontal advection, and magnetic noise. Canvas2D fallback for devices
              without <code>EXT_color_buffer_float</code>.
            </p>
          </div>
        </div>
      )}

      {/* Back link */}
      {phase === "intro" && (
        <div className="absolute top-5 left-5 z-20">
          <Link
            href="/dream"
            className="text-sm font-mono text-white/40 hover:text-white/70 transition-colors duration-150"
          >
            ← dream
          </Link>
        </div>
      )}
    </div>
  );
}
