"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { EchoBodyAudio, type EchoSnapshot } from "./audio";
import {
  createCameraSource,
  createSyntheticSource,
  type MotionSource,
} from "./motion";
import { EchoPlan, type PlanHandle, type TrailPoint } from "./plan";

type Phase = "idle" | "live";

const TRAIL_MAX = 96;

export default function EchoBodyPage() {
  const audioRef = useRef<EchoBodyAudio | null>(null);
  const sourceRef = useRef<MotionSource | null>(null);
  const planRef = useRef<PlanHandle>(null);
  const trailRef = useRef<TrailPoint[]>([]);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<"camera" | "synthetic">("synthetic");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<{ delaySec: number; state: string } | null>(null);

  const runLoop = useCallback(() => {
    const audio = audioRef.current;
    const source = sourceRef.current;
    if (!audio || !source) return;
    const loop = () => {
      const now = performance.now();
      const live = source.read(now);
      const snap: EchoSnapshot = audio.update(now, live);

      const trail = trailRef.current;
      trail.push({ c: live.centroid, e: live.expansion });
      if (trail.length > TRAIL_MAX) trail.shift();

      planRef.current?.draw(snap, trail);

      // Throttle the React HUD update to ~4/s (the SVG itself is imperative).
      frameRef.current++;
      if (frameRef.current % 15 === 0) {
        setHud({
          delaySec: snap.delaySec,
          state: snap.delaySec >= 0 ? "the echo trails behind you" : "the echo now leads you",
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const begin = useCallback(
    async (wantCamera: boolean) => {
      if (audioRef.current) return;
      setError(null);
      try {
        const AudioCtor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext ??
          AudioContext;
        const ctx = new AudioCtor();
        if (ctx.state === "suspended") await ctx.resume();

        let source: MotionSource;
        if (wantCamera) {
          try {
            source = await createCameraSource();
          } catch {
            source = createSyntheticSource();
            setError("Camera unavailable — running the synthetic body instead.");
          }
        } else {
          source = createSyntheticSource();
        }
        sourceRef.current = source;
        setMode(source.mode);

        const audio = new EchoBodyAudio(ctx);
        audio.start();
        audioRef.current = audio;

        trailRef.current = [];
        frameRef.current = 0;
        setPhase("live");
        runLoop();
      } catch {
        setError("Audio could not start. Check that sound is enabled, then retry.");
      }
    },
    [runLoop],
  );

  // Switch to camera after the piece has already begun on the synthetic body.
  const enableCamera = useCallback(async () => {
    if (!audioRef.current || mode === "camera") return;
    setError(null);
    try {
      const cam = await createCameraSource();
      sourceRef.current?.dispose();
      sourceRef.current = cam;
      setMode("camera");
    } catch {
      setError("Camera permission was denied. Staying on the synthetic body.");
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sourceRef.current?.dispose();
      audioRef.current?.dispose();
      sourceRef.current = null;
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance dream lab · 2340
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Echo-Body
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Your moving body sculpts a spatial sound-field heard on headphones — but
          the sound of your motion is time-displaced. An echo-self first trails
          behind you, then over minutes drifts to lead you, until the felt “you”
          decouples from the body you see.
        </p>
        <p className="text-base leading-relaxed text-muted-foreground">
          Headphones are essential — the effect is built from HRTF binaural
          spatialization and collapses on speakers.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border">
        <div className="aspect-square w-full">
          <EchoPlan ref={planRef} />
        </div>

        {/* mode badge */}
        <div className="pointer-events-none absolute left-3 top-3">
          <span className="rounded-md border border-border bg-background/70 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
            {mode === "camera" ? "camera body" : "synthetic body (no camera)"}
          </span>
        </div>

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/60 px-6 text-center backdrop-blur-sm">
            <p className="max-w-sm text-base text-muted-foreground">
              Put your headphones on. Begin, then move slowly and listen for where
              your echo-self sits in the space around your head.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => begin(true)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin — headphones on (camera)
              </button>
              <button
                type="button"
                onClick={() => begin(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Begin without camera
              </button>
            </div>
          </div>
        )}
      </div>

      {/* live readout + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-[24px] text-base text-muted-foreground">
          {phase === "live" && hud ? (
            <span>
              <span className="text-foreground">{hud.state}</span>
              {" · "}
              <span className="font-mono text-sm">
                {hud.delaySec >= 0 ? "+" : "−"}
                {Math.abs(hud.delaySec).toFixed(2)}s
              </span>
            </span>
          ) : phase === "live" ? (
            <span>Listening…</span>
          ) : null}
        </div>
        {phase === "live" && mode === "synthetic" && (
          <button
            type="button"
            onClick={enableCamera}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Enable camera
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {notesOpen ? "Hide the design notes" : "Read the design notes"}
        </button>
        {notesOpen && (
          <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-background/40 p-4 text-base leading-relaxed text-muted-foreground">
            <p>
              Two independent axes are read from your body: the horizontal{" "}
              <span className="text-foreground">centroid</span> of motion (where you
              are) and its <span className="text-foreground">expansion</span> (how
              wide you spread). They can conflict — there is no single dial from
              calm to peak. Centroid steers the echo’s azimuth; expansion lifts its
              elevation and pushes it farther out.
            </p>
            <p>
              A rolling buffer holds the last several seconds of that state. The
              echo-self voice reads it through a delay that begins ~2.25s in the
              past and drifts, over five minutes, to a predictive ~1s lead — so the
              echo crosses from trailing you to anticipating you. A second, faint
              present-tense voice tracks the live state, so you can hear the gap.
            </p>
            <p>
              References: “Audiovisual stimuli based out-of-body illusion”
              (Scientific Reports, 2024, s41598-024-74904-5) and Olaf Blanke’s work
              on full-body illusions and bodily self-consciousness.
            </p>
          </div>
        )}
      </div>

      <PrototypeNav slugs={["2340-echo-body"]} />
    </main>
  );
}
