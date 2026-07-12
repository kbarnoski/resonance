"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { PULSARS } from "./catalog";
import { makeSky, type Sky } from "./scene";
import { makeFlight, type Flight } from "./flight";
import { startPulsarAudio, type PulsarAudio } from "./audio";

type Phase = "idle" | "running";

const DESIGN_NOTES = `# 1492 · Pulsar Clock

*"What if the night sky were a clock you could hear — every visible pulsar sweeping its beam past Earth firing its own real metronomic tick, so the cosmos becomes a vast slowly-phasing polyrhythm?"*

## How it works
Fifteen neutron stars sit on a great celestial sphere at their REAL sky positions — the coordinates are read straight off each pulsar's designation (PSR B1919+21 → RA 19h19m, Dec +21°). Each spins at its measured rotation period, sweeping a thin lighthouse beam.

Sonified by that real period:
- **Millisecond pulsars** (B1937+21 at 1.558 ms → ~642 Hz, B1957+20 → ~622 Hz, J0437−4715 → ~174 Hz, the Crab at 33.5 ms → ~30 Hz) fuse into continuous PITCHED tones — a slowly-beating chord.
- **Second-scale pulsars** (Vela ~11 clicks/s, Geminga, B0329+54, Bell Burnell's B1919+21) fire discrete spatialised woodblock clicks.
- **J0901−4046** (75.9 s) tolls once, like a cathedral bell.

Every voice is placed with an HRTF PannerNode at its sky position, so its tick arrives from where the star hangs. Underneath sits a just-intonation perfect-fifth drone. Fly with arrow keys / WASD (or tilt your phone) and the listener moves through the sphere — more pulsars fall into earshot, and the whole polyrhythm slowly builds and phases in and out of alignment.

## Named reference
- **Jocelyn Bell Burnell's 1967 discovery** of pulsars — the "scruff"/"LGM-1" signal, PSR B1919+21, which is in this sky and tolls at its real 1.337 s.
- **NASA / Chandra "A Universe of Sound"** pulsar sonifications (Crab, Vela).
- **Ryoji Ikeda, *supersymmetry*** — the X-ray/data-scan cosmic aesthetic.

## Ambition floor
Clears ambition #2 (≥3 subsystems) and #3 (named reference). Subsystems: (a) embedded real-data catalog + period→audio-behaviour mapper, (b) polyrhythmic Web-Audio scheduler with per-pulsar HRTF PannerNode + JI drone bed, (c) three.js scene-graph sky with per-pulsar sweeping-beam animation, (d) key/tilt flight camera.

## Not yet verified
HRTF spatialisation and device-tilt were not tested on real hardware/headphones in this build; the phasing "alignment" moments are emergent and unproven to be audibly striking; visual spin rates are clamped (not literal) for the fastest pulsars to avoid strobing.`;

export default function PulsarClockPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const skyRef = useRef<Sky | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const audioRef = useRef<PulsarAudio | null>(null);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [webglError, setWebglError] = useState(false);

  // Mount the self-demoing sky + flight loop (visual runs before any audio).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const sky = makeSky(canvas, !!reduced);
    if (!sky) {
      setWebglError(true);
      return;
    }
    skyRef.current = sky;
    const flight = makeFlight(sky.camera, !!reduced);
    flightRef.current = flight;

    const onResize = () =>
      sky.resize(window.innerWidth, window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);

    let last = performance.now();
    const t0 = last;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const elapsed = (now - t0) / 1000;
      flight.update(dt, elapsed);
      sky.render(elapsed, dt);
      audioRef.current?.update(sky.camera);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      audioRef.current?.dispose();
      audioRef.current = null;
      flight.dispose();
      flightRef.current = null;
      sky.dispose();
      skyRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (audioRef.current) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    try {
      audioRef.current = await startPulsarAudio(PULSARS, !!reduced);
      await flightRef.current?.enableTilt();
      setPhase("running");
    } catch {
      /* AudioContext unavailable — the sky keeps drifting silently */
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header / chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          1492 · dream lab
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Pulsar Clock
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          The night sky as a clock you can hear: fifteen real pulsars, each
          ticking at its true rotation period, spatialised where it hangs — a vast
          polyrhythm that slowly phases in and out of alignment.
        </p>
      </div>

      {/* start / status */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-6 pb-20">
        {webglError ? (
          <p className="text-base text-destructive">
            WebGL is unavailable in this browser, so the sky cannot render.
          </p>
        ) : phase === "idle" ? (
          <button
            type="button"
            onClick={handleStart}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start listening
          </button>
        ) : (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            fly with arrow keys / wasd · tilt to steer · the sky ticks on its own
          </p>
        )}
      </div>

      {/* design-notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute right-6 top-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {DESIGN_NOTES}
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1492-pulsar-clock"]} />
    </main>
  );
}
