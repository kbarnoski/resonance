"use client";

// **For**: kids (4+)
// Five animal characters — tap each to hear their melody. Tap two at once to harmonize.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Character definitions ──────────────────────────────────────────────────────

interface CharDef {
  emoji: string;
  name:  string;
  color: string;   // border / label color
  glow:  string;   // darker shade for gradient
  bg:    string;   // circle fill (semi-transparent)
  notes:     number[];   // Hz
  durations: number[];   // seconds per note
  wave:    OscillatorType;
  attack:  number;   // seconds
  sustain: number;   // per-note sustain fraction (0-1 of duration)
}

const CHARS: CharDef[] = [
  {
    emoji: "🐸", name: "Frog", color: "#4ade80", glow: "#166534", bg: "#052e16cc",
    notes:     [261.63, 329.63, 392.00, 523.25],  // C4 E4 G4 C5 — rising arpeggio
    durations: [0.15,   0.15,   0.15,   0.40],
    wave: "triangle", attack: 0.012, sustain: 0.70,
  },
  {
    emoji: "🦉", name: "Owl", color: "#fbbf24", glow: "#78350f", bg: "#431407cc",
    notes:     [392.00, 329.63, 293.66, 261.63],  // G4 E4 D4 C4 — descending, calm
    durations: [0.28,   0.28,   0.28,   0.65],
    wave: "sine", attack: 0.045, sustain: 0.75,
  },
  {
    emoji: "🐱", name: "Cat", color: "#f472b6", glow: "#881337", bg: "#4a044ecc",
    notes:     [659.25, 783.99, 659.25, 587.33],  // E5 G5 E5 D5 — playful trill
    durations: [0.10,   0.10,   0.12,   0.28],
    wave: "triangle", attack: 0.008, sustain: 0.60,
  },
  {
    emoji: "🐟", name: "Fish", color: "#22d3ee", glow: "#164e63", bg: "#0c4a6ecc",
    notes:     [261.63, 220.00, 196.00, 261.63],  // C4 A3 G3 C4 — wavy
    durations: [0.22,   0.22,   0.22,   0.55],
    wave: "sine", attack: 0.030, sustain: 0.72,
  },
  {
    emoji: "🐻", name: "Bear", color: "#a78bfa", glow: "#3b0764", bg: "#1e1b4bcc",
    notes:     [130.81, 196.00, 164.81, 130.81],  // C3 G3 E3 C3 — deep, slow
    durations: [0.38,   0.38,   0.38,   0.85],
    wave: "sine", attack: 0.065, sustain: 0.80,
  },
];

const PAD_FREQS = [130.81, 164.81, 196.00] as const;  // C3 E3 G3

// ── Particle ───────────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  color: string;
  life: number;   // 1 → 0
  decay: number;  // per frame
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function KidsCharacterBand() {
  const acxRef       = useRef<AudioContext | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef      = useRef(0);
  const [started, setStarted]   = useState(false);
  const [lit, setLit]           = useState<ReadonlySet<number>>(new Set());
  const litRef = useRef<Set<number>>(new Set());

  // ── Audio helpers ────────────────────────────────────────────────────────────

  function bootAudio(): AudioContext {
    if (!acxRef.current) {
      const acx = new AudioContext();
      acxRef.current = acx;
      const master = acx.createGain();
      master.gain.value = 0.022;
      master.connect(acx.destination);
      PAD_FREQS.forEach((freq, i) => {
        const osc = acx.createOscillator();
        const g   = acx.createGain();
        const lfo = acx.createOscillator();
        const lg  = acx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        lfo.frequency.value = 0.07 + i * 0.022;
        lg.gain.value = 0.06;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(master);
        osc.start();
        lfo.start();
      });
    }
    if (acxRef.current.state === "suspended") void acxRef.current.resume();
    return acxRef.current;
  }

  function playPhrase(idx: number) {
    const acx = bootAudio();
    const ch  = CHARS[idx];

    const master = acx.createGain();
    master.gain.value = 0.42;
    master.connect(acx.destination);

    let t = acx.currentTime + 0.01;
    ch.notes.forEach((freq, i) => {
      const dur = ch.durations[i];
      const osc = acx.createOscillator();
      const g   = acx.createGain();
      osc.type = ch.wave;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.85, t + ch.attack);
      g.gain.setValueAtTime(0.85, t + dur * ch.sustain);
      g.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      t += dur;
    });

    return t - acx.currentTime;  // total duration
  }

  // ── Sparkle helpers ──────────────────────────────────────────────────────────

  function spawnSparkles(x: number, y: number, color: string) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.5;
      const speed = 70 + Math.random() * 90;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 4,
        color,
        life: 1,
        decay: 0.016 + Math.random() * 0.014,
      });
    }
  }

  // ── Tap handler ──────────────────────────────────────────────────────────────

  function handleStart() {
    setStarted(true);
  }

  function handleTapDown(idx: number, clientX: number, clientY: number) {
    const dur = playPhrase(idx);
    spawnSparkles(clientX, clientY, CHARS[idx].color);
    litRef.current.add(idx);
    setLit(new Set(litRef.current));
    setTimeout(() => {
      litRef.current.delete(idx);
      setLit(new Set(litRef.current));
    }, dur * 1000);
  }

  // ── Canvas animation loop ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();

    function drawFrame(now: number) {
      animRef.current = requestAnimationFrame(drawFrame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      ctx.clearRect(0, 0, W, H);

      const p = particlesRef.current;
      for (let i = p.length - 1; i >= 0; i--) {
        const pt = p[i];
        pt.x  += pt.vx * dt;
        pt.y  += pt.vy * dt;
        pt.vy += 55 * dt;  // gentle gravity
        pt.life -= pt.decay;
        if (pt.life <= 0) { p.splice(i, 1); continue; }
        ctx.globalAlpha = pt.life * pt.life;
        ctx.fillStyle   = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * pt.life, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    animRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-screen h-screen overflow-hidden flex flex-col"
      style={{ background: "linear-gradient(180deg, #0a0a1a 0%, #050510 100%)" }}
    >
      {/* Sparkle canvas (pointer-events:none — taps pass through to buttons) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-10"
      />

      {/* ── Start screen ──────────────────────────────────────────────────── */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-20">
          <div className="text-7xl mb-6 select-none">🎶</div>
          <h1 className="text-4xl font-bold text-foreground mb-3">
            Character Band
          </h1>
          <p className="text-lg text-muted-foreground max-w-xs mb-10 leading-relaxed">
            Tap an animal to hear their song!
          </p>
          <button
            onClick={handleStart}
            style={{ minHeight: 80, minWidth: 260, fontSize: "1.4rem" }}
            className="font-bold rounded-3xl bg-violet-500 hover:bg-violet-400 active:scale-95 text-foreground transition-all shadow-xl shadow-violet-500/40 px-10 py-5"
          >
            🎵 Let&rsquo;s Jam!
          </button>
          <Link href="/dream" className="mt-10 text-base text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream lab
          </Link>
        </div>
      )}

      {/* ── Play screen ───────────────────────────────────────────────────── */}
      {started && (
        <>
          {/* Back link — unobtrusive */}
          <Link href="/dream" className="absolute top-4 left-4 text-sm text-muted-foreground/70 hover:text-muted-foreground z-20">
            ← back
          </Link>

          {/* Title */}
          <div className="relative z-20 text-center pt-6 pb-2 shrink-0">
            <h1 className="text-2xl font-bold text-foreground">Character Band</h1>
            <p className="text-base text-muted-foreground mt-1">
              Tap to play — tap two at once to harmonize
            </p>
          </div>

          {/* Characters */}
          <div className="relative z-20 flex-1 flex items-center justify-center px-3">
            <div className="flex items-end justify-center gap-3 sm:gap-5 w-full max-w-2xl">
              {CHARS.map((ch, idx) => {
                const isLit = lit.has(idx);
                return (
                  <button
                    key={idx}
                    className="flex flex-col items-center gap-2 touch-none select-none flex-1"
                    style={{
                      maxWidth: 140,
                      WebkitTapHighlightColor: "transparent",
                      transform: isLit ? "scale(1.16) translateY(-6px)" : "scale(1)",
                      transition: isLit
                        ? "transform 0.07s ease-out"
                        : "transform 0.30s cubic-bezier(.22,.84,.26,1)",
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleTapDown(idx, e.clientX, e.clientY);
                    }}
                  >
                    {/* Character circle */}
                    <div
                      className="rounded-full flex items-center justify-center w-full"
                      style={{
                        aspectRatio: "1",
                        minWidth: 68,
                        background: ch.bg,
                        border: `3px solid ${ch.color}`,
                        boxShadow: isLit
                          ? `0 0 32px 10px ${ch.color}88, 0 0 8px 2px ${ch.color}`
                          : `0 0 12px 2px ${ch.color}33`,
                        transition: "box-shadow 0.15s",
                        fontSize: "clamp(28px, 6vw, 52px)",
                      }}
                    >
                      {ch.emoji}
                    </div>

                    {/* Name */}
                    <span
                      className="text-sm font-semibold leading-none"
                      style={{ color: ch.color }}
                    >
                      {ch.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Breathing hint text */}
          <div className="relative z-20 pb-6 text-center shrink-0">
            <p className="text-sm text-muted-foreground/70">
              Each animal has their own song ✦ mix &amp; match
            </p>
          </div>
        </>
      )}
    </div>
  );
}
