"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Types ──────────────────────────────────────────────────────────────────────

type VisualMode = "cosmic" | "mycelium" | "sacred" | "ocean" | "winter";
type PhaseStyle = "orbit" | "rise" | "scatter" | "grid" | "wave" | "dissolve";

interface PhaseDef {
  name: string;
  durationWeight: number;
  color: [number, number, number];
  accent: [number, number, number];
  intensity: number;
  style: PhaseStyle;
  description: string;
}

interface JourneyArcDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  visualMode: VisualMode;
  phases: PhaseDef[];
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; g: number; b: number;
  size: number; alpha: number; life: number; maxLife: number;
}

interface StarDot {
  x: number; y: number; size: number; baseAlpha: number; phase: number;
}

// ── Journey arc definitions ────────────────────────────────────────────────────
// Phase names, descriptions and themes derived from Karel's published journeys.
// Visual palettes designed to match each journey's published AI imagery.

const JOURNEYS: JourneyArcDef[] = [
  {
    id: "cosmic-drift",
    name: "Cosmic Drift",
    subtitle: "between the stars",
    description: "A star field expands to nebulae forming, builds to a supernova, then settles into quiet interstellar drift.",
    visualMode: "cosmic",
    phases: [
      { name: "Starfield",  durationWeight: 1, color: [40, 40, 120],   accent: [80, 80, 200],   intensity: 0.15, style: "orbit",   description: "Ancient photons arrive. The void is full." },
      { name: "Nebula",     durationWeight: 2, color: [80, 40, 180],   accent: [120, 70, 240],  intensity: 0.45, style: "rise",    description: "Gas clouds coalesce. Color blooms from nothing." },
      { name: "Supernova",  durationWeight: 2, color: [255, 200, 255], accent: [255, 80, 160],  intensity: 1.0,  style: "scatter", description: "A star dies in a flash that outshines galaxies." },
      { name: "Aftermath",  durationWeight: 2, color: [200, 160, 80],  accent: [240, 190, 100], intensity: 0.6,  style: "dissolve",description: "Shockwave recedes. Heavy elements drift free." },
      { name: "Drift",      durationWeight: 2, color: [40, 60, 160],   accent: [80, 110, 220],  intensity: 0.28, style: "wave",    description: "Interstellar quiet. Only the slow drift of time." },
      { name: "Distance",   durationWeight: 1, color: [10, 10, 50],    accent: [30, 30, 90],    intensity: 0.07, style: "orbit",   description: "You are a speck on a speck on the edge of nothing." },
    ],
  },
  {
    id: "mycelium-dream",
    name: "Mycelium Dream",
    subtitle: "the network awakens",
    description: "Phosphorescent spores connect into growing networks, exploding into a fractal canopy, then condensing to a single seed.",
    visualMode: "mycelium",
    phases: [
      { name: "Spore",      durationWeight: 1, color: [20, 90, 40],    accent: [40, 140, 60],   intensity: 0.12, style: "grid",    description: "A single spore in dark soil. Potential, held." },
      { name: "Branching",  durationWeight: 2, color: [40, 170, 80],   accent: [80, 230, 120],  intensity: 0.50, style: "rise",    description: "Hyphae extend outward, finding paths through dark matter." },
      { name: "Canopy",     durationWeight: 2, color: [100, 255, 140], accent: [180, 255, 80],  intensity: 0.95, style: "scatter", description: "The network reaches critical density. Everything connects." },
      { name: "Pulse",      durationWeight: 2, color: [60, 200, 180],  accent: [40, 160, 220],  intensity: 0.65, style: "wave",    description: "Chemical signals pulse through a continent of fungal mind." },
      { name: "Settling",   durationWeight: 2, color: [30, 100, 60],   accent: [20, 80, 80],    intensity: 0.30, style: "dissolve",description: "The network rests. Nutrients flow slowly inward." },
      { name: "Seed",       durationWeight: 1, color: [15, 50, 30],    accent: [30, 70, 40],    intensity: 0.07, style: "orbit",   description: "A fruiting body forms. The next spore waits." },
    ],
  },
  {
    id: "sacred-resonance",
    name: "Sacred Resonance",
    subtitle: "geometry reveals itself",
    description: "A candle flicker grows to reveal hidden geometry, expanding into infinite mandalas, returning to warm stone silence.",
    visualMode: "sacred",
    phases: [
      { name: "Candle",     durationWeight: 1, color: [180, 100, 30],  accent: [220, 150, 60],  intensity: 0.18, style: "orbit",   description: "A single flame in ancient stone. All sacred space begins here." },
      { name: "Awakening",  durationWeight: 2, color: [220, 160, 60],  accent: [255, 210, 80],  intensity: 0.45, style: "rise",    description: "The geometry warms. Patterns reveal themselves in spirals." },
      { name: "Communion",  durationWeight: 2, color: [255, 240, 140], accent: [255, 255, 100], intensity: 1.0,  style: "scatter", description: "Mandala upon mandala — the infinite nested inside the finite." },
      { name: "Revelation", durationWeight: 2, color: [240, 180, 80],  accent: [220, 140, 60],  intensity: 0.65, style: "dissolve",description: "Form dissolves. Only the vibration remains." },
      { name: "Descent",    durationWeight: 2, color: [160, 100, 50],  accent: [120, 80, 40],   intensity: 0.32, style: "wave",    description: "The temple settles. Warm stone remembers every prayer." },
      { name: "Silence",    durationWeight: 1, color: [70, 45, 20],    accent: [90, 65, 28],    intensity: 0.07, style: "grid",    description: "Candle gutters. The geometry folds back into the dark." },
    ],
  },
  {
    id: "abyssal-dive",
    name: "Abyssal Dive",
    subtitle: "into the deep",
    description: "Surface shimmer gives way to bioluminescent layers, a leviathan encounter at maximum depth, then a warming ascent.",
    visualMode: "ocean",
    phases: [
      { name: "Surface",    durationWeight: 1, color: [60, 160, 200],  accent: [100, 210, 245], intensity: 0.20, style: "wave",    description: "Light refracts into a million diamond points. The ocean is a lens." },
      { name: "Sinking",    durationWeight: 2, color: [20, 80, 150],   accent: [40, 130, 190],  intensity: 0.45, style: "dissolve",description: "Color drains. Pressure builds. The surface recedes above." },
      { name: "Abyss",      durationWeight: 2, color: [8, 18, 80],     accent: [20, 60, 170],   intensity: 0.85, style: "orbit",   description: "Total darkness — except for what makes its own light." },
      { name: "Glow",       durationWeight: 2, color: [20, 160, 180],  accent: [60, 220, 200],  intensity: 0.65, style: "scatter", description: "Bioluminescence pulses — alien constellations of the deep." },
      { name: "Ascending",  durationWeight: 2, color: [40, 100, 170],  accent: [70, 165, 210],  intensity: 0.38, style: "rise",    description: "Rising. Pressure eases. Light appears above as a pale glow." },
      { name: "Shore",      durationWeight: 1, color: [80, 160, 185],  accent: [120, 205, 205], intensity: 0.14, style: "grid",    description: "You wash ashore. The sea recedes slowly. The salt remains." },
    ],
  },
  {
    id: "first-snow",
    name: "Snowflake",
    subtitle: "crystalline descent into silence",
    description: "The world grows quiet as the first flakes fall. Sound becomes muffled. Everything slows into crystalline stillness.",
    visualMode: "winter",
    phases: [
      { name: "Chill",      durationWeight: 1, color: [150, 190, 220], accent: [180, 220, 245], intensity: 0.17, style: "orbit",   description: "A sharpness in the air. The sky goes pale and perfectly still." },
      { name: "Falling",    durationWeight: 2, color: [190, 215, 250], accent: [215, 232, 255], intensity: 0.48, style: "rise",    description: "The first flakes find their way down through windless air." },
      { name: "Whiteout",   durationWeight: 2, color: [235, 242, 255], accent: [255, 255, 255], intensity: 1.0,  style: "scatter", description: "Nothing left but white. All edges dissolved into soft light." },
      { name: "Silence",    durationWeight: 2, color: [175, 195, 225], accent: [195, 215, 240], intensity: 0.52, style: "dissolve",description: "Under the snow, a held breath. The world muffled and still." },
      { name: "Warmth",     durationWeight: 2, color: [220, 180, 135], accent: [245, 205, 160], intensity: 0.28, style: "wave",    description: "A window from inside. Firelight. The contrast of warmth." },
      { name: "Stillness",  durationWeight: 1, color: [130, 155, 180], accent: [155, 178, 202], intensity: 0.07, style: "dissolve",description: "The crystal lattice holds everything in suspension." },
    ],
  },
];

const DEMO_MS = 60_000;

// ── Synthetic audio bands (no mic required) ────────────────────────────────────

function synthBands(t: number, phase: PhaseDef): [number[], number, boolean] {
  const speeds = [0.29, 0.47, 0.71, 1.09, 1.73, 2.31];
  const bands = speeds.map((s, i) => {
    const base = phase.intensity * (0.18 + 0.28 * Math.sin(t * s * 0.001 + i * 0.9));
    const noise = 0.07 * Math.sin(t * s * 0.004 + i * 2.1);
    return Math.max(0, Math.min(1, base + noise));
  });
  const amplitude = bands.reduce((a, b) => a + b, 0) / 6;
  const noOnset = phase.style === "dissolve" || phase.intensity < 0.25;
  const onset = !noOnset && (Math.floor(t / 720) !== Math.floor((t - 16) / 720));
  return [bands, amplitude, onset];
}

// ── Particle factory ───────────────────────────────────────────────────────────

function makeParticle(
  cx: number, cy: number, w: number, h: number,
  style: PhaseStyle, col: [number, number, number],
): Particle {
  const [r, g, b] = col;
  const life = 90 + Math.random() * 120;
  if (style === "grid") {
    const cols = 14, rows = 9;
    return { x: (Math.floor(Math.random() * cols) / cols) * w + w / cols / 2, y: (Math.floor(Math.random() * rows) / rows) * h + h / rows / 2, vx: (Math.random() - 0.5) * 0.15, vy: (Math.random() - 0.5) * 0.15, r, g, b, size: 1.5 + Math.random() * 2.5, alpha: 0.55, life, maxLife: life };
  }
  if (style === "rise") {
    return { x: Math.random() * w, y: h + 10, vx: (Math.random() - 0.5) * 1.2, vy: -1.2 - Math.random() * 2, r, g, b, size: 1.5 + Math.random() * 2.5, alpha: 0.65, life, maxLife: life };
  }
  if (style === "orbit") {
    const angle = Math.random() * Math.PI * 2;
    const rad = 80 + Math.random() * Math.min(w, h) * 0.28;
    return { x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad, vx: Math.sin(angle) * (0.6 + Math.random() * 1.2), vy: -Math.cos(angle) * (0.6 + Math.random() * 1.2), r, g, b, size: 1.5 + Math.random() * 3, alpha: 0.5, life, maxLife: life };
  }
  if (style === "scatter") {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 4;
    const sl = life * 0.5;
    return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, g, b, size: 1 + Math.random() * 3.5, alpha: 0.75, life: sl, maxLife: sl };
  }
  if (style === "dissolve") {
    return { x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, r, g, b, size: 1 + Math.random() * 4, alpha: 0.35, life, maxLife: life };
  }
  // wave
  return { x: Math.random() * w, y: cy + (Math.random() - 0.5) * h * 0.25, vx: 0.8 + Math.random() * 1.5, vy: Math.sin(Math.random() * Math.PI * 2) * 0.3, r, g, b, size: 1.5 + Math.random() * 2, alpha: 0.45, life, maxLife: life };
}

// ── Per-journey background renderers ──────────────────────────────────────────

function drawCosmicBg(
  ctx: CanvasRenderingContext2D, t: number,
  stars: StarDot[], amplitude: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  for (const s of stars) {
    const a = s.baseAlpha + 0.08 * Math.sin(t * 0.001 + s.phase) + amplitude * 0.04;
    ctx.fillStyle = `rgba(210,220,255,${Math.max(0, Math.min(1, a))})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
}

function drawMyceliumBg(
  ctx: CanvasRenderingContext2D, particles: Particle[], amplitude: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  const lineAlpha = 0.07 + amplitude * 0.09;
  ctx.strokeStyle = `rgba(60,210,100,${lineAlpha})`;
  ctx.lineWidth = 0.5;
  const checkCount = Math.min(particles.length, 50);
  for (let i = 0; i < checkCount - 1; i++) {
    for (let j = i + 1; j < checkCount; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      if (dx * dx + dy * dy < 3600) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.globalCompositeOperation = "lighter";
}

function drawSacredBg(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number, amplitude: number, phase: PhaseDef,
): void {
  const cx = w / 2, cy = h / 2;
  const [pr, pg, pb] = phase.color;
  ctx.globalCompositeOperation = "source-over";
  for (let ring = 0; ring < 4; ring++) {
    const radius = (70 + ring * 85) * (1 + amplitude * 0.1);
    const rotation = t * 0.0002 * (ring % 2 === 0 ? 1 : -1) + ring * 0.5;
    const alpha = (0.07 + amplitude * 0.07) * (1 - ring * 0.12);
    ctx.strokeStyle = `rgba(${pr},${pg},${pb},${Math.max(0, alpha)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let pt = 0; pt <= 6; pt++) {
      const a = (pt / 6) * Math.PI * 2 + rotation;
      if (pt === 0) ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      else ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "lighter";
}

function drawOceanBg(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number, amplitude: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  for (let wv = 0; wv < 5; wv++) {
    const yBase = (h * (wv + 1)) / 6;
    const speed = 0.0006 + wv * 0.0003;
    const freq = 0.005 + wv * 0.002;
    const alpha = Math.max(0, (0.04 + amplitude * 0.05) * (1 - wv * 0.08));
    ctx.strokeStyle = `rgba(50,180,210,${alpha})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = yBase + 9 * Math.sin(x * freq + t * speed) + 4 * Math.sin(x * freq * 2.1 - t * speed * 0.7);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "lighter";
}

function drawWinterBg(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number, amplitude: number,
): void {
  ctx.globalCompositeOperation = "source-over";
  const count = 10;
  for (let i = 0; i < count; i++) {
    const x = (w * (i + 0.5)) / count + 22 * Math.sin(t * 0.0004 + i * 1.3);
    const y = (t * 0.012 + i * (h / count)) % h;
    const size = 7 + (i % 3) * 4;
    const alpha = 0.05 + amplitude * 0.05;
    ctx.strokeStyle = `rgba(200,220,255,${alpha})`;
    ctx.lineWidth = 0.8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.0003 + i * 0.8);
    for (let arm = 0; arm < 6; arm++) {
      const a = (arm / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = "lighter";
}

// ── Core frame painter ─────────────────────────────────────────────────────────

function paintFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number,
  bands: number[], amplitude: number,
  flash: number,
  phase: PhaseDef,
  particles: Particle[],
  visualMode: VisualMode,
  stars: StarDot[],
): void {
  const cx = w / 2, cy = h / 2;
  const [pr, pg, pb] = phase.color;
  const [ar, ag, ab] = phase.accent;

  ctx.fillStyle = `rgba(0,0,0,${0.10 + amplitude * 0.07})`;
  ctx.fillRect(0, 0, w, h);

  if (visualMode === "cosmic") drawCosmicBg(ctx, t, stars, amplitude);
  else if (visualMode === "mycelium") drawMyceliumBg(ctx, particles, amplitude);
  else if (visualMode === "sacred") drawSacredBg(ctx, w, h, t, amplitude, phase);
  else if (visualMode === "ocean") drawOceanBg(ctx, w, h, t, amplitude);
  else drawWinterBg(ctx, w, h, t, amplitude);

  ctx.globalCompositeOperation = "lighter";

  const glowAmt = phase.intensity * (0.22 + amplitude * 0.42);
  if (glowAmt > 0.02) {
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.44);
    gr.addColorStop(0, `rgba(${pr},${pg},${pb},${glowAmt * 0.26})`);
    gr.addColorStop(0.55, `rgba(${ar},${ag},${ab},${glowAmt * 0.07})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.44, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 3; i++) {
    const rad = (45 + i * 60 + bands[1] * 65) * (1 + 0.04 * Math.sin(t * 0.002 + i * 1.1));
    const alpha = (bands[0] * 0.32 - i * 0.07) * phase.intensity;
    if (alpha <= 0.01) continue;
    const rg = ctx.createRadialGradient(cx, cy, rad * 0.82, cx, cy, rad);
    rg.addColorStop(0, `rgba(${pr},${pg},${pb},${alpha})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx + (Math.random() - 0.5) * 0.18;
    p.y += p.vy + (Math.random() - 0.5) * 0.18;
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const ratio = p.life / p.maxLife;
    const a = p.alpha * ratio * (0.55 + amplitude * 0.45);
    ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0.5, p.size * ratio), 0, Math.PI * 2);
    ctx.fill();
  }

  if (flash > 0.03) {
    const fr = Math.min(w, h) * 0.26 * flash;
    const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
    fg.addColorStop(0, `rgba(255,255,255,${0.42 * flash})`);
    fg.addColorStop(0.4, `rgba(${ar},${ag},${ab},${0.12 * flash})`);
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy, fr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function JourneyArcSpreadPage() {
  const [journeyId, setJourneyId] = useState("cosmic-drift");
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [mode, setMode] = useState<"none" | "demo" | "mic">("none");
  const [running, setRunning] = useState(false);

  const journey = JOURNEYS.find((j) => j.id === journeyId) ?? JOURNEYS[0];
  const phase = journey.phases[Math.min(phaseIdx, journey.phases.length - 1)];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const flashRef = useRef(0);
  const lastPhaseSetRef = useRef(-1);
  const journeyRef = useRef(journey);
  const modeRef = useRef<"none" | "demo" | "mic">("none");
  const startTimeRef = useRef(0);
  const phaseDursRef = useRef<number[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef = useRef<StarDot[]>([]);

  journeyRef.current = journey;
  modeRef.current = mode;

  const { start: startMic, stop: stopMic, getFrame, error: micError } = useMicAnalyser({ smoothing: 0.85, gain: 2.0 });

  const calcDurations = useCallback((j: JourneyArcDef): number[] => {
    const total = j.phases.reduce((s, p) => s + p.durationWeight, 0);
    return j.phases.map((p) => (p.durationWeight / total) * DEMO_MS);
  }, []);

  const handleStart = useCallback((m: "demo" | "mic") => {
    particlesRef.current = [];
    lastPhaseSetRef.current = -1;
    setMode(m);
    setPhaseIdx(0);
    setRunning(true);
    startTimeRef.current = performance.now();
    phaseDursRef.current = calcDurations(journeyRef.current);
    if (m === "mic") void startMic();
  }, [startMic, calcDurations]);

  const handleStop = useCallback(() => {
    setRunning(false);
    setMode("none");
    stopMic();
    particlesRef.current = [];
  }, [stopMic]);

  const switchJourney = useCallback((id: string) => {
    const next = JOURNEYS.find((j) => j.id === id) ?? JOURNEYS[0];
    journeyRef.current = next;
    setJourneyId(id);
    setPhaseIdx(0);
    particlesRef.current = [];
    lastPhaseSetRef.current = -1;
    if (running) {
      startTimeRef.current = performance.now();
      phaseDursRef.current = calcDurations(next);
    }
  }, [running, calcDurations]);

  const jumpToPhase = useCallback((idx: number) => {
    if (!running) return;
    const durs = phaseDursRef.current;
    let offset = 0;
    for (let j = 0; j < idx; j++) offset += durs[j];
    startTimeRef.current = performance.now() - offset;
    particlesRef.current = [];
    lastPhaseSetRef.current = idx;
    setPhaseIdx(idx);
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0, ch = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.offsetWidth;
      ch = canvas.offsetHeight;
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.scale(dpr, dpr);
    };
    resize();

    if (starsRef.current.length === 0) {
      starsRef.current = Array.from({ length: 200 }, () => ({
        x: Math.random() * cw,
        y: Math.random() * ch,
        size: 0.4 + Math.random() * 1.1,
        baseAlpha: 0.08 + Math.random() * 0.18,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      if (cw === 0) { animRef.current = requestAnimationFrame(loop); return; }

      const elapsed = now - startTimeRef.current;
      const durs = phaseDursRef.current;
      let cum = 0, nextPhase = durs.length - 1;
      for (let i = 0; i < durs.length; i++) {
        cum += durs[i];
        if (elapsed < cum) { nextPhase = i; break; }
      }
      if (nextPhase !== lastPhaseSetRef.current) {
        lastPhaseSetRef.current = nextPhase;
        setPhaseIdx(nextPhase);
      }

      const curJourney = journeyRef.current;
      const curPhase = curJourney.phases[Math.min(nextPhase, curJourney.phases.length - 1)];
      const pts = particlesRef.current;

      let bands: number[] = [];
      let amplitude = 0;
      let onset = false;

      if (modeRef.current === "mic") {
        const frame = getFrame();
        if (frame) {
          bands = frame.bands; amplitude = frame.amplitude; onset = frame.onset;
        } else {
          const fb = synthBands(now, curPhase);
          bands = fb[0].map((v) => v * 0.15); amplitude = fb[1] * 0.15;
        }
      } else {
        const fb = synthBands(now, curPhase);
        bands = fb[0]; amplitude = fb[1]; onset = fb[2];
      }

      flashRef.current *= 0.83;
      if (onset) flashRef.current = 1;

      const target = Math.floor(25 + curPhase.intensity * 150 + amplitude * 80);
      if (pts.length < target && Math.random() < 0.28 + amplitude * 0.5) {
        const count = onset ? 6 : 1;
        for (let i = 0; i < count; i++) {
          pts.push(makeParticle(cw / 2, ch / 2, cw, ch, curPhase.style, onset ? curPhase.accent : curPhase.color));
        }
      }

      paintFrame(ctx, cw, ch, now, bands, amplitude, flashRef.current, curPhase, pts, curJourney.visualMode, starsRef.current);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, getFrame]);

  const totalWeight = journey.phases.reduce((s, p) => s + p.durationWeight, 0);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 3rem)", background: "#050508" }}>

      {/* Journey tabs */}
      <div className="flex border-b border-border overflow-x-auto shrink-0 scrollbar-none">
        {JOURNEYS.map((j) => (
          <button
            key={j.id}
            onClick={() => switchJourney(j.id)}
            className={`px-4 py-2.5 text-xs tracking-wider whitespace-nowrap transition-colors min-h-[44px] ${
              journeyId === j.id
                ? "text-foreground border-b-2 border-border bg-muted"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {j.name}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">

        {/* Canvas */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ background: "#050508" }}
          />

          {/* Intro overlay */}
          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <div className="text-xs tracking-[0.2em] text-muted-foreground uppercase mb-2">
                Journey Arc
              </div>
              <h1 className="text-2xl font-medium mb-1 tracking-tight">{journey.name}</h1>
              <p className="text-sm text-muted-foreground italic mb-2">{journey.subtitle}</p>
              <p className="text-base text-muted-foreground max-w-xs mb-7 leading-relaxed">{journey.description}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleStart("demo")}
                  className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition min-h-[44px]"
                >
                  Demo
                </button>
                <button
                  onClick={() => handleStart("mic")}
                  className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground min-h-[44px]"
                >
                  Mic input
                </button>
              </div>
              {micError && (
                <p className="mt-3 text-sm text-violet-300 max-w-xs">{micError}</p>
              )}
              <Link href="/dream" className="mt-10 text-sm text-muted-foreground hover:text-foreground">
                ← dream sandbox
              </Link>
            </div>
          )}

          {/* Running HUD */}
          {running && (
            <div className="absolute top-3 right-3 flex items-center gap-3">
              <span className="text-xs tracking-wider text-muted-foreground uppercase">
                {mode === "demo" ? "demo" : "mic"}
              </span>
              <button
                onClick={handleStop}
                className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded transition"
              >
                stop
              </button>
            </div>
          )}
        </div>

        {/* Side panel — desktop only */}
        <div className="w-52 shrink-0 border-l border-border hidden md:flex flex-col p-3 gap-4 overflow-y-auto text-left">
          <div>
            <div className="text-xs tracking-[0.15em] text-muted-foreground uppercase mb-1.5">Active phase</div>
            <div
              className="text-base font-medium mb-1"
              style={{ color: `rgb(${phase.color[0]},${phase.color[1]},${phase.color[2]})` }}
            >
              {phase.name}
            </div>
            <div className="text-sm text-foreground leading-relaxed">{phase.description}</div>
          </div>
          <div>
            <div className="text-xs tracking-[0.15em] text-muted-foreground uppercase mb-1.5">Journey</div>
            <div className="text-sm text-muted-foreground leading-relaxed">{journey.description}</div>
          </div>
          <div>
            <div className="text-xs tracking-[0.15em] text-muted-foreground uppercase mb-1.5">Mode</div>
            <div className="text-xs text-muted-foreground font-mono">{journey.visualMode}</div>
            <div className="text-xs text-muted-foreground mt-1">60 min real · 60s demo</div>
            <div className="text-xs text-muted-foreground mt-0.5">Click timeline to jump</div>
          </div>
          <div className="mt-auto">
            <Link href="/dream" className="text-sm text-muted-foreground hover:text-foreground">← back</Link>
          </div>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex items-stretch gap-0.5">
          {journey.phases.map((p, i) => {
            const widthPct = (p.durationWeight / totalWeight) * 100;
            const [pr, pg, pb] = p.color;
            const active = i === phaseIdx;
            return (
              <button
                key={i}
                onClick={() => jumpToPhase(i)}
                style={{
                  width: `${widthPct}%`,
                  borderColor: active ? `rgb(${pr},${pg},${pb})` : "rgba(255,255,255,0.1)",
                }}
                title={`${p.name}: ${p.description}`}
                className={`h-8 rounded-sm border text-xs tracking-wide truncate px-1.5 transition-all ${
                  active ? "bg-muted" : "hover:border-border"
                } ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <span style={active ? { color: `rgb(${pr},${pg},${pb})` } : {}}>
                  {p.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
