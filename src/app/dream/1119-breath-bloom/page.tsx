"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BreathTracker,
  FLATNESS_FLOOR_LOW,
  FLATNESS_FLOOR_HIGH,
  type BreathSource,
} from "./breath";
import {
  makeGarden,
  growGarden,
  updateGarden,
  resetGarden,
  type Garden,
} from "./growth";
import { drawGarden } from "./render";
import { BellEngine } from "./audio";

type Phase = "idle" | "running";

interface Readout {
  drive: number;
  flatness: number;
  breaths: number;
  segments: number;
  source: BreathSource | "none";
}

const FFT_SIZE = 2048;

export default function BreathBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // runtime refs (mutate every frame — not React state)
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bellRef = useRef<BellEngine | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const specBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const trackerRef = useRef<BreathTracker | null>(null);
  const gardenRef = useRef<Garden>(makeGarden(0x9e3779b1));
  const lastTimeRef = useRef(0);
  const readoutAccumRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const seedRef = useRef(0x9e3779b1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    drive: 0,
    flatness: 0,
    breaths: 0,
    segments: 0,
    source: "none",
  });
  const [showNotes, setShowNotes] = useState(false);

  // ---- canvas sizing ----
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }, []);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  // ---- the frame loop ----
  const runFrame = useCallback((tMs: number) => {
    const canvas = canvasRef.current;
    const tracker = trackerRef.current;
    if (!canvas || !tracker) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const now = tMs / 1000;
    let dt = now - lastTimeRef.current;
    lastTimeRef.current = now;
    if (!(dt > 0) || dt > 0.25) dt = 1 / 60;

    // pull the live spectrum if a mic analyser exists
    let spectrum: Float32Array | null = null;
    const analyser = analyserRef.current;
    const buf = specBufRef.current;
    const actx = audioCtxRef.current;
    if (analyser && buf) {
      analyser.getFloatFrequencyData(buf);
      spectrum = buf;
    }
    const sampleRate = actx ? actx.sampleRate : 44100;

    const { state, event } = tracker.update(
      dt,
      spectrum,
      sampleRate,
      FFT_SIZE,
    );

    const garden = gardenRef.current;
    if (event) {
      growGarden(garden, event.strength);
      bellRef.current?.ring(garden.breaths, event.strength, garden.register);
    }
    updateGarden(garden, dt, state.drive);
    bellRef.current?.setDrive(state.drive);

    drawGarden(ctx, canvas.width, canvas.height, garden, {
      time: now,
      drive: state.drive,
      reducedMotion: reducedMotionRef.current,
    });

    // throttle readout state to ~8 Hz
    readoutAccumRef.current += dt;
    if (readoutAccumRef.current > 0.12) {
      readoutAccumRef.current = 0;
      setReadout({
        drive: state.drive,
        flatness: state.flatness,
        breaths: garden.breaths,
        segments: garden.segments,
        source: state.source,
      });
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;
    lastTimeRef.current = performance.now() / 1000;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const ensureAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const actx = new Ctx();
      audioCtxRef.current = actx;
      bellRef.current = new BellEngine(actx);
    }
    const actx = audioCtxRef.current;
    if (actx && actx.state === "suspended") await actx.resume();
    bellRef.current?.start();
    return actx;
  }, []);

  // ---- controls ----
  const startBreathing = useCallback(async () => {
    setMicError(null);
    sizeCanvas();
    const actx = await ensureAudio();
    if (!trackerRef.current) {
      trackerRef.current = new BreathTracker(seedRef.current, false);
    }
    trackerRef.current.setForceBreeze(false);

    // request the mic — analysis only, never routed to the destination
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      if (actx) {
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.0;
        src.connect(analyser); // NOT connected to destination — no feedback
        micSourceRef.current = src;
        analyserRef.current = analyser;
        specBufRef.current = new Float32Array(
          new ArrayBuffer(analyser.frequencyBinCount * 4),
        );
      }
    } catch (e) {
      // denial → fall back to the seeded breeze so the piece still grows
      setMicError(
        (e instanceof Error ? e.message : "Microphone unavailable") +
          " — falling back to a simulated breeze.",
      );
      trackerRef.current.setForceBreeze(true);
    }

    setPhase("running");
    startLoop();
  }, [ensureAudio, sizeCanvas, startLoop]);

  const simulateBreath = useCallback(async () => {
    setMicError(null);
    sizeCanvas();
    await ensureAudio();
    if (!trackerRef.current) {
      trackerRef.current = new BreathTracker(seedRef.current, true);
    }
    trackerRef.current.setForceBreeze(true);
    // tear down any live mic so the breeze is the sole source
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    analyserRef.current = null;
    specBufRef.current = null;
    setPhase("running");
    startLoop();
  }, [ensureAudio, sizeCanvas, startLoop]);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    analyserRef.current = null;
    specBufRef.current = null;
    bellRef.current?.dispose();
    bellRef.current = null;
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setPhase("idle");
    setReadout((r) => ({ ...r, drive: 0, source: "none" }));
  }, []);

  const resetGardenState = useCallback(() => {
    seedRef.current = (seedRef.current * 1664525 + 1013904223) >>> 0;
    gardenRef.current = resetGarden(seedRef.current);
    // reset the breath clock/breeze schedule too, keeping the current mode
    const forced = trackerRef.current
      ? readout.source === "breeze" && phase === "running"
      : false;
    trackerRef.current = new BreathTracker(seedRef.current, forced);
    setReadout({
      drive: 0,
      flatness: 0,
      breaths: 0,
      segments: 0,
      source: phase === "running" ? "breeze" : "none",
    });
  }, [phase, readout.source]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      bellRef.current?.dispose();
      if (audioCtxRef.current) void audioCtxRef.current.close();
    };
  }, []);

  // ---- UI helpers ----
  const flatnessLabel =
    readout.flatness >= FLATNESS_FLOOR_HIGH
      ? "breath"
      : readout.flatness <= FLATNESS_FLOOR_LOW
        ? "tonal (gated)"
        : "mixed";

  const sourceDot =
    readout.source === "mic"
      ? "● mic listening"
      : readout.source === "breeze"
        ? "● simulated breeze"
        : "○ idle";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#f7f0e2] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="A procedurally growing garden driven by your breath"
      />

      {/* product bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 sm:p-6">
        <div className="pointer-events-auto max-w-2xl rounded-2xl border border-black/10 bg-black/70 p-4 shadow-lg backdrop-blur-md">
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            Breath Bloom
          </h1>
          <p className="mt-1 text-base text-foreground">
            Each slow exhale unfurls one more segment of a living plant and
            rings one more chime — a long, calm session grows a whole blooming
            form and a whole chord out of nothing but your breathing.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {phase === "idle" ? (
              <button
                onClick={startBreathing}
                className="min-h-[44px] rounded-full bg-violet-400/90 px-4 py-2.5 text-base font-medium text-violet-950 transition-colors hover:bg-violet-300"
              >
                Start (breathe)
              </button>
            ) : (
              <button
                onClick={stopAll}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                Stop
              </button>
            )}
            <button
              onClick={simulateBreath}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              Simulate breath
            </button>
            <button
              onClick={resetGardenState}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              Reset garden
            </button>
          </div>

          {micError && (
            <p className="mt-3 text-base text-violet-300">{micError}</p>
          )}

          {/* live readout */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground">
            <span>
              drive{" "}
              <span className="text-violet-300/95">
                {readout.drive.toFixed(2)}
              </span>
            </span>
            <span>
              flatness{" "}
              <span className="text-violet-300">
                {readout.flatness.toFixed(2)}
              </span>{" "}
              <span className="text-muted-foreground">({flatnessLabel})</span>
            </span>
            <span>
              breaths{" "}
              <span className="text-violet-300/95">{readout.breaths}</span>
            </span>
            <span>
              segments{" "}
              <span className="text-violet-300/95">{readout.segments}</span>
            </span>
            <span
              className={
                readout.source === "mic"
                  ? "text-violet-300/95"
                  : readout.source === "breeze"
                    ? "text-violet-300"
                    : "text-muted-foreground"
              }
            >
              {sourceDot}
            </span>
          </div>
        </div>
      </div>

      {/* design-notes corner panel */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        {showNotes && (
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-black/10 bg-black/80 p-4 text-base text-foreground shadow-lg backdrop-blur-md">
            <p className="mb-2 text-foreground">
              A broadband exhale opens the gate; a hum, whistle, or sung note at
              the same loudness is heavily attenuated by the{" "}
              <span className="text-violet-300">spectral-flatness</span>{" "}
              discriminator. Every completed exhale grows one plant segment and
              rings one bell on an ascending just-intonation pentatonic, so the
              chord and the garden accumulate together and drift over a long
              session.
            </p>
            <p className="text-muted-foreground">
              With no mic (or on denial) a seeded breeze breathes for you.
              Analysis only — the mic never reaches the speakers.
            </p>
            <Link
              href="/dream"
              className="mt-3 inline-block text-violet-300/95 underline"
            >
              back to gallery
            </Link>
          </div>
        )}
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto min-h-[44px] rounded-full border border-black/10 bg-black/70 px-4 py-2.5 text-base font-medium text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-black/80"
        >
          {showNotes ? "Hide notes" : "Design notes"}
        </button>
      </div>
    </main>
  );
}
