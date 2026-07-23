"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { Choir, PITCH_NAMES, playShepardPair } from "./audio";

type Dir = "up" | "down";
type Stage = "idle" | "first" | "second" | "awaiting";

// Deterministic objective sequence: step around the chromatic circle C→C♯→D…
const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CHOIR_MIN_ANSWERS = 4; // "a handful" before the world starts singing

interface Peak {
  angleRad: number;
  pc: number;
  strength: number; // 0..1 how consistent the signature is
  net: number; // +rising … −falling, −1..1
}

/** Circular-statistics summary of the perceptual map: the axis of symmetry
 *  (peak pitch-class) where the listener's percept flips, plus a net lean. */
function computePeak(answers: (Dir | null)[]): Peak | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  let up = 0;
  for (let pc = 0; pc < 12; pc++) {
    const a = answers[pc];
    if (!a) continue;
    n++;
    const s = a === "up" ? 1 : -1;
    if (a === "up") up++;
    const ang = -Math.PI / 2 + (pc / 12) * Math.PI * 2;
    sx += s * Math.cos(ang);
    sy += s * Math.sin(ang);
  }
  if (n === 0) return null;
  const mag = Math.hypot(sx, sy) / n;
  const angleRad = Math.atan2(sy, sx);
  // nearest pitch-class to the resultant direction
  let best = 0;
  let bestD = Infinity;
  for (let pc = 0; pc < 12; pc++) {
    const ang = -Math.PI / 2 + (pc / 12) * Math.PI * 2;
    let d = Math.abs(((ang - angleRad + Math.PI) % (Math.PI * 2)) - Math.PI);
    d = Math.abs(d);
    if (d < bestD) {
      bestD = d;
      best = pc;
    }
  }
  return { angleRad, pc: best, strength: mag, net: (up * 2 - n) / n };
}

export default function TritoneVeilPage() {
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);

  const [currentPc, setCurrentPc] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [answers, setAnswers] = useState<(Dir | null)[]>(() =>
    Array<Dir | null>(12).fill(null),
  );

  // ── audio + loop refs (kept off React state so the rAF loop never re-subs) ──
  const ctxRef = useRef<AudioContext | null>(null);
  const choirRef = useRef<Choir | null>(null);
  const busRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelPairRef = useRef<(() => void) | null>(null);
  const stepTimerRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const runningRef = useRef(false);
  const answersRef = useRef<(Dir | null)[]>(Array<Dir | null>(12).fill(null));

  const answerCount = useMemo(
    () => answers.filter((a) => a != null).length,
    [answers],
  );
  const peak = useMemo(() => computePeak(answers), [answers]);

  // Schedule one objective stimulus (a tritone pair) and open the vote.
  const runStep = useCallback(() => {
    const ctx = ctxRef.current;
    const bus = busRef.current;
    if (!ctx || !bus || !runningRef.current) return;
    const pc = ORDER[seqRef.current % ORDER.length];
    setCurrentPc(pc);
    setStage("first");
    cancelPairRef.current?.();
    cancelPairRef.current = playShepardPair(ctx, bus, pc, {
      onFirst: () => setStage("first"),
      onSecond: () => setStage("second"),
      onDone: () => setStage("awaiting"),
    });
  }, []);

  const handleAnswer = useCallback(
    (dir: Dir) => {
      if (!runningRef.current) return;
      const pc = ORDER[seqRef.current % ORDER.length];
      const next = [...answersRef.current];
      next[pc] = dir;
      answersRef.current = next;
      setAnswers(next);
      seqRef.current += 1;
      setStage("idle");
      setCurrentPc(null);
      // brief breath, then the next objective pair
      if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
      stepTimerRef.current = window.setTimeout(() => runStep(), 420);
    },
    [runStep],
  );

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
    stepTimerRef.current = null;
    cancelPairRef.current?.();
    cancelPairRef.current = null;
    choirRef.current?.stop();
    choirRef.current = null;
    const c = ctxRef.current;
    if (c && c.state !== "closed") {
      window.setTimeout(() => {
        if (c.state !== "closed") void c.close();
      }, 800);
    }
    ctxRef.current = null;
    busRef.current = null;
    setRunning(false);
    setStage("idle");
    setCurrentPc(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    let ctx: AudioContext | null = null;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as any).webkitAudioContext;
      if (!Ctor) throw new Error("no webaudio");
      ctx = new Ctor();
      void ctx.resume();
    } catch {
      setAudioFailed(true);
      return;
    }
    setAudioFailed(false);
    ctxRef.current = ctx;

    // shared bus so a gentle limiter sits between synths and the speakers
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    bus.connect(comp);
    comp.connect(ctx.destination);
    busRef.current = bus;

    choirRef.current = new Choir(ctx, comp, 6);

    // reset the run
    seqRef.current = 0;
    answersRef.current = Array<Dir | null>(12).fill(null);
    setAnswers(Array<Dir | null>(12).fill(null));
    runningRef.current = true;
    setRunning(true);

    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const p = computePeak(answersRef.current);
      const count = answersRef.current.filter((a) => a != null).length;
      const choir = choirRef.current;
      if (choir) {
        // SUBJECTIVE axis drives the choir: direction = the listener's lean,
        // level fades in once a handful of percepts exist.
        choir.setDirection(p ? Math.max(-1, Math.min(1, p.net * 1.6)) : 0);
        choir.setLevel(
          count >= CHOIR_MIN_ANSWERS
            ? Math.min(1, (count - (CHOIR_MIN_ANSWERS - 1)) / 5)
            : 0,
        );
        choir.step(dt);
      }
      if (runningRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // first stimulus
    runStep();
  }, [runStep]);

  const stageLabel =
    stage === "first"
      ? "tone 1 sounding"
      : stage === "second"
        ? "tone 2 sounding"
        : stage === "awaiting"
          ? "which way did it move?"
          : running
            ? "…"
            : "idle";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-4 p-6">
        {/* ── header ─────────────────────────────────────────────────────── */}
        <header className="max-w-2xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tritone paradox · involuntary percept · self-portrait
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Tritone Veil
          </h1>
          <p className="text-base text-muted-foreground">
            Two octave-ambiguous tones a tritone apart. The pitch is objectively
            undecidable — yet you will hear each pair clearly{" "}
            <span className="text-foreground">rise</span> or{" "}
            <span className="text-foreground">fall</span>. That choice is
            involuntary and yours alone. Report what you hear and a choir fades in
            that sings only in your direction.
          </p>
        </header>

        {audioFailed && (
          <p className="max-w-2xl text-base text-destructive">
            Web Audio is unavailable in this browser, so no tones can be
            synthesised. The instrument needs an AudioContext to run.
          </p>
        )}

        {/* ── the two panels: objective map + subjective vote ─────────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
          {/* perceptual map (subjective signature over the objective circle) */}
          <div className="flex min-h-0 items-center justify-center">
            <PerceptualMap
              answers={answers}
              currentPc={currentPc}
              stage={stage}
              peak={peak}
            />
          </div>

          {/* controls column */}
          <div className="flex w-full flex-col justify-between gap-4 md:w-72">
            <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  stimulus
                </span>
                <span className="font-mono text-sm text-foreground">
                  {currentPc != null
                    ? `${PITCH_NAMES[currentPc]} → ${PITCH_NAMES[(currentPc + 6) % 12]}`
                    : "—"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{stageLabel}</p>

              {/* THE VOTE — subjective, involuntary percept */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleAnswer("up")}
                  disabled={stage !== "awaiting"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
                >
                  ▲ rose
                </button>
                <button
                  onClick={() => handleAnswer("down")}
                  disabled={stage !== "awaiting"}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
                >
                  ▼ fell
                </button>
              </div>
            </div>

            {/* signature readout — the payoff, the private axis */}
            <div className="space-y-2 rounded-lg border border-border bg-background/60 p-4">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                your signature
              </span>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">reported</span>
                <span className="tabular-nums text-foreground">
                  {answerCount} / 12
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">lean</span>
                <span className="text-foreground">
                  {peak && Math.abs(peak.net) > 0.05
                    ? peak.net > 0
                      ? "rising"
                      : "falling"
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">peak pitch-class</span>
                <span className="font-mono text-foreground">
                  {peak && peak.strength > 0.15 && answerCount >= 3
                    ? PITCH_NAMES[peak.pc]
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">choir</span>
                <span className="text-foreground">
                  {answerCount >= CHOIR_MIN_ANSWERS
                    ? peak && peak.net > 0.05
                      ? "ascending"
                      : peak && peak.net < -0.05
                        ? "descending"
                        : "hovering"
                    : "silent"}
                </span>
              </div>
            </div>

            {/* transport */}
            <div className="flex flex-wrap items-center gap-2">
              {!running ? (
                <button
                  onClick={start}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Tritone Veil — design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Diana Deutsch&apos;s <strong>tritone paradox</strong> (1986,
                1991): two Shepard tones a tritone (half-octave) apart are
                objectively ambiguous in pitch height, yet nearly everyone hears
                the pair as clearly rising or falling — and{" "}
                <em>which way is involuntary, stable within a person, and
                differs person-to-person</em>, correlating with the pitch range
                of one&apos;s own speaking voice and native dialect. No one can
                talk you out of your percept.
              </p>
              <p>
                Each tone is an <strong>octave-ambiguous Shepard tone</strong>:
                six octave-spaced sine partials under a fixed Gaussian envelope
                over log-frequency, so no single register dominates and rise vs.
                fall becomes undecidable (Shepard, 1964).
              </p>
              <p>
                <strong>Two genuinely independent variables — no master knob.</strong>{" "}
                The <em>objective</em> axis is which pitch-class pair is playing,
                a deterministic march around the chromatic circle. The{" "}
                <em>subjective</em> axis is your involuntary percept, your taps.
                These cannot be reduced to one dial — objective ambiguity versus
                private perception is the whole point. The map draws both at
                once: the sounding pair as a moving highlight, your reported
                directions as the filled nodes, and the diameter as the axis of
                symmetry (your peak pitch-class) computed by circular statistics.
              </p>
              <p>
                <strong>The payoff.</strong> After a handful of answers a
                spatialised choir of detuned Shepard-Risset voices fades in,
                panned across the stereo field, gliding endlessly in{" "}
                <em>your</em> direction — ascending if you tend to hear rising,
                descending if falling, hovering if you are genuinely split. If
                your lean flips, the room slowly turns to follow it.
              </p>
              <p>
                References: Diana Deutsch, &quot;The Tritone Paradox: An
                Influence of Language on Music Perception&quot; (1991) and{" "}
                <em>Musical Illusions and Paradoxes</em>; Roger Shepard, circular
                pitch (1964); Jean-Claude Risset, continuous glissando.
              </p>
              <p>
                Honest limits: the correlation with vocal pitch is statistical,
                not deterministic; a short session gives a coarse signature; the
                choir&apos;s spatialisation uses stereo panning rather than full
                HRTF.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2348-tritone-veil"]} />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PerceptualMap — live SVG-DOM diagram. Objective channel (moving highlight of
// the sounding pair) + subjective channel (filled up/down nodes) + the signature
// axis. Clinical monochrome; one restrained accent for the listener's lean.
// ─────────────────────────────────────────────────────────────────────────────
function PerceptualMap({
  answers,
  currentPc,
  stage,
  peak,
}: {
  answers: (Dir | null)[];
  currentPc: number | null;
  stage: Stage;
  peak: Peak | null;
}) {
  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;

  const pos = (pc: number, r = R) => {
    const ang = -Math.PI / 2 + (pc / 12) * Math.PI * 2;
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), ang };
  };

  // endpoints of the signature axis (diameter through the resultant direction)
  const axis = peak
    ? {
        x1: cx + R * 1.05 * Math.cos(peak.angleRad),
        y1: cy + R * 1.05 * Math.sin(peak.angleRad),
        x2: cx - R * 1.05 * Math.cos(peak.angleRad),
        y2: cy - R * 1.05 * Math.sin(peak.angleRad),
      }
    : null;

  const leanUp = peak ? peak.net > 0.05 : false;
  const leanDown = peak ? peak.net < -0.05 : false;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-full max-h-[64vh] w-full max-w-[64vh]"
      role="img"
      aria-label="Perceptual map: your reported rise/fall percept for each pitch-class"
    >
      {/* chromatic circle */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        className="fill-none stroke-border"
        strokeWidth={1}
      />
      <circle
        cx={cx}
        cy={cy}
        r={R * 0.62}
        className="fill-none stroke-border"
        strokeWidth={0.5}
        strokeDasharray="2 5"
      />

      {/* signature axis of symmetry — the private peak pitch-class */}
      {axis && peak && peak.strength > 0.12 && (
        <line
          x1={axis.x1}
          y1={axis.y1}
          x2={axis.x2}
          y2={axis.y2}
          className={
            leanUp
              ? "stroke-primary"
              : leanDown
                ? "stroke-primary"
                : "stroke-muted-foreground"
          }
          strokeWidth={1.5}
          strokeOpacity={0.5}
          strokeDasharray="4 4"
        />
      )}

      {/* spokes + pitch-class nodes */}
      {Array.from({ length: 12 }, (_, pc) => {
        const p = pos(pc);
        const inner = pos(pc, R * 0.86);
        const a = answers[pc];
        const isCurrent = pc === currentPc;
        const nodeR = isCurrent ? 13 : 9;
        return (
          <g key={pc}>
            <line
              x1={cx}
              y1={cy}
              x2={inner.x}
              y2={inner.y}
              className="stroke-border"
              strokeWidth={0.5}
              strokeOpacity={0.4}
            />
            {/* objective highlight ring for the sounding pair */}
            {isCurrent && (
              <circle
                cx={p.x}
                cy={p.y}
                r={nodeR + 7}
                className="fill-none stroke-foreground"
                strokeWidth={1.5}
                strokeOpacity={stage === "awaiting" ? 0.9 : 0.45}
              >
                {stage !== "awaiting" && stage !== "idle" && (
                  <animate
                    attributeName="r"
                    values={`${nodeR + 5};${nodeR + 12};${nodeR + 5}`}
                    dur="1s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            )}
            {/* the reported percept node */}
            <circle
              cx={p.x}
              cy={p.y}
              r={nodeR}
              className={
                a === "up"
                  ? "fill-primary stroke-primary"
                  : a === "down"
                    ? "fill-none stroke-foreground"
                    : "fill-muted stroke-border"
              }
              strokeWidth={a === "down" ? 1.5 : 1}
              fillOpacity={a === "up" ? 0.9 : a === "down" ? 0 : 0.25}
            />
            {a && (
              <text
                x={p.x}
                y={p.y}
                dy="0.02em"
                textAnchor="middle"
                dominantBaseline="central"
                className={
                  a === "up" ? "fill-primary-foreground" : "fill-foreground"
                }
                fontSize={11}
              >
                {a === "up" ? "▲" : "▼"}
              </text>
            )}
            {/* pitch-class name outside the ring */}
            <text
              x={pos(pc, R + 26).x}
              y={pos(pc, R + 26).y}
              textAnchor="middle"
              dominantBaseline="central"
              className={
                isCurrent ? "fill-foreground" : "fill-muted-foreground"
              }
              fontSize={13}
              fontFamily="var(--font-geist-mono, monospace)"
            >
              {PITCH_NAMES[pc]}
            </text>
          </g>
        );
      })}

      {/* center label */}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={11}
        fontFamily="var(--font-geist-mono, monospace)"
      >
        {peak && peak.strength > 0.15
          ? leanUp
            ? "RISING WORLD"
            : leanDown
              ? "FALLING WORLD"
              : "SPLIT"
          : "LISTEN"}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize={9}
        fillOpacity={0.7}
        fontFamily="var(--font-geist-mono, monospace)"
      >
        {peak ? `axis ${PITCH_NAMES[peak.pc]}` : "—"}
      </text>
    </svg>
  );
}
