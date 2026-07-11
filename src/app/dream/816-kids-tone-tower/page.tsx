"use client";

/**
 * 816 · Tone Tower — /dream/816-kids-tone-tower
 *
 * What if a 4-year-old could BUILD a chord by stacking blocks — genuinely
 * shaping the harmony, not just triggering pre-approved notes?
 *
 * The child taps/drags in the play area to drop a glowing block onto the top of
 * a tower. The size of the vertical gap they make between blocks chooses the
 * INTERVAL above the block below — snapped to a warm just-intonation consonance
 * lattice (unison, thirds, fourth, fifth, sixth, octave). So a small gap stacks
 * a tight, close, rich cluster; a big gap reaches up into an open, bright chord.
 * The harmony is SHAPED by the child, not pre-approved. The whole tower sounds
 * bottom→top as a chord; tap it (or Play) to strum it; a gentle arpeggio loops
 * to keep it alive. A big friendly "knock it over" topples it with a downward
 * gliss + sparkle. No reading, no fail states — color is the language.
 *
 * INPUT:  touch / mouse (tap or drag to drop & place a block; tap tower to strum)
 * OUTPUT: animated SVG tower (glowing rects, blur filters, CSS pulses)
 * CORE:   gap-size → just-intonation interval → consonant stacked chord
 * VIBE:   warm cream nursery, bold saturated blocks, soft and safe
 *
 * Refs (see README): Froebel's "Gifts" (kindergarten building blocks);
 * uCue (IDC 2025, ACM — children shaping harmony layers); Harry Partch
 * just-intonation tonality-diamond interval lattice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ToneTowerAudio } from "./audio";
import {
  LATTICE,
  MAX_VOICES,
  ROOT_HZ,
  gapToInterval,
  resolveFreqs,
  type Block,
} from "./harmony";

// ── play-area geometry (SVG user units) ─────────────────────────────────────
const VIEW_W = 400;
const VIEW_H = 640;
const FLOOR_Y = 600; // top of the floor; tower sits on it
const BLOCK_W = 168;
const BLOCK_H = 56;
const CX = VIEW_W / 2;
// the max vertical gap (in user units) that maps to a full octave reach
const MAX_GAP = 150;

let nextId = 1;

function makeBlock(gapNorm: number, isRoot = false): Block {
  const interval = isRoot ? LATTICE[0] : gapToInterval(gapNorm);
  return { id: nextId++, interval, freq: ROOT_HZ, gapNorm, };
}

// Seed tower: root + a third + a fifth (a warm open triad to glance at).
function seedTower(): Block[] {
  const blocks: Block[] = [
    makeBlock(0, true), // root
    makeBlock(316 / 1200), // ~minor third gap
    makeBlock(702 / 1200), // ~fifth gap
  ];
  return resolveFreqs(blocks);
}

export default function ToneTowerPage() {
  const [blocks, setBlocks] = useState<Block[]>(() => seedTower());
  const [noAudio, setNoAudio] = useState(false);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [litId, setLitId] = useState<number | null>(null);
  const [toppling, setToppling] = useState(false);
  // ghost preview while dragging a new block
  const [ghost, setGhost] = useState<{ y: number; gapNorm: number } | null>(
    null,
  );

  const audioRef = useRef<ToneTowerAudio | null>(null);
  const blocksRef = useRef<Block[]>(blocks);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const loopRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const pointerDownAtRef = useRef(0);
  const movedRef = useRef(false);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  // ── audio init (engine created eagerly; resumed on first tap for iOS) ──────
  useEffect(() => {
    const a = new ToneTowerAudio();
    audioRef.current = a;
    if (a.unavailable) setNoAudio(true);
    return () => {
      if (loopRef.current) window.clearTimeout(loopRef.current);
      loopRef.current = null;
      a.dispose();
      audioRef.current = null;
    };
  }, []);

  const freqsOf = useCallback(
    (bs: Block[]) => resolveFreqs(bs).map((b) => b.freq),
    [],
  );

  const strum = useCallback(() => {
    const a = audioRef.current;
    const bs = blocksRef.current;
    if (a && a.audible) a.strum(freqsOf(bs));
    // light each block in sequence to mirror the arpeggio
    bs.forEach((b, i) => {
      window.setTimeout(() => setLitId(b.id), i * 70);
    });
    window.setTimeout(() => setLitId(null), bs.length * 70 + 320);
  }, [freqsOf]);

  // ── gentle looping arpeggio so the tower stays alive ───────────────────────
  const scheduleLoop = useCallback(() => {
    if (loopRef.current) window.clearTimeout(loopRef.current);
    const tick = () => {
      strum();
      // loop length scales a little with tower height so taller = more spacious
      const bs = blocksRef.current;
      const wait = 2600 + bs.length * 220;
      loopRef.current = window.setTimeout(tick, wait);
    };
    loopRef.current = window.setTimeout(tick, 1400);
  }, [strum]);

  const ensureStarted = useCallback(async () => {
    const a = audioRef.current;
    if (a && !a.unavailable) {
      await a.resume();
      if (!a.audible) setNoAudio(true);
    }
    if (!started) {
      setStarted(true);
      scheduleLoop();
    }
  }, [started, scheduleLoop]);

  // ── pointer → place a block ───────────────────────────────────────────────
  // Convert a clientY into an SVG-space y.
  const toSvgY = useCallback((clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const r = svg.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * VIEW_H;
  }, []);

  // current top-of-tower y (top edge of the highest block)
  const towerTopY = useCallback((bs: Block[]) => {
    // each block drawn from FLOOR upward; gap derived from gapNorm
    let y = FLOOR_Y;
    for (let i = 0; i < bs.length; i++) {
      const gapPx = i === 0 ? 0 : bs[i].gapNorm * MAX_GAP;
      y = y - BLOCK_H - gapPx;
    }
    return y; // top edge of topmost block
  }, []);

  const computeGapNorm = useCallback(
    (svgY: number, bs: Block[]) => {
      // gap measured from the current top of the tower upward to the pointer
      const top = towerTopY(bs);
      const gapPx = Math.max(0, top - svgY);
      return Math.max(0, Math.min(1, gapPx / MAX_GAP));
    },
    [towerTopY],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      void ensureStarted();
      if (toppling) return;
      const bs = blocksRef.current;
      if (bs.length >= MAX_VOICES) {
        // tower is full → tapping just strums (no fail state)
        strum();
        return;
      }
      draggingRef.current = true;
      movedRef.current = false;
      pointerDownAtRef.current = performance.now();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const y = toSvgY(e.clientY);
      const gapNorm = computeGapNorm(y, bs);
      const top = towerTopY(bs);
      setGhost({ y: Math.min(y, top - 4), gapNorm });
    },
    [ensureStarted, toppling, strum, toSvgY, computeGapNorm, towerTopY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      movedRef.current = true;
      const bs = blocksRef.current;
      const y = toSvgY(e.clientY);
      const gapNorm = computeGapNorm(y, bs);
      const top = towerTopY(bs);
      setGhost({ y: Math.min(y, top - 4), gapNorm });
    },
    [toSvgY, computeGapNorm, towerTopY],
  );

  const placeBlock = useCallback(
    (gapNorm: number) => {
      const a = audioRef.current;
      setBlocks((prev) => {
        if (prev.length >= MAX_VOICES) return prev;
        const nb = makeBlock(gapNorm);
        const next = resolveFreqs([...prev, nb]);
        // sound the new note immediately + a quick re-strum to hear the chord
        if (a && a.audible) {
          a.note(next[next.length - 1].freq, 0, { gain: 0.55, dur: 1.6 });
          a.strum(
            next.map((b) => b.freq),
            { step: 0.06, gain: 0.32 },
          );
        }
        setLitId(nb.id);
        window.setTimeout(() => setLitId(null), 420);
        return next;
      });
    },
    [],
  );

  const onPointerUp = useCallback(
    () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const g = ghost;
      setGhost(null);
      if (toppling) return;
      // A clean tap (no drag) drops a default warm "third" block;
      // a drag uses the gap the child shaped.
      const elapsed = performance.now() - pointerDownAtRef.current;
      let gapNorm: number;
      if (!movedRef.current && elapsed < 350) {
        // pure tap → use where they tapped if there's a gap, else a friendly third
        gapNorm = g && g.gapNorm > 0.04 ? g.gapNorm : 316 / 1200;
      } else {
        gapNorm = g ? g.gapNorm : 316 / 1200;
      }
      placeBlock(gapNorm);
    },
    [ghost, toppling, placeBlock],
  );

  // ── knock it over ─────────────────────────────────────────────────────────
  const knockOver = useCallback(() => {
    void ensureStarted();
    if (toppling) return;
    const a = audioRef.current;
    const bs = blocksRef.current;
    if (a && a.audible) a.topple(freqsOf(bs));
    setToppling(true);
    window.setTimeout(() => {
      setBlocks(seedTower());
      setToppling(false);
      // little welcome strum
      window.setTimeout(() => strum(), 250);
    }, 900);
  }, [ensureStarted, toppling, freqsOf, strum]);

  // ── render: compute each block's y position bottom→top ─────────────────────
  const resolved = resolveFreqs(blocks);
  let yCursor = FLOOR_Y;
  const placed = resolved.map((b, i) => {
    const gapPx = i === 0 ? 0 : b.gapNorm * MAX_GAP;
    const y = yCursor - BLOCK_H - gapPx; // top edge
    yCursor = y;
    return { ...b, y, gapPx, index: i };
  });

  const ghostInterval = ghost ? gapToInterval(ghost.gapNorm) : null;

  return (
    <div className="min-h-dvh w-full bg-[#fdf6ec] text-[#3a2f25]">
      {/* header */}
      <div className="mx-auto flex max-w-[480px] items-center justify-between px-4 pt-4">
        <Link
          href="/dream"
          className="rounded-full bg-muted px-3 py-2 text-base font-semibold text-[#7a5c3e] shadow-sm transition-colors hover:bg-card"
          aria-label="Back to all prototypes"
        >
          ←
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#b5651d]">
          Tone Tower
        </h1>
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="rounded-full bg-muted px-3 py-2 text-base font-semibold text-[#7a5c3e] shadow-sm transition-colors hover:bg-card"
          aria-label="Design notes"
        >
          ?
        </button>
      </div>

      {noAudio && (
        <p className="mx-auto mt-2 max-w-[480px] px-4 text-base font-semibold text-violet-700">
          Sound is off on this device — you can still build and watch the tower
          glow.
        </p>
      )}

      {/* play area */}
      <div className="mx-auto mt-2 max-w-[480px] px-4">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#fffaf2] to-[#f6e7cf] shadow-inner">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block w-full touch-none select-none"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <filter id="tt-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="tt-soft" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2.2" />
              </filter>
            </defs>

            {/* floor */}
            <rect
              x={CX - BLOCK_W / 2 - 26}
              y={FLOOR_Y + BLOCK_H / 2}
              width={BLOCK_W + 52}
              height={20}
              rx={10}
              fill="#e3c79a"
            />

            {/* connector lines between block centers (shows the interval gaps) */}
            {placed.map((b, i) => {
              if (i === 0) return null;
              const prev = placed[i - 1];
              return (
                <line
                  key={`c-${b.id}`}
                  x1={CX}
                  y1={prev.y + BLOCK_H / 2}
                  x2={CX}
                  y2={b.y + BLOCK_H / 2}
                  stroke={`hsl(${b.interval.hue} 70% 60% / 0.5)`}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray="2 10"
                />
              );
            })}

            {/* blocks */}
            {placed.map((b) => {
              const lit = litId === b.id;
              const sat = 78;
              const light = lit ? 64 : 56;
              const fill = `hsl(${b.interval.hue} ${sat}% ${light}%)`;
              const toppleStyle: React.CSSProperties = toppling
                ? {
                    transform: `translate(${(b.index % 2 ? 1 : -1) * (28 + b.index * 10)}px, ${60 + b.index * 30}px) rotate(${(b.index % 2 ? 1 : -1) * (14 + b.index * 6)}deg)`,
                    opacity: 0,
                    transition: "transform 850ms ease-in, opacity 850ms ease-in",
                  }
                : {
                    transform: "translate(0,0) rotate(0deg)",
                    transition:
                      "transform 520ms cubic-bezier(.2,1.3,.4,1), opacity 300ms",
                  };
              return (
                <g
                  key={b.id}
                  style={{
                    transformOrigin: `${CX}px ${b.y + BLOCK_H / 2}px`,
                    ...toppleStyle,
                  }}
                >
                  {/* glow halo when lit */}
                  {lit && (
                    <rect
                      x={CX - BLOCK_W / 2}
                      y={b.y}
                      width={BLOCK_W}
                      height={BLOCK_H}
                      rx={18}
                      fill={fill}
                      filter="url(#tt-glow)"
                      opacity={0.9}
                    />
                  )}
                  <rect
                    x={CX - BLOCK_W / 2}
                    y={b.y}
                    width={BLOCK_W}
                    height={BLOCK_H}
                    rx={18}
                    fill={fill}
                    stroke="rgba(255,255,255,0.7)"
                    strokeWidth={3}
                    style={{
                      filter: lit ? "url(#tt-soft)" : "none",
                      transform: lit ? "scale(1.04)" : "scale(1)",
                      transformOrigin: `${CX}px ${b.y + BLOCK_H / 2}px`,
                      transition: "transform 180ms ease-out",
                    }}
                  />
                  {/* soft highlight */}
                  <rect
                    x={CX - BLOCK_W / 2 + 10}
                    y={b.y + 8}
                    width={BLOCK_W - 20}
                    height={12}
                    rx={6}
                    fill="rgba(255,255,255,0.35)"
                  />
                  {/* a friendly face-dot so it reads as a character, not text */}
                  <circle
                    cx={CX}
                    cy={b.y + BLOCK_H / 2}
                    r={6}
                    fill="rgba(255,255,255,0.85)"
                  />
                </g>
              );
            })}

            {/* ghost preview of the block about to drop */}
            {ghost && ghostInterval && placed.length < MAX_VOICES && (
              <g pointerEvents="none">
                <rect
                  x={CX - BLOCK_W / 2}
                  y={ghost.y}
                  width={BLOCK_W}
                  height={BLOCK_H}
                  rx={18}
                  fill={`hsl(${ghostInterval.hue} 80% 62%)`}
                  opacity={0.55}
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={3}
                  strokeDasharray="10 8"
                />
                {/* dotted reach line from tower top to the ghost */}
                <line
                  x1={CX}
                  y1={ghost.y + BLOCK_H}
                  x2={CX}
                  y2={towerTopYForGhost(placed)}
                  stroke={`hsl(${ghostInterval.hue} 80% 55%)`}
                  strokeWidth={4}
                  strokeDasharray="3 9"
                  strokeLinecap="round"
                  opacity={0.7}
                />
              </g>
            )}

            {/* hint hand on first load (no reading required) */}
            {!started && (
              <g pointerEvents="none" opacity={0.85}>
                <text
                  x={CX}
                  y={90}
                  textAnchor="middle"
                  fontSize="30"
                  style={{ animation: "tt-bob 1.6s ease-in-out infinite" }}
                >
                  👆
                </text>
              </g>
            )}
          </svg>

          {/* invisible big strum target: tapping the lower 1/4 strums (handled
              via the Play button below for clarity). */}
        </div>

        {/* big friendly controls — icon only, ≥64px targets */}
        <div className="mt-4 flex items-center justify-center gap-5 pb-8">
          <button
            onClick={() => {
              void ensureStarted();
              strum();
            }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[#3fb68b] text-3xl text-foreground shadow-lg transition-transform active:scale-95"
            aria-label="Play the tower"
          >
            ▶
          </button>
          <button
            onClick={knockOver}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-[#e8743b] text-3xl text-foreground shadow-lg transition-transform active:scale-95"
            aria-label="Knock the tower over and start again"
          >
            💥
          </button>
        </div>
      </div>

      {/* voice meter (color dots, no reading) */}
      <div className="mx-auto flex max-w-[480px] items-center justify-center gap-2 px-4 pb-10">
        {Array.from({ length: MAX_VOICES }).map((_, i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full"
            style={{
              background:
                i < blocks.length
                  ? `hsl(${placed[i]?.interval.hue ?? 50} 78% 58%)`
                  : "rgba(0,0,0,0.12)",
            }}
          />
        ))}
      </div>

      {/* design notes drawer */}
      {showNotes && (
        <div className="mx-auto max-w-[480px] px-4 pb-16">
          <div className="rounded-2xl bg-muted p-5 text-base leading-relaxed text-[#4a3c2e] shadow">
            <p className="mb-2 text-xl font-bold text-[#b5651d]">
              How to play
            </p>
            <p className="mb-2">
              Drag up from the top of the tower and let go to drop a new glowing
              block. A <strong>small gap</strong> stacks a tight, rich cluster; a
              <strong> big reach</strong> opens a bright, airy chord. Every gap
              snaps to a consonant just-intonation interval, so it always sounds
              good — but <em>you</em> choose the harmony.
            </p>
            <p className="mb-2">
              Tap ▶ to strum the tower bottom-to-top. Tap 💥 to knock it over and
              start again. There is no wrong move.
            </p>
            <p className="text-sm text-[#6b5942]">
              Refs: Froebel&apos;s Gifts · uCue (IDC 2025) · Partch
              just-intonation lattice.
            </p>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html:
            "@keyframes tt-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}",
        }}
      />
    </div>
  );
}

// helper used inside JSX for the ghost reach-line origin (top of current tower)
function towerTopYForGhost(
  placed: { y: number }[],
): number {
  if (placed.length === 0) return FLOOR_Y;
  // the topmost placed block has the smallest y; its top edge is its y
  return placed[placed.length - 1].y;
}
