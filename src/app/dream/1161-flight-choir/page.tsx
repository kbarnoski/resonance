"use client";

// ── Flight Choir ─────────────────────────────────────────────────────────────
// "What if the whole sky above the planet right now — every airliner in flight
//  — became a living, bright, generative choir you could listen to?"
//
// Live keyless ADS-B (airplanes.live / OpenSky) sonified over a BRIGHT daylight
// world map. Seamless simulated-sky fallback so it fully demos with zero
// network. Canvas2D only (no WebGL / 3D). Web Audio only (no libraries).
//
// References: the May–June 2026 hobbyist ADS-B *visual* radar wave — the viral
// "Skylight" ceiling projector and Adafruit's "DeskRadar64" — which showed the
// sky but never sonified it; and Andrea Polli's airspace-sonification lineage
// (Atmospherics/Weather Works, N., Cloud Car) of turning live atmospheric /
// air-traffic data into sound.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PRESETS,
  fetchLive,
  createSimField,
  simDrift,
  deadReckon,
  mulberry32,
  type Aircraft,
  type Preset,
} from "./data";
import { createEngine, type Engine } from "./audio";
import { project, drawBaseMap } from "./sky";

type Mode = "sim" | "live" | "connecting";

type FocusInfo = {
  id: string;
  callsign: string;
  altFt: number;
  speedKt: number;
  vfpm: number;
  lon: number;
  lat: number;
  place: string;
};

type Bloom = { lon: number; lat: number; t0: number };

const M_TO_FT = 3.28084;
const MS_TO_KT = 1.94384;

// Altitude → glyph colour: warm amber (low) → teal (mid) → violet (high).
function colorForAlt(alt: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, alt / 13000));
  const stops: Array<[number, [number, number, number]]> = [
    [0, [240, 138, 54]],
    [0.5, [46, 170, 150]],
    [1, [126, 108, 240]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t <= b) {
      const k = (t - a) / (b - a);
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * k),
        Math.round(ca[1] + (cb[1] - ca[1]) * k),
        Math.round(ca[2] + (cb[2] - ca[2]) * k),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

// Very coarse place label for the legend.
function computePlace(lon: number, lat: number): string {
  const boxes: Array<[string, number, number, number, number]> = [
    ["over North America", -168, -52, 12, 73],
    ["over South America", -82, -34, -55, 12],
    ["over Europe", -12, 45, 35, 66],
    ["over Africa", -18, 52, -35, 37],
    ["over Asia", 45, 180, 5, 75],
    ["over Australia", 112, 155, -40, -10],
  ];
  for (const [name, w, e, s, n] of boxes) {
    if (lon >= w && lon <= e && lat >= s && lat <= n) return name;
  }
  if (lat > 66) return "over the Arctic";
  if (lat < -55) return "over the Southern Ocean";
  if (lon > -70 && lon < 20 && lat < 45 && lat > -40) return "over the Atlantic";
  if (lon >= 20 && lon < 120 && lat < 30) return "over the Indian Ocean";
  return "over the Pacific";
}

function hashSeed(s: string): number {
  let h = 0x1161;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Merge a fresh live snapshot into the tracked set, preserving identity so each
// aircraft keeps its one voice. Returns the ids that are newly seen (for blooms).
function reconcile(tracked: Map<string, Aircraft>, incoming: Aircraft[]): string[] {
  const fresh: string[] = [];
  const seen = new Set<string>();
  for (const a of incoming) {
    seen.add(a.id);
    const ex = tracked.get(a.id);
    if (ex) {
      ex.lon = a.lon;
      ex.lat = a.lat;
      ex.alt = a.alt;
      ex.speed = a.speed;
      ex.heading = a.heading;
      ex.vrate = a.vrate;
      ex.callsign = a.callsign;
    } else {
      tracked.set(a.id, a);
      fresh.push(a.id);
    }
  }
  for (const id of [...tracked.keys()]) {
    if (!seen.has(id)) tracked.delete(id);
  }
  return fresh;
}

export default function FlightChoir() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [presetId, setPresetId] = useState<string>("world");
  const [mode, setMode] = useState<Mode>("connecting");
  const [count, setCount] = useState(0);
  const [focus, setFocus] = useState<FocusInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // refs mirror state for the mount-once render loop
  const engineRef = useRef<Engine | null>(null);
  const trackedRef = useRef<Map<string, Aircraft>>(new Map());
  const trailsRef = useRef<Map<string, Array<[number, number]>>>(new Map());
  const bloomsRef = useRef<Bloom[]>([]);
  const modeRef = useRef<Mode>("connecting");
  const focusedIdRef = useRef<string | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, inside: false });
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const startedRef = useRef(false);
  const simRndRef = useRef<() => number>(mulberry32(0xbeef));

  // ── data: live fetch with seamless simulated fallback (per preset) ──────────
  useEffect(() => {
    const preset: Preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    let cancelled = false;
    let pollTimer = 0;
    let driftTimer = 0;
    let ac: AbortController | null = null;

    // reset the field on region change
    trackedRef.current = new Map();
    trailsRef.current = new Map();
    bloomsRef.current = [];
    modeRef.current = "connecting";
    setMode("connecting");
    setCount(0);

    const startSim = () => {
      const field = createSimField(hashSeed(presetId), 64);
      trackedRef.current = new Map(field.map((a) => [a.id, a]));
      modeRef.current = "sim";
      setMode("sim");
      setCount(field.length);
      if (!driftTimer) {
        driftTimer = window.setInterval(() => {
          simDrift([...trackedRef.current.values()], simRndRef.current);
        }, 4000);
      }
    };

    const loadOnce = async () => {
      ac = new AbortController();
      const to = window.setTimeout(() => ac?.abort(), 8000);
      try {
        const list = await fetchLive(preset, ac.signal);
        window.clearTimeout(to);
        if (cancelled) return;
        const fresh = reconcile(trackedRef.current, list);
        const now = performance.now();
        // small local blooms only for genuinely new arrivals (not full field)
        if (modeRef.current === "live") {
          for (const id of fresh.slice(0, 24)) {
            const a = trackedRef.current.get(id);
            if (a) bloomsRef.current.push({ lon: a.lon, lat: a.lat, t0: now });
          }
        }
        modeRef.current = "live";
        setMode("live");
        setCount(trackedRef.current.size);
        setNotice(null);
        pollTimer = window.setTimeout(loadOnce, 15000);
      } catch {
        window.clearTimeout(to);
        if (cancelled) return;
        if (modeRef.current !== "live") {
          startSim();
          setNotice(null);
        } else {
          // was live, a refresh failed — keep the last snapshot, retry
          pollTimer = window.setTimeout(loadOnce, 15000);
        }
      }
    };
    void loadOnce();

    return () => {
      cancelled = true;
      ac?.abort();
      if (pollTimer) window.clearTimeout(pollTimer);
      if (driftTimer) window.clearInterval(driftTimer);
    };
  }, [presetId]);

  // ── render + drive loop (visual from mount; audio only once started) ────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNotice("Canvas2D isn't available in this browser.");
      return;
    }

    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // offscreen bright base map, redrawn on resize
    const base = document.createElement("canvas");
    const baseCtx = base.getContext("2d");
    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      base.width = Math.round(W * dpr);
      base.height = Math.round(H * dpr);
      if (baseCtx) {
        baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBaseMap(baseCtx, W, H);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let lastAudio = 0;
    let lastTrail = 0;
    let lastFocusPush = 0;

    const frame = (now: number) => {
      const reduced = reducedRef.current;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // clamp after tab-switch
      const moveScale = reduced ? 0.5 : 1;

      const tracked = trackedRef.current;
      // advance positions (smooth motion; live uses this to dead-reckon between polls)
      for (const a of tracked.values()) deadReckon(a, dt * moveScale);

      const list = [...tracked.values()];

      // ── focus selection ──
      let focusedId: string | null = null;
      const ptr = pointerRef.current;
      if (ptr.inside && list.length) {
        let bestD = 42 * 42;
        for (const a of list) {
          const [x, y] = project(a.lon, a.lat, W, H);
          const d = (x - ptr.x) ** 2 + (y - ptr.y) ** 2;
          if (d < bestD) {
            bestD = d;
            focusedId = a.id;
          }
        }
      }
      if (!focusedId && list.length) {
        // default: the most "dramatic" voice (fast + high)
        let best = -Infinity;
        for (const a of list) {
          const s = a.speed + a.alt / 200;
          if (s > best) {
            best = s;
            focusedId = a.id;
          }
        }
      }
      focusedIdRef.current = focusedId;

      // ── audio (throttled ~12 Hz) ──
      const engine = engineRef.current;
      if (engine && now - lastAudio > 80) {
        lastAudio = now;
        engine.update(list, focusedId, reduced);
      }

      // ── trails (throttled) ──
      if (now - lastTrail > 340) {
        lastTrail = now;
        const trails = trailsRef.current;
        const live = new Set(tracked.keys());
        for (const a of tracked.values()) {
          const arr = trails.get(a.id) ?? [];
          arr.push([a.lon, a.lat]);
          if (arr.length > 12) arr.shift();
          trails.set(a.id, arr);
        }
        for (const id of [...trails.keys()]) if (!live.has(id)) trails.delete(id);
      }

      // ── draw ──
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(base, 0, 0, W, H);
      drawTrails(ctx, trailsRef.current, tracked, W, H);
      drawBlooms(ctx, bloomsRef.current, now, W, H, reduced);
      drawAircraft(ctx, list, focusedId, W, H);

      // ── legend push (throttled ~6 Hz) ──
      if (now - lastFocusPush > 160) {
        lastFocusPush = now;
        if (focusedId) {
          const a = tracked.get(focusedId);
          if (a) {
            setFocus({
              id: a.id,
              callsign: a.callsign,
              altFt: Math.round((a.alt * M_TO_FT) / 100) * 100,
              speedKt: Math.round(a.speed * MS_TO_KT),
              vfpm: Math.round((a.vrate * M_TO_FT * 60) / 50) * 50,
              lon: a.lon,
              lat: a.lat,
              place: computePlace(a.lon, a.lat),
            });
          }
        } else {
          setFocus(null);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // mount-once: the loop reads all live values through refs.
  }, []);

  // ── full teardown on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, []);

  const startAudio = useCallback(() => {
    if (!engineRef.current) {
      try {
        engineRef.current = createEngine();
        engineRef.current.start();
      } catch {
        setNotice("Web Audio isn't available in this browser.");
        return;
      }
    } else if (engineRef.current.ctx.state === "suspended") {
      void engineRef.current.ctx.resume();
    }
    startedRef.current = true;
    setStarted(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, inside: true };
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerRef.current.inside = false;
  }, []);

  const liveChip = mode === "live";
  const simChip = mode === "sim";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-neutral-950 text-white">
      {/* bright daylight map canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="pointer-events-auto max-w-md rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Link
              href="/dream"
              className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-white/65 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              ↑ dream
            </Link>
            <h1 className="text-2xl font-semibold text-white">Flight Choir</h1>
          </div>
          <p className="mt-1.5 text-base text-white/75">
            The whole sky in flight, right now, as a bright generative choir.
          </p>

          {/* status chip */}
          <div className="mt-3 flex items-center gap-2 text-base">
            {mode === "connecting" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-white/75">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white/60" />
                connecting to the sky…
              </span>
            ) : liveChip ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300/95">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {count} live aircraft
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-amber-300/95">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                simulated sky · {count} aircraft
              </span>
            )}
          </div>
          {simChip && (
            <p className="mt-1.5 text-base text-white/60">
              No live feed reachable here — flying a deterministic simulated field
              through the identical sonification.
            </p>
          )}
          {notice && <p className="mt-2 text-base text-rose-300">{notice}</p>}
        </div>

        {/* preset picker */}
        <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur-md">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/55">
            listening over
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = p.id === presetId;
              return (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className={`min-h-[44px] rounded-xl px-4 py-2.5 text-base transition-colors ${
                    active
                      ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40"
                      : "bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* start-audio gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <button
            onClick={startAudio}
            className="min-h-[44px] rounded-2xl bg-white/95 px-8 py-4 text-xl font-semibold text-neutral-900 shadow-xl transition-transform hover:scale-[1.02] active:scale-95"
          >
            ▶ Listen to the sky
          </button>
        </div>
      )}

      {/* focused-aircraft legend */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-4 sm:p-5">
        <div className="pointer-events-auto min-w-[15rem] max-w-sm rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/55">
            in focus {pointerRef.current.inside ? "· cursor" : "· auto"}
          </div>
          {focus ? (
            <div className="mt-1">
              <div className="text-2xl font-semibold text-white tabular-nums">
                {focus.callsign}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-base text-white/75 tabular-nums">
                <span>
                  <span className="text-violet-300">{focus.altFt.toLocaleString()}</span> ft
                </span>
                <span>
                  <span className="text-emerald-300/95">{focus.speedKt}</span> kt
                </span>
                <span>
                  {focus.vfpm > 0 ? "▲" : focus.vfpm < 0 ? "▼" : "▬"}{" "}
                  {Math.abs(focus.vfpm)} fpm
                </span>
              </div>
              <div className="mt-0.5 text-base text-white/60">{focus.place}</div>
            </div>
          ) : (
            <div className="mt-1 text-base text-white/60">
              hover an aircraft to focus it
            </div>
          )}
        </div>

        <button
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto min-h-[44px] rounded-xl border border-white/10 bg-black/70 px-4 py-2.5 text-base text-white/75 backdrop-blur-md transition-colors hover:text-white"
        >
          {showNotes ? "hide" : "how it sounds"}
        </button>
      </div>

      {/* mapping notes */}
      {showNotes && (
        <div className="pointer-events-auto absolute bottom-24 right-4 z-30 max-w-sm rounded-2xl border border-white/10 bg-black/85 p-4 text-base text-white/75 backdrop-blur-md sm:right-5">
          <div className="mb-2 text-xl font-semibold text-white">How the sky sings</div>
          <ul className="space-y-1.5">
            <li>
              <span className="text-violet-300">altitude</span> → pitch on a bright
              just-intonation lydian lattice (higher = higher)
            </li>
            <li>
              <span className="text-emerald-300/95">ground speed</span> → filter
              brightness (faster = brighter)
            </li>
            <li>
              <span className="text-amber-300/95">longitude</span> → stereo pan (west
              = left, east = right)
            </li>
            <li>vertical rate → vibrato + a small detune glide (climb = shimmer)</li>
            <li>traffic density → sub-drone bed + reverb depth</li>
          </ul>
          <p className="mt-2 text-base text-white/55">
            Each aircraft is one sustained voice (fade in on entry, out on exit),
            capped at 16 with voice-stealing, through a shared reverb + limiter.
          </p>
        </div>
      )}
    </main>
  );
}

// ── canvas draw helpers (module-level; never `use*`-prefixed) ────────────────

function drawTrails(
  ctx: CanvasRenderingContext2D,
  trails: Map<string, Array<[number, number]>>,
  tracked: Map<string, Aircraft>,
  w: number,
  h: number,
): void {
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  for (const [id, pts] of trails) {
    if (pts.length < 2) continue;
    const a = tracked.get(id);
    const [r, g, b] = colorForAlt(a ? a.alt : 6000);
    for (let i = 1; i < pts.length; i++) {
      const [lon0, lat0] = pts[i - 1];
      const [lon1, lat1] = pts[i];
      // skip the segment that wraps across the antimeridian
      if (Math.abs(lon1 - lon0) > 180) continue;
      const [x0, y0] = project(lon0, lat0, w, h);
      const [x1, y1] = project(lon1, lat1, w, h);
      const alpha = (i / pts.length) * 0.5;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}

function drawBlooms(
  ctx: CanvasRenderingContext2D,
  blooms: Bloom[],
  now: number,
  w: number,
  h: number,
  reduced: boolean,
): void {
  const dur = reduced ? 1800 : 1200;
  for (let i = blooms.length - 1; i >= 0; i--) {
    const b = blooms[i];
    const p = (now - b.t0) / dur;
    if (p >= 1 || p < 0) {
      blooms.splice(i, 1);
      continue;
    }
    const [x, y] = project(b.lon, b.lat, w, h);
    const rad = 4 + p * 22; // small + local (photosensitive-safe)
    const alpha = (1 - p) * 0.4;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 2 * (1 - p) + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawAircraft(
  ctx: CanvasRenderingContext2D,
  list: Aircraft[],
  focusedId: string | null,
  w: number,
  h: number,
): void {
  for (const a of list) {
    const [x, y] = project(a.lon, a.lat, w, h);
    if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
    const [r, g, b] = colorForAlt(a.alt);
    const focused = a.id === focusedId;
    const hd = (a.heading * Math.PI) / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(hd);

    // soft glow
    const size = focused ? 7 : 5;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.7, size * 0.8);
    ctx.lineTo(0, size * 0.4);
    ctx.lineTo(-size * 0.7, size * 0.8);
    ctx.closePath();
    ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(30,30,40,0.65)";
    ctx.stroke();
    ctx.restore();

    if (focused) {
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(30,30,40,0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
