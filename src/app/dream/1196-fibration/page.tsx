"use client";

// ════════════════════════════════════════════════════════════════════════════
// Fibration (1196)
//
// THE ONE QUESTION: "What if you could float, drug-free, INSIDE the Hopf
// fibration — the way the 3-sphere fibres into interlocked great circles — as an
// NDE/meditative cosmic-ambient space: hundreds of glowing, mutually-linked
// rings forming nested tori that slowly rotate through 4D, each ring's position
// ringing a shimmering FM bell so the geometry SINGS the topology?"
//
// State/pole: near-death / deep-meditative boundlessness · cosmic-ambient (slow,
// weightless, luminous, chromatic — not black).
//
// Input degrades tilt → drag → auto-journey. Output is WebGL2 additive fibre
// lines (Canvas2D fallback). Audio is 2-op FM bells whose pitch/index track each
// lead fibre's latitude and projected radius. See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  axisQuat,
  buildFibres,
  fibrePoint,
  rotate4,
  stereo,
  type FibreConfig,
  type FibreGeometry,
  type Quat,
} from "./hopf";
import { FibrationRenderer } from "./render";
import { FmVoices } from "./synth";

const FIBRE_CONFIG: FibreConfig = {
  latRings: 7,
  perRing: 8,
  segments: 96,
  latMin: -0.82,
  latMax: 0.9,
};

const RADIUS_CAP = 6.0;

type Phase = "idle" | "running" | "paused";
type InputMode = "tilt" | "drag" | "auto";

/** iOS gates DeviceOrientation behind a permission call; feature-detected. */
interface OrientationPermissionAPI {
  requestPermission?: () => Promise<"granted" | "denied">;
}

interface LeadRef {
  baseIdx: number;
  prev: [number, number, number];
}

export default function FibrationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [rendererMode, setRendererMode] = useState<"webgl2" | "canvas2d" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const rendererRef = useRef<FibrationRenderer | null>(null);
  const synthRef = useRef<FmVoices | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const geoRef = useRef<FibreGeometry | null>(null);
  const leadsRef = useRef<LeadRef[]>([]);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  // rotation / camera accumulators
  const autoLRef = useRef<number>(0);
  const autoRRef = useRef<number>(0);
  const autoYawRef = useRef<number>(0);
  const camYawRef = useRef<number>(0);
  const camPitchRef = useRef<number>(0.34);

  // control stream (−1..1) from tilt or drag; auto uses slow sines
  const ctrlXRef = useRef<number>(0);
  const ctrlYRef = useRef<number>(0);
  const tiltRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = useRef<boolean>(false);
  const lastPtrRef = useRef<{ x: number; y: number } | null>(null);
  const inputModeRef = useRef<InputMode>("auto");

  // ── device tilt handler ──
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const gamma = e.gamma ?? 0; // left-right
    const beta = e.beta ?? 45; // front-back
    tiltRef.current = {
      x: Math.max(-1, Math.min(1, gamma / 40)),
      y: Math.max(-1, Math.min(1, (beta - 45) / 40)),
    };
  }, []);

  // ── pointer drag fallback ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!runningRef.current) return;
    draggingRef.current = true;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const last = lastPtrRef.current;
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    lastPtrRef.current = { x: e.clientX, y: e.clientY };
    const d = dragRef.current;
    d.x = Math.max(-1, Math.min(1, d.x + dx * 0.004));
    d.y = Math.max(-1, Math.min(1, d.y + dy * 0.004));
  }, []);
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastPtrRef.current = null;
  }, []);

  const stopEverything = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    window.removeEventListener("deviceorientation", onOrient);
    synthRef.current?.dispose();
    synthRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, [onOrient]);

  // keep canvas sized
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => stopEverything();
  }, [stopEverything]);

  const runFrame = useCallback((now: number) => {
    if (!runningRef.current) return;
    const dt = Math.min(0.05, (now - lastRef.current) / 1000);
    lastRef.current = now;
    const speed = reducedRef.current ? 0.45 : 1;

    // advance the ever-present auto drift (keeps the piece alive with no input)
    autoLRef.current += 0.06 * speed * dt;
    autoRRef.current += 0.037 * speed * dt;
    autoYawRef.current += 0.02 * speed * dt;

    // resolve the control stream by mode
    const mode = inputModeRef.current;
    let cx: number;
    let cy: number;
    if (mode === "tilt" && tiltRef.current) {
      cx = tiltRef.current.x;
      cy = tiltRef.current.y;
    } else if (mode === "drag") {
      cx = dragRef.current.x;
      cy = dragRef.current.y;
      // gentle self-centering so a nudge relaxes back into the auto-journey
      if (!draggingRef.current) {
        dragRef.current.x *= 0.985;
        dragRef.current.y *= 0.985;
      }
    } else {
      // auto-journey: the field breathes on slow incommensurate sines
      cx = Math.sin(now * 0.00013) * 0.7;
      cy = Math.sin(now * 0.00009 + 1.3) * 0.6;
    }
    // smooth the control stream
    ctrlXRef.current += (cx - ctrlXRef.current) * 0.05;
    ctrlYRef.current += (cy - ctrlYRef.current) * 0.05;
    const sx = ctrlXRef.current;
    const sy = ctrlYRef.current;

    // 4D rotation: two incommensurate quaternion turns, nudged by the control
    const qL: Quat = axisQuat(0.35, 1.0, 0.15, autoLRef.current + sx * 1.4);
    const qR: Quat = axisQuat(1.0, 0.25, 0.6, autoRRef.current + sy * 1.4);

    // camera orbit (gentle parallax, clamped pitch)
    camYawRef.current = autoYawRef.current + sx * 0.5;
    camPitchRef.current = Math.max(-1.1, Math.min(1.1, 0.34 + sy * 0.45));

    const renderer = rendererRef.current;
    if (renderer) {
      renderer.setState(qL, qR, camYawRef.current, camPitchRef.current, 3.4);
      renderer.frame(dt);
    }

    // couple lead fibres → FM voices
    const synth = synthRef.current;
    const geo = geoRef.current;
    if (synth && geo) {
      const leads = leadsRef.current;
      for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const b = geo.bases[lead.baseIdx];
        const q = fibrePoint(b.x, b.y, b.z, 0);
        const rp = rotate4(q, qL, qR);
        const [px, py, pz] = stereo(rp);
        const len = Math.hypot(px, py, pz);
        const k = RADIUS_CAP / (RADIUS_CAP + len);
        const cxp = px * k;
        const cyp = py * k;
        const czp = pz * k;
        const brightness = 1 - Math.exp(-len * 0.42);
        const motion = Math.min(
          1,
          Math.hypot(
            cxp - lead.prev[0],
            cyp - lead.prev[1],
            czp - lead.prev[2],
          ) * 14,
        );
        lead.prev = [cxp, cyp, czp];
        synth.setVoiceState(i, brightness, motion);
      }
      synth.update();
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    setAudioError(null);
    setNotice(null);

    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    // 1) gesture-gated audio
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
      setAudioError("Could not start audio. Try the button again.");
      return;
    }
    ctxRef.current = ctx;

    // 2) geometry (built once)
    const geo = geoRef.current ?? buildFibres(FIBRE_CONFIG);
    geoRef.current = geo;
    // lead = one fibre per latitude ring (first longitude)
    leadsRef.current = [];
    for (let li = 0; li < FIBRE_CONFIG.latRings; li++) {
      leadsRef.current.push({
        baseIdx: li * FIBRE_CONFIG.perRing,
        prev: [0, 0, 0],
      });
    }

    // 3) synth
    const synth = new FmVoices(ctx, FIBRE_CONFIG.latRings, reducedRef.current);
    synth.start();
    synthRef.current = synth;

    // 4) renderer
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new FibrationRenderer(canvas, geo);
      rendererRef.current = renderer;
      setRendererMode(renderer.rendererMode);
    }

    // 5) input: tilt → drag → auto
    let mode: InputMode = "drag"; // pointer-drag is the desktop baseline over auto
    const DOE =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as unknown as
            | OrientationPermissionAPI
            | undefined)
        : undefined;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
          mode = "tilt";
        } else {
          setNotice("Motion access denied — steer by dragging, or just watch the auto-journey.");
        }
      } catch {
        setNotice("Motion access unavailable — drag to steer, or watch the auto-journey.");
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
      mode = "tilt";
    }
    inputModeRef.current = mode;
    setInputMode(mode);

    // 6) run
    runningRef.current = true;
    setPhase("running");
    const t0 = performance.now();
    lastRef.current = t0;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [onOrient, runFrame]);

  const handlePause = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    synthRef.current?.mute();
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    if (runningRef.current || !rendererRef.current) return;
    synthRef.current?.unmute();
    runningRef.current = true;
    setPhase("running");
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handleStop = useCallback(() => {
    stopEverything();
    setPhase("idle");
    setRendererMode(null);
  }, [stopEverything]);

  const modeLabel =
    inputMode === "tilt"
      ? "tilt to turn the bundle"
      : inputMode === "drag"
        ? "drag to steer · auto-journey underneath"
        : "auto-journey";

  return (
    <main
      className="relative min-h-screen w-full touch-none overflow-hidden bg-[#0b0b16] text-foreground"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl">
          Fibration
        </h1>
        <p className="mt-2 max-w-2xl text-base text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
          Float inside the Hopf fibration — hundreds of interlocked great circles
          nesting into tori, turning through 4D, each ring ringing a shimmering FM
          bell.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-black/45 px-8 py-7 text-center backdrop-blur-md">
            <p className="max-w-md text-base text-foreground">
              A drug-free, boundless cosmic-ambient space. The 3-sphere fibres
              into linked circles; a slow 4D rotation carries you through them
              while the geometry sings in FM bells.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 text-base font-medium text-[#141024] shadow-lg transition-colors hover:bg-violet-200"
            >
              Enter the fibration
            </button>
            <p className="text-base text-muted-foreground">
              Sound + motion start on this tap. On a phone it will ask for motion
              access to let you tilt through 4D.
            </p>
            {audioError && (
              <p className="max-w-sm text-base text-violet-300">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* running / paused controls */}
      {phase !== "idle" && (
        <div className="absolute bottom-16 left-1/2 z-10 w-[min(94vw,620px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-black/50 px-5 py-4 backdrop-blur-md">
            <div className="min-w-[180px] flex-1">
              <div className="text-base font-medium text-foreground">
                {phase === "paused" ? "Paused" : "Adrift in S³"}
              </div>
              <div className="mt-1 font-mono text-base text-muted-foreground">
                {modeLabel}
                {rendererMode === "canvas2d" ? " · canvas2d" : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase === "running" ? (
                <button
                  onClick={handlePause}
                  className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 text-base font-medium text-[#141024] transition-colors hover:bg-violet-200"
                >
                  Resume
                </button>
              )}
              <button
                onClick={handleStop}
                className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                Stop
              </button>
            </div>
          </div>
          {notice && (
            <p className="mt-2 text-center text-base text-violet-300">{notice}</p>
          )}
        </div>
      )}

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base font-medium text-foreground backdrop-blur-md transition-colors hover:bg-black/60"
      >
        Design notes
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 w-[min(92vw,420px)] rounded-2xl border border-border bg-black/70 p-5 text-base text-foreground backdrop-blur-md">
          <p className="mb-2 font-serif text-xl text-foreground">The fibration sings</p>
          <p className="mb-2">
            Each glowing circle is a Hopf fibre — a great circle in the 3-sphere
            S³ — stereographically projected into space, where the fibres over
            each circle of latitude form a nested, linked torus. A slow
            unit-quaternion rotation turns the whole bundle through 4D.
          </p>
          <p className="mb-2 text-muted-foreground">
            Seven lead fibres drive 2-operator FM bells: base-latitude sets pitch,
            projected radius and motion set brightness and strike vigour. Slow,
            breath-paced, chromatic — no strobe.
          </p>
          <p className="text-muted-foreground">
            Refs: Hopf (1931); Niles Johnson&rsquo;s Hopf visualisation;
            Villarceau / Clifford tori; the Young–Radigue drone register, here in
            FM timbre.
          </p>
          <div className="mt-3">
            <Link href="/dream" className="text-violet-300 underline hover:text-violet-200">
              ← back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
