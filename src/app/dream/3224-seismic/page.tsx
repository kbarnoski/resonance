"use client";

// ════════════════════════════════════════════════════════════════════════════
// Seismic Bell-Choir (3224)
//
// THE ONE QUESTION: "What if the living Earth played a slow bell-choir? — every
// real recent earthquake becomes a struck resonant voice, and you scrub a
// 24-hour clock to hear the planet's seismicity as generative, meditative
// gamelan."
//
// INPUT  : a baked USGS-shaped snapshot (+ optional live USGS all_day feed) and
//          a 24-hour scrub / play clock.
// OUTPUT : Canvas2D — an equirectangular world map with quake ripples and a
//          24-hour scrub ring.
// TECH   : data-sonification — each quake is a struck modal bell (inharmonic
//          decaying partials + a noise-click mallet). depth→pitch, mag→loudness
//          /decay/richness, lon→stereo pan, origin-time→onset on the clock.
//
// Lineage: the USGS real-time earthquake GeoJSON feed + Florian Dombois's
// earthquake *audification* (making seismic data audible). See README.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { DAY_MS, SNAPSHOT, type Quake } from "./data";
import { CONTINENTS } from "./worldmap";
import {
  makeSynth,
  strikeQuake,
  magNorm,
  type SeismicSynth,
} from "./synth";

// ── clock: 24h swept in ~90s at 1× → DAY_MS advances per real-ms. ────────────
const BASE_PERIOD_MS = 90_000;
const BASE_SPEED = DAY_MS / BASE_PERIOD_MS; // clock-ms advanced per real-ms
const SPEEDS = [
  { label: "24h / 3m", mult: 0.5 },
  { label: "24h / 90s", mult: 1 },
  { label: "24h / 45s", mult: 2 },
  { label: "24h / 20s", mult: 4.5 },
];
const MAX_FIRES_PER_FRAME = 8;

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

interface Ripple {
  lon: number;
  lat: number;
  mag: number;
  age: number; // seconds
  life: number; // seconds
}

// art-layer colour: a violet ramp that heats to orange for the biggest quakes.
function quakeHue(mag: number): number {
  const warm = Math.max(0, (magNorm(mag) - 0.55) / 0.45); // 0..1
  return 265 - warm * 250; // 265 (violet) … 15 (hot)
}
function quakeColor(mag: number, alpha: number): string {
  const h = quakeHue(mag);
  const l = 56 + magNorm(mag) * 16;
  return `hsla(${h.toFixed(0)}, 82%, ${l.toFixed(0)}%, ${alpha})`;
}

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)} UTC`;
}

interface LiveFeature {
  id?: string;
  properties?: { mag?: number; time?: number; place?: string };
  geometry?: { coordinates?: number[] };
}

export default function SeismicBellChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [running, setRunning] = useState(false); // audio armed
  const [playing, setPlaying] = useState(true); // clock sweeping
  const [speedIdx, setSpeedIdx] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [audioUnsupported, setAudioUnsupported] = useState(false);
  const [liveStatus, setLiveStatus] = useState<
    "idle" | "loading" | "merged" | "failed"
  >("idle");
  const [liveCount, setLiveCount] = useState(0);
  const [readout, setReadout] = useState({
    clock: "00:00:00 UTC",
    last: "—",
    struck: 0,
    total: SNAPSHOT.length,
  });

  // non-React loop state
  const synthRef = useRef<SeismicSynth | null>(null);
  const quakesRef = useRef<Quake[]>(SNAPSHOT.slice());
  const clockRef = useRef(0);
  const prevClockRef = useRef<number | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const lastQuakeRef = useRef<Quake | null>(null);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastReadoutRef = useRef(0);
  const draggingRef = useRef(false);
  const ringRef = useRef({ cx: 0, cy: 0, R: 1 });

  const playingRef = useRef(playing);
  const speedRef = useRef(SPEEDS[speedIdx].mult);
  const runningRef = useRef(running);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    speedRef.current = SPEEDS[speedIdx].mult;
  }, [speedIdx]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // ── fire every quake whose origin-time was crossed this frame ──────────────
  const fireCrossed = useCallback(
    (prev: number, cur: number, wrapped: boolean, nowMs: number) => {
      const quakes = quakesRef.current;
      let hits: Quake[] = [];
      if (wrapped) {
        for (const q of quakes) {
          if (q.time > prev || q.time <= cur) hits.push(q);
        }
      } else {
        const lo = Math.min(prev, cur);
        const hi = Math.max(prev, cur);
        for (const q of quakes) {
          if (q.time > lo && q.time <= hi) hits.push(q);
        }
      }
      if (hits.length === 0) return;
      // if a scrub crossed many at once, keep those nearest the play head
      if (hits.length > MAX_FIRES_PER_FRAME) {
        hits.sort(
          (a, b) => Math.abs(a.time - cur) - Math.abs(b.time - cur),
        );
        hits = hits.slice(0, MAX_FIRES_PER_FRAME);
      }
      for (const q of hits) {
        if (synthRef.current) strikeQuake(synthRef.current, q, nowMs);
        ripplesRef.current.push({
          lon: q.lon,
          lat: q.lat,
          mag: q.mag,
          age: 0,
          life: 1.4 + magNorm(q.mag) * 3.2,
        });
        lastQuakeRef.current = q;
      }
      if (ripplesRef.current.length > 120) {
        ripplesRef.current.splice(0, ripplesRef.current.length - 120);
      }
    },
    [],
  );

  // ── the render + clock heartbeat (runs from mount; silent until Start) ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const project = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * cssW,
      y: ((90 - lat) / 180) * cssH,
    });

    const drawScene = (dt: number) => {
      // advance ripples
      const rips = ripplesRef.current;
      for (const r of rips) r.age += dt;
      ripplesRef.current = rips.filter((r) => r.age < r.life);

      // ── background ──
      ctx.fillStyle = "#06060a";
      ctx.fillRect(0, 0, cssW, cssH);

      // graticule
      ctx.strokeStyle = "rgba(120,120,150,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = ((lon + 180) / 360) * cssW;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, cssH);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * cssH;
        ctx.moveTo(0, y);
        ctx.lineTo(cssW, y);
      }
      ctx.stroke();

      // continents
      ctx.fillStyle = "rgba(150,150,180,0.055)";
      ctx.strokeStyle = "rgba(160,160,200,0.22)";
      ctx.lineWidth = 1;
      for (const ring of CONTINENTS) {
        ctx.beginPath();
        ring.forEach(([lon, lat], i) => {
          const p = project(lon, lat);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // all quake dots (dim resting markers)
      for (const q of quakesRef.current) {
        const p = project(q.lon, q.lat);
        const rad = 1.4 + magNorm(q.mag) * 3.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = quakeColor(q.mag, 0.34);
        ctx.fill();
      }

      // active ripples (expanding fading rings + bright core flash)
      for (const r of rips) {
        const p = project(r.lon, r.lat);
        const t = r.age / r.life; // 0..1
        const maxR = 10 + magNorm(r.mag) * 46;
        const rad = 2 + t * maxR;
        const alpha = (1 - t) * (1 - t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.strokeStyle = quakeColor(r.mag, alpha * 0.9);
        ctx.lineWidth = 1.5 + magNorm(r.mag) * 2;
        ctx.stroke();
        // core flash
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + magNorm(r.mag) * 3, 0, Math.PI * 2);
        ctx.fillStyle = quakeColor(r.mag, alpha);
        ctx.fill();
      }

      // ── 24-hour scrub ring (overlay, bottom-centre) ──
      const R = Math.max(48, Math.min(cssW, cssH) * 0.14);
      const cx = cssW * 0.5;
      const cy = cssH - R - 26;
      ringRef.current = { cx, cy, R };

      // backing disc for legibility over the map
      ctx.beginPath();
      ctx.arc(cx, cy, R + 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6,6,10,0.62)";
      ctx.fill();

      // ring track
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(160,160,200,0.28)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // hour ticks
      for (let h = 0; h < 24; h++) {
        const a = (h / 24) * Math.PI * 2;
        const major = h % 6 === 0;
        const r0 = R - (major ? 8 : 4);
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
        ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R);
        ctx.strokeStyle = major
          ? "rgba(190,190,220,0.5)"
          : "rgba(160,160,200,0.25)";
        ctx.lineWidth = major ? 1.5 : 1;
        ctx.stroke();
      }

      // per-quake ticks around the ring, coloured by magnitude
      for (const q of quakesRef.current) {
        const a = (q.time / DAY_MS) * Math.PI * 2;
        const len = 3 + magNorm(q.mag) * 7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * (R + 3), cy - Math.cos(a) * (R + 3));
        ctx.lineTo(
          cx + Math.sin(a) * (R + 3 + len),
          cy - Math.cos(a) * (R + 3 + len),
        );
        ctx.strokeStyle = quakeColor(q.mag, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // play head hand
      const ha = (clockRef.current / DAY_MS) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(ha) * R, cy - Math.cos(ha) * R);
      ctx.strokeStyle = "rgba(196,181,253,0.95)"; // violet accent
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(196,181,253,0.95)";
      ctx.fill();
    };

    const tick = (t: number) => {
      const prevT = lastFrameRef.current || t;
      const dt = Math.min(0.05, (t - prevT) / 1000); // seconds, clamped
      lastFrameRef.current = t;

      // advance the clock when playing (and not being dragged)
      if (playingRef.current && !draggingRef.current) {
        const prev = clockRef.current;
        let cur = prev + dt * 1000 * BASE_SPEED * speedRef.current;
        let wrapped = false;
        if (cur >= DAY_MS) {
          cur -= DAY_MS;
          wrapped = true;
        }
        clockRef.current = cur;
        if (prevClockRef.current === null) prevClockRef.current = prev;
        fireCrossed(prev, cur, wrapped, performance.now());
      }

      drawScene(dt);

      // throttled readout to React (~5/s)
      if (t - lastReadoutRef.current > 200) {
        lastReadoutRef.current = t;
        const clk = clockRef.current;
        const lq = lastQuakeRef.current;
        const struck = quakesRef.current.filter((q) => q.time <= clk).length;
        setReadout({
          clock: fmtClock(clk),
          last: lq
            ? `M${lq.mag.toFixed(1)} · ${lq.depthKm}km · ${lq.region}`
            : "—",
          struck,
          total: quakesRef.current.length,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [fireCrossed]);

  // ── pointer scrub on the clock ring ────────────────────────────────────────
  const scrubToPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const { cx, cy } = ringRef.current;
      let ang = Math.atan2(px - cx, -(py - cy)); // 0 at top, clockwise
      if (ang < 0) ang += Math.PI * 2;
      const target = (ang / (Math.PI * 2)) * DAY_MS;
      const prev = clockRef.current;
      clockRef.current = target;
      fireCrossed(prev, target, false, performance.now());
    },
    [fireCrossed],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy, R } = ringRef.current;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > R * 1.6) return; // only grab near the clock ring
      draggingRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      scrubToPointer(e.clientX, e.clientY);
    },
    [scrubToPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      scrubToPointer(e.clientX, e.clientY);
    },
    [scrubToPointer],
  );
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    },
    [],
  );

  // ── Start: arm audio behind the user gesture ───────────────────────────────
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setAudioUnsupported(true);
      setRunning(true);
      return;
    }
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* resumes on gesture regardless */
    }
    synthRef.current = makeSynth(ctx);
    setRunning(true);
    setPlaying(true);
  }, []);

  // ── Load live quakes: merge the real USGS feed, degrade gracefully ─────────
  const handleLoadLive = useCallback(async () => {
    setLiveStatus("loading");
    const ctrl = new AbortController();
    const to = window.setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(USGS_URL, { signal: ctrl.signal });
      window.clearTimeout(to);
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { features?: LiveFeature[] };
      const have = new Set(quakesRef.current.map((q) => q.id));
      const merged: Quake[] = [];
      for (const f of json.features ?? []) {
        const c = f.geometry?.coordinates;
        const mag = f.properties?.mag;
        const time = f.properties?.time;
        if (!c || c.length < 3 || mag == null || time == null) continue;
        if (mag < 2) continue;
        const id = `live-${f.id ?? `${c[0]}-${c[1]}-${time}`}`;
        if (have.has(id)) continue;
        have.add(id);
        merged.push({
          id,
          time: ((time % DAY_MS) + DAY_MS) % DAY_MS,
          lon: c[0],
          lat: c[1],
          depthKm: Math.max(0, c[2]),
          mag,
          region: f.properties?.place ?? "unknown region",
          baked: false,
        });
      }
      if (merged.length === 0) {
        setLiveStatus("failed");
        return;
      }
      quakesRef.current = quakesRef.current
        .concat(merged.slice(0, 160))
        .sort((a, b) => a.time - b.time);
      setLiveCount(Math.min(merged.length, 160));
      setLiveStatus("merged");
    } catch {
      window.clearTimeout(to);
      setLiveStatus("failed");
    }
  }, []);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const s = synthRef.current;
      if (s) {
        s.voices.forEach((v) =>
          v.nodes.forEach((n) => {
            try {
              (n as OscillatorNode).stop?.();
            } catch {
              /* already stopped */
            }
          }),
        );
        try {
          s.master.disconnect();
        } catch {
          /* noop */
        }
        try {
          s.ctx.close();
        } catch {
          /* noop */
        }
        synthRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[#06060a] text-foreground">
      {/* canvas backdrop / instrument */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Seismic Bell-Choir
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Every real recent earthquake becomes a struck resonant voice. Scrub a
          24-hour clock and hear the living Earth play a slow, meditative
          gamelan — depth sets pitch, magnitude sets the ring, longitude pans it
          across the field.
        </p>
      </header>

      {/* readout */}
      <div className="pointer-events-none absolute left-6 top-36 z-10 space-y-1 sm:left-10">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          clock {readout.clock}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          last {readout.last}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          struck {readout.struck} / {readout.total} today
        </p>
        {liveStatus === "merged" && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            +{liveCount} live USGS quakes merged
          </p>
        )}
        {liveStatus === "failed" && (
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
            live feed unavailable — showing baked snapshot
          </p>
        )}
      </div>

      {/* pre-start overlay */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-background/80 px-8 py-8 text-center backdrop-blur-md">
            <p className="text-sm leading-relaxed text-muted-foreground">
              The clock is already sweeping the day, silent. Press start to arm
              audio, then each earthquake it crosses rings out as a modal bell.
            </p>
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start audio
            </button>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Audio starts on this click. Drag the clock ring to scrub by hand.
            </p>
          </div>
        </div>
      )}

      {/* transport controls */}
      {running && (
        <div className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 backdrop-blur-md">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <div className="flex items-center gap-1">
              {SPEEDS.map((sp, i) => (
                <button
                  key={sp.label}
                  onClick={() => setSpeedIdx(i)}
                  className={`min-h-[44px] rounded-md border px-3 text-sm transition-colors ${
                    speedIdx === i
                      ? "border-border bg-accent text-foreground"
                      : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {sp.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleLoadLive}
              disabled={liveStatus === "loading"}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              {liveStatus === "loading"
                ? "Loading…"
                : liveStatus === "merged"
                  ? "Live loaded"
                  : "Load live quakes"}
            </button>
          </div>
        </div>
      )}

      {/* audio-unsupported notice */}
      {audioUnsupported && (
        <p className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-destructive">
          web audio unavailable — visuals only
        </p>
      )}

      {/* design notes button */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-8 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {/* design notes modal */}
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
                Design notes
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
                the living Earth played a slow bell-choir — every real recent
                earthquake a struck resonant voice, the day&apos;s seismicity
                heard as generative, meditative gamelan?
              </p>
              <p>
                A hand-written snapshot of ~52 quakes (shaped like the{" "}
                <span className="text-foreground">
                  USGS all_day GeoJSON feed
                </span>
                ) is the guaranteed, network-free score. &ldquo;Load live
                quakes&rdquo; merges the real current feed on top; if it is
                blocked or slow it degrades silently to the snapshot.
              </p>
              <div>
                <p className="mb-1 text-foreground">Each quake → one bell:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>depth → pitch (shallow high, deep low; continuous)</li>
                  <li>magnitude → loudness, decay length, partial richness</li>
                  <li>longitude → stereo pan (west left, east right)</li>
                  <li>origin time → onset on the 24-hour scrub clock</li>
                </ul>
              </div>
              <p>
                The voice is a struck{" "}
                <span className="text-foreground">modal bell</span>: a few
                decaying inharmonic partials plus a short noise-click mallet —
                physical-modelling-flavoured, not a sample. Overlapping quakes
                layer into chords through a limiter, so the day never clips.
              </p>
              <p>
                Lineage:{" "}
                <span className="text-foreground">
                  Florian Dombois&apos;s earthquake audification
                </span>{" "}
                (making seismic data audible) and the USGS real-time feed as raw
                material.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
