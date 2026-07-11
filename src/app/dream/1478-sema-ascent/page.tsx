"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScene, hasWebGL, type SemaScene } from "./scene";
import { startSemaAudio, type SemaAudio } from "./audio";
import { Conductor, evalArc, PREVIEW, TOTAL } from "./arc";
import { README } from "./readme";

type Phase = "loading" | "idle" | "running" | "nowebgl";

interface Hud {
  movement: string;
  elapsed: number;
  cycle: number;
}

interface OrientationCtor {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SemaAscentPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SemaScene | null>(null);
  const condRef = useRef<Conductor | null>(null);
  const audioRef = useRef<SemaAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const energyRef = useRef<number>(0);
  const leanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const runningRef = useRef<boolean>(false);
  const cycleRef = useRef<number>(1);
  const reducedRef = useRef<boolean>(false);
  const tiltRef = useRef<boolean>(false);
  const hudAccRef = useRef<number>(0);
  const orientRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const [phase, setPhase] = useState<Phase>("loading");
  const [hud, setHud] = useState<Hud>({
    movement: "Invocation",
    elapsed: 0,
    cycle: 1,
  });
  const [notesOpen, setNotesOpen] = useState(false);

  const surge = useCallback(() => {
    if (!runningRef.current) return;
    energyRef.current = Math.min(1, energyRef.current + 0.35);
  }, []);

  // ── build scene + run the single RAF loop (idle preview → running arc) ──────
  useEffect(() => {
    reducedRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!hasWebGL()) {
      setPhase("nowebgl");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = buildScene(canvas);
    sceneRef.current = scene;
    condRef.current = new Conductor();
    const rect = canvas.getBoundingClientRect();
    scene.resize(rect.width, rect.height);
    setPhase("idle");

    const frame = (nowT: number) => {
      const dt = lastRef.current ? Math.min(0.05, (nowT - lastRef.current) / 1000) : 0;
      lastRef.current = nowT;
      const cond = condRef.current;
      if (!cond) return;

      if (runningRef.current) {
        let elapsed = (nowT - startRef.current) / 1000;
        energyRef.current = Math.max(0, energyRef.current - dt * 0.06);
        if (elapsed >= TOTAL) {
          startRef.current = nowT; // gentle loop back to Invocation
          cycleRef.current += 1;
          elapsed = 0;
        }
        const d = evalArc(elapsed, energyRef.current, reducedRef.current);
        cond.step(dt, d.tempo, d.lock);
        scene.render(dt, d, cond.phase);
        audioRef.current?.step(dt, d);
        audioRef.current?.trigger(cond.crossings, d);

        hudAccRef.current += dt;
        if (hudAccRef.current > 0.25) {
          hudAccRef.current = 0;
          setHud({ movement: d.movement, elapsed, cycle: cycleRef.current });
        }
      } else {
        cond.step(dt, PREVIEW.tempo, 0);
        scene.render(dt, PREVIEW, cond.phase);
      }
      scene.setLean(leanRef.current.x, leanRef.current.y);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (orientRef.current) {
        window.removeEventListener("deviceorientation", orientRef.current);
      }
      audioRef.current?.stop();
      sceneRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── resize ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      sceneRef.current?.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── desktop fallback input: pointer-lean + Space surge (always active) ───────
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (tiltRef.current) return; // real tilt wins
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      leanRef.current = { x: x * 0.6, y: -y * 0.6 };
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        surge();
      }
    };
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [surge]);

  const addOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      tiltRef.current = true;
      const g = (e.gamma ?? 0) / 45;
      const b = ((e.beta ?? 0) - 45) / 45;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      leanRef.current = { x: clamp(g), y: clamp(b) };
    };
    orientRef.current = handler;
    window.addEventListener("deviceorientation", handler);
  }, []);

  // ── one-shot Begin: gesture-gated audio + orientation permission ────────────
  const begin = useCallback(async () => {
    if (phase !== "idle") return;
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;
    audioRef.current = startSemaAudio(ctx, reducedRef.current);

    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & OrientationCtor)
      | undefined;
    try {
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res === "granted") addOrientation();
      } else if (DOE) {
        addOrientation();
      }
    } catch {
      /* fall back silently to pointer + keyboard */
    }

    startRef.current = performance.now();
    runningRef.current = true;
    energyRef.current = 0;
    cycleRef.current = 1;
    setPhase("running");
  }, [phase, addOrientation]);

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-[#030209] text-foreground"
      onClick={() => surge()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Hero / Begin overlay (idle preview whirls dimly behind it) */}
      {(phase === "idle" || phase === "loading") && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#030209]/55 px-6 text-center backdrop-blur-[2px]">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-violet-300/95">
            drug-free sema · ecstatic ascent
          </p>
          <h1 className="font-semibold text-4xl text-foreground sm:text-5xl">
            Sema Ascent
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground">
            A whirling trance built as a six-minute climb. Nested rings of light
            spin at locked polyrhythmic ratios, accelerate, phase-lock into a
            white-hot peak, then set you gently down. Tilt your phone to lean the
            whirl; tap to surge. It plays itself to the end.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void begin();
            }}
            disabled={phase !== "idle"}
            className="min-h-[44px] rounded-full border border-violet-300/50 bg-violet-300/10 px-6 py-2.5 text-base text-violet-200 transition hover:bg-violet-300/20 disabled:opacity-60"
          >
            Begin the whirl
          </button>
          <p className="text-base text-muted-foreground">
            Headphones recommended. One gesture starts the sound; the ascent runs
            on its own.
          </p>
        </div>
      )}

      {/* WebGL-missing notice */}
      {phase === "nowebgl" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <p className="max-w-md text-base leading-relaxed text-violet-300">
            This piece needs WebGL to render the whirl, and your browser does not
            appear to support it. Try a recent desktop or mobile browser with
            hardware acceleration enabled.
          </p>
        </div>
      )}

      {/* Live HUD while running */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-xl border border-border bg-black/45 px-4 py-3 text-base backdrop-blur-md">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
            <span className="font-semibold text-violet-300/95">{hud.movement}</span>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-foreground">
            <dt className="text-muted-foreground">time</dt>
            <dd className="text-right tabular-nums">
              {fmtTime(hud.elapsed)} / 6:00
            </dd>
            <dt className="text-muted-foreground">cycle</dt>
            <dd className="text-right tabular-nums">{hud.cycle}</dd>
            <dt className="text-muted-foreground">input</dt>
            <dd className="text-right">
              {tiltRef.current ? "tilt" : "pointer"}
            </dd>
          </dl>
          <p className="mt-2 text-sm text-muted-foreground">tap / space = surge</p>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setNotesOpen((v) => !v);
        }}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition hover:text-foreground"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div
          className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-[#030209]/90 px-4 py-10 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-2xl">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-4 min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
            <pre className="whitespace-pre-wrap font-semibold text-base leading-relaxed text-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
