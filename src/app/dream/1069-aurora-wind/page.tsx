"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildScene, hasWebGL, type AuroraScene } from "./scene";
import { startAuroraAudio, type AuroraAudio } from "./audio";
import { fetchSolarWind, type SolarWind } from "./data";
import { README } from "./readme";

type Phase = "idle" | "running" | "nowebgl";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export default function AuroraWindPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<AuroraScene | null>(null);
  const audioRef = useRef<AuroraAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const windRef = useRef<SolarWind | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [wind, setWind] = useState<SolarWind | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── one-shot Begin: resume audio, start scene + sound, kick off polling ─────
  const begin = useCallback(async () => {
    if (phase !== "idle") return;
    if (!hasWebGL()) {
      setPhase("nowebgl");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    audioRef.current = startAuroraAudio(ctx, master);

    const scene = buildScene(canvas);
    const rect = canvas.getBoundingClientRect();
    scene.resize(rect.width, rect.height);
    sceneRef.current = scene;

    // Seed immediately with a synthetic-quality first sample so it sounds and
    // moves from frame one, then poll the live feed.
    const pull = async () => {
      const w = await fetchSolarWind();
      windRef.current = w;
      setWind(w);
      audioRef.current?.applyWind(w);
    };
    void pull();
    pollRef.current = setInterval(() => void pull(), 60000);

    setPhase("running");
  }, [phase]);

  // ── render + audio step loop ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let alive = true;

    const frame = (now: number) => {
      if (!alive) return;
      const dt = lastRef.current ? (now - lastRef.current) / 1000 : 0;
      lastRef.current = now;

      audioRef.current?.step(dt);

      const w = windRef.current;
      sceneRef.current?.render(dt, {
        speed: w ? clamp01((w.speed - 280) / (750 - 280)) : 0.3,
        density: w ? clamp01(w.density / 18) : 0.5,
        intensity: w ? clamp01(-w.bz / 18) : 0.4,
        kp: w ? clamp01(w.kp / 9) : 0.4,
      });

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

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

  const live = wind?.source === "live";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#02030a] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Idle / Begin overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#02030a]/70 px-6 text-center backdrop-blur-sm">
          <h1 className="font-serif text-3xl text-white/95 sm:text-4xl">
            Aurora Wind
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/75">
            The real, live solar wind streaming past Earth right now — sonified
            into a cosmic-ambient aurora you fall into. An endless rising
            glissando and drifting luminous curtains, driven by NOAA space-weather
            data. Fall in.
          </p>
          <button
            type="button"
            onClick={() => void begin()}
            className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-4 py-2.5 text-base text-violet-200 transition hover:bg-violet-300/20"
          >
            Begin
          </button>
          <p className="text-base text-white/55">
            Headphones recommended. One gesture starts the sound; it then drifts
            on its own.
          </p>
        </div>
      )}

      {/* WebGL-missing notice */}
      {phase === "nowebgl" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 text-center">
          <p className="max-w-md text-base leading-relaxed text-rose-300">
            This piece needs WebGL to render the aurora, and your browser does not
            appear to support it. Try a recent desktop browser with hardware
            acceleration enabled.
          </p>
        </div>
      )}

      {/* Live HUD */}
      {phase === "running" && (
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
              {live ? "live · NOAA SWPC" : "synthetic fallback"}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-white/95">
            <dt className="text-white/75">speed</dt>
            <dd className="text-right tabular-nums">
              {wind ? Math.round(wind.speed) : "—"} km/s
            </dd>
            <dt className="text-white/75">density</dt>
            <dd className="text-right tabular-nums">
              {wind ? wind.density.toFixed(1) : "—"} p/cc
            </dd>
            <dt className="text-white/75">Bz</dt>
            <dd className="text-right tabular-nums">
              {wind ? wind.bz.toFixed(1) : "—"} nT
            </dd>
            <dt className="text-white/75">Kp</dt>
            <dd className="text-right tabular-nums">
              {wind ? wind.kp.toFixed(1) : "—"}
            </dd>
          </dl>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur-md transition hover:text-white/95"
      >
        {notesOpen ? "Close notes" : "Design notes"}
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex justify-center overflow-y-auto bg-[#02030a]/85 px-4 py-10 backdrop-blur-md">
          <div className="max-w-2xl">
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mb-4 min-h-[44px] rounded-full border border-white/15 px-4 py-2.5 text-base text-white/75 hover:text-white/95"
            >
              Close
            </button>
            <pre className="whitespace-pre-wrap font-serif text-base leading-relaxed text-white/85">
              {README}
            </pre>
          </div>
        </div>
      )}
    </main>
  );
}
