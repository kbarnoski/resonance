"use client";

// 613 — Seismic Choir
// "What does the planet sound like right now?" The live global earthquake feed
// of the last 24 hours, sonified as an ominous trembling choir of resonant
// groans over a slowly rotating WebGPU globe of tectonic light.
// Lineage: Florian Dombois — auditory seismology / Earthquake Sounds.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadFeed, type Quake, type QuakeFeed } from "./quakes";
import { createSeismicAudio, type SeismicAudio } from "./audio";
import { initGpu, type GpuQuakePulse, type GpuFrameParams, type GpuRenderer } from "./gpu";
import { initRenderer2D, type Renderer2D } from "./render2d";

const LOOP_SECONDS = 60; // replay the whole 24h window in ~60s
const IDLE_AUTOSTART_MS = 2500;

type Backend = "WebGPU" | "Canvas2D" | "init";
type Source = "LIVE" | "SAMPLE" | "loading";

export default function SeismicChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<SeismicAudio | null>(null);

  // mutable state the rAF loop reads without re-rendering
  const quakesRef = useRef<Quake[]>([]);
  const pulsesRef = useRef<GpuQuakePulse[]>([]);
  const playingRef = useRef(false);
  const mutedRef = useRef(false);
  const speedRef = useRef(1);
  const timelineRef = useRef(0); // 0..1 position across the 24h window
  const nextIdxRef = useRef(0);
  const startedRef = useRef(false);

  const [backend, setBackend] = useState<Backend>("init");
  const [source, setSource] = useState<Source>("loading");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [count, setCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── load the seismic data ──
  useEffect(() => {
    const ctl = new AbortController();
    loadFeed(ctl.signal).then((feed: QuakeFeed) => {
      quakesRef.current = feed.quakes;
      setSource(feed.source);
      setCount(feed.quakes.length);
    });
    return () => ctl.abort();
  }, []);

  // ── renderer + animation loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let gpu: GpuRenderer | null = null;
    let r2d: Renderer2D | null = null;
    let raf = 0;
    let cancelled = false;
    const startMs = performance.now();
    let lastMs = startMs;

    function applyResize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return;
      if (gpu) gpu.resize(w, h);
      else if (r2d) r2d.resize(w, h);
      else {
        canvas.width = w;
        canvas.height = h;
      }
    }

    const analyserData = new Uint8Array(512);

    function computeAudioLevels(): { bass: number; level: number } {
      const a = audioRef.current?.analyser;
      if (!a) return { bass: 0, level: 0 };
      a.getByteFrequencyData(analyserData);
      let bassSum = 0;
      for (let i = 0; i < 24; i++) bassSum += analyserData[i];
      let total = 0;
      for (let i = 0; i < analyserData.length; i++) total += analyserData[i];
      return {
        bass: bassSum / (24 * 255),
        level: total / (analyserData.length * 255),
      };
    }

    function advanceTimeline(dtSec: number) {
      if (!playingRef.current) return;
      const quakes = quakesRef.current;
      if (quakes.length === 0) return;
      const span = quakes[quakes.length - 1].time - quakes[0].time || 1;
      const prev = timelineRef.current;
      let t = prev + (dtSec / LOOP_SECONDS) * speedRef.current;
      if (t >= 1) {
        // loop: reset
        t = 0;
        nextIdxRef.current = 0;
      }
      timelineRef.current = t;
      const cursorTime = quakes[0].time + t * span;
      // fire all quakes whose time we just passed
      while (
        nextIdxRef.current < quakes.length &&
        quakes[nextIdxRef.current].time <= cursorTime
      ) {
        const q = quakes[nextIdxRef.current];
        nextIdxRef.current++;
        audioRef.current?.triggerQuake(q);
        pulsesRef.current.push({
          lon: q.lon,
          lat: q.lat,
          mag: q.mag,
          depthN: Math.max(0, Math.min(700, q.depthKm)) / 700,
          startMs: performance.now(),
        });
      }
      // prune old pulses
      const now = performance.now();
      pulsesRef.current = pulsesRef.current.filter(
        (p) => (now - p.startMs) / 1000 < 1.2 + p.mag * 0.5
      );
    }

    function frame() {
      if (cancelled) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastMs) / 1000);
      lastMs = now;

      advanceTimeline(dt);
      const { bass, level } = computeAudioLevels();
      // recent big-quake flash → shake
      let shake = 0;
      for (const p of pulsesRef.current) {
        const age = (now - p.startMs) / 1000;
        if (p.mag >= 4 && age < 0.6) shake = Math.max(shake, (p.mag - 3) / 4);
      }
      shake += bass * 0.5;

      const params: GpuFrameParams = {
        timeSec: (now - startMs) / 1000,
        bass,
        level,
        rotation: ((now - startMs) / 1000) * 0.08, // slow rotation
        shake,
        pulses: pulsesRef.current,
        nowMs: now,
      };
      if (gpu) gpu.render(params);
      else if (r2d) r2d.render(params);

      // reflect timeline progress to UI occasionally
      setProgress(timelineRef.current);
      raf = requestAnimationFrame(frame);
    }

    (async () => {
      const g = await initGpu(canvas);
      if (cancelled) {
        g?.dispose();
        return;
      }
      if (g) {
        gpu = g;
        setBackend("WebGPU");
      } else {
        r2d = initRenderer2D(canvas);
        setBackend("Canvas2D");
      }
      applyResize();
      window.addEventListener("resize", applyResize);
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", applyResize);
      gpu?.dispose();
      r2d?.dispose();
    };
  }, []);

  // ── audio context init on gesture / autostart ──
  const runStart = useCallback(async () => {
    if (startedRef.current) {
      // already started → toggle play
      playingRef.current = !playingRef.current;
      setPlaying(playingRef.current);
      return;
    }
    startedRef.current = true;
    setStarted(true);
    try {
      const a = createSeismicAudio();
      await a.resume();
      audioRef.current = a;
    } catch {
      // audio failed — visuals still run
    }
    playingRef.current = true;
    setPlaying(true);
  }, []);

  // ── ~2.5s idle auto-start (visual timeline begins on its own) ──
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!startedRef.current) {
        // start the visual timeline without audio (no gesture yet)
        playingRef.current = true;
        setPlaying(true);
      }
    }, IDLE_AUTOSTART_MS);
    return () => window.clearTimeout(t);
  }, []);

  const applyMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    audioRef.current?.setMuted(m);
  }, []);

  const applySpeed = useCallback((delta: number) => {
    const next = Math.max(0.25, Math.min(8, speedRef.current * delta));
    speedRef.current = next;
    setSpeed(Math.round(next * 100) / 100);
  }, []);

  // ── keyboard controls ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        void runStart();
      } else if (e.key === "m" || e.key === "M") {
        applyMute();
      } else if (e.key === "]" || e.key === "+" || e.key === "=") {
        applySpeed(1.5);
      } else if (e.key === "[" || e.key === "-") {
        applySpeed(1 / 1.5);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runStart, applyMute, applySpeed]);

  // ── dispose audio on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const btn =
    "min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-muted text-foreground text-base font-mono hover:bg-accent active:bg-muted transition-colors";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top-left: title + concept */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7 max-w-xl">
        <h1 className="font-serif text-2xl sm:text-4xl text-foreground tracking-tight">
          Seismic Choir
        </h1>
        <p className="mt-2 text-base text-muted-foreground leading-snug">
          What does the planet sound like right now? Every real earthquake of the
          last 24&nbsp;hours becomes a deep resonant groan over a trembling globe
          of tectonic light.
        </p>
      </div>

      {/* top-right: badges */}
      <div className="absolute right-0 top-0 p-5 sm:p-7 flex flex-col items-end gap-1.5 text-right font-mono">
        <span className="text-violet-300/95 text-base">
          DATA: {source === "loading" ? "loading…" : source}
        </span>
        <span className="text-muted-foreground text-base">
          RENDER: {backend === "init" ? "detecting…" : backend}
        </span>
        <span className="text-muted-foreground text-base">{count} quakes / 24h</span>
      </div>

      {/* start overlay before first gesture */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={() => void runStart()}
            className="min-h-[44px] px-7 py-4 rounded-lg border border-violet-400/40 bg-violet-950/40 text-foreground text-xl font-serif backdrop-blur-sm hover:bg-violet-900/40 transition-colors pointer-events-auto"
          >
            ▶ Start the Choir
          </button>
        </div>
      )}

      {/* bottom: transport controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
        {/* timeline */}
        <div className="mb-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-violet-500/70"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button onClick={() => void runStart()} className={btn}>
            {playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <button onClick={applyMute} className={btn}>
            {muted ? "🔇 Unmute" : "🔊 Mute"}
          </button>
          <button onClick={() => applySpeed(1 / 1.5)} className={btn}>
            ◀ Slower
          </button>
          <span className="font-mono text-base text-muted-foreground min-w-[3.5rem] text-center">
            {speed}×
          </span>
          <button onClick={() => applySpeed(1.5)} className={btn}>
            Faster ▶
          </button>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className={btn + " ml-auto"}
          >
            Design notes
          </button>
        </div>
        <p className="mt-2 font-mono text-base text-muted-foreground">
          keys: space play/pause · m mute · [ / ] speed
        </p>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-5">
          <div className="max-w-lg rounded-lg border border-border bg-zinc-950/95 p-6 text-base text-foreground leading-relaxed">
            <h2 className="font-serif text-xl text-foreground mb-3">Design notes</h2>
            <p className="mb-3">
              Live USGS feed (all quakes, past 24h) sonified per Florian
              Dombois&apos; auditory seismology: magnitude → loudness, duration &amp;
              sub-bass depth; depth → brightness; longitude → stereo pan;
              latitude → resonance tilt. Each quake excites a bank of low,
              slightly inharmonic resonant filters — rock, not a synth pad.
            </p>
            <p className="mb-4 text-muted-foreground">
              No network → bundled sample dataset. No WebGPU → Canvas2D globe.
              Full notes &amp; honest self-assessment:
            </p>
            <div className="flex items-center justify-between">
              <Link
                href="/dream/613-seismic-choir/README.md"
                className="text-violet-300/95 underline"
                target="_blank"
              >
                README.md →
              </Link>
              <button onClick={() => setShowNotes(false)} className={btn}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
