"use client";

// ════════════════════════════════════════════════════════════════════════════
// Counterpoint Duel (2502) — "What if counterpoint were a turn-based strategy
// GAME you play against an AI that actually thinks ahead?"
//
// A fixed cantus firmus is given in the lower voice. You and a negamax AI take
// turns placing notes in the upper voice, left to right. Every note is scored
// live by first-species counterpoint rules (Fux, 1725). The AI runs a real
// game-tree search (Shannon 1950) — it plays the note that leaves YOU the worst
// best-reply. Fill the line, higher cumulative score wins.
//
// Determinism: no Math.random / Date.now anywhere; a seeded mulberry32 varies
// the cantus firmus. An auto-demo self-plays on load (visual only — audio needs
// a gesture) so a silent glance already shows the game playing itself.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CANDIDATES,
  noteName,
  pickCantusFirmus,
  scoreMove,
  type ScoreResult,
} from "./counterpoint";
import { chooseAiMove } from "./ai";
import { DuelSynth } from "./synth";
import { VIOLET, INDIGO, MAGENTA, NEUTRAL, ART_BLACK } from "../_shared/palette";

// ── Game types ──────────────────────────────────────────────────────────────
type By = "you" | "ai";
type Phase = "demo" | "play" | "done";

interface Move {
  beat: number;
  pitch: number;
  by: By;
  points: number;
  reasons: string[];
}

interface Game {
  seed: number;
  cf: number[];
  cp: (number | null)[];
  moves: Move[];
  turn: number;
  phase: Phase;
  nodes: number;
}

const SEED0 = 0x2502;
const BPM = 92;
const AI_DEPTH = 3;

// Player takes even beats, the AI odd beats.
function moverAt(beat: number): By {
  return beat % 2 === 0 ? "you" : "ai";
}

function freshGame(seed: number, phase: Phase): Game {
  const cf = pickCantusFirmus(seed);
  return {
    seed,
    cf,
    cp: cf.map(() => null),
    moves: [],
    turn: 0,
    phase,
    nodes: 0,
  };
}

// Apply a placed note purely, returning the next game state.
function applyMove(g: Game, pitch: number, nodes: number): Game {
  const beat = g.turn;
  const prevUpper = beat > 0 ? g.cp[beat - 1] : null;
  const res = scoreMove(beat, pitch, prevUpper, g.cf);
  const cp = g.cp.slice();
  cp[beat] = pitch;
  const move: Move = {
    beat,
    pitch,
    by: moverAt(beat),
    points: res.points,
    reasons: res.reasons,
  };
  const turn = beat + 1;
  return {
    ...g,
    cp,
    moves: [...g.moves, move],
    turn,
    phase: turn >= g.cf.length ? "done" : g.phase,
    nodes: g.nodes + nodes,
  };
}

// ── SVG geometry ────────────────────────────────────────────────────────────
const COL_W = 74;
const LEFT_PAD = 46;
const TOP_PAD = 26;
const ROW_H = 30;
const ROWS = CANDIDATES.length;
const UPPER_H = ROWS * ROW_H;
const GAP = 16;
const LANE_H = 74;
const N = 8;
const SVG_W = LEFT_PAD + N * COL_W + 14;
const SVG_H = TOP_PAD + UPPER_H + GAP + LANE_H + 8;
const LANE_TOP = TOP_PAD + UPPER_H + GAP;

const colX = (b: number) => LEFT_PAD + b * COL_W;
const cellCX = (b: number) => colX(b) + COL_W / 2;
const rowCY = (r: number) => TOP_PAD + r * ROW_H + ROW_H / 2;
const rowOf = (midi: number) => CANDIDATES.indexOf(midi);
// Map a cantus-firmus pitch into the lower lane (range padded to 59..68).
const cfY = (p: number) => LANE_TOP + LANE_H * (1 - (p - 59) / (68 - 59));

interface Hover {
  beat: number;
  midi: number;
  preview: ScoreResult;
}

export default function DuelPage() {
  const synthRef = useRef<DuelSynth | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);

  const [game, setGame] = useState<Game>(() => freshGame(SEED0, "demo"));
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [playPos, setPlayPos] = useState<number | null>(null);

  // Lazily construct the synth (client only).
  const getSynth = useCallback((): DuelSynth => {
    if (!synthRef.current) synthRef.current = new DuelSynth();
    return synthRef.current;
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      if (stopPlaybackRef.current) stopPlaybackRef.current();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // ── The driver: advances the demo self-play and the AI's turns ────────────
  useEffect(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);

    if (game.phase === "demo") {
      if (game.turn >= N) {
        // Loop the demo: pause on the finished board, then reset and replay.
        stepTimer.current = setTimeout(() => {
          setGame(freshGame(game.seed, "demo"));
        }, 2600);
      } else {
        stepTimer.current = setTimeout(() => {
          setGame((g) => {
            if (g.phase !== "demo" || g.turn >= N) return g;
            const prev = g.turn > 0 ? g.cp[g.turn - 1] : null;
            const choice = chooseAiMove(g.turn, prev, g.cf, AI_DEPTH);
            return applyMove(g, choice.pitch, choice.nodes);
          });
        }, 620);
      }
      return () => {
        if (stepTimer.current) clearTimeout(stepTimer.current);
      };
    }

    if (game.phase === "play" && game.turn < N && moverAt(game.turn) === "ai") {
      stepTimer.current = setTimeout(() => {
        setGame((g) => {
          if (g.phase !== "play" || g.turn >= N || moverAt(g.turn) !== "ai") {
            return g;
          }
          const prev = g.turn > 0 ? g.cp[g.turn - 1] : null;
          const choice = chooseAiMove(g.turn, prev, g.cf, AI_DEPTH);
          synthRef.current?.note(choice.pitch, "cp");
          synthRef.current?.note(g.cf[g.turn], "cf");
          return applyMove(g, choice.pitch, choice.nodes);
        });
      }, 650);
    }

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
  }, [game]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const begin = useCallback(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    const synth = getSynth();
    const ok = synth.ensure();
    setAudioBlocked(!ok);
    setPlayPos(null);
    setHover(null);
    setGame((g) => freshGame(g.seed, "play"));
  }, [getSynth]);

  const newDuel = useCallback(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    if (stopPlaybackRef.current) stopPlaybackRef.current();
    setPlayPos(null);
    setHover(null);
    setGame((g) => freshGame((g.seed + 1) >>> 0, "play"));
  }, []);

  const placePlayerNote = useCallback(
    (midi: number) => {
      setGame((g) => {
        if (g.phase !== "play" || g.turn >= N || moverAt(g.turn) !== "you") {
          return g;
        }
        synthRef.current?.note(midi, "cp");
        synthRef.current?.note(g.cf[g.turn], "cf");
        return applyMove(g, midi, 0);
      });
      setHover(null);
    },
    [],
  );

  const playDuel = useCallback(() => {
    const synth = getSynth();
    if (!synth.ensure()) {
      setAudioBlocked(true);
      return;
    }
    if (stopPlaybackRef.current) stopPlaybackRef.current();
    setPlayPos(0);
    stopPlaybackRef.current = synth.playSequence(
      game.cf,
      game.cp,
      BPM,
      (pos) => setPlayPos(pos),
      () => {
        setPlayPos(null);
        stopPlaybackRef.current = null;
      },
    );
  }, [game.cf, game.cp, getSynth]);

  // ── Derived readouts ──────────────────────────────────────────────────────
  const youScore = useMemo(
    () => game.moves.filter((m) => m.by === "you").reduce((s, m) => s + m.points, 0),
    [game.moves],
  );
  const aiScore = useMemo(
    () => game.moves.filter((m) => m.by === "ai").reduce((s, m) => s + m.points, 0),
    [game.moves],
  );
  const lastMove = game.moves[game.moves.length - 1] ?? null;

  const verdict = useMemo(() => {
    if (game.phase !== "done") return null;
    const diff = youScore - aiScore;
    const yours = game.moves.filter((m) => m.by === "you");
    const best = yours.reduce<Move | null>(
      (b, m) => (b === null || m.points > b.points ? m : b),
      null,
    );
    const bestDesc = best
      ? `${best.reasons[0]?.replace(/^[+−-]\d+\s*/, "") || "your opening"} on beat ${best.beat + 1}`
      : "your opening";
    if (diff > 0) return `You won by ${diff} — your best move was the ${bestDesc}.`;
    if (diff < 0) return `The AI won by ${-diff} — it out-searched you. Best of yours: the ${bestDesc}.`;
    return `Dead even — a ${youScore}-all draw. Best of yours: the ${bestDesc}.`;
  }, [game.phase, game.moves, youScore, aiScore]);

  const yourTurn =
    game.phase === "play" && game.turn < N && moverAt(game.turn) === "you";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-[calc(100vh-3rem)] w-full bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Prototype 2502 · counterpoint as strategy
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Counterpoint Duel
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
            The lower voice is fixed. You and a look-ahead AI take turns adding
            notes to the line above it — each note scored live by Fux&apos;s
            1725 counterpoint rules. Higher total wins. The AI runs a real
            game-tree search, so it plays the note that leaves you the worst
            reply.
          </p>
        </header>

        {/* ── Scoreboard ── */}
        <div className="mb-4 flex flex-wrap items-stretch gap-3">
          <ScorePill label="You" score={youScore} active={yourTurn} accent={VIOLET[400]} />
          <ScorePill
            label={`AI · ${AI_DEPTH}-ply`}
            score={aiScore}
            active={game.phase === "play" && !yourTurn && game.turn < N}
            accent={MAGENTA}
          />
          <div className="flex min-h-[44px] flex-1 items-center rounded-md border border-border bg-background/60 px-4">
            <span className="font-mono text-xs text-muted-foreground">
              {game.phase === "demo" && "self-play demo — press Begin to take over"}
              {game.phase === "play" &&
                (yourTurn
                  ? `your move · beat ${game.turn + 1} of ${N}`
                  : `AI thinking · beat ${game.turn + 1} of ${N}`)}
              {game.phase === "done" && `${game.nodes.toLocaleString()} nodes searched`}
            </span>
          </div>
        </div>

        {/* ── Board ── */}
        <div className="overflow-x-auto rounded-lg border border-border bg-[#050509] p-3">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            style={{ maxWidth: SVG_W, display: "block", margin: "0 auto" }}
            role="img"
            aria-label="Counterpoint staff grid"
          >
            {drawBoard({
              game,
              hover,
              playPos,
              yourTurn,
              onHover: setHover,
              onPlace: placePlayerNote,
            })}
          </svg>
        </div>

        {/* ── Controls ── */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {game.phase === "demo" ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin duel
            </button>
          ) : (
            <button
              onClick={newDuel}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              New duel
            </button>
          )}
          <button
            onClick={playDuel}
            disabled={game.phase === "demo" || game.moves.length === 0}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playPos !== null ? "Playing…" : "Play the duel"}
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          {audioBlocked && (
            <span className="text-sm text-destructive">
              Audio unavailable — the game still plays silently.
            </span>
          )}
        </div>

        {/* ── Move readout + verdict ── */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Last move
            </p>
            {lastMove ? (
              <div>
                <p className="text-base text-foreground">
                  {lastMove.by === "you" ? "You" : "AI"} played{" "}
                  {noteName(lastMove.pitch)} on beat {lastMove.beat + 1}{" "}
                  <span
                    className="font-mono text-sm"
                    style={{
                      color: lastMove.points >= 0 ? VIOLET[300] : "var(--destructive)",
                    }}
                  >
                    ({lastMove.points >= 0 ? "+" : ""}
                    {lastMove.points})
                  </span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {lastMove.reasons.map((r, i) => (
                    <li key={i} className="font-mono text-xs text-muted-foreground">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No moves yet. In the demo above, watch the score tick as the two
                sides trade notes.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Verdict
            </p>
            {verdict ? (
              <p className="text-base leading-relaxed text-foreground">{verdict}</p>
            ) : hover && yourTurn ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {noteName(hover.midi)} here would score{" "}
                <span className="text-foreground">
                  {hover.preview.points >= 0 ? "+" : ""}
                  {hover.preview.points}
                </span>{" "}
                — {hover.preview.reasons.join(", ")}.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Hover a cell to preview its score, then click to place. Fill all{" "}
                {N} beats to see who won.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Design-notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Counterpoint Duel — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                counterpoint were a turn-based strategy game you play against an
                AI that actually thinks ahead?
              </p>
              <p>
                A fixed cantus firmus is given. You place even beats, the AI odd
                beats, filling the upper voice left to right. Each note is scored
                by first-species rules from Fux&apos;s{" "}
                <span className="text-foreground">Gradus ad Parnassum</span>{" "}
                (1725): consonant vertical intervals reward, dissonances and
                parallel fifths/octaves are penalised, contrary and stepwise
                motion earn small bonuses, and the line must open and close on a
                perfect consonance.
              </p>
              <p>
                The AI is a genuine{" "}
                <span className="text-foreground">negamax</span> game-tree search
                ({AI_DEPTH}-ply) — the sign-flipped minimax of Shannon&apos;s
                1950 chess paper. It does not grab the locally tastiest note; it
                plays the note that leaves your best reply as weak as possible.
                The node count under the scoreboard is the tree it really walked.
              </p>
              <p>
                No <span className="text-foreground">AudioContext</span>? The
                board still plays silently with a notice. Everything is
                deterministic — a seeded mulberry32 varies the cantus firmus, so
                the auto-demo on load replays exactly.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Scoreboard pill ─────────────────────────────────────────────────────────
function ScorePill({
  label,
  score,
  active,
  accent,
}: {
  label: string;
  score: number;
  active: boolean;
  accent: string;
}) {
  return (
    <div
      className="flex min-h-[44px] items-center gap-3 rounded-md border bg-background/60 px-4"
      style={{ borderColor: active ? accent : "var(--border)" }}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: accent, opacity: active ? 1 : 0.5 }}
      />
      <span className="text-sm text-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">{score}</span>
    </div>
  );
}

// ── Board drawing (SVG) ─────────────────────────────────────────────────────
interface DrawArgs {
  game: Game;
  hover: Hover | null;
  playPos: number | null;
  yourTurn: boolean;
  onHover: (h: Hover | null) => void;
  onPlace: (midi: number) => void;
}

function drawBoard({ game, hover, playPos, yourTurn, onHover, onPlace }: DrawArgs) {
  const els: React.ReactNode[] = [];
  const activeBeat = game.turn < N ? game.turn : -1;

  // Current-beat column highlight.
  if (yourTurn && activeBeat >= 0) {
    els.push(
      <rect
        key="col"
        x={colX(activeBeat)}
        y={TOP_PAD}
        width={COL_W}
        height={UPPER_H}
        fill={VIOLET[500]}
        opacity={0.1}
      />,
    );
  }

  // Row grid lines + pitch labels.
  for (let r = 0; r < ROWS; r++) {
    const y = rowCY(r);
    els.push(
      <line
        key={`h${r}`}
        x1={LEFT_PAD}
        y1={y}
        x2={LEFT_PAD + N * COL_W}
        y2={y}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
      />,
    );
    els.push(
      <text
        key={`hl${r}`}
        x={LEFT_PAD - 8}
        y={y + 3}
        textAnchor="end"
        fontSize={10}
        fontFamily="monospace"
        fill={NEUTRAL[600]}
      >
        {noteName(CANDIDATES[r])}
      </text>,
    );
  }

  // Beat column separators + numbers.
  for (let b = 0; b <= N; b++) {
    els.push(
      <line
        key={`v${b}`}
        x1={colX(b)}
        y1={TOP_PAD}
        x2={colX(b)}
        y2={TOP_PAD + UPPER_H}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
      />,
    );
    if (b < N) {
      els.push(
        <text
          key={`bn${b}`}
          x={cellCX(b)}
          y={TOP_PAD - 10}
          textAnchor="middle"
          fontSize={11}
          fontFamily="monospace"
          fill={b === activeBeat ? VIOLET[300] : NEUTRAL[600]}
        >
          {b + 1}
        </text>,
      );
    }
  }

  // Interactive cells for the player's current column.
  if (yourTurn && activeBeat >= 0) {
    for (let r = 0; r < ROWS; r++) {
      const midi = CANDIDATES[r];
      const isHover = hover?.beat === activeBeat && hover?.midi === midi;
      els.push(
        <rect
          key={`cell${r}`}
          x={colX(activeBeat) + 2}
          y={rowCY(r) - ROW_H / 2 + 2}
          width={COL_W - 4}
          height={ROW_H - 4}
          rx={4}
          fill={isHover ? VIOLET[500] : "transparent"}
          fillOpacity={isHover ? 0.28 : 1}
          stroke={isHover ? VIOLET[300] : "transparent"}
          strokeWidth={1}
          style={{ cursor: "pointer" }}
          onMouseEnter={() =>
            onHover({
              beat: activeBeat,
              midi,
              preview: scoreMove(
                activeBeat,
                midi,
                activeBeat > 0 ? game.cp[activeBeat - 1] : null,
                game.cf,
              ),
            })
          }
          onMouseLeave={() => onHover(null)}
          onClick={() => onPlace(midi)}
        />,
      );
    }
  }

  // Placed counterpoint notes.
  game.cp.forEach((midi, b) => {
    if (midi === null) return;
    const r = rowOf(midi);
    if (r < 0) return;
    const by = moverAt(b);
    const fill = by === "you" ? VIOLET[400] : MAGENTA;
    els.push(
      <g key={`note${b}`}>
        <rect
          x={colX(b) + 6}
          y={rowCY(r) - ROW_H / 2 + 4}
          width={COL_W - 12}
          height={ROW_H - 8}
          rx={5}
          fill={fill}
        />
        <text
          x={cellCX(b)}
          y={rowCY(r) + 3}
          textAnchor="middle"
          fontSize={10}
          fontFamily="monospace"
          fill={ART_BLACK}
        >
          {noteName(midi)}
        </text>
      </g>,
    );
  });

  // Playhead.
  if (playPos !== null) {
    const x = LEFT_PAD + Math.min(playPos, N) * COL_W;
    els.push(
      <line
        key="playhead"
        x1={x}
        y1={TOP_PAD - 4}
        x2={x}
        y2={LANE_TOP + LANE_H}
        stroke={VIOLET[100]}
        strokeWidth={2}
        opacity={0.85}
      />,
    );
  }

  // Cantus-firmus lane label.
  els.push(
    <text
      key="cflabel"
      x={LEFT_PAD - 8}
      y={LANE_TOP + LANE_H / 2}
      textAnchor="end"
      fontSize={9}
      fontFamily="monospace"
      fill={NEUTRAL[600]}
    >
      cantus
    </text>,
  );

  // Cantus-firmus contour.
  const pts = game.cf.map((p, b) => `${cellCX(b)},${cfY(p)}`).join(" ");
  els.push(
    <polyline
      key="cfline"
      points={pts}
      fill="none"
      stroke={INDIGO}
      strokeWidth={1.5}
      opacity={0.5}
    />,
  );

  // Cantus-firmus noteheads.
  game.cf.forEach((p, b) => {
    const sounded = b < game.turn || game.phase === "done" || playPos !== null;
    els.push(
      <g key={`cf${b}`}>
        <circle
          cx={cellCX(b)}
          cy={cfY(p)}
          r={9}
          fill={sounded ? INDIGO : NEUTRAL[200]}
          stroke={INDIGO}
          strokeWidth={1.5}
        />
        <text
          x={cellCX(b)}
          y={cfY(p) + 3}
          textAnchor="middle"
          fontSize={9}
          fontFamily="monospace"
          fill={sounded ? ART_BLACK : NEUTRAL[600]}
        >
          {noteName(p).replace(/\d/, "")}
        </text>
      </g>,
    );
  });

  return els;
}
