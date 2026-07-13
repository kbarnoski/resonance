"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_W,
  MAP_H,
  LAND_PATH,
  graticule,
  lonToX,
  latToY,
  isOverLand,
} from "./worldmap";
import {
  Propagator,
  angularDistanceDeg,
  ALTITUDE_KM,
  VELOCITY_KMH,
} from "./propagator";
import { pollIss } from "./feed";
import { OrbitalDrone } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";

// ════════════════════════════════════════════════════════════════════════════
// 1600 — orbital-drift
//
// THE QUESTION: "What if you could HEAR the machines orbiting overhead right
// now — the ISS and its ground-track drawn live across a world map, sonified as
// a serene, slowly-evolving orbital drone?"
//
// A pure-SVG equirectangular world map. A live feed (wheretheiss.at) places the
// ISS; a deterministic Keplerian propagator (propagator.ts) draws the ground
// track and keeps everything moving with zero network / headless / on CORS
// failure — so the map animates and the drone sounds before and without any
// fetch. Tap the map to drop a ground station that chimes as the ISS flies near.
//
// Deliberately NOT psychedelic: cool cartographic navy + cyan/teal with a warm
// amber ISS marker. Instrument-panel legible, contemplative-scientific.
//
// Determinism: seeded mulberry32 + performance.now only — no wall-clock entropy.
// ════════════════════════════════════════════════════════════════════════════

const SEED = 0x1600;
const SIM_SPEED = 60; // simulated seconds advance per real second (visible drift)
const STATION_RADIUS_DEG = 7.5; // flyby chime radius
const MAX_STATIONS = 6;

interface Station {
  id: number;
  lon: number;
  lat: number;
  inRange: boolean;
  flash: number; // 0..1 recent-chime glow
}

export default function OrbitalDriftPage() {
  const propRef = useRef<Propagator | null>(null);
  const droneRef = useRef<OrbitalDrone | null>(null);
  const rafRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const epochRef = useRef<number>(0);
  const simClockRef = useRef<number>(0); // accumulated simulated seconds
  const lastRealRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const stationsRef = useRef<Station[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nextIdRef = useRef<number>(1);

  const [mode, setMode] = useState<"SIMULATED" | "LIVE">("SIMULATED");
  const [audioOn, setAudioOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [sub, setSub] = useState({
    lat: 0,
    lon: 0,
    u: 0,
    ascending: true,
    onLand: false,
  });
  const [readout, setReadout] = useState({
    velocity: VELOCITY_KMH,
    altitude: ALTITUDE_KM,
  });

  const grat = useMemo(() => graticule(), []);

  // ── init propagator + reduced-motion + main loop ──────────────────────────
  useEffect(() => {
    const prop = new Propagator(SEED);
    propRef.current = prop;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    setReduced(mq.matches);
    const onMq = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
      setReduced(e.matches);
    };
    mq.addEventListener("change", onMq);

    epochRef.current = performance.now();
    lastRealRef.current = performance.now();
    // Seed the simulated clock a few orbits in so the initial track sits over
    // an interesting mix of ocean and land rather than a fixed corner.
    simClockRef.current = 1234;

    let lastVisualT = 0;
    const loop = () => {
      const nowReal = performance.now();
      const dtReal = (nowReal - lastRealRef.current) / 1000;
      lastRealRef.current = nowReal;
      if (!reducedRef.current) {
        simClockRef.current += dtReal * SIM_SPEED;
      }
      const t = simClockRef.current;
      const p = prop.at(t);
      const onLand = isOverLand(p.lon, p.lat);

      // Audio every frame (cheap param ramps).
      droneRef.current?.update({
        lat: p.lat,
        onLand,
        phaseU: p.u,
        velocityKmh: VELOCITY_KMH,
      });

      // Station flyby detection + chime.
      const st = stationsRef.current;
      let stationsChanged = false;
      for (const s of st) {
        const d = angularDistanceDeg(p.lon, p.lat, s.lon, s.lat);
        const near = d < STATION_RADIUS_DEG;
        if (near && !s.inRange) {
          s.inRange = true;
          s.flash = 1;
          droneRef.current?.chime(s.lat);
          stationsChanged = true;
        } else if (!near && s.inRange) {
          s.inRange = false;
        }
        if (s.flash > 0) {
          s.flash = Math.max(0, s.flash - dtReal * 0.6);
          stationsChanged = true;
        }
      }

      // Throttle React state to ~20 fps for the readout + marker.
      if (nowReal - lastVisualT > 50) {
        lastVisualT = nowReal;
        setSub({
          lat: p.lat,
          lon: p.lon,
          u: p.u,
          ascending: p.ascending,
          onLand,
        });
        if (stationsChanged) setStations([...st]);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── live feed polling ────────────────────────────────────────────────
    let cancelled = false;
    const doPoll = async () => {
      const sample = await pollIss();
      if (cancelled || !propRef.current) return;
      if (sample) {
        propRef.current.anchorLive(sample.lat, sample.lon, simClockRef.current);
        setMode("LIVE");
        setReadout({
          velocity: Math.round(sample.velocityKmh),
          altitude: Math.round(sample.altitudeKm),
        });
      } else {
        setMode("SIMULATED");
      }
    };
    doPoll();
    pollRef.current = window.setInterval(doPoll, 4000);

    return () => {
      cancelled = true;
      mq.removeEventListener("change", onMq);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (pollRef.current !== null) clearInterval(pollRef.current);
      droneRef.current?.stop();
      droneRef.current = null;
    };
  }, []);

  // Keep the stations ref in sync with state (source of truth for the loop).
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

  const startAudio = useCallback(async () => {
    if (droneRef.current) return;
    const drone = new OrbitalDrone();
    droneRef.current = drone;
    await drone.start();
    setAudioOn(true);
  }, []);

  // ── tap the map to drop a ground station ──────────────────────────────────
  const onMapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const lon = fx * 360 - 180;
    const lat = 90 - fy * 180;
    setStations((prev) => {
      const next = [...prev, { id: nextIdRef.current++, lon, lat, inRange: false, flash: 0 }];
      return next.slice(-MAX_STATIONS);
    });
  }, []);

  // ── ground track (recomputed from the propagator each render; the ~20 fps
  // `sub` state change from the loop paces the redraw) ──────────────────────
  const prop = propRef.current;
  const track: Array<{ d: string; future: boolean }> = prop
    ? prop.trackSegments(
        simClockRef.current,
        2200, // ~0.4 orbit of faint past tail
        3400, // ~0.6 orbit of bright leading track
        30,
        (lon, lat) => [lonToX(lon), latToY(lat)],
      )
    : [];

  const issX = lonToX(sub.lon);
  const issY = latToY(sub.lat);

  return (
    <main className="min-h-[calc(100vh-3rem)] w-full bg-[#050a16] text-cyan-50 font-sans">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-cyan-100">
              Orbital Drift
            </h1>
            <p className="mt-1 max-w-2xl text-base text-cyan-200/80">
              Hear the machines overhead. The ISS ground-track, drawn live and
              sonified as a slow just-intonation drone.
            </p>
          </div>
          <FeedBadge mode={mode} />
        </header>

        {/* ── the map ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-xl border border-cyan-500/20 bg-[#03060f] shadow-[0_0_60px_-20px_rgba(34,211,238,0.35)]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="block w-full cursor-crosshair select-none"
            onClick={onMapClick}
            role="img"
            aria-label="World map with live ISS ground track. Tap to drop a ground station."
          >
            {/* ocean */}
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#040915" />

            {/* graticule */}
            {grat.meridians.map((x, i) => (
              <line
                key={`m${i}`}
                x1={x}
                y1={0}
                x2={x}
                y2={MAP_H}
                stroke="#164e63"
                strokeWidth={0.5}
                opacity={0.5}
              />
            ))}
            {grat.parallels.map((y, i) => (
              <line
                key={`p${i}`}
                x1={0}
                y1={y}
                x2={MAP_W}
                y2={y}
                stroke="#164e63"
                strokeWidth={0.5}
                opacity={0.5}
              />
            ))}
            {/* equator, slightly brighter */}
            <line
              x1={0}
              y1={latToY(0)}
              x2={MAP_W}
              y2={latToY(0)}
              stroke="#22d3ee"
              strokeWidth={0.6}
              opacity={0.35}
            />

            {/* land */}
            <path
              d={LAND_PATH}
              fill="#0c2a3a"
              stroke="#2dd4bf"
              strokeWidth={0.6}
              strokeOpacity={0.55}
              fillRule="evenodd"
            />

            {/* ground track */}
            {track.map((seg, i) => (
              <path
                key={`t${i}`}
                d={seg.d}
                fill="none"
                stroke={seg.future ? "#f5b642" : "#22d3ee"}
                strokeWidth={seg.future ? 1.6 : 1}
                strokeOpacity={seg.future ? 0.85 : 0.3}
                strokeLinecap="round"
                strokeDasharray={seg.future ? undefined : "2 3"}
              />
            ))}

            {/* stations */}
            {stations.map((s) => {
              const x = lonToX(s.lon);
              const y = latToY(s.lat);
              return (
                <g key={s.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={STATION_RADIUS_DEG * (MAP_W / 360)}
                    fill="none"
                    stroke="#5eead4"
                    strokeWidth={0.6}
                    strokeOpacity={0.25 + s.flash * 0.6}
                  />
                  <circle cx={x} cy={y} r={2.4} fill="#5eead4" />
                  {s.flash > 0 && (
                    <circle
                      cx={x}
                      cy={y}
                      r={2.4 + (1 - s.flash) * 10}
                      fill="none"
                      stroke="#a7f3d0"
                      strokeWidth={0.8}
                      strokeOpacity={s.flash * 0.8}
                    />
                  )}
                </g>
              );
            })}

            {/* ISS marker (warm amber) */}
            <g>
              <circle cx={issX} cy={issY} r={7} fill="#f5b642" opacity={0.18} />
              <circle cx={issX} cy={issY} r={3.4} fill="#fbbf24" />
              <circle cx={issX} cy={issY} r={1.4} fill="#fffbeb" />
            </g>
          </svg>

          {/* corner: design notes affordance */}
          <button
            onClick={() => setShowNotes(true)}
            className="absolute right-2 top-2 rounded-md border border-cyan-400/30 bg-[#03060f]/80 px-3 py-1.5 text-xs font-medium text-cyan-200/90 backdrop-blur transition-colors hover:bg-cyan-500/10"
          >
            Design notes
          </button>
        </div>

        {/* ── control + readout row ───────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!audioOn ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-lg bg-amber-400 px-5 py-2.5 text-base font-semibold text-[#241a00] transition-colors hover:bg-amber-300"
            >
              Start sound
            </button>
          ) : (
            <span className="min-h-[44px] inline-flex items-center rounded-lg border border-teal-400/40 bg-teal-500/10 px-4 py-2.5 text-base font-medium text-teal-200">
              Drone live · orbital
            </span>
          )}
          <p className="text-base text-cyan-200/70">
            Tap the map to drop a ground station — it chimes as the ISS passes.
          </p>
        </div>

        {/* telemetry */}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Latitude" value={`${fmt(sub.lat)}°`} sub={sub.lat >= 0 ? "N" : "S"} />
          <Stat label="Longitude" value={`${fmt(sub.lon)}°`} sub={sub.lon >= 0 ? "E" : "W"} />
          <Stat label="Velocity" value={`${readout.velocity.toLocaleString()}`} sub="km/h" />
          <Stat label="Altitude" value={`${readout.altitude}`} sub="km" />
        </dl>
        <p className="mt-3 text-sm text-cyan-300/70">
          Sub-point over{" "}
          <span className={sub.onLand ? "text-amber-300/95" : "text-teal-200"}>
            {sub.onLand ? "land — timbre roughens" : "ocean — pure sines"}
          </span>
          {" · "}
          {sub.ascending ? "ascending (northbound)" : "descending (southbound)"}
          {reduced && (
            <span className="text-amber-300/95">
              {" · "}reduced-motion: drift frozen
            </span>
          )}
        </p>
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
      <PrototypeNav slugs={["1600-orbital-drift"]} />
    </main>
  );
}

function fmt(n: number): string {
  return Math.abs(n).toFixed(1);
}

function FeedBadge({ mode }: { mode: "LIVE" | "SIMULATED" }) {
  const live = mode === "LIVE";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
        live
          ? "border-teal-400/50 bg-teal-500/10 text-teal-200"
          : "border-amber-400/50 bg-amber-500/10 text-amber-200"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${live ? "bg-teal-300" : "bg-amber-300"}`}
      />
      feed: {mode}
    </span>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#060d1c] px-3 py-2.5">
      <dt className="text-xs uppercase tracking-wider text-cyan-300/60">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-base text-cyan-100">
        {value} <span className="text-sm text-cyan-300/60">{sub}</span>
      </dd>
    </div>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-xl border border-cyan-500/25 bg-[#050a16] p-6 text-cyan-100"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold text-cyan-100">Design notes</h2>
        <p className="mt-3 text-base text-cyan-200/85">
          The world is drawn in pure SVG on an equirectangular projection —
          longitude and latitude map linearly to x and y. The ISS position comes
          from a live feed (wheretheiss.at); when the network is unavailable a
          deterministic Keplerian propagator (51.6° inclination, 92.9 min period)
          keeps the ground track moving, so the map is never blank and the drone
          never silent.
        </p>
        <p className="mt-3 text-base text-cyan-200/85">
          Sound is a just-intonation pad: latitude opens or veils a lowpass,
          ocean-vs-land crossfades a sawtooth grain, and the orbital phase drives
          a slow Shepard glide. Tapped ground stations ring a JI bell on flyby.
        </p>
        <p className="mt-3 text-sm text-cyan-300/70">
          Lineage: Ryoji Ikeda&apos;s <em>datamatics</em> and Semiconductor&apos;s{" "}
          <em>Brilliant Noise</em> (sonified/visualized real scientific data).
        </p>
        <button
          onClick={onClose}
          className="mt-5 min-h-[44px] rounded-lg bg-cyan-500/20 px-5 py-2.5 text-base font-medium text-cyan-100 transition-colors hover:bg-cyan-500/30"
        >
          Close
        </button>
      </div>
    </div>
  );
}
