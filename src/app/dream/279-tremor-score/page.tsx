"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// 279 — Tremor Score
// A live, non-looping composition driven by the planet's real seismic activity.
// Data: USGS real-time earthquake GeoJSON feeds. Pure Web Audio + Canvas2D.
// Non-luminous, ink-on-paper seismograph aesthetic (no glow, no WebGL).
// ---------------------------------------------------------------------------

interface Quake {
  id: string;
  mag: number;
  place: string;
  time: number; // ms epoch
  lon: number;
  lat: number;
  depth: number; // km
}

type FeedMode = "all_day" | "all_hour";
type PlayMode = "live" | "replay";

const FEED_URL: Record<FeedMode, string> = {
  all_day:
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  all_hour:
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
};

const POLL_MS = 60_000;
const REPLAY_DURATION_MS = 90_000; // compress 24h into 90s

// A non-pentatonic, just-intonation overtone palette (ratios over a low root).
// Banned this cycle: C-major pentatonic. This is a Pythagorean / overtone set.
const ROOT_HZ = 55; // A1
const JI_RATIOS = [
  1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2,
  9 / 4, 5 / 2, 8 / 3, 3, 10 / 3, 15 / 4, 4,
];

// ---------------------------------------------------------------------------
// Bundled fallback set — ~30 plausible recent quakes spanning the globe.
// Used when the live fetch is blocked/offline so the piece is fully demoable.
// ---------------------------------------------------------------------------
function makeFallbackQuakes(): Quake[] {
  const now = Date.now();
  const raw: Array<[number, string, number, number, number, number]> = [
    // mag, place, minutesAgo, lon, lat, depth
    [4.2, "off the coast of Honshu, Japan", 3, 142.1, 38.4, 35],
    [1.4, "32km E of Anchorage, Alaska", 7, -149.2, 61.2, 28],
    [6.1, "Vanuatu region", 12, 167.8, -16.3, 124],
    [2.3, "Central California", 16, -120.6, 36.1, 8],
    [5.4, "near the coast of Chile", 21, -71.4, -23.7, 56],
    [3.1, "Aegean Sea", 27, 25.4, 36.8, 12],
    [7.2, "Mindanao, Philippines", 33, 126.4, 6.8, 18],
    [1.1, "10km NW of Reno, Nevada", 38, -119.9, 39.6, 6],
    [4.8, "Kuril Islands", 44, 151.2, 46.1, 88],
    [2.7, "Iceland Reykjanes Ridge", 51, -22.4, 63.9, 9],
    [5.9, "Tonga", 58, -174.2, -20.6, 210],
    [3.6, "Sumatra, Indonesia", 66, 99.8, 1.2, 41],
    [1.8, "Yellowstone, Wyoming", 73, -110.6, 44.5, 5],
    [6.6, "Fiji region", 81, 178.3, -18.9, 540],
    [2.1, "Puerto Rico region", 89, -66.7, 18.1, 14],
    [4.0, "Crete, Greece", 97, 26.1, 35.0, 33],
    [5.1, "Aleutian Islands, Alaska", 106, -178.4, 51.6, 47],
    [3.3, "Baja California, Mexico", 115, -115.4, 32.1, 11],
    [1.6, "Mount St. Helens, Washington", 124, -122.2, 46.2, 4],
    [6.9, "South of Java, Indonesia", 134, 108.9, -10.2, 62],
    [2.9, "Hindu Kush, Afghanistan", 145, 70.6, 36.4, 195],
    [4.5, "Banda Sea", 157, 126.9, -6.4, 478],
    [1.3, "8km SE of Hollister, California", 169, -121.3, 36.8, 7],
    [5.6, "near the east coast of Honshu", 182, 141.6, 37.2, 44],
    [3.8, "Dodecanese Islands, Greece", 196, 27.3, 36.5, 21],
    [2.4, "Northern Italy", 211, 11.4, 44.6, 16],
    [6.3, "Solomon Islands", 227, 160.1, -9.6, 102],
    [1.9, "Long Valley Caldera, California", 244, -118.9, 37.6, 6],
    [4.7, "Drake Passage", 262, -58.2, -58.4, 10],
    [3.0, "Taiwan region", 281, 121.5, 23.7, 29],
    [5.3, "Macquarie Island region", 301, 161.4, -56.7, 8],
  ];
  return raw.map((r, i) => ({
    id: `fallback-${i}`,
    mag: r[0],
    place: r[1],
    time: now - r[2] * 60_000,
    lon: r[3],
    lat: r[4],
    depth: r[5],
  }));
}

// ---------------------------------------------------------------------------
// Parse USGS GeoJSON -> Quake[]
// ---------------------------------------------------------------------------
function parseFeed(json: unknown): Quake[] {
  const out: Quake[] = [];
  if (
    !json ||
    typeof json !== "object" ||
    !Array.isArray((json as { features?: unknown }).features)
  ) {
    return out;
  }
  const features = (json as { features: unknown[] }).features;
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const feat = f as {
      id?: string;
      properties?: { mag?: number; place?: string; time?: number };
      geometry?: { coordinates?: number[] };
    };
    const coords = feat.geometry?.coordinates;
    if (!coords || coords.length < 3) continue;
    const mag = feat.properties?.mag;
    if (typeof mag !== "number" || !isFinite(mag)) continue;
    out.push({
      id: feat.id ?? `${coords[0]},${coords[1]},${feat.properties?.time}`,
      mag,
      place: feat.properties?.place ?? "unknown region",
      time: feat.properties?.time ?? Date.now(),
      lon: coords[0],
      lat: coords[1],
      depth: Math.max(0, coords[2]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Map depth (km) -> pitch index in the JI palette.
// Shallow = high/bright, deep = low/dark. 0..700km -> high..low.
// ---------------------------------------------------------------------------
function depthToFreq(depth: number): number {
  const t = Math.min(1, depth / 650); // 0 shallow .. 1 deep
  const idx = Math.round((1 - t) * (JI_RATIOS.length - 1));
  return ROOT_HZ * JI_RATIOS[idx];
}

function lonToPan(lon: number): number {
  return Math.max(-1, Math.min(1, lon / 180));
}

// ---------------------------------------------------------------------------
// Audio engine
// ---------------------------------------------------------------------------
interface Engine {
  ctx: AudioContext;
  master: GainNode;
  droneGain: GainNode;
  stopDrone: () => void;
}

function makeEngine(): Engine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Always-on calm ambient drone: two low detuned sines + a slow LFO swell.
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  lp.connect(droneGain);

  const oscs: OscillatorNode[] = [];
  [ROOT_HZ, ROOT_HZ * 1.5, ROOT_HZ * 0.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f * (1 + (i - 1) * 0.004);
    const g = ctx.createGain();
    g.gain.value = i === 2 ? 0.5 : 0.32;
    o.connect(g);
    g.connect(lp);
    o.start();
    oscs.push(o);
  });

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.025;
  lfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);
  lfo.start();

  // fade drone in
  droneGain.gain.setValueAtTime(0.0, ctx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 4);

  const stopDrone = () => {
    try {
      oscs.forEach((o) => o.stop());
      lfo.stop();
    } catch {
      /* already stopped */
    }
  };

  return { ctx, master, droneGain, stopDrone };
}

// Schedule a single quake as a sound event at audio time `when`.
function scheduleQuake(eng: Engine, q: Quake, when: number) {
  const ctx = eng.ctx;
  const mag = Math.max(0.3, q.mag);
  // magnitude -> loudness, duration
  const peak = Math.min(0.55, 0.06 + mag * 0.07);
  const dur = Math.min(8, 0.35 + mag * 0.9);
  const freq = depthToFreq(q.depth);

  const pan = ctx.createStereoPanner();
  pan.pan.value = lonToPan(q.lon);
  pan.connect(eng.master);

  // latitude -> brightness of the tone (filter cutoff). Higher lat = brighter.
  const latBright = 600 + Math.abs(q.lat) * 28;

  // Tonal voice (pluck/swell)
  const osc = ctx.createOscillator();
  osc.type = mag > 5 ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(freq, when);
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  // deep quakes are muffled; combine depth + latitude brightness
  const depthMuffle = 1 - Math.min(1, q.depth / 650);
  toneFilter.frequency.setValueAtTime(
    400 + latBright * (0.4 + depthMuffle * 0.9),
    when,
  );
  toneFilter.Q.value = 1.2;
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, when);
  toneGain.gain.exponentialRampToValueAtTime(peak, when + 0.02 + mag * 0.01);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(toneFilter);
  toneFilter.connect(toneGain);
  toneGain.connect(pan);
  osc.start(when);
  osc.stop(when + dur + 0.05);

  // Low sub-rumble swell, scaled hard by magnitude (big quakes only).
  if (mag >= 2.2) {
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(freq * 0.5, when);
    const subGain = ctx.createGain();
    const subPeak = Math.min(0.45, (mag - 2) * 0.08);
    subGain.gain.setValueAtTime(0.0001, when);
    subGain.gain.linearRampToValueAtTime(subPeak, when + dur * 0.4);
    subGain.gain.exponentialRampToValueAtTime(0.0001, when + dur * 1.3);
    sub.connect(subGain);
    subGain.connect(pan);
    sub.start(when);
    sub.stop(when + dur * 1.35);

    // Filtered noise rumble for the largest events.
    if (mag >= 4) {
      const noiseDur = dur * 1.2;
      const buf = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * noiseDur),
        ctx.sampleRate,
      );
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const nFilter = ctx.createBiquadFilter();
      nFilter.type = "lowpass";
      nFilter.frequency.value = 90 + (mag - 4) * 18;
      nFilter.Q.value = 0.7;
      const nGain = ctx.createGain();
      const nPeak = Math.min(0.3, (mag - 3.5) * 0.05);
      nGain.gain.setValueAtTime(0.0001, when);
      nGain.gain.linearRampToValueAtTime(nPeak, when + noiseDur * 0.5);
      nGain.gain.exponentialRampToValueAtTime(0.0001, when + noiseDur);
      noise.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(pan);
      noise.start(when);
      noise.stop(when + noiseDur + 0.05);
    }
  }
}

// ---------------------------------------------------------------------------
// Visual marks
// ---------------------------------------------------------------------------
interface Mark {
  x: number;
  y: number;
  mag: number;
  age: number; // seconds since fired
  ringMax: number;
}

const INK = "rgba(232, 228, 216, "; // bone-white ink
const FAINT = "rgba(150, 150, 158, "; // graphite grid
const ACCENT = "rgba(196, 154, 108, "; // one muted amber accent

export default function TremorScore() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [feedMode, setFeedMode] = useState<FeedMode>("all_day");
  const [playMode, setPlayMode] = useState<PlayMode>("live");
  const [muted, setMuted] = useState(false);

  // status (display)
  const [count, setCount] = useState(0);
  const [maxMag, setMaxMag] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string>("—");
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mutable engine/loop refs (read inside rAF + intervals)
  const engineRef = useRef<Engine | null>(null);
  const marksRef = useRef<Mark[]>([]);
  const seismoRef = useRef<number[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const lastSeenTimeRef = useRef<number>(0);
  const mutedRef = useRef(false);
  const feedModeRef = useRef<FeedMode>("all_day");
  const playModeRef = useRef<PlayMode>("live");

  useEffect(() => {
    mutedRef.current = muted;
    if (engineRef.current) {
      engineRef.current.master.gain.setTargetAtTime(
        muted ? 0 : 0.9,
        engineRef.current.ctx.currentTime,
        0.05,
      );
    }
  }, [muted]);
  useEffect(() => {
    feedModeRef.current = feedMode;
  }, [feedMode]);
  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  // project lon/lat to canvas (equirectangular)
  function project(lon: number, lat: number, w: number, mapH: number) {
    const x = ((lon + 180) / 360) * w;
    const y = ((90 - lat) / 180) * mapH;
    return { x, y };
  }

  function fireMark(eng: Engine | null, q: Quake, w: number, mapH: number) {
    const { x, y } = project(q.lon, q.lat, w, mapH);
    marksRef.current.push({
      x,
      y,
      mag: q.mag,
      age: 0,
      ringMax: 8 + q.mag * 10,
    });
    if (marksRef.current.length > 600) marksRef.current.shift();
    // jolt the seismograph ribbon
    seismoRef.current.push(Math.min(1, q.mag / 7));
    if (eng && !mutedRef.current) {
      scheduleQuake(eng, q, eng.ctx.currentTime + 0.02);
    }
  }

  // The whole engine + canvas + polling lives in ONE effect with cleanup.
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const eng = makeEngine();
    engineRef.current = eng;
    eng.master.gain.value = mutedRef.current ? 0 : 0.9;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let raf = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let replayTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function sizeCanvas() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas!.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx2d!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);

    // seed the seismograph ribbon flat
    seismoRef.current = new Array(400).fill(0);

    function updateStatus(qs: Quake[]) {
      setCount(qs.length);
      let mx = 0;
      for (const q of qs) mx = Math.max(mx, q.mag);
      setMaxMag((prev: number) => Math.max(prev, mx));
      setLastUpdate(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    }

    // ---- LIVE polling ----
    async function poll(initial: boolean) {
      if (disposed) return;
      try {
        const res = await fetch(FEED_URL[feedModeRef.current], {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const quakes = parseFeed(json);
        if (quakes.length === 0) throw new Error("empty feed");
        setUsingFallback(false);
        setError(null);

        const rect = canvas!.getBoundingClientRect();
        const mapH = rect.height - 90;

        if (initial) {
          // draw all existing quakes quietly (no sound storm), mark seen.
          const sorted = [...quakes].sort((a, b) => a.time - b.time);
          for (const q of sorted) {
            seenIdsRef.current.add(q.id);
            lastSeenTimeRef.current = Math.max(
              lastSeenTimeRef.current,
              q.time,
            );
            const { x, y } = project(q.lon, q.lat, rect.width, mapH);
            marksRef.current.push({
              x,
              y,
              mag: q.mag,
              age: 3 + Math.random() * 2,
              ringMax: 8 + q.mag * 10,
            });
          }
          updateStatus(quakes);
        } else {
          // only sound the genuinely-new ones
          const fresh = quakes
            .filter(
              (q) =>
                !seenIdsRef.current.has(q.id) &&
                q.time > lastSeenTimeRef.current - 1,
            )
            .sort((a, b) => a.time - b.time);
          let i = 0;
          for (const q of fresh) {
            seenIdsRef.current.add(q.id);
            lastSeenTimeRef.current = Math.max(
              lastSeenTimeRef.current,
              q.time,
            );
            // stagger arrivals slightly so a batch isn't one slam
            setTimeout(
              () => fireMark(eng, q, rect.width, mapH),
              i * 220,
            );
            i++;
          }
          // count reflects the full feed total; maxMag tracks largest seen
          updateStatus(quakes);
        }
      } catch (e) {
        if (initial) {
          // fall back to the bundled set
          runFallback();
        }
        setError(
          e instanceof Error ? e.message : "feed unavailable",
        );
      }
    }

    // ---- Fallback playback (no network) ----
    function runFallback() {
      setUsingFallback(true);
      const quakes = makeFallbackQuakes().sort((a, b) => a.time - b.time);
      setCount(quakes.length);
      let mx = 0;
      for (const q of quakes) mx = Math.max(mx, q.mag);
      setMaxMag(mx);
      setLastUpdate("cached set");
      const rect = canvas!.getBoundingClientRect();
      const mapH = rect.height - 90;
      // play them on a gentle loop timer (~ every 2.4s, then repeat)
      let idx = 0;
      const tick = () => {
        if (disposed) return;
        const q = quakes[idx % quakes.length];
        // give it a fresh id each loop so it re-sounds
        fireMark(eng, { ...q, id: `${q.id}-${idx}` }, rect.width, mapH);
        idx++;
        replayTimer = setTimeout(tick, 1800 + Math.random() * 1600);
      };
      tick();
    }

    // ---- Replay: compress 24h into REPLAY_DURATION_MS, one-shot ----
    function runReplay() {
      const finish = (quakes: Quake[]) => {
        if (quakes.length === 0) {
          runFallback();
          return;
        }
        const sorted = [...quakes].sort((a, b) => a.time - b.time);
        const t0 = sorted[0].time;
        const t1 = sorted[sorted.length - 1].time;
        const span = Math.max(1, t1 - t0);
        const rect = canvas!.getBoundingClientRect();
        const mapH = rect.height - 90;
        setCount(sorted.length);
        let mx = 0;
        for (const q of sorted) mx = Math.max(mx, q.mag);
        setMaxMag(mx);
        for (const q of sorted) {
          const frac = (q.time - t0) / span;
          const delay = frac * REPLAY_DURATION_MS;
          setTimeout(() => {
            if (!disposed) fireMark(eng, q, rect.width, mapH);
          }, delay);
        }
        setLastUpdate("replay 24h → 90s");
      };
      fetch(FEED_URL[feedModeRef.current], { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((j) => {
          const qs = parseFeed(j);
          if (qs.length === 0) throw new Error("empty");
          setUsingFallback(false);
          setError(null);
          finish(qs);
        })
        .catch((e) => {
          setUsingFallback(true);
          setError(e instanceof Error ? e.message : "feed unavailable");
          finish(makeFallbackQuakes());
        });
    }

    // start according to mode
    if (playModeRef.current === "replay") {
      runReplay();
    } else {
      poll(true);
      pollTimer = setInterval(() => poll(false), POLL_MS);
    }

    // ---- render loop ----
    let prevT = performance.now();
    function draw(now: number) {
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;
      const rect = canvas!.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const mapH = h - 90;

      // near-black paper
      ctx2d!.fillStyle = "#0a0a0c";
      ctx2d!.fillRect(0, 0, w, h);

      // --- graticule (graphite lat/long grid) ---
      ctx2d!.lineWidth = 1;
      ctx2d!.strokeStyle = FAINT + "0.10)";
      ctx2d!.beginPath();
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = ((lon + 180) / 360) * w;
        ctx2d!.moveTo(x, 0);
        ctx2d!.lineTo(x, mapH);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = ((90 - lat) / 180) * mapH;
        ctx2d!.moveTo(0, y);
        ctx2d!.lineTo(w, y);
      }
      ctx2d!.stroke();
      // equator + prime meridian a touch stronger
      ctx2d!.strokeStyle = FAINT + "0.18)";
      ctx2d!.beginPath();
      ctx2d!.moveTo(0, mapH / 2);
      ctx2d!.lineTo(w, mapH / 2);
      ctx2d!.moveTo(w / 2, 0);
      ctx2d!.lineTo(w / 2, mapH);
      ctx2d!.stroke();

      // map frame
      ctx2d!.strokeStyle = FAINT + "0.22)";
      ctx2d!.strokeRect(0.5, 0.5, w - 1, mapH - 1);

      // --- quake marks ---
      for (const m of marksRef.current) {
        m.age += dt;
        const settleR = 1.2 + m.mag * 1.1;
        if (m.age < 1.4) {
          // expanding ink ring (single pulse), fading
          const t = m.age / 1.4;
          const r = settleR + t * (m.ringMax - settleR);
          ctx2d!.lineWidth = 1.2;
          ctx2d!.strokeStyle = INK + (0.55 * (1 - t)).toFixed(3) + ")";
          ctx2d!.beginPath();
          ctx2d!.arc(m.x, m.y, r, 0, Math.PI * 2);
          ctx2d!.stroke();
        }
        // settled quiet dot
        ctx2d!.fillStyle =
          m.mag >= 5 ? ACCENT + "0.85)" : INK + "0.55)";
        ctx2d!.beginPath();
        ctx2d!.arc(m.x, m.y, settleR, 0, Math.PI * 2);
        ctx2d!.fill();
      }
      // let old dots gently thin out
      if (marksRef.current.length > 600) {
        marksRef.current.splice(0, marksRef.current.length - 600);
      }

      // --- seismograph ribbon (bottom band) ---
      const band = 70;
      const baseY = h - band / 2 - 6;
      // scroll: push current peak (decaying) onto ribbon each frame
      const arr = seismoRef.current;
      // decay last sample toward 0 so jolts settle
      const last = arr.length ? arr[arr.length - 1] : 0;
      arr.push(last * 0.86);
      const maxSamples = Math.floor(w);
      while (arr.length > maxSamples) arr.shift();

      ctx2d!.strokeStyle = FAINT + "0.16)";
      ctx2d!.lineWidth = 1;
      ctx2d!.beginPath();
      ctx2d!.moveTo(0, baseY);
      ctx2d!.lineTo(w, baseY);
      ctx2d!.stroke();

      ctx2d!.strokeStyle = INK + "0.8)";
      ctx2d!.lineWidth = 1.1;
      ctx2d!.beginPath();
      for (let i = 0; i < arr.length; i++) {
        const x = i;
        // pen-trace: noisy oscillation scaled by stored amplitude
        const amp = arr[i];
        const wobble =
          amp *
          (band / 2 - 4) *
          Math.sin(i * 0.9 + now * 0.004) *
          (0.6 + Math.random() * 0.4);
        const y = baseY + wobble;
        if (i === 0) ctx2d!.moveTo(x, y);
        else ctx2d!.lineTo(x, y);
      }
      ctx2d!.stroke();

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (pollTimer) clearInterval(pollTimer);
      if (replayTimer) clearTimeout(replayTimer);
      window.removeEventListener("resize", sizeCanvas);
      eng.stopDrone();
      eng.ctx.close().catch(() => {});
      engineRef.current = null;
    };
    // re-run engine when the user changes feed or play mode after starting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, feedMode, playMode]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0c] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* design-notes link */}
      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/279-tremor-score/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-white/55 underline-offset-4 hover:text-white/80 hover:underline"
      >
        Read the design notes &#8599;
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-8">
        <header className="max-w-2xl">
          <h1 className="font-serif text-2xl text-white sm:text-3xl">
            Tremor Score
          </h1>
          <p className="mt-2 text-base text-white/80">
            The planet&apos;s live earthquakes, composed in real time into an
            evolving piece that never exactly repeats.
          </p>

          {started && (
            <div className="mt-3 font-mono text-sm text-white/75">
              <span>
                {count} quake{count === 1 ? "" : "s"} loaded
              </span>
              <span className="text-white/40"> &middot; </span>
              <span>last update {lastUpdate}</span>
              <span className="text-white/40"> &middot; </span>
              <span>
                largest{" "}
                <span className="text-amber-300/95">
                  M{maxMag.toFixed(1)}
                </span>
              </span>
              {usingFallback && (
                <div className="mt-1 text-amber-300/95">
                  Live feed unavailable &mdash; playing from a cached set of
                  recent quakes.
                </div>
              )}
              {error && !usingFallback && (
                <div className="mt-1 text-rose-300">feed note: {error}</div>
              )}
            </div>
          )}
        </header>

        <div className="flex flex-col gap-4">
          {!started ? (
            <button
              onClick={() => setStarted(true)}
              className="min-h-[44px] w-fit rounded-md border border-white/20 bg-white/5 px-4 py-2.5 font-mono text-base text-white/95 transition hover:border-white/40 hover:bg-white/10"
            >
              Begin listening to the Earth
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {/* Live / Replay */}
              <div className="flex overflow-hidden rounded-md border border-white/20">
                {(["live", "replay"] as PlayMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPlayMode(m)}
                    className={`min-h-[44px] px-4 py-2.5 font-mono text-sm transition ${
                      playMode === m
                        ? "bg-white/15 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white/85"
                    }`}
                  >
                    {m === "live" ? "Live" : "Replay 24h"}
                  </button>
                ))}
              </div>

              {/* all_day / all_hour */}
              <div className="flex overflow-hidden rounded-md border border-white/20">
                {(["all_day", "all_hour"] as FeedMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setFeedMode(m)}
                    className={`min-h-[44px] px-4 py-2.5 font-mono text-sm transition ${
                      feedMode === m
                        ? "bg-white/15 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white/85"
                    }`}
                  >
                    {m === "all_day" ? "Last 24h" : "Last hour"}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setMuted((v) => !v)}
                className="min-h-[44px] rounded-md border border-white/20 px-4 py-2.5 font-mono text-sm text-white/85 transition hover:border-white/40 hover:bg-white/5"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
          )}

          <p className="max-w-2xl font-mono text-sm text-white/55">
            magnitude &#8594; loudness, length &amp; sub-rumble &middot; depth
            &#8594; pitch (just-intonation, deep = dark) &middot; longitude
            &#8594; stereo pan &middot; latitude &#8594; brightness. Data: USGS
            real-time feeds.
          </p>
        </div>
      </div>
    </main>
  );
}
