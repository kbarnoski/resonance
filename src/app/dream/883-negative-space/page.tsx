"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PadEngine } from "./audio";
import { drawScene } from "./render";
import {
  DEFAULT_CONFIG,
  makeStillnessState,
  rmsOfTimeDomain,
  stepStillness,
  type StillnessState,
} from "./listen";

// 883-negative-space — play the instrument by being SILENT.
// Mic is ANALYSIS ONLY: never routed to destination, never recorded, never sent
// anywhere. We read RMS from an AnalyserNode and throw the audio away.

type Source = "demo" | "mic";

// The synthetic auto-demo: a scripted energy envelope that runs through the
// SAME stillness pipeline as the live mic, so the inversion proves itself
// hands-free. Returns a raw energy 0..1 for a given elapsed second `t`.
function syntheticEnergy(t: number): number {
  // Loop ~9s: long silence (bloom) → burst of sound (duck+erode) → silence.
  const c = t % 9;
  if (c < 4) return 0.01; // stillness — let it bloom
  if (c < 5.2) return 0.4 + Math.random() * 0.4; // a burst of "sound"
  if (c < 5.6) return 0.18; // tail
  return 0.012 + Math.random() * 0.01; // silence returns — re-bloom
}

export default function NegativeSpacePage() {
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<Source>("demo");
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Live readouts for the HUD (updated via state at a throttled cadence).
  const [hud, setHud] = useState({ bloom: 0, duck: 0, still: true });

  const engineRef = useRef<PadEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // Mic plumbing (analysis only).
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const micLiveRef = useRef(false);

  // Stillness model + timing.
  const stateRef = useRef<StillnessState>(makeStillnessState());
  const lastTsRef = useRef(0);
  const startTsRef = useRef(0);
  // A manual "make a sound" pulse for no-mic reviewers (seconds remaining).
  const manualPulseRef = useRef(0);
  const sourceRef = useRef<Source>("demo");

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      sizeRef.current = { w, h, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener("resize", resize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── The single rAF loop: energy → stillness → audio + visual ───────────────
  const loop = useCallback((ts: number) => {
    const last = lastTsRef.current || ts;
    let dt = (ts - last) / 1000;
    if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switch)
    lastTsRef.current = ts;
    const elapsed = (ts - startTsRef.current) / 1000;

    // 1) Get a raw energy sample — from live mic if present, else synthetic.
    let rawEnergy: number;
    if (micLiveRef.current && analyserRef.current && timeBufRef.current) {
      analyserRef.current.getFloatTimeDomainData(timeBufRef.current);
      rawEnergy = rmsOfTimeDomain(timeBufRef.current) * 4; // scale to 0..1-ish
    } else {
      rawEnergy = syntheticEnergy(elapsed);
    }

    // Manual "make a sound" pulse (no-mic reviewers) overrides upward.
    if (manualPulseRef.current > 0) {
      manualPulseRef.current = Math.max(0, manualPulseRef.current - dt);
      rawEnergy = Math.max(rawEnergy, 0.6);
    }

    // 2) Advance the stillness model (the inversion lives here).
    const next = stepStillness(stateRef.current, rawEnergy, dt, DEFAULT_CONFIG);
    stateRef.current = next;
    const bloom = next.stillSeconds / DEFAULT_CONFIG.maxStillSeconds;

    // 3) Drive audio.
    const engine = engineRef.current;
    if (engine) {
      engine.update(bloom, next.duck);
      engine.evolve(elapsed);
    }

    // 4) Draw.
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, w, h, { bloom, duck: next.duck, time: elapsed });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Throttled HUD updates (every ~120ms) so React doesn't churn each frame.
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const s = stateRef.current;
      setHud({
        bloom: s.stillSeconds / DEFAULT_CONFIG.maxStillSeconds,
        duck: s.duck,
        still: s.still,
      });
    }, 120);
    return () => clearInterval(id);
  }, [started]);

  // ── Start (gesture-gated): build audio, try mic, run loop ──────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);
    const engine = new PadEngine();
    engineRef.current = engine;
    try {
      await engine.ctx.resume();
    } catch {
      /* ignore */
    }
    engine.start();

    startTsRef.current = performance.now();
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    // Try the mic — analysis only. Failure keeps the synthetic demo running.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 1024;
      const src = engine.ctx.createMediaStreamSource(stream);
      // Connect mic ONLY to the analyser — never to destination.
      src.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      micLiveRef.current = true;
      setSource("mic");
      setMicError(null);
    } catch {
      micLiveRef.current = false;
      setSource("demo");
      setMicError(
        "no mic — showing a demo of stillness vs. sound (try “Make a sound”)",
      );
    }
  }, [started, loop]);

  const handleMakeSound = useCallback(() => {
    manualPulseRef.current = 0.9; // ~0.9s of forced "sound"
  }, []);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      timeBufRef.current = null;
      micLiveRef.current = false;
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* HUD / chrome */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-8">
        <header className="max-w-2xl">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            negative space
          </h1>
          <p className="mt-2 text-base text-foreground">
            Play the instrument by being{" "}
            <span className="text-violet-300">silent</span>. The music blooms in
            the gaps of your sound — the instant you make noise, it ducks to
            nothing. You compose it by what you withhold.
          </p>
          <p className="mt-1 font-mono text-base text-muted-foreground">
            after Cage, <span className="italic">4&#39;33&#34;</span> &middot;
            Oliveros, Deep Listening
          </p>
        </header>

        <footer className="pointer-events-auto flex flex-col gap-4">
          {!started ? (
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-violet-500/20 px-4 py-2.5 font-mono text-base text-violet-300 ring-1 ring-violet-300/40 transition hover:bg-violet-500/30"
              >
                ▶ Begin — then go quiet
              </button>
              <p className="text-base text-muted-foreground">
                Audio + mic start on tap (covers iOS). The mic is analysis only:
                never routed to output, never recorded, never sent anywhere.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Live readout */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
                <span className="text-muted-foreground">
                  source:{" "}
                  <span className="text-violet-300/95">
                    {source === "mic" ? "live mic" : "auto-demo"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  state:{" "}
                  <span
                    className={
                      hud.still ? "text-violet-300" : "text-violet-300/95"
                    }
                  >
                    {hud.still ? "still — blooming" : "sound — eroding"}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  bloom: {(hud.bloom * 100).toFixed(0)}%
                </span>
              </div>

              {/* Bloom meter */}
              <div
                className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-violet-400/80 transition-[width] duration-150"
                  style={{ width: `${Math.min(100, hud.bloom * 100)}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleMakeSound}
                  className="min-h-[44px] rounded-md bg-muted px-4 py-2.5 font-mono text-base text-foreground ring-1 ring-border transition hover:bg-accent"
                >
                  Make a sound
                </button>
                <button
                  onClick={() => setShowNotes(true)}
                  className="min-h-[44px] rounded-md px-4 py-2.5 font-mono text-base text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
                >
                  Read the design notes
                </button>
                <Link
                  href="/dream"
                  className="font-mono text-base text-muted-foreground underline underline-offset-4 hover:text-muted-foreground"
                >
                  ← gallery
                </Link>
              </div>

              {micError ? (
                <p className="max-w-md text-base text-violet-300">{micError}</p>
              ) : null}
            </div>
          )}
        </footer>
      </div>

      {/* Design-notes panel (in-page, no route) */}
      {showNotes ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-5">
          <div className="max-h-[80vh] max-w-xl overflow-y-auto rounded-lg border border-border bg-[#0b0c12] p-6 text-foreground">
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="font-mono text-xl text-foreground">design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-4 py-2.5 font-mono text-base text-violet-300 hover:text-violet-200"
              >
                close ✕
              </button>
            </div>
            <div className="space-y-3 text-base leading-relaxed">
              <p>
                <span className="text-foreground">The inversion.</span> Every mic
                instrument maps loud&nbsp;&rarr;&nbsp;active. This one maps
                silence&nbsp;&rarr;&nbsp;music. Your instrument is restraint; the
                piece lives in negative space.
              </p>
              <p>
                <span className="text-foreground">Mechanism.</span> A short-term
                RMS energy feeds a stillness timer. While you stay below the
                threshold the timer grows and a slow consonant chord-bloom rises
                — root, fifth, octave, third, twelfth, high color — one warm
                voice at a time. The instant you make a sound the master gain
                ducks fast toward an always-on near-silent root (a
                reverse-sidechain feel) and voice-adding pauses; when quiet
                returns it resumes building from where it left off.
              </p>
              <p>
                <span className="text-foreground">Privacy.</span> The mic is
                analysis only. It is connected to an AnalyserNode and nothing
                else — never routed to the speakers, never recorded, never sent
                over any network. There is no API route.
              </p>
              <p>
                <span className="text-foreground">Visual.</span> Canvas2D. Silence
                blooms a luminous field (monochrome&nbsp;&rarr;&nbsp;violet as
                the chord fills); sound floods dark grain inward from the edges
                and the light recedes.
              </p>
              <p>
                <span className="text-foreground">Lineage.</span> John Cage,{" "}
                <span className="italic">4&#39;33&#34;</span> (silence as the
                content of the piece) and Pauline Oliveros, &ldquo;Deep
                Listening.&rdquo; See also{" "}
                <span className="font-mono text-muted-foreground">
                  RESEARCH §529 (2026-06-23)
                </span>{" "}
                — the cross-modal sound&harr;perception thread.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
