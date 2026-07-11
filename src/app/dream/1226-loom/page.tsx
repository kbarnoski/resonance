"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Loom (1226) — SCANNED SYNTHESIS
//
// THE ONE QUESTION: What if you could pluck a physical membrane and HEAR ITS
// SHAPE — the vibrating surface itself is the waveform you're listening to?
//
// A closed ring of N=128 masses (a 1D circular mass-spring string) is simulated
// at the slow, visible "haptic" dynamics rate every animation frame. Its
// instantaneous shape IS a single-cycle wavetable; an audio oscillator scans
// around the loop at the note's pitch. Because the table is the live moving
// physical shape, the timbre morphs continuously as the ring wobbles. Plucking
// changes both what you see and what you hear.
//
// Reference: Bill Verplank, Max Mathews & Robert Shaw,
//   "Scanned Synthesis," ICMC 2000.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildAudio, type LoomAudio } from "./audio";
import { createRenderer, type LoomRenderer } from "./renderer";
import { makeRing, pluckRing, stepRing, RING_N, type RingState } from "./ring";

// D Dorian across the QWERTY home row.  MIDI: D4 E4 F4 G4 A4 B4 C5 D5
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const DEGREE_MIDI = [62, 64, 65, 67, 69, 71, 72, 74];
const DEGREE_NAME = ["D", "E", "F", "G", "A", "B", "C", "D'"];
const DEGREE_FREQ = DEGREE_MIDI.map((m) => 440 * Math.pow(2, (m - 69) / 12));

type AppState = "idle" | "running" | "error";

export default function LoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<LoomRenderer | null>(null);
  const audioRef = useRef<LoomAudio | null>(null);
  const ringRef = useRef<RingState | null>(null);
  const rafRef = useRef(0);
  const clockRef = useRef(0);
  const lastTimeRef = useRef(0);
  const scanPhaseRef = useRef(0);
  const runningRef = useRef(false);
  const selectedRef = useRef(4); // default degree "A"
  const lastInteractRef = useRef(0);
  const nextAutoRef = useRef(0);
  const mountedRef = useRef(true);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  const [appState, setAppState] = useState<AppState>("idle");
  const [selected, setSelected] = useState(4);
  const [audioMode, setAudioMode] = useState<"worklet" | "additive" | null>(null);
  const [glOk, setGlOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // ── Pluck + play a note ────────────────────────────────────────────────────
  const runPluck = useCallback(
    (index: number, degree: number, amp: number, kick: number) => {
      const ring = ringRef.current;
      if (ring) pluckRing(ring, index, 6, amp, kick);
      if (runningRef.current) audioRef.current?.noteOn(DEGREE_FREQ[degree]);
      rendererRef.current?.flareAt(index);
      lastInteractRef.current = clockRef.current;
    },
    [],
  );

  const selectDegree = useCallback(
    (degree: number) => {
      selectedRef.current = degree;
      setSelected(degree);
      // pluck at a spot that maps to this scale degree around the loop
      const index = Math.round((degree / DEGREE_MIDI.length) * RING_N);
      runPluck(index, degree, 0.9, 3.5);
    },
    [runPluck],
  );

  // ── Begin: gesture-gate audio ──────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (runningRef.current || appState === "running") return;
    let audio: LoomAudio;
    try {
      audio = await buildAudio();
    } catch {
      setAppState("error");
      return;
    }
    if (!mountedRef.current) {
      audio.stop();
      return;
    }
    audioRef.current = audio;
    setAudioMode(audio.mode);
    runningRef.current = true;
    setAppState("running");
    lastInteractRef.current = clockRef.current;
    nextAutoRef.current = clockRef.current + 1.2;
  }, [appState]);

  // ── Pointer pluck on the ring ──────────────────────────────────────────────
  const pointerPluck = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, kick: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // screen angle around centre → loop index (screen-y is down)
      let ang = Math.atan2(-(e.clientY - cy), e.clientX - cx);
      if (ang < 0) ang += Math.PI * 2;
      const index = Math.round((ang / (Math.PI * 2)) * RING_N) % RING_N;
      runPluck(index, selectedRef.current, 0.85, kick);
    },
    [runPluck],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointerPluck(e, 4.0);
    },
    [pointerPluck],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return; // only while dragging
      pointerPluck(e, 2.2);
    },
    [pointerPluck],
  );

  // ── Keyboard plucks ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      const idx = KEYS.indexOf(e.key.toLowerCase());
      if (idx >= 0) {
        e.preventDefault();
        selectDegree(idx);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectDegree]);

  // ── Main loop: sim + render always; audio only when running ────────────────
  useEffect(() => {
    mountedRef.current = true;
    ringRef.current = makeRing(RING_N);

    if (canvasRef.current) {
      const r = createRenderer(canvasRef.current);
      if (r) {
        rendererRef.current = r;
        setGlOk(true);
        const ro = new ResizeObserver(() => rendererRef.current?.resize());
        ro.observe(canvasRef.current);
        resizeObsRef.current = ro;
      } else {
        setGlOk(false);
      }
    }

    lastTimeRef.current = performance.now();

    const frame = (now: number) => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(frame);

      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (!(dt > 0) || dt > 0.1) dt = 1 / 60;
      clockRef.current += dt;

      const ring = ringRef.current;
      if (ring) {
        stepRing(ring, dt, clockRef.current, 7.0);

        if (runningRef.current) {
          audioRef.current?.pushTable(ring.pos);

          // auto-pluck when the user is idle so it plays itself
          if (
            clockRef.current - lastInteractRef.current > 4 &&
            clockRef.current > nextAutoRef.current
          ) {
            const deg = Math.floor(Math.random() * DEGREE_MIDI.length);
            const index = Math.round((deg / DEGREE_MIDI.length) * RING_N);
            runPluck(index, deg, 0.55, 2.2);
            nextAutoRef.current =
              clockRef.current + 3 + Math.random() * 2;
            lastInteractRef.current = clockRef.current - 4.5; // stay idle
          }
        }

        // visible scan cursor: a slowed representation of the audio-rate read
        scanPhaseRef.current = (scanPhaseRef.current + dt * 0.45) % 1;
        rendererRef.current?.update(ring.pos, scanPhaseRef.current, dt);
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      resizeObsRef.current?.disconnect();
      rendererRef.current?.dispose();
      audioRef.current?.stop();
      rendererRef.current = null;
      audioRef.current = null;
    };
  }, [runPluck]);

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(circle at 50% 38%, #0d3b40 0%, #0a1524 46%, #1a0a1e 100%)",
      }}
    >
      {/* three.js ring — also the pluck surface */}
      <div
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <canvas ref={canvasRef} className="block w-full h-full" aria-hidden />
      </div>

      {/* WebGL failure notice */}
      {!glOk && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-6">
          <p className="text-violet-300 text-base text-center">
            WebGL is unavailable, so the 3D ring can&apos;t render. Audio still
            works — press Begin and use the keys below to pluck.
          </p>
        </div>
      )}

      {/* UI overlay */}
      <div className="relative z-10 flex flex-col min-h-screen px-6 py-8 pointer-events-none">
        <header className="flex flex-col gap-2 max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Loom
          </h1>
          <p className="text-base text-muted-foreground">
            Pluck a physical membrane and hear its shape — the vibrating ring{" "}
            <span className="text-foreground">is</span> the waveform you&apos;re
            listening to.
          </p>
        </header>

        <div className="flex-1" />

        <div className="flex flex-col gap-4 pointer-events-auto">
          {appState === "running" && audioMode === "additive" && (
            <p className="text-muted-foreground text-base font-mono">
              additive-resynthesis fallback active (no AudioWorklet)
            </p>
          )}
          {appState === "error" && (
            <p className="text-violet-300 text-base">
              The audio engine failed to start. Please refresh and try again.
            </p>
          )}

          {/* Scale-degree row */}
          {appState === "running" && (
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-base font-mono">
                pluck a string — keys a s d f g h j k
              </span>
              <div className="flex flex-wrap gap-2">
                {DEGREE_NAME.map((name, i) => (
                  <button
                    key={i}
                    onClick={() => selectDegree(i)}
                    className={[
                      "min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium transition-all",
                      selected === i
                        ? "bg-violet-500/85 text-foreground shadow-lg shadow-violet-500/30"
                        : "bg-muted text-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    <span className="font-mono">{KEYS[i]}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Begin */}
          {appState !== "running" && (
            <button
              onClick={() => void handleBegin()}
              className="min-h-[44px] w-fit px-6 py-2.5 rounded-xl bg-violet-400 hover:bg-violet-300 text-slate-900 text-base font-semibold transition-all shadow-lg shadow-violet-400/30"
            >
              Begin — pluck to play
            </button>
          )}

          {/* Design notes */}
          <div>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-muted-foreground text-base hover:text-foreground transition-colors min-h-[44px] px-2 py-2.5 font-mono"
            >
              {showNotes ? "hide design notes ↑" : "design notes ↓"}
            </button>
            {showNotes && (
              <div className="mt-2 p-4 rounded-xl bg-black/25 border border-border max-w-xl backdrop-blur-sm">
                <p className="text-foreground text-base leading-relaxed">
                  <strong className="text-foreground">Scanned synthesis.</strong>{" "}
                  A closed ring of 128 masses is a 1D circular mass-spring string
                  integrated at the slow, visible haptic rate. Its instantaneous
                  shape is a single-cycle wavetable; an AudioWorklet oscillator
                  scans around the loop at the note&apos;s pitch, so the timbre
                  morphs as the ring wobbles. The gold dot is a slowed
                  representation of the audio-rate read head.
                </p>
                <p className="text-muted-foreground text-base mt-2 font-mono">
                  Verplank, Mathews &amp; Shaw — &ldquo;Scanned
                  Synthesis&rdquo;, ICMC 2000.
                </p>
                <Link
                  href="/dream/1226-loom/README.md"
                  className="text-violet-300 text-base hover:text-violet-200 underline mt-2 inline-block"
                >
                  full notes →
                </Link>
              </div>
            )}
          </div>

          <div className="mt-2 pt-4 border-t border-border">
            <p className="text-muted-foreground/70 text-base font-mono">
              loom · dream lab 1226 · three.js + scanned-synthesis worklet
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
