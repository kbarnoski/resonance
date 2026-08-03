"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLuminousScene, type SceneHandle } from "./scene";
import { makeJourney, type Journey, DURATION } from "./journey";
import { makeLuminousAudio, type LuminousAudio } from "./audio";
import { mulberry32, SEED } from "./rng";

// Master gain ceiling — the drone stays soft; the limiter guards the peak.
const PEAK = 0.16;

/** Self-contained prefers-reduced-motion probe (no cross-folder import). */
function readReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  // engine state kept out of the React render path
  const sceneRef = useRef<SceneHandle | null>(null);
  const journeyRef = useRef<Journey | null>(null);
  const audioRef = useRef<LuminousAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // clocks: a free-running visual clock (so the field drifts before audio) and
  // a start timestamp captured on the Begin gesture that drives progress.
  const idleTimeRef = useRef(0);
  const lastRef = useRef(0);
  const startRef = useRef<number | null>(null);

  const runFrame = useCallback(() => {
    if (!runningRef.current) return;
    const now = performance.now();
    let dt = (now - lastRef.current) / 1000;
    if (dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05; // clamp tab-switch spikes
    lastRef.current = now;
    idleTimeRef.current += dt;

    // Progress advances only once Begin is pressed; before that the void is
    // alive and drifting at progress 0, so the piece reads silent-but-living.
    let progress = 0;
    if (startRef.current != null) {
      progress = (now - startRef.current) / 1000 / DURATION;
      if (progress > 1) progress = 1; // hold calmly at the end
    }

    const journey = journeyRef.current;
    if (journey) {
      journey.update(progress, idleTimeRef.current, reducedRef.current);
      const scene = sceneRef.current;
      if (scene) {
        const bells = scene.update(dt, journey);
        const audio = audioRef.current;
        if (audio) for (let b = 0; b < bells; b++) audio.bell();
      }
      const audio = audioRef.current;
      if (audio) {
        audio.update(
          journey.warmth,
          journey.lightIntensity,
          journey.tunnelStrength,
        );
      }
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // mount: build journey + scene, start the idle render loop
  useEffect(() => {
    reducedRef.current = readReducedMotion();
    journeyRef.current = makeJourney();

    const mount = mountRef.current;
    if (mount) {
      const rng = mulberry32(SEED);
      const scene = createLuminousScene(mount, rng);
      if (scene) {
        sceneRef.current = scene;
      } else {
        setWebglFailed(true);
      }
    }

    runningRef.current = true;
    lastRef.current = performance.now();
    idleTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      if (ctxRef.current) {
        const c = ctxRef.current;
        ctxRef.current = null;
        setTimeout(() => {
          c.close().catch(() => {});
        }, 1000);
      }
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [runFrame]);

  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // gesture: open the AudioContext and begin the forward journey
  const begin = useCallback(() => {
    if (startRef.current != null) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      ctxRef.current = ctx;
      audioRef.current = makeLuminousAudio(ctx, PEAK);
    } catch {
      audioRef.current = null;
    }
    startRef.current = performance.now();
    setStarted(true);
    // let the overlay fade before it leaves the tree
    setTimeout(() => setOverlayGone(true), 900);
  }, []);

  return (
    <main className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-background text-foreground">
      {/* the 3D world you fly through */}
      <div ref={mountRef} className="absolute inset-0 block h-full w-full" />

      {/* Begin overlay — the only entry chrome; fades and leaves after start */}
      {!overlayGone && (
        <div
          className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 px-6 text-center transition-opacity duration-[900ms] ${
            started
              ? "pointer-events-none opacity-0"
              : "bg-background/60 opacity-100 backdrop-blur-[2px]"
          }`}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Luminous
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
            A wordless passage — out of the dark, up the tunnel of light, into
            the radiance, and gently back. Sound on, if you can.
          </p>
          {webglFailed && (
            <p className="max-w-sm text-base leading-relaxed text-destructive">
              This device could not open a 3D context, so the space cannot be
              drawn — but you can still press Begin and let the drone carry the
              journey.
            </p>
          )}
          <button
            type="button"
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        </div>
      )}

      {/* Design notes — a small, quiet corner affordance */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-3 left-4 z-20 text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Luminous — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single eased progress drives a genuine 3D traversal: the camera
                physically flies forward through staged volumes — a dark indigo
                void, a mote-field that draws into a tunnel of light, an
                enveloping warm radiance, a boundless still field, and a gentle
                cooling return. You are inside the space, not looking at a
                diagram.
              </p>
              <p>
                The glow is thousands of additive sprites plus a nested stack of
                warm sprites for the being of light — overlapping additive halos
                are the bloom, with no post-processing. Exponential fog carries
                depth. The arc follows the near-death stages described by Raymond
                Moody in <em>Life After Life</em> (1975).
              </p>
              <p>
                The drone is a just-intonation chord over a 55&nbsp;Hz root that
                adds tuned overtones as you near the light and withdraws them on
                the return. Everything is deterministic (seeded), and the motion
                is slow, flicker-free, and gentled further under reduced-motion
                settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
