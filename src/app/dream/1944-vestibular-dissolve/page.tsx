"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { GravityField, type GravitySource } from "./orientation";
import { DissolveAudio } from "./audio";
import { createFieldRenderer, type FieldRenderer, type RenderBackend } from "./render";
import { README_TEXT } from "./readme-text";

type Phase = "idle" | "loading" | "running";

interface Hud {
  source: GravitySource;
  dissolvePct: number;
}

/** iOS 13+ gates DeviceOrientation behind a permission call. */
type OrientationPermissionCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const SOURCE_LABEL: Record<GravitySource, string> = {
  device: "Device tilt",
  keys: "Arrow keys",
  ghost: "Auto-drift ghost",
};

export default function VestibularDissolvePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<DissolveAudio | null>(null);
  const gravityRef = useRef<GravityField | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const flickerRef = useRef<ReturnType<typeof createSafeFlicker> | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<RenderBackend | null>(null);
  const [hud, setHud] = useState<Hud>({ source: "ghost", dissolvePct: 0 });
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (gravityRef.current?.setKey(e.code, true)) e.preventDefault();
  }, []);
  const onKeyUp = useCallback((e: KeyboardEvent) => {
    if (gravityRef.current?.setKey(e.code, false)) e.preventDefault();
  }, []);

  const loop = useCallback(() => {
    const gravity = gravityRef.current;
    const renderer = rendererRef.current;
    const audio = audioRef.current;
    const flicker = flickerRef.current;
    if (!gravity || !renderer || !audio || !flicker) return;

    const tMs = performance.now();
    const tSec = tMs / 1000;
    const frame = gravity.sample(tMs);

    audio.update(frame.dissolve, frame.gx);
    renderer.render({
      up: frame.up,
      dissolve: frame.dissolve,
      time: tSec,
      flick: flicker.value(tSec),
      reduced: reducedRef.current ? 1 : 0,
    });

    frameCountRef.current += 1;
    if (frameCountRef.current % 10 === 0) {
      setHud({ source: frame.source, dissolvePct: Math.round(frame.dissolve * 100) });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (gravityRef.current) {
      window.removeEventListener("deviceorientation", gravityRef.current.onDeviceOrientation);
      gravityRef.current = null;
    }
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    rendererRef.current?.dispose();
    rendererRef.current = null;
    flickerRef.current?.kill();
    flickerRef.current = null;
    void audioRef.current?.dispose();
    audioRef.current = null;
  }, [onKeyDown, onKeyUp]);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase("loading");
    setError(null);
    setSensorNote(null);
    try {
      const reduced = prefersReducedMotion();
      reducedRef.current = reduced;

      const audio = new DissolveAudio();
      await audio.start();
      audioRef.current = audio;

      const renderer = await createFieldRenderer(canvas);
      rendererRef.current = renderer;
      setBackend(renderer.backend);

      // Slow, high-floor luminance breathing — safely inside the drift band.
      const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 0.5, floor: 0.78 });
      flicker.enable();
      flickerRef.current = flicker;

      const gravity = new GravityField({ reduced });
      gravityRef.current = gravity;

      // Motion sensor with iOS permission flow; fall back to keys + ghost.
      let sensorOn = false;
      const Ctor = (typeof DeviceOrientationEvent !== "undefined"
        ? DeviceOrientationEvent
        : undefined) as OrientationPermissionCtor | undefined;
      if (Ctor && typeof Ctor.requestPermission === "function") {
        try {
          const res = await Ctor.requestPermission();
          if (res === "granted") {
            window.addEventListener("deviceorientation", gravity.onDeviceOrientation);
            sensorOn = true;
          } else {
            setSensorNote(
              "Motion access denied — steering the cosmos with arrow keys + auto-drift instead.",
            );
          }
        } catch {
          setSensorNote(
            "Motion sensor unavailable — steering the cosmos with arrow keys + auto-drift instead.",
          );
        }
      } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", gravity.onDeviceOrientation);
        sensorOn = true;
      } else {
        setSensorNote(
          "No motion sensor here — arrow keys nudge the cosmos, and it drifts on its own.",
        );
      }
      void sensorOn;

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      frameCountRef.current = 0;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open the field. Reload and retry.",
      );
      stopAll();
      setPhase("idle");
    }
  }, [phase, loop, stopAll, onKeyDown, onKeyUp]);

  // Teardown on unmount — no leaks.
  useEffect(() => () => stopAll(), [stopAll]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-5 py-10 pb-24">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1944 · Vestibular Dissolve
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Tilt your device until &ldquo;down&rdquo; melts and the cosmos comes apart
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A weightless, boundless drift toward the ketamine / near-death loss of the body. As
          you tilt, the felt gravity vector dissolves — the horizon of a raymarched nebula
          reorients and thins to a boundless fog, and a low anchoring drone thins as a
          weightless shimmer blooms and spreads across the stereo field.
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
              {phase === "loading" ? "Opening the field…" : "Begin — dissolve down"}
            </button>
            <p className="max-w-sm px-6 text-center text-sm leading-relaxed text-muted-foreground">
              Sound on. Tilt your phone to melt &ldquo;down&rdquo; — or use the arrow keys.
              With no input it drifts and dissolves on its own.
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
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Steering: {SOURCE_LABEL[hud.source]}
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dissolve: {hud.dissolvePct}%
            </span>
          </>
        )}
      </div>

      {sensorNote && phase === "running" && (
        <p className="text-sm leading-relaxed text-destructive">{sensorNote}</p>
      )}
      {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

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

      <PrototypeNav slugs={["1944-vestibular-dissolve"]} />
    </div>
  );
}
