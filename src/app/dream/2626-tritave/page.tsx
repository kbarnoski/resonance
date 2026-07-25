"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BpSynth,
  CHORDS,
  CENTS_PER_STEP,
  LAMBDA_STEPS,
  OCTAVE_STEP,
  STEP_RATIO,
  STEPS_PER_TRITAVE,
  freq,
  identifyChord,
} from "./bp";

// ─── Instrument config ───────────────────────────────────────────────────────
const BASE = 220; // tonic (step 0), A3

// QWERTY → BP steps. Two rows span a tritave-and-a-bit (steps 0‥15).
const BOTTOM = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const TOP = ["q", "w", "e", "r", "t", "y"];
const KEY_STEPS: { key: string; step: number }[] = [
  ...BOTTOM.map((key, i) => ({ key, step: i })),
  ...TOP.map((key, i) => ({ key, step: 10 + i })),
];
const KEY_LABEL: Record<string, string> = { ";": ";" };

// ─── SVG spiral geometry ─────────────────────────────────────────────────────
// One full turn == one tritave (13 steps). So the ordinary octave (2:1) lands
// mid-turn and visibly does NOT close — the whole point of BP.
const CX = 290;
const CY = 300;
const R0 = 46;
const DR = 13.2;

function polar(step: number): { x: number; y: number } {
  const ang = -Math.PI / 2 + (step / STEPS_PER_TRITAVE) * 2 * Math.PI;
  const r = R0 + step * DR;
  return { x: CX + r * Math.cos(ang), y: CY + r * Math.sin(ang) };
}

function makeSpiralPath(from: number, to: number): string {
  let d = "";
  for (let s = from; s <= to; s += 0.08) {
    const { x, y } = polar(s);
    d += `${d ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return d.trim();
}

// ─── Minimal Web MIDI typing (avoids DOM lib dependency) ─────────────────────
interface MidiInput {
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface MidiAccess {
  inputs: { forEach: (cb: (i: MidiInput) => void) => void };
  onstatechange: (() => void) | null;
}
interface MidiNavigator {
  requestMIDIAccess?: () => Promise<MidiAccess>;
}

type MidiStatus = "unknown" | "unavailable" | "live";

export default function TritavePage() {
  const [started, setStarted] = useState(false);
  const [activeSteps, setActiveSteps] = useState<number[]>([]);
  const [autoplaying, setAutoplaying] = useState(false);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("unknown");

  const synthRef = useRef<BpSynth | null>(null);
  const downKeysRef = useRef<Set<string>>(new Set());
  const pointerStepsRef = useRef<Set<number>>(new Set());
  const idleTimerRef = useRef<number | null>(null);
  const autoTimersRef = useRef<number[]>([]);
  const autoActiveRef = useRef(false);
  const disposedRef = useRef(false);

  // ── note on / off (shared by keyboard, MIDI, pointer, autopilot) ──────────
  const pressStep = useCallback((step: number) => {
    const s = synthRef.current;
    if (!s) return;
    s.noteOn(step, BASE);
    setActiveSteps((prev) =>
      prev.includes(step) ? prev : [...prev, step].sort((a, b) => a - b)
    );
  }, []);

  const releaseStep = useCallback((step: number) => {
    const s = synthRef.current;
    if (!s) return;
    s.noteOff(step);
    setActiveSteps((prev) => prev.filter((x) => x !== step));
  }, []);

  // ── idle autopilot: deterministic BP self-demo ────────────────────────────
  const clearAuto = useCallback(() => {
    for (const t of autoTimersRef.current) clearTimeout(t);
    autoTimersRef.current = [];
    if (autoActiveRef.current) {
      autoActiveRef.current = false;
      setAutoplaying(false);
      // release anything the autopilot may have left ringing
      const s = synthRef.current;
      if (s) for (const step of s.activeSteps()) releaseStep(step);
    }
  }, [releaseStep]);

  const bumpIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      // Lambda-scale run, then the 3:5:7 "BP major" chord.
      const s = synthRef.current;
      if (!s || disposedRef.current) return;
      autoActiveRef.current = true;
      setAutoplaying(true);
      const timers = autoTimersRef.current;
      const at = (ms: number, fn: () => void) =>
        timers.push(window.setTimeout(fn, ms));
      const dur = 300;
      LAMBDA_STEPS.forEach((step, i) => {
        at(i * dur, () => pressStep(step));
        at(i * dur + dur * 0.82, () => releaseStep(step));
      });
      const tChord = LAMBDA_STEPS.length * dur + 250;
      const chord = [0, 6, 10]; // 3:5:7
      at(tChord, () => chord.forEach((c) => pressStep(c)));
      at(tChord + 1600, () => chord.forEach((c) => releaseStep(c)));
      at(tChord + 2050, () => {
        autoActiveRef.current = false;
        setAutoplaying(false);
        bumpIdle();
      });
    }, 4000);
  }, [pressStep, releaseStep]);

  // any human input cancels autopilot and resets the idle countdown
  const onUserInput = useCallback(() => {
    if (autoActiveRef.current) clearAuto();
    bumpIdle();
  }, [clearAuto, bumpIdle]);

  // ── Web MIDI (silent degrade) ─────────────────────────────────────────────
  const initMidi = useCallback(() => {
    const nav = navigator as unknown as MidiNavigator;
    if (!nav.requestMIDIAccess) {
      setMidiStatus("unavailable");
      return;
    }
    nav
      .requestMIDIAccess()
      .then((access) => {
        if (disposedRef.current) return;
        setMidiStatus("live");
        const onMidi = (e: { data: Uint8Array }) => {
          const [status, note, vel] = e.data;
          const cmd = status & 0xf0;
          const step = note - 60; // remap MIDI note number onto BP lattice
          if (cmd === 0x90 && vel > 0) {
            onUserInput();
            pressStep(step);
          } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
            releaseStep(step);
          }
        };
        const attach = () => access.inputs.forEach((i) => (i.onmidimessage = onMidi));
        attach();
        access.onstatechange = attach;
      })
      .catch(() => setMidiStatus("unavailable"));
  }, [onUserInput, pressStep, releaseStep]);

  const start = useCallback(async () => {
    if (synthRef.current) return;
    const synth = new BpSynth();
    synthRef.current = synth;
    await synth.resume();
    if (disposedRef.current) {
      synth.dispose();
      return;
    }
    setStarted(true);
    initMidi();
    bumpIdle();
  }, [initMidi, bumpIdle]);

  // ── keyboard listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const entry = KEY_STEPS.find((x) => x.key === k);
      if (!entry) return;
      e.preventDefault();
      if (downKeysRef.current.has(k)) return;
      downKeysRef.current.add(k);
      onUserInput();
      pressStep(entry.step);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const entry = KEY_STEPS.find((x) => x.key === k);
      if (!entry) return;
      downKeysRef.current.delete(k);
      releaseStep(entry.step);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [started, onUserInput, pressStep, releaseStep]);

  // ── global pointerup releases tapped SVG keys ─────────────────────────────
  useEffect(() => {
    const onUp = () => {
      for (const step of pointerStepsRef.current) releaseStep(step);
      pointerStepsRef.current.clear();
    };
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [releaseStep]);

  // ── teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const t of autoTimersRef.current) clearTimeout(t);
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  // ── tap-a-chord presets ───────────────────────────────────────────────────
  const playChord = useCallback(
    (steps: number[]) => {
      onUserInput();
      steps.forEach((s) => pressStep(s));
      window.setTimeout(() => steps.forEach((s) => releaseStep(s)), 1300);
    },
    [onUserInput, pressStep, releaseStep]
  );

  // ── derived visuals ───────────────────────────────────────────────────────
  const spiralPath = useMemo(() => makeSpiralPath(0, 15.4), []);
  const nodes = useMemo(
    () =>
      KEY_STEPS.map(({ key, step }) => ({
        key,
        step,
        ...polar(step),
        lambda: (LAMBDA_STEPS as readonly number[]).includes(step % STEPS_PER_TRITAVE),
      })),
    []
  );
  const octPt = useMemo(() => polar(OCTAVE_STEP), []);
  const tritavePt = useMemo(() => polar(STEPS_PER_TRITAVE), []);
  const heldChord = identifyChord(activeSteps);

  const activeSet = useMemo(() => new Set(activeSteps), [activeSteps]);

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-background text-foreground px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Bohlen–Pierce · non-octave instrument
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tritave</h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A playable microtonal keyboard with{" "}
          <span className="text-foreground">no octaves</span>. Its interval of
          equivalence is the tritave — the 3:1 twelfth — split into 13 equal
          steps of ≈146.3 cents. Built on odd harmonics, it can sound
          consonant, and it is allowed to sound dangerous.
        </p>

        {!started ? (
          <button
            onClick={start}
            className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start instrument
          </button>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {CHORDS.map((c) => (
              <button
                key={c.id}
                onClick={() => playChord(c.steps)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {c.name}{" "}
                <span className="font-mono text-xs text-primary">{c.ratio}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          {/* ── SVG tritave lattice ─────────────────────────────────────── */}
          <div className="rounded-lg border border-border bg-muted/30 p-2">
            <svg
              viewBox="0 0 580 600"
              className="mx-auto block h-auto w-full max-w-[520px]"
              role="img"
              aria-label="Bohlen–Pierce tritave spiral: 13 unequal-looking steps that close at a 3:1 tritave, not at the 2:1 octave."
            >
              {/* the spiral: one turn == one tritave */}
              <path
                d={spiralPath}
                fill="none"
                stroke="#3f3f5a"
                strokeWidth={2}
                strokeLinecap="round"
              />

              {/* where the 2:1 octave WOULD be — it does not close the turn */}
              <line
                x1={CX}
                y1={CY}
                x2={octPt.x}
                y2={octPt.y}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="4 5"
                opacity={0.8}
              />
              <text
                x={octPt.x + 8}
                y={octPt.y + 4}
                fill="#f59e0b"
                fontSize={11}
                fontFamily="monospace"
              >
                2:1 octave — never closes
              </text>

              {/* the tritave: exactly one full turn (step 13 == base × 3) */}
              <line
                x1={CX}
                y1={CY}
                x2={tritavePt.x}
                y2={tritavePt.y}
                stroke="#8b5cf6"
                strokeWidth={1.5}
                strokeDasharray="2 4"
                opacity={0.7}
              />
              <text
                x={tritavePt.x + 8}
                y={tritavePt.y - 6}
                fill="#a78bfa"
                fontSize={11}
                fontFamily="monospace"
              >
                3:1 tritave = 1 turn
              </text>

              {/* step nodes */}
              {nodes.map((n) => {
                const on = activeSet.has(n.step);
                const r = n.lambda ? 15 : 10;
                return (
                  <g
                    key={n.step}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onUserInput();
                      pointerStepsRef.current.add(n.step);
                      pressStep(n.step);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {on && (
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r + 12}
                        fill="#8b5cf6"
                        opacity={0.28}
                      />
                    )}
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={r}
                      fill={on ? "#a78bfa" : n.lambda ? "#26263a" : "#1c1c2b"}
                      stroke={on ? "#c4b5fd" : n.lambda ? "#4b4b6a" : "#33334d"}
                      strokeWidth={n.lambda ? 2 : 1}
                    />
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontFamily="monospace"
                      fill={on ? "#1a1030" : "#8b8bb0"}
                    >
                      {(KEY_LABEL[n.key] ?? n.key).toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {/* center label */}
              <text
                x={CX}
                y={CY - 4}
                textAnchor="middle"
                fontSize={12}
                fontFamily="monospace"
                fill="#6b6b8a"
              >
                13-EDT
              </text>
              <text
                x={CX}
                y={CY + 12}
                textAnchor="middle"
                fontSize={10}
                fontFamily="monospace"
                fill="#55556f"
              >
                3^(1/13)
              </text>
            </svg>
          </div>

          {/* ── readout panel ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Now sounding
              </p>
              {activeSteps.length === 0 ? (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {started
                    ? "Silence. Idle for 4s and it self-demos a Bohlen–Pierce phrase."
                    : "Press Start, then play the keyboard rows."}
                </p>
              ) : (
                <div className="mt-2">
                  {heldChord && (
                    <p className="text-base">
                      {heldChord.name}{" "}
                      <span className="font-mono text-sm text-primary">
                        {heldChord.ratio}
                      </span>
                    </p>
                  )}
                  <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
                    {activeSteps.map((s) => (
                      <li key={s}>
                        step {s} · {freq(BASE, s).toFixed(1)} Hz
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Input modes
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>
                  <span className="text-foreground">Keyboard</span> ·{" "}
                  {started ? "live" : "on start"} — rows{" "}
                  <span className="font-mono text-xs">A‥;</span> /{" "}
                  <span className="font-mono text-xs">Q‥Y</span>
                </li>
                <li>
                  <span className="text-foreground">MIDI</span> ·{" "}
                  {midiStatus === "live"
                    ? "live — note 60 = tonic"
                    : midiStatus === "unavailable"
                    ? "unavailable"
                    : "—"}
                </li>
                <li>
                  <span className="text-foreground">Tap</span> · SVG keys
                  (secondary)
                </li>
              </ul>
              {autoplaying && (
                <p className="mt-3 font-mono text-xs text-primary">
                  ● autopilot: Lambda run → 3:5:7
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Tuning
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                <li>step ratio {STEP_RATIO.toFixed(6)}</li>
                <li>{CENTS_PER_STEP.toFixed(2)} cents / step</li>
                <li>13 steps = 3:1 tritave (exact)</li>
                <li>tonic {BASE} Hz</li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Big nodes are the 9-note Lambda mode; small nodes are the chromatic
          infill. Timbre is additive with strong odd partials (3rd, 5th, 7th,
          9th) so BP&rsquo;s real 3:5:7 consonance can lock — and its clusters
          genuinely bite. Refs: Heinz Bohlen (1978); Max Mathews &amp; John
          Pierce; Xenharmonic Wiki, &ldquo;Bohlen–Pierce scale.&rdquo;
        </p>
      </div>
    </div>
  );
}
