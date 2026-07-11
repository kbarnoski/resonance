"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeDecayEngine, type DecayEngine, type DecaySample } from "./decay";
import { NOTES_MD } from "./notes";

type Phase = "idle" | "live";

/** Geometry of the SVG ring readout. */
const RING = { cx: 140, cy: 140, r: 104, stroke: 14 };
const CIRC = 2 * Math.PI * RING.r;

/** If the visitor never touches anything, the piece self-holds to demonstrate
 *  the living → eroding → vanishing arc, then settles. (Headless witness path.) */
const WITNESS_DELAY_MS = 4500;
const WITNESS_HOLD_MS = 9000;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Render the README markdown as austere in-page notes (no extra deps). */
function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("### ")) {
      return (
        <h3 key={i} className="mt-4 text-xl font-medium text-foreground">
          {line.slice(4)}
        </h3>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-violet-300">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base text-muted-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function LastBreathPage() {
  const engineRef = useRef<DecayEngine | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [witnessing, setWitnessing] = useState(false);

  // Live readout, refreshed on rAF.
  const [snap, setSnap] = useState<DecaySample>({
    remaining: 1,
    held: false,
    alive: true,
    partials: [],
    listened: 0,
  });

  // Mutable refs that the animation/witness loops read without re-subscribing.
  const interactedRef = useRef(false);
  const witnessTimerRef = useRef<number | null>(null);
  const witnessStopRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const clearWitnessTimers = useCallback(() => {
    if (witnessTimerRef.current !== null) {
      window.clearTimeout(witnessTimerRef.current);
      witnessTimerRef.current = null;
    }
    if (witnessStopRef.current !== null) {
      window.clearTimeout(witnessStopRef.current);
      witnessStopRef.current = null;
    }
  }, []);

  // A real (human) hold cancels any pending/active witness demonstration.
  const markInteracted = useCallback(() => {
    interactedRef.current = true;
    if (witnessing) {
      setWitnessing(false);
      engineRef.current?.release();
    }
    clearWitnessTimers();
  }, [witnessing, clearWitnessTimers]);

  const holdOn = useCallback(() => {
    markInteracted();
    engineRef.current?.hold();
  }, [markInteracted]);

  const holdOff = useCallback(() => {
    engineRef.current?.release();
  }, []);

  const begin = useCallback(async () => {
    if (engineRef.current) return;
    setError(null);
    const engine = makeDecayEngine();
    engineRef.current = engine;
    try {
      await engine.begin();
    } catch {
      setError("Audio could not start in this browser. Try a tap or a click.");
      engineRef.current = null;
      return;
    }
    setPhase("live");

    // Readout loop.
    const tick = () => {
      const e = engineRef.current;
      if (e) setSnap(e.sample());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Witness path: if no one holds within a few seconds, the piece holds
    // itself to demonstrate the arc, then lets go and settles.
    witnessTimerRef.current = window.setTimeout(() => {
      if (interactedRef.current) return;
      setWitnessing(true);
      engineRef.current?.hold();
      witnessStopRef.current = window.setTimeout(() => {
        engineRef.current?.release();
        setWitnessing(false);
      }, WITNESS_HOLD_MS);
    }, WITNESS_DELAY_MS);
  }, []);

  const reset = useCallback(() => {
    markInteracted();
    engineRef.current?.reset();
  }, [markInteracted]);

  // Keyboard: hold while Space/Enter is down (degrade gracefully w/o pointer).
  useEffect(() => {
    if (phase !== "live") return;
    const down = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "Enter") {
        if (ev.repeat) return;
        ev.preventDefault();
        holdOn();
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "Enter") {
        ev.preventDefault();
        holdOff();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [phase, holdOn, holdOff]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (witnessTimerRef.current !== null)
        window.clearTimeout(witnessTimerRef.current);
      if (witnessStopRef.current !== null)
        window.clearTimeout(witnessStopRef.current);
      void engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const remaining = snap.remaining;
  const gone = phase === "live" && !snap.alive;
  // Ring: the visible arc thins (dasharray gap grows) as material is spent.
  const dashOn = CIRC * Math.max(0, remaining);
  const ringOpacity = 0.25 + 0.55 * remaining;
  const live = snap.held || witnessing;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507] text-foreground">
      {/* Quiet vignette — luminance follows the remaining material. */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(139,92,246,0.10), transparent 60%)",
          opacity: phase === "live" ? 0.3 + 0.7 * remaining : 0.4,
        }}
      />

      <header className="relative z-10 mx-auto max-w-2xl px-6 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
          dream · 1073
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Last Breath
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          A sound that lives only while you hold it — and erodes a little every
          time you listen. It can never be heard the same way twice.
        </p>
      </header>

      <section className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-6 pb-32 pt-8">
        {phase === "idle" ? (
          <button
            type="button"
            onClick={begin}
            className="mt-6 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/20 px-6 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-500/30"
          >
            Begin
          </button>
        ) : (
          <>
            {/* The hold target + eroding-state readout. */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Press and hold to let the sound live"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                holdOn();
              }}
              onPointerUp={holdOff}
              onPointerLeave={holdOff}
              onPointerCancel={holdOff}
              className="relative mt-2 flex h-[280px] w-[280px] cursor-pointer touch-none select-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <svg
                width={280}
                height={280}
                viewBox="0 0 280 280"
                className="absolute inset-0"
              >
                {/* Faint full-circumference ghost — the original whole. */}
                <circle
                  cx={RING.cx}
                  cy={RING.cy}
                  r={RING.r}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={RING.stroke}
                />
                {/* Remaining material arc — thins toward nothing. */}
                <circle
                  cx={RING.cx}
                  cy={RING.cy}
                  r={RING.r}
                  fill="none"
                  stroke="rgb(196,181,253)"
                  strokeWidth={RING.stroke}
                  strokeLinecap="round"
                  strokeDasharray={`${dashOn} ${CIRC}`}
                  transform={`rotate(-90 ${RING.cx} ${RING.cy})`}
                  style={{
                    opacity: ringOpacity,
                    transition: "stroke-dasharray 0.3s linear, opacity 0.6s",
                  }}
                />
                {/* Inner glow that breathes brighter only while alive + held. */}
                <circle
                  cx={RING.cx}
                  cy={RING.cy}
                  r={RING.r - RING.stroke}
                  fill="rgba(139,92,246,0.10)"
                  style={{
                    opacity: live ? 0.35 + 0.5 * remaining : 0.08,
                    transition: "opacity 0.7s",
                  }}
                />
              </svg>

              <div className="relative z-10 flex flex-col items-center">
                <span className="font-mono text-[44px] font-light leading-none text-foreground tabular-nums">
                  {Math.round(remaining * 100)}
                  <span className="text-xl text-muted-foreground">%</span>
                </span>
                <span className="mt-1 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                  material
                </span>
                <span className="mt-3 text-base text-muted-foreground">
                  {gone
                    ? "gone"
                    : witnessing
                      ? "witnessing…"
                      : snap.held
                        ? "living"
                        : "hold to live"}
                </span>
              </div>
            </div>

            {/* Per-partial integrity bars — the brightest crumble first. */}
            <div className="mt-7 flex h-12 items-end gap-1.5">
              {snap.partials.map((p, i) => (
                <div
                  key={i}
                  className="w-3 rounded-sm bg-violet-300"
                  style={{
                    height: `${Math.max(2, p * 100)}%`,
                    opacity: 0.3 + 0.6 * p,
                    transition: "height 0.3s linear, opacity 0.6s",
                  }}
                />
              ))}
            </div>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {snap.partials.length} partials · listened {formatClock(snap.listened)}
            </p>

            {/* Witness banner so a headless glance reads the self-demo. */}
            {witnessing && (
              <p className="mt-4 text-base text-violet-300/95">
                No one was holding it, so it held itself — watch it erode, then
                let go.
              </p>
            )}

            {gone && (
              <p className="mt-4 max-w-md text-center text-base text-muted-foreground">
                The material is spent. This version is over. You can begin again
                — but the sound you made will not return.
              </p>
            )}

            {/* The only way back: a deliberate, destructive reset. */}
            <button
              type="button"
              onClick={reset}
              className="mt-6 min-h-[44px] rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2.5 text-base font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
            >
              Begin again (erase &amp; reset)
            </button>
            <p className="mt-2 max-w-sm text-center text-base text-muted-foreground">
              Resetting restores the full material and destroys the eroded
              version you are listening to. There is no undo.
            </p>
          </>
        )}

        {error && (
          <p className="mt-4 text-base text-violet-300">{error}</p>
        )}
      </section>

      {/* In-page design notes toggle. */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/70 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/85 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-6 py-16">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-6 min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-muted-foreground hover:text-foreground"
            >
              ← Close
            </button>
            <article className="space-y-1">{renderNotes(NOTES_MD)}</article>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1073-last-breath"]} />
    </main>
  );
}
