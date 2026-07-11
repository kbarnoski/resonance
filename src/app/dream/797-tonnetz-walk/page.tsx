"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TonnetzAudio } from "./audio";
import {
  applyTransform,
  chooseTransform,
  findPath,
  makeLattice,
  triadEquals,
  triadKey,
  triadName,
  triadPitches,
  voiceLead,
  type Transform,
  type Triad,
  type TriadNode,
} from "./tonnetz";

const COLS = 8;
const ROWS = 6;
const TRAIL_LEN = 18; // how many recently-visited triads stay lit
const PAD = 56;

const TRANSFORM_COLOR: Record<Transform, string> = {
  P: "#fda4af", // rose-300
  L: "#fcd34d", // amber-300
  R: "#6ee7b7", // emerald-300
};

interface TrailMark {
  key: string;
  age: number; // 0 = current, grows each step
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TonnetzWalkPage() {
  const lattice = useMemo(() => makeLattice(COLS, ROWS), []);

  // ── walker state (rendered) ────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<Triad>({ root: 0, major: true });
  const [lastTransform, setLastTransform] = useState<Transform | null>(null);
  const [steps, setSteps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [trail, setTrail] = useState<TrailMark[]>([
    { key: triadKey({ root: 0, major: true }), age: 0 },
  ]);
  const [activeEdge, setActiveEdge] = useState<{
    a: string;
    b: string;
    x: Transform;
  } | null>(null);

  // ── tunables ────────────────────────────────────────────────────────────────
  const [homeBias, setHomeBias] = useState(0.35); // 0 = wander, 1 = stay home
  const [stepSec, setStepSec] = useState(4.0); // seconds per step
  const [arpOn, setArpOn] = useState(true);

  // ── refs for the autonomous loop (avoid stale closures / re-subscribes) ─────
  const audioRef = useRef<TonnetzAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const currentRef = useRef<Triad>(current);
  const lastRef = useRef<Transform | null>(null);
  const originRef = useRef<Triad>({ root: 0, major: true });
  const voicesRef = useRef<number[]>([48, 52, 55]); // C E G around C3
  const homeBiasRef = useRef(homeBias);
  const stepSecRef = useRef(stepSec);
  const plannedRef = useRef<Transform[]>([]); // queued path from a click
  const rngRef = useRef<() => number>(Math.random);

  homeBiasRef.current = homeBias;
  stepSecRef.current = stepSec;

  // Move the walker to `next` via transform `x`, gliding the pad.
  const goTo = useCallback(
    (next: Triad, x: Transform) => {
      const prev = currentRef.current;
      const newVoices = voiceLead(voicesRef.current, next);
      voicesRef.current = newVoices;
      const glide = Math.min(2.4, stepSecRef.current * 0.6);
      audioRef.current?.setChord(newVoices, glide);

      currentRef.current = next;
      lastRef.current = x;

      setCurrent(next);
      setLastTransform(x);
      setSteps((s) => s + 1);
      setActiveEdge({ a: triadKey(prev), b: triadKey(next), x });
      setTrail((old) => {
        const aged = old.map((m) => ({ ...m, age: m.age + 1 }));
        const filtered = [
          { key: triadKey(next), age: 0 },
          ...aged.filter((m) => m.key !== triadKey(next)),
        ].slice(0, TRAIL_LEN);
        return filtered;
      });
    },
    [],
  );

  // One autonomous step: follow a planned path if present, else choose freely.
  const stepOnce = useCallback(() => {
    const cur = currentRef.current;
    let x: Transform;
    if (plannedRef.current.length > 0) {
      x = plannedRef.current.shift()!;
    } else {
      x = chooseTransform(
        cur,
        lastRef.current,
        originRef.current,
        homeBiasRef.current,
        rngRef.current,
      );
    }
    goTo(applyTransform(cur, x), x);
  }, [goTo]);

  // Schedule the next step with the *current* tempo (re-reads ref each time).
  const scheduleStep = useCallback(() => {
    if (stepTimerRef.current !== null) window.clearTimeout(stepTimerRef.current);
    const ms = stepSecRef.current * 1000;
    stepTimerRef.current = window.setTimeout(() => {
      stepOnce();
      scheduleStep();
    }, ms);
  }, [stepOnce]);

  // Elapsed-time ticker via rAF (also a natural place for any visual easing).
  const tick = useCallback(() => {
    setElapsed((performance.now() - startTimeRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleStart = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new TonnetzAudio();
    await audioRef.current.start();
    audioRef.current.setChord(voicesRef.current, 0.1);
    audioRef.current.setArp(arpOn, stepSecRef.current * 1000);
    startTimeRef.current = performance.now() - elapsed * 1000;
    setRunning(true);
    scheduleStep();
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
  }, [arpOn, elapsed, scheduleStep, tick]);

  const handlePause = useCallback(() => {
    setRunning(false);
    audioRef.current?.pause();
    if (stepTimerRef.current !== null) {
      window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Click a node: compute a short P/L/R path and queue it; the walker steers
  // there over the next few steps, then resumes free wandering.
  const handleNodeClick = useCallback((node: TriadNode) => {
    if (triadEquals(node.triad, currentRef.current)) return;
    plannedRef.current = findPath(currentRef.current, node.triad);
  }, []);

  // Keep arp toggle / tempo in sync with a live engine.
  useEffect(() => {
    if (running) audioRef.current?.setArp(arpOn, stepSecRef.current * 1000);
  }, [arpOn, running]);

  // Cleanup on unmount: audio, rAF, timers.
  useEffect(() => {
    return () => {
      if (stepTimerRef.current !== null)
        window.clearTimeout(stepTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── derived visuals ─────────────────────────────────────────────────────────
  const trailMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of trail) m.set(t.key, t.age);
    return m;
  }, [trail]);

  const curKey = triadKey(current);
  const viewW = lattice.width + PAD * 2;
  const viewH = lattice.height + PAD * 2;

  // Pitch-class lattice edges (thin grey) connecting adjacent pitch points.
  const edges = useMemo(() => {
    const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    const pts = lattice.pitchNodes;
    const near = (a: (typeof pts)[number], b: (typeof pts)[number]) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy) < 110;
    };
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (near(pts[i], pts[j])) {
          segs.push({
            x1: pts[i].x + PAD,
            y1: pts[i].y + PAD,
            x2: pts[j].x + PAD,
            y2: pts[j].y + PAD,
          });
        }
      }
    }
    return segs;
  }, [lattice]);

  const currentPitches = triadPitches(current);

  return (
    <main className="min-h-screen bg-[#070708] text-foreground antialiased">
      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="font-serif text-3xl tracking-tight text-foreground">
              Tonnetz Walk
            </h1>
            <Link
              href="#notes"
              className="font-mono text-sm text-violet-300/90 hover:text-violet-300"
            >
              Design notes ↓
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Watch harmony take a walk: a single chord glides forever through the
            Neo-Riemannian lattice by smooth voice-leading — P, L and R
            transforms, two notes held, one note stepping. Autonomous, never the
            same path twice.
          </p>
        </header>

        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <button
            onClick={running ? handlePause : handleStart}
            className="min-h-[44px] rounded-lg bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400 active:scale-[0.98]"
          >
            {running ? "Pause" : "Start"}
          </button>

          <label className="flex min-w-[180px] flex-col gap-1">
            <span className="font-mono text-sm text-muted-foreground">
              wander ←→ home · {homeBias.toFixed(2)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={homeBias}
              onChange={(e) => setHomeBias(parseFloat(e.target.value))}
              className="accent-violet-400"
            />
          </label>

          <label className="flex min-w-[180px] flex-col gap-1">
            <span className="font-mono text-sm text-muted-foreground">
              step · {stepSec.toFixed(1)}s
            </span>
            <input
              type="range"
              min={1.5}
              max={8}
              step={0.1}
              value={stepSec}
              onChange={(e) => setStepSec(parseFloat(e.target.value))}
              className="accent-violet-400"
            />
          </label>

          <label className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={arpOn}
              onChange={(e) => setArpOn(e.target.checked)}
              className="h-4 w-4 accent-violet-400"
            />
            arpeggio
          </label>
        </div>

        {/* Readout */}
        <div className="mb-4 flex flex-wrap gap-x-8 gap-y-1 font-mono text-sm">
          <span className="text-muted-foreground">
            chord{" "}
            <span className="text-violet-300">{triadName(current)}</span>
          </span>
          <span className="text-muted-foreground">
            last{" "}
            <span
              style={{
                color: lastTransform
                  ? TRANSFORM_COLOR[lastTransform]
                  : "rgba(255,255,255,0.55)",
              }}
            >
              {lastTransform ?? "—"}
            </span>
          </span>
          <span className="text-muted-foreground">
            steps <span className="text-foreground">{steps}</span>
          </span>
          <span className="text-muted-foreground">
            elapsed{" "}
            <span className="text-foreground">{fmtTime(elapsed)}</span>
          </span>
          <span className="text-muted-foreground">
            click any node to steer the walk there
          </span>
        </div>

        {/* The lattice */}
        <div className="overflow-hidden rounded-2xl border border-border bg-[#0a0a0c]">
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="block w-full"
            style={{ aspectRatio: `${viewW} / ${viewH}` }}
          >
            <defs>
              <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* pitch-class lattice edges */}
            {edges.map((e, i) => (
              <line
                key={`e${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth={1}
              />
            ))}

            {/* triad triangles + trail */}
            {lattice.triadNodes.map((n, i) => {
              const key = triadKey(n.triad);
              const isCurrent = key === curKey;
              const age = trailMap.get(key);
              const inTrail = age !== undefined;
              const trailGlow = inTrail
                ? Math.max(0, 1 - age! / TRAIL_LEN)
                : 0;
              const fill = n.up
                ? `rgba(196,181,253,${0.05 + trailGlow * 0.28})`
                : `rgba(110,231,183,${0.04 + trailGlow * 0.22})`;
              const pts = n.pts
                .map((p) => `${p.x + PAD},${p.y + PAD}`)
                .join(" ");
              return (
                <polygon
                  key={`t${i}`}
                  points={pts}
                  fill={fill}
                  stroke={
                    isCurrent
                      ? "#c4b5fd"
                      : inTrail
                        ? `rgba(196,181,253,${0.2 + trailGlow * 0.4})`
                        : "rgba(255,255,255,0.05)"
                  }
                  strokeWidth={isCurrent ? 2 : 1}
                  className="cursor-pointer transition-[fill] duration-700"
                  onClick={() => handleNodeClick(n)}
                />
              );
            })}

            {/* active transform edge */}
            {activeEdge &&
              (() => {
                const an = lattice.triadNodes.find(
                  (n) => triadKey(n.triad) === activeEdge.a,
                );
                const bn = lattice.triadNodes.find(
                  (n) => triadKey(n.triad) === activeEdge.b,
                );
                if (!an || !bn) return null;
                return (
                  <line
                    x1={an.x + PAD}
                    y1={an.y + PAD}
                    x2={bn.x + PAD}
                    y2={bn.y + PAD}
                    stroke={TRANSFORM_COLOR[activeEdge.x]}
                    strokeWidth={3}
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                );
              })()}

            {/* current-triad glow */}
            {(() => {
              const cn = lattice.triadNodes.find(
                (n) => triadKey(n.triad) === curKey,
              );
              if (!cn) return null;
              return (
                <circle
                  cx={cn.x + PAD}
                  cy={cn.y + PAD}
                  r={34}
                  fill="url(#glow)"
                />
              );
            })()}

            {/* triad labels */}
            {lattice.triadNodes.map((n, i) => {
              const key = triadKey(n.triad);
              const isCurrent = key === curKey;
              return (
                <text
                  key={`l${i}`}
                  x={n.x + PAD}
                  y={n.y + PAD + 4}
                  textAnchor="middle"
                  className="pointer-events-none select-none font-mono"
                  fontSize={isCurrent ? 15 : 12}
                  fill={
                    isCurrent
                      ? "rgba(255,255,255,0.98)"
                      : trailMap.has(key)
                        ? "rgba(255,255,255,0.85)"
                        : "rgba(255,255,255,0.4)"
                  }
                  fontWeight={isCurrent ? 700 : 400}
                >
                  {triadName(n.triad)}
                </text>
              );
            })}

            {/* pitch-class dots */}
            {lattice.pitchNodes.map((p, i) => {
              const lit = currentPitches.includes(p.pc);
              return (
                <circle
                  key={`p${i}`}
                  cx={p.x + PAD}
                  cy={p.y + PAD}
                  r={lit ? 4.5 : 2.5}
                  fill={
                    lit ? "#fcd34d" : "rgba(255,255,255,0.18)"
                  }
                />
              );
            })}
          </svg>
        </div>

        {/* Transform legend */}
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-1 font-mono text-sm text-muted-foreground">
          <span>
            <span style={{ color: TRANSFORM_COLOR.P }}>P</span> parallel · third
            ±1 semitone (C↔c)
          </span>
          <span>
            <span style={{ color: TRANSFORM_COLOR.L }}>L</span> leading-tone ·
            root step (C↔e)
          </span>
          <span>
            <span style={{ color: TRANSFORM_COLOR.R }}>R</span> relative · fifth
            step (C↔a)
          </span>
        </div>

        {/* Design notes */}
        <section
          id="notes"
          className="mt-12 max-w-2xl border-t border-border pt-6 text-base text-muted-foreground"
        >
          <h2 className="mb-2 font-serif text-xl text-foreground">Design notes</h2>
          <p className="mb-3">
            This is an <em>autonomous generative walker</em>, not a click-to-hear
            grid. A self-driving harmonic process chooses P/L/R transforms over
            time and the lattice animates around it. Each transform holds two
            common tones and moves a single voice by a small step — so the pad{" "}
            <em>glides</em> rather than jumps. The path through the lattice is the
            musical form.
          </p>
          <p className="text-muted-foreground">
            Reference: Euler&apos;s Tonnetz (1739); Neo-Riemannian theory after
            Hugo Riemann, formalized by David Lewin and Richard Cohn (
            <em>Audacious Euphony</em>, 2012). All sound is pure Web Audio
            synthesis — no samples, no network.
          </p>
        </section>
      </div>
    </main>
  );
}
