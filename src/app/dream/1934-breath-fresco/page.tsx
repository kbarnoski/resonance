"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BreathSource, N_PARTIALS, type BreathFeed } from "./breath";
import { FrescoAudio } from "./audio";
import { createFresco, frescoColor, type Fresco, type FrescoBackend } from "./fresco";
import { README_TEXT } from "./readme-text";

const SESSION_MS = 5 * 60 * 1000; // wall spans a ~5-minute session

type Phase = "idle" | "loading" | "running";

interface Hud {
  feed: BreathFeed;
  breaths: number;
  voices: number;
  fillPct: number;
}

export default function BreathFrescoPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<FrescoAudio | null>(null);
  const breathRef = useRef<BreathSource | null>(null);
  const frescoRef = useRef<Fresco | null>(null);
  const rafRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<FrescoBackend | null>(null);
  const [hud, setHud] = useState<Hud>({ feed: "demo", breaths: 0, voices: 0, fillPct: 0 });
  const [denialReason, setDenialReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const loop = useCallback(() => {
    const breath = breathRef.current;
    const fresco = frescoRef.current;
    const audio = audioRef.current;
    if (!breath || !fresco || !audio) return;

    const tMs = performance.now();
    const elapsed = tMs - sessionStartRef.current;
    const trowelX = Math.min(1, elapsed / SESSION_MS);

    const frame = breath.sample(tMs);
    if (frame.openPartial !== null) {
      audio.openPartial(frame.openPartial, frame.rms);
    }

    let deposit = null;
    if (frame.deposit && frame.activePartial !== null) {
      const partialT = frame.activePartial / (N_PARTIALS - 1);
      deposit = {
        y: frame.deposit.y,
        intensity: frame.deposit.intensity,
        color: frescoColor(frame.deposit.intensity, partialT),
      };
    }
    fresco.step(trowelX, deposit);
    fresco.render(trowelX);

    frameCountRef.current += 1;
    if (frameCountRef.current % 12 === 0) {
      setHud({
        feed: frame.feed,
        breaths: breath.breathCount,
        voices: audio.activeVoices(),
        fillPct: Math.round(trowelX * 100),
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    breathRef.current?.dispose();
    breathRef.current = null;
    frescoRef.current?.dispose();
    frescoRef.current = null;
    void audioRef.current?.dispose();
    audioRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("loading");
    setError(null);
    try {
      const audio = new FrescoAudio();
      await audio.start();
      audioRef.current = audio;

      const fresco = await createFresco(canvas);
      frescoRef.current = fresco;
      setBackend(fresco.backend);

      const breath = new BreathSource(audio.ctx);
      breathRef.current = breath;
      const ok = await breath.enableMic();
      if (!ok) setDenialReason(breath.denialReason);

      sessionStartRef.current = performance.now();
      frameCountRef.current = 0;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not start the fresco. Reload and retry.",
      );
      stopAll();
      setPhase("idle");
    }
  }, [phase, loop, stopAll]);

  // Teardown on unmount — no leaks.
  useEffect(() => () => stopAll(), [stopAll]);

  const feedLabel =
    hud.feed === "mic"
      ? "Live breath"
      : hud.feed === "denied"
        ? "Mic denied · ghost-breath demo"
        : "Silent mic · ghost-breath demo";

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1934 · Breath Fresco
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          A fresco of your breathing you can read back like an autobiography
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Each exhale trowels a permanent glowing stratum into wet plaster; the wall&apos;s
          horizontal axis is time, so a whole listening session becomes a readable spatial
          timeline — not a fading chord.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: "2 / 1" }}
        />
        {phase !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
            <button
              onClick={start}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Preparing the wall…" : "Start — breathe"}
            </button>
            <p className="max-w-sm px-6 text-center text-sm leading-relaxed text-muted-foreground">
              Allow the microphone and breathe slowly. No mic? A ghost-breath demo paints the
              wall on its own.
            </p>
          </div>
        )}
      </div>

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Field: {backend ?? "—"}
        </span>
        {phase === "running" && (
          <>
            <span
              className={`font-mono text-xs uppercase tracking-[0.18em] ${
                hud.feed === "denied" ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {feedLabel}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Strata: {hud.breaths}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Voices: {hud.voices}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Wall: {hud.fillPct}%
            </span>
          </>
        )}
      </div>

      {denialReason && phase === "running" && hud.feed === "denied" && (
        <p className="text-sm leading-relaxed text-destructive">{denialReason}</p>
      )}
      {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] w-fit rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "Hide the design notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="rounded-lg border border-border bg-background/40 p-5">
            {README_TEXT.split("\n\n").map((para, i) => (
              <p
                key={i}
                className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0"
              >
                {para}
              </p>
            ))}
          </div>
        )}
      </div>

      <PrototypeNav slugs={["1934-breath-fresco"]} />
    </div>
  );
}
