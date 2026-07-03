"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeBowlAudio, type BowlAudio } from "./bowl-audio";
import { makeBowlScene, type BowlScene } from "./bowl-scene";

// ════════════════════════════════════════════════════════════════════════════
// 1133 · Resonant Bowl — a sound-bath you sink into.
//
// STRIKE (tap) excites a cluster of inharmonic singing-bowl overtones; RUB (drag
// across the surface) sustains the "sung" rim mode. Every partial's amplitude
// drives one concentric standing-wave light-shell in a true 3D three.js scene,
// so the ringing becomes slowly-breathing shells of teal→violet light expanding
// into a vast cool space. Idle for a few seconds and the bowl softly self-strikes
// so the page is never silent, never still.
// ════════════════════════════════════════════════════════════════════════════

export default function ResonantBowlPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<BowlAudio | null>(null);
  const sceneRef = useRef<BowlScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastInteractRef = useRef<number>(0);
  const nextAutoStrikeRef = useRef<number>(0);

  // pointer / rub tracking
  const pointerDownRef = useRef<boolean>(false);
  const lastPtRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const rubDecayRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const loop = useCallback(() => {
    const audio = audioRef.current;
    const scene = sceneRef.current;
    const now = performance.now();
    const timeSec = (now - startTimeRef.current) / 1000;

    // auto-demo: if idle, softly self-strike so it always sounds and moves
    if (audio && now - lastInteractRef.current > 5500) {
      if (now >= nextAutoStrikeRef.current) {
        audio.strike(0.35 + Math.random() * 0.3);
        nextAutoStrikeRef.current = now + 7000 + Math.random() * 5000;
      }
    }

    // let a held-still pointer's rub fade out gradually
    if (pointerDownRef.current) {
      rubDecayRef.current *= 0.9;
    }

    if (audio) {
      const state = audio.update();
      if (scene) scene.render(state.amps, state.energy, state.rub, timeSec);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const handleStart = useCallback(async () => {
    if (started) return;
    const audio = makeBowlAudio();
    if (!audio) return;
    audioRef.current = audio;
    await audio.resume();

    const container = containerRef.current;
    if (container) {
      const scene = makeBowlScene(container, 7);
      if (scene) {
        sceneRef.current = scene;
      } else {
        setWebglFailed(true);
      }
    }

    startTimeRef.current = performance.now();
    lastInteractRef.current = performance.now();
    nextAutoStrikeRef.current = performance.now() + 1400;
    setStarted(true);
    // first gentle strike so it opens with sound
    audio.strike(0.7);
    rafRef.current = requestAnimationFrame(loop);
  }, [started, loop]);

  // ── resize ──
  useEffect(() => {
    function onResize() {
      const c = containerRef.current;
      const s = sceneRef.current;
      if (c && s) s.resize(c.clientWidth, c.clientHeight);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── teardown on unmount ──
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      audioRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current = null;
    };
  }, []);

  // ── gesture handlers (strike + rim-rub) ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const audio = audioRef.current;
    if (!audio) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointerDownRef.current = true;
    lastPtRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    lastInteractRef.current = performance.now();
    audio.strike(0.8);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const audio = audioRef.current;
    if (!audio || !pointerDownRef.current) return;
    const prev = lastPtRef.current;
    const now = performance.now();
    if (prev) {
      const dt = Math.max(8, now - prev.t);
      const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
      const speed = Math.min(1, (dist / dt) * 0.9); // px/ms → 0..1
      // rubbing sustains: keep a decaying level that movement re-fills
      rubDecayRef.current = Math.min(1, rubDecayRef.current + speed * 0.5 + 0.06);
      audio.setRub(rubDecayRef.current, speed);
    }
    lastPtRef.current = { x: e.clientX, y: e.clientY, t: now };
    lastInteractRef.current = now;
  }, []);

  const endRub = useCallback(() => {
    const audio = audioRef.current;
    pointerDownRef.current = false;
    lastPtRef.current = null;
    rubDecayRef.current = 0;
    if (audio) audio.setRub(0, 0);
    lastInteractRef.current = performance.now();
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060f] text-white">
      {/* 3D resonance-bath */}
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endRub}
        onPointerCancel={endRub}
        onPointerLeave={endRub}
      />

      {/* Title + description (top-left) */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 max-w-xl p-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl">
          Resonant Bowl
        </h1>
        <p className="mt-2 text-base text-white/75 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          Strike and rub a singing bowl until the space around you rings into
          slow, breathing shells of light — a sound-bath you sink into.
        </p>
        {started && (
          <p className="mt-3 text-base text-white/75 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            Tap to strike · drag across to sing the rim.
          </p>
        )}
      </div>

      {/* WebGL fallback notice (audio still plays) */}
      {webglFailed && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-[min(90vw,32rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rose-400/40 bg-black/70 p-5 text-center">
          <p className="text-base text-rose-300">
            3D visuals could not start on this device (WebGL unavailable), but
            the singing bowl still sounds — tap and drag anywhere to play it.
          </p>
        </div>
      )}

      {/* Start overlay (primary action) */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#05060f]/80 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-full border border-teal-300/40 bg-teal-400/10 px-4 py-2.5 text-base font-medium text-white transition hover:bg-teal-400/20"
          >
            Begin the sound-bath
          </button>
          <p className="mt-4 max-w-sm px-6 text-center text-base text-white/75">
            Headphones and a quiet minute recommended. Sound begins on tap.
          </p>
        </div>
      )}

      {/* Design notes (corner disclosure) */}
      <div className="absolute bottom-14 right-4 z-30 max-w-sm">
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-lg border border-white/20 bg-black/50 px-4 py-2.5 text-base font-medium text-white/90 backdrop-blur-sm transition hover:bg-black/70"
        >
          {showNotes ? "Hide design notes" : "Design notes"}
        </button>
        {showNotes && (
          <div className="mt-2 rounded-xl border border-white/15 bg-black/80 p-4 text-base text-white/75 backdrop-blur-md">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-2">
              Seven <span className="text-white/95">inharmonic partials</span>{" "}
              (ratios 1, 2.76, 5.4, 8.93, 13.34, 18.64, 24.7) are summed with
              per-partial exponential decay; the fundamental is split into two
              detuned oscillators so it slowly <em>beats</em> — the singing-bowl
              wobble. Rubbing swells a driven &ldquo;sung&rdquo; level and opens
              a tone filter. Everything runs through a synthetic convolution
              reverb into a limiter.
            </p>
            <p className="mt-2">
              Each partial&rsquo;s amplitude drives one concentric{" "}
              <span className="text-white/95">standing-wave shell</span> of
              points, displaced by a Chladni-like spherical-harmonic function —
              rendered in true 3D three.js with additive glow. Idle a few
              seconds and the bowl self-strikes.
            </p>
            <p className="mt-2 text-white/75">
              References: Tibetan singing-bowl acoustics · Ernst Chladni nodal
              patterns / spherical harmonics · the drone-listening tradition of
              Lucier, La Monte Young &amp; Éliane Radigue.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
