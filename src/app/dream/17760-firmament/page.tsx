"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17760-firmament — "What if the sky's own clock over you right now — where the
// sun and moon sit above your horizon — conducted one of Karel's real piano
// takes, so it sounds like daylight where you are and slowly turns to a
// night-voice as the sun sets and the moon rises?"
//
//   THE CLOCK — self-contained COMPUTED astronomy, no network needed:
//     · SUN ALTITUDE for the observer's lat/long + current UTC, from solar
//       declination (day-of-year), the equation of time, local solar time via
//       hour angle, then altitude = asin(sin φ sin δ + cos φ cos δ cos H).
//     · MOON PHASE exact, from the known new-moon epoch (JD 2451550.1) and the
//       synodic period 29.530588853 d; illuminated fraction = (1 − cos 2πp)/2.
//     · MOON ALTITUDE from an APPROXIMATE ecliptic-longitude model (documented
//       as approximate below) — enough to gate the moon voice to real moon-up
//       nighttime.
//   Geolocation is requested with a ~6 s timeout; on denial/timeout it falls
//   back to San Francisco (37.77, −122.42) and never blocks.
//
//   THE LIVE VEIL (optional, fail-safe) — open-meteo current conditions
//   (keyless, CORS-open) with a ~4 s AbortController timeout, refetched every
//   ~5 min. cloud_cover → a lowpass veil; wind_speed_10m → a faint air/detune.
//   Any failure is treated as "clear (offline)" and the piece keeps going.
//
//   THE SONIFICATION — sun altitude crossfades THREE sustained readings of the
//   ONE decoded take (all looping BufferSources of the same buffer, glided with
//   setTargetAtTime):
//     · DAY voice   — playbackRate 1.0, a gentle presence high-shelf, drier.
//     · NIGHT voice — an OCTAVE DOWN (rate 0.5), reverb-wet, low-passed, quieter.
//     · MOON overlay — an OCTAVE UP silver shimmer (rate 2.0, quiet, reverb-wet)
//       that only fades in at real nighttime when the moon is up, scaled by the
//       illuminated fraction — near-silent at new moon, a clear line near full.
//   Dawn/dusk is the crossfade band (smoothstep of sun altitude, −6°..+12°).
//   ONE ConvolverNode with a runtime decaying-noise IR is the shared reverb; a
//   shared cloud-veil lowpass darkens with cloud cover. Every path ends at
//   safeMaster.input — never ctx.destination. Visuals read safeMaster.analyser.
//
//   THE SKY — minimal inline SVG on ink: a graded sky band that morphs day →
//   dusk → night by sun altitude, a horizon line, an arcing pale sun disc, a
//   phase-rendered silver-violet moon (correct illuminated crescent/gibbous via
//   an SVG arc path), night stars that fade in as the sun sets, and a soft glow
//   that breathes off the analyser RMS. prefers-reduced-motion slows the demo
//   sweep and stills the glow. No grain, no strobe — slow luminance drift only.
//
//   REVIEWABILITY — a "demo day" toggle (DEFAULT ON) sweeps a full 24 h in ~90 s
//   so the whole day→dusk→night→moonrise morph, and the audible day→night→moon
//   crossfade, is unmistakable within seconds. Off, it uses true current time
//   (nearly static). Works fully offline with geolocation denied.
//
//   REFERENCE — the data-sonification / auditory-display lineage (ICAD): a real
//   real-world data stream (the diurnal + lunar clock of a place) read in real
//   time as a score. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const SYNODIC = 29.530588853; // days
const NEW_MOON_JD = 2451550.1; // 2000-01-06 18:14 UT
const SF: Geo = { lat: 37.77, lon: -122.42, source: "SF (default)" };

const LIVE_REFETCH_MS = 5 * 60 * 1000;
const LIVE_TIMEOUT_MS = 4000;
const GEO_TIMEOUT_MS = 6000;
const DEMO_SPEED = 960; // 24 h in ~90 s
const DEMO_SPEED_REDUCED = 320; // slower sweep when reduced motion is asked

// default take: "Welcome Home"
const DEFAULT_TRACK =
  REAL_TRACKS.find((t) => t.title === "Welcome Home") ?? REAL_TRACKS[0];

// SVG canvas
const VW = 1000;
const VH = 620;
const HORIZON = 430;
const STAR_COUNT = 96;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Smoothstep from edge0 to edge1 (edge0 may be greater than edge1). */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── astronomy ────────────────────────────────────────────────────────────────
interface Geo {
  lat: number;
  lon: number;
  source: string;
}
interface SkyState {
  sunAlt: number; // degrees, −90..+90
  sunH: number; // hour angle, degrees
  moonAlt: number; // degrees (approximate)
  moonH: number; // hour angle, degrees (approximate)
  phase: number; // 0..1 (0/1 new, 0.5 full)
  illum: number; // 0..1 illuminated fraction
}

function computeJD(ms: number): number {
  return ms / 86400000 + 2440587.5;
}

/** Sun altitude + hour angle from computed declination, equation of time,
 *  and local solar time. Exact enough for a sonified diurnal clock. */
function computeSun(ms: number, lat: number, lon: number) {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const doy = (ms - start) / 86400000;
  const utcH =
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;

  const declRad = 23.44 * DEG * Math.sin(((360 * (doy - 81)) / 365) * DEG);
  const B = ((360 * (doy - 81)) / 364) * DEG;
  const eotMin = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarH = utcH + lon / 15 + eotMin / 60;
  let H = 15 * (solarH - 12); // degrees
  H = ((((H + 180) % 360) + 360) % 360) - 180;

  const latR = lat * DEG;
  const sinAlt =
    Math.sin(latR) * Math.sin(declRad) +
    Math.cos(latR) * Math.cos(declRad) * Math.cos(H * DEG);
  return { alt: Math.asin(clamp(sinAlt, -1, 1)) * RAD, H };
}

/** Moon phase (exact) + an APPROXIMATE moon altitude/hour-angle from a low-order
 *  ecliptic-longitude model. The phase is precise; the altitude is only good
 *  enough to gate the moon voice to roughly-correct moon-up nighttime. */
function computeMoon(ms: number, lat: number, lon: number) {
  const jd = computeJD(ms);
  let phase = ((jd - NEW_MOON_JD) / SYNODIC) % 1;
  if (phase < 0) phase += 1;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;

  // Low-order lunar position (approximate — Meeus-style leading terms only).
  const d = jd - 2451545.0; // days since J2000
  const L = (218.316 + 13.176396 * d) * DEG; // mean ecliptic longitude
  const M = (134.963 + 13.064993 * d) * DEG; // mean anomaly
  const F = (93.272 + 13.22935 * d) * DEG; // argument of latitude
  const lambda = L + 6.289 * DEG * Math.sin(M); // ecliptic longitude
  const beta = 5.128 * DEG * Math.sin(F); // ecliptic latitude
  const eps = 23.439 * DEG;

  const sinDec =
    Math.sin(beta) * Math.cos(eps) +
    Math.cos(beta) * Math.sin(eps) * Math.sin(lambda);
  const dec = Math.asin(clamp(sinDec, -1, 1));
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps),
    Math.cos(lambda),
  );

  // Greenwich mean sidereal time → local sidereal time → hour angle.
  let gmst = (280.46061837 + 360.98564736629 * d) % 360;
  if (gmst < 0) gmst += 360;
  const lst = gmst + lon; // degrees
  let H = lst - ra * RAD;
  H = ((((H + 180) % 360) + 360) % 360) - 180;

  const latR = lat * DEG;
  const sinAlt =
    Math.sin(latR) * Math.sin(dec) +
    Math.cos(latR) * Math.cos(dec) * Math.cos(H * DEG);
  return {
    alt: Math.asin(clamp(sinAlt, -1, 1)) * RAD,
    H,
    phase,
    illum,
  };
}

function computeSky(ms: number, geo: Geo): SkyState {
  const s = computeSun(ms, geo.lat, geo.lon);
  const m = computeMoon(ms, geo.lat, geo.lon);
  return {
    sunAlt: s.alt,
    sunH: s.H,
    moonAlt: m.alt,
    moonH: m.H,
    phase: m.phase,
    illum: m.illum,
  };
}

function phaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return "new moon";
  if (p < 0.22) return "waxing crescent";
  if (p < 0.28) return "first quarter";
  if (p < 0.47) return "waxing gibbous";
  if (p < 0.53) return "full moon";
  if (p < 0.72) return "waning gibbous";
  if (p < 0.78) return "last quarter";
  return "waning crescent";
}

/** Path (absolute coords) tracing the LIT region of the moon disc for a given
 *  phase — an outer semicircle on the lit limb plus the terminator ellipse. */
function drawMoonLit(cx: number, cy: number, r: number, phase: number): string {
  const cosT = Math.cos(2 * Math.PI * phase); // +1 new … −1 full
  const rx = Math.abs(cosT) * r; // terminator horizontal radius
  const waxing = phase < 0.5; // lit on the right when waxing
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = waxing ? (cosT < 0 ? 1 : 0) : cosT < 0 ? 0 : 1;
  return (
    `M ${cx} ${cy - r} ` +
    `A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} ` +
    `A ${rx} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`
  );
}

// ── deterministic star field ──────────────────────────────────────────────────
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
interface Star {
  x: number;
  y: number;
  r: number;
}
function buildStars(): Star[] {
  const rnd = mulberry32(17760);
  const out: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    out.push({
      x: 20 + rnd() * (VW - 40),
      y: 24 + rnd() * (HORIZON - 60),
      r: 0.5 + rnd() * 1.3,
    });
  }
  return out;
}

// ── live veil ─────────────────────────────────────────────────────────────────
type LiveMode = "connecting" | "live" | "offline";
interface Live {
  cloud: number; // 0..100
  wind: number; // m/s
  isDay: boolean;
}

// ── component ─────────────────────────────────────────────────────────────────
export default function FirmamentPage() {
  const { immersive, toggle } = useImmersive();

  // audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const enteredRef = useRef(false);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const dayFilterRef = useRef<BiquadFilterNode | null>(null);
  const nightFilterRef = useRef<BiquadFilterNode | null>(null);
  const moonFilterRef = useRef<BiquadFilterNode | null>(null); // highpass, first in moon chain
  const dayGainRef = useRef<GainNode | null>(null);
  const nightGainRef = useRef<GainNode | null>(null);
  const moonGainRef = useRef<GainNode | null>(null);
  const cloudVeilRef = useRef<BiquadFilterNode | null>(null);
  const ampDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // clock / data refs (shared with the render loop)
  const geoRef = useRef<Geo>(SF);
  const liveRef = useRef<Live>({ cloud: 0, wind: 0, isDay: true });
  const liveModeRef = useRef<LiveMode>("connecting");
  const demoRef = useRef(true);
  const demoBaseRef = useRef(0); // real ms at the sweep's start
  const demoStartRef = useRef(0); // performance.now() at the sweep's start
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const liveTimerRef = useRef<number | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const geoWatchRef = useRef(false);
  const lastReadoutRef = useRef(0);
  const ampRef = useRef(0);

  // SVG element refs
  const gradTopRef = useRef<SVGStopElement | null>(null);
  const gradMidRef = useRef<SVGStopElement | null>(null);
  const gradHorizRef = useRef<SVGStopElement | null>(null);
  const groundRef = useRef<SVGRectElement | null>(null);
  const sunRef = useRef<SVGCircleElement | null>(null);
  const sunGlowRef = useRef<SVGCircleElement | null>(null);
  const moonGroupRef = useRef<SVGGElement | null>(null);
  const moonDiscRef = useRef<SVGCircleElement | null>(null);
  const moonLitRef = useRef<SVGPathElement | null>(null);
  const moonGlowRef = useRef<SVGCircleElement | null>(null);
  const starsRef = useRef<SVGGElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const horizonGlowRef = useRef<SVGRectElement | null>(null);

  // discrete UI state
  const [stars] = useState<Star[]>(() => buildStars());
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [demoOn, setDemoOn] = useState(true);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK.id);
  const [trackTitle, setTrackTitle] = useState<string>(DEFAULT_TRACK.title);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({
    clock: "--:--",
    phase: "…",
    sunAlt: 0,
    moonAlt: 0,
    illum: 0,
    geoLabel: SF.source,
    liveLabel: "sky · connecting",
  });

  // ── one live-veil fetch ─────────────────────────────────────────────────────
  const fetchLive = useCallback(async () => {
    const geo = geoRef.current;
    const ctrl = new AbortController();
    liveAbortRef.current = ctrl;
    const to = window.setTimeout(() => ctrl.abort(), LIVE_TIMEOUT_MS);
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}` +
        `&longitude=${geo.lon}&current=is_day,cloud_cover,wind_speed_10m`;
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        current?: {
          is_day?: number;
          cloud_cover?: number;
          wind_speed_10m?: number;
        };
      };
      const c = j.current;
      liveRef.current = {
        cloud: typeof c?.cloud_cover === "number" ? c.cloud_cover : 0,
        wind: typeof c?.wind_speed_10m === "number" ? c.wind_speed_10m : 0,
        isDay: c?.is_day !== 0,
      };
      liveModeRef.current = "live";
    } catch {
      // Any failure → treat as clear, offline. Keep going.
      liveRef.current = { cloud: 0, wind: 0, isDay: true };
      liveModeRef.current = "offline";
    } finally {
      window.clearTimeout(to);
    }
  }, []);

  // ── (re)attach the three looping readings of one buffer ─────────────────────
  const attachSources = useCallback((buffer: AudioBuffer) => {
    const ctx = ctxRef.current;
    const dayF = dayFilterRef.current;
    const nightF = nightFilterRef.current;
    const moonF = moonFilterRef.current;
    if (!ctx || !dayF || !nightF || !moonF) return;

    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    const rates = [1.0, 0.5, 2.0];
    const dests = [dayF, nightF, moonF];
    const next: AudioBufferSourceNode[] = [];
    for (let i = 0; i < 3; i++) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = rates[i];
      src.connect(dests[i]);
      // Stagger the octave-up moon reading so it isn't phase-locked to the day.
      src.start(ctx.currentTime, i === 2 ? buffer.duration * 0.37 : 0);
      next.push(src);
    }
    sourcesRef.current = next;
  }, []);

  // ── load a take and attach it ───────────────────────────────────────────────
  const loadTake = useCallback(
    async (id: string) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      setLoadingTrack(true);
      setAudioError(null);
      try {
        const { buffer, title } = await loadRealTrackBuffer(ctx, id);
        if (!ctxRef.current || ctxRef.current.state === "closed") return;
        bufferRef.current = buffer;
        attachSources(buffer);
        setTrackTitle(title);
        setTrackId(id);
      } catch {
        setAudioError(
          "That take could not load right now — check your connection and try again.",
        );
      } finally {
        setLoadingTrack(false);
      }
    },
    [attachSources],
  );

  // ── Begin: build the persistent graph on the user gesture ───────────────────
  const begin = useCallback(async () => {
    if (enteredRef.current) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — the sky still plays visually.");
          setStarted(true);
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — the sky still plays visually.");
        setStarted(true);
        return;
      }
    }
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* the gesture should have unlocked it */
    }

    let safe = safeRef.current;
    if (!safe) {
      safe = createSafeMaster(ctx);
      safeRef.current = safe;
    }
    ampDataRef.current = new Uint8Array(safe.analyser.frequencyBinCount);

    // Day voice: gentle presence high-shelf, drier.
    const dayShelf = ctx.createBiquadFilter();
    dayShelf.type = "highshelf";
    dayShelf.frequency.value = 3200;
    dayShelf.gain.value = 4;
    const dayGain = ctx.createGain();
    dayGain.gain.value = 0.0001;
    dayShelf.connect(dayGain);

    // Night voice: octave-down darkness, low-passed.
    const nightLP = ctx.createBiquadFilter();
    nightLP.type = "lowpass";
    nightLP.frequency.value = 820;
    nightLP.Q.value = 0.7;
    const nightGain = ctx.createGain();
    nightGain.gain.value = 0.0001;
    nightLP.connect(nightGain);

    // Moon voice: octave-up silver line, band-limited.
    const moonHP = ctx.createBiquadFilter();
    moonHP.type = "highpass";
    moonHP.frequency.value = 1200;
    moonHP.Q.value = 0.7;
    const moonLP = ctx.createBiquadFilter();
    moonLP.type = "lowpass";
    moonLP.frequency.value = 6000;
    moonLP.Q.value = 0.7;
    const moonGain = ctx.createGain();
    moonGain.gain.value = 0.0001;
    moonHP.connect(moonLP);
    moonLP.connect(moonGain);

    // Shared reverb: one convolver fed by a runtime decaying-noise IR (an
    // effect, not a voice). Per-voice send levels: day driest, night/moon wet.
    const conv = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 3.2);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
      }
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    conv.connect(wet);

    const daySend = ctx.createGain();
    daySend.gain.value = 0.12;
    const nightSend = ctx.createGain();
    nightSend.gain.value = 0.5;
    const moonSend = ctx.createGain();
    moonSend.gain.value = 0.72;
    dayGain.connect(daySend);
    nightGain.connect(nightSend);
    moonGain.connect(moonSend);
    daySend.connect(conv);
    nightSend.connect(conv);
    moonSend.connect(conv);

    // Shared cloud-veil lowpass sees the whole mix (dry + wet) before master.
    const cloudVeil = ctx.createBiquadFilter();
    cloudVeil.type = "lowpass";
    cloudVeil.frequency.value = 16000;
    cloudVeil.Q.value = 0.5;
    dayGain.connect(cloudVeil);
    nightGain.connect(cloudVeil);
    moonGain.connect(cloudVeil);
    wet.connect(cloudVeil);
    cloudVeil.connect(safe.input);

    dayFilterRef.current = dayShelf;
    nightFilterRef.current = nightLP;
    moonFilterRef.current = moonHP;
    dayGainRef.current = dayGain;
    nightGainRef.current = nightGain;
    moonGainRef.current = moonGain;
    cloudVeilRef.current = cloudVeil;

    enteredRef.current = true;
    setStarted(true);
    setAudioOn(true);

    await loadTake(trackId);
  }, [loadTake, trackId]);

  // ── mute / tear down audio only (visuals keep running) ──────────────────────
  const stopAudio = useCallback(() => {
    enteredRef.current = false;
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    sourcesRef.current = [];
    try {
      safeRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    safeRef.current = null;
    ctxRef.current = null;
    bufferRef.current = null;
    dayFilterRef.current = null;
    nightFilterRef.current = null;
    moonFilterRef.current = null;
    dayGainRef.current = null;
    nightGainRef.current = null;
    moonGainRef.current = null;
    cloudVeilRef.current = null;
    ampDataRef.current = null;
    ampRef.current = 0;
    if (ctx) void ctx.close();
    setAudioOn(false);
  }, []);

  // ── change take while playing ───────────────────────────────────────────────
  const onSelectTrack = useCallback(
    (id: string) => {
      setTrackId(id);
      if (enteredRef.current) void loadTake(id);
    },
    [loadTake],
  );

  // ── demo toggle ─────────────────────────────────────────────────────────────
  const onToggleDemo = useCallback((next: boolean) => {
    setDemoOn(next);
    demoRef.current = next;
    demoBaseRef.current = Date.now();
    demoStartRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;
  }, []);

  // ── mount: astronomy loop + geolocation + live veil (all offline-safe) ──────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    demoBaseRef.current = Date.now();
    demoStartRef.current =
      typeof performance !== "undefined" ? performance.now() : 0;

    // geolocation, ~6 s, fall back to SF silently
    if (
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      !geoWatchRef.current
    ) {
      geoWatchRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoRef.current = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            source: `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`,
          };
          void fetchLive();
        },
        () => {
          geoRef.current = SF;
        },
        {
          enableHighAccuracy: false,
          timeout: GEO_TIMEOUT_MS,
          maximumAge: 600000,
        },
      );
    }

    // live veil now + every ~5 min
    void fetchLive();
    liveTimerRef.current = window.setInterval(
      () => void fetchLive(),
      LIVE_REFETCH_MS,
    );

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const nowPerf =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const simMs = demoRef.current
        ? demoBaseRef.current +
          (nowPerf - demoStartRef.current) *
            (reducedRef.current ? DEMO_SPEED_REDUCED : DEMO_SPEED)
        : Date.now();

      const geo = geoRef.current;
      const sky = computeSky(simMs, geo);
      const live = liveRef.current;

      // weights
      const dayW = smoothstep(-6, 12, sky.sunAlt);
      const nightW = 1 - dayW;
      const nightGate = smoothstep(0, -8, sky.sunAlt);
      const moonUp = smoothstep(-2, 8, sky.moonAlt);
      const moonW = nightGate * moonUp * sky.illum;

      // ── audio ──
      const ctx = ctxRef.current;
      if (ctx && enteredRef.current) {
        const tau = 1.8;
        dayGainRef.current?.gain.setTargetAtTime(
          dayW * 0.85,
          ctx.currentTime,
          tau,
        );
        nightGainRef.current?.gain.setTargetAtTime(
          nightW * 0.8,
          ctx.currentTime,
          tau,
        );
        moonGainRef.current?.gain.setTargetAtTime(
          moonW * 0.5,
          ctx.currentTime,
          2.2,
        );
        // cloud veil: clear ~16 kHz → overcast ~1 kHz
        const cut = lerp(16000, 1000, clamp(live.cloud / 100, 0, 1));
        cloudVeilRef.current?.frequency.setTargetAtTime(cut, ctx.currentTime, 2);
        // wind: faint air/detune across the readings
        const cents = clamp(live.wind / 40, 0, 1) * 11;
        const srcs = sourcesRef.current;
        srcs[0]?.detune.setTargetAtTime(cents, ctx.currentTime, 1.5);
        srcs[1]?.detune.setTargetAtTime(cents * 0.5, ctx.currentTime, 1.5);
        srcs[2]?.detune.setTargetAtTime(-cents, ctx.currentTime, 1.5);

        // analyser RMS for the glow
        const amp = ampDataRef.current;
        const an = safeRef.current?.analyser;
        if (amp && an) {
          an.getByteFrequencyData(amp);
          let sum = 0;
          for (let i = 0; i < amp.length; i++) sum += amp[i];
          ampRef.current = sum / amp.length / 255;
        }
      }

      drawSky(sky, live);

      // throttled React readout (~4/s)
      if (nowPerf - lastReadoutRef.current > 240) {
        lastReadoutRef.current = nowPerf;
        const d = new Date(simMs);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const liveLabel =
          liveModeRef.current === "live"
            ? "sky · open-meteo live"
            : liveModeRef.current === "offline"
              ? "sky · clear (offline)"
              : "sky · connecting";
        setReadout({
          clock: `${hh}:${mm}`,
          phase: phaseName(sky.phase),
          sunAlt: sky.sunAlt,
          moonAlt: sky.moonAlt,
          illum: sky.illum,
          geoLabel: geo.source,
          liveLabel,
        });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (liveTimerRef.current !== null) {
        window.clearInterval(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      try {
        liveAbortRef.current?.abort();
      } catch {
        /* none */
      }
      for (const s of sourcesRef.current) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      sourcesRef.current = [];
      try {
        safeRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      safeRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, [fetchLive]);

  // ── paint the SVG from the current sky (mutates DOM, no React re-render) ─────
  function drawSky(sky: SkyState, live: Live) {
    const reduced = reducedRef.current;
    const dayW = smoothstep(-6, 12, sky.sunAlt);

    // sky gradient — dark palette; a restrained twilight warmth near the horizon.
    const nightTop: [number, number, number] = [4, 5, 14];
    const dayTop: [number, number, number] = [10, 22, 52];
    const nightHoriz: [number, number, number] = [10, 9, 22];
    const dayHoriz: [number, number, number] = [26, 46, 88];
    const twilight: [number, number, number] = [56, 28, 42];

    const d = clamp((sky.sunAlt + 6) / 24, 0, 1);
    const tw = clamp(1 - Math.abs(sky.sunAlt) / 10, 0, 1) * (1 - d * 0.5);

    const top = mixRgb(nightTop, dayTop, d);
    const mid = mixRgb(top, mixRgb(nightHoriz, dayHoriz, d), 0.5);
    let horiz = mixRgb(nightHoriz, dayHoriz, d);
    horiz = mixRgb(horiz, twilight, tw * 0.7);

    setStop(gradTopRef.current, top);
    setStop(gradMidRef.current, mid);
    setStop(gradHorizRef.current, horiz);

    if (groundRef.current) {
      const g = mixRgb([5, 5, 9], [12, 14, 20], d * 0.6);
      groundRef.current.setAttribute("fill", rgb(g));
    }
    if (horizonGlowRef.current) {
      horizonGlowRef.current.setAttribute(
        "opacity",
        (0.08 + tw * 0.35).toFixed(3),
      );
    }

    // sun disc — arc by hour angle (x) and altitude (y)
    const sunX = VW / 2 + clamp(sky.sunH, -150, 150) / 150 * 460;
    const sunY = HORIZON - Math.sin(sky.sunAlt * DEG) * (HORIZON - 30);
    const sunVis = sky.sunAlt > -1.2 ? 1 : 0;
    place(sunRef.current, sunX, sunY, sunVis);
    place(sunGlowRef.current, sunX, sunY, sunVis * (0.35 + dayW * 0.4));

    // moon disc — arc by its (approximate) hour angle + altitude
    const moonX = VW / 2 + clamp(sky.moonH, -150, 150) / 150 * 460;
    const moonY = HORIZON - Math.sin(sky.moonAlt * DEG) * (HORIZON - 30);
    const moonVis = sky.moonAlt > -1.5 ? 1 : 0;
    const moonR = 22;
    if (moonGroupRef.current) {
      const moonShow = moonVis * clamp(0.25 + (1 - dayW) * 0.85, 0, 1);
      moonGroupRef.current.setAttribute("opacity", moonShow.toFixed(3));
    }
    if (moonDiscRef.current) {
      moonDiscRef.current.setAttribute("cx", moonX.toFixed(1));
      moonDiscRef.current.setAttribute("cy", moonY.toFixed(1));
    }
    if (moonGlowRef.current) {
      moonGlowRef.current.setAttribute("cx", moonX.toFixed(1));
      moonGlowRef.current.setAttribute("cy", moonY.toFixed(1));
      moonGlowRef.current.setAttribute(
        "opacity",
        (0.1 + sky.illum * 0.4).toFixed(3),
      );
    }
    if (moonLitRef.current) {
      moonLitRef.current.setAttribute(
        "d",
        drawMoonLit(moonX, moonY, moonR, sky.phase),
      );
    }

    // stars fade in as the sun sets
    if (starsRef.current) {
      starsRef.current.setAttribute("opacity", clamp(1 - dayW * 1.5, 0, 1).toFixed(3));
    }

    // ambient glow breathes off the analyser RMS (still when reduced motion)
    if (glowRef.current) {
      const rms = reduced ? 0.25 : ampRef.current;
      const cloudDim = 1 - clamp(live.cloud / 100, 0, 1) * 0.4;
      const op = (0.12 + rms * 0.5) * cloudDim;
      glowRef.current.setAttribute("opacity", clamp(op, 0, 0.7).toFixed(3));
      const rad = 150 + (reduced ? 0 : rms * 90);
      glowRef.current.setAttribute("r", rad.toFixed(0));
      glowRef.current.setAttribute("cx", (VW / 2).toFixed(0));
      glowRef.current.setAttribute("cy", (HORIZON - 40).toFixed(0));
    }
  }

  const feedIsLive = readout.liveLabel.includes("live");

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* the sky — minimal SVG on ink */}
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="firm-sky" x1="0" y1="0" x2="0" y2="1">
            <stop ref={gradTopRef} offset="0%" stopColor="rgb(4,5,14)" />
            <stop ref={gradMidRef} offset="55%" stopColor="rgb(8,10,24)" />
            <stop
              ref={gradHorizRef}
              offset="100%"
              stopColor="rgb(10,9,22)"
            />
          </linearGradient>
          <radialGradient id="firm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(150,140,220)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="rgb(150,140,220)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="firm-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(255,246,224)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgb(255,220,150)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="firm-moonglow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgb(198,190,236)" stopOpacity="0.7" />
            <stop offset="100%" stopColor="rgb(198,190,236)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* sky band */}
        <rect x="0" y="0" width={VW} height={HORIZON} fill="url(#firm-sky)" />
        {/* horizon warmth */}
        <rect
          ref={horizonGlowRef}
          x="0"
          y={HORIZON - 120}
          width={VW}
          height="120"
          fill="url(#firm-glow)"
          opacity="0.1"
        />

        {/* stars */}
        <g ref={starsRef} opacity="0">
          {stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              fill="rgb(226,230,255)"
              opacity={0.4 + (s.r - 0.5) / 1.3 * 0.6}
            />
          ))}
        </g>

        {/* ambient breathing glow */}
        <circle
          ref={glowRef}
          cx={VW / 2}
          cy={HORIZON - 40}
          r="150"
          fill="url(#firm-glow)"
          opacity="0.12"
        />

        {/* sun */}
        <circle
          ref={sunGlowRef}
          cx={VW / 2}
          cy={-100}
          r="70"
          fill="url(#firm-sun)"
          opacity="0"
        />
        <circle
          ref={sunRef}
          cx={VW / 2}
          cy={-100}
          r="20"
          fill="rgb(253,248,232)"
          opacity="0"
        />

        {/* moon */}
        <g ref={moonGroupRef} opacity="0">
          <circle
            ref={moonGlowRef}
            cx={VW / 2}
            cy={-100}
            r="52"
            fill="url(#firm-moonglow)"
            opacity="0.2"
          />
          <circle
            ref={moonDiscRef}
            cx={VW / 2}
            cy={-100}
            r="22"
            fill="rgb(26,24,48)"
            stroke="rgb(70,64,104)"
            strokeWidth="0.75"
          />
          <path ref={moonLitRef} d="" fill="rgb(206,201,234)" />
        </g>

        {/* ground + horizon line */}
        <rect
          ref={groundRef}
          x="0"
          y={HORIZON}
          width={VW}
          height={VH - HORIZON}
          fill="rgb(6,6,10)"
        />
        <line
          x1="0"
          y1={HORIZON}
          x2={VW}
          y2={HORIZON}
          stroke="rgb(120,116,150)"
          strokeWidth="1"
          opacity="0.4"
        />
      </svg>

      {/* always-on status line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-foreground">astronomy · computed</span>
        <span className={feedIsLive ? "text-foreground" : "text-muted-foreground"}>
          {readout.liveLabel}
        </span>
        <span>{readout.geoLabel}</span>
        <span>clock {readout.clock}</span>
        <span
          className={
            readout.sunAlt > 0 ? "text-foreground" : "text-muted-foreground/70"
          }
        >
          sun {readout.sunAlt.toFixed(0)}°
        </span>
        <span>
          {readout.phase} · {(readout.illum * 100).toFixed(0)}%
        </span>
        {audioOn && <span>take · {trackTitle}</span>}
        {audioError && <span className="text-destructive">{audioError}</span>}
      </div>

      {/* write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto max-w-md">
              <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                17760 · firmament
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                The sky&rsquo;s clock conducts a piano take
              </h1>
              <p className="mt-1 text-base text-muted-foreground">
                Where the sun and moon sit over your horizon right now performs
                one of Karel&rsquo;s real recordings — a daylight voice that
                slowly turns to a night-voice as the sun sets and the moon rises.
              </p>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {started ? "Begin again" : "Begin"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Mute
                </button>
              )}
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

          {/* controls: take + demo-day */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="take"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                take
              </label>
              <select
                id="take"
                value={trackId}
                onChange={(e) => onSelectTrack(e.target.value)}
                disabled={loadingTrack}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {REAL_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              {loadingTrack && (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  loading…
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onToggleDemo(!demoOn)}
              aria-pressed={demoOn}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                demoOn
                  ? "border-primary bg-primary/15 text-foreground hover:bg-primary/25"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Demo day · {demoOn ? "on" : "off"}
            </button>
          </div>
        </div>
      )}

      {/* immersive exit pill */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {!started && !immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            The sky is already sweeping a full day. Press{" "}
            <span className="text-foreground">Begin</span> to hear the piano turn
            from daylight to a night-voice as the sun sets and the moon rises.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-3 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              The diurnal clock as a score
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The sun&rsquo;s altitude over your horizon is computed on-device
              from solar declination, the equation of time and local solar hour
              angle — no network, always correct. It crossfades three sustained
              readings of one decoded take: a bright, present, drier day voice; a
              night voice an octave down, reverb-wet and darkened; and, only when
              it is real nighttime and the moon is up, a quiet octave-up silver
              overlay scaled by the moon&rsquo;s illuminated fraction — near-silent
              at new moon, a clear line near full. Dawn and dusk are the crossfade
              band around the horizon.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              An optional open-meteo reading adds a veil: cloud cover lowers a
              shared lowpass, wind adds a faint air/detune. If it is blocked or
              slow it is simply treated as clear, offline. Geolocation is
              requested briefly and falls back to San Francisco. Every sound is
              Karel&rsquo;s one take, routed through the shared ear-safety master —
              no synths, no oscillators, no microphone.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Demo day (on by default) sweeps a full 24 hours in about 90 seconds
              so the whole morph is unmistakable in seconds; off, it follows the
              true current time. After the data-sonification and auditory-display
              lineage (ICAD): the sky&rsquo;s own clock, read in real time as a
              performance of place and time.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!immersive && (
        <PrototypeNav slugs={["17728-overhead", "17616-tremor"]} />
      )}
    </main>
  );
}

// ── small SVG helpers (module scope; not React hooks) ─────────────────────────
function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
function rgb(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}
function setStop(el: SVGStopElement | null, c: [number, number, number]) {
  if (el) el.setAttribute("stop-color", rgb(c));
}
function place(
  el: SVGCircleElement | null,
  x: number,
  y: number,
  opacity: number,
) {
  if (!el) return;
  el.setAttribute("cx", x.toFixed(1));
  el.setAttribute("cy", y.toFixed(1));
  el.setAttribute("opacity", clamp(opacity, 0, 1).toFixed(3));
}
