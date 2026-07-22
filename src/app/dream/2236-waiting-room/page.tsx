"use client";

/* ------------------------------------------------------------------ *
 * 2236 — Waiting Room
 *
 * You build a space with your body before a psychedelic presence can
 * inhabit it. Your moving body (seen through the webcam) does not summon
 * a swarm — it CARVES a space. An inverse log-polar / form-constant warp
 * (Bressloff–Cowan) turns a hexagonal cortical lattice into a receding
 * honeycomb tunnel — the DMT "waiting room" / antechamber (Strassman).
 * Sustained motion climbs a four-stage immersion ladder; only once the
 * room is fully built does a coherent presence condense in it and regard
 * you. Stop moving and it recedes. Falls back to pointer/touch motion if
 * there is no camera.
 *
 * Renders: "Micro-phenomenology of immersion and perceived presences
 * under DMT" (Neuroscience of Consciousness, 2026, niag015) — immersion
 * is a structured continuum; presence emerges only AFTER multisensory
 * binding + 3D-spatial structure. Companion: "Computational spirits"
 * (Neuroscience of Consciousness, 2026, niaf069).
 *
 * Subsystems: webcam capture · frame-diff motion field · log-polar warp
 * engine · four-stage state machine · spectral/inharmonic audio.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { MotionField } from "./motion";
import { SpectralAudio } from "./audio";
import { WarpRenderer } from "./warp";
import {
  nextCoherence,
  stageFromCoherence,
  STAGE_BLURB,
  STAGE_LABEL,
  type Stage,
} from "./stages";

type Phase = "idle" | "running";
type Mode = "camera" | "pointer";

const CAP_W = 96;
const CAP_H = 72;

export default function WaitingRoomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("bodily");
  const [coherenceUi, setCoherenceUi] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const capRef = useRef<HTMLCanvasElement>(null);

  const rendererRef = useRef<WarpRenderer | null>(null);
  const audioRef = useRef<SpectralAudio | null>(null);
  const fieldRef = useRef<MotionField | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const modeRef = useRef<Mode>("pointer");

  const coherenceRef = useRef(0);
  const energyEmaRef = useRef(0);
  const centroidRef = useRef({ cx: 0, cy: 0 });
  const stageRef = useRef<Stage>("bodily");
  const lastTsRef = useRef(0);
  const uiTickRef = useRef(0);
  const pointerRef = useRef({ nx: 0.5, ny: 0.5, speed: 0, lastT: 0, seen: false });

  const loop = useCallback((now: number) => {
    if (!runningRef.current) return;
    const dt = Math.min(0.05, (now - lastTsRef.current) / 1000 || 0.016);
    lastTsRef.current = now;

    const field = fieldRef.current;
    const renderer = rendererRef.current;
    if (!field || !renderer) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    let energy = 0;
    let cx = centroidRef.current.cx;
    let cy = centroidRef.current.cy;

    if (modeRef.current === "camera") {
      const video = videoRef.current;
      const cap = capRef.current;
      if (video && cap && video.readyState >= 2 && video.videoWidth > 0) {
        const cctx = cap.getContext("2d", { willReadFrequently: true });
        if (cctx) {
          cctx.save();
          cctx.translate(cap.width, 0);
          cctx.scale(-1, 1); // mirror (selfie)
          cctx.drawImage(video, 0, 0, cap.width, cap.height);
          cctx.restore();
          const frame = cctx.getImageData(0, 0, cap.width, cap.height);
          const s = field.pushFrame(frame.data);
          energy = s.energy;
          cx = s.cx;
          cy = s.cy;
        }
      }
      field.decay(0.85);
    } else {
      const p = pointerRef.current;
      const s = field.injectPoint(p.nx, p.ny, p.speed);
      energy = s.energy;
      cx = s.cx;
      cy = s.cy;
      p.speed *= 0.82;
      field.decay(0.88);
    }

    // Smooth energy + centroid before they drive anything.
    const ema = energyEmaRef.current + (energy - energyEmaRef.current) * 0.25;
    energyEmaRef.current = ema;
    const follow = energy > 0.01 ? 0.16 : 0.03;
    centroidRef.current.cx += (cx - centroidRef.current.cx) * follow;
    centroidRef.current.cy += (cy - centroidRef.current.cy) * follow;

    const coh = nextCoherence(coherenceRef.current, ema, dt);
    coherenceRef.current = coh;
    const st = stageFromCoherence(coh);
    stageRef.current = st;

    audioRef.current?.setDrive(ema, coh, centroidRef.current.cx);
    renderer.drawFrame({
      dt,
      energy: ema,
      coherence: coh,
      stage: st,
      cx: centroidRef.current.cx,
      cy: centroidRef.current.cy,
      field,
    });

    // Throttled React updates — keep the render loop light.
    uiTickRef.current++;
    if (st !== stage) setStage(st);
    if (uiTickRef.current % 6 === 0) setCoherenceUi(coh);

    rafRef.current = requestAnimationFrame(loop);
  }, [stage]);

  const begin = useCallback(async () => {
    if (runningRef.current) return;
    setPhase("running");
    setNotice(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new WarpRenderer(canvas);
    renderer.reduceMotion = prefersReducedMotion();
    renderer.resize();
    rendererRef.current = renderer;
    fieldRef.current = new MotionField(CAP_W, CAP_H);

    // Audio must start on the user gesture.
    try {
      const audio = new SpectralAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      setNotice("Audio could not start on this device — the room is silent but live.");
    }

    // Try the camera; degrade to pointer motion on any failure.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      modeRef.current = "camera";
      setMode("camera");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "pointer";
      setMode("pointer");
      const denied =
        err instanceof DOMException && err.name === "NotAllowedError";
      setNotice(
        denied
          ? "Camera permission denied — move your pointer or finger across the room to build it instead."
          : "No camera available — move your pointer or finger across the room to build it instead.",
      );
    }

    runningRef.current = true;
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Pointer / touch fallback tracking (harmless in camera mode; ignored there).
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const now = performance.now();
    const p = pointerRef.current;
    const dt = Math.max(0.001, (now - p.lastT) / 1000);
    const dx = nx - p.nx;
    const dy = ny - p.ny;
    const sp = Math.min(1, (Math.hypot(dx, dy) / dt) * 0.14);
    if (p.seen) p.speed = Math.max(p.speed, sp);
    p.nx = Math.min(1, Math.max(0, nx));
    p.ny = Math.min(1, Math.max(0, ny));
    p.lastT = now;
    p.seen = true;
  }, []);

  // Resize handling.
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const running = phase === "running";

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      className="relative min-h-[calc(100vh-3rem)] w-full touch-none overflow-hidden bg-background"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />
      <canvas ref={capRef} width={CAP_W} height={CAP_H} className="hidden" />

      {/* Chrome overlay — semantic tokens only */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              2236 · Waiting Room
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Hero (idle only) */}
        {!running && (
          <div className="mx-auto max-w-xl text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Build the room before it can be inhabited.
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Move your body. The waiting room assembles out of your own motion —
              first the body, then the senses bind, then a space forms — and only
              once it is fully built does something arrive in it.
            </p>
            <button
              type="button"
              onClick={begin}
              className="pointer-events-auto mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Allow camera &amp; begin
            </button>
            <p className="mt-3 text-xs text-muted-foreground/70">
              No camera? It falls back to pointer / touch motion automatically.
            </p>
          </div>
        )}

        {/* Bottom HUD (running) */}
        {running && (
          <div className="max-w-md space-y-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {STAGE_LABEL[stage]}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {STAGE_BLURB[stage]}
            </p>
            <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round(coherenceUi * 100)}%` }}
              />
            </div>
            {mode === "pointer" && notice && (
              <p className="text-xs text-muted-foreground/80">{notice}</p>
            )}
            {mode === "camera" && (
              <p className="text-xs text-muted-foreground/70">
                Reading your motion through the camera. Keep moving to build the
                room; stop and it recedes.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sensor / audio notice on the idle screen */}
      {!running && notice && (
        <p className="pointer-events-none absolute bottom-5 left-5 max-w-sm text-xs text-destructive">
          {notice}
        </p>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Waiting Room — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                You do not summon a presence — you <em>build a space</em> for one
                with your body, and only a fully-formed room can be inhabited.
                Your motion (webcam, or pointer/touch as fallback) is read as a
                frame-difference field: total motion climbs an immersion ladder;
                the motion centroid steers where the room recedes and where the
                presence looks.
              </p>
              <p>
                <span className="text-foreground">The 2026 finding.</span> This
                renders “Micro-phenomenology of immersion and perceived presences
                under DMT” (<em>Neuroscience of Consciousness</em>, 2026,
                niag015): immersion is a <em>structured continuum</em>, and a
                perceived presence emerges only <em>after</em> multisensory
                integration and 3D-spatial structure have developed. Its
                companion, “Computational spirits: a neuroscientific account of
                psychedelic entity encounters” (<em>Neuroscience of
                Consciousness</em>, 2026, niaf069), models entities as autonomous
                predictive agents — so here the presence keeps its own slow drift.
              </p>
              <p>
                <span className="text-foreground">The warp.</span> The receding
                honeycomb chamber is an inverse log-polar / form-constant map
                (Bressloff–Cowan): a hexagonal lattice in “cortical” coordinates
                (log r, θ) becomes tunnels and honeycomb chambers when unwrapped
                to the screen — the shimmering architecture that precedes a DMT
                breakthrough (Strassman’s “waiting room”).
              </p>
              <p>
                <span className="text-foreground">The four stages.</span>{" "}
                <em>Bodily</em> — near-dark, only motion ripples. <em>Binding</em>{" "}
                — audio ignites and the form constants begin to resolve.{" "}
                <em>Antechamber</em> — the log-polar tunnel deepens into a legible
                honeycomb room with real depth. <em>Presence</em> — a face-like
                gestalt condenses in the architecture and regards you. Stop moving
                and coherence decays: the presence recedes and you slide back
                down. It is sustained, never permanent.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Safety: no strobing. The tunnel drifts smoothly and brightness
                only tracks immersion over seconds — nothing here flickers.
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
    </div>
  );
}
