"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createAudioEngine, type AudioEngine, type Timbre } from "./audio";
import { createOnsetDetector, type OnsetDetector } from "./onset";
import { Looper } from "./looper";
import { Garden } from "./garden";

type Phase = "intro" | "playing" | "noWebGL";

export default function StompGardenPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [micErr, setMicErr] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [looping, setLooping] = useState(false);

  // Long-lived engine refs.
  const engineRef = useRef<AudioEngine | null>(null);
  const gardenRef = useRef<Garden | null>(null);
  const looperRef = useRef<Looper | null>(null);
  const detectorRef = useRef<OnsetDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const loopCursorRef = useRef(0); // last loop-phase 0..1 we played up to

  // WebGL capability check.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) setPhase("noWebGL");
    } catch {
      setPhase("noWebGL");
    }
  }, []);

  // One beat: grow a plant + play a soft hit (<50ms, immediate).
  function fireBeat(velocity: number, centroid: number, record = true) {
    const garden = gardenRef.current;
    const engine = engineRef.current;
    if (!garden || !engine) return;
    const timbre: Timbre = centroid > 0.5 ? "shaker" : "thump";
    garden.spawnPlant(velocity, centroid);
    engine.hit(timbre, velocity);
    if (record && looperRef.current) {
      looperRef.current.add(performance.now(), velocity, centroid);
      if (looperRef.current.active && !looping) setLooping(true);
    }
  }

  // Main animation + loop-playback + onset polling loop.
  function startRenderLoop() {
    const garden = gardenRef.current!;
    const looper = looperRef.current!;
    const engine = engineRef.current!;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);

      // Poll mic onsets (if we have a detector).
      const det = detectorRef.current;
      if (det) {
        const onset = det.poll();
        if (onset) fireBeat(onset.velocity, onset.centroid);
      }

      // Drive the looper playback: replay recorded beats in time, pulsing
      // the garden so the child has a steady pulse to lock onto.
      const now = performance.now();
      looper.tick(now);
      const state = looper.getState();
      if (state.beats.length >= 3) {
        const loopMs = state.loopMs;
        const phasePos = (now % loopMs) / loopMs; // 0..1
        const prev = loopCursorRef.current;
        // Detect beats crossed since last frame (handle wrap).
        const crossed = (pos: number) =>
          prev <= phasePos
            ? pos > prev && pos <= phasePos
            : pos > prev || pos <= phasePos;
        for (const b of state.beats) {
          if (crossed(b.pos)) {
            const timbre: Timbre = b.centroid > 0.5 ? "shaker" : "thump";
            engine.hit(timbre, b.velocity * 0.85);
            garden.loopPulse(0.5 + b.velocity * 0.6);
          }
        }
        loopCursorRef.current = phasePos;
        if (!looping) setLooping(true);
      } else if (looping) {
        setLooping(false);
      }

      garden.render();
    };
    tick();
  }

  // Gentle auto-demo: feeds a simple looping rhythm so the garden grows and
  // pulses on its own when there's no mic / no input yet.
  function startAutoDemo() {
    const pattern = [0, 480, 720, 960, 1440]; // a little groove (ms)
    let i = 0;
    const fire = () => {
      if (!gardenRef.current) return;
      const centroid = i % 2 === 0 ? 0.25 : 0.7; // alternate thump/shaker
      fireBeat(0.55 + Math.random() * 0.3, centroid, true);
      i++;
    };
    const schedule = () => {
      const base = pattern[0];
      pattern.forEach((p) =>
        window.setTimeout(fire, p - base + Math.random() * 40),
      );
    };
    // Kick a few rounds so the loop locks in, then the looper sustains it.
    schedule();
    window.setTimeout(schedule, 1800);
    window.setTimeout(schedule, 3600);
  }

  async function handleStart() {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Build engine + garden + looper.
    let engine: AudioEngine;
    try {
      engine = createAudioEngine();
    } catch {
      setPhase("noWebGL");
      return;
    }
    engineRef.current = engine;
    await engine.resume();
    engine.startAmbient();

    try {
      gardenRef.current = new Garden(canvas);
    } catch {
      setPhase("noWebGL");
      engine.teardown();
      return;
    }
    looperRef.current = new Looper();

    setPhase("playing");

    // Ask for the mic (rhythm only — never recorded/stored).
    let gotMic = false;
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        streamRef.current = stream;
        const src = engine.ctx.createMediaStreamSource(stream);
        detectorRef.current = createOnsetDetector(engine.ctx, src);
        gotMic = true;
      } catch {
        setMicErr("No microphone — tap the garden to make beats!");
      }
    } else {
      setMicErr("No microphone — tap the garden to make beats!");
    }

    startRenderLoop();
    // Always run a gentle auto-demo at the start so it's alive at a glance,
    // and it's the fallback when there's no mic.
    startAutoDemo();
    void gotMic;
  }

  // Tap fallback: every tap is an onset.
  function handleTap(e: React.PointerEvent) {
    if (phase !== "playing") return;
    // Vary timbre by tap height: top of screen = bright/shaker.
    const centroid = 1 - e.clientY / window.innerHeight;
    fireBeat(0.7, Math.min(1, centroid + 0.15));
  }

  // Resize handling.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => gardenRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Clean teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      gardenRef.current?.dispose();
      engineRef.current?.teardown();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1a1410] text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={handleTap}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Back link */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 rounded-full bg-black/40 px-4 py-2.5 text-base text-foreground backdrop-blur hover:text-foreground"
      >
        ← Garden
      </Link>

      {/* Intro / start */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#231a12] to-[#140f0a] px-6 text-center">
          <div className="text-6xl">🌱👏🌸</div>
          <h1 className="text-3xl font-bold text-foreground sm:text-5xl">
            Stomp Garden
          </h1>
          <p className="max-w-md text-lg text-foreground">
            Clap, stomp, or tap a beat. Your rhythm grows a glowing garden — then
            it plays your beat back so you can dance along!
          </p>
          <button
            onClick={handleStart}
            className="rounded-3xl bg-gradient-to-br from-violet-400 to-violet-500 px-10 py-6 text-2xl font-bold text-[#1a1410] shadow-lg shadow-violet-500/30 active:scale-95"
            style={{ minHeight: 64, minWidth: 220 }}
          >
            👏 Clap to grow!
          </button>
        </div>
      )}

      {/* No WebGL fallback */}
      {phase === "noWebGL" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-5xl">🌼</div>
          <h1 className="text-2xl font-bold text-foreground">
            The garden needs a 3D screen
          </h1>
          <p className="max-w-md text-lg text-foreground">
            This device can&apos;t show the glowing garden right now. Try a
            different browser or device — and come back to clap!
          </p>
        </div>
      )}

      {/* Playing HUD */}
      {phase === "playing" && (
        <>
          {micErr && (
            <div className="absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-2xl bg-black/50 px-5 py-3 text-center text-base text-violet-300 backdrop-blur">
              {micErr}
            </div>
          )}
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/40 px-5 py-2.5 text-base text-foreground backdrop-blur">
            {looping ? "🌸 Your beat is looping — dance along!" : "👏 Make a beat!"}
          </div>

          {/* Design notes toggle (nice-to-have) */}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="absolute right-4 top-4 z-20 rounded-full bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur hover:text-foreground"
            aria-label="Design notes"
          >
            ⓘ
          </button>
          {showNotes && (
            <div className="absolute right-4 top-16 z-20 max-w-xs rounded-2xl bg-black/70 p-4 text-base text-foreground backdrop-blur">
              <p className="mb-2 font-semibold text-foreground">Design notes</p>
              <p>
                The mic listens for <b>onsets</b> (claps/stomps/taps), not pitch.
                Each beat grows a plant and plays a soft hit. After a few beats
                your rhythm is lightly quantized and <b>looped back</b> — the
                garden pulses in time so you can lock onto your own beat.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
