"use client";

// ════════════════════════════════════════════════════════════════════════════
// 1257-lattice — "Lattice".
//
// THE QUESTION: What if the living, breathing "realm-membrane" of the DMT
// breakthrough could be *grown in real time* by a GPU reaction-diffusion field,
// warped into psychedelic honeycomb geometry?
//
// A Gray-Scott reaction-diffusion simulation (Turing morphogenesis) runs on the
// GPU via ping-pong framebuffers. A stateful phase arc sweeps the feed/kill
// parameters through Pearson's regimes — sparse spots (BLOOM) -> self-
// replicating mitosis (GROWTH) -> a dense maze/labyrinth (SATURATION) -> a
// coherent realm that holds (BREAKTHROUGH), then re-seeds and rises again. The
// V field is warped through log-polar honeycomb symmetry (the shared cortical
// engine) and rendered with thin-film iridescence on a luminous nacre ground.
// A rising Shepard-Risset glissando + drone bed carries the ascent. Mic energy
// is neural gain: louder room -> faster reaction; onsets seed new growth.
//
// state: DMT realm / morphogenesis · pole: intense (breakthrough ascent)
// See README.md for the full design notes and named references.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { createSafeFlicker, type SafeFlicker } from "../_shared/psych/safeFlicker";
import { ReactionField, computeArc, mulberry32 } from "./sim";
import { AscentAudio } from "./audio";

type Phase = "idle" | "live" | "unsupported";

export default function LatticePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<ReactionField | null>(null);
  const audioRef = useRef<AscentAudio | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const rafRef = useRef(0);
  const startWallRef = useRef<number | null>(null); // arc clock; null until Begin
  const lastTimeRef = useRef(0);
  const lastCycleRef = useRef(0);
  const nextSeedRef = useRef(0);
  const lastHudRef = useRef(0);
  const rngRef = useRef<() => number>(mulberry32(0x1257));

  const mic = useMicAnalyser({ smoothing: 0.8 });
  const micRef = useRef(mic);
  micRef.current = mic;

  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [breathe, setBreathe] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState("Bloom");
  const [progress, setProgress] = useState(0);
  const [renderMode, setRenderMode] = useState<string>("");

  // ── Init: the field lives and simmers immediately (never a blank canvas). ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let field: ReactionField;
    try {
      field = new ReactionField(canvas);
    } catch (e) {
      console.error(e);
      setPhase("unsupported");
      setNotice(
        "WebGL2 is unavailable in this browser, so the reaction-diffusion field cannot grow. Try a recent desktop Chrome, Edge, or Firefox."
      );
      return;
    }
    fieldRef.current = field;
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.6 });
    setRenderMode(field.usesFloat ? "float16" : "8-bit");

    let dims = field.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    const applyResize = () => {
      dims = field.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    };
    window.addEventListener("resize", applyResize);

    lastTimeRef.current = performance.now();
    nextSeedRef.current = 0;

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const f = fieldRef.current;
      if (!f) return;

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      // Arc clock only advances after Begin; before that it holds at BLOOM and
      // the field quietly simmers.
      const started = startWallRef.current !== null;
      const elapsed = started ? (now - (startWallRef.current as number)) / 1000 : 0;
      const arc = computeArc(elapsed);

      // Re-seed at the start of each new loop (fresh BLOOM).
      if (arc.cycle !== lastCycleRef.current) {
        lastCycleRef.current = arc.cycle;
        f.reset();
      }

      // Mic neural gain: louder room -> more sub-steps (faster reaction).
      const m = micRef.current;
      let amp = 0;
      let onset = false;
      if (m.running) {
        const frame = m.getFrame();
        if (frame) {
          amp = frame.amplitude;
          onset = frame.onset;
        }
      }

      // Seed pulses: onsets, plus a slow auto-seed so the membrane always has
      // fresh growth even with no mic (LFO fallback).
      let seed: [number, number, number, number] | null = null;
      const rng = rngRef.current;
      const wantAuto = elapsed >= nextSeedRef.current;
      if (onset || wantAuto) {
        // Bias seeds toward the center early, spreading outward as it grows.
        const spread = 0.12 + 0.32 * Math.min(1, arc.progress * 2.5);
        const ang = rng() * 6.2831853;
        const rr = spread * Math.sqrt(rng());
        const cx = 0.5 + Math.cos(ang) * rr;
        const cy = 0.5 + Math.sin(ang) * rr;
        const amt = onset ? 0.35 + amp * 0.4 : 0.28;
        seed = [cx, cy, 0.05 + rng() * 0.04, amt];
        if (wantAuto) {
          nextSeedRef.current = elapsed + (m.running ? 5.5 : 3.2) + rng() * 2.5;
        }
      }

      // Sub-step count = base + neural gain. Capped for perf.
      const subSteps = Math.min(14, Math.round(6 + amp * 8));
      f.step(subSteps, { F: arc.F, K: arc.K, dt: 1.0, seed });

      // Safe luminance breathing (opt-in, OFF by default).
      const flick = flickerRef.current;
      const fl = flick ? flick.value(now / 1000) : 1;

      f.draw(dims.w, dims.h, {
        time: elapsed,
        symmetry: arc.symmetry,
        saturation: arc.saturation,
        brightness: arc.brightness,
        scale: arc.scale,
        flow: arc.flow,
        irid: arc.irid,
        flicker: fl,
      });

      // Audio: drive from the arc plus a touch of live mic energy.
      const audio = audioRef.current;
      if (audio && audio.running) {
        audio.update(dt, Math.min(1, arc.drive + amp * 0.25));
      }

      // Throttle React HUD updates.
      if (now - lastHudRef.current > 180) {
        lastHudRef.current = now;
        setPhaseLabel(arc.label);
        setProgress(arc.progress);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
      flickerRef.current?.kill();
      field.dispose();
      fieldRef.current = null;
    };
  }, []);

  // ── Full audio teardown on unmount. ───────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  // ── Begin: create AudioContext + start the ascent + open the mic. ─────────
  const begin = useCallback(async () => {
    if (phase === "live") return;
    startWallRef.current = performance.now();
    lastCycleRef.current = 0;
    nextSeedRef.current = 0;

    // Audio (gesture-gated).
    try {
      const audio = new AscentAudio();
      await audio.start();
      audioRef.current = audio;
      setNotice(null);
    } catch (e) {
      console.error(e);
      setNotice("Audio could not start — the field still grows in silence.");
    }

    // Mic (gesture-gated); graceful fallback to the internal LFO auto-seeding.
    try {
      await micRef.current.start();
      setMicNotice(null);
    } catch {
      setMicNotice(
        "Microphone unavailable — the membrane self-drives on its internal rhythm."
      );
    }

    setPhase("live");
  }, [phase]);

  // Mic-hook error surfaces asynchronously.
  useEffect(() => {
    if (mic.error && phase === "live" && !mic.running) {
      setMicNotice(
        "Microphone denied — the membrane self-drives on its internal rhythm."
      );
    }
  }, [mic.error, mic.running, phase]);

  const toggleBreathe = useCallback(() => {
    const flick = flickerRef.current;
    if (!flick) return;
    setBreathe((b) => {
      const next = !b;
      if (next) flick.enable();
      else flick.disable();
      return next;
    });
  }, []);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#0d0b18] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Title + intro + Begin overlay */}
      {phase !== "unsupported" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-6 text-center">
          <h1 className="font-serif text-2xl tracking-tight text-foreground drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:text-3xl">
            Lattice
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground drop-shadow-[0_1px_10px_rgba(0,0,0,0.6)]">
            A living membrane <span className="text-foreground">grown</span> in real time by a
            GPU reaction-diffusion field — Turing&apos;s morphogenesis warped into a
            psychedelic honeycomb realm. It blooms, replicates, saturates, and breaks
            through, carried by an endlessly rising tone.
          </p>

          {phase === "idle" && (
            <button
              type="button"
              onClick={begin}
              className="pointer-events-auto mt-1 min-h-[44px] rounded-full border border-violet-200/50 bg-violet-400/20 px-4 py-2.5 text-base text-foreground transition hover:bg-violet-400/35 active:scale-95"
            >
              Begin the ascent
            </button>
          )}

          {phase === "live" && (
            <p className="text-base text-foreground drop-shadow-[0_1px_10px_rgba(0,0,0,0.6)]">
              <span className="text-foreground">{phaseLabel}</span> · make sound to feed
              the reaction
            </p>
          )}

          {notice && (
            <p className="pointer-events-auto max-w-md text-base text-violet-300 drop-shadow-[0_1px_10px_rgba(0,0,0,0.6)]">
              {notice}
            </p>
          )}
          {micNotice && (
            <p className="pointer-events-auto max-w-md text-base text-violet-300 drop-shadow-[0_1px_10px_rgba(0,0,0,0.6)]">
              {micNotice}
            </p>
          )}
        </div>
      )}

      {/* Unsupported fallback */}
      {phase === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">{notice}</p>
        </div>
      )}

      {/* Phase progress + breathe toggle (while live) */}
      {phase === "live" && (
        <div className="pointer-events-none absolute left-0 right-0 bottom-0 flex items-end justify-between p-4">
          <div className="rounded-xl bg-black/35 px-3 py-2 backdrop-blur-sm">
            <p className="text-sm text-foreground">
              phase: <span className="text-violet-200">{phaseLabel}</span>
            </p>
            <div className="mt-1 h-1 w-44 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-violet-300/85"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={toggleBreathe}
            className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-foreground transition hover:text-foreground"
          >
            {breathe ? "Breathing" : "Breathe"}
          </button>
        </div>
      )}

      {/* Design notes — corner toggle */}
      <div className="absolute bottom-0 right-0 p-4 text-right">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-foreground transition hover:text-foreground"
        >
          {showNotes ? "Close notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 max-w-sm rounded-2xl border border-border bg-black/70 p-5 text-left backdrop-blur">
            <p className="text-base text-foreground">
              A GPU Gray-Scott reaction-diffusion field (Turing&apos;s morphogenesis)
              runs on ping-pong framebuffers at {renderMode || "capped"} precision. A
              phase arc sweeps feed/kill through Pearson&apos;s regimes — spots →
              mitosis → maze → coherent realm — while the V field is warped through
              log-polar honeycomb symmetry and shaded with thin-film iridescence.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Louder sound feeds the reaction; onsets seed fresh growth. Full notes and
              references in <span className="font-mono text-violet-200">README.md</span>{" "}
              (Turing 1952; Gray-Scott / Pearson 1993; the DMT-realm phenomenology;
              Klüver&apos;s lattice form constant).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
