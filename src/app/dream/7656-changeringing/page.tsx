"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7656-changeringing · page.tsx
//
// The one question: what if you could fall into the hypnotic trance of English
// change-ringing — an ancient combinatorial ritual where a set of bells rings
// EVERY permutation of its order exactly once, never repeating a row until it
// returns home — rendered as a slowly-woven mandala-braid you can watch and hear
// forever?
//
// The engine (./ringing.ts) is a real Plain Bob method built from scratch: each
// row is a genuine permutation produced by the method's place notation, and a
// full plain course cycles through every distinct row before returning to rounds
// (Fabian Stedman, Tintinnalogia 1668 / Campanalogia 1677).
//
// The visual is the ringers' "blue line": each bell's position traced as a
// continuous polyline down the field, the lines weaving over and under one
// another into a symmetric, non-repeating braid that scrolls slowly upward so it
// feels infinite. It is INLINE SVG only — no canvas, no WebGL. The braid auto-
// starts silently on load; sound (./audio.ts, tuned bell voices + a low drone)
// begins only inside a user gesture, per autoplay policy.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { startRingingAudio, type RingingAudio } from "./audio";
import { Ringer, bellFrequencies, methodInfo, type Row } from "./ringing";

// ── braid geometry (SVG user units) ─────────────────────────────────────────
const W = 100; // viewBox width
const PAD = 9; // horizontal padding for the column band
const VISIBLE = 32; // rows drawn in the visible column
const ROW_H = 22; // vertical spacing between rows
const H = VISIBLE * ROW_H; // viewBox height
const BUF = VISIBLE + 2; // buffer length (2 future rows below the fold)
const SND = VISIBLE - 1; // buffer index of the currently-sounding row

// ── ring timing ──────────────────────────────────────────────────────────────
const BASE_GAP = 210; // ms between successive bells at speed 1
const ROW_GAP_FRAC = 0.7; // extra pause after each row (a handstroke gap), × strikeGap

// ── the violet ramp: treble (bell 1) brightest, tenor deepest ────────────────
const BELL_COLORS = [
  "#ede9fe", // violet-100
  "#ddd6fe", // violet-200
  "#c4b5fd", // violet-300
  "#a78bfa", // violet-400
  "#8b5cf6", // violet-500 (brand)
  "#7c3aed", // violet-600
  "#6d28d9", // violet-700
  "#5b21b6", // violet-800
];

const STAGES = [6, 7] as const;

function colX(posIndex: number, n: number): number {
  const span = W - 2 * PAD;
  const t = n > 1 ? posIndex / (n - 1) : 0.5;
  return PAD + t * span;
}

function isRounds(row: Row): boolean {
  return row.every((b, i) => b === i + 1);
}

export default function ChangeRingingPage() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState<number>(6);
  const [bobs, setBobs] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [followed, setFollowed] = useState<number | null>(null);
  const [buffer, setBuffer] = useState<Row[]>([]);
  const [sounding, setSounding] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── hot-loop refs (no per-frame React renders for scroll) ───────────────────
  const audioRef = useRef<RingingAudio | null>(null);
  const ringerRef = useRef<Ringer | null>(null);
  const bufferRef = useRef<Row[]>([]);
  const rafRef = useRef<number>(0);
  const scrollGroupRef = useRef<SVGGElement>(null);
  const homeGlowRef = useRef<SVGRectElement>(null);

  const stageRef = useRef(6);
  const speedRef = useRef(1);
  const pausedRef = useRef(false);
  const reducedRef = useRef(false);
  const rowStartRef = useRef(0);
  const struckRef = useRef(0);
  const soundingRef = useRef(0);
  const lastFrameRef = useRef(0);
  const homePulseRef = useRef(0);

  // ── (re)initialise the ring for a stage / call plan ─────────────────────────
  const initRing = useCallback((n: number, useBobs: boolean) => {
    const ringer = new Ringer(n, useBobs);
    ringerRef.current = ringer;
    const buf: Row[] = [ringer.current()];
    while (buf.length < BUF) buf.push(ringer.next());
    bufferRef.current = buf;
    setBuffer(buf);
    stageRef.current = n;
    struckRef.current = 0;
    soundingRef.current = 0;
    setSounding(0);
    rowStartRef.current = performance.now();
    homePulseRef.current = 0;
  }, []);

  // ── advance the braid by one row (called when a row finishes sounding) ───────
  const commitRow = useCallback(() => {
    const ringer = ringerRef.current;
    if (!ringer) return;
    const future = ringer.next();
    const buf = bufferRef.current.slice();
    buf.shift();
    buf.push(future);
    bufferRef.current = buf;
    setBuffer(buf);
    if (isRounds(buf[SND])) homePulseRef.current = 1; // a "home" bloom
  }, []);

  // ── react to stage / bobs changes: rebuild the ring, retune audio ───────────
  useEffect(() => {
    initRing(stage, bobs);
    audioRef.current?.setTuning(bellFrequencies(stage));
  }, [stage, bobs, initRing]);

  // ── the render loop: strike bells on schedule, scroll the braid ─────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    lastFrameRef.current = performance.now();
    rowStartRef.current = performance.now();

    const frame = () => {
      const now = performance.now();
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;

      if (pausedRef.current) {
        rowStartRef.current += dt; // freeze elapsed while paused
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const n = stageRef.current;
      const buf = bufferRef.current;
      if (buf.length < BUF) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const strikeGap = BASE_GAP / speedRef.current;
      const rowDuration = strikeGap * (n + ROW_GAP_FRAC);
      let elapsed = now - rowStartRef.current;

      // Resync after a tab-away so nothing floods.
      if (elapsed > rowDuration * 3) {
        rowStartRef.current = now;
        struckRef.current = 0;
        elapsed = 0;
      }

      const sndRow = buf[SND];
      while (struckRef.current < n && elapsed >= struckRef.current * strikeGap) {
        const pos = struckRef.current;
        const bell = sndRow[pos];
        audioRef.current?.strike(bell - 1, 1);
        if (soundingRef.current !== pos) {
          soundingRef.current = pos;
          setSounding(pos);
        }
        struckRef.current += 1;
      }

      if (elapsed >= rowDuration) {
        commitRow();
        rowStartRef.current += rowDuration;
        struckRef.current = 0;
        elapsed = Math.max(0, now - rowStartRef.current);
      }

      // Slow upward scroll (disabled under reduced-motion → rows step on commit).
      const f = Math.min(1, Math.max(0, elapsed / rowDuration));
      const g = scrollGroupRef.current;
      if (g) g.setAttribute("transform", `translate(0 ${reducedRef.current ? 0 : (-f * ROW_H).toFixed(2)})`);

      // "Home" bloom decays smoothly over ~1.4 s (a gentle swell, never a flash).
      if (homePulseRef.current > 0) {
        homePulseRef.current = Math.max(0, homePulseRef.current - dt / 1400);
      }
      const glow = homeGlowRef.current;
      if (glow) glow.setAttribute("opacity", (homePulseRef.current * 0.3).toFixed(3));

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(rafRef.current);
  }, [commitRow]);

  // ── keyboard: space = pause; number keys = follow a bell; b/m toggles ───────
  const togglePause = useCallback(() => {
    setPaused((p) => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        togglePause();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const b = Number(e.key);
        if (b <= stageRef.current) setFollowed((f) => (f === b ? null : b));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause]);

  // ── start sound (must be inside a user gesture) ─────────────────────────────
  const begin = useCallback(() => {
    if (started) {
      togglePause();
      return;
    }
    setStarted(true);
    try {
      const audio = startRingingAudio(bellFrequencies(stageRef.current));
      if (!audio) {
        setNotice("Web Audio is unavailable — the braid rings on in silence.");
      } else {
        audioRef.current = audio;
      }
    } catch {
      setNotice("Audio could not start — the braid rings on in silence.");
    }
  }, [started, togglePause]);

  // ── teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const info = methodInfo(stage);
  const n = stage;
  const sndRow = buffer.length >= BUF ? buffer[SND] : null;
  const soundingBell = sndRow ? sndRow[sounding] : 0;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07040e] text-foreground">
      {/* ── the art: inline-SVG blue-line braid ── */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="cr-home" cx="50%" cy="62%" r="70%">
            <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#7c3aed" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cr-vign" cx="50%" cy="50%" r="75%">
            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#05030b" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        {/* home bloom (opacity driven imperatively) */}
        <rect ref={homeGlowRef} x={0} y={0} width={W} height={H} fill="url(#cr-home)" opacity={0} />

        {/* scrolling braid */}
        <g ref={scrollGroupRef}>
          {/* faint band marking the currently-sounding row */}
          <rect
            x={0}
            y={SND * ROW_H - ROW_H * 0.5}
            width={W}
            height={ROW_H}
            fill="#a78bfa"
            opacity={0.06}
          />

          {sndRow &&
            Array.from({ length: n }, (_, bi) => {
              const bell = bi + 1;
              const color = BELL_COLORS[Math.min(bi, BELL_COLORS.length - 1)];
              const anyFollow = followed !== null;
              const me = followed === bell;
              const pts = buffer
                .map((row, j) => `${colX(row.indexOf(bell), n).toFixed(2)},${(j * ROW_H).toFixed(1)}`)
                .join(" ");
              const mainW = me ? 2.8 : 1.8;
              const mainOp = anyFollow ? (me ? 1 : 0.42) : 0.92;
              const glowW = me ? 9 : 6;
              const glowOp = anyFollow ? (me ? 0.34 : 0.05) : 0.14;
              return (
                <g key={bell}>
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={glowW}
                    strokeOpacity={glowOp}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={mainW}
                    strokeOpacity={mainOp}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}

          {/* currently-sounding marker */}
          {sndRow && soundingBell > 0 && (
            <g>
              <circle
                cx={colX(sounding, n)}
                cy={SND * ROW_H}
                r={7}
                fill={BELL_COLORS[Math.min(soundingBell - 1, BELL_COLORS.length - 1)]}
                opacity={0.2}
              />
              <circle
                cx={colX(sounding, n)}
                cy={SND * ROW_H}
                r={2.9}
                fill={BELL_COLORS[Math.min(soundingBell - 1, BELL_COLORS.length - 1)]}
                opacity={0.95}
              />
            </g>
          )}
        </g>

        <rect x={0} y={0} width={W} height={H} fill="url(#cr-vign)" />
      </svg>

      {/* ── title + intro (top-left, non-blocking) ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          ritual · meditative-trance
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Change Ringing</h1>
        <p className="mt-2 max-w-md text-base text-muted-foreground">
          A real Plain Bob method, rung as a slowly-woven mandala-braid: every row a
          fresh permutation, never repeating until the bells return home to rounds.
        </p>
      </div>

      {/* ── controls (bottom, glassy) ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end gap-3 p-6">
        <button
          type="button"
          onClick={begin}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {!started ? "Start sound" : paused ? "Resume" : "Pause"}
        </button>

        {/* stage switch */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1 backdrop-blur">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(s)}
              className={`min-h-[36px] rounded px-3 text-sm transition-colors ${
                stage === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === 6 ? "Minor · 6" : "Triples · 7"}
            </button>
          ))}
        </div>

        {/* plain / bob touch */}
        <button
          type="button"
          onClick={() => setBobs((b) => !b)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {bobs ? "Bob touch" : "Plain course"}
        </button>

        {/* speed */}
        <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background/60 px-4 backdrop-blur">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tempo
          </span>
          <input
            type="range"
            min={0.5}
            max={1.8}
            step={0.05}
            value={speed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeed(v);
              speedRef.current = v;
            }}
            className="w-28 accent-primary"
            aria-label="ring tempo"
          />
        </label>

        {/* follow-a-bell legend */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1 backdrop-blur">
          <span className="px-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            follow
          </span>
          {Array.from({ length: n }, (_, i) => {
            const bell = i + 1;
            const me = followed === bell;
            return (
              <button
                key={bell}
                type="button"
                onClick={() => setFollowed((f) => (f === bell ? null : bell))}
                aria-pressed={me}
                title={`Bell ${bell}${bell === 1 ? " (treble)" : bell === n ? " (tenor)" : ""}`}
                className="flex h-8 w-8 items-center justify-center rounded font-mono text-xs transition-transform hover:scale-110"
                style={{
                  color: me ? "#07040e" : BELL_COLORS[Math.min(i, BELL_COLORS.length - 1)],
                  backgroundColor: me ? BELL_COLORS[Math.min(i, BELL_COLORS.length - 1)] : "transparent",
                  outline: me ? "none" : `1px solid ${BELL_COLORS[Math.min(i, BELL_COLORS.length - 1)]}55`,
                }}
              >
                {bell}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          {showNotes ? "close" : "Read the design notes"}
        </button>
      </div>

      {/* ── meta readout (top-right) ── */}
      <div className="pointer-events-none absolute right-6 top-6 z-10 text-right">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          plain bob {stage === 6 ? "minor" : "triples"}
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {info.courseLength} rows · {info.leadLength} leads to home
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {paused ? "paused" : started ? "ringing" : "silent · press start"}
          {" · space = pause"}
        </p>
      </div>

      {notice && (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur">
          {notice}
        </div>
      )}

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-xl border border-border bg-background/90 p-6 backdrop-blur-md">
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <p className="mt-3 text-base text-muted-foreground">
              This is a real English change-ringing method — <span className="text-foreground">Plain
              Bob</span> — implemented from scratch. Starting from &ldquo;rounds&rdquo;
              (1,2,3,…,N), each row is a genuine permutation of the one before it, produced by
              the method&rsquo;s <span className="text-foreground">place notation</span>: the ring
              alternates a &ldquo;cross&rdquo; change (all adjacent bells swap) with a change that
              holds two bells in place while the rest swap in pairs, and calls a lead-end each
              lead. A full plain course cycles through every distinct row and then returns home —
              never repeating a row until it does.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              The weave you see is the ringers&rsquo; <span className="text-foreground">blue
              line</span>: each bell&rsquo;s changing position, row after row, drawn as a
              continuous polyline. The lines cross over and under one another into a symmetric,
              non-repeating braid that scrolls slowly upward so it feels endless. It is inline SVG
              — no canvas, no WebGL. Each bell is a shade of violet; the currently-sounding bell
              glows, and a soft bloom rises whenever the ring returns to rounds.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Each bell is a tuned tower-bell voice — the classic partials (hum, prime, the
              characteristic minor-third tierce, quint, nominal) as lightly detuned sines under a
              long decay — tuned to a just-intonation diatonic scale, tenor as the tonic. The
              bells are struck in the exact order of each successive row, so you hear the changes
              cascade and re-weave over a low drone bed, all bloomed through a generated
              convolution reverb.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Interaction: <span className="text-foreground">space</span> pauses and resumes ·
              switch Plain Bob Minor (6) / Triples (7) · plain course or a bobbed touch · a tempo
              slider · click a numbered bell (or press its digit) to follow its blue line.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Reference: Fabian Stedman, <span className="italic">Tintinnalogia</span> (1668) and{" "}
              <span className="italic">Campanalogia</span> (1677) — the origins of change-ringing
              method. Tags: <span className="font-mono">state: ritual / meditative-trance · pole:
              cosmic-ambient</span>.
            </p>
            <div className="mt-5">
              <Link
                href="/dream"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                ← back to the dream lab
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
