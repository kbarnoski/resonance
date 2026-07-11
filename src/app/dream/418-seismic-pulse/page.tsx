"use client";

/**
 * 418 — Seismic Pulse
 * ────────────────────
 * The last 24 hours of real earthquakes (USGS GeoJSON), sonified so it
 * never resolves to a chord. Data-driven audification: magnitude → loudness,
 * depth → pitch, longitude → pan, latitude → filter resonance.
 *
 * Aesthetic reference: Ryoji Ikeda *data-cosm* + AGU/Eos "pops, booms, rumbles"
 * Input: USGS earthquake feed (external API, no key required)
 * Output: Canvas2D world map + Web Audio API
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { fetchQuakes } from "./data";
import type { FeedFilter, FetchResult } from "./data";
import type { QuakeFeature } from "./sample";
import { buildAudioEngine, fireQuakeSound } from "./sonify";
import type { AudioEngine } from "./sonify";

// ── Simplified continent outlines (equirectangular, lon/lat degrees) ──────────
// Manually reduced from Natural Earth public-domain data.
const CONTINENT_OUTLINES: [number, number][][] = [
  // North America
  [[-168,72],[-140,72],[-95,72],[-83,68],[-75,60],[-65,47],[-67,45],
   [-70,42],[-75,35],[-80,25],[-88,16],[-83,10],[-78,8],[-77,8],
   [-80,10],[-84,12],[-90,16],[-92,18],[-97,22],[-105,22],[-110,23],
   [-117,32],[-122,37],[-124,49],[-130,54],[-140,58],[-148,60],
   [-155,60],[-160,58],[-162,60],[-166,64],[-168,66],[-168,72]],
  // South America
  [[-80,10],[-76,8],[-62,10],[-50,0],[-35,-8],[-37,-12],[-40,-20],
   [-44,-23],[-48,-28],[-52,-33],[-58,-38],[-62,-45],[-66,-55],
   [-68,-55],[-72,-50],[-76,-45],[-72,-40],[-70,-35],[-70,-20],
   [-76,-10],[-80,-5],[-80,0],[-80,10]],
  // Europe
  [[-10,36],[5,36],[15,38],[25,38],[30,42],[35,42],[38,48],[32,52],
   [24,55],[18,58],[10,58],[5,62],[0,62],[-5,58],[-10,52],[-10,44],[-10,36]],
  // Africa
  [[-18,16],[0,10],[10,5],[40,10],[52,12],[45,12],[42,12],[45,0],
   [42,-10],[35,-15],[35,-20],[30,-28],[28,-34],[20,-36],[18,-34],
   [12,-20],[5,-5],[0,5],[-5,5],[-15,5],[-18,15],[-18,16]],
  // Asia (west + central)
  [[35,42],[50,42],[60,46],[70,48],[80,52],[90,55],[100,52],[110,50],
   [120,52],[130,55],[138,52],[140,48],[138,42],[132,38],[128,32],
   [122,26],[115,20],[108,12],[100,5],[100,2],[104,1],[108,2],[115,4],
   [120,8],[128,12],[132,15],[138,20],[145,42],[148,46],[140,52],
   [130,55],[120,52],[100,55],[80,55],[60,52],[45,42],[35,42]],
  // Australia
  [[114,-22],[120,-24],[124,-26],[130,-26],[136,-28],[142,-24],[148,-22],
   [152,-24],[154,-28],[152,-32],[150,-36],[146,-38],[142,-38],[136,-36],
   [130,-32],[126,-34],[118,-34],[114,-32],[112,-26],[114,-22]],
  // Japan
  [[130,34],[132,34],[136,35],[140,38],[142,42],[144,44],[142,44],
   [138,40],[134,36],[130,34]],
];

// ── Flash event type ───────────────────────────────────────────────────────────

interface FlashEvent {
  x: number;
  y: number;
  mag: number;
  startTime: number;
  duration: number;
}

// ── Pure canvas drawing functions ─────────────────────────────────────────────

function lonLatToXY(
  lon: number, lat: number,
  cw: number, ch: number,
  tlH: number
): [number, number] {
  const mapH = ch - tlH;
  return [
    ((lon + 180) / 360) * cw,
    ((90 - lat) / 180) * mapH,
  ];
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  cw: number, ch: number,
  tlH: number
): void {
  const mapH = ch - tlH;

  ctx.fillStyle = "#040407";
  ctx.fillRect(0, 0, cw, mapH);

  // Graticule
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 0.5;
  for (let lon = -180; lon <= 180; lon += 30) {
    const [x] = lonLatToXY(lon, 0, cw, ch, tlH);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mapH); ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const [, y] = lonLatToXY(0, lat, cw, ch, tlH);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke();
  }

  // Continent outlines
  ctx.strokeStyle = "rgba(255,255,255,0.11)";
  ctx.lineWidth = 1;
  for (const poly of CONTINENT_OUTLINES) {
    ctx.beginPath();
    poly.forEach(([lo, la], i) => {
      const [px, py] = lonLatToXY(lo, la, cw, ch, tlH);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

function drawTimeline(
  ctx: CanvasRenderingContext2D,
  quakes: QuakeFeature[],
  progress: number,
  cw: number, ch: number,
  tlH: number
): void {
  const tlY = ch - tlH;

  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(0, tlY, cw, tlH);

  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, tlY); ctx.lineTo(cw, tlY); ctx.stroke();

  // Hour ticks (every 6h)
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let h6 = 0; h6 <= 24; h6 += 6) {
    const x = (h6 / 24) * cw;
    ctx.fillRect(x - 0.5, tlY + 3, 1, 8);
  }

  // Quake event ticks
  if (quakes.length > 0) {
    const t0 = quakes[0].properties.time;
    const t1 = quakes[quakes.length - 1].properties.time;
    const tSpan = t1 - t0 || 1;
    for (const q of quakes) {
      const xPos = ((q.properties.time - t0) / tSpan) * cw;
      const mag = q.properties.mag ?? 1;
      const big = mag >= 4.5;
      ctx.fillStyle = big ? "rgba(251,191,36,0.65)" : "rgba(255,255,255,0.22)";
      const th = big ? 14 : 7;
      ctx.fillRect(xPos - 0.5, tlY + (tlH - th) / 2, 1, th);
    }
  }

  // Playhead
  const phX = progress * cw;
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(phX, tlY - 2); ctx.lineTo(phX, ch); ctx.stroke();

  // Playhead arrow
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.beginPath();
  ctx.moveTo(phX, tlY - 2);
  ctx.lineTo(phX - 4, tlY - 10);
  ctx.lineTo(phX + 4, tlY - 10);
  ctx.closePath(); ctx.fill();

  // Labels
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = `${Math.round(10 * (cw > 600 ? 1 : 0.85))}px monospace`;
  ctx.textAlign = "left";
  ctx.fillText("−24h", 4, ch - 5);
  ctx.textAlign = "right";
  ctx.fillText("now", cw - 4, ch - 5);
}

function drawQuakeDots(
  ctx: CanvasRenderingContext2D,
  quakes: QuakeFeature[],
  cw: number, ch: number,
  tlH: number
): void {
  if (quakes.length === 0) return;
  const t0 = quakes[0].properties.time;
  const t1 = quakes[quakes.length - 1].properties.time;
  const tSpan = t1 - t0 || 1;

  for (const q of quakes) {
    const [lon, lat] = q.geometry.coordinates;
    const [qx, qy] = lonLatToXY(lon, lat, cw, ch, tlH);
    const mag = q.properties.mag ?? 1;
    const norm = (q.properties.time - t0) / tSpan;
    ctx.beginPath();
    ctx.arc(qx, qy, Math.max(1, mag * 0.55), 0, Math.PI * 2);
    ctx.fillStyle = mag >= 4.5
      ? `rgba(251,191,36,${0.10 + norm * 0.09})`
      : `rgba(180,200,255,${0.05 + norm * 0.04})`;
    ctx.fill();
  }
}

function drawFlashes(
  ctx: CanvasRenderingContext2D,
  flashes: FlashEvent[],
  now: number
): void {
  for (const f of flashes) {
    const age = now - f.startTime;
    if (age > f.duration) continue;
    const p = age / f.duration;
    const a = 1 - p;
    const maxR = 5 + f.mag * 7;
    const r = maxR * p;

    // Center dot
    const dotR = Math.max(1.5, f.mag * 0.75);
    ctx.beginPath();
    ctx.arc(f.x, f.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = f.mag >= 4.5
      ? `rgba(251,191,36,${a})`
      : `rgba(255,255,255,${a * 0.75})`;
    ctx.fill();

    // Expanding ring
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = f.mag >= 4.5
      ? `rgba(251,191,36,${a * 0.55})`
      : `rgba(180,200,255,${a * 0.35})`;
    ctx.lineWidth = f.mag >= 4.5 ? 1.5 : 0.8;
    ctx.stroke();

    // Second ring for large events
    if (f.mag >= 5.5 && p < 0.75) {
      const r2 = maxR * p * 1.65;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(251,191,36,${a * 0.25})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TIMELINE_H = 50;
const LOOP_MS = 75_000;
const AUTO_DEMO_MS = 2500;

// ── Component ──────────────────────────────────────────────────────────────────

type PlayState = "idle" | "loading" | "playing";

export default function SeismicPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const drawRafRef = useRef<number>(0);
  const progressRafRef = useRef<number>(0);

  // Shared mutable state for the drawing loop — no re-renders needed
  const quakesRef = useRef<QuakeFeature[]>([]);
  const flashesRef = useRef<FlashEvent[]>([]);
  const progressRef = useRef<number>(0);
  const playStartRef = useRef<number>(0);
  const playStateRef = useRef<PlayState>("idle");

  // React state for UI
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [feedData, setFeedData] = useState<FetchResult | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all_day");
  const [currentQuake, setCurrentQuake] = useState<QuakeFeature | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Keep playStateRef in sync
  useEffect(() => { playStateRef.current = playState; }, [playState]);

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async (filter: FeedFilter) => {
    setPlayState("loading");
    const result = await fetchQuakes(filter);
    const sorted = [...result.quakes].sort(
      (a, b) => a.properties.time - b.properties.time
    );
    setFeedData({ quakes: sorted, isLive: result.isLive });
    quakesRef.current = sorted;
    setPlayState("idle");
  }, []);

  useEffect(() => { loadData(feedFilter); }, [loadData, feedFilter]);

  // ── Stop playback ────────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    cancelAnimationFrame(progressRafRef.current);
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
    if (engineRef.current) {
      try { engineRef.current.stopDrone(); } catch { /* ok */ }
      try { engineRef.current.ctx.close(); } catch { /* ok */ }
      engineRef.current = null;
    }
    progressRef.current = 0;
    flashesRef.current = [];
    playStateRef.current = "idle";
    setPlayState("idle");
    setCurrentQuake(null);
  }, []);

  // ── Start playback ───────────────────────────────────────────────────────────
  const startPlayback = useCallback(() => {
    const quakes = quakesRef.current;
    if (quakes.length === 0) return;

    // Tear down previous session
    cancelAnimationFrame(progressRafRef.current);
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
    if (engineRef.current) {
      try { engineRef.current.stopDrone(); } catch { /* ok */ }
      try { engineRef.current.ctx.close(); } catch { /* ok */ }
      engineRef.current = null;
    }

    const engine = buildAudioEngine();
    engineRef.current = engine;

    engine.ctx.resume().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));

    const t0 = quakes[0].properties.time;
    const t1 = quakes[quakes.length - 1].properties.time;
    const tSpan = t1 - t0 || 1;

    playStartRef.current = performance.now();
    playStateRef.current = "playing";
    flashesRef.current = [];
    progressRef.current = 0;
    setPlayState("playing");

    // Schedule quake events
    for (const quake of quakes) {
      const delay = ((quake.properties.time - t0) / tSpan) * LOOP_MS;

      const id = setTimeout(() => {
        if (playStateRef.current !== "playing") return;
        const eng = engineRef.current;
        if (!eng || eng.ctx.state !== "running") return;

        fireQuakeSound(eng, quake);

        // Flash on canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const dpr = window.devicePixelRatio || 1;
          const cw = canvas.width;
          const ch = canvas.height;
          const tlH = TIMELINE_H * dpr;
          const [lon, lat] = quake.geometry.coordinates;
          const [fx, fy] = lonLatToXY(lon, lat, cw, ch, tlH);
          const mag = quake.properties.mag ?? 1;
          const flash: FlashEvent = {
            x: fx, y: fy, mag,
            startTime: performance.now(),
            duration: 550 + mag * 280,
          };
          // Keep last 100 flashes
          const arr = flashesRef.current;
          flashesRef.current = arr.length >= 100 ? [...arr.slice(-99), flash] : [...arr, flash];
        }

        setCurrentQuake(quake);
      }, delay);

      timersRef.current.push(id);
    }

    // Loop restart
    const loopEndId = setTimeout(() => {
      if (playStateRef.current === "playing") startPlayback();
    }, LOOP_MS + 300);
    timersRef.current.push(loopEndId);

    // Progress tracking rAF
    const tickProgress = () => {
      if (playStateRef.current !== "playing") return;
      progressRef.current = Math.min(1, (performance.now() - playStartRef.current) / LOOP_MS);
      progressRafRef.current = requestAnimationFrame(tickProgress);
    };
    progressRafRef.current = requestAnimationFrame(tickProgress);
  }, []);

  // ── Auto-demo ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      if (playStateRef.current === "idle" && quakesRef.current.length > 0) {
        startPlayback();
      }
    }, AUTO_DEMO_MS);
    return () => clearTimeout(id);
  }, [startPlayback]);

  // ── Canvas size sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Drawing loop (independent rAF) ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) { drawRafRef.current = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.width;
      const ch = canvas.height;
      if (cw === 0 || ch === 0) { drawRafRef.current = requestAnimationFrame(draw); return; }

      const tlH = TIMELINE_H * dpr;

      // Base map
      drawMap(ctx2d, cw, ch, tlH);

      // Persistent quake dots
      drawQuakeDots(ctx2d, quakesRef.current, cw, ch, tlH);

      // Active flash events
      const now = performance.now();
      // Prune expired flashes periodically
      flashesRef.current = flashesRef.current.filter(f => now - f.startTime < f.duration + 50);
      drawFlashes(ctx2d, flashesRef.current, now);

      // Timeline
      drawTimeline(ctx2d, quakesRef.current, progressRef.current, cw, ch, tlH);

      drawRafRef.current = requestAnimationFrame(draw);
    };

    drawRafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(drawRafRef.current);
  }, []); // runs once; refs keep state current

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(drawRafRef.current);
      cancelAnimationFrame(progressRafRef.current);
      for (const id of timersRef.current) clearTimeout(id);
      if (engineRef.current) {
        try { engineRef.current.stopDrone(); } catch { /* ok */ }
        try { engineRef.current.ctx.close(); } catch { /* ok */ }
      }
    };
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────────────
  const handlePlayStop = useCallback(() => {
    if (playState === "playing") stopPlayback();
    else startPlayback();
  }, [playState, startPlayback, stopPlayback]);

  const handleFilterChange = useCallback((f: FeedFilter) => {
    stopPlayback();
    setFeedFilter(f);
  }, [stopPlayback]);

  const handleCanvasTap = useCallback(() => {
    const eng = engineRef.current;
    if (eng?.ctx.state === "suspended") {
      eng.ctx.resume().then(() => setAudioBlocked(false)).catch(() => {/* ok */});
    }
  }, []);

  // ── Derived UI values ─────────────────────────────────────────────────────────
  const quakes = feedData?.quakes ?? [];
  const isLive = feedData?.isLive ?? false;
  const isLoading = playState === "loading";
  const isPlaying = playState === "playing";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-black text-foreground flex flex-col select-none">

      {/* Title + description */}
      <div className="px-5 pt-6 pb-3 z-10">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground leading-tight">
          Seismic Pulse
        </h1>
        <p className="mt-1 text-base text-muted-foreground max-w-2xl leading-snug">
          The last 24 hours of real earthquakes, sonified so it never resolves to a chord —
          magnitude, depth, and position mapped to noise, booms, and pans. The Earth never
          stops shaking and never lands on a consonance.
        </p>
      </div>

      {/* Status + notices */}
      <div className="px-5 pb-1 flex flex-wrap gap-x-4 gap-y-1 z-10 min-h-[24px]">
        {feedData && !isLoading && (
          <span className={`text-sm font-mono ${isLive ? "text-muted-foreground" : "text-violet-300/95"}`}>
            {isLive
              ? `${quakes.length} seismic events · live USGS feed`
              : `Live USGS feed unreachable — playing a recorded day (${quakes.length} events)`}
          </span>
        )}
        {isLoading && (
          <span className="text-sm font-mono text-muted-foreground animate-pulse">
            Fetching USGS earthquake data…
          </span>
        )}
        {audioBlocked && (
          <span className="text-sm font-mono text-violet-300/95">
            Tap the map to enable sound
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-2 z-10">
        <button
          onClick={handlePlayStop}
          disabled={isLoading || quakes.length === 0}
          className={`min-h-[44px] px-6 py-2.5 font-mono text-base tracking-wide border transition-all
            ${isPlaying
              ? "border-border text-foreground bg-muted hover:bg-accent"
              : "border-border text-foreground hover:text-foreground hover:border-border"
            }
            disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isPlaying ? "■ Stop" : isLoading ? "Loading…" : "▶ Play the last 24 hours"}
        </button>

        {/* Magnitude filter */}
        <div className="flex gap-1">
          {(["all_day", "2.5_day", "significant_day"] as FeedFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`min-h-[44px] px-3 py-2.5 font-mono text-xs border transition-all
                ${feedFilter === f
                  ? "border-border text-foreground bg-muted"
                  : "border-border text-muted-foreground hover:text-muted-foreground hover:border-border"
                }`}
            >
              {f === "all_day" ? "All" : f === "2.5_day" ? "M2.5+" : "Significant"}
            </button>
          ))}
        </div>

        <Link
          href="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] inline-flex items-center px-4 py-2.5 text-sm font-mono
            text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border
            transition-all"
        >
          USGS data ↗
        </Link>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 w-full" style={{ minHeight: "360px" }}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasTap}
          className="w-full h-full block"
          style={{ minHeight: "360px" }}
        />

        {/* Current quake overlay — bottom-left above timeline */}
        <div
          className="absolute left-4 pointer-events-none z-20"
          style={{ bottom: `${TIMELINE_H + 14}px` }}
        >
          {currentQuake && isPlaying ? (
            <div className="font-mono space-y-0.5">
              <div className={`text-2xl font-bold leading-none ${
                (currentQuake.properties.mag ?? 0) >= 4.5 ? "text-violet-300" : "text-foreground"
              }`}>
                M {(currentQuake.properties.mag ?? 0).toFixed(1)}
              </div>
              <div className="text-base text-foreground leading-snug">
                {currentQuake.properties.place}
              </div>
              <div className="text-sm text-muted-foreground leading-snug">
                {currentQuake.geometry.coordinates[2].toFixed(0)} km deep
                {" · "}
                {currentQuake.geometry.coordinates[1].toFixed(1)}°
                {currentQuake.geometry.coordinates[1] >= 0 ? "N" : "S"}
                {" "}
                {Math.abs(currentQuake.geometry.coordinates[0]).toFixed(1)}°
                {currentQuake.geometry.coordinates[0] >= 0 ? "E" : "W"}
              </div>
            </div>
          ) : !isPlaying && !isLoading && quakes.length > 0 ? (
            <p className="text-base text-muted-foreground font-mono">
              {quakes.length} events in the last 24h — press play
            </p>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex flex-wrap gap-x-6 gap-y-1 z-10">
        <span className="text-sm font-mono text-muted-foreground/70">
          sonification: data-mapped noise bursts · no scale quantization
        </span>
        <span className="text-sm font-mono text-muted-foreground/70">
          ref: Ryoji Ikeda <em>data-cosm</em> · AGU/Eos seismic audification
        </span>
      </div>

    </div>
  );
}
