"use client";

// Redlines — composing by EDITING a shared draft, not by playing notes.
//
// Inspired by *BeatEdit: Symbolic Music Generation as Explicit Editing*
// (arXiv:2607.11124, July 2026), which recasts music generation as producing
// new content by editing a draft rather than synthesizing from scratch. Here a
// human and a rule-based agent take turns applying discrete edit operations to
// one shared symbolic loop; the audible piece is the current draft and the
// score shows the running DIFF between the two composers' rewrites.

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createAudio, type AudioEngine } from "./audio";
import {
  agentEdit,
  deleteNote,
  degreeToMidi,
  DEG_MAX,
  insertNote,
  invertPhrase,
  makeSeed,
  mulberry32,
  nudgeNote,
  STEPS,
  BAR,
  stretchBar,
  transposeBar,
  type EditCtx,
  type EditResult,
  type Ghost,
  type Note,
  type Owner,
  type Rng,
} from "./model";

// ---- SVG art-layer palette (raw hex allowed only here) --------------------
const COL = {
  you: "#c4b5fd", // warm lavender — your material
  youEdge: "#a78bfa",
  agent: "#818cf8", // cooler periwinkle/indigo — the agent's material
  agentEdge: "#6366f1",
  seed: "#8b8b96", // neutral — the shared starting draft
  glow: "#ede9fe", // "just added" highlight ring
  ghost: "#6b7280", // struck-through removed pre-image
  grid: "#2a2540",
  gridTonic: "#3a3260",
  head: "#c4b5fd",
  select: "#f5f3ff",
} as const;

// ---- musical + timing constants -------------------------------------------
const BPM = 100;
const STEP_DUR = 60 / BPM / 4; // 16 steps as sixteenth notes -> ~2.4s loop
const ROWS = DEG_MAX + 1;
const CW = 40; // px per step in the SVG viewBox
const RH = 20; // px per pitch row
const W = STEPS * CW;
const H = ROWS * RH;

const HIGHLIGHT_MS = 1400; // how long a freshly-edited note glows
const GHOST_MS = 1500; // how long a removed note stays struck-through

const FIRST_DELAY = 600; // ms after Start before the scripted war begins
const ACTION_INTERVAL = 1200; // ms between scripted edit-war moves
const AGENT_IDLE = 4600; // ms between the agent's idle counter-edits after handoff
const SCRIPT_LEN = 12; // 6 of your moves, 6 agent counter-moves

interface Ledger {
  seq: number;
  by: Owner;
  op: string;
}

export default function RedlinesPage() {
  const engineRef = useRef<AudioEngine | null>(null);
  const rngRef = useRef<Rng | null>(null);

  // the shared draft + diff bookkeeping (all mutable, read during render)
  const notesRef = useRef<Note[]>([]);
  const ghostsRef = useRef<Ghost[]>([]);
  const ledgerRef = useRef<Ledger[]>([]);
  const idRef = useRef(0);
  const seqRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);

  // transport / scheduling clocks (performance.now based — no Date)
  const startRef = useRef(0);
  const lastStepRef = useRef(-1);
  const headRef = useRef(0);
  const rafRef = useRef(0);
  const autopilotRef = useRef(false);
  const scriptIdxRef = useRef(0);
  const nextActionAtRef = useRef(0);
  const nextAgentAtRef = useRef(0);
  const reducedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [selectedBar, setSelectedBar] = useState<"A" | "B">("A");
  const [hint, setHint] = useState<string | null>(null);
  const [, setTick] = useState(0); // frame pulse -> re-render from refs

  // ---- edit plumbing ------------------------------------------------------

  const makeCtx = useCallback(
    (by: Owner, now: number): EditCtx => ({
      by,
      now,
      alloc: () => ++idRef.current,
    }),
    [],
  );

  // Fold an edit result into the draft (updates notes, ghosts, ledger).
  const commit = useCallback((res: EditResult) => {
    if (res.removed.length === 0 && res.added.length === 0) return; // no-op edit
    if (res.removed.length) {
      ghostsRef.current = [...ghostsRef.current, ...res.removed];
    }
    notesRef.current = res.notes;
    seqRef.current += 1;
    ledgerRef.current = [
      { seq: seqRef.current, by: res.by, op: res.op },
      ...ledgerRef.current,
    ].slice(0, 24);
  }, []);

  const agentRespond = useCallback(
    (now: number) => {
      const rng = rngRef.current;
      if (!rng) return;
      commit(agentEdit(notesRef.current, rng, makeCtx("agent", now)));
    },
    [commit, makeCtx],
  );

  const highestNote = useCallback((): Note | null => {
    const ns = notesRef.current;
    if (ns.length === 0) return null;
    return ns.reduce((a, b) => (b.deg > a.deg ? b : a));
  }, []);

  const currentTargetId = useCallback((): number | null => {
    if (
      selectedIdRef.current != null &&
      notesRef.current.some((n) => n.id === selectedIdRef.current)
    ) {
      return selectedIdRef.current;
    }
    return highestNote()?.id ?? null;
  }, [highestNote]);

  // Hand control to the human: stop the script, prompt a quick agent reply.
  const takeOver = useCallback((now: number) => {
    if (autopilotRef.current) {
      autopilotRef.current = false;
      setAutopilot(false);
    }
    setHint("You're driving now — edit the draft; the agent will answer.");
    nextAgentAtRef.current = now + 800;
  }, []);

  // A user-initiated edit: commit it, play it once for feedback, cue the agent.
  const youButton = useCallback(
    (res: EditResult) => {
      const now = performance.now();
      commit(res);
      // instant tactile feedback for the notes you just added/changed
      for (const n of res.added) {
        engineRef.current?.play(degreeToMidi(n.deg), n.dur, STEP_DUR, "you");
      }
      takeOver(now);
    },
    [commit, takeOver],
  );

  // ---- the concrete edit operations exposed to the UI ---------------------

  const doTranspose = useCallback(
    (delta: number) => {
      const c = makeCtx("you", performance.now());
      youButton(transposeBar(notesRef.current, selectedBar, delta, c));
    },
    [makeCtx, selectedBar, youButton],
  );

  const doDelete = useCallback(() => {
    const id = currentTargetId();
    if (id == null) return;
    youButton(deleteNote(notesRef.current, id, makeCtx("you", performance.now())));
    selectedIdRef.current = null;
  }, [currentTargetId, makeCtx, youButton]);

  const doNudge = useCallback(
    (delta: number) => {
      const id = currentTargetId();
      if (id == null) return;
      youButton(nudgeNote(notesRef.current, id, delta, makeCtx("you", performance.now())));
    },
    [currentTargetId, makeCtx, youButton],
  );

  const doInvert = useCallback(() => {
    youButton(invertPhrase(notesRef.current, makeCtx("you", performance.now())));
  }, [makeCtx, youButton]);

  const doStretch = useCallback(() => {
    youButton(stretchBar(notesRef.current, selectedBar, 2, makeCtx("you", performance.now())));
  }, [makeCtx, selectedBar, youButton]);

  const doInsertGap = useCallback(() => {
    // insert a mid-register tone at the first free step of the selected bar
    const lo = selectedBar === "A" ? 0 : BAR;
    const hi = selectedBar === "A" ? BAR - 1 : STEPS - 1;
    const taken = new Set(notesRef.current.filter((n) => n.step >= lo && n.step <= hi).map((n) => n.step));
    let step = lo;
    for (let s = lo; s <= hi; s++) {
      if (!taken.has(s)) {
        step = s;
        break;
      }
    }
    youButton(insertNote(notesRef.current, step, 8, makeCtx("you", performance.now()), 2));
  }, [makeCtx, selectedBar, youButton]);

  // click on empty grid -> insert a note there; click a note -> select it
  const insertAtPoint = useCallback(
    (step: number, deg: number) => {
      youButton(insertNote(notesRef.current, step, deg, makeCtx("you", performance.now()), 2));
    },
    [makeCtx, youButton],
  );

  // ---- scripted opening edit-war ------------------------------------------

  const runScriptAction = useCallback(
    (i: number, now: number) => {
      const c = makeCtx("you", now);
      switch (i) {
        case 0:
          commit(transposeBar(notesRef.current, "A", 1, c));
          break;
        case 2:
          commit(insertNote(notesRef.current, 5, 12, c, 2));
          break;
        case 4:
          commit(invertPhrase(notesRef.current, c));
          break;
        case 6:
          commit(transposeBar(notesRef.current, "B", 1, c));
          break;
        case 8: {
          const t = highestNote();
          if (t) commit(nudgeNote(notesRef.current, t.id, 1, c));
          break;
        }
        case 10:
          commit(stretchBar(notesRef.current, "A", 2, c));
          break;
        default:
          agentRespond(now); // odd indices: the agent counter-edits
      }
    },
    [agentRespond, commit, highestNote, makeCtx],
  );

  // ---- transport frame ----------------------------------------------------

  const playStep = useCallback((stepIdx: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    for (const n of notesRef.current) {
      if (n.step === stepIdx) {
        eng.play(degreeToMidi(n.deg), n.dur, STEP_DUR, n.by);
      }
    }
  }, []);

  const frame = useCallback(() => {
    const now = performance.now();
    const total = (now - startRef.current) / 1000 / STEP_DUR;
    const head = ((total % STEPS) + STEPS) % STEPS;
    headRef.current = head;
    const stepIdx = Math.floor(head);

    if (stepIdx !== lastStepRef.current) {
      lastStepRef.current = stepIdx;
      playStep(stepIdx);
    }

    // scripted edit-war, then hand off to the live user
    if (autopilotRef.current) {
      if (now >= nextActionAtRef.current) {
        if (scriptIdxRef.current < SCRIPT_LEN) {
          runScriptAction(scriptIdxRef.current, now);
          scriptIdxRef.current += 1;
          nextActionAtRef.current = now + ACTION_INTERVAL;
        } else {
          autopilotRef.current = false;
          setAutopilot(false);
          setHint("You're driving now — edit the draft; the agent will answer.");
          nextAgentAtRef.current = now + AGENT_IDLE;
        }
      }
    } else if (now >= nextAgentAtRef.current) {
      // after handoff the agent keeps pursuing its own intention on a timer
      agentRespond(now);
      nextAgentAtRef.current = now + AGENT_IDLE;
    }

    // expire stale ghosts so the diff clears
    if (ghostsRef.current.length) {
      ghostsRef.current = ghostsRef.current.filter((g) => now - g.removedAt < GHOST_MS);
    }

    setTick((t) => (t + 1) & 0xffff);
    rafRef.current = requestAnimationFrame(frame);
  }, [agentRespond, playStep, runScriptAction]);

  // ---- lifecycle ----------------------------------------------------------

  const start = useCallback(async () => {
    if (started) return;
    reducedRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!engineRef.current) {
      try {
        engineRef.current = createAudio();
      } catch {
        engineRef.current = null;
      }
    }
    await engineRef.current?.resume();

    const now = performance.now();
    idRef.current = 0;
    seqRef.current = 0;
    selectedIdRef.current = null;
    notesRef.current = makeSeed(() => ++idRef.current, now);
    ghostsRef.current = [];
    ledgerRef.current = [];
    rngRef.current = mulberry32((now * 1000) >>> 0);

    startRef.current = now;
    lastStepRef.current = -1;
    scriptIdxRef.current = 0;
    autopilotRef.current = true;
    nextActionAtRef.current = now + FIRST_DELAY;
    nextAgentAtRef.current = now + FIRST_DELAY;

    setAutopilot(true);
    setHint(null);
    setStarted(true);
  }, [started]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // run the transport while started
  useEffect(() => {
    if (!started) return;
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, frame]);

  // keyboard edit operations
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const handled =
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === "Backspace" ||
        k === "Delete" ||
        k === "i" ||
        k === "n" ||
        k === "s";
      if (!handled) return;
      e.preventDefault();
      if (k === "ArrowUp") doTranspose(1);
      else if (k === "ArrowDown") doTranspose(-1);
      else if (k === "ArrowLeft") doNudge(-1);
      else if (k === "ArrowRight") doNudge(1);
      else if (k === "Backspace" || k === "Delete") doDelete();
      else if (k === "i") doInvert();
      else if (k === "n") doInsertGap();
      else if (k === "s") doStretch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, doTranspose, doNudge, doDelete, doInvert, doInsertGap, doStretch]);

  // teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ---- pointer -> grid cell (a click, never a drag) -----------------------
  const onScoreClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      const step = Math.max(0, Math.min(STEPS - 1, Math.floor(px / CW)));
      const deg = Math.max(0, Math.min(DEG_MAX, DEG_MAX - Math.floor(py / RH)));
      insertAtPoint(step, deg);
    },
    [insertAtPoint],
  );

  const onNoteClick = useCallback(
    (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      selectedIdRef.current = selectedIdRef.current === id ? null : id;
      setTick((t) => (t + 1) & 0xffff);
    },
    [],
  );

  // ---- render -------------------------------------------------------------
  const now = performance.now();
  const head = headRef.current;
  const notes = notesRef.current;
  const ghosts = ghostsRef.current;
  const ledger = ledgerRef.current;
  const selId = selectedIdRef.current;

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-background text-foreground">
      <header className="z-10 flex flex-col gap-2 px-5 pt-6 sm:px-8 sm:pt-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Redlines</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Two composers rewrite one shared loop. You don&apos;t play notes — you
          issue <span className="text-foreground">edit operations</span>, and a
          rule-based agent counter-edits with its own intention. What you hear is
          the running <span className="text-foreground">diff</span> between your
          rewrites.
        </p>
      </header>

      <section className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-8 lg:flex-row lg:items-start">
        {/* the score */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!started ? (
            <div className="flex min-h-[300px] flex-col items-start justify-center gap-4 rounded-lg border border-border bg-card/40 p-8">
              <p className="max-w-md text-base text-muted-foreground">
                Press <span className="text-foreground">Start</span>. A short
                diatonic seed loop begins, then a scripted{" "}
                <span className="text-foreground">edit-war</span> plays out on its
                own — you edit, the agent counters — so you can watch the piece
                rewrite itself. Then take over.
              </p>
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            </div>
          ) : (
            <>
              <Legend />
              <div className="overflow-x-auto rounded-lg border border-border bg-card/40 p-3">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${W} ${H}`}
                  width="100%"
                  onClick={onScoreClick}
                  role="img"
                  aria-label="Piano-roll score showing the diff between two composers"
                  style={{ display: "block", minWidth: 520, cursor: "crosshair" }}
                >
                  <Grid />
                  {/* selected-bar wash */}
                  <rect
                    x={(selectedBar === "A" ? 0 : BAR) * CW}
                    y={0}
                    width={BAR * CW}
                    height={H}
                    fill={COL.you}
                    opacity={0.05}
                  />

                  {/* removed pre-images — struck through */}
                  {ghosts.map((g) => (
                    <GhostRect key={`g${g.id}-${g.removedAt}`} g={g} />
                  ))}

                  {/* current draft notes */}
                  {notes.map((n) => (
                    <NoteRect
                      key={n.id}
                      n={n}
                      now={now}
                      selected={n.id === selId}
                      reduced={reducedRef.current}
                      onClick={onNoteClick}
                    />
                  ))}

                  {/* playhead */}
                  <line
                    x1={head * CW}
                    y1={0}
                    x2={head * CW}
                    y2={H}
                    stroke={COL.head}
                    strokeWidth={2}
                    opacity={0.85}
                  />
                </svg>
              </div>

              {hint && (
                <p className="text-sm text-muted-foreground">
                  <span className="text-primary">▶</span> {hint}
                </p>
              )}
            </>
          )}
        </div>

        {/* ledger + agent intention */}
        {started && (
          <aside className="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Agent intention
              </span>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pull the phrase{" "}
                <span className="text-foreground">downward toward a lower home</span>
                , thin dense passages, and reshape upward leaps into descents.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-4">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Edit ledger
              </span>
              <ul className="mt-2 flex flex-col gap-1">
                {ledger.length === 0 && (
                  <li className="text-sm text-muted-foreground">No edits yet.</li>
                )}
                {ledger.slice(0, 9).map((l) => (
                  <li
                    key={l.seq}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <OwnerDot by={l.by} />
                    <span className="font-mono text-xs text-muted-foreground/70">
                      {String(l.seq).padStart(2, "0")}
                    </span>
                    <span className="text-foreground">
                      {l.by === "you" ? "you" : l.by === "agent" ? "agent" : "seed"}
                    </span>
                    <span>{l.op}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </section>

      {/* controls */}
      {started && (
        <div className="z-10 flex flex-col gap-3 px-5 pb-24 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Bar
            </span>
            {(["A", "B"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setSelectedBar(b)}
                className={
                  selectedBar === b
                    ? "min-h-[44px] min-w-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                    : "min-h-[44px] min-w-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {b}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <EditBtn label="Transpose ▲" hint="↑" onClick={() => doTranspose(1)} />
            <EditBtn label="Transpose ▼" hint="↓" onClick={() => doTranspose(-1)} />
            <EditBtn label="Insert" hint="n / click grid" onClick={doInsertGap} />
            <EditBtn label="Delete" hint="⌫" onClick={doDelete} />
            <EditBtn label="Nudge ◄" hint="←" onClick={() => doNudge(-1)} />
            <EditBtn label="Nudge ►" hint="→" onClick={() => doNudge(1)} />
            <EditBtn label="Invert" hint="i" onClick={doInvert} />
            <EditBtn label="Stretch" hint="s" onClick={doStretch} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            {autopilot && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                edit-war running — jump in any time
              </span>
            )}
          </div>
        </div>
      )}

      {/* design-notes link (corner) */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed right-3 top-3 z-40 min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && <NotesModal onClose={() => setShowNotes(false)} />}

      <style>{`
        @keyframes rl-glow {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <PrototypeNav slugs={["5624-redlines"]} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// SVG pieces (art layer — raw hex allowed)
// ---------------------------------------------------------------------------

function Grid() {
  const cols = [];
  for (let s = 0; s <= STEPS; s++) {
    const isBar = s % BAR === 0;
    cols.push(
      <line
        key={`c${s}`}
        x1={s * CW}
        y1={0}
        x2={s * CW}
        y2={H}
        stroke={isBar ? COL.gridTonic : COL.grid}
        strokeWidth={isBar ? 1.4 : 0.7}
      />,
    );
  }
  const rowsEl = [];
  for (let r = 0; r <= ROWS; r++) {
    const deg = DEG_MAX - r;
    const isTonic = ((deg % 7) + 7) % 7 === 0;
    rowsEl.push(
      <line
        key={`r${r}`}
        x1={0}
        y1={r * RH}
        x2={W}
        y2={r * RH}
        stroke={isTonic ? COL.gridTonic : COL.grid}
        strokeWidth={isTonic ? 1 : 0.6}
      />,
    );
  }
  return (
    <g>
      {rowsEl}
      {cols}
    </g>
  );
}

function fillFor(by: Owner): { fill: string; edge: string } {
  if (by === "you") return { fill: COL.you, edge: COL.youEdge };
  if (by === "agent") return { fill: COL.agent, edge: COL.agentEdge };
  return { fill: COL.seed, edge: COL.seed };
}

function NoteRect({
  n,
  now,
  selected,
  reduced,
  onClick,
}: {
  n: Note;
  now: number;
  selected: boolean;
  reduced: boolean;
  onClick: (e: React.MouseEvent, id: number) => void;
}) {
  const x = n.step * CW + 1.5;
  const y = (DEG_MAX - n.deg) * RH + 2;
  const w = Math.max(n.dur * CW - 3, CW - 3);
  const h = RH - 4;
  const { fill, edge } = fillFor(n.by);
  const glowing = now - n.addedAt < HIGHLIGHT_MS;
  const stroke = selected ? COL.select : glowing ? COL.glow : edge;
  return (
    <g onClick={(e) => onClick(e, n.id)} style={{ cursor: "pointer" }}>
      {glowing && (
        <rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx={5}
          fill="none"
          stroke={COL.glow}
          strokeWidth={2}
          opacity={reduced ? 0.5 : 0.8}
          style={
            reduced
              ? undefined
              : { animation: "rl-glow 1.1s ease-in-out infinite" }
          }
        />
      )}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 2.2 : 1}
        opacity={0.94}
      />
    </g>
  );
}

function GhostRect({ g }: { g: Ghost }) {
  const x = g.step * CW + 1.5;
  const y = (DEG_MAX - g.deg) * RH + 2;
  const w = Math.max(g.dur * CW - 3, CW - 3);
  const h = RH - 4;
  return (
    <g opacity={0.6}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={3}
        fill="none"
        stroke={COL.ghost}
        strokeWidth={1}
        strokeDasharray="3 2"
      />
      {/* strike-through */}
      <line
        x1={x}
        y1={y + h / 2}
        x2={x + w}
        y2={y + h / 2}
        stroke={COL.ghost}
        strokeWidth={1.6}
      />
    </g>
  );
}

// ---------------------------------------------------------------------------
// DOM chrome (semantic tokens; owner swatches are tiny inline SVG = art layer)
// ---------------------------------------------------------------------------

function OwnerDot({ by }: { by: Owner }) {
  const { fill } = fillFor(by);
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill={fill} />
    </svg>
  );
}

function Legend() {
  const items: Array<{ by: Owner; label: string }> = [
    { by: "you", label: "you" },
    { by: "agent", label: "agent" },
    { by: "seed", label: "seed" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
      {items.map((it) => (
        <span key={it.by} className="flex items-center gap-1.5">
          <OwnerDot by={it.by} />
          {it.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
          <rect
            x="1"
            y="1"
            width="12"
            height="8"
            rx="2"
            fill="none"
            stroke={COL.glow}
            strokeWidth="1.5"
          />
        </svg>
        just added
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
          <line x1="1" y1="5" x2="13" y2="5" stroke={COL.ghost} strokeWidth="1.6" />
        </svg>
        removed
      </span>
    </div>
  );
}

function EditBtn({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className="text-foreground">{label}</span>
      <span className="font-mono text-xs text-muted-foreground/60">{hint}</span>
    </button>
  );
}

function NotesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative max-h-[82dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Redlines — design notes
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Most instruments let you <span className="text-foreground">play</span>{" "}
          notes. Redlines only lets you <span className="text-foreground">edit</span>{" "}
          them. The music is a short symbolic loop — a shared draft — and every
          gesture is an explicit edit operation: transpose a bar, insert or delete
          a note, nudge an onset, invert the phrase, stretch a region. The loop
          you hear is simply the current state of that draft.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A rule-based <span className="text-foreground">agent</span> shares the
          same draft, with its own competing intention: it pulls the phrase
          downward toward a lower home, thins dense passages, and reshapes upward
          leaps into descents. After you edit, it counter-edits — sometimes
          undoing your climb, sometimes building on it. Its notes use a cooler
          timbre and a cooler colour so you can hear and see whose material is
          whose. The score shows the running <span className="text-foreground">diff</span>
          : freshly-added notes glow, removed notes linger struck-through.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          On Start, a deterministic scripted edit-war runs first (you-edit then
          agent-counter-edit, several rounds) so the piece visibly rewrites itself
          with no input — then it hands you the pen and the agent keeps answering.
        </p>
        <span className="mt-4 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Interact
        </span>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-relaxed text-muted-foreground">
          <li>Click a note to select it; click empty grid to insert.</li>
          <li>↑ / ↓ transpose the selected bar; ← / → nudge the selected note.</li>
          <li>i invert · n insert · s stretch · ⌫ delete.</li>
        </ul>
        <span className="mt-4 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Reference
        </span>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          After <span className="text-foreground">BeatEdit: Symbolic Music
          Generation as Explicit Editing</span> (arXiv:2607.11124, July 2026),
          which recasts generation as editing a draft rather than synthesizing
          from scratch. Redlines embodies that as a two-composer diff.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Fully deterministic (a seeded mulberry32 PRNG, no clock, no Math.random).
          Web Audio + inline SVG only. Master output is compressed to a gain
          ceiling of 0.14; if audio can&apos;t start, the score still animates.
        </p>
        <button
          onClick={onClose}
          className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
