"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { buildSim, buildFallback, type Sim, type Fallback, type FieldStats } from "./sim";
import { createAudio, type AudioEngine } from "./audio";

type Mode = "loading" | "live" | "fallback";

// species legend colours (must match speciesColor() in the render shader)
const SPECIES = [
  { label: "Low", color: "rgb(26,204,189)" },
  { label: "Mid", color: "rgb(158,92,250)" },
  { label: "High", color: "rgb(255,184,87)" },
];

const EMPTY: FieldStats = {
  total: 0,
  motion: 0,
  species: [
    { mass: 0, cx: 0.5, cy: 0.5 },
    { mass: 0, cx: 0.5, cy: 0.5 },
    { mass: 0, cx: 0.5, cy: 0.5 },
  ],
};

export default function FlowEdenPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const fallbackRef = useRef<Fallback | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const statsRef = useRef<FieldStats>(EMPTY);
  const seedSpeciesRef = useRef(0);

  const [mode, setMode] = useState<Mode>("loading");
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [live, setLive] = useState<FieldStats>(EMPTY);
  const [elapsed, setElapsed] = useState(0);

  // ── build sim + run the visual loop (audio waits for the Start gesture) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let sim: Sim | null = null;
    let fallback: Fallback | null = null;
    try {
      sim = buildSim(canvas, reduced ? { field: 128, read: 32, kernelR: 8 } : {});
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

    // size the draw buffer to the container
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

    // For fallback we synthesize gentle evolving stats so audio still moves.
    const fbPhase = () => {
      const t = (performance.now() - startT) / 1000;
      const s = (i: number, sp: number, ph: number) =>
        0.15 + 0.14 * (0.5 + 0.5 * Math.sin(t * sp + ph));
      return {
        total: 0.2,
        motion: 0.02 + 0.015 * (0.5 + 0.5 * Math.sin(t * 0.11)),
        species: [
          { mass: s(0, 0.05, 0), cx: 0.5 + 0.3 * Math.sin(t * 0.07), cy: 0.4 },
          { mass: s(1, 0.037, 2.1), cx: 0.5 + 0.3 * Math.sin(t * 0.05 + 1), cy: 0.55 },
          { mass: s(2, 0.061, 4.2), cx: 0.5 + 0.3 * Math.sin(t * 0.09 + 2), cy: 0.7 },
        ],
      } as FieldStats;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      const time = (now - startT) / 1000;
      frame++;
      sampleAccum += dt;

      if (sim) {
        // reduced-motion: step a little slower to lower GPU load
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
  }, []);

  const onCanvasTap = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    if (!sim) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const sp = seedSpeciesRef.current % sim.speciesCount;
    seedSpeciesRef.current++;
    sim.seed(nx, ny, 0.06, 0.9, sp);
    void audioRef.current?.resume();
  }, []);

  const mm = (n: number) => {
    const s = Math.floor(n);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  const statusLabel =
    mode === "live" ? "WebGL2 · Flow-Lenia" : mode === "fallback" ? "Fallback mode" : "starting…";

  return (
    <main className="min-h-screen w-full bg-background text-foreground flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Flow Eden
          </h1>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {statusLabel}
          </span>
        </div>
        <p className="mt-3 text-base text-muted-foreground">
          A living sonic ecology. A finite budget of matter flows across the grid under a
          mass-conserving Flow-Lenia rule; three species compete for it, spread, collide and
          drift. Sound and image are two views of one simulation — the music at minute five is
          genuinely different from second five, because the population has evolved.
        </p>

        {mode === "fallback" && (
          <p className="mt-3 rounded-md border border-border bg-background/60 p-3 text-sm leading-relaxed text-muted-foreground">
            Your browser lacks WebGL2 float render targets, so the full ecology can&apos;t run
            here. You&apos;re seeing a gentle on-brand fallback with an evolving pad — try a recent
            Safari or Chrome for the real simulation.
          </p>
        )}

        <div
          ref={wrapRef}
          className="relative mt-5 w-full aspect-square overflow-hidden rounded-lg border border-border bg-black"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasTap}
            className="block h-full w-full touch-none cursor-crosshair"
            aria-label="Flow-Lenia ecology field. Tap to drop matter of a species."
          />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start the ecology
              </button>
            </div>
          )}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {running && (
            <button
              type="button"
              onClick={toggleMute}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Sound: off" : "Sound: on"}
            </button>
          )}
          {mode === "live" && (
            <button
              type="button"
              onClick={reseed}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Re-seed
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          <span className="ml-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            evolving · {mm(elapsed)}
          </span>
        </div>

        {/* live per-species population readout */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {SPECIES.map((sp, i) => {
            const m = live.species[i]?.mass ?? 0;
            const pct = Math.min(100, m * 220);
            return (
              <div key={sp.label} className="rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: sp.color }}
                    aria-hidden
                  />
                  {sp.label}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%`, backgroundColor: sp.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Each species is one voice, pitch-quantized to a shared D pentatonic so the whole is
          harmony. Population mass sets a voice&apos;s presence; a species&apos; center of mass pans
          and bends it; blooms, takeovers and near-extinctions ring bells. Click Start, then just
          watch and listen — it runs and evolves on its own. Tapping the field drops a fresh blob.
        </p>
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}

      <PrototypeNav slugs={["1836-flow-eden"]} />
    </main>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Design notes"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
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
            <span className="font-medium text-foreground">The one question.</span> Can a piece of
            music be a living thing you tend rather than a track you play — evolving over minutes
            because its population, not a script, is changing?
          </p>
          <p>
            <span className="font-medium text-foreground">The simulation.</span> A continuous
            cellular automaton on a WebGL2 grid, ping-ponging one RGBA16F texture. It is faithful{" "}
            <em>Flow-Lenia</em>: a finite, conserved budget of matter is advected up an
            affinity gradient by reintegration tracking (overlaps sum to one, so total mass never
            changes). Because matter is finite, organisms must <em>compete</em> for it. Each
            cell&apos;s rule parameters — its genome — are embedded in the matter and travel with
            it, blending by mass where populations mix, so species spread, collide and drift.
          </p>
          <p>
            <span className="font-medium text-foreground">The sound.</span> A 48² readback each
            few frames gives cheap per-species statistics. Each species is a voice in a shared D
            pentatonic (harmony by construction); mass sets presence, center-of-mass pans and
            bends pitch, and discrete events — a bloom, a takeover, a near-extinction — ring
            bells. Every voice runs through a compressor into a master gain capped at 0.18.
          </p>
          <p>
            <span className="font-medium text-foreground">References.</span> Bert Wang-Chak
            Chan, <em>Lenia</em> (continuous CA); Plantec, Hamon, Etcheverry, Chan, Oudeyer &
            Moulin-Frier, <em>Flow-Lenia</em> (mass conservation → competition → emergent
            evolution; arXiv:2506.08569, Artificial Life 2025); <em>Simulacra Naturae</em>{" "}
            (generative-ecosystem installation, arXiv:2509.02924, 2025). Full write-up in the
            folder&apos;s <span className="font-mono text-xs">README.md</span>.
          </p>
          <p>
            <span className="font-medium text-foreground">Honest limits.</span> It is a compact,
            single-kernel Flow-Lenia, not the multi-channel paper model; &quot;evolution&quot; here
            is genome drift under mutation and competition, not selection over reproducing agents.
            Deterministic from PRNG seed 0x1836.
          </p>
        </div>
      </div>
    </div>
  );
}
