"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EPOCH_MS,
  LAYER_PERIODS_S,
  computeState,
  type DeepTimeState,
} from "./engine";
import { LongNowAudio } from "./audio";

type Status = "idle" | "live" | "noaudio";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/** Time-telescope jumps, in milliseconds. */
const JUMPS: { label: string; delta: number }[] = [
  { label: "−100 yr", delta: -100 * YEAR },
  { label: "−1 yr", delta: -YEAR },
  { label: "−1 day", delta: -DAY },
  { label: "−1 hr", delta: -HOUR },
  { label: "+1 hr", delta: HOUR },
  { label: "+1 day", delta: DAY },
  { label: "+1 yr", delta: YEAR },
  { label: "+100 yr", delta: 100 * YEAR },
];

/** Concentric dial radii, innermost (fastest layer) → outermost (a year). */
const RADII = [44, 68, 94, 122, 152, 184];
const CX = 210;
const CY = 210;

/** Violet ramp (hsl hue ~270–280) for the art layer only. */
function ringColor(i: number): string {
  const l = 40 + i * 6;
  return `hsl(276 55% ${l}%)`;
}

const NOTES: { h: string; p: string }[] = [
  {
    h: "The one question",
    p: "What if a piece of music were on a 1000-year clock — so slow it never repeats in a human lifetime — and everyone who opens it right now, anywhere, drops into the same instant of it?",
  },
  {
    h: "How it works",
    p: "Everything you hear and see is a pure function of one number: the wall-clock milliseconds since a fixed epoch (2000-01-01). Six independent layers cycle at distinct prime periods — 3 min, 25 min, 2.7 hr, 1 day, 1 week, 1 year. Because the periods share no common factor, their combined pattern does not return to its starting configuration for ~10^30 seconds. No randomness, no storage: the same instant renders identically on every machine on Earth.",
  },
  {
    h: "The time telescope",
    p: "The jump buttons scrub forward and back through deep time so you can preview how the piece will sound in a century, or sounded a year ago. It is only a preview — press Return to the now to snap back to the shared present.",
  },
  {
    h: "Lineage",
    p: "A browser homage to Jem Finer's Longplayer (1999–2999), a 1000-year composition built from loops of mutually-prime lengths; to John Cage's ORGAN²/ASLSP, playing in Halberstadt until 2640; and to Brian Eno's generative ambient — a music that makes itself and is never the same twice.",
  },
];

export default function LongNowPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [offset, setOffset] = useState(0);
  const [readout, setReadout] = useState("Year · day · 00:00");
  const [notesOpen, setNotesOpen] = useState(false);

  const audioRef = useRef<LongNowAudio | null>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastUiRef = useRef(0);
  const markerRefs = useRef<(SVGGElement | null)[]>([]);
  const glowRef = useRef<SVGCircleElement | null>(null);

  offsetRef.current = offset;

  const currentState = useCallback((): DeepTimeState => {
    const elapsed = Date.now() - EPOCH_MS + offsetRef.current;
    return computeState(elapsed);
  }, []);

  // Visual clock runs from mount, driven by the real wall clock — so a headless
  // reviewer with no audio still sees deep time moving within a second.
  useEffect(() => {
    const step = () => {
      const state = currentState();

      for (let i = 0; i < state.layers.length; i++) {
        const g = markerRefs.current[i];
        if (g) {
          const angle = state.layers[i].phase01 * 360;
          g.setAttribute("transform", `rotate(${angle} ${CX} ${CY})`);
        }
      }
      if (glowRef.current) {
        glowRef.current.setAttribute(
          "opacity",
          (0.08 + state.brightness * 0.16).toFixed(3),
        );
      }

      audioRef.current?.update(state);

      const now = performance.now();
      if (now - lastUiRef.current > 250) {
        lastUiRef.current = now;
        setReadout(state.calendar.readout);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentState]);

  useEffect(() => {
    return () => {
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    if (audioRef.current) return;
    try {
      const audio = new LongNowAudio();
      audioRef.current = audio;
      void audio.audioContext.resume();
      audio.start(currentState());
      setStatus("live");
    } catch {
      audioRef.current = null;
      setStatus("noaudio");
    }
  }, [currentState]);

  const jump = useCallback((delta: number) => {
    setOffset((o) => o + delta);
  }, []);

  const isPreview = offset !== 0;

  return (
    <main className="relative flex min-h-screen flex-col items-center bg-background px-4 py-10 text-foreground">
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <header className="mb-8 max-w-xl text-center">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          A deep-time composition
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The Long Now
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          A piece of music on a 1000-year clock. It has been playing, unrepeating,
          since the year 2000. Everyone who opens this page right now drops into
          the same instant of it.
        </p>
      </header>

      {/* Deep-time orrery — the phase wheels of the six layers. Not Canvas2D:
          inline SVG, near-still, contemplative. */}
      <svg
        viewBox="0 0 420 420"
        className="w-full max-w-[min(78vw,420px)]"
        role="img"
        aria-label="Deep-time clock: concentric dials showing the phase of each layer"
      >
        <circle
          ref={glowRef}
          cx={CX}
          cy={CY}
          r={196}
          fill="hsl(276 60% 55%)"
          opacity={0.12}
        />
        {RADII.map((r, i) => (
          <g key={i}>
            <circle
              cx={CX}
              cy={CY}
              r={r}
              fill="none"
              stroke={ringColor(i)}
              strokeOpacity={0.28}
              strokeWidth={1}
            />
            <g ref={(el) => { markerRefs.current[i] = el; }}>
              <line
                x1={CX}
                y1={CY}
                x2={CX}
                y2={CY - r}
                stroke={ringColor(i)}
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              <circle
                cx={CX}
                cy={CY - r}
                r={4.5}
                fill={ringColor(i)}
              />
            </g>
          </g>
        ))}
        <circle cx={CX} cy={CY} r={3} fill="hsl(276 60% 70%)" />
      </svg>

      <div className="mt-6 text-center">
        <p
          className={`font-mono text-sm tracking-[0.14em] ${
            isPreview ? "text-primary" : "text-foreground"
          }`}
        >
          {readout}
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {isPreview ? "preview — not the shared now" : "the shared now"}
        </p>
      </div>

      {/* Layer legend. */}
      <ul className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {LAYER_PERIODS_S.map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: ringColor(i) }}
            />
            {["3 min", "25 min", "2.7 hr", "1 day", "1 week", "1 year"][i]}
          </li>
        ))}
      </ul>

      {/* Start / status. */}
      <div className="mt-8 flex flex-col items-center gap-2">
        {status === "idle" && (
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Listen to the now
          </button>
        )}
        {status === "live" && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            listening — the chord is migrating
          </p>
        )}
        {status === "noaudio" && (
          <p className="max-w-sm text-center text-sm text-destructive">
            No audio here — but the deep-time clock keeps turning, driven by the
            real wall clock. You are still in the shared now.
          </p>
        )}
      </div>

      {/* Time telescope. */}
      <section className="mt-9 w-full max-w-md">
        <p className="mb-3 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Time telescope
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {JUMPS.map((j) => (
            <button
              key={j.label}
              type="button"
              onClick={() => jump(j.delta)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {j.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setOffset(0)}
            disabled={!isPreview}
            className={`min-h-[44px] rounded-md px-6 text-sm font-medium transition-colors ${
              isPreview
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border bg-background/60 text-muted-foreground/50"
            }`}
          >
            Return to the now
          </button>
        </div>
      </section>

      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-4 space-y-4">
              {NOTES.map((n) => (
                <div key={n.h}>
                  <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {n.h}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {n.p}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
