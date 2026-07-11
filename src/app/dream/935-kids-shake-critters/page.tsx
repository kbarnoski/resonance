"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShakeEngine } from "./audio";
import { ShakeInput } from "./input";
import { CritterScene } from "./scene";

type Phase = "intro" | "playing" | "nowebgl";

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [mode, setMode] = useState<string>("");
  const [loopCount, setLoopCount] = useState(0);
  const [energyPct, setEnergyPct] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const engineRef = useRef<ShakeEngine | null>(null);
  const inputRef = useRef<ShakeInput | null>(null);
  const sceneRef = useRef<CritterScene | null>(null);
  const rafRef = useRef<number>(0);
  const hudPctRef = useRef(0);
  const hudModeRef = useRef("");

  // main loop — kept in a ref-driven RAF, cleaned up on unmount
  const runLoop = useCallback(() => {
    let smoothedPct = 0;

    const tick = (timeMs: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const engine = engineRef.current;
      const input = inputRef.current;
      const scene = sceneRef.current;
      if (!engine || !input) return;
      const e = input.tick(timeMs);
      engine.setEnergy(e);
      engine.frame(timeMs);
      if (scene) scene.render(e, engine.loopEnergy);

      // throttle React state updates (HUD only)
      smoothedPct += (e * 100 - smoothedPct) * 0.2;
      const pct = Math.round(smoothedPct);
      if (Math.abs(pct - hudPctRef.current) > 2) {
        hudPctRef.current = pct;
        setEnergyPct(pct);
      }
      if (input.mode !== hudModeRef.current) {
        hudModeRef.current = input.mode;
        setMode(input.mode);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleStart = useCallback(async () => {
    const hasGL = detectWebGL();

    // audio engine first — must always work even with no WebGL
    const engine = new ShakeEngine();
    engine.resume();
    engine.start();
    engine.onLoopAdded = (n) => setLoopCount(n);
    engineRef.current = engine;

    const input = new ShakeInput();
    input.begin();
    inputRef.current = input;

    if (!hasGL) {
      setPhase("nowebgl");
    } else {
      setPhase("playing");
      // canvas mounts with this phase; set up scene next tick
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (canvas && wrap) {
          try {
            const scene = new CritterScene(canvas);
            scene.resize(wrap.clientWidth, wrap.clientHeight);
            sceneRef.current = scene;
            // grains puff sparkles
            engine.onGrain = (g) => scene.puff(g.voice, g.energy);
            input.attachPointer(wrap);
          } catch {
            setPhase("nowebgl");
          }
        }
      });
    }

    // request devicemotion permission + subscribe (must be in this gesture)
    void input.startMotion();

    runLoop();
  }, [runLoop]);

  // resize handling
  useEffect(() => {
    const onResize = () => {
      const scene = sceneRef.current;
      const wrap = wrapRef.current;
      if (scene && wrap) scene.resize(wrap.clientWidth, wrap.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      inputRef.current?.dispose();
      engineRef.current?.dispose();
    };
  }, []);

  const clearLoops = useCallback(() => {
    engineRef.current?.clearLoops();
    setLoopCount(0);
  }, []);

  const modeLabel =
    mode === "motion"
      ? "Shaking the device"
      : mode === "pointer"
        ? "Drag to shake"
        : "Auto-playing — shake or drag!";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#2a1a4a] text-foreground select-none">
      {/* three.js canvas */}
      <div ref={wrapRef} className="absolute inset-0 touch-none">
        {phase === "playing" && (
          <canvas ref={canvasRef} className="block h-full w-full" />
        )}
        {phase === "nowebgl" && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-200 via-violet-200 to-violet-300">
            <div className="text-center px-6">
              <div className="text-7xl mb-4">🫨🟡🔵🟣🟢</div>
              <p className="text-2xl font-bold text-violet-900">
                The critters are dancing in sound!
              </p>
              <p className="mt-2 text-base text-violet-700">
                Your browser can&apos;t show the 3D critters, but the music is
                still playing — shake or drag to make the rattle groove.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* intro overlay */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-violet-300 via-violet-300 to-violet-400 px-6 text-center">
          <div className="text-7xl mb-3">🫨</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-violet-950 drop-shadow">
            Shake the Critters!
          </h1>
          <p className="mt-3 max-w-md text-base sm:text-lg font-semibold text-violet-900">
            Shake the iPad like a rattle and a little band of glowing jelly
            creatures wakes up. Your shake becomes a warm rattly groove they keep
            playing back.
          </p>
          <button
            onClick={handleStart}
            className="mt-8 min-h-[64px] rounded-full bg-violet-700 px-10 py-4 text-2xl font-extrabold text-foreground shadow-xl active:scale-95 transition-transform hover:bg-violet-600"
          >
            🎉 Shake me!
          </button>
          <p className="mt-4 text-base text-violet-900/90">
            No sensor? Just drag with your finger or mouse — it works the same.
          </p>
        </div>
      )}

      {/* live HUD */}
      {phase !== "intro" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-4">
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground drop-shadow">
              Shake the Critters!
            </h1>
            <p className="mt-1 text-base font-semibold text-foreground drop-shadow">
              {modeLabel}
            </p>
            {/* energy meter — playful, never a fail state */}
            <div className="mt-2 h-3 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-300 via-violet-400 to-violet-400 transition-[width] duration-75"
                style={{ width: `${energyPct}%` }}
              />
            </div>
          </div>

          {/* loop groove indicator */}
          <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-10 flex flex-col items-center gap-2">
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-4 w-4 rounded-full transition-all ${
                    i < loopCount
                      ? "bg-violet-300 scale-110 shadow-[0_0_12px_2px_rgba(110,231,183,0.7)]"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-base font-semibold text-violet-300/95 drop-shadow">
              {loopCount > 0
                ? "Groove caught! The critters keep grooving 🎶"
                : "Shake, then pause — your rhythm gets caught in a loop"}
            </p>
            {loopCount > 0 && (
              <button
                onClick={clearLoops}
                className="pointer-events-auto min-h-[44px] rounded-full bg-muted px-5 py-2.5 text-base font-bold text-foreground active:scale-95 hover:bg-accent"
              >
                🧹 Clear the groove
              </button>
            )}
          </div>
        </>
      )}

      {/* corner README link */}
      <Link
        href="/dream/935-kids-shake-critters/README.md"
        className="absolute right-3 top-3 z-30 rounded-full bg-black/30 px-3 py-2 text-base font-semibold text-foreground hover:text-foreground"
      >
        notes
      </Link>
    </div>
  );
}
