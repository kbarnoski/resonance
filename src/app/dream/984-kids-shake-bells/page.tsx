"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeBellAudio, decayGlow, LADDER_LEN, type BellAudio } from "./audio";
import {
  makeShakeDetector,
  requestMotionPermission,
  needsMotionPermission,
  supportsDeviceMotion,
  SHAKE_THRESHOLD,
  SHAKE_SENSITIVITY,
  type ShakeDetector,
} from "./motion";
import {
  makeWebGLRenderer,
  makeCanvas2DRenderer,
  type BellFieldRenderer,
} from "./gl";

// Session timing: cap ~15 min, start fading toward a "goodnight" lull at ~12 min.
const LULL_START_MS = 12 * 60 * 1000;
const LULL_FULL_MS = 15 * 60 * 1000;
// After this much idle, the ghost auto-shaker rings the ladder on its own.
const GHOST_IDLE_MS = 3000;
const GHOST_INTERVAL_MS = 1100;

export default function ShakeBellsPage() {
  const [started, setStarted] = useState(false);
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [renderNote, setRenderNote] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [ghostOn, setGhostOn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<BellAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rendererRef = useRef<BellFieldRenderer | null>(null);
  const detectorRef = useRef<ShakeDetector | null>(null);
  const rafRef = useRef<number>(0);

  // Ladder walk state: index climbs then descends (rising-then-falling shimmer).
  const ladderIdxRef = useRef(0);
  const dirRef = useRef(1);
  const lastShakeAtRef = useRef(0);
  const startTimeRef = useRef(0);

  // The single shake action: advance the ladder, ring bells, remember timing.
  const fireShake = useCallback((intensity: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const idx = ladderIdxRef.current;
    audio.strikeBell(idx, intensity);
    // Walk up the ~2-octave mode then turn around and descend.
    let next = idx + dirRef.current;
    if (next >= LADDER_LEN - 1) {
      next = LADDER_LEN - 1;
      dirRef.current = -1;
    } else if (next <= 0) {
      next = 0;
      dirRef.current = 1;
    }
    ladderIdxRef.current = next;
    lastShakeAtRef.current = performance.now();
  }, []);

  const runLoop = useCallback(() => {
    let last = performance.now();
    let ghostAt = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const audio = audioRef.current;
      const renderer = rendererRef.current;

      // Session lull envelope.
      const elapsed = now - startTimeRef.current;
      let lull = 0;
      if (elapsed > LULL_START_MS) {
        lull = Math.min(1, (elapsed - LULL_START_MS) / (LULL_FULL_MS - LULL_START_MS));
      }
      if (audio) audio.setLull(lull);

      // Ghost auto-shaker: never silent, hands-free glance shows + rings.
      const idle = now - lastShakeAtRef.current;
      const ghostActive = idle > GHOST_IDLE_MS;
      if (ghostActive) {
        if (now - ghostAt > GHOST_INTERVAL_MS) {
          ghostAt = now;
          fireShake(0.32 + Math.random() * 0.25);
          // Note: fireShake updates lastShakeAt; keep ghost rolling by nudging.
          lastShakeAtRef.current = now - GHOST_IDLE_MS - 1;
        }
      }
      setGhostOn((prev) => (prev !== ghostActive ? ghostActive : prev));

      if (audio && renderer) {
        decayGlow(audio.bellGlow, dt);
        renderer.draw(audio.bellGlow, now / 1000, lull);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [fireShake]);

  // Size the canvas to its container with DPR.
  const applyCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w;
    canvas.height = h;
    renderer?.resize(w, h);
  }, []);

  const handleStart = useCallback(async () => {
    if (started) return;
    // Gesture-gate: create + resume AudioContext only after the Start tap.
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    await ctx.resume();
    const audio = makeBellAudio(ctx);
    audioRef.current = audio;

    // Renderer: WebGL2 -> Canvas2D fallback -> notice.
    const canvas = canvasRef.current;
    if (canvas) {
      let renderer = makeWebGLRenderer(canvas);
      if (!renderer) {
        renderer = makeCanvas2DRenderer(canvas);
        if (renderer) setRenderNote("WebGL2 unavailable — using Canvas2D glow.");
      }
      if (!renderer) {
        setRenderNote("Graphics unavailable on this device — the bells still ring.");
      }
      rendererRef.current = renderer;
    }
    applyCanvasSize();

    // Shake permission MUST be requested synchronously-ish inside this tap.
    if (needsMotionPermission()) {
      const granted = await requestMotionPermission();
      if (!granted) {
        setSensorNote("Shake sensor is off — use the big button or spacebar to play.");
      }
    } else if (!supportsDeviceMotion()) {
      setSensorNote("No shake sensor here — use the big button or spacebar to play.");
    }

    const detector = makeShakeDetector((intensity) => fireShake(intensity));
    detector.attach();
    if (detector.isDenied() && !sensorNote) {
      setSensorNote("No shake sensor here — use the big button or spacebar to play.");
    }
    detectorRef.current = detector;

    startTimeRef.current = performance.now();
    lastShakeAtRef.current = performance.now();
    setStarted(true);
    runLoop();
  }, [started, applyCanvasSize, fireShake, runLoop, sensorNote]);

  // Spacebar fallback.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        fireShake(0.55 + Math.random() * 0.35);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, fireShake]);

  // Resize handling.
  useEffect(() => {
    if (!started) return;
    const onResize = () => applyCanvasSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started, applyCanvasSize]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      detectorRef.current?.detach();
      rendererRef.current?.dispose();
      audioRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const tapButton = useCallback(() => {
    // Big round "SHAKE!" fallback — synthetic intensity, lively.
    fireShake(0.6 + Math.random() * 0.4);
  }, [fireShake]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0618] text-foreground">
      {/* Glow field canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Corner nav */}
      <div className="absolute left-4 top-4 z-20">
        <Link
          href="/dream"
          className="rounded-full bg-muted px-4 py-2.5 font-mono text-sm text-muted-foreground backdrop-blur hover:bg-accent"
        >
          ← lab
        </Link>
      </div>

      {/* Design notes toggle (corner) */}
      <div className="absolute right-4 top-4 z-20">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground backdrop-blur hover:bg-accent"
        >
          {showNotes ? "Close notes" : "Read the design notes"}
        </button>
      </div>

      {showNotes && (
        <div className="absolute right-4 top-16 z-30 max-w-sm rounded-2xl bg-black/80 p-5 text-base text-foreground backdrop-blur">
          <h2 className="mb-2 font-serif text-xl text-foreground">Magic Bell Tray</h2>
          <p className="mb-2 text-foreground">
            Shake the tablet like a tray of handbells. Each shake rings real,
            physically-modeled bells that climb and descend a{" "}
            <span className="text-violet-300/95">G Mixolydian</span> ladder.
          </p>
          <p className="mb-2 text-muted-foreground">
            Harder shakes ring a fuller sparkling arpeggio (3–5 bells); a gentle
            shake rings just one or two soft tones.
          </p>
          <p className="mb-2 text-muted-foreground">
            Bells are inharmonic partial banks (no samples) so they beat and
            shimmer. The visuals are a WebGL2 additive glow field driven by the
            audio amplitude.
          </p>
          <p className="text-muted-foreground">
            Play: shake the device · big round button · spacebar. Threshold and
            sensitivity are reasoned, not measured on a real device.
          </p>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="font-serif text-4xl font-semibold text-foreground sm:text-5xl">
            Magic Bell Tray
          </h1>
          <p className="max-w-xl text-lg text-foreground">
            Shake the tablet like a tray of handbells — each shake rings real
            bells that climb a sparkling musical ladder.
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-full bg-violet-400 px-10 py-5 text-2xl font-bold text-[#2a1500] shadow-[0_0_60px_rgba(251,191,36,0.55)] transition hover:scale-105"
            style={{ minHeight: 72, minWidth: 220 }}
          >
            ✶ Start ✶
          </button>
          <p className="text-base text-muted-foreground">For little hands (ages 4+)</p>
        </div>
      )}

      {/* Playing UI */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 pb-10">
          {sensorNote && (
            <p className="rounded-full bg-black/50 px-4 py-2 text-base text-violet-300 backdrop-blur">
              {sensorNote}
            </p>
          )}
          {renderNote && (
            <p className="rounded-full bg-black/50 px-4 py-2 text-base text-violet-300 backdrop-blur">
              {renderNote}
            </p>
          )}
          <button
            type="button"
            onClick={tapButton}
            aria-label="Shake the bells"
            className="flex items-center justify-center rounded-full bg-gradient-to-b from-violet-300 to-violet-500 text-3xl font-black text-[#2a1500] shadow-[0_0_70px_rgba(251,146,60,0.6)] transition active:scale-90"
            style={{ width: 176, height: 176 }}
          >
            SHAKE!
          </button>
          <p className="text-base text-muted-foreground">
            Shake the device, tap the button, or press{" "}
            <span className="font-mono text-violet-300">space</span>
            {ghostOn && (
              <span className="ml-2 text-violet-300/95">· auto-playing ✶</span>
            )}
          </p>
        </div>
      )}

      {/* Tiny meta label */}
      <div className="pointer-events-none absolute bottom-3 left-4 z-10 font-mono text-xs text-muted-foreground">
        984 · g mixolydian · thr {SHAKE_THRESHOLD} · sens {SHAKE_SENSITIVITY}
      </div>
    </main>
  );
}
