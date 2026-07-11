"use client";

/**
 * 347 · The Place Where You Go to Listen
 *
 * "What if Resonance scored a long-form piece from the REAL local sky — the
 *  actual clock hour, the sun's position, the moon's phase, the season — so the
 *  music is genuinely different at 3am than at noon, and slowly evolves as real
 *  time passes?"
 *
 * INPUT  : device clock + optional geolocation (NO network API).
 * OUTPUT : Web Audio just-intonation drone/choir + raw WebGL2 horizon/sky.
 * METHOD : local-astronomy sonification + long-form evolving state machine.
 *
 * After John Luther Adams, *The Place Where You Go to Listen* (Fairbanks) —
 * an installation that sonifies the local sun, moon, aurora and seismic data
 * in real time. Also in Brian Eno's generative-ambient lineage.
 *
 * Everything is self-contained in this folder. No cross-prototype imports.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSkyState,
  moodLabel,
  seasonLabel,
  type SkyState,
} from "./astronomy";
import { createEngine, type Engine } from "./audioEngine";
import { createSkyRenderer, type SkyRenderer } from "./skyRenderer";

// Fixed fallback place if geolocation is denied or slow (Anchorage-ish, the
// high-latitude flavor that makes the sky-music dramatic — a nod to Fairbanks).
const FALLBACK_LAT = 61.2;
const FALLBACK_LON = -149.9;
const GEO_TIMEOUT_MS = 3000;

type Place = { lat: number; lon: number; source: "device" | "fallback" };

function formatClock(hours: number): string {
  const total = ((hours % 24) + 24) % 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rendererRef = useRef<SkyRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // scrubber: minutes-of-day offset added to "now". When `scrubActive` is
  // false the piece tracks real wall-clock time. The slider is 0..(24*365)
  // minutes-ish but we expose two sliders: hour-of-day and day-of-year.
  const scrubActiveRef = useRef(false);
  const dayMinutesRef = useRef(0); // 0..1439 forced hour-of-day
  const dayOfYearRef = useRef(0); // 0..364 forced day offset

  const placeRef = useRef<Place>({
    lat: FALLBACK_LAT,
    lon: FALLBACK_LON,
    source: "fallback",
  });

  const [began, setBegan] = useState(false);
  const [needGesture, setNeedGesture] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [place, setPlace] = useState<Place>(placeRef.current);

  // UI mirror of the live state (updated ~4x/sec, cheap).
  const [readout, setReadout] = useState<{
    clock: string;
    alt: number;
    az: number;
    moon: number;
    season: string;
    mood: string;
    scrubbing: boolean;
  }>({
    clock: "--:--",
    alt: 0,
    az: 0,
    moon: 0,
    season: "—",
    mood: "listening to the sky…",
    scrubbing: false,
  });

  // scrubber slider UI values
  const [hourSlider, setHourSlider] = useState(0);
  const [daySlider, setDaySlider] = useState(0);
  const [scrubOn, setScrubOn] = useState(false);

  // Build the Date the music should be scored for, honoring the scrubber.
  const currentSkyDate = useCallback((): Date => {
    const real = new Date();
    if (!scrubActiveRef.current) return real;
    const d = new Date(real);
    // force hour-of-day
    const mins = dayMinutesRef.current;
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    // force day-of-year offset from Jan 1
    const jan1 = new Date(real.getFullYear(), 0, 1, 0, 0, 0, 0);
    jan1.setDate(jan1.getDate() + dayOfYearRef.current);
    d.setMonth(jan1.getMonth(), jan1.getDate());
    return d;
  }, []);

  // main loop: compute sky -> drive audio + visuals
  useEffect(() => {
    if (!began) return;

    const canvas = canvasRef.current;
    let renderer: SkyRenderer | null = null;
    if (canvas) {
      renderer = createSkyRenderer(canvas);
      if (!renderer) setGlFailed(true);
    }
    rendererRef.current = renderer;

    const start = performance.now();
    let lastAudioUpdate = 0;
    let lastUiUpdate = 0;

    const frame = (t: number) => {
      const timeSec = (t - start) / 1000;
      const date = currentSkyDate();
      const sky: SkyState = computeSkyState(
        date,
        placeRef.current.lat,
        placeRef.current.lon,
      );

      // visuals every frame
      if (rendererRef.current) rendererRef.current.render(sky, timeSec);

      // audio params at a calm ~3 Hz (long glides anyway)
      if (t - lastAudioUpdate > 330) {
        engineRef.current?.setSky(sky);
        lastAudioUpdate = t;
      }

      // UI readout ~4 Hz
      if (t - lastUiUpdate > 250) {
        setReadout({
          clock: formatClock(sky.hours),
          alt: sky.sunAltDeg,
          az: sky.sunAzDeg,
          moon: sky.moonIllum,
          season: seasonLabel(sky.dayOfYear),
          mood: moodLabel(sky),
          scrubbing: scrubActiveRef.current,
        });
        lastUiUpdate = t;
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [began, currentSkyDate]);

  // create the audio engine + try autoplay; fall back to a gesture if blocked.
  const startEngine = useCallback(async () => {
    if (engineRef.current) {
      await engineRef.current.resume();
      setNeedGesture(false);
      return;
    }
    let engine: Engine;
    try {
      engine = createEngine();
    } catch {
      return;
    }
    engineRef.current = engine;
    // prime with current sky immediately so it's alive on first frame
    try {
      engine.setSky(
        computeSkyState(new Date(), placeRef.current.lat, placeRef.current.lon),
      );
    } catch {
      /* ignore */
    }
    await engine.resume();
    if (engine.ctx.state !== "running") setNeedGesture(true);
    else setNeedGesture(false);
  }, []);

  // on mount: kick geolocation (3s timeout) then begin; attempt autoplay.
  useEffect(() => {
    let cancelled = false;

    const begin = () => {
      if (cancelled) return;
      setBegan(true);
      void startEngine();
    };

    // geolocation is best-effort and time-boxed; we never block the music.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        begin();
      }, GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          const p: Place = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: "device",
          };
          placeRef.current = p;
          if (!cancelled) setPlace(p);
          begin();
        },
        () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          begin();
        },
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 6e5 },
      );
    } else {
      begin();
    }

    return () => {
      cancelled = true;
    };
  }, [startEngine]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // a single tap that both satisfies autoplay-gesture rules and resumes.
  const onBeginTap = useCallback(() => {
    void startEngine();
  }, [startEngine]);

  // scrubber handlers ---------------------------------------------------------
  const onHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setHourSlider(v);
    dayMinutesRef.current = v;
    if (!scrubActiveRef.current) {
      scrubActiveRef.current = true;
      setScrubOn(true);
    }
  };
  const onDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setDaySlider(v);
    dayOfYearRef.current = v;
    if (!scrubActiveRef.current) {
      scrubActiveRef.current = true;
      setScrubOn(true);
    }
  };
  const releaseScrub = () => {
    scrubActiveRef.current = false;
    setScrubOn(false);
  };

  const accent = readout.scrubbing ? "text-violet-300" : "text-violet-300";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* WebGL2 sky canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* gradient scrim so text is legible over the sky */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />

      {/* ---- header / title ---- */}
      <div className="relative z-10 flex flex-col gap-1 px-5 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          The Place Where You Go to Listen
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A long-form piece scored by your real local sky — the clock hour, the
          sun&apos;s position, the moon&apos;s phase, the season. It is
          genuinely different at 3am than at noon.
        </p>
      </div>

      {/* ---- readouts ---- */}
      <div className="relative z-10 mt-6 grid grid-cols-2 gap-x-6 gap-y-3 px-5 font-mono text-base sm:grid-cols-3 sm:px-8">
        <Readout label="local time" value={readout.clock} accent={accent} />
        <Readout
          label="sun altitude"
          value={`${readout.alt >= 0 ? "+" : ""}${readout.alt.toFixed(1)}°`}
          accent="text-violet-300"
        />
        <Readout
          label="sun azimuth"
          value={`${readout.az.toFixed(0)}°`}
          accent="text-violet-300"
        />
        <Readout
          label="moon"
          value={`${Math.round(readout.moon * 100)}% lit`}
          accent="text-violet-300"
        />
        <Readout
          label="season"
          value={readout.season}
          accent="text-violet-300"
        />
        <Readout
          label="place"
          value={
            place.source === "device"
              ? `${place.lat.toFixed(2)}, ${place.lon.toFixed(2)}`
              : "fallback 61.2, -149.9"
          }
          accent="text-muted-foreground"
        />
      </div>

      {/* mood line */}
      <div className="relative z-10 mt-5 px-5 sm:px-8">
        <p className="font-mono text-base text-foreground">
          <span className="text-muted-foreground">mood · </span>
          <span className={accent}>{readout.mood}</span>
          {readout.scrubbing && (
            <span className="text-violet-300"> · (scrubbing)</span>
          )}
        </p>
      </div>

      {glFailed && (
        <div className="relative z-10 mt-4 px-5 sm:px-8">
          <p className="max-w-xl text-base text-violet-300">
            WebGL2 is unavailable in this browser, so the sky field can&apos;t be
            drawn — but the music is still playing and tracking the real sky.
          </p>
        </div>
      )}

      {/* ---- time scrubber ---- */}
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-black/55 px-5 pb-7 pt-4 backdrop-blur-sm sm:px-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-base text-muted-foreground">
              time scrubber{" "}
              <span className="text-muted-foreground">
                — drag to fast-forward the day &amp; year
              </span>
            </p>
            <button
              type="button"
              onClick={releaseScrub}
              disabled={!scrubOn}
              className={`min-h-[44px] rounded-md px-4 py-2.5 font-mono text-base transition ${
                scrubOn
                  ? "bg-violet-300/20 text-violet-300 hover:bg-violet-300/30"
                  : "cursor-default bg-muted text-muted-foreground"
              }`}
            >
              {scrubOn ? "return to now" : "tracking now"}
            </button>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-base text-muted-foreground">
              hour of day ·{" "}
              <span className={scrubOn ? "text-violet-300" : "text-violet-300"}>
                {scrubOn ? formatClock(hourSlider / 60) : "live"}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1439}
              step={1}
              value={hourSlider}
              onChange={onHourChange}
              className="h-11 w-full cursor-pointer accent-violet-300"
              aria-label="hour of day scrubber"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-base text-muted-foreground">
              day of year ·{" "}
              <span className={scrubOn ? "text-violet-300" : "text-violet-300"}>
                {scrubOn ? `day ${daySlider + 1}` : "live"}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={364}
              step={1}
              value={daySlider}
              onChange={onDayChange}
              className="h-11 w-full cursor-pointer accent-violet-300"
              aria-label="day of year scrubber"
            />
          </label>
        </div>
      </div>

      {/* ---- autoplay gesture fallback ---- */}
      {needGesture && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <button
            type="button"
            onClick={onBeginTap}
            className="min-h-[44px] rounded-lg border border-violet-300/40 bg-violet-300/10 px-6 py-3 text-xl font-semibold text-violet-300 transition hover:bg-violet-300/20"
          >
            Begin
          </button>
        </div>
      )}

      {/* ---- design notes link ---- */}
      <Link
        href="#design-notes"
        onClick={(e) => {
          e.preventDefault();
          alert(
            "Read the design notes in README.md inside src/app/dream/347-the-place/",
          );
        }}
        className="absolute right-4 top-4 z-10 font-mono text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-muted-foreground"
      >
        Read the design notes
      </Link>
    </main>
  );
}

function Readout({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${accent} tabular-nums`}>{value}</span>
    </div>
  );
}
