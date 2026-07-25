"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ELEMENT_VIEWS } from "./spectra";
import { buildEngine, type Engine } from "./audio";
import { buildRenderer, type Renderer } from "./viz";

/* ── tour timing (seconds) ─────────────────────────────────────────────
   Each element is sustained one CYCLE; the visual envelope blooms in over
   ATK and releases over REL so the tour breathes between elements. */
const CYCLE = 8.0;
const ATK = 1.6;
const REL = 1.6;

const N = ELEMENT_VIEWS.length;
const mod = (a: number, m: number): number => ((a % m) + m) % m;

function envAt(local: number): number {
  const smooth = (x: number): number => {
    const c = Math.min(1, Math.max(0, x));
    return c * c * (3 - 2 * c);
  };
  if (local < ATK) return smooth(local / ATK);
  if (local > CYCLE - REL) return smooth((CYCLE - local) / REL);
  return 1;
}

export default function EmberlinePage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const idxRef = useRef(0);
  const cycleStartRef = useRef(0);
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);

  /* switch the sounding + shown element */
  const goTo = useCallback((idx: number, restart: boolean): void => {
    const i = mod(idx, N);
    idxRef.current = i;
    const view = ELEMENT_VIEWS[i];
    rendererRef.current?.setElement(view);
    setActiveIdx(i);
    if (restart) cycleStartRef.current = performance.now() / 1000;
    if (startedRef.current && !pausedRef.current) {
      engineRef.current?.playElement(view);
    }
  }, []);

  /* main animation + tour loop (refs only → never restarts) */
  useEffect(() => {
    if (!svgRef.current) return;
    const renderer = buildRenderer(svgRef.current);
    rendererRef.current = renderer;
    renderer.setElement(ELEMENT_VIEWS[idxRef.current]);

    const t0 = performance.now() / 1000;
    cycleStartRef.current = t0;
    lastFrameRef.current = t0;

    const frame = (): void => {
      const now = performance.now() / 1000;
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;

      if (pausedRef.current) {
        // freeze the envelope by dragging the cycle start with us
        cycleStartRef.current += dt;
      }
      let local = now - cycleStartRef.current;
      if (!pausedRef.current && local >= CYCLE) {
        goTo(idxRef.current + 1, true);
        local = 0;
      }

      const view = ELEMENT_VIEWS[idxRef.current];
      const voiceAmp = pausedRef.current ? 1 : envAt(local);
      const amps = view.partials.map((p, i) => {
        const shimmer = 0.75 + 0.25 * Math.sin(now * (0.9 + i * 0.13) + i);
        return p.rel * voiceAmp * shimmer;
      });
      renderer.draw(now, voiceAmp, amps);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [goTo]);

  /* unlock audio on the user gesture (Web Audio requires it) */
  const begin = useCallback(async () => {
    if (startedRef.current) return;
    try {
      const engine = buildEngine();
      await engine.resume();
      engineRef.current = engine;
      startedRef.current = true;
      setStarted(true);
      pausedRef.current = false;
      setPaused(false);
      engine.playElement(ELEMENT_VIEWS[idxRef.current]);
    } catch {
      setAudioError(
        "Audio could not start in this browser. The visual tour continues silently.",
      );
    }
  }, []);

  const togglePause = useCallback((): void => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      engineRef.current?.silence();
    } else if (startedRef.current) {
      cycleStartRef.current = performance.now() / 1000;
      engineRef.current?.playElement(ELEMENT_VIEWS[idxRef.current]);
    }
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const view = ELEMENT_VIEWS[activeIdx];

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              emberline
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Hear what matter is made of. Every element is one additive chord
              whose notes are its real emission spectrum — the intervals are set
              by physics, never by a scale.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </header>

        {/* now-sounding readout */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {view.symbol}
          </span>
          <span className="text-base text-foreground">{view.name}</span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {view.readout}
          </span>
        </div>

        {/* art layer */}
        <div className="overflow-hidden rounded-lg border border-border bg-[#04040a]">
          <svg ref={svgRef} className="block w-full" role="img" aria-label={`Emission spectrum of ${view.name}`} />
        </div>

        {/* controls */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Begin — unlock sound
              </button>
            ) : (
              <button
                type="button"
                onClick={togglePause}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {paused ? "Resume" : "Pause"}
              </button>
            )}
            <button
              type="button"
              onClick={() => goTo(idxRef.current + 1, true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Next element
            </button>
            {!started && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Tour is running — sound waits for your gesture
              </span>
            )}
          </div>

          {audioError && (
            <p className="text-sm leading-relaxed text-destructive">
              {audioError}
            </p>
          )}

          {/* element chips */}
          <div className="flex flex-wrap gap-2">
            {ELEMENT_VIEWS.map((v, i) => (
              <button
                key={v.symbol}
                type="button"
                onClick={() => goTo(i, true)}
                aria-pressed={i === activeIdx}
                className={
                  "min-h-[44px] rounded-md border px-4 text-sm " +
                  (i === activeIdx
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
                }
              >
                <span className="font-mono">{v.symbol}</span>{" "}
                <span className="text-muted-foreground">{v.name}</span>
              </button>
            ))}
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Simple gases (hydrogen, sodium) sound sparse and clean; dense-line
            metals (iron, neon) shimmer and beat. That roughness is the physics
            of matter itself — smallest interval in this chord ≈{" "}
            {Math.round(view.minCents)} cents.
          </p>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-5"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6 text-card-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">
                emberline — design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                you could hear what matter is made of — every chemical element
                played as a chord whose notes are its real emission spectrum?
              </p>
              <p>
                <span className="text-foreground">Mapping.</span> Each emission
                line has a wavelength λ. Its optical frequency is f = c / λ, so
                shorter (bluer) wavelengths are higher pitches — physically
                honest. Across the visible band f spans only about one octave,
                so we stretch log(f) linearly onto a log audible band of 80–1600
                Hz. Both axes are logarithmic, so the ratio structure of the
                lines survives; only the octave-span is widened until the ear
                can hear the intervals. Relative line intensity becomes each
                partial&apos;s amplitude.
              </p>
              <p>
                <span className="text-foreground">No scale.</span> Nothing is
                snapped to a scale — not just intonation, not a pentatonic, not
                anything. The interval between two partials is whatever the two
                wavelengths dictate. Sodium&apos;s famous D-doublet stays a
                near-unison; iron&apos;s ten lines stay a rough cluster. The
                dissonance is real physics.
              </p>
              <p>
                <span className="text-foreground">References.</span> Balmer
                (1885) — the hydrogen visible series whose lines you hear first.
                Rydberg (1888/1890) — the Rydberg formula generalising those
                spectral series. Wavelength-to-RGB colours use Dan Bruton&apos;s
                classic approximation (efg / SFASU spectra page). Fresh research
                context: Roddy et&nbsp;al., &quot;Generative Sonification of
                Synthetic Virology Data&quot; (Leonardo / MIT Press, 2026) marks
                generative sonification of scientific data as a live art-research
                frontier; emberline sonifies the physics of matter itself.
              </p>
              <p>
                <span className="text-foreground">Determinism.</span> Any dither
                (reverb impulse, shimmer phase) comes from a seeded mulberry32
                (seed 0x2712). No Math.random, no clock. Two runs give identical
                partial frequencies.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
