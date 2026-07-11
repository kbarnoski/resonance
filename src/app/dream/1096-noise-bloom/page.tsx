"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { makeEngine, type NoiseBloomEngine } from "./audio";
import { makeField, type FieldRenderer } from "./render";
import { NOTES_MD } from "./notes";

type Phase = "intro" | "live" | "unsupported";

const IDLE_RESUME_MS = 4000; // return to auto-sweep this long after a drag
const SWEEP_PERIOD = 22; // seconds for a full slow noise sweep

function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-violet-300">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-muted-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function NoiseBloomPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [auto, setAuto] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const engineRef = useRef<NoiseBloomEngine | null>(null);
  const fieldRef = useRef<FieldRenderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const noiseRef = useRef(0.08); // current applied noise level 0..1
  const autoRef = useRef(true);
  const lastInteractRef = useRef(0);

  // DOM readouts updated inside the rAF loop (no per-frame React re-render)
  const handleRef = useRef<HTMLDivElement | null>(null);
  const sweetRef = useRef<HTMLDivElement | null>(null);
  const clarityBarRef = useRef<HTMLDivElement | null>(null);
  const clarityTxtRef = useRef<HTMLSpanElement | null>(null);
  const noiseTxtRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  // Feature detection for graceful degradation.
  useEffect(() => {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    if (!(window.AudioContext || w.webkitAudioContext)) {
      setPhase("unsupported");
    }
  }, []);

  const setNoiseFromClientY = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const t = 1 - (clientY - rect.top) / rect.height; // top = 1
    noiseRef.current = Math.max(0, Math.min(1, t));
    lastInteractRef.current = performance.now();
    if (autoRef.current) setAuto(false);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "live") return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setNoiseFromClientY(e.clientY);
    },
    [phase, setNoiseFromClientY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "live" || e.buttons === 0) return;
      setNoiseFromClientY(e.clientY);
    },
    [phase, setNoiseFromClientY],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (phase !== "live") return;
      let delta = 0;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = 0.03;
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -0.03;
      else if (e.key === "PageUp") delta = 0.1;
      else if (e.key === "PageDown") delta = -0.1;
      else return;
      e.preventDefault();
      noiseRef.current = Math.max(0, Math.min(1, noiseRef.current + delta));
      lastInteractRef.current = performance.now();
      if (autoRef.current) setAuto(false);
    },
    [phase],
  );

  const start = useCallback(async () => {
    try {
      const engine = makeEngine();
      await engine.start();
      engineRef.current = engine;
      const canvas = canvasRef.current;
      if (canvas) fieldRef.current = makeField(canvas);
      lastInteractRef.current = performance.now();
      setAuto(true);
      setPhase("live");
    } catch {
      setPhase("unsupported");
    }
  }, []);

  // Main loop: drive noise (auto-sweep or user), pump audio + visuals + meters.
  useEffect(() => {
    if (phase !== "live") return;
    const t0 = performance.now();

    const loop = () => {
      const engine = engineRef.current;
      const field = fieldRef.current;
      const now = performance.now();

      // idle -> resume auto-sweep
      if (!autoRef.current && now - lastInteractRef.current > IDLE_RESUME_MS) {
        setAuto(true);
      }

      if (autoRef.current) {
        // slow triangle-ish sweep through the sweet-spot and back; eased so
        // there is never a jump when auto takes over.
        const t = (now - t0) / 1000;
        const target = 0.5 + 0.42 * Math.sin((t * (Math.PI * 2)) / SWEEP_PERIOD);
        noiseRef.current += (target - noiseRef.current) * 0.06;
      }

      engine?.setNoiseLevel(noiseRef.current);
      const st = engine?.getState();

      if (field && st) {
        field.frame({
          clarity: st.clarity,
          pulse: st.pulse,
          noiseLevel: st.noiseLevel,
        });
      }

      // meters + dial position via refs
      if (st) {
        if (handleRef.current) {
          handleRef.current.style.bottom = `${noiseRef.current * 100}%`;
        }
        if (sweetRef.current) {
          sweetRef.current.style.bottom = `${st.sweetSpot * 100}%`;
        }
        if (clarityBarRef.current) {
          clarityBarRef.current.style.width = `${Math.round(st.clarity * 100)}%`;
        }
        if (clarityTxtRef.current) {
          clarityTxtRef.current.textContent = `${Math.round(st.clarity * 100)}%`;
        }
        if (noiseTxtRef.current) {
          noiseTxtRef.current.textContent = `${Math.round(noiseRef.current * 100)}`;
        }
        if (dialRef.current) {
          dialRef.current.setAttribute(
            "aria-valuenow",
            String(Math.round(noiseRef.current * 100)),
          );
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // Canvas resize.
  useEffect(() => {
    if (phase !== "live") return;
    const onResize = () => fieldRef.current?.resize();
    window.addEventListener("resize", onResize);
    fieldRef.current?.resize();
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // Teardown.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      fieldRef.current?.dispose();
      engineRef.current?.dispose();
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#06070c] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Noise Bloom
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          A melody hidden below hearing — add noise to bring it into being.
        </p>
      </div>

      {/* design-notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full px-4 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        design notes →
      </button>

      {/* intro / start */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-border bg-black/60 p-6 backdrop-blur-md">
            <h2 className="text-xl font-medium text-foreground">
              Hunt for the resonance
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A phrase is playing right now — too faint to hear. Add the right
              amount of noise and it phases into being. Too little: silence. Too
              much: it drowns. Find the sweet-spot in the middle. Headphones or a
              quiet room help.
            </p>
            <button
              type="button"
              onClick={start}
              className="mt-5 min-h-[44px] rounded-xl bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-200 ring-1 ring-inset ring-violet-400/40 transition-colors hover:bg-violet-500/30"
            >
              Start listening
            </button>
          </div>
        </div>
      )}

      {/* unsupported */}
      {phase === "unsupported" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-violet-400/20 bg-black/70 p-6 backdrop-blur-md">
            <h2 className="text-xl font-medium text-violet-300">
              Audio unavailable
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This piece needs the Web Audio API, which your browser did not
              expose. Try a recent Chrome, Safari, or Firefox to hear the melody
              bloom out of the noise.
            </p>
          </div>
        </div>
      )}

      {/* live controls */}
      {phase === "live" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 p-5 sm:p-7">
          {/* clarity meter */}
          <div className="max-w-xs flex-1">
            <div className="flex items-baseline justify-between font-mono text-sm text-muted-foreground">
              <span>clarity</span>
              <span ref={clarityTxtRef} className="text-violet-300">
                0%
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                ref={clarityBarRef}
                className="h-full rounded-full bg-gradient-to-r from-violet-500/60 to-violet-300"
                style={{ width: "0%" }}
              />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {auto
                ? "auto-sweeping — drag the dial to take over"
                : "you have the dial — release to resume the sweep"}
            </p>
          </div>

          {/* noise dial */}
          <div className="flex flex-col items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">
              noise <span ref={noiseTxtRef} className="text-foreground">8</span>
            </span>
            <div
              ref={dialRef}
              role="slider"
              aria-label="Noise level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={8}
              aria-orientation="vertical"
              tabIndex={0}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onKeyDown={onKeyDown}
              className="relative h-56 w-16 cursor-ns-resize touch-none select-none rounded-full border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
            >
              <div ref={trackRef} className="absolute inset-x-0 inset-y-2">
                {/* sweet-spot marker */}
                <div
                  ref={sweetRef}
                  className="pointer-events-none absolute -left-1 -right-1 h-0.5 -translate-y-1/2 bg-violet-300/70 shadow-[0_0_10px_rgba(196,181,253,0.8)]"
                  style={{ bottom: "50%" }}
                />
                {/* handle */}
                <div
                  ref={handleRef}
                  className="pointer-events-none absolute left-1/2 h-11 w-11 -translate-x-1/2 translate-y-1/2 rounded-full bg-violet-400/90 shadow-[0_0_18px_rgba(167,139,250,0.7)]"
                  style={{ bottom: "8%" }}
                />
              </div>
            </div>
            <span className="font-mono text-sm text-muted-foreground">drag ↕ / arrows</span>
          </div>
        </div>
      )}

      {/* notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm">
          <div className="h-full w-full max-w-lg overflow-y-auto border-l border-border bg-[#0a0b12] p-6 sm:p-8">
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mb-4 min-h-[44px] rounded-full px-4 py-2.5 font-mono text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ← close
            </button>
            <div className="space-y-1">{renderNotes(NOTES_MD)}</div>
            <p className="mt-6 font-mono text-sm text-muted-foreground/70">
              src/app/dream/1096-noise-bloom/README.md
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
