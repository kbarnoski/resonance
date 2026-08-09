"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createScoreFollower,
  createSyntheticStream,
  makeVizState,
  quantizeToKey,
  type VizState,
} from "./analysis";
import { createEngine, type Engine, type Source } from "./audio";
import { createGpuField, type GpuField } from "./gpu";
import { createSvgField, type SvgField } from "./svg";

type Phase = "idle" | "playing";
type Backend = "pending" | "gpu" | "svg";

// The accompanist picks a complementary note BELOW Karel's detected pitch,
// quantized to the estimated key. Rotating the interval keeps it from doubling.
const ANSWER_INTERVALS = [3, 4, 7, 9]; // min/maj third, fifth, min sixth (below)

function chooseAnswerMidi(
  dominant: number,
  key: number,
  turn: number,
): number {
  const target = 60 + (((dominant - key) % 12) + 12) % 12; // Karel's pc near C4
  const iv = ANSWER_INTERVALS[turn % ANSWER_INTERVALS.length];
  return quantizeToKey(target - iv, key);
}

export default function ShadowHandPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend>("pending");
  const [source, setSource] = useState<Source | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const followerRef = useRef(createScoreFollower());
  const syntheticRef = useRef(createSyntheticStream(0x9016));
  const gpuRef = useRef<GpuField | null>(null);
  const svgFieldRef = useRef<SvgField | null>(null);
  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const liveStateRef = useRef<VizState>(makeVizState());
  const startRef = useRef(0);
  const lastTsRef = useRef(0);
  const beatCountRef = useRef(0);
  const prevBeatPhaseRef = useRef(0);
  const answerTurnRef = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── set up the visualization backend (WebGPU, else SVG) + the frame loop ────
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    // size both drawing surfaces to the container
    const sizeSurfaces = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
      }
      gpuRef.current?.resize(w, h);
    };

    const ro = new ResizeObserver(sizeSurfaces);
    ro.observe(container);
    roRef.current = ro;
    sizeSurfaces();

    // Try WebGPU; on any failure fall back to the SVG field.
    const boot = async () => {
      const canvas = canvasRef.current;
      if (canvas && navigator.gpu) {
        try {
          const field = await createGpuField(canvas);
          if (cancelled) {
            field.destroy();
            return;
          }
          gpuRef.current = field;
          sizeSurfaces();
          setBackend("gpu");
          return;
        } catch {
          /* fall through to SVG */
        }
      }
      const svg = svgRef.current;
      if (svg && !cancelled) {
        svgFieldRef.current = createSvgField(svg);
        setBackend("svg");
      }
    };
    void boot();

    // The loop runs immediately — seeded muted demo first, real analysis once
    // audio is playing. This is the 06:30 muted read: motion within ~1s.
    startRef.current = performance.now();
    lastTsRef.current = startRef.current;

    const loop = (now: number) => {
      const t = (now - startRef.current) / 1000;
      let dt = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;
      if (dt > 0.1) dt = 0.1;

      let state: VizState;
      const engine = engineRef.current;
      if (phaseRef.current === "playing" && engine && engine.playing) {
        // REAL score-following on the currently-playing audio
        const follower = followerRef.current;
        engine.analyser.getByteFrequencyData(engine.freq);
        const res = follower.analyse(
          engine.freq,
          engine.ctx.sampleRate,
          engine.analyser.fftSize,
        );
        follower.step(dt);

        const s = liveStateRef.current;
        // Karel's excitation envelope (smooth attack, decay — no strobe)
        const targetA = res.onset ? Math.min(1, 0.6 + res.strength) : 0;
        s.onsetA = Math.max(s.onsetA * 0.9, targetA);
        for (let i = 0; i < 12; i++) s.chroma[i] = follower.chroma[i];
        s.dominant = follower.dominant;
        s.key = follower.key;
        s.energy = follower.energy;
        s.bpm = follower.bpm;
        s.beatPhase = follower.beatPhase;

        // ── accompaniment scheduling: enter on predicted beats, rest when dense
        const wrapped = follower.beatPhase < prevBeatPhaseRef.current;
        prevBeatPhaseRef.current = follower.beatPhase;
        if (wrapped) beatCountRef.current++;
        s.onsetB *= 0.9;
        const beatCross = wrapped;
        if (beatCross && follower.energy < 0.62) {
          // he left room — the shadow hand answers below him
          const midi = chooseAnswerMidi(
            follower.dominant,
            follower.key,
            answerTurnRef.current++,
          );
          const vel = 0.4 + (1 - follower.energy) * 0.5;
          engine.answer(midi, vel);
          s.onsetB = Math.max(s.onsetB, 0.9);
        }
        state = s;
      } else {
        // SEEDED muted demo — deterministic two-hand breathing, zero audio
        syntheticRef.current.sample(t);
        state = syntheticRef.current.state;
      }

      if (gpuRef.current) {
        gpuRef.current.frame(state, dt, t, reducedMotion);
      } else if (svgFieldRef.current) {
        svgFieldRef.current.frame(state, dt, reducedMotion);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      roRef.current = null;
      gpuRef.current?.destroy();
      gpuRef.current = null;
      svgFieldRef.current?.destroy();
      svgFieldRef.current = null;
    };
  }, [reducedMotion]);

  // ── teardown audio on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const handlePlay = useCallback(async () => {
    if (engineRef.current) return;
    const engine = createEngine();
    engineRef.current = engine;
    const src = await engine.start();
    setSource(src);
    setPhase("playing");
  }, []);

  const badge =
    source === "live"
      ? "live piano"
      : source === "fallback"
        ? "fallback"
        : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-5 py-10">
      <PrototypeNav slugs={["9016-shadowhand"]} />

      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          9016 · Shadow Hand
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The Shadow Hand
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          An AI accompanist that <em>listens</em> to Karel&apos;s real piano
          recording and plays a complementary second voice in real time. It
          follows his score — tracking each attack, the pitch he lands on, and
          the tempo he implies — then answers below him, entering in the gaps and
          resting when his hands are full. Two flows of light: his playing, and
          the hand that shadows it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {phase === "idle" ? (
          <button
            onClick={handlePlay}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Play Karel&apos;s piano
          </button>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Listening · the shadow hand is answering
          </span>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
        {badge ? (
          <span className="rounded-md border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>

      {backend === "svg" ? (
        <p className="text-sm text-destructive">
          WebGPU unavailable — running the lightweight SVG field instead. The
          duet still listens and plays; only the substrate changed.
        </p>
      ) : null}

      {/* ── the stage ─────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative h-[440px] w-full overflow-hidden rounded-lg border border-border"
        style={{ background: "radial-gradient(120% 90% at 50% 40%, #1a1109, #080503 90%)" }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: backend === "gpu" ? "block" : "none" }}
        />
        <svg
          ref={svgRef}
          className="absolute inset-0 h-full w-full"
          style={{ display: backend === "svg" ? "block" : "none" }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>karel&apos;s hand</span>
          <span>shadow hand</span>
        </div>
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        score-following · spectral-flux onset + chroma + IOI tempo · generative
        FM answer
      </p>

      {showNotes ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              What if the accompanist actually listened?
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              The piece fetches and decodes Karel&apos;s real recording, then
              taps it through an <code>AnalyserNode</code>. Every frame it runs a
              small score-follower: a spectral-flux rising-edge onset detector, a
              12-bin chroma estimate for the pitch he&apos;s on, and an
              inter-onset-interval smoother for tempo and beat phase. From those
              features a generative FM voice harmonizes a third or a sixth below
              him, quantized to the estimated key, entering on beats it predicts
              and resting when he is dense — a shadow hand, not a doubling. The
              field is a WebGPU compute particle system (two opposing flows); if
              WebGPU is missing it degrades to an SVG field. On a muted phone a
              seeded synthetic stream keeps both hands breathing with no audio at
              all. In the lineage of Vercoe and Dannenberg score-following, and
              the 2026 &ldquo;Design Space for Live Music Agents.&rdquo;
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
