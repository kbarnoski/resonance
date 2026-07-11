"use client";

// 583-piano-mosaic-field
//
// "What if you could reach INTO Karel's recorded piano and re-voice it —
//  painting with his own timbre in real time?"
//
// A concatenative-musaicing / corpus-based-resynthesis instrument. Karel's real
// solo-piano recording is decomposed into a corpus of short Hann-windowed grains;
// each grain is placed in a 2-D timbre field by its spectral centroid (X =
// brightness) and dominant pitch (Y = register). Drag the luminous probe and the
// engine continuously SELECTS his closest-matching grains and overlaps them into
// a warm continuous cloud of his own sound (CataRT-style target-driven grain
// selection — not random scatter). The field breathes while idle and a slow
// Lissajous auto-demo plays until you take over.
//
// INPUT: audio-file (Karel's piano) + pointer/touch drag.
// OUTPUT: WebGPU-capable particle field → WebGL2 → Canvas2D. Not three.js, not SVG.
// TECHNIQUE: concatenative musaicing / corpus-based grain matching.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildCorpus, type AudioSourceKind, type Corpus } from "./audio";
import { makeMosaicEngine, type MosaicEngine } from "./mosaic";
import {
  makeFieldRenderer,
  type FieldRenderer,
  type FieldPoint,
} from "./gl";

type Phase = "idle" | "loading" | "running" | "error";

export default function PianoMosaicField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const engineRef = useRef<MosaicEngine | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  // Cursor target in field space (0..1). Held in a ref so the rAF loop reads
  // the freshest value without re-subscribing.
  const targetRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.55 });
  const draggingRef = useRef<boolean>(false);
  const lastInteractRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [grainCount, setGrainCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Pointer handling on the canvas → updates the field target.
  const updateFromEvent = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    targetRef.current = {
      x: Math.min(1, Math.max(0, x)),
      // invert: top of screen = high register
      y: Math.min(1, Math.max(0, 1 - y)),
    };
    lastInteractRef.current = performance.now();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      canvas.setPointerCapture?.(e.pointerId);
      updateFromEvent(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      updateFromEvent(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture?.(e.pointerId);
      } catch {
        /* noop */
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateFromEvent]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        engineRef.current?.stop();
      } catch {
        /* noop */
      }
      try {
        rendererRef.current?.dispose();
      } catch {
        /* noop */
      }
      const ctx = ctxRef.current;
      if (ctx) void ctx.close();
    };
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "running") return;
    setPhase("loading");
    setErrMsg("");
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      // Unlock on the user gesture.
      await ctx.resume();

      const corpus = await buildCorpus(ctx);
      corpusRef.current = corpus;
      setSource(corpus.kind);
      setGrainCount(corpus.grains.length);

      // Build the renderer point cloud (same order as grains → flare indices align).
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("no canvas");
      const points: FieldPoint[] = corpus.grains.map((g) => ({
        x: g.brightness,
        y: g.pitch,
        loud: g.loudness,
      }));
      const renderer = makeFieldRenderer(canvas, points);
      if (!renderer) throw new Error("no renderer backend available");
      rendererRef.current = renderer;
      setBackend(renderer.backend);
      renderer.resize();

      // Mosaic engine drives the audio.
      const engine = makeMosaicEngine(ctx, corpus);
      engineRef.current = engine;
      engine.setGain(0.9);

      setPhase("running");

      const t0 = performance.now();
      const loop = () => {
        const now = performance.now();
        const t = (now - t0) / 1000;

        // Auto-demo Lissajous drift until the visitor interacts (idle > 2.5s).
        const idleFor = now - lastInteractRef.current;
        let tx = targetRef.current.x;
        let ty = targetRef.current.y;
        if (idleFor > 2500 || lastInteractRef.current === 0) {
          tx = 0.5 + 0.34 * Math.sin(t * 0.23);
          ty = 0.52 + 0.32 * Math.sin(t * 0.31 + 1.1);
        }

        engineRef.current?.setTarget(tx, ty);

        const actives = engineRef.current?.active() ?? [];
        const flares = actives.map((a) => ({ index: a.grainIndex, amp: a.amp }));
        const level = Math.min(
          1,
          actives.reduce((s, a) => s + a.amp, 0) / 4,
        );

        rendererRef.current?.render({
          cursorX: tx,
          cursorY: ty,
          flares,
          time: t,
          level,
        });

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "failed to start");
      setPhase("error");
    }
  }, []);

  const running = phase === "running";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#08060d] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: running ? "crosshair" : "default" }}
      />

      {/* Field axis hints (only while running) */}
      {running && (
        <>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-sm text-muted-foreground">
            ← darker · brightness · brighter →
          </div>
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 -rotate-90 font-mono text-sm text-muted-foreground">
            ↑ higher register
          </div>
        </>
      )}

      {/* Header / intro overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6 sm:p-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Piano Mosaic Field
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Reach into Karel&apos;s recorded piano and re-voice it. His
            performance is shattered into thousands of tiny grains laid out by
            timbre; drag the warm probe and the instrument answers with his own
            closest-matching sound — concatenative musaicing in real time.
          </p>

          <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-3">
            {!running && (
              <button
                type="button"
                onClick={start}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400 disabled:opacity-60"
              >
                {phase === "loading" ? "Building corpus…" : "Start"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="pointer-events-auto min-h-[44px] rounded-full border border-border px-5 py-2.5 text-base text-muted-foreground transition hover:border-border hover:text-foreground"
            >
              Design notes
            </button>

            {source && (
              <span
                className={
                  "rounded-full px-3 py-1.5 font-mono text-sm " +
                  (source === "piano"
                    ? "bg-violet-500/15 text-violet-300/95"
                    : "bg-violet-500/15 text-violet-300/95")
                }
              >
                {source === "piano" ? "Karel's piano" : "synthesized fallback"}
              </span>
            )}
            {running && backend && (
              <span className="rounded-full bg-muted px-3 py-1.5 font-mono text-sm text-muted-foreground">
                {backend} · {grainCount} grains
              </span>
            )}
          </div>

          {phase === "error" && (
            <p className="mt-4 text-base text-violet-300">
              Couldn&apos;t start: {errMsg}. Try reloading.
            </p>
          )}
        </div>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto border-t border-border bg-[#0b0814]/95 p-6 backdrop-blur sm:p-8">
          <div className="mx-auto max-w-2xl space-y-3 text-base leading-relaxed text-muted-foreground">
            <h2 className="font-serif text-2xl text-foreground">Design notes</h2>
            <p>
              Karel&apos;s solo piano is decoded client-side and sliced into
              overlapping <span className="text-foreground">~120ms Hann grains</span>.
              For each grain we precompute a spectral centroid (brightness),
              RMS loudness, and a crude dominant pitch (FFT peak with parabolic
              refinement). Those features place every grain in the 2-D field you
              see — X is brightness, Y is register.
            </p>
            <p>
              As you drag, a CataRT-style matcher continuously scores the whole
              corpus by weighted distance to your cursor (plus a small loudness
              preference and a repeat penalty), launches the best grain on a
              steady tick, and overlaps ~4–8 of them through Hann envelopes so
              the stream glides and never clicks. Everything runs through a
              limiter so it can&apos;t clip. The position MEANS a timbre, and his
              corpus answers with its closest grains — not random scatter.
            </p>
            <p className="text-muted-foreground">
              References: Diemo Schwarz, CataRT real-time corpus-based
              concatenative synthesis (2006); Tralie &amp; Berger, “The
              Concatenator” (arXiv:2411.04366, 2024) and MACataRT
              (arXiv:2502.00023, 2026); Curtis Roads, <em>Microsound</em>.
              Rendering degrades WebGPU&nbsp;→ WebGL2&nbsp;→ Canvas2D; audio
              degrades from Karel&apos;s recording to a synthesized solo-piano
              fallback so it always sounds and always has a corpus.
            </p>
            <Link
              href="/dream"
              className="inline-block pt-2 font-mono text-sm text-violet-300 hover:text-violet-200"
            >
              ← back to the dream lab
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
