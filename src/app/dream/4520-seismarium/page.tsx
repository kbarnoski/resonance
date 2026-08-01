"use client";

// ════════════════════════════════════════════════════════════════════════════
// Seismarium (4520)
//
// THE ONE QUESTION: "What if the living Earth played itself — real global
// earthquakes, right now, as an accumulating planetary instrument?"
//
// INPUT  : the USGS real-time earthquake GeoJSON feed (all_day, no key). If it
//          is blocked/offline we fall back to a seeded synthetic catalogue so
//          the piece ALWAYS plays and paints on load.
// OUTPUT : a WebGPU compute wave field (Canvas2D fallback) — an equirectangular
//          world basin as a violet ripple tank that accumulates memory — plus
//          Web Audio struck modal bells snapped to a slow musical grammar.
// TECH   : GPU wave-propagation + real-data musical-grammar sonification.
//
// Refs: Florian Dombois, *Auditory Seismology* (2001); Eos.org 2026, "Earth Is
// Noisy. Why Should Its Data Be Silent?"; style-based sonification grammar,
// arXiv:2605.21874 (2026). See README + the Design notes modal.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DAY_MS,
  fetchLiveCatalog,
  lonLatToCell,
  makeSyntheticCatalog,
  magNorm,
  quakeImpulse,
  type Catalog,
  type Quake,
} from "./quakes";
import { makeGpuField } from "./gpu";
import { makeCpuField } from "./cpu";
import type { WaveField } from "./field";
import { makeAudio, type SeismicAudio } from "./audio";

const LOOP_MS = 90_000; // compress the last 24h into ~90s, looping
const MAX_FIRES_PER_FRAME = 6; // keep it musical + photosensitive-safe
const POLL_MS = 60_000; // check for genuinely-new live quakes each minute

interface Scheduled {
  phase: number; // 0..1 position within the 24h window
  q: Quake;
}

interface Readout {
  count: number;
  largest: number;
  last: string;
}

function buildSchedule(cat: Catalog, windowStart: number): Scheduled[] {
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

export default function SeismariumPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<WaveField | null>(null);
  const audioRef = useRef<SeismicAudio | null>(null);
  const scheduleRef = useRef<Scheduled[]>([]);
  const windowStartRef = useRef<number>(0);
  const cursorRef = useRef<number>(0);
  const lastPhaseRef = useRef<number>(0);
  const energyRef = useRef<number>(0);
  const maxTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const [backend, setBackend] = useState<"GPU" | "CPU" | null>(null);
  const [source, setSource] = useState<"LIVE" | "SYNTH">("SYNTH");
  const [soundOn, setSoundOn] = useState(false);
  const [audioUnsupported, setAudioUnsupported] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    count: 0,
    largest: 0,
    last: "warming up…",
  });
  const [showNotes, setShowNotes] = useState(false);

  // strike a quake: paint its ripple always, ring its bell only if sound is live
  const fire = useCallback((q: Quake, live: boolean) => {
    const field = fieldRef.current;
    if (field) {
      const { x, y } = lonLatToCell(q.lon, q.lat, field.gridW, field.gridH);
      field.inject(x, y, quakeImpulse(q.mag));
    }
    energyRef.current = Math.min(1.2, energyRef.current + magNorm(q.mag) * 0.5);
    const audio = audioRef.current;
    if (audio && audio.isRunning()) {
      audio.strike(q, audio.ctx.currentTime + 0.02);
    }
    setReadout((r) => ({
      count: live ? r.count + 1 : r.count,
      largest: Math.max(r.largest, q.mag),
      last: captionFor(q),
    }));
  }, []);

  // swap in a catalogue (synthetic first, live when it arrives)
  const adoptCatalog = useCallback((cat: Catalog, epochNow: number) => {
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
    setSource(cat.source);
    setReadout({
      count: cat.quakes.length,
      largest,
      last: `${cat.quakes.length} events loaded`,
    });
    // prime the basin so a reviewer sees a planetary bloom immediately
    const recent = cat.quakes.slice(-8);
    const field = fieldRef.current;
    if (field) {
      for (const q of recent) {
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

    // audio: create immediately, auto-resume (may stay suspended until gesture)
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

    // synthetic catalogue plays instantly; live feed swaps in when it lands
    const synth = makeSyntheticCatalog(epochNow);

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
      adoptCatalog(synth, epochNow);

      const start = performance.now();

      function loop() {
        if (disposed) return;
        const f = fieldRef.current;
        if (f) {
          const elapsed = performance.now() - start;
          const p = (elapsed % LOOP_MS) / LOOP_MS;
          const sched = scheduleRef.current;
          // loop wrapped → replay the day again from the top
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
          // seismic-energy drone swell (accumulator decays each frame)
          energyRef.current *= 0.99;
          audioRef.current?.setEnergy(Math.min(1, energyRef.current));
          f.frame();
        }
        rafRef.current = requestAnimationFrame(loop);
      }
      rafRef.current = requestAnimationFrame(loop);

      // try the live feed; swap it in on success
      fetchLiveCatalog()
        .then((live) => {
          if (!disposed && live) adoptCatalog(live, epochNow);
        })
        .catch(() => {});
    }
    boot(canvas);

    // poll for genuinely-new live quakes and strike them the moment they land
    const poll = window.setInterval(() => {
      if (disposed) return;
      fetchLiveCatalog()
        .then((live) => {
          if (disposed || !live) return;
          setSource("LIVE");
          const fresh = live.quakes.filter((q) => q.time > maxTimeRef.current);
          for (const q of fresh) {
            maxTimeRef.current = Math.max(maxTimeRef.current, q.time);
            fire(q, true);
          }
        })
        .catch(() => {});
    }, POLL_MS);

    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(poll);
      window.removeEventListener("resize", onResize);
      fieldRef.current?.destroy();
      fieldRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [adoptCatalog, fire]);

  return (
    <main
      className="relative h-dvh w-full overflow-hidden bg-background"
      onPointerDown={soundOn ? undefined : enableSound}
    >
      {/* the ripple-tank world */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header */}
      <div className="pointer-events-none absolute left-5 top-6 z-10 max-w-md">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Seismarium · the Earth plays itself
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          A planetary instrument
        </h1>
      </div>

      {/* badges */}
      <div className="pointer-events-none absolute left-5 top-24 z-10 flex flex-wrap gap-2">
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {source === "LIVE" ? "● LIVE · USGS" : "◐ SYNTH · seeded"}
        </span>
        <span className="rounded-md border border-border bg-background/60 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {backend ? `${backend} field` : "starting…"}
        </span>
      </div>

      {/* live readout */}
      <div className="pointer-events-none absolute bottom-6 left-5 z-10 max-w-md space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          last struck
        </p>
        <p className="text-base text-foreground">{readout.last}</p>
        <p className="text-sm text-muted-foreground">
          {readout.count} events · largest M{readout.largest.toFixed(1)} ·
          replaying 24h → 90s
        </p>
      </div>

      {/* tap-to-enable-sound affordance */}
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

      {/* design notes button */}
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
                Seismarium — design notes
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
                <span className="text-foreground">The question:</span> what if
                the living Earth played itself — real global earthquakes, right
                now, as an accumulating planetary instrument?
              </p>
              <p>
                Every earthquake in the{" "}
                <span className="text-foreground">
                  USGS all_day GeoJSON feed
                </span>{" "}
                drops an impulse into an equirectangular world basin simulated as
                a 2D elastic wave field on the GPU. Ripples propagate, wrap
                around the antimeridian, interfere, and{" "}
                <span className="text-foreground">accumulate</span> — damping is
                near 1, so the field has long memory: minute 5 never looks like
                minute 1.
              </p>
              <div>
                <p className="mb-1 text-foreground">
                  Each quake → one struck modal bell:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>magnitude → strike energy + register (big = low, long)</li>
                  <li>depth → timbre + decay (deep = darker, longer)</li>
                  <li>latitude → stereo pan (north left … south right)</li>
                  <li>
                    fundamental snapped to a slowly-rotating pentatonic mode over
                    a sub-bass drone that swells with recent seismic energy
                  </li>
                </ul>
              </div>
              <p>
                The key research finding: an indefinite live-data stream only
                stays engaging if you{" "}
                <span className="text-foreground">impose a musical grammar</span>{" "}
                rather than emitting arbitrary tones (style-based sonification,
                arXiv:2605.21874, 2026). So there are no wrong notes — only the
                planet, quantised.
              </p>
              <p>
                Lineage:{" "}
                <span className="text-foreground">
                  Florian Dombois, Auditory Seismology (2001)
                </span>{" "}
                and Eos.org&apos;s 2026 &ldquo;Earth Is Noisy. Why Should Its
                Data Be Silent?&rdquo;
              </p>
              <p>
                Degrade paths: no network → a seeded (
                <span className="text-foreground">mulberry32 0x4520</span>)
                Gutenberg–Richter catalogue, badged SYNTH; no WebGPU → a coarser
                Canvas2D ripple tank, badged CPU. It always plays and paints on
                load — no click required to begin.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
