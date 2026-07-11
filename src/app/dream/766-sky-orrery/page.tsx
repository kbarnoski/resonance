"use client";

/**
 * 766 · Sky Orrery
 *
 * "What if you stood under a real 3D dome of the sky and the bodies overhead
 *  conducted Karel's piano? — the sun, the moon (correct current phase), and a
 *  handful of bright stars/planets sit at their REAL computed altitude/azimuth
 *  for the local time & place; the dome turns with sidereal time; and whichever
 *  bodies ride highest conduct a slow, ever-changing arrangement of whole
 *  PHRASES from his real *Welcome Home* piano. Atlas Eclipticalis, literal: sky
 *  position becomes score position, so minute 5 is genuinely not minute 1."
 *
 * INPUT  : live wall-clock + optional geolocation (auto-evolving, no required
 *          interaction; no mic, no camera).
 * OUTPUT : a three.js 3D celestial dome (Canvas2D fallback if no WebGL).
 * METHOD : local astronomical computation → a self-rescheduling phrase
 *          scheduler that plays continuous buffer REGIONS of his recording.
 *
 * After John Cage, *Atlas Eclipticalis*; Jem Finer, *Longplayer*; John Luther
 * Adams, *The Place Where You Go to Listen*; and a planetarium orrery.
 *
 * Self-contained in this folder. The only shared dependency is `three`.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSkyState,
  dateWithForcedHour,
  daylightFactor,
  moodLabel,
  moonPhaseName,
  type SkyState,
} from "./sky";
import { createEngine, type Engine, type VoiceTarget } from "./audio";
import { createDome, type Dome, type RenderBody } from "./dome";

const FALLBACK_LAT = 37.77; // San Francisco
const FALLBACK_LON = -122.42;
const GEO_TIMEOUT_MS = 3000;

type Place = { lat: number; lon: number; source: "device" | "fallback" };

function formatClock(hours: number): string {
  const total = ((hours % 24) + 24) % 24;
  const h = Math.floor(total);
  const m = Math.floor((total - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build voice targets + render bodies from a sky state. */
function deriveVoices(s: SkyState): { targets: VoiceTarget[]; bodies: RenderBody[] } {
  const targets: VoiceTarget[] = [];
  const bodies: RenderBody[] = [];

  const add = (
    id: string,
    kind: RenderBody["kind"],
    altDeg: number,
    azDeg: number,
    color: string,
    mag: number,
    extra?: { illum?: number; phase?: number; gainScale?: number },
  ) => {
    const up = altDeg > 0;
    const altN = Math.max(0, Math.min(1, altDeg / 90));
    // gain ∝ altitude (sky position → score position).
    const gain = up ? (0.12 + altN * 0.88) * (extra?.gainScale ?? 1) * mag : 0;
    // azimuth → stereo pan: East(90)=left(-1), West(270)=right(+1), centred on S.
    const pan = Math.max(-1, Math.min(1, (azDeg - 180) / 110));
    const bright = up ? 0.25 + altN * 0.75 : 0;
    targets.push({ id, gain, pan: -pan, bright });
    bodies.push({
      id,
      kind,
      altDeg,
      azDeg,
      color,
      mag,
      gain,
      illum: extra?.illum,
      phase: extra?.phase,
    });
  };

  add("sun", "sun", s.sunAltDeg, s.sunAzDeg, "#ffd27a", 1.0, { gainScale: 0.85 });
  add("moon", "moon", s.moonAltDeg, s.moonAzDeg, "#d8e2ff", 0.9, {
    illum: s.moonIllum,
    phase: s.moonPhase,
    gainScale: 0.7,
  });
  for (const b of s.bodies) {
    add(b.id, b.kind, b.altDeg, b.azDeg, b.color, b.mag, { gainScale: 0.6 });
  }
  return { targets, bodies };
}

const BODY_IDS = [
  "sun",
  "moon",
  "sirius",
  "vega",
  "arcturus",
  "betelgeuse",
  "rigel",
  "altair",
  "jupiter",
  "venus",
];

export default function Page() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const domeRef = useRef<Dome | null>(null);
  const rafRef = useRef<number | null>(null);

  const scrubActiveRef = useRef(false);
  const scrubHourRef = useRef(12);
  const placeRef = useRef<Place>({
    lat: FALLBACK_LAT,
    lon: FALLBACK_LON,
    source: "fallback",
  });

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scrubActive, setScrubActive] = useState(false);
  const [scrubHour, setScrubHour] = useState(12);
  const [showNotes, setShowNotes] = useState(false);

  const [renderMode, setRenderMode] = useState<"webgl" | "canvas2d">("webgl");
  const [sourceLabel, setSourceLabel] = useState("");
  const [placeNotice, setPlaceNotice] = useState<string | null>(null);

  const [hud, setHud] = useState({
    clock: "--:--",
    sunAlt: 0,
    moonName: "—",
    mood: "—",
    lst: 0,
    conductor: "—",
  });

  useEffect(() => {
    scrubActiveRef.current = scrubActive;
  }, [scrubActive]);
  useEffect(() => {
    scrubHourRef.current = scrubHour;
  }, [scrubHour]);

  const start = useCallback(async () => {
    if (started || loading) return;
    setLoading(true);

    // Geolocation (optional). Resolve quickly or fall back.
    await new Promise<void>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        setPlaceNotice("No geolocation — using San Francisco (37.77, -122.42).");
        resolve();
        return;
      }
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      const t = setTimeout(() => {
        setPlaceNotice("Location timed out — using San Francisco.");
        finish();
      }, GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(t);
          placeRef.current = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: "device",
          };
          setPlaceNotice(null);
          finish();
        },
        () => {
          clearTimeout(t);
          setPlaceNotice("Location denied — using San Francisco (37.77, -122.42).");
          finish();
        },
        { timeout: GEO_TIMEOUT_MS, maximumAge: 600000 },
      );
    });

    // Build dome.
    const container = containerRef.current;
    if (!container) {
      setLoading(false);
      return;
    }
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const dome = createDome(container, w, h);
    domeRef.current = dome;
    setRenderMode(dome.mode);

    // Build + start audio engine.
    const engine = createEngine(BODY_IDS, (id) => {
      domeRef.current?.pulse(id);
    });
    engineRef.current = engine;
    await engine.start();
    setSourceLabel(engine.sourceLabel());

    setStarted(true);
    setLoading(false);

    // Render + sky loop.
    const loop = () => {
      const eng = engineRef.current;
      const dm = domeRef.current;
      if (!eng || !dm) return;

      const base = new Date();
      const date = scrubActiveRef.current
        ? dateWithForcedHour(base, scrubHourRef.current)
        : base;
      const place = placeRef.current;
      const sky = computeSkyState(date, place.lat, place.lon);
      const { targets, bodies } = deriveVoices(sky);

      eng.setTargets(targets);
      const dayl = daylightFactor(sky.sunAltDeg);
      // Reverb deeper at night.
      eng.setReverb(0.18 + (1 - dayl) * 0.4);

      const level = eng.getLevel();
      dm.render({ bodies, daylight: dayl, level });

      // Highest above-horizon body = current conductor.
      let topName = "—";
      let topAlt = -999;
      const named: Record<string, string> = {
        sun: "Sun",
        moon: "Moon",
        sirius: "Sirius",
        vega: "Vega",
        arcturus: "Arcturus",
        betelgeuse: "Betelgeuse",
        rigel: "Rigel",
        altair: "Altair",
        jupiter: "Jupiter",
        venus: "Venus",
      };
      for (const b of bodies) {
        if (b.altDeg > topAlt && b.altDeg > 0) {
          topAlt = b.altDeg;
          topName = named[b.id] ?? b.id;
        }
      }

      setHud({
        clock: formatClock(sky.hours),
        sunAlt: sky.sunAltDeg,
        moonName: `${moonPhaseName(sky.moonPhase)} (${Math.round(
          sky.moonIllum * 100,
        )}% lit)`,
        mood: moodLabel(sky.sunAltDeg),
        lst: sky.lstHours,
        conductor: topName,
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started, loading]);

  // Resize handling.
  useEffect(() => {
    if (!started) return;
    const onResize = () => {
      const c = containerRef.current;
      const dm = domeRef.current;
      if (c && dm) dm.resize(c.clientWidth, c.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      engineRef.current?.stop();
      engineRef.current = null;
      domeRef.current?.dispose();
      domeRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD labels */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 space-y-1 text-base">
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {hud.clock}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              local sky
            </span>
          </div>
          <div className="text-foreground">
            sun altitude{" "}
            <span className="tabular-nums">{hud.sunAlt.toFixed(1)}°</span>
          </div>
          <div className="text-foreground">moon — {hud.moonName}</div>
          <div className="text-muted-foreground">{hud.mood}</div>
          <div className="text-muted-foreground">
            sidereal time{" "}
            <span className="tabular-nums">{formatClock(hud.lst)}</span>
          </div>
          <div className="text-foreground">
            conducting now —{" "}
            <span className="font-medium text-foreground">{hud.conductor}</span>
          </div>
        </div>
      )}

      {/* Source + mode notices */}
      {started && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-[16rem] space-y-1 text-right text-base">
          <div className="text-muted-foreground">{sourceLabel}</div>
          <div className="text-muted-foreground">
            {renderMode === "webgl"
              ? "three.js WebGL dome"
              : "Canvas2D fallback sky"}
          </div>
          {placeNotice && <div className="text-muted-foreground">{placeNotice}</div>}
        </div>
      )}

      {/* Time controls */}
      {started && (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-black/40 p-4 backdrop-blur">
          <button
            type="button"
            onClick={() => setScrubActive((v) => !v)}
            className="min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base font-medium text-foreground hover:bg-accent"
          >
            {scrubActive ? "Live sky" : "Explore time-of-day"}
          </button>
          {scrubActive ? (
            <div className="flex min-w-[260px] flex-1 items-center gap-3">
              <span className="text-base text-muted-foreground">
                {formatClock(scrubHour)}
              </span>
              <input
                type="range"
                min={0}
                max={23.99}
                step={0.05}
                value={scrubHour}
                onChange={(e) => setScrubHour(parseFloat(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-primary"
                aria-label="Scrub hour of day"
              />
              <span className="text-base text-muted-foreground">scrub the day</span>
            </div>
          ) : (
            <div className="text-base text-muted-foreground">
              tracking real wall-clock time — the arrangement evolves as the sky
              turns.
            </div>
          )}
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1230] via-[#0a0a1a] to-black px-6 text-center">
          <h1 className="max-w-2xl text-2xl font-semibold text-foreground sm:text-4xl">
            Sky Orrery
          </h1>
          <p className="mt-4 max-w-xl text-base text-foreground sm:text-lg">
            Stand under a real 3D dome of the sky. The sun, the phased moon, and
            a handful of bright stars and planets sit where they truly are right
            now over your place — and whichever ride highest conduct slow,
            ever-changing phrases of Karel&apos;s <em>Welcome Home</em> piano.
          </p>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            It plays itself. No microphone, no camera — just the clock and (if
            you allow it) your location. Atlas Eclipticalis, made literal: sky
            position becomes score position.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={loading}
            className="mt-8 min-h-[44px] rounded-2xl bg-card px-8 py-3 text-lg font-semibold text-black hover:bg-accent disabled:opacity-60"
          >
            {loading ? "Reading the sky…" : "Enter the dome"}
          </button>
          <p className="mt-4 text-base text-muted-foreground">
            Best with sound on. Long-form & generative — let it run.
          </p>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
          <div className="max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl bg-[#0c1226] p-6 text-base text-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              Body positions are computed locally (no network, no ephemeris)
              from your clock and place: solar altitude/azimuth, a synodic moon
              phase + a simplified lunar longitude, and a sidereal-time + RA/Dec
              model for a few genuinely bright stars and planets.
            </p>
            <p className="mt-3">
              Karel&apos;s real recording is segmented into whole continuous
              PHRASE regions (energy-dip split). Each body owns a phrase-voice; a
              body&apos;s altitude drives its gain, its azimuth its stereo pan.
              The scheduler plays continuous buffer regions joined by equal-power
              crossfades — whole phrases, never grains. Highest bodies dominate,
              so the audible arrangement is literally the sky overhead, and it is
              never the same minute twice.
            </p>
            <p className="mt-3 text-muted-foreground">
              After John Cage&apos;s <em>Atlas Eclipticalis</em>, Jem
              Finer&apos;s <em>Longplayer</em>, John Luther Adams&apos;{" "}
              <em>The Place Where You Go to Listen</em>, and a planetarium
              orrery.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* small corner: read the design notes */}
      {started && !showNotes && (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="absolute right-4 bottom-24 z-20 min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
        >
          Read the design notes
        </button>
      )}

      {/* home link */}
      <Link
        href="/dream"
        className="absolute left-4 bottom-24 z-20 min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
        style={{ display: started ? undefined : "none" }}
      >
        ← dream lab
      </Link>
    </main>
  );
}
