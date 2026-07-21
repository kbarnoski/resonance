"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { TiltField, type TiltSource } from "./orientation";
import { Arc, type Phase } from "./arc";
import { UnselfAudio } from "./audio";
import { UnselfScene } from "./scene";
import { README_TEXT } from "./readme-text";

type Status = "idle" | "loading" | "running" | "error";

interface Hud {
  source: TiltSource;
  phase: Phase;
  progressPct: number;
  dPct: number;
}

/** iOS 13+ gates DeviceOrientation behind a permission call. */
type OrientationPermissionCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const PHASE_LABEL: Record<Phase, string> = {
  embodied: "Embodied — one self, present and warm",
  depersonalization: "Depersonalization — a second self peels away",
  derealization: "Derealization — the world drains and goes unreal",
  dissolution: "Dissolution — you scatter into drifting light",
  return: "Return — the motes re-gather and you land",
};

const SOURCE_LABEL: Record<TiltSource, string> = {
  tilt: "tilt",
  auto: "auto",
};

export default function UnselfPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<UnselfAudio | null>(null);
  const tiltRef = useRef<TiltField | null>(null);
  const arcRef = useRef<Arc | null>(null);
  const sceneRef = useRef<UnselfScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [hud, setHud] = useState<Hud>({
    source: "auto",
    phase: "embodied",
    progressPct: 0,
    dPct: 0,
  });
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [canvasNote, setCanvasNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const onResize = useCallback(() => {
    sceneRef.current?.resize();
  }, []);

  const loop = useCallback(() => {
    const tilt = tiltRef.current;
    const arc = arcRef.current;
    const audio = audioRef.current;
    if (!tilt || !arc || !audio) return;

    const tMs = performance.now();
    const t = tilt.sample(tMs);
    const a = arc.sample(tMs, t.motion);

    audio.update({
      D: a.D,
      ghostNorm: a.ghostNorm,
      ghostDelaySec: a.ghostDelaySec,
      delayedMotion: a.delayedMotion,
      dissolve: a.dissolve,
      centerGlow: a.centerGlow,
      timeScale: a.timeScale,
    });

    sceneRef.current?.render({
      tMs,
      tiltX: t.tiltX,
      tiltZ: t.tiltZ,
      animTime: a.animTime,
      ghostNorm: a.ghostNorm,
      ghostDelaySec: a.ghostDelaySec,
      drain: a.drain,
      flatten: a.flatten,
      dissolve: a.dissolve,
      centerGlow: a.centerGlow,
      trailAlpha: a.trailAlpha,
      reduced: prefersReducedMotion(),
    });

    frameRef.current += 1;
    if (frameRef.current % 12 === 0) {
      setHud({
        source: t.source,
        phase: a.phase,
        progressPct: Math.round(a.progress * 100),
        dPct: Math.round(a.D * 100),
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (tiltRef.current) {
      window.removeEventListener("deviceorientation", tiltRef.current.onDeviceOrientation);
      tiltRef.current = null;
    }
    window.removeEventListener("resize", onResize);
    sceneRef.current?.dispose();
    sceneRef.current = null;
    arcRef.current = null;
    void audioRef.current?.dispose();
    audioRef.current = null;
  }, [onResize]);

  const stop = useCallback(() => {
    stopAll();
    setStatus("idle");
  }, [stopAll]);

  const start = useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("loading");
    setError(null);
    setSensorNote(null);
    setCanvasNote(null);
    try {
      const reduced = prefersReducedMotion();

      // Canvas2D can fail; audio must still run. Degrade gracefully.
      try {
        sceneRef.current = new UnselfScene(canvas);
      } catch {
        sceneRef.current = null;
        setCanvasNote(
          "This browser could not open a 2D canvas, so the figure can't render — the journey plays as sound only.",
        );
      }

      const audio = new UnselfAudio();
      await audio.start();
      audioRef.current = audio;

      const tilt = new TiltField({ reduced });
      tiltRef.current = tilt;
      arcRef.current = new Arc();

      // Motion sensor with iOS permission flow; else the seeded auto-drive.
      const Ctor = (typeof DeviceOrientationEvent !== "undefined"
        ? DeviceOrientationEvent
        : undefined) as OrientationPermissionCtor | undefined;
      if (Ctor && typeof Ctor.requestPermission === "function") {
        try {
          const res = await Ctor.requestPermission();
          if (res === "granted") {
            window.addEventListener("deviceorientation", tilt.onDeviceOrientation);
          } else {
            setSensorNote(
              "Motion access denied — the journey self-drives on a seeded auto-drift instead.",
            );
          }
        } catch {
          setSensorNote(
            "Motion sensor unavailable — the journey self-drives on a seeded auto-drift instead.",
          );
        }
      } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", tilt.onDeviceOrientation);
      } else {
        setSensorNote(
          "No motion sensor here — the journey self-drives on a seeded auto-drift; tilt would only modulate it.",
        );
      }

      window.addEventListener("resize", onResize);
      sceneRef.current?.resize();
      frameRef.current = 0;
      setStatus("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not begin the journey. Reload and retry.");
      stopAll();
      setStatus("error");
    }
  }, [status, loop, stopAll, onResize]);

  // Teardown on unmount — no leaks.
  useEffect(() => () => stopAll(), [stopAll]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2094 · Unself
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Watch your own self peel away from you
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          A six-and-a-half-minute, drug-free journey. A luminous figure of you first mirrors your
          motion, then splits off a delayed ghost you can&rsquo;t tell from yourself, drains of colour
          and reality, disperses into drifting motes at the peak &mdash; then re-coalesces and lands.
          One autonomous dissociation parameter drives everything, so the end is nowhere near where
          you began.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <canvas ref={canvasRef} className="block h-full w-full" style={{ aspectRatio: "16 / 10" }} />
        {status !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
            <button
              onClick={start}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "loading"
                ? "Beginning…"
                : status === "error"
                  ? "Try again"
                  : "Begin — leave yourself"}
            </button>
            <p className="max-w-sm px-6 text-center text-base leading-relaxed text-muted-foreground">
              Sound on. It runs for about six and a half minutes on its own; tilting the phone only
              nudges the drift. Best in a dark, quiet room.
            </p>
          </div>
        )}
      </div>

      {/* Live journey readout. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Phase: {status === "running" ? PHASE_LABEL[hud.phase] : "—"}
        </span>
        {status === "running" && (
          <>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Journey: {hud.progressPct}%
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dissociation: {hud.dPct}%
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Source: {SOURCE_LABEL[hud.source]}
            </span>
          </>
        )}
      </div>

      {sensorNote && status === "running" && (
        <p className="text-base leading-relaxed text-muted-foreground">{sensorNote}</p>
      )}
      {canvasNote && status === "running" && (
        <p className="text-base leading-relaxed text-destructive">{canvasNote}</p>
      )}
      {error && <p className="text-base leading-relaxed text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {status === "running" && (
          <button
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        )}
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
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            {README_TEXT.split("\n\n").map((para, i) => (
              <p key={i} className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0">
                {para}
              </p>
            ))}
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2094-unself"]} />
    </div>
  );
}
