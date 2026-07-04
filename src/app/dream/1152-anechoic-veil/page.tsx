"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { makeMandalaRenderer, type MandalaRenderer } from "./mandala";
import {
  StillnessIntegrator,
  readRms,
  mulberry32,
  SILENCE_THRESHOLD,
} from "./stillness";

type Phase = "intro" | "running";
type InputMode = "idle" | "mic" | "manual";

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

type WebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };

export default function AnechoicVeilPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [inputMode, setInputMode] = useState<InputMode>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  // Throttled readouts for the HUD (updated ~8×/s, not every frame).
  const [stillPct, setStillPct] = useState(0);
  const [scatterPct, setScatterPct] = useState(0);
  const [held, setHeld] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MandalaRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastUiRef = useRef<number>(0);

  const integRef = useRef<StillnessIntegrator>(new StillnessIntegrator());
  const modeRef = useRef<InputMode>("idle");
  const heldRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const seedsRef = useRef<Float32Array>(new Float32Array(6));

  const audioCtxRef = useRef<AudioContext | null>(null);
  const swellRef = useRef<GainNode | null>(null);
  const droneRef = useRef<DroneBank | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Uint8Array | null>(null);

  // ── audio: created lazily on the first user gesture ──────────────────────
  const ensureAudio = useCallback((): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext!;
    const ctx = new Ctx();
    // Master swell — the drone truly rises from near-silence with stillness.
    const swell = ctx.createGain();
    swell.gain.value = 0.02;
    swell.connect(ctx.destination);
    swellRef.current = swell;
    // Warm-cool drone bed; drive opens the filter as stillness deepens.
    droneRef.current = startDroneBank(ctx, swell, {
      root: 55,
      peakGain: 0.42,
      cutoffLow: 170,
      cutoffHigh: 2200,
    });
    audioCtxRef.current = ctx;
    return ctx;
  }, []);

  // ── enter with microphone (falls back to manual on denial) ───────────────
  const beginMic = useCallback(async () => {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") void ctx.resume();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.2;
      src.connect(an); // measure only — never connected to destination
      analyserRef.current = an;
      timeBufRef.current = new Uint8Array(an.fftSize);
      modeRef.current = "mic";
      setInputMode("mic");
      setMicError(null);
      setPhase("running");
    } catch (e) {
      setMicError(
        (e instanceof Error ? e.message : "Microphone unavailable.") +
          " — using the press-and-hold Stillness control instead.",
      );
      modeRef.current = "manual";
      setInputMode("manual");
      setPhase("running");
    }
  }, [ensureAudio]);

  // ── enter without mic (press-and-hold control) ───────────────────────────
  const beginManual = useCallback(() => {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") void ctx.resume();
    modeRef.current = "manual";
    setInputMode("manual");
    setPhase("running");
  }, [ensureAudio]);

  // press-and-hold handlers (hold = stay still = bloom)
  const holdOn = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    heldRef.current = true;
    setHeld(true);
  }, []);
  const holdOff = useCallback(() => {
    heldRef.current = false;
    setHeld(false);
  }, []);

  // ── setup: renderer + the single always-on RAF loop ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current = prefersReducedMotion();
    // Deterministic per-ring phase offsets (mulberry32 — never a hot path).
    const rand = mulberry32(0x51ee5 ^ 0x1152);
    const seeds = seedsRef.current;
    for (let i = 0; i < 6; i++) seeds[i] = rand();

    const renderer = makeMandalaRenderer(canvas, seeds);
    if (!renderer) {
      setGlError(
        "WebGL2 is unavailable in this browser, so the mandala cannot render.",
      );
      return;
    }
    rendererRef.current = renderer;

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    const integ = integRef.current;

    const loop = (nowMs: number) => {
      const t = nowMs / 1000;
      const dt = lastTimeRef.current ? t - lastTimeRef.current : 0.016;
      lastTimeRef.current = t;

      // Measure the control: real RMS, manual hold, or an idle procedural drive.
      let rms: number;
      const mode = modeRef.current;
      if (mode === "mic" && analyserRef.current && timeBufRef.current) {
        rms = readRms(analyserRef.current, timeBufRef.current);
      } else if (mode === "manual") {
        rms = heldRef.current ? 0.0 : 0.5;
      } else {
        // Idle demo: RMS breathes gently around the threshold so the veil
        // blooms and recedes on its own before any gesture — never a dead screen.
        rms = SILENCE_THRESHOLD * (0.6 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.35)));
      }

      integ.step(dt, rms);

      // Drive audio: drone swells as stillness sustains, thins when broken.
      const ctx = audioCtxRef.current;
      if (droneRef.current) droneRef.current.setDrive(integ.stillness);
      if (swellRef.current && ctx) {
        const g = 0.02 + 0.30 * integ.stillness;
        swellRef.current.gain.setTargetAtTime(g, ctx.currentTime, 0.15);
      }

      // Safe, slow luminance breath — small amplitude, sub-strobe. Reduced
      // motion shrinks it further.
      const amp = reducedRef.current ? 0.02 : 0.07;
      const lum = 1 - amp + amp * (0.5 + 0.5 * Math.sin(t * 0.5));
      const motion = reducedRef.current ? 0.28 : 1.0;

      renderer.render({
        time: t,
        stillness: integ.stillness,
        scatter: integ.scatter,
        lum,
        motion,
      });

      // Throttled HUD update.
      if (nowMs - lastUiRef.current > 120) {
        lastUiRef.current = nowMs;
        setStillPct(Math.round(integ.stillness * 100));
        setScatterPct(Math.round(integ.scatter * 100));
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
      // Full audio teardown.
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      analyserRef.current = null;
      timeBufRef.current = null;
      droneRef.current?.stop();
      droneRef.current = null;
      swellRef.current = null;
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const ringOffset = RING_C * (1 - stillPct / 100);
  const scatterHot = scatterPct > 18;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05040c] text-white/95">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        aria-hidden
      />

      {/* Title + one-question, top-left */}
      <header className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
          Anechoic Veil
        </h1>
        <p className="mt-1 max-w-md font-mono text-base text-violet-300">
          What if the instrument were your stillness?
        </p>
        <p className="mt-1 max-w-md text-base text-white/75">
          The veil blooms only in silence. Any sound scatters it.
        </p>
      </header>

      {/* Design notes button, top-right */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-base text-white/75 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white/95"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <aside className="absolute right-4 top-20 z-20 max-w-sm rounded-2xl border border-white/15 bg-black/80 p-5 text-base text-white/75 backdrop-blur-md">
          <h2 className="text-xl font-semibold text-white/95">Design notes</h2>
          <p className="mt-2">
            An <span className="text-violet-300">inverted microphone</span>:
            sustained silence is the control. A running{" "}
            <span className="text-violet-300">stillness integrator</span> rises
            the longer measured mic RMS stays below a threshold and falls sharply
            on any spike. Stillness drives a symmetric WebGL2 additive-bloom
            mandala and a warm-cool drone that swells with restraint.
          </p>
          <p className="mt-2 text-white/75">
            In the spirit of John Cage&apos;s <em>4&prime;33&Prime;</em> and
            Pauline Oliveros&apos;s <em>Deep Listening</em> — the reveal comes
            only through restraint. Full references and subsystem list in{" "}
            <span className="font-mono text-violet-300">README.md</span>.
          </p>
          <p className="mt-2 text-white/55">
            Safety: no strobe — slow luminance drift only; reduced-motion
            honored. Mic is measured for level only, never recorded or uploaded.
          </p>
        </aside>
      )}

      {/* Stillness readout ring, bottom-left (visible while running) */}
      {phase === "running" && (
        <div className="absolute bottom-6 left-5 z-10 flex items-center gap-4 sm:left-7">
          <svg
            width="128"
            height="128"
            viewBox="0 0 128 128"
            className="drop-shadow"
            aria-hidden
          >
            <circle
              cx="64"
              cy="64"
              r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth="6"
            />
            <circle
              cx="64"
              cy="64"
              r={RING_R}
              fill="none"
              stroke={scatterHot ? "#fda4af" : "#c4b5fd"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={ringOffset}
              transform="rotate(-90 64 64)"
              style={{ transition: "stroke-dashoffset 0.12s linear" }}
            />
            <text
              x="64"
              y="60"
              textAnchor="middle"
              className="fill-white/95 font-mono"
              fontSize="26"
            >
              {stillPct}
            </text>
            <text
              x="64"
              y="80"
              textAnchor="middle"
              className="fill-white/55 font-mono"
              fontSize="11"
            >
              STILLNESS
            </text>
          </svg>
          <div className="max-w-[13rem] font-mono text-base">
            <p className={scatterHot ? "text-rose-300" : "text-white/75"}>
              {scatterHot
                ? "sound is scattering the veil"
                : "the veil is crystallizing"}
            </p>
            <p className="mt-1 text-white/55">
              {inputMode === "mic"
                ? "listening for your silence"
                : "hold to stay still"}
            </p>
          </div>
        </div>
      )}

      {/* Manual press-and-hold control (fallback / no-mic mode) */}
      {phase === "running" && inputMode === "manual" && (
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onPointerDown={holdOn}
            onPointerUp={holdOff}
            onPointerLeave={holdOff}
            onPointerCancel={holdOff}
            className={`min-h-[44px] select-none rounded-full border px-8 py-4 font-mono text-base transition-colors ${
              held
                ? "border-violet-300/60 bg-violet-500/25 text-white/95"
                : "border-white/20 bg-black/50 text-white/75 hover:bg-white/10"
            }`}
          >
            {held ? "…staying still…" : "press & hold to be still"}
          </button>
        </div>
      )}

      {/* Intro overlay — canvas already animating behind it */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-2xl border border-white/15 bg-black/70 p-7 text-center backdrop-blur-md">
            <h2 className="text-2xl font-semibold text-white/95">
              A reward for quiet
            </h2>
            <p className="mt-3 text-base text-white/75">
              This inverts the usual visualizer. It listens for the{" "}
              <span className="text-violet-300">absence</span> of sound. The
              stiller and quieter you stay, the more the mandala blooms and the
              drone swells. Any sound erodes it. The mic measures level only —
              nothing is recorded.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={beginMic}
                className="min-h-[44px] rounded-full border border-violet-300/50 bg-violet-500/25 px-4 py-2.5 text-base text-white/95 transition-colors hover:bg-violet-500/40"
              >
                Enter with microphone
              </button>
              <button
                type="button"
                onClick={beginManual}
                className="min-h-[44px] rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-base text-white/75 transition-colors hover:bg-white/10 hover:text-white/95"
              >
                Enter in stillness (no mic)
              </button>
            </div>
            {glError && (
              <p className="mt-4 text-base text-rose-300">{glError}</p>
            )}
          </div>
        </div>
      )}

      {/* Mic-denied notice */}
      {micError && phase === "running" && (
        <p className="absolute left-1/2 top-24 z-20 max-w-md -translate-x-1/2 rounded-xl border border-rose-300/30 bg-black/70 px-4 py-2.5 text-center text-base text-rose-300 backdrop-blur-sm">
          {micError}
        </p>
      )}
    </main>
  );
}
