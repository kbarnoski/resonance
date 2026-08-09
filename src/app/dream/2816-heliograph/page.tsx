"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2816-heliograph — "hear the actual weather on the Sun right now".
//
// Fetches NOAA SWPC real-time space-weather telemetry client-side (solar-wind
// speed, interplanetary magnetic field Bt/Bz, planetary Kp) and turns it into a
// slow cosmic-ambient drone + a WebGL2 auroral-curtain shader. Southward Bz —
// the physics of geomagnetic storms — audibly bends the drone from near-
// harmonic calm into beating, noisy roughness. If any feed fails or the browser
// is offline, a fully deterministic seeded "storm day" simulator keeps the
// piece living with zero network. Silent until "Begin" (autoplay policy); the
// aurora breathes from the moment the page mounts. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  deriveParams,
  fetchSolarState,
  mulberry32,
  simulateSolarState,
  type SolarState,
} from "./noaa";
import { HeliographAudio } from "./audio";
import { makeAuroraGL, makeAurora2D } from "./aurora";

const POLL_MS = 45_000;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HeliographAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountRef = useRef<number>(0);
  const liveRef = useRef<SolarState | null>(null); // latest real NOAA sample
  const rngRef = useRef<() => number>(mulberry32(0x2816));
  const reducedRef = useRef<boolean>(false);
  const lastHudRef = useRef<number>(0);

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [renderer, setRenderer] = useState<"webgl" | "canvas">("webgl");
  const [showNotes, setShowNotes] = useState(false);
  const [state, setState] = useState<SolarState>(() => simulateSolarState(0));

  // ── aurora + animation loop ────────────────────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    mountRef.current = performance.now();

    const gl = makeAuroraGL(canvas);
    const art =
      gl ?? makeAurora2D(canvas, mulberry32(0x2816));
    setRenderer(gl ? "webgl" : "canvas");
    if (!art) return;

    const onResize = () => art.resize();
    window.addEventListener("resize", onResize);

    const frame = () => {
      const nowMs = performance.now();
      const elapsed = (nowMs - mountRef.current) / 1000;

      // Live NOAA sample if we have one, else the deterministic simulator.
      const s = liveRef.current ?? simulateSolarState(elapsed);
      const p = deriveParams(s);

      art.render(p, elapsed, reducedRef.current);
      audioRef.current?.update(p);

      // Throttle React HUD updates to ~5 Hz.
      if (nowMs - lastHudRef.current > 200) {
        lastHudRef.current = nowMs;
        setState(s);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", onResize);
      art.dispose();
    };
  }, []);

  // ── NOAA polling ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const s = await fetchSolarState(controller.signal);
        if (!cancelled) liveRef.current = s;
      } catch {
        // Offline / CORS / shape surprise → keep the seeded simulator running.
        if (!cancelled) liveRef.current = null;
      }
    };

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(id);
    };
  }, []);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      audioRef.current = new HeliographAudio(rngRef.current);
    }
    await audioRef.current.start();
    setPhase("running");
  }, []);

  const status = state.live
    ? `LIVE · solar wind ${Math.round(state.speed)} km/s · Kp ${state.kp.toFixed(
        1,
      )}`
    : "SIMULATED (offline)";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Title + description */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Heliograph
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          The live weather on the Sun, right now — the real solar wind blowing
          past Earth, heard as an evolving cosmic drone.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              state.live ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Live readout */}
      <div className="pointer-events-none absolute bottom-16 left-6 z-10 space-y-1">
        <Readout label="wind" value={`${Math.round(state.speed)} km/s`} />
        <Readout label="bt" value={`${state.bt.toFixed(1)} nT`} />
        <Readout
          label="bz"
          value={`${state.bz > 0 ? "+" : ""}${state.bz.toFixed(1)} nT ${
            state.bz < 0 ? "S" : "N"
          }`}
        />
        <Readout label="kp" value={state.kp.toFixed(1)} />
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-16 right-6 z-10 max-w-[15rem] text-right">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          wind → pitch · bt → richness
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          bz → calm ↔ storm · kp → swells
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {renderer === "webgl" ? "webgl2 aurora" : "canvas2d aurora"}
        </p>
      </div>

      {/* Begin overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/40 backdrop-blur-[2px]">
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Begin
          </button>
          <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
            Audio unlocks on this gesture. The aurora is already breathing to the
            current field.
          </p>
        </div>
      )}

      {/* Notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Three NOAA SWPC real-time feeds — solar-wind speed, the
              interplanetary magnetic field (Bt total, Bz north–south), and the
              planetary K-index — are fetched from your browser and re-polled
              every 45 seconds. Each drives one voice: wind speed sets the base
              drone pitch on a continuous log glide; Bt lifts the upper partials
              into richness; Kp adds slow shimmer swells and sparse substorm
              bells.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The emotional core is Bz. When the field turns southward — the
              condition that couples solar wind into Earth&apos;s magnetosphere
              and lights real auroras — the partials bend off-integer, their
              twin oscillators split into beating, and a noise bed rises. You
              hear the field turn stormy while the curtains redden and roil.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              If the network is unavailable, a deterministic seeded storm-day
              simulator (mulberry32 · 0x2816) keeps everything alive with zero
              fetches. References: NOAA SWPC real-time products; NASA HARP
              (Heliophysics Audified Resonances in Plasmas,
              listen.spacescience.org); heliophysics sonification of
              Parker / Wind / MMS data via CDAWeb.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2816-heliograph"]} />
    </main>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 font-mono text-xs uppercase tracking-[0.18em]">
      <span className="w-10 text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
