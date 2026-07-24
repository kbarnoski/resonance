"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2466 · HORIZON
// "If I stood outside right now and looked up, what would the sky be singing?"
//
// A from-the-ground planetarium: a wide panorama of the sky dome over your real
// location, with the Sun, Moon and the five naked-eye planets plotted at their
// TRUE altitude/azimuth for the live wall clock — each sounding a sustained
// just-intoned voice. A body high overhead sings full; one below the horizon
// falls silent. As the real sky turns (scrub the time, or let the idle
// autopilot turn it for you), the chord breathes: bodies rise and set.
//
// Astronomy: Paul Schlyter's low-precision algorithm (offline, ~1-2°).
// Sound: one oscillator per body, pitch fixed by real orbital period, snapped
// to a just-intonation grid (Kepler, Harmonices Mundi, 1619).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSky,
  runSelfCheck,
  type Body,
  type SkyState,
} from "./astro";
import { computeVoicePitches, SkyAudio } from "./audio";

// ── Geometry of the panorama ─────────────────────────────────────────────────
const SVG_W = 1000;
const SVG_H = 460;
const HORIZON_Y = SVG_H * 0.7; // altitude 0
const ZENITH_Y = SVG_H * 0.06; // altitude 90
const GROUND_DEPTH = SVG_H - HORIZON_Y - 8; // room for below-horizon bodies

const HOUR = 3600_000;
const SCRUB_RANGE = 12 * HOUR; // ±12h
const IDLE_MS = 4000; // autopilot kicks in after this
const AUTOPILOT_RATE = 1.2 * HOUR; // simulated hours advanced per real second → /1000 per ms

const FALLBACK = { lat: 37.77, lon: -122.42, label: "SF" };

const BODY_ORDER = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
] as const;

const BODY_COLOR: Record<string, string> = {
  Sun: "#ffd27a",
  Moon: "#dfe6f2",
  Mercury: "#c9b8a0",
  Venus: "#f6e7c9",
  Mars: "#e0876a",
  Jupiter: "#e3c9a0",
  Saturn: "#d8c98a",
};

const VOICE_PITCHES = computeVoicePitches([...BODY_ORDER]);

// ── Small pure helpers (never named use*) ────────────────────────────────────
function azToX(az: number): number {
  return (az / 360) * SVG_W;
}

function altToY(alt: number): number {
  if (alt >= 0) {
    return HORIZON_Y - (Math.min(alt, 90) / 90) * (HORIZON_Y - ZENITH_Y);
  }
  return HORIZON_Y + (Math.min(-alt, 40) / 40) * GROUND_DEPTH;
}

function bodyRadius(name: string, mag: number): number {
  if (name === "Sun") return 17;
  if (name === "Moon") return 12;
  // brighter (more negative magnitude) → larger dot
  const r = 6 - mag * 1.1;
  return Math.max(2.6, Math.min(11, r));
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function computeNoteName(freq: number): string {
  const n = Math.round(12 * Math.log2(freq / 440)) + 69;
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

// hex "#rrggbb" → [r,g,b]
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(
    r1 + (r2 - r1) * t,
    g1 + (g2 - g1) * t,
    b1 + (b2 - b1) * t,
  );
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Sky gradient colours driven by the Sun's altitude.
function computeSkyColors(sunAlt: number): { top: string; horizon: string } {
  const dayness = smoothstep(-10, 8, sunAlt);
  const top = mixHex("#04060f", "#0c2138", dayness);
  const horizonBase = mixHex("#0a0e1c", "#244a72", dayness);
  const twilight = Math.exp(-Math.pow(sunAlt / 6, 2)); // strongest near horizon
  const horizon = mixHex(horizonBase, "#6b2e46", twilight * 0.7);
  return { top, horizon };
}

// Classic terminator path for the Moon's lit portion.
function computeMoonPath(
  cx: number,
  cy: number,
  r: number,
  illum: number,
  waxing: boolean,
): string {
  const rx = Math.abs(1 - 2 * illum) * r;
  const outerDir = waxing ? 1 : 0;
  const innerDir =
    illum < 0.5 ? (waxing ? 1 : 0) : waxing ? 0 : 1;
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${outerDir} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${innerDir} ${cx} ${cy - r} Z`;
}

interface Loc {
  lat: number;
  lon: number;
  fallback: boolean;
}

export default function HorizonPage() {
  const [sky, setSky] = useState<SkyState | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [effLabel, setEffLabel] = useState("");
  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [loc, setLoc] = useState<Loc>({
    lat: FALLBACK.lat,
    lon: FALLBACK.lon,
    fallback: true,
  });

  const offsetRef = useRef(0);
  const dirRef = useRef(1);
  const lastInteractRef = useRef(0);
  const locRef = useRef<Loc>(loc);
  const audioRef = useRef<SkyAudio | null>(null);

  // Keep the loop's location current without re-subscribing the RAF effect.
  useEffect(() => {
    locRef.current = loc;
  }, [loc]);

  // Dev self-check: Sun up at local noon, down at midnight (SF).
  useEffect(() => {
    runSelfCheck();
  }, []);

  // Silent geolocation attempt; fall back to SF on denial/timeout/unavailable.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let done = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        setLoc({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          fallback: false,
        });
      },
      () => {
        done = true; // keep the SF fallback silently
      },
      { timeout: 6000, maximumAge: 600_000, enableHighAccuracy: false },
    );
  }, []);

  // Main loop: turn the sky, recompute positions, drive audio. Runs from mount
  // (visuals self-demo before any audio) and reads all live values via refs.
  useEffect(() => {
    lastInteractRef.current = Date.now();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = () => {
      raf = requestAnimationFrame(step);
      const now = performance.now();
      const dt = now - last;
      last = now;
      acc += dt;
      if (acc < 33) return; // ~30fps is plenty for slow motion
      acc = 0;

      // Autopilot after idle: ping-pong the scrub within ±12h.
      const idle = Date.now() - lastInteractRef.current;
      if (idle > IDLE_MS) {
        let o = offsetRef.current + dirRef.current * (dt * AUTOPILOT_RATE) / 1000;
        if (o > SCRUB_RANGE) {
          o = SCRUB_RANGE;
          dirRef.current = -1;
        } else if (o < -SCRUB_RANGE) {
          o = -SCRUB_RANGE;
          dirRef.current = 1;
        }
        offsetRef.current = o;
        setOffsetMs(o);
      }

      const effTime = Date.now() + offsetRef.current;
      const l = locRef.current;
      const s = computeSky(new Date(effTime), l.lat, l.lon);
      setSky(s);
      setEffLabel(
        new Date(effTime).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      if (audioRef.current) {
        audioRef.current.update(
          s.bodies.map((b) => ({
            name: b.name,
            altitude: b.altitude,
            azimuth: b.azimuth,
          })),
        );
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Cleanup audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const startAudio = useCallback(async () => {
    lastInteractRef.current = Date.now();
    if (audioRef.current) return;
    try {
      const a = new SkyAudio([...BODY_ORDER]);
      await a.resume();
      audioRef.current = a;
      setStarted(true);
      setAudioError(false);
    } catch {
      setAudioError(true);
    }
  }, []);

  const onScrub = useCallback((v: number) => {
    lastInteractRef.current = Date.now();
    offsetRef.current = v;
    setOffsetMs(v);
  }, []);

  const onNow = useCallback(() => {
    lastInteractRef.current = Date.now();
    offsetRef.current = 0;
    dirRef.current = 1;
    setOffsetMs(0);
  }, []);

  const skyColors = computeSkyColors(sky?.sunAltitude ?? -20);
  const offsetHours = offsetMs / HOUR;
  const offsetTag =
    Math.abs(offsetHours) < 0.05
      ? "now"
      : `${offsetHours > 0 ? "+" : ""}${offsetHours.toFixed(1)}h`;

  return (
    <main className="relative min-h-dvh w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Horizon
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              If you stood outside right now and looked up — this is the sky over
              you, and what it&apos;s singing. Sun, Moon and the five naked-eye
              planets at their true altitude and azimuth, each a sustained
              just-intoned voice. Above the horizon they sound; below it, silence.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </header>

        {/* The panorama */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="block h-auto w-full min-w-[640px]"
            role="img"
            aria-label="Panorama of the sky over your location with Sun, Moon and planets"
          >
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={skyColors.top} />
                <stop offset="70%" stopColor={skyColors.horizon} />
              </linearGradient>
              <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff4d6" />
                <stop offset="35%" stopColor="#ffd27a" />
                <stop offset="100%" stopColor="#ffd27a" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Sky */}
            <rect x="0" y="0" width={SVG_W} height={HORIZON_Y} fill="url(#sky)" />
            {/* Ground band */}
            <rect
              x="0"
              y={HORIZON_Y}
              width={SVG_W}
              height={SVG_H - HORIZON_Y}
              fill="#060810"
            />
            <line
              x1="0"
              y1={HORIZON_Y}
              x2={SVG_W}
              y2={HORIZON_Y}
              stroke="#7c6ea8"
              strokeOpacity="0.4"
              strokeWidth="1"
            />

            {/* Altitude guide lines */}
            {[30, 60].map((a) => (
              <line
                key={a}
                x1="0"
                y1={altToY(a)}
                x2={SVG_W}
                y2={altToY(a)}
                stroke="#ffffff"
                strokeOpacity="0.05"
                strokeDasharray="2 6"
              />
            ))}

            {/* Compass ticks */}
            {[
              { az: 0, label: "N" },
              { az: 90, label: "E" },
              { az: 180, label: "S" },
              { az: 270, label: "W" },
              { az: 360, label: "N" },
            ].map((t, i) => (
              <g key={i}>
                <line
                  x1={azToX(t.az)}
                  y1={HORIZON_Y - 6}
                  x2={azToX(t.az)}
                  y2={HORIZON_Y + 6}
                  stroke="#9c8fce"
                  strokeOpacity="0.6"
                />
                <text
                  x={Math.min(SVG_W - 8, Math.max(8, azToX(t.az)))}
                  y={HORIZON_Y + 22}
                  fill="#b7abdd"
                  fontSize="13"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Bodies */}
            {sky &&
              sky.bodies.map((b) => (
                <BodyMark
                  key={b.name}
                  body={b}
                  moonPhase={sky.moonPhase}
                  moonWaxing={sky.moonWaxing}
                />
              ))}
          </svg>
        </div>

        {/* Controls — the single expressive control: time scrub */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              time · {effLabel || "—"}{" "}
              <span className="text-primary">{offsetTag}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNow}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Now
              </button>
              {!started && (
                <button
                  type="button"
                  onClick={() => void startAudio()}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Play the sky
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min={-SCRUB_RANGE}
            max={SCRUB_RANGE}
            step={60_000}
            value={offsetMs}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Scrub time from twelve hours ago to twelve hours ahead"
            className="w-full accent-primary"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {loc.fallback ? (
                <span className="text-muted-foreground">
                  using default location (SF) — allow location for your sky
                </span>
              ) : (
                <span>
                  your location · {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                </span>
              )}
            </span>
            <span>
              {started ? (
                <span className="text-primary">● sounding</span>
              ) : (
                "leave it — the sky turns on its own after a few seconds"
              )}
            </span>
          </div>
          {audioError && (
            <p className="text-sm text-destructive">
              Audio unavailable on this device — the sky keeps turning silently.
            </p>
          )}
        </section>

        {/* Readout */}
        <section>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            what&apos;s up right now
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
            {sky?.bodies.map((b) => {
              const up = b.altitude > 0;
              return (
                <div key={b.name} className="text-sm">
                  <span
                    className={up ? "text-foreground" : "text-muted-foreground"}
                  >
                    <span
                      aria-hidden
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{
                        background: BODY_COLOR[b.name],
                        opacity: up ? 1 : 0.35,
                      }}
                    />
                    {b.name}
                  </span>
                  <div className="font-mono text-xs text-muted-foreground">
                    {up ? `${b.altitude.toFixed(0)}° up` : "below horizon"} ·{" "}
                    {computeNoteName(VOICE_PITCHES[b.name])}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Pitch is fixed by each body&apos;s real orbital period (faster =
            higher), snapped to just intonation — low-precision astronomy meant
            for singing, not navigation.
          </p>
        </section>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> if you
                stood outside right now and looked up, what would the sky be
                singing?
              </p>
              <p>
                Positions come from Paul Schlyter&apos;s low-precision algorithm
                — simple Keplerian elements, entirely offline, good to about a
                degree or two. Ecliptic longitude/latitude → RA/Dec → altitude
                and azimuth via local sidereal time and your latitude. Good
                enough to know where a planet is over your head; not for
                navigation.
              </p>
              <p>
                Each body&apos;s pitch is set by its real sidereal orbital period
                (Kepler&apos;s <em>Harmonices Mundi</em>, 1619) and snapped to a
                just-intonation grid. Altitude sets loudness (below the horizon
                fades to silence), azimuth sets stereo pan (east right, west
                left). Scrub time, hit Now, or leave it and the sky turns itself.
              </p>
              <p className="text-sm">
                References: Schlyter, <em>Computing planetary positions</em>;
                Kepler, <em>Harmonices Mundi</em> (1619); Meeus,{" "}
                <em>Astronomical Algorithms</em>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// One plotted body: Sun disc, Moon phase, or labelled planet dot.
function BodyMark({
  body,
  moonPhase,
  moonWaxing,
}: {
  body: Body;
  moonPhase: number;
  moonWaxing: boolean;
}) {
  const x = azToX(body.azimuth);
  const y = altToY(body.altitude);
  const up = body.altitude > 0;
  const color = BODY_COLOR[body.name] ?? "#cccccc";
  const r = bodyRadius(body.name, body.magnitudeHint);
  const dim = up ? 1 : 0.32;

  if (body.name === "Sun") {
    return (
      <g opacity={dim}>
        <circle cx={x} cy={y} r={r * 2.6} fill="url(#sunGlow)" />
        <circle cx={x} cy={y} r={r} fill="#fff1cf" />
        <text
          x={x}
          y={y - r - 8}
          fill={color}
          fontSize="12"
          fontFamily="monospace"
          textAnchor="middle"
        >
          Sun
        </text>
      </g>
    );
  }

  if (body.name === "Moon") {
    return (
      <g opacity={dim}>
        <circle cx={x} cy={y} r={r} fill="#20242e" />
        <path
          d={computeMoonPath(x, y, r, moonPhase, moonWaxing)}
          fill={color}
        />
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="0.75"
        />
        <text
          x={x}
          y={y - r - 8}
          fill={color}
          fontSize="12"
          fontFamily="monospace"
          textAnchor="middle"
        >
          Moon
        </text>
      </g>
    );
  }

  return (
    <g opacity={dim}>
      <circle cx={x} cy={y} r={r} fill={color} />
      <circle
        cx={x}
        cy={y}
        r={r + 3}
        fill="none"
        stroke={color}
        strokeOpacity="0.18"
      />
      <text
        x={x}
        y={y - r - 6}
        fill={color}
        fontSize="11"
        fontFamily="monospace"
        textAnchor="middle"
      >
        {body.name}
      </text>
    </g>
  );
}
