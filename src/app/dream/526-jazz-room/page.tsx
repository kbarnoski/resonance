"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { JazzEngine } from "./audio";
import type { TrioEvent } from "./audio";
import type { Phase } from "./jazz";

// ── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  alpha: number;
}

interface PresencePulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface DrawState {
  bassEnergy: number;
  pianoEnergy: number;
  drumsEnergy: number;
  melodyEnergy: number;
  userEnergy: number;
  currentChord: string;
  currentPhase: Phase | "";
  phaseLabel: string;
  particles: Particle[];
  pulses: PresencePulse[];
  beatFlash: number;
}

// ── User sit-in keys ─────────────────────────────────────────────────────────
// White keys: F blues scale + guide tones, two octaves
const SIT_IN_KEYS = [
  { label: "F",  midi: 65, color: "#d4a855" },
  { label: "G",  midi: 67, color: "#c49040" },
  { label: "Ab", midi: 68, color: "#a87828" },
  { label: "A",  midi: 69, color: "#c49040" },
  { label: "Bb", midi: 70, color: "#d4a855" },
  { label: "C",  midi: 72, color: "#c49040" },
  { label: "D",  midi: 74, color: "#d4a855" },
  { label: "Eb", midi: 75, color: "#a87828" },
  { label: "F5", midi: 77, color: "#d4a855" },
];

// ── Canvas drawing helpers ───────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Deep brown-black gradient
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.28, 20, w * 0.5, h * 0.4, h * 0.8);
  grad.addColorStop(0, "#1a0e04");
  grad.addColorStop(0.5, "#0d0805");
  grad.addColorStop(1, "#050303");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawSpotlight(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Warm amber/sepia spotlight from above
  const grad = ctx.createRadialGradient(w * 0.5, -h * 0.05, 10, w * 0.5, h * 0.4, h * 0.7);
  grad.addColorStop(0, "rgba(210,140,40,0.14)");
  grad.addColorStop(0.35, "rgba(180,100,20,0.07)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawSmoke(
  ctx: CanvasRenderingContext2D,
  particles: Particle[]
) {
  for (const p of particles) {
    const t = 1 - p.life / p.maxLife;
    const alpha = p.alpha * (1 - t * t);
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    grad.addColorStop(0, `rgba(160,110,50,0.5)`);
    grad.addColorStop(1, `rgba(80,50,20,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPresence(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  energy: number,
  label: string,
  color: string,
  radius: number
) {
  const r = radius + energy * 20;

  // Outer glow
  const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.8);
  glow.addColorStop(0, color.replace("1)", "0.35)"));
  glow.addColorStop(1, color.replace("1)", "0)"));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Core circle
  const core = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
  core.addColorStop(0, color.replace("1)", "0.9)"));
  core.addColorStop(0.6, color.replace("1)", "0.5)"));
  core.addColorStop(1, color.replace("1)", "0.1)"));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.save();
  ctx.globalAlpha = 0.7 + energy * 0.3;
  ctx.fillStyle = "#e8c87a";
  ctx.font = "bold 12px 'Georgia', serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + r + 18);
  ctx.restore();
}

function drawPulses(ctx: CanvasRenderingContext2D, pulses: PresencePulse[]) {
  for (const p of pulses) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawHUD(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  chord: string,
  phaseLabel: string,
  beatFlash: number
) {
  ctx.save();

  // Beat flash ring at top
  if (beatFlash > 0) {
    ctx.globalAlpha = beatFlash * 0.4;
    ctx.strokeStyle = "#d4a030";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }
  ctx.globalAlpha = 1;

  // Chord name — warm amber
  ctx.fillStyle = `rgba(212,168,80,${0.75 + beatFlash * 0.25})`;
  ctx.font = `bold ${Math.round(w * 0.055)}px 'Georgia', serif`;
  ctx.textAlign = "center";
  ctx.fillText(chord || "—", w * 0.5, h * 0.11);

  // Phase label
  ctx.fillStyle = "rgba(180,130,60,0.65)";
  ctx.font = `${Math.round(w * 0.026)}px 'Georgia', serif`;
  ctx.textAlign = "center";
  ctx.fillText(phaseLabel.toUpperCase(), w * 0.5, h * 0.165);

  ctx.restore();
}

function drawFloorLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Subtle perspective floor lines
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#a07030";
  ctx.lineWidth = 1;
  const vanishY = h * 0.55;
  const vanishX = w * 0.5;
  for (let i = 0; i <= 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(vanishX, vanishY);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const y = vanishY + (h - vanishY) * t;
    const xL = vanishX - (vanishX - 0) * t;
    const xR = vanishX + (w - vanishX) * t;
    ctx.beginPath();
    ctx.moveTo(xL, y);
    ctx.lineTo(xR, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JazzRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<JazzEngine | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const drawStateRef = useRef<DrawState>({
    bassEnergy: 0,
    pianoEnergy: 0,
    drumsEnergy: 0,
    melodyEnergy: 0,
    userEnergy: 0,
    currentChord: "F7",
    currentPhase: "head",
    phaseLabel: "Head",
    particles: [],
    pulses: [],
    beatFlash: 0,
  });

  const [started, setStarted] = useState(false);
  const [canvasError, setCanvasError] = useState(false);
  const [currentChordDisplay, setCurrentChordDisplay] = useState("F7");
  const [phaseDisplay, setPhaseDisplay] = useState("Head");

  // Spawn smoke particles on note events
  const spawnSmoke = useCallback(
    (x: number, y: number, count: number) => {
      const st = drawStateRef.current;
      for (let i = 0; i < count; i++) {
        st.particles.push({
          x: x + (Math.random() - 0.5) * 30,
          y: y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.6 - Math.random() * 0.8,
          life: 80 + Math.random() * 60,
          maxLife: 140,
          radius: 8 + Math.random() * 16,
          alpha: 0.18 + Math.random() * 0.12,
        });
      }
    },
    []
  );

  const handleStart = useCallback(() => {
    if (started) return;

    // Build AudioContext inside click handler for iOS unlock
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const engine = new JazzEngine(ctx);
    engineRef.current = engine;

    const canvas = canvasRef.current;
    if (!canvas) {
      setCanvasError(true);
    }

    engine.setEventCallback((evt: TrioEvent) => {
      const st = drawStateRef.current;
      const w = canvasRef.current?.width ?? 600;
      const h = canvasRef.current?.height ?? 400;

      // Presence positions (fractions of canvas)
      const bassX = w * 0.22;
      const bassY = h * 0.55;
      const pianoX = w * 0.5;
      const pianoY = h * 0.5;
      const drumsX = w * 0.78;
      const drumsY = h * 0.56;

      if (evt.type === "bass") {
        st.bassEnergy = Math.min(1, st.bassEnergy + 0.6);
        st.pulses.push({
          x: bassX,
          y: bassY,
          radius: 22,
          maxRadius: 70,
          alpha: 0.7,
          color: "rgba(180,100,30,1)",
        });
        spawnSmoke(bassX, bassY - 30, 2);
        st.beatFlash = 0.5;
      } else if (evt.type === "piano") {
        if (evt.velocity > 0) {
          st.pianoEnergy = Math.min(1, st.pianoEnergy + 0.5);
          st.pulses.push({
            x: pianoX,
            y: pianoY,
            radius: 20,
            maxRadius: 80,
            alpha: 0.65,
            color: "rgba(210,160,50,1)",
          });
          spawnSmoke(pianoX, pianoY - 30, 3);
        }
        if (evt.chord) {
          st.currentChord = evt.chord;
          st.currentPhase = evt.phase ?? "head";
          st.phaseLabel = evt.phase
            ? (evt.phase.charAt(0).toUpperCase() + evt.phase.slice(1)).replace("-", " ")
            : "Head";
          // Update React state for accessibility (rate-limited by rAF)
          setCurrentChordDisplay(evt.chord);
          setPhaseDisplay(st.phaseLabel);
        }
      } else if (evt.type === "drum") {
        st.drumsEnergy = Math.min(1, st.drumsEnergy + 0.7);
        st.pulses.push({
          x: drumsX,
          y: drumsY,
          radius: 18,
          maxRadius: 60,
          alpha: 0.55,
          color: "rgba(140,80,20,1)",
        });
        spawnSmoke(drumsX, drumsY - 20, 1);
      } else if (evt.type === "melody" || evt.type === "user") {
        if (evt.type === "melody") {
          st.melodyEnergy = Math.min(1, st.melodyEnergy + 0.6);
        } else {
          st.userEnergy = Math.min(1, st.userEnergy + 0.8);
        }
        spawnSmoke(pianoX, pianoY - 60, 2);
      }
    });

    engine.start();
    setStarted(true);
  }, [started, spawnSmoke]);

  const handleUserKey = useCallback(
    (midi: number) => {
      if (engineRef.current) {
        engineRef.current.playUserNote(midi);
        const st = drawStateRef.current;
        st.userEnergy = Math.min(1, st.userEnergy + 0.9);
      }
    },
    []
  );

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      setCanvasError(true);
      return;
    }

    let lastTime = 0;

    // Resize handler — reset transform before re-scaling to avoid compounding
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx2d.resetTransform();
      ctx2d.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const renderFrame = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(renderFrame);
      const dt = Math.min(timestamp - lastTime, 50);
      lastTime = timestamp;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const st = drawStateRef.current;

      // Decay energies
      const decay = 1 - dt * 0.003;
      st.bassEnergy = Math.max(0, st.bassEnergy * decay);
      st.pianoEnergy = Math.max(0, st.pianoEnergy * decay);
      st.drumsEnergy = Math.max(0, st.drumsEnergy * decay);
      st.melodyEnergy = Math.max(0, st.melodyEnergy * decay);
      st.userEnergy = Math.max(0, st.userEnergy * decay);
      st.beatFlash = Math.max(0, st.beatFlash - dt * 0.005);

      // Update particles
      st.particles = st.particles.filter((p) => p.life > 0);
      for (const p of st.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy *= 0.992;
        p.vx *= 0.995;
        p.radius += 0.12;
        p.life -= 1;
      }
      // Limit particle count
      if (st.particles.length > 120) {
        st.particles = st.particles.slice(st.particles.length - 120);
      }
      // Spawn ambient smoke even when quiet
      if (Math.random() < 0.04) {
        st.particles.push({
          x: w * (0.3 + Math.random() * 0.4),
          y: h * (0.55 + Math.random() * 0.2),
          vx: (Math.random() - 0.5) * 0.2,
          vy: -0.25 - Math.random() * 0.3,
          life: 120 + Math.random() * 80,
          maxLife: 200,
          radius: 12 + Math.random() * 20,
          alpha: 0.06 + Math.random() * 0.06,
        });
      }

      // Update ring pulses
      for (const p of st.pulses) {
        p.radius += (p.maxRadius - p.radius) * 0.07;
        p.alpha *= 0.91;
      }
      st.pulses = st.pulses.filter((p) => p.alpha > 0.01);

      // Clear
      ctx2d.clearRect(0, 0, w, h);

      // Draw layers
      drawBackground(ctx2d, w, h);
      drawFloorLines(ctx2d, w, h);
      drawSpotlight(ctx2d, w, h);
      drawSmoke(ctx2d, st.particles);
      drawPulses(ctx2d, st.pulses);

      // Bass (left)
      drawPresence(
        ctx2d,
        w * 0.22,
        h * 0.55,
        st.bassEnergy,
        "BASS",
        "rgba(180,100,30,1)",
        28
      );

      // Piano (center)
      drawPresence(
        ctx2d,
        w * 0.5,
        h * 0.5,
        st.pianoEnergy,
        "PIANO",
        "rgba(210,160,50,1)",
        32
      );

      // Drums (right)
      drawPresence(
        ctx2d,
        w * 0.78,
        h * 0.55,
        st.drumsEnergy,
        "DRUMS",
        "rgba(140,80,20,1)",
        26
      );

      // Melody sparkle above piano
      if (st.melodyEnergy > 0.05 || st.userEnergy > 0.05) {
        const me = Math.max(st.melodyEnergy, st.userEnergy);
        ctx2d.save();
        ctx2d.globalAlpha = me * 0.8;
        ctx2d.fillStyle = "#f5e070";
        ctx2d.font = `${Math.round(14 + me * 8)}px serif`;
        ctx2d.textAlign = "center";
        ctx2d.fillText("♪", w * 0.5, h * 0.32);
        ctx2d.restore();
      }

      // HUD
      drawHUD(ctx2d, w, h, st.currentChord, st.phaseLabel, st.beatFlash);
    };

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Cleanup engine on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-[#080504] flex flex-col items-center overflow-hidden select-none">
      {/* Title bar */}
      <header className="w-full max-w-3xl px-4 pt-5 pb-2 z-10 relative">
        <h1 className="text-2xl font-serif text-violet-300/95 tracking-wide text-center">
          Jazz Room
        </h1>
        <p className="text-sm text-muted-foreground text-center mt-1 font-light italic">
          A late-night trio — sit in, or just listen
        </p>
        {started && (
          <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground font-mono">
            <span>
              Chord:{" "}
              <span className="text-violet-300/95 font-semibold">{currentChordDisplay}</span>
            </span>
            <span>
              Phase:{" "}
              <span className="text-violet-300/95 font-semibold">{phaseDisplay}</span>
            </span>
          </div>
        )}
      </header>

      {/* Canvas stage */}
      <div className="relative w-full max-w-3xl px-3 z-10">
        {canvasError && (
          <p className="text-violet-300 text-base text-center py-4">
            Canvas 2D not available in this browser — audio continues.
          </p>
        )}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ height: "340px", display: "block" }}
          aria-label="Jazz trio stage — smoky club visual"
        />
      </div>

      {/* Start / Stop button */}
      {!started ? (
        <div className="z-10 mt-5">
          <button
            onClick={handleStart}
            className="min-h-[44px] px-8 py-2.5 rounded-full bg-violet-700/80 hover:bg-violet-600/90 text-foreground text-lg font-serif tracking-wide transition-all shadow-lg shadow-violet-900/50 border border-violet-500/40"
          >
            Start the Trio
          </button>
          <p className="text-muted-foreground text-sm text-center mt-3 italic">
            Press to begin — the trio plays autonomously
          </p>
        </div>
      ) : (
        <div className="z-10 mt-4 text-center">
          <p className="text-muted-foreground text-sm italic">
            The trio is playing &mdash; use the keys below to sit in
          </p>
        </div>
      )}

      {/* Sit-in keyboard */}
      {started && (
        <section className="z-10 mt-4 px-3 w-full max-w-3xl" aria-label="Sit-in keys">
          <p className="text-muted-foreground text-sm text-center mb-2 font-serif">
            Sit In &mdash; F Blues Scale
          </p>
          <div className="flex gap-1.5 justify-center flex-wrap">
            {SIT_IN_KEYS.map((k) => (
              <button
                key={k.midi}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleUserKey(k.midi);
                }}
                className="min-h-[44px] w-10 flex items-center justify-center rounded-md text-sm font-serif font-semibold transition-all active:scale-95 border border-violet-700/40"
                style={{
                  backgroundColor: "rgba(60,35,8,0.7)",
                  color: k.color,
                }}
                aria-label={`Play ${k.label}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Phase arc indicator */}
      {started && (
        <section className="z-10 mt-4 px-3 w-full max-w-3xl" aria-label="Performance arc">
          <div className="flex gap-1 justify-center items-center">
            {(["head", "piano-solo", "bass-solo", "trade-fours", "head-out"] as const).map(
              (ph) => {
                const isActive = phaseDisplay.toLowerCase().replace(" ", "-") === ph ||
                  (ph === "head" && phaseDisplay === "Head") ||
                  (ph === "piano-solo" && phaseDisplay === "Piano Solo") ||
                  (ph === "bass-solo" && phaseDisplay === "Bass Solo") ||
                  (ph === "trade-fours" && phaseDisplay === "Trade Fours") ||
                  (ph === "head-out" && phaseDisplay === "Head Out");
                const labels: Record<string, string> = {
                  "head": "Head",
                  "piano-solo": "Piano",
                  "bass-solo": "Bass",
                  "trade-fours": "Fours",
                  "head-out": "Out",
                };
                return (
                  <div
                    key={ph}
                    className={`px-2 py-1 rounded text-xs font-serif transition-all ${
                      isActive
                        ? "bg-violet-700/60 text-violet-300/95 border border-violet-500/50"
                        : "bg-violet-900/20 text-muted-foreground border border-violet-900/30"
                    }`}
                  >
                    {labels[ph]}
                  </div>
                );
              }
            )}
          </div>
        </section>
      )}

      {/* Footer info */}
      <footer className="z-10 mt-6 mb-4 px-4 text-center">
        <p className="text-muted-foreground text-xs font-light">
          Bill Evans rootless voicings &middot; Aebersold play-along tradition &middot; F Jazz Blues
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          Walking bass &middot; Brushed drums &middot; Type A/B shell voicings
        </p>
      </footer>
    </main>
  );
}
