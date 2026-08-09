"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7464-ruletape — page.tsx
//
// "What if you could PLAY the boundary between chaos and order — tune a symbolic
//  rule and feel geometry crystallize or dissolve under your hands?"
//
// A generalized Langton's ant / turmite whose entire behaviour is a short
// symbolic RULETAPE (RL, LLRR, LRRRRRLLR …). Tap the SVG symbol tiles to rewrite
// the tape live, or pick from the preset shelf; the lattice re-runs instantly and
// the sound re-voices. A live "order meter" shows where the current tape sits on
// the criticality axis. Canvas2D lattice + SVG tape UI. No GPU. No microphone.
//
// References (see README): Langton (1986); Dewdney "Turmites" (Sci. Am. 1989);
// arXiv 2505.05426 "Sideways on the highways" (2025); arXiv 2506.10482 "The LLLR
// generalised Langton's ant" (2025); Entropic Brain Hypothesis / 2026 criticality
// framing of the visionary state as the edge between order and chaos.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Turmite, PRESETS, TURN_CYCLE, TURN_LABEL, type Turn } from "./turmite";
import { RuletapeAudio } from "./audio";

const GRID_W = 260;
const GRID_H = 168;
const STEPS_PER_FRAME = 34;
const TOUR_MS = 15000;
const NOTE_INTERVAL = 0.12; // ~8 notes/sec ceiling

interface Readout {
  order: number;
  disorder: number;
  activity: number;
  steps: number;
}

// A small SVG turn glyph — a curved rotation arrow (L/R), a hairpin (U) or a
// straight dash (N). Drawn as art, so raw white/violet strokes are fine here.
function TurnGlyph({ turn }: { turn: Turn }) {
  const stroke = "currentColor";
  if (turn === "N") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <line x1="4" y1="12" x2="20" y2="12" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M15 7l5 5-5 5" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (turn === "U") {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <path d="M8 20V10a4 4 0 0 1 8 0v10" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M4 16l4 4 4-4" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  // L / R rotation arrows (mirror on X for L)
  const flip = turn === "L" ? "scale(-1,1) translate(-24,0)" : undefined;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      <g transform={flip}>
        <path
          d="M6 13a6.5 6.5 0 1 1 2 4.6"
          fill="none"
          stroke={stroke}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path d="M4 8l2.2 5 5-2" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function RuletapePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [rule, setRule] = useState<Turn[]>(() =>
    PRESETS[0].rule.split("").map((c) => c as Turn),
  );
  const [audioOn, setAudioOn] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touring, setTouring] = useState(true);
  const [tourIdx, setTourIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    order: 0.5,
    disorder: 0.5,
    activity: 0,
    steps: 0,
  });

  // engine refs (read inside rAF; never re-render)
  const turmiteRef = useRef<Turmite | null>(null);
  const audioRef = useRef<RuletapeAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const ruleRef = useRef(rule);
  const touringRef = useRef(true);
  const tourIdxRef = useRef(0);
  const mutedRef = useRef(false);
  const lastTourRef = useRef(0);
  const noteAccRef = useRef(0);
  const timbreDirtyRef = useRef(true);

  // keep refs in sync with state the loop needs
  useEffect(() => {
    ruleRef.current = rule;
    timbreDirtyRef.current = true;
    turmiteRef.current?.setRule(rule.join(""));
  }, [rule]);
  useEffect(() => {
    touringRef.current = touring;
  }, [touring]);
  useEffect(() => {
    tourIdxRef.current = tourIdx;
  }, [tourIdx]);
  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // ── mount: build engine + run the lattice immediately (self-demo) ──────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let turmite: Turmite;
    try {
      turmite = new Turmite(GRID_W, GRID_H, ruleRef.current.join(""));
    } catch {
      return;
    }
    turmiteRef.current = turmite;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    lastTourRef.current = performance.now();
    let last = performance.now();
    let frame = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      resize();

      const t = turmiteRef.current;
      if (!t) return;

      t.run(STEPS_PER_FRAME);
      if (frame % 8 === 0) t.measure();
      t.sample();
      t.render(ctx, canvas.width, canvas.height);

      const m = t.metrics;

      // audio: throttled note + continuous shaping
      const audio = audioRef.current;
      if (audio && !mutedRef.current) {
        if (timbreDirtyRef.current) {
          audio.setRuleTimbre(ruleRef.current);
          timbreDirtyRef.current = false;
        }
        audio.setOrder(m.order);
        noteAccRef.current += dt;
        if (noteAccRef.current >= NOTE_INTERVAL) {
          noteAccRef.current = 0;
          const yNorm = t.antY / GRID_H;
          const pan = (t.antX / GRID_W) * 2 - 1;
          audio.note(t.antState, t.colours, yNorm, pan, 0.5 + m.activity);
        }
      }

      // auto-tour: cycle presets so the phase-transitions play themselves
      if (touringRef.current && now - lastTourRef.current > TOUR_MS) {
        lastTourRef.current = now;
        const next = (tourIdxRef.current + 1) % PRESETS.length;
        tourIdxRef.current = next;
        setTourIdx(next);
        setRule(PRESETS[next].rule.split("").map((c) => c as Turn));
      }

      if (frame % 6 === 0) {
        setReadout({
          order: m.order,
          disorder: m.disorder,
          activity: m.activity,
          steps: m.steps,
        });
      }
      frame++;
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      audioRef.current?.stop();
      audioRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      turmiteRef.current = null;
    };
  }, []);

  // unlock audio on the Start gesture (and only then)
  const handleStart = useCallback(() => {
    if (ctxRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setNoAudio(true);
      return;
    }
    const ctx = new Ctor();
    ctxRef.current = ctx;
    void ctx.resume();
    audioRef.current = new RuletapeAudio(ctx);
    audioRef.current.setRuleTimbre(ruleRef.current);
    timbreDirtyRef.current = false;
    setAudioOn(true);
  }, []);

  // editing the tape stops the tour and re-runs the lattice
  const cycleTile = useCallback((i: number) => {
    setTouring(false);
    setRule((prev) => {
      const next = [...prev];
      const cur = TURN_CYCLE.indexOf(next[i]);
      next[i] = TURN_CYCLE[(cur + 1) % TURN_CYCLE.length];
      return next;
    });
  }, []);

  const addState = useCallback(() => {
    setTouring(false);
    setRule((prev) => (prev.length >= 12 ? prev : [...prev, "L"]));
  }, []);
  const removeState = useCallback(() => {
    setTouring(false);
    setRule((prev) => (prev.length <= 2 ? prev : prev.slice(0, -1)));
  }, []);
  const reseed = useCallback(() => {
    turmiteRef.current?.reset();
    lastTourRef.current = performance.now();
  }, []);

  const pickPreset = useCallback((idx: number) => {
    setTouring(false);
    setTourIdx(idx);
    setRule(PRESETS[idx].rule.split("").map((c) => c as Turn));
  }, []);

  // keyboard: number keys pick presets, r reseeds, space toggles the tour
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < PRESETS.length) pickPreset(idx);
      } else if (e.key === "0") {
        if (PRESETS.length >= 10) pickPreset(9);
      } else if (e.key === "r" || e.key === "R") {
        reseed();
      } else if (e.key === " ") {
        e.preventDefault();
        setTouring((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickPreset, reseed]);

  const orderPct = Math.round(readout.order * 100);
  const regimeLabel =
    readout.order > 0.62 ? "ordered" : readout.order < 0.4 ? "chaotic" : "critical edge";
  const turmite = turmiteRef.current;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#050307] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* title */}
      <div className="pointer-events-none absolute left-0 top-0 max-w-xl p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Ruletape
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          One tiny agent on a lattice, its whole behaviour written as a short
          string of turn symbols. Rewrite the tape and the same machine flips
          between chaos, symmetry and a highway marching off forever. Play the
          boundary between order and chaos with your hands.
        </p>
      </div>

      {/* nav + notes */}
      <div className="absolute right-0 top-0 flex flex-col items-end gap-2 p-5 sm:p-7">
        <Link
          href="/dream"
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ↑ all prototypes
        </Link>
        <button
          onClick={() => setShowNotes(true)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* order meter — the criticality gauge */}
      <div className="pointer-events-none absolute left-5 top-36 w-64 sm:left-7 sm:top-44">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          order meter · {regimeLabel}
        </div>
        <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full border border-border">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, #b043e0 0%, #6366f1 45%, #8b5cf6 72%, #c4b5fd 100%)",
              opacity: 0.5,
            }}
          />
          <div
            className="absolute top-0 h-full w-1 rounded-full bg-card shadow-[0_0_8px_rgba(196,181,253,0.9)]"
            style={{ left: `calc(${orderPct}% - 2px)` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>chaos</span>
          <span className="text-foreground">{orderPct}</span>
          <span>order</span>
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          edge-density {readout.disorder.toFixed(2)} · fill {readout.activity.toFixed(2)} · steps{" "}
          {readout.steps.toLocaleString()}
        </div>
      </div>

      {/* bottom control deck */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
          {/* the ruletape as discrete SVG symbol tiles */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                ruletape · tap a tile to re-tune
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={removeState}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="remove a state"
                >
                  −
                </button>
                <button
                  onClick={addState}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/60 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="add a state"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {rule.map((turn, i) => (
                <button
                  key={i}
                  onClick={() => cycleTile(i)}
                  title={`state ${i}: ${TURN_LABEL[turn]}`}
                  className="group flex flex-col items-center gap-1 rounded-md border border-border bg-background/60 p-2 transition-colors hover:border-primary hover:bg-accent"
                >
                  <span
                    className="h-2.5 w-9 rounded-full"
                    style={{ background: turmite?.stateColour(i) ?? "#3a1d78" }}
                  />
                  <span className="text-foreground transition-colors group-hover:text-foreground">
                    <TurnGlyph turn={turn} />
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {turn}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* preset shelf */}
          <div>
            <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              preset shelf · keys 1–0
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p, i) => {
                const active = tourIdx === i && rule.join("") === p.rule;
                return (
                  <button
                    key={p.rule}
                    onClick={() => pickPreset(i)}
                    className={`min-h-[44px] rounded-md border px-3 text-left text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <span className="font-mono text-xs tracking-wide text-foreground">{p.rule}</span>
                    <span className="block text-[11px] text-muted-foreground">{p.regime}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* transport */}
          <div className="flex flex-wrap items-center gap-3">
            {!audioOn ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start — unlock sound & the auto-tour
              </button>
            ) : (
              <button
                onClick={() => setMuted((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-pressed={muted}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
            <button
              onClick={() => setTouring((v) => !v)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-pressed={touring}
            >
              {touring ? "Stop tour" : "Resume tour"}
            </button>
            <button
              onClick={reseed}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Re-seed (R)
            </button>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {touring ? "auto-touring presets" : "manual"}
            </span>
          </div>

          {noAudio && (
            <p className="text-sm text-destructive">
              Web Audio is unavailable in this browser — the lattice still runs and
              the order meter still reads, but there is no sound.
            </p>
          )}
          {!audioOn && !noAudio && (
            <p className="text-sm text-muted-foreground">
              The lattice is already self-playing. Sound and the preset tour join on
              Start. Headphones recommended.
            </p>
          )}
        </div>
      </div>

      {/* design notes */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The tape is the DNA
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A turmite is a generalized Langton&rsquo;s ant. Its whole behaviour
                is a <span className="text-primary">ruletape</span>: one turn symbol
                per cell-colour. On a cell of colour <em>s</em> the ant turns by{" "}
                <span className="font-mono">rule[s]</span> (left / right / u-turn /
                straight), repaints the cell to the next colour, and steps forward.
                That is the entire machine.
              </p>
              <p>
                The astonishing fact — the reason this is an instrument — is that a
                one-symbol edit flips the same machine between whole regimes:
                space-filling <span className="text-primary">chaos</span>, bilateral
                or spiral <span className="text-primary">symmetry</span>, or a
                self-repeating <span className="text-primary">highway</span> that
                marches off forever. Classic <span className="font-mono">RL</span>{" "}
                (Langton, 1986) wanders chaotically for ~10,000 steps and then, as if
                deciding, snaps into a highway — watch the order meter cross as it
                happens.
              </p>
              <p>
                Recent turmite theory shows the tape, not the machine, chooses the
                regime: arXiv <span className="font-mono">2505.05426</span>{" "}
                &ldquo;Sideways on the highways&rdquo; and{" "}
                <span className="font-mono">2506.10482</span> &ldquo;The LLLR
                generalised Langton&rsquo;s ant&rdquo; (both 2025) prove that
                generalized ants (LLRRRL, LLRLRLL, LLLR) admit <em>both</em> highway
                order and persistent chaos — the old &ldquo;a highway is
                inevitable&rdquo; conjecture fails for them.
              </p>
              <p>
                The framing: the Entropic Brain Hypothesis casts the visionary
                state as the brain moving toward{" "}
                <span className="text-primary">criticality</span> — the edge between
                order and chaos. Here you slide a system across that exact edge by
                editing a symbol string, and hear it: a chaotic tape is brighter,
                noisier, denser; an ordered tape is cleaner and groovier.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.14em]">
                state: criticality / order-chaos edge · pole: intense ↔ cosmic (the
                ruletape moves you across it)
              </p>
              <p>
                <span className="text-primary">Safety.</span> The lattice is redrawn
                from slowly-changing state every frame, so it accumulates smoothly —
                no full-frame flicker or strobe.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
