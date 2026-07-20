"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { TiltField, type TiltSource } from "./orientation";
import { ExoAudio } from "./audio";
import { ExoScene } from "./scene";
import { README_TEXT } from "./readme-text";

type Phase = "idle" | "loading" | "running" | "error";

interface Hud {
  source: TiltSource;
  detachPct: number;
}

/** iOS 13+ gates DeviceOrientation behind a permission call. */
type OrientationPermissionCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const SOURCE_LABEL: Record<TiltSource, string> = {
  device: "Device tilt",
  keys: "Arrow keys",
  ghost: "Auto-drift ghost",
};

function stateLabel(detach: number): string {
  if (detach < 0.22) return "Embodied — inside the body";
  if (detach < 0.5) return "Loosening — the self starts to slip";
  if (detach < 0.78) return "Detaching — rising up and behind";
  return "Out of body — watching from outside";
}

export default function ExoVantagePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ExoAudio | null>(null);
  const tiltRef = useRef<TiltField | null>(null);
  const sceneRef = useRef<ExoScene | null>(null);
  const flickerRef = useRef<ReturnType<typeof createSafeFlicker> | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [hud, setHud] = useState<Hud>({ source: "ghost", detachPct: 0 });
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (tiltRef.current?.setKey(e.code, true)) e.preventDefault();
  }, []);
  const onKeyUp = useCallback((e: KeyboardEvent) => {
    if (tiltRef.current?.setKey(e.code, false)) e.preventDefault();
  }, []);
  const onResize = useCallback(() => {
    sceneRef.current?.resize();
  }, []);

  const loop = useCallback(() => {
    const tilt = tiltRef.current;
    const scene = sceneRef.current;
    const audio = audioRef.current;
    const flicker = flickerRef.current;
    if (!tilt || !scene || !audio || !flicker) return;

    const tMs = performance.now();
    const tSec = tMs / 1000;
    const frame = tilt.sample(tMs);

    audio.update(frame.detach, frame.tiltX);
    scene.render({
      tiltX: frame.tiltX,
      tiltZ: frame.tiltZ,
      detach: frame.detach,
      time: tSec,
      flick: flicker.value(tSec),
    });

    frameCountRef.current += 1;
    if (frameCountRef.current % 10 === 0) {
      setHud({ source: frame.source, detachPct: Math.round(frame.detach * 100) });
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
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    sceneRef.current?.dispose();
    sceneRef.current = null;
    flickerRef.current?.kill();
    flickerRef.current = null;
    void audioRef.current?.dispose();
    audioRef.current = null;
  }, [onKeyDown, onKeyUp, onResize]);

  const start = useCallback(async () => {
    if (phase !== "idle" && phase !== "error") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("loading");
    setError(null);
    setSensorNote(null);
    try {
      const reduced = prefersReducedMotion();

      let scene: ExoScene;
      try {
        scene = new ExoScene(canvas);
      } catch {
        throw new Error("WebGL is unavailable here, so the exo-vantage room can't render.");
      }
      sceneRef.current = scene;

      const audio = new ExoAudio();
      await audio.start();
      audioRef.current = audio;

      // Slow, high-floor luminance breath — safely inside the drift band.
      const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 0.5, floor: 0.8 });
      flicker.enable();
      flickerRef.current = flicker;

      const tilt = new TiltField({ reduced });
      tiltRef.current = tilt;

      // Motion sensor with iOS permission flow; fall back to keys + ghost.
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
              "Motion access denied — steering with arrow keys and the auto-drift ghost instead.",
            );
          }
        } catch {
          setSensorNote(
            "Motion sensor unavailable — steering with arrow keys and the auto-drift ghost instead.",
          );
        }
      } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", tilt.onDeviceOrientation);
      } else {
        setSensorNote(
          "No motion sensor here — arrow keys nudge the tilt, and it drifts out of body on its own.",
        );
      }

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("resize", onResize);

      scene.resize();
      frameCountRef.current = 0;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the room. Reload and retry.");
      stopAll();
      setPhase("error");
    }
  }, [phase, loop, stopAll, onKeyDown, onKeyUp, onResize]);

  // Teardown on unmount — no leaks.
  useEffect(() => () => stopAll(), [stopAll]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2080 · Exo Vantage
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Watch yourself from outside your own body
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          A drug-free out-of-body experience: tilt the phone and what your inner ear (the motion
          sensor) reports drifts out of register with what you see. The mismatch pulls the camera
          out of your body&rsquo;s head and floats it up-and-behind — until you are watching your
          own luminous presence from outside. Hold still and you sink back in.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border bg-black">
        <canvas ref={canvasRef} className="block h-full w-full" style={{ aspectRatio: "16 / 10" }} />
        {phase !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
            <button
              onClick={start}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading"
                ? "Opening the room…"
                : phase === "error"
                  ? "Try again"
                  : "Begin — leave the body"}
            </button>
            <p className="max-w-sm px-6 text-center text-base leading-relaxed text-muted-foreground">
              Sound on. Tilt your phone to decouple sight from balance — or use the arrow keys. With
              no input it drifts out of body on its own.
            </p>
          </div>
        )}
      </div>

      {/* Live readout: embodiment ↔ out-of-body. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          State: {phase === "running" ? stateLabel(hud.detachPct / 100) : "—"}
        </span>
        {phase === "running" && (
          <>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Steering: {SOURCE_LABEL[hud.source]}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Detachment: {hud.detachPct}%
            </span>
          </>
        )}
      </div>

      {sensorNote && phase === "running" && (
        <p className="text-base leading-relaxed text-destructive">{sensorNote}</p>
      )}
      {error && <p className="text-base leading-relaxed text-destructive">{error}</p>}

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

      <PrototypeNav slugs={["2080-exo-vantage"]} />
    </div>
  );
}
