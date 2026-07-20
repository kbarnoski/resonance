"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Dla } from "./dla";
import { FrostAudio } from "./audio";

/**
 * 2028 · Frost Lattice
 *
 * Grow frost. Nucleate a seed and watch a dendritic crystal branch outward by
 * diffusion-limited aggregation — every particle that freezes onto the lattice
 * rings a glassy inharmonic tone, so the fern is literally its own evolving
 * score. Output is a SINGLE accumulating <path> (one node, however large the
 * crystal grows) plus a handful of live walker dots.
 */

const VIEW = 1000;
const CENTER = VIEW / 2;
const SCALE = 2.2; // lattice units -> SVG px
const MICRO_STEPS = 12; // random-walk ticks per frame

// Art-only ice palette (raw colour strings are allowed INSIDE the SVG).
const ICE_GLOW = "#7fc8ff";
const WALKER_FILL = "#eaf7ff";

function svgX(lx: number): number {
  return CENTER + lx * SCALE;
}
function svgY(ly: number): number {
  return CENTER + ly * SCALE;
}

export default function FrostLatticePage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [count, setCount] = useState(0);

  const rafRef = useRef<number | null>(null);
  const engineRef = useRef<Dla | null>(null);
  const audioRef = useRef<FrostAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dRef = useRef<string>("");
  const walkerRefs = useRef<Array<SVGCircleElement | null>>([]);
  const frameNoRef = useRef(0);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioRef.current?.dispose();
    audioRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    engineRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const runFrame = useCallback(() => {
    const engine = engineRef.current;
    const path = pathRef.current;
    if (!engine || !path) return;

    const frozen = engine.step(MICRO_STEPS);
    if (frozen.length > 0) {
      let appended = "";
      let ringR = -1;
      for (const f of frozen) {
        // Seeds (parent === self) draw as a dot; branches as a segment.
        appended += `M${svgX(f.px).toFixed(1)} ${svgY(f.py).toFixed(1)}L${svgX(
          f.x,
        ).toFixed(1)} ${svgY(f.y).toFixed(1)}`;
        if (f.radius > ringR) ringR = f.radius;
      }
      dRef.current += appended;
      path.setAttribute("d", dRef.current);
      // One shimmer per frame (the outermost freeze) — audio throttles the rest.
      if (ringR >= 0) {
        audioRef.current?.strike(ringR / engine.boundR);
      }
    }

    // Move the live walker dots imperatively (no React re-render).
    const wp = engine.walkerPoints;
    const dots = walkerRefs.current;
    for (let i = 0; i < dots.length; i++) {
      const c = dots[i];
      if (!c) continue;
      if (i < wp.length && !engine.done) {
        c.setAttribute("cx", svgX(wp[i].x).toFixed(1));
        c.setAttribute("cy", svgY(wp[i].y).toFixed(1));
        c.setAttribute("opacity", "0.7");
      } else {
        c.setAttribute("opacity", "0");
      }
    }

    frameNoRef.current += 1;
    if (frameNoRef.current % 15 === 0) setCount(engine.frozenCount);

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const growFrom = useCallback(
    (resetCrystal: boolean) => {
      const engine = new Dla({ boundR: 205, cap: 3000, walkers: 18 });
      engineRef.current = engine;
      if (resetCrystal) {
        dRef.current = "";
        if (pathRef.current) pathRef.current.setAttribute("d", "");
      }
      // Deterministic auto-nucleation at centre — grows with zero input.
      engine.addSeed(0, 0);
      setCount(0);
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(runFrame);
      }
    },
    [runFrame],
  );

  const begin = useCallback(async () => {
    if (started) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    try {
      await ctx.resume();
    } catch {
      /* resume best-effort */
    }
    const audio = new FrostAudio(ctx);
    audio.start();
    audioRef.current = audio;
    setStarted(true);
    growFrom(true);
  }, [started, growFrom]);

  const beginAgain = useCallback(() => {
    growFrom(true);
  }, [growFrom]);

  // Click / tap drops a competing nucleation seed wherever you point.
  const runSeedFromPointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const engine = engineRef.current;
      const svg = svgRef.current;
      if (!engine || !svg) return;
      const rect = svg.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / rect.width) * VIEW - CENTER;
      const ly = ((e.clientY - rect.top) / rect.height) * VIEW - CENTER;
      engine.addSeed(lx / SCALE, ly / SCALE);
      ctxRef.current?.resume().catch(() => {});
    },
    [],
  );

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0e14] text-foreground">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={started ? runSeedFromPointer : undefined}
        aria-label="Growing frost crystal"
      >
        <defs>
          <radialGradient id="frost-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="#0e1622" />
            <stop offset="100%" stopColor="#080b11" />
          </radialGradient>
          <filter id="frost-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={VIEW} height={VIEW} fill="url(#frost-vignette)" />

        {/* Soft under-glow: the same crystal path, blurred. */}
        <path
          ref={pathRef}
          d=""
          fill="none"
          stroke={ICE_GLOW}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
          filter="url(#frost-glow)"
        />

        {/* Live random walkers (bounded to <= 24). */}
        {Array.from({ length: 18 }).map((_, i) => (
          <circle
            key={i}
            ref={(el) => {
              walkerRefs.current[i] = el;
            }}
            r={1.8}
            cx={CENTER}
            cy={CENTER}
            fill={WALKER_FILL}
            opacity={0}
          />
        ))}
      </svg>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Frost Lattice
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Grow frost. A dendritic crystal branches outward by diffusion-limited
          aggregation — every particle that freezes rings a glassy tone, so the
          fern is its own evolving score.
        </p>
        {started && (
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {count} frozen{count === 0 ? " · nucleating" : ""} · tap to seed
          </p>
        )}
      </div>

      {/* Controls */}
      {started && (
        <div className="absolute bottom-5 left-5 z-20 flex gap-2">
          <button
            type="button"
            onClick={beginAgain}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Begin again
          </button>
        </div>
      )}

      {/* Begin gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex max-w-lg flex-col items-center px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Grow a crystal of frost
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              A calm growth-and-stillness piece. A random-walk aggregate freezes
              into a fractal fern; each frozen particle rings a short crystalline
              bell over a low ice-drone. Tap the field to drop your own seeds and
              watch competing dendrites race.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-7 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-3 text-sm text-muted-foreground">
              Audio starts on tap. The crystal grows on its own with no input.
            </p>
          </div>
        </div>
      )}

      {/* Design-notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                The question
              </span>
              <br />
              What if you could grow frost — nucleate a seed and watch a
              dendritic crystal branch outward, where every particle that freezes
              rings a crystalline tone, so the fern is literally its own score?
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              The crystal grows by <strong>diffusion-limited aggregation</strong>{" "}
              (Witten &amp; Sander, 1981). Random walkers launch from a circle
              just outside the current frost, wander with a light inward bias,
              and freeze the instant they touch the aggregate. Each frozen
              particle stores its parent, so its branch segment is appended to a
              single growing SVG <code>&lt;path&gt;</code> — one DOM node no
              matter how large the fern gets. A cell-keyed occupancy map gives
              O(1) neighbour lookups. Growth is deterministic (PRNG seeded from
              0x2028), so it looks identical on every load and needs no input.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Each freeze rings an additive bell built from{" "}
              <strong>glass-plate inharmonic partials</strong> (1, 2.76, 5.40,
              8.93 — Chladni-style, not integer harmonics, not just intonation,
              not any 12-TET or pentatonic scale). The fundamental is set
              continuously by the particle&apos;s radius from the seed, so
              outward growth is an ascending shimmer over a low ice-drone. A
              voice pool and minimum onset spacing make dense growth wash rather
              than machine-gun.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Tap anywhere to drop competing nucleation seeds. Rough edges: the
              on-lattice walk gives a slightly crystalline (grid-biased) look;
              growth halts at a fixed particle cap — press &ldquo;Begin
              again&rdquo; to reseed.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="font-mono text-xs uppercase tracking-[0.18em]">
                References
              </span>
              <br />
              T. A. Witten &amp; L. M. Sander, &ldquo;Diffusion-Limited
              Aggregation&rdquo; (1981) · Chladni figures / glass-plate
              inharmonic partials · Wilson Bentley, snowflake morphology.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
