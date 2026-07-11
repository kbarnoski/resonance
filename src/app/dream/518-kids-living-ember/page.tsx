"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 518 — Kids: Living Ember
//
// A single small living ember / glowing field-creature that is simply HERE
// with the child. No win, no fail, no resolve. The child keeps it company
// by humming — each hum blooms the ember and leaves a warm trace that drifts
// into its ever-evolving morphology. Over many minutes the ember slowly
// BECOMES something new, carrying everything the child gave it.
//
// References:
//   teamLab Sketch Aquarium / Future Park — a creature you inhabit, not solve
//   Brian Eno, Ambient 1: Music for Airports — long-form, non-repeating
//   Pearson 1993 / Gray-Scott — reaction-diffusion Turing patterns
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildEmberGpu } from "./gpu";
import { buildAudio } from "./audio";
import { tickMemory, resetMemory, autoDemoRms } from "./memory";
import type { EmberGpu } from "./gpu";
import type { EmberAudio } from "./audio";
import type { EmberState } from "./memory";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";

// ── Mic RMS helper (module-level, takes refs as args — no stale closure) ──────

function computeRms(
  analyser: AnalyserNode | null,
  buf: Float32Array | null
): number {
  if (!analyser || !buf) return 0;
  analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LivingEmberPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [gpuAvailable, setGpuAvailable] = useState<boolean | null>(null); // null = unknown
  const [micError, setMicError] = useState<string | null>(null);
  const [gpuError, setGpuError] = useState<string | null>(null);
  const [showDesignNotes, setShowDesignNotes] = useState(false);

  // Canvas ref for WebGPU
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Engine refs — kept in refs so rAF loop can read them without stale closure
  const gpuRef       = useRef<EmberGpu | null>(null);
  const audioRef     = useRef<EmberAudio | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyser  = useRef<AnalyserNode | null>(null);
  const micBuf       = useRef<Float32Array | null>(null);
  const rafRef       = useRef<number>(0);

  // State for fallback breathing animation
  const breathRef    = useRef(0); // 0..1 CSS scale
  const stateRef     = useRef<EmberState | null>(null);

  // Auto-update audio params from drift state every ~250ms
  const audioUpdateTimer = useRef<number | null>(null);

  // Time tracking
  const startTimeRef = useRef<number>(0);

  // ── Feature detect WebGPU on mount (show fallback immediately if absent) ───
  useEffect(() => {
    setGpuAvailable(!!navigator.gpu);
  }, []);

  // ── Main rAF loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const t = (performance.now() - startTimeRef.current) / 1000;

    // Get current hum energy: real mic or auto-demo (module-level fn, no deps)
    const hasMic = micAnalyser.current !== null;
    const micRms = hasMic ? computeRms(micAnalyser.current, micBuf.current) : 0;
    const demoRms = hasMic ? 0 : autoDemoRms(t);
    const rms = Math.min(1, (micRms + demoRms) * 2.2);

    // Tick memory state
    const state = tickMemory(t, rms);
    stateRef.current = state;

    // Derived warmth for display (f drifts in [0.02..0.08], baseline 0.054)
    const warmth = Math.min(1, state.totalHum * 0.1 + 0.2 + (state.f - 0.054) * 8);

    // GPU path: run RD step + render
    const gpu = gpuRef.current;
    if (gpu) {
      try {
        gpu.frame({
          f: state.f,
          k: state.k,
          humBoost: state.humBoost,
          bloom: state.bloom,
          warmth,
          seedPulse: rms > 0.15 ? rms : 0,
          time: t,
        });
      } catch {
        // GPU error mid-session — continue without crashing
      }
    } else {
      // Fallback: update CSS breathing animation value
      breathRef.current = 0.88 + state.bloom * 0.12 + state.humBoost * 0.08;
      // Apply to DOM directly for smooth 60fps without React re-render
      const el = document.getElementById("ember-fallback");
      if (el) {
        const scale = breathRef.current;
        const hue = 20 + warmth * 30 + state.humBoost * 20; // amber range
        (el as HTMLElement).style.transform = `scale(${scale.toFixed(3)})`;
        (el as HTMLElement).style.filter =
          `hue-rotate(${Math.round(hue)}deg) brightness(${(0.7 + state.humBoost * 0.5 + state.bloom * 0.25).toFixed(2)})`;
      }
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, []); // empty deps — all state read via refs

  // ── Start handler (must be inside user gesture for iOS AudioContext) ────────
  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    resetMemory();
    startTimeRef.current = performance.now();

    // 1. Build audio (MUST be first thing in user gesture)
    let audio: EmberAudio | null = null;
    try {
      audio = buildAudio();
      audioRef.current = audio;
      if (audio.ctx.state === "suspended") {
        await audio.ctx.resume();
      }
    } catch {
      // Audio failed — continue without sound (shouldn't happen on supported browsers)
      audioRef.current = null;
    }

    // 2. Open mic (optional — falls back to auto-demo if denied)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      if (audio) {
        const src = audio.ctx.createMediaStreamSource(stream);
        const analyser = audio.ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        // NOT connected to destination — no feedback loop
        micAnalyser.current = analyser;
        micBuf.current = new Float32Array(analyser.frequencyBinCount);
        setMicError(null);
      }
    } catch {
      setMicError("No mic — auto-demo mode. The ember hums for itself.");
    }

    // 3. Initialize WebGPU renderer
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const gpu = await buildEmberGpu(canvas);
        if (gpu) {
          gpuRef.current = gpu;
          setGpuError(null);
        } else {
          gpuRef.current = null;
          setGpuError("WebGPU not available — showing CSS ember instead.");
        }
      } catch {
        gpuRef.current = null;
        setGpuError("WebGPU failed to initialize — showing CSS ember instead.");
      }
    }

    // 4. Audio update timer (~4×/s, no GPU readback)
    audioUpdateTimer.current = window.setInterval(() => {
      const state = stateRef.current;
      const au = audioRef.current;
      if (state && au) {
        au.updateFromState(state);
      }
    }, 250);

    setPhase("running");
  }, [phase]);

  // ── Start rAF loop when running ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    rafRef.current = requestAnimationFrame(runLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, runLoop]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (audioUpdateTimer.current !== null) {
        window.clearInterval(audioUpdateTimer.current);
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      gpuRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  // ── GPU availability from pre-check (sets which visual we show) ───────────
  const showGpu = gpuAvailable && !gpuError;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen w-full bg-[#0d0503] text-foreground flex flex-col items-center">
      <div className="w-full max-w-2xl px-5 py-8 flex flex-col items-center gap-6">

        {/* Nav */}
        <div className="w-full flex items-center justify-between">
          <Link
            href="/dream"
            className="font-mono text-base text-muted-foreground hover:text-foreground min-h-[44px] flex items-center"
          >
            ← dream
          </Link>
          <span className="font-mono text-base text-muted-foreground">518</span>
        </div>

        {/* Header */}
        <header className="text-center flex flex-col gap-2 mt-1">
          <h1 className="text-3xl sm:text-4xl font-light text-foreground tracking-wide">
            living ember
          </h1>
          <p className="text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
            A small warm creature that is simply here with you. Hum to it —
            it remembers everything you give it, forever.
          </p>
        </header>

        {/* Visual area */}
        <div className="relative w-full aspect-square max-w-[480px] flex items-center justify-center rounded-2xl overflow-hidden bg-[#0d0503]">

          {/* WebGPU canvas — shown when GPU available */}
          <canvas
            ref={canvasRef}
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full ${showGpu ? "block" : "hidden"}`}
            aria-hidden="true"
          />

          {/* CSS fallback ember — shown when no WebGPU */}
          {!showGpu && (
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Outer glow rings */}
              <div
                className="absolute rounded-full"
                style={{
                  width: "85%", height: "85%",
                  background:
                    "radial-gradient(ellipse at center, transparent 35%, rgba(180,60,10,0.08) 60%, transparent 80%)",
                  animation: "pulse-outer 6s ease-in-out infinite",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  width: "65%", height: "65%",
                  background:
                    "radial-gradient(ellipse at center, transparent 20%, rgba(220,100,15,0.12) 55%, transparent 78%)",
                  animation: "pulse-outer 8s ease-in-out infinite reverse",
                }}
              />
              {/* Main ember body */}
              <div
                id="ember-fallback"
                className="relative rounded-full transition-none"
                style={{
                  width: "48%", height: "48%",
                  background:
                    "radial-gradient(ellipse at 45% 42%, rgba(255,240,180,0.98) 0%, rgba(255,160,30,0.90) 22%, rgba(230,70,10,0.85) 50%, rgba(140,25,5,0.80) 74%, rgba(60,5,2,0.60) 100%)",
                  boxShadow:
                    "0 0 60px 20px rgba(200,70,10,0.35), 0 0 120px 40px rgba(160,40,5,0.18), inset 0 0 20px 8px rgba(255,200,80,0.20)",
                  animation: "ember-breathe 4s ease-in-out infinite",
                  transform: "scale(1)",
                }}
              />
              {/* Inner hot core */}
              <div
                className="absolute rounded-full pointer-events-none"
                style={{
                  width: "16%", height: "16%",
                  background:
                    "radial-gradient(ellipse at center, rgba(255,252,230,0.98) 0%, rgba(255,220,120,0.6) 55%, transparent 100%)",
                  animation: "ember-breathe 3.2s ease-in-out infinite reverse",
                }}
              />
            </div>
          )}

          {/* Start button overlay */}
          {phase === "idle" && (
            <button
              type="button"
              onClick={handleStart}
              className="relative z-10 w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1
                         bg-[#1a0a04]/80 backdrop-blur-sm border border-violet-700/30
                         text-violet-200 hover:bg-[#2a1208]/90 hover:border-violet-600/50
                         transition-all duration-300 touch-none select-none"
              style={{ minHeight: 64, minWidth: 64 }}
              aria-label="Wake the ember"
            >
              <span className="text-3xl" role="img" aria-label="ember">🔥</span>
              <span className="font-light text-base text-violet-200/90">wake it</span>
            </button>
          )}
        </div>

        {/* Status messages */}
        <div className="flex flex-col items-center gap-2 min-h-[2.5rem]">
          {micError && (
            <p className="font-mono text-base text-violet-300 text-center max-w-sm">
              {micError}
            </p>
          )}
          {gpuError && (
            <p className="font-mono text-base text-violet-300/95 text-center max-w-sm">
              {gpuError}
            </p>
          )}
          {phase === "running" && !micError && (
            <p className="text-base text-muted-foreground text-center">
              hum softly — the ember is listening
            </p>
          )}
        </div>

        {/* Design notes toggle */}
        <button
          type="button"
          onClick={() => setShowDesignNotes((v) => !v)}
          className="font-mono text-base text-muted-foreground hover:text-muted-foreground min-h-[44px] px-4 py-2.5 transition-colors"
        >
          {showDesignNotes ? "hide design notes" : "read the design notes"}
        </button>

        {showDesignNotes && (
          <div className="w-full max-w-lg text-base text-muted-foreground space-y-4 font-light leading-relaxed border-t border-border pt-5">
            <p>
              <strong className="text-foreground">For ages 4+.</strong> A single warm
              creature that is simply here. No rules, no goals, no resolution. The child
              keeps a small friend company by humming.
            </p>
            <p>
              <strong className="text-foreground">What the ember does:</strong> A
              Gray-Scott reaction-diffusion field runs live on the GPU — the same
              mathematics Turing used to explain animal markings. Humming raises the
              feed rate, blooming warm fingers outward. Each hum deposits a permanent
              seed that shifts the morphology forever, so minute 5 is never minute 1.
            </p>
            <p>
              <strong className="text-foreground">Long-form memory:</strong> Two slow
              drift functions (sums of incommensurate LFOs at irrational-ratio
              frequencies over a 5-minute base period) traverse different Turing zones
              over a session. Combined with the child&apos;s cumulative hum, the field
              never loops back.
            </p>
            <p>
              <strong className="text-foreground">Sound:</strong> Pentatonic/just-intonation
              lullaby pad that slowly mutates with the drift. A soft bell rings each time
              the child hums. Never silent; never resolves.
            </p>
            <p>
              <strong className="text-foreground">References:</strong>{" "}
              teamLab <em>Sketch Aquarium / Future Park</em> · Brian Eno{" "}
              <em>Ambient 1: Music for Airports</em> · Pearson (1993) /
              Gray-Scott reaction-diffusion.
            </p>
            <p className="text-muted-foreground text-sm font-mono">
              Cycle 1 of a kids &ldquo;Companion / Presence&rdquo; spine.
              Successor to 490-disintegration — same &ldquo;no solve button&rdquo;
              courage, made warm.
            </p>
          </div>
        )}

      </div>

      {/* Global keyframe animations for CSS fallback ember */}
      <style>{`
        @keyframes ember-breathe {
          0%, 100% { transform: scale(1.00); opacity: 0.92; }
          50%       { transform: scale(1.10); opacity: 1.00; }
        }
        @keyframes pulse-outer {
          0%, 100% { opacity: 0.4; transform: scale(0.96); }
          50%       { opacity: 0.8; transform: scale(1.04); }
        }
      `}</style>
    </main>
  );
}
