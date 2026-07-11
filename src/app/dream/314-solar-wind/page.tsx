"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAuroraRenderer, type AuroraRenderer } from "./aurora";
import { createDroneEngine, type DroneEngine } from "./audio";
import {
  buildSampleHistory,
  runFetchWindHistory,
  type WindHistory,
  type WindSample,
} from "./space-weather";

// ─────────────────────────────────────────────────────────────────────────────
// 314 · Solar Wind — the Sun, scoring a drone in real time.
//
// A long-form generative piece scored, live, by space weather above the
// listener. Three keyless NOAA SWPC feeds (solar-wind plasma, magnetic field,
// planetary Kp) drive a continuous just-intonation overtone drone and a sky of
// layered aurora curtains. Faster wind brightens; denser plasma thickens the
// texture; southward Bz detunes a tension partial into slow beating; a high Kp
// pushes the whole piece into a storm climax and lights the curtains magenta.
//
// LIVE mode sonifies the present moment, slowly drifting as the feeds re-poll
// every ~60s. REPLAY mode time-compresses the last 24h into ~3 minutes so you
// hear a whole day of the Sun — storm and all — as a single arc.
//
// Lineage: Terry Riley & Kronos Quartet, *Sun Rings* (2002), built from Don
// Gurnett's real NASA plasma-wave recordings — this is the live-data cousin.
// Data: NOAA Space Weather Prediction Center. Spirit: Seismic-Sound-Lab.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 60_000;
const REPLAY_SECONDS = 180; // a 24h history compressed to ~3 minutes

type Mode = "live" | "replay";

function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "–";
}

function lerpSample(a: WindSample, b: WindSample, f: number): WindSample {
  const m = (x: number, y: number) => x + (y - x) * f;
  return {
    t: m(a.t, b.t),
    speed: m(a.speed, b.speed),
    density: m(a.density, b.density),
    bz: m(a.bz, b.bz),
    bt: m(a.bt, b.bt),
    kp: m(a.kp, b.kp),
  };
}

export default function SolarWindPage() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("live");
  const [history, setHistory] = useState<WindHistory | null>(null);
  const [readout, setReadout] = useState<WindSample | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replayProgress, setReplayProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DroneEngine | null>(null);
  const rendererRef = useRef<AuroraRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mutable render state shared between the rAF loop and React.
  const stateRef = useRef({
    history: null as WindHistory | null,
    mode: "live" as Mode,
    replayStart: 0, // performance.now() when replay began
    current: null as WindSample | null,
  });

  // ── data loading ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const h = await runFetchWindHistory();
      setHistory(h);
      stateRef.current.history = h;
      if (h.source === "sample") {
        setLoadError(null);
      }
    } catch {
      const h = buildSampleHistory();
      setHistory(h);
      stateRef.current.history = h;
      setLoadError("Could not reach NOAA SWPC — playing bundled sample data.");
    }
  }, []);

  // ── the render + audio loop ──────────────────────────────────────────────────
  const begin = useCallback(async () => {
    setStarted(true);

    // Create audio inside the user gesture so iOS unlocks it.
    const engine = createDroneEngine();
    engineRef.current = engine;
    await engine.ctx.resume().catch(() => {});

    const canvas = canvasRef.current;
    if (canvas) {
      const c2d = canvas.getContext("2d");
      if (c2d) rendererRef.current = createAuroraRenderer(c2d);
    }

    // Ensure we have data (load() may already have run before the tap).
    if (!stateRef.current.history) await load();
    stateRef.current.replayStart = performance.now();

    let last = performance.now();

    const tick = () => {
      const nowMs = performance.now();
      const dt = nowMs - last;
      last = nowMs;

      const st = stateRef.current;
      const hist = st.history;
      let sample: WindSample | null = null;

      if (hist && hist.samples.length) {
        if (st.mode === "replay") {
          const elapsed = (nowMs - st.replayStart) / 1000;
          const f = (elapsed % REPLAY_SECONDS) / REPLAY_SECONDS;
          setReplayProgress(f);
          const pos = f * (hist.samples.length - 1);
          const i = Math.floor(pos);
          const j = Math.min(i + 1, hist.samples.length - 1);
          sample = lerpSample(hist.samples[i], hist.samples[j], pos - i);
        } else {
          // Live: the present moment is the newest sample.
          sample = hist.samples[hist.samples.length - 1];
        }
      }

      if (sample) {
        st.current = sample;
        engineRef.current?.update(sample);
        const level = engineRef.current?.getLevel() ?? 0;
        rendererRef.current?.draw(sample, level, dt);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // A throttled readout for the on-screen numbers (no per-frame React churn).
    readoutTimerRef.current = setInterval(() => {
      if (stateRef.current.current) setReadout({ ...stateRef.current.current });
    }, 500);

    // Re-poll the live feeds so the piece keeps drifting with the real Sun.
    pollRef.current = setInterval(() => {
      void load();
    }, POLL_MS);
  }, [load]);

  // Kick off a data fetch as soon as the page mounts so it's ready on tap.
  useEffect(() => {
    void load();
  }, [load]);

  // Keep the loop's view of the mode in sync.
  useEffect(() => {
    stateRef.current.mode = mode;
    if (mode === "replay") stateRef.current.replayStart = performance.now();
  }, [mode]);

  // Resize the canvas to its container with DPR awareness.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      rendererRef.current?.resize(w, h, dpr);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (readoutTimerRef.current) clearInterval(readoutTimerRef.current);
      engineRef.current?.dispose();
    };
  }, []);

  const source = history?.source ?? null;
  const sourceNote = history?.note ?? "Connecting to NOAA SWPC…";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#02030a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Corner: design notes link */}
      <Link
        href="/dream/314-solar-wind/README.md"
        className="absolute right-4 top-4 z-20 text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
      >
        Read the design notes
      </Link>

      {/* Hero / intro overlay before Begin */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-sm uppercase tracking-[0.3em] text-violet-300">
            Resonance · 314
          </p>
          <h1 className="max-w-3xl font-semibold text-4xl leading-tight text-foreground sm:text-5xl">
            Solar Wind
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground sm:text-lg">
            A long-form drone scored, live and in real time, by the Sun — the
            actual state of space weather above you right now, fetched from NOAA
            and turned into harmony and a sky of aurora.
          </p>
          <button
            onClick={begin}
            className="mt-8 min-h-[44px] rounded-full bg-card px-7 py-3 text-lg font-medium text-black transition-transform hover:scale-[1.03] active:scale-95"
          >
            Begin
          </button>
          <p className="mt-4 font-mono text-sm text-muted-foreground">
            {sourceNote}
          </p>
        </div>
      )}

      {/* Live HUD after Begin */}
      {started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6">
          {/* top row: provenance + mode toggle */}
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto rounded-xl border border-border bg-black/40 px-4 py-2.5 backdrop-blur-md">
              <p className="font-semibold text-xl text-foreground sm:text-2xl">Solar Wind</p>
              <p
                className={`mt-0.5 font-mono text-sm ${
                  source === "live"
                    ? "text-violet-300/95"
                    : "text-violet-300/95"
                }`}
              >
                {sourceNote}
              </p>
              {loadError && (
                <p className="mt-1 text-sm text-violet-300">{loadError}</p>
              )}
            </div>

            <div className="pointer-events-auto flex flex-col gap-2">
              <div className="flex overflow-hidden rounded-full border border-border bg-black/40 backdrop-blur-md">
                <button
                  onClick={() => setMode("live")}
                  className={`min-h-[44px] px-4 py-2.5 text-sm font-medium transition-colors ${
                    mode === "live"
                      ? "bg-card text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Live
                </button>
                <button
                  onClick={() => setMode("replay")}
                  className={`min-h-[44px] px-4 py-2.5 text-sm font-medium transition-colors ${
                    mode === "replay"
                      ? "bg-card text-black"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Replay 24h
                </button>
              </div>
              {mode === "replay" && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-violet-300/90"
                    style={{ width: `${replayProgress * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* bottom: the Sun's actual numbers */}
          <div className="pointer-events-auto self-start rounded-xl border border-border bg-black/40 px-4 py-3 backdrop-blur-md">
            <p className="mb-2 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
              The Sun, right now
            </p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
              <Stat
                label="Speed"
                value={readout ? `${fmt(readout.speed, 0)}` : "–"}
                unit="km/s"
              />
              <Stat
                label="Density"
                value={readout ? fmt(readout.density, 1) : "–"}
                unit="p/cm³"
              />
              <Stat
                label="Bz"
                value={readout ? fmt(readout.bz, 1) : "–"}
                unit="nT"
                accent={readout && readout.bz < -2 ? "rose" : undefined}
              />
              <Stat
                label="Kp"
                value={readout ? fmt(readout.kp, 1) : "–"}
                unit={readout && readout.kp >= 5 ? "STORM" : ""}
                accent={readout && readout.kp >= 5 ? "amber" : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: "rose" | "amber";
}) {
  const valueColor =
    accent === "rose"
      ? "text-violet-300"
      : accent === "amber"
        ? "text-violet-300/95"
        : "text-foreground";
  return (
    <div>
      <p className="font-mono text-sm text-muted-foreground">{label}</p>
      <p className={`font-mono text-xl ${valueColor}`}>
        {value}{" "}
        <span className="text-sm text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
