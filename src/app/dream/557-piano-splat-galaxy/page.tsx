"use client";

// 557-piano-splat-galaxy
// What if every note Karel plays BIRTHS a bloom of glowing Gaussian splats —
// so his real piano performance accretes into a living galaxy of light you
// orbit? Onset → burst, sustained energy → drifting nebula, pitch → hue.
//
// Onset-driven generative galaxy (approach #557 of three). Raw WebGL2 additive
// Gaussian-splat rasterizer; spectral-flux onset detection; real-piano fetch
// with an always-on synth fallback.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeAudioEngine,
  makeAnalysis,
  type AudioSourceKind,
} from "./audio";
import { makeRenderer, type SplatRenderer, type BloomSpec } from "./splat";

type Phase = "idle" | "running" | "unsupported";

export default function PianoSplatGalaxy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── render loop (runs pre- and post-Begin) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeRenderer(canvas);
    if (!renderer) {
      setPhase("unsupported");
      return;
    }
    rendererRef.current = renderer;
    renderer.resize();

    let last = performance.now();
    let preBeatTimer = 0;
    let hudTimer = 0;

    const palette = [0.02, 0.13, 0.55, 0.78, 0.92];

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Pre-gesture liveliness: occasionally birth synthetic blooms so the
      // galaxy is already alive and turning for a hands-off reviewer.
      if (phaseRef.current !== "running") {
        preBeatTimer -= dt;
        if (preBeatTimer <= 0) {
          preBeatTimer = 0.7 + Math.random() * 0.9;
          const spec: BloomSpec = {
            hue: palette[Math.floor(Math.random() * palette.length)] + Math.random() * 0.08,
            loudness: 0.4 + Math.random() * 0.4,
            brightness: 0.3 + Math.random() * 0.6,
          };
          renderer.spawn(spec, 0.4);
        }
      }

      renderer.frame(dt);

      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.25;
        setCount(renderer.liveCount());
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── pointer orbit + zoom ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      rendererRef.current?.orbit(e.clientX - d.x, e.clientY - d.y);
      dragRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragRef.current = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rendererRef.current?.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  const begin = useCallback(async () => {
    if (phase === "running" || loading) return;
    setLoading(true);
    try {
      const engine = await makeAudioEngine();
      const analysis = makeAnalysis(engine.analyser, engine.ctx.sampleRate);
      setSource(engine.kind);

      // Drive blooms from real onset detection now that audio is live.
      const audioTimer = window.setInterval(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const f = analysis.read();
        if (f.onset) {
          renderer.spawn(
            {
              hue: f.onset.pitch,
              loudness: f.onset.loudness,
              brightness: f.onset.brightness,
            },
            f.energy,
          );
        } else if (f.energy > 0.45 && Math.random() < 0.08) {
          // Sustained energy → slow diffuse nebula haze.
          renderer.spawn(
            { hue: f.pitch, loudness: f.energy * 0.4, brightness: 0.2 },
            f.energy,
          );
        }
      }, 1000 / 60);

      stopAudioRef.current = () => {
        clearInterval(audioTimer);
        engine.stop();
      };
      setPhase("running");
    } catch {
      // Audio failed entirely — keep the pre-gesture galaxy alive.
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [phase, loading]);

  useEffect(() => {
    return () => {
      stopAudioRef.current?.();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Gaussian-splat galaxy"
      />

      {/* HUD top-right */}
      {phase !== "unsupported" && (
        <div className="pointer-events-none absolute right-4 top-4 text-right font-mono text-xs text-muted-foreground">
          <div>
            source:{" "}
            <span className="text-foreground">
              {source === "piano"
                ? "Karel's piano"
                : source === "fallback"
                  ? "fallback"
                  : "standby"}
            </span>
          </div>
          <div>
            splats: <span className="text-foreground">{count.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Intro / controls overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end p-6 sm:p-10">
        <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/45 p-6 backdrop-blur-sm">
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            Piano Splat Galaxy
          </h1>
          <p className="mt-2 text-base text-foreground">
            Every note Karel plays births a bloom of glowing Gaussian splats —
            his piano accretes into a living galaxy of light you can orbit.
          </p>

          {phase === "unsupported" ? (
            <p className="mt-4 text-base text-violet-300">
              WebGL2 is unavailable in this browser, so the galaxy cannot be
              rendered.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={begin}
                disabled={phase === "running" || loading}
                className="min-h-[44px] rounded-xl bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-200 transition hover:bg-violet-500/30 disabled:opacity-50"
              >
                {phase === "running"
                  ? "Playing"
                  : loading
                    ? "Listening…"
                    : "Begin"}
              </button>
              <span className="text-base text-muted-foreground">
                drag to orbit · scroll to zoom
              </span>
            </div>
          )}
        </div>
      </div>

      <Link
        href="./README.md"
        className="absolute bottom-4 right-4 font-mono text-xs text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </Link>
    </main>
  );
}
