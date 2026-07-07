"use client";

// 1244-dayline — the Earth's rotation as a music sequencer.
//
// A flat (equirectangular) world map. Offline solar astronomy computes where
// the sun is and which half of the Earth is lit; the day/night terminator
// sweeps the map. As it crosses each of ~44 cities at dawn or dusk, that city
// rings a note (pitch ← latitude, pan ← longitude). A low drone tracks the
// total sunlit landmass. A self-composing sequencer driven by real planetary
// geometry.
//
// References: Refik Anadol, "Machine Dreams: Rainforest" (Dataland, opened
// 2026-06-20); Ryoji Ikeda, "data.tron"; classic day/night terminator maps.

import { useCallback, useEffect, useRef, useState } from "react";
import { DaylineMap } from "./map-canvas";
import { DaylineAudio } from "./audio";
import {
  Subsolar,
  subsolarPoint,
  solarAltitudeDeg,
  utcHours,
} from "./astro";
import { CITIES, isLand } from "./cities";

// Precompute a coarse set of land sample points for the sunlit-land estimate.
const LAND_SAMPLES: { lat: number; lon: number }[] = (() => {
  const out: { lat: number; lon: number }[] = [];
  for (let lat = -85; lat <= 85; lat += 4) {
    for (let lon = -178; lon <= 178; lon += 4) {
      if (isLand(lon, lat)) out.push({ lat, lon });
    }
  }
  return out;
})();

function computeSunlitLand(sub: Subsolar): number {
  if (LAND_SAMPLES.length === 0) return 0;
  let lit = 0;
  for (const s of LAND_SAMPLES) {
    if (solarAltitudeDeg(s.lat, s.lon, sub) >= 0) lit++;
  }
  return lit / LAND_SAMPLES.length;
}

// Log time-speed range: 1× (real time) up to a full day per ~40s.
const SPEED_MIN = 1;
const SPEED_MAX = 86400 / 40; // 2160×
function sliderToSpeed(s: number): number {
  return Math.exp(Math.log(SPEED_MIN) + s * (Math.log(SPEED_MAX) - Math.log(SPEED_MIN)));
}
function formatSpeed(mult: number): string {
  if (mult < 2) return "1× · real time";
  if (mult >= SPEED_MAX * 0.98) return "2160× · day / 40s";
  return `${Math.round(mult)}× faster`;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<DaylineMap | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<DaylineAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const clockRef = useRef<number>(Date.now()); // simulated UTC ms
  const speedRef = useRef<number>(1);
  const playingRef = useRef<boolean>(true);
  const startedRef = useRef<boolean>(false);
  const rebaselineRef = useRef<boolean>(true);
  const prevAltRef = useRef<Float32Array>(new Float32Array(CITIES.length).fill(NaN));
  const uiTickRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speedSlider, setSpeedSlider] = useState(0);
  const [speedLabel, setSpeedLabel] = useState(formatSpeed(1));
  const [clockLabel, setClockLabel] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [sunlitPct, setSunlitPct] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);

  // Mount: build the map, run the render/step loop immediately (before audio).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let map: DaylineMap;
    try {
      map = new DaylineMap(canvas);
    } catch {
      return;
    }
    mapRef.current = map;

    const onResize = () => mapRef.current?.resize();
    window.addEventListener("resize", onResize);

    lastRef.current = performance.now();

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;

      if (playingRef.current) {
        clockRef.current += dt * 1000 * speedRef.current;
      }

      const sub = subsolarPoint(clockRef.current);

      // Crossing detection.
      const prev = prevAltRef.current;
      const audio = audioRef.current;
      const m = mapRef.current;
      const rebaseline = rebaselineRef.current;
      for (let i = 0; i < CITIES.length; i++) {
        const c = CITIES[i];
        const alt = solarAltitudeDeg(c.lat, c.lon, sub);
        const p = prev[i];
        if (!rebaseline && !Number.isNaN(p)) {
          if (p < 0 && alt >= 0) {
            // Dawn (up-crossing).
            audio?.ringCity({ lat: c.lat, lon: c.lon, isDawn: true });
            m?.triggerBloom(i);
          } else if (p >= 0 && alt < 0) {
            // Dusk (down-crossing).
            audio?.ringCity({ lat: c.lat, lon: c.lon, isDawn: false });
            m?.triggerBloom(i);
          }
        }
        prev[i] = alt;
      }
      rebaselineRef.current = false;

      const sunlit = computeSunlitLand(sub);
      audio?.setSunlit(sunlit);

      m?.render({ sub, dt });

      // Throttled UI updates.
      uiTickRef.current += dt;
      if (uiTickRef.current > 0.15) {
        uiTickRef.current = 0;
        const d = new Date(clockRef.current);
        const hh = d.getUTCHours().toString().padStart(2, "0");
        const mm = d.getUTCMinutes().toString().padStart(2, "0");
        setClockLabel(`${hh}:${mm} UTC`);
        setDateLabel(
          d.toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        );
        setSunlitPct(Math.round(sunlit * 100));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      audioRef.current?.dispose();
      audioRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      mapRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (startedRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setAudioFailed(true);
      return;
    }
    try {
      const ctx = new Ctor();
      await ctx.resume().catch(() => {});
      const audio = new DaylineAudio(ctx);
      audio.start();
      ctxRef.current = ctx;
      audioRef.current = audio;
      // Re-baseline so we don't machine-gun crossings on unlock.
      rebaselineRef.current = true;
      startedRef.current = true;
      setStarted(true);
    } catch {
      setAudioFailed(true);
    }
  }, []);

  const togglePlay = useCallback(() => {
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
    // Resume from a pause without firing a burst of crossings.
    if (playingRef.current) rebaselineRef.current = true;
  }, []);

  const onSpeed = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const s = Number(e.target.value) / 1000;
    setSpeedSlider(Number(e.target.value));
    const mult = sliderToSpeed(s);
    const prev = speedRef.current;
    speedRef.current = mult;
    setSpeedLabel(formatSpeed(mult));
    // A large speed change would fabricate crossings — re-baseline silently.
    if (Math.abs(Math.log(mult) - Math.log(prev)) > 0.5) {
      rebaselineRef.current = true;
    }
  }, []);

  const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hour = Number(e.target.value) / 100; // 0..24
    const cur = clockRef.current;
    const d = new Date(cur);
    // Set UTC hour-of-day, keep the date.
    const base = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
    );
    clockRef.current = base + hour * 3_600_000;
    // Scrubbing must not fire the swept-over crossings.
    rebaselineRef.current = true;
  }, []);

  const jumpToNow = useCallback(() => {
    clockRef.current = Date.now();
    rebaselineRef.current = true;
  }, []);

  const scrubValue = Math.round(utcHours(clockRef.current) * 100);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#f3ecda] text-[#2b2a24]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 w-full p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Dayline
        </h1>
        <p className="mt-1.5 max-w-2xl text-base leading-relaxed text-[#4a4738]">
          The Earth&rsquo;s rotation as a sequencer — the day/night terminator
          sweeps the map, and every city it crosses at dawn or dusk rings a note.
        </p>
      </div>

      {/* Clock readout */}
      <div className="pointer-events-none absolute right-4 top-20 rounded-md border border-[#2b2a24]/25 bg-[#f3ecda]/80 px-3 py-2 text-right backdrop-blur sm:top-24">
        <div className="text-xl font-semibold tabular-nums">{clockLabel}</div>
        <div className="text-base text-[#4a4738]">{dateLabel}</div>
        <div className="mt-1 text-base text-[#4a4738]">
          sunlit land <span className="font-semibold tabular-nums">{sunlitPct}%</span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 w-full p-5 sm:p-7">
        <div className="pointer-events-auto flex max-w-2xl flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                onClick={begin}
                className="min-h-[44px] rounded-full border border-[#2b2a24]/40 bg-[#e8a63c]/80 px-4 py-2.5 text-base font-medium text-[#2b2a24] shadow-sm transition hover:bg-[#e8a63c]"
              >
                Begin
              </button>
            ) : (
              <button
                onClick={togglePlay}
                className="min-h-[44px] rounded-full border border-[#2b2a24]/40 bg-[#f3ecda]/80 px-4 py-2.5 text-base font-medium text-[#2b2a24] shadow-sm backdrop-blur transition hover:bg-[#f3ecda]"
              >
                {playing ? "Pause" : "Play"}
              </button>
            )}
            <button
              onClick={jumpToNow}
              className="min-h-[44px] rounded-full border border-[#2b2a24]/40 bg-[#f3ecda]/80 px-4 py-2.5 text-base font-medium text-[#2b2a24] shadow-sm backdrop-blur transition hover:bg-[#f3ecda]"
            >
              Now
            </button>
            {audioFailed && (
              <span className="text-base font-medium text-[#a23b2f]">
                Audio unavailable — the map still runs.
              </span>
            )}
          </div>

          <label className="flex flex-col gap-1 text-base text-[#4a4738]">
            <span>
              time speed{" "}
              <span className="font-medium text-[#2b2a24]">{speedLabel}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1000}
              value={speedSlider}
              onChange={onSpeed}
              className="h-2 w-full max-w-md cursor-pointer accent-[#c07a1e]"
            />
          </label>

          <label className="flex flex-col gap-1 text-base text-[#4a4738]">
            <span>scrub time of day (UTC)</span>
            <input
              type="range"
              min={0}
              max={2400}
              value={scrubValue}
              onChange={onScrub}
              className="h-2 w-full max-w-md cursor-pointer accent-[#c07a1e]"
            />
          </label>
        </div>
      </div>

      {/* Design notes */}
      <div className="absolute right-4 bottom-4">
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-[#2b2a24]/25 bg-[#f3ecda]/80 px-3 py-2.5 text-base text-[#2b2a24] backdrop-blur transition hover:bg-[#f3ecda]"
        >
          {showNotes ? "Hide notes" : "Design notes"}
        </button>
        {showNotes && (
          <div className="pointer-events-auto mt-2 max-w-sm rounded-md border border-[#2b2a24]/25 bg-[#f3ecda]/90 p-3 text-base leading-relaxed text-[#3a382e] backdrop-blur">
            <p>
              Offline solar geometry places the sun each frame: declination{" "}
              <span className="tabular-nums">δ = -23.44°·cos(360/365·(N+10))</span>
              , subsolar longitude from UTC hours, and the standard altitude
              formula per city. A city rings when its solar altitude crosses zero
              — dawn on the way up, dusk on the way down. Pitch follows latitude
              (poleward = higher, pentatonic); stereo pan follows longitude. The
              drone tracks the sunlit landmass. Simplifications: coarse continent
              polygons, and no equation-of-time or atmospheric refraction. See the
              folder README for full formulas and references (Refik Anadol,
              <em> Machine Dreams: Rainforest</em>; Ryoji Ikeda, <em>data.tron</em>).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
