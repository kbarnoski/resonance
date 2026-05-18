"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhaseDef {
  name: string;
  durationWeight: number;
  color: [number, number, number];
  accent: [number, number, number];
  intensity: number;
  style: "orbit" | "rise" | "scatter" | "grid" | "wave" | "dissolve";
  description: string;
}

interface ArcDef {
  id: string;
  name: string;
  tagline: string;
  minutes: number;
  phases: PhaseDef[];
  about: string;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  r: number; g: number; b: number;
  size: number; alpha: number; life: number; maxLife: number;
}

// ── Arc definitions ───────────────────────────────────────────────────────────

const ARCS: ArcDef[] = [
  {
    id: "psychedelic",
    name: "Psychedelic",
    tagline: "Current Resonance arc",
    minutes: 60,
    about: "This IS the baseline. Six phases from ego-intact to dissolved and back. Designed for intentional therapeutic sessions: gentle onset → building intensity → peak dissolution → golden afterglow → integration → grounded return.",
    phases: [
      { name: "Induction",   durationWeight: 1, color: [88,32,192],   accent: [32,168,220],  intensity: 0.2,  style: "orbit",   description: "Onset sensations, music taking hold, time slowing" },
      { name: "Ascent",      durationWeight: 2, color: [140,40,220],  accent: [80,220,100],  intensity: 0.5,  style: "rise",    description: "Effect accelerates, visuals intensify, surrender begins" },
      { name: "Peak",        durationWeight: 3, color: [255,230,255], accent: [255,60,120],  intensity: 1.0,  style: "scatter", description: "Ego dissolution, maximal intensity, timeless presence" },
      { name: "Dissolution", durationWeight: 2, color: [240,200,80],  accent: [255,150,40],  intensity: 0.8,  style: "dissolve",description: "Structures melt, pure color and tone, oceanic feeling" },
      { name: "Integration", durationWeight: 2, color: [80,220,100],  accent: [88,32,192],   intensity: 0.4,  style: "orbit",   description: "Insights crystallize, self reassembles, warmth" },
      { name: "Return",      durationWeight: 2, color: [32,80,180],   accent: [140,40,220],  intensity: 0.2,  style: "wave",    description: "Gentle descent, grounding, ordinary world re-emerges" },
    ],
  },
  {
    id: "edm",
    name: "EDM Build-and-Drop",
    tagline: "Energy arc · 10 min",
    minutes: 10,
    about: "Compressed kinetic catharsis. Dark minimal intro escalates through a driving build, white-hot pre-drop tension, and a shattering drop, then settles into euphoric plateau. No dissolution, no return — just release.",
    phases: [
      { name: "Intro",    durationWeight: 1, color: [20,20,50],    accent: [40,80,160],   intensity: 0.15, style: "grid",    description: "Sparse kick, sub-bass establishing the floor, space before the storm" },
      { name: "Build",    durationWeight: 2, color: [20,160,220],  accent: [120,220,255], intensity: 0.55, style: "rise",    description: "Synth layers accumulate, tension rises, filter opens wider" },
      { name: "Pre-Drop", durationWeight: 1, color: [255,60,120],  accent: [255,200,60],  intensity: 0.85, style: "orbit",   description: "Everything compresses into white-hot anticipation" },
      { name: "Drop",     durationWeight: 2, color: [255,255,255], accent: [255,100,0],   intensity: 1.0,  style: "scatter", description: "Wall of sound, full spectral explosion, pure kinetic release" },
      { name: "Euphoria", durationWeight: 3, color: [80,255,160],  accent: [40,180,255],  intensity: 0.7,  style: "wave",    description: "Plateau — the groove is everything, euphoric float" },
    ],
  },
  {
    id: "cinematic",
    name: "Cinematic",
    tagline: "Three-act narrative · 90 min",
    minutes: 90,
    about: "Story-driven arc mirroring film structure. Seven phases: warmth → tension → conflict → crisis → catharsis → release → resolution. An emotional journey with unmistakable beginning, middle, and end.",
    phases: [
      { name: "Establish",     durationWeight: 2, color: [200,140,60], accent: [240,180,80], intensity: 0.25, style: "orbit",   description: "Warmth, promise, the world as it was — establishing shot" },
      { name: "Rising Action", durationWeight: 2, color: [220,100,40], accent: [255,140,60], intensity: 0.4,  style: "rise",    description: "Stakes announced, motion accelerates, desire becomes clear" },
      { name: "Complication",  durationWeight: 2, color: [180,60,40],  accent: [220,80,80],  intensity: 0.6,  style: "scatter", description: "Obstacles multiply, dissonance enters, harmonic tension" },
      { name: "Crisis",        durationWeight: 1, color: [120,20,20],  accent: [200,40,40],  intensity: 0.8,  style: "dissolve",description: "All seems lost, lowest point, the dark before the turn" },
      { name: "Climax",        durationWeight: 1, color: [255,240,200],accent: [255,180,60], intensity: 1.0,  style: "scatter", description: "Truth revealed, decisive action, cathartic emotional release" },
      { name: "Falling Action",durationWeight: 2, color: [200,160,80], accent: [180,220,140],intensity: 0.45, style: "wave",    description: "Aftermath, consequences settle, breathing slows" },
      { name: "Resolution",    durationWeight: 2, color: [80,120,200], accent: [140,180,255],intensity: 0.2,  style: "orbit",   description: "New equilibrium, bittersweet calm, horizon opens" },
    ],
  },
  {
    id: "ritual",
    name: "Ritual",
    tagline: "Ceremony arc · 45 min",
    minutes: 45,
    about: "Slower and more intentional than psychedelic. Four phases: gathering silence → sacred opening → ceremony proper → closing. Identity is preserved and deepened, not dissolved. Built for group ceremonies.",
    phases: [
      { name: "Gathering", durationWeight: 2, color: [80,60,40],   accent: [120,100,60], intensity: 0.15, style: "orbit",   description: "Participants arrive, space becomes sacred, intention forms in silence" },
      { name: "Opening",   durationWeight: 2, color: [180,120,60], accent: [220,160,80], intensity: 0.4,  style: "rise",    description: "Intention set, circle opened, threshold crossed" },
      { name: "Ceremony",  durationWeight: 5, color: [220,80,40],  accent: [255,160,60], intensity: 0.75, style: "scatter", description: "The work — prayer, song, silence, vision, transformation" },
      { name: "Closing",   durationWeight: 2, color: [120,100,80], accent: [160,140,100],intensity: 0.2,  style: "dissolve",description: "Circle closed, integration begins, the ordinary world returns" },
    ],
  },
  {
    id: "sleep",
    name: "Sleep Cycle",
    tagline: "Rest arc · 8 hr",
    minutes: 480,
    about: "Designed for 8-hour sleep. Ultra-gradual, no peaks, all soft dissolves. Bass quiets, treble disappears entirely. Only arc with no onset flashes — it never startles. Ends with a gentle dawn-light reemergence.",
    phases: [
      { name: "Waking Fade", durationWeight: 1, color: [200,160,220],accent: [160,120,200],intensity: 0.35, style: "wave",    description: "Day dissolves, body releases tension, breath slows toward rest" },
      { name: "Light Sleep", durationWeight: 2, color: [120,80,180], accent: [80,60,140],  intensity: 0.2,  style: "orbit",   description: "Hypnagogic drift, micro-dreams flicker, awareness softens" },
      { name: "Deep Sleep",  durationWeight: 3, color: [20,10,60],   accent: [40,20,100],  intensity: 0.05, style: "dissolve",description: "Delta waves, cellular restoration, memory consolidation" },
      { name: "REM",         durationWeight: 2, color: [40,100,180], accent: [80,160,220], intensity: 0.3,  style: "scatter", description: "Dream narratives, rapid eye movement, emotional processing" },
      { name: "Dawn",        durationWeight: 1, color: [220,160,80], accent: [255,200,100],intensity: 0.45, style: "rise",    description: "Light seeps in, awareness stirs, body prepares to wake" },
    ],
  },
];

const DEMO_MS = 60_000; // each arc demo plays out in 60 seconds

// ── Synthetic audio (no mic needed) ──────────────────────────────────────────

function syntheticBands(t: number, phase: PhaseDef): [number[], number, boolean] {
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

// ── Particle factory ──────────────────────────────────────────────────────────

function makeParticle(cx: number, cy: number, w: number, h: number, style: PhaseDef["style"], col: [number, number, number]): Particle {
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

// ── Canvas renderer ───────────────────────────────────────────────────────────

function paintFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, t: number,
  bands: number[], amplitude: number,
  flash: number,
  phase: PhaseDef,
  particles: Particle[]
): void {
  const cx = w / 2, cy = h / 2;
  const [pr, pg, pb] = phase.color;
  const [ar, ag, ab] = phase.accent;

  ctx.fillStyle = `rgba(0,0,0,${0.1 + amplitude * 0.07})`;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // Center glow
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

  // Amplitude rings (bass-driven)
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

  // Particles
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

  // Onset flash
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ArcsPage() {
  const [arcId, setArcId] = useState("psychedelic");
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [mode, setMode] = useState<"none" | "demo" | "mic">("none");
  const [running, setRunning] = useState(false);

  const arc = ARCS.find((a) => a.id === arcId) ?? ARCS[0];
  const phase = arc.phases[Math.min(phaseIdx, arc.phases.length - 1)];

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const flashRef = useRef(0);
  const lastPhaseSetRef = useRef(-1);
  const arcRef = useRef(arc);
  const modeRef = useRef<"none" | "demo" | "mic">("none");
  const startTimeRef = useRef(0);
  const phaseDursRef = useRef<number[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // Keep refs in sync with state so animation loop reads latest values.
  arcRef.current = arc;
  modeRef.current = mode;

  const { start: startMic, stop: stopMic, getFrame, error: micError } = useMicAnalyser({ smoothing: 0.85, gain: 2.0 });

  const calcDurations = useCallback((a: ArcDef): number[] => {
    const total = a.phases.reduce((s, p) => s + p.durationWeight, 0);
    return a.phases.map((p) => (p.durationWeight / total) * DEMO_MS);
  }, []);

  const handleStart = useCallback((m: "demo" | "mic") => {
    particlesRef.current = [];
    lastPhaseSetRef.current = -1;
    setMode(m);
    setPhaseIdx(0);
    setRunning(true);
    startTimeRef.current = performance.now();
    phaseDursRef.current = calcDurations(arcRef.current);
    if (m === "mic") void startMic();
  }, [startMic, calcDurations]);

  const handleStop = useCallback(() => {
    setRunning(false);
    setMode("none");
    stopMic();
    particlesRef.current = [];
  }, [stopMic]);

  const switchArc = useCallback((id: string) => {
    const newArc = ARCS.find((a) => a.id === id) ?? ARCS[0];
    arcRef.current = newArc;
    setArcId(id);
    setPhaseIdx(0);
    particlesRef.current = [];
    lastPhaseSetRef.current = -1;
    if (running) {
      startTimeRef.current = performance.now();
      phaseDursRef.current = calcDurations(newArc);
    }
  }, [running, calcDurations]);

  const jumpToPhase = useCallback((i: number) => {
    if (!running) return;
    const durs = phaseDursRef.current;
    let offset = 0;
    for (let j = 0; j < i; j++) offset += durs[j];
    startTimeRef.current = performance.now() - offset;
    particlesRef.current = [];
    lastPhaseSetRef.current = i;
    setPhaseIdx(i);
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
    window.addEventListener("resize", resize);

    const loop = (now: number) => {
      if (cw === 0) { animRef.current = requestAnimationFrame(loop); return; }

      // Auto-advance phase based on elapsed time.
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

      const curArc = arcRef.current;
      const curPhase = curArc.phases[Math.min(nextPhase, curArc.phases.length - 1)];
      const pts = particlesRef.current;

      let bands: number[], amplitude: number, onset: boolean;
      if (modeRef.current === "mic") {
        const frame = getFrame();
        if (frame) { bands = frame.bands; amplitude = frame.amplitude; onset = frame.onset; }
        else {
          const fb = syntheticBands(now, curPhase);
          bands = fb[0].map((v) => v * 0.15); amplitude = fb[1] * 0.15; onset = false;
        }
      } else {
        const fb = syntheticBands(now, curPhase);
        bands = fb[0]; amplitude = fb[1]; onset = fb[2];
      }

      flashRef.current *= 0.83;
      if (onset) flashRef.current = 1;

      // Spawn particles.
      const target = Math.floor(25 + curPhase.intensity * 150 + amplitude * 80);
      if (pts.length < target && Math.random() < 0.28 + amplitude * 0.5) {
        const count = onset ? 6 : 1;
        for (let i = 0; i < count; i++) {
          pts.push(makeParticle(cw / 2, ch / 2, cw, ch, curPhase.style, onset ? curPhase.accent : curPhase.color));
        }
      }

      paintFrame(ctx, cw, ch, now, bands, amplitude, flashRef.current, curPhase, pts);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, getFrame]);

  const totalWeight = arc.phases.reduce((s, p) => s + p.durationWeight, 0);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 3rem)", background: "#050508" }}>

      {/* Arc tabs */}
      <div className="flex border-b border-white/10 overflow-x-auto shrink-0 scrollbar-none">
        {ARCS.map((a) => (
          <button
            key={a.id}
            onClick={() => switchArc(a.id)}
            className={`px-4 py-2.5 text-xs tracking-wider whitespace-nowrap transition-colors ${
              arcId === a.id
                ? "text-white border-b-2 border-white/55 bg-white/5"
                : "text-white/35 hover:text-white/65"
            }`}
          >
            {a.name}
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
              <div className="text-[9px] tracking-[0.2em] text-white/25 uppercase mb-2">
                Journey Arc Prototype
              </div>
              <h1 className="text-2xl mb-1 tracking-tight">{arc.name}</h1>
              <p className="text-xs text-white/35 mb-1">{arc.tagline}</p>
              <p className="text-sm text-white/45 max-w-xs mb-7 leading-relaxed">{arc.about}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleStart("demo")}
                  className="px-5 py-2 text-xs tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
                >
                  Demo mode
                </button>
                <button
                  onClick={() => handleStart("mic")}
                  className="px-5 py-2 text-xs tracking-wider uppercase border border-white/15 rounded hover:bg-white/5 hover:border-white/35 transition text-white/50"
                >
                  Start mic
                </button>
              </div>
              {micError && (
                <p className="mt-3 text-xs text-rose-300/65 max-w-xs">{micError}</p>
              )}
              <Link href="/dream" className="mt-10 text-[11px] text-white/22 hover:text-white/50">
                ← dream sandbox
              </Link>
            </div>
          )}

          {/* Running HUD */}
          {running && (
            <div className="absolute top-3 right-3 flex items-center gap-3">
              <span className="text-[9px] tracking-wider text-white/22 uppercase">
                {mode === "demo" ? "demo" : "mic"}
              </span>
              <button
                onClick={handleStop}
                className="text-[10px] tracking-wider uppercase text-white/32 hover:text-white border border-white/10 hover:border-white/40 px-3 py-1 rounded transition"
              >
                stop
              </button>
            </div>
          )}
        </div>

        {/* Description panel — desktop only */}
        <div className="w-52 shrink-0 border-l border-white/8 hidden md:flex flex-col p-3 gap-4 overflow-y-auto text-left">
          <div>
            <div className="text-[9px] tracking-[0.15em] text-white/22 uppercase mb-1.5">Active phase</div>
            <div
              className="text-sm font-medium mb-1"
              style={{ color: `rgb(${phase.color[0]},${phase.color[1]},${phase.color[2]})` }}
            >
              {phase.name}
            </div>
            <div className="text-[11px] text-white/42 leading-relaxed">{phase.description}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.15em] text-white/22 uppercase mb-1.5">Arc design</div>
            <div className="text-[11px] text-white/38 leading-relaxed">{arc.about}</div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.15em] text-white/22 uppercase mb-1.5">Duration</div>
            <div className="text-[11px] text-white/42">{arc.minutes} min real · 60s demo</div>
            <div className="text-[9px] text-white/22 mt-0.5">{arc.phases.length} phases · click timeline to jump</div>
          </div>
          <div className="mt-auto">
            <Link href="/dream" className="text-[10px] text-white/18 hover:text-white/45">← back</Link>
          </div>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="shrink-0 border-t border-white/8 px-3 py-2">
        <div className="flex items-stretch gap-0.5">
          {arc.phases.map((p, i) => {
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
                className={`h-7 rounded-sm border text-[9px] tracking-wide truncate px-1.5 transition-all ${
                  active ? "bg-white/4" : "hover:border-white/25"
                } ${active ? "text-white" : "text-white/28 hover:text-white/52"}`}
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
