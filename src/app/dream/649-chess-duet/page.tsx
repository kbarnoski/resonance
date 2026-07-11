"use client";

// 649-chess-duet — "Chess Duet". The first structured-game sonification in
// the lab: a famous chess game (Anderssen vs Kieseritzky, "The Immortal
// Game", London 1851) played back as a slow, inevitable TWO-VOICE DUET.
// White is a warm triangle "left hand", Black a darker FM "right hand";
// they alternate move by move as call-and-response counterpoint. File ->
// scale degree (D harmonic minor), rank -> register, piece -> articulation.
// Captures clash, checks hold a tension pedal, castling settles, mate
// resolves into a held final chord. The game's structure IS the score.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IMMORTAL_GAME_PGN,
  GAME_META,
  parsePGN,
  Ply,
  FILE_NAMES,
  PIECE_NAMES,
} from "./game";
import { buildScore, createAudio, ChessAudio, checkPedalFreq, NoteSpec } from "./music";
import { layoutScore } from "./score";

type Phase = "idle" | "playing" | "paused" | "done" | "error";

const PLIES: Ply[] = parsePGN(IMMORTAL_GAME_PGN);
const NOTES: NoteSpec[] = buildScore(PLIES);

// Board geometry
const BOARD = 360;
const CELL = BOARD / 8;

// rank/file -> svg pixel center. rank 7 (Black home) at top.
function cx(file: number) {
  return file * CELL + CELL / 2;
}
function cy(rank: number) {
  return (7 - rank) * CELL + CELL / 2;
}

function sanLabel(ply: Ply): string {
  return `${ply.moveNo}.${ply.color === "b" ? ".." : ""} ${ply.san}`;
}

export default function ChessDuetPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(true);
  const [tempo, setTempo] = useState(2.0); // seconds per move
  const [current, setCurrent] = useState(-1); // index of last-sounded ply
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  const audioRef = useRef<ChessAudio | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idxRef = useRef(0);
  const tempoRef = useRef(tempo);
  const mutedRef = useRef(muted);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tempoRef.current = tempo;
  }, [tempo]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Ensure an AudioContext exists. Called inside a user gesture, or for the
  // silent auto-demo (audio stays effectively muted until the user unmutes).
  const ensureAudio = useCallback((): ChessAudio | null => {
    if (audioRef.current) return audioRef.current;
    try {
      const a = createAudio();
      audioRef.current = a;
      return a;
    } catch {
      setError("Audio unavailable on this device. The visual game still plays.");
      return null;
    }
  }, []);

  // Schedule + advance one ply, then queue the next.
  const step = useCallback(() => {
    const i = idxRef.current;
    if (i >= NOTES.length) {
      setPhase("done");
      const a = audioRef.current;
      // release the pedal at the end
      if (a) a.setPedal(null, a.ctx.currentTime);
      return;
    }
    const note = NOTES[i];
    const a = audioRef.current;

    if (a && !mutedRef.current) {
      const when = a.ctx.currentTime + 0.02;
      // capture = brief silence then a stronger note: nudge the attack a hair.
      a.playNote(note, note.capture ? when + 0.06 : when, tempoRef.current);

      // check -> hold a tension pedal tone; clear it on the next non-check.
      if (note.check && !note.mate) {
        a.setPedal(checkPedalFreq(note), when);
      } else if (!note.check) {
        a.setPedal(null, when);
      }
    }

    setCurrent(i);
    idxRef.current = i + 1;

    if (i + 1 >= NOTES.length) {
      timerRef.current = setTimeout(() => {
        setPhase("done");
      }, tempoRef.current * 1000);
      return;
    }
    timerRef.current = setTimeout(step, tempoRef.current * 1000);
  }, []);

  const start = useCallback(
    (fromIdle: boolean) => {
      ensureAudio();
      clearTimer();
      if (fromIdle || idxRef.current >= NOTES.length) {
        idxRef.current = 0;
        setCurrent(-1);
      }
      setPhase("playing");
      // small lead-in so the first note breathes
      timerRef.current = setTimeout(step, 250);
    },
    [ensureAudio, clearTimer, step]
  );

  const onPlay = useCallback(() => {
    setAutoStarted(true);
    // user gesture -> resume context + unmute
    const a = ensureAudio();
    if (a && a.ctx.state === "suspended") void a.ctx.resume();
    setMuted(false);
    if (phase === "paused") {
      setPhase("playing");
      clearTimer();
      timerRef.current = setTimeout(step, 200);
    } else {
      start(true);
    }
  }, [ensureAudio, phase, start, clearTimer, step]);

  const onPause = useCallback(() => {
    clearTimer();
    setPhase("paused");
    const a = audioRef.current;
    if (a) a.setPedal(null, a.ctx.currentTime);
  }, [clearTimer]);

  const onRestart = useCallback(() => {
    clearTimer();
    idxRef.current = 0;
    setCurrent(-1);
    start(true);
  }, [clearTimer, start]);

  const toggleMute = useCallback(() => {
    setAutoStarted(true);
    const a = ensureAudio();
    if (a && a.ctx.state === "suspended") void a.ctx.resume();
    setMuted((m) => !m);
  }, [ensureAudio]);

  // AUTO-START ~2.5s after load (silent visual demo; sound when unmuted).
  useEffect(() => {
    autoTimerRef.current = setTimeout(() => {
      if (!autoStarted) {
        // ensure a context so unmuting mid-demo works; it stays silent
        // because `muted` is true until a gesture.
        ensureAudio();
        start(true);
      }
    }, 2500);
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount: timers + audio nodes + context.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      const a = audioRef.current;
      if (a) a.dispose();
      audioRef.current = null;
    };
  }, []);

  const activePly = current >= 0 ? PLIES[current] : null;
  const score = layoutScore(NOTES, {
    width: 720,
    height: 200,
    leftPad: 36,
    rightPad: 16,
    currentIndex: current,
  });

  const whitePlies = current >= 0 ? Math.ceil((current + 1) / 2) : 0;
  const progressPct = Math.round(((current + 1) / NOTES.length) * 100);

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex items-center justify-between">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← dream
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            649 · chess-duet
          </span>
        </div>

        <h1 className="font-serif text-3xl text-foreground sm:text-4xl">Chess Duet</h1>
        <p className="mt-2 text-base text-muted-foreground">
          A famous chess game played as a slow, inevitable two-voice duet —{" "}
          <span className="text-foreground">{GAME_META.name}</span>: {GAME_META.white}{" "}
          vs {GAME_META.black}, {GAME_META.event}.
        </p>

        {error && (
          <p className="mt-3 rounded-md border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-base text-violet-300">
            {error}
          </p>
        )}

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {phase === "playing" ? (
            <button
              onClick={onPause}
              className="inline-flex min-h-[44px] items-center rounded-md bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              ❚❚ Pause
            </button>
          ) : (
            <button
              onClick={onPlay}
              className="inline-flex min-h-[44px] items-center rounded-md bg-violet-500/80 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-500"
            >
              ► {phase === "done" ? "Replay" : muted ? "Play with sound" : "Play"}
            </button>
          )}

          <button
            onClick={onRestart}
            className="inline-flex min-h-[44px] items-center rounded-md bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
          >
            ↺ Restart
          </button>

          <button
            onClick={toggleMute}
            className="inline-flex min-h-[44px] items-center rounded-md bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
          >
            {muted ? "🔇 Muted" : "🔊 Sound on"}
          </button>

          <label className="flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono uppercase tracking-wider text-muted-foreground">tempo</span>
            <input
              type="range"
              min={1.0}
              max={3.5}
              step={0.1}
              value={tempo}
              onChange={(e) => setTempo(parseFloat(e.target.value))}
              className="h-1 w-28 accent-violet-400"
            />
            <span className="font-mono text-muted-foreground">{tempo.toFixed(1)}s/move</span>
          </label>
        </div>

        {/* Current move readout */}
        <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-2xl text-foreground">
            {activePly ? sanLabel(activePly) : "—"}
          </span>
          <span className="text-base text-muted-foreground">
            {activePly
              ? `${activePly.color === "w" ? "White" : "Black"} · ${PIECE_NAMES[activePly.piece]} → ${FILE_NAMES[activePly.toFile]}${activePly.toRank + 1}`
              : "press play, or wait — it begins on its own"}
          </span>
          {activePly?.capture && (
            <span className="rounded bg-violet-500/20 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-violet-300">
              capture
            </span>
          )}
          {activePly?.check && !activePly?.mate && (
            <span className="rounded bg-violet-500/20 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-violet-300">
              check
            </span>
          )}
          {activePly?.castle && (
            <span className="rounded bg-violet-500/20 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-violet-300">
              castle
            </span>
          )}
          {activePly?.mate && (
            <span className="rounded bg-violet-500/30 px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-violet-200">
              checkmate
            </span>
          )}
        </div>

        {/* progress bar */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-violet-400/70 transition-all duration-300"
            style={{ width: `${Math.max(0, progressPct)}%` }}
          />
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          ply {Math.max(0, current + 1)} / {NOTES.length} · move {Math.max(0, whitePlies)} of{" "}
          {Math.ceil(NOTES.length / 2)}
        </p>

        {/* Board + score */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[auto_1fr]">
          {/* SVG board */}
          <svg
            viewBox={`0 0 ${BOARD} ${BOARD}`}
            width={BOARD}
            height={BOARD}
            className="mx-auto rounded-lg border border-border bg-black/40"
            role="img"
            aria-label="Chess board showing the current move"
          >
            {/* squares */}
            {Array.from({ length: 8 }).map((_, r) =>
              Array.from({ length: 8 }).map((_, f) => {
                const dark = (r + f) % 2 === 1;
                const isFrom =
                  activePly && activePly.fromFile === f && activePly.fromRank === r;
                const isTo =
                  activePly && activePly.toFile === f && activePly.toRank === r;
                let fill = dark ? "#2a2a38" : "#3a3a4c";
                if (isTo)
                  fill = activePly?.capture
                    ? "#9f3a4a"
                    : activePly?.mate
                      ? "#6d5ae0"
                      : "#4f6de0";
                else if (isFrom) fill = "#3a4a6a";
                return (
                  <rect
                    key={`${r}-${f}`}
                    x={f * CELL}
                    y={(7 - r) * CELL}
                    width={CELL}
                    height={CELL}
                    fill={fill}
                  />
                );
              })
            )}

            {/* file/rank labels */}
            {FILE_NAMES.map((fn, f) => (
              <text
                key={`fl-${f}`}
                x={f * CELL + 3}
                y={BOARD - 3}
                fontSize="9"
                className="font-mono"
                fill="rgba(255,255,255,0.35)"
              >
                {fn}
              </text>
            ))}
            {Array.from({ length: 8 }).map((_, r) => (
              <text
                key={`rl-${r}`}
                x={2}
                y={(7 - r) * CELL + 11}
                fontSize="9"
                className="font-mono"
                fill="rgba(255,255,255,0.35)"
              >
                {r + 1}
              </text>
            ))}

            {/* move arrow */}
            {activePly && (
              <>
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="3"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" fill="rgba(255,255,255,0.85)" />
                  </marker>
                </defs>
                <line
                  x1={cx(activePly.fromFile)}
                  y1={cy(activePly.fromRank)}
                  x2={cx(activePly.toFile)}
                  y2={cy(activePly.toRank)}
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth={3}
                  markerEnd="url(#arrowhead)"
                />
                <circle
                  cx={cx(activePly.toFile)}
                  cy={cy(activePly.toRank)}
                  r={CELL * 0.32}
                  fill="none"
                  stroke={
                    activePly.color === "w"
                      ? "rgba(255,235,180,0.9)"
                      : "rgba(180,200,255,0.9)"
                  }
                  strokeWidth={2.5}
                />
              </>
            )}
          </svg>

          {/* SVG two-staff score */}
          <svg
            viewBox="0 0 720 200"
            className="w-full rounded-lg border border-border bg-black/40"
            role="img"
            aria-label="Unfolding two-staff score of the duet"
          >
            {/* staff guide lines */}
            {[score.whiteBand, score.blackBand].map((band, bi) =>
              [0, 0.5, 1].map((t) => {
                const y = band[0] + (band[1] - band[0]) * t;
                return (
                  <line
                    key={`${bi}-${t}`}
                    x1={36}
                    y1={y}
                    x2={704}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  />
                );
              })
            )}
            {/* staff labels */}
            <text x={4} y={score.whiteBand[0] + 4} fontSize="11" className="font-mono" fill="rgba(255,235,180,0.8)">
              W
            </text>
            <text x={4} y={score.blackBand[1]} fontSize="11" className="font-mono" fill="rgba(180,200,255,0.8)">
              B
            </text>

            {/* playhead */}
            {current >= 0 && current < NOTES.length && (
              <line
                x1={score.dots[current].x}
                y1={6}
                x2={score.dots[current].x}
                y2={194}
                stroke="rgba(120,140,255,0.5)"
                strokeWidth={1.5}
              />
            )}

            {/* note dots */}
            {score.dots.map((d) => {
              const base =
                d.color === "w" ? "255,235,180" : "150,180,255";
              const op = d.played ? 0.95 : 0.22;
              return (
                <g key={d.index}>
                  {d.check && d.played && (
                    <circle cx={d.x} cy={d.y} r={d.r + 4} fill="none" stroke="rgba(255,200,90,0.6)" strokeWidth={1.5} />
                  )}
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={d.r}
                    fill={
                      d.capture
                        ? `rgba(255,120,140,${op})`
                        : d.mate
                          ? `rgba(150,130,255,${op})`
                          : `rgba(${base},${op})`
                    }
                    stroke={d.index === current ? "rgba(255,255,255,0.9)" : "none"}
                    strokeWidth={d.index === current ? 2 : 0}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* legend / design notes */}
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-6 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
        >
          {showNotes ? "Hide the design notes" : "Read the design notes"}
        </button>

        {showNotes && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted p-4 text-base text-muted-foreground">
            <p>
              <span className="text-foreground">The game is the score.</span> Each
              move becomes a note in a two-voice duet. White (warm triangle, upper
              staff) and Black (darker FM voice, lower staff) alternate as
              call-and-response counterpoint.
            </p>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>
                <span className="text-foreground">File a–h</span> → scale degree in D
                harmonic minor; <span className="text-foreground">rank 1–8</span> →
                register.
              </li>
              <li>
                <span className="text-foreground">Piece</span> → articulation: pawn
                short, queen long &amp; rich, knight a grace-note leap, rook firm.
              </li>
              <li>
                <span className="text-violet-300">Capture</span> = a dissonant clash;{" "}
                <span className="text-violet-300">check</span> = a held tension pedal
                tone; <span className="text-violet-300">castling</span> = a settled
                fifth; <span className="text-violet-200">checkmate</span> = a
                resolving held chord.
              </li>
              <li>
                A running <span className="text-foreground">material balance</span>{" "}
                biases the timbre brighter (White ahead) or darker (Black ahead) so
                the arc is felt.
              </li>
            </ul>
            <p className="text-muted-foreground">
              Lineage: chess-as-music sonification (e.g. data-driven game
              sonifications and &quot;Chess Symphony&quot; experiments) reimagined
              here as strict two-voice counterpoint over a real master game.
            </p>
          </div>
        )}

        <div className="mt-8 h-16" />
      </div>
    </main>
  );
}
