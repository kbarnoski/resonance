"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/psych/safeFlicker";
import { BreathAudio } from "./audio";
import { BreathFollower, makeSyntheticBreath } from "./breath";
import { drawField, drawIdle } from "./field";

// ─────────────────────────────────────────────────────────────────────────────
// 3056 · CLEARLIGHT
//
// Breathe a boundless clear light into being. A drug-free meditation instrument:
// the mic reads your breath as a slow amplitude envelope, and calming / slowing
// your breath brightens an edge-free Ganzfeld field until faint hallucinatory
// form-constants (concentric rings + a soft spiral) surface from it. One scalar
// — the breath — expands a center-out bloom, swells a just-intonation drone
// through a long void reverb, and gates the form-constants. Breathe WITH the
// 5.5-bpm pacer ring. No mic? A seeded synthetic breath self-demos the piece.
// ─────────────────────────────────────────────────────────────────────────────

const SEED = 0x3056;
const PACER_HZ = 0.0917; // 5.5 breaths / min

export default function ClearlightPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [readout, setReadout] = useState({ breath: 0, calm: 0, bpm: 5.5 });

  // Photic-pulse (opt-in) state.
  const [showPulseWarn, setShowPulseWarn] = useState(false);
  const [pulseOn, setPulseOn] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Imperative engine refs (the hot loop never triggers React re-renders).
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<BreathAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const followerRef = useRef<BreathFollower | null>(null);
  const syntheticRef = useRef<((dt: number) => number) | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const renderCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const clockRef = useRef(0);
  const lastMsRef = useRef(0);
  const lastUiRef = useRef(0);
  const reducedRef = useRef(false);
  const startedRef = useRef(false);

  // ── Size the canvas backing store to the element + dpr, returning the ctx. ──
  const configureCanvas = useCallback((): CanvasRenderingContext2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(320, Math.floor(rect.height));
    sizeRef.current = { w, h };
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    renderCtxRef.current = ctx;
    return ctx;
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const a = audioRef.current;
    audioRef.current = null;
    if (a) a.dispose();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
    followerRef.current = null;
    syntheticRef.current = null;
  }, []);

  // ── Mount: detect reduced motion, size the canvas, paint one idle frame. ──
  useEffect(() => {
    const rm = prefersReducedMotion();
    reducedRef.current = rm;
    setReduced(rm);

    const ctx = configureCanvas();
    const { w, h } = sizeRef.current;
    if (ctx) drawIdle(ctx, w, h);

    const onResize = () => {
      const c = configureCanvas();
      if (c && !startedRef.current) {
        drawIdle(c, sizeRef.current.w, sizeRef.current.h);
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      teardown();
    };
  }, [configureCanvas, teardown]);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    startedRef.current = true;

    const ctx = renderCtxRef.current ?? configureCanvas();
    if (!ctx) return;

    // Audio context is created + resumed only now, from the user gesture.
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audioCtx = new AC();
    ctxRef.current = audioCtx;
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    const audio = new BreathAudio(audioCtx);
    audioRef.current = audio;

    // Try the mic; on any failure, fall back to the seeded synthetic breath.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      audio.attachMic(stream);
      setMicNotice(null);
    } catch {
      syntheticRef.current = makeSyntheticBreath(SEED);
      setMicNotice(
        "Microphone unavailable — breathing a seeded synthetic breath so the piece self-demos. Grant mic access and reload to breathe it yourself.",
      );
    }

    followerRef.current = new BreathFollower();
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.62 });

    clockRef.current = 0;
    lastMsRef.current = performance.now();
    lastUiRef.current = 0;

    const loop = () => {
      const audioEngine = audioRef.current;
      const follower = followerRef.current;
      const flicker = flickerRef.current;
      const rctx = renderCtxRef.current;
      if (!audioEngine || !follower || !flicker || !rctx) return;

      const now = performance.now();
      let dt = (now - lastMsRef.current) / 1000;
      lastMsRef.current = now;
      if (dt <= 0 || dt > 0.1) dt = 0.016;

      const rm = reducedRef.current;
      clockRef.current += dt * (rm ? 0.4 : 1);
      const t = clockRef.current;

      // One RMS number per frame: mic if present, else seeded synthetic breath.
      const rms = audioEngine.hasMic
        ? audioEngine.readLevel()
        : (syntheticRef.current?.(dt) ?? 0);
      const s = follower.update(rms, dt);

      audioEngine.setBreath(s.breath);
      audioEngine.step(dt);

      // 5.5-bpm pacer: starts fully exhaled, grows on the inhale.
      const pacer = 0.5 + 0.5 * Math.sin(2 * Math.PI * PACER_HZ * t - Math.PI / 2);
      // SafeFlicker returns 1.0 when the opt-in pulse is disabled.
      const flickerVal = flicker.value(t);

      const { w, h } = sizeRef.current;
      drawField(rctx, w, h, {
        t,
        breath: s.breath,
        calm: s.calm,
        pacer,
        flicker: flickerVal,
        agitation: s.agitation,
        reduced: rm,
      });

      if (now - lastUiRef.current > 220) {
        lastUiRef.current = now;
        setReadout({
          breath: Math.round(s.breath * 100),
          calm: Math.round(s.calm * 100),
          bpm: s.bpm,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started, configureCanvas]);

  // ── Photic pulse (opt-in, two-step, hard-capped by SafeFlicker) ──
  const armPulse = useCallback(() => {
    setShowPulseWarn(false);
    flickerRef.current?.enable();
    setPulseOn(true);
  }, []);

  const killPulse = useCallback(() => {
    flickerRef.current?.kill();
    setPulseOn(false);
  }, []);

  const bpmLabel = readout.bpm > 0 ? readout.bpm.toFixed(1) : "—";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="A boundless clear-light Ganzfeld field you breathe into being"
      />

      {/* Title / description / live readout */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Resonance · Dream 3056
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Clearlight
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Breathe a boundless clear light into being. Slow, steady breathing
          brightens the field until faint form-constants surface from it.
        </p>
        {started && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            breath {readout.breath}% · calm {readout.calm}% · {bpmLabel} bpm
          </p>
        )}
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 flex max-w-lg flex-col items-center rounded-lg border border-border bg-background p-6 text-center shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Breathe the clear light
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Find a quiet place and let the microphone hear your breath. Breathe
              with the slow ring — long, calm, even breaths. As the field learns
              your calm over a minute or two, faint rings and a soft spiral fade
              up from the light. Best with headphones, screen brightness low. No
              mic? It breathes a seeded synthetic breath so you can still watch.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Sound + light begin on tap
            </p>
          </div>
        </div>
      )}

      {/* Mic-fallback notice */}
      {started && micNotice && (
        <div className="pointer-events-none absolute bottom-4 left-0 z-10 w-full px-5 sm:px-7">
          <p className="max-w-md text-base text-destructive">{micNotice}</p>
        </div>
      )}

      {/* Corner controls */}
      <div className="absolute right-4 top-4 z-30 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
        {started &&
          (pulseOn ? (
            <button
              type="button"
              onClick={killPulse}
              className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Stop photic pulse
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowPulseWarn(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Photic pulse (opt-in)
            </button>
          ))}
      </div>

      {/* Photic-pulse photosensitivity warning (step two) */}
      {showPulseWarn && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Photosensitivity warning
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The optional photic pulse adds a slow luminance drift to the field
              — a gentle Dreamachine-style flicker that can deepen closed- and
              open-eye imagery. It is hard-capped below 3 flashes per second and
              is a soft brightness drift, never a high-contrast strobe. Even so,
              if you have photosensitive epilepsy or any history of
              seizures, do not enable it. You can stop it instantly at any time.
            </p>
            {reduced && (
              <p className="mt-3 text-sm leading-relaxed text-destructive">
                Your system requests reduced motion, so the pulse is forced to a
                sub-perceptual drift.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={armPulse}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                I understand — enable
              </button>
              <button
                type="button"
                onClick={() => setShowPulseWarn(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Design notes */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-12 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              A drug-free meditation instrument. A{" "}
              <span className="text-foreground">Ganzfeld</span> is an
              unstructured, edge-free visual field; when the eye has nothing to
              fix on, internally generated imagery starts to surface, and the
              field&apos;s perceived brightness tracks the viewer&apos;s
              relaxed, alpha-rich state. Here the field is a soft radial
              luminance wash with an imperceptibly slow hue drift — a surface
              your own brain fills in.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your breath is the only instrument. The microphone is read as a{" "}
              <span className="text-foreground">slow amplitude envelope</span>{" "}
              (~5.5 breaths/min) by a self-scaling follower — fast attack, slow
              release, never pitch or an FFT tone. That one scalar expands and
              warms a center-out clear-light bloom on the inhale, swells a
              just-intonation drone through a long convolution-void tail, and
              lifts a low Shepard–Risset shimmer for boundlessness. Breathe with
              the 5.5-bpm pacer ring: inhale as it grows, exhale as it shrinks.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              As calm, steady breathing accumulates over a minute or two, faint{" "}
              <span className="text-foreground">form-constants</span> — the
              concentric rings and soft logarithmic spiral of Klüver&apos;s
              catalogue, the shapes a uniform or flickering field amplifies —
              fade up near-subliminally, brighter the calmer you are. Fast,
              agitated breath scatters them back into noise.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Lineage: Brion Gysin&apos;s{" "}
              <span className="italic">Dreamachine</span> (1959, flicker →
              closed-eye form-constants) and Collective Act&apos;s{" "}
              <span className="italic">Dreamachine</span> (2022); the Ganzflicker
              alpha-brightening literature (a dual-alpha response of entrainment
              plus eye-closure rebound); and{" "}
              <span className="italic">&ldquo;From dots to faces&rdquo;</span>{" "}
              (Neuroscience of Consciousness 2026(1) niag016), which finds
              imagery capacity predicts flicker-hallucination content. This is
              phenomenology, not medicine — no claims are made.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Safety: the field is a slow luminance drift by default. Any photic
              pulse is opt-in behind an explicit warning, hard-capped below 3
              flashes/sec through the shared SafeFlicker engine, never a
              high-contrast strobe, has an instant kill, and is forced
              sub-perceptual under prefers-reduced-motion.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
