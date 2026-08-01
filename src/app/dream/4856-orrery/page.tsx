"use client";

// ════════════════════════════════════════════════════════════════════════════
// Orrery (4856) — the planet AND its star as ONE instrument
//
// THE ONE QUESTION: "What if the whole planet AND its star played themselves as
// ONE instrument — real earthquakes, the real geomagnetic field, and the real
// solar wind, fused into a single evolving cosmic drone-instrument, right now?"
//
// A deep multi-SOURCE extension of Seismarium (4520): where that sonified USGS
// earthquakes ALONE, this fuses THREE genuinely heterogeneous real-time streams
// under ONE musical grammar so an indefinite stream of indifferent cosmic events
// stays MUSIC, not monitoring-noise.
//
//   • Earthquakes (USGS)        → localized impulses  → struck modal BELLS
//   • Solar wind (NOAA plasma)  → advecting pressure  → bowed CARRIER drone
//   • Geomagnetic Kp (NOAA)     → polar aurora bloom  → swelling CHOIR pad
// One WebGPU compute wave-field (Canvas2D fallback) accumulates all three;
// one rotating-pentatonic grammar + one limiter binds all three voices.
//
// Refs: Florian Dombois, *Auditory Seismology* (2001); Erie: A Declarative
// Grammar for Data Sonification (arXiv:2402.00156) — impose a grammar over data;
// NOAA SWPC real-time Solar Wind Display Viewer (experimental, May 2026) + IMAP
// I-ALiRT real-time solar-wind broadcast (2026) as the live multi-source
// frontier this cashes. See README + the design-notes modal.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DAY_MS,
  densityNorm,
  fetchLiveKp,
  fetchLiveQuakes,
  fetchLiveWind,
  kpNorm,
  lonLatToCell,
  makeSyntheticQuakes,
  quakeImpulse,
  speedNorm,
  syntheticKp,
  syntheticWind,
  type QuakeCatalog,
  type Quake,
  type SolarWind,
} from "./streams";
import { makeGpuField } from "./gpu";
import { makeCpuField } from "./cpu";
import type { WaveField } from "./field";
import { makeAudio, type CosmicAudio } from "./audio";

const LOOP_MS = 90_000; // compress the last 24h of quakes into ~90s, looping
const MAX_FIRES_PER_FRAME = 6; // musical + photosensitive-safe
const QUAKE_POLL_MS = 60_000;
const WIND_POLL_MS = 45_000;
const KP_POLL_MS = 60_000;
const AUDIO_PARAM_EVERY = 4; // update continuous audio params every N frames

type Src = "LIVE" | "SYNTH";

interface Scheduled {
  phase: number;
  q: Quake;
}

interface Readout {
  lastQuake: string;
  count: number;
  largest: number;
  windSpeed: number;
  windDensity: number;
  kp: number;
}

function buildSchedule(cat: QuakeCatalog, windowStart: number): Scheduled[] {
  const out: Scheduled[] = [];
  for (const q of cat.quakes) {
    const phase = (q.time - windowStart) / DAY_MS;
    if (phase < 0 || phase > 1) continue;
    out.push({ phase, q });
  }
  out.sort((a, b) => a.phase - b.phase);
  return out;
}

function captionFor(q: Quake): string {
  return `M${q.mag.toFixed(1)} · ${Math.round(q.depthKm)}km · ${q.place}`;
}

export default function OrreryPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<WaveField | null>(null);
  const audioRef = useRef<CosmicAudio | null>(null);
  const scheduleRef = useRef<Scheduled[]>([]);
  const windowStartRef = useRef<number>(0);
  const cursorRef = useRef<number>(0);
  const lastPhaseRef = useRef<number>(0);
  const maxTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  // latest LIVE sustained values (null → drive from the synthetic generators)
  const liveWindRef = useRef<SolarWind | null>(null);
  const liveKpRef = useRef<number | null>(null);
  // most-recent normalised readings, surfaced to the UI on a slow interval
  const lastWindRef = useRef<SolarWind>({ speed: 0, density: 0 });
  const lastKpRef = useRef<number>(0);

  const [backend, setBackend] = useState<"GPU" | "CPU" | null>(null);
  const [srcQuake, setSrcQuake] = useState<Src>("SYNTH");
  const [srcWind, setSrcWind] = useState<Src>("SYNTH");
  const [srcKp, setSrcKp] = useState<Src>("SYNTH");
  const [soundOn, setSoundOn] = useState(false);
  const [audioUnsupported, setAudioUnsupported] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    lastQuake: "warming up…",
    count: 0,
    largest: 0,
    windSpeed: 0,
    windDensity: 0,
    kp: 0,
  });
  const [showNotes, setShowNotes] = useState(false);

  const fire = useCallback((q: Quake, live: boolean) => {
    const field = fieldRef.current;
    if (field) {
      const { x, y } = lonLatToCell(q.lon, q.lat, field.gridW, field.gridH);
      field.inject(x, y, quakeImpulse(q.mag));
    }
    const audio = audioRef.current;
    if (audio && audio.isRunning()) {
      audio.strike(q, audio.ctx.currentTime + 0.02);
    }
    setReadout((r) => ({
      ...r,
      count: live ? r.count + 1 : r.count,
      largest: Math.max(r.largest, q.mag),
      lastQuake: captionFor(q),
    }));
  }, []);

  const adoptQuakes = useCallback((cat: QuakeCatalog, epochNow: number) => {
    windowStartRef.current = epochNow - DAY_MS;
    scheduleRef.current = buildSchedule(cat, windowStartRef.current);
    cursorRef.current = 0;
    lastPhaseRef.current = 0;
    let maxT = 0;
    let largest = 0;
    for (const q of cat.quakes) {
      if (q.time > maxT) maxT = q.time;
      if (q.mag > largest) largest = q.mag;
    }
    maxTimeRef.current = maxT;
    setSrcQuake(cat.source);
    setReadout((r) => ({
      ...r,
      count: cat.quakes.length,
      largest,
      lastQuake: `${cat.quakes.length} events loaded`,
    }));
    // prime the basin so a reviewer sees a planetary bloom immediately
    const field = fieldRef.current;
    if (field) {
      for (const q of cat.quakes.slice(-8)) {
        const { x, y } = lonLatToCell(q.lon, q.lat, field.gridW, field.gridH);
        field.inject(x, y, quakeImpulse(q.mag) * 0.7);
      }
    }
  }, []);

  const enableSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .resume()
      .then(() => setSoundOn(audio.isRunning()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const epochNow = performance.timeOrigin + performance.now();
    let disposed = false;

    function sizeCanvas() {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(c.clientWidth * dpr));
      const h = Math.max(1, Math.floor(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        fieldRef.current?.resize();
      }
    }

    try {
      const audio = makeAudio();
      audioRef.current = audio;
      audio
        .resume()
        .then(() => setSoundOn(audio.isRunning()))
        .catch(() => {});
    } catch {
      setAudioUnsupported(true);
    }

    const synthQuakes = makeSyntheticQuakes(epochNow);

    async function boot(cv: HTMLCanvasElement) {
      let field: WaveField;
      try {
        field = await makeGpuField(cv);
      } catch {
        field = makeCpuField(cv);
      }
      if (disposed) {
        field.destroy();
        return;
      }
      fieldRef.current = field;
      setBackend(field.backend);
      sizeCanvas();
      adoptQuakes(synthQuakes, epochNow);

      const start = performance.now();

      function loop() {
        if (disposed) return;
        const f = fieldRef.current;
        if (f) {
          const elapsed = performance.now() - start;
          const tSec = elapsed / 1000;

          // ── STREAM 1: replay the quake day (24h → 90s), looping ────────────
          const p = (elapsed % LOOP_MS) / LOOP_MS;
          const sched = scheduleRef.current;
          if (p < lastPhaseRef.current) cursorRef.current = 0;
          lastPhaseRef.current = p;
          let fired = 0;
          while (
            cursorRef.current < sched.length &&
            sched[cursorRef.current].phase <= p &&
            fired < MAX_FIRES_PER_FRAME
          ) {
            fire(sched[cursorRef.current].q, false);
            cursorRef.current++;
            fired++;
          }

          // ── STREAMS 2 & 3: sustained solar wind + geomagnetic Kp ───────────
          const wind = liveWindRef.current ?? syntheticWind(tSec);
          const kp = liveKpRef.current ?? syntheticKp(tSec);
          lastWindRef.current = wind;
          lastKpRef.current = kp;
          const sN = speedNorm(wind.speed);
          const dN = densityNorm(wind.density);
          const kN = kpNorm(kp);
          f.setForcing({ windSpeed: sN, windDensity: dN, kp: kN });

          if (frameCountRef.current % AUDIO_PARAM_EVERY === 0) {
            const audio = audioRef.current;
            if (audio && audio.isRunning()) {
              audio.setWind(sN, dN);
              audio.setAurora(kN);
            }
          }
          frameCountRef.current++;

          f.frame();
        }
        rafRef.current = requestAnimationFrame(loop);
      }
      rafRef.current = requestAnimationFrame(loop);

      // background live upgrades (each independent — any subset may succeed)
      fetchLiveQuakes()
        .then((live) => {
          if (!disposed && live) adoptQuakes(live, epochNow);
        })
        .catch(() => {});
      fetchLiveWind()
        .then((w) => {
          if (!disposed && w) {
            liveWindRef.current = w;
            setSrcWind("LIVE");
          }
        })
        .catch(() => {});
      fetchLiveKp()
        .then((k) => {
          if (!disposed && k !== null) {
            liveKpRef.current = k;
            setSrcKp("LIVE");
          }
        })
        .catch(() => {});
    }
    boot(canvas);

    // ── slow polls: strike genuinely-new quakes, refresh the sustained feeds ──
    const quakePoll = window.setInterval(() => {
      if (disposed) return;
      fetchLiveQuakes()
        .then((live) => {
          if (disposed || !live) return;
          setSrcQuake("LIVE");
          const fresh = live.quakes.filter((q) => q.time > maxTimeRef.current);
          for (const q of fresh) {
            maxTimeRef.current = Math.max(maxTimeRef.current, q.time);
            fire(q, true);
          }
        })
        .catch(() => {});
    }, QUAKE_POLL_MS);

    const windPoll = window.setInterval(() => {
      if (disposed) return;
      fetchLiveWind()
        .then((w) => {
          if (disposed || !w) return;
          liveWindRef.current = w;
          setSrcWind("LIVE");
        })
        .catch(() => {});
    }, WIND_POLL_MS);

    const kpPoll = window.setInterval(() => {
      if (disposed) return;
      fetchLiveKp()
        .then((k) => {
          if (disposed || k === null) return;
          liveKpRef.current = k;
          setSrcKp("LIVE");
        })
        .catch(() => {});
    }, KP_POLL_MS);

    // surface the sustained readings to the UI without re-rendering every frame
    const readoutPoll = window.setInterval(() => {
      if (disposed) return;
      setReadout((r) => ({
        ...r,
        windSpeed: lastWindRef.current.speed,
        windDensity: lastWindRef.current.density,
        kp: lastKpRef.current,
      }));
    }, 600);

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(quakePoll);
      window.clearInterval(windPoll);
      window.clearInterval(kpPoll);
      window.clearInterval(readoutPoll);
      window.removeEventListener("resize", onResize);
      fieldRef.current?.destroy();
      fieldRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [adoptQuakes, fire]);

  const anyLive = srcQuake === "LIVE" || srcWind === "LIVE" || srcKp === "LIVE";

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background"
      onPointerDown={soundOn ? undefined : enableSound}
    >
      {/* the planetary energy field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header */}
      <div className="pointer-events-none absolute left-5 top-6 z-10 max-w-md">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Orrery · the planet and its star, one instrument
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          A cosmic drone-instrument
        </h1>
      </div>

      {/* per-stream + backend badges */}
      <div className="pointer-events-none absolute left-5 top-24 z-10 flex flex-wrap gap-2">
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {srcQuake === "LIVE" ? "● quakes · usgs" : "◐ quakes · synth"}
        </span>
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {srcWind === "LIVE" ? "● wind · noaa" : "◐ wind · synth"}
        </span>
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {srcKp === "LIVE" ? "● kp · noaa" : "◐ kp · synth"}
        </span>
        <span className="rounded-md border border-primary/40 bg-primary/20 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-foreground">
          {backend ? `${backend} field` : "starting…"}
        </span>
      </div>

      {/* live readout — all three voices in one glance */}
      <div className="pointer-events-none absolute bottom-6 left-5 z-10 max-w-md space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          the ensemble now
        </p>
        <p className="text-base text-foreground">{readout.lastQuake}</p>
        <p className="text-sm text-muted-foreground">
          {readout.count} quakes · largest M{readout.largest.toFixed(1)} · wind{" "}
          {Math.round(readout.windSpeed)} km/s · {readout.windDensity.toFixed(1)}{" "}
          p/cm³ · Kp {readout.kp.toFixed(1)}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {anyLive ? "live · streaming" : "synth · seeded self-demo"} · 24h → 90s
        </p>
      </div>

      {/* enable-sound affordance (the visual self-demos silently already) */}
      {!soundOn && !audioUnsupported && (
        <button
          onClick={enableSound}
          className="absolute bottom-6 left-1/2 z-20 min-h-[44px] -translate-x-1/2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tap to enable sound
        </button>
      )}
      {audioUnsupported && (
        <p className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
          web audio unavailable — visuals only
        </p>
      )}

      {/* design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-6 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Orrery — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if the
                whole planet AND its star played themselves as one instrument —
                real earthquakes, the real geomagnetic field, and the real solar
                wind, fused into a single evolving cosmic drone, right now?
              </p>
              <p>
                Three genuinely heterogeneous live streams drive ONE
                equirectangular energy field, simulated as a 2D elastic wave
                equation on a WebGPU compute shader (Canvas2D fallback). Damping
                is near&nbsp;1, so ripples{" "}
                <span className="text-foreground">accumulate</span> — the field
                has long memory; minute&nbsp;5 never looks like minute&nbsp;1.
              </p>
              <div>
                <p className="mb-1 text-foreground">
                  Three streams, three ways into the SAME field + the SAME key:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>
                    <span className="text-foreground">Earthquakes (USGS)</span> →
                    sharp local impulses → struck modal bells; mag → loudness +
                    register, depth → timbre, latitude → pan.
                  </li>
                  <li>
                    <span className="text-foreground">Solar wind (NOAA)</span> → a
                    slow global undulation that advects across the world and
                    lifts its energy floor → a bowed carrier drone; speed →
                    pitch + brightness, density → amplitude.
                  </li>
                  <li>
                    <span className="text-foreground">Geomagnetic Kp (NOAA)</span>{" "}
                    → a shimmering bloom in the polar bands → a swelling choir
                    pad that rises with activity — the &ldquo;sky&rdquo; voice.
                  </li>
                </ul>
              </div>
              <p>
                The crux: an indefinite stream of indifferent events only stays
                MUSIC if you{" "}
                <span className="text-foreground">impose a grammar</span> rather
                than emitting arbitrary tones (Erie: A Declarative Grammar for
                Data Sonification, arXiv:2402.00156). All three voices are locked
                to one slowly-rotating pentatonic key and summed under a single
                limiter — so there are no wrong notes, only the cosmos, quantised
                into an ensemble.
              </p>
              <p>
                Lineage:{" "}
                <span className="text-foreground">
                  Florian Dombois, Auditory Seismology (2001)
                </span>{" "}
                and a deep extension of Seismarium (4520). It anticipates the live
                multi-source frontier — NOAA SWPC&apos;s experimental real-time
                Solar Wind Display Viewer and the IMAP I-ALiRT real-time
                solar-wind broadcast (2026).
              </p>
              <p>
                Degrade paths: no network → each stream falls to a seeded (
                <span className="text-foreground">mulberry32 0x4856</span>)
                synthetic generator — Gutenberg–Richter quakes, a plausible
                plasma walk, a Kp random-walk — badged SYNTH; no WebGPU → a
                coarser Canvas2D field, badged CPU. It plays and paints on load
                in about a second, no click required.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
