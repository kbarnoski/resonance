"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7800-strikefield — "What if you could HEAR where a sound is struck — the way
// an impact's timbre depends on WHERE on the object it lands?"
//
// Acoustic-transfer modal synthesis. A rectangular resonant plate is rendered as
// a live Chladni standing-wave field (Canvas2D). An autonomous rain of mallets
// strikes it at varying positions and forces, and because each mode is excited
// in proportion to its shape amplitude φ_{m,n}(sx,sy) at the contact point, the
// timbre changes with WHERE the strike lands — audibly and visibly. Drop an
// audio file and its onsets play the plate instead of the rain.
//
// Subsystems: modal-resonator DSP bank (modal.ts) · Chladni mode-shape visual
// (plate.ts) · offline onset analysis of dropped audio (onset.ts) · a seeded
// autonomous mallet scheduler (below).
//
// Refs: NeuroSonic — Zhao et al., "Instant Neural Impact Sound Synthesis with
// Learned Acoustic Transfer", Computer Animation & Virtual Worlds (July 2026).
// van den Doel & Pai, "The sounds of physical shapes", Presence (1998).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ModalEngine, buildModes, mulberry32 } from "./modal";
import { PlateRenderer, type StrikeBloom } from "./plate";
import { detectOnsets, onsetToStrike, type Onset } from "./onset";

type Source = "rain" | "file";

export default function StrikefieldPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ModalEngine | null>(null);
  const rendererRef = useRef<PlateRenderer | null>(null);
  const rafRef = useRef<number>(0);

  const [needsGesture, setNeedsGesture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastStrike, setLastStrike] = useState<{
    sx: number;
    sy: number;
    force: number;
  } | null>(null);

  // ── mutable refs the rAF loop reads without re-subscribing ──
  const bloomsRef = useRef<StrikeBloom[]>([]);
  const lastTsRef = useRef<number>(0);
  const audioStartRef = useRef<number>(0);
  const calmRef = useRef<number>(0);

  // autonomous scheduler state
  const rngRef = useRef<() => number>(mulberry32(0x7800));
  const nextRainRef = useRef<number>(0); // performance.now ms of next rain strike
  const sourceRef = useRef<Source>("rain");

  // file-onset transport
  const onsetsRef = useRef<Onset[]>([]);
  const fileStartRef = useRef<number>(0);
  const onsetIdxRef = useRef<number>(0);
  const fileDurRef = useRef<number>(0);

  const doStrike = useCallback(
    (sx: number, sy: number, force: number, now: number) => {
      engineRef.current?.strike(sx, sy, force);
      const blooms = bloomsRef.current;
      blooms.push({ sx, sy, force, born: now });
      if (blooms.length > 24) blooms.shift();
      setLastStrike({ sx, sy, force });
    },
    [],
  );

  // ── main loop ──────────────────────────────────────────────────────────────
  const frame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (!renderer) return;

      const prev = lastTsRef.current || ts;
      let dt = (ts - prev) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.1) dt = 0.1; // clamp after tab-away

      const calm = calmRef.current;

      // ---- autonomous driver ----
      if (sourceRef.current === "rain") {
        // slow the mallet rain heavily under reduced motion
        if (ts >= nextRainRef.current) {
          const r = rngRef.current;
          const sx = 0.1 + r() * 0.8;
          const sy = 0.12 + r() * 0.76;
          const force = 0.35 + r() * 0.75;
          doStrike(sx, sy, force, ts);
          const base = 380 + r() * 900; // 0.38–1.28 s between drops
          nextRainRef.current = ts + base * (1 + 3.5 * calm);
        }
      } else {
        // ---- file transport: fire onsets in time, looping the piece ----
        const onsets = onsetsRef.current;
        if (onsets.length > 0) {
          const elapsed = (ts - fileStartRef.current) / 1000;
          while (
            onsetIdxRef.current < onsets.length &&
            onsets[onsetIdxRef.current].t <= elapsed
          ) {
            const idx = onsetIdxRef.current;
            const o = onsets[idx];
            const s = onsetToStrike(o, idx);
            doStrike(s.sx, s.sy, s.force, ts);
            onsetIdxRef.current++;
          }
          if (elapsed > fileDurRef.current + 1.2) {
            // loop
            fileStartRef.current = ts;
            onsetIdxRef.current = 0;
          }
        }
      }

      // advance the DSP envelopes
      engine?.integrate(dt);

      // render
      const audioTime = engine
        ? engine.ctx.currentTime - audioStartRef.current
        : ts / 1000;
      renderer.draw(engine?.amps ?? EMPTY, audioTime, bloomsRef.current, ts, calm);
    },
    [doStrike],
  );

  // ── setup / teardown ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // reduced motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMq = () => {
      calmRef.current = mq.matches ? 1 : 0;
    };
    applyMq();
    mq.addEventListener("change", applyMq);

    // engine (audio) — may start suspended until a gesture
    let engine: ModalEngine | null = null;
    try {
      engine = new ModalEngine();
      engineRef.current = engine;
    } catch {
      setError("Web Audio is unavailable in this browser.");
    }

    // renderer (visual) — always runs, even with no/blocked audio
    let renderer: PlateRenderer | null = null;
    try {
      const modes = engine ? engine.modes : buildModes();
      renderer = new PlateRenderer(canvas, modes);
      rendererRef.current = renderer;
    } catch {
      setError("Canvas 2D is unavailable in this browser.");
      return;
    }

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent || !renderer) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.resize(rect.width, rect.height, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // try to start audio; if blocked, surface the tap-to-begin affordance
    const tryStart = async () => {
      if (!engine) return;
      try {
        await engine.start();
        audioStartRef.current = engine.ctx.currentTime;
        setNeedsGesture(engine.suspended);
      } catch {
        setNeedsGesture(true);
      }
    };
    void tryStart().then(() => {
      if (engine && engine.suspended) setNeedsGesture(true);
    });

    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      mq.removeEventListener("change", applyMq);
      engineRef.current?.dispose();
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, [frame]);

  // ── gesture unlock ──
  const handleBegin = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.start();
      audioStartRef.current = engine.ctx.currentTime;
      setNeedsGesture(engine.suspended);
    } catch {
      setError("Could not start audio.");
    }
  }, []);

  // ── file drop / picker ──
  const loadFile = useCallback(async (file: File) => {
    const engine = engineRef.current;
    if (!engine) return;
    setError(null);
    try {
      await engine.start(); // a drop is a gesture — unlock audio
      audioStartRef.current = engine.ctx.currentTime;
      setNeedsGesture(false);
      const buf = await file.arrayBuffer();
      const decoded = await engine.ctx.decodeAudioData(buf.slice(0));
      const onsets = detectOnsets(decoded);
      if (onsets.length < 2) {
        setError("No clear onsets found — keeping the mallet rain.");
        return;
      }
      onsetsRef.current = onsets;
      fileDurRef.current = decoded.duration;
      fileStartRef.current = performance.now();
      onsetIdxRef.current = 0;
      sourceRef.current = "file";
      setFileName(file.name);
    } catch {
      setError("Could not decode that audio file — keeping the mallet rain.");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void loadFile(f);
    },
    [loadFile],
  );

  const backToRain = useCallback(() => {
    sourceRef.current = "rain";
    setFileName(null);
    nextRainRef.current = performance.now();
  }, []);

  // secondary affordance: click the plate to strike where you point
  const onCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const engine = engineRef.current;
      if (engine) void engine.start();
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const sy = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      doStrike(sx, sy, 0.9, performance.now());
    },
    [doStrike],
  );

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      {/* header */}
      <header className="px-5 pt-6 pb-3 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 7800 · strikefield
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Strikefield — hear where it&rsquo;s struck
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          A resonant plate played by acoustic-transfer modal synthesis. Each
          mallet excites every mode in proportion to that mode&rsquo;s shape at
          the contact point, so <em>where</em> the strike lands changes the
          timbre — you can hear it move and watch the Chladni mode pattern
          reshape.
        </p>
      </header>

      {/* plate canvas */}
      <div
        className="relative mx-4 mb-4 overflow-hidden rounded-lg border border-border sm:mx-8"
        style={{ height: "min(64vh, 640px)" }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onCanvasPointer}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ background: "#05030a" }}
        />

        {/* drag overlay */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-primary/60 bg-background/70">
            <p className="text-base font-medium text-primary">
              Drop audio to play the plate with its onsets
            </p>
          </div>
        )}

        {/* tap-to-begin */}
        {needsGesture && !error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/55 px-6 text-center backdrop-blur-sm">
            <p className="max-w-md text-base text-muted-foreground">
              The plate is already ringing on screen. Tap to let it sound.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Tap to begin
            </button>
          </div>
        )}

        {/* live strike readout (silent-screen legibility) */}
        {lastStrike && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-background/50 px-2.5 py-1.5 backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              strike x {lastStrike.sx.toFixed(2)} · y{" "}
              {lastStrike.sy.toFixed(2)} · f {lastStrike.force.toFixed(2)}
            </p>
          </div>
        )}

        {/* source badge */}
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md bg-background/50 px-2.5 py-1.5 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {fileName ? `onsets · ${truncate(fileName)}` : "autonomous rain"}
          </p>
        </div>
      </div>

      {/* controls */}
      <section className="mx-4 mb-24 flex flex-col gap-4 sm:mx-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent inline-flex items-center">
            Drop or choose an audio file
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
              }}
            />
          </label>
          {fileName && (
            <button
              onClick={backToRain}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Back to the mallet rain
            </button>
          )}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md px-4 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}

        {showNotes && (
          <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-background/60 p-5 text-base text-muted-foreground">
            <p>
              <span className="text-foreground">The question.</span> Real
              percussion timbre depends on strike position — hit a plate at the
              centre versus the edge and the modal mix changes. You excite each
              vibrational mode in proportion to that mode&rsquo;s shape amplitude
              at the contact point; strike a node and that mode stays silent.
            </p>
            <p>
              <span className="text-foreground">The math.</span> The plate&rsquo;s
              modes (m,n) have shapes{" "}
              <span className="font-mono text-sm text-foreground">
                sin(mπx/Lx)·sin(nπy/Ly)
              </span>{" "}
              and frequencies on the 2D grid{" "}
              <span className="font-mono text-sm text-foreground">
                f(m,n) ∝ √((m/Lx)²+(n/Ly)²)
              </span>
              . A strike at (sx,sy) adds energy{" "}
              <span className="font-mono text-sm text-foreground">
                |sin(mπ·sx)·sin(nπ·sy)|
              </span>{" "}
              to each mode — the <em>acoustic transfer</em>. Twenty resonators
              (one oscillator per mode, JS-integrated exponential decay) turn
              those weights into a decaying inharmonic ring.
            </p>
            <p>
              <span className="text-foreground">Playing itself / your file.</span>{" "}
              A seeded mallet rain strikes the plate at varying positions and
              forces so it is alive with zero input. Drop an audio file and an
              offline energy-flux onset detector maps each attack&rsquo;s
              brightness and loudness to a strike position and force — so your
              music performs the plate.
            </p>
            <p>
              <span className="text-foreground">References.</span> NeuroSonic —
              Zhao et al., &ldquo;Instant Neural Impact Sound Synthesis with
              Learned Acoustic Transfer,&rdquo; <em>Computer Animation &amp;
              Virtual Worlds</em> (July 2026). van den Doel &amp; Pai, &ldquo;The
              sounds of physical shapes,&rdquo; <em>Presence</em> (1998). Full
              write-up in this prototype&rsquo;s README.md.
            </p>
          </div>
        )}
      </section>

      <PrototypeNav slugs={["7800-strikefield"]} />
    </main>
  );
}

const EMPTY = new Float32Array(0);

function truncate(s: string): string {
  return s.length > 22 ? s.slice(0, 20) + "…" : s;
}
