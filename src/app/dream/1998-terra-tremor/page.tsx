"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1998-terra-tremor — "TERRA TREMOR" · pole: dream
//
// THE ONE QUESTION: what if the living planet itself played Resonance — every
// earthquake on Earth in the last day, right now, as a struck resonance inside a
// slow tectonic drone?
//
// A real-world-data sonification. We poll the USGS all_day feed (feed.ts); each
// quake becomes a struck low resonance (audio.ts) — magnitude → energy/register,
// depth → timbre brightness, longitude → stereo pan — snapped to a modal scale
// that DRIFTS every ~40s. Under it, a deep drone whose fundamental tracks the
// running seismic-energy rate. The day's hundreds of quakes are metered out in
// time-order as a rhythmic stream. On any feed error we fall back to a synthetic
// Poisson generator, so it always demos with sound + motion. Canvas2D draws a dark
// equirectangular Earth where each quake blooms as an expanding ring, plus a
// scrolling seismogram. Graphite/ash with ember warmth for the biggest events.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createEngine, type TremorEngine } from "./audio";
import {
  fetchQuakes,
  makeSyntheticQuakes,
  type FeedStatus,
  type Quake,
} from "./feed";
import { DESIGN_NOTES } from "./readme-text";

type Phase = "idle" | "running" | "error";

// Canvas layout (fixed internal resolution; CSS scales it).
const W = 1000;
const H = 560;
const MAPH = 430;
const STRIP_TOP = 448;
const STRIP_H = 96;
const COLS = 360; // seismogram history columns

// Dispatch / poll cadence.
const POLL_MS = 60000;
const WINDOW_MS = 60000; // meter a backed-up batch over ~this window
const MIN_MS = 90;
const MAX_MS = 2200;

// ── Canvas art palette — graphite/ash with ember warmth. Raw hex/hsl is ART. ──
const ART = {
  bg: "#0c0f12",
  bgDeep: "#080a0c",
  grid: "#1b2530",
  land: "#161b21",
  landEdge: "#20272f",
  strip: "#090b0d",
  ashLine: "#5b6b78",
};

interface Ring {
  x: number;
  y: number;
  mag: number;
  born: number;
}

function projectX(lon: number): number {
  return ((lon + 180) / 360) * W;
}
function projectY(lat: number): number {
  return ((90 - lat) / 180) * MAPH;
}

// magnitude → art colour: ash-blue when small, amber mid, ember for the biggest.
function magHue(mag: number): { h: number; s: number; l: number } {
  if (mag >= 4.5) return { h: 16, s: 92, l: 56 }; // ember warning
  if (mag >= 2.5) return { h: 32, s: 74, l: 58 }; // warm
  return { h: 205, s: 16, l: 62 }; // ash
}

// Approx continent centroids [lon, lat, rx(deg), ry(deg)] — abstract soft blobs.
const LAND: [number, number, number, number][] = [
  [-100, 45, 30, 22],
  [-60, -18, 18, 26],
  [-40, 72, 16, 10],
  [18, 8, 26, 30],
  [16, 50, 22, 12],
  [95, 52, 46, 26],
  [102, 18, 18, 16],
  [134, -25, 18, 12],
  [20, -78, 60, 10],
];

function drawEarth(
  g: CanvasRenderingContext2D,
  rings: Ring[],
  trace: number[],
  now: number,
) {
  // background
  const bg = g.createLinearGradient(0, 0, 0, MAPH);
  bg.addColorStop(0, ART.bg);
  bg.addColorStop(1, ART.bgDeep);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, MAPH);

  // continents as soft blobs
  for (const [lon, lat, rx, ry] of LAND) {
    const cx = projectX(lon);
    const cy = projectY(lat);
    const rrx = (rx / 360) * W;
    const rry = (ry / 180) * MAPH;
    const rg = g.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rrx, rry));
    rg.addColorStop(0, ART.land);
    rg.addColorStop(1, "rgba(22,27,33,0)");
    g.fillStyle = rg;
    g.beginPath();
    g.ellipse(cx, cy, rrx, rry, 0, 0, Math.PI * 2);
    g.fill();
  }

  // graticule
  g.strokeStyle = ART.grid;
  g.lineWidth = 1;
  g.globalAlpha = 0.6;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = projectX(lon);
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, MAPH);
    g.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = projectY(lat);
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  // equator, a touch brighter
  g.globalAlpha = 0.9;
  g.strokeStyle = "#243441";
  g.beginPath();
  g.moveTo(0, projectY(0));
  g.lineTo(W, projectY(0));
  g.stroke();
  g.globalAlpha = 1;

  // blooming quake rings
  for (const r of rings) {
    const life = 2.0 + r.mag * 0.32;
    const frac = (now - r.born) / life;
    if (frac < 0 || frac >= 1) continue;
    const rMax = 8 + Math.max(0, r.mag) * 9;
    const rad = rMax * (1 - (1 - frac) * (1 - frac));
    const alpha = 1 - frac;
    const { h, s, l } = magHue(r.mag);
    if (r.mag >= 4.5) {
      const glow = g.createRadialGradient(r.x, r.y, 1, r.x, r.y, rad + 6);
      glow.addColorStop(0, `hsla(${h} ${s}% ${l}% / ${0.28 * alpha})`);
      glow.addColorStop(1, "hsla(16 90% 50% / 0)");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(r.x, r.y, rad + 6, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = `hsla(${h} ${s}% ${l}% / ${alpha})`;
    g.lineWidth = 1 + Math.max(0, r.mag) * 0.55;
    g.beginPath();
    g.arc(r.x, r.y, rad, 0, Math.PI * 2);
    g.stroke();
    // epicentre dot
    g.fillStyle = `hsla(${h} ${s}% ${Math.min(90, l + 20)}% / ${alpha})`;
    g.beginPath();
    g.arc(r.x, r.y, 1.5 + Math.max(0, r.mag) * 0.4, 0, Math.PI * 2);
    g.fill();
  }

  // ── seismogram strip ──
  g.fillStyle = ART.strip;
  g.fillRect(0, STRIP_TOP, W, STRIP_H);
  g.strokeStyle = ART.grid;
  g.lineWidth = 1;
  g.strokeRect(0.5, STRIP_TOP + 0.5, W - 1, STRIP_H - 1);
  const midY = STRIP_TOP + STRIP_H / 2;
  g.strokeStyle = "#182029";
  g.beginPath();
  g.moveTo(0, midY);
  g.lineTo(W, midY);
  g.stroke();

  const colW = W / COLS;
  for (let i = 0; i < trace.length; i++) {
    const v = trace[i];
    if (v <= 0.001) continue;
    const x = i * colW;
    const amp = v * (STRIP_H / 2 - 4);
    const hue = v > 0.62 ? 16 : v > 0.38 ? 32 : 205;
    const sat = v > 0.38 ? 82 : 24;
    g.strokeStyle = `hsl(${hue} ${sat}% ${52 + v * 12}%)`;
    g.lineWidth = Math.max(1, colW * 0.8);
    g.beginPath();
    g.moveTo(x, midY - amp);
    g.lineTo(x, midY + amp);
    g.stroke();
  }
}

export default function TerraTremorPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<TremorEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number>(0);
  const dispatchRef = useRef<number>(0);

  const queueRef = useRef<Quake[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const ringsRef = useRef<Ring[]>([]);
  const traceRef = useRef<number[]>(new Array(COLS).fill(0));
  const meterRef = useRef<number>(0); // decaying visual meter
  const energyRef = useRef<number>(0); // decaying seismic-energy accumulator
  const lastEnergyPushRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<FeedStatus | null>(null);
  const [sounded, setSounded] = useState(0);
  const [queued, setQueued] = useState(0);
  const [last, setLast] = useState<{ mag: number; place: string } | null>(null);
  const [modeName, setModeName] = useState("");
  const [muted, setMuted] = useState(false);
  const [master, setMaster] = useState(0.8);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    engineRef.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    engineRef.current?.setMaster(master);
  }, [master]);

  // Sound + show one quake.
  const fireQuake = useCallback((q: Quake) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.strike(q);
    ringsRef.current.push({
      x: projectX(q.lon),
      y: projectY(q.lat),
      mag: q.mag,
      born: eng.now(),
    });
    if (ringsRef.current.length > 400) ringsRef.current.splice(0, 100);
    // visual meter spike + energy accumulation
    const mNorm = Math.max(0.06, Math.min(1, 0.12 + q.mag / 6));
    meterRef.current = Math.max(meterRef.current, mNorm);
    energyRef.current += Math.pow(10, Math.max(0, Math.min(8, q.mag)) * 0.42);
    setSounded((c) => c + 1);
    setLast({ mag: q.mag, place: q.place });
  }, []);

  // Merge a fetched/synthetic batch into the queue (skip already-seen ids).
  const enqueue = useCallback((batch: Quake[]) => {
    const q = queueRef.current;
    let added = 0;
    for (const item of batch) {
      if (seenRef.current.has(item.id)) continue;
      seenRef.current.add(item.id);
      q.push(item);
      added++;
    }
    if (added > 0) q.sort((a, b) => a.time - b.time);
    if (seenRef.current.size > 5000) {
      // bound memory during long sessions
      seenRef.current = new Set([...seenRef.current].slice(-2500));
    }
    setQueued(q.length);
  }, []);

  const poll = useCallback(
    async (first: boolean) => {
      try {
        const qs = await fetchQuakes();
        setStatus("live");
        enqueue(qs);
      } catch {
        setStatus("simulated");
        enqueue(
          makeSyntheticQuakes(first ? 200 : 22, first ? 24 * 3600_000 : POLL_MS),
        );
      }
    },
    [enqueue],
  );

  const begin = useCallback(async () => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      const engine = createEngine(ctx);
      engineRef.current = engine;
      engine.setMuted(muted);
      engine.setMaster(master);

      setPhase("running");

      // first fetch immediately, then poll on an interval
      void poll(true);
      pollRef.current = window.setInterval(() => void poll(false), POLL_MS);

      // metered dispatcher: replay queued quakes in time order
      const scheduleNext = () => {
        const q = queueRef.current;
        if (q.length === 0) {
          dispatchRef.current = window.setTimeout(scheduleNext, 350);
          setQueued(0);
          return;
        }
        const quake = q.shift() as Quake;
        fireQuake(quake);
        setQueued(q.length);
        const interval = Math.max(
          MIN_MS,
          Math.min(MAX_MS, WINDOW_MS / Math.max(q.length, 1)),
        );
        dispatchRef.current = window.setTimeout(scheduleNext, interval);
      };
      dispatchRef.current = window.setTimeout(scheduleNext, 400);

      // render + meters
      const frame = () => {
        const eng = engineRef.current;
        const canvas = canvasRef.current;
        if (eng && canvas) {
          const g = canvas.getContext("2d");
          const now = eng.now();
          const dt = lastFrameRef.current ? now - lastFrameRef.current : 0.016;
          lastFrameRef.current = now;

          // decay meters
          meterRef.current *= Math.pow(0.9, dt * 60);
          energyRef.current *= Math.pow(2, -dt / 18); // ~18s half-life

          // scroll seismogram
          const tr = traceRef.current;
          tr.push(meterRef.current);
          if (tr.length > COLS) tr.shift();

          // cull dead rings occasionally
          if (ringsRef.current.length > 60) {
            ringsRef.current = ringsRef.current.filter(
              (r) => now - r.born < 2.0 + r.mag * 0.32,
            );
          }

          if (g) drawEarth(g, ringsRef.current, tr, now);

          // drive the drone from the running energy rate (throttled)
          if (now - lastEnergyPushRef.current > 0.15) {
            lastEnergyPushRef.current = now;
            const drive = Math.max(
              0,
              Math.min(1, Math.log10(energyRef.current + 1) / 5.5),
            );
            eng.setEnergy(drive);
            setModeName(eng.modeName());
          }
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      setPhase("error");
    }
  }, [phase, muted, master, poll, fireQuake]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(pollRef.current);
      window.clearTimeout(dispatchRef.current);
      engineRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const liveBadge =
    status === "live"
      ? "border-primary/50 bg-primary/20 text-primary"
      : "border-border bg-accent text-muted-foreground";

  return (
    <main className="relative min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · seismic sonification
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            TERRA TREMOR
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            The living planet plays Resonance. Every earthquake on Earth in the
            last day — pulled live from the USGS feed — is struck as a low
            resonance inside a slow tectonic drone.{" "}
            <strong className="text-foreground">Magnitude</strong> sets register
            and loudness, <strong className="text-foreground">depth</strong> sets
            brightness, <strong className="text-foreground">longitude</strong>{" "}
            pans it across the field. The mode drifts every ~40s.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-lg border border-border bg-[#0c0f12]">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="block w-full"
            role="img"
            aria-label="Equirectangular world map with blooming earthquake rings and a seismogram strip"
          />

          {/* live/simulated indicator */}
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 font-mono text-xs">
            {status && phase === "running" && (
              <span
                className={`rounded-full border px-2 py-1 ${liveBadge}`}
              >
                {status === "live" ? "● LIVE — USGS feed" : "● SIMULATED"}
              </span>
            )}
            {modeName && phase === "running" && (
              <span className="rounded-full border border-border bg-background/70 px-2 py-1 text-muted-foreground backdrop-blur-sm">
                mode · {modeName}
              </span>
            )}
          </div>

          {/* readout */}
          {phase === "running" && (
            <div className="pointer-events-none absolute right-3 top-3 max-w-[60%] text-right font-mono text-xs text-muted-foreground">
              <div>
                {sounded} struck · {queued} queued
              </div>
              {last && (
                <div className="truncate">
                  M{last.mag.toFixed(1)} · {last.place}
                </div>
              )}
            </div>
          )}

          {/* idle / error overlay — never blank */}
          {phase !== "running" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {phase === "error"
                  ? "audio unavailable"
                  : "press begin — the Earth will play itself"}
              </p>
            </div>
          )}
        </div>

        {/* controls */}
        {phase !== "running" ? (
          <div className="flex flex-col items-start gap-3">
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Feel the Earth
            </button>
            <p className="text-sm text-muted-foreground">
              Audio starts on this tap (browsers require a gesture). The last
              day&apos;s quakes replay in time-order as a rhythmic stream. No
              network? It falls back to a synthetic Poisson Earth so it always
              sounds.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <label className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              gain
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={master}
                onChange={(e) => setMaster(Number(e.target.value))}
                className="h-1 w-40 cursor-pointer accent-primary"
                aria-label="Master gain"
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Bigger quakes ring lower, louder and longer; deep quakes sound
              darker; the drone rises as the Earth gets busier.
            </p>
          </div>
        )}
      </div>

      {/* design-notes corner toggle */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed right-4 top-4 z-30 rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">
              TERRA TREMOR — design notes
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              {DESIGN_NOTES.map((n) => (
                <p key={n.heading}>
                  <strong className="text-foreground">{n.heading}.</strong>{" "}
                  {n.body}
                </p>
              ))}
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

      <PrototypeNav slugs={["1998-terra-tremor"]} />
    </main>
  );
}
