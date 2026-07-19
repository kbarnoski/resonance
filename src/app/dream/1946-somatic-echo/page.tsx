"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  FlowTracker,
  GhostMover,
  openCamera,
  grabGray,
  stopCamera,
  mulberry32,
  type CameraCapture,
  type FlowFrame,
} from "./flow";
import { SomaticAudio } from "./audio";
import { AuraField } from "./field";
import { README_TEXT } from "./readme-text";

type Phase = "idle" | "starting" | "running";
type Source = "camera" | "ghost";

interface Hud {
  smoothness: number;
  energy: number;
  reward: number;
  source: Source;
}

export default function SomaticEchoPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<AuraField | null>(null);
  const audioRef = useRef<SomaticAudio | null>(null);
  const trackerRef = useRef<FlowTracker | null>(null);
  const ghostRef = useRef<GhostMover | null>(null);
  const camRef = useRef<CameraCapture | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const ghostStartRef = useRef<number>(0);
  const sourceRef = useRef<Source>("camera");
  const runningRef = useRef(false);
  const mutedRef = useRef(false);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [ghostNote, setGhostNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hud, setHud] = useState<Hud>({
    smoothness: 0.5,
    energy: 0,
    reward: 0,
    source: "camera",
  });

  // ── the render/analysis loop ───────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(loop);

    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - last) / 1000));
    lastTsRef.current = ts;

    const tracker = trackerRef.current;
    if (!tracker) return;

    let frame: FlowFrame | null = null;
    if (sourceRef.current === "camera" && camRef.current) {
      const gray = grabGray(camRef.current);
      if (gray) frame = tracker.ingestGray(gray, dt);
    }
    if (!frame && ghostRef.current) {
      const elapsed = (ts - ghostStartRef.current) / 1000;
      const g = ghostRef.current.sample(elapsed);
      frame = tracker.ingestField(g.cells, g.energy, g.cx, g.cy, dt);
    }
    if (!frame) return;

    const audio = audioRef.current;
    const reward = audio?.rewardLevel ?? 0;
    audio?.update(
      {
        smoothness: frame.smoothness,
        energy: frame.energy,
        centroidX: frame.centroidX,
        centroidY: frame.centroidY,
        reward,
      },
      dt,
    );

    fieldRef.current?.step(
      {
        smoothness: frame.smoothness,
        energy: frame.energy,
        centroidX: frame.centroidX,
        centroidY: frame.centroidY,
        reward,
        cells: frame.cells,
      },
      dt,
    );

    // throttle HUD state updates to keep React light
    if ((ts | 0) % 6 === 0) {
      setHud({
        smoothness: frame.smoothness,
        energy: frame.energy,
        reward,
        source: sourceRef.current,
      });
    }
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    runningRef.current = true;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const ensureField = useCallback(() => {
    if (fieldRef.current || !canvasRef.current) return;
    const seed = 0x13579bdf;
    const field = new AuraField(
      canvasRef.current,
      mulberry32(seed),
      reducedRef.current,
    );
    const el = canvasRef.current;
    field.resize(el.clientWidth, el.clientHeight);
    fieldRef.current = field;
  }, []);

  const beginGhost = useCallback(
    (note: string | null) => {
      sourceRef.current = "ghost";
      if (!ghostRef.current) ghostRef.current = new GhostMover();
      ghostStartRef.current = performance.now();
      setGhostNote(note);
    },
    [],
  );

  const start = useCallback(
    async (forceGhost: boolean) => {
      setError(null);
      setPhase("starting");
      reducedRef.current = prefersReducedMotion();

      // audio (gesture-gated)
      if (!audioRef.current) audioRef.current = new SomaticAudio();
      try {
        await audioRef.current.start();
        audioRef.current.setMuted(mutedRef.current);
      } catch {
        setError("Audio could not start on this device — the field still moves.");
      }

      if (!trackerRef.current) trackerRef.current = new FlowTracker();
      trackerRef.current.reset();

      ensureField();

      // input source
      if (forceGhost) {
        beginGhost(
          "Demo motion: a seeded ghost is moving for you — watch it settle.",
        );
      } else {
        try {
          const cap = await openCamera();
          camRef.current = cap;
          sourceRef.current = "camera";
          setGhostNote(null);
          // keep a ghost primed as a safety net if frames never arrive
          if (!ghostRef.current) ghostRef.current = new GhostMover();
          ghostStartRef.current = performance.now();
        } catch {
          beginGhost(
            "No camera / permission denied — fell back to a seeded ghost that self-demos the arc.",
          );
        }
      }

      setPhase("running");
      startLoop();
    },
    [beginGhost, ensureField, startLoop],
  );

  const switchToGhost = useCallback(() => {
    if (camRef.current) {
      stopCamera(camRef.current);
      camRef.current = null;
    }
    trackerRef.current?.reset();
    beginGhost("Demo motion: a seeded ghost is moving for you — watch it settle.");
  }, [beginGhost]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // ── resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const el = canvasRef.current;
      if (el && fieldRef.current) fieldRef.current.resize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      stopCamera(camRef.current);
      camRef.current = null;
      fieldRef.current?.dispose();
      fieldRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Somatic Echo
        </h1>
        <p className="text-base text-muted-foreground">
          Your movement is the music and stillness is the reward — move slow and
          present and the field grows warm and coherent; get agitated and it
          scatters and detunes.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          style={{ aspectRatio: "16 / 10" }}
        />
        {phase !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 p-6 backdrop-blur-sm">
            <button
              onClick={() => start(false)}
              disabled={phase === "starting"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "starting" ? "Opening the field…" : "Begin (camera)"}
            </button>
            <button
              onClick={() => start(true)}
              disabled={phase === "starting"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              Use demo motion (no camera)
            </button>
            <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              Sound on. Move slowly and deliberately — the reward is stillness.
              With no camera, a seeded ghost self-demos the whole arc.
            </p>
          </div>
        )}
      </div>

      {/* status row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Source: {hud.source === "camera" ? "Webcam flow" : "Seeded ghost"}
        </span>
        {phase === "running" && (
          <>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Smoothness: {pct(hud.smoothness)}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Motion: {pct(hud.energy)}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Reward: {pct(hud.reward)}
            </span>
          </>
        )}
      </div>

      {ghostNote && phase === "running" && (
        <p className="text-sm leading-relaxed text-destructive">{ghostNote}</p>
      )}
      {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

      {phase === "running" && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          {hud.source === "camera" && (
            <button
              onClick={switchToGhost}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Use demo motion (no camera)
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] w-fit rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            {README_TEXT.split("\n\n").map((para, i) => (
              <p
                key={i}
                className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0"
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1946-somatic-echo"]} />
    </div>
  );
}
