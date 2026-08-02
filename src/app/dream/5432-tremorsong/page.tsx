"use client";

// ════════════════════════════════════════════════════════════════════════════
// Tremorsong (5432)
//
// THE ONE QUESTION: "What if you could HEAR the last 24 hours of the living
// Earth — every earthquake on the planet as a note, sequenced by when it
// happened, pitched by its depth, struck by its magnitude — a real-time
// seismic score you can play back and watch ripple across a world map?"
//
// INPUT  : live USGS all_day.geojson feed (client-side fetch) with a baked
//          ~24h snapshot fallback so it is never blank/silent or headless-broken.
// OUTPUT : Canvas2D equirectangular world map + sweeping 24h temporal cursor.
// TECH   : parameter-mapping sonification — depth→pitch, magnitude→loudness/
//          decay, longitude→pan, origin-time→onset, over a soft drone bed.
// LINEAGE: Ben Holtzman & the Lamont-Doherty Seismic Sound Lab / SeismoDome.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { DAY_MS, loadQuakes, SNAPSHOT, type Quake } from "./data";
import { makeSynth, strikeQuake, type SeismicSynth } from "./audio";
import {
  clear,
  drawCursor,
  drawLegend,
  drawMap,
  drawQuakeDots,
  drawRipples,
  type MapMetrics,
  type Ripple,
} from "./render";
import { VIOLET } from "@/app/dream/_shared/palette";

// deterministic PRNG seeded on the slug hex — hands-free demo stays identical.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLAYBACK_SEC = 40; // 24h compressed to ~40s at 1× speed
const SPEEDS = [
  { label: "0.5×", mult: 0.5 },
  { label: "1×", mult: 1 },
  { label: "2×", mult: 2 },
];

function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(
    d.getUTCDate(),
  )}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export default function Tremorsong() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const synthRef = useRef<SeismicSynth | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const quakesRef = useRef<Quake[]>(
    [...SNAPSHOT].sort((a, b) => a.time - b.time),
  );
  const rngRef = useRef<() => number>(mulberry32(0x5432));
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const nextIdxRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);

  const [live, setLive] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [loop, setLoop] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const speedRef = useRef(1);
  const loopRef = useRef(true);
  useEffect(() => {
    speedRef.current = SPEEDS[speedIdx].mult;
  }, [speedIdx]);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  // ── window bounds derived from the data's newest quake (the "now" ref). ─────
  const bounds = useCallback(() => {
    const qs = quakesRef.current;
    const newest = qs.length ? qs[qs.length - 1].time : 0;
    const start = newest - DAY_MS;
    return { start, newest };
  }, []);
  const fracOf = useCallback(
    (q: Quake): number => {
      const { start } = bounds();
      return Math.max(0, Math.min(1, (q.time - start) / DAY_MS));
    },
    [bounds],
  );

  // ── the draw + advance loop. ────────────────────────────────────────────────
  const frame = useCallback(
    (ts: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      const dtMs = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;
      const dt = Math.min(0.05, dtMs / 1000); // seconds, clamped

      // advance the compressed clock while playing.
      if (playingRef.current) {
        const dur = PLAYBACK_SEC / speedRef.current;
        progressRef.current += dt / dur;
        if (progressRef.current >= 1) {
          if (loopRef.current) {
            progressRef.current = 0;
            nextIdxRef.current = 0;
            rngRef.current = mulberry32(0x5432);
          } else {
            progressRef.current = 1;
            playingRef.current = false;
            setPlaying(false);
          }
        }
      }

      const progress = progressRef.current;
      const qs = quakesRef.current;

      // fire any quakes the cursor has just crossed.
      if (playingRef.current) {
        const synth = synthRef.current;
        while (
          nextIdxRef.current < qs.length &&
          fracOf(qs[nextIdxRef.current]) <= progress
        ) {
          const q = qs[nextIdxRef.current];
          const rand = rngRef.current();
          if (synth) strikeQuake(synth, q, synth.ctx.currentTime, rand);
          ripplesRef.current.push({
            lon: q.lon,
            lat: q.lat,
            mag: q.mag,
            age: 0,
            life: 1.2 + q.mag * 0.35,
          });
          nextIdxRef.current++;
        }
      }

      // layout: clock strip on top, legend strip on bottom, map between.
      const pad = 14;
      const topH = 30;
      const botH = 52;
      const m: MapMetrics = {
        x: pad,
        y: pad + topH,
        w: W - pad * 2,
        h: H - pad * 2 - topH - botH,
      };

      clear(ctx, W, H);
      drawMap(ctx, m);
      drawQuakeDots(ctx, m, qs, fracOf, progress);
      drawRipples(ctx, m, ripplesRef.current, dt);
      drawCursor(ctx, m, progress);

      // clock + counters (drawn on canvas to avoid per-frame React renders).
      const { start } = bounds();
      const nowMs = start + progress * DAY_MS;
      const fired = nextIdxRef.current;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.fillStyle = VIOLET[200];
      ctx.fillText(fmtClock(nowMs), pad, pad + topH / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(138,138,147,0.85)";
      ctx.font = "600 11px ui-monospace, monospace";
      ctx.fillText(
        `${fired} / ${qs.length} events`,
        W - pad,
        pad + topH / 2,
      );

      drawLegend(ctx, pad, m.y + m.h + 18);

      rafRef.current = requestAnimationFrame(frame);
    },
    [bounds, fracOf],
  );

  // ── size the canvas to its container (DPR-aware). ───────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(320, rect.width) * dpr;
      canvas.height = Math.max(240, rect.height) * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // ── boot: start the visual demo hands-free, then fetch live data. ───────────
  useEffect(() => {
    playingRef.current = true;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(frame);

    let cancelled = false;
    loadQuakes().then(({ quakes, live: isLive }) => {
      if (cancelled) return;
      quakesRef.current = quakes;
      setLive(isLive);
      // restart the sweep so the freshly-loaded set plays from the top.
      progressRef.current = 0;
      nextIdxRef.current = 0;
      rngRef.current = mulberry32(0x5432);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [frame]);

  // create/resume audio on first user gesture (autoplay policy).
  const ensureAudio = useCallback(async () => {
    if (!synthRef.current) {
      synthRef.current = makeSynth();
      synthRef.current.setDrone(true);
    }
    await synthRef.current.resume();
  }, []);

  const onPlay = useCallback(async () => {
    await ensureAudio();
    progressRef.current = 0;
    nextIdxRef.current = 0;
    rngRef.current = mulberry32(0x5432);
    ripplesRef.current = [];
    playingRef.current = true;
    setPlaying(true);
  }, [ensureAudio]);

  const onToggle = useCallback(async () => {
    await ensureAudio();
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
  }, [ensureAudio]);

  useEffect(() => {
    return () => {
      const s = synthRef.current;
      if (s) s.ctx.close().catch(() => undefined);
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Tremorsong
            </h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              The last 24 hours of the living Earth, sonified — every earthquake
              a struck note, pitched by depth, sequenced by when it happened.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </header>

        <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="pointer-events-none absolute right-3 top-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {live === null
                ? "loading…"
                : live
                  ? "live · USGS"
                  : "sample data"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onPlay}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play the last 24 hours
          </button>
          <button
            onClick={onToggle}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {playing ? "Pause" : "Resume"}
          </button>

          <div className="flex items-center gap-1">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setSpeedIdx(i)}
                className={`min-h-[44px] rounded-md border px-3 text-sm transition-colors ${
                  i === speedIdx
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setLoop((v) => !v)}
            className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
              loop
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Loop {loop ? "on" : "off"}
          </button>
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          depth → pitch · magnitude → loudness &amp; size · longitude → stereo pan
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Tremorsong asks: what if you could <em>hear</em> the last 24
                hours of the living Earth? It fetches the USGS
                <span className="font-mono"> all_day.geojson </span>
                feed client-side and plays each quake back as a note on a
                compressed ~40-second timeline.
              </p>
              <p>
                Every event is a struck bell voice. Its pitch comes from{" "}
                <strong>depth</strong> (shallow = high &amp; bright, deep = low,
                quantized to a just-intonation pentatonic scale); its loudness
                and decay from <strong>magnitude</strong> (with a sub-thump for
                M ≥ 5); its stereo position from <strong>longitude</strong>. A
                soft drone bed fills the silence between events. The map is an
                equirectangular graticule; each note blooms a violet ring shaded
                by depth.
              </p>
              <p>
                Lineage: Ben Holtzman &amp; the Lamont-Doherty{" "}
                <strong>Seismic Sound Lab / SeismoDome</strong>, which
                time-compresses seismograms into audible sound — and the emerging
                near-real-time global-seismic ingestion-via-open-APIs framework
                this prototype makes playable.
              </p>
              <p>
                If the live fetch fails or you are offline, a baked ~24h snapshot
                keeps the piece playing (badge reads “sample data”).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
