"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchWeather,
  makeMemory,
  makeSynthetic,
  advanceSynthetic,
  CITIES,
  FETCH_TIMEOUT_MS,
  POLL_MS,
  type WeatherFrame,
  type WeatherMemory,
  type SyntheticState,
} from "./weather";
import { AtmosphereAudio } from "./audio";
import { createGpuField, type GpuField, type CityField } from "./gpu";

type DataMode = "demo" | "live" | "connecting";

export default function AtmosphereVeilPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuRef = useRef<GpuField | null>(null);
  const audioRef = useRef<AtmosphereAudio | null>(null);
  const synthRef = useRef<SyntheticState | null>(null);
  const memRef = useRef<WeatherMemory | null>(null);
  const frameRef = useRef<WeatherFrame | null>(null);
  const modeRef = useRef<DataMode>("connecting");
  const fallback2dRef = useRef<
    { x: number; y: number; vx: number; vy: number }[] | null
  >(null);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<DataMode>("connecting");
  const [gpuOk, setGpuOk] = useState(true);
  const [tensionPct, setTensionPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Start (user gesture: AudioContext lives here) ───────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // Audio inside the gesture (iOS AudioContext policy).
    try {
      const a = new AtmosphereAudio();
      a.resume();
      audioRef.current = a;
    } catch {
      audioRef.current = null;
    }

    // Synthetic model + memory run immediately — the piece is never dead.
    const mem = makeMemory();
    memRef.current = mem;
    synthRef.current = makeSynthetic();
    frameRef.current = advanceSynthetic(synthRef.current, mem, 0);
    setMode("connecting");

    // WebGPU particle field (or Canvas2D fallback).
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const field = await createGpuField(canvas);
        if (field) {
          gpuRef.current = field;
        } else {
          setGpuOk(false);
          runFallbackInit();
        }
      } catch {
        setGpuOk(false);
        runFallbackInit();
      }
    }

    // Try the live feed (does not block the piece).
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const live = await fetchWeather(mem, ac.signal);
      frameRef.current = live;
      setMode("live");
      modeRef.current = "live";
    } catch {
      setMode("demo");
      modeRef.current = "demo";
    } finally {
      clearTimeout(to);
    }
  }, [started]);

  function runFallbackInit() {
    const pts = [];
    for (let i = 0; i < 1400; i++) {
      pts.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0 });
    }
    fallback2dRef.current = pts;
  }

  // ── Live polling every 75s ────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const id = setInterval(async () => {
      const mem = memRef.current;
      if (!mem) return;
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
      try {
        const live = await fetchWeather(mem, ac.signal);
        if (!cancelled) {
          frameRef.current = live;
          setMode("live");
          modeRef.current = "live";
        }
      } catch {
        if (!cancelled) {
          setMode("demo");
          modeRef.current = "demo";
        }
      } finally {
        clearTimeout(to);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [started]);

  // ── Main loop: advance synthetic in demo mode, feed audio + GPU ──────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastT = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      // Demo / connecting: keep the synthetic sky evolving with no live data
      // and no user input. Tension genuinely moves; nothing resolves on a timer.
      const mem = memRef.current;
      if (modeRef.current !== "live" && synthRef.current && mem) {
        frameRef.current = advanceSynthetic(synthRef.current, mem, dt);
      }

      const frame = frameRef.current;
      if (frame) {
        // Audio: the DATA's tension drives the chord. applyTension relaxes only
        // when frame.tension falls.
        audioRef.current?.applyTension(frame.tension, dt);

        // GPU particle field: build city vortices (lat from CITIES, lon stored).
        const fields: CityField[] = frame.cities.map((c, i) => ({
          x: Math.max(-1, Math.min(1, c.lon / 180)),
          y: Math.max(-1, Math.min(1, (CITIES[i]?.lat ?? 0) / 90)),
          instability: c.instability,
        }));
        const gpu = gpuRef.current;
        if (gpu) {
          gpu.setCities(fields, frame.tension);
          gpu.frame(dt);
        } else if (fallback2dRef.current) {
          drawFallback(frame);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── Throttled HUD updates ────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const startT = performance.now();
    const id = setInterval(() => {
      const frame = frameRef.current;
      if (frame) setTensionPct(Math.round(frame.tension * 100));
      setElapsed(Math.floor((performance.now() - startT) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [started]);

  // ── Canvas2D fallback renderer (WebGPU absent) ───────────────────────────
  function drawFallback(frame: WeatherFrame) {
    const canvas = canvasRef.current;
    const pts = fallback2dRef.current;
    if (!canvas || !pts) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const wantW = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const wantH = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== wantW || canvas.height !== wantH) {
      canvas.width = wantW;
      canvas.height = wantH;
    }
    const W = canvas.width;
    const H = canvas.height;
    c2d.fillStyle = "rgba(3,4,9,0.22)";
    c2d.fillRect(0, 0, W, H);

    const T = frame.tension;
    for (const p of pts) {
      let wx = 0;
      let wy = 0;
      frame.cities.forEach((city, i) => {
        const cx = (city.lon / 180 + 1) / 2;
        const cy = (1 - (CITIES[i]?.lat ?? 0) / 90) / 2;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy + 0.01;
        wx += (-dy / d2) * city.instability * 0.0006;
        wy += (dx / d2) * city.instability * 0.0006;
      });
      wx += (Math.random() - 0.5) * (0.0004 + T * 0.004);
      wy += (Math.random() - 0.5) * (0.0004 + T * 0.004);
      p.vx = p.vx * 0.9 + wx;
      p.vy = p.vy * 0.9 + wy;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
        p.x = Math.random();
        p.y = Math.random();
        p.vx = 0;
        p.vy = 0;
      }
      const sp = Math.min(1, Math.hypot(p.vx, p.vy) * 600);
      const r = Math.round(80 + T * 160 + sp * 60);
      const g = Math.round(90 + sp * 50);
      const b = Math.round(210 - T * 120);
      c2d.fillStyle = `rgba(${r},${g},${b},${0.25 + sp * 0.4})`;
      c2d.fillRect(p.x * W, p.y * H, 1.6 * dpr, 1.6 * dpr);
    }
  }

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => gpuRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const gpu = gpuRef.current;
      const audio = audioRef.current;
      gpu?.dispose();
      audio?.dispose();
      gpuRef.current = null;
      audioRef.current = null;
    };
  }, []);

  const modeLabel =
    mode === "live" ? "LIVE" : mode === "demo" ? "DEMO DATA" : "CONNECTING";
  const modeClass =
    mode === "live"
      ? "text-violet-300"
      : mode === "demo"
        ? "text-violet-300/95"
        : "text-muted-foreground";

  const tensionClass =
    tensionPct >= 66
      ? "text-violet-300"
      : tensionPct >= 33
        ? "text-violet-300/95"
        : "text-violet-300";

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#030409] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#030409]/80 via-transparent to-[#030409]/85" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        {/* Top: title + description */}
        <header className="max-w-xl">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/dream"
              className="pointer-events-auto rounded-full border border-border px-3 py-1.5 text-base text-muted-foreground transition hover:bg-accent"
            >
              ← dream
            </Link>
            <h1 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              Atmosphere — Veil
            </h1>
            <span
              className={`rounded-full border border-current px-2 py-0.5 text-sm font-medium ${modeClass}`}
            >
              {modeLabel}
            </span>
          </div>
          <p className="mt-2 max-w-md text-base leading-relaxed text-foreground">
            The whole planet&apos;s live weather, breathing as one sustained,
            unresolved chord. Tens of thousands of particles ride the global
            wind field. The dissonance only relaxes when the real sky calms —
            never on a timer, never on a tap.
          </p>
        </header>

        {/* Bottom: HUD + controls */}
        <footer className="space-y-3">
          {started && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div className="text-base text-foreground">
                Global tension{" "}
                <span className={`font-semibold ${tensionClass}`}>
                  {tensionPct}%
                </span>
              </div>
              <div className="font-mono text-base text-muted-foreground">
                {mm}:{ss}
              </div>
              <div className="text-base text-muted-foreground">
                {mode === "live"
                  ? "12 cities · polling Open-Meteo"
                  : "synthetic evolving sky"}
              </div>
            </div>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!started && (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-xl bg-violet-600/90 px-5 py-2.5 text-base font-semibold text-foreground shadow-lg shadow-violet-900/50 transition hover:bg-violet-500"
              >
                ▶ Start
              </button>
            )}
            <details className="group pointer-events-auto">
              <summary className="min-h-[44px] cursor-pointer list-none rounded-xl border border-border px-4 py-2.5 text-base text-muted-foreground transition hover:bg-accent">
                Read the design notes
              </summary>
              <div className="mt-2 max-h-[55vh] max-w-md overflow-y-auto rounded-2xl border border-border bg-[#070a14]/95 p-5 text-base leading-relaxed text-foreground shadow-2xl">
                <p>
                  <span className="font-semibold text-foreground">Data →</span> Live
                  Open-Meteo current weather for 12 globe-spanning cities, one
                  batched request every 75 s. Per-city instability = high wind +
                  low/<em>falling</em> surface pressure + heavy cloud. Global
                  tension blends the mean with the worst sky.
                </p>
                <p className="mt-3">
                  <span className="font-semibold text-foreground">Sound →</span> A
                  sustained spectral drone. At rest: open fifths + octaves
                  (consonance). As tension rises the partials detune into audible
                  beating, tension tones (minor 2nd, tritone, b9) fade in, and a
                  roughness tremolo deepens. It relaxes back toward consonance{" "}
                  <em>only</em> when the data calms. A drifting tonal center and
                  mutating voicing pool mean minute 8 differs from minute 1 — it
                  never loops. Reference:{" "}
                  <span className="text-violet-300">
                    Éliane Radigue&apos;s sustained beating drones
                  </span>
                  , with spectral-tension thinking after Grisey.
                </p>
                <p className="mt-3">
                  <span className="font-semibold text-foreground">Light →</span> A
                  WebGPU compute shader advects ~60,000 particles through a wind
                  field built from the 12 city vortices. Speed, turbulence and
                  color-temperature (cool indigo → warm amber/rose) rise with
                  tension. No WebGPU → a readable notice plus a Canvas2D dot
                  fallback; audio always keeps running.
                </p>
                <p className="mt-3 text-muted-foreground">
                  Cycle 3 of the lab&apos;s Living Earth spine (after Terra
                  Gamelan and Helios Orbit). See README.md for the full mapping
                  and unverified-surface caveats.
                </p>
              </div>
            </details>
          </div>
        </footer>
      </div>

      {/* WebGPU absent notice */}
      {!gpuOk && (
        <div className="pointer-events-none absolute inset-x-0 top-[88px] mx-auto max-w-md px-6">
          <p className="rounded-xl border border-violet-400/40 bg-violet-950/60 p-4 text-base text-violet-300">
            WebGPU is unavailable in this browser, so the compute particle field
            can&apos;t run. The atmospheric drone still plays and a simpler
            Canvas2D wind field is shown — try Chrome or Edge for the full
            experience.
          </p>
        </div>
      )}
    </main>
  );
}
