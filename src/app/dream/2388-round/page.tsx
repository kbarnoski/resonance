"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { OpticalFlow, type FlowSample } from "./flow";
import { LoopEngine } from "./loops";
import { LooperAudio } from "./audio";
import { Visualizer } from "./visual";

/* ------------------------------------------------------------------ *
 * 2388 — Round
 * Your body as a live looper pedal. A few seconds of motion becomes a
 * looping ghost that replays forever on its own drifting clock; you layer
 * new gestures on top until a whole canon of past selves is moving and
 * singing at once. No master knob — just accumulating independent voices.
 * Webcam optical flow → motion centroid; three.js figures; one Web Audio
 * voice per layer forming a phasing round. Degrades to a seeded auto-
 * performer with no camera.
 * ------------------------------------------------------------------ */

type Phase = "idle" | "running";
type Source = "camera" | "demo";

const MAX_CLIPS = 6;
const RECORD_MS = 7000;

/** Deterministic auto-performer path (no Math.random) for the no-camera case. */
function demoSample(now: number, startMs: number): FlowSample {
  const t = (now - startMs) / 1000;
  const cx = Math.sin(t * 0.7) * 0.55 + Math.sin(t * 0.23 + 1.3) * 0.32;
  const cy = Math.cos(t * 0.53) * 0.5 + Math.sin(t * 0.31 + 0.7) * 0.26;
  const energy = 0.32 + 0.32 * Math.abs(Math.sin(t * 0.9));
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { cx: clamp(cx), cy: clamp(cy), energy };
}

export default function RoundPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("demo");
  const [glOk, setGlOk] = useState(true);
  const [autoArm, setAutoArm] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [loopCount, setLoopCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Imperative engine refs (kept out of React render for the rAF loop).
  const rafRef = useRef<number | null>(null);
  const flowRef = useRef<OpticalFlow | null>(null);
  const engineRef = useRef<LoopEngine | null>(null);
  const audioRef = useRef<LooperAudio | null>(null);
  const visRef = useRef<Visualizer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const startMsRef = useRef(0);
  const autoArmRef = useRef(true);
  const sourceRef = useRef<Source>("demo");
  const figureIdsRef = useRef<Set<number>>(new Set());
  const voiceIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    autoArmRef.current = autoArm;
  }, [autoArm]);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    audioRef.current?.dispose();
    audioRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      void ctxRef.current.close();
    }
    ctxRef.current = null;
    visRef.current?.dispose();
    visRef.current = null;
    flowRef.current = null;
    engineRef.current = null;
    figureIdsRef.current.clear();
    voiceIdsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  const tick = useCallback(() => {
    const engine = engineRef.current;
    const audio = audioRef.current;
    const vis = visRef.current;
    if (!engine) return;
    const now = performance.now();

    // Continuous auto-arm: keep laying down layers while enabled + room left.
    if (autoArmRef.current && !engine.recording && !engine.atCapacity) {
      engine.arm(now);
    }

    // Acquire the current motion sample.
    let sample: FlowSample;
    if (sourceRef.current === "camera" && flowRef.current) {
      sample = flowRef.current.compute();
    } else {
      sample = demoSample(now, startMsRef.current);
    }
    engine.push(now, sample);

    // LIVE voice + figure (id 0 is reserved for live).
    if (audio) {
      audio.ensure(0, true, 0);
      audio.update(0, engine.live.y, engine.live.e);
    }
    vis?.updateLive(engine.live.x, engine.live.y, engine.live.trail);

    // Reconcile persistent layers → figures + voices, then drive them.
    const alive = new Set<number>();
    engine.clips.forEach((clip, i) => {
      alive.add(clip.id);
      if (!figureIdsRef.current.has(clip.id)) {
        vis?.addFigure(clip.id, clip.points);
        figureIdsRef.current.add(clip.id);
      }
      const pan = MAX_CLIPS > 1 ? (i / (MAX_CLIPS - 1)) * 1.4 - 0.7 : 0;
      if (audio && !voiceIdsRef.current.has(clip.id)) {
        audio.ensure(clip.id, false, pan);
        voiceIdsRef.current.add(clip.id);
      }
      const p = engine.sampleClip(clip, now);
      vis?.updateFigure(clip.id, p.x, p.y);
      audio?.update(clip.id, p.y, p.e);
    });

    // Retire figures/voices whose clips were cleared.
    figureIdsRef.current.forEach((id) => {
      if (!alive.has(id)) {
        vis?.removeFigure(id);
        figureIdsRef.current.delete(id);
      }
    });
    voiceIdsRef.current.forEach((id) => {
      if (!alive.has(id)) {
        audio?.remove(id);
        voiceIdsRef.current.delete(id);
      }
    });

    vis?.render(now);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Lightweight UI heartbeat (4 Hz) — avoids re-rendering inside the rAF loop.
  useEffect(() => {
    if (phase !== "running") return;
    const iv = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      setLoopCount(engine.clips.length);
      setRecording(engine.recording);
      setElapsed(Math.floor((performance.now() - startMsRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(iv);
  }, [phase]);

  const begin = useCallback(async () => {
    // Audio + camera created only inside this user gesture.
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtor();
    await ctx.resume();
    ctxRef.current = ctx;
    audioRef.current = new LooperAudio(ctx);

    // WebGL.
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const vis = new Visualizer(canvas);
        const w = wrapRef.current?.clientWidth ?? window.innerWidth;
        const h = wrapRef.current?.clientHeight ?? window.innerHeight;
        vis.resize(w, h);
        visRef.current = vis;
        setGlOk(true);
      } catch {
        setGlOk(false);
        setNote(
          "WebGL is unavailable on this device — the round is playing as audio only.",
        );
      }
    }

    engineRef.current = new LoopEngine({
      maxClips: MAX_CLIPS,
      recordMs: RECORD_MS,
      autoArm: autoArmRef.current,
    });
    startMsRef.current = performance.now();

    // Try the camera; fall back to the seeded auto-performer if denied.
    let useCamera = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });
      streamRef.current = stream;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;
      flowRef.current = new OpticalFlow(video);
      useCamera = true;
    } catch {
      useCamera = false;
      setNote(
        "No camera access — running a seeded auto-performer that lays down its own looping layers. Grant the camera and reload to move it yourself.",
      );
    }

    const src: Source = useCamera ? "camera" : "demo";
    sourceRef.current = src;
    setSource(src);
    setPhase("running");
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Keep the renderer sized to its container.
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => {
      const vis = visRef.current;
      const wrap = wrapRef.current;
      if (vis && wrap) vis.resize(wrap.clientWidth, wrap.clientHeight);
    };
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  const recordNow = useCallback(() => {
    engineRef.current?.arm(performance.now());
  }, []);

  const clearLast = useCallback(() => {
    engineRef.current?.clearLast();
  }, []);

  const clearAll = useCallback(() => {
    engineRef.current?.clearAll();
  }, []);

  const toggleAutoArm = useCallback(() => {
    setAutoArm((v) => {
      const next = !v;
      autoArmRef.current = next;
      if (engineRef.current) engineRef.current.autoArm = next;
      return next;
    });
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Art layer. */}
      <div ref={wrapRef} className="fixed inset-0 -z-10">
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {phase === "idle" && (
        <section className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Round
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Your body is a live looper pedal. Move for a few seconds and that
            gesture becomes a looping ghost that replays forever; layer new ones
            on top until a whole canon of your past selves is moving and singing
            at once.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void begin()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <span className="text-sm text-muted-foreground">
              Uses your camera if allowed — otherwise it performs itself.
            </span>
          </div>

          <details className="mt-10 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Design notes
            </summary>
            <div className="mt-3 space-y-3 text-base">
              <p>
                There is no master intensity knob. The piece is a growing
                polyphony of independent loops — each recorded gesture becomes a
                persistent, autonomous voice and figure on its own clock, drifting
                out of phase with the others. Minute five holds every layer from
                minute one, so it sounds and looks nothing like where it started.
              </p>
              <p>
                Movement history is the material: after{" "}
                <em>
                  &ldquo;Moving Contexts: How Culture, Context, and Movement
                  Histories Shape Whole-Body Interaction in Aesthetic
                  Environments&rdquo;
                </em>{" "}
                (MOCO 2026, ACM DOI 10.1145/3802842.3802852). The accumulating
                loops drifting out of phase follow Steve Reich&rsquo;s phase music
                (<em>Piano Phase</em>, <em>It&rsquo;s Gonna Rain</em>) — a vocal
                looper, but for the body.
              </p>
            </div>
          </details>
        </section>
      )}

      {phase === "running" && (
        <>
          {/* Control strip. */}
          <div className="fixed left-1/2 top-4 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-background/60 px-2 py-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={recordNow}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {recording ? "Recording…" : "Record 7s"}
            </button>
            <button
              type="button"
              onClick={toggleAutoArm}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {autoArm ? "Auto-loop: on" : "Auto-loop: off"}
            </button>
            <button
              type="button"
              onClick={clearLast}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear last
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear all
            </button>
          </div>

          {/* Readout. */}
          <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-border bg-background/60 px-4 py-2 backdrop-blur-md">
            <span className="font-mono text-xs text-muted-foreground">
              {loopCount}/{MAX_CLIPS} layers · +live ·{" "}
              {source === "camera" ? "camera" : "auto"} · {elapsed}s
            </span>
          </div>

          {note && (
            <div className="fixed left-1/2 top-20 z-20 max-w-md -translate-x-1/2 px-4 text-center">
              <p className="text-base text-destructive">{note}</p>
            </div>
          )}

          {!glOk && (
            <div className="fixed inset-0 -z-10 bg-background" aria-hidden />
          )}
        </>
      )}

      <PrototypeNav slugs={["2388-round"]} />
    </main>
  );
}
