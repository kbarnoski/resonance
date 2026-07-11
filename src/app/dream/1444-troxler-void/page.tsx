"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  makeAdaptField,
  applyPointerMove,
  stepField,
  type AdaptField,
} from "./field";
import { makeRenderer, type FieldRenderer } from "./renderer";
import { makeVoidAudio, type VoidAudio } from "./audio";

const GRID_N = 40;

export default function TroxlerVoidPage() {
  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"webgl2" | "canvas2d" | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<AdaptField | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<VoidAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // last pointer sample, for velocity estimation
  const lastPtrRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    renderer?.resize(w, h);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const field = fieldRef.current;
    if (!field) return;
    const x = e.clientX / Math.max(1, window.innerWidth);
    const y = e.clientY / Math.max(1, window.innerHeight);
    const now = performance.now();
    const prev = lastPtrRef.current;
    let speed = 0;
    if (prev) {
      const dt = Math.max(0.001, (now - prev.t) / 1000);
      const dx = x - prev.x;
      const dy = y - prev.y;
      speed = Math.sqrt(dx * dx + dy * dy) / dt; // screen-widths / sec
    }
    lastPtrRef.current = { x, y, t: now };
    applyPointerMove(field, x, y, speed);
  }, []);

  const renderLoop = useCallback(() => {
    const field = fieldRef.current;
    const renderer = rendererRef.current;
    const now = performance.now();
    let dt = (now - lastRef.current) / 1000;
    lastRef.current = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-away
    if (dt < 0) dt = 0;

    if (field && renderer) {
      stepField(field, dt, reducedRef.current);
      renderer.draw(field, field.time, reducedRef.current);
      audioRef.current?.update(field.bloom, field.voidness);
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // Mount: build field + renderer and run the idle preview loop (no audio yet).
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const field = makeAdaptField(GRID_N);
    fieldRef.current = field;
    const renderer = makeRenderer(canvas, GRID_N);
    if (!renderer) {
      setError("Neither WebGL2 nor Canvas2D is available — cannot draw the field.");
      return;
    }
    rendererRef.current = renderer;
    setMode(renderer.mode);
    resize();

    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1500);
      }
      acRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      fieldRef.current = null;
    };
  }, [renderLoop, resize, onPointerMove]);

  const handleStart = useCallback(async () => {
    if (started) return;
    setError(null);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeVoidAudio(ac, 0.18);
    } catch {
      setError("Audio could not start — the void drifts on, silently.");
    }
    setStarted(true);
  }, [started]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {/* soft central fixation glyph — anchors the gaze so the periphery fades */}
      <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
        <div
          className="rounded-full opacity-70"
          style={{
            width: 7,
            height: 7,
            background: "rgba(216,210,255,0.85)",
            boxShadow: "0 0 10px 3px rgba(150,140,220,0.35)",
          }}
        />
      </div>

      {/* corner UI */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-light tracking-tight text-foreground sm:text-3xl">
          Troxler Void
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          Hold perfectly still and the screen dissolves into a uniform void; move,
          and the world re-forms. A drug-free staging of boundary-dissolution built
          on your own visual system — Troxler fading inside a Ganzfeld field.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {!started && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-black transition hover:bg-card"
            >
              Begin — sound on
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur transition hover:bg-black/60"
          >
            {notesOpen ? "Close notes" : "Read the design notes"}
          </button>
        </div>

        {!started ? (
          <p className="mt-3 text-base text-muted-foreground">
            Rest your eyes on the centre dot. The periphery is already drifting and
            self-fading — press Begin to add the drone.
          </p>
        ) : (
          <p className="mt-3 text-base text-muted-foreground">
            Softly fix the centre dot and be still — the edges melt toward the void
            and the drone thins. The smallest movement re-blooms both.
          </p>
        )}
        {mode === "canvas2d" && (
          <p className="mt-2 text-base text-muted-foreground">
            Running the Canvas2D fallback (WebGL2 unavailable).
          </p>
        )}
        {error && <p className="mt-2 text-base text-violet-300">{error}</p>}
      </div>

      {notesOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[72vh] overflow-y-auto border-t border-border bg-black/90 p-5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:max-w-md sm:rounded-2xl sm:border">
          <h2 className="text-xl font-light text-foreground">Design notes</h2>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            The screen is a <em>Ganzfeld</em> — a uniform, structureless field. Under
            steady fixation, the visual system stops reporting unchanging input:
            the periphery literally fades from awareness. This is{" "}
            <em>Troxler fading</em>, described by Ignác Troxler in 1804; the whole-
            field version was studied by Wolfgang Metzger (the Ganzfeld, 1930).
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Each region of the screen carries an <em>adaptation level</em> that rises
            the longer it goes without change or attention — faster in the periphery
            than at the fixated centre. As it rises, that region&apos;s contrast and
            colour collapse toward the flat mean field. Pointer movement resets the
            adaptation nearby, so the world re-forms under your hand. The generative
            drone dissolves in lock-step: partials drop out, brightness closes, and
            the reverb tail opens as the field empties.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            This is a real, robust perceptual phenomenon, not a medical claim — the
            calmer and stiller you are, the more the field disappears. No strobe, no
            flash; only slow, sub-Hz drift.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            See README.md in this prototype&apos;s folder for references and honest
            caveats.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1444-troxler-void"]} />
    </main>
  );
}
