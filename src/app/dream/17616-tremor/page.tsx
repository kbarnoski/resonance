"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17616-tremor — the living pulse of the whole planet conducts Karel's piano.
//
//   The public, keyless, CORS-open USGS "all_day" earthquake GeoJSON feed is
//   fetched, then refreshed every few minutes. Each quake voices ONE transformed
//   fragment of a real piano take (default: "Isolation") through an
//   AudioBufferSourceNode with its own filter, pan, reverb send and swell:
//     magnitude → loudness + duration + how much of a phrase swells
//     depth     → low-pass darkness + reverb distance (deeper = darker/farther)
//     longitude → stereo pan (west→left, east→right)
//     latitude  → which segment of the take + a gentle transpose (register)
//     recency   → brightness + play priority (newest sounds first, brightest)
//   Events are metered out on a calm rolling cadence, never a burst. The Earth
//   conducts; Karel's recording is the sounding body — nothing is synthesized.
//
//   If the feed is blocked or fails, a small BUNDLED set of realistic sample
//   quakes takes over so the instrument ALWAYS plays. The status line always
//   states whether the data is "live" or "sample".
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// Default track id per the brief: "Isolation".
const DEFAULT_TRACK_ID = "dad56bd6-8e53-442f-bb19-75ce4cc3e11c";
const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const REFETCH_MS = 180_000; // refresh the live feed every 3 minutes
const VOICE_MS = 1250; // calm rolling cadence between voiced events
const MAX_VOICES = 10; // simultaneous piano fragments before oldest is stolen
const MAX_DOTS = 48; // epicenters kept on the map at once

interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number;
  lon: number;
  lat: number;
  depth: number;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface Dot {
  key: string;
  x: number; // equirectangular px 0..360
  y: number; // equirectangular px 0..180
  mag: number;
  color: string;
}

// ── a small bundled set of realistic sample quakes (the graceful fallback) ────
// Real-world-plausible magnitudes / depths / locations so the piece plays and
// demonstrates the mapping even with no network.
const SAMPLE_QUAKES: Omit<Quake, "id" | "time">[] = [
  { mag: 6.4, place: "off the coast of Honshu, Japan", lon: 142.4, lat: 38.3, depth: 29 },
  { mag: 2.1, place: "Central California", lon: -121.6, lat: 36.6, depth: 7 },
  { mag: 4.8, place: "near the coast of Chile", lon: -71.4, lat: -33.1, depth: 58 },
  { mag: 3.3, place: "Southern Alaska", lon: -150.1, lat: 61.3, depth: 41 },
  { mag: 5.6, place: "Sumatra, Indonesia", lon: 100.6, lat: -0.9, depth: 112 },
  { mag: 1.7, place: "Island of Hawaii", lon: -155.3, lat: 19.4, depth: 3 },
  { mag: 4.1, place: "Aegean Sea, Greece", lon: 25.7, lat: 36.9, depth: 12 },
  { mag: 5.9, place: "Kermadec Islands, New Zealand", lon: -177.9, lat: -30.5, depth: 34 },
  { mag: 2.9, place: "Nevada", lon: -117.9, lat: 38.5, depth: 9 },
  { mag: 3.8, place: "near the coast of Peru", lon: -75.8, lat: -13.9, depth: 68 },
  { mag: 6.9, place: "Vanuatu region", lon: 168.3, lat: -16.7, depth: 210 },
  { mag: 2.4, place: "Puerto Rico region", lon: -66.9, lat: 17.9, depth: 15 },
  { mag: 4.4, place: "Kuril Islands", lon: 153.2, lat: 46.1, depth: 88 },
  { mag: 3.1, place: "Oklahoma", lon: -97.5, lat: 36.4, depth: 6 },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// magnitude → a cool-luminous colour: small cyan → mid indigo → large lilac.
function magColor(mag: number): string {
  const t = clamp(mag / 7, 0, 1);
  if (t < 0.5) {
    // cyan → indigo
    const k = t / 0.5;
    const r = Math.round(0x22 + (0x63 - 0x22) * k);
    const g = Math.round(0xd3 + (0x66 - 0xd3) * k);
    const b = Math.round(0xee + (0xf1 - 0xee) * k);
    return `rgb(${r},${g},${b})`;
  }
  // indigo → lilac
  const k = (t - 0.5) / 0.5;
  const r = Math.round(0x63 + (0xc4 - 0x63) * k);
  const g = Math.round(0x66 + (0xb5 - 0x66) * k);
  const b = Math.round(0xf1 + (0xfd - 0xf1) * k);
  return `rgb(${r},${g},${b})`;
}

export default function TremorPage() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackId, setTrackId] = useState(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState(
    REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? "Isolation",
  );
  const [dataMode, setDataMode] = useState<"live" | "sample" | "connecting">(
    "connecting",
  );
  const [dots, setDots] = useState<Dot[]>([]);
  const [count, setCount] = useState(0);
  const [maxMag, setMaxMag] = useState(0);
  const [last, setLast] = useState<Quake | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const { immersive, toggle } = useImmersive();

  // ── audio graph ─────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const voicesRef = useRef<Voice[]>([]);

  // ── data + scheduling ───────────────────────────────────────────────────────
  const seenRef = useRef<Set<string>>(new Set());
  const knownRef = useRef<Quake[]>([]); // everything we've learned about, for gentle looping
  const queueRef = useRef<Quake[]>([]); // waiting to be voiced
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── analyser-driven map breathing ───────────────────────────────────────────
  const rafRef = useRef(0);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const reducedRef = useRef(false);

  // project lon/lat → equirectangular px (viewBox 0 0 360 180)
  const project = (lon: number, lat: number): [number, number] => [
    clamp(lon + 180, 0, 360),
    clamp(90 - lat, 0, 180),
  ];

  // ── voice ONE quake as a transformed fragment of the take ────────────────────
  const soundQuake = useCallback((q: Quake, recency: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    const convolver = convolverRef.current;
    if (!ctx || !master || !buffer) return;

    const magN = clamp(q.mag, 0, 7) / 7;
    const depthN = clamp(q.depth, 0, 600) / 600;
    const latN = clamp((q.lat + 90) / 180, 0, 1);

    // magnitude → duration (how much phrase swells) + loudness
    const len = clamp(0.5 + magN * 3.6, 0.4, Math.max(0.6, buffer.duration - 0.1));
    const peak = 0.07 + magN * 0.5;

    // depth → darkness (deeper = darker low-pass), lifted a touch by recency
    const cutoff = 320 + (1 - depthN) * 5200 + recency * 900;
    // depth → reverb distance (deeper = more distant / more wet)
    const send = 0.08 + depthN * 0.5;

    // longitude → stereo pan
    const pan = clamp(q.lon / 180, -1, 1);

    // latitude → which segment of the take + a gentle transpose (register)
    const semis = (latN - 0.5) * 10; // -5..+5 semitones
    const rate = Math.pow(2, semis / 12);
    const maxOffset = Math.max(0.01, buffer.duration - len - 0.05);
    const jitter = (Math.random() - 0.5) * 0.05 * buffer.duration;
    const offset = clamp(latN * maxOffset + jitter, 0, maxOffset);

    // steal the oldest voice if we're at the ceiling
    if (voicesRef.current.length >= MAX_VOICES) {
      const victim = voicesRef.current.shift();
      try {
        victim?.src.stop();
      } catch {
        /* already stopped */
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = clamp(cutoff, 200, 12000);
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    // a gentle swell: slow attack (~35% of len), long release
    const t0 = ctx.currentTime;
    const attack = clamp(len * 0.35, 0.15, 1.2);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);

    // dry path
    src.connect(filter).connect(gain).connect(panner).connect(master.input);
    // reverb send (deeper quakes read as more distant)
    if (convolver) {
      const sendGain = ctx.createGain();
      sendGain.gain.value = send;
      panner.connect(sendGain).connect(convolver);
    }

    src.start(t0, offset, len + 0.05);

    const entry: Voice = { src, gain };
    voicesRef.current.push(entry);
    src.onended = () => {
      voicesRef.current = voicesRef.current.filter((v) => v !== entry);
      try {
        filter.disconnect();
        gain.disconnect();
        panner.disconnect();
      } catch {
        /* noop */
      }
    };

    // visual epicenter + live readout
    const [x, y] = project(q.lon, q.lat);
    setDots((prev) =>
      [{ key: `${q.id}-${t0.toFixed(3)}`, x, y, mag: q.mag, color: magColor(q.mag) }, ...prev].slice(
        0,
        MAX_DOTS,
      ),
    );
    setCount((c) => c + 1);
    setLast(q);
    setMaxMag((m) => Math.max(m, q.mag));
  }, []);

  // ── rolling scheduler: meter the queue out calmly; loop gently when idle ─────
  const startScheduler = useCallback(() => {
    if (voiceTimerRef.current) return;
    voiceTimerRef.current = setInterval(() => {
      if (!startedRef.current) return;
      if (queueRef.current.length === 0) {
        // nothing new arrived — softly re-breathe a few known events so the
        // instrument keeps playing (only refill occasionally, largest-first)
        const known = knownRef.current;
        if (known.length > 0 && Math.random() < 0.5) {
          const pick = [...known]
            .sort((a, b) => b.mag - a.mag)
            .slice(0, 6)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);
          queueRef.current.push(...pick);
        }
        return;
      }
      const q = queueRef.current.shift();
      if (q) soundQuake(q, 0.5);
    }, VOICE_MS);
  }, [soundQuake]);

  const parseFeed = useCallback((json: unknown): Quake[] => {
    const feats =
      (json as { features?: unknown[] } | null)?.features ?? ([] as unknown[]);
    const out: Quake[] = [];
    for (const f of feats) {
      const feat = f as {
        id?: string;
        properties?: { mag?: number | null; place?: string; time?: number };
        geometry?: { coordinates?: number[] };
      };
      const id = feat.id;
      const coords = feat.geometry?.coordinates;
      if (!id || !coords) continue;
      out.push({
        id,
        mag:
          typeof feat.properties?.mag === "number" ? feat.properties.mag : 0,
        place: feat.properties?.place ?? "unknown region",
        time: feat.properties?.time ?? Date.now(),
        lon: coords[0] ?? 0,
        lat: coords[1] ?? 0,
        depth: coords[2] ?? 10,
      });
    }
    return out;
  }, []);

  const seedFromSample = useCallback(() => {
    setDataMode("sample");
    const now = Date.now();
    const quakes: Quake[] = SAMPLE_QUAKES.map((q, i) => ({
      ...q,
      id: `sample-${i}`,
      time: now - i * 60_000,
    }));
    for (const q of quakes) seenRef.current.add(q.id);
    knownRef.current = quakes;
    // largest + most-recent first for a strong, calm opening
    queueRef.current.push(
      ...[...quakes].sort((a, b) => b.mag - a.mag),
    );
  }, []);

  const fetchFeed = useCallback(
    async (seed: boolean) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch(FEED_URL, {
          cache: "no-store",
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const events = parseFeed(json);
        setDataMode("live");
        knownRef.current = events;

        if (seed) {
          for (const e of events) seenRef.current.add(e.id);
          // open with the most recent, largest-first for priority + brightness
          const opening = [...events]
            .sort((a, b) => b.time - a.time)
            .slice(0, 12)
            .sort((a, b) => b.mag - a.mag);
          queueRef.current.push(...opening);
        } else {
          const fresh = events.filter((e) => !seenRef.current.has(e.id));
          for (const e of events) seenRef.current.add(e.id);
          // newest first so recency carries priority
          fresh.sort((a, b) => b.time - a.time);
          queueRef.current.push(...fresh);
        }
        fetchTimerRef.current = setTimeout(
          () => fetchFeed(false),
          REFETCH_MS,
        );
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // feed blocked / offline → keep the instrument alive with sample data
        if (seed) seedFromSample();
      }
    },
    [parseFeed, seedFromSample],
  );

  // ── SVG map "breathing" driven by the safeMaster analyser ────────────────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loop = () => {
      const analyser = masterRef.current?.analyser;
      const glow = glowRef.current;
      if (analyser && glow) {
        if (
          !analyserDataRef.current ||
          analyserDataRef.current.length !== analyser.fftSize
        ) {
          analyserDataRef.current = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(analyserDataRef.current);
        let sum = 0;
        const d = analyserDataRef.current;
        for (let i = 0; i < d.length; i++) {
          const v = (d[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / d.length);
        const target = reducedRef.current ? 0.14 : 0.1 + rms * 3.2;
        glow.setAttribute("opacity", clamp(target, 0.06, 0.6).toFixed(3));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── teardown ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      startedRef.current = false;
      abortRef.current?.abort();
      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      for (const v of voicesRef.current) {
        try {
          v.src.stop();
        } catch {
          /* noop */
        }
      }
      voicesRef.current = [];
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
    };
  }, []);

  // ── primary action: the single "Begin" gesture ───────────────────────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current || loading) return;
    setLoading(true);
    setAudioError(null);
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      const master = createSafeMaster(ctx);

      // shared plate-ish reverb (an effect IR, not a musical source)
      const convolver = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.6);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const chData = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          chData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
        }
      }
      convolver.buffer = ir;
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.6;
      convolver.connect(reverbReturn).connect(master.input);

      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);

      ctxRef.current = ctx;
      masterRef.current = master;
      convolverRef.current = convolver;
      bufferRef.current = buffer;
      setTrackTitle(title);

      startedRef.current = true;
      setStarted(true);
      setLoading(false);
      startScheduler();
      fetchFeed(true);
    } catch (err) {
      setLoading(false);
      startedRef.current = false;
      setStarted(false);
      setAudioError(
        `Could not open the audio engine or decode the take (${
          (err as Error)?.message ?? "unknown error"
        }).`,
      );
    }
  }, [loading, trackId, startScheduler, fetchFeed]);

  const handleTrackChange = useCallback(async (id: string) => {
    setTrackId(id);
    const ctx = ctxRef.current;
    const fallback = REAL_TRACKS.find((r) => r.id === id);
    if (!ctx || !startedRef.current) {
      if (fallback) setTrackTitle(fallback.title);
      return;
    }
    try {
      const { buffer, title } = await loadRealTrackBuffer(ctx, id);
      bufferRef.current = buffer;
      setTrackTitle(title);
    } catch {
      /* keep the current buffer if the new one fails to load */
    }
  }, []);

  const magStr = last ? `M${last.mag.toFixed(1)}` : "—";
  const statusLabel =
    dataMode === "live"
      ? "USGS live feed"
      : dataMode === "sample"
        ? "sample data (offline)"
        : "connecting…";

  // graticule lines
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];

  // faint lat/lon dot field suggesting the sphere (precomputed)
  const field: { cx: number; cy: number }[] = [];
  for (let gy = 0; gy < 12; gy++) {
    for (let gx = 0; gx < 24; gx++) {
      field.push({ cx: gx * 15 + 7.5, cy: gy * 15 + 7.5 });
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── the SVG world map fills the viewport ── */}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
        <svg
          viewBox="0 0 360 180"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full max-h-[80vh]"
          aria-label="Equirectangular world map with pulsing earthquake epicenters"
        >
          <defs>
            <radialGradient id="tremor-ocean" cx="50%" cy="45%" r="75%">
              <stop offset="0%" stopColor="#1a1b3a" />
              <stop offset="60%" stopColor="#111226" />
              <stop offset="100%" stopColor="#0a0a14" />
            </radialGradient>
            <radialGradient id="tremor-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ocean field */}
          <rect x="0" y="0" width="360" height="180" fill="url(#tremor-ocean)" />

          {/* analyser-driven breathing glow (opacity set each frame via ref) */}
          <circle
            ref={glowRef}
            cx="180"
            cy="90"
            r="150"
            fill="url(#tremor-glow)"
            opacity="0.1"
          />

          {/* faint lat/lon dot field suggesting the sphere */}
          {field.map((p) => (
            <circle
              key={`f-${p.cx}-${p.cy}`}
              cx={p.cx}
              cy={p.cy}
              r="0.5"
              fill="#a78bfa"
              opacity="0.12"
            />
          ))}

          {/* graticule */}
          {meridians.map((lon) => (
            <line
              key={`m-${lon}`}
              x1={lon + 180}
              y1="0"
              x2={lon + 180}
              y2="180"
              stroke="#6366f1"
              strokeWidth="0.25"
              opacity="0.22"
            />
          ))}
          {parallels.map((lat) => (
            <line
              key={`p-${lat}`}
              x1="0"
              y1={90 - lat}
              x2="360"
              y2={90 - lat}
              stroke="#6366f1"
              strokeWidth="0.25"
              opacity="0.22"
            />
          ))}
          {/* equator emphasised */}
          <line
            x1="0"
            y1="90"
            x2="360"
            y2="90"
            stroke="#22d3ee"
            strokeWidth="0.35"
            opacity="0.35"
          />

          {/* epicenters — newest first; each animates in as its sound fires */}
          {dots.map((d, i) => {
            const r = 0.8 + clamp(d.mag, 0, 8) * 0.7;
            const fresh = i < 3;
            return (
              <g key={d.key} className="tremor-dot" style={{ transformOrigin: `${d.x}px ${d.y}px` }}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={r}
                  fill={d.color}
                  opacity={fresh ? 0.95 : clamp(0.7 - i * 0.012, 0.14, 0.7)}
                />
                <circle
                  className="tremor-ring"
                  cx={d.x}
                  cy={d.y}
                  r={r}
                  fill="none"
                  stroke={d.color}
                  strokeWidth="0.5"
                  style={{ animationDelay: "0s" }}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <style>{`
        @keyframes tremorRing {
          0%   { r: 1px; opacity: 0.9; stroke-width: 0.9px; }
          100% { r: 14px; opacity: 0;   stroke-width: 0.1px; }
        }
        @keyframes tremorPop {
          0%   { transform: scale(0.2); }
          40%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .tremor-ring { animation: tremorRing 2.2s ease-out forwards; }
        .tremor-dot  { animation: tremorPop 0.6s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .tremor-ring { animation: none; opacity: 0; }
          .tremor-dot  { animation: none; }
        }
      `}</style>

      {/* ── write-up chrome (hidden while immersive) ── */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-7">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              17616 · tremor
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
              The earth&apos;s tremors play his piano
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Every earthquake happening around the world right now conducts one
              transformed fragment of Karel&apos;s take. The planet is the score;
              his recording is the sounding body.
            </p>
          </div>
          <div className="pointer-events-auto flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
            <ImmersiveToggle immersive={immersive} onToggle={toggle} />
          </div>
        </div>
      )}

      {/* ── live readout (always visible once started) ── */}
      {started && (
        <div
          className={`pointer-events-none absolute left-5 z-10 sm:left-7 ${
            immersive ? "top-6" : "top-40 sm:top-48"
          }`}
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {statusLabel}
          </p>
          <p className="mt-1 font-mono text-3xl tabular-nums text-foreground">
            {magStr}
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {last?.place ?? "listening for the next tremor…"}
            {last ? ` · ${new Date(last.time).toLocaleTimeString()}` : ""}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {count} tremors voiced · largest M{maxMag.toFixed(1)} · source:{" "}
            {trackTitle}
          </p>
          {dataMode === "sample" && (
            <p className="mt-2 max-w-xs text-sm text-destructive">
              Live USGS feed unavailable — playing bundled sample quakes. The
              audio is still Karel&apos;s recording.
            </p>
          )}
        </div>
      )}

      {/* ── controls ── */}
      {!immersive && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 pb-16 sm:p-7 sm:pb-16">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md sm:p-5">
            {audioError && (
              <p className="text-sm text-destructive">{audioError}</p>
            )}
            {!started ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-base text-muted-foreground">
                  Press begin to open the audio engine, decode his take, and let
                  the planet&apos;s live seismic pulse start playing.
                </p>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={loading}
                  className="min-h-[44px] shrink-0 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Decoding his piano…" : "Begin"}
                </button>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5 sm:max-w-xs">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  sounding take
                </span>
                <select
                  value={trackId}
                  onChange={(e) => handleTrackChange(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {REAL_TRACKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              tremor — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                the living pulse of the whole planet — every earthquake happening
                right now — conducted one of Karel&apos;s piano takes?
              </p>
              <p>
                <span className="text-foreground">How it works:</span> the
                keyless, CORS-open USGS <em>all_day</em> earthquake GeoJSON feed
                is fetched and refreshed every few minutes. Each quake voices ONE
                transformed fragment of the decoded take. Magnitude sets loudness
                + duration + how much of a phrase swells; depth sets low-pass
                darkness and reverb distance; longitude sets stereo pan; latitude
                chooses the segment of the take and a gentle transpose; recency
                lifts brightness and play priority. Events are metered on a calm
                rolling cadence, never a burst. Nothing is synthesized — every
                sound is his piano.
              </p>
              <p>
                <span className="text-foreground">Reference:</span> data-driven
                audio / auditory display, as gathered at the International
                Conference on Auditory Display (ICAD) and its Data Sonification
                Award (2025/26), and the 2026 turn toward sonifying live,
                real-time feeds.
              </p>
              <p>
                <span className="text-foreground">Palette:</span> cool-luminous —
                indigo, lilac and cyan over ink, dot size reads magnitude, colour
                warms from cyan (small) to lilac (large).
              </p>
              <p>
                <span className="text-foreground">If the feed drops:</span> a
                small bundled set of realistic sample quakes takes over so the
                piece always plays; the status line always says live vs sample.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* immersive exit affordance lives inside the toggle when immersive */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {!immersive && <PrototypeNav slugs={["17616-tremor"]} />}
    </main>
  );
}
