"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchNoaaSpaceWeather,
  makeSyntheticState,
  advanceSyntheticState,
  triggerSyntheticStorm,
  glideWeather,
  type SpaceWeather,
  type SyntheticState,
  type GlidedWeather,
} from "./spaceweather";
import { HeliosAudioEngine } from "./audio";
import { createHeliosScene, type HeliosScene } from "./scene";

// Re-poll live NOAA data every 60 seconds
const POLL_MS = 60_000;
// Fetch timeout (ms)
const FETCH_TIMEOUT_MS = 8_000;

type DataMode = "live" | "simulated" | "connecting";
type StormState = "quiet" | "building" | "drop" | "decay";

export default function HeliosOrbitPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<HeliosScene | null>(null);
  const audioRef = useRef<HeliosAudioEngine | null>(null);
  const synthRef = useRef<SyntheticState | null>(null);
  const glidedRef = useRef<GlidedWeather>({
    windSpeed: 400,
    windDensity: 5,
    bz: 0,
    bt: 5,
    kp: 1,
  });
  const liveTargetRef = useRef<SpaceWeather | null>(null);
  const modeRef = useRef<DataMode>("connecting");
  const prevStormActiveRef = useRef(false);
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const hhTimerRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [mode, setMode] = useState<DataMode>("connecting");
  const [stormState, setStormState] = useState<StormState>("quiet");
  const [displayKp, setDisplayKp] = useState(0);
  const [displayBz, setDisplayBz] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(400);
  const [showNotes, setShowNotes] = useState(false);

  // Keep modeRef in sync with state
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Begin (user gesture) ────────────────────────────────────────────────
  const handleBegin = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // Create audio engine inside gesture for iOS AudioContext policy
    let audio: HeliosAudioEngine | null = null;
    try {
      audio = new HeliosAudioEngine();
      audio.resume();
      audioRef.current = audio;
    } catch {
      audioRef.current = null;
    }

    // three.js scene
    const canvas = canvasRef.current;
    if (canvas) {
      const s = createHeliosScene(canvas);
      if (!s) {
        setWebglOk(false);
      } else {
        sceneRef.current = s;
      }
    }

    // Try live feed first
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let live: SpaceWeather | null = null;
    try {
      live = await fetchNoaaSpaceWeather(ac.signal);
    } catch {
      live = null;
    } finally {
      clearTimeout(timeout);
    }

    if (live) {
      setMode("live");
      modeRef.current = "live";
      liveTargetRef.current = live;
      glidedRef.current = {
        windSpeed: live.windSpeed,
        windDensity: live.windDensity,
        bz: live.bz,
        bt: live.bt,
        kp: live.kp,
      };
    } else {
      setMode("simulated");
      modeRef.current = "simulated";
      const s = makeSyntheticState();
      synthRef.current = s;
      glidedRef.current = {
        windSpeed: s.windSpeed,
        windDensity: s.windDensity,
        bz: s.bz,
        bt: s.bt,
        kp: s.kp,
      };
    }
  }, [started]);

  // ── Simulate storm now button ────────────────────────────────────────────
  const handleSimulateStorm = useCallback(() => {
    if (synthRef.current) {
      triggerSyntheticStorm(synthRef.current);
    } else {
      // Force switch to synthetic if we were on live
      const s = makeSyntheticState();
      triggerSyntheticStorm(s);
      synthRef.current = s;
      setMode("simulated");
      modeRef.current = "simulated";
    }
  }, []);

  // ── Live polling loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (modeRef.current === "simulated") return;
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      try {
        const live = await fetchNoaaSpaceWeather(ac.signal);
        if (!cancelled && live) {
          liveTargetRef.current = live;
          setMode("live");
          modeRef.current = "live";
        } else if (!cancelled) {
          setMode("simulated");
          modeRef.current = "simulated";
          if (!synthRef.current) synthRef.current = makeSyntheticState();
        }
      } catch {
        // network error — fall to simulated silently
        if (!cancelled) {
          setMode("simulated");
          modeRef.current = "simulated";
          if (!synthRef.current) synthRef.current = makeSyntheticState();
        }
      } finally {
        clearTimeout(timeout);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [started]);

  // ── Main animation + data loop ──────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastT = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(0.08, (t - lastT) / 1000);
      lastT = t;

      const scene = sceneRef.current;
      const audio = audioRef.current;
      const currentMode = modeRef.current;

      // ── Advance synthetic state ──────────────────────────────────────
      if (currentMode === "simulated" && synthRef.current) {
        advanceSyntheticState(synthRef.current, dt);
        const s = synthRef.current;
        liveTargetRef.current = {
          windSpeed: s.windSpeed,
          windDensity: s.windDensity,
          bz: s.bz,
          bt: s.bt,
          kp: s.kp,
          isLive: false,
        };
        setStormState(s.stormPhase as StormState);
      }

      // ── Exponential glide toward target ──────────────────────────────
      if (liveTargetRef.current) {
        glidedRef.current = glideWeather(
          glidedRef.current,
          liveTargetRef.current,
          dt,
          0.92
        );
      }

      const g = glidedRef.current;

      // ── Update display readouts (throttle: ~5fps) ────────────────────
      setDisplayKp(Math.round(g.kp * 10) / 10);
      setDisplayBz(Math.round(g.bz * 10) / 10);
      setDisplaySpeed(Math.round(g.windSpeed));

      // ── Audio ─────────────────────────────────────────────────────────
      if (audio) {
        audio.applyWeather(g.windSpeed, g.windDensity, g.bz, g.kp);

        // Hi-hat noise burst on beat (triggered here, not in audio.ts)
        hhTimerRef.current += dt;
        const hhInterval = 0.12 / (1 + Math.min(1, (g.kp - 2) / 4));
        if (hhTimerRef.current > hhInterval && g.kp > 2) {
          hhTimerRef.current = 0;
          audio.scheduleHiHat();
        }
      }

      // ── Visual ───────────────────────────────────────────────────────
      if (scene) {
        scene.applyWeather(g.kp, g.bz);
      }

      // ── Bloom / drop one-shot trigger ─────────────────────────────────
      const stormNow = g.kp >= 5;
      if (stormNow && !prevStormActiveRef.current) {
        // Storm just crossed the threshold
        scene?.triggerBloom();
        audio?.triggerAuroraBloom();
      }
      prevStormActiveRef.current = stormNow;
      if (currentMode === "live") {
        setStormState(stormNow ? "drop" : g.kp >= 3 ? "building" : "quiet");
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── Drag to rotate ────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = draggingRef.current;
    if (!d) return;
    sceneRef.current?.drag(e.clientX - d.x, e.clientY - d.y);
    draggingRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Derived UI state ──────────────────────────────────────────────────────
  const stormLabel =
    stormState === "drop"
      ? "STORM"
      : stormState === "decay"
        ? "DECAY"
        : stormState === "building"
          ? "BUILDING"
          : null;

  const modeLabel =
    mode === "live"
      ? "LIVE"
      : mode === "simulated"
        ? "SIMULATED"
        : "CONNECTING";

  const modeLabelClass =
    mode === "live"
      ? "text-violet-300"
      : mode === "simulated"
        ? "text-violet-300"
        : "text-muted-foreground";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#010409] text-foreground">
      {/* three.js canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Vignette overlay so text stays readable */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#010409]/75 via-transparent to-[#010409]/80" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        {/* ── Top: title + description ─────────────────────────────────── */}
        <header className="max-w-xl">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dream"
              className="pointer-events-auto rounded-full border border-border px-3 py-1.5 text-base text-muted-foreground transition hover:bg-accent"
            >
              ← dream
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Helios — Orbit
            </h1>
            <span
              className={`rounded-full border border-current px-2 py-0.5 text-sm font-medium ${modeLabelClass}`}
            >
              {modeLabel}
            </span>
          </div>
          <p className="mt-2 max-w-md text-base leading-relaxed text-foreground">
            A dark Earth from orbit. Live solar wind and the planetary K-index
            drive an EDM build-and-drop — the geomagnetic storm IS the drop,
            and auroral ovals ignite around the magnetic poles when it peaks.
          </p>
        </header>

        {/* ── Bottom: live readout + controls ─────────────────────────── */}
        <footer className="space-y-3">
          {/* Live telemetry readout */}
          {started && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <div className="text-base text-foreground">
                Wind{" "}
                <span className="font-semibold text-violet-300">
                  {displaySpeed}
                </span>{" "}
                km/s
              </div>
              <div
                className={`text-base font-medium ${
                  displayBz < -5
                    ? "text-violet-300"
                    : displayBz < 0
                      ? "text-violet-300"
                      : "text-foreground"
                }`}
              >
                Bz{" "}
                <span className="font-semibold">
                  {displayBz > 0 ? "+" : ""}
                  {displayBz.toFixed(1)}
                </span>{" "}
                nT
              </div>
              <div
                className={`text-base font-medium ${
                  displayKp >= 5
                    ? "text-violet-300"
                    : displayKp >= 3
                      ? "text-violet-300"
                      : "text-foreground"
                }`}
              >
                Kp{" "}
                <span className="font-semibold">{displayKp.toFixed(1)}</span>
              </div>
              {stormLabel && (
                <div
                  className={`rounded-full px-2.5 py-0.5 text-sm font-bold tracking-widest ${
                    stormState === "drop"
                      ? "bg-violet-500/30 text-violet-300"
                      : stormState === "decay"
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-violet-500/20 text-violet-300"
                  }`}
                >
                  {stormLabel}
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!started ? (
              <button
                onClick={handleBegin}
                className="min-h-[44px] rounded-xl bg-violet-600/90 px-5 py-2.5 text-base font-semibold text-foreground shadow-lg shadow-violet-900/50 transition hover:bg-violet-500"
              >
                ▶ Begin
              </button>
            ) : (
              <button
                onClick={handleSimulateStorm}
                className="min-h-[44px] rounded-xl border border-violet-400/40 bg-violet-900/40 px-4 py-2.5 text-base text-violet-300 transition hover:bg-violet-800/50"
              >
                Simulate storm now
              </button>
            )}

            <button
              onClick={() => setShowNotes((v) => !v)}
              className="pointer-events-auto min-h-[44px] rounded-xl border border-border px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent"
            >
              Design notes
            </button>
          </div>
        </footer>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-x-4 top-[80px] z-10 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-[#08101e]/95 p-5 shadow-2xl sm:inset-x-auto sm:left-4 sm:max-w-sm">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-base text-muted-foreground transition hover:bg-accent"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 space-y-3 text-base leading-relaxed text-foreground">
            <p>
              <span className="font-semibold text-foreground">Data →</span> NOAA SWPC
              solar-wind plasma (speed, density), IMF Bz/Bt, and planetary
              K-index polled every 60 s with exponential glide. On network
              failure, a random-walk synthetic with a scripted storm (auto-builds
              ~22 s after start) takes over silently.
            </p>
            <p>
              <span className="font-semibold text-foreground">Audio →</span> Wind
              speed drives filter cutoff/brightness. Density drives pad shimmer.
              Bz negative drifts the pad from A-major toward A-minor (rising
              tension). Kp ≥ 5 = THE DROP: sub-bass swell, 4-on-the-floor kick
              at 128 BPM, harmony snaps back to major. Post-storm: ambient
              bed fades back in.
            </p>
            <p>
              <span className="font-semibold text-foreground">Visual →</span> A dark
              Fibonacci dot-sphere (visual continuity with{" "}
              <em>Terra Gamelan</em>). Auroral ovals around the IGRF magnetic
              poles brighten, widen, and shift green → magenta/red as Kp and
              |Bz| rise. On the drop: magnetosphere halo blooms and then fades.
            </p>
            <p className="text-sm text-muted-foreground">
              See README.md in this folder for references, arc details, and
              the unverified-surface list.
            </p>
          </div>
        </div>
      )}

      {/* WebGL unavailable notice */}
      {!webglOk && (
        <div className="absolute inset-x-0 top-1/2 mx-auto max-w-md -translate-y-1/2 px-6">
          <p className="rounded-xl border border-violet-400/40 bg-violet-950/60 p-4 text-base text-violet-300">
            WebGL is unavailable in this browser, so the orbital view
            can&apos;t be shown. The space-weather audio still plays — try a
            different browser or device for the full experience.
          </p>
        </div>
      )}
    </main>
  );
}
