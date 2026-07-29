"use client";

// ════════════════════════════════════════════════════════════════════════════
// ATLAS (3608) — "What if a recording became a PLACE you could walk through —
// where every grain of its sound sits at a position decided by its timbre, and
// you play the recording by moving through its own timbre-space?"
//
// On load we build a CORPUS: slice an audio buffer into ~46 ms grains, measure
// real spectral descriptors for each (centroid, RMS, pitch/periodicity,
// flatness, spread), and PROJECT every grain to a 2-D position from those
// descriptors — x = brightness, y = pitch. That descriptor→space map IS the
// instrument. Moving the cursor through the glowing GPU point cloud triggers the
// grains nearest it (k-nearest, overlapped Hann windows) — you paint sound by
// location. Drop your own audio file and the same instrument becomes your sound.
//
// References:
//   • Diemo Schwarz — CataRT / corpus-based concatenative synthesis (IRCAM):
//     "the actual instrument is the space of sound characteristics the performer
//     navigates."
//   • TENOR 2023 — "Maps as Scores: Timbre-Space Representations."
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildCorpus,
  downmixToMono,
  mulberry32,
  renderDefaultPhrase,
  type Corpus,
} from "./atlas-corpus";
import { GranularEngine } from "./atlas-audio";
import { PointCloudRenderer } from "./atlas-gl";

type Phase = "building" | "ready" | "glfail";

interface Hud {
  grains: number;
  centroidHz: number;
  pitchHz: number;
  active: number;
}

export default function AtlasPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("building");
  const [control, setControl] = useState<"auto" | "you">("auto");
  const [audioReady, setAudioReady] = useState(false);
  const [source, setSource] = useState("Generated piano phrase");
  const [dropError, setDropError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState<Hud>({ grains: 0, centroidHz: 0, pitchHz: 0, active: 0 });

  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const rendererRef = useRef<PointCloudRenderer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const rafRef = useRef(0);
  const userControlRef = useRef(false);
  const cursorRef = useRef<[number, number]>([0, 0]);
  const startMsRef = useRef(0);
  const tourPhasesRef = useRef<number[]>([]);
  const lastHudRef = useRef(0);

  // ── First real pointer / audio-unlock plumbing ──────────────────────────────
  const resumeAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } else if (ctx) {
      setAudioReady(ctx.state === "running");
    }
  }, []);

  const rebuildFromBuffer = useCallback((buffer: AudioBuffer, label: string) => {
    const mono = downmixToMono(buffer);
    const corpus = buildCorpus(buffer, mono, buffer.sampleRate, label);
    corpusRef.current = corpus;
    engineRef.current?.setCorpus(corpus);
    rendererRef.current?.setCorpus(corpus.positions, corpus.colorT, corpus.loud, corpus.n);
    setSource(label);
    setHud((h) => ({ ...h, grains: corpus.n }));
  }, []);

  // ── Mount: GL, audio, default corpus, render loop, auto-tour ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = PointCloudRenderer.create(canvas);
    if (!renderer) {
      setPhase("glfail");
    } else {
      rendererRef.current = renderer;
      renderer.resize();
    }

    // Audio context + engine (audio still works even if WebGL failed).
    let engine: GranularEngine | null = null;
    try {
      const AC: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      engine = new GranularEngine(ctx);
      engineRef.current = engine;
      void ctx.resume().then(() => setAudioReady(ctx.state === "running"));
    } catch {
      ctxRef.current = null;
    }

    // Seeded auto-tour phase offsets (deterministic wander, no Math.random here).
    const rng = mulberry32(0x3608);
    tourPhasesRef.current = [rng() * 6.283, rng() * 6.283, rng() * 6.283, rng() * 6.283];
    startMsRef.current = performance.now();

    let disposed = false;

    // Build the default corpus off the main paint, then wire it in.
    const ctxForRender = ctxRef.current;
    const sampleRate = ctxForRender?.sampleRate ?? 44100;
    renderDefaultPhrase(sampleRate)
      .then((buffer) => {
        if (disposed) return;
        rebuildFromBuffer(buffer, "Generated piano phrase");
        setPhase((p) => (p === "glfail" ? p : "ready"));
      })
      .catch(() => {
        if (!disposed) setPhase((p) => (p === "glfail" ? p : "ready"));
      });

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);

    // Any first interaction unlocks audio (autoplay policy).
    const unlock = () => resumeAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const loop = () => {
      const tSec = (performance.now() - startMsRef.current) / 1000;

      // Cursor: seeded lissajous auto-tour until the visitor takes over.
      if (!userControlRef.current) {
        const [p0, p1, p2, p3] = tourPhasesRef.current;
        const x = 0.72 * Math.sin(tSec * 0.17 + p0) * Math.cos(tSec * 0.061 + p1);
        const y = 0.72 * Math.sin(tSec * 0.13 + p2) * Math.cos(tSec * 0.043 + p3);
        cursorRef.current = [x, y];
      }
      const [cx, cy] = cursorRef.current;

      const engineNow = engineRef.current;
      if (engineNow) {
        engineNow.setCursor(cx, cy);
        engineNow.tick();
      }
      const active = engineNow ? engineNow.hud().active : 0;
      rendererRef.current?.render(cx, cy, active, tSec);

      const nowMs = performance.now();
      if (engineNow && nowMs - lastHudRef.current > 120) {
        lastHudRef.current = nowMs;
        const h = engineNow.hud();
        setHud({
          grains: corpusRef.current?.n ?? 0,
          centroidHz: h.centroidHz,
          pitchHz: h.pitchHz,
          active: h.active,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      engineRef.current?.dispose();
      rendererRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, [rebuildFromBuffer, resumeAudio]);

  // ── Pointer navigation over the atlas ────────────────────────────────────────
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const renderer = rendererRef.current;
      const canvas = canvasRef.current;
      if (!renderer || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const [ax, ay] = renderer.screenToAtlas(e.clientX - rect.left, e.clientY - rect.top, rect);
      cursorRef.current = [Math.max(-1, Math.min(1, ax)), Math.max(-1, Math.min(1, ay))];
      if (!userControlRef.current) {
        userControlRef.current = true;
        setControl("you");
      }
      resumeAudio();
    },
    [resumeAudio],
  );

  // ── Drop your own sound ──────────────────────────────────────────────────────
  const decodeFile = useCallback(
    async (file: File) => {
      setDropError(null);
      const ctx = ctxRef.current;
      if (!ctx) {
        setDropError("Audio engine unavailable — cannot decode a file here.");
        return;
      }
      try {
        const arr = await file.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arr.slice(0));
        // Let the "rebuilding" overlay paint before the synchronous, CPU-heavy
        // slice + analyze pass (large files can take a couple of seconds).
        setRebuilding(true);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        rebuildFromBuffer(buffer, file.name);
        resumeAudio();
      } catch {
        setDropError(`Could not decode "${file.name}". Keeping the current atlas.`);
      } finally {
        setRebuilding(false);
      }
    },
    [rebuildFromBuffer, resumeAudio],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void decodeFile(file);
    },
    [decodeFile],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void decodeFile(file);
      e.target.value = "";
    },
    [decodeFile],
  );

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Title + one-line description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex flex-col gap-1 p-5">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          A navigable timbre atlas
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Atlas</h1>
        <p className="max-w-sm text-base text-muted-foreground">
          Every grain of a recording placed by its timbre. Move through the cloud to
          play the sound that lives there.
        </p>
      </div>

      {/* AUTO → YOU badge */}
      <div className="pointer-events-none absolute right-5 top-20 z-10 flex items-center gap-2 sm:top-5 sm:right-40">
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            control === "auto" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          auto
        </span>
        <span className="font-mono text-xs text-muted-foreground">→</span>
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] ${
            control === "you" ? "text-primary" : "text-muted-foreground"
          }`}
        >
          you
        </span>
      </div>

      {/* Design notes trigger */}
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute right-5 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {/* Bottom-left HUD readouts */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-1.5 font-mono text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">corpus</span>
          <span className="text-foreground">{hud.grains} grains</span>
          <span className="max-w-[40vw] truncate text-muted-foreground">· {source}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.14em]">under cursor</span>
          <span className="text-foreground">{Math.round(hud.centroidHz)} Hz bright</span>
          <span className="text-foreground">{Math.round(hud.pitchHz)} Hz pitch</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.14em]">voice</span>
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${Math.round(hud.active * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom-right: drop-your-own + status */}
      <div className="absolute bottom-5 right-5 z-10 flex flex-col items-end gap-2">
        {!audioReady && phase !== "glfail" && (
          <button
            type="button"
            onClick={resumeAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tap for sound
          </button>
        )}
        <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          Drop your own audio
          <input type="file" accept="audio/*" onChange={onFileInput} className="hidden" />
        </label>
        {dropError && <p className="max-w-xs text-right text-sm text-destructive">{dropError}</p>}
      </div>

      {/* Building overlay */}
      {phase === "building" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            building the atlas — slicing + analyzing grains…
          </p>
        </div>
      )}

      {/* WebGL2 failure — audio still plays */}
      {phase === "glfail" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 p-6 text-center backdrop-blur-sm">
          <div className="max-w-md">
            <p className="text-base text-destructive">
              WebGL2 is unavailable here, so the point cloud can&apos;t render.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              The instrument still sounds — the auto-tour is navigating the timbre-space
              and triggering grains. Drop an audio file to hear it become your sound.
            </p>
          </div>
        </div>
      )}

      {/* Rebuilding-from-dropped-file overlay */}
      {rebuilding && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            rebuilding the atlas from your sound…
          </p>
        </div>
      )}

      {/* Drag-over hint */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            drop to rebuild the atlas from your sound
          </p>
        </div>
      )}

      {/* Design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Atlas — a recording as a place</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                On load the piece slices an audio buffer into ~46 ms grains and measures
                real spectral descriptors for each one — spectral centroid (brightness),
                RMS loudness, a pitch/periodicity estimate by autocorrelation, plus
                spectral flatness and spread. Every grain is then projected to a point
                whose x is its brightness and y is its pitch. That descriptor→space map is
                the instrument.
              </p>
              <p>
                You play by moving. The cursor continuously finds the grains nearest it in
                timbre-space and triggers them, overlapping short raised-cosine (Hann)
                windows into smooth granular texture. Linger over the bright region for
                shimmer; dive into the low, dense region for a warm drone. Drop your own
                audio file and the same instrument is rebuilt from your material.
              </p>
              <p>
                With no input a seeded auto-tour wanders the cloud so the texture evolves
                on its own; your first move hands over control (auto → you).
              </p>
              <p>
                After Diemo Schwarz&apos;s CataRT / corpus-based concatenative synthesis
                (IRCAM) — &quot;the actual instrument is the space of sound characteristics
                the performer navigates&quot; — and TENOR 2023, &quot;Maps as Scores:
                Timbre-Space Representations.&quot;
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
