"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 20960-faultline — "What if the planet's LIVE earthquakes reached into one of
// Karel's piano recordings and froze it — each real tremor blooming his take
// into a spectral cloud you fly your hand across?"
//
// A real-world-data SONIFICATION piece. The USGS all-day earthquake feed is
// fetched CLIENT-SIDE and painted as a dark world map. Your hand (camera) — or
// your pointer, the exact same control — is a cursor flying over that map.
// DWELLING on a tremor CAPTURES Karel's recording and FREEZES it: a genuine
// overlap-add granular spectral freeze (see SpectralFreeze below) holds and
// smears a windowed snapshot of his take into a sustained, blooming spectral
// cloud whose size, darkness, pan and shimmer are shaped MANY-TO-MANY by that
// quake's magnitude, depth, longitude and recency.
//
// This is deliberately NOT a bandpass-filter bank: there is no parallel biquad
// chord tuned over a dry take. The sustain comes from many short, overlapping,
// randomized-offset grains read from a frozen read-head — the classic granular
// freeze — tilted by a single depth-driven lowpass+shelf. Lineage: "Sounds of
// Seismic" (sos.allshookup.org), browser-based live-seismic-to-music.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createHandTracker,
  startCamera,
  HAND_LM,
  type HandLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── palette (canvas art only — raw hsl, no green/teal) ───────────────────────
const BG = "hsl(246 48% 4%)";
const GRID = "hsl(250 38% 13%)";
const FAULT = "hsl(258 44% 20%)";
const violet = (a: number, l = 62) => `hsl(270 74% ${l}% / ${a})`;
const bone = (a: number, l = 92) => `hsl(42 36% ${l}% / ${a})`;

// ── the live feed ────────────────────────────────────────────────────────────
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const POLL_MS = 60_000;

interface Quake {
  mag: number;
  lon: number;
  lat: number;
  depthKm: number;
  place: string;
  time: number; // ms epoch
}

// Graceful degradation: if the fetch fails (offline / CORS / error) we fall
// back to this embedded snapshot so the piece ALWAYS sounds. Plausible recent
// quakes around the Ring of Fire + mid-Atlantic; times are offsets from load.
const NOW0 = Date.now();
const SNAPSHOT: Quake[] = [
  { mag: 6.4, lon: 142.37, lat: 38.3, depthKm: 29, place: "off the east coast of Honshu, Japan", time: NOW0 - 11 * 60_000 },
  { mag: 5.1, lon: -122.81, lat: 38.82, depthKm: 7, place: "Northern California", time: NOW0 - 34 * 60_000 },
  { mag: 4.7, lon: -70.74, lat: -30.1, depthKm: 58, place: "Coquimbo, Chile", time: NOW0 - 72 * 60_000 },
  { mag: 3.2, lon: -116.44, lat: 33.3, depthKm: 12, place: "Anza, California", time: NOW0 - 95 * 60_000 },
  { mag: 5.8, lon: 127.1, lat: 1.9, depthKm: 104, place: "Molucca Sea", time: NOW0 - 140 * 60_000 },
  { mag: 4.2, lon: 25.7, lat: 38.1, depthKm: 9, place: "Aegean Sea", time: NOW0 - 180 * 60_000 },
  { mag: 2.6, lon: -149.9, lat: 61.3, depthKm: 41, place: "Southern Alaska", time: NOW0 - 220 * 60_000 },
  { mag: 6.9, lon: -176.0, lat: -19.8, depthKm: 231, place: "Fiji region", time: NOW0 - 260 * 60_000 },
  { mag: 3.9, lon: 13.2, lat: 42.4, depthKm: 10, place: "central Italy", time: NOW0 - 330 * 60_000 },
  { mag: 4.4, lon: 92.3, lat: 23.1, depthKm: 36, place: "Myanmar–India border", time: NOW0 - 420 * 60_000 },
  { mag: 5.3, lon: -87.0, lat: 12.1, depthKm: 66, place: "near the coast of Nicaragua", time: NOW0 - 540 * 60_000 },
  { mag: 2.9, lon: -27.2, lat: 38.6, depthKm: 8, place: "Azores Islands region", time: NOW0 - 680 * 60_000 },
];

// ── small math ───────────────────────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic 0..1 hash of a quake → which MOMENT of the take it freezes. */
function makeHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Newest quake → 1, ~24 h old → 0. Drives shimmer + visual brightness. */
function recencyOf(q: Quake, now: number): number {
  return clamp01(1 - (now - q.time) / (24 * 3600_000));
}

// map a lon/lat to the equirectangular unit square
const lonToX = (lon: number) => (lon + 180) / 360;
const latToY = (lat: number) => (90 - lat) / 180;

// ── the spectral-freeze engine ───────────────────────────────────────────────
//
// SpectralFreeze is an overlap-add GRANULAR freeze, NOT a filter bank. It holds
// a read-head frozen inside Karel's buffer and keeps firing many short, Hann-
// windowed grains from positions jittered around that head. Dense overlap (~4×)
// of randomized-offset / slightly-detuned grains sustains and SMEARS the frozen
// spectral snapshot into a shimmering cloud. One depth-driven lowpass + high-
// shelf tilts it dark/bright; a stereo panner places it by longitude.

interface Freeze {
  // smoothed, scheduler-read values (current)
  head: number; // read position (s) in the buffer — the frozen moment
  spread: number; // ± jitter window (s): bigger quake → wider → denser cloud
  grainDur: number; // grain length (s)
  detune: number; // ± playbackRate shimmer
  jitter: number; // grain-interval randomness (recency)
  // targets (set each frame by the capture logic, lerped into the above)
  headT: number;
  spreadT: number;
  grainDurT: number;
  detuneT: number;
  jitterT: number;
  // AudioParam targets
  levelT: number;
  tiltFreqT: number;
  tiltShelfT: number;
  panT: number;
}

interface AudioBundle {
  ac: AudioContext;
  master: SafeMaster;
  buffer: AudioBuffer;
  bus: GainNode;
  tiltLow: BiquadFilterNode;
  tiltShelf: BiquadFilterNode;
  panner: StereoPannerNode;
  data: Uint8Array<ArrayBuffer>;
  nextGrainTime: number;
}

const IDLE_LEVEL = 0.1;
const IDLE_SPREAD = 0.4;

function makeAudio(
  ac: AudioContext,
  master: SafeMaster,
  buffer: AudioBuffer,
): AudioBundle {
  // grains → bus → tiltLow (lowpass) → tiltShelf (highshelf) → panner → master
  const bus = ac.createGain();
  bus.gain.value = IDLE_LEVEL;

  const tiltLow = ac.createBiquadFilter();
  tiltLow.type = "lowpass";
  tiltLow.frequency.value = 4000;
  tiltLow.Q.value = 0.5;

  const tiltShelf = ac.createBiquadFilter();
  tiltShelf.type = "highshelf";
  tiltShelf.frequency.value = 2200;
  tiltShelf.gain.value = -2;

  const panner = ac.createStereoPanner();
  panner.pan.value = 0;

  bus.connect(tiltLow);
  tiltLow.connect(tiltShelf);
  tiltShelf.connect(panner);
  panner.connect(master.input);

  return {
    ac,
    master,
    buffer,
    bus,
    tiltLow,
    tiltShelf,
    panner,
    data: new Uint8Array(master.analyser.frequencyBinCount),
    nextGrainTime: ac.currentTime + 0.05,
  };
}

/** Fire one Hann-windowed grain from a jittered offset around the frozen head. */
function spawnGrain(a: AudioBundle, fr: Freeze, t: number): void {
  const dur = fr.grainDur;
  const src = a.ac.createBufferSource();
  src.buffer = a.buffer;
  // slight per-grain detune = shimmer / spectral smear (never a tuned chord)
  src.playbackRate.value = 1 + (Math.random() * 2 - 1) * fr.detune;
  const g = a.ac.createGain();
  g.gain.value = 0;
  src.connect(g);
  g.connect(a.bus);

  const maxStart = Math.max(0, a.buffer.duration - dur - 0.02);
  let off = fr.head + (Math.random() * 2 - 1) * fr.spread;
  if (off < 0) off = 0;
  if (off > maxStart) off = maxStart;

  const peak = 0.5;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.5);
  g.gain.linearRampToValueAtTime(0, t + dur);

  try {
    src.start(t, off, dur + 0.03);
    src.stop(t + dur + 0.04);
  } catch {
    /* ctx closing */
  }
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* already gone */
    }
  };
}

/** Lookahead scheduler: keep the overlap-add freeze topped up ahead of time. */
function runScheduler(a: AudioBundle, fr: Freeze): void {
  const lookahead = 0.14;
  const overlap = 4;
  const now = a.ac.currentTime;
  if (a.nextGrainTime < now) a.nextGrainTime = now; // recover from stalls
  let guard = 0;
  while (a.nextGrainTime < now + lookahead && guard++ < 64) {
    spawnGrain(a, fr, a.nextGrainTime);
    const interval = Math.max(0.012, fr.grainDur / overlap);
    a.nextGrainTime += interval * (1 + (Math.random() * 2 - 1) * 0.35 * fr.jitter);
  }
}

// ── per-quake → audio parameter mapping (many-to-many) ───────────────────────
interface ParamSet {
  level: number;
  head: number;
  spread: number;
  grainDur: number;
  detune: number;
  jitter: number;
  tiltFreq: number;
  tiltShelf: number;
  pan: number;
}

function makeParams(q: Quake, duration: number, now: number): ParamSet {
  const magN = clamp01((q.mag - 1) / 6); // M1..M7
  const depthN = clamp01(q.depthKm / 600); // 0..600 km
  const rec = recencyOf(q, now);
  const maxStart = Math.max(0, duration - 0.3);
  return {
    // magnitude → level + window width + grain length (bigger = bigger, denser cloud)
    level: 0.22 + magN * 0.66,
    spread: 0.05 + magN * 0.6,
    grainDur: 0.08 + magN * 0.13,
    // depth → spectral tilt (deep = dark/muffled, shallow = bright)
    tiltFreq: 9000 * Math.pow(380 / 9000, depthN),
    tiltShelf: lerp(3, -14, depthN),
    // recency → shimmer / grain jitter
    detune: 0.004 + rec * 0.03,
    jitter: rec,
    // longitude → stereo pan
    pan: clamp(q.lon / 180, -1, 1),
    // each tremor freezes a DIFFERENT moment of the take
    head: makeHash(q.place + q.time) * maxStart,
  };
}

// ── visuals ──────────────────────────────────────────────────────────────────
interface Pulse {
  x: number;
  y: number;
  r: number;
  mag: number;
}

interface FaultLine {
  pts: Array<[number, number]>;
}

/** A few stylised jagged fault lines so the idle map breathes. Seeded once. */
function makeFaults(): FaultLine[] {
  const lines: FaultLine[] = [];
  const seeds = [
    [0.08, 0.28],
    [0.52, 0.18],
    [0.2, 0.62],
    [0.66, 0.55],
    [0.4, 0.78],
  ];
  for (const [sx, sy] of seeds) {
    const pts: Array<[number, number]> = [];
    let x = sx;
    let y = sy;
    let ph = sx * 9 + sy * 7;
    for (let i = 0; i < 26; i++) {
      pts.push([clamp01(x), clamp01(y)]);
      ph += 0.9;
      x += 0.035;
      y += Math.sin(ph) * 0.03 + (Math.random() - 0.5) * 0.012;
    }
    lines.push({ pts });
  }
  return lines;
}

interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  time: number;
  energy: number; // 0..1 analyser level
  quakes: Quake[];
  faults: FaultLine[];
  pulses: Pulse[];
  cursor: { x: number; y: number; active: boolean };
  targetIdx: number;
  capture: number; // 0..1
  now: number;
}

function drawScene(d: DrawArgs): void {
  const { ctx, w, h, time, energy, quakes, faults, pulses, cursor, targetIdx, capture, now } = d;

  // substrate
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // faint graticule
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (let i = 1; i < 12; i++) {
    const x = (i / 12) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let j = 1; j < 6; j++) {
    const y = (j / 6) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // fault lines with a slow tremor shimmer travelling along them
  for (const f of faults) {
    ctx.beginPath();
    for (let i = 0; i < f.pts.length; i++) {
      const [px, py] = f.pts[i];
      const wob = Math.sin(time * 1.3 + i * 0.6 + px * 6) * 2.2;
      const X = px * w;
      const Y = py * h + wob;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = FAULT;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // idle tremor pulses rippling across the map
  for (const p of pulses) {
    const a = clamp01(1 - p.r / (0.14 + p.mag * 0.02));
    if (a <= 0) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, p.r * w, 0, Math.PI * 2);
    ctx.strokeStyle = violet(a * 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // quakes
  for (let i = 0; i < quakes.length; i++) {
    const q = quakes[i];
    const x = lonToX(q.lon) * w;
    const y = latToY(q.lat) * h;
    const rec = recencyOf(q, now);
    const r = 1.6 + clamp01((q.mag - 1) / 6) * 13;
    const pulse = 0.6 + 0.4 * Math.sin(time * 2 + i);
    // newer = brighter bone-white core; older = dim violet
    const coreA = 0.25 + rec * 0.6;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    grd.addColorStop(0, bone(coreA * pulse, 90));
    grd.addColorStop(0.4, violet(0.32 * (0.4 + rec)));
    grd.addColorStop(1, violet(0));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = bone(0.3 + rec * 0.6, 94);
    ctx.fill();
  }

  // the captured quake blooms into a spectral cloud synced to the analyser
  if (targetIdx >= 0 && targetIdx < quakes.length && capture > 0.01) {
    const q = quakes[targetIdx];
    const x = lonToX(q.lon) * w;
    const y = latToY(q.lat) * h;
    const magN = clamp01((q.mag - 1) / 6);
    const base = (24 + magN * 120) * (0.6 + energy * 0.9) * capture;
    // concentric smeared shells + scattered grain dots
    for (let s = 0; s < 5; s++) {
      const rr = base * (0.4 + s * 0.22) * (0.9 + 0.1 * Math.sin(time * 3 + s));
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.strokeStyle = violet((0.3 - s * 0.045) * capture, 60 + s * 4);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const dots = Math.floor(18 + magN * 60);
    for (let k = 0; k < dots; k++) {
      const ang = (k / dots) * Math.PI * 2 + time * (0.3 + magN);
      const rad = base * (0.2 + Math.abs(Math.sin(k * 2.3 + time)) * (0.8 + energy));
      const dx = x + Math.cos(ang) * rad;
      const dy = y + Math.sin(ang) * rad * 0.7;
      ctx.beginPath();
      ctx.arc(dx, dy, 1 + energy * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = bone(0.12 + energy * 0.5 * capture, 92);
      ctx.fill();
    }
    // bright nucleus
    const ng = ctx.createRadialGradient(x, y, 0, x, y, base * 0.6);
    ng.addColorStop(0, bone(0.5 * capture, 96));
    ng.addColorStop(1, violet(0));
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.arc(x, y, base * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // cursor (your hand / pointer flying over the planet)
  if (cursor.active) {
    const cx = cursor.x * w;
    const cy = cursor.y * h;
    ctx.strokeStyle = violet(0.85, 70);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 13 + capture * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx, cy + 20);
    ctx.strokeStyle = bone(0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ── component ────────────────────────────────────────────────────────────────
type FeedStatus = "loading" | "live" | "offline";
type CamStatus = "off" | "loading" | "live" | "lost" | "denied";

const PRIMARY_BTN =
  "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
const GHOST_BTN =
  "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
const MONO = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

export default function FaultlinePage() {
  const { immersive, toggle } = useImmersive();

  const [playing, setPlaying] = useState(false);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>(REAL_TRACKS[0].title);
  const [audioError, setAudioError] = useState<string | null>(null);

  const [feedStatus, setFeedStatus] = useState<FeedStatus>("loading");
  const [quakeCount, setQuakeCount] = useState(0);
  const [camStatus, setCamStatus] = useState<CamStatus>("off");
  const [notesOpen, setNotesOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const quakesRef = useRef<Quake[]>(SNAPSHOT);
  const faultsRef = useRef<FaultLine[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const cursorRef = useRef({ x: 0.5, y: 0.45, active: false });
  const audioRef = useRef<AudioBundle | null>(null);
  const freezeRef = useRef<Freeze>({
    head: 0,
    spread: IDLE_SPREAD,
    grainDur: 0.11,
    detune: 0.006,
    jitter: 0.3,
    headT: 0,
    spreadT: IDLE_SPREAD,
    grainDurT: 0.11,
    detuneT: 0.006,
    jitterT: 0.3,
    levelT: IDLE_LEVEL,
    tiltFreqT: 4000,
    tiltShelfT: -2,
    panT: 0,
  });
  const captureRef = useRef(0);
  const targetRef = useRef(-1);
  const energyRef = useRef(0);
  const rafRef = useRef(0);
  const lastPulseRef = useRef(0);
  const trackerRef = useRef<HandLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  if (faultsRef.current.length === 0) faultsRef.current = makeFaults();

  // ── live USGS feed, re-polled every ~60 s, with embedded fallback ──────────
  useEffect(() => {
    let alive = true;

    const apply = (qs: Quake[], status: FeedStatus) => {
      if (!alive) return;
      quakesRef.current = qs;
      setQuakeCount(qs.length);
      setFeedStatus(status);
    };

    const poll = async () => {
      try {
        const res = await fetch(USGS_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          features?: Array<{
            properties?: { mag?: number | null; place?: string; time?: number };
            geometry?: { coordinates?: number[] };
          }>;
        };
        const feats = json.features ?? [];
        const qs: Quake[] = [];
        for (const f of feats) {
          const c = f.geometry?.coordinates;
          const mag = f.properties?.mag;
          if (!c || c.length < 3 || mag == null) continue;
          qs.push({
            mag,
            lon: c[0],
            lat: c[1],
            depthKm: c[2],
            place: f.properties?.place ?? "unknown",
            time: f.properties?.time ?? Date.now(),
          });
        }
        if (qs.length > 0) apply(qs, "live");
        else apply(SNAPSHOT, "offline");
      } catch {
        apply(SNAPSHOT, "offline");
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // ── canvas sizing ──────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.max(2, Math.floor(w * dpr));
    canvas.height = Math.max(2, Math.floor(h * dpr));
  }, []);

  // ── the always-on visual + audio render loop ───────────────────────────────
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const time = performance.now() / 1000;
    const now = Date.now();
    const quakes = quakesRef.current;

    // hand tracking (overrides pointer when a hand is found)
    const tracker = trackerRef.current;
    const video = videoRef.current;
    if (tracker && video && video.readyState >= 2) {
      try {
        const res = tracker.detectForVideo(video, performance.now());
        const lm = res.landmarks?.[0];
        if (lm && lm[HAND_LM.indexTip]) {
          const tip = lm[HAND_LM.indexTip];
          // MIRROR x — the camera is user-facing
          cursorRef.current.x = clamp01(1 - tip.x);
          cursorRef.current.y = clamp01(tip.y);
          cursorRef.current.active = true;
          setCamStatus("live");
        } else {
          setCamStatus("lost");
        }
      } catch {
        /* skip a frame */
      }
    }

    const cur = cursorRef.current;

    // ── capture logic: nearest quake within reach, dwell → bloom ──
    let bestI = -1;
    let bestD = Infinity;
    for (let i = 0; i < quakes.length; i++) {
      const q = quakes[i];
      const dx = lonToX(q.lon) - cur.x;
      const dy = latToY(q.lat) - cur.y;
      const d = Math.hypot(dx, dy * 0.9);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    const radius = 0.06;
    const prox = cur.active && bestI >= 0 && bestD < radius ? 1 - bestD / radius : 0;
    if (prox > 0) targetRef.current = bestI;
    // slow attack (rewards dwelling), gentle release
    const k = prox > captureRef.current ? 0.035 : 0.02;
    captureRef.current += (prox - captureRef.current) * k;
    const capture = captureRef.current;

    const fr = freezeRef.current;
    const audio = audioRef.current;
    if (audio) {
      const dur = audio.buffer.duration;
      const idleHead = (time * 0.03) % Math.max(0.3, dur - 0.3);
      if (targetRef.current >= 0 && targetRef.current < quakes.length) {
        const p = makeParams(quakes[targetRef.current], dur, now);
        fr.levelT = lerp(IDLE_LEVEL, p.level, capture);
        fr.headT = lerp(idleHead, p.head, capture);
        fr.spreadT = lerp(IDLE_SPREAD, p.spread, capture);
        fr.grainDurT = lerp(0.11, p.grainDur, capture);
        fr.detuneT = lerp(0.006, p.detune, capture);
        fr.jitterT = lerp(0.3, p.jitter, capture);
        fr.tiltFreqT = lerp(4000, p.tiltFreq, capture);
        fr.tiltShelfT = lerp(-2, p.tiltShelf, capture);
        fr.panT = lerp(0, p.pan, capture);
      } else {
        fr.headT = idleHead;
        fr.levelT = IDLE_LEVEL;
      }

      // smooth the scheduler-read JS values
      const s = 0.08;
      fr.head += (fr.headT - fr.head) * s;
      fr.spread += (fr.spreadT - fr.spread) * s;
      fr.grainDur += (fr.grainDurT - fr.grainDur) * s;
      fr.detune += (fr.detuneT - fr.detune) * s;
      fr.jitter += (fr.jitterT - fr.jitter) * s;

      // apply AudioParams (smoothed on the audio thread)
      const t = audio.ac.currentTime;
      audio.bus.gain.setTargetAtTime(fr.levelT, t, 0.12);
      audio.tiltLow.frequency.setTargetAtTime(fr.tiltFreqT, t, 0.12);
      audio.tiltShelf.gain.setTargetAtTime(fr.tiltShelfT, t, 0.12);
      audio.panner.pan.setTargetAtTime(fr.panT, t, 0.12);

      // keep the overlap-add freeze fed, read analyser energy
      runScheduler(audio, fr);
      audio.master.analyser.getByteFrequencyData(audio.data);
      let sum = 0;
      for (let i = 0; i < audio.data.length; i++) sum += audio.data[i];
      energyRef.current = clamp01(sum / audio.data.length / 160);
    } else {
      energyRef.current *= 0.95;
    }

    // tremor pulses: periodically emit from a recent/large quake
    if (time - lastPulseRef.current > 1.1 && quakes.length > 0) {
      lastPulseRef.current = time;
      // prefer recent + strong
      let pick = 0;
      let bestScore = -Infinity;
      for (let i = 0; i < quakes.length; i++) {
        const q = quakes[i];
        const score = recencyOf(q, now) * 2 + q.mag + Math.random();
        if (score > bestScore) {
          bestScore = score;
          pick = i;
        }
      }
      const q = quakes[pick];
      pulsesRef.current.push({ x: lonToX(q.lon), y: latToY(q.lat), r: 0.004, mag: q.mag });
    }
    for (const p of pulsesRef.current) p.r += 0.0016 + p.mag * 0.00018;
    pulsesRef.current = pulsesRef.current.filter((p) => p.r < 0.14 + p.mag * 0.02);

    drawScene({
      ctx,
      w,
      h,
      time,
      energy: energyRef.current,
      quakes,
      faults: faultsRef.current,
      pulses: pulsesRef.current,
      cursor: cur,
      targetIdx: targetRef.current,
      capture,
      now,
    });
  }, []);

  // start the visual loop on mount; alive before any audio
  useEffect(() => {
    sizeCanvas();
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [renderLoop, sizeCanvas]);

  // ── camera (enhancement on top of the always-working pointer path) ─────────
  const startTracking = useCallback(async () => {
    setCamStatus("loading");
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCamStatus("denied");
      return;
    }
    try {
      const stream = await startCamera(video);
      streamRef.current = stream;
    } catch {
      setCamStatus("denied");
      return;
    }
    try {
      const tracker = await createHandTracker(1);
      trackerRef.current = tracker;
      setCamStatus("lost");
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamStatus("denied");
    }
  }, []);

  const stopTracking = useCallback(() => {
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // the pointer keeps driving the same cursor — nothing else to reset here
    setCamStatus("off");
  }, []);

  // ── play / stop audio ──────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (playing || loadingAudio) return;
    setAudioError(null);
    setLoadingAudio(true);
    let ac: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
    } catch {
      setAudioError("Web Audio is unavailable in this browser — the piece cannot sound here.");
      setLoadingAudio(false);
      return;
    }
    try {
      const { buffer, title } = await loadRealTrackBuffer(ac, trackId);
      const master = createSafeMaster(ac);
      audioRef.current = makeAudio(ac, master, buffer);
      setTrackTitle(title);
      setPlaying(true);
    } catch {
      setAudioError("Karel's recording could not load — check the connection and try again.");
      void ac.close();
    } finally {
      setLoadingAudio(false);
    }
  }, [playing, loadingAudio, trackId]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    setPlaying(false);
    if (audio) {
      try {
        audio.master.disconnect();
      } catch {
        /* closing */
      }
      const ac = audio.ac;
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 300);
    }
  }, []);

  // cleanup everything on unmount
  useEffect(() => {
    return () => {
      trackerRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.master.disconnect();
        } catch {
          /* closing */
        }
        if (audio.ac.state !== "closed") void audio.ac.close();
      }
    };
  }, []);

  // ── pointer: the exact, always-available control ───────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    cursorRef.current.x = clamp01((e.clientX - rect.left) / rect.width);
    cursorRef.current.y = clamp01((e.clientY - rect.top) / rect.height);
    cursorRef.current.active = true;
  }, []);

  const camLine =
    camStatus === "live"
      ? "tracking · live"
      : camStatus === "lost"
        ? "hand lost · show one hand, or just move your mouse"
        : camStatus === "loading"
          ? "camera · loading"
          : camStatus === "denied"
            ? "camera off · pointer control (move your mouse)"
            : "pointer control · camera optional";
  const camTone = camStatus === "lost" || camStatus === "denied" ? "text-destructive" : "text-muted-foreground";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      {/* stage */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerMove}
      />
      {/* hidden camera feed */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* light overlay strip (hidden while immersive) */}
      {!immersive && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-5 sm:p-6">
          <div className="pointer-events-auto max-w-xl">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Faultline
            </h1>
            <p className="mt-1 max-w-md text-base leading-relaxed text-muted-foreground">
              The planet&rsquo;s live earthquakes reach into Karel&rsquo;s piano and freeze it. Fly
              your hand (or mouse) across the tremor map and dwell on a quake to bloom his take into
              a spectral cloud tuned by that quake&rsquo;s magnitude, depth, longitude and age.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!playing ? (
                <button type="button" className={PRIMARY_BTN} onClick={() => void start()} disabled={loadingAudio}>
                  {loadingAudio ? "Loading…" : "Play"}
                </button>
              ) : (
                <button type="button" className={GHOST_BTN} onClick={stop}>
                  Stop
                </button>
              )}

              {camStatus === "off" || camStatus === "denied" ? (
                <button type="button" className={GHOST_BTN} onClick={() => void startTracking()}>
                  Use hand camera
                </button>
              ) : (
                <button type="button" className={GHOST_BTN} onClick={stopTracking}>
                  Stop camera
                </button>
              )}

              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={playing}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                aria-label="Choose one of Karel's recordings"
              >
                {REAL_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {audioError && <p className="mt-3 text-sm text-destructive">{audioError}</p>}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <span className={MONO}>
                {feedStatus === "loading"
                  ? "feed · connecting"
                  : feedStatus === "live"
                    ? `live feed · ${quakeCount} quakes`
                    : `offline snapshot · demo data (${quakeCount})`}
              </span>
              <span className={`${MONO} ${camTone}`}>{camLine}</span>
              {playing && <span className={MONO}>freezing · {trackTitle}</span>}
            </div>
          </div>

          {/* design notes, bottom corner */}
          <div className="pointer-events-auto flex items-end justify-between">
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className={`${GHOST_BTN} px-3`}
            >
              Read the design notes
            </button>
            <ImmersiveHud
              immersive={immersive}
              onToggle={toggle}
              title="Faultline"
              description="The planet's live earthquakes freeze one of Karel's piano recordings — each real tremor blooms his take into a sustained spectral cloud you fly your hand across, tuned by the quake's magnitude, depth, longitude and age."
              howTo={[
                "Press Play, headphones on",
                "Move your hand (or mouse) across the live quake map",
                "Dwell on a tremor to freeze your piano into its spectral bloom",
                "Press f for fullscreen, i for info",
              ]}
            />
          </div>
        </div>
      )}

      {/* while immersive: only HUD + camera status + errors */}
      {immersive && (
        <>
          <div className="pointer-events-none fixed left-5 top-5 z-30 flex flex-col gap-1">
            <span className={`${MONO} ${camTone}`}>{camLine}</span>
            {audioError && <span className="text-sm text-destructive">{audioError}</span>}
          </div>
          <ImmersiveHud
            immersive={immersive}
            onToggle={toggle}
            title="Faultline"
            description="The planet's live earthquakes freeze one of Karel's piano recordings — each real tremor blooms his take into a sustained spectral cloud you fly your hand across, tuned by the quake's magnitude, depth, longitude and age."
            howTo={[
              "Press Play, headphones on",
              "Move your hand (or mouse) across the live quake map",
              "Dwell on a tremor to freeze your piano into its spectral bloom",
              "Press f for fullscreen, i for info",
            ]}
          />
        </>
      )}

      {/* design-notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Faultline — design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A real-world-data sonification. The USGS all-day earthquake feed is fetched in your
                browser and painted as a dark world map (equirectangular). Your hand — tracked by the
                webcam — or your pointer is a cursor flying over it. Both drive the identical chain.
              </p>
              <p>
                Dwelling on a tremor <em>freezes</em> Karel&rsquo;s recording. This is a genuine
                overlap-add granular spectral freeze: a read-head is held inside his buffer and many
                short, randomized-offset, slightly-detuned grains overlap to sustain and smear that
                frozen moment into a shimmering cloud. It is deliberately <em>not</em> a bandpass
                filter bank — there is no tuned chord of biquads over a dry take.
              </p>
              <p>
                The mapping is many-to-many: magnitude → bloom size, level and spectral spread; depth
                → spectral tilt (deep = dark and muffled, shallow = bright); longitude → stereo pan;
                recency → shimmer and grain jitter. Each quake also freezes a different moment of the
                take.
              </p>
              <p>
                If the live feed fails, an embedded snapshot of plausible quakes keeps it sounding —
                the status line tells you which you&rsquo;re hearing. Lineage:{" "}
                <span className="text-foreground">Sounds of Seismic</span> (sos.allshookup.org),
                browser-based live-seismic-to-music.
              </p>
            </div>
            <button type="button" onClick={() => setNotesOpen(false)} className={`${GHOST_BTN} mt-5`}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
