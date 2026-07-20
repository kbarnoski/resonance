"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDiffusionField, type DiffusionField } from "./diffusion";
import { startSpectralEngine, type SpectralEngine } from "./audio";

type Phase = "idle" | "starting" | "running" | "error";

export default function SlowRadiancePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<DiffusionField | null>(null);
  const engineRef = useRef<SpectralEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

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
    fieldRef.current?.dispose();
    fieldRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // Let the fade-outs ring before closing the context.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 900);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);
    setDegradeMsg(null);

    // ── Audio is the driver: it must start (autoplay unlock via this click) ──
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
    engineRef.current = startSpectralEngine(ctx);

    // ── Visual field: WebGL2 → CPU → text notice (audio keeps playing) ───────
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const field = createDiffusionField(canvas);
        fieldRef.current = field;
        if (field.backend === "cpu") {
          setDegradeMsg("WebGL2 unavailable — running the diffusion solve on the CPU.");
        }
      } catch {
        fieldRef.current = null;
        setDegradeMsg("No canvas rendering available — the nebula is dark, but the sound plays on.");
      }
    }

    startRef.current = performance.now();
    lastRef.current = startRef.current;
    const drive = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      const tSec = (now - startRef.current) / 1000;

      engineRef.current?.step(dt, tSec);
      const field = fieldRef.current;
      if (field && engineRef.current) {
        field.setSources(engineRef.current.getVoices());
        field.render(tSec);
      }
      setElapsed(Math.floor(tSec));
      rafRef.current = requestAnimationFrame(drive);
    };
    rafRef.current = requestAnimationFrame(drive);
    setPhase("running");
  }, [phase]);

  // Keep the field sized to the window.
  useEffect(() => {
    const onResize = () => fieldRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      {/* The nebula — a real diffusion-curve field — renders here, behind UI. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/70 p-8 backdrop-blur-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · 2052
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Slow Radiance
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A drug-free hypnagogic chamber that journeys itself. Take nothing,
              do nothing: an autonomous harmonic engine drifts a cluster of
              spectral voices across a non-octave lattice for six minutes and
              more, and a luminous field re-voices to follow it. You see the
              slowly-evolving chord you hear.
            </p>
            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "starting" ? "Beginning…" : "Begin"}
            </button>
            {errorMsg && (
              <p className="mt-4 text-sm text-destructive">{errorMsg}</p>
            )}
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Headphones and a dim room are ideal. Let it play — it never repeats,
              and it is meant to be given several minutes.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 z-10 select-none">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Slow Radiance · {mm}:{ss}
          </p>
          {degradeMsg && (
            <p className="mt-2 max-w-xs text-sm text-destructive">{degradeMsg}</p>
          )}
        </div>
      )}

      {/* ── Design-notes ghost button + modal ──────────────────────────────── */}
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
                <span className="text-foreground">The question:</span> can a screen
                and a sound, with no interaction at all, carry you into a
                boundless meditative state — the way a substance might — purely by
                evolving themselves over time?
              </p>
              <p>
                <span className="text-foreground">Audio leads, visual follows.</span>{" "}
                Unlike a visualiser, here a generative harmonic engine is the
                driver. It evolves a drifting cluster of sustained spectral voices;
                each currently-sounding voice is handed to the light field as a
                coloured source, positioned by its pitch class and register. As the
                harmony migrates, the nebula re-voices with it — you are watching
                the exact chord you hear.
              </p>
              <p>
                <span className="text-foreground">A real diffusion-curve solve.</span>{" "}
                The field is not a blur. It is a Poisson / Laplace relaxation on a
                ~200×200 WebGL2 texture: each frame the voices are re-imposed as
                fixed Dirichlet colour cells, then ~24 ping-pong Jacobi passes let
                every free cell settle toward the average of its four neighbours.
                The steady state is the harmonic interpolation between the coloured
                sources. Without WebGL2 it falls back to the same rule on a 100×100
                CPU grid.
              </p>
              <p>
                <span className="text-foreground">A non-lattice harmony.</span> Pitch
                uses the Bohlen–Pierce scale — the tritave (3:1) split into 13 equal
                steps, so a note is base·3^(k/13). It is genuinely non-octave;
                consonance clusters near the 3:5:7 chord (steps 0, 6, 10). The
                engine slowly transposes the root and swaps between consonant and
                clustered voicings, so consonance melts and re-forms over minutes.
                Voices glide (portamento) and fade in and out, so the texture is
                never static and minute six differs from minute one.
              </p>
              <p>
                <span className="text-foreground">Reference.</span> Diffusion Curves —
                Orzan, Bousseau, Winnemöller, Barla, Thollot, Salesin (SIGGRAPH
                2008); recent thread arXiv:2408.09211.
              </p>
              <p>
                <span className="text-foreground">Honest caveat.</span> Built and
                type-checked, but not verified on real speakers or a display in this
                environment — the felt experience is unconfirmed.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
