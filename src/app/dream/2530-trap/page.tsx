"use client";

// ════════════════════════════════════════════════════════════════════════════
// Trap (2530) — "What if an AI musician were trying to WIN — playing a phrase
// ahead to lead the shared melody into a harmonic trap you can't resolve — and
// you could see the trap coming and try to escape it?"
//
// A zero-sum tension tug-of-war. You and a planning AI alternately extend ONE
// shared chromatic melodic line. The AI runs a real alpha–beta minimax search
// (planner.ts, after Shannon 1950) whose objective is to MAXIMISE the tension
// you cannot resolve; you try to snap the line back to consonance. Because the
// AI plans a phrase ahead, it REVEALS the trap it is setting — its planned next
// note is drawn as a dim "threat" on the line a beat before it plays.
//
// Deterministic (mulberry32(0x2530)); an auto-demo self-plays a full round on
// load so a silent glance shows the whole idea. Audio starts on first gesture.
// ════════════════════════════════════════════════════════════════════════════

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CANDIDATES,
  ECHO,
  HIGH,
  RESOLVE,
  STRAND,
  mulberry32,
  noteName,
  noteTension,
  rankReplies,
} from "./tension";
import { planTrap, type CandidateEval } from "./planner";
import { TrapSynth, type Voice } from "./synth";
import { VIOLET, INDIGO, MAGENTA, NEUTRAL, ART_BLACK } from "../_shared/palette";

// ── Game model ──────────────────────────────────────────────────────────────
type Phase = "demo" | "play" | "done";
type Mover = "ai" | "you";
type Outcome = "set" | "resolved" | "stranded" | "held";

interface Move {
  beat: number;
  midi: number;
  by: Voice;
  tension: number;
  outcome: Outcome;
}

interface Game {
  phase: Phase;
  notes: Move[];
  turnBeat: number;
  youScore: number;
  aiScore: number;
  meter: number;
  nodes: number;
  planValue: number;
  plan: { pv: number[]; fromBeat: number } | null;
  evals: CandidateEval[];
  demoMistakes: number[];
}

/** The rolling window the next mover must answer: the last ECHO pitches. */
function echoOf(notes: Move[]): number[] {
  return notes.slice(-ECHO).map((m) => m.midi);
}

const SEED = 0x2530;
const END_BEAT = 11; // beats 0..11 → a 12-note line
const PLAN_DEPTH = 3; // plies searched below the AI's committed note (a phrase ahead)
const SEED_NOTES = [65, 67]; // F4, G4 — a calm two-note opening
const BPM = 108;

function moverAt(beat: number): Mover {
  return beat % 2 === 0 ? "ai" : "you";
}

function freshGame(phase: Phase): Game {
  const rng = mulberry32(SEED);
  // The scripted demo player misplays on the tenser draws, so the round shows
  // both the AI stranding the player and the player escaping — deterministic.
  const demoMistakes: number[] = [];
  for (const b of [3, 5, 7, 9, 11]) if (rng() > 0.6) demoMistakes.push(b);
  const notes: Move[] = SEED_NOTES.map((midi, beat) => ({
    beat,
    midi,
    by: "seed" as Voice,
    tension: 0,
    outcome: "held" as Outcome,
  }));
  return {
    phase,
    notes,
    turnBeat: 2,
    youScore: 0,
    aiScore: 0,
    meter: 0,
    nodes: 0,
    planValue: 0,
    plan: null,
    evals: [],
    demoMistakes,
  };
}

// The AI's turn: run the planner, commit its note, store the principal variation
// as the revealed threat for the player's next turn.
function applyAiMove(g: Game): Game {
  const beat = g.turnBeat;
  const echo = echoOf(g.notes);
  const plan = planTrap(beat, echo, PLAN_DEPTH, END_BEAT);
  const tension = noteTension(plan.pitch, echo).total;
  const turnBeat = beat + 1;
  const move: Move = { beat, midi: plan.pitch, by: "ai", tension, outcome: "set" };
  return {
    ...g,
    notes: [...g.notes, move],
    turnBeat,
    meter: tension,
    nodes: plan.nodes,
    planValue: plan.value,
    plan: { pv: plan.pv, fromBeat: beat },
    evals: plan.evals.slice(0, 4),
    phase: turnBeat > END_BEAT ? "done" : g.phase,
  };
}

// The player's turn: score the tug-of-war and consume the threat.
function applyPlayerMove(g: Game, midi: number): Game {
  const beat = g.turnBeat;
  const echo = echoOf(g.notes);
  const tension = noteTension(midi, echo).total;
  let outcome: Outcome = "held";
  let youScore = g.youScore;
  let aiScore = g.aiScore;
  if (tension <= RESOLVE) {
    outcome = "resolved";
    youScore += 1;
  } else if (tension >= STRAND) {
    outcome = "stranded";
    aiScore += 1;
  }
  const turnBeat = beat + 1;
  const move: Move = { beat, midi, by: "you", tension, outcome };
  return {
    ...g,
    notes: [...g.notes, move],
    turnBeat,
    meter: tension,
    youScore,
    aiScore,
    plan: null,
    phase: turnBeat > END_BEAT ? "done" : g.phase,
  };
}

// Scripted opponent for the auto-demo: usually plays the calmest escape, but on
// seeded "mistake" beats grabs a tenser reply so the AI's trap actually springs.
function scriptReply(g: Game): number {
  const ranked = rankReplies(echoOf(g.notes));
  const mistake = g.demoMistakes.includes(g.turnBeat);
  const idx = mistake ? Math.min(ranked.length - 1, 4) : 0;
  return ranked[idx].pitch;
}

// ── Keyboard control surface (chromatic, C4..C5) ────────────────────────────
const KEYS: { key: string; midi: number }[] = [
  { key: "a", midi: 60 },
  { key: "w", midi: 61 },
  { key: "s", midi: 62 },
  { key: "e", midi: 63 },
  { key: "d", midi: 64 },
  { key: "f", midi: 65 },
  { key: "t", midi: 66 },
  { key: "g", midi: 67 },
  { key: "y", midi: 68 },
  { key: "u", midi: 70 },
  { key: "h", midi: 69 },
  { key: "j", midi: 71 },
  { key: "k", midi: 72 },
];

// ── SVG geometry ────────────────────────────────────────────────────────────
const ROWS = CANDIDATES.length; // 13
const ROW_H = 22;
const COLS = 12;
const COL_W = 56;
const LEFT_PAD = 44;
const TOP_PAD = 26;
const ROLL_H = ROWS * ROW_H;
const SVG_W = LEFT_PAD + COLS * COL_W + 14;
const SVG_H = TOP_PAD + ROLL_H + 16;

const colX = (b: number) => LEFT_PAD + b * COL_W;
const cellCX = (b: number) => colX(b) + COL_W / 2;
const rowOf = (midi: number) => HIGH - midi;
const rowY = (r: number) => TOP_PAD + r * ROW_H + ROW_H / 2;
const pitchY = (midi: number) => rowY(rowOf(midi));

// Meter geometry (its own SVG).
const MBAR = 680;
const MPAD = 6;
const MW = MBAR + MPAD * 2;
const MH = 58;
const MY = 16;
const MBH = 20;
const meterX = (t: number) => MPAD + MBAR * Math.max(0, Math.min(1, t));

// ── Art-layer colour ramp: calm violet → magenta → hot (danger) ─────────────
function hexInterp(a: string, b: string, f: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
const HOT = "#e0484d";
function dangerColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5
    ? hexInterp(VIOLET[500], MAGENTA, x / 0.5)
    : hexInterp(MAGENTA, HOT, (x - 0.5) / 0.5);
}

interface Hover {
  midi: number;
  tension: number;
  outcome: Outcome;
}

export default function TrapPage() {
  const synthRef = useRef<TrapSynth | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);

  // Meter animation refs (DOM-driven, no per-frame React re-render).
  const targetRef = useRef(0);
  const meterFillRef = useRef<SVGRectElement | null>(null);
  const needleRef = useRef<SVGLineElement | null>(null);
  const pctRef = useRef<SVGTextElement | null>(null);

  const [game, setGame] = useState<Game>(() => freshGame("demo"));
  const [hover, setHover] = useState<Hover | null>(null);
  const [playPos, setPlayPos] = useState<number | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const getSynth = useCallback((): TrapSynth => {
    if (!synthRef.current) synthRef.current = new TrapSynth();
    return synthRef.current;
  }, []);

  // Full teardown.
  useEffect(() => {
    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
      if (stopPlaybackRef.current) stopPlaybackRef.current();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // Meter easing loop — eases the displayed tension toward the target and writes
  // straight to the SVG. Ease rate keeps any luminance change well under 3 Hz.
  useEffect(() => {
    let raf = 0;
    let cur = 0;
    const apply = (v: number) => {
      const col = dangerColor(v);
      if (meterFillRef.current) {
        meterFillRef.current.setAttribute("width", String(MBAR * v));
        meterFillRef.current.setAttribute("fill", col);
      }
      if (needleRef.current) {
        const x = meterX(v);
        needleRef.current.setAttribute("x1", String(x));
        needleRef.current.setAttribute("x2", String(x));
      }
      if (pctRef.current) {
        pctRef.current.textContent = `${Math.round(v * 100)}`;
        pctRef.current.setAttribute("x", String(Math.min(MW - 4, meterX(v) + 6)));
      }
    };
    const loop = () => {
      const target = targetRef.current;
      cur += (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.001) cur = target;
      apply(cur);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the meter target in sync with the game.
  useEffect(() => {
    targetRef.current = game.meter;
  }, [game.meter]);

  // Driver: advances the demo self-play and the AI's turns during real play.
  useEffect(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);

    if (game.phase === "demo") {
      if (game.turnBeat > END_BEAT) {
        stepTimer.current = setTimeout(() => setGame(freshGame("demo")), 2800);
      } else {
        stepTimer.current = setTimeout(() => {
          setGame((g) => {
            if (g.phase !== "demo" || g.turnBeat > END_BEAT) return g;
            return moverAt(g.turnBeat) === "ai"
              ? applyAiMove(g)
              : applyPlayerMove(g, scriptReply(g));
          });
        }, 820);
      }
      return () => {
        if (stepTimer.current) clearTimeout(stepTimer.current);
      };
    }

    if (
      game.phase === "play" &&
      game.turnBeat <= END_BEAT &&
      moverAt(game.turnBeat) === "ai"
    ) {
      stepTimer.current = setTimeout(() => {
        setGame((g) => {
          if (
            g.phase !== "play" ||
            g.turnBeat > END_BEAT ||
            moverAt(g.turnBeat) !== "ai"
          ) {
            return g;
          }
          const ng = applyAiMove(g);
          const played = ng.notes[ng.notes.length - 1];
          const prev =
            ng.notes.length >= 2 ? ng.notes[ng.notes.length - 2].midi : null;
          synthRef.current?.strike(played.midi, prev, "ai");
          return ng;
        });
      }, 760);
    }

    return () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    };
  }, [game]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const yourTurn =
    game.phase === "play" &&
    game.turnBeat <= END_BEAT &&
    moverAt(game.turnBeat) === "you";

  const placePlayerNote = useCallback((midi: number) => {
    setGame((g) => {
      if (
        g.phase !== "play" ||
        g.turnBeat > END_BEAT ||
        moverAt(g.turnBeat) !== "you"
      ) {
        return g;
      }
      const prev = g.notes[g.notes.length - 1].midi;
      synthRef.current?.strike(midi, prev, "you");
      return applyPlayerMove(g, midi);
    });
    setHover(null);
  }, []);

  const begin = useCallback(() => {
    if (stepTimer.current) clearTimeout(stepTimer.current);
    if (stopPlaybackRef.current) stopPlaybackRef.current();
    const ok = getSynth().ensure();
    setAudioBlocked(!ok);
    setHover(null);
    setPlayPos(null);
    setGame(freshGame("play"));
  }, [getSynth]);

  const playLine = useCallback(() => {
    const synth = getSynth();
    if (!synth.ensure()) {
      setAudioBlocked(true);
      return;
    }
    if (stopPlaybackRef.current) stopPlaybackRef.current();
    setPlayPos(0);
    const seq = game.notes.map((m) => ({ midi: m.midi, by: m.by }));
    stopPlaybackRef.current = synth.playLine(
      seq,
      BPM,
      (pos) => setPlayPos(pos),
      () => {
        setPlayPos(null);
        stopPlaybackRef.current = null;
      },
    );
  }, [game.notes, getSynth]);

  // Keyboard control surface, live only on the player's turn.
  useEffect(() => {
    if (!yourTurn || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const found = KEYS.find((x) => x.key === k);
      if (found) {
        e.preventDefault();
        placePlayerNote(found.midi);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [yourTurn, placePlayerNote]);

  // ── Derived readouts ──────────────────────────────────────────────────────
  const lastMove = game.notes[game.notes.length - 1] ?? null;
  const echo = useMemo(() => echoOf(game.notes), [game.notes]);

  const bestEscape = useMemo(() => {
    if (!yourTurn) return null;
    return rankReplies(echo)[0];
  }, [yourTurn, echo]);

  const verdict = useMemo(() => {
    if (game.phase !== "done") return null;
    const d = game.youScore - game.aiScore;
    if (d > 0)
      return `You win ${game.youScore}–${game.aiScore}. You out-resolved the trap — every corner it built, you found the calm exit.`;
    if (d < 0)
      return `The AI wins ${game.aiScore}–${game.youScore}. It planned ahead and stranded you in dissonance you couldn't answer.`;
    return `Dead even, ${game.youScore}–${game.aiScore}. You matched its planning note for note.`;
  }, [game.phase, game.youScore, game.aiScore]);

  const previewOutcome = (t: number): Outcome =>
    t <= RESOLVE ? "resolved" : t >= STRAND ? "stranded" : "held";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-[calc(100vh-3rem)] w-full bg-background px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Prototype 2530 · adversarial tension
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Trap
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
            You and a planning AI take turns extending one shared melody, note by
            chromatic note. The AI is trying to <span className="text-foreground">win</span>
            : it searches a phrase ahead to steer the line into a corner where
            your next move is forced to sound bad. It{" "}
            <span className="text-foreground">reveals</span> the trap it is
            setting — dashed on the line below — so you get one beat to escape.
            Resolve the tension and you score; get stranded in it and the AI
            does.
          </p>
        </header>

        {/* ── Scoreboard ── */}
        <div className="mb-4 flex flex-wrap items-stretch gap-3">
          <ScorePill
            label="You · resolve"
            score={game.youScore}
            active={yourTurn}
            accent={VIOLET[400]}
          />
          <ScorePill
            label={`AI · ${PLAN_DEPTH + 1}-ply plan`}
            score={game.aiScore}
            active={
              game.phase === "play" && !yourTurn && game.turnBeat <= END_BEAT
            }
            accent={MAGENTA}
          />
          <div className="flex min-h-[44px] flex-1 items-center rounded-md border border-border bg-background/60 px-4">
            <span className="font-mono text-xs text-muted-foreground">
              {game.phase === "demo" && "self-play demo — press Play to take over"}
              {game.phase === "play" &&
                (yourTurn
                  ? `your move · beat ${game.turnBeat + 1} of ${COLS}`
                  : `AI planning · beat ${game.turnBeat + 1} of ${COLS}`)}
              {game.phase === "done" &&
                `${game.nodes.toLocaleString()} nodes in its last search`}
            </span>
          </div>
        </div>

        {/* ── Piano roll ── */}
        <div className="overflow-x-auto rounded-lg border border-border bg-[#050509] p-3">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            style={{ maxWidth: SVG_W, display: "block", margin: "0 auto" }}
            role="img"
            aria-label="Shared chromatic melody as a piano roll"
          >
            {drawRoll({
              game,
              hover,
              yourTurn,
              playPos,
              onHover: setHover,
              onPlace: placePlayerNote,
            })}
          </svg>

          {/* ── Tension meter ── */}
          <div className="mt-1 px-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Tension
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                AI pulls up · you pull down
              </span>
            </div>
            <svg
              viewBox={`0 0 ${MW} ${MH}`}
              width="100%"
              style={{ maxWidth: MW, display: "block" }}
              role="img"
              aria-label="Tension meter"
            >
              {/* zones */}
              <rect x={MPAD} y={MY} width={MBAR} height={MBH} rx={4} fill={NEUTRAL[200]} />
              <rect
                x={MPAD}
                y={MY}
                width={MBAR * RESOLVE}
                height={MBH}
                fill={VIOLET[900]}
                opacity={0.7}
              />
              <rect
                x={meterX(STRAND)}
                y={MY}
                width={MBAR * (1 - STRAND)}
                height={MBH}
                fill={HOT}
                opacity={0.14}
              />
              {/* live fill */}
              <rect
                ref={meterFillRef}
                x={MPAD}
                y={MY}
                width={0}
                height={MBH}
                rx={4}
                fill={VIOLET[500]}
              />
              {/* threshold ticks */}
              <line
                x1={meterX(RESOLVE)}
                y1={MY - 3}
                x2={meterX(RESOLVE)}
                y2={MY + MBH + 3}
                stroke={VIOLET[300]}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              <line
                x1={meterX(STRAND)}
                y1={MY - 3}
                x2={meterX(STRAND)}
                y2={MY + MBH + 3}
                stroke={HOT}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
              {/* needle */}
              <line
                ref={needleRef}
                x1={MPAD}
                y1={MY - 4}
                x2={MPAD}
                y2={MY + MBH + 4}
                stroke={NEUTRAL[1000]}
                strokeWidth={2}
              />
              <text
                ref={pctRef}
                x={MPAD}
                y={MY + MBH + 15}
                fontSize={11}
                fontFamily="monospace"
                fill={NEUTRAL[800]}
              >
                0
              </text>
              <text
                x={meterX(RESOLVE)}
                y={MY - 6}
                textAnchor="middle"
                fontSize={9}
                fontFamily="monospace"
                fill={VIOLET[300]}
              >
                resolve
              </text>
              <text
                x={meterX(STRAND)}
                y={MY - 6}
                textAnchor="middle"
                fontSize={9}
                fontFamily="monospace"
                fill={HOT}
              >
                stranded
              </text>
            </svg>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {game.phase === "demo" ? "Play — take over" : "New round"}
          </button>
          <button
            onClick={playLine}
            disabled={game.notes.length <= SEED_NOTES.length}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {playPos !== null ? "Playing…" : "Play the line"}
          </button>
          {audioBlocked && (
            <span className="text-sm text-destructive">
              Audio unavailable — the game still plays silently.
            </span>
          )}
        </div>

        {/* ── Keyboard control surface ── */}
        <div className="mt-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Your reply — press a key or click
          </p>
          <div className="flex flex-wrap gap-1.5">
            {KEYS.map(({ key, midi }) => {
              const sharp = noteName(midi).includes("#");
              const t = yourTurn ? noteTension(midi, echo).total : 0;
              return (
                <button
                  key={key}
                  disabled={!yourTurn}
                  onMouseEnter={() =>
                    yourTurn &&
                    setHover({
                      midi,
                      tension: t,
                      outcome: previewOutcome(t),
                    })
                  }
                  onMouseLeave={() => setHover(null)}
                  onClick={() => placePlayerNote(midi)}
                  className="flex min-h-[44px] w-11 flex-col items-center justify-center rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    borderColor:
                      hover?.midi === midi && yourTurn
                        ? VIOLET[400]
                        : "var(--border)",
                    background: sharp
                      ? "var(--muted)"
                      : "var(--background)",
                  }}
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {key.toUpperCase()}
                  </span>
                  <span className="text-foreground">
                    {noteName(midi).replace(/\d/, "")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Trap / verdict readout ── */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              The AI&apos;s plan
            </p>
            {game.plan && game.plan.pv.length >= 3 && yourTurn ? (
              <p className="text-base leading-relaxed text-foreground">
                It played to corner you. Even your calmest reply here leaves
                tension at{" "}
                <span style={{ color: dangerColor(bestEscape?.tension ?? 0) }}>
                  {Math.round((bestEscape?.tension ?? 0) * 100)}%
                </span>
                . It plans{" "}
                <span className="font-mono" style={{ color: MAGENTA }}>
                  {noteName(game.plan.pv[2])}
                </span>{" "}
                at beat {game.plan.fromBeat + 3} to spring the trap —{" "}
                <span className="text-muted-foreground">
                  play a note that makes that answer no longer hurt.
                </span>
              </p>
            ) : game.evals.length > 0 ? (
              <div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Last search ranked its options by the tension your best reply
                  can be forced into ({game.nodes.toLocaleString()} nodes):
                </p>
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {game.evals.map((e) => (
                    <li
                      key={e.pitch}
                      className="font-mono text-xs text-muted-foreground"
                    >
                      {noteName(e.pitch)}{" "}
                      <span style={{ color: dangerColor(e.tension) }}>
                        {Math.round(e.tension * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Watch the self-play demo: the AI (magenta) builds tension and the
                scripted player (violet) tries to resolve it.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {verdict ? "Verdict" : "Last note"}
            </p>
            {verdict ? (
              <p className="text-base leading-relaxed text-foreground">
                {verdict}
              </p>
            ) : hover && yourTurn ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {noteName(hover.midi)} here →{" "}
                <span style={{ color: dangerColor(hover.tension) }}>
                  {Math.round(hover.tension * 100)}% tension
                </span>{" "}
                —{" "}
                <span className="text-foreground">
                  {hover.outcome === "resolved"
                    ? "resolves, you score"
                    : hover.outcome === "stranded"
                      ? "still stranded, the AI scores"
                      : "held, no score"}
                </span>
                .
              </p>
            ) : lastMove && lastMove.by !== "seed" ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {lastMove.by === "ai" ? "AI" : "You"} played{" "}
                {noteName(lastMove.midi)} on beat {lastMove.beat + 1} —{" "}
                <span style={{ color: dangerColor(lastMove.tension) }}>
                  {Math.round(lastMove.tension * 100)}% tension
                </span>
                {lastMove.outcome === "resolved" && " · resolved (+you)"}
                {lastMove.outcome === "stranded" && " · stranded (+AI)"}.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Hover a key to preview whether it resolves the line or leaves you
                stranded, then play it.
              </p>
            )}
          </div>
        </div>
      </div>
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
      <span className="font-mono text-lg tabular-nums text-foreground">
        {score}
      </span>
    </div>
  );
}

// ── Piano-roll drawing (SVG) ────────────────────────────────────────────────
interface DrawArgs {
  game: Game;
  hover: Hover | null;
  yourTurn: boolean;
  playPos: number | null;
  onHover: (h: Hover | null) => void;
  onPlace: (midi: number) => void;
}

function drawRoll({
  game,
  hover,
  yourTurn,
  playPos,
  onHover,
  onPlace,
}: DrawArgs): ReactNode {
  const els: ReactNode[] = [];
  const activeBeat =
    game.phase === "play" && game.turnBeat <= END_BEAT ? game.turnBeat : -1;
  const echo = echoOf(game.notes);

  // Active-column highlight for the player's turn.
  if (yourTurn && activeBeat >= 0) {
    els.push(
      <rect
        key="col"
        x={colX(activeBeat)}
        y={TOP_PAD}
        width={COL_W}
        height={ROLL_H}
        fill={VIOLET[500]}
        opacity={0.09}
      />,
    );
  }

  // Row grid + pitch labels.
  for (let r = 0; r < ROWS; r++) {
    const y = rowY(r);
    const midi = HIGH - r;
    els.push(
      <line
        key={`h${r}`}
        x1={LEFT_PAD}
        y1={y}
        x2={LEFT_PAD + COLS * COL_W}
        y2={y}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
      />,
      <text
        key={`hl${r}`}
        x={LEFT_PAD - 7}
        y={y + 3}
        textAnchor="end"
        fontSize={9}
        fontFamily="monospace"
        fill={noteName(midi).includes("#") ? NEUTRAL[400] : NEUTRAL[600]}
      >
        {noteName(midi)}
      </text>,
    );
  }

  // Beat separators + numbers.
  for (let b = 0; b <= COLS; b++) {
    els.push(
      <line
        key={`v${b}`}
        x1={colX(b)}
        y1={TOP_PAD}
        x2={colX(b)}
        y2={TOP_PAD + ROLL_H}
        stroke={NEUTRAL[200]}
        strokeWidth={1}
      />,
    );
    if (b < COLS) {
      els.push(
        <text
          key={`bn${b}`}
          x={cellCX(b)}
          y={TOP_PAD - 9}
          textAnchor="middle"
          fontSize={10}
          fontFamily="monospace"
          fill={b === activeBeat ? VIOLET[300] : NEUTRAL[600]}
        >
          {b + 1}
        </text>,
      );
    }
  }

  // Interactive cells in the player's active column.
  if (yourTurn && activeBeat >= 0) {
    for (let r = 0; r < ROWS; r++) {
      const midi = HIGH - r;
      const isHover = hover?.midi === midi;
      els.push(
        <rect
          key={`cell${r}`}
          x={colX(activeBeat) + 2}
          y={rowY(r) - ROW_H / 2 + 1}
          width={COL_W - 4}
          height={ROW_H - 2}
          rx={3}
          fill={isHover ? VIOLET[500] : "transparent"}
          fillOpacity={isHover ? 0.3 : 1}
          stroke={isHover ? VIOLET[300] : "transparent"}
          strokeWidth={1}
          style={{ cursor: "pointer" }}
          onMouseEnter={() => {
            const t = noteTension(midi, echo).total;
            onHover({
              midi,
              tension: t,
              outcome:
                t <= RESOLVE ? "resolved" : t >= STRAND ? "stranded" : "held",
            });
          }}
          onMouseLeave={() => onHover(null)}
          onClick={() => onPlace(midi)}
        />,
      );
    }
  }

  // Melodic contour through the placed notes.
  if (game.notes.length >= 2) {
    const pts = game.notes.map((m) => `${cellCX(m.beat)},${pitchY(m.midi)}`).join(" ");
    els.push(
      <polyline
        key="contour"
        points={pts}
        fill="none"
        stroke={INDIGO}
        strokeWidth={1.5}
        opacity={0.5}
      />,
    );
  }

  // The revealed threat: the AI's planned trap note, dashed, a beat ahead.
  // Shown whenever it is the human side's turn — including the auto-demo, so a
  // silent viewer still watches the trap form before the scripted reply.
  const revealSide =
    game.turnBeat <= END_BEAT && moverAt(game.turnBeat) === "you";
  if (game.plan && game.plan.pv.length >= 3 && revealSide) {
    const ghostBeat = game.plan.fromBeat + 1; // where the AI expects your reply
    const ghostMidi = game.plan.pv[1];
    const threatBeat = game.plan.fromBeat + 2; // the trap it plans to play
    const threatMidi = game.plan.pv[2];

    if (ghostBeat <= END_BEAT) {
      els.push(
        <circle
          key="ghost"
          cx={cellCX(ghostBeat)}
          cy={pitchY(ghostMidi)}
          r={7}
          fill="none"
          stroke={VIOLET[300]}
          strokeWidth={1}
          strokeDasharray="2 2"
          opacity={0.55}
        />,
      );
    }
    if (threatBeat <= END_BEAT) {
      const tx = cellCX(threatBeat);
      const ty = pitchY(threatMidi);
      els.push(
        <g key="threat">
          <line
            x1={cellCX(game.plan.fromBeat)}
            y1={pitchY(game.plan.pv[0])}
            x2={tx}
            y2={ty}
            stroke={MAGENTA}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
          />
          <circle
            cx={tx}
            cy={ty}
            r={9}
            fill={MAGENTA}
            fillOpacity={0.22}
            stroke={MAGENTA}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <text
            x={tx}
            y={ty - 13}
            textAnchor="middle"
            fontSize={9}
            fontFamily="monospace"
            fill={MAGENTA}
          >
            trap
          </text>
        </g>,
      );
    }
  }

  // Placed noteheads.
  game.notes.forEach((m) => {
    const cx = cellCX(m.beat);
    const cy = pitchY(m.midi);
    const fill =
      m.by === "ai" ? MAGENTA : m.by === "you" ? VIOLET[400] : NEUTRAL[600];
    const ring =
      m.outcome === "resolved"
        ? VIOLET[200]
        : m.outcome === "stranded"
          ? HOT
          : "none";
    els.push(
      <g key={`n${m.beat}`}>
        <circle cx={cx} cy={cy} r={9} fill={fill} />
        {ring !== "none" && (
          <circle
            cx={cx}
            cy={cy}
            r={11.5}
            fill="none"
            stroke={ring}
            strokeWidth={1.5}
          />
        )}
        <text
          x={cx}
          y={cy + 3}
          textAnchor="middle"
          fontSize={8}
          fontFamily="monospace"
          fill={ART_BLACK}
        >
          {noteName(m.midi).replace(/\d/, "")}
        </text>
      </g>,
    );
  });

  // Playhead.
  if (playPos !== null) {
    const x = LEFT_PAD + Math.min(playPos, COLS) * COL_W;
    els.push(
      <line
        key="playhead"
        x1={x}
        y1={TOP_PAD - 4}
        x2={x}
        y2={TOP_PAD + ROLL_H + 4}
        stroke={VIOLET[100]}
        strokeWidth={2}
        opacity={0.85}
      />,
    );
  }

  return els;
}
