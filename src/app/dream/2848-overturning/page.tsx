"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2848-overturning — "What if you could HEAR the ocean's great conveyor belt
// approach a tipping point?"
//
// A long-form (~10 min), self-playing sonification of a REAL fast–slow
// stochastic dynamical system with a fold catastrophe: Stommel's two-box
// thermohaline circulation. As the freshwater forcing drifts toward the fold
// you literally hear the early-warning signals — the deep overturning drone
// wobbling wider and recovering slower (critical slowing down: variance ↑,
// lag-1 autocorrelation → 1) — then a sudden collapse, and a return that does
// NOT retrace (hysteresis). Deterministic (mulberry32 seeded 0x2848).
// Visuals animate on mount; audio begins on the "Begin" gesture. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { OverturningEngine, type Snapshot } from "./engine";
import { OverturningAudio } from "./audio";
import { drawScene, type HistPoint } from "./viz";

type Phase = "idle" | "running" | "paused";

function reducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<OverturningEngine | null>(null);
  const audioRef = useRef<OverturningAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const histRef = useRef<HistPoint[]>([]);
  const shutdownRef = useRef<number | null>(null);
  const lastHudRef = useRef<number>(0);
  const lastHistRef = useRef<number>(-1);
  const lastFrameRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const runningRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [canvasError, setCanvasError] = useState(false);
  const [hud, setHud] = useState<Snapshot | null>(null);

  // ── animation loop (runs from mount; audio optional) ────────────────────────
  useEffect(() => {
    reducedRef.current = reducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCanvasError(true);
      return;
    }

    engineRef.current = new OverturningEngine(0x2848);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    lastFrameRef.current = performance.now();

    const frame = () => {
      const now = performance.now();
      let dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      dt = Math.min(0.1, Math.max(0, dt)); // clamp long stalls

      const eng = engineRef.current;
      if (eng) {
        if (runningRef.current && eng.progress < 1) eng.advance(dt);
        const s = eng.snapshot();

        // record history (throttled by arc progress)
        if (s.progress - lastHistRef.current > 0.0012) {
          lastHistRef.current = s.progress;
          histRef.current.push({
            t: s.progress,
            F: s.F,
            q: s.q,
            band: Math.sqrt(s.variance),
          });
          if (histRef.current.length > 2000) histRef.current.shift();
        }
        // shutdown instant (first forward collapse)
        if (
          shutdownRef.current === null &&
          s.collapsed &&
          s.progress < 0.55 &&
          s.q < 0.1
        ) {
          shutdownRef.current = s.progress;
        }

        const rect = canvas.getBoundingClientRect();
        drawScene(
          ctx,
          rect.width,
          rect.height,
          s,
          histRef.current,
          shutdownRef.current,
          reducedRef.current,
          now / 1000,
        );

        audioRef.current?.update(s);

        if (now - lastHudRef.current > 160) {
          lastHudRef.current = now;
          setHud(s);
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", resize);
    };
  }, []);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        // seed a private stream for the noise buffer (deterministic).
        const rng = (() => {
          let a = 0x2848 ^ 0x9e37;
          return () => {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
        })();
        audioRef.current = new OverturningAudio(rng);
        await audioRef.current.start();
      } catch {
        setAudioError(true);
      }
    }
    runningRef.current = true;
    lastFrameRef.current = performance.now();
    setPhase("running");
  }, []);

  const pause = useCallback(async () => {
    runningRef.current = false;
    await audioRef.current?.suspend();
    setPhase("paused");
  }, []);

  const resume = useCallback(async () => {
    runningRef.current = true;
    lastFrameRef.current = performance.now();
    await audioRef.current?.resume();
    setPhase("running");
  }, []);

  const jump = useCallback(() => {
    engineRef.current?.jump(45); // deterministic 45s fast-forward
    lastFrameRef.current = performance.now();
  }, []);

  const pct = hud ? Math.round(hud.progress * 100) : 0;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Stability landscape and overturning time-series"
      />

      {/* top-left title + status */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Overturning
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Hearing the ocean&rsquo;s conveyor belt approach a tipping point.
        </p>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Stommel two-box · fold catastrophe · {pct}%
        </p>
      </div>

      {/* live early-warning readout */}
      {hud && (
        <div className="pointer-events-none absolute right-0 top-0 p-5 text-right sm:p-7">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Early-warning signals
          </p>
          <dl className="mt-2 space-y-1 font-mono text-sm text-foreground">
            <Row k="variance" v={hud.variance.toFixed(4)} />
            <Row k="AC1 (lag-1)" v={hud.ac1.toFixed(3)} />
            <Row k="resilience" v={hud.resilience.toFixed(3)} />
            <Row k="q (overturn)" v={hud.q.toFixed(3)} />
            <Row k="F (forcing)" v={hud.F.toFixed(3)} />
            <Row
              k="state"
              v={hud.on ? "ON" : hud.collapsed ? "COLLAPSED" : "off"}
            />
          </dl>
        </div>
      )}

      {/* controls */}
      <div className="absolute bottom-0 left-0 flex w-full flex-wrap items-center gap-3 p-5 sm:p-7">
        {phase === "idle" && (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        )}
        {phase === "running" && (
          <button
            onClick={pause}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Pause
          </button>
        )}
        {phase === "paused" && (
          <button
            onClick={resume}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Resume
          </button>
        )}
        <button
          onClick={jump}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Jump ahead
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>

        {audioError && (
          <span className="text-sm text-destructive">
            Web Audio unavailable — visuals continue silently.
          </span>
        )}
        {canvasError && (
          <span className="text-sm text-destructive">
            Canvas unavailable in this browser.
          </span>
        )}
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The engine is Stommel&rsquo;s (1961) two-box thermohaline model
                in non-dimensional form, integrated with Euler&ndash;Maruyama
                and seeded additive noise. Temperature contrast &Delta;T and
                salinity contrast &Delta;S relax toward their forcing; their
                density difference drives the overturning flow{" "}
                <span className="font-mono">q</span>. The system is genuinely
                bistable &mdash; a strong thermally-driven &ldquo;on&rdquo; state
                and a collapsed salinity-dominated &ldquo;off&rdquo; state
                &mdash; separated by a saddle-node (fold).
              </p>
              <p>
                A slow freshwater forcing <span className="font-mono">F</span>{" "}
                drifts up toward the fold: the &ldquo;on&rdquo; well shallows,
                recovery slows, and a rolling window of{" "}
                <span className="font-mono">q</span> shows{" "}
                <em>variance rising</em> and <em>lag-1 autocorrelation &rarr; 1</em>{" "}
                &mdash; critical slowing down. Those live signals drive the
                sound: the deep drone&rsquo;s twin oscillators detune into
                beating, a turbulence bed swells, and reverb tails lengthen, so
                you hear the circulation lose its footing before it tips.
              </p>
              <p>
                The collapse is a decisive phase transition, not a fade. On the
                return, <span className="font-mono">F</span> must fall well below
                the collapse threshold before a lower fold lets the overturning
                restart &mdash; <em>hysteresis</em>. The return path does not
                retrace the outward path, which is why minute 10 is a different
                piece than second 0.
              </p>
              <p>
                Pitch is mapped <em>continuously</em> (freq = f0 &middot;
                2^(k&middot;norm)) and never snapped to a scale &mdash; the
                approach to collapse is allowed to sound honestly rough.
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="w-16 tabular-nums text-foreground">{v}</dd>
    </div>
  );
}
