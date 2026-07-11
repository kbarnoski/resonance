"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloudAudio } from "./audio";
import { HandTracker, ghostHands, type Hand } from "./hands";
import { GpuField } from "./gpu";
import { CpuField } from "./cpu";
import { Attractor, MAX_ATTRACTORS } from "./shared";

type RunState = "idle" | "starting" | "running";
type Renderer = "webgpu" | "canvas2d" | "none";
type Input = "camera" | "ghost";

export default function HandCloudPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [run, setRun] = useState<RunState>("idle");
  const [renderer, setRenderer] = useState<Renderer>("none");
  const [input, setInput] = useState<Input>("ghost");
  const [notice, setNotice] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  // long-lived refs (not React state) for the render loop
  const gpuRef = useRef<GpuField | null>(null);
  const cpuRef = useRef<CpuField | null>(null);
  const audioRef = useRef<CloudAudio | null>(null);
  const handsRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const prevPinchRef = useRef<boolean[]>([]);
  const emaEnergyRef = useRef<number>(0);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    gpuRef.current?.dispose();
    gpuRef.current = null;
    cpuRef.current = null; // canvas 2d, nothing to free explicitly
    handsRef.current?.dispose();
    handsRef.current = null;
    audioRef.current?.dispose();
    audioRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Resize handling for whichever field is active.
  useEffect(() => {
    const onResize = () => {
      gpuRef.current?.resize();
      cpuRef.current?.resize();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loop = useCallback((nowMs: number) => {
    const last = lastTRef.current || nowMs;
    let dt = (nowMs - last) / 1000;
    lastTRef.current = nowMs;
    if (dt > 0.05) dt = 0.05;
    const time = (nowMs - startWallRef.current) / 1000;

    // ---- gather hands (camera, else ghost) ----
    let hands: Hand[] = [];
    const tracker = handsRef.current;
    if (tracker && tracker.mode === "camera") {
      hands = tracker.detect(nowMs).hands;
    }
    // Auto-demo: if no real hands (no camera OR camera sees nothing for now),
    // and we're past ~2s, drift ghost hands so the cloud always lives.
    const usingGhost = hands.length === 0;
    if (usingGhost && time > 2) {
      hands = ghostHands(time);
    }

    // ---- hands -> attractors + audio features ----
    const attractors: Attractor[] = [];
    let sumH = 0;
    let sumOpen = 0;
    let pinchPulses = 0;
    const pinchNow: boolean[] = [];

    for (let h = 0; h < hands.length; h++) {
      const hand = hands[h];
      // openness boosts pull + swirl: open palm blooms, closed gathers tighter
      const strength = 0.6 + hand.openness * 1.6;
      const swirl = 0.5 + hand.openness * 1.4 + (hand.isPinching ? 1.4 : 0);
      // pinch -> a single strong gather point at the centroid
      const pts = hand.isPinching ? hand.points.slice(0, 2) : hand.points;
      for (const p of pts) {
        if (attractors.length >= MAX_ATTRACTORS) break;
        attractors.push({
          x: p.x,
          y: p.y,
          strength: hand.isPinching ? strength * 2.4 : strength,
          swirl,
        });
      }
      sumH += 1 - hand.cy; // height: top of frame -> 1
      sumOpen += hand.openness;
      const wasPinch = prevPinchRef.current[h] ?? false;
      if (hand.isPinching && !wasPinch) pinchPulses++;
      pinchNow[h] = hand.isPinching;
    }
    prevPinchRef.current = pinchNow;

    const nH = Math.max(1, hands.length);
    const centroidHeight = sumH / nH;
    const openness = sumOpen / nH;

    // energy: EMA of attractor swirl magnitude as a proxy for motion
    let inst = 0;
    for (const a of attractors) inst += a.swirl;
    inst = Math.min(1, inst / 6);
    emaEnergyRef.current += (inst - emaEnergyRef.current) * 0.08;
    const energy = emaEnergyRef.current;

    audioRef.current?.update({
      centroidHeight,
      energy,
      openness,
      pinchPulses,
    });

    // ---- advance + render the field ----
    if (gpuRef.current) {
      gpuRef.current.frame(dt, time, attractors);
    } else if (cpuRef.current) {
      cpuRef.current.step(dt, time, attractors);
      cpuRef.current.render();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    if (run !== "idle") return;
    setRun("starting");
    setNotice("");

    const canvas = canvasRef.current;
    if (!canvas) {
      setRun("idle");
      return;
    }

    // 1) Audio (needs the user gesture we're inside of).
    try {
      const audio = new CloudAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    // 2) Visual field: try WebGPU, fall back to Canvas2D.
    let activeRenderer: Renderer = "none";
    const gpu = await GpuField.create(canvas);
    if (gpu) {
      gpuRef.current = gpu;
      activeRenderer = "webgpu";
    } else {
      try {
        cpuRef.current = new CpuField(canvas);
        activeRenderer = "canvas2d";
      } catch {
        activeRenderer = "none";
        setNotice("Could not create a drawing surface in this browser.");
      }
    }
    setRenderer(activeRenderer);

    // 3) Hands: try camera + MediaPipe, else ghost auto-demo.
    const tracker = new HandTracker();
    const ok = await tracker.start();
    handsRef.current = tracker;
    if (ok) {
      setInput("camera");
    } else {
      setInput("ghost");
      setNotice(
        `${tracker.reason} Running the hands-free auto-demo — invisible hands drift so the cloud keeps singing.`,
      );
    }

    // 4) Go.
    startWallRef.current = performance.now();
    lastTRef.current = 0;
    setRun("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [run, loop]);

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#04060f] text-foreground">
      {/* fullscreen field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* gradient veil for legible text over the cloud */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 to-transparent" />

      {/* header */}
      <header className="relative z-10 px-6 pt-6">
        <Link
          href="/dream"
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ← dream lab
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Hand Cloud
        </h1>
        <p className="mt-2 max-w-xl text-base text-muted-foreground">
          Wave your bare hands in front of the camera to conduct a glowing,
          singing cloud of light. Open your hand to make it bloom; pinch to
          gather a bright chiming star. There are no wrong notes.
        </p>
      </header>

      {/* start / status */}
      <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 px-6">
        {run !== "running" ? (
          <button
            onClick={start}
            disabled={run === "starting"}
            className="min-h-[44px] rounded-xl bg-violet-500/20 px-5 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30 disabled:opacity-60"
          >
            {run === "starting" ? "Starting…" : "Start (camera + sound)"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-1">
              render: {renderer === "webgpu" ? "WebGPU compute" : "Canvas2D (CPU)"}
            </span>
            <span className="rounded-md bg-muted px-2 py-1">
              input: {input === "camera" ? "camera hands" : "ghost auto-demo"}
            </span>
          </div>
        )}

        <button
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent"
        >
          Read the design notes
        </button>
      </div>

      {/* graceful-degrade notice */}
      {notice && (
        <p className="relative z-10 mt-3 max-w-xl px-6 text-base text-violet-300">
          {notice}
        </p>
      )}

      {/* design notes panel */}
      {showNotes && (
        <div className="relative z-10 mt-4 mx-6 max-w-2xl rounded-2xl bg-black/60 p-5 text-base text-muted-foreground ring-1 ring-border backdrop-blur">
          <p className="text-foreground">
            One question: what if a 4-year-old could conduct a glowing, singing
            cloud of light with bare hands in the air — no touching the screen?
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              <span className="text-foreground">Hands</span> come from{" "}
              <span className="font-mono text-foreground">
                MediaPipe HandLandmarker
              </span>{" "}
              (Google) over the webcam — up to 2 hands × 21 3D landmarks.
            </li>
            <li>
              <span className="text-foreground">The cloud</span> is{" "}
              {renderer === "webgpu" ? "120k" : "~3.2k"} particles advected by
              curl-noise and pulled toward your hands. WebGPU runs a real{" "}
              <span className="font-mono">@compute</span> kernel; without it a
              CPU integrator drives the same look on Canvas2D.
            </li>
            <li>
              <span className="text-foreground">Sound</span> snaps every voice to a
              C-major pentatonic over a soft drone, so nothing is ever wrong. A
              pinch rings a bright bell.
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            References: MediaPipe Hands (Google, on-device 21-landmark real-time
            hand tracking); curl-noise per Bridson (SIGGRAPH 2007) &amp; Memo
            Akten&apos;s particle-flow work.
          </p>
        </div>
      )}

      {/* footer hint */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-5">
        <p className="font-mono text-xs text-muted-foreground">
          open hand = bloom · pinch (thumb + index) = gather &amp; chime · stand
          back so your hands fit in frame
        </p>
      </footer>
    </div>
  );
}
