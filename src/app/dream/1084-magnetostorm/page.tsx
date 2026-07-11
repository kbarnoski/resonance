"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1084-magnetostorm — "What does the solar wind hitting Earth right now sound
// and look like?" A live sonification + particle-aurora instrument driven by
// NOAA SWPC real-time-solar-wind data (DSCOVR/ACE + IMAP I-ALiRT, 2026).
// Degrades to a bundled modeled-storm sample when offline.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  fetchDrivers,
  paramsFromDrivers,
  type Drivers,
  type Params,
} from "./data";
import { FALLBACK_ARC } from "./fallback";
import { createAuroraScene } from "./aurora";
import { startAuroraAudio, type AuroraAudio } from "./audio";

type Phase = "idle" | "running";
type Source = "live" | "offline";

const POLL_MS = 60_000;

interface SceneHandle {
  update(p: Params, dt: number): void;
  perturb(x: number, y: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function MagnetostormPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("offline");
  const [drivers, setDrivers] = useState<Drivers | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const audioRef = useRef<AuroraAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The live driver snapshot the render loop reads from (a ref so the rAF loop
  // sees updates without re-subscribing).
  const paramsRef = useRef<Params>({
    energy: 0.3,
    coupling: 0,
    thickness: 0.3,
    turbulence: 0.2,
    intensity: 0.25,
  });
  const lastCouplingRef = useRef<number>(0);

  // Offline arc cursor — advance one modeled sample per poll so offline mode
  // audibly + visibly *builds* like a real storm.
  const arcIdxRef = useRef<number>(0);

  /** Apply a fresh driver snapshot to state, params ref, audio, and fire an
   *  onset if Bz just crossed strongly southward. */
  const applyDrivers = useCallback((d: Drivers, src: Source) => {
    setDrivers(d);
    setSource(src);
    const p = paramsFromDrivers(d);
    paramsRef.current = p;
    audioRef.current?.update(p);
    // Substorm onset: coupling rises sharply past a threshold.
    if (p.coupling > 0.5 && p.coupling - lastCouplingRef.current > 0.12) {
      audioRef.current?.onset(p.coupling);
    }
    lastCouplingRef.current = p.coupling;
  }, []);

  /** Fetch live drivers; on any failure fall back to the modeled arc. */
  const poll = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const d = await fetchDrivers(ac.signal);
      applyDrivers(d, "live");
    } catch {
      if (ac.signal.aborted) return;
      const arc = FALLBACK_ARC;
      const d = arc[arcIdxRef.current % arc.length];
      arcIdxRef.current += 1;
      applyDrivers(d, "offline");
    }
  }, [applyDrivers]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    sceneRef.current?.resize(w, h);
  }, []);

  const start = useCallback(async () => {
    if (phase === "running") return;

    // Seed immediately with the modeled arc's first sample so the poster gives
    // way to a live-looking instrument without waiting on the network.
    applyDrivers(FALLBACK_ARC[0], "offline");
    arcIdxRef.current = 1;

    setPhase("running");

    // ── three.js ────────────────────────────────────────────────────────────
    if (!webglAvailable()) {
      setWebglError(
        "WebGL is unavailable in this browser, so the aurora can't render. The sonification still runs.",
      );
    } else if (canvasRef.current) {
      try {
        sceneRef.current = createAuroraScene(canvasRef.current);
        resize();
      } catch {
        setWebglError(
          "The WebGL aurora failed to initialise. The sonification still runs.",
        );
      }
    }

    // ── Web Audio (needs the user gesture we're inside of) ────────────────────
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      acRef.current = ctx;
      audioRef.current = startAuroraAudio(ctx);
      audioRef.current.update(paramsRef.current);
    } catch {
      setAudioBlocked(true);
    }

    // ── Kick off the live poll + 60s repeat ───────────────────────────────────
    void poll();
    pollRef.current = setInterval(() => void poll(), POLL_MS);

    // ── Render loop ───────────────────────────────────────────────────────────
    lastTickRef.current = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;
      sceneRef.current?.update(paramsRef.current, dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, applyDrivers, poll, resize]);

  // Window resize → resize the renderer.
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, resize]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      abortRef.current?.abort();
      audioRef.current?.stop();
      sceneRef.current?.dispose();
      const ctx = acRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  // Light user perturbation: pointer drag pushes the curtain sheet.
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (phase !== "running" || (e.buttons & 1) === 0) return;
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      sceneRef.current?.perturb(nx, -ny);
    },
    [phase],
  );

  const fmt = (v: number, digits = 1) =>
    Number.isFinite(v) ? v.toFixed(digits) : "—";

  const live = source === "live";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#02040a] text-foreground">
      {/* WebGL canvas fills the viewport when running. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: phase === "running" ? "block" : "none" }}
      />
      {/* Perturbation surface (transparent, above canvas, below UI). */}
      {phase === "running" && (
        <div
          className="absolute inset-0"
          onPointerMove={onPointerMove}
          aria-hidden
        />
      )}

      {/* ── Header / poster ─────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 flex flex-col gap-3 p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Magnetostorm
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          What the solar wind hitting Earth right now sounds and looks like — a
          live sonification and particle aurora driven by NOAA SWPC real-time
          solar-wind telemetry (DSCOVR / ACE + IMAP I-ALiRT).
        </p>

        {phase === "idle" && (
          <div className="pointer-events-auto mt-2 flex flex-col gap-3">
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] w-fit rounded-full bg-violet-400/90 px-4 py-2.5 text-base font-semibold text-black transition-colors hover:bg-violet-300"
            >
              Start — feel the storm
            </button>
            <p className="max-w-xl text-base text-muted-foreground">
              Audio + WebGL begin on Start. Drag to steer the field; the data
              drives the aurora. Falls back to a modeled G2 storm sample if the
              live feed is unreachable.
            </p>
          </div>
        )}
      </div>

      {/* ── Live readout panel (running) ─────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute bottom-6 left-4 z-10 max-w-md rounded-2xl border border-border bg-black/55 p-4 backdrop-blur-md sm:left-6">
          <div className="mb-2 flex items-center gap-2">
            {live ? (
              <span className="text-base font-medium text-violet-300">
                ● live — NOAA SWPC
              </span>
            ) : (
              <span className="text-base font-medium text-violet-300">
                ● offline sample (modeled storm)
              </span>
            )}
            {drivers?.timestamp && (
              <span className="text-base text-muted-foreground">
                {drivers.timestamp}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-base text-foreground sm:grid-cols-4">
            <div>
              <dt className="text-base text-muted-foreground">Speed</dt>
              <dd className="tabular-nums">
                {fmt(drivers?.speed ?? NaN, 0)} km/s
              </dd>
            </div>
            <div>
              <dt className="text-base text-muted-foreground">Density</dt>
              <dd className="tabular-nums">
                {fmt(drivers?.density ?? NaN, 1)} /cm³
              </dd>
            </div>
            <div>
              <dt className="text-base text-muted-foreground">Bz (GSM)</dt>
              <dd
                className={`tabular-nums ${
                  (drivers?.bz ?? 0) < -5
                    ? "text-violet-300"
                    : "text-foreground"
                }`}
              >
                {fmt(drivers?.bz ?? NaN, 1)} nT
              </dd>
            </div>
            <div>
              <dt className="text-base text-muted-foreground">Kp</dt>
              <dd className="tabular-nums">{fmt(drivers?.kp ?? NaN, 1)}</dd>
            </div>
          </dl>

          <p className="mt-3 text-base text-muted-foreground">
            Speed → energy · southward Bz → the storm erupts · density → curtain
            thickness · |B| → turbulence · Kp → global intensity + color.
          </p>

          {audioBlocked && (
            <p className="mt-2 text-base text-violet-300">
              Audio was blocked — the aurora still runs, silent.
            </p>
          )}
          {webglError && (
            <p className="mt-2 text-base text-violet-300">{webglError}</p>
          )}
        </div>
      )}

      <PrototypeNav slugs={["1084-magnetostorm"]} />
    </main>
  );
}
