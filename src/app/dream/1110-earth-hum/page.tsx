"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScene, hasWebGL, type HumScene } from "./scene";
import { startHumAudio, type HumAudio } from "./audio";
import { fetchSpaceWeather, type SpaceWeather } from "./data";
import { README } from "./readme";

type Phase = "idle" | "running" | "nowebgl" | "noaudio";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export default function EarthHumPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<HumScene | null>(null);
  const audioRef = useRef<HumAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const dataRef = useRef<SpaceWeather | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reducedRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [data, setData] = useState<SpaceWeather | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── one gesture: resume audio, build scene, start sound, begin polling ──────
  const begin = useCallback(async () => {
    if (phase !== "idle") return;
    if (!hasWebGL()) {
      setPhase("nowebgl");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Audio (may fail on locked-down browsers → visible notice, scene still runs)
    let audioOk = true;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.9;
      // limiter → destination
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 8;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.25;
      master.connect(limiter);
      limiter.connect(ctx.destination);

      audioRef.current = startHumAudio(ctx, master);
    } catch {
      audioOk = false;
    }

    const scene = buildScene(canvas);
    const rect = canvas.getBoundingClientRect();
    scene.resize(rect.width, rect.height);
    sceneRef.current = scene;

    // Seed the feed immediately so it lives from frame one, then poll every 60s.
    const pull = async () => {
      const d = await fetchSpaceWeather();
      dataRef.current = d;
      setData(d);
      audioRef.current?.applyData(d);
    };
    void pull();
    pollRef.current = setInterval(() => void pull(), 60000);

    setPhase(audioOk ? "running" : "noaudio");
  }, [phase]);

  // ── render + audio step loop (runs while there is a live scene) ─────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "noaudio") return;
    let alive = true;

    const frame = (now: number) => {
      if (!alive) return;
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
      lastRef.current = now;

      audioRef.current?.step(dt);

      const d = dataRef.current;
      const levels = audioRef.current?.getLevels() ?? [0.4, 0.3, 0.25, 0.2, 0.15];
      sceneRef.current?.render(dt, {
        kp: d ? clamp01(d.kp / 9) : 0.4,
        wind: d ? clamp01((d.windSpeed - 300) / (650 - 300)) : 0.4,
        levels,
        reduced: reducedRef.current,
      });

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  // ── prefers-reduced-motion ──────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── resize ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      sceneRef.current?.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      audioRef.current?.stop();
      sceneRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const live = data?.source === "live";
  const showHud = phase === "running" || phase === "noaudio";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0713] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Idle / Start overlay — tapping anywhere starts, too */}
      {phase === "idle" && (
        <div
          className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-6 bg-[#0a0713]/60 px-6 text-center backdrop-blur-sm"
          onClick={() => void begin()}
        >
          <h1 className="text-3xl font-semibold text-white/95 sm:text-4xl">
            Earth Hum
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/80">
            Tune into the planet&apos;s own electromagnetic heartbeat — the real
            Schumann Resonance of the Earth&ndash;ionosphere cavity, sung as a
            warm cosmic drone and driven by live NOAA space-weather data.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void begin();
            }}
            className="min-h-[44px] rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-2.5 text-base text-amber-200 transition hover:bg-amber-300/20"
          >
            Start listening
          </button>
          <p className="text-base text-white/75">
            Headphones or a subwoofer bring out the felt 7.83&nbsp;Hz pulse. One
            tap starts it; it then hums and drifts on its own.
          </p>
        </div>
      )}

      {/* WebGL-missing notice */}
      {phase === "nowebgl" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <p className="max-w-md text-base leading-relaxed text-rose-300">
            This piece renders a live 3-D globe with WebGL, which your browser
            does not appear to support. Try a recent desktop browser with
            hardware acceleration enabled.
          </p>
        </div>
      )}

      {/* Live HUD */}
      {showHud && (
        <div className="absolute left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-base backdrop-blur-md">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={
                live
                  ? "inline-block h-2.5 w-2.5 rounded-full bg-emerald-400"
                  : "inline-block h-2.5 w-2.5 rounded-full bg-amber-400"
              }
            />
            <span className={live ? "text-emerald-300" : "text-amber-300"}>
              {live ? "LIVE · NOAA SWPC" : "simulated"}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-white/95">
            <dt className="text-white/75">Kp index</dt>
            <dd className="text-right tabular-nums">
              {data ? data.kp.toFixed(1) : "—"} / 9
            </dd>
            <dt className="text-white/75">wind</dt>
            <dd className="text-right tabular-nums">
              {data ? Math.round(data.windSpeed) : "—"} km/s
            </dd>
          </dl>
          {phase === "noaudio" && (
            <p className="mt-2 max-w-[16rem] text-base leading-snug text-amber-300/95">
              Audio could not start in this browser — the globe still runs.
            </p>
          )}
        </div>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-base text-white/80 backdrop-blur-md transition hover:text-white/95"
      >
        {notesOpen ? "Close notes" : "Read the design notes"}
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-[#0a0713]/90 px-4 py-10 backdrop-blur-md">
          <div className="max-w-2xl">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-4 min-h-[44px] rounded-full border border-white/15 px-4 py-2.5 text-base text-white/80 hover:text-white/95"
            >
              Close
            </button>
            <pre className="whitespace-pre-wrap font-mono text-base leading-relaxed text-white/85">
              {README}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
