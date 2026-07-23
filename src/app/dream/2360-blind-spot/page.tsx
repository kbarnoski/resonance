"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2360-blind-spot — "What if you could hear your own consciousness edit reality?"
//
//   A Motion-Induced-Blindness instrument (Bonneh, Cooperman & Sagi, Nature
//   2001). Fixate the centre; a large field of blue crosses rotates slowly in
//   the background. Salient warm target dots in the periphery spontaneously
//   vanish from awareness for seconds at a time — even though they are ALWAYS
//   physically on screen (their thin outline ring never dims).
//
//   Two genuinely independent, conflicting axes — there is NO master dial:
//     • OBJECTIVE presence  → the outline ring, constant, always drawn.
//     • SUBJECTIVE awareness → the bright fill + a sustained chord partial.
//
//   When a dot vanishes from YOUR awareness you report it (tap the dot, or press
//   its number 1–6): that partial fades and the chord audibly thins to match
//   your shrinking visual field, then re-blooms as dots return. A seeded
//   "auto-fade" demo is the honest stand-in for a silent glance (real MIB needs
//   your own eyes). The 2024 anisotropy result (PMC11557702) predicts the
//   oblique dots fade sooner & longer than the cardinal ones — watch for it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BlindSpotSynth } from "./synth";
import {
  CENTER,
  DOT_R,
  FadeState,
  TARGETS,
  VIEW,
  buildGrid,
  initSchedule,
  stepSchedule,
} from "./stimulus";

// ── art-layer palette (canonical MIB stimulus colours — allowed as raw hex) ──
const BG = "#060912"; // deep blue-black field
const GRID = "#3a55c8"; // slowly-rotating blue lattice
const DOT = "#ffd24a"; // warm yellow target
const FIX = "#f2e7c9"; // warm fixation mark

const GRID_DATA = buildGrid();
const DEG_PER_SEC_BASE = 28.8; // 0.08 rev/sec — slow, smooth, well under flicker
const FADE_TAU = 0.55; // seconds for a partial to fade/bloom

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function BlindSpotPage() {
  // ── SVG element refs (attributes mutated per-frame, no React re-render) ──
  const gridRef = useRef<SVGGElement | null>(null);
  const fillRefs = useRef<(SVGCircleElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const seenCountRef = useRef<HTMLSpanElement | null>(null);

  // ── simulation state (refs — read/written inside the rAF loop) ──
  const awarenessRef = useRef<number[]>(TARGETS.map(() => 1));
  const desiredRef = useRef<number[]>(TARGETS.map(() => 1));
  const fadedMsRef = useRef<number[]>(TARGETS.map(() => 0));
  const scheduleRef = useRef<FadeState[]>([]);
  const rotationRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const demoRef = useRef<boolean>(true);
  const synthRef = useRef<BlindSpotSynth | null>(null);
  const rafRef = useRef<number>(0);
  const degPerSecRef = useRef<number>(DEG_PER_SEC_BASE);

  // ── discrete UI state ──
  const [audioOn, setAudioOn] = useState(false);
  const [demoOn, setDemoOn] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Toggle one dot's reported visibility (report mode only).
  const toggleReport = useCallback((idx: number) => {
    if (demoRef.current) return; // seeded demo owns the schedule
    desiredRef.current[idx] = desiredRef.current[idx] > 0.5 ? 0 : 1;
  }, []);

  // ── the single animation loop ──
  useEffect(() => {
    degPerSecRef.current = prefersReducedMotion() ? 9 : DEG_PER_SEC_BASE;
    const start = performance.now();
    lastTsRef.current = start;
    scheduleRef.current = initSchedule(TARGETS, start);

    const drawFrame = (ts: number) => {
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      // slow, smooth background rotation — the MIB motion carrier.
      rotationRef.current = (rotationRef.current + dt * degPerSecRef.current) % 360;
      gridRef.current?.setAttribute(
        "transform",
        `rotate(${rotationRef.current.toFixed(3)} ${CENTER} ${CENTER})`
      );

      // seeded demo drives the subjective verdict when engaged.
      if (demoRef.current) {
        stepSchedule(scheduleRef.current, TARGETS, ts);
        for (let i = 0; i < TARGETS.length; i++) {
          desiredRef.current[i] = scheduleRef.current[i].seen ? 1 : 0;
        }
      }

      // ease each dot's awareness toward its desired report; drive fill + tally.
      const k = 1 - Math.exp(-dt / FADE_TAU);
      let seen = 0;
      let maxFaded = 1;
      for (let i = 0; i < TARGETS.length; i++) {
        const a = awarenessRef.current[i] + (desiredRef.current[i] - awarenessRef.current[i]) * k;
        awarenessRef.current[i] = a;
        const fill = fillRefs.current[i];
        if (fill) fill.setAttribute("opacity", a.toFixed(3));
        if (a > 0.5) seen++;
        else fadedMsRef.current[i] += dt * 1000; // log a "blind" moment
        if (fadedMsRef.current[i] > maxFaded) maxFaded = fadedMsRef.current[i];
      }

      // push awareness into the additive partial bank.
      const synth = synthRef.current;
      if (synth && synth.running) synth.applyAwareness(awarenessRef.current);

      // live readouts (direct DOM — no per-frame React churn).
      if (seenCountRef.current) seenCountRef.current.textContent = String(seen);
      for (let i = 0; i < TARGETS.length; i++) {
        const bar = barRefs.current[i];
        if (bar) bar.style.width = `${(fadedMsRef.current[i] / maxFaded) * 100}%`;
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // teardown audio on unmount.
  useEffect(() => {
    return () => {
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // keyboard reporting — press 1..6 to toggle that dot (report mode only).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= TARGETS.length) {
        toggleReport(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleReport]);

  const startAudio = useCallback(async () => {
    setAudioError(null);
    try {
      const synth = synthRef.current ?? new BlindSpotSynth();
      synthRef.current = synth;
      await synth.start();
      setAudioOn(true);
    } catch {
      setAudioError(
        "Web Audio is unavailable here — the stimulus still runs silently below."
      );
      synthRef.current?.dispose();
      synthRef.current = null;
      setAudioOn(false);
    }
  }, []);

  const stopAudio = useCallback(() => {
    synthRef.current?.dispose();
    synthRef.current = null;
    setAudioOn(false);
  }, []);

  const toggleDemo = useCallback(() => {
    setDemoOn((prev) => {
      const next = !prev;
      demoRef.current = next;
      if (!next) {
        // entering report mode: reset every dot to "seen" so YOU drive it.
        for (let i = 0; i < TARGETS.length; i++) desiredRef.current[i] = 1;
      }
      return next;
    });
  }, []);

  const resetBlindMap = useCallback(() => {
    for (let i = 0; i < TARGETS.length; i++) fadedMsRef.current[i] = 0;
  }, []);

  return (
    <main className="relative min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6">
      <PrototypeNav slugs={["2360-blind-spot"]} />

      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2360 · blind-spot · motion-induced blindness
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Hear your consciousness edit reality
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Fixate the centre mark and let the blue grid rotate. The warm dots
            are <em>always</em> physically present — their thin ring never dims —
            yet they will vanish from your awareness one by one. Report a dot
            that has disappeared (tap it, or press its number) and its partial
            leaves the chord: you are hearing the gap between what is there and
            what you perceive.
          </p>
        </header>

        {/* ── the SVG-DOM stimulus ── */}
        <div className="overflow-hidden rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="block h-auto w-full touch-none select-none"
            role="img"
            aria-label="Rotating blue grid with warm target dots at cardinal and oblique positions"
          >
            <rect x={0} y={0} width={VIEW} height={VIEW} fill={BG} />

            {/* rotating blue lattice — one group, only its transform mutates */}
            <g ref={gridRef}>
              {GRID_DATA.crosses.map((c, i) => (
                <g key={i} stroke={GRID} strokeWidth={2.4} opacity={0.5}>
                  <line
                    x1={c.x - GRID_DATA.arm}
                    y1={c.y}
                    x2={c.x + GRID_DATA.arm}
                    y2={c.y}
                  />
                  <line
                    x1={c.x}
                    y1={c.y - GRID_DATA.arm}
                    x2={c.x}
                    y2={c.y + GRID_DATA.arm}
                  />
                </g>
              ))}
            </g>

            {/* fixation mark — stare here */}
            <g stroke={FIX} strokeWidth={3}>
              <line x1={CENTER - 14} y1={CENTER} x2={CENTER + 14} y2={CENTER} />
              <line x1={CENTER} y1={CENTER - 14} x2={CENTER} y2={CENTER + 14} />
            </g>
            <circle cx={CENTER} cy={CENTER} r={4} fill={FIX} />

            {/* target dots: outline = OBJECTIVE presence, fill = SUBJECTIVE awareness */}
            {TARGETS.map((t, i) => (
              <g
                key={t.id}
                onClick={() => toggleReport(i)}
                style={{ cursor: demoOn ? "default" : "pointer" }}
              >
                {/* generous invisible hit area (≥44px tap target) */}
                <circle cx={t.cx} cy={t.cy} r={DOT_R + 22} fill="transparent" />
                {/* objective presence — constant, never fades */}
                <circle
                  cx={t.cx}
                  cy={t.cy}
                  r={DOT_R + 4}
                  fill="none"
                  stroke={DOT}
                  strokeWidth={2}
                  opacity={0.32}
                />
                {/* subjective awareness — opacity driven per-frame */}
                <circle
                  ref={(el) => {
                    fillRefs.current[i] = el;
                  }}
                  cx={t.cx}
                  cy={t.cy}
                  r={DOT_R}
                  fill={DOT}
                  opacity={1}
                />
                <text
                  x={t.cx}
                  y={t.cy + DOT_R + 26}
                  textAnchor="middle"
                  fontSize={22}
                  fontFamily="monospace"
                  fill={DOT}
                  opacity={0.4}
                >
                  {t.id}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* ── controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          {audioOn ? (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop sound
            </button>
          ) : (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start sound
            </button>
          )}

          <button
            onClick={toggleDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-pressed={demoOn}
          >
            {demoOn ? "Auto-fade demo: on" : "Report mode: your eyes"}
          </button>

          <button
            onClick={resetBlindMap}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Reset blind-map
          </button>

          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span ref={seenCountRef}>6</span> / {TARGETS.length} partials
            sounding
          </span>
        </div>

        {audioError && (
          <p className="text-sm leading-relaxed text-destructive">{audioError}</p>
        )}

        <p className="text-sm leading-relaxed text-muted-foreground">
          {demoOn
            ? "A deterministic seeded schedule is fading and restoring dots for you — the honest stand-in for a silent glance. Switch to Report mode to drive it with your own perception."
            : "Report mode: fixate the centre and tap (or press 1–6) each dot the moment it slips from your awareness. Tap again when it returns."}
        </p>

        {/* ── blind-map readout ── */}
        <section className="rounded-lg border border-border bg-background/40 p-4">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Blind-map · where your awareness drops out most
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {TARGETS.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3">
                <span className="w-6 font-mono text-xs text-muted-foreground">
                  {t.id}
                </span>
                <span className="w-20 text-xs text-muted-foreground">
                  {t.meridian}
                </span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    ref={(el) => {
                      barRefs.current[i] = el;
                    }}
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: "0%" }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The three obliques tend to fill faster than the cardinals — the
            spatial anisotropy of MIB fading reported in 2024 (PMC11557702),
            quietly drawing your own blind map.
          </p>
        </section>
      </div>
    </main>
  );
}
