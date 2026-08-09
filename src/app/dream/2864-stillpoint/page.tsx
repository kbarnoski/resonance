"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FORM_CONSTANTS,
  FORM_LABEL,
  type FormConstant,
} from "../_shared/visionary/logpolar";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createStillpointGL, type StillpointGL } from "./gl";
import { MotionMeter, syntheticMotion } from "./flow";
import { startStillpointAudio, type StillpointAudio } from "./audio";

// asymmetric valve time constants: opens slowly (stillness earns it),
// slams shut fast (movement snaps you back to reality).
const TAU_OPEN = 3.2; // seconds to open toward stillness
const TAU_CLOSE = 0.32; // seconds to close on movement
const MOTION_EMA = 0.35; // smoothing on the raw motion signal

const DESIGN_NOTES = `2864 · STILLPOINT

The one question: what if a visionary hallucination opened not by dragging a
slider, but by holding your body still — the way meditation, not a knob,
dissolves the boundary of perception?

Normal perception is a "reducing valve" (Huxley): high-precision sensory
evidence keeps the brain's top-down geometric priors filtered out. Here the
webcam measures your motion by frame-differencing. Move, and sensory precision
is high — the valve stays CLOSED and you see the near-literal camera image.
Go still, and precision decays: over a few seconds the valve OPENS, the live
image is warped through the retina→V1 log-polar (cortical) map and overwritten
by Klüver's four form constants — tunnels, spokes, spirals, honeycombs. Any
sudden movement re-closes the valve within about half a second.

The drone is a continuous inharmonic bloom (no scale-snapping): partials fade
in, detune/beating deepens, and a feedback-delay tail lengthens as the valve
opens. Thin and quiet when closed.

Grounded in: Frontiers in Psychology 2026, "Beyond the reducing valve: towards
a computational neurophenomenology of altered states via deep neural networks"
(fpsyg.2026.1819038); Aldous Huxley's reducing-valve metaphor; Heinrich
Klüver's four form constants; Bressloff–Cowan log-polar cortical map.

Safety: any luminance drift is routed through the shared SafeFlicker (<=3 Hz,
soft sine, reduced-motion honored) — never a strobe.`;

export default function Stillpoint() {
  const [mode, setMode] = useState<"idle" | "running">("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [camErr, setCamErr] = useState<string | null>(null);
  const [glErr, setGlErr] = useState<string | null>(null);
  const [valvePct, setValvePct] = useState(0);
  const [formLabel, setFormLabel] = useState<string>(FORM_LABEL.tunnel);
  const [usingCamera, setUsingCamera] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const glRef = useRef<StillpointGL | null>(null);
  const audioRef = useRef<StillpointAudio | null>(null);
  const meterRef = useRef<MotionMeter | null>(null);
  const animRef = useRef(0);

  const valveRef = useRef(0);
  const motionRef = useRef(0);
  const startRef = useRef(0);
  const lastRef = useRef(0);
  const uiTickRef = useRef(0);

  const begin = useCallback(() => {
    // AudioContext must be created on the user gesture.
    audioRef.current = startStillpointAudio();
    setMode("running");
  }, []);

  const stop = useCallback(() => {
    setMode("idle");
  }, []);

  // ── camera acquisition ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "running") return;
    let cancelled = false;

    const start = async () => {
      const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!md || typeof md.getUserMedia !== "function") {
        setCamErr("No camera access here — self-playing from a stillness rhythm.");
        setUsingCamera(false);
        return;
      }
      try {
        const stream = await md.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const vid = document.createElement("video");
        vid.srcObject = stream;
        vid.muted = true;
        vid.playsInline = true;
        vid.autoplay = true;
        await vid.play();
        streamRef.current = stream;
        videoRef.current = vid;
        meterRef.current = new MotionMeter();
        setUsingCamera(true);
        setCamErr(null);
      } catch {
        if (cancelled) return;
        setCamErr("Camera blocked — self-playing from a stillness rhythm instead.");
        setUsingCamera(false);
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      videoRef.current = null;
      meterRef.current = null;
    };
  }, [mode]);

  // ── renderer + animation loop ───────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: StillpointGL | null;
    try {
      gl = createStillpointGL(canvas);
    } catch {
      gl = null;
    }
    if (!gl) {
      setGlErr("WebGL2 isn't available in this browser, so the geometry can't render.");
      return;
    }
    glRef.current = gl;
    setGlErr(null);

    const flicker = createSafeFlicker({ maxHz: 1.2, defaultHz: 0.8, floor: 0.72 });
    if (!prefersReducedMotion()) flicker.enable();

    const resize = () => gl?.resize(window.innerWidth, window.innerHeight);
    resize();
    window.addEventListener("resize", resize);

    startRef.current = performance.now();
    lastRef.current = startRef.current;
    valveRef.current = 0;
    motionRef.current = 0;

    let running = true;
    const loop = (nowMs: number) => {
      if (!running) return;
      const dt = Math.min((nowMs - lastRef.current) / 1000, 0.05);
      lastRef.current = nowMs;
      const t = (nowMs - startRef.current) / 1000;

      // ── measure motion (real camera, or synthetic self-play) ────────────────
      let rawMotion: number;
      const vid = videoRef.current;
      const meter = meterRef.current;
      if (vid && meter && vid.readyState >= 2) {
        rawMotion = meter.sample(vid);
      } else {
        rawMotion = syntheticMotion(t);
      }
      motionRef.current += (rawMotion - motionRef.current) * MOTION_EMA;
      const motion = motionRef.current;

      // ── valve dynamics: precision (motion) closes it; stillness opens it ────
      const target = 1 - Math.min(1, motion); // still → 1 (open), moving → 0
      const tau = target > valveRef.current ? TAU_OPEN : TAU_CLOSE;
      const a = 1 - Math.exp(-dt / tau);
      valveRef.current += (target - valveRef.current) * a;
      const valve = valveRef.current;

      // ── form-constant morph drifts slowly through the four ──────────────────
      const form = (t / 56) % 1;

      // ── safe luminance drift, only as geometry opens ────────────────────────
      const drift = 1 - valve * (1 - flicker.value(nowMs / 1000));

      gl!.render({ video: vid, time: t, valve, form, flicker: drift });
      audioRef.current?.setValve(valve);

      // throttle UI updates to ~8 Hz
      uiTickRef.current += dt;
      if (uiTickRef.current > 0.12) {
        uiTickRef.current = 0;
        setValvePct(Math.round(valve * 100));
        const idx = Math.min(FORM_CONSTANTS.length - 1, Math.floor(form * FORM_CONSTANTS.length));
        const fc: FormConstant = FORM_CONSTANTS[idx];
        setFormLabel(FORM_LABEL[fc]);
      }

      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      gl?.dispose();
      glRef.current = null;
    };
  }, [mode]);

  // ── stop audio whenever we leave running ────────────────────────────────────
  useEffect(() => {
    if (mode === "running") return;
    audioRef.current?.stop();
    audioRef.current = null;
  }, [mode]);

  // ── unmount safety net ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: mode === "running" ? "block" : "none" }}
      />

      {/* ── Idle / start screen ────────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 text-center">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              2864 · stillpoint
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              The reducing valve opens when you hold still
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
              Not a slider — your stillness. As you stop moving, the webcam&apos;s
              sensory precision falls and the brain&apos;s geometric priors bleed
              through, warping the live image into breathing form-constant geometry.
              Move, and the valve snaps shut on reality.
            </p>
          </div>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Allow camera &amp; begin
          </button>
          <p className="max-w-sm text-xs text-muted-foreground">
            The camera stays on your device. No permission? It self-plays from a
            slow stillness rhythm.
          </p>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {mode === "running" && (
        <>
          {/* valve meter */}
          <div className="pointer-events-none absolute left-4 top-4 flex w-56 flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>reducing valve</span>
              <span>{valvePct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-background/60">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${valvePct}%` }}
              />
            </div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {valvePct < 20
                ? "closed · literal"
                : valvePct < 70
                  ? "opening"
                  : "open · " + formLabel.toLowerCase()}
            </div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              {usingCamera ? "camera · be still" : "self-playing"}
            </div>
          </div>

          {camErr && (
            <div className="pointer-events-none absolute left-1/2 top-4 w-fit max-w-[90vw] -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-center text-sm text-muted-foreground backdrop-blur-sm">
              {camErr}
            </div>
          )}
          {glErr && (
            <div className="pointer-events-none absolute left-1/2 top-16 w-fit max-w-[90vw] -translate-x-1/2 rounded-md border border-destructive/40 bg-background/80 px-4 py-2 text-center text-sm text-destructive backdrop-blur-sm">
              {glErr}
            </div>
          )}

          <button
            onClick={stop}
            className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            End
          </button>
        </>
      )}

      {/* ── Design notes ───────────────────────────────────────────────────── */}
      <button
        onClick={() => setNotesOpen(true)}
        className="absolute bottom-3 right-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {notesOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {DESIGN_NOTES}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
