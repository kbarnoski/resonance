"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QuantumAudio } from "./audio";
import { QuantumViz } from "./viz";
import { QuantumEngine, midiToFreq } from "./engine";

// ════════════════════════════════════════════════════════════════════════════
// 2664 · Quantum Whispers
//
// Jam with musicians whose replies live in superposition — a shimmering cloud of
// possible answers that only collapses into one actual phrase on each downbeat,
// then teleports imperfectly to the next agent. One DIVERGENCE knob slides the
// ensemble from echoing you to diverging into its own strange music.
// Framing after arXiv:2607.19212 (see README) — implemented as plain
// deterministic rules, no quantum library / no ML / no network.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running";

// PLAYED keyboard → free 12-TET pitches. Home row A..; then top row Q..P.
const KEY_MIDI: Record<string, number> = {
  KeyA: 60,
  KeyS: 61,
  KeyD: 62,
  KeyF: 63,
  KeyG: 64,
  KeyH: 65,
  KeyJ: 66,
  KeyK: 67,
  KeyL: 68,
  Semicolon: 69,
  KeyQ: 70,
  KeyW: 71,
  KeyE: 72,
  KeyR: 73,
  KeyT: 74,
  KeyY: 75,
  KeyU: 76,
  KeyI: 77,
  KeyO: 78,
  KeyP: 79,
};

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRef = useRef<QuantumViz | null>(null);
  const audioRef = useRef<QuantumAudio | null>(null);
  const engineRef = useRef<QuantumEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedRef = useRef(false);
  const divergenceRef = useRef(0.35);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [divergence, setDivergence] = useState(0.35);

  // ── engine + audio (created once) ─────────────────────────────────────────
  if (!audioRef.current && typeof window !== "undefined") {
    audioRef.current = new QuantumAudio();
  }
  if (!engineRef.current) {
    engineRef.current = new QuantumEngine({
      playAgent: (i, freq, vel, delay) =>
        audioRef.current?.playAgent(i, freq, vel, delay),
      playGhost: (freq, vel, delay) => audioRef.current?.playGhost(freq, vel, delay),
    });
  }

  // ── WebGL2 init + render loop ─────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = readReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viz = new QuantumViz();
    if (!viz.init(canvas)) {
      setWebglOk(false);
      return;
    }
    vizRef.current = viz;

    const frame = () => {
      const now = performance.now();
      const engine = engineRef.current;
      if (engine && canvasRef.current) {
        engine.update(now);
        viz.draw(canvasRef.current, engine.agents, engine.threads, now, reducedRef.current);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      viz.dispose();
      vizRef.current = null;
    };
  }, []);

  // ── keyboard: PLAYED, always-on polyphony ─────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const midi = KEY_MIDI[e.code];
      if (midi === undefined) return;
      e.preventDefault();
      engineRef.current?.registerUserNote(midi, performance.now(), true);
      audioRef.current?.leadOn(e.code, midiToFreq(midi));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (KEY_MIDI[e.code] === undefined) return;
      audioRef.current?.leadOff(e.code);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── teardown audio on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const onStart = useCallback(async () => {
    try {
      await audioRef.current?.start();
    } catch (err) {
      console.error(err);
    }
    setPhase("running");
  }, []);

  const onDivergence = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    divergenceRef.current = v;
    engineRef.current?.setDivergence(v);
    setDivergence(v);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* WebGL2 unavailable → destructive notice + minimal fallback */}
      {!webglOk && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <p className="text-base font-medium text-destructive">
              WebGL2 is unavailable in this browser.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The wavefunction cloud cannot render, but the ensemble still runs
              headlessly: press Begin and play the home row (A S D F G H J K L ;)
              plus the top row — three agents collapse and teleport a note on
              every downbeat. Try a recent desktop Chrome, Edge or Firefox to see
              the shimmering clouds.
            </p>
            {phase === "idle" && (
              <button
                onClick={onStart}
                className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            )}
          </div>
        </div>
      )}

      {/* z-10 content column */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        {/* top row: label + notes button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Resonance · Dream Lab · 2664
            </p>
            {phase === "running" && (
              <p className="mt-1 text-base text-muted-foreground">
                divergence{" "}
                <span className="text-primary">{Math.round(divergence * 100)}</span>
                {" · "}
                {divergence < 0.34
                  ? "echoing you"
                  : divergence < 0.67
                    ? "drifting"
                    : "its own strange music"}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* hero block (idle only) */}
        {phase === "idle" && webglOk && (
          <div className="max-w-lg">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Quantum Whispers
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Jam with three musicians whose replies live in superposition — a
              shimmering cloud of possible notes that collapses into one actual
              phrase on every downbeat, then teleports, imperfectly, to the next.
            </p>
            <button
              onClick={onStart}
              className="pointer-events-auto mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        )}

        {/* bottom control bar (running) */}
        {phase === "running" && webglOk && (
          <div className="pointer-events-auto flex flex-col gap-3 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm sm:max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Divergence
            </p>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={divergence}
              onChange={onDivergence}
              aria-label="Divergence: imitation to divergence"
              className="w-full accent-primary"
            />
            <p className="text-base leading-relaxed text-muted-foreground">
              Play the home row{" "}
              <span className="text-foreground">A S D F G H J K L ;</span> and the
              top row <span className="text-foreground">Q W E R T Y U I O P</span>.
              Left = the agents echo you; right = they wander into their own
              attractors and detune. Leave it idle and a ghost keeps jamming.
            </p>
          </div>
        )}
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes · 2664
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Quantum Whispers
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Each of three agents holds a probability distribution — amplitudes —
              over a free 12-TET pitch grid. Every frame the distribution evolves
              toward a blend of your recent notes (imitation) and the agent&rsquo;s
              own seeded attractor (divergence). On each downbeat it{" "}
              <span className="text-foreground">collapses</span>: it samples one
              pitch and actually plays it, with a microtonal cent detune that grows
              with divergence — so the ensemble can genuinely sound bad. Then it{" "}
              <span className="text-foreground">teleports</span> a noisy copy of
              its state to a neighbour; that transfer noise is the expressive
              &ldquo;quantum whisper&rdquo;.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Framing after arXiv:2607.19212, &ldquo;Teleportation Game: Quantum
              Teleportation in Multi-Agent Systems for Interactive Music&rdquo;
              (2026) — realised here with plain deterministic rules (seeded
              mulberry32, no quantum library, no ML, no network). The agents
              cooperate and echo; they never trap or fight you.
            </p>
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
