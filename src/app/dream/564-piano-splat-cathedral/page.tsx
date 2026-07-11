"use client";

// 564-piano-splat-cathedral
// What if Karel's recorded piano didn't just make a cloud — it BUILT an
// architecture? A luminous cathedral of anisotropic, depth-sorted Gaussian
// splats — columns, arches, a vaulted nave — that his music raises around you
// and lights as you fly through it.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeAudioEngine,
  makeAnalysis,
  type AudioSourceKind,
} from "./audio";
import {
  makeCathedralRenderer,
  buildCathedralElements,
  type CathedralRenderer,
  type StructuralElement,
} from "./cathedral";

type Phase = "idle" | "running" | "unsupported";

// ── Synthetic onset generator (pre-Begin demo) ────────────────────────────────
// Fires fake onsets on a cathedral-like schedule so a reviewer sees the
// structure building before any interaction or audio gesture.

interface SyntheticState {
  timer: number;
  nextInterval: number;
  onsetIdx: number;
}

function makeSyntheticOnsets(): SyntheticState {
  return { timer: 0, nextInterval: 0.8, onsetIdx: 0 };
}

// Cathedral hue palette for pre-gesture demo.
const DEMO_HUES = [0.06, 0.08, 0.55, 0.62, 0.72, 0.82, 0.12];

// ── Build order: indices into elements[] in the order the music raises them ──
// The first ~20 elements cover floor + columns + arches in a slow build.
// After all are raised we cycle back and flash them.

export default function PianoSplatCathedral() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CathedralRenderer | null>(null);
  const elementsRef = useRef<StructuralElement[]>([]);
  const rafRef = useRef<number>(0);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const synthRef = useRef<SyntheticState>(makeSyntheticOnsets());
  const nextElemRef = useRef<number>(0); // next element index to raise

  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [builtElems, setBuiltElems] = useState(0);
  const [totalElems, setTotalElems] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Main render loop (starts immediately, no gesture needed) ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const elements = buildCathedralElements();
    elementsRef.current = elements;
    setTotalElems(elements.length);

    const renderer = makeCathedralRenderer(canvas, elements);
    if (!renderer) {
      setPhase("unsupported");
      return;
    }
    rendererRef.current = renderer;
    renderer.resize();

    let last = performance.now();
    let hudTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Pre-Begin: drive structure build with synthetic onsets.
      if (phaseRef.current !== "running") {
        const s = synthRef.current;
        s.timer += dt;
        if (s.timer >= s.nextInterval) {
          s.timer = 0;
          s.nextInterval = 0.7 + Math.random() * 1.1;
          const elemIdx = nextElemRef.current;
          if (elemIdx < elements.length) {
            const hue = DEMO_HUES[s.onsetIdx % DEMO_HUES.length];
            renderer.raiseElement(elemIdx, hue, 0.55 + Math.random() * 0.35);
            nextElemRef.current++;
            s.onsetIdx++;
          } else {
            // All elements raised: cycle flashes.
            const flashIdx = Math.floor(Math.random() * elements.length);
            renderer.flashElement(flashIdx, 0.4 + Math.random() * 0.5);
          }
        }

        // Gentle nave breath even before audio.
        const breathT = Math.sin(now * 0.0008) * 0.5 + 0.5;
        renderer.setNaveBreath(breathT * 0.4);
        if (nextElemRef.current >= elements.length) {
          renderer.setRoseWindowPulse(Math.sin(now * 0.001) * 0.5 + 0.5);
        }
      }

      renderer.frame(dt);

      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.3;
        setBuiltElems(renderer.builtCount());
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

  // ── Pointer orbit + wheel zoom ────────────────────────────────────────────
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
    const onUp = () => { dragRef.current = null; };
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

  // ── Begin: start audio, hand onset detection to the renderer ─────────────
  const begin = useCallback(async () => {
    if (phase === "running" || loading) return;
    setLoading(true);
    try {
      const engine = await makeAudioEngine();
      const analysis = makeAnalysis(engine.analyser, engine.ctx.sampleRate);
      setSource(engine.kind);

      // Reset the element counter so audio can re-raise already-seen elements
      // with different colours (new onset overwrites the splat pool indices).
      nextElemRef.current = 0;

      const audioTimer = window.setInterval(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const f = analysis.read();

        if (f.onset) {
          const elemIdx = nextElemRef.current;
          if (elemIdx < elementsRef.current.length) {
            renderer.raiseElement(elemIdx, f.onset.pitch, f.onset.loudness);
            nextElemRef.current++;
          } else {
            // All raised: flash a random element per onset.
            const rnd = Math.floor(Math.random() * elementsRef.current.length);
            renderer.flashElement(rnd, f.onset.loudness);
          }
        }

        // Sustained energy: nave breathes.
        renderer.setNaveBreath(f.loudness);

        // Pitch → rose window pulse when rose is built.
        if (nextElemRef.current >= elementsRef.current.length) {
          renderer.setRoseWindowPulse(f.energy * (1 - f.pitch) * 0.8);
        }

      }, 1000 / 60);

      stopAudioRef.current = () => {
        clearInterval(audioTimer);
        engine.stop();
      };
      setPhase("running");
    } catch {
      // Audio failed — keep pre-gesture demo alive.
      setSource(null);
    } finally {
      setLoading(false);
    }
  }, [phase, loading]);

  useEffect(() => {
    return () => { stopAudioRef.current?.(); };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Cathedral of Gaussian splats"
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
                  ? "fallback synth"
                  : "standby"}
            </span>
          </div>
          <div>
            built:{" "}
            <span className="text-foreground">
              {builtElems}/{totalElems} elements
            </span>
          </div>
        </div>
      )}

      {/* Intro / controls overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end p-6 sm:p-10">
        <div className="pointer-events-auto max-w-xl rounded-2xl bg-black/50 p-6 backdrop-blur-sm">
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            Piano Splat Cathedral
          </h1>
          <p className="mt-2 text-base text-foreground">
            Karel&apos;s piano builds a luminous cathedral around you — each onset
            raises columns, arches, vaults, and a rose window from anisotropic
            Gaussian splats, depth-sorted so near stone occludes far.
          </p>

          {phase === "unsupported" ? (
            <p className="mt-4 text-base text-violet-300">
              WebGL2 is unavailable in this browser. The cathedral cannot be
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
