"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  applyChanges,
  castChangesOn,
  castHexagram,
  hexagramOf,
  mulberry32,
  trigramPairOf,
  type Hexagram,
  type LineType,
  type Rng,
  type TrigramPair,
} from "./iching";
import { createAudio, type AudioEngine } from "./audio";

// ---- ink-on-rice-paper palette (SVG art layer only) -----------------------
const BONE = "#efe6d3"; // warm rice paper
const BONE_2 = "#e6dabf"; // paper shadow
const CHARCOAL = "#2b2620"; // sumi ink
const CINNABAR = "#b23b1e"; // the one red accent — changing lines

const HOLD_MS = 4200; // sound & hold the present hexagram
const SETTLE_MS = 2000; // rest on the transformed hexagram before recasting

interface Phase {
  lines: LineType[]; // the polarities currently drawn
  changing: boolean[]; // which lines are marked as changing
  present: Hexagram;
  transformed: Hexagram | null; // preview of where the changing lines lead
  pair: TrigramPair;
  moving: boolean; // true while morphing present → transformed
  morphMs: number; // duration of the current morph
}

export default function ChangingLinesPage() {
  const audioRef = useRef<AudioEngine | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const presentRef = useRef<LineType[]>([]);
  const runningRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reducedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  const buildPhase = useCallback(
    (
      lines: LineType[],
      changing: boolean[],
      moving: boolean,
      morphMs: number,
    ): Phase => {
      const transformedLines = applyChanges(lines, changing);
      const anyChanging = changing.some(Boolean);
      return {
        lines,
        changing,
        present: hexagramOf(lines),
        transformed: anyChanging ? hexagramOf(transformedLines) : null,
        pair: trigramPairOf(lines),
        moving,
        morphMs,
      };
    },
    [],
  );

  // One turn of the self-evolving canon.
  const step = useCallback(() => {
    if (!runningRef.current) return;
    const rng = rngRef.current!;
    const audio = audioRef.current;
    const present = presentRef.current;

    // Cast fresh changing lines on the present hexagram.
    const changing = castChangesOn(present, rng);
    const transformed = applyChanges(present, changing);

    // Sound & show the present hexagram, marking its changing lines.
    audio?.setCharacters(present, 0.4);
    audio?.pluckAll(present, 1);
    setPhase(buildPhase(present, changing, false, 900));

    // After the hold, glide the changing lines to the transformed hexagram.
    later(() => {
      if (!runningRef.current) return;
      // 8–20s transition; slower/settled when motion is reduced.
      const base = 8000 + rng() * 12000;
      const T = reducedRef.current ? Math.max(base, 16000) : base;

      changing.forEach((isChanging, i) => {
        if (isChanging) audio?.transitionLine(i, present[i], transformed[i], T / 1000);
      });

      // Show the transformed line-forms — CSS morphs the ink over T ms.
      setPhase(buildPhase(transformed, changing, true, T));

      // The transformed hexagram becomes the new present; recast on it.
      later(() => {
        if (!runningRef.current) return;
        presentRef.current = transformed;
        setPhase(buildPhase(transformed, new Array(6).fill(false), false, 900));
        later(() => runningRef.current && step(), SETTLE_MS);
      }, T);
    }, HOLD_MS);
  }, [buildPhase, later]);

  // Fresh full yarrow cast (the "Cast a reading" gesture).
  const cast = useCallback(() => {
    if (!runningRef.current) return;
    clearTimers();
    const rng = rngRef.current!;
    const c = castHexagram(rng);
    const lines = c.map((l) => l.type);
    const changing = c.map((l) => l.changing);
    presentRef.current = lines;
    const audio = audioRef.current;
    audio?.setCharacters(lines, 0.3);
    audio?.pluckAll(lines, 1.1);
    setPhase(buildPhase(lines, changing, false, 900));

    // Fold the freshly-cast changing lines into the ongoing canon.
    later(() => {
      if (!runningRef.current) return;
      const rng2 = rngRef.current!;
      const T = reducedRef.current ? 17000 : 9000 + rng2() * 9000;
      const transformed = applyChanges(lines, changing);
      changing.forEach((isChanging, i) => {
        if (isChanging)
          audioRef.current?.transitionLine(i, lines[i], transformed[i], T / 1000);
      });
      setPhase(buildPhase(transformed, changing, true, T));
      later(() => {
        if (!runningRef.current) return;
        presentRef.current = transformed;
        setPhase(buildPhase(transformed, new Array(6).fill(false), false, 900));
        later(() => runningRef.current && step(), SETTLE_MS);
      }, T);
    }, HOLD_MS);
  }, [buildPhase, clearTimers, later, step]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the reading still turns in silence
      }
    }
    await audioRef.current?.resume();

    // Seed deterministically from performance.now() (no Date, no Math.random).
    rngRef.current = mulberry32((performance.now() * 1000) >>> 0);

    // Cast the opening hexagram.
    const c = castHexagram(rngRef.current);
    presentRef.current = c.map((l) => l.type);

    runningRef.current = true;
    setStarted(true);
    step();
  }, [step]);

  const stop = useCallback(() => {
    runningRef.current = false;
    clearTimers();
    audioRef.current?.dispose();
    audioRef.current = null;
    setStarted(false);
    setPhase(null);
  }, [clearTimers]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      clearTimers();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [clearTimers]);

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-background text-foreground">
      {/* title + one-sentence description */}
      <header className="z-10 flex flex-col gap-2 px-5 pt-6 sm:px-8 sm:pt-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Changing Lines
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A hexagram cast as a six-note guqin chord — its{" "}
          <span className="text-foreground">changing lines</span> pull the music
          forward through the King Wen sequence as a slow, self-evolving canon.
        </p>
      </header>

      {/* the ink-on-rice-paper reading */}
      <section className="flex flex-1 items-center justify-center px-4 py-6">
        <div className="flex w-full max-w-4xl flex-col items-center gap-6 md:flex-row md:items-stretch md:justify-center">
          <HexagramArt phase={phase} reduced={reducedRef.current} />
          <ReadingText phase={phase} started={started} />
        </div>
      </section>

      {/* controls */}
      <div className="z-10 flex flex-wrap items-center gap-2 px-5 pb-24 sm:px-8">
        {!started ? (
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start the canon
          </button>
        ) : (
          <>
            <button
              onClick={cast}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Cast a reading
            </button>
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
            <button
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          </>
        )}
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "Close notes" : "Design notes"}
        </button>
      </div>

      {showNotes && (
        <div className="absolute inset-x-0 bottom-0 top-0 z-30 mx-auto flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setShowNotes(false)}
          />
          <div className="relative max-h-[80dvh] max-w-xl overflow-y-auto rounded-lg border border-border bg-card p-6 text-base text-muted-foreground shadow-xl">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              The music of changing lines
            </h2>
            <p className="mb-3">
              A hexagram is six stacked lines, each yin (broken) or yang (solid),
              read from the bottom up. Cast by the yarrow-stalk method, some lines
              come up <span className="text-foreground">old / changing</span>: an
              old-yin becomes yang, an old-yang becomes yin. Those changing lines
              carry the present hexagram to its{" "}
              <span className="text-foreground">transformed</span> hexagram.
            </p>
            <p className="mb-3">
              Each line is a voice in a six-note{" "}
              <span className="text-foreground">gong pentatonic</span> chord
              (宫商角徵羽), bottom line lowest. Yang voices sound bright and
              present; yin voices are hollow, with a slow amplitude gap. A changing
              line glides in timbre and bends in pitch as the ink morphs — the
              transformed hexagram then becomes the new present, and fresh changing
              lines are cast on it, so the piece walks the 64 hexagrams forever.
            </p>
            <p className="text-sm">
              Fully deterministic: a seeded mulberry32 PRNG (no Math.random, no
              clock) drives every cast. Master output routes through a compressor
              with a gain ceiling of 0.14.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1616-changing-lines"]} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// The hexagram, drawn in ink
// ---------------------------------------------------------------------------

function HexagramArt({
  phase,
  reduced,
}: {
  phase: Phase | null;
  reduced: boolean;
}) {
  const W = 360;
  const H = 320;
  const cx = W / 2;
  const barW = 220;
  const gap = 38; // yin gap in the middle
  const barH = 18;
  const rows = 6;
  const rowGap = (H - 60) / rows;
  const half = barW / 2;

  const lines = phase?.lines ?? new Array<LineType>(6).fill("yin");
  const changing = phase?.changing ?? new Array<boolean>(6).fill(false);
  const morphMs = phase?.morphMs ?? 900;
  const morphSecs = (morphMs / 1000).toFixed(2);
  const ease = reduced ? "linear" : "cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    <div
      className="relative overflow-hidden rounded-lg shadow-inner"
      style={{ background: BONE }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", maxWidth: 360 }}
        role="img"
        aria-label="I-Ching hexagram in ink"
      >
        <defs>
          <radialGradient id="paper" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor={BONE} />
            <stop offset="100%" stopColor={BONE_2} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#paper)" />

        {/* six lines, top of array (line 6) drawn at the top */}
        {lines.map((type, i) => {
          const rowFromTop = rows - 1 - i; // line 6 (i=5) → row 0 (top)
          const y = 30 + rowFromTop * rowGap;
          const isYang = type === "yang";
          const isChanging = changing[i];
          return (
            <g key={i}>
              {/* left segment (always present) */}
              <rect
                x={cx - half}
                y={y}
                width={half - gap / 2}
                height={barH}
                rx={3}
                fill={CHARCOAL}
              />
              {/* right segment (always present) */}
              <rect
                x={cx + gap / 2}
                y={y}
                width={half - gap / 2}
                height={barH}
                rx={3}
                fill={CHARCOAL}
              />
              {/* center bridge — present for yang, a gap for yin. Morphs. */}
              <rect
                x={cx - gap / 2}
                y={y}
                width={gap}
                height={barH}
                rx={3}
                fill={CHARCOAL}
                style={{
                  opacity: isYang ? 1 : 0,
                  transition: `opacity ${morphSecs}s ${ease}`,
                }}
              />
              {/* changing-line mark: one cinnabar circle at the pivot */}
              <circle
                cx={cx}
                cy={y + barH / 2}
                r={6}
                fill="none"
                stroke={CINNABAR}
                strokeWidth={2.4}
                style={{
                  opacity: isChanging ? 0.95 : 0,
                  transition: `opacity ${morphSecs}s ${ease}`,
                  transformOrigin: `${cx}px ${y + barH / 2}px`,
                  animation:
                    isChanging && !reduced
                      ? "cl-pulse 2.6s ease-in-out infinite"
                      : "none",
                }}
              />
            </g>
          );
        })}
      </svg>
      <style>{`
        @keyframes cl-pulse {
          0%, 100% { opacity: 0.95; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The reading, in words
// ---------------------------------------------------------------------------

function ReadingText({
  phase,
  started,
}: {
  phase: Phase | null;
  started: boolean;
}) {
  if (!started || !phase) {
    return (
      <div className="flex max-w-sm flex-col justify-center gap-3 text-center md:text-left">
        <p className="text-base text-muted-foreground">
          Press <span className="text-foreground">Start the canon</span> to cast an
          opening hexagram. It sounds, holds, and then its changing lines slowly
          morph it into the next — playing itself onward through the Book of
          Changes.
        </p>
      </div>
    );
  }

  const { present, transformed, pair, moving } = phase;
  const changingCount = phase.changing.filter(Boolean).length;

  return (
    <div className="flex min-w-[16rem] max-w-sm flex-col justify-center gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {moving ? "Becoming" : "Present"} · Hexagram {present.num}
        </span>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl leading-none text-foreground">
            {present.cn}
          </span>
          <span className="text-xl text-muted-foreground">{present.pinyin}</span>
        </div>
        <span className="text-base text-foreground">{present.gloss}</span>
      </div>

      <div className="flex items-center gap-3 text-base text-muted-foreground">
        <span title={`${pair.upper.name} — ${pair.upper.gloss}`}>
          <span className="text-xl">{pair.upper.symbol}</span> {pair.upper.gloss}
        </span>
        <span className="text-muted-foreground/50">over</span>
        <span title={`${pair.lower.name} — ${pair.lower.gloss}`}>
          <span className="text-xl">{pair.lower.symbol}</span> {pair.lower.gloss}
        </span>
      </div>

      {transformed && (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {changingCount} changing line{changingCount === 1 ? "" : "s"} →
            Hexagram {transformed.num}
          </span>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl leading-none text-foreground">
              {transformed.cn}
            </span>
            <span className="text-base text-muted-foreground">
              {transformed.pinyin} · {transformed.gloss}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
