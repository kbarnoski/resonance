"use client";

// ════════════════════════════════════════════════════════════════════════════
// Sky Strata (1374)
//
// THE ONE QUESTION: "What if the LIVE sky composed the piece right now —
// rendered not as a GPU glow but as clean, deterministic layered light-STRATA you
// can read like a score, and played over?"
//
// Three live, keyless NOAA SWPC feeds (plasma, magnetic field, planetary K) are
// fetched CLIENT-SIDE every ~60s and pass through ONE pure mapping engine that
// authors the piece's KEY, TEMPO, PALETTE and MODE. The sky plays itself (a
// generative pentatonic arp over a cosmic pad); YOU play over it by tapping the
// strata bands or pressing A S D F G H J to pluck foreground notes in the current
// key — each tap flares its band brighter for ~1s so the world reads as played,
// not watched. Everything renders as a deterministic inline SVG (no canvas, no
// WebGL) so it is eye-verifiable and legible.
//
// Reference: Ryoji Ikeda, *datamatics* — data made luminous and legible.
// On any feed failure a slowly-drifting simulated sky keeps it singing.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchSky, simulateSky, type Sky } from "./data";
import { skyToDrivers, type Drivers } from "./mapping";
import { startSky, type SkyAudio } from "./audio";

const VW = 1000;
const VH = 600;
const KEY_MAP = "asdfghj"; // 7 played voices

// ── Deterministic starfield (seeded LCG so the sky is identical every render) ──
interface Star {
  x: number;
  y: number;
  r: number;
  delay: number;
  dur: number;
}
function makeStars(count: number): Star[] {
  let seed = 0x1374abcd;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rnd() * VW,
      y: rnd() * VH * 0.72,
      r: 0.5 + rnd() * 1.4,
      delay: -rnd() * 8,
      dur: 5 + rnd() * 7, // ≥5s period → well under 3Hz
    });
  }
  return stars;
}
const STARS = makeStars(80);

// ── One wavy translucent strata ribbon as a closed SVG path ───────────────────
function buildBandPath(centerY: number, halfH: number, phase: number, amp: number): string {
  const N = 28;
  const freq = (2 * Math.PI) / VW;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * VW;
    const y = centerY - halfH + amp * Math.sin(x * freq * 1.6 + phase);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  for (let i = N; i >= 0; i--) {
    const x = (i / N) * VW;
    const y = centerY + halfH + amp * 0.8 * Math.sin(x * freq * 1.6 + phase + 0.7);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

interface Band {
  index: number;
  centerY: number;
  halfH: number;
  path: string;
  fill: string;
  glow: string;
}
function buildBands(d: Drivers): Band[] {
  const count = d.strataCount;
  const bottomY = 540;
  const topY = 90 + (1 - d.lift) * 270; // higher lift → reach further up
  const span = bottomY - topY;
  const slot = span / count;
  const bands: Band[] = [];
  for (let i = 0; i < count; i++) {
    const centerY = bottomY - (i + 0.5) * slot;
    const halfH = (slot / 2) * d.thickness * 1.05;
    const h = (d.hue + i * 10) % 360;
    const l = 42 + i * (30 / count); // higher bands lighter (aurora crest)
    const s = d.sat;
    bands.push({
      index: i,
      centerY,
      halfH: Math.max(6, halfH),
      path: buildBandPath(centerY, Math.max(6, halfH), i * 1.3, 7 + i * 1.5),
      fill: `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`,
      glow: `hsl(${h.toFixed(0)} ${Math.min(98, s + 10).toFixed(0)}% ${Math.min(85, l + 25).toFixed(0)}%)`,
    });
  }
  return bands;
}

function fmt(n: number, digits = 0): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export default function SkyStrataPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const flareEls = useRef<(SVGPathElement | null)[]>([]);
  const flareVals = useRef<number[]>([]);
  const emphasisLineRef = useRef<SVGLineElement | null>(null);
  const audioRef = useRef<SkyAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const driversRef = useRef<Drivers | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const emphasisRef = useRef<number>(0.5);
  const draggingRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [sky, setSky] = useState<Sky>(() => simulateSky());
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drivers = useMemo(() => skyToDrivers(sky), [sky]);
  driversRef.current = drivers;
  const bands = useMemo(() => buildBands(drivers), [drivers]);

  // ── Live polling (runs regardless of audio so the SVG is always current) ─────
  const pull = useCallback(async () => {
    const sample = await fetchSky();
    setSky(sample);
    audioRef.current?.applyDrivers(skyToDrivers(sample));
  }, []);

  useEffect(() => {
    void pull();
    pollRef.current = setInterval(() => void pull(), 60000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pull]);

  // ── rAF: decay per-band flares + slide the emphasis marker (no audio needed) ─
  useEffect(() => {
    const frame = () => {
      const vals = flareVals.current;
      for (let i = 0; i < flareEls.current.length; i++) {
        const el = flareEls.current[i];
        const v = vals[i] ?? 0;
        if (el) el.setAttribute("opacity", (v * 0.65).toFixed(3));
        if (v > 0.001) vals[i] = v * 0.94;
        else vals[i] = 0;
      }
      const line = emphasisLineRef.current;
      if (line) {
        const x = (emphasisRef.current * VW).toFixed(1);
        line.setAttribute("x1", x);
        line.setAttribute("x2", x);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Play a voice + flare its band ────────────────────────────────────────────
  const playVoice = useCallback((index: number) => {
    if (!audioRef.current) return;
    audioRef.current.pluck(index);
    const count = driversRef.current?.strataCount ?? 1;
    const bandIdx = Math.min(index, count - 1);
    flareVals.current[bandIdx] = 1;
  }, []);

  // ── Begin: create context + audio graph after the gesture ───────────────────
  const begin = useCallback(async () => {
    if (started) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = startSky(ctx, driversRef.current ?? skyToDrivers(sky));
      audioRef.current.setEmphasis(emphasisRef.current);
      setStarted(true);
      setError(null);
    } catch {
      setError("Audio could not start on this device — the sky still drifts silently above.");
    }
  }, [started, sky]);

  // ── Teardown on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Keyboard: A S D F G H J pluck foreground voices ─────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !started) return;
      const idx = KEY_MAP.indexOf(e.key.toLowerCase());
      if (idx >= 0) {
        e.preventDefault();
        playVoice(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, playVoice]);

  // ── Pointer → viewBox coords, band hit-test, drag emphasis ──────────────────
  const localY = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / Math.max(1, r.width)) * VW,
      y: ((clientY - r.top) / Math.max(1, r.height)) * VH,
    };
  }, []);

  const bandAtY = useCallback((y: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (const b of bands) {
      const d = Math.abs(b.centerY - y);
      if (d < bestD) {
        bestD = d;
        best = b.index;
      }
    }
    return best;
  }, [bands]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const { x, y } = localY(e.clientX, e.clientY);
    draggingRef.current = true;
    emphasisRef.current = Math.min(1, Math.max(0, x / VW));
    audioRef.current?.setEmphasis(emphasisRef.current);
    playVoice(bandAtY(y));
  }, [localY, bandAtY, playVoice]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    const { x } = localY(e.clientX, e.clientY);
    emphasisRef.current = Math.min(1, Math.max(0, x / VW));
    audioRef.current?.setEmphasis(emphasisRef.current);
  }, [localY]);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── Palette for the canvas backdrop + horizon ───────────────────────────────
  const skyTop = drivers.darkMode ? "#05060d" : "#080a16";
  const horizonHue = drivers.hue.toFixed(0);

  return (
    <main className="min-h-screen w-full bg-[#05060d] text-white flex flex-col items-center px-4 py-6 gap-4">
      <style>{`
        @keyframes strataDriftA { 0%{transform:translateX(-16px)} 50%{transform:translateX(16px)} 100%{transform:translateX(-16px)} }
        @keyframes strataDriftB { 0%{transform:translateX(16px)} 50%{transform:translateX(-16px)} 100%{transform:translateX(16px)} }
        @keyframes skyTwinkle { 0%,100%{opacity:.25} 50%{opacity:.9} }
        .band { animation-timing-function: ease-in-out; animation-iteration-count: infinite; will-change: transform; }
        .twinkle { animation-name: skyTwinkle; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          .band { animation-duration: 140s !important; }
          .twinkle { animation: none !important; opacity: .5 !important; }
        }
      `}</style>

      <header className="w-full max-w-[1000px] flex flex-col gap-1">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">
          Sky Strata
        </h1>
        <p className="text-base text-white/80 max-w-2xl">
          The live sky over Earth composes this piece right now — real NOAA
          space-weather sets the key, tempo, palette and mode as clean layered
          light-strata you can read like a score. Tap the bands or press{" "}
          <span className="text-violet-300">A S D F G H J</span> to play over it.
        </p>
      </header>

      {/* Live HUD */}
      <div className="w-full max-w-[1000px] flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-white/70">
        {sky.live ? (
          <span className="text-emerald-300/95 font-medium">● LIVE — NOAA SWPC</span>
        ) : (
          <span className="text-amber-300/95 font-medium">● simulated sky (feed offline)</span>
        )}
        <span>speed <span className="text-white/90">{fmt(sky.speed)}</span> km/s</span>
        <span>density <span className="text-white/90">{fmt(sky.density, 1)}</span> p/cm³</span>
        <span>Bz <span className={sky.bz < -1 ? "text-violet-300" : "text-white/90"}>{fmt(sky.bz, 1)}</span> nT</span>
        <span>Kp <span className="text-white/90">{fmt(sky.kp, 1)}</span></span>
        <span className="text-white/70">key {drivers.minor ? "minor" : "major"} pentatonic</span>
      </div>

      {error && <p className="w-full max-w-[1000px] text-sm text-rose-300">{error}</p>}

      {/* The deterministic sky */}
      <div className="w-full max-w-[1000px] relative rounded-xl overflow-hidden ring-1 ring-white/10">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          className="w-full h-auto block touch-none select-none cursor-pointer"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          role="img"
          aria-label="Live layered light-strata composed from NOAA space-weather data"
        >
          <defs>
            <linearGradient id="skyBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={skyTop} />
              <stop offset="70%" stopColor="#070914" />
              <stop offset="100%" stopColor="#0a0d1c" />
            </linearGradient>
            <linearGradient id="horizonGlow" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={`hsl(${horizonHue} ${drivers.sat}% 55%)`} stopOpacity="0.55" />
              <stop offset="100%" stopColor={`hsl(${horizonHue} ${drivers.sat}% 55%)`} stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={VW} height={VH} fill="url(#skyBg)" />

          {/* Starfield */}
          <g>
            {STARS.map((s, i) => (
              <circle
                key={i}
                className="twinkle"
                cx={s.x}
                cy={s.y}
                r={s.r}
                fill="#eaf2ff"
                style={{ animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
              />
            ))}
          </g>

          {/* Horizon glow */}
          <rect x="0" y={VH - 160} width={VW} height={160} fill="url(#horizonGlow)" />

          {/* Strata bands (drift via CSS) + per-band flare overlay */}
          {bands.map((b) => (
            <g
              key={b.index}
              className="band"
              style={{
                animationName: b.index % 2 === 0 ? "strataDriftA" : "strataDriftB",
                animationDuration: `${drivers.driftSpeed + b.index * 4}s`,
                animationDelay: `${-b.index * 3}s`,
              }}
            >
              <path d={b.path} fill={b.fill} opacity={0.42 + 0.05 * b.index} />
              <path
                d={b.path}
                fill="none"
                stroke={b.glow}
                strokeWidth={1.2}
                opacity={0.5}
              />
              {/* Flare overlay — brightened by playVoice, decayed in rAF */}
              <path
                ref={(el) => {
                  flareEls.current[b.index] = el;
                }}
                d={b.path}
                fill={b.glow}
                opacity={0}
              />
            </g>
          ))}

          {/* Recent solar-wind speed ribbon — the legible "score" reading line */}
          {sky.history.length > 1 && (
            <polyline
              points={sky.history
                .map((p, i) => {
                  const x = (i / (sky.history.length - 1)) * VW;
                  const y = 66 - ((p.speed - 250) / 550) * 34; // 32..66
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ")}
              fill="none"
              stroke="hsl(160 70% 70%)"
              strokeWidth={1.4}
              strokeOpacity={0.75}
            />
          )}

          {/* Emphasis marker (drag left↔right to shift the played register) */}
          <line
            ref={emphasisLineRef}
            x1={VW / 2}
            y1={80}
            x2={VW / 2}
            y2={VH}
            stroke="#ffffff"
            strokeOpacity={0.14}
            strokeWidth={1}
          />
        </svg>

        {/* Ribbon label */}
        <div className="absolute top-2 left-3 text-sm text-white/70 pointer-events-none">
          <span className="text-emerald-300/95">solar-wind speed</span> · recent history
        </div>

        {/* Begin gate */}
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
            <button
              onClick={begin}
              className="min-h-[44px] px-4 py-2.5 rounded-lg bg-violet-500/90 hover:bg-violet-400 text-white text-base font-medium ring-1 ring-white/20 transition-colors"
            >
              Begin — let the sky play
            </button>
          </div>
        )}
      </div>

      {/* Footer: how-to + notes */}
      <div className="w-full max-w-[1000px] flex items-center justify-between text-sm text-white/70">
        <span>
          {started
            ? "The sky is composing. Tap a band or press A S D F G H J; drag left↔right to shift emphasis."
            : "Press Begin — the strata already drift above; audio starts on your gesture."}
        </span>
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className="text-violet-300 hover:text-violet-200 underline underline-offset-2"
        >
          Read the design notes
        </button>
      </div>

      {notesOpen && (
        <div className="w-full max-w-[1000px] text-base text-white/80 rounded-lg ring-1 ring-white/10 bg-white/[0.03] p-4 leading-relaxed">
          <p className="mb-2">
            <span className="text-white">Sky Strata</span> is the lab&apos;s first
            real external-world-data sonification. Three live NOAA SWPC feeds are
            the primary composer; you are the second voice.
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="text-white/90">speed</span> → arp tempo &amp; band drift speed</li>
            <li><span className="text-white/90">density</span> → number &amp; thickness of strata bands</li>
            <li><span className="text-white/90">southward Bz</span> → minor mode &amp; higher, brighter aurora bands</li>
            <li><span className="text-white/90">Kp</span> → overall energy &amp; palette (calm teal → storm violet/red)</li>
          </ul>
          <p className="mt-2 text-white/70">
            Rendered as deterministic inline SVG (no GPU) so it is eye-verifiable.
            Reference: Ryoji Ikeda, <span className="italic">datamatics</span>.
          </p>
        </div>
      )}
    </main>
  );
}
