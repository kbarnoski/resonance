"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAuraRenderer, type AuraRenderer, type WaveState } from "./webgl";
import { startAuraEngine, type AuraEngine } from "./audio";

type Phase = "idle" | "starting" | "running" | "done" | "error";

const DURATION = 330; // seconds — a ~5.5 min autonomous journey
const SCINT_RATE = 2.6; // Hz — photosensitivity safety gate: kept <= 3 Hz

// Wavefront radius over the journey. CSD travels at a roughly constant speed;
// we ease out very slightly so the arc lingers at the periphery before healing.
function stepRadius(progress: number): number {
  const e = 1 - Math.pow(1 - progress, 1.25);
  return 0.05 + e * 1.62;
}

export default function AuraFortressPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<AuraRenderer | null>(null);
  const engineRef = useRef<AuraEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [degradeMsg, setDegradeMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 1000);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => ctx.close().catch(() => {}), 1000);
    }
    setPhase("idle");
    setElapsed(0);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    // Dispose anything left over from a prior run (e.g. "Again").
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      const old = ctxRef.current;
      window.setTimeout(() => old.close().catch(() => {}), 1000);
    }
    ctxRef.current = null;
    setPhase("starting");
    setErrorMsg(null);
    setDegradeMsg(null);

    // Audio unlock happens on this user gesture.
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;
    engineRef.current = startAuraEngine(ctx);

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        rendererRef.current = createAuraRenderer(canvas);
      } catch {
        rendererRef.current = null;
        setDegradeMsg(
          "WebGL2 is unavailable here — the sound plays on, but the aura cannot be drawn on this device.",
        );
      }
    }

    startRef.current = performance.now();
    const drive = () => {
      const now = performance.now();
      const tSec = (now - startRef.current) / 1000;
      const progress = Math.min(1, tSec / DURATION);
      const state: WaveState = {
        time: tSec,
        radius: stepRadius(progress),
        progress,
        scintRate: SCINT_RATE,
      };
      // One wave state drives BOTH layers -> audio and visual stay coupled.
      engineRef.current?.step(state);
      rendererRef.current?.render(state);
      setElapsed(Math.floor(tSec));

      if (progress >= 1) {
        engineRef.current?.stop();
        engineRef.current = null;
        setPhase("done");
        return;
      }
      rafRef.current = requestAnimationFrame(drive);
    };
    rafRef.current = requestAnimationFrame(drive);
    setPhase("running");
  }, [phase]);

  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const active = phase === "running";

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ── Idle / start panel ── */}
      {(phase === "idle" || phase === "starting" || phase === "error") && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · 2058
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Aura Fortress
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A drug-free altered-perception journey that induces the
              phenomenology of a migraine visual aura — the shimmering,
              zigzagging &ldquo;fortification spectrum&rdquo; of a scintillating
              scotoma. A slow reaction front sweeps a C-shaped arc of
              scintillating light across the whole visual field over about five
              minutes, trailing a temporary blind region behind it. Nothing to
              do: it plays itself, and the sound is the same wave you see.
            </p>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "starting" ? "Beginning…" : "Begin"}
            </button>
            {errorMsg && <p className="mt-4 text-sm text-destructive">{errorMsg}</p>}
            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Photosensitivity note: the shimmer is intentionally slow and
              smooth — luminance drifts sinusoidally at ≤ 3 Hz, with no hard
              black/white strobing. Even so, if you are photosensitive or prone
              to migraine, sit back and stop at any time. Headphones and a dim
              room are ideal.
            </p>
          </div>
        </div>
      )}

      {/* ── Completion panel ── */}
      {phase === "done" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="max-w-md rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              The aura has passed
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The fortification arc has swept the field and healed, the way a
              real aura resolves in fifteen to twenty minutes. Vision returns.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Again
            </button>
          </div>
        </div>
      )}

      {/* ── Running HUD + Stop ── */}
      {active && (
        <>
          <div className="pointer-events-none absolute left-6 top-6 z-10 select-none">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Aura Fortress · {mm}:{ss}
            </p>
            {degradeMsg && (
              <p className="mt-2 max-w-xs text-sm text-destructive">{degradeMsg}</p>
            )}
          </div>
          <button
            type="button"
            onClick={stop}
            className="absolute bottom-6 left-1/2 z-10 inline-flex min-h-[44px] -translate-x-1/2 items-center justify-center rounded-md border border-border bg-background/70 px-6 text-sm font-medium text-foreground backdrop-blur-md transition-colors hover:bg-accent"
          >
            Stop
          </button>
        </>
      )}

      {/* ── Design-notes ghost link + modal ── */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-10 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/50 px-6 py-16 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
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
                type="button"
                onClick={() => setShowNotes(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> Can
                Resonance induce the phenomenology of a{" "}
                <span className="text-foreground">scintillating scotoma</span> —
                the shimmering geometric &ldquo;fortification spectrum&rdquo; of
                a migraine visual aura — as an autonomous five-minute journey,
                with no drug and no input at all?
              </p>
              <p>
                <span className="text-foreground">The phenomenon.</span> A
                migraine aura begins as a small shimmering C near fixation and
                expands, over fifteen to twenty minutes, into an arc of
                zigzagging &ldquo;fortification&rdquo; light that scintillates at
                its leading edge and drags a temporary blind region — the
                scotoma — behind it. Here it is compressed to about five and a
                half minutes.
              </p>
              <p>
                <span className="text-foreground">The model.</span> The arc is a
                traveling reaction front standing in for{" "}
                <span className="text-foreground">
                  cortical spreading depression
                </span>{" "}
                (CSD): a slow wave of depolarization that crosses visual cortex
                at ~3 mm/min. A wavefront radius advances with time; at the front
                sits a bright scintillating band of herringbone chevrons; just
                behind it a desaturated blind band, which then recovers. It is
                generated directly in retinal (screen) space — no log-polar or
                exp() warp.
              </p>
              <p>
                <span className="text-foreground">Audio mapping.</span> One wave
                state drives both layers. The scintillating edge is a band of
                drifting, detuned inharmonic partials, tremolo&rsquo;d by the
                same ≤ 3 Hz scintillation oscillator you see; its brightness
                tracks the front&rsquo;s position and speed. The scotoma is a pair
                of notch filters that migrate through a soft drone, so the blind
                region is audible as a traveling hole in the sound. Harmony is
                non-just, non-scalar — irrational partial ratios that slowly
                detune.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> Flicker is the
                one hard constraint: luminance drifts sinusoidally at 2.6 Hz,
                floored so it never reaches black, with no hard on/off strobe
                anywhere. Output gain is conservative (~0.14) through a tanh
                soft-clip limiter.
              </p>
              <p>
                <span className="text-foreground">References.</span> Karl Lashley
                (1941) self-mapped the spread of his own aura; Aristides Leão
                (1944) discovered cortical spreading depression; and McLeod et
                al. (2025, <span className="italic">Headache</span>) reported the
                first direct intracranial recording of CSD in a human
                migraine-with-aura patient — the live-research anchor for this
                piece.
              </p>
              <p>
                <span className="text-foreground">Honest caveat.</span> Built and
                type-checked, but not verified on real speakers or a display in
                this environment — the felt experience is unconfirmed.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
