"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchUsgs,
  makeSyntheticQuake,
  poissonArrivals,
  seedSyntheticBacklog,
  type Quake,
} from "./seismic";
import { GamelanEngine, type TuningName } from "./audio";
import { createTerraScene, type TerraScene } from "./scene";

type Mode = "live" | "simulated" | "connecting";

// Rolling-energy window: count + magnitude weight of quakes in the last N ms.
const ENERGY_WINDOW_MS = 5 * 60 * 1000;
// Synthetic global arrival rate (quakes/sec) when in fallback.
const SYNTH_RATE = 0.55;
// Re-poll the live feed this often.
const POLL_MS = 60_000;

export default function TerraGamelanPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<TerraScene | null>(null);
  const engineRef = useRef<GamelanEngine | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const recentRef = useRef<Quake[]>([]); // for rolling energy
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const modeRef = useRef<Mode>("connecting");

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [mode, setMode] = useState<Mode>("connecting");
  const [count, setCount] = useState(0);
  const [tuning, setTuning] = useState<TuningName>("slendro");
  const [muted, setMuted] = useState(false);
  const [latest, setLatest] = useState<Quake | null>(null);

  // keep a ref copy of mode so timers read fresh value without re-subscribing
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Set live/simulated/connecting in both the ref (read by timers) and state.
  const applyMode = useCallback((m: Mode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  // Ingest a batch of quakes: place on globe, ring new ones, update energy.
  const ingest = useCallback((quakes: Quake[], ringNew: boolean) => {
    const scene = sceneRef.current;
    const engine = engineRef.current;
    const now = Date.now();
    let newest: Quake | null = null;
    for (const q of quakes) {
      const isNew = !seenRef.current.has(q.id);
      if (isNew) seenRef.current.add(q.id);
      scene?.addQuake(q, ringNew && isNew);
      if (isNew && ringNew) engine?.ringQuake(q);
      if (isNew) recentRef.current.push(q);
      if (!newest || q.time > newest.time) newest = q;
    }
    // trim rolling window + compute energy
    const cutoff = now - ENERGY_WINDOW_MS;
    recentRef.current = recentRef.current.filter((q) => q.time >= cutoff);
    let energy = 0;
    for (const q of recentRef.current) {
      energy += 0.12 + Math.min(1, Math.max(0, (q.mag + 1) / 8)) * 0.9;
    }
    // normalize: ~20 weighted units -> full bed
    engine?.setSeismicEnergy(Math.min(1, energy / 20));
    if (scene) setCount(scene.count());
    if (newest) setLatest((prev) => (!prev || newest!.time >= prev.time ? newest : prev));
  }, []);

  // ── boot on user gesture ───────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // audio engine (must be created/resumed inside the gesture)
    let engine: GamelanEngine | null = null;
    try {
      engine = new GamelanEngine();
      engine.resume();
      engine.setTuning(tuning);
      engineRef.current = engine;
    } catch {
      engineRef.current = null;
    }

    // three.js scene
    const canvas = canvasRef.current;
    if (canvas) {
      const scene = createTerraScene(canvas);
      if (!scene) {
        setWebglOk(false);
      } else {
        sceneRef.current = scene;
      }
    }

    // try live feed; fall back to synthetic
    const live = await fetchUsgs();
    if (live && live.length > 0) {
      applyMode("live");
      // place all quietly (ingest marks them seen + builds the energy window),
      // then ring only the ~6 most recent so the open isn't a wall of sound.
      ingest(live, false);
      const engineNow = engineRef.current;
      for (const q of live.slice(-6)) engineNow?.ringQuake(q);
    } else {
      applyMode("simulated");
      const backlog = seedSyntheticBacklog(130);
      ingest(backlog, false);
      // ring a couple recent ones
      const eng = engineRef.current;
      for (const q of backlog.slice(-4)) eng?.ringQuake(q);
    }
  }, [started, tuning, ingest, applyMode]);

  // ── live polling loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (modeRef.current === "simulated") return; // sim loop handles it
      const live = await fetchUsgs();
      if (cancelled) return;
      if (live && live.length > 0) {
        applyMode("live");
        // only ingest unseen ones; ring new arrivals
        const fresh = live.filter((q) => !seenRef.current.has(q.id));
        if (fresh.length > 0) ingest(fresh, true);
      } else {
        // feed dropped — switch to simulated rather than going silent
        applyMode("simulated");
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [started, ingest, applyMode]);

  // ── synthetic arrival loop (active only while in simulated mode) ───────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(1, (t - last) / 1000);
      last = t;
      if (modeRef.current === "simulated") {
        const n = poissonArrivals(SYNTH_RATE, dt);
        if (n > 0) {
          const batch: Quake[] = [];
          for (let i = 0; i < n; i++) batch.push(makeSyntheticQuake());
          ingest(batch, true);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, ingest]);

  // ── resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── tuning + mute toggles ──────────────────────────────────────────────────
  const toggleTuning = useCallback(() => {
    setTuning((prev) => {
      const next: TuningName = prev === "slendro" ? "pelog" : "slendro";
      engineRef.current?.setTuning(next);
      return next;
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // ── drag to rotate ─────────────────────────────────────────────────────────
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

  const statusLine =
    mode === "live"
      ? "live — USGS feed"
      : mode === "simulated"
        ? "showing simulated seismicity — live USGS feed unavailable"
        : "connecting to USGS feed…";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#02060e] text-foreground">
      {/* three.js canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* subtle vignette so HUD text stays readable */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#02060e]/70 via-transparent to-[#02060e]/80" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        {/* top: title + description */}
        <header className="max-w-xl">
          <div className="flex items-center gap-3">
            <Link
              href="/dream"
              className="pointer-events-auto rounded-full border border-border px-3 py-1.5 text-base text-muted-foreground transition hover:bg-accent"
            >
              ← dream
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Terra Gamelan
            </h1>
          </div>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Every earthquake on Earth, right now, ringing a bell tuned to a
            Javanese gamelan scale on a slowly turning globe of light.
          </p>
        </header>

        {/* bottom: live stats + controls */}
        <footer className="space-y-3">
          <div className="max-w-xl space-y-1">
            <p
              className={
                mode === "live"
                  ? "text-base font-medium text-violet-300/95"
                  : mode === "simulated"
                    ? "text-base font-medium text-violet-300/95"
                    : "text-base font-medium text-muted-foreground"
              }
            >
              {statusLine}
            </p>
            <p className="text-base text-muted-foreground">
              <span className="text-violet-300">{count}</span> quakes glowing ·
              tuning{" "}
              <span className="text-violet-300">{tuning}</span>
            </p>
            {latest && (
              <p className="text-base text-muted-foreground">
                latest: M{latest.mag.toFixed(1)} · {latest.place} ·{" "}
                {Math.round(latest.depthKm)} km deep
              </p>
            )}
          </div>

          {/* controls */}
          <div className="pointer-events-auto flex flex-wrap gap-2">
            {!started ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-xl bg-violet-500/90 px-5 py-2.5 text-base font-semibold text-foreground shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
              >
                ▶ Begin listening to the Earth
              </button>
            ) : (
              <>
                <button
                  onClick={toggleTuning}
                  className="min-h-[44px] rounded-xl border border-border px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
                >
                  tuning: {tuning} → {tuning === "slendro" ? "pelog" : "slendro"}
                </button>
                <button
                  onClick={toggleMute}
                  className="min-h-[44px] rounded-xl border border-border px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
                >
                  {muted ? "🔇 unmute" : "🔊 mute"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>

      {/* WebGL-unavailable notice */}
      {!webglOk && (
        <div className="absolute inset-x-0 top-1/2 mx-auto max-w-md -translate-y-1/2 px-6">
          <p className="rounded-xl border border-violet-400/40 bg-violet-950/60 p-4 text-base text-violet-300">
            WebGL is unavailable in this browser, so the globe can&apos;t be
            shown. The gamelan audio still plays — try a different browser or
            device for the full visual.
          </p>
        </div>
      )}
    </main>
  );
}
