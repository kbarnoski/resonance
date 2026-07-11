"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  decodeUserFile,
  buildGrainCorpus,
  type AudioSourceKind,
  type Grain,
} from "./source";
import {
  createGPUFlock,
  CPUFlock,
  type FlockSim,
} from "./flock";
import { createInstrument, type InstrumentHandle } from "./instrument";

type Phase = "intro" | "loading" | "conducting";

export default function PianoFlockPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [substrate, setSubstrate] = useState<"webgpu" | "canvas2d" | null>(null);
  const [grainCount, setGrainCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const flockRef = useRef<FlockSim | null>(null);
  const instrumentRef = useRef<InstrumentHandle | null>(null);
  const corpusRef = useRef<Grain[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const audioTickRef = useRef(0);
  const attractorRef = useRef({ x: 0.5, y: 0.5, strength: 0, lastMove: 0 });

  // ─── Canvas sizing ───────────────────────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }, []);

  // ─── Pointer conducting ──────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    attractorRef.current.x = Math.min(1, Math.max(0, x));
    attractorRef.current.y = Math.min(1, Math.max(0, y));
    attractorRef.current.strength = 1;
    attractorRef.current.lastMove = performance.now();
  }, []);

  const onPointerLeave = useCallback(() => {
    attractorRef.current.strength = 0;
  }, []);

  // ─── Drag-and-drop user audio ────────────────────────────────────────────
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !ctxRef.current) return;
    const buf = await decodeUserFile(ctxRef.current, file);
    if (!buf) {
      setAudioError("Couldn't decode that audio file.");
      return;
    }
    bufferRef.current = buf;
    corpusRef.current = buildGrainCorpus(buf);
    setGrainCount(corpusRef.current.length);
    setSource("fallback");
    // rebuild instrument on the new corpus
    instrumentRef.current?.destroy();
    instrumentRef.current = createInstrument(ctxRef.current, buf, corpusRef.current);
  }, []);

  // ─── Animation loop ──────────────────────────────────────────────────────
  const loop = useCallback((now: number) => {
    const flock = flockRef.current;
    if (!flock) return;
    const dt = lastTimeRef.current ? (now - lastTimeRef.current) / 1000 : 1 / 60;
    lastTimeRef.current = now;

    const a = attractorRef.current;
    // decay conducting strength after the pointer goes idle
    const idleMs = now - a.lastMove;
    const strength = a.strength > 0 && idleMs < 600 ? 1 : Math.max(0, a.strength * 0.96);
    a.strength = strength;
    flock.setAttractor(a.x, a.y, strength);

    flock.frame(Math.min(0.05, dt));

    // drive the instrument at ~30Hz
    audioTickRef.current += dt;
    if (audioTickRef.current >= 1 / 30 && instrumentRef.current) {
      audioTickRef.current = 0;
      instrumentRef.current.update(flock.readStats());
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ─── Start: gesture-gated ────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase !== "intro") return;
    setPhase("loading");
    setAudioError(null);

    // 1. audio context (gesture)
    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setAudioError("Audio is blocked in this browser. Tap again or check permissions.");
      setPhase("intro");
      return;
    }
    ctxRef.current = ctx;

    // 2. load Karel's piano (or fallback)
    let buffer = await fetchPianoBuffer(ctx);
    if (buffer) {
      setSource("piano");
    } else {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      setSource("fallback");
    }
    bufferRef.current = buffer;
    corpusRef.current = buildGrainCorpus(buffer);
    setGrainCount(corpusRef.current.length);

    // 3. instrument (audio is ready now)
    instrumentRef.current = createInstrument(ctx, buffer, corpusRef.current);

    // 4. pick a substrate and reveal the canvas. The flock itself is built in
    //    the effect below, once the correct (clean) canvas element is mounted —
    //    a <canvas> permanently locks to its first context kind, so we mount a
    //    fresh element per substrate via React key.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasGPU = !!(navigator as any).gpu;
    setSubstrate(hasGPU ? "webgpu" : "canvas2d");
    setPhase("conducting");
  }, [phase]);

  // Build the flock once the canvas for the chosen substrate is mounted.
  useEffect(() => {
    if (phase !== "conducting" || !substrate) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      resizeCanvas();
      let flock: FlockSim | null = null;
      if (substrate === "webgpu") {
        try {
          flock = await createGPUFlock(canvas, 14000);
        } catch {
          flock = null;
        }
        if (!flock && !cancelled) {
          // WebGPU init failed at runtime — fall back. Remount a clean canvas.
          setSubstrate("canvas2d");
          return;
        }
      } else {
        try {
          flock = new CPUFlock(canvas, 2400);
        } catch {
          if (!cancelled) setAudioError("Couldn't initialize the flock renderer.");
          return;
        }
      }
      if (cancelled || !flock) {
        flock?.destroy();
        return;
      }
      flockRef.current = flock;
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      flockRef.current?.destroy();
      flockRef.current = null;
    };
  }, [phase, substrate, loop, resizeCanvas]);

  // resize listener
  useEffect(() => {
    if (phase !== "conducting") return;
    const onResize = () => resizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, resizeCanvas]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      instrumentRef.current?.destroy();
      flockRef.current?.destroy();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06040f] text-foreground">
      {/* the flock canvas. keyed by substrate so a fresh element is used if we
          fall back from webgpu to canvas2d (a canvas keeps its first context). */}
      <canvas
        key={substrate ?? "pending"}
        ref={canvasRef}
        onPointerMove={phase === "conducting" ? onPointerMove : undefined}
        onPointerDown={phase === "conducting" ? onPointerMove : undefined}
        onPointerLeave={phase === "conducting" ? onPointerLeave : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDropHint(true);
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={onDrop}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: phase === "conducting" ? "block" : "none" }}
      />

      {/* Intro / loading overlay */}
      {phase !== "conducting" && (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
            psilocybin · cosmic drift
          </p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Piano Flock
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            Conduct a luminous GPU particle flock with your pointer; its living,
            emergent shape re-voices Karel&apos;s own piano into a cosmic,
            drifting granular instrument.
          </p>

          <button
            type="button"
            onClick={start}
            disabled={phase === "loading"}
            className="mt-8 min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400 disabled:opacity-60"
          >
            {phase === "loading" ? "Summoning the flock…" : "Conduct"}
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="mt-5 min-h-[44px] px-4 py-2.5 text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>

          {audioError && (
            <p className="mt-5 text-base text-violet-300">{audioError}</p>
          )}

          {showNotes && (
            <div className="mt-6 max-w-xl rounded-xl border border-border bg-black/40 p-5 text-left text-base leading-relaxed text-muted-foreground">
              <p>
                A WebGPU compute pass runs Craig Reynolds&apos; three boids rules
                (cohesion, alignment, separation) over thousands of glowing
                points, plus an attractor that pulls toward your pointer — you
                are the conductor.
              </p>
              <p className="mt-3">
                Each frame the flock&apos;s emergent shape — centroid,
                dispersion, mean speed and alignment — navigates a CataRT-style
                grain corpus built from Karel&apos;s piano (Diemo Schwarz). A
                tight, aligned herd locks grains to a just-intonation scale; a
                scattered cloud detunes into shimmer; a sudden contraction fires
                an onset burst.
              </p>
              <p className="mt-3 text-muted-foreground">
                No WebGPU? A Canvas2D CPU flock with a spatial hash runs the same
                rules and the same audio mapping. Drag an audio file onto the
                canvas to flock your own corpus.
              </p>
            </div>
          )}
        </div>
      )}

      {/* HUD while conducting */}
      {phase === "conducting" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
            {source === "piano" ? (
              <span className="text-violet-300/95">♪ Karel&apos;s piano</span>
            ) : (
              <span className="text-violet-300/95">synth piano (offline)</span>
            )}
            {substrate === "webgpu" ? (
              <span className="text-violet-300">WebGPU compute flock</span>
            ) : (
              <span className="text-violet-300/95">Canvas2D flock (no WebGPU)</span>
            )}
            <span className="text-muted-foreground">{grainCount} grains</span>
          </div>
          <p className="max-w-md text-base text-muted-foreground">
            Move your pointer to conduct. Let go and the flock drifts.
          </p>
          {dropHint && (
            <p className="text-base text-violet-300">Drop to re-flock this audio…</p>
          )}
        </div>
      )}

      {/* persistent corner affordance back to notes while conducting */}
      {phase === "conducting" && (
        <div className="absolute bottom-4 left-4 z-10">
          <Link
            href="/dream"
            className="pointer-events-auto font-mono text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          >
            ← dream lab
          </Link>
        </div>
      )}
    </main>
  );
}
