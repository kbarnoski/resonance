"use client";

// 2100-veil-cathedral — "Veil Cathedral".
//
// What if your own piano recording became a vast breathing cathedral of light
// you drift through? A seeded generative ambient-piano carrier self-plays so the
// piece is always alive; drop your own track and it takes over. FFT bands sculpt
// a ~44k-point toroidal nave of light that a slow autonomous camera travels
// through — bass swells the volume, mids shimmer the shells, highs sparkle the
// aura. Cosmic-ambient, luminous, inhabited.
//
// Inspired by Refik Anadol's DATALAND (The Grand LA, 2026). See README.md.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { VeilAudio, type Bands } from "./audio";
import { createVeilScene, type VeilScene } from "./scene";

type Phase = "intro" | "running" | "nowebgl" | "noaudio" | "error";

const DESIGN_NOTES = [
  "The one question: what if your own piano recording became a vast breathing cathedral of light you drift through — the music's spectrum sculpting a volumetric field of luminous points in real time?",
  "Sound is real. A deterministic, seeded generative carrier plays soft-attack / long-release piano-ish voices over a detuned drone bed, so the piece self-demos with zero input. Drop an audio file (ideally solo piano or ambient) and it is decoded with decodeAudioData, cross-ducked in, and routed through the SAME analyser — so a dropped track drives the geometry directly.",
  "Visuals are a single ~44,000-point three.js cloud arranged as a toroidal nave: nested cylindrical shells of light with repeated vertical ribs (the vaulting) and a soft outer aura. A slow deterministic camera travels AROUND the ring — i.e. through the tube — so you inhabit the space rather than orbit it. The nave loops, so travel is endless with no teleport.",
  "What drives what: an AnalyserNode's FFT is split into three bands. Bass → the deep volume swell (the whole field breathes outward). Mid → mid-shell shimmer. High → the sparkle aura. The breathing is done on the GPU in a vertex shader; additive point-sprites give the luminous 'inhaled light' look.",
  "Safety: global brightness is slew-limited so even a loud bass transient can never flash the field — all luminance change stays well under 3 Hz. prefers-reduced-motion slows the camera and thins the cloud.",
  "Palette: deep indigo/violet void with warm light blooms. Determinism: a fixed-seed mulberry32 lays out every point and the carrier's note order, so it renders identically headless. Influences: Refik Anadol's DATALAND (2026), plus the volumetric point-cloud lineage of Marpi and Android Jones.",
];

export default function VeilCathedralPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showNotes, setShowNotes] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pointCount, setPointCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VeilScene | null>(null);
  const audioRef = useRef<VeilAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const reducedRef = useRef(false);

  // Reduced-motion preference (SSR-safe; read on mount).
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const on = () => {
        reducedRef.current = mq.matches;
      };
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.dispose();
    audioRef.current = null;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
  }, []);

  const runLoop = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runLoop);
    const scene = sceneRef.current;
    const audio = audioRef.current;
    if (!scene || !audio) return;

    const last = lastTsRef.current || ts;
    const dt = (ts - last) / 1000;
    lastTsRef.current = ts;

    audio.schedule();
    const bands: Bands = audio.getBands();
    scene.render(dt, bands, reducedRef.current);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running") return;

    // 1. WebGL scene.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createVeilScene(canvas, reducedRef.current);
    if (!scene) {
      setPhase("nowebgl");
      return;
    }
    sceneRef.current = scene;
    setPointCount(scene.pointCount);

    const wrap = wrapRef.current;
    if (wrap) scene.resize(wrap.clientWidth, wrap.clientHeight);

    // 2. Audio (inside the gesture).
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setPhase("noaudio");
        scene.dispose();
        sceneRef.current = null;
        return;
      }
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const audio = new VeilAudio(ctx);
      audio.start();
      audioRef.current = audio;
    } catch {
      setPhase("error");
      return;
    }

    setPhase("running");
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(runLoop);
  }, [phase, runLoop]);

  // Resize handling.
  useEffect(() => {
    const onResize = () => {
      const wrap = wrapRef.current;
      const scene = sceneRef.current;
      if (wrap && scene) scene.resize(wrap.clientWidth, wrap.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Full teardown on unmount.
  useEffect(() => () => teardown(), [teardown]);

  const loadFile = useCallback(async (file: File) => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const data = await file.arrayBuffer();
      await audio.playFile(data);
      setFileName(file.name);
    } catch {
      setFileName(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (phase !== "running") return;
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith("audio")) loadFile(file);
    },
    [phase, loadFile],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      e.target.value = "";
    },
    [loadFile],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <Link
          href="/dream"
          className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← back to the dream lab
        </Link>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2100 · Veil Cathedral
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Drift through a breathing cathedral of light
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Your music becomes a vast volumetric nave of luminous points. A slow
          camera travels through nested shells and vaulted ribs of light while
          the spectrum sculpts the space in real time — bass swells the volume,
          mids shimmer the walls, highs sparkle the aura. It self-plays a seeded
          ambient-piano carrier; drop your own track to inhabit it.
        </p>
      </header>

      <div
        ref={wrapRef}
        className={`relative overflow-hidden rounded-lg border bg-black ${
          dragOver ? "border-primary" : "border-border"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (phase === "running") setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ aspectRatio: "16 / 10" }}
        />

        {phase !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 p-6 text-center backdrop-blur-sm">
            {phase === "nowebgl" ? (
              <p className="max-w-md text-base leading-relaxed text-destructive">
                This browser or device could not start WebGL, and the luminous
                point-field is the piece. Try a WebGL-capable browser.
              </p>
            ) : phase === "noaudio" ? (
              <p className="max-w-md text-base leading-relaxed text-destructive">
                The Web Audio API is unavailable here, so there is no sound to
                sculpt the cathedral. Try a current browser.
              </p>
            ) : (
              <>
                <button
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {phase === "error" ? "Try again" : "Begin — enter the cathedral"}
                </button>
                <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
                  Sound on, ideally in a dark room. It self-plays a seeded
                  ambient carrier; once inside, drop an audio file to let your
                  own track drive the light.
                </p>
                {phase === "error" && (
                  <p className="max-w-md text-base leading-relaxed text-destructive">
                    Something interrupted startup. Give it another try.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {phase === "running" && dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
            <p className="text-base font-medium text-foreground">
              Release to let this track sculpt the cathedral
            </p>
          </div>
        )}
      </div>

      {/* Live readout + controls. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Source: {phase === "running" ? (fileName ? "your file" : "seeded carrier") : "—"}
        </span>
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Points: {pointCount.toLocaleString()}
          </span>
        )}
        {fileName && (
          <span className="max-w-xs truncate font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {fileName}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {phase === "running" && (
          <label className="min-h-[44px] cursor-pointer rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Drop or choose an audio file
            <input type="file" accept="audio/*" onChange={onPick} className="hidden" />
          </label>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] w-fit rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            {DESIGN_NOTES.map((para, i) => (
              <p
                key={i}
                className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0"
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
