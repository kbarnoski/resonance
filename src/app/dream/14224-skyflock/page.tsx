"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14224-skyflock — the whole catalog, played by the real sky.
//
// ONE question: what if Karel's 16 recordings arranged and cross-blended
// themselves according to the ACTUAL position of the sun right now?
//
// A NOAA-style solar-position algorithm (solar declination + hour angle →
// elevation & azimuth) is computed client-side from device local time +
// geolocation (graceful fallback to a mid-latitude clock). The sun's elevation
// drives a generative arrangement engine over the whole corpus: deep night is
// minimal & low, dawn is sparse & high, noon is fuller & bright, dusk is warm.
// A slow drift + evening/morning bias rotate the active set so the piece is
// genuinely different at minute 5 than at minute 1.
//
// Every sound is one of Karel's REAL recordings (Welcome Home + Snowflake),
// looped through ONE ear-safety safeMaster bus. The Canvas 2D output paints the
// true daylight sky for the current elevation + a flock of drifting light-motes
// whose count & height track the live analyser energy.
//
// Lineage: Brian Eno's *Reflection* (2017) and the 2026 "world-shaped ambient"
// app *Sonaur* — see README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

const DEG = Math.PI / 180;

// ── small math helpers (never named use*, ESLint reads that as a hook) ────────
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

type RGB = [number, number, number];
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function css(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

// ── NOAA-style solar position → elevation & azimuth (degrees) ─────────────────
function computeSolarPosition(
  date: Date,
  latDeg: number,
  lonDeg: number,
  tzHours: number,
): { elevation: number; azimuth: number } {
  const y = date.getFullYear();
  const dayOfYear = Math.floor(
    (Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 0)) / 86400000,
  );
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);

  const timeOffset = eqtime + 4 * lonDeg - 60 * tzHours; // minutes
  const tst = hour * 60 + timeOffset; // true solar time, minutes
  const ha = tst / 4 - 180; // hour angle, degrees

  const latR = latDeg * DEG;
  const haR = ha * DEG;
  const cosZen =
    Math.sin(latR) * Math.sin(decl) +
    Math.cos(latR) * Math.cos(decl) * Math.cos(haR);
  const zen = Math.acos(clamp(cosZen, -1, 1));
  const elevation = 90 - zen / DEG;

  let azimuth: number;
  const azDenom = Math.cos(latR) * Math.sin(zen);
  if (Math.abs(azDenom) > 0.001) {
    const t = clamp(
      (Math.sin(latR) * Math.cos(zen) - Math.sin(decl)) / azDenom,
      -1,
      1,
    );
    azimuth = 180 - Math.acos(t) / DEG;
    if (ha > 0) azimuth = -azimuth;
  } else {
    azimuth = latDeg > 0 ? 180 : 0;
  }
  azimuth = (azimuth + 360) % 360;
  return { elevation, azimuth };
}

// ── daylight-spectrum palette keyed on solar elevation ────────────────────────
// Deep-night indigo → pre-dawn violet → dawn peach/rose → high-key noon
// blue-white → golden dusk amber → night. Horizon hue also shifts morning↔evening.
interface SkyStop {
  elev: number;
  zenith: RGB;
  horizonM: RGB; // morning tint (rose/peach)
  horizonE: RGB; // evening tint (amber/gold)
}
const SKY: SkyStop[] = [
  { elev: -18, zenith: [8, 10, 32], horizonM: [16, 12, 40], horizonE: [16, 12, 40] },
  { elev: -9, zenith: [20, 16, 52], horizonM: [46, 28, 74], horizonE: [54, 30, 62] },
  { elev: -3, zenith: [40, 44, 96], horizonM: [150, 86, 122], horizonE: [122, 70, 112] },
  { elev: 1, zenith: [60, 92, 156], horizonM: [248, 150, 132], horizonE: [240, 138, 84] },
  { elev: 8, zenith: [74, 124, 196], horizonM: [250, 196, 150], horizonE: [246, 176, 92] },
  { elev: 20, zenith: [80, 140, 214], horizonM: [176, 206, 232], horizonE: [198, 206, 222] },
  { elev: 55, zenith: [104, 164, 236], horizonM: [206, 228, 246], horizonE: [206, 228, 246] },
];

function computePalette(
  elevation: number,
  eveningFactor: number,
): { zenith: RGB; horizon: RGB; ground: RGB; sun: RGB } {
  let lo = SKY[0];
  let hi = SKY[SKY.length - 1];
  for (let i = 0; i < SKY.length - 1; i++) {
    if (elevation >= SKY[i].elev && elevation <= SKY[i + 1].elev) {
      lo = SKY[i];
      hi = SKY[i + 1];
      break;
    }
  }
  const t =
    hi.elev === lo.elev
      ? 0
      : clamp01((elevation - lo.elev) / (hi.elev - lo.elev));
  const zenith = mixRGB(lo.zenith, hi.zenith, t);
  const horizonM = mixRGB(lo.horizonM, hi.horizonM, t);
  const horizonE = mixRGB(lo.horizonE, hi.horizonE, t);
  const horizon = mixRGB(horizonM, horizonE, eveningFactor);
  const ground = mixRGB(zenith, [4, 5, 12], 0.55);
  // sun disc: warm-orange low on the horizon, white when high
  const warm: RGB = [255, 176, 96];
  const white: RGB = [255, 248, 232];
  const sun = mixRGB(warm, white, clamp01(elevation / 30));
  return { zenith, horizon, ground, sun };
}

// ── per-track "brightness" ranking (stable, heuristic — see README limits) ────
const N_TRACKS = REAL_TRACKS.length;
const BRIGHT_OF = new Map<string, number>();
{
  const ranked = [...REAL_TRACKS].sort((a, b) => hashStr(a.id) - hashStr(b.id));
  ranked.forEach((tk, i) => BRIGHT_OF.set(tk.id, N_TRACKS > 1 ? i / (N_TRACKS - 1) : 0.5));
}

interface Voice {
  id: string;
  title: string;
  bright: number;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  loading: boolean;
  failed: boolean;
  target: number; // desired normalized gain 0..1
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

interface Loc {
  lat: number;
  lon: number;
  tz: number;
  source: "device" | "default";
}

interface SunReadout {
  elevation: number;
  clock: string;
  label: string;
  loc: string;
}

function fmtClock(date: Date): string {
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

export default function SkyflockPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string>("");
  const [sun, setSun] = useState<SunReadout>({
    elevation: 0,
    clock: "--:--",
    label: "awaiting sky",
    loc: "",
  });
  const [blooming, setBlooming] = useState<string[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [sweepMin, setSweepMin] = useState(12 * 60);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const locRef = useRef<Loc>({ lat: 40, lon: 0, tz: 0, source: "default" });
  const sweepRef = useRef<{ active: boolean; min: number }>({ active: false, min: 720 });
  const motesRef = useRef<Mote[]>([]);
  const starsRef = useRef<{ x: number; y: number; b: number }[]>([]);

  useEffect(() => {
    sweepRef.current = { active: sweep, min: sweepMin };
  }, [sweep, sweepMin]);

  // Resolve "now" as a Date, honoring the secondary sweep-the-day override.
  const solarDate = useCallback((): Date => {
    const now = new Date();
    if (sweepRef.current.active) {
      const d = new Date(now);
      d.setHours(Math.floor(sweepRef.current.min / 60), sweepRef.current.min % 60, 0, 0);
      return d;
    }
    return now;
  }, []);

  const solarNow = useCallback(() => {
    const l = locRef.current;
    const d = solarDate();
    const pos = computeSolarPosition(d, l.lat, l.lon, l.tz);
    return { ...pos, date: d };
  }, [solarDate]);

  // ── the generative arrangement engine ─────────────────────────────────────
  const runArrangement = useCallback(() => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe || !playingRef.current) return;

    const { elevation, azimuth, date } = solarNow();
    const eveningFactor = smoothstep(150, 210, azimuth);
    const elapsed = ctx.currentTime - startedAtRef.current;

    // bright01: how "high & bright" the sky is (0 deep night → 1 high noon)
    const bright01 = clamp01((elevation + 6) / 61);
    // window width = fullness: night narrow (few voices), noon wide (fuller)
    const width = lerp(0.13, 0.34, bright01);
    // morning leans high/cool, evening leans warm/low
    const regBias = eveningFactor > 0.5 ? -0.05 : 0.05;
    // slow evolving drift (memory) — different set at minute 5 than minute 1
    const drift = 0.11 * Math.sin(elapsed / 70) + 0.06 * Math.sin(elapsed / 26 + 1.3);
    const cursor = clamp01(bright01 + regBias + drift);

    // triangular window around the cursor → smoothstep weight per voice
    const voices = voicesRef.current;
    let sumSq = 0;
    const weights = voices.map((v) => {
      const d = Math.abs(v.bright - cursor);
      const w = smoothstep(0, 1, clamp01(1 - d / width));
      sumSq += w * w;
      return w;
    });
    const norm = sumSq > 1e-6 ? Math.sqrt(sumSq) : 1;

    const now = ctx.currentTime;
    let anyFailed = false;
    const bloom: { title: string; g: number }[] = [];

    voices.forEach((v, i) => {
      const g = (weights[i] / norm) * 0.85; // equal-power, under the ceiling
      v.target = g;
      if (v.failed) {
        anyFailed = true;
        return;
      }
      if (g > 0.02) {
        // lazy-load the first time the arrangement wants this voice
        if (!v.buffer && !v.loading) {
          v.loading = true;
          loadRealTrackBuffer(ctx, v.id)
            .then((loaded) => {
              v.buffer = loaded.buffer;
            })
            .catch(() => {
              v.failed = true;
            })
            .finally(() => {
              v.loading = false;
            });
        }
        // start a source (at silence) once the buffer is ready
        if (v.buffer && !v.source) {
          const src = ctx.createBufferSource();
          src.buffer = v.buffer;
          src.loop = true;
          const gain = ctx.createGain();
          gain.gain.value = 0;
          src.connect(gain);
          gain.connect(safe.input);
          try {
            src.start(now + 0.05);
          } catch {
            /* already started */
          }
          v.source = src;
          v.gain = gain;
        }
      }
      if (v.gain) {
        // slow crossfade — never an abrupt cut
        v.gain.gain.setTargetAtTime(g, now, 2.6);
        if (g > 0.16) bloom.push({ title: v.title, g });
      }
    });

    if (anyFailed && !notice) {
      setNotice("some recordings could not load — the sky keeps turning");
    }

    // readout + blooming voices (UI cadence rides the arrangement tick)
    bloom.sort((a, b) => b.g - a.g);
    setBlooming(bloom.map((b) => b.title));
    const l = locRef.current;
    const clock = fmtClock(date);
    const label =
      elevation >= 0
        ? `☀ ${Math.round(elevation)}° · ${clock} local`
        : `night · ${Math.round(elevation)}° · ${clock} local`;
    setSun({
      elevation,
      clock,
      label,
      loc:
        l.source === "device"
          ? `${l.lat.toFixed(1)}°, ${l.lon.toFixed(1)}°`
          : "default mid-latitude",
    });
  }, [solarNow, notice]);

  // ── stop everything / teardown ────────────────────────────────────────────
  const stopVoices = useCallback(() => {
    for (const v of voicesRef.current) {
      if (v.source) {
        try {
          v.source.onended = null;
          v.source.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        v.source?.disconnect();
        v.gain?.disconnect();
      } catch {
        /* closing */
      }
      v.source = null;
      v.gain = null;
      v.target = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      stopVoices();
      cancelAnimationFrame(rafRef.current);
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopVoices]);

  // ── begin: resolve location, create context, kick the engine ──────────────
  const begin = useCallback(async () => {
    if (phase === "playing") {
      playingRef.current = false;
      stopVoices();
      setPhase("idle");
      setBlooming([]);
      return;
    }
    setNotice("");
    setPhase("loading");

    // sensible default first (device tz → approximate longitude, mid-latitude)
    const tz = -new Date().getTimezoneOffset() / 60;
    locRef.current = { lat: 40, lon: clamp(tz * 15, -180, 180), tz, source: "default" };

    // try geolocation; fall back gracefully on deny / unavailable
    await new Promise<void>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          locRef.current = {
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            tz,
            source: "device",
          };
          resolve();
        },
        () => resolve(),
        { timeout: 6000, maximumAge: 600000 },
      );
    });

    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctx();
      ctxRef.current = ctx;
      safeRef.current = createSafeMaster(ctx);
      safeRef.current.setGain(0.9);
      voicesRef.current = REAL_TRACKS.map((tk) => ({
        id: tk.id,
        title: tk.title,
        bright: BRIGHT_OF.get(tk.id) ?? 0.5,
        buffer: null,
        source: null,
        gain: null,
        loading: false,
        failed: false,
        target: 0,
      }));
    }
    await ctx.resume().catch(() => {});
    startedAtRef.current = ctx.currentTime;
    playingRef.current = true;
    setPhase("playing");
    runArrangement();
  }, [phase, stopVoices, runArrangement]);

  // arrangement interval (the slow evolving crossfade)
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(runArrangement, 1400);
    return () => window.clearInterval(id);
  }, [phase, runArrangement]);

  // recompute promptly when the secondary sweep control moves
  useEffect(() => {
    if (phase === "playing") runArrangement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweep, sweepMin]);

  // ── the sky + flock render loop ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      // scatter a fresh starfield to fit
      const stars: { x: number; y: number; b: number }[] = [];
      for (let i = 0; i < 220; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height * 0.72,
          b: 0.3 + Math.random() * 0.7,
        });
      }
      starsRef.current = stars;
    };
    resize();
    window.addEventListener("resize", resize);

    const freq = new Uint8Array(safeRef.current?.analyser.frequencyBinCount ?? 512);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      const t = performance.now() / 1000;

      const { elevation, azimuth } = solarNow();
      const eveningFactor = smoothstep(150, 210, azimuth);
      const pal = computePalette(elevation, eveningFactor);

      const horizonFrac = 0.66;
      const horizonY = H * horizonFrac;

      // sky gradient (Canvas 2D — true daylight spectrum, this is the art)
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, css(pal.zenith));
      grad.addColorStop(horizonFrac - 0.06, css(mixRGB(pal.zenith, pal.horizon, 0.7)));
      grad.addColorStop(horizonFrac, css(pal.horizon));
      grad.addColorStop(1, css(pal.ground));
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);

      // stars at/under twilight
      const nightF = clamp01((-elevation - 2) / 10);
      if (nightF > 0.01) {
        for (const s of starsRef.current) {
          const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + s.x * 0.01 + s.y * 0.02);
          g.fillStyle = `rgba(220,224,255,${nightF * s.b * tw * 0.9})`;
          g.fillRect(s.x, s.y, dpr, dpr);
        }
      }

      // the sun / moon disc, positioned by real azimuth (x) & elevation (y)
      const xFrac = clamp01(0.5 + ((azimuth - 180) / 180) * 0.6);
      const sx = xFrac * W;
      const sy =
        elevation >= 0
          ? horizonY * (1 - clamp01(elevation / 70))
          : horizonY + clamp01(-elevation / 18) * H * 0.18;
      const discR = Math.min(W, H) * 0.05;
      const glowR = discR * 6;
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      const bodyC = elevation >= -2 ? pal.sun : ([200, 206, 236] as RGB);
      glow.addColorStop(0, css(bodyC, 0.55));
      glow.addColorStop(0.2, css(bodyC, 0.25));
      glow.addColorStop(1, css(bodyC, 0));
      g.globalCompositeOperation = "lighter";
      g.fillStyle = glow;
      g.beginPath();
      g.arc(sx, sy, glowR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css(bodyC, elevation >= -6 ? 0.95 : 0.6);
      g.beginPath();
      g.arc(sx, sy, discR, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "source-over";

      // ── flock of light-motes: count & height track the live analyser energy
      const analyser = safeRef.current?.analyser;
      let energy = 0;
      if (analyser && playingRef.current) {
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        const lim = Math.min(freq.length, 220);
        for (let i = 0; i < lim; i++) sum += freq[i];
        energy = clamp01(sum / (lim * 255) / 0.55);
      }
      const bright01 = clamp01((elevation + 6) / 61);
      const targetCount = Math.floor(18 + energy * 130 + bright01 * 34);
      const motes = motesRef.current;

      // spawn toward the target count from just below the horizon
      let spawn = Math.min(4, targetCount - motes.length);
      while (spawn-- > 0) {
        motes.push({
          x: Math.random() * W,
          y: horizonY + Math.random() * H * 0.12,
          vx: (Math.random() - 0.5) * 0.4 * dpr,
          vy: (0.3 + Math.random() * 0.8 + energy * 1.6) * dpr,
          life: 1,
          size: (0.8 + Math.random() * 1.8) * dpr,
        });
      }

      g.globalCompositeOperation = "lighter";
      const moteC = mixRGB(pal.sun, pal.horizon, 0.4);
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        // noise-drift: gentle wander + buoyant rise scaled by energy
        m.vx += Math.sin(t * 0.7 + m.y * 0.01) * 0.02 * dpr;
        m.x += m.vx;
        m.y -= m.vy * (0.4 + energy * 0.9);
        m.life -= 0.004 + 0.006 * (1 - energy);
        const ceiling = horizonY - bright01 * horizonY * (0.4 + energy * 0.55);
        if (m.life <= 0 || m.y < ceiling || motes.length > targetCount + 24) {
          motes.splice(i, 1);
          continue;
        }
        const a = m.life * (0.35 + energy * 0.5);
        g.fillStyle = css(moteC, a);
        g.beginPath();
        g.arc(m.x, m.y, m.size, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [solarNow]);

  const isDay = sun.elevation >= 0;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top-left: title + description + live sun readout */}
      <div className="pointer-events-none absolute left-6 top-6 max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow">
          Skyflock
        </h1>
        <p className="mt-1 text-base text-foreground/90 drop-shadow">
          Karel&rsquo;s whole catalog, arranged and cross-blended by the real
          position of the sun right now.
        </p>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          sky state
        </div>
        <div className="mt-1 flex items-baseline gap-3">
          <span
            className={`font-mono text-lg ${isDay ? "text-foreground" : "text-primary"}`}
          >
            {sun.label}
          </span>
        </div>
        {sun.loc && (
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {sun.loc}
          </div>
        )}
      </div>

      {/* top-right: currently blooming voices */}
      <div className="pointer-events-none absolute right-6 top-6 max-w-[46vw] text-right">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          blooming now
        </div>
        <div className="mt-1 space-y-0.5">
          {blooming.length === 0 ? (
            <div className="text-base text-muted-foreground">—</div>
          ) : (
            blooming.map((tk) => (
              <div key={tk} className="text-base text-foreground/90 drop-shadow">
                {tk}
              </div>
            ))
          )}
        </div>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-4 px-4">
        {notice && (
          <div className="text-base text-destructive drop-shadow">{notice}</div>
        )}

        {/* secondary control: sweep the day (real sun is the primary driver) */}
        {phase === "playing" && (
          <div className="flex w-full max-w-xl flex-col items-center gap-1">
            <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <input
                type="checkbox"
                checked={sweep}
                onChange={(e) => setSweep(e.target.checked)}
                className="accent-primary"
              />
              sweep the day (secondary)
            </label>
            {sweep && (
              <input
                type="range"
                min={0}
                max={1439}
                step={1}
                value={sweepMin}
                onChange={(e) => setSweepMin(parseInt(e.target.value, 10))}
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
                aria-label="time of day"
              />
            )}
          </div>
        )}

        <button
          onClick={() => void begin()}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {phase === "loading"
            ? "reading the sky…"
            : phase === "playing"
              ? "Rest"
              : "Begin"}
        </button>
      </div>

      {/* corner affordance → design notes overlay */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-6 right-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Skyflock
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              A NOAA-style solar-position algorithm (solar declination + hour
              angle → elevation &amp; azimuth) runs client-side from your device
              clock and location. The sun&rsquo;s elevation drives a generative
              arrangement engine over Karel&rsquo;s 16 recordings: deep night is
              minimal &amp; low, dawn sparse &amp; high, noon fuller &amp;
              bright, dusk warm. A slow drift and a morning/evening bias rotate
              the active set, so the piece is different at minute 5 than at
              minute 1.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Every sound is one of Karel&rsquo;s real recordings, looped through
              one ear-safety bus. The Canvas paints the true daylight sky for the
              current elevation; the flock of light-motes tracks the live
              analyser energy.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Lineage: Brian Eno&rsquo;s <em>Reflection</em> (2017), generative
              music that modulates by time of day, and the 2026 world-shaped
              ambient app <em>Sonaur</em>.
            </p>
            <p className="mt-3 text-sm text-muted-foreground/80">
              Honest limits: per-track &ldquo;brightness&rdquo; is a heuristic
              ranking (not ear-verified), longitude falls back to your timezone
              when location is denied, and the mix was not ear-checked in a
              headless build.
            </p>
            <button
              onClick={() => setShowNotes(false)}
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
