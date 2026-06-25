"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeFluidSim, type FluidSim, type Reed } from "./fluid";
import { makeAeroEngine, type AeroEngine, STROUHAL } from "./audio";

// Fixed reeds in the rising flow column. Varied diameters `d` → varied pitch
// via f = St·U/d (smaller d = higher tone). Positions in 0..1 grid space.
const REEDS: Reed[] = [
  { x: 0.34, y: 0.42, d: 0.014 },
  { x: 0.5, y: 0.55, d: 0.03 },
  { x: 0.66, y: 0.42, d: 0.02 },
  { x: 0.42, y: 0.68, d: 0.009 },
  { x: 0.58, y: 0.68, d: 0.024 },
  { x: 0.5, y: 0.3, d: 0.04 },
  { x: 0.28, y: 0.6, d: 0.012 },
];

type Phase = "idle" | "running" | "error";

export default function BreathAeolianPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [micState, setMicState] = useState<"none" | "live" | "denied" | "synthetic">("none");
  const [glError, setGlError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [breathLevel, setBreathLevel] = useState(0);

  // mutable runtime refs (not state — they change every frame)
  const rafRef = useRef<number | null>(null);
  const simRef = useRef<FluidSim | null>(null);
  const aeroRef = useRef<AeroEngine | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smoothBreathRef = useRef(0);
  const synthBlendRef = useRef(1); // 1 = full synthetic, 0 = full mic
  const lastTimeRef = useRef(0);
  const micStateRef = useRef<"none" | "live" | "denied" | "synthetic">("none");

  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    if (simRef.current) {
      simRef.current.dispose();
      simRef.current = null;
    }
    if (aeroRef.current) {
      void aeroRef.current.dispose();
      aeroRef.current = null;
    }
    glRef.current = null;
  }, []);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  const start = useCallback(async () => {
    setGlError(null);
    setAudioError(null);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── WebGL2 (required) ──────────────────────────────────────────────────
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setGlError("WebGL2 is unavailable in this browser. The real experience is GPU-rendered fluid — visuals cannot run here.");
      setPhase("error");
      return;
    }
    glRef.current = gl;

    let sim: FluidSim;
    try {
      sim = makeFluidSim(gl);
    } catch (e) {
      setGlError("GPU fluid solver failed to initialize: " + (e as Error).message);
      setPhase("error");
      return;
    }
    simRef.current = sim;

    // ── Web Audio (degrades to silent visuals) ─────────────────────────────
    type ACtor = typeof AudioContext;
    const AC: ACtor | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext
        : undefined;
    if (AC) {
      try {
        const ctx = new AC();
        await ctx.resume();
        aeroRef.current = makeAeroEngine(ctx, REEDS.length);
      } catch (e) {
        setAudioError("Web Audio unavailable — visuals will animate without sound. " + (e as Error).message);
        aeroRef.current = null;
      }
    } else {
      setAudioError("Web Audio unavailable — visuals will animate without sound.");
    }

    // ── Microphone (degrades to synthetic breath) ──────────────────────────
    setMicState("synthetic");
    micStateRef.current = "synthetic";
    synthBlendRef.current = 1;
    if (aeroRef.current && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const ctx = aeroRef.current.ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        // SAFETY: mic → analyser ONLY. Never connect to destination.
        src.connect(analyser);
        analyserRef.current = analyser;
        timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
        setMicState("live");
        micStateRef.current = "live";
      } catch {
        setMicState("denied");
        micStateRef.current = "denied";
      }
    }

    setPhase("running");
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const sim = simRef.current;
      const gl = glRef.current;
      if (!sim || !gl) return;
      let dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (dt > 0.05) dt = 0.05; // clamp huge frame gaps
      if (dt <= 0) dt = 0.016;

      const elapsed = now / 1000;

      // ── breath energy ────────────────────────────────────────────────────
      let micBreath = 0;
      const analyser = analyserRef.current;
      const tbuf = timeBufRef.current;
      if (analyser && tbuf) {
        analyser.getFloatTimeDomainData(tbuf);
        let sum = 0;
        for (let i = 0; i < tbuf.length; i++) sum += tbuf[i] * tbuf[i];
        const rms = Math.sqrt(sum / tbuf.length);
        micBreath = Math.min(1, rms * 6.0); // breath energy → 0..1
      }

      // synthetic breath LFO (slow inhale/exhale), used until mic takes over
      const synth = Math.max(0, Math.sin(elapsed * 0.55) * 0.5 + 0.5);
      const synthBreath = 0.18 + synth * synth * 0.55;

      // when real breath is detected, fade synthetic out
      const live = micStateRef.current === "live";
      if (live && micBreath > 0.04) {
        synthBlendRef.current = Math.max(0, synthBlendRef.current - dt * 0.8);
      } else if (!live) {
        synthBlendRef.current = 1;
      }
      const blend = synthBlendRef.current;
      const rawBreath = micBreath * (1 - blend) + synthBreath * blend;

      // strong smoothing (~150ms) on breath energy
      const a = 1 - Math.exp(-dt / 0.15);
      smoothBreathRef.current += (rawBreath - smoothBreathRef.current) * a;
      const breath = smoothBreathRef.current;
      setBreathLevel(breath);

      // ── advance fluid ────────────────────────────────────────────────────
      sim.step(dt, breath, REEDS);
      sim.render();

      // ── aeroacoustic coupling ────────────────────────────────────────────
      const aero = aeroRef.current;
      if (aero) {
        const probes = sim.probeReeds(REEDS);
        const perReed = probes.map((p, i) => {
          const d = REEDS[i].d;
          // physical flow speed proxy: probe speed scaled to a plausible range.
          const U = 0.5 + p.speed * 220;
          // Aeolian tone: f = St · U / d  (St ≈ 0.2)
          const freq = Math.max(60, Math.min(2000, (STROUHAL * U) / d));
          // shedding strength grows with speed & vorticity
          const strength = Math.min(1, p.speed * 16 + p.vort * 6);
          const amp = strength * strength * 0.8;
          const warble = Math.min(1, p.vort * 8);
          return { freq, amp, warble };
        });
        const ke = sim.kineticEnergy();
        const bedCutoff = 400 + Math.min(1, ke * 400) * 2600;
        const bedGain = Math.min(0.18, ke * 2.5 + breath * 0.04);
        aero.update(perReed, bedCutoff, bedGain);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const sizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.floor(rect.width * dpr));
    c.height = Math.max(1, Math.floor(rect.height * dpr));
  }, []);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0c] text-white">
      {/* fluid canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* deep charcoal gradient floor so breath rises out of darkness */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

      {/* header */}
      <div className="relative z-10 flex flex-col gap-2 px-6 pt-8 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
          Breath Aeolian
        </h1>
        <p className="max-w-xl text-base text-white/75">
          Breathe into a living cloud of air and hear the air sing back — your
          breath injects wind into a fluid, and the vortices it stirs make
          aeolian tones whose pitch is set by airflow physics, not by any scale.
        </p>
      </div>

      {/* design notes link */}
      <div className="absolute right-4 top-4 z-20">
        <Link
          href="/dream/922-breath-aeolian/README.md"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55 transition-colors hover:text-amber-300"
        >
          read the design notes
        </Link>
      </div>

      {/* idle gate */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="max-w-md font-mono text-sm text-white/55">
            Pale luminous vapor on deep charcoal. Seven reeds stand in the rising
            column. Wind shedding past each one whistles at f = St·U/d.
          </p>
          <button
            type="button"
            onClick={start}
            className="min-h-[44px] rounded-full bg-amber-400/90 px-6 py-2.5 text-base font-semibold text-black transition-colors hover:bg-amber-300"
          >
            Start (breathe)
          </button>
          <p className="max-w-md text-sm text-white/55">
            Allow the microphone to breathe into it directly. If you decline, a
            synthetic breath keeps the cloud alive and singing.
          </p>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <div className="absolute bottom-6 left-6 z-20 flex flex-col gap-2 font-mono text-[11px] text-white/55">
          {micState === "live" && (
            <span className="text-amber-300/90">mic live · real breath drives the wind</span>
          )}
          {micState === "synthetic" && (
            <span className="text-rose-300">
              no mic · synthetic breath active (cloud still breathes &amp; sings)
            </span>
          )}
          {micState === "denied" && (
            <span className="text-rose-300">
              microphone denied — synthetic breath active so it stays demoable
            </span>
          )}
          {audioError && <span className="text-rose-300">{audioError}</span>}
          <div className="mt-1 flex items-center gap-2">
            <span className="text-white/45">breath</span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-violet-400 transition-[width] duration-75"
                style={{ width: `${Math.round(breathLevel * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* error notice */}
      {phase === "error" && glError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
          <div className="max-w-md rounded-xl border border-rose-400/30 bg-black/80 p-5 text-center">
            <p className="text-base text-rose-300">{glError}</p>
          </div>
        </div>
      )}
    </main>
  );
}
