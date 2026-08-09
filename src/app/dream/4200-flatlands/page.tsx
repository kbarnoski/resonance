"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createFlatScene, type FlatSceneHandle } from "./scene";
import { makeFlatAudio, type FlatAudio } from "./audio";
import { sampleArc, STAGE_LABEL, TOTAL_SECONDS, type Stage } from "./arc";

type Phase = "preface" | "running" | "nogl";

const SEED = 0x4200f1a; // deterministic plane field

interface Readout {
  stage: Stage;
  label: string;
  progress: number;
  elapsed: number;
  descent: number; // shepard drive, as a "descent" gauge
  spread: number;
  ended: boolean;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("preface");
  const [showNotes, setShowNotes] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [readout, setReadout] = useState<Readout>({
    stage: "derealization",
    label: STAGE_LABEL.derealization,
    progress: 0,
    elapsed: 0,
    descent: 0,
    spread: 0,
    ended: false,
  });

  const sceneRef = useRef<FlatSceneHandle | null>(null);
  const audioRef = useRef<FlatAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const flickRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.2 }));
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);
  const startRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const readoutClockRef = useRef(0);

  // ── the frame loop ──────────────────────────────────────────────────────
  const runFrame = useCallback((ts: number) => {
    if (!runningRef.current) return;
    if (lastTsRef.current == null) lastTsRef.current = ts;
    let dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1;

    const tSec = (performance.now() - startRef.current) / 1000;
    const frame = sampleArc(tSec);

    const audio = audioRef.current;
    if (audio) {
      audio.setArc(frame.shepard, frame.drone, frame.wet);
      audio.step(dt);
    }

    const gate = flickRef.current.value(tSec);
    const scene = sceneRef.current;
    if (scene) scene.update(frame, gate, tSec, reducedRef.current);

    readoutClockRef.current += dt;
    if (readoutClockRef.current > 0.15) {
      readoutClockRef.current = 0;
      setReadout({
        stage: frame.stage,
        label: frame.label,
        progress: frame.progress,
        elapsed: frame.elapsed,
        descent: frame.shepard,
        spread: frame.spread,
        ended: frame.ended,
      });
    }

    if (frame.ended) {
      runningRef.current = false;
      if (audioRef.current) audioRef.current.stop();
      return;
    }
    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const applyResize = useCallback(() => {
    sceneRef.current?.resize();
  }, []);

  const begin = useCallback(async () => {
    reducedRef.current = prefersReducedMotion();

    // AudioContext must be created + resumed inside the gesture.
    let audio: FlatAudio | null = null;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      audio = makeFlatAudio(ctx);
      audioRef.current = audio;
    } catch {
      audioRef.current = null;
    }

    setPhase("running");

    // build the scene on the next tick, after the mount div exists.
    requestAnimationFrame(() => {
      const mount = mountRef.current;
      if (mount) {
        const scene = createFlatScene(mount, SEED);
        if (scene) {
          sceneRef.current = scene;
        } else {
          setPhase("nogl");
        }
      }
      startRef.current = performance.now();
      lastTsRef.current = null;
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(runFrame);
    });
  }, [runFrame]);

  const toggleMic = useCallback(async () => {
    if (micState === "on") return; // one-way: engaging is enough to demo
    const audio = audioRef.current;
    if (!audio || !navigator.mediaDevices?.getUserMedia) {
      setMicState("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      audio.attachMic(stream);
      setMicState("on");
    } catch {
      setMicState("denied");
    }
  }, [micState]);

  const toggleFlicker = useCallback(() => {
    const flick = flickRef.current;
    if (flick.enabled) {
      flick.disable();
      setFlickerOn(false);
    } else {
      flick.enable();
      setFlickerOn(true);
    }
  }, []);

  const killFlicker = useCallback(() => {
    flickRef.current.kill();
    setFlickerOn(false);
  }, []);

  // window resize
  useEffect(() => {
    const onResize = () => applyResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyResize]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      const stream = micStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        const c = ctx;
        ctxRef.current = null;
        setTimeout(() => {
          c.close().catch(() => {});
        }, 700);
      }
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  const running = phase === "running" || phase === "nogl";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* full-bleed three.js art */}
      {running && (
        <div ref={mountRef} className="absolute inset-0 block h-full w-full" />
      )}

      {/* ── preface / begin ── */}
      {!running && (
        <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 4200-flatlands
          </p>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Flatlands — a dissociative descent into the white void
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            No drug — only music and slow geometry. The solid world loses its
            depth and dissolves into a receding stack of flat, cardboard-cutout
            planes drifting apart into a white void, then re-coheres as you
            return. A self-running ~6-minute arc over an endless Shepard–Risset
            descent.
          </p>
          <button
            type="button"
            onClick={begin}
            className="mt-8 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin the descent
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="mt-4 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* ── running overlay ── */}
      {running && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[74%]">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Stage {readout.ended ? "· complete" : ""}
            </p>
            <p className="mt-1 text-base font-medium text-foreground">
              {readout.label}
            </p>

            <div className="mt-3 w-56 max-w-full">
              <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>descent</span>
                <span>{Math.round(readout.descent * 100)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${Math.round(readout.descent * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span>spread {Math.round(readout.spread * 100)}%</span>
                <span>
                  {fmtTime(readout.elapsed)} / {fmtTime(TOTAL_SECONDS)}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-muted-foreground/60"
                  style={{ width: `${Math.round(readout.progress * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {phase === "nogl" && (
            <p className="absolute bottom-16 left-4 z-10 max-w-xs text-sm text-destructive">
              WebGL is unavailable on this device — the sound-bed plays on, but
              the plane field cannot be drawn.
            </p>
          )}

          {/* controls */}
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={toggleMic}
              disabled={micState === "on"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60 disabled:hover:bg-background/60 disabled:hover:text-muted-foreground"
            >
              {micState === "on"
                ? "Mic: breath drives the descent"
                : micState === "denied"
                  ? "Mic denied — arc plays on"
                  : "Add mic (optional)"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFlicker}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {flickerOn ? "Luminance flicker: on" : "Luminance flicker: off"}
              </button>
              {flickerOn && (
                <button
                  type="button"
                  onClick={killFlicker}
                  className="min-h-[44px] rounded-md border border-destructive/60 bg-background/60 px-4 text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  Stop
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Design notes
            </button>
          </div>
        </>
      )}

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Flatlands · design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A drug-free walk through the derealization of the dissociative /
              the void descent, rendered as literal geometry. The world is an
              instanced field of thin, flat planes — Edwin Abbott&rsquo;s{" "}
              <em>Flatland</em> (1884) as the metaphor for the clinical
              phenomenology of depersonalization/derealization (DPDR), where the
              solid world looks flat, unreal, stage-set. Objects lose their
              &ldquo;realness&rdquo; and become cardboard cutouts.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A self-running ~6-minute arc: Derealization (the world present but
              subtly wrong) → Detachment (planes drift apart, void opening
              between them, camera pulling back) → Dissolution (slabs thin toward
              transparency, fog swallowing the far field) → the still point (a
              calm near-white void, motion nearly stopped, reverb wide open) →
              Return (planes re-cohere, desaturated colour comes back).
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Sound is the shared altered-states infrastructure: an endless
              Shepard&ndash;Risset <em>descent</em> (Shepard 1964 / Risset) — the
              pitch falling forever — over a just-intonation steel drone, both
              routed through a cistern-like convolution void whose wet mix opens
              toward 1.0 at the still point. Optional mic: your breath quickens
              the descent; it fully self-demos with none.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Safety: any luminance flicker is off by default and routed through
              the shared photosensitive-safe gate (≤3 Hz soft sine, instant
              stop). The default experience is a slow luminance drift, never a
              strobe; reduced-motion is honored. Everything is deterministic — a
              seeded plane field over a <code className="font-mono">performance.now()</code>{" "}
              clock — so it walks the same descent every run.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["4200-flatlands"]} />
    </main>
  );
}
