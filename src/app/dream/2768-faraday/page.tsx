"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildField, mulberry32, SEED, OMEGA, type FaradayField } from "./field";
import { buildEngine, type Engine } from "./audio";
import { buildRenderer, type Renderer } from "./viz";

const GRID = 160; // dish resolution
const SUBSTEPS = 3; // PDE sub-steps per animation frame
const DT = 0.5; // sim timestep

/** Deterministic seeded carrier: a slow, non-repeating swell of the vertical
 *  shake amplitude a(t). It breathes across the Faraday threshold (~0.5) so the
 *  dish blooms into a pattern and calms again — the piece self-demos with no
 *  input, no mic, no clock. */
function makeCarrier(): (t: number) => number {
  const rng = mulberry32(SEED ^ 0x0d15);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  return (t: number): number => {
    const swell =
      0.6 +
      0.30 * Math.sin(t * 0.085 + p1) +
      0.14 * Math.sin(t * 0.041 + p2) +
      0.07 * Math.sin(t * 0.19 + p3);
    return Math.min(1.0, Math.max(0.28, swell));
  };
}

/** Map a mic RMS level to a drive amplitude that can swell above threshold. */
function driveFromMic(level: number): number {
  return Math.min(1.0, Math.max(0.3, 0.34 + level * 3.6));
}

export default function FaradayPage() {
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gpu, setGpu] = useState<boolean | null>(null);
  const [readout, setReadout] = useState({ drive: 0, hz: 0, wl: 0, above: false });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<FaradayField | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const carrierRef = useRef(makeCarrier());
  const driveRef = useRef(0.3);
  const startedRef = useRef(false);
  const micRef = useRef(false);
  const pausedRef = useRef(false);
  const rafRef = useRef(0);
  const lastUiRef = useRef(0);

  // detect WebGPU once (we ship the Canvas2D dish; GPU-compute is a next cycle)
  useEffect(() => {
    const has =
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);
    setGpu(has);
    if (!has) {
      setNotice(
        "WebGPU compute is unavailable here — the dish is running on the CPU fallback (Canvas2D). Everything still sounds and moves.",
      );
    }
  }, []);

  // main sim + render loop (refs only → never restarts)
  useEffect(() => {
    if (!canvasRef.current) return;
    const field = buildField(GRID);
    fieldRef.current = field;
    const renderer = buildRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const frame = (): void => {
      const time = performance.now() / 1000;

      // drive amplitude a(t): mic loudness, else the seeded carrier
      let target = carrierRef.current(time);
      if (micRef.current) {
        const lvl = engineRef.current?.micLevel();
        if (lvl != null) target = driveFromMic(lvl);
      }
      // smooth the shake so the dish never jerks
      driveRef.current += (target - driveRef.current) * 0.06;
      const drive = driveRef.current;

      if (!pausedRef.current) {
        for (let s = 0; s < SUBSTEPS; s++) field.step(DT, drive);
      }

      const { bands, rms } = field.analyse();
      if (startedRef.current) engineRef.current?.setBands(bands, drive);
      renderer.draw(field, drive, time);

      // throttle React state to ~6 Hz
      if (time - lastUiRef.current > 0.16) {
        lastUiRef.current = time;
        let top = bands[0];
        for (const b of bands) if (b.energy > top.energy) top = b;
        setReadout({
          drive,
          hz: top.hz,
          wl: rms > 0.02 && top.k > 1e-3 ? (2 * Math.PI) / top.k : 0,
          above: drive > 0.5,
        });
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
      fieldRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (startedRef.current) {
      // toggle pause of the sim
      const next = !pausedRef.current;
      pausedRef.current = next;
      setPaused(next);
      if (next) engineRef.current?.silence();
      return;
    }
    try {
      const engine = buildEngine(fieldRef.current?.bands ?? 7);
      await engine.resume();
      engineRef.current = engine;
      startedRef.current = true;
      setStarted(true);
    } catch {
      setNotice(
        "Audio could not start in this browser. The dish keeps moving in silence.",
      );
    }
  }, []);

  const toggleMic = useCallback(async () => {
    if (micRef.current) {
      micRef.current = false;
      setMicOn(false);
      return;
    }
    // ensure audio is unlocked first
    if (!engineRef.current) {
      try {
        const engine = buildEngine(fieldRef.current?.bands ?? 7);
        await engine.resume();
        engineRef.current = engine;
        startedRef.current = true;
        setStarted(true);
      } catch {
        /* handled below */
      }
    }
    await engineRef.current?.resume();
    const ok = await engineRef.current?.startMic();
    if (ok) {
      micRef.current = true;
      setMicOn(true);
      setNotice(null);
    } else {
      setNotice(
        "Microphone unavailable or denied — the dish is driven by its seeded carrier instead, so it still pours and answers.",
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  const drivePct = Math.round(readout.drive * 100);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">faraday</h1>
            <p className="mt-1 max-w-xl text-base leading-relaxed text-muted-foreground">
              Pour sound into a dish of water and the water answers back. A real
              Faraday-wave fluid, shaken by the loudness of what it hears,
              self-organises into standing waves — and that emergent pattern
              re-voices the sound that shook it.
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

        {/* readout */}
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>
            drive a(t){" "}
            <span className={readout.above ? "text-primary" : "text-foreground"}>
              {drivePct}%
            </span>
          </span>
          <span>
            state{" "}
            <span className={readout.above ? "text-primary" : "text-foreground"}>
              {readout.above ? "above threshold" : "sub-threshold"}
            </span>
          </span>
          <span>
            dominant{" "}
            <span className="text-foreground">
              {readout.wl > 0 ? `${readout.wl.toFixed(1)}-cell cells` : "flat dish"}
            </span>
          </span>
          <span>
            voicing <span className="text-foreground">{Math.round(readout.hz)} Hz</span>
          </span>
          <span>
            substrate{" "}
            <span className="text-foreground">
              {gpu == null ? "…" : gpu ? "CPU dish (GPU next cycle)" : "CPU dish"}
            </span>
          </span>
        </div>

        {/* art layer */}
        <div className="mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-border bg-[#04040a]">
          <canvas
            ref={canvasRef}
            width={680}
            height={680}
            className="block aspect-square w-full"
            role="img"
            aria-label="A dish of water forming Faraday standing waves in response to sound"
          />
        </div>

        {/* controls */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {!started ? "Begin — pour sound in" : paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={toggleMic}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {micOn ? "Mic on — stop listening" : "Shake it with your voice"}
            </button>
            {!started && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                The dish is already moving — sound waits for your gesture
              </span>
            )}
          </div>

          {notice && (
            <p className="text-sm leading-relaxed text-destructive">{notice}</p>
          )}

          <p className="text-base leading-relaxed text-muted-foreground">
            Below threshold the surface stays glassy. Push the drive past it —
            with your voice, or on the self-demo carrier — and the water answers
            at half the shake frequency (Ω = {OMEGA.toFixed(2)}), growing cells
            whose spacing you can hear: denser ripples brighten the higher
            partials. The pitch is whatever the physics dictates, never a scale.
          </p>
        </div>
      </div>

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
                faraday — design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if
                sound could pour into a dish of water and the water answered
                back — a real Faraday-wave fluid whose emergent standing-wave
                pattern re-voices the sound that shook it?
              </p>
              <p>
                <span className="text-foreground">The physics.</span> A fluid
                surface under vertical vibration is governed, mode by mode, by
                the Mathieu equation. Above a threshold set by viscosity it goes
                <em> parametrically</em> unstable and answers{" "}
                <em>subharmonically</em> — at half the drive frequency — self-
                selecting the wavenumber k* whose natural frequency ω₀(k*) equals
                Ω/2. That is the Faraday instability (Faraday 1831). We integrate
                the real field equation ∂²h/∂t² = c²∇²h − β∇⁴h − γ∂h/∂t +
                F·a(t)·h on a 160×160 grid with a 5-point Laplacian and ping-pong
                stepping; a cubic Landau term saturates it into clean cells.
              </p>
              <p>
                <span className="text-foreground">The see≈hear weld.</span> Each
                frame we read the dish&apos;s radial power spectrum and voice it
                as an inharmonic additive bank: each band is one sine whose gain
                is that band&apos;s spatial energy and whose frequency is ω₀(k)
                of the band&apos;s centroid wavenumber, mapped into the audible
                range. The emergent water pattern literally becomes the timbre.
              </p>
              <p>
                <span className="text-foreground">Why no scale.</span> Pitch is a
                continuous consequence of the fluid&apos;s dispersion relation
                ω₀(k) = √(c²k² + βk⁴) — as the cells coarsen or sharpen, the
                partials glide. Nothing is snapped to a diatonic, pentatonic or
                just-intonation grid; the intervals are whatever the water
                dictates.
              </p>
              <p>
                <span className="text-foreground">Input & fallbacks.</span> The
                shake amplitude a(t) is your microphone&apos;s loudness on a
                gesture; with no mic (denied or headless) a deterministic seeded
                carrier swells across threshold so the piece self-demos on load.
                We detect WebGPU and, when it is absent, run the identical PDE on
                the CPU and paint it via Canvas2D ImageData — it always runs.
              </p>
              <p>
                <span className="text-foreground">References.</span> Faraday, “On
                the forms and states of fluids on vibrating elastic surfaces”
                (Phil. Trans. R. Soc., 1831); the Mathieu equation / parametric
                resonance; Kudrolli & Gollub, “Patterns and spatiotemporal chaos
                in parametrically forced surface waves” (Physica D 97, 1996).
              </p>
              <p>
                <span className="text-foreground">Determinism.</span> Every
                stochastic choice (initial ripple noise, reverb impulse, carrier
                phases) comes from a seeded mulberry32 (seed 0x2768). No
                Math.random, no clock — two runs are identical.
              </p>
              <p>
                <span className="text-foreground">Next-cycle deepening.</span>
                Move the stepping and shading into a WebGPU compute pass (WGSL
                storage buffer + a shading pass) for a 512² dish at 120 fps, and
                tune the pattern selection toward true hexagons at the
                bicritical drive.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
