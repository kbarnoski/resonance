"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ThomasAttractor, B_MIN, B_MAX, clampB } from "./attractor";
import { CanonEngine } from "./audio";
import { createRenderer, type Renderer } from "./renderer";

type Phase = "idle" | "live";
type InputMode = "auto" | "tilt" | "pointer";

const NOTES_MD = `# Strange Canon — design notes

## The one question

What if a chaotic dynamical system were the COMPOSER? René Thomas' cyclically-
symmetric attractor wanders forever without repeating; here that single
deterministic trajectory IS the score AND the visual at once.

## The René Thomas attractor

dx/dt = sin(y) − b·x, dy/dt = sin(z) − b·y, dz/dt = sin(x) − b·z.
Integrated with classic RK4 at dt ≈ 0.02. The dissipation constant b is the only
knob; inside the band b ∈ [0.12, 0.21] the flow is chaotic and space-filling.
Outside it collapses to a limit cycle or a fixed point — so we clamp.

## The signature — a delayed-reader canon

Four voices read the SAME trajectory history buffer at staggered delays
(0 / 1.5 / 3.0 / 4.5 s), each transposed to a just interval (1 · 3/2 · 5/4·2 ·
3/2·2). A strict canon over a line that never exactly repeats. Per voice:
x → just-intonation pitch, z → filter cutoff, y → stereo pan. Notes fire on a
rising zero-crossing of x, so they are musically spaced, not one-per-frame.

## Perturbation & bifurcation

Tilt (device orientation) or pointer position nudges b within [0.12, 0.21] —
this is a bifurcation nudge, not drag-to-sculpt. Pushing b toward 0.21 audibly
tightens the chaos toward periodicity. With zero input the piece still evolves,
sounds, and moves entirely on its own.

## The WebGL2 render

Raw WebGL2 (no three.js): the history buffer is drawn as an additive
SRC_ALPHA→ONE gl.LINE_STRIP through an auto-rotating perspective camera, coloured
by instantaneous speed (slow = cyan/violet, fast = gold), with point-sprite
glow on the newest samples and a soft marker at each voice's read-head.

## References

- René Thomas, "Deterministic chaos seen in terms of feedback circuits" (1999).
- E. N. Lorenz, "Deterministic Nonperiodic Flow" (1963).
- R. Bidlack, "Musical Attractors: A New Method for Audio Synthesis" (CMJ).
- SYTHM / "Sound, Given a Body" (Symphoenix, Medium, Jun 2026) — the attractor
  as hidden conductor.

## Next-cycle deepening

- Per-voice independent b so the canon can bifurcate against itself.
- Poincaré-section triggering for sparser, more deliberate phrasing.
- GPU integration (transform feedback) to push the history buffer to 100k points.
- A second attractor (Aizawa / Halvorsen) as a modulation cross-voice.`;

function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-violet-300">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base text-muted-foreground">
          {line.slice(2)}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-muted-foreground">
        {line}
      </p>
    );
  });
}

export default function StrangeCanonPage() {
  const engineRef = useRef<CanonEngine | null>(null);
  const attractorRef = useRef<ThomasAttractor | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // Perturbation target (0..1 across the b band), smoothed toward b each tick.
  const bTargetRef = useRef<number>(0.6);
  const inputModeRef = useRef<InputMode>("auto");

  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingGL, setUsingGL] = useState(true);
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [bValue, setBValue] = useState(0.19);

  const setModeBoth = useCallback((m: InputMode) => {
    inputModeRef.current = m;
    setInputMode(m);
  }, []);

  const begin = useCallback(async () => {
    if (engineRef.current) return;
    setError(null);

    const attractor = new ThomasAttractor({ b: 0.19, dt: 0.02, capacity: 6000 });
    attractorRef.current = attractor;

    let engine: CanonEngine;
    try {
      engine = await CanonEngine.create(attractor);
    } catch {
      setError("Audio could not start in this browser.");
      return;
    }
    engineRef.current = engine;
    engine.start();
    setPhase("live");

    // Try device orientation for tilt perturbation (never required).
    type OrientEvt = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const DOE = (window as unknown as { DeviceOrientationEvent?: OrientEvt })
      .DeviceOrientationEvent;
    if (DOE) {
      const attach = () => {
        window.addEventListener("deviceorientation", onOrient);
      };
      if (typeof DOE.requestPermission === "function") {
        try {
          const res = await DOE.requestPermission();
          if (res === "granted") attach();
        } catch {
          /* stay in auto/pointer */
        }
      } else {
        attach();
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const r = createRenderer(canvas);
      rendererRef.current = r;
      setUsingGL(r.usingGL);
      const tick = (tMs: number) => {
        const a = attractorRef.current;
        const e = engineRef.current;
        const ren = rendererRef.current;
        if (a && e && ren) {
          // Smooth b toward the perturbation target within the safe band.
          const targetB = clampB(B_MIN + (B_MAX - B_MIN) * bTargetRef.current);
          const nextB = a.getB() + (targetB - a.getB()) * 0.02;
          a.setB(nextB);
          setBValue(nextB);
          ren.frame(a, e.heads(), tMs);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device-orientation handler (gamma ~ left/right tilt → b target).
  const onOrient = useCallback((ev: DeviceOrientationEvent) => {
    if (ev.gamma === null && ev.beta === null) return;
    inputModeRef.current = "tilt";
    setInputMode("tilt");
    const g = ev.gamma ?? 0; // -90..90
    bTargetRef.current = Math.min(1, Math.max(0, (g + 45) / 90));
  }, []);

  // Pointer perturbation (used when no live tilt).
  const onPointer = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      if (inputModeRef.current === "tilt") return;
      setModeBoth("pointer");
      const rect = ev.currentTarget.getBoundingClientRect();
      const nx = (ev.clientX - rect.left) / Math.max(1, rect.width);
      bTargetRef.current = Math.min(1, Math.max(0, nx));
    },
    [setModeBoth],
  );

  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      void engineRef.current?.dispose();
      engineRef.current = null;
      attractorRef.current = null;
    };
  }, [onOrient]);

  const bPct = Math.round(((bValue - B_MIN) / (B_MAX - B_MIN)) * 100);
  const inputLabel =
    inputMode === "tilt"
      ? "tilt (device orientation)"
      : inputMode === "pointer"
        ? "pointer"
        : "autonomous (no input)";

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#040308] text-foreground"
      onPointerMove={phase === "live" ? onPointer : undefined}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: phase === "live" ? "block" : "none" }}
      />

      <header className="relative z-10 mx-auto max-w-2xl px-6 pt-10">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
          dream · 1076
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Strange Canon
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
          A chaotic attractor is the{" "}
          <span className="text-violet-300">composer</span>: one deterministic,
          never-repeating trajectory becomes both the score and the light, read
          by four delayed voices as a strict canon over an aperiodic line.
        </p>
      </header>

      <section className="relative z-10 mx-auto flex max-w-2xl flex-col items-center px-6 pb-32 pt-8">
        {phase === "idle" ? (
          <div className="mt-6 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => void begin()}
              className="min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/20 px-6 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-500/30"
            >
              Begin
            </button>
            <p className="max-w-md text-center text-base text-muted-foreground">
              Plays and moves entirely on its own. Tilt your device — or move the
              pointer — to nudge the chaos constant and hear the canon bifurcate.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-base text-violet-300/95">
              <span aria-hidden>●</span>
              input · {inputLabel}
            </span>

            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[40px] font-light leading-none tabular-nums text-foreground">
                {bValue.toFixed(3)}
              </span>
              <span className="text-xl text-muted-foreground">b</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-2 w-52 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-300 via-violet-300 to-violet-300 transition-[width] duration-200"
                  style={{ width: `${bPct}%` }}
                />
              </div>
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                chaos constant · {B_MIN}–{B_MAX}
              </span>
            </div>

            <p className="max-w-md text-center text-base text-muted-foreground">
              Four voices trail the same line at 0 / 1.5 / 3.0 / 4.5 s. Nudge{" "}
              <span className="text-violet-300">b</span> toward {B_MAX} and the
              chaos tightens toward a cycle.
            </p>

            {!usingGL && (
              <p className="text-base text-violet-300">
                WebGL2 unavailable — showing the Canvas2D ribbon fallback. Audio
                is still playing.
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-base text-violet-300">{error}</p>}
      </section>

      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="fixed right-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/70 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-black/85 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-6 py-16">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-6 min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-muted-foreground hover:text-foreground"
            >
              ← Close
            </button>
            <article className="space-y-1">{renderNotes(NOTES_MD)}</article>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1076-strange-canon"]} />
    </main>
  );
}
