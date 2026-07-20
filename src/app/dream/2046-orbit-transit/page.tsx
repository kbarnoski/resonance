"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  createConstellation,
  propagate,
  mulberry32,
  TIME_SCALE,
  type TopoState,
} from "./orbit";
import { createAudioEngine, type AudioEngine, type VoiceTarget } from "./audio";

// ── Art palette: graphite + cold starlight on near-black (hex allowed in the
// SVG art layer only; all chrome uses semantic tokens). ─────────────────────
const NEAR_BLACK = "#04060a";
const GRAPHITE = "#20262f";
const GRAPHITE_DIM = "#151a21";
const STARLIGHT = "#c6d3e6";
const STARLIGHT_BRIGHT = "#eaf2ff";
const ISS_TINT = "#f0f4fb";

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Sonification mapping (parameter-mapping Doppler sonification) ────────────
const ALT_MIN = 380;
const ALT_MAX = 1400;
const DOPPLER_C = 90; // km/s "sonified wave speed" — exaggerates real km/s range-rate

/** Altitude → base register: LOW orbit = higher/brighter tension, high orbit = lower. */
function computeBaseRegister(altitudeKm: number): number {
  const t = clamp((altitudeKm - ALT_MIN) / (ALT_MAX - ALT_MIN), 0, 1);
  const fLow = 95;
  const fHigh = 300;
  return fLow * Math.pow(fHigh / fLow, 1 - t); // log interpolation, continuous — non-JI
}

/** Elevation → 0..1 loudness/brightness factor (peak at zenith, fade at horizon). */
function computeElevFactor(elevationDeg: number): number {
  return Math.sin(clamp(elevationDeg, 0, 90) * DEG);
}

/** Map one visible pass to a continuous voice target. */
function computeVoiceTarget(s: TopoState): VoiceTarget {
  const base = computeBaseRegister(s.altitudeKm);
  const freq = base * (DOPPLER_C / (DOPPLER_C + s.rangeRateKmS)); // Doppler glissando
  const elevF = computeElevFactor(s.elevationDeg);
  return {
    id: s.id,
    freq,
    gain: 0.5 * Math.pow(elevF, 1.15),
    cutoff: 320 + elevF * 2600,
    pan: clamp(Math.sin(s.azimuthDeg * DEG), -1, 1),
    elevation: s.elevationDeg,
  };
}

// ── Sky-dome projection (polar: zenith at centre, horizon at the ring) ───────
const CX = 200;
const CY = 200;
const DOME_R = 178;

function projectDome(elevationDeg: number, azimuthDeg: number): { x: number; y: number } {
  const r = (1 - clamp(elevationDeg, 0, 90) / 90) * DOME_R;
  const a = azimuthDeg * DEG;
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
}

const NOTES: string[] = [
  "Orbit Transit asks: what if the satellites and the ISS passing overhead right now became sustained voices in an evolving Doppler-swept chord — music about real traffic in the sky?",
  "A seeded constellation of fourteen satellites is propagated as circular orbits in a simplified ECI frame; a co-rotating observer at 42°N converts each to topocentric range, range-rate, elevation and azimuth every frame. Everything is deterministic (mulberry32, seed 0x2046) so the sky is identical on every load and self-drives with zero input.",
  "Each visible pass is one voice. Altitude sets the base register (low orbit = higher, brighter tension; high orbit = lower). Range-rate becomes a continuous Doppler pitch-bend — approaching passes rise, departing passes fall — as portamento, never a stepped scale. Elevation drives loudness and brightness, peaking at the zenith; azimuth pans the voice across the stereo field. The current sky is the current chord, and it re-voices as passes begin and end.",
  "The pitch language is deliberately non-JI: no fixed scale, no ratio lattice, no pentatonic — only continuous glide between physically derived frequencies.",
  "The seeded simulation always plays offline. On mount the piece makes one abortable, best-effort request to a public ISS position endpoint; if it answers within 3.5s, the live altitude is folded into the ISS voice's register and the chip reads \"live\". Any failure silently falls back to \"sim\".",
  "References: Andrea Polli's Quiet Skies and Sky Score, the Voyager Symphonies of the Planets, parameter-mapping sonification, and the Doppler effect. The genuine novelty here is the data source — a real-world orbital lane this lab had never sonified.",
];

export default function OrbitTransitPage() {
  const constellation = useMemo(() => createConstellation(), []);
  const engineRef = useRef<AudioEngine | null>(null);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const liveAltRef = useRef<number | null>(null);
  const coreRefs = useRef<(SVGCircleElement | null)[]>([]);
  const glowRefs = useRef<(SVGCircleElement | null)[]>([]);
  const countRef = useRef<HTMLSpanElement | null>(null);

  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<"sim" | "live">("sim");
  const [notesOpen, setNotesOpen] = useState(false);

  // Deterministic background starfield (separate PRNG, computed once).
  const stars = useMemo(() => {
    const prng = mulberry32(0x57a2);
    const out: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 0; i < 70; i++) {
      out.push({
        x: prng() * 400,
        y: prng() * 400,
        r: 0.3 + prng() * 0.9,
        o: 0.15 + prng() * 0.5,
      });
    }
    return out;
  }, []);

  // Best-effort single live ISS fetch — silently no-ops offline. ─────────────
  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3500);
    (async () => {
      try {
        const res = await fetch(
          "https://api.wheretheiss.at/v1/satellites/25544",
          { signal: ac.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error("bad status");
        const data: unknown = await res.json();
        const alt = (data as { altitude?: unknown })?.altitude;
        if (typeof alt === "number" && Number.isFinite(alt)) {
          liveAltRef.current = alt;
          setSource("live");
        }
      } catch {
        /* offline / blocked / timeout → seeded sim covers it */
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  // Self-driving render + sonification loop (starts on mount, audio joins on Begin).
  useEffect(() => {
    const sats = constellation;
    startRef.current = performance.now();

    const frame = () => {
      const simSeconds = ((performance.now() - startRef.current) / 1000) * TIME_SCALE;
      const states = propagate(sats, simSeconds, liveAltRef.current);
      const targets: VoiceTarget[] = [];
      let visibleCount = 0;

      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        const core = coreRefs.current[i];
        const glow = glowRefs.current[i];
        if (s.visible) {
          visibleCount++;
          const { x, y } = projectDome(s.elevationDeg, s.azimuthDeg);
          const elevF = computeElevFactor(s.elevationDeg);
          const target = computeVoiceTarget(s);
          targets.push(target);
          if (core) {
            core.setAttribute("cx", x.toFixed(1));
            core.setAttribute("cy", y.toFixed(1));
            core.setAttribute("r", (2.2 + elevF * 3.6).toFixed(2));
            core.setAttribute("opacity", (0.4 + elevF * 0.6).toFixed(3));
          }
          if (glow) {
            glow.setAttribute("cx", x.toFixed(1));
            glow.setAttribute("cy", y.toFixed(1));
            glow.setAttribute("r", (7 + elevF * 12).toFixed(2));
            glow.setAttribute("opacity", (0.04 + target.gain * 0.6).toFixed(3));
          }
        } else {
          if (core) core.setAttribute("opacity", "0");
          if (glow) glow.setAttribute("opacity", "0");
        }
      }

      engineRef.current?.sync(targets);
      if (countRef.current) countRef.current.textContent = String(visibleCount);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, [constellation]);

  const begin = async () => {
    if (!engineRef.current) {
      engineRef.current = createAudioEngine(mulberry32(0x2046));
    }
    try {
      await engineRef.current.resume();
      setStarted(true);
    } catch {
      /* audio blocked — the sky keeps animating regardless */
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-12">
      <div className="flex w-full max-w-2xl flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Orbit Transit
          </h1>
          <span
            className={`font-mono text-[11px] uppercase tracking-wider ${
              source === "live" ? "text-foreground" : "text-muted-foreground"
            } rounded-md border border-border bg-background/60 px-2 py-0.5`}
          >
            {source === "live" ? "live" : "sim"}
          </span>
        </div>
        <p className="text-base text-muted-foreground">
          The satellites and the ISS overhead right now, sung as an evolving
          Doppler-swept chord — music about real traffic in the sky.
        </p>
      </div>

      {/* Sky dome — built once, attribute-mutated each frame (off-GPU). */}
      <div className="w-full max-w-md">
        <svg
          viewBox="0 0 400 400"
          className="h-auto w-full rounded-lg border border-border"
          style={{ background: NEAR_BLACK }}
          role="img"
          aria-label="Hemispherical sky dome of satellite passes overhead"
        >
          {stars.map((st, i) => (
            <circle
              key={`star-${i}`}
              cx={st.x}
              cy={st.y}
              r={st.r}
              fill={STARLIGHT}
              opacity={st.o}
            />
          ))}

          {/* Horizon ring + elevation grid (graphite). */}
          <circle cx={CX} cy={CY} r={DOME_R} fill="none" stroke={GRAPHITE} strokeWidth={1} />
          <circle cx={CX} cy={CY} r={(DOME_R * 2) / 3} fill="none" stroke={GRAPHITE_DIM} strokeWidth={1} />
          <circle cx={CX} cy={CY} r={DOME_R / 3} fill="none" stroke={GRAPHITE_DIM} strokeWidth={1} />
          <line x1={CX} y1={CY - DOME_R} x2={CX} y2={CY + DOME_R} stroke={GRAPHITE_DIM} strokeWidth={0.75} />
          <line x1={CX - DOME_R} y1={CY} x2={CX + DOME_R} y2={CY} stroke={GRAPHITE_DIM} strokeWidth={0.75} />
          <circle cx={CX} cy={CY} r={1.6} fill={STARLIGHT} opacity={0.7} />

          {/* Cardinal labels. */}
          <text x={CX} y={CY - DOME_R - 6} fill={GRAPHITE} fontSize={11} textAnchor="middle" fontFamily="monospace">N</text>
          <text x={CX + DOME_R + 10} y={CY + 4} fill={GRAPHITE} fontSize={11} textAnchor="middle" fontFamily="monospace">E</text>
          <text x={CX} y={CY + DOME_R + 14} fill={GRAPHITE} fontSize={11} textAnchor="middle" fontFamily="monospace">S</text>
          <text x={CX - DOME_R - 10} y={CY + 4} fill={GRAPHITE} fontSize={11} textAnchor="middle" fontFamily="monospace">W</text>

          {/* One glow + core per satellite; positions/size/opacity mutated via refs. */}
          {constellation.map((sat, i) => (
            <circle
              key={`glow-${sat.id}`}
              ref={(el) => {
                glowRefs.current[i] = el;
              }}
              cx={CX}
              cy={CY}
              r={0}
              opacity={0}
              fill={sat.isISS ? ISS_TINT : STARLIGHT}
            />
          ))}
          {constellation.map((sat, i) => (
            <circle
              key={`core-${sat.id}`}
              ref={(el) => {
                coreRefs.current[i] = el;
              }}
              cx={CX}
              cy={CY}
              r={0}
              opacity={0}
              fill={sat.isISS ? STARLIGHT_BRIGHT : STARLIGHT}
            />
          ))}
        </svg>
      </div>

      <div className="flex w-full max-w-md items-center justify-between gap-4">
        <button
          type="button"
          onClick={begin}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {started ? "Playing" : "Begin"}
        </button>
        <p className="font-mono text-xs text-muted-foreground">
          <span ref={countRef}>0</span> passes overhead
        </p>
      </div>

      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Read the design notes
      </button>

      <Link
        href="/dream"
        className="absolute left-4 top-4 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        ← dream
      </Link>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {NOTES.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
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
