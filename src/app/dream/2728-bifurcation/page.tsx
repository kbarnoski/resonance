"use client";

// ════════════════════════════════════════════════════════════════════════════
// BIFURCATION (2728)
//
// THE ONE QUESTION: "What if a piece of music WERE the route to chaos — you
// sweep one control knob and hear a single held tone period-double into an
// ostinato, into polyrhythm, into noise, and back out through the periodic
// windows — and the bifurcation diagram is the score?"
//
// The logistic map x_{n+1} = r·x_n·(1−x_n) (May, 1976) is iterated live and
// sonified one-iterate-per-step; r creeps 2.8 → 4.0 → 2.8 over ~11 minutes on
// autopilot, so the piece travels the whole period-doubling road to chaos and
// back with zero interaction. The classic bifurcation diagram draws itself as
// the score. Pointer scrubs r directly; play/pause holds the autopilot.
// See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { R_MIN, R_MAX, computeAttractor } from "./logistic";
import { LogisticSynth } from "./audio";
import { BifurcationRenderer } from "./viz";

type Phase = "idle" | "running" | "paused";

const UP_DUR = 330; // seconds for one r-ascent (~5.5 min); descent mirrors it

/** triangle-wave sweep of r over time: 2.8 → 4.0 → 2.8, period 2·UP_DUR */
function rFromT(t: number): number {
  const span = R_MAX - R_MIN;
  const cycle = ((t % (2 * UP_DUR)) + 2 * UP_DUR) % (2 * UP_DUR);
  const frac = cycle < UP_DUR ? cycle / UP_DUR : 1 - (cycle - UP_DUR) / UP_DUR;
  return R_MIN + frac * span;
}

/** solve for a sweep-time on the ascending branch that yields this r */
function tForR(r: number): number {
  const frac = (r - R_MIN) / (R_MAX - R_MIN);
  return frac * UP_DUR;
}

function periodLabel(period: number): string {
  if (period === 0) return "chaos";
  if (period === 1) return "fixed point";
  return `period-${period}`;
}

export default function BifurcationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ r: R_MIN, hz: 110, label: "fixed point" });

  const synthRef = useRef<LogisticSynth | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rendererRef = useRef<BifurcationRenderer | null>(null);
  const rafRef = useRef<number>(0);

  const rRef = useRef<number>(R_MIN); // shared: current r (read by the synth)
  const sweepRef = useRef<number>(0); // autopilot phase-time (s)
  const playingRef = useRef<boolean>(false);
  const manualRef = useRef<{ active: boolean; r: number }>({ active: false, r: R_MIN });
  const lastTsRef = useRef<number>(0);
  const readoutTRef = useRef<number>(0);
  const pulseRef = useRef<number>(0);
  const attractorCacheRef = useRef<{ points: number[]; period: number } | null>(null);

  const runFrame = useCallback((ts: number) => {
    const renderer = rendererRef.current;
    const synth = synthRef.current;
    if (!renderer || !synth) return;

    const last = lastTsRef.current || ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    lastTsRef.current = ts;

    // advance the autopilot unless the user is scrubbing
    if (playingRef.current && !manualRef.current.active) {
      sweepRef.current += dt;
    }
    const r = manualRef.current.active ? manualRef.current.r : rFromT(sweepRef.current);
    rRef.current = r;

    const snap = synth.snapshot();

    // pulse envelope so the sounding points breathe at the step rate
    pulseRef.current = 0.5 + 0.5 * Math.sin(ts * 0.006);

    // recompute the current attractor at a throttled rate (it is the pricey bit)
    readoutTRef.current += dt;
    let attractor = attractorCacheRef.current;
    if (readoutTRef.current > 0.12 || !attractor) {
      readoutTRef.current = 0;
      attractor = computeAttractor(r);
      attractorCacheRef.current = attractor;
      setReadout({ r, hz: Math.round(snap.freq), label: periodLabel(attractor.period) });
    }

    renderer.render(r, attractor.points, snap.x, snap.history, pulseRef.current);

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const handleBegin = useCallback(async () => {
    setAudioError(null);

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Tap Begin again.");
      return;
    }
    ctxRef.current = ctx;

    const canvas = canvasRef.current;
    if (canvas) {
      try {
        rendererRef.current = new BifurcationRenderer(canvas);
      } catch {
        setAudioError("Canvas is unavailable in this browser.");
        return;
      }
    }

    sweepRef.current = 0;
    rRef.current = R_MIN;
    manualRef.current = { active: false, r: R_MIN };
    playingRef.current = true;

    const synth = new LogisticSynth(ctx, () => rRef.current);
    synthRef.current = synth;
    synth.start();

    setPhase("running");
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePause = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    synthRef.current?.pause();
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    if (playingRef.current || phase !== "paused") return;
    playingRef.current = true;
    synthRef.current?.resume();
    setPhase("running");
  }, [phase]);

  // pointer scrub: set r directly while dragging, then hand back to autopilot
  const rFromEvent = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return R_MIN;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return R_MIN + nx * (R_MAX - R_MIN);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!playingRef.current) return;
      manualRef.current.active = true;
      manualRef.current.r = rFromEvent(e.clientX);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [rFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!manualRef.current.active) return;
      manualRef.current.r = rFromEvent(e.clientX);
    },
    [rFromEvent],
  );

  const onPointerUp = useCallback(() => {
    if (!manualRef.current.active) return;
    // resume the autopilot from the scrubbed r on the ascending branch
    sweepRef.current = tForR(manualRef.current.r);
    manualRef.current.active = false;
  }, []);

  // resize handling
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      synthRef.current?.dispose();
      synthRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-[#07050d] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2728 · route to chaos
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl">
          Bifurcation
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
          One knob — the logistic map&rsquo;s r — creeps from order into chaos and
          back. A held tone period-doubles into an ostinato, into noise, then
          clean windows surface out of the static. The bifurcation diagram is the
          score.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-background/70 px-8 py-7 text-center backdrop-blur-md">
            <p className="text-base text-foreground">
              A self-playing piece. On Begin, r sweeps 2.8 → 4.0 over about five
              minutes and back — you will hear one pitch split into two, into
              four, dissolve into a chaotic wash, and re-emerge as a triplet in
              the period-3 window. Pitches are microtonal by design: chaos is not
              in any key.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="text-sm text-muted-foreground">
              Sound + motion start on this tap. Then drag left↔right to scrub r.
            </p>
            {audioError && (
              <p className="max-w-sm text-sm text-destructive">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* running / paused controls */}
      {phase !== "idle" && (
        <div className="absolute bottom-10 left-1/2 z-10 w-[min(94vw,640px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-5 py-4 backdrop-blur-md">
            <div className="min-w-[220px] flex-1">
              <div className="text-base font-medium text-foreground">
                {phase === "paused" ? "Paused" : "Sweeping the road to chaos"}
              </div>
              <div className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                r {readout.r.toFixed(4)} · {readout.label} · {readout.hz} Hz
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase === "running" ? (
                <button
                  onClick={handlePause}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Resume
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            drag left↔right to scrub r · release to hand back to the autopilot
          </p>
        </div>
      )}

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              The period-doubling cascade as musical form
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                Robert May&rsquo;s logistic map,{" "}
                <span className="text-foreground">x&#8320;&#8331;&#8321; = r·x&#8345;·(1−x&#8345;)</span>,
                is iterated live. Each iterate is one step of music, so the
                attractor is heard directly: a fixed point is a held tone, a
                2-cycle is two alternating pitches, and every doubling makes the
                loop longer — until, past r ≈ 3.57, the orbit never repeats and
                the texture approaches noise.
              </p>
              <p>
                Above the chaos threshold, clean periodic windows interrupt the
                bands — most famously the period-3 window near r ≈ 3.83, a sudden
                triplet out of the static. On autopilot r drifts up over ~5.5
                minutes and back, so minute five is a genuinely different piece
                from second zero.
              </p>
              <p>
                Pitch is a continuous map of x across ~2.8 octaves — never snapped
                to a scale. That is the point: chaos should sound like chaos, in
                no key. The doubling rate follows the Feigenbaum constant δ ≈
                4.669.
              </p>
              <p className="text-sm">
                Reference: Robert May, &ldquo;Simple mathematical models with very
                complicated dynamics,&rdquo; Nature 261 (1976). The lab&rsquo;s
                first period-doubling cascade rendered as musical form.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
