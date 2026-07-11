"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── types ──────────────────────────────────────────────────────────────────

interface Quake {
  id: string;
  mag: number;
  depth: number; // km
  lat: number;
  lon: number;
  region: string;
  time: number; // ms epoch (arrival)
  live: boolean;
}

interface Ripple {
  x: number; // canvas px
  y: number;
  mag: number;
  depth: number;
  born: number; // ms perf time
}

type FeedMode = "sim" | "live";
type FeedStatus = "sim" | "live" | "connecting";

// ─── constants ────────────────────────────────────────────────────────────────

const WS_URL = "wss://www.seismicportal.eu/standing_order/websocket";

const REGIONS = [
  "CENTRAL CALIFORNIA",
  "SOUTHERN ALASKA",
  "OFF COAST OF NORTHERN CHILE",
  "KURIL ISLANDS",
  "CRETE, GREECE",
  "EASTERN TURKEY",
  "PAPUA, INDONESIA",
  "VANUATU ISLANDS",
  "HINDU KUSH REGION, AFGHANISTAN",
  "TONGA REGION",
  "ICELAND REGION",
  "OFFSHORE NORTHERN CALIFORNIA",
  "NEAR EAST COAST OF HONSHU, JAPAN",
  "MID-ATLANTIC RIDGE",
];

const RING_LIFE = 3200; // ms a ripple lives
const LOG_MAX = 8;

// ─── pure helpers (module scope — never start with "use") ─────────────────────

function makeSyntheticQuake(): Quake {
  // Gutenberg–Richter: small quakes vastly more common.
  let mag = 2.5 - Math.log10(Math.random()) * 0.9;
  mag = Math.max(2.5, Math.min(7.6, mag));
  const lat = -60 + Math.random() * 135; // [-60, 75]
  const lon = -180 + Math.random() * 360;
  const depth = 5 + Math.random() * 595; // [5, 600]
  const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  return {
    id: "sim-" + Math.random().toString(36).slice(2),
    mag: Math.round(mag * 10) / 10,
    depth: Math.round(depth),
    lat,
    lon,
    region,
    time: Date.now(),
    live: false,
  };
}

// Poisson-ish next delay, ~3–12 s.
function makeNextDelay(): number {
  return 3000 + Math.random() * 9000;
}

function projectX(lon: number, w: number): number {
  return ((lon + 180) / 360) * w;
}
function projectY(lat: number, h: number): number {
  return ((90 - lat) / 180) * h;
}

// depth → color (warm shallow, violet mid, blue deep)
function depthColor(depth: number): [number, number, number] {
  if (depth < 70) return [255, 120, 60]; // amber/red
  if (depth < 300) return [180, 110, 240]; // violet
  return [90, 150, 255]; // blue
}

function magColorClass(mag: number): string {
  if (mag >= 6) return "text-violet-300";
  if (mag >= 5) return "text-violet-300";
  if (mag >= 4) return "text-violet-300";
  return "text-muted-foreground";
}

// ─── audio engine ─────────────────────────────────────────────────────────────

interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  reverb: ConvolverNode;
  drone: { stop: () => void };
}

function makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function makeRoomDrone(ctx: AudioContext, dest: AudioNode): { stop: () => void } {
  const g = ctx.createGain();
  g.gain.value = 0.0;
  g.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 4);
  const oscs: OscillatorNode[] = [];
  const freqs = [27.5, 41.2]; // very low, detuned
  for (let i = 0; i < freqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = freqs[i];
    o.detune.value = i === 0 ? -7 : 9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    o.connect(lp).connect(g);
    o.start();
    oscs.push(o);
  }
  g.connect(dest);
  return {
    stop: () => {
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        oscs.forEach((o) => o.stop(ctx.currentTime + 0.6));
      } catch {
        /* already stopped */
      }
    },
  };
}

function makeAudioEngine(): AudioEngine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  // master limiter chain
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.18;

  const master = ctx.createGain();
  master.gain.value = 0.3;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // shared reverb
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulseResponse(ctx, 2.6, 3.2);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.55;
  reverb.connect(reverbGain).connect(master);

  const drone = makeRoomDrone(ctx, master);

  return { ctx, master, reverb, drone };
}

function playQuake(eng: AudioEngine, q: Quake): void {
  const { ctx, master, reverb } = eng;
  const now = ctx.currentTime;

  // magnitude → fundamental (bigger = lower) and gain
  const t = (q.mag - 2.5) / (7.6 - 2.5); // 0..1
  const freq = 140 - t * (140 - 38); // 140 Hz small → 38 Hz big
  const peak = 0.12 + t * 0.55; // bigger = louder
  const release = 0.7 + t * 3.3; // bigger = longer tail

  // stereo pan from longitude
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, q.lon / 180));
  pan.connect(master);
  // reverb send
  const send = ctx.createGain();
  send.gain.value = 0.4;
  pan.connect(send);
  send.connect(reverb);

  // body
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = q.depth < 70 ? 1400 : q.depth > 300 ? 320 : 700;
  lp.Q.value = 0.7;

  const osc = ctx.createOscillator();
  osc.type = q.depth > 300 ? "sine" : "triangle";
  osc.frequency.setValueAtTime(freq, now);
  // slight downward chirp for a "struck" feel
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.85), now + release * 0.6);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  osc.connect(lp).connect(bodyGain).connect(pan);
  osc.start(now);
  osc.stop(now + release + 0.1);

  // crack — only for shallow events
  if (q.depth < 70) {
    const crackLen = 0.18;
    const nbuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * crackLen), ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 2);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nbuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600 + (1 - q.depth / 70) * 1800;
    bp.Q.value = 0.8;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, now);
    cg.gain.exponentialRampToValueAtTime(0.05 + t * 0.12, now + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + crackLen);
    noise.connect(bp).connect(cg).connect(pan);
    noise.start(now);
    noise.stop(now + crackLen + 0.02);
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SeismicRoom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<FeedStatus>("sim");
  const [mode, setMode] = useState<FeedMode>("sim");
  const [note, setNote] = useState<string>("");
  const [count, setCount] = useState(0);
  const [log, setLog] = useState<Quake[]>([]);
  const [canvasOk, setCanvasOk] = useState(true);

  const engineRef = useRef<AudioEngine | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const modeRef = useRef<FeedMode>("sim");

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // central handler for any incoming quake
  const ingest = useCallback((q: Quake) => {
    if (seenRef.current.has(q.id)) return;
    seenRef.current.add(q.id);
    if (seenRef.current.size > 500) {
      // bound the set
      seenRef.current = new Set(Array.from(seenRef.current).slice(-200));
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const w = canvas.width;
      const h = canvas.height;
      ripplesRef.current.push({
        x: projectX(q.lon, w),
        y: projectY(q.lat, h),
        mag: q.mag,
        depth: q.depth,
        born: performance.now(),
      });
      if (ripplesRef.current.length > 120) {
        ripplesRef.current.splice(0, ripplesRef.current.length - 120);
      }
    }

    if (engineRef.current) {
      try {
        playQuake(engineRef.current, q);
      } catch {
        /* audio glitch — keep going */
      }
    }

    setCount((c) => c + 1);
    setLog((prev) => [q, ...prev].slice(0, LOG_MAX));
  }, []);

  // ── simulated swarm loop ──
  const scheduleSim = useCallback(() => {
    if (simTimerRef.current) clearTimeout(simTimerRef.current);
    simTimerRef.current = setTimeout(() => {
      // When live, keep simulation silent so live is pure.
      if (modeRef.current === "sim") {
        ingest(makeSyntheticQuake());
      }
      scheduleSim();
    }, makeNextDelay());
  }, [ingest]);

  // ── live websocket ──
  const connectLive = useCallback(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setStatus("sim");
      setMode("sim");
      setNote("Live feed unavailable — playing a simulated swarm.");
      return;
    }
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("live");
      setMode("live");
      setNote("");
    };

    ws.onmessage = (e: MessageEvent) => {
      try {
        const m = JSON.parse(e.data as string) as {
          action?: string;
          data?: {
            id?: string;
            properties?: {
              mag?: number;
              depth?: number;
              flynn_region?: string;
              time?: string;
              unid?: string;
              lon?: number;
              lat?: number;
            };
            geometry?: { coordinates?: number[] };
          };
        };
        if (m.action !== "create" && m.action !== "update") return;
        const p = m.data?.properties;
        if (!p) return;
        const coords = m.data?.geometry?.coordinates;
        const lon = typeof coords?.[0] === "number" ? coords[0] : p.lon;
        const lat = typeof coords?.[1] === "number" ? coords[1] : p.lat;
        if (typeof lon !== "number" || typeof lat !== "number") return;
        const id = String(m.data?.id ?? p.unid ?? `${p.time}-${lat}-${lon}`);
        const q: Quake = {
          id,
          mag: typeof p.mag === "number" ? p.mag : 4,
          depth: typeof p.depth === "number" ? p.depth : (coords?.[2] ?? 10),
          lat,
          lon,
          region: p.flynn_region ?? "UNKNOWN REGION",
          time: Date.now(),
          live: true,
        };
        // only sonify live events when in live mode
        if (modeRef.current === "live") ingest(q);
      } catch {
        /* malformed message — ignore */
      }
    };

    const fallback = () => {
      setStatus("sim");
      setMode("sim");
      setNote("Live feed unavailable — playing a simulated swarm.");
    };
    ws.onerror = fallback;
    ws.onclose = () => {
      if (modeRef.current === "live") fallback();
    };
  }, [ingest]);

  // ── animation loop ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2 = canvas.getContext("2d");
    if (!ctx2) {
      setCanvasOk(false);
      return;
    }
    const w = canvas.width;
    const h = canvas.height;
    const now = performance.now();

    ctx2.fillStyle = "#05060a";
    ctx2.fillRect(0, 0, w, h);

    // graticule every 30°
    ctx2.lineWidth = 1;
    ctx2.strokeStyle = "rgba(120,150,200,0.10)";
    ctx2.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = projectX(lon, w);
      ctx2.moveTo(x, 0);
      ctx2.lineTo(x, h);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const y = projectY(lat, h);
      ctx2.moveTo(0, y);
      ctx2.lineTo(w, y);
    }
    ctx2.stroke();

    // dim dotted equator + prime meridian
    ctx2.setLineDash([2, 8]);
    ctx2.strokeStyle = "rgba(160,190,230,0.22)";
    ctx2.beginPath();
    const eqY = projectY(0, h);
    ctx2.moveTo(0, eqY);
    ctx2.lineTo(w, eqY);
    const pmX = projectX(0, w);
    ctx2.moveTo(pmX, 0);
    ctx2.lineTo(pmX, h);
    ctx2.stroke();
    ctx2.setLineDash([]);

    // ripples
    const live = ripplesRef.current;
    for (let i = live.length - 1; i >= 0; i--) {
      const r = live[i];
      const age = now - r.born;
      if (age > RING_LIFE) {
        live.splice(i, 1);
        continue;
      }
      const k = age / RING_LIFE; // 0..1
      const [cr, cg, cb] = depthColor(r.depth);
      const magScale = (r.mag - 2.5) / (7.6 - 2.5); // 0..1
      const maxR = 14 + magScale * 90;
      const radius = k * maxR;
      const alpha = (1 - k) * (0.5 + magScale * 0.4);

      // expanding ring
      ctx2.lineWidth = 1.5 + magScale * 2.5;
      ctx2.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx2.beginPath();
      ctx2.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx2.stroke();

      // bright core (early life)
      const coreA = Math.max(0, 1 - k * 3) * (0.6 + magScale * 0.4);
      if (coreA > 0.01) {
        ctx2.fillStyle = `rgba(${Math.min(255, cr + 60)},${Math.min(255, cg + 60)},${Math.min(255, cb + 60)},${coreA})`;
        ctx2.beginPath();
        ctx2.arc(r.x, r.y, 2 + magScale * 4, 0, Math.PI * 2);
        ctx2.fill();
      }

      // lingering glow for large quakes
      if (magScale > 0.55) {
        const glowA = (1 - k) * 0.12 * magScale;
        const g = ctx2.createRadialGradient(r.x, r.y, 0, r.x, r.y, maxR * 0.9);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},${glowA})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.arc(r.x, r.y, maxR * 0.9, 0, Math.PI * 2);
        ctx2.fill();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // size canvas to its container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(parent.clientWidth * dpr);
      canvas.height = Math.floor(parent.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // run the draw loop once started
  useEffect(() => {
    if (!started) return;
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [started, draw]);

  // start everything
  const handleStart = useCallback(() => {
    if (started) return;
    try {
      engineRef.current = makeAudioEngine();
      if (engineRef.current.ctx.state === "suspended") {
        void engineRef.current.ctx.resume();
      }
    } catch {
      engineRef.current = null;
    }
    setStarted(true);
    scheduleSim();
    connectLive();
  }, [started, scheduleSim, connectLive]);

  // toggle sim/live
  const handleToggle = useCallback(() => {
    if (mode === "live") {
      setMode("sim");
      setStatus("sim");
      setNote("");
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      wsRef.current = null;
    } else {
      // try to (re)connect live
      setNote("");
      connectLive();
    }
  }, [mode, connectLive]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (simTimerRef.current) clearTimeout(simTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* noop */
      }
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.drone.stop();
          eng.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const badge =
    status === "live"
      ? { label: "● Live feed", cls: "text-violet-300/95" }
      : status === "connecting"
        ? { label: "● Connecting…", cls: "text-violet-300/95" }
        : { label: "● Simulated swarm", cls: "text-violet-300/95" };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05060a] text-foreground">
      {/* canvas full-bleed */}
      <div className="absolute inset-0">
        {canvasOk ? (
          <canvas ref={canvasRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-base text-muted-foreground">
            Canvas is unavailable in this browser. The audio still plays the planet.
          </div>
        )}
      </div>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl">
          <h1 className="font-serif text-2xl text-foreground">Tremor</h1>
          <p className="mt-1 text-base text-muted-foreground">
            The world&rsquo;s earthquakes, live — the moment each one is detected, it becomes a
            sound and a ripple on the planet.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-base">
            <span className={badge.cls}>{badge.label}</span>
            <span className="text-muted-foreground">{count} events</span>
          </div>
          {note ? <p className="mt-2 text-base text-violet-300/95">{note}</p> : null}
        </header>

        {/* event log */}
        <div className="pointer-events-none absolute right-5 top-5 hidden w-72 font-mono text-base sm:right-7 sm:top-7 sm:block">
          <div className="space-y-0.5">
            {log.map((q) => (
              <div key={q.id} className="truncate text-muted-foreground">
                <span className={magColorClass(q.mag)}>M{q.mag.toFixed(1)}</span>{" "}
                <span className="text-muted-foreground">{q.region}</span>{" "}
                <span className="text-muted-foreground">{q.depth}km</span>
              </div>
            ))}
          </div>
        </div>

        {/* controls */}
        <footer className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              ▶ Start — enter the room
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggle}
              className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              {mode === "live" ? "Switch to simulated swarm" : "Try live feed"}
            </button>
          )}
          {started ? (
            <span className="font-mono text-base text-muted-foreground">
              {mode === "live" ? "sonifying real detections" : "sonifying a synthetic swarm"}
            </span>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
