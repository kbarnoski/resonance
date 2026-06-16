"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SanctuarySynth } from "./synth";
import { BreathTracker, type BreathFrame } from "./breath";

// ── The ritual arc ──────────────────────────────────────────────────────────
// Four phases over ~5+ minutes, advanced by breaths AND elapsed time so the
// piece is stateful — minute 5 differs from minute 1. Each phase reshapes the
// drone: fundamental drifts down a fifth, more overtones enter, the bowl set
// rotates, the tail lengthens.

interface Phase {
  name: string;
  instruction: string;
  /** Fundamental for this phase (Hz). Glides on entry. */
  fundamental: number;
  /** Arc openness 0..1 — how many upper partials are present. */
  openness: number;
  /** Reverb/tail length 0..1. */
  tail: number;
  /** Which bowl modal set strikes in this phase. */
  bowl: number;
  /** Hue (deg) for the halo — drifts slowly across the arc. */
  hue: number;
  /** Advance to next phase once BOTH are met. */
  minBreaths: number;
  minSeconds: number;
}

const C2 = 65.41;
const F1 = C2 * (2 / 3); // a fifth BELOW C2 ≈ 43.6 Hz — the release ground

const PHASES: Phase[] = [
  {
    name: "Gathering",
    instruction: "close your eyes · let the breath find you",
    fundamental: C2,
    openness: 0.15,
    tail: 0.15,
    bowl: 0,
    hue: 268,
    minBreaths: 4,
    minSeconds: 70,
  },
  {
    name: "Invocation",
    instruction: "breathe slowly into the mic · ring the bowls",
    fundamental: C2,
    openness: 0.45,
    tail: 0.45,
    bowl: 1,
    hue: 250,
    minBreaths: 10,
    minSeconds: 160,
  },
  {
    name: "Presence",
    instruction: "rest inside the sound · nowhere to go",
    fundamental: C2 * (3 / 4), // down a fourth — opening the space
    openness: 0.8,
    tail: 0.7,
    bowl: 2,
    hue: 210,
    minBreaths: 18,
    minSeconds: 250,
  },
  {
    name: "Release",
    instruction: "let each breath leave · the ground receives it",
    fundamental: F1, // down a fifth from the start — the descent home
    openness: 1,
    tail: 1,
    bowl: 0,
    hue: 188,
    minBreaths: Infinity,
    minSeconds: Infinity,
  },
];

type RunState = "idle" | "running";

export default function BreathSanctuaryPage() {
  const [runState, setRunState] = useState<RunState>("idle");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [breaths, setBreaths] = useState(0);
  const [micDenied, setMicDenied] = useState(false);
  const [autonomous, setAutonomous] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Visual mirrors (refs drive rAF; small state drives readable text).
  const haloRef = useRef<SVGCircleElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);

  // Audio + tracking objects live in refs across renders.
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<SanctuarySynth | null>(null);
  const trackerRef = useRef<BreathTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mutable arc state (avoid re-renders inside the loop).
  const phaseIdxRef = useRef(0);
  const startTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const autoPhaseRef = useRef(0); // autonomous-breath LFO phase
  const autoRef = useRef(false);

  const applyPhase = useCallback((idx: number) => {
    const synth = synthRef.current;
    if (!synth) return;
    const phase = PHASES[idx];
    synth.setFundamental(phase.fundamental, 14);
    synth.setTail(phase.tail);
  }, []);

  // The animation + arc loop.
  const loop = useCallback(
    (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const synth = synthRef.current;
      const tracker = trackerRef.current;
      if (!synth || !tracker) return;

      const last = lastFrameRef.current || now;
      const dt = Math.min(0.1, (now - last) / 1000);
      lastFrameRef.current = now;

      // ── Breath input: mic, or autonomous LFO fallback ──────────────────
      let frame: BreathFrame;
      if (autoRef.current) {
        // ~5.5s per breath: 2.4s inhale swell, slower exhale + rest.
        autoPhaseRef.current += dt / 5.5;
        const ph = autoPhaseRef.current % 1;
        // Asymmetric breath curve: quick-ish rise, long fall.
        const lfo =
          ph < 0.42
            ? Math.sin((ph / 0.42) * (Math.PI / 2)) // rise to 1
            : Math.max(0, Math.cos(((ph - 0.42) / 0.58) * (Math.PI / 2))); // fall to 0
        frame = tracker.stepAutonomous(lfo * 0.95);
      } else {
        frame = tracker.step(dt);
      }

      const phase = PHASES[phaseIdxRef.current];

      // ── Drive the synth ────────────────────────────────────────────────
      synth.step(dt, {
        breath: frame.energy,
        openness: phase.openness,
        tail: phase.tail,
      });

      // ── Strike a bowl at the top of each breath ────────────────────────
      if (frame.peaked) {
        const f = synth.currentFundamental;
        // Strike pitch: a chord tone above the fundamental for a sacred ring.
        const tones = [2, 3, 4, 5]; // octave, fifth-above, two-octave, etc.
        const mult = tones[frame.cycles % tones.length];
        const strength = 0.5 + frame.energy * 0.5;
        synth.strikeBowl(phase.bowl, f * mult, strength);
        setBreaths(frame.cycles + 1);
      }

      // ── Advance the ritual arc ─────────────────────────────────────────
      const secs = (now - startTimeRef.current) / 1000;
      if (
        phaseIdxRef.current < PHASES.length - 1 &&
        frame.cycles >= phase.minBreaths &&
        secs >= phase.minSeconds
      ) {
        const next = phaseIdxRef.current + 1;
        phaseIdxRef.current = next;
        applyPhase(next);
        setPhaseIndex(next);
      }

      // Throttle elapsed-time state to ~1/s.
      const whole = Math.floor(secs);
      setElapsed((prev) => (prev === whole ? prev : whole));

      // ── Visual: a single faint breathing halo ──────────────────────────
      const halo = haloRef.current;
      const glow = glowRef.current;
      if (halo && glow) {
        const e = frame.energy;
        const r = 60 + e * 130;
        halo.setAttribute("r", r.toFixed(1));
        halo.setAttribute("opacity", (0.18 + e * 0.5).toFixed(3));
        halo.setAttribute("stroke", `hsl(${phase.hue} 65% 72%)`);
        glow.setAttribute("r", (r * 0.55).toFixed(1));
        glow.setAttribute("opacity", (0.05 + e * 0.22).toFixed(3));
        glow.setAttribute("fill", `hsl(${phase.hue} 70% 60%)`);
      }
    },
    [applyPhase]
  );

  // ── Start gesture: create AudioContext + request mic INSIDE the gesture ──
  const begin = useCallback(async () => {
    if (runState === "running") return;

    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume(); // iOS unlock inside the gesture
    ctxRef.current = ctx;

    const synth = new SanctuarySynth(ctx, PHASES[0].fundamental);
    synthRef.current = synth;
    synth.fadeIn(5);

    const tracker = new BreathTracker(ctx, {});
    trackerRef.current = tracker;

    // Try the mic; on denial/unavailability fall back to autonomous breath.
    try {
      await tracker.start();
      autoRef.current = false;
      setAutonomous(false);
      setMicDenied(false);
    } catch {
      autoRef.current = true;
      setAutonomous(true);
      setMicDenied(true);
    }

    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    phaseIdxRef.current = 0;
    applyPhase(0);
    setPhaseIndex(0);
    setBreaths(0);
    setRunState("running");

    rafRef.current = requestAnimationFrame(loop);
  }, [runState, loop, applyPhase]);

  const beginAutonomous = useCallback(async () => {
    if (runState === "running") return;
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    // No gesture here, so resume() may stay suspended until the user interacts;
    // that is fine — browsers will start it on the first interaction, and the
    // visual still animates. We attempt resume anyway.
    void ctx.resume();
    ctxRef.current = ctx;

    const synth = new SanctuarySynth(ctx, PHASES[0].fundamental);
    synthRef.current = synth;
    synth.fadeIn(6);

    const tracker = new BreathTracker(ctx, {});
    trackerRef.current = tracker;

    autoRef.current = true;
    setAutonomous(true);

    startTimeRef.current = performance.now();
    lastFrameRef.current = performance.now();
    phaseIdxRef.current = 0;
    applyPhase(0);
    setRunState("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [runState, loop, applyPhase]);

  // ── Idle auto-demo: if nobody presses Begin within ~2.5s, start the
  //    autonomous-breath sanctuary so a silent glance still hears + sees it. ──
  useEffect(() => {
    if (runState !== "idle") return;
    idleTimerRef.current = setTimeout(() => {
      // Force autonomous mode (no mic) so an idle glance never prompts permission.
      autoRef.current = true;
      void beginAutonomous();
    }, 2500);
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [runState, beginAutonomous]);

  // ── Teardown: cancel rAF, stop mic tracks, dispose nodes, close context. ──
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      trackerRef.current?.stop();
      synthRef.current?.fadeOut(0.8);
      synthRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        // Give the fade a beat, then close.
        setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 900);
      }
    };
  }, []);

  const phase = PHASES[phaseIndex];
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05060a] text-white">
      {/* Faint breathing form — the only visual. Look away from the screen. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="-220 -220 440 440"
          className="h-[min(80vw,80vh)] w-[min(80vw,80vh)]"
          aria-hidden="true"
        >
          <circle ref={glowRef} cx="0" cy="0" r="40" fill="hsl(268 70% 60%)" opacity="0.06" />
          <circle
            ref={haloRef}
            cx="0"
            cy="0"
            r="60"
            fill="none"
            stroke="hsl(268 65% 72%)"
            strokeWidth="1.2"
            opacity="0.18"
          />
        </svg>
      </div>

      {/* Sparse text overlay. */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-between px-6 py-10 text-center">
        <header className="max-w-xl">
          <h1 className="font-serif text-3xl tracking-wide text-white/95 sm:text-4xl">
            Breath Sanctuary
          </h1>
          <p className="mt-2 text-base text-white/70">
            an eyes-closed sound-space you steer with your breath alone
          </p>
        </header>

        {runState === "idle" ? (
          <div className="flex flex-col items-center gap-5">
            <p className="max-w-md text-base text-white/75">
              A ceremonial drone in just intonation, with struck singing bowls.
              Close your eyes and breathe slowly into the microphone — each breath
              rings a bowl and moves the ritual forward.
            </p>
            <button
              onClick={begin}
              className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-400/10 px-7 py-3 text-lg font-medium text-violet-200 transition-colors hover:bg-violet-400/20"
            >
              Begin · breathe
            </button>
            <p className="text-sm text-white/55">
              wear headphones · the room may glance and simply listen
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm uppercase tracking-[0.3em] text-violet-300">
              {phase.name}
            </p>
            <p className="max-w-md text-base text-white/80">{phase.instruction}</p>
            <p className="text-sm text-white/55" aria-live="polite">
              {breaths} breath{breaths === 1 ? "" : "s"} · {mm}:{ss}
            </p>
            {autonomous && (
              <p className="max-w-sm text-sm text-rose-300">
                {micDenied
                  ? "Microphone unavailable — the sanctuary is breathing on its own."
                  : "Breathing autonomously — press Begin and allow the mic to steer it yourself."}
              </p>
            )}
          </div>
        )}

        <footer className="max-w-xl text-sm leading-relaxed text-white/55">
          After Pauline Oliveros&rsquo; <em>Deep Listening</em> &amp; La Monte
          Young&rsquo;s sustained drone — a continuous, breath-steered stream that
          never lands.
        </footer>
      </div>
    </main>
  );
}
