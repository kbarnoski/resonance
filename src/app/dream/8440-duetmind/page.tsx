"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { DuetEngine, type Snapshot } from "./engine";
import { createDuet } from "./audio";
import { KEY_MAP, KEY_ROWS, noteName } from "./agent";
import { NOTES_MD } from "./readme-text";

// ---- Blueprint art palette (art layer only — chrome uses semantic tokens) ----
const BG = "#0b1120";
const GRID = "#18305a";
const GRID_STRONG = "#294d80";
const HUMAN = "#22d3ee"; // cyan — YOU
const AGENT = "#f59e0b"; // amber — DUETMIND
const NOW_COL = "#e6edf6";
const INK_DIM = "#6484b3";

// ---- Board geometry (SVG user units) ----
const VB_W = 1000;
const VB_H = 560;
const NOW_X = 320;
const LANE_A = { top: 70, h: 196, label: "DUETMIND", color: AGENT }; // agent
const LANE_B = { top: 300, h: 196, label: "YOU", color: HUMAN }; // human
const P_MIN = 55;
const P_MAX = 86;

function yFor(pitch: number, lane: { top: number; h: number }): number {
  const f = (pitch - P_MIN) / (P_MAX - P_MIN);
  const c = f < 0 ? 0 : f > 1 ? 1 : f;
  return lane.top + (1 - c) * lane.h;
}

/** Render the design-notes string without a markdown dependency. */
function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## "))
      return (
        <h3 key={i} className="mt-4 text-base font-semibold text-foreground">
          {line.slice(3)}
        </h3>
      );
    if (line.startsWith("# "))
      return (
        <h2 key={i} className="text-lg font-semibold text-foreground">
          {line.slice(2)}
        </h2>
      );
    if (line.startsWith("- "))
      return (
        <li key={i} className="ml-4 list-disc text-sm leading-relaxed text-muted-foreground">
          {renderInline(line.slice(2))}
        </li>
      );
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-sm leading-relaxed text-muted-foreground">
        {renderInline(line)}
      </p>
    );
  });
}

// Minimal inline **bold** / *italic* handling for the notes prose.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("*") && p.endsWith("*"))
      return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

export default function DuetMindPage() {
  const engineRef = useRef<DuetEngine | null>(null);
  const rafRef = useRef<number>(0);
  const enableFnRef = useRef<(() => void) | null>(null);
  const audioReadyRef = useRef(false);

  const [, setFrame] = useState(0);
  const [audioReady, setAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Whole lifecycle in one effect so the input handlers close over the engine.
  useEffect(() => {
    const engine = new DuetEngine(0x5eed42);
    engineRef.current = engine;

    enableFnRef.current = () => {
      if (audioReadyRef.current) return;
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext ??
          AudioContext;
        const ctx = new Ctor();
        const finish = () => {
          const synth = createDuet(ctx);
          engine.attachAudio(ctx, synth);
          audioReadyRef.current = true;
          setAudioReady(true);
          setError(null);
        };
        if (ctx.state === "suspended") ctx.resume().then(finish).catch(finish);
        else finish();
      } catch {
        setError("Audio could not start — the duet keeps playing silently.");
      }
    };

    const loop = () => {
      engine.tick();
      setFrame((f) => (f + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const pitch = KEY_MAP[e.key.toLowerCase()];
      if (pitch == null) return;
      e.preventDefault();
      enableFnRef.current?.();
      engine.pressKey(pitch);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const pitch = KEY_MAP[e.key.toLowerCase()];
      if (pitch == null) return;
      engine.releaseKey(pitch);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onMq);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      mq.removeEventListener?.("change", onMq);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const tapDown = useCallback((pitch: number) => {
    enableFnRef.current?.();
    engineRef.current?.pressKey(pitch);
  }, []);
  const tapUp = useCallback((pitch: number) => {
    engineRef.current?.releaseKey(pitch);
  }, []);

  const snap = engineRef.current?.snapshot() ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            DuetMind
          </h1>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="shrink-0 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </div>
        <p className="text-base text-muted-foreground">
          A local improvising partner that shows you its plan a beat before it plays it,
          then answers your phrase — trading fours, developing your motifs.
        </p>
      </header>

      <Board snap={snap} reduced={reduced} />

      <div className="flex flex-wrap items-center gap-3">
        {!audioReady ? (
          <button
            type="button"
            onClick={() => enableFnRef.current?.()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play with sound
          </button>
        ) : (
          <span className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 font-mono text-xs text-muted-foreground">
            sound live · trading fours
          </span>
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {snap?.live ? "you have the lead" : "auto-demo playing both parts"}
        </span>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      <Keys
        active={snap?.activePitches ?? new Set<number>()}
        onDown={tapDown}
        onUp={tapUp}
      />

      <p className="text-sm text-muted-foreground">
        Play the home row{" "}
        <span className="font-mono text-foreground">A S D F G H J K</span> (a C-major
        octave) and the row above{" "}
        <span className="font-mono text-foreground">Q W E R T Y U I</span> (the octave
        up), or tap the keys. The instant you play, the demo hands you the lead.
      </p>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">{renderNotes(NOTES_MD)}</div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8440-duetmind"]} />
    </main>
  );
}

// ---------------------------------------------------------------------------

function Board({ snap, reduced }: { snap: Snapshot | null; reduced: boolean }) {
  const time = snap?.time ?? 0;
  const beat = snap?.beat ?? 0.42;
  const notes = snap?.notes ?? [];

  const futureWindow = reduced ? 4.4 : 2.7;
  const px = (VB_W - NOW_X) / futureWindow;
  const pastWindow = NOW_X / px;

  // Scrolling beat gridlines — stronger every 4 beats (a trade boundary).
  const grid: React.ReactNode[] = [];
  const firstBeat = Math.ceil((time - pastWindow) / beat) * beat;
  for (let gt = firstBeat; gt < time + futureWindow; gt += beat) {
    const x = NOW_X + (gt - time) * px;
    const strong = Math.round(gt / beat) % 4 === 0;
    grid.push(
      <line
        key={`g${gt.toFixed(2)}`}
        x1={x}
        y1={LANE_A.top - 10}
        x2={x}
        y2={LANE_B.top + LANE_B.h + 10}
        stroke={strong ? GRID_STRONG : GRID}
        strokeWidth={strong ? 1.2 : 0.6}
      />,
    );
  }

  const marks: React.ReactNode[] = [];
  for (const n of notes) {
    const lane = n.voice === "agent" ? LANE_A : LANE_B;
    const x = NOW_X + (n.t - time) * px;
    const w = Math.max(4, n.dur * px);
    if (x + w < -30 || x > VB_W + 30) continue;
    const y = yFor(n.pitch, lane) - 4;
    const color = n.voice === "agent" ? AGENT : HUMAN;
    const isFuture = n.t > time + 0.01;
    const ghost = n.voice === "agent" && isFuture; // the anticipation display
    const onset = !isFuture && time - n.t < 0.12;

    if (ghost) {
      marks.push(
        <rect
          key={n.id}
          x={x}
          y={y}
          width={w}
          height={8}
          rx={2}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          strokeOpacity={0.6}
          strokeDasharray="4 3"
        />,
      );
    } else {
      const upcoming = n.voice === "human" && isFuture;
      marks.push(
        <rect
          key={n.id}
          x={x}
          y={y}
          width={w}
          height={8}
          rx={2}
          fill={color}
          fillOpacity={upcoming ? 0.45 : 0.92}
        />,
      );
      if (onset) {
        marks.push(
          <rect
            key={`o${n.id}`}
            x={x - 3}
            y={y - 3}
            width={w + 6}
            height={14}
            rx={4}
            fill="none"
            stroke={NOW_COL}
            strokeWidth={1.2}
            strokeOpacity={0.55}
          />,
        );
      }
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
        role="img"
        aria-label="A two-lane waterfall score. The amber DuetMind lane is on top, your cyan lane below; time scrolls right-to-left toward the NOW line and the agent's dashed amber notes ahead of it are its plan."
      >
        <rect x={0} y={0} width={VB_W} height={VB_H} fill={BG} />
        {grid}

        {/* plan zone shading (future half of the agent lane) */}
        <rect
          x={NOW_X}
          y={LANE_A.top - 6}
          width={VB_W - NOW_X}
          height={LANE_A.h + 12}
          fill={AGENT}
          opacity={0.05}
        />

        {/* lane frames + labels */}
        {[LANE_A, LANE_B].map((lane) => (
          <g key={lane.label}>
            <rect
              x={0}
              y={lane.top - 6}
              width={VB_W}
              height={lane.h + 12}
              fill="none"
              stroke={GRID}
              strokeWidth={0.8}
            />
            <text
              x={12}
              y={lane.top + 12}
              fontFamily="ui-monospace, monospace"
              fontSize={13}
              letterSpacing={2}
              fill={lane.color}
              opacity={0.85}
            >
              {lane.label}
            </text>
          </g>
        ))}

        {marks}

        {/* NOW line */}
        <rect x={NOW_X - 6} y={40} width={12} height={VB_H - 60} fill={NOW_COL} opacity={0.06} />
        <line x1={NOW_X} y1={40} x2={NOW_X} y2={VB_H - 20} stroke={NOW_COL} strokeWidth={1.6} />
        <text
          x={NOW_X}
          y={30}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize={12}
          letterSpacing={3}
          fill={NOW_COL}
        >
          NOW
        </text>

        {/* register captions */}
        <text
          x={NOW_X - 12}
          y={VB_H - 30}
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          fontSize={11}
          fill={INK_DIM}
        >
          sounded ◂
        </text>
        <text
          x={NOW_X + 12}
          y={54}
          fontFamily="ui-monospace, monospace"
          fontSize={11}
          fill={AGENT}
          opacity={0.75}
        >
          ▸ the plan — about to play
        </text>

        {/* current transform readout */}
        <text
          x={VB_W - 14}
          y={30}
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
          fontSize={13}
          fill={AGENT}
        >
          {`agent: ${snap?.transformLabel ?? "listening…"}`}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Keys({
  active,
  onDown,
  onUp,
}: {
  active: Set<number>;
  onDown: (pitch: number) => void;
  onUp: (pitch: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {KEY_ROWS.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1.5">
          {row.map(({ key, pitch }) => {
            const on = active.has(pitch);
            return (
              <button
                key={key}
                type="button"
                aria-label={`Play ${noteName(pitch)}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onDown(pitch);
                }}
                onPointerUp={() => onUp(pitch)}
                onPointerLeave={() => onUp(pitch)}
                onPointerCancel={() => onUp(pitch)}
                className={`flex min-h-[44px] flex-1 select-none flex-col items-center justify-center rounded-md border text-xs transition-colors ${
                  on
                    ? "border-foreground bg-accent text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="font-mono text-sm uppercase">{key}</span>
                <span className="font-mono text-[10px] opacity-70">{noteName(pitch)}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
