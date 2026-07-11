"use client";

// ════════════════════════════════════════════════════════════════════════════
// Auroral (1259)
//
// THE ONE QUESTION: "What if the cosmic-ambient void you dissolve into was the
// REAL aurora happening on Earth RIGHT NOW — the live global auroral oval,
// sonified and made into a slow luminous curtain-field?"
//
// A drug-free cosmic-ambient / boundless-void experience whose structure and
// intensity are driven by LIVE space-weather data (NOAA SWPC OVATION Aurora +
// planetary Kp). The piece is literally more overwhelming when Earth's aurora is
// more active. It is the aurora sibling of 1193-tremor-core (which rang live
// USGS quakes) — same spirit, different planet-scale live signal.
//
//   feeds.ts    — the two live NOAA feeds folded into one AuroraState (+ seeded
//                 offline fallback).
//   curtains.ts — the Canvas2D luminous auroral curtain field.
//   audio.ts    — the generative cosmic-ambient bed (shared psych toolkit).
//   page.tsx    — this: mount the field immediately, gesture-gate the audio,
//                 poll the feeds, and chime the brightest cells.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  fetchAuroraState,
  formatObs,
  kpLabel,
  type AuroraState,
} from "./feeds";
import { CurtainField } from "./curtains";
import { AuroraAudio } from "./audio";

type RunState = "idle" | "running";

export default function AuroralPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<CurtainField | null>(null);
  const audioRef = useRef<AuroraAudio | null>(null);
  const stateRef = useRef<AuroraState | null>(null);
  const pollRef = useRef<number | null>(null);
  const chimeRef = useRef<number | null>(null);
  const stepRafRef = useRef<number>(0);
  const lastStepRef = useRef<number>(0);

  const [runState, setRunState] = useState<RunState>("idle");
  const [aurora, setAurora] = useState<AuroraState | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // ── mount the curtain field immediately (before audio); start polling ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let field: CurtainField | null = null;
    try {
      field = new CurtainField(canvas);
    } catch {
      return;
    }
    fieldRef.current = field;
    field.start();

    const onResize = () => field?.resize();
    window.addEventListener("resize", onResize);

    let cancelled = false;
    const pull = async () => {
      const s = await fetchAuroraState();
      if (cancelled) return;
      stateRef.current = s;
      setAurora(s);
      field?.setState(s);
      audioRef.current?.setDrive(s.intensity);
    };
    void pull();
    // Live data refreshes every few minutes; OVATION updates ~every minute.
    pollRef.current = window.setInterval(() => void pull(), 120_000);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      field?.dispose();
      fieldRef.current = null;
    };
  }, []);

  // ── sparse aurora chimes: ring the brightest cells while audio runs ──
  const scheduleChimes = useCallback(() => {
    if (chimeRef.current) window.clearTimeout(chimeRef.current);
    const tick = () => {
      const audio = audioRef.current;
      const field = fieldRef.current;
      const s = stateRef.current;
      if (audio && field && s && s.hotspots.length > 0) {
        // pick a hotspot weighted toward the brightest
        const i = Math.floor(Math.pow(Math.random(), 1.7) * s.hotspots.length);
        const hot = s.hotspots[Math.min(i, s.hotspots.length - 1)];
        const energy = Math.min(1, hot.prob / 100);
        audio.ping(energy);
        field.pulseAt(hot);
      }
      // sparser when quiet, denser (but still gentle) during a storm
      const inten = s ? s.intensity : 0.3;
      const gap = 5200 - inten * 3400 + Math.random() * 2600;
      chimeRef.current = window.setTimeout(tick, gap);
    };
    chimeRef.current = window.setTimeout(tick, 2200);
  }, []);

  const handleStart = useCallback(async () => {
    if (audioRef.current) return;
    setAudioError(null);

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Try again after interacting.");
      return;
    }

    const audio = new AuroraAudio(ctx);
    audioRef.current = audio;
    audio.setDrive(stateRef.current?.intensity ?? 0.3);

    // per-frame Shepard advance
    lastStepRef.current = performance.now();
    const step = (now: number) => {
      const a = audioRef.current;
      if (!a) return;
      const dt = Math.min(0.05, (now - lastStepRef.current) / 1000);
      lastStepRef.current = now;
      a.step(dt);
      stepRafRef.current = requestAnimationFrame(step);
    };
    stepRafRef.current = requestAnimationFrame(step);

    scheduleChimes();
    setRunState("running");
  }, [scheduleChimes]);

  const stopAudio = useCallback(() => {
    if (stepRafRef.current) cancelAnimationFrame(stepRafRef.current);
    stepRafRef.current = 0;
    if (chimeRef.current) window.clearTimeout(chimeRef.current);
    chimeRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
  }, []);

  const handleStop = useCallback(() => {
    stopAudio();
    setRunState("idle");
  }, [stopAudio]);

  // teardown on unmount
  useEffect(() => {
    return () => stopAudio();
  }, [stopAudio]);

  const isLive = aurora?.source === "live";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#03040a] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* header */}
      <header className="relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-semibold text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl">
          Auroral
        </h1>
        <p className="mt-2 max-w-2xl text-base text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
          Earth&rsquo;s live auroral oval, sonified — the real global aurora
          happening right now, drifting overhead as a slow luminous curtain-field
          and a boundless cosmic-ambient void.
        </p>
      </header>

      {/* pre-start overlay */}
      {runState === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-black/45 px-8 py-7 text-center backdrop-blur-md">
            <p className="max-w-md text-base text-foreground">
              The curtains you see are the live NOAA aurora forecast this minute.
              The louder and more violet it gets, the more active Earth&rsquo;s
              real geomagnetic storm. Press begin to dissolve in.
            </p>
            <button
              onClick={handleStart}
              className="min-h-[44px] min-w-[44px] rounded-full bg-violet-200/90 px-4 py-2.5 text-base font-medium text-[#04140c] shadow-lg transition-colors hover:bg-violet-100"
            >
              ▶ Begin
            </button>
            <p className="text-base text-muted-foreground">
              Audio starts on this click — gesture-gated, with a limiter.
            </p>
            {aurora && (
              <p className="text-base text-muted-foreground">
                {isLive ? "● live" : "○ offline sample"} · Kp{" "}
                {aurora.kp.toFixed(0)} ({kpLabel(aurora.kp)}) ·{" "}
                {formatObs(aurora.observationTime)}
              </p>
            )}
            {aurora && !isLive && (
              <p className="max-w-sm text-base text-violet-300">
                using offline sample — live NOAA data unavailable
              </p>
            )}
            {audioError && (
              <p className="max-w-sm text-base text-violet-300">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* live readout while running */}
      {runState === "running" && (
        <div className="absolute bottom-16 left-1/2 z-10 w-[min(94vw,720px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-black/55 px-5 py-4 backdrop-blur-md">
            <div className="min-w-[220px] flex-1">
              {aurora ? (
                <div>
                  <div className="text-base font-medium text-foreground">
                    {isLive ? "Live aurora" : "Offline sample aurora"} · Kp{" "}
                    {aurora.kp.toFixed(0)} — {kpLabel(aurora.kp)}
                  </div>
                  <div className="mt-1 text-base text-muted-foreground">
                    peak {Math.round(aurora.peakProb)}% · observed{" "}
                    {formatObs(aurora.observationTime)}
                  </div>
                </div>
              ) : (
                <div className="text-base text-muted-foreground">
                  Reading the sky…
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span
                className={`text-base ${
                  isLive ? "text-violet-300/95" : "text-violet-300/95"
                }`}
              >
                {isLive ? "● NOAA SWPC live" : "○ offline sample"}
              </span>
              <button
                onClick={handleStop}
                className="min-h-[44px] min-w-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                ■ Stop
              </button>
            </div>
          </div>
          {aurora && !isLive && (
            <p className="mt-2 text-center text-base text-violet-300">
              using offline sample — live NOAA data unavailable
            </p>
          )}
          {audioError && (
            <p className="mt-2 text-center text-base text-violet-300">
              {audioError}
            </p>
          )}
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
