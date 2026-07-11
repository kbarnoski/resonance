"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { DeepAudio } from "./audio";
import {
  PAD_HZ,
  PAD_COUNT,
  rootHzAt,
  deepLookAt,
  padTension,
} from "./harmony";
import { makeRenderer, type Renderer, type PadVisual } from "./gl";

// Desktop keyboard fallback (one key per pad).
const KEYS = ["a", "s", "d", "f", "g", "h"];

interface PadState {
  hit: number; // 0..1 flash, decays
  ten: number; // smoothed functional tension
}

export default function KidsDeep() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<DeepAudio | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const padsRef = useRef<PadState[]>(
    Array.from({ length: PAD_COUNT }, () => ({ hit: 0, ten: 0 })),
  );
  const energyRef = useRef(0);
  const startTimeRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [feel, setFeel] = useState("home");
  const [showNotes, setShowNotes] = useState(false);

  // Pad layout in NORMALIZED coords (y down). Two rows, generous spacing.
  // Big targets for a 4-year-old.
  const padLayout = useCallback((): { x: number; y: number; r: number }[] => {
    const cols = 3;
    const out: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < PAD_COUNT; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      out.push({
        x: (c + 0.5) / cols,
        y: 0.34 + r * 0.32,
        r: 0.13,
      });
    }
    return out;
  }, []);

  const triggerPad = useCallback((i: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const root = rootHzAt((performance.now() - startTimeRef.current) / 1000);
    const ten = padTension(PAD_HZ[i], root);
    const ok = audio.pluck(PAD_HZ[i], ten);
    if (ok) {
      padsRef.current[i].hit = 1;
      energyRef.current = Math.min(1, energyRef.current + 0.5);
    }
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeRenderer(canvas);
    if (!renderer) {
      setGlFailed(true);
    }
    rendererRef.current = renderer;

    const onResize = () => renderer?.resize();
    window.addEventListener("resize", onResize);

    const layout = padLayout();

    // ── Pointer input: hit-test against normalized pad circles ──────────
    const hitPad = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < layout.length; i++) {
        const dx = (nx - layout[i].x) * aspect;
        const dy = ny - layout[i].y;
        const d = Math.hypot(dx, dy);
        // generous 1.35x hit radius
        if (d < layout[i].r * 1.35 && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      const i = hitPad(e.clientX, e.clientY);
      if (i >= 0) triggerPad(i);
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const i = KEYS.indexOf(e.key.toLowerCase());
      if (i >= 0 && i < PAD_COUNT) triggerPad(i);
    };
    window.addEventListener("keydown", onKey);

    // ── Gentle ~2s auto-demo so a silent glance shows it alive ──────────
    const demoTimers: number[] = [];
    demoTimers.push(window.setTimeout(() => triggerPad(3), 700));
    demoTimers.push(window.setTimeout(() => triggerPad(1), 1500));
    demoTimers.push(window.setTimeout(() => triggerPad(4), 2300));

    // ── rAF loop ────────────────────────────────────────────────────────
    let raf = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const elapsed = (now - startTimeRef.current) / 1000;

      // migrate the drone root + update visual look
      const root = rootHzAt(elapsed);
      audioRef.current?.setRoot(root);
      const look = deepLookAt(elapsed);

      // smooth per-pad tension toward its current functional value
      const pads: PadVisual[] = [];
      for (let i = 0; i < PAD_COUNT; i++) {
        const target = padTension(PAD_HZ[i], root);
        const ps = padsRef.current[i];
        ps.ten += (target - ps.ten) * Math.min(1, dt * 4);
        ps.hit *= Math.pow(0.0001, dt); // ~fast decay
        if (ps.hit < 0.002) ps.hit = 0;
        pads.push({
          x: layout[i].x,
          y: layout[i].y,
          r: layout[i].r,
          hit: ps.hit,
          ten: ps.ten,
        });
      }
      energyRef.current *= Math.pow(0.2, dt); // decay energy

      rendererRef.current?.draw(
        elapsed,
        look.hue,
        look.warmth,
        energyRef.current,
        pads,
      );

      // throttle React feel label updates (cheap, but keep it calm)
      setFeel((f) => (f === look.feel ? f : look.feel));
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPointerDown);
      demoTimers.forEach((t) => clearTimeout(t));
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [started, padLayout, triggerPad]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    if (audioRef.current) return;
    try {
      const audio = new DeepAudio();
      audioRef.current = audio;
      startTimeRef.current = performance.now();
      await audio.start();
      setStarted(true);
    } catch {
      // even if something audio-side fails, still show the visual
      setStarted(true);
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#03060f] text-foreground px-4 py-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-1 text-foreground">
          Deep Drum
        </h1>
        <p className="text-base text-foreground mb-2">
          Tap the glowing stones. The ground beneath you slowly changes key — so
          the same beat feels brave, then mysterious, then home.
        </p>
        <p className="text-base text-muted-foreground mb-4">
          6 stones · a drone that drifts under your taps · no microphone, no
          reading
        </p>

        {!started ? (
          <div className="flex flex-col items-center gap-8 mt-8">
            <div className="grid grid-cols-3 gap-5">
              {PAD_HZ.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: 72,
                    height: 72,
                    background: `radial-gradient(circle at 40% 35%, hsl(${190 + i * 14},70%,62%), hsl(${200 + i * 14},60%,28%))`,
                    boxShadow: `0 0 24px hsl(${195 + i * 14},80%,55%)`,
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleStart}
              className="bg-violet-400/15 border border-violet-300/40 text-violet-100/95 text-xl font-semibold px-10 py-4 rounded-2xl min-h-[64px] min-w-[200px] active:scale-95 transition-transform"
            >
              Start
            </button>
            <p className="text-base text-muted-foreground text-center max-w-md">
              Listen for the deep hum sliding under your taps. Same stones, new
              feeling.
            </p>
          </div>
        ) : (
          <div className="relative w-full">
            <canvas
              ref={canvasRef}
              className="w-full rounded-2xl touch-none select-none"
              style={{
                height: "66vh",
                display: "block",
                background: "#03060f",
              }}
            />
            {glFailed && (
              <div className="absolute inset-0 flex items-center justify-center p-6 rounded-2xl bg-[#03060f]/90">
                <p className="text-violet-300 text-base text-center max-w-sm">
                  WebGL2 is not available on this device, so the deep can&apos;t
                  glow — but the drone and the stones still sound. Use keys
                  A·S·D·F·G·H to play.
                </p>
              </div>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="text-base text-muted-foreground font-mono">
                the deep feels{" "}
                <span className="text-foreground">{feel}</span>
              </span>
              <span className="text-base text-muted-foreground">
                keys: A S D F G H
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-5 text-base text-muted-foreground underline underline-offset-2"
        >
          {showNotes ? "Hide design notes" : "Design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 text-base text-muted-foreground space-y-2 leading-relaxed">
            <p>
              The six stones always play the <em>same</em> fixed pitches. Below
              them, a sustained drone slowly migrates its root through a heroic
              cycle (i → ♭VI → ♭VII → i over a low pedal), roughly every 18
              seconds.
            </p>
            <p>
              Because the stones stay put while the floor moves, each tap&apos;s
              relationship to the drone keeps changing — a note that was
              &ldquo;home&rdquo; becomes gently tense, then resolves. You hear
              harmony move under a constant action. Stones tint from teal toward
              violet as their tension rises; the whole deep warms to amber at the
              home resolution.
            </p>
            <p className="text-muted-foreground">
              Inspired by the Indian classical <em>tanpura</em>: a constant
              drone over which every other note gains its meaning. No
              &ldquo;wrong&rdquo; notes, no fail state — only changing colour.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-base text-muted-foreground">
          <span>For kids 4+ · zero permissions</span>
          <Link href="/dream" className="underline">
            ← dream lab
          </Link>
        </div>
      </div>
    </main>
  );
}
