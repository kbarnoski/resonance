"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BigRoomEngine, type Snapshot } from "./audio";
import { Scene } from "./scene";

type Phase = "idle" | "running" | "done" | "error";

const SECTION_LABELS: Record<string, string> = {
  intro: "intro",
  buildup: "buildup",
  drop: "the drop",
  breakdown: "breakdown",
  outro: "outro",
};

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<BigRoomEngine | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const readoutRafRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [muted, setMuted] = useState(false);
  const [intensity, setIntensity] = useState(0.5);
  const [readout, setReadout] = useState<Snapshot | null>(null);

  const teardown = useCallback(() => {
    cancelAnimationFrame(readoutRafRef.current);
    sceneRef.current?.stop();
    engineRef.current?.stop();
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    ctxRef.current = null;
    engineRef.current = null;
    sceneRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // keep the canvas crisp on resize
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const start = useCallback(() => {
    if (phase === "running") return;
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const engine = new BigRoomEngine(ctx);
      engine.setIntensity(intensity);
      engine.setMuted(muted);
      engine.onFinished = () => setPhase("done");
      engineRef.current = engine;

      const canvas = canvasRef.current;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (canvas) {
        try {
          const scene = new Scene(engine, canvas, reduced);
          sceneRef.current = scene;
          scene.start();
        } catch {
          // Canvas2D unavailable — audio still runs; notice shown via phase text
        }
      }

      ctx.resume().catch(() => {});
      engine.start();
      setPhase("running");

      // light readout loop for the React chrome
      const tick = () => {
        const snap = engineRef.current?.snapshot();
        if (snap) setReadout(snap);
        readoutRafRef.current = requestAnimationFrame(tick);
      };
      readoutRafRef.current = requestAnimationFrame(tick);
    } catch {
      setPhase("error");
    }
  }, [phase, intensity, muted]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
    setReadout(null);
  }, [teardown]);

  const onIntensity = useCallback((v: number) => {
    setIntensity(v);
    engineRef.current?.setIntensity(v);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const dropNow = useCallback(() => {
    engineRef.current?.armDrop();
  }, []);

  const sectionText = readout
    ? SECTION_LABELS[readout.sectionKind] ?? readout.sectionName
    : "—";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* canvas stage */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1818 · big room
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Big Room — a build-and-drop journey engine
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A long-form, stateful EDM arrangement — intro, build, drop, breakdown,
          build again, bigger drop, outro — sequenced sample-accurately and driven
          by one continuous energy curve. Different at minute four than at second four.
        </p>
      </div>

      {/* notes button (corner) */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute right-5 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
      >
        Design notes
      </button>

      {/* idle / start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="max-w-sm text-center text-base text-muted-foreground">
              Headphones or speakers up. One press runs the whole arc — no further
              input needed. Live controls appear once it starts.
            </p>
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the journey
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-lg border border-destructive/40 bg-background/80 p-6 text-center">
            <p className="text-base text-destructive">
              Web Audio is unavailable in this browser.
            </p>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="text-base text-muted-foreground">
              The arc has run its course.
            </p>
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run it again
            </button>
          </div>
        </div>
      )}

      {/* live transport */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-5">
          <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  now playing
                </span>
                <span className="text-base font-semibold tracking-tight text-primary">
                  {sectionText}
                </span>
                {readout?.dropArmed && (
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                    drop armed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={dropNow}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Drop now
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="button"
                  onClick={stop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              </div>
            </div>

            <label className="flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                intensity
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={intensity}
                onChange={(e) => onIntensity(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-primary"
                aria-label="Intensity — nudges the energy curve"
              />
              <span className="w-10 text-right font-mono text-xs text-muted-foreground">
                {Math.round(intensity * 100)}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-popover p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                An alternate to Resonance&apos;s slow psychedelic journey: a
                festival main-stage <span className="text-foreground">build-and-drop engine</span>.
                It runs a full multi-minute arrangement through a sample-accurate
                look-ahead sequencer at 126 BPM.
              </p>
              <p>
                Structure follows the{" "}
                <span className="text-foreground">EDMFormer</span> section taxonomy
                (arXiv:2603.08759): sections are defined by changes in{" "}
                <span className="text-foreground">energy, rhythm and timbre</span> —
                intro → buildup → drop → breakdown → build2 → drop2 → outro — not by
                harmony or lyrics.
              </p>
              <p>
                A single continuous energy/tension curve drives the DSP: supersaw
                filter cutoff, sidechain-pump depth, riser pitch, and which layers
                are added or dropped. The build climaxes with a snare-roll
                accelerando + a rising bandpass-noise sweep + a pitch riser, a short
                silent gap, an impact crash — then the pumping drop.
              </p>
              <p>
                <span className="text-foreground">Live controls:</span> Intensity
                nudges the whole energy curve; Drop now collapses the current build
                to trigger the drop early. Neither is required — Start alone runs
                the arc end to end.
              </p>
              <p className="text-sm">
                All audio is routed through a compressor and a master gain capped at
                0.18. Flicker is held ≤3 Hz and the drop bloom is a smooth one-shot
                luminance rise; reduced-motion is honored.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1818-bigroom"]} />
    </main>
  );
}
