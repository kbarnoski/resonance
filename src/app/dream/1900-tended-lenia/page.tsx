"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { buildSim, buildFallback, type Sim, type Fallback, type FieldStats } from "./sim";
import { createAudio, type AudioEngine } from "./audio";

type Mode = "loading" | "live" | "fallback";
type Tool = "tend" | "seed" | "cull";

// species inks — MUST match herbarium() in the render shader.
const SPECIES = [
  { label: "Fern", color: "rgb(61,89,48)" },
  { label: "Sedge", color: "rgb(107,101,52)" },
  { label: "Ochre moss", color: "rgb(153,115,51)" },
  { label: "Madder", color: "rgb(133,60,44)" },
  { label: "Oxblood", color: "rgb(107,38,33)" },
];
const SPECIES_S = [0.1, 0.3, 0.5, 0.7, 0.9];

const EMPTY: FieldStats = {
  total: 0,
  motion: 0,
  complexity: 0,
  species: SPECIES.map(() => ({ mass: 0, cx: 0.5, cy: 0.5 })),
};

// herbarium LIGHT palette pushed onto the token vars so chrome text stays
// dark-and-readable over the cream canvas (the app root forces dark theme).
const HERBARIUM_VARS = {
  "--background": "oklch(0.945 0.020 85)",
  "--foreground": "oklch(0.285 0.030 55)",
  "--muted-foreground": "oklch(0.44 0.030 55)",
  "--border": "oklch(0.80 0.030 75)",
  "--primary": "oklch(0.44 0.085 150)",
  "--primary-foreground": "oklch(0.965 0.020 90)",
  "--accent": "oklch(0.88 0.035 80)",
  "--accent-foreground": "oklch(0.285 0.030 55)",
  "--muted": "oklch(0.86 0.025 80)",
  "--popover": "oklch(0.955 0.018 88)",
  "--destructive": "oklch(0.47 0.14 30)",
} as CSSProperties;

export default function TendedLeniaPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const fallbackRef = useRef<Fallback | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const statsRef = useRef<FieldStats>(EMPTY);
  const toolRef = useRef<Tool>("tend");
  const brushRef = useRef(0); // selected species for seed / soil
  const pointerDown = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastTendRef = useRef<number>(0);

  const [mode, setMode] = useState<Mode>("loading");
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tool, setTool] = useState<Tool>("tend");
  const [brush, setBrush] = useState(0);
  const [live, setLive] = useState<FieldStats>(EMPTY);
  const [elapsed, setElapsed] = useState(0);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sim: Sim | null = null;
    let fallback: Fallback | null = null;
    try {
      sim = buildSim(canvas, reduced ? { field: 128, read: 48, kernelR: 7 } : {});
    } catch {
      sim = null;
    }
    if (sim) {
      simRef.current = sim;
      setMode("live");
    } else {
      fallback = buildFallback(canvas);
      fallbackRef.current = fallback;
      setMode("fallback");
    }

    const audio = createAudio();
    audioRef.current = audio;

    const applySize = () => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      sim?.resize(rect.width, rect.height);
      fallback?.resize(rect.width, rect.height);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const startT = performance.now();
    let prevT = startT;
    let frame = 0;
    let sampleAccum = 0;

    // fallback: synthesize gentle stats so audio still moves (no real sim).
    const fbPhase = (): FieldStats => {
      const t = (performance.now() - startT) / 1000;
      const s = (sp: number, ph: number) => 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t * sp + ph));
      return {
        total: 0.2,
        motion: 0.02,
        complexity: 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.08)),
        species: SPECIES.map((_, i) => ({
          mass: s(0.04 + i * 0.01, i * 1.3),
          cx: 0.5 + 0.3 * Math.sin(t * 0.06 + i),
          cy: 0.4 + 0.15 * i,
        })),
      };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      const time = (now - startT) / 1000;
      frame++;
      sampleAccum += dt;

      if (sim) {
        if (!reduced || frame % 2 === 0) sim.step(dt);
        sim.render(time);
        if (frame % 5 === 0) {
          const st = sim.sample();
          statsRef.current = st;
          audioRef.current?.update(st, sampleAccum);
          sampleAccum = 0;
        }
      } else if (fallback) {
        fallback.render(time);
        if (frame % 5 === 0) {
          const st = fbPhase();
          statsRef.current = st;
          audioRef.current?.update(st, sampleAccum);
          sampleAccum = 0;
        }
      }

      if (frame % 12 === 0) {
        setLive(statsRef.current);
        setElapsed(time);
        // idle prompt: only after the piece is running and untended a while.
        const tended = now - lastTendRef.current < 9000;
        setIdle(audioRef.current?.running() === true && !tended);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      audioRef.current?.dispose();
      audioRef.current = null;
      simRef.current?.destroy();
      simRef.current = null;
      fallbackRef.current?.destroy();
      fallbackRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    await a.start();
    await a.resume();
    a.setMuted(muted);
    lastTendRef.current = performance.now();
    setRunning(true);
  }, [muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const reseed = useCallback(() => {
    simRef.current?.reset();
    lastTendRef.current = performance.now();
  }, []);

  // apply the active tool at a normalized position.
  const applyTool = useCallback((nx: number, ny: number) => {
    const sim = simRef.current;
    if (!sim) return;
    const t = toolRef.current;
    const soil = SPECIES_S[brushRef.current % SPECIES.length];
    if (t === "tend") {
      sim.paintEnv(nx, ny, 0.09, 0.22, soil);
    } else if (t === "seed") {
      sim.seed(nx, ny, 0.05, 0.9, brushRef.current);
      // seeding also enriches a little so the transplant can take root
      sim.paintEnv(nx, ny, 0.08, 0.28, soil);
    } else {
      sim.cull(nx, ny, 0.07);
    }
    lastTendRef.current = performance.now();
  }, []);

  const posFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerDown.current = true;
      const p = posFrom(e);
      lastPos.current = p;
      applyTool(p.x, p.y);
      void audioRef.current?.resume();
    },
    [applyTool],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDown.current) return;
      const p = posFrom(e);
      // interpolate along the drag so strokes are continuous
      const prev = lastPos.current ?? p;
      const steps = Math.max(1, Math.round(Math.hypot(p.x - prev.x, p.y - prev.y) / 0.03));
      for (let i = 1; i <= steps; i++) {
        applyTool(prev.x + (p.x - prev.x) * (i / steps), prev.y + (p.y - prev.y) * (i / steps));
      }
      lastPos.current = p;
    },
    [applyTool],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerDown.current = false;
    lastPos.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const mm = (n: number) => {
    const s = Math.floor(n);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const statusLabel =
    mode === "live" ? "WebGL2 · multi-kernel Flow-Lenia" : mode === "fallback" ? "Fallback" : "…";

  const cursor = tool === "cull" ? "cell" : "crosshair";
  const complexityPct = Math.round(live.complexity * 100);

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden bg-background text-foreground"
      style={HERBARIUM_VARS}
    >
      {/* full-bleed canvas — a square that covers the viewport */}
      <div
        ref={wrapRef}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: "max(100vw,100vh)", height: "max(100vw,100vh)" }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="pointer-events-auto block h-full w-full touch-none"
          style={{ cursor }}
          aria-label="A herbarium ecology. Drag to tend the soil, seed species, or cull mass."
        />
      </div>

      {/* floating readable panel */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="pointer-events-auto w-full max-w-md rounded-lg border border-border bg-popover/80 p-4 shadow-lg backdrop-blur-sm sm:p-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Tended Lenia
            </h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A pressed-flower ecology you must keep. Paint the soil to feed the species that suit
            it; stop tending and the garden diffuses to a flat, quiet equilibrium within half a
            minute. Different soil grows a different dominant species — and a different piece, in
            just intonation.
          </p>

          {mode === "fallback" && (
            <p className="mt-3 rounded-md border border-border bg-background/60 p-2.5 text-sm leading-relaxed text-muted-foreground">
              Your browser lacks WebGL2 float render targets, so the full ecology can&apos;t run.
              You&apos;re seeing a gentle herbarium wash with an evolving pad — try a recent Chrome
              or Safari for the living simulation.
            </p>
          )}

          {/* tool + brush controls */}
          {running && mode === "live" && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {(["tend", "seed", "cull"] as Tool[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTool(t)}
                    className={`min-h-[44px] rounded-md px-4 text-sm font-medium capitalize transition-colors ${
                      tool === t
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {t === "tend" ? "Tend soil" : t}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Species
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIES.map((sp, i) => (
                    <button
                      key={sp.label}
                      type="button"
                      onClick={() => setBrush(i)}
                      title={sp.label}
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${
                        brush === i ? "scale-110 border-foreground" : "border-transparent"
                      }`}
                      style={{ backgroundColor: sp.color }}
                      aria-label={`Brush species ${sp.label}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* complexity meter (MSPD-lite) */}
          {running && (
            <div className="mt-4">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Complexity (MSPD-lite)</span>
                <span>{complexityPct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${complexityPct}%`,
                    backgroundColor: "rgb(61,89,48)",
                  }}
                />
              </div>
            </div>
          )}

          {/* per-species population */}
          {running && (
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {SPECIES.map((sp, i) => {
                const m = live.species[i]?.mass ?? 0;
                const pct = Math.min(100, m * 320);
                return (
                  <div key={sp.label} title={sp.label} className="flex flex-col items-center gap-1">
                    <div className="flex h-14 w-full items-end overflow-hidden rounded bg-muted">
                      <div
                        className="w-full transition-[height] duration-500"
                        style={{ height: `${pct}%`, backgroundColor: sp.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* bottom control strip */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {running && (
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Sound: off" : "Sound: on"}
            </button>
          )}
          {mode === "live" && running && (
            <button
              type="button"
              onClick={reseed}
              className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Replant
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          {running && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              tending · {mm(elapsed)}
            </span>
          )}
        </div>
      </div>

      {/* idle prompt — subtle, appears when the gardener stops tending */}
      {idle && running && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-border bg-popover/85 px-4 py-2 text-sm text-foreground shadow backdrop-blur-sm">
          The garden is fading — paint the soil to keep it alive.
        </div>
      )}

      {/* start gate */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          >
            Start the garden
          </button>
        </div>
      )}

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}

      <PrototypeNav slugs={["1900-tended-lenia"]} />
    </main>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Design notes"
      style={HERBARIUM_VARS}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-popover p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Design notes</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The one question.</span> What if a piece
            of music were a living garden whose species you keep alive by shaping their environment
            — and the moment you stop tending, the music flatlines?
          </p>
          <p>
            <span className="font-medium text-foreground">Multi-kernel Flow-Lenia.</span> One
            RGBA16F field ping-pongs through four GPU passes. Each cell&apos;s genome blends TWO
            radial ring kernels (an inner and an outer ring); each kernel has its own Gaussian
            growth bump, and the affinity that drives flow is a genome-weighted mix — richer
            morphologies and real speciation than a single ring. Matter is advected up the affinity
            gradient by reintegration tracking, so total mass is conserved exactly.
          </p>
          <p>
            <span className="font-medium text-foreground">You are load-bearing.</span> A second
            texture is the soil: you paint resource and a soil-genome into it. Growth is amplified
            only where a cell&apos;s genome MATCHES the local enriched soil, and suppressed toward a
            dull baseline everywhere else. The soil diffuses and decays, so untended it settles to a
            flat, near-uniform, quiet field within ~30&nbsp;s — the affinity gradient vanishes and
            only pressure remains, spreading mass to silence. Tend, seed, or cull to keep distinct
            species — and the music — alive.
          </p>
          <p>
            <span className="font-medium text-foreground">Just intonation, not pentatonic.</span>{" "}
            Genome maps to a 7-limit ratio (1/1, 9/8, 6/5, 5/4, 4/3, 3/2, 5/3, 7/4, 15/8). The
            dominant species sets the drone tonic; every other species sounds its ratio against it,
            so co-existing populations make real consonance and beating, and mixed zones bite. Mass
            → amplitude, center-of-mass → pan and register, blooms/takeovers/deaths → bells. The
            MSPD-lite complexity meter (fine-vs-coarse mass variance) opens the filters, so you hear
            a colony becoming interesting.
          </p>
          <p>
            <span className="font-medium text-foreground">References.</span> Chan,{" "}
            <em>Lenia: Biology of Artificial Life</em> (arXiv:1812.05433); Leniabreeder
            (arXiv:2406.04235); <em>Directing Open-Ended Evolution via Multi-Scale Path
            Divergence</em> (arXiv:2606.17091). Full write-up in the folder&apos;s{" "}
            <span className="font-mono text-xs">README.md</span>. Deterministic from PRNG seed
            0x1900; master gain capped at 0.18 through a compressor/limiter.
          </p>
        </div>
      </div>
    </div>
  );
}
