"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1238-heliograph — a self-inking paper observatory logbook that reads the sky.
//
// The LIVE solar wind (real particles streaming off the Sun right now, via NOAA
// SWPC's public no-auth JSON products) does two things at once:
//   1. composes a slow cosmic-ambient drone (Web Audio, fully generative), and
//   2. inks itself, in real time, onto a cream vellum strip-chart logbook
//      (Canvas2D) — three stacked pen traces like an old magnetogram recorder.
//
// Everything is self-contained in this one file. On any fetch/CORS failure the
// piece falls back to a deterministic ~1-day synthetic-but-realistic series
// (a quiet day building into a CME-like storm) so it NEVER dead-screens or goes
// silent. An honest badge says which source you're hearing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

// ── types ────────────────────────────────────────────────────────────────────
interface Reading {
  speed: number; // bulk solar-wind speed, km/s
  density: number; // proton density, p/cm³
  bz: number; // Bz GSM, nT (negative = southward = drives aurora)
  bt: number; // total field |B|, nT
  kp: number; // planetary K index, 0–9
}
interface PlasmaPt {
  t: number;
  speed: number;
  density: number;
}
interface MagPt {
  t: number;
  bz: number;
  bt: number;
}
interface KpPt {
  t: number;
  kp: number;
}
interface SolarData {
  plasma: PlasmaPt[];
  mag: MagPt[];
  kp: KpPt[];
  latest: Reading;
  t0: number;
  t1: number;
  source: "live" | "offline";
  stamp: number; // ms of latest sample
}

// ── small maths ────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function parseTime(s: string): number {
  // NOAA time_tag is UTC like "2026-07-06 12:34:00.000"
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const z = /(Z|[+-]\d\d:?\d\d)$/.test(iso) ? iso : iso + "Z";
  return Date.parse(z);
}

// ── NOAA SWPC live products (public, no key, permissive CORS) ────────────────
const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

async function fetchProduct(url: string): Promise<string[][] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!Array.isArray(json) || json.length < 2) return null;
    return json as string[][];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Downsample a series to at most `max` points (keeps first & last).
function decimate<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

// Try to assemble a live sample. Returns null if we got essentially nothing.
async function fetchLive(): Promise<SolarData | null> {
  const [pRaw, mRaw, kRaw] = await Promise.all([
    fetchProduct(PLASMA_URL),
    fetchProduct(MAG_URL),
    fetchProduct(KP_URL),
  ]);
  if (!pRaw && !mRaw) return null;

  // plasma header: time_tag(0), density(1), speed(2), temperature(3)
  let plasma: PlasmaPt[] = [];
  if (pRaw) {
    for (let i = 1; i < pRaw.length; i++) {
      const r = pRaw[i];
      const t = parseTime(r?.[0]);
      const density = Number(r?.[1]);
      const speed = Number(r?.[2]);
      if (!Number.isFinite(t) || !Number.isFinite(speed)) continue;
      plasma.push({
        t,
        speed: clamp(speed, 150, 1200),
        density: Number.isFinite(density) ? clamp(density, 0, 80) : 0,
      });
    }
  }
  // mag header: time_tag(0), bx(1), by(2), bz_gsm(3), lon(4), lat(5), bt(6)
  let mag: MagPt[] = [];
  if (mRaw) {
    for (let i = 1; i < mRaw.length; i++) {
      const r = mRaw[i];
      const t = parseTime(r?.[0]);
      const bz = Number(r?.[3]);
      const bt = Number(r?.[6]);
      if (!Number.isFinite(t) || !Number.isFinite(bz)) continue;
      mag.push({
        t,
        bz: clamp(bz, -60, 60),
        bt: Number.isFinite(bt) ? clamp(bt, 0, 80) : Math.abs(bz),
      });
    }
  }
  if (plasma.length < 2 && mag.length < 2) return null;

  // window = last 24h ending at the freshest sample we have
  const lastT = Math.max(
    plasma.length ? plasma[plasma.length - 1].t : 0,
    mag.length ? mag[mag.length - 1].t : 0,
  );
  const t1 = lastT || Date.now();
  const t0 = t1 - 24 * 3600 * 1000;

  // kp header: time_tag(0), Kp(1), a_running(2), station_count(3)
  const kp: KpPt[] = [];
  if (kRaw) {
    for (let i = 1; i < kRaw.length; i++) {
      const r = kRaw[i];
      const t = parseTime(r?.[0]);
      const kpv = Number(r?.[1]);
      if (!Number.isFinite(t) || !Number.isFinite(kpv)) continue;
      if (t < t0 || t > t1 + 3600 * 1000) continue;
      kp.push({ t, kp: clamp(kpv, 0, 9) });
    }
  }

  plasma = decimate(
    plasma.filter((p) => p.t >= t0),
    480,
  );
  mag = decimate(
    mag.filter((p) => p.t >= t0),
    480,
  );

  const lastPlasma = plasma[plasma.length - 1];
  const lastMag = mag[mag.length - 1];
  const lastKp = kp[kp.length - 1];
  const latest: Reading = {
    speed: lastPlasma?.speed ?? 400,
    density: lastPlasma?.density ?? 4,
    bz: lastMag?.bz ?? 0,
    bt: lastMag?.bt ?? 4,
    kp: lastKp?.kp ?? 2,
  };

  return { plasma, mag, kp, latest, t0, t1, source: "live", stamp: t1 };
}

// ── deterministic synthetic ~1-day series (quiet → CME-like storm) ───────────
function offlineSeries(): SolarData {
  const t1 = Date.now();
  const t0 = t1 - 24 * 3600 * 1000;
  const N = 480;
  const plasma: PlasmaPt[] = [];
  const mag: MagPt[] = [];
  const kp: KpPt[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1); // 0..1 across the day
    const t = t0 + f * (t1 - t0);
    // CME shock front arrives ~60% through the day and ramps to storm
    const ramp = clamp01((f - 0.6) / 0.4);
    const speed =
      350 + ramp * 250 + 18 * Math.sin(f * 41) + 10 * Math.sin(f * 130);
    const density =
      2 + ramp * 17 + 3 * Math.sin(f * 23 + 1) + 2 * Math.sin(f * 90);
    // Bz wanders ±8 quietly, then plunges southward through the storm
    const bz =
      7 * Math.sin(f * 26) + 3 * Math.sin(f * 71) - ramp * 15 + ramp * 4 * Math.sin(f * 55);
    const bt = 3 + Math.abs(bz) * 0.55 + ramp * 5 + 1.5 * Math.sin(f * 33);
    plasma.push({ t, speed, density: clamp(density, 0.4, 30) });
    mag.push({ t, bz: clamp(bz, -22, 22), bt: clamp(bt, 2, 26) });
  }
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const t = t0 + f * (t1 - t0);
    const ramp = clamp01((f - 0.6) / 0.4);
    kp.push({ t, kp: clamp(2 + ramp * 4 + 0.6 * Math.sin(f * 12), 0, 9) });
  }
  const lp = plasma[plasma.length - 1];
  const lm = mag[mag.length - 1];
  const lk = kp[kp.length - 1];
  return {
    plasma,
    mag,
    kp,
    latest: {
      speed: lp.speed,
      density: lp.density,
      bz: lm.bz,
      bt: lm.bt,
      kp: lk.kp,
    },
    t0,
    t1,
    source: "offline",
    stamp: t1,
  };
}

async function loadData(): Promise<SolarData> {
  const live = await fetchLive();
  return live ?? offlineSeries();
}

// one-word activity state
function stateWord(r: Reading): "QUIET" | "UNSETTLED" | "STORM" {
  if (r.kp >= 5 || r.speed > 620) return "STORM";
  if (r.kp >= 3 || r.bz < -4 || r.speed > 500) return "UNSETTLED";
  return "QUIET";
}

// ── Web Audio: generative cosmic-ambient drone ───────────────────────────────
interface Engine {
  apply(r: Reading): void;
  stop(): void;
}
function startEngine(ctx: AudioContext, master: GainNode): Engine {
  const bus = ctx.createGain();
  bus.gain.value = 0.9;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 700;
  lowpass.Q.value = 0.7;
  bus.connect(lowpass);

  // dry + feedback-delay wet tail (reverb-ish, length grows with Kp)
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  lowpass.connect(dry);
  dry.connect(master);

  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.45;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  lowpass.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // harmonic partials (two detuned oscillators each → beating when Bz south)
  const harmonics = [1, 2, 3, 4, 5, 6];
  const oscList: OscillatorNode[] = [];
  const partials = harmonics.map((h, i) => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(bus);
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = i === 0 ? "sine" : "triangle";
    b.type = i === 0 ? "sine" : "triangle";
    a.connect(g);
    b.connect(g);
    a.start();
    b.start();
    oscList.push(a, b);
    return { g, a, b, h };
  });

  // aurora shimmer voice (high, tremolo) — rises when Bz southward
  const shimGain = ctx.createGain();
  shimGain.gain.value = 0;
  shimGain.connect(lowpass);
  const shim = ctx.createOscillator();
  shim.type = "sine";
  shim.connect(shimGain);
  shim.start();
  oscList.push(shim);
  const trem = ctx.createOscillator();
  trem.type = "sine";
  trem.frequency.value = 5;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = 0;
  trem.connect(tremDepth);
  tremDepth.connect(shimGain.gain);
  trem.start();
  oscList.push(trem);

  // slow amplitude LFO — the drone's breath (rate from speed & Kp)
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.1;
  lfo.connect(lfoDepth);
  lfoDepth.connect(bus.gain);
  lfo.start();
  oscList.push(lfo);

  function apply(r: Reading): void {
    const t = ctx.currentTime;
    const sN = clamp01((r.speed - 300) / 500);
    const dN = clamp01(r.density / 22);
    const south = clamp01(-r.bz / 10);
    const kN = clamp01(r.kp / 9);
    const base = 55 + sN * 30; // 55..85 Hz fundamental
    const detune = south * 20; // cents of beating

    partials.forEach((p, i) => {
      const f = base * p.h;
      p.a.frequency.setTargetAtTime(f, t, 0.4);
      p.b.frequency.setTargetAtTime(f, t, 0.4);
      p.a.detune.setTargetAtTime(-detune, t, 0.4);
      p.b.detune.setTargetAtTime(detune, t, 0.4);
      // denser plasma → more (and louder) upper partials
      const reach = 1 + dN * 5;
      const on = i === 0 ? 1 : i <= reach ? 1 : 0;
      const g = on * (0.5 / (i + 1)) * (i === 0 ? 1 : 0.35 + 0.65 * dN);
      p.g.gain.setTargetAtTime(g, t, 0.6);
    });

    lowpass.frequency.setTargetAtTime(380 + kN * 3200, t, 0.6);
    fb.gain.setTargetAtTime(0.2 + kN * 0.55, t, 0.6);
    wet.gain.setTargetAtTime(0.28 + kN * 0.42, t, 0.6);
    delay.delayTime.setTargetAtTime(0.35 + (1 - sN) * 0.3, t, 0.6);
    lfo.frequency.setTargetAtTime(0.05 + sN * 0.22 + kN * 0.16, t, 0.5);
    lfoDepth.gain.setTargetAtTime(0.07 + kN * 0.18, t, 0.5);

    shim.frequency.setTargetAtTime(base * 8 * (1 + south * 0.04), t, 0.4);
    shimGain.gain.setTargetAtTime(south * 0.05, t, 0.6);
    trem.frequency.setTargetAtTime(4 + south * 6, t, 0.4);
    tremDepth.gain.setTargetAtTime(south * 0.05, t, 0.5);
  }

  function stop(): void {
    for (const o of oscList) {
      try {
        o.stop();
      } catch {
        // already stopped
      }
    }
  }

  return { apply, stop };
}

// ── palette (iron-gall ink on warm vellum; ONE emerald aurora accent) ────────
const PAPER_TOP = "#f6efdb";
const PAPER_BOT = "#ece0c4";
const INK = "#1d2740";
const INK_SOFT = "rgba(29,39,64,0.55)";
const GRID = "rgba(90,72,42,0.16)";
const GRID_STRONG = "rgba(90,72,42,0.30)";
const LABEL = "rgba(60,48,30,0.72)";
const AURORA = "#1f9d63";

interface Geom {
  w: number;
  h: number;
  left: number;
  right: number;
  auroraTop: number;
  auroraH: number;
  lanes: { y: number; h: number }[];
}
function computeGeom(w: number, h: number): Geom {
  const left = 60;
  const right = w - 18;
  const auroraTop = 10;
  const auroraH = 34;
  const plotTop = auroraTop + auroraH + 30;
  const plotBot = h - 30;
  const gap = 22;
  const laneH = (plotBot - plotTop - gap * 2) / 3;
  const lanes = [0, 1, 2].map((i) => ({
    y: plotTop + i * (laneH + gap),
    h: laneH,
  }));
  return { w, h, left, right, auroraTop, auroraH, lanes };
}

// Bake the static logbook "board": vellum, texture, vignette, axes, gridlines,
// unit labels and time ruler. Rebuilt only on resize or when the window shifts.
function buildBoard(
  w: number,
  h: number,
  dpr: number,
  geom: Geom,
  t0: number,
  t1: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // vellum gradient
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PAPER_TOP);
  grad.addColorStop(1, PAPER_BOT);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // paper grain — deterministic faint speckle (no per-frame flicker)
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < Math.floor(w * h * 0.06); i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * 0.05;
    g.fillStyle =
      rnd() > 0.5 ? `rgba(120,95,55,${a})` : `rgba(255,250,235,${a})`;
    g.fillRect(x, y, 1, 1);
  }

  // soft vignette
  const vg = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(70,52,28,0.14)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  const mono = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  const serif = "13px Georgia, 'Times New Roman', serif";

  // lanes: [speed, bz, kp]
  const laneDefs = [
    { title: "SOLAR WIND SPEED", unit: "km/s", ticks: [300, 450, 600, 750], lo: 250, hi: 800 },
    { title: "Bz  (GSM)", unit: "nT", ticks: [-10, 0, 10], lo: -18, hi: 18 },
    { title: "PLANETARY  Kp", unit: "index", ticks: [3, 5, 7], lo: 0, hi: 9 },
  ];

  geom.lanes.forEach((ln, li) => {
    const def = laneDefs[li];
    // frame
    g.strokeStyle = INK_SOFT;
    g.lineWidth = 1;
    g.strokeRect(geom.left, ln.y, geom.right - geom.left, ln.h);

    // horizontal gridlines + value labels
    g.font = mono;
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (const tv of def.ticks) {
      const yy = ln.y + ln.h - ((tv - def.lo) / (def.hi - def.lo)) * ln.h;
      const zero = li === 1 && tv === 0;
      g.strokeStyle = zero ? GRID_STRONG : GRID;
      g.lineWidth = zero ? 1.3 : 0.8;
      g.beginPath();
      g.moveTo(geom.left, yy);
      g.lineTo(geom.right, yy);
      g.stroke();
      g.fillStyle = LABEL;
      g.fillText(String(tv), geom.left - 6, yy);
    }

    // storm threshold marker on Kp lane
    if (li === 2) {
      const yy = ln.y + ln.h - ((5 - def.lo) / (def.hi - def.lo)) * ln.h;
      g.strokeStyle = "rgba(150,40,30,0.35)";
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(geom.left, yy);
      g.lineTo(geom.right, yy);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "rgba(150,40,30,0.6)";
      g.textAlign = "left";
      g.fillText("storm ≥5", geom.left + 6, yy - 8);
    }

    // lane title + unit
    g.fillStyle = INK;
    g.font = serif;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText(def.title, geom.left + 2, ln.y - 6);
    g.fillStyle = LABEL;
    g.font = mono;
    g.textAlign = "right";
    g.fillText(def.unit, geom.right, ln.y - 6);
  });

  // time ruler along the bottom lane — hour ticks in UTC
  const bottom = geom.lanes[2];
  const span = t1 - t0;
  g.font = mono;
  g.fillStyle = LABEL;
  g.textAlign = "center";
  g.textBaseline = "top";
  const startH = new Date(t0);
  startH.setUTCMinutes(0, 0, 0);
  for (let hh = startH.getTime(); hh <= t1; hh += 6 * 3600 * 1000) {
    if (hh < t0) continue;
    const x = geom.left + ((hh - t0) / span) * (geom.right - geom.left);
    g.strokeStyle = GRID;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, bottom.y + bottom.h);
    g.lineTo(x, bottom.y + bottom.h + 5);
    g.stroke();
    const d = new Date(hh);
    const label = `${String(d.getUTCHours()).padStart(2, "0")}:00Z`;
    g.fillText(label, x, bottom.y + bottom.h + 8);
  }

  return c;
}

// Draw one scrolling pen trace with the "wet ink" pen head at the ink front.
function drawTrace(
  g: CanvasRenderingContext2D,
  pts: { t: number; v: number }[],
  ln: { y: number; h: number },
  geom: Geom,
  lo: number,
  hi: number,
  t0: number,
  t1: number,
  progress: number,
  color: string,
  southColor: string | null,
  now: number,
): void {
  if (pts.length < 2) return;
  const span = t1 - t0 || 1;
  const xOf = (t: number) =>
    geom.left + ((t - t0) / span) * (geom.right - geom.left);
  const yOf = (v: number) =>
    ln.y + ln.h - (clamp(v, lo, hi) - lo) / (hi - lo) * ln.h;
  const inkX = geom.left + progress * (geom.right - geom.left);

  // main ink stroke (only up to the pen front)
  g.lineJoin = "round";
  g.lineCap = "round";
  g.lineWidth = 1.6;
  g.strokeStyle = color;
  g.beginPath();
  let started = false;
  let lastX = geom.left;
  let lastY = yOf(pts[0].v);
  for (const p of pts) {
    const x = xOf(p.t);
    if (x > inkX) break;
    const y = yOf(p.v);
    if (!started) {
      g.moveTo(x, y);
      started = true;
    } else {
      g.lineTo(x, y);
    }
    lastX = x;
    lastY = y;
  }
  g.stroke();

  // aurora accent: re-stroke the southward (negative) segments in emerald
  if (southColor) {
    g.strokeStyle = southColor;
    g.lineWidth = 2.4;
    g.beginPath();
    let pen = false;
    for (const p of pts) {
      const x = xOf(p.t);
      if (x > inkX) break;
      const y = yOf(p.v);
      if (p.v < 0) {
        if (!pen) {
          g.moveTo(x, y);
          pen = true;
        } else g.lineTo(x, y);
      } else {
        pen = false;
      }
    }
    g.stroke();
  }

  // wet-ink pen head — a soft pulsing dot at the ink front
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
  g.fillStyle = color;
  g.beginPath();
  g.arc(lastX, lastY, 2.6 + pulse * 1.2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.25 * pulse;
  g.beginPath();
  g.arc(lastX, lastY, 6 + pulse * 4, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function HeliographPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<SolarData | null>(null);
  const boardRef = useRef<HTMLCanvasElement | null>(null);
  const geomRef = useRef<Geom | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({
    w: 0,
    h: 0,
    dpr: 1,
  });
  const inkStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const engineRef = useRef<Engine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const startedRef = useRef<boolean>(false);

  const [data, setData] = useState<SolarData | null>(null);
  const [started, setStarted] = useState(false);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // rebuild the baked board for the current size + data window
  const rebuildBoard = useCallback(() => {
    const { w, h, dpr } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const geom = computeGeom(w, h);
    geomRef.current = geom;
    const d = dataRef.current;
    const t0 = d?.t0 ?? Date.now() - 24 * 3600 * 1000;
    const t1 = d?.t1 ?? Date.now();
    boardRef.current = buildBoard(w, h, dpr, geom, t0, t1);
  }, []);

  // accept a fresh data payload: store, re-ink, retune the drone
  const ingest = useCallback(
    (d: SolarData) => {
      dataRef.current = d;
      setData(d);
      inkStartRef.current = performance.now();
      rebuildBoard();
      if (startedRef.current) engineRef.current?.apply(d.latest);
    },
    [rebuildBoard],
  );

  // mount: size the canvas, render loop (always), fetch + poll NOAA
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      rebuildBoard();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const g = canvas.getContext("2d")!;

    const frame = (now: number) => {
      const { w, h, dpr } = sizeRef.current;
      const geom = geomRef.current;
      if (w > 0 && geom) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (boardRef.current) g.drawImage(boardRef.current, 0, 0, w, h);
        else {
          g.fillStyle = PAPER_TOP;
          g.fillRect(0, 0, w, h);
        }

        const d = dataRef.current;
        // ink-in progress: pen sweeps left→right over ~2.2s, then rests at edge
        const prog = clamp01((now - inkStartRef.current) / 2200);

        // aurora band across the top — the only saturated colour on the page
        if (d) {
          const south = clamp01(-d.latest.bz / 10);
          const kN = clamp01(d.latest.kp / 9);
          const heat = clamp01(south * 0.7 + kN * 0.6);
          const ax0 = geom.left;
          const ax1 = geom.right;
          const bandY = geom.auroraTop;
          const bandH = geom.auroraH;
          const ag = g.createLinearGradient(0, bandY, 0, bandY + bandH);
          const a = 0.08 + heat * 0.6;
          ag.addColorStop(0, `rgba(31,157,99,${a * 0.15})`);
          ag.addColorStop(0.55, `rgba(55,217,138,${a})`);
          ag.addColorStop(1, `rgba(31,157,99,0)`);
          g.fillStyle = ag;
          // shimmering curtains
          g.beginPath();
          g.moveTo(ax0, bandY + bandH);
          for (let x = ax0; x <= ax1; x += 6) {
            const fx = (x - ax0) / (ax1 - ax0);
            const wob =
              Math.sin(fx * 22 + now * 0.0011) * (2 + heat * 6) +
              Math.sin(fx * 8 - now * 0.0006) * (2 + heat * 5);
            g.lineTo(x, bandY + 4 + wob + (1 - heat) * bandH * 0.4);
          }
          g.lineTo(ax1, bandY + bandH);
          g.closePath();
          g.fill();

          g.font = "11px ui-monospace, monospace";
          g.textAlign = "left";
          g.textBaseline = "middle";
          g.fillStyle =
            heat > 0.25 ? "rgba(20,90,55,0.85)" : "rgba(90,72,42,0.6)";
          g.fillText(
            heat > 0.5
              ? "AURORA — Bz southward, magnetosphere coupling"
              : "auroral oval — quiet",
            ax0 + 4,
            bandY + bandH * 0.5,
          );
        }

        // three pen traces
        if (d) {
          drawTrace(
            g,
            d.plasma.map((p) => ({ t: p.t, v: p.speed })),
            geom.lanes[0],
            geom,
            250,
            800,
            d.t0,
            d.t1,
            prog,
            INK,
            null,
            now,
          );
          drawTrace(
            g,
            d.mag.map((p) => ({ t: p.t, v: p.bz })),
            geom.lanes[1],
            geom,
            -18,
            18,
            d.t0,
            d.t1,
            prog,
            INK,
            AURORA,
            now,
          );
          drawTrace(
            g,
            d.kp.map((p) => ({ t: p.t, v: p.kp })),
            geom.lanes[2],
            geom,
            0,
            9,
            d.t0,
            d.t1,
            prog,
            INK,
            null,
            now,
          );
        } else {
          g.fillStyle = INK_SOFT;
          g.font = "13px Georgia, serif";
          g.textAlign = "center";
          g.fillText(
            "awaiting first transmission from the Sun…",
            w / 2,
            h / 2,
          );
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // fetch immediately, then slow re-poll
    void loadData().then(ingest);
    const poll = setInterval(() => void loadData().then(ingest), 60000);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(poll);
      ro.disconnect();
    };
  }, [ingest, rebuildBoard]);

  // Start button — the user gesture that unlocks + ramps up audio
  const begin = useCallback(async () => {
    if (startedRef.current) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setAudioNote(
        "Web Audio is unavailable in this browser — the logbook still inks live data, silently.",
      );
      startedRef.current = true;
      setStarted(true);
      return;
    }
    try {
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
      const engine = startEngine(ctx, master);
      engineRef.current = engine;
      startedRef.current = true;
      setStarted(true);
      if (dataRef.current) engine.apply(dataRef.current.latest);
    } catch {
      setAudioNote("Audio failed to start — the visual logbook continues.");
      startedRef.current = true;
      setStarted(true);
    }
  }, []);

  // tidy audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      void ctxRef.current?.close();
    };
  }, []);

  const latest = data?.latest;
  const word = latest ? stateWord(latest) : "—";
  const wordColor =
    word === "STORM"
      ? "text-violet-800"
      : word === "UNSETTLED"
        ? "text-violet-800"
        : "text-violet-800";
  const stampStr = data
    ? new Date(data.stamp).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "—";

  return (
    <main
      className="min-h-screen w-full px-5 py-6 sm:px-8"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #f8f1de 0%, #efe4c8 55%, #e6d8b8 100%)",
        color: "#1d2740",
      }}
    >
      {/* header */}
      <header className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1
            className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Heliograph
          </h1>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
              data?.source === "live"
                ? "border-violet-700/40 bg-violet-50 text-violet-900"
                : data?.source === "offline"
                  ? "border-violet-700/40 bg-violet-50 text-violet-900"
                  : "border-stone-400/40 bg-stone-100 text-stone-700"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                data?.source === "live"
                  ? "bg-violet-600"
                  : data?.source === "offline"
                    ? "bg-violet-500"
                    : "bg-stone-400"
              }`}
            />
            {data?.source === "live"
              ? "live NOAA data"
              : data?.source === "offline"
                ? "offline sample — NOAA unreachable"
                : "connecting…"}
          </span>
        </div>
        <p className="max-w-3xl text-base text-stone-700">
          A self-inking paper observatory logbook: the real solar wind streaming
          off the Sun right now composes a slow cosmic-ambient drone and plots
          itself, live, onto a scrolling magnetogram.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={begin}
            disabled={started}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-stone-900 px-5 py-2.5 text-base font-medium text-violet-50 shadow-sm transition-colors hover:bg-stone-800 disabled:cursor-default disabled:bg-stone-500"
          >
            {started ? "◉ Listening to the Sun" : "Listen to the Sun"}
          </button>
          {audioNote && (
            <span className="text-sm text-violet-800">{audioNote}</span>
          )}
        </div>
      </header>

      {/* body: reading panel + logbook */}
      <section className="mx-auto mt-6 grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        {/* current reading */}
        <aside
          className="rounded-xl border border-stone-400/40 bg-[#f7f0dd]/70 p-4 shadow-sm"
          style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-stone-800">
              Current reading
            </h2>
            <span className={`text-lg font-bold ${wordColor}`}>{word}</span>
          </div>
          <dl className="space-y-3">
            {[
              { k: "SPEED", v: latest ? Math.round(latest.speed) : "—", u: "km/s" },
              { k: "DENSITY", v: latest ? latest.density.toFixed(1) : "—", u: "p/cm³" },
              { k: "Bz", v: latest ? latest.bz.toFixed(1) : "—", u: "nT" },
              { k: "Kp", v: latest ? latest.kp.toFixed(1) : "—", u: "index" },
            ].map((row) => (
              <div key={row.k}>
                <dt className="text-xs tracking-widest text-stone-500">
                  {row.k}
                </dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold text-stone-900">
                    {row.v}
                  </span>
                  <span className="text-sm text-stone-500">{row.u}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-stone-400/30 pt-3 text-xs leading-relaxed text-stone-600">
            latest sample
            <br />
            {stampStr}
          </p>
        </aside>

        {/* the logbook canvas */}
        <div className="relative h-[460px] w-full overflow-hidden rounded-xl border border-stone-400/40 shadow-sm sm:h-[520px]">
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
      </section>

      {/* footer: design-notes corner link */}
      <footer className="mx-auto mt-4 flex max-w-6xl items-center justify-between text-sm text-stone-600">
        <span>
          Data: NOAA SWPC real-time solar wind (plasma · magnetometer · Kp).
        </span>
        <button
          type="button"
          onClick={() => setNotesOpen((o) => !o)}
          className="rounded-md px-2 py-1 text-stone-700 underline decoration-stone-400 underline-offset-4 hover:text-stone-900"
        >
          Design notes
        </button>
      </footer>

      {notesOpen && (
        <div className="mx-auto mt-3 max-w-6xl rounded-xl border border-stone-400/40 bg-[#f7f0dd]/80 p-5 text-base leading-relaxed text-stone-700 shadow-sm">
          <h3 className="mb-2 text-xl font-semibold text-stone-900">
            About this instrument
          </h3>
          <p className="mb-2">
            A <em>heliograph</em> once meant an instrument that photographs the
            Sun — and a signalling mirror that writes with sunlight. This one
            writes with the solar wind. Three pens ink a scrolling logbook:{" "}
            <strong>wind speed</strong> sets the drone&rsquo;s pitch and breath,{" "}
            <strong>density</strong> thickens its harmonics, and{" "}
            <strong>Bz</strong> — when it turns southward — couples the
            magnetosphere, firing detuned beating and an emerald aurora shimmer.{" "}
            <strong>Kp</strong> opens the brightness and lengthens the reverb
            tail; at Kp&nbsp;≥&nbsp;5 the whole page grows audibly agitated.
          </p>
          <p>
            Calm sun, still drone. See{" "}
            <span className="font-mono text-sm">./README.md</span> for the full
            data mapping and references.
          </p>
        </div>
      )}
    </main>
  );
}
