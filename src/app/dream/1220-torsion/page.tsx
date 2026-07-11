"use client";

// ════════════════════════════════════════════════════════════════════════════
// Torsion (1220)
//
// THE ONE QUESTION: "What if a (p,q) torus knot — a single string wound through
// a donut in a mathematical braid — were a pluckable physical instrument, where
// the winding numbers ARE the tuning?"
//
// INPUT: pointer orbit (drag empty space to turn the knot) + pointer pluck
// (click / drag across the tube to excite it). OUTPUT: three.js 3D — a glowing
// torus-knot tube with a travelling displacement wave. VOICE: Karplus–Strong /
// digital-waveguide plucked strings. PALETTE: garnet/amber/gold on deep indigo.
// See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildTuning, pluckFrequency, PRESETS } from "./knot";
import { KnotScene } from "./scene";
import { KarplusStrong } from "./synth";

type Phase = "idle" | "running" | "error";

export default function TorsionPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<KnotScene | null>(null);
  const synthRef = useRef<KarplusStrong | null>(null);
  const tuningRef = useRef<number[]>(buildTuning(2, 3));

  // pointer-drag state kept in a ref so listeners never re-bind
  const dragRef = useRef({
    down: false,
    mode: "none" as "none" | "orbit" | "pluck",
    lastX: 0,
    lastY: 0,
    lastU: -1,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [presetIdx, setPresetIdx] = useState(0);

  // ── pluck helper (shared by click + strum) ────────────────────────────────
  const pluckAt = useCallback((u: number, strength: number) => {
    const scene = sceneRef.current;
    const synth = synthRef.current;
    if (!scene || !synth) return;
    const freq = pluckFrequency(u, tuningRef.current);
    synth.pluck(freq, strength, 0.55);
    scene.addWave(u, 0.7 + strength * 0.5);
  }, []);

  // ── set up the three.js scene once ────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scene: KnotScene;
    try {
      scene = new KnotScene(container);
    } catch {
      setPhase("error");
      return;
    }
    scene.setKnot(PRESETS[0].p, PRESETS[0].q);
    scene.start();
    sceneRef.current = scene;

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── pointer handlers (orbit vs pluck) ─────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      if (!scene) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const drag = dragRef.current;
      drag.down = true;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      const u = scene.pick(e.clientX, e.clientY);
      if (u != null && phase === "running") {
        drag.mode = "pluck";
        drag.lastU = u;
        pluckAt(u, 0.85);
      } else {
        drag.mode = "orbit";
        drag.lastU = -1;
      }
    },
    [phase, pluckAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      const drag = dragRef.current;
      if (!scene || !drag.down) return;

      if (drag.mode === "orbit") {
        scene.orbit(e.clientX - drag.lastX, e.clientY - drag.lastY);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        return;
      }

      if (drag.mode === "pluck" && phase === "running") {
        const u = scene.pick(e.clientX, e.clientY);
        if (u != null && Math.abs(u - drag.lastU) > 0.02) {
          // strumming across new rungs of the string
          pluckAt(u, 0.55);
          drag.lastU = u;
        }
      }
    },
    [phase, pluckAt],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    drag.down = false;
    drag.mode = "none";
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  // ── controls ──────────────────────────────────────────────────────────────
  const onStart = useCallback(async () => {
    if (!synthRef.current) synthRef.current = new KarplusStrong();
    try {
      await synthRef.current.start();
      setPhase("running");
      // an opening gesture so it doesn't start silent
      const u = 0.5;
      pluckAt(u, 0.6);
    } catch {
      setPhase("error");
    }
  }, [pluckAt]);

  const onPreset = useCallback((idx: number) => {
    const p = PRESETS[idx];
    tuningRef.current = buildTuning(p.p, p.q);
    sceneRef.current?.setKnot(p.p, p.q);
    setPresetIdx(idx);
  }, []);

  // ── audio teardown on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  const active = PRESETS[presetIdx];

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#160a2a] text-foreground">
      {/* 3D stage */}
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        style={{ cursor: phase === "running" ? "crosshair" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {/* overlay UI */}
      <div className="pointer-events-none relative z-10 flex min-h-dvh flex-col justify-between p-5 sm:p-8">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="pointer-events-auto text-base text-muted-foreground underline-offset-4 hover:underline"
          >
            ← dream lab
          </Link>
          <h1 className="mt-3 font-serif text-3xl text-foreground sm:text-4xl">
            Torsion
          </h1>
          <p className="mt-2 text-base text-foreground">
            A {active.label} torus knot — one string wound {active.p}× around and{" "}
            {active.q}× through — plucked like a physical instrument, its winding
            numbers set as the tuning.
          </p>
        </header>

        <div className="pointer-events-auto max-w-2xl">
          {phase === "error" ? (
            <p className="text-base text-violet-300">
              WebGL or Web Audio is unavailable in this browser, so the knot
              can’t be awoken here. Try a recent desktop Chrome, Firefox, or
              Safari.
            </p>
          ) : (
            <>
              {phase === "idle" && (
                <button
                  type="button"
                  onClick={onStart}
                  className="min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-medium text-[#160a2a] transition-colors hover:bg-violet-400"
                >
                  Awaken the knot
                </button>
              )}

              {/* preset (p,q) retune buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onPreset(idx)}
                    className={`min-h-[44px] rounded-full border px-4 py-2.5 text-base transition-colors ${
                      idx === presetIdx
                        ? "border-violet-300/70 bg-violet-400/15 text-foreground"
                        : "border-border text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                    title={preset.name}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <p className="mt-4 font-mono text-base text-muted-foreground">
                {phase === "running"
                  ? "drag to turn · click the string to pluck · slide to strum"
                  : "press awaken, then drag to turn and pluck the string"}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
