"use client";

// ════════════════════════════════════════════════════════════════════════════
// Heliochime — the weather of the Sun, right now, as an aurora and a chord (4008)
//
// THE ONE QUESTION: What if the actual weather of the Sun, right now, played
// itself as an aurora and a chord?
//
// On Begin we fetch LIVE public NOAA Space Weather Prediction Center telemetry
// (CORS-open, no key) and poll it every ~45 s:
//   • solar-wind plasma  → speed (km/s) + density (p/cc)
//   • solar-wind mag      → Bz + Bt (nT)
//   • planetary K-index   → Kp
// Any fetch failure (offline / headless / CORS hiccup) falls back to a seeded
// mulberry32 synthetic telemetry generator that drifts realistically, so the
// piece ALWAYS animates and sounds. A mono badge reads LIVE vs SIMULATED.
//
// SONIFICATION (Web Audio, all params continuously smoothed — no clicks):
//   speed   → base drone pitch (log map ~300km/s low → ~700km/s higher)
//   density → richness: amplitude of the upper harmonic partials
//   Bz      → southward (−, geoeffective) = beating detuned minor-second rising
//             dissonance ∝ |Bz|; northward (+) = pure/consonant
//   Kp      → overall loudness + tremolo/shimmer depth + aurora brightness
//
// VISUALS (Canvas2D): a rippling aurora curtain — height & green intensity
// follow Kp, horizontal sway speed follows wind speed, hue shifts toward
// violet/red when Bz turns southward. Plus a live data HUD.
//
// The lab's SECOND live-external-data sonification after 3856-terra (USGS
// quakes). Novelty: REAL live telemetry driving synthesis, not the solar
// aesthetic. Refs: NASA HARP, Helioradar AV, Joseph Morris "Solar Particle
// Wind Chime", MUUUNE. See README.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";

// ── Telemetry shape ──────────────────────────────────────────────────────────
interface Telemetry {
  speed: number; // km/s
  density: number; // protons / cc
  bz: number; // nT (southward negative)
  bt: number; // nT (total field magnitude)
  kp: number; // 0..9 planetary K-index
}

type FeedStatus = "idle" | "connecting" | "live" | "simulated";

const POLL_MS = 45_000;
const FETCH_TIMEOUT_MS = 9_000;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Pleasant mid-range defaults so the landing shows a gentle aurora pre-Begin.
const DEFAULT_TELEMETRY: Telemetry = { speed: 420, density: 5, bz: 1.5, bt: 6, kp: 2.2 };

// ── Deterministic PRNG (seeded so the synthetic demo is reproducible) ─────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Seeded synthetic telemetry that drifts realistically (random walk) ────────
function nextSynthetic(prev: Telemetry, rng: () => number): Telemetry {
  const speed = clamp(prev.speed + (rng() - 0.5) * 70, 300, 700);
  const density = clamp(prev.density + (rng() - 0.5) * 4.5, 0, 20);
  const bz = clamp(prev.bz + (rng() - 0.48) * 5.5, -12, 12);
  const bt = clamp(Math.abs(bz) + 2 + rng() * 4, 1, 20);
  const kp = clamp(prev.kp + (rng() - 0.5) * 1.3, 0, 7);
  return { speed, density, bz, bt, kp };
}

// ── NOAA parsers (defensive; endpoints are array-of-arrays with a header) ─────
type Row = unknown;

function lastDataRow(json: unknown): Row[] | null {
  if (!Array.isArray(json) || json.length < 2) return null;
  const last = json[json.length - 1];
  if (!Array.isArray(last)) return null;
  return last as Row[];
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

// plasma-1-day: [time_tag, density, speed, temperature]
function parsePlasma(json: unknown): { density: number; speed: number } {
  const row = lastDataRow(json);
  if (!row) throw new Error("plasma shape");
  const density = num(row[1]);
  const speed = num(row[2]);
  if (!Number.isFinite(density) || !Number.isFinite(speed)) throw new Error("plasma nan");
  return { density, speed };
}

// mag-1-day: [time_tag, bx, by, bz, lon, lat, bt]
function parseMag(json: unknown): { bz: number; bt: number } {
  const row = lastDataRow(json);
  if (!row) throw new Error("mag shape");
  const bz = num(row[3]);
  const bt = num(row[6]);
  if (!Number.isFinite(bz) || !Number.isFinite(bt)) throw new Error("mag nan");
  return { bz, bt };
}

// noaa-planetary-k-index: documented [time_tag, kp, ...] rows with a header,
// but also tolerate an object form ({ Kp } / { kp }) seen on some mirrors.
function parseKp(json: unknown): number {
  if (Array.isArray(json) && json.length >= 2) {
    const last = json[json.length - 1];
    if (Array.isArray(last)) {
      const kp = num(last[1]);
      if (Number.isFinite(kp)) return clamp(kp, 0, 9);
    }
    if (last && typeof last === "object") {
      const o = last as Record<string, unknown>;
      const kp = num(o.Kp ?? o.kp ?? o.kp_index);
      if (Number.isFinite(kp)) return clamp(kp, 0, 9);
    }
  }
  throw new Error("kp shape");
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Fetch all three live products; throw on any failure to trigger the fallback.
async function fetchTelemetry(): Promise<Telemetry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const [plasmaJson, magJson, kpJson] = await Promise.all([
      fetchJson("https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json", controller.signal),
      fetchJson("https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json", controller.signal),
      fetchJson("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", controller.signal),
    ]);
    const { density, speed } = parsePlasma(plasmaJson);
    const { bz, bt } = parseMag(magJson);
    const kp = parseKp(kpJson);
    return {
      speed: clamp(speed, 200, 1200),
      density: clamp(density, 0, 100),
      bz: clamp(bz, -60, 60),
      bt: clamp(bt, 0, 80),
      kp: clamp(kp, 0, 9),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Continuous mappings shared by audio + visuals ────────────────────────────
const speedNorm = (speed: number) => clamp01((speed - 300) / 400); // 300..700
const densityNorm = (density: number) => clamp01(density / 20); // 0..20
const kpNorm = (kp: number) => clamp01(kp / 7); // 0..7 practical ceiling
const southNorm = (bz: number) => clamp01(-bz / 12); // 0 (north) .. 1 (deep south)

// ════════════════════════════════════════════════════════════════════════════
// Audio engine — additive drone chord + density-gated partials + Bz dissonance
// ════════════════════════════════════════════════════════════════════════════
interface AudioApi {
  update: (t: Telemetry) => void;
  dispose: () => void;
}

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  base: number; // baseline amplitude
  gated: boolean; // true = amplitude scales with density richness
}

const MINOR_SECOND = Math.pow(2, 1 / 12); // ≈ 1.05946

function makeAudio(ctx: AudioContext): AudioApi {
  const now = ctx.currentTime;

  // master (loudness, driven by Kp) → destination
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.35, now + 1.6);
  master.connect(ctx.destination);

  // tremolo stage: baseline gain + slow LFO whose depth follows Kp
  const trem = ctx.createGain();
  trem.gain.value = 1;
  trem.connect(master);

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 2.4; // gentle shimmer, well under any strobe threshold
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.0001;
  lfo.connect(lfoDepth);
  lfoDepth.connect(trem.gain);
  lfo.start();

  // soft master lowpass so nothing gets harsh
  const glue = ctx.createBiquadFilter();
  glue.type = "lowpass";
  glue.frequency.value = 4200;
  glue.Q.value = 0.4;
  glue.connect(trem);

  // ── Additive chord: sub, root, fifth (always on) + upper harmonics (gated) ──
  const partialSpec: { ratio: number; base: number; gated: boolean }[] = [
    { ratio: 0.5, base: 0.22, gated: false }, // sub-octave body
    { ratio: 1.0, base: 0.26, gated: false }, // root
    { ratio: 1.5, base: 0.16, gated: false }, // perfect fifth
    { ratio: 2.0, base: 0.13, gated: true }, // octave
    { ratio: 3.0, base: 0.09, gated: true }, // twelfth
    { ratio: 4.0, base: 0.06, gated: true }, // double octave
    { ratio: 6.0, base: 0.04, gated: true }, // upper shimmer
  ];
  const partials: Partial[] = partialSpec.map((p, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = 120 * p.ratio;
    osc.detune.value = (i - 3) * 2; // faint spread for chorus warmth
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(glue);
    osc.start();
    return { osc, gain, ratio: p.ratio, base: p.base, gated: p.gated };
  });

  // ── Dissonance voices: a beating detuned minor-second above the root ────────
  const dissGain = ctx.createGain();
  dissGain.gain.value = 0.0001;
  dissGain.connect(glue);
  const dissA = ctx.createOscillator();
  const dissB = ctx.createOscillator();
  dissA.type = "triangle";
  dissB.type = "triangle";
  dissA.frequency.value = 120 * MINOR_SECOND;
  dissB.frequency.value = 120 * MINOR_SECOND;
  dissA.connect(dissGain);
  dissB.connect(dissGain);
  dissA.start();
  dissB.start();

  const TC = 0.25; // smoothing time-constant (click-free)

  function update(t: Telemetry): void {
    const at = ctx.currentTime;
    const sN = speedNorm(t.speed);
    const dN = densityNorm(t.density);
    const kN = kpNorm(t.kp);
    const south = southNorm(t.bz);
    const btN = clamp01(t.bt / 20);

    // speed → base drone pitch (log map ~90..240 Hz)
    const baseFreq = 90 * Math.pow(240 / 90, sN);

    for (const p of partials) {
      p.osc.frequency.setTargetAtTime(baseFreq * p.ratio, at, TC);
      // density → richness of upper partials; Bt lends a little overall body
      const rich = p.gated ? dN : 1;
      const amp = p.base * rich * (0.75 + 0.25 * btN);
      p.gain.gain.setTargetAtTime(Math.max(0.0001, amp), at, TC);
    }

    // Bz southward → rising, beating minor-second dissonance ∝ |Bz|
    const dissFreq = baseFreq * MINOR_SECOND;
    const beatHz = 1.5 + south * 6; // faster beating the more southward
    dissA.frequency.setTargetAtTime(dissFreq, at, TC);
    dissB.frequency.setTargetAtTime(dissFreq + beatHz, at, TC);
    dissGain.gain.setTargetAtTime(Math.max(0.0001, south * 0.14), at, TC);

    // Kp → loudness + tremolo depth
    master.gain.setTargetAtTime(0.22 + kN * 0.5, at, TC);
    const depth = kN * 0.45;
    trem.gain.setTargetAtTime(1 - depth * 0.5, at, TC);
    lfoDepth.gain.setTargetAtTime(Math.max(0.0001, depth * 0.5), at, TC);
    lfo.frequency.setTargetAtTime(1.8 + kN * 1.2, at, TC); // ≤3 Hz shimmer
  }

  function dispose(): void {
    const at = ctx.currentTime;
    master.gain.cancelScheduledValues(at);
    master.gain.setTargetAtTime(0.0001, at, 0.25);
    const oscs: OscillatorNode[] = [lfo, dissA, dissB, ...partials.map((p) => p.osc)];
    for (const o of oscs) {
      try {
        o.stop(at + 0.8);
      } catch {
        /* already stopped */
      }
    }
  }

  return { update, dispose };
}

// ════════════════════════════════════════════════════════════════════════════
// Visuals — aurora curtain on Canvas2D (raw colours allowed inside canvas art)
// ════════════════════════════════════════════════════════════════════════════
interface Star {
  x: number; // 0..1
  y: number; // 0..1 (upper region)
  r: number;
  tw: number; // twinkle phase
}

function makeStars(rng: () => number, n: number): Star[] {
  const out: Star[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: rng(), y: rng() * 0.6, r: 0.4 + rng() * 1.1, tw: rng() * Math.PI * 2 });
  }
  return out;
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cur: Telemetry,
  time: number,
  stars: Star[],
): void {
  const sN = speedNorm(cur.speed);
  const kN = kpNorm(cur.kp);
  const south = southNorm(cur.bz);

  // gentle, slow luminance pulse (0.25 Hz — far below any strobe threshold)
  const pulse = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 0.25);
  const bright = 0.85 + 0.15 * pulse;

  // background night sky
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#04030a");
  bg.addColorStop(0.55, "#070512");
  bg.addColorStop(1, "#0a0714");
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // stars
  ctx.globalCompositeOperation = "lighter";
  for (const s of stars) {
    const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 1.6 + s.tw));
    ctx.globalAlpha = 0.5 * tw;
    ctx.fillStyle = "#cfd6ff";
    ctx.beginPath();
    ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // aurora colour: green (north) → violet, with a red fringe at deep south
  const hue = lerp(140, 285, south);
  const fringeHue = lerp(150, 350, south);
  const sat = 85;
  const light = 42 + kN * 22;

  const baseY = h * 0.74;
  const curtainH = h * (0.2 + kN * 0.5);
  const swaySpeed = 0.12 + sN * 0.95;

  const LAYERS = 5;
  const step = Math.max(6, w / 160);

  for (let li = 0; li < LAYERS; li++) {
    const depth = li / (LAYERS - 1); // 0 back .. 1 front
    const phase = li * 1.37;
    const amp = h * (0.035 + depth * 0.03);
    const layerH = curtainH * (0.7 + depth * 0.45);
    const layerHue = li === LAYERS - 1 && south > 0.55 ? fringeHue : hue + depth * 8;
    const layerLight = clamp(light + depth * 8 - li * 2, 25, 78);
    const alpha = (0.05 + depth * 0.05) * bright;

    // waving top edge → filled curtain body via a vertical gradient
    const topAt = (x: number) =>
      baseY -
      layerH +
      amp * Math.sin(x * 0.011 + time * swaySpeed + phase) +
      amp * 0.4 * Math.sin(x * 0.031 - time * swaySpeed * 0.6 + phase * 2);

    const grad = ctx.createLinearGradient(0, baseY - layerH, 0, baseY);
    grad.addColorStop(0, `hsla(${layerHue}, ${sat}%, ${layerLight}%, 0)`);
    grad.addColorStop(0.35, `hsla(${layerHue}, ${sat}%, ${layerLight}%, ${alpha})`);
    grad.addColorStop(1, `hsla(${layerHue}, ${sat}%, ${layerLight * 0.7}%, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= w; x += step) ctx.lineTo(x, topAt(x));
    ctx.lineTo(w, baseY);
    ctx.closePath();
    ctx.fill();

    // vertical ray streaks for the classic curtain texture
    ctx.lineWidth = 1.5;
    for (let x = (li * 7) % 22; x <= w; x += 22) {
      const ty = topAt(x);
      const rayGrad = ctx.createLinearGradient(0, ty, 0, baseY);
      rayGrad.addColorStop(0, `hsla(${layerHue}, ${sat}%, ${layerLight + 8}%, 0)`);
      rayGrad.addColorStop(0.5, `hsla(${layerHue}, ${sat}%, ${layerLight + 8}%, ${alpha * 0.9})`);
      rayGrad.addColorStop(1, `hsla(${layerHue}, ${sat}%, ${layerLight}%, 0)`);
      ctx.strokeStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x + amp * 0.15 * Math.sin(time * swaySpeed + x), baseY);
      ctx.stroke();
    }
  }

  // faint horizon glow
  const glow = ctx.createLinearGradient(0, baseY - 4, 0, baseY + h * 0.12);
  glow.addColorStop(0, `hsla(${hue}, ${sat}%, ${light}%, ${0.12 * bright})`);
  glow.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, baseY - 4, w, h * 0.14);

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════════════════
export default function HeliochimePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const targetRef = useRef<Telemetry>({ ...DEFAULT_TELEMETRY });
  const currentRef = useRef<Telemetry>({ ...DEFAULT_TELEMETRY });
  const synthRef = useRef<Telemetry>({ ...DEFAULT_TELEMETRY });
  const rngRef = useRef<() => number>(mulberry32(0x4008));
  const starsRef = useRef<Star[]>([]);
  const startedRef = useRef(false);
  const audioRef = useRef<AudioApi | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [display, setDisplay] = useState<Telemetry>({ ...DEFAULT_TELEMETRY });

  // ── Animation + audio-drive loop (runs on mount; visuals show pre-Begin) ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    starsRef.current = makeStars(mulberry32(0x4008a), 130);

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowP = performance.now();
      const dt = Math.min(0.05, (nowP - last) / 1000);
      last = nowP;

      // smooth current toward target (tau ≈ 2.2 s → click-free, gentle drift)
      const k = 1 - Math.exp(-dt / 2.2);
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.speed = lerp(cur.speed, tgt.speed, k);
      cur.density = lerp(cur.density, tgt.density, k);
      cur.bz = lerp(cur.bz, tgt.bz, k);
      cur.bt = lerp(cur.bt, tgt.bt, k);
      cur.kp = lerp(cur.kp, tgt.kp, k);

      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      drawAurora(ctx, w, h, cur, nowP / 1000, starsRef.current);

      if (audioRef.current) audioRef.current.update(cur);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── Polling: first fetch on Begin, then every ~45 s; synthetic on failure ──
  useEffect(() => {
    if (!started) return;
    let cancelled = false;

    const apply = (t: Telemetry, s: FeedStatus, failed: boolean) => {
      if (cancelled) return;
      targetRef.current = t;
      synthRef.current = t;
      setStatus(s);
      setFetchFailed(failed);
      setDisplay(t);
    };

    const poll = async () => {
      if (!cancelled) setStatus((prev) => (prev === "idle" ? "connecting" : prev));
      try {
        const t = await fetchTelemetry();
        apply(t, "live", false);
      } catch {
        const t = nextSynthetic(synthRef.current, rngRef.current);
        apply(t, "simulated", true);
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [started]);

  // ── Cleanup audio on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // ── Begin: create/resume AudioContext inside the user gesture ───────────────
  const onBegin = useCallback(() => {
    if (startedRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();
      void ctx.resume();
      audioCtxRef.current = ctx;
      audioRef.current = makeAudio(ctx);
    } catch {
      // audio unavailable — the aurora still runs; leave audioRef null
    }
    startedRef.current = true;
    setStarted(true);
    setStatus("connecting");
  }, []);

  const badgeLabel =
    status === "live"
      ? "live · NOAA SWPC"
      : status === "simulated"
        ? "simulated telemetry"
        : status === "connecting"
          ? "contacting NOAA…"
          : "standby";
  const badgeClass =
    status === "live"
      ? "text-primary"
      : status === "simulated"
        ? "text-destructive"
        : "text-muted-foreground";

  const bzSign = display.bz >= 0 ? "+" : "";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Aurora art canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {/* Top-left: title + description + badge */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 max-w-xl p-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Heliochime
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          The actual weather of the Sun, right now, playing itself as an aurora and a chord — live
          NOAA solar-wind telemetry driving the synthesis.
        </p>
        <p
          className={`mt-3 font-mono text-xs uppercase tracking-[0.18em] ${badgeClass}`}
          aria-live="polite"
        >
          {status === "live" ? "LIVE" : status === "simulated" ? "SIMULATED" : "—"} · {badgeLabel}
        </p>
        {fetchFailed && (
          <p className="mt-2 max-w-md text-sm text-destructive">
            NOAA feed unreachable — running seeded synthetic telemetry so the piece keeps playing.
          </p>
        )}
      </div>

      {/* Top-right: live data HUD */}
      <div className="pointer-events-none absolute right-0 top-0 z-20 p-6 text-right">
        <HudRow label="wind speed" value={`${Math.round(display.speed)}`} unit="km/s" />
        <HudRow label="density" value={display.density.toFixed(1)} unit="p/cc" />
        <HudRow
          label="Bz"
          value={`${bzSign}${display.bz.toFixed(1)}`}
          unit={`nT ${display.bz < 0 ? "· south" : "· north"}`}
          accent={display.bz < 0}
        />
        <HudRow label="Kp index" value={display.kp.toFixed(1)} unit="" />
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 p-6">
        {!started ? (
          <button
            type="button"
            onClick={onBegin}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        ) : (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            You are hearing the Sun&rsquo;s weather. Faster wind lifts the pitch; denser wind fills
            the chord; a southward Bz turns it dissonant; Kp brightens the aurora and swells the
            sound.
          </p>
        )}
      </div>

      {/* Design notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute bottom-6 right-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Heliochime</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                On Begin this fetches live NOAA Space Weather Prediction Center telemetry — the
                solar-wind plasma and magnetic-field monitors plus the planetary K-index — and polls
                it every ~45 seconds. It is the weather of the Sun as measured this hour, not a
                synthetic &ldquo;space ambient&rdquo; texture.
              </p>
              <p>
                Wind <span className="font-mono">speed</span> maps to the drone&rsquo;s base pitch;{" "}
                <span className="font-mono">density</span> fattens the chord by raising its upper
                harmonic partials; a southward (negative){" "}
                <span className="font-mono">Bz</span> — the geoeffective orientation that actually
                lights real auroras — introduces a beating detuned minor-second dissonance, while a
                northward Bz stays pure; the <span className="font-mono">Kp</span> index sets overall
                loudness, tremolo shimmer, and aurora brightness. The curtain&rsquo;s sway follows
                wind speed and its hue slides from green toward violet and red as Bz turns south.
              </p>
              <p>
                If the feed is unreachable (offline, headless, CORS hiccup) a seeded{" "}
                <span className="font-mono">mulberry32</span> generator drifts realistic telemetry
                so it always animates and sounds; the badge then reads SIMULATED.
              </p>
              <p>
                References: NASA <span className="font-mono">HARP</span> (Heliophysics Audified:
                Resonances in Plasmas), Helioradar AV, Joseph Morris&rsquo; &ldquo;Solar Particle
                Wind Chime,&rdquo; and MUUUNE. This is the lab&rsquo;s second live-external-data
                sonification after <span className="font-mono">3856-terra</span> (USGS earthquakes);
                the novel axis is real live telemetry driving synthesis, not the solar aesthetic.
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
    </main>
  );
}

// ── HUD row (semantic tokens only) ───────────────────────────────────────────
function HudRow({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="mb-3">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-base ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
        {unit ? <span className="ml-1 text-xs text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}
