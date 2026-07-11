"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createAudio, type AudioEngine, LADDER_HZ } from "./audio";
import {
  createWebGL2Renderer,
  createCanvas2DRenderer,
  type Renderer,
  type SceneState,
} from "./scene";

// Map a height (0..1) up the hill to a diatonic pitch on the do..ti ladder.
// Returns the Hz of the nearest rung so a child can never play a "wrong" note.
function pitchForHeight(h: number): number {
  const idx = Math.min(
    LADDER_HZ.length - 1,
    Math.max(0, Math.round(h * (LADDER_HZ.length - 1))),
  );
  return LADDER_HZ[idx];
}

export default function KidsComeHome() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const [started, setStarted] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const start = useCallback(async () => {
    if (started) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      audioRef.current = createAudio(ctx);
    } catch {
      setAudioError(true);
    }
    setStarted(true);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ---- renderer (WebGL2, else Canvas2D) ----
    let renderer: Renderer | null = createWebGL2Renderer(canvas);
    if (!renderer) {
      renderer = createCanvas2DRenderer(canvas);
      setFallback(true);
    }
    if (!renderer) return;
    const r = renderer;

    const audio = audioRef.current;

    // ---- interaction + simulation state ----
    let held = false; // child currently dragging
    let fx = 0.5; // firefly x (0..1)
    let fy = 0.06; // firefly y/height (0..1)
    let lastTouch = performance.now() - 9999; // force demo on at start
    let bloom = 0;
    let resolving = false; // swooping home after release
    const trail: { x: number; y: number }[] = [];

    // ghost / auto-demo phase
    let demoT = 0;

    const IDLE_MS = 4000; // resume demo after this much idle
    const DEMO_START_DELAY = 900; // ~1s hands-off demo kicks in

    let raf = 0;
    const t0 = performance.now();
    let prev = t0;

    const setHeight = (h: number) => {
      fy = Math.max(0, Math.min(1, h));
    };

    // pointer -> normalized hill coords (y up)
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = 1 - (clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      held = true;
      resolving = false;
      lastTouch = performance.now();
      const p = toLocal(e.clientX, e.clientY);
      fx = p.x;
      setHeight(p.y);
    };
    const onMove = (e: PointerEvent) => {
      if (!held) return;
      lastTouch = performance.now();
      const p = toLocal(e.clientX, e.clientY);
      fx = p.x;
      setHeight(p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (!held) return;
      held = false;
      lastTouch = performance.now();
      canvas.releasePointerCapture?.(e.pointerId);
      // let go -> swoop down and resolve home
      resolving = true;
      audio?.bloomHome();
      bloom = 1;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ---- WebGL context loss handling ----
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
    };
    const onRestored = () => {
      const re = createWebGL2Renderer(canvas);
      if (re) {
        renderer = re;
        loop(performance.now());
      }
    };
    canvas.addEventListener("webglcontextlost", onLost as EventListener);
    canvas.addEventListener("webglcontextrestored", onRestored);

    const onResize = () => r.resize();
    window.addEventListener("resize", onResize);

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const time = (now - t0) / 1000;
      const sinceTouch = now - lastTouch;

      const demoActive = !held && !resolving && sinceTouch > DEMO_START_DELAY &&
        (sinceTouch > IDLE_MS || lastTouch < t0 + DEMO_START_DELAY);

      if (held) {
        // child controls height directly (fx/fy already set by pointer)
      } else if (resolving) {
        // swoop home: ease toward tonic at base center
        fy += (0.06 - fy) * Math.min(1, dt * 6);
        fx += (0.5 - fx) * Math.min(1, dt * 4);
        if (fy < 0.09) resolving = false;
      } else if (demoActive) {
        // ghost firefly: slow rise to the leading tone, tremble, release home
        demoT += dt;
        const period = 7.5;
        const phase = (demoT % period) / period;
        if (phase < 0.62) {
          // rise do..ti
          fy = 0.06 + (phase / 0.62) * 0.92;
          fx = 0.5 + Math.sin(demoT * 0.7) * 0.12;
        } else if (phase < 0.7) {
          // hover/tremble at the top (leading tone pulls)
          fy = 0.98;
        } else {
          // release: swoop home + bloom once
          const rp = (phase - 0.7) / 0.3;
          fy = 0.98 + (0.06 - 0.98) * Math.min(1, rp * 2.2);
          fx += (0.5 - fx) * Math.min(1, dt * 4);
          if (rp > 0.0 && rp < 0.06 && audio) {
            audio.bloomHome();
            bloom = 1;
          }
        }
      } else {
        // resting at home, gentle hover
        fy = 0.06 + Math.sin(time * 1.3) * 0.012;
      }

      // tension from height (steepest near leading tone)
      const tension = Math.max(0, Math.min(1, (fy - 0.05) / 0.92));

      // drive audio
      if (audio) {
        audio.setTension(tension);
        if (held || demoActive) {
          audio.setMelody(pitchForHeight(fy));
        } else if (!resolving) {
          audio.setMelody(null);
        }
      }

      // trail
      trail.push({ x: fx, y: fy });
      if (trail.length > 16) trail.shift();

      bloom = Math.max(0, bloom - dt * 1.6);

      const state: SceneState = { fx, fy, tension, bloom, time, trail };
      r.draw(state);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("webglcontextlost", onLost as EventListener);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      window.removeEventListener("resize", onResize);
      r.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0a16] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ touchAction: "none" }}
      />

      {/* chrome overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
          Come Home
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Drag the firefly up the hill. At the top it trembles, wanting home.
          Let go — and hear it land.
        </p>
        {fallback && (
          <p className="text-base text-violet-300">(showing the simple view)</p>
        )}
        {audioError && (
          <p className="text-base text-violet-300">
            (sound could not start on this device)
          </p>
        )}
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0b0a16]/70 backdrop-blur-sm">
          <h2 className="px-6 text-center font-semibold text-2xl text-foreground sm:text-3xl">
            Help the little light find its way home
          </h2>
          <button
            onClick={start}
            className="min-h-[64px] rounded-full bg-violet-300 px-10 py-4 text-xl font-semibold text-[#0b0a16] shadow-lg shadow-violet-500/30 transition active:scale-95"
          >
            Start
          </button>
          <p className="text-base text-muted-foreground">tap, then drag up and let go</p>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full border border-border bg-black/30 px-4 py-2.5 font-mono text-sm text-muted-foreground backdrop-blur-sm transition hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 z-20 max-w-sm rounded-2xl border border-border bg-black/70 p-5 text-base text-foreground backdrop-blur-md">
          <p className="mb-2 text-foreground">
            The hill is a C-major ladder: do–re–mi–fa–sol–la–<em>ti</em>. Low =
            home (I chord). High = the leading tone, pulled toward home by the
            dominant (V) chord. Letting go is a real V → I cadence — the tension
            you can feel with your hand.
          </p>
          <Link
            href="./957-kids-come-home/README.md"
            className="font-mono text-sm text-violet-300 underline"
          >
            full README
          </Link>
        </div>
      )}
    </main>
  );
}
