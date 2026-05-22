"use client";

// **For**: kids (4+)
// Colorful stars fall from the night sky — tap them to collect pentatonic notes.
// When you have 3 or more, press ▶ replay to hear your melody.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic, matching 82-kids-color-piano palette
const NOTES = [
  { freq: 261.63, color: "#E63946" }, // C4 — red
  { freq: 329.63, color: "#E9C46A" }, // E4 — yellow
  { freq: 392.00, color: "#2ABFA8" }, // G4 — teal
  { freq: 440.00, color: "#4A90D9" }, // A4 — blue
  { freq: 523.25, color: "#A855C8" }, // C5 — purple
] as const;

const PAD_FREQS   = [130.81, 164.81, 196.00] as const; // C3/E3/G3 ambient pad
const MAX_FALLING = 6;   // max active falling stars at once
const MAX_CAUGHT  = 16;  // max notes in the melody

let _sid = 0; // monotonic star id

interface FallingStar {
  id:        number;
  x:         number; // CSS px
  y:         number; // CSS px
  vy:        number; // CSS px per normalized 60fps frame
  noteIdx:   number;
  radius:    number; // CSS px (visual + hit radius base)
  caught:    boolean;
  fadeAlpha: number; // 0-1, decreases after caught
  sparkles:  Array<{ x: number; y: number; vx: number; vy: number; alpha: number }>;
}

// ── module-level audio helpers (take actx as arg, no component closure) ────────

function bootPad(actx: AudioContext) {
  const master = actx.createGain();
  master.gain.value = 0.020;
  master.connect(actx.destination);
  PAD_FREQS.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g   = actx.createGain();
    const lfo = actx.createOscillator();
    const lg  = actx.createGain();
    osc.type            = "sine";
    osc.frequency.value = freq;
    g.gain.value        = 0.85;
    lfo.frequency.value = 0.07 + i * 0.023;
    lg.gain.value       = 0.06;
    lfo.connect(lg);
    lg.connect(g.gain);
    osc.connect(g).connect(master);
    osc.start();
    lfo.start();
  });
}

function ringNote(actx: AudioContext, freq: number) {
  const t  = actx.currentTime;
  const g  = actx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.48, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  g.connect(actx.destination);
  const o1 = actx.createOscillator();
  o1.type            = "triangle";
  o1.frequency.value = freq;
  o1.connect(g);
  o1.start(t);
  o1.stop(t + 0.9);
  const g2 = actx.createGain();
  g2.gain.value = 0.16;
  const o2 = actx.createOscillator();
  o2.type            = "sine";
  o2.frequency.value = freq * 2;
  o2.connect(g2).connect(g);
  o2.start(t);
  o2.stop(t + 0.9);
}

// ── 5-pointed star path helper ────────────────────────────────────────────────

function drawStarPath(
  ctx:   CanvasRenderingContext2D,
  cx:    number,
  cy:    number,
  outer: number,
) {
  const inner = outer * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r     = i % 2 === 0 ? outer : inner;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else          ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KidsStarCatch() {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const actxRef      = useRef<AudioContext | null>(null);
  const starsRef     = useRef<FallingStar[]>([]);
  const bgRef        = useRef<Array<{ x: number; y: number; r: number; phase: number }>>([]);
  const caughtRef    = useRef<number[]>([]);     // noteIdx history
  const nextSpawnRef = useRef(0);                // RAF ts after which to spawn next star
  const animRef      = useRef(0);

  const [caughtCount, setCaughtCount] = useState(0);
  const [replaying,   setReplaying]   = useState(false);

  function replayMelody() {
    if (replaying || caughtRef.current.length === 0) return;
    const actx = actxRef.current;
    if (!actx) return;
    setReplaying(true);
    let i = 0;
    const step = () => {
      if (i >= caughtRef.current.length) { setReplaying(false); return; }
      ringNote(actx, NOTES[caughtRef.current[i++]].freq);
      setTimeout(step, 300);
    };
    step();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let W   = canvas.offsetWidth;
    let H   = canvas.offsetHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function applySize() {
      if (!canvas) return;
      W   = canvas.offsetWidth;
      H   = canvas.offsetHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Regenerate static background stars after resize
      bgRef.current = Array.from({ length: 80 }, () => ({
        x:     Math.random() * W,
        y:     Math.random() * H,
        r:     0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
      }));
    }
    applySize();
    window.addEventListener("resize", applySize);

    // ── pointer handler ─────────────────────────────────────────────────────

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();

      // Boot AudioContext on first user gesture
      if (!actxRef.current) {
        const actx = new AudioContext();
        actxRef.current = actx;
        bootPad(actx);
      } else if (actxRef.current.state === "suspended") {
        void actxRef.current.resume();
      }

      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      // Hit-test falling stars; generous extra radius for 4yo motor accuracy
      for (const star of starsRef.current) {
        if (star.caught) continue;
        if (Math.hypot(cssX - star.x, cssY - star.y) < star.radius + 14) {
          star.caught    = true;
          star.fadeAlpha = 1;

          const actx = actxRef.current;
          if (actx) ringNote(actx, NOTES[star.noteIdx].freq);

          // Burst of 18 sparkle particles
          for (let i = 0; i < 18; i++) {
            const angle = (i / 18) * Math.PI * 2;
            const spd   = 2.5 + Math.random() * 3;
            star.sparkles.push({
              x: star.x, y: star.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd - 1.2,
              alpha: 1,
            });
          }

          if (caughtRef.current.length < MAX_CAUGHT) {
            caughtRef.current.push(star.noteIdx);
            setCaughtCount(caughtRef.current.length);
          }
          break; // one star per tap
        }
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });

    // ── RAF render loop ─────────────────────────────────────────────────────

    let lastMs = 0;

    const renderLoop = (ts: number) => {
      const dt   = lastMs === 0 ? 1 : Math.min((ts - lastMs) / 16.67, 3);
      lastMs = ts;

      // Spawn a new falling star if room allows
      if (
        starsRef.current.filter(s => !s.caught).length < MAX_FALLING &&
        ts > nextSpawnRef.current
      ) {
        starsRef.current.push({
          id:        _sid++,
          x:         W * 0.1 + Math.random() * W * 0.8,
          y:         -55,
          vy:        0.5 + Math.random() * 0.35, // ~30-51 px/s at 60fps
          noteIdx:   Math.floor(Math.random() * NOTES.length),
          radius:    38 + Math.random() * 12,    // 38-50px, well above 64px tap target with +14 bonus
          caught:    false,
          fadeAlpha: 1,
          sparkles:  [],
        });
        nextSpawnRef.current = ts + 2200 + Math.random() * 1600;
      }

      // Background
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#07060E");
      bg.addColorStop(1, "#0C1228");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Twinkling background stars
      for (const bs of bgRef.current) {
        const tw = 0.35 + 0.65 * Math.sin(ts * 0.0009 + bs.phase);
        ctx.globalAlpha = tw * 0.65;
        ctx.fillStyle   = "#ffffff";
        ctx.beginPath();
        ctx.arc(bs.x, bs.y, bs.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Update + draw falling stars
      const alive: FallingStar[] = [];
      for (const star of starsRef.current) {
        // Movement
        if (!star.caught) {
          star.y += star.vy * dt;
        } else {
          star.fadeAlpha -= 0.055 * dt;
        }

        const col = NOTES[star.noteIdx].color;

        // Sparkles
        const keepSp: typeof star.sparkles = [];
        for (const sp of star.sparkles) {
          sp.x    += sp.vx * dt;
          sp.y    += sp.vy * dt;
          sp.vy   += 0.07 * dt; // gravity
          sp.alpha -= 0.028 * dt;
          if (sp.alpha > 0) {
            ctx.globalAlpha = sp.alpha;
            ctx.shadowColor = col;
            ctx.shadowBlur  = 5;
            ctx.fillStyle   = col;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur  = 0;
            keepSp.push(sp);
          }
        }
        star.sparkles   = keepSp;
        ctx.globalAlpha = 1;

        // Star body
        const bodyAlpha = star.caught ? Math.max(0, star.fadeAlpha) : 1;
        if (bodyAlpha > 0) {
          ctx.globalAlpha = bodyAlpha;
          ctx.shadowColor = col;
          ctx.shadowBlur  = star.radius * 0.9;
          ctx.fillStyle   = col;
          drawStarPath(ctx, star.x, star.y, star.radius);
          ctx.fill();
          ctx.shadowBlur  = 0;
          ctx.globalAlpha = 1;
        }

        // Cull
        const fallen   = !star.caught && star.y > H + star.radius + 10;
        const fadedOut = star.caught  && star.fadeAlpha <= 0 && star.sparkles.length === 0;
        if (!fallen && !fadedOut) alive.push(star);
      }
      starsRef.current = alive;

      animRef.current = requestAnimationFrame(renderLoop);
    };

    animRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", applySize);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, []); // refs only in closure — no state deps needed

  return (
    <div className="fixed inset-0 bg-[#07060E] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full touch-none" />

      {/* Hint */}
      <div className="absolute top-5 left-0 right-0 flex justify-center pointer-events-none">
        <p className="font-mono text-white/75 text-base tracking-widest">
          ✦ tap the falling stars ✦
        </p>
      </div>

      {/* Caught melody dots */}
      {caughtCount > 0 && (
        <div className="absolute bottom-[4.5rem] left-4 right-4 flex flex-wrap justify-center gap-1.5 pointer-events-none">
          {caughtRef.current.map((noteIdx, i) => (
            <div
              key={i}
              style={{
                width:           12,
                height:          12,
                borderRadius:    "50%",
                backgroundColor: NOTES[noteIdx].color,
                boxShadow:       `0 0 5px 2px ${NOTES[noteIdx].color}88`,
              }}
            />
          ))}
        </div>
      )}

      {/* Replay button — appears after 3 catches */}
      {caughtCount >= 3 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <button
            onClick={replayMelody}
            disabled={replaying}
            className="font-mono text-white/90 text-base px-6 py-3 rounded-full transition-colors"
            style={{
              background: "rgba(255,255,255,0.10)",
              border:     "1px solid rgba(255,255,255,0.22)",
              minHeight:  48,
              minWidth:   140,
            }}
          >
            {replaying ? "♪ playing..." : "▶ replay"}
          </button>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-xs text-white/55 transition-colors hover:text-white/80"
      >
        ← dream lab
      </Link>
    </div>
  );
}
