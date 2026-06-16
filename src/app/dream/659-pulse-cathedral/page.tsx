"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArcState,
  Phase,
  PHASE_BARS,
  createArc,
  stepArcBar,
  applyArcDerived,
} from "./arc";
import { PulseEngine } from "./synth";
import { createRenderer, Renderer, RenderInputs } from "./gl";

const IDLE_DEMO_MS = 2500;

export default function PulseCathedralPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [bpm, setBpm] = useState(124);
  const [energy, setEnergy] = useState(0.7);
  const [phase, setPhase] = useState<Phase>("BUILD");
  const [glMode, setGlMode] = useState<"webgl2" | "canvas2d" | null>(null);
  const [glFailed, setGlFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // refs that the animation loop / scheduler read without re-rendering
  const engineRef = useRef<PulseEngine | null>(null);
  const arcRef = useRef<ArcState>(createArc());
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const bpmRef = useRef(bpm);
  const energyRef = useRef(energy);
  const startedRef = useRef(false);
  const lastInteractRef = useRef<number>(performance.now());

  // visual envelopes (decay in the rAF loop)
  const kickFlashRef = useRef(0);
  const duckRef = useRef(0);
  const dropPulseRef = useRef(0);

  // autonomous-demo bar clock (only drives the arc when audio is NOT running)
  const demoBarAccRef = useRef(0);
  const demoForceDropRef = useRef(false);

  useEffect(() => {
    bpmRef.current = bpm;
    engineRef.current?.setBpm(bpm);
  }, [bpm]);
  useEffect(() => {
    energyRef.current = energy;
    engineRef.current?.setEnergy(energy);
  }, [energy]);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const phaseRefVal = useRef<Phase>("BUILD");

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  // ---- Start (user gesture -> AudioContext unlock) ----
  const handleStart = useCallback(async () => {
    markInteract();
    if (engineRef.current) {
      await engineRef.current.start();
      setStarted(true);
      return;
    }
    const engine = new PulseEngine(arcRef.current, {
      onKick: (_t, intensity) => {
        kickFlashRef.current = 1;
        duckRef.current = 0.3 + 0.6 * intensity;
      },
      onPhase: (p) => {
        setPhase(p);
        if (p === "DROP") dropPulseRef.current = 1;
      },
      onStep: (arc) => {
        // keep the React phase label loosely in sync
        if (arc.phase !== phaseRefVal.current) {
          phaseRefVal.current = arc.phase;
          setPhase(arc.phase);
        }
      },
    });
    engine.setBpm(bpmRef.current);
    engine.setEnergy(energyRef.current);
    engineRef.current = engine;
    await engine.start();
    setStarted(true);
  }, [markInteract]);

  const handleStop = useCallback(() => {
    markInteract();
    engineRef.current?.stop();
    engineRef.current = null;
    setStarted(false);
  }, [markInteract]);

  const forceDrop = useCallback(() => {
    markInteract();
    if (engineRef.current?.running) {
      engineRef.current.requestForcedDrop();
    } else {
      demoForceDropRef.current = true;
    }
  }, [markInteract]);

  const bumpEnergy = useCallback(
    (d: number) => {
      markInteract();
      setEnergy((e) => Math.min(1, Math.max(0, +(e + d).toFixed(2))));
    },
    [markInteract]
  );

  // ---- Keyboard controls ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        forceDrop();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        bumpEnergy(0.15);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        bumpEnergy(-0.15);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forceDrop, bumpEnergy]);

  // ---- Renderer + animation loop (always animates, audio or not) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
    setGlMode(renderer.mode);
    if (renderer.mode !== "webgl2") setGlFailed(true);

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    let prev = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const arc = arcRef.current;

      // Autonomous demo: whenever audio isn't running, advance the arc on a bar
      // clock so a silent glance (and the ~2.5s idle window before any gesture)
      // shows the journey alive. Once audio unlocks, the scheduler owns the arc.
      const sinceInteract = now - lastInteractRef.current;
      const audioRunning = engineRef.current?.running ?? false;
      if (!audioRunning) {
        // After the idle window, ensure the demo is visibly progressing.
        if (sinceInteract > IDLE_DEMO_MS && demoBarAccRef.current === 0) {
          demoBarAccRef.current = 0.0001;
        }
        const barsPerSec = bpmRef.current / 60 / 4; // 4 beats per bar
        demoBarAccRef.current += dt * barsPerSec;
        // synth kick "feel" for visuals: pulse on each beat
        const beatPhase = (demoBarAccRef.current * 4) % 1;
        if (beatPhase < dt * barsPerSec * 4) {
          kickFlashRef.current = 1;
          duckRef.current = 0.3 + 0.6 * arc.intensity;
        }
        while (demoBarAccRef.current >= 1) {
          demoBarAccRef.current -= 1;
          if (demoForceDropRef.current) {
            demoForceDropRef.current = false;
            if (arc.phase !== "DROP") {
              arc.phase = "BUILD";
              arc.barInPhase = PHASE_BARS.BUILD - 1;
              applyArcDerived(arc);
            }
          }
          const res = stepArcBar(arc);
          if (res.entered) {
            phaseRefVal.current = arc.phase;
            setPhase(arc.phase);
            if (res.entered === "DROP") dropPulseRef.current = 1;
          }
        }
        // smooth riser during build for visuals
        if (arc.phase === "BUILD") {
          const frac =
            (arc.barInPhase + demoBarAccRef.current) / PHASE_BARS.BUILD;
          arc.riser = Math.min(1, frac * frac);
        }
      } else {
        // audio drives arc; mirror visual riser from arc directly
        engineRef.current?.setBpm(bpmRef.current);
      }

      // decay envelopes
      kickFlashRef.current = Math.max(0, kickFlashRef.current - dt * 6);
      duckRef.current = Math.max(0, duckRef.current - dt * 5);
      dropPulseRef.current = Math.max(0, dropPulseRef.current - dt * 1.1);

      const input: RenderInputs = {
        time: now / 1000,
        intensity: arc.intensity,
        riser: arc.riser,
        kickFlash: kickFlashRef.current,
        duck: duckRef.current,
        phase: arc.phase,
        dropPulse: dropPulseRef.current,
      };
      renderer.render(input);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ---- Teardown engine on unmount ----
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const phaseColor =
    phase === "DROP"
      ? "text-amber-200"
      : phase === "SUSTAIN"
      ? "text-yellow-100"
      : "text-violet-300";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0a0612] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5">
        <h1 className="font-mono text-2xl font-semibold tracking-tight text-white/95">
          659 · Pulse Cathedral
        </h1>
        <p className="max-w-xl text-base text-white/75">
          An EDM build-and-drop journey arc — a euphoric four-on-the-floor
          cathedral of light that tensions through a riser and{" "}
          <span className="text-amber-200">breaks into a drop</span>, then climbs
          and never quite lands.
        </p>
        <p className="mt-1 font-mono text-base text-white/55">
          phase:{" "}
          <span className={`font-semibold ${phaseColor}`}>{phase}</span>
          {"  ·  "}
          {started ? "audio live" : "visuals only — press Start to sound it"}
        </p>
      </div>

      {/* WebGL fallback notice */}
      {glFailed && (
        <div className="absolute left-5 top-36 z-10 max-w-sm rounded-md border border-rose-400/40 bg-black/40 p-3 text-base text-rose-300">
          WebGL2 not available — running the Canvas2D fallback nave. Visuals are
          simplified but the arc still plays.
        </div>
      )}

      {/* Bottom control bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end gap-3 p-5">
        {!started ? (
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-amber-300/90 px-5 py-2.5 font-mono text-base font-semibold text-black transition hover:bg-amber-200"
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="min-h-[44px] rounded-md border border-white/30 bg-white/10 px-5 py-2.5 font-mono text-base font-semibold text-white/95 transition hover:bg-white/20"
          >
            ■ Stop
          </button>
        )}

        <button
          onClick={forceDrop}
          className="min-h-[44px] rounded-md border border-amber-300/50 bg-amber-300/15 px-4 py-2.5 font-mono text-base font-semibold text-amber-100 transition hover:bg-amber-300/30"
        >
          DROP ⏷ <span className="text-amber-200/70">(space)</span>
        </button>

        <div className="flex items-center gap-2 rounded-md border border-white/15 bg-black/30 px-4 py-2">
          <span className="font-mono text-base text-white/75">ENERGY</span>
          <button
            onClick={() => bumpEnergy(-0.15)}
            className="min-h-[44px] rounded px-3 py-2.5 font-mono text-base text-white/95 hover:bg-white/10"
            aria-label="less energy"
          >
            −
          </button>
          <span className="w-10 text-center font-mono text-base text-white/95">
            {Math.round(energy * 100)}
          </span>
          <button
            onClick={() => bumpEnergy(0.15)}
            className="min-h-[44px] rounded px-3 py-2.5 font-mono text-base text-white/95 hover:bg-white/10"
            aria-label="more energy"
          >
            +
          </button>
          <span className="ml-1 font-mono text-base text-white/55">↑/↓</span>
        </div>

        <label className="flex min-h-[44px] items-center gap-3 rounded-md border border-white/15 bg-black/30 px-4 py-2">
          <span className="font-mono text-base text-white/75">
            TEMPO {bpm}
          </span>
          <input
            type="range"
            min={120}
            max={130}
            step={1}
            value={bpm}
            onChange={(e) => {
              markInteract();
              setBpm(Number(e.target.value));
            }}
            className="w-32 accent-amber-300"
          />
        </label>

        <button
          onClick={() => setShowNotes((s) => !s)}
          className="ml-auto min-h-[44px] rounded-md border border-white/15 bg-black/30 px-4 py-2.5 font-mono text-base text-white/75 transition hover:text-white/95"
        >
          Design notes
        </button>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute bottom-24 right-5 z-20 max-w-md rounded-lg border border-white/15 bg-black/70 p-4 font-mono text-base text-white/75 backdrop-blur">
          <p className="mb-2 text-white/95">Design notes</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Look-ahead scheduler (setInterval ~25ms, +120ms ahead).</li>
            <li>
              Sidechain pump: the bass/pad bus ducks on every kick, then
              releases — watch the brightness dip-and-bloom.
            </li>
            <li>
              BUILD (8 bars, riser sweeps) → DROP (impact) → SUSTAIN → loop;
              Shepard-folded bass for the endless climb.
            </li>
            <li>WebGL2 cathedral nave; Canvas2D fallback.</li>
          </ul>
          <p className="mt-2 text-white/55">
            Full write-up:{" "}
            <span className="text-white/75">
              src/app/dream/659-pulse-cathedral/README.md
            </span>
          </p>
        </div>
      )}

      {/* GL mode badge */}
      {glMode && (
        <div className="pointer-events-none absolute right-5 top-5 z-10 font-mono text-base text-white/55">
          {glMode === "webgl2" ? "WebGL2" : "Canvas2D"}
        </div>
      )}
    </main>
  );
}
