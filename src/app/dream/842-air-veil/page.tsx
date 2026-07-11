"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AirAudioEngine,
  applyTension,
  applyVoice,
  makeEngine,
  teardownEngine,
} from "./audio";
import {
  advanceParticles,
  aqiLabel,
  CITIES,
  CityState,
  dirtiness,
  drawCity,
  drawMap,
  drawParticles,
  Particle,
  runParticleStep,
} from "./render";

interface OpenMeteoCurrent {
  pm2_5?: number;
  pm10?: number;
  nitrogen_dioxide?: number;
  ozone?: number;
  sulphur_dioxide?: number;
  carbon_monoxide?: number;
  us_aqi?: number;
}
interface OpenMeteoRow {
  current?: OpenMeteoCurrent;
}

// Plausible seeds (US-AQI) for the offline / failure fallback.
const SIM_SEED = [42, 38, 168, 58, 76, 95];

// Estimate US-AQI from PM2.5 (US EPA breakpoints) when us_aqi is missing.
function pm25ToAqi(pm: number): number {
  const bp: [number, number, number, number][] = [
    [0, 12, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  for (const [cl, ch, il, ih] of bp) {
    if (pm >= cl && pm <= ch) {
      return Math.round(((ih - il) / (ch - cl)) * (pm - cl) + il);
    }
  }
  return pm > 500 ? 500 : 0;
}

export default function AirVeilPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [worstCity, setWorstCity] = useState<string>("—");

  // refs for mutable audio/canvas state (avoids effect-dep churn)
  const engineRef = useRef<AirAudioEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const statesRef = useRef<CityState[]>(
    CITIES.map((_, i) => ({
      aqi: SIM_SEED[i],
      aqiTarget: SIM_SEED[i],
      pm25: 0,
    })),
  );
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const simRef = useRef(false);

  // ---- Data fetch / parse ----
  const fetchAir = useCallback(async () => {
    const lat = CITIES.map((c) => c.lat).join(",");
    const lon = CITIES.map((c) => c.lon).join(",");
    const url =
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" +
      lat +
      "&longitude=" +
      lon +
      "&current=pm2_5,pm10,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi";
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("bad status");
      const json: unknown = await res.json();
      const rows: OpenMeteoRow[] = Array.isArray(json)
        ? (json as OpenMeteoRow[])
        : [json as OpenMeteoRow];
      let any = false;
      statesRef.current.forEach((st, i) => {
        const cur = rows[i]?.current;
        if (!cur) return;
        const pm = typeof cur.pm2_5 === "number" ? cur.pm2_5 : 0;
        let aqi =
          typeof cur.us_aqi === "number" ? cur.us_aqi : pm25ToAqi(pm);
        if (!Number.isFinite(aqi)) aqi = pm25ToAqi(pm);
        st.aqiTarget = Math.max(0, aqi);
        st.pm25 = pm;
        any = true;
      });
      if (!any) throw new Error("empty");
      simRef.current = false;
      setSimulated(false);
    } catch {
      // graceful degradation: random-walk the seeded simulation
      simRef.current = true;
      setSimulated(true);
      statesRef.current.forEach((st, i) => {
        const drift = (Math.random() - 0.5) * 24;
        const next = Math.max(8, SIM_SEED[i] + drift);
        st.aqiTarget = next;
        st.pm25 = next * 0.5;
      });
    }
  }, []);

  // ---- Animation + audio loop ----
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();
    let windPhase = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      windPhase += dt * 0.6;

      const w = canvas.width;
      const h = canvas.height;
      const states = statesRef.current;

      // ease AQI toward target
      let worstAqi = -1;
      let worstIdx = 0;
      states.forEach((st, i) => {
        st.aqi += (st.aqiTarget - st.aqi) * 0.02;
        if (st.aqi > worstAqi) {
          worstAqi = st.aqi;
          worstIdx = i;
        }
      });

      // render
      drawMap(ctx, w, h);
      CITIES.forEach((c, i) => {
        runParticleStep(particlesRef.current, c, states[i], w, h);
      });
      advanceParticles(particlesRef.current, w, h, windPhase);
      drawParticles(ctx, particlesRef.current);
      CITIES.forEach((c, i) => drawCity(ctx, c, states[i], w, h));

      // audio updates
      const eng = engineRef.current;
      if (eng) {
        states.forEach((st, i) => {
          applyVoice(eng, i, dirtiness(st.aqi), 1);
        });
        applyTension(eng, dirtiness(worstAqi));
      }

      // worst-city label (throttle React updates a touch)
      if (Math.floor(windPhase * 2) % 2 === 0) {
        setWorstCity(
          `${CITIES[worstIdx].name} — AQI ${Math.round(worstAqi)} (${aqiLabel(
            worstAqi,
          )})`,
        );
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // size canvas + start visual loop immediately (before audio)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    fetchAir();
    runLoop();
    const poll = window.setInterval(fetchAir, 60000);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.clearInterval(poll);
    };
  }, [fetchAir, runLoop]);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) teardownEngine(engineRef.current);
      if (ctxRef.current) ctxRef.current.close().catch(() => {});
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    ctxRef.current = ctx;
    engineRef.current = makeEngine(ctx, CITIES.length);
    startedRef.current = true;
    setStarted(true);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#070a10] text-foreground">
      {/* Canvas world map */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="World map with drifting air-pollution particle veils"
      />

      {/* Header / controls */}
      <div className="relative z-10 flex flex-col gap-3 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Air Veil
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Hear the air six cities are breathing right now — the dirtier the air,
          the more it fouls the harmony.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!started ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-lg bg-violet-500/90 px-5 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400"
            >
              Listen to the air
            </button>
          ) : (
            <span className="min-h-[44px] rounded-lg border border-violet-300/30 px-4 py-2.5 text-base text-violet-300/95">
              Sounding live — six voices over a just-intonation chord
            </span>
          )}
        </div>

        {simulated && (
          <p className="font-mono text-base text-violet-300">
            Live feed unavailable — simulated air. The full mechanic still runs
            on plausible drifting values.
          </p>
        )}

        <p className="font-mono text-base text-muted-foreground">
          worst right now:{" "}
          <span className="text-violet-300/95">{worstCity}</span>
        </p>
      </div>

      {/* design-notes affordance, corner */}
      <Link
        href="/dream/842-air-veil/README.md"
        className="absolute bottom-4 right-4 z-10 font-mono text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </Link>
    </main>
  );
}
