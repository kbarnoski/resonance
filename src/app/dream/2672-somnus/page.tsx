"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SomnusEngine,
  mulberry32,
  nightClock,
  type Stage,
} from "./engine";
import { SomnusAudio } from "./audio";
import {
  buildHypnogram,
  buildThreads,
  stageColor,
  stageRowY,
  timeToX,
  COL,
  HY,
  MEM,
  STAGE_ROWS,
  VIEW_H,
  VIEW_W,
} from "./viz";

// ════════════════════════════════════════════════════════════════════════════
// 2672 — SOMNUS
//
// THE QUESTION: "What if a piece of music SLEPT to remember — structured as a
// night's sleep architecture, so it consolidates its own motifs across
// NREM/REM cycles and is a genuinely different (yet connected) piece at
// minute 8 than at second 0?"
//
// A long-form generative organism, not an instrument. Click Begin once (to
// unlock audio) and it runs itself for ~8 minutes through five sleep cycles,
// admitting motifs while awake, replaying + strengthening + forgetting them in
// slow-wave sleep, splicing dreams in REM, and recapitulating a first-wake
// motif near dawn. See README.md and the design-notes overlay.
// ════════════════════════════════════════════════════════════════════════════

const LOOKAHEAD = 0.3;
const TAIL = 6; // seconds of hold after the night ends

type Phase = "idle" | "running" | "ended";

const STAGE_BLURB: Record<Stage, string> = {
  WAKE: "admitting the day's motifs",
  N1: "drifting down",
  N2: "spindles — tagging for replay",
  N3: "slow-wave — replay · strengthen · forget",
  REM: "dreaming — splicing new motifs",
};

export default function Page() {
  const engineRef = useRef<SomnusEngine>(new SomnusEngine());
  const audioRef = useRef<SomnusAudio | null>(null);
  const startPerfRef = useRef(0);
  const skipRef = useRef(0);
  const lastStageRef = useRef<Stage>("WAKE");

  const [phase, setPhase] = useState<Phase>("idle");
  const [nowT, setNowT] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const engine = engineRef.current;
  const total = engine.total;

  // ── the run loop (schedules audio ahead + drives the visuals) ─────────────
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const eng = engineRef.current;
      const audio = audioRef.current;
      const target = (performance.now() - startPerfRef.current) / 1000 + skipRef.current;

      while (eng.time < target + LOOKAHEAD) {
        const res = eng.pull();
        if (res.stage !== lastStageRef.current) {
          lastStageRef.current = res.stage;
          audio?.setStage(res.stage);
        }
        if (audio) {
          for (const nt of res.notes) {
            const when = audio.ctx.currentTime + (nt.at - target);
            if (when > audio.ctx.currentTime - 0.02) audio.playNote(nt, when);
          }
        }
      }

      const clamped = Math.min(target, total);
      setNowT(clamped);
      if (target >= total + TAIL) {
        setPhase("ended");
      }
    }, 40);
    return () => window.clearInterval(id);
  }, [phase, total]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  async function begin() {
    // fresh, deterministic engine for the run
    engineRef.current = new SomnusEngine();
    startPerfRef.current = performance.now();
    skipRef.current = 0;
    lastStageRef.current = "WAKE";
    setNowT(0);
    try {
      const a = new SomnusAudio();
      await a.start();
      a.setStage("WAKE");
      a.setMuted(muted);
      audioRef.current = a;
      setAudioError(null);
    } catch {
      audioRef.current = null;
      setAudioError("AudioContext unavailable — running as a silent nocturne (visuals only).");
    }
    setPhase("running");
  }

  function jumpAhead() {
    if (phase !== "running") return;
    const cur = (performance.now() - startPerfRef.current) / 1000 + skipRef.current;
    const next = Math.min(cur + 240, total - 2);
    if (next <= cur) return;
    skipRef.current += next - cur;
    engineRef.current.fastForwardTo(next);
    const st = engineRef.current.stageAt(next);
    lastStageRef.current = st;
    audioRef.current?.setStage(st);
    setNowT(next);
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    audioRef.current?.setMuted(m);
  }

  // ── seeded starfield (fixed — no fast flicker) ────────────────────────────
  const stars = useMemo(() => {
    const rng = mulberry32(0x2672 ^ 0x51a5);
    return Array.from({ length: 46 }, () => ({
      x: rng() * VIEW_W,
      y: 8 + rng() * (VIEW_H - 16),
      r: 0.4 + rng() * 1.1,
      o: 0.06 + rng() * 0.22,
    }));
  }, []);

  // ── derived render model ──────────────────────────────────────────────────
  const hypno = useMemo(() => buildHypnogram(engine.segments, total), [engine, total]);
  const progress = Math.min(nowT / total, 1);
  const nowX = timeToX(Math.min(nowT, total), total);
  const curSeg = engine.segAt(Math.min(nowT, total));
  const curStage: Stage = curSeg ? curSeg.stage : "WAKE";
  const cycleNo = curSeg && curSeg.cycle >= 0 ? curSeg.cycle + 1 : null;
  const threads =
    phase === "idle"
      ? []
      : buildThreads(engine.memories, total, nowT, engine.recapId);

  const born = engine.memories.length;
  const alive = engine.memories.filter((m) => !m.forgotten).length;
  const dreams = engine.memories.filter((m) => m.origin === "dream").length;
  const forgotten = engine.memories.filter((m) => m.forgotten).length;

  const moonY = stageRowY(curStage);

  return (
    <main className="relative min-h-screen bg-background px-5 py-6 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Somnus</h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              A piece of music that sleeps to remember — five sleep cycles that
              replay, strengthen, forget and dream their own motifs.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
        </header>

        {/* readout */}
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            <span className="text-foreground">{nightClock(nowT, total)}</span> night clock
          </span>
          <span>
            stage{" "}
            <span style={{ color: stageColor(curStage) }}>{curStage}</span>
            {cycleNo ? <span className="text-muted-foreground"> · cycle {cycleNo}/5</span> : null}
          </span>
          <span className="normal-case tracking-normal text-muted-foreground">
            {STAGE_BLURB[curStage]}
          </span>
          <span className="ml-auto">
            <span className="text-foreground">{born}</span> born ·{" "}
            <span className="text-foreground">{dreams}</span> dreamt ·{" "}
            <span className="text-foreground">{forgotten}</span> forgotten ·{" "}
            <span className="text-foreground">{alive}</span> alive
          </span>
        </div>

        {audioError ? (
          <p className="mb-3 text-base text-destructive">{audioError}</p>
        ) : null}

        {/* the nocturne */}
        <div className="relative overflow-hidden rounded-md border border-border">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block w-full"
            role="img"
            aria-label="Hypnogram and memory-consolidation diagram of a night's sleep"
          >
            <defs>
              <linearGradient id="somnus-night" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#08050f" />
                <stop offset="0.7" stopColor="#0d0819" />
                <stop offset="1" stopColor="#1a1030" />
              </linearGradient>
              <radialGradient id="somnus-dawn" cx="1" cy="0.2" r="0.9">
                <stop offset="0" stopColor="#3a1d78" stopOpacity="0.55" />
                <stop offset="1" stopColor="#3a1d78" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="somnus-hypfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={COL.n2} stopOpacity="0.22" />
                <stop offset="1" stopColor={COL.n3} stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* background */}
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#somnus-night)" />
            <rect
              x="0"
              y="0"
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#somnus-dawn)"
              opacity={0.25 + progress * 0.6}
            />
            {stars.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="#ddd6fe"
                opacity={s.o * (1 - progress * 0.4)}
              />
            ))}

            {/* ── hypnogram panel ─────────────────────────────────────────── */}
            <text
              x={HY.x0}
              y={26}
              fill="#8a8a93"
              fontSize="11"
              letterSpacing="3"
              fontFamily="ui-monospace, monospace"
            >
              HYPNOGRAM · 23:00 → 07:00
            </text>
            {STAGE_ROWS.map((r) => (
              <g key={r.stage}>
                <line
                  x1={HY.x0}
                  y1={stageRowY(r.stage)}
                  x2={HY.x1}
                  y2={stageRowY(r.stage)}
                  stroke={COL.grid}
                  strokeWidth={1}
                  strokeDasharray="2 5"
                />
                <text
                  x={HY.x0 - 10}
                  y={stageRowY(r.stage) + 3}
                  textAnchor="end"
                  fill={stageColor(r.stage)}
                  fontSize="10"
                  letterSpacing="1.5"
                  fontFamily="ui-monospace, monospace"
                  opacity={0.85}
                >
                  {r.label}
                </text>
              </g>
            ))}
            <path d={hypno.fill} fill="url(#somnus-hypfill)" />
            <path
              d={hypno.line}
              fill="none"
              stroke={COL.grid}
              strokeWidth={1.5}
              opacity={0.5}
            />
            {/* played-so-far hypnogram (clipped to the playhead) */}
            <clipPath id="somnus-played">
              <rect x={HY.x0} y={HY.y0 - 6} width={Math.max(0, nowX - HY.x0)} height={HY.y1 - HY.y0 + 12} />
            </clipPath>
            <path
              d={hypno.line}
              fill="none"
              stroke={COL.wake}
              strokeWidth={2.2}
              clipPath="url(#somnus-played)"
            />

            {/* ── memory-strata panel ─────────────────────────────────────── */}
            <text
              x={MEM.x0}
              y={MEM.y0 - 14}
              fill="#8a8a93"
              fontSize="11"
              letterSpacing="3"
              fontFamily="ui-monospace, monospace"
            >
              MEMORY STRATA · thickness = strength
            </text>

            {threads.map((th) => (
              <g key={th.id} opacity={th.opacity}>
                {th.links.map((lk, i) => (
                  <line
                    key={i}
                    x1={lk.x1}
                    y1={lk.y1}
                    x2={lk.x2}
                    y2={lk.y2}
                    stroke={COL.dream}
                    strokeWidth={0.7}
                    strokeDasharray="1 3"
                    opacity={0.5}
                  />
                ))}
                <line
                  x1={th.x0}
                  y1={th.y}
                  x2={th.xNow}
                  y2={th.y}
                  stroke={th.color}
                  strokeWidth={th.width}
                  strokeLinecap="round"
                  strokeDasharray={th.dashed ? "5 4" : undefined}
                />
                {/* birth node */}
                <circle cx={th.x0} cy={th.y} r={2.4} fill={th.color} />
                {th.showLabel ? (
                  <text
                    x={th.x0 - 6}
                    y={th.y + 3}
                    textAnchor="end"
                    fill={th.color}
                    fontSize="8.5"
                    fontFamily="ui-monospace, monospace"
                    opacity={0.9}
                  >
                    {th.label}
                  </text>
                ) : null}
                {/* event marks */}
                {th.marks.map((mk, i) => {
                  if (mk.kind === "replay")
                    return (
                      <circle key={i} cx={mk.x} cy={mk.y} r={1.5} fill="#ede9fe" opacity={0.75} />
                    );
                  if (mk.kind === "forget")
                    return (
                      <g key={i} stroke={COL.forget} strokeWidth={1}>
                        <line x1={mk.x - 3} y1={mk.y - 3} x2={mk.x + 3} y2={mk.y + 3} />
                        <line x1={mk.x - 3} y1={mk.y + 3} x2={mk.x + 3} y2={mk.y - 3} />
                      </g>
                    );
                  if (mk.kind === "recap")
                    return (
                      <path
                        key={i}
                        d={`M${mk.x} ${mk.y - 5} L${mk.x + 5} ${mk.y} L${mk.x} ${mk.y + 5} L${mk.x - 5} ${mk.y} Z`}
                        fill={COL.recap}
                        stroke="#8b5cf6"
                        strokeWidth={0.8}
                      />
                    );
                  return null;
                })}
              </g>
            ))}

            {/* playhead + moon */}
            <line
              x1={nowX}
              y1={HY.y0 - 6}
              x2={nowX}
              y2={MEM.y1 + 8}
              stroke="#c4b5fd"
              strokeWidth={1}
              opacity={0.5}
            />
            <circle cx={nowX} cy={moonY} r={5} fill="#ede9fe" opacity={0.95} />
            <circle cx={nowX} cy={moonY} r={9} fill="none" stroke="#c4b5fd" strokeWidth={1} opacity={0.4} />
          </svg>

          {/* idle overlay */}
          {phase === "idle" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-md px-6 text-center text-base text-muted-foreground">
                Press begin, then let it sleep. Over ~8 minutes it will remember,
                forget and dream on its own. No further input needed.
              </p>
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the night
              </button>
            </div>
          ) : null}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={jumpAhead}
            disabled={phase !== "running"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Jump ahead 4 min
          </button>
          <button
            onClick={toggleMute}
            disabled={phase === "idle"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          {phase === "ended" ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sleep again
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <LegendDot color={COL.wakeThread} label="wake motif" />
            <LegendDot color={COL.dream} label="dream splice" dashed />
            <LegendDot color={COL.recap} label="recapitulation" />
          </div>
        </div>
      </div>

      {/* design notes overlay */}
      {showNotes ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-md border border-border bg-background p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">Somnus</span> treats a piece of
                music as a sleeping brain. A hypnogram walker descends Wake → N1
                → N2 → N3 → REM across five cycles — a ~90-minute cycle
                compressed to ~90 seconds — in a realistic descending-then-REM-
                lengthening architecture (early cycles are slow-wave-heavy, late
                cycles REM-heavy).
              </p>
              <p>
                A <span className="text-foreground">memory bank</span> of
                pitch/rhythm motifs is consolidated by stage-specific operations.
                Waking admits new motifs. N2 spindles tag recent ones and shimmer.
                N3 slow-wave sleep is the core: it replays the strongest motifs
                (slightly varied each time), strengthens them, decays all, and
                forgets the weakest. REM splices two surviving motifs into a wild
                dream. Near dawn a first-wake motif returns — recognisable but
                transformed by a night of replay-driven drift.
              </p>
              <p>
                Pitches are free-chromatic continuous Hz with no consonance
                snapping, so N3 can grind and REM can clash. Everything is seeded
                from <span className="font-mono text-sm">0x2672</span>; two loads
                dream the same night.
              </p>
              <p className="text-sm">
                References: Wilson &amp; McNaughton 1994 (hippocampal replay);
                Diekelmann &amp; Born 2010; Rasch &amp; Born 2013;
                arXiv:2603.14517 (Sleep-Inspired Memory Consolidation).
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 normal-case tracking-normal">
      <span
        className="inline-block h-0.5 w-4"
        style={{
          backgroundColor: dashed ? "transparent" : color,
          backgroundImage: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : undefined,
        }}
      />
      {label}
    </span>
  );
}
