"use client";

/* ── 16496 · Terrafret ───────────────────────────────────────────────────────
 *
 *  ONE QUESTION: What if the living Earth played Karel's piano — every earthquake
 *  on the planet in the last hour becomes a phrase of his real recording?
 *
 *  This is a REAL-WORLD-DATA SONIFICATION piece. A live public feed (USGS, the
 *  U.S. Geological Survey seismic summary) drives WHICH of Karel's recordings
 *  sounds and HOW it is transformed. The music is *about* the planet, not about
 *  music: each quake schedules ONE enveloped slice of a real take — a phrase,
 *  not a grain cloud.
 *
 *  MAPPING
 *    magnitude → loudness + downward transpose (playbackRate) + which register
 *    depth(km) → lowpass cutoff (deep quakes muffled/subterranean; shallow bright)
 *    longitude → stereo pan (-1..+1)
 *    latitude  → offset into the take (which moment of the piano we hear)
 *
 *  OUTPUT is a Canvas2D equirectangular world map. Each quake blooms as an
 *  expanding ring at its lon/lat, sized by magnitude, pulsing in sync with its
 *  audio phrase (brightness driven by the safeMaster analyser). Recent quakes
 *  linger as fading marks so the map slowly draws a picture of the last hour.
 *
 *  PALETTE (canvas art only) is a saturated DUOTONE: deep ocean-blue for small
 *  events → hot magenta for the largest. Chrome uses semantic tokens.
 *
 *  AUDIO is Karel's real decoded recordings only, every voice routed through
 *  safeMaster — nothing reaches the raw output directly. On network failure a
 *  small bundled snapshot keeps the piece audible and demoable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadRealTrackBuffer, REAL_TRACKS } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

type Status = "idle" | "loading" | "running" | "error";

interface Quake {
  id: string;
  lon: number;
  lat: number;
  depth: number; // km
  mag: number;
  place: string;
  time: number; // epoch ms
}

interface Voice {
  gain: GainNode;
  src: AudioBufferSourceNode;
  endT: number; // ctx time this voice finishes
}

interface Bloom {
  lon: number;
  lat: number;
  mag: number;
  born: number; // seconds (raf clock)
  dur: number; // seconds
}

interface Mark {
  lon: number;
  lat: number;
  mag: number;
  born: number; // seconds (raf clock)
}

interface Pending {
  fireAtMs: number;
  q: Quake;
}

// ── USGS live feeds (CORS-open GeoJSON, no key) ───────────────────────────────
const FEED_HOUR =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const FEED_DAY =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

// three real takes preloaded as registers: bright / mid / deep.
const REGISTER_IDS = [
  "734a09ce-84df-4f1f-93c1-11b08d303681", // Snowflake  — bright, small quakes
  "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay  — mid
  "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", // Isolation  — deep, big quakes
];

const MAX_VOICES = 7;
const STAGGER_MS = 420; // spacing between phrases within one arriving batch
const AUDIBLE_BATCH = 16; // cap phrases scheduled per poll (rest are shown only)
const MARK_FADE_S = 3600; // marks fade across ~an hour
const POLL_MS = 60000;

// bundled snapshot — used only when the network is unreachable, so the piece is
// always demoable. Plausible events spanning the globe and a range of magnitudes.
const SNAPSHOT: Omit<Quake, "id" | "time">[] = [
  { lon: -122.8, lat: 38.8, depth: 3, mag: 1.4, place: "N. California" },
  { lon: -155.3, lat: 19.4, depth: 32, mag: 2.6, place: "Island of Hawaii" },
  { lon: 142.4, lat: 38.3, depth: 45, mag: 5.1, place: "off E. coast of Honshu" },
  { lon: -70.7, lat: -33.4, depth: 88, mag: 4.7, place: "near Santiago, Chile" },
  { lon: 26.3, lat: 39.1, depth: 12, mag: 3.3, place: "Aegean Sea" },
  { lon: -178.1, lat: -20.5, depth: 540, mag: 6.2, place: "Fiji region" },
  { lon: 95.9, lat: 3.1, depth: 24, mag: 5.6, place: "off W. coast of Sumatra" },
  { lon: -66.9, lat: 17.9, depth: 9, mag: 3.0, place: "Puerto Rico region" },
  { lon: 69.4, lat: 36.5, depth: 210, mag: 4.9, place: "Hindu Kush, Afghanistan" },
  { lon: -151.5, lat: 61.3, depth: 68, mag: 3.8, place: "Southern Alaska" },
  { lon: 121.7, lat: 24.0, depth: 18, mag: 4.2, place: "Taiwan" },
  { lon: 172.0, lat: -42.6, depth: 15, mag: 2.9, place: "South Island, N.Z." },
];

// ── duotone (canvas art only) ─────────────────────────────────────────────────
// deep ocean-blue (small) → hot magenta (large). magnitude 0..7 → hue 210..322.
function magHue(mag: number): number {
  const t = Math.min(1, Math.max(0, mag / 7));
  return 210 + t * 112;
}
function magColor(mag: number, light: number, alpha: number): string {
  return `hsla(${magHue(mag).toFixed(0)}, 92%, ${light}%, ${alpha})`;
}

const GROUND = "#070a12"; // near-black blue ground (ocean floor)
const GRID = "rgba(90, 120, 200, 0.10)"; // faint graticule
const GRID_EQ = "rgba(120, 150, 230, 0.22)"; // equator / prime meridian

// project lon/lat → canvas px (equirectangular)
function lonToX(lon: number, W: number): number {
  return ((lon + 180) / 360) * W;
}
function latToY(lat: number, H: number): number {
  return ((90 - lat) / 180) * H;
}

// depth(km) → lowpass cutoff. shallow bright, deep muffled/subterranean.
function depthCutoff(depth: number): number {
  const d = Math.min(1, Math.max(0, depth / 550));
  // 5200 Hz at the surface down to ~320 Hz deep, logarithmic feel
  return 320 + (1 - d) * (5200 - 320) * (1 - d * 0.4);
}

export default function Terrafret() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [lastPlace, setLastPlace] = useState("");
  const [hourCount, setHourCount] = useState(0);
  const [intensity, setIntensity] = useState(0.85);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const buffersRef = useRef<{ buffer: AudioBuffer; title: string }[]>([]);
  const voicesRef = useRef<Voice[]>([]);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number>(0);
  const seenRef = useRef<Set<string>>(new Set());
  const marksRef = useRef<Mark[]>([]);
  const bloomsRef = useRef<Bloom[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const runningRef = useRef(false);

  const intensityRef = useRef(intensity);
  useEffect(() => {
    intensityRef.current = intensity;
    masterRef.current?.setGain(intensity);
  }, [intensity]);

  // ── canvas sizing (DPR + resize aware) ──────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }, []);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  // pick a register buffer by magnitude (0=bright, last=deep)
  const pickBuffer = useCallback((mag: number) => {
    const bufs = buffersRef.current;
    if (bufs.length === 0) return null;
    let idx: number;
    if (mag < 2.5) idx = 0;
    else if (mag < 4.5) idx = 1;
    else idx = 2;
    return bufs[Math.min(idx, bufs.length - 1)];
  }, []);

  // schedule ONE enveloped phrase for a quake at ctx time `when`
  const scheduleQuake = useCallback(
    (q: Quake, when: number) => {
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (!ctx || !master) return;
      const picked = pickBuffer(q.mag);
      if (!picked) return;
      const { buffer } = picked;

      // magnitude → gain, transpose (deeper for bigger), phrase length
      const magN = Math.min(1, Math.max(0, q.mag / 7));
      const peak = 0.14 + magN * 0.5;
      const rate = 1.0 - magN * 0.5; // 1.0 (small) .. 0.5 (huge = an octave down)
      const dur = 1.6 + magN * 3.3; // 1.6 .. ~4.9s

      // latitude → offset into the take (which moment of the piano we hear)
      const latN = (90 - q.lat) / 180; // 0..1
      const maxOff = Math.max(0, buffer.duration - 6);
      const offset = latN * maxOff;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = depthCutoff(q.depth);
      filter.Q.value = 0.7;

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.min(1, Math.max(-1, q.lon / 180));

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      src.connect(filter);
      filter.connect(panner);
      panner.connect(gain);
      gain.connect(master.input);

      const attack = 0.12 + magN * 0.25;
      const release = 0.5 + magN * 1.0;
      const g = gain.gain;
      g.setValueAtTime(0.0001, when);
      g.exponentialRampToValueAtTime(peak, when + attack);
      g.setValueAtTime(peak, Math.max(when + attack, when + dur - release));
      g.exponentialRampToValueAtTime(0.0001, when + dur);

      src.start(when, offset);
      src.stop(when + dur + 0.15);

      const voice: Voice = { gain, src, endT: when + dur + 0.15 };
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          panner.disconnect();
          gain.disconnect();
        } catch {
          /* ctx closing */
        }
        voicesRef.current = voicesRef.current.filter((v) => v !== voice);
      };

      // cap concurrent voices: retire the oldest if we're over budget
      const now = ctx.currentTime;
      voicesRef.current = voicesRef.current.filter((v) => v.endT > now);
      if (voicesRef.current.length >= MAX_VOICES) {
        const oldest = voicesRef.current.shift();
        if (oldest) {
          try {
            oldest.gain.gain.cancelScheduledValues(now);
            oldest.gain.gain.setTargetAtTime(0.0001, now, 0.12);
            oldest.src.stop(now + 0.6);
          } catch {
            /* already stopped */
          }
        }
      }
      voicesRef.current.push(voice);
    },
    [pickBuffer],
  );

  // dedupe + schedule a set of quake events, staggered so the field evolves
  const processEvents = useCallback(
    (events: Quake[]) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const fresh = events.filter((q) => !seenRef.current.has(q.id));
      if (fresh.length === 0) return;
      // newest first so, if capped, we sound the most recent events
      fresh.sort((a, b) => b.time - a.time);
      const nowMs = performance.now();
      fresh.forEach((q, i) => {
        seenRef.current.add(q.id);
        if (i < AUDIBLE_BATCH) {
          scheduleQuake(q, ctx.currentTime + i * (STAGGER_MS / 1000));
          pendingRef.current.push({ fireAtMs: nowMs + i * STAGGER_MS, q });
        } else {
          // beyond the audible cap: show it, silently, right away
          const t = performance.now() / 1000;
          marksRef.current.push({ lon: q.lon, lat: q.lat, mag: q.mag, born: t });
        }
      });
      setHourCount(seenRef.current.size);
    },
    [scheduleQuake],
  );

  // parse a USGS FeatureCollection into Quake[]
  const parseFeed = useCallback((json: unknown): Quake[] => {
    const fc = json as {
      features?: {
        id?: string;
        geometry?: { coordinates?: number[] };
        properties?: { mag?: number; place?: string; time?: number };
      }[];
    };
    if (!fc || !Array.isArray(fc.features)) return [];
    const out: Quake[] = [];
    for (const f of fc.features) {
      const c = f.geometry?.coordinates;
      if (!c || c.length < 2) continue;
      out.push({
        id: f.id ?? `${c[0]},${c[1]},${f.properties?.time ?? ""}`,
        lon: c[0],
        lat: c[1],
        depth: typeof c[2] === "number" ? c[2] : 10,
        mag: typeof f.properties?.mag === "number" ? f.properties.mag : 1.0,
        place: f.properties?.place ?? "unknown region",
        time: f.properties?.time ?? Date.now(),
      });
    }
    return out;
  }, []);

  // one poll: try the hour feed, fall to day feed, fall to bundled snapshot
  const runPoll = useCallback(async () => {
    if (!runningRef.current) return;
    try {
      let res = await fetch(FEED_HOUR, { cache: "no-store" });
      let quakes = res.ok ? parseFeed(await res.json()) : [];
      if (quakes.length < 3) {
        res = await fetch(FEED_DAY, { cache: "no-store" });
        if (res.ok) {
          const dayQuakes = parseFeed(await res.json());
          if (dayQuakes.length > quakes.length) quakes = dayQuakes;
        }
      }
      if (quakes.length === 0) throw new Error("empty feed");
      setSnapshotMode(false);
      if (quakes[0]) setLastPlace(quakes[0].place);
      processEvents(quakes);
    } catch {
      // network unreachable / blocked → keep the piece alive on the snapshot
      setSnapshotMode(true);
      const base = Date.now();
      const snap: Quake[] = SNAPSHOT.map((s, i) => ({
        ...s,
        id: `snapshot-${i}`,
        time: base - i * 1000,
      }));
      if (snap[0]) setLastPlace(snap[0].place);
      processEvents(snap);
    }
  }, [parseFeed, processEvents]);

  // ── render loop ─────────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    const master = masterRef.current;
    if (!canvas || !g) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }
    const W = canvas.width;
    const H = canvas.height;
    const now = performance.now() / 1000;

    // analyser → overall level (drives ring brightness in sync with the audio)
    let level = 0;
    if (master) {
      const a = master.analyser;
      const buf = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      level = sum / (buf.length * 255);
    }

    // move pending events into blooms/marks when their audio fires
    const nowMs = performance.now();
    if (pendingRef.current.length) {
      const still: Pending[] = [];
      for (const p of pendingRef.current) {
        if (p.fireAtMs <= nowMs) {
          const magN = Math.min(1, Math.max(0, p.q.mag / 7));
          bloomsRef.current.push({
            lon: p.q.lon,
            lat: p.q.lat,
            mag: p.q.mag,
            born: now,
            dur: 1.6 + magN * 3.3,
          });
          marksRef.current.push({
            lon: p.q.lon,
            lat: p.q.lat,
            mag: p.q.mag,
            born: now,
          });
        } else {
          still.push(p);
        }
      }
      pendingRef.current = still;
    }

    // ── ground ────────────────────────────────────────────────────────────────
    g.fillStyle = GROUND;
    g.fillRect(0, 0, W, H);
    // subtle vertical ocean-depth gradient
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "rgba(20, 40, 90, 0.30)");
    bg.addColorStop(0.5, "rgba(10, 16, 40, 0.10)");
    bg.addColorStop(1, "rgba(40, 10, 55, 0.28)");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    // ── graticule (every 30°) ───────────────────────────────────────────────
    g.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const x = lonToX(lon, W);
      g.strokeStyle = lon === 0 ? GRID_EQ : GRID;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = latToY(lat, H);
      g.strokeStyle = lat === 0 ? GRID_EQ : GRID;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }

    // ── accumulated marks (the picture of the last hour) ──────────────────────
    const marks = marksRef.current;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      const age = now - m.born;
      if (age > MARK_FADE_S) {
        marks.splice(i, 1);
        continue;
      }
      const fade = 1 - age / MARK_FADE_S;
      const x = lonToX(m.lon, W);
      const y = latToY(m.lat, H);
      const r = (1.5 + m.mag * 1.3) * (W / 1400 + 0.6);
      g.fillStyle = magColor(m.mag, 58, 0.10 + fade * 0.35);
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }

    // ── active blooms (expanding rings, pulsing with the phrase) ──────────────
    const blooms = bloomsRef.current;
    for (let i = blooms.length - 1; i >= 0; i--) {
      const b = blooms[i];
      const t = (now - b.born) / b.dur;
      if (t >= 1) {
        blooms.splice(i, 1);
        continue;
      }
      const x = lonToX(b.lon, W);
      const y = latToY(b.lat, H);
      const maxR = (14 + b.mag * 18) * (W / 1400 + 0.55);
      const r = maxR * t;
      const pulse = 0.35 + level * 0.65; // analyser-driven brightness
      const ringA = (1 - t) * (0.35 + b.mag / 14) * pulse;

      // expanding ring
      g.strokeStyle = magColor(b.mag, 62, Math.min(0.9, ringA));
      g.lineWidth = 1.5 + b.mag * 0.5;
      g.beginPath();
      g.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
      g.stroke();

      // soft core glow
      const coreR = maxR * 0.5 * (1 - t) + 2;
      const grad = g.createRadialGradient(x, y, 0, x, y, coreR);
      grad.addColorStop(0, magColor(b.mag, 70, Math.min(0.8, 0.5 * pulse)));
      grad.addColorStop(1, magColor(b.mag, 60, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, coreR, 0, Math.PI * 2);
      g.fill();
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── teardown helper ─────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = 0;
    }
    for (const v of voicesRef.current) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    voicesRef.current = [];
    pendingRef.current = [];
  }, []);

  // ── start (user gesture unlocks + resumes the AudioContext) ──────────────────
  const start = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      let ctx = ctxRef.current;
      if (!ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) throw new Error("no-webaudio");
        ctx = new AC();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      if (!masterRef.current) {
        masterRef.current = createSafeMaster(ctx);
        masterRef.current.setGain(intensityRef.current);
      }

      // preload the register buffers (real takes only)
      if (buffersRef.current.length === 0) {
        const results = await Promise.allSettled(
          REGISTER_IDS.map((id) => loadRealTrackBuffer(ctx!, id)),
        );
        buffersRef.current = results
          .filter(
            (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof loadRealTrackBuffer>>> =>
              r.status === "fulfilled",
          )
          .map((r) => ({ buffer: r.value.buffer, title: r.value.title }));
        if (buffersRef.current.length === 0) throw new Error("no-audio");
      }

      sizeCanvas();
      runningRef.current = true;
      setStatus("running");
      rafRef.current = requestAnimationFrame(runFrame);

      // first poll now, then every 60s
      await runPoll();
      pollRef.current = window.setInterval(runPoll, POLL_MS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg === "no-webaudio"
          ? "This browser has no Web Audio support — the Earth cannot sound here."
          : "Could not load Karel's recordings. The audio failed to load; please try again.",
      );
      setStatus("error");
    }
  }, [runFrame, runPoll, sizeCanvas]);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardown();
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, [teardown]);

  const running = status === "running";
  const titles = REAL_TRACKS.filter((t) => REGISTER_IDS.includes(t.id))
    .map((t) => t.title)
    .join(" · ");

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-5 py-8">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            16496 · data sonification · terrafret
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            The Earth Plays the Piano
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            A live feed of every earthquake on the planet in the last hour, from
            the U.S. Geological Survey. Each quake sounds one phrase of Karel&rsquo;s
            real recording — bigger and deeper for stronger tremors, panned by
            longitude, drawn from a different moment of the take by latitude.
          </p>
        </header>

        {/* the canvas hero */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-black/40">
          <canvas
            ref={canvasRef}
            className="block h-[62vh] max-h-[680px] w-full"
            style={{ maxWidth: "100%" }}
          />

          {status !== "running" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm">
              {status === "error" ? (
                <p className="max-w-sm px-6 text-center text-sm text-destructive">
                  {error}
                </p>
              ) : status === "loading" ? (
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  loading the takes &amp; the feed&hellip;
                </p>
              ) : (
                <p className="max-w-sm px-6 text-center text-sm text-muted-foreground">
                  Press start and the planet begins to play. New quakes arrive
                  every sixty seconds; each becomes a phrase of the piano. Sit
                  with it — the map slowly draws the last hour of the Earth.
                </p>
              )}
              <button
                onClick={start}
                disabled={status === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {status === "error" ? "Try again" : "Listen to the Earth"}
              </button>
            </div>
          )}

          {running && (
            <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-0.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {hourCount} events heard
              </span>
              {lastPlace && (
                <span className="max-w-[70vw] truncate font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  latest · {lastPlace}
                </span>
              )}
            </div>
          )}
        </div>

        {snapshotMode && running && (
          <p className="text-sm text-muted-foreground">
            The live USGS feed is unreachable here — playing a small bundled
            snapshot of the globe so the piece stays audible.
          </p>
        )}

        {/* controls */}
        <section className="flex flex-col gap-4">
          <label className="flex max-w-md flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              intensity — {(intensity * 100).toFixed(0)}% (overall loudness)
            </span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.01}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="accent-primary"
            />
          </label>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            registers · {titles || "Snowflake · Interplay · Isolation"}
          </p>
        </section>
      </div>

      {/* design-notes corner affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-4 right-4 min-h-[44px] rounded-md border border-border bg-background/80 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight">
              Terrafret — the Earth plays the piano
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong>The one question:</strong> what if the living Earth played
                Karel&rsquo;s piano — every earthquake on the planet in the last
                hour becoming a phrase of his real recording?
              </p>
              <p>
                This is data sonification: a live public data stream, not a
                composer, decides what you hear. The feed is the U.S. Geological
                Survey&rsquo;s seismic summary (all events, last hour), polled
                every sixty seconds. Each new quake schedules exactly one
                enveloped slice of one of Karel&rsquo;s real takes — a phrase, not
                a cloud of grains.
              </p>
              <p>
                <strong>Mapping.</strong> Magnitude sets loudness, chooses the
                register (Snowflake for small tremors, Isolation for the great
                ones) and transposes the phrase downward — the biggest quakes drop
                nearly an octave. Depth closes a lowpass filter, so deep events
                sound subterranean and shallow ones ring bright. Longitude pans
                left-to-right; latitude chooses which moment of the take we hear.
              </p>
              <p>
                <strong>The map.</strong> An equirectangular projection of the
                globe. Every quake blooms as an expanding ring at its true
                coordinates, sized by magnitude and pulsing in time with its
                phrase; the brightness is driven by the live audio analyser. Old
                events linger as fading marks, so the map gradually draws a
                portrait of the planet&rsquo;s last hour. The duotone runs from
                deep ocean-blue for the smallest events to hot magenta for the
                largest.
              </p>
              <p>
                It descends from the audification tradition described in
                Eos.org&rsquo;s &ldquo;Earth Is Noisy. Why Should Its Data Be
                Silent?&rdquo; — the long practice of turning seismographs and
                geophysical records into sound so the ear can find what the eye
                misses. Here the instrument is a real piano.
              </p>
              <p>
                If the network is blocked, a small bundled snapshot of the globe
                keeps it audible; a note appears when that fallback is active. All
                sound is Karel&rsquo;s real recordings, routed through the shared
                ear-safety master — nothing is synthesized.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pb-6">
        <Link
          href="/dream"
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← back to the index
        </Link>
      </div>
    </main>
  );
}
