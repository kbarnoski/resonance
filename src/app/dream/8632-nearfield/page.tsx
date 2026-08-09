"use client";

// ════════════════════════════════════════════════════════════════════════════
// Nearfield (8632) — "What if restoring a sound were the instrument you play?"
//
// A seeded piano/bell loop arrives CRUSHED — band-limited, muffled, thin, and
// distant, like a piano heard through a wall. You HUM / WHISTLE / PLAY into the
// mic and your loudness is the "lean-in" control: the louder and more sustained
// you are, the more the veiled loop is drawn NEAR — filters open, a harmonic
// exciter synthesizes the missing highs, a subharmonic oscillator restores the
// body, the room pulls from wet/distant to dry/present, and the spectral
// waterfall behind a dark gauze veil PARTS and fills with warm colour.
//
// Restoration is rule-based DSP (see audio.ts) — NO machine learning.
//
// Muted-phone legibility: on load, before any AudioContext exists, a seeded
// auto-demo (d cycling 0→1→0 over ~10s) animates the veil parting + spectrum
// filling using a synthetic spectrogram, so the idea reads with zero sound.
// Real audio starts only after the "Begin" gesture. All randomness is
// mulberry32(0x8632); timing is performance.now().
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  VeilEngine,
  getAudioContextCtor,
  makeColumnFromAnalyser,
  makeDemoColumn,
  mulberry32,
  SPECTRO_BINS,
} from "./audio";
import {
  createVeilRenderer,
  createVeilRenderer2D,
  type VeilRenderer,
} from "./gl";

const DEMO_PERIOD = 10; // seconds for one far→near→far cycle
type Phase = "demo" | "live";
type MicMode = "none" | "mic" | "nomic";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function NearfieldPage() {
  const [phase, setPhase] = useState<Phase>("demo");
  const [micMode, setMicMode] = useState<MicMode>("none");
  const [audioSupported, setAudioSupported] = useState(true);
  const [webglOK, setWebglOK] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [depthUI, setDepthUI] = useState(0);
  const [starting, setStarting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<VeilRenderer | null>(null);
  const engineRef = useRef<VeilEngine | null>(null);
  const rafRef = useRef<number | null>(null);

  const phaseRef = useRef<Phase>("demo");
  const micModeRef = useRef<MicMode>("none");
  const depthRef = useRef(0);
  const micSmoothRef = useRef(0);
  const pointerDepthRef = useRef(0.5);
  const draggingRef = useRef(false);
  const reducedRef = useRef(false);
  const startMsRef = useRef(0);
  const lastUIRef = useRef(0);

  const columnRef = useRef<Uint8Array>(new Uint8Array(SPECTRO_BINS));
  const freqBufRef = useRef<Uint8Array | null>(null);
  const demoGrainRef = useRef<Float32Array>(new Float32Array(SPECTRO_BINS));

  // Seeded per-bin grain for the muted demo spectrogram.
  useEffect(() => {
    const rand = mulberry32(0x8632);
    const g = demoGrainRef.current;
    for (let i = 0; i < g.length; i++) g[i] = rand();
  }, []);

  // The animation frame — runs continuously from mount (demo → live).
  const runFrame = useCallback(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const now = performance.now();
    const t = (now - startMsRef.current) / 1000;
    const col = columnRef.current;
    const engine = engineRef.current;

    // ── depth d ──
    let d: number;
    if (phaseRef.current === "demo") {
      d = (1 - Math.cos((2 * Math.PI * t) / DEMO_PERIOD)) / 2;
    } else if (micModeRef.current === "mic" && engine) {
      const lvl = engine.micLevel() ?? 0;
      micSmoothRef.current = micSmoothRef.current * 0.8 + lvl * 0.2;
      const target = clamp01(micSmoothRef.current);
      const cur = depthRef.current;
      // lean-in blooms quickly; silence re-veils slowly
      const k = target > cur ? 0.08 : 0.012;
      d = cur + (target - cur) * k;
    } else {
      // no-mic fallback: slow breathing, pointer-drag override
      const breath = 0.15 + 0.35 * ((1 - Math.cos((2 * Math.PI * t) / 14)) / 2);
      const target = draggingRef.current ? pointerDepthRef.current : breath;
      d = depthRef.current + (target - depthRef.current) * 0.06;
    }
    d = clamp01(d);
    depthRef.current = d;

    // ── audio ──
    if (engine) engine.update(d);

    // ── spectrogram column ──
    if (phaseRef.current === "live" && engine) {
      let fb = freqBufRef.current;
      if (!fb || fb.length !== engine.analyser.frequencyBinCount) {
        fb = new Uint8Array(engine.analyser.frequencyBinCount);
        freqBufRef.current = fb;
      }
      makeColumnFromAnalyser(engine.analyser, fb, col);
    } else {
      makeDemoColumn(t, d, col, (i) => demoGrainRef.current[i]);
    }

    renderer.render(col, d, now, reducedRef.current);

    // throttle the numeric readout (~8fps)
    if (now - lastUIRef.current > 120) {
      lastUIRef.current = now;
      setDepthUI(d);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // Mount: build renderer, size it, start the demo loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer = createVeilRenderer(canvas);
    if (!renderer) {
      setWebglOK(false);
      renderer = createVeilRenderer2D(canvas);
    }
    rendererRef.current = renderer;

    const parent = canvas.parentElement;
    const resize = () => {
      const r = rendererRef.current;
      if (!r || !parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      r.resize(parent.clientWidth, parent.clientHeight, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (parent) ro.observe(parent);

    startMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      rendererRef.current?.dispose();
      rendererRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [runFrame]);

  // Pointer drag (meaningful only in the no-mic fallback).
  const applyPointer = useCallback((clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const yn = (clientY - rect.top) / rect.height;
    pointerDepthRef.current = clamp01(1 - yn); // top = near
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (micModeRef.current !== "nomic") return;
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      applyPointer(e.clientY);
    },
    [applyPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      applyPointer(e.clientY);
    },
    [applyPointer],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // The gesture: create AudioContext, start the loop, try the mic.
  const beginAudio = useCallback(async () => {
    if (engineRef.current || starting) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      setAudioSupported(false);
      return;
    }
    setStarting(true);
    try {
      const ctx = new Ctor();
      const engine = new VeilEngine(ctx);
      engineRef.current = engine;
      engine.start();
      await ctx.resume();
      const ok = await engine.attachMic();
      micModeRef.current = ok ? "mic" : "nomic";
      setMicMode(ok ? "mic" : "nomic");
      if (!ok) {
        // seed the fallback so it doesn't jump
        pointerDepthRef.current = depthRef.current;
      }
      phaseRef.current = "live";
      setPhase("live");
    } finally {
      setStarting(false);
    }
  }, [starting]);

  const nearness = Math.round(depthUI * 100);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* art canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none select-none"
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · 8632
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Nearfield
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            A crushed loop, drawn near until it blooms.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 pb-8 sm:pb-10">
        {/* nearness meter */}
        <div className="pointer-events-auto w-full max-w-md">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Far
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {nearness}% near
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Near
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${nearness}%` }}
            />
          </div>
        </div>

        {phase === "demo" ? (
          <div className="pointer-events-auto flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={beginAudio}
              disabled={starting || !audioSupported}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {starting ? "Starting…" : "Begin · Enable sound"}
            </button>
            <p className="text-base text-muted-foreground">
              Auto-preview playing silently — press to hum it to life.
            </p>
            {!audioSupported && (
              <p className="text-sm text-destructive">
                Web Audio is unavailable in this browser — the silent visual
                preview continues.
              </p>
            )}
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-1 text-center">
            {micMode === "mic" ? (
              <p className="text-base text-muted-foreground">
                Hum, whistle, or play — lean in and it blooms. Fall quiet and
                the veil returns.
              </p>
            ) : (
              <p className="text-base text-muted-foreground">
                Drag up on the field to draw it near. It also breathes on its
                own.
              </p>
            )}
            {micMode === "nomic" && (
              <p className="text-sm text-destructive">
                Microphone unavailable — using pointer-drag + auto-breathing
                instead.
              </p>
            )}
            {!webglOK && (
              <p className="text-sm text-destructive">
                WebGL2 unavailable — showing the Canvas2D spectrogram fallback.
              </p>
            )}
          </div>
        )}
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes · The Veil
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              What if restoring a sound were the instrument you play?
            </h2>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                A seeded piano/bell loop arrives crushed — band-limited, muffled,
                thin, and distant. Your voice into the mic is the lean-in
                control: louder and more sustained draws it near.
              </p>
              <p>
                Restoration is rule-based DSP, no machine learning. A single
                depth{" "}
                <span className="font-mono text-foreground">d ∈ [0,1]</span>{" "}
                drives it all:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <span className="text-foreground">Missing highs</span> — an
                  aural exciter saturates a bandpassed mid copy to synthesize
                  new upper partials.
                </li>
                <li>
                  <span className="text-foreground">Missing lows</span> — a
                  subharmonic oscillator, envelope-followed and pitched to the
                  chord root, restores body.
                </li>
                <li>
                  <span className="text-foreground">Presence</span> — tilt EQ
                  (dark→bright) plus an early-reflection room that crosses from
                  wet/distant to dry/near.
                </li>
              </ul>
              <p className="text-sm">
                References: AnyBand spectral infilling (arXiv:2608.00572); the
                Aphex Aural Exciter; SBR / spectral band replication (mp3PRO,
                AAC+); psychoacoustic / harmonic bass restoration.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8632-nearfield"]} />
    </div>
  );
}
