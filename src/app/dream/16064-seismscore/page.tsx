"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16064-seismscore — the planet's live seismic pulse plays Karel's piano.
//
//   The public, keyless USGS earthquake GeoJSON feed is polled every ~60s. Every
//   genuinely-NEW quake sounds ONE grain sliced from a decoded real piano take:
//   magnitude sets the grain's length + gain, depth sets its pitch, longitude
//   sets its stereo pan, and longitude also chooses where in the recording the
//   grain is cut from. The Earth conducts; Karel's recording is the sounding
//   body. Nothing here is synthesized — every sound is his piano.
//
//   If the USGS feed is blocked or fails, a seeded synthetic seismic stream
//   takes over so the instrument keeps playing — but the audio is STILL only his
//   recording, grain by grain.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeGlobe, type GlobeHandle } from "./globe";

type FeedWindow = "all_hour" | "all_day" | "2.5_day" | "4.5_day";

const FEED_WINDOWS: { id: FeedWindow; label: string }[] = [
  { id: "all_hour", label: "past hour" },
  { id: "all_day", label: "past day" },
  { id: "2.5_day", label: "M2.5+ · day" },
  { id: "4.5_day", label: "M4.5+ · day" },
];

const POLL_MS = 60_000;
const MAX_GRAINS = 24;
const SYNTH_SEED = 0x16064;

interface QuakeEvent {
  id: string;
  mag: number;
  place: string;
  time: number;
  lon: number;
  lat: number;
  depth: number;
}

interface ActiveGrain {
  src: AudioBufferSourceNode;
  gain: GainNode;
  endsAt: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function SeismscorePage() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackId, setTrackId] = useState(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState(REAL_TRACKS[0].title);
  const [feedWindow, setFeedWindow] = useState<FeedWindow>("all_hour");
  const [magFloor, setMagFloor] = useState(0);
  const [feedMode, setFeedMode] = useState<"usgs" | "synthetic">("usgs");
  const [glError, setGlError] = useState(false);
  const [lastQuake, setLastQuake] = useState<QuakeEvent | null>(null);
  const [quakeCount, setQuakeCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const rafRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const grainsRef = useRef<ActiveGrain[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const synthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seedNextRef = useRef(true);
  const magFloorRef = useRef(0);
  const maxMagRef = useRef(0);
  const reducedRef = useRef(false);
  const startedRef = useRef(false);

  // keep magFloor readable inside long-lived callbacks
  useEffect(() => {
    magFloorRef.current = magFloor;
  }, [magFloor]);

  // ── one grain per quake ───────────────────────────────────────────────────
  const soundQuake = useCallback((q: QuakeEvent) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !master || !buffer) return;

    const mag = Math.max(0, Math.min(7, q.mag));
    const magN = mag / 7;
    const len = 0.15 + magN * 1.05; // 0.15 .. 1.2 s
    const peak = 0.1 + magN * 0.6; // grain gain (safeMaster still limits)

    // depth → pitch: shallow bright (~1.3), deep low (~0.6)
    const depthN = Math.max(0, Math.min(600, q.depth)) / 600;
    const rate = 1.3 - depthN * 0.7;

    // longitude → pan and → slice offset in his recording
    const pan = Math.max(-1, Math.min(1, q.lon / 180));
    const lonN = (q.lon + 180) / 360;
    const maxOffset = Math.max(0.01, buffer.duration - len - 0.05);
    const jitter = (Math.random() - 0.5) * 0.06 * buffer.duration;
    let offset = lonN * maxOffset + jitter;
    offset = Math.max(0, Math.min(maxOffset, offset));

    // cap concurrency — steal oldest
    if (grainsRef.current.length >= MAX_GRAINS) {
      const victim = grainsRef.current.shift();
      try {
        victim?.src.stop();
      } catch {
        /* already stopped */
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const gain = ctx.createGain();
    const pan_ = ctx.createStereoPanner();
    pan_.pan.value = pan;

    const t0 = ctx.currentTime;
    // Hann-ish window: quick attack, smooth decay
    const attack = Math.min(len * 0.35, 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.linearRampToValueAtTime(0.0001, t0 + len);

    src.connect(gain).connect(pan_).connect(master.input);
    src.start(t0, offset, len + 0.05);

    const entry: ActiveGrain = { src, gain, endsAt: t0 + len };
    grainsRef.current.push(entry);
    src.onended = () => {
      grainsRef.current = grainsRef.current.filter((g) => g !== entry);
      try {
        gain.disconnect();
        pan_.disconnect();
      } catch {
        /* noop */
      }
    };

    // visual ring — red reserved for the largest / most-recent
    if (mag > maxMagRef.current) maxMagRef.current = mag;
    const red = mag >= 5.0 || mag >= maxMagRef.current - 0.2;
    globeRef.current?.spawnRing(q.lon, q.lat, mag, red);

    setLastQuake(q);
    setQuakeCount((c) => c + 1);
  }, []);

  // ── USGS parsing ───────────────────────────────────────────────────────────
  const parseFeed = useCallback((json: unknown): QuakeEvent[] => {
    const out: QuakeEvent[] = [];
    const feats =
      (json as { features?: unknown[] } | null)?.features ?? ([] as unknown[]);
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
        mag: typeof feat.properties?.mag === "number" ? feat.properties.mag : 0,
        place: feat.properties?.place ?? "unknown region",
        time: feat.properties?.time ?? Date.now(),
        lon: coords[0] ?? 0,
        lat: coords[1] ?? 0,
        depth: coords[2] ?? 10,
      });
    }
    return out;
  }, []);

  // stagger a batch of new quakes so they never burst
  const runBatch = useCallback(
    (batch: QuakeEvent[]) => {
      batch.sort((a, b) => a.time - b.time);
      batch.forEach((q, i) => {
        setTimeout(() => {
          if (startedRef.current) soundQuake(q);
        }, i * 130);
      });
    },
    [soundQuake],
  );

  const startSynthetic = useCallback(() => {
    setFeedMode("synthetic");
    const rand = mulberry32(SYNTH_SEED + seenRef.current.size);
    let n = 0;
    const tick = () => {
      // plausible mag distribution (mostly small), depth, position
      const u = rand();
      const mag = Math.min(7, Math.max(0.4, -Math.log(1 - u * 0.995) * 1.6));
      const depth = Math.pow(rand(), 2) * 500 + 3;
      const lon = rand() * 360 - 180;
      const lat = Math.asin(rand() * 2 - 1) * (180 / Math.PI);
      const q: QuakeEvent = {
        id: `synthetic-${n++}`,
        mag,
        place: "synthetic seismic stream",
        time: Date.now(),
        lon,
        lat,
        depth,
      };
      if (q.mag >= magFloorRef.current) soundQuake(q);
      const wait = 1800 + rand() * 7000;
      synthTimerRef.current = setTimeout(tick, wait);
    };
    // seed a few immediately, then continue
    tick();
  }, [soundQuake]);

  const fetchFeed = useCallback(async () => {
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feedWindow}.geojson`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const events = parseFeed(json);
      setFeedMode("usgs");

      if (seedNextRef.current) {
        // seed: remember everything, sound only the 3 most-recent
        for (const e of events) seenRef.current.add(e.id);
        const recent = [...events]
          .sort((a, b) => b.time - a.time)
          .filter((e) => e.mag >= magFloorRef.current)
          .slice(0, 3);
        seedNextRef.current = false;
        runBatch(recent);
      } else {
        const fresh = events.filter(
          (e) => !seenRef.current.has(e.id) && e.mag >= magFloorRef.current,
        );
        for (const e of events) seenRef.current.add(e.id);
        runBatch(fresh);
      }
      pollTimerRef.current = setTimeout(fetchFeed, POLL_MS);
    } catch {
      // feed blocked / offline → keep the instrument alive with synthetic data
      if (!synthTimerRef.current) startSynthetic();
    }
  }, [feedWindow, parseFeed, runBatch, startSynthetic]);

  // ── WebGL globe: render immediately, before any audio ───────────────────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setGlError(true);
      return;
    }

    let globe: GlobeHandle;
    try {
      globe = makeGlobe(gl);
    } catch {
      setGlError(true);
      return;
    }
    globeRef.current = globe;

    const applySize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      globe.resize(rect.width, rect.height, dpr);
    };
    applySize();
    window.addEventListener("resize", applySize);

    const loop = (now: number) => {
      const analyser = masterRef.current?.analyser;
      let time: Uint8Array | null = null;
      if (analyser) {
        if (
          !analyserDataRef.current ||
          analyserDataRef.current.length !== analyser.fftSize
        ) {
          analyserDataRef.current = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(analyserDataRef.current);
        time = analyserDataRef.current;
      }
      globe.render(now, !reducedRef.current, time);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applySize);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (synthTimerRef.current) clearTimeout(synthTimerRef.current);
      for (const g of grainsRef.current) {
        try {
          g.src.stop();
        } catch {
          /* noop */
        }
      }
      grainsRef.current = [];
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
      globe.dispose();
      globeRef.current = null;
    };
  }, []);

  // ── primary action: start audio + sonification ──────────────────────────────
  const handleStart = useCallback(async () => {
    if (startedRef.current || loading) return;
    setLoading(true);
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();
      const master = createSafeMaster(ctx);
      const { buffer, title } = await loadRealTrackBuffer(ctx, trackId);
      ctxRef.current = ctx;
      masterRef.current = master;
      bufferRef.current = buffer;
      setTrackTitle(title);
      startedRef.current = true;
      setStarted(true);
      setLoading(false);
      seedNextRef.current = true;
      fetchFeed();
    } catch {
      // audio failed to decode — reset so the user can retry
      setLoading(false);
      startedRef.current = false;
      setStarted(false);
    }
  }, [loading, trackId, fetchFeed]);

  // ── change the grain-source recording while running ─────────────────────────
  const handleTrackChange = useCallback(
    async (id: string) => {
      setTrackId(id);
      const ctx = ctxRef.current;
      if (!ctx || !startedRef.current) {
        const t = REAL_TRACKS.find((r) => r.id === id);
        if (t) setTrackTitle(t.title);
        return;
      }
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        bufferRef.current = buffer;
        setTrackTitle(title);
      } catch {
        /* keep the current buffer if the new one fails */
      }
    },
    [],
  );

  // ── change feed window while running: re-seed silently ──────────────────────
  const handleFeedChange = useCallback(
    (id: FeedWindow) => {
      setFeedWindow(id);
      if (!startedRef.current) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (synthTimerRef.current) {
        clearTimeout(synthTimerRef.current);
        synthTimerRef.current = null;
      }
      seenRef.current = new Set();
      seedNextRef.current = true;
      // fetchFeed closes over feedWindow; defer so state is applied first
      setTimeout(() => {
        if (startedRef.current) fetchFeedRef.current?.();
      }, 0);
    },
    [],
  );

  // keep a live ref to fetchFeed so the feed-change handler uses the latest url
  const fetchFeedRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    fetchFeedRef.current = fetchFeed;
  }, [fetchFeed]);

  const magStr = lastQuake ? `M${lastQuake.mag.toFixed(1)}` : "—";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* WebGL canvas fills the viewport */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Rotating globe with live earthquake epicenters"
      />

      {glError && (
        <div className="absolute inset-x-0 top-24 z-20 flex justify-center px-4">
          <p className="max-w-md rounded-md border border-border bg-background/80 px-4 py-3 text-center text-base text-destructive backdrop-blur-sm">
            WebGL2 is unavailable in this browser — the globe cannot render, but
            the sonification still plays Karel&apos;s recording.
          </p>
        </div>
      )}

      {/* header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5 sm:p-7">
        <div className="pointer-events-auto max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16064 · seismscore
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            The Earth plays his piano
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Every live earthquake sounds one grain sliced from Karel&apos;s real
            recording. The planet conducts; his take is the sounding body.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* live readout */}
      {started && (
        <div className="pointer-events-none absolute left-5 top-40 z-10 sm:left-7 sm:top-44">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {feedMode === "usgs" ? "USGS live feed" : "synthetic stream"}
          </p>
          <p className="mt-1 font-mono text-3xl tabular-nums text-foreground">
            {magStr}
          </p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            {lastQuake?.place ?? "listening for the next event…"}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {quakeCount} grains sounded · source: {trackTitle}
          </p>
          {feedMode === "synthetic" && (
            <p className="mt-2 max-w-xs text-sm text-destructive">
              USGS feed unavailable — synthetic seismic stream (audio is still
              Karel&apos;s recording).
            </p>
          )}
        </div>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 pb-16 sm:p-7 sm:pb-16">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md sm:p-5">
          {!started ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-muted-foreground">
                Press play to open the audio engine, decode his recording, and
                begin listening to the planet.
              </p>
              <button
                type="button"
                onClick={handleStart}
                disabled={loading}
                className="min-h-[44px] shrink-0 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Decoding his piano…" : "Begin the seismscore"}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* track selector */}
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  grain source
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

              {/* feed window */}
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  feed window
                </span>
                <select
                  value={feedWindow}
                  onChange={(e) =>
                    handleFeedChange(e.target.value as FeedWindow)
                  }
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  {FEED_WINDOWS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* magnitude floor */}
              <label className="flex flex-col gap-1.5">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  magnitude floor · {magFloor.toFixed(1)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  value={magFloor}
                  onChange={(e) => setMagFloor(parseFloat(e.target.value))}
                  className="min-h-[44px] accent-primary"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* design-notes modal */}
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
              seismscore — design notes
            </h2>
            <div className="mt-4 space-y-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                the planet&apos;s live seismic pulse played Karel&apos;s piano —
                every real earthquake happening right now sounding one grain of
                his recording?
              </p>
              <p>
                <span className="text-foreground">How it works:</span> the
                keyless, CORS-open USGS earthquake GeoJSON feed is polled every
                60s. Each genuinely-new quake triggers ONE grain from a decoded
                real take — magnitude → length + gain, depth → pitch, longitude →
                stereo pan and slice offset. Every sound is his piano; nothing is
                synthesized.
              </p>
              <p>
                <span className="text-foreground">Reference:</span> Alexandre
                Estrela&apos;s <em>RedSkyFalls</em> (Portuguese Pavilion, 2026
                Venice Biennale) turns a real-time global seismic feed into a
                live image-and-sound operating system. This is a browser-scale
                kin, with Karel&apos;s recording as the sounding body — and it
                joins the seismic-sonification tradition of Ben Holtzman&apos;s
                SeismoDome.
              </p>
              <p>
                <span className="text-foreground">Palette:</span> Ikeda black,
                bone-white, and blood-red — red reserved for the largest and
                most-recent quakes and for the seismogram&apos;s peaks.
              </p>
              <p>
                <span className="text-foreground">If the feed drops:</span> a
                seeded synthetic seismic stream keeps the instrument playing, but
                the audio is always his real recording.
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

      <PrototypeNav slugs={["16064-seismscore"]} />
    </main>
  );
}
