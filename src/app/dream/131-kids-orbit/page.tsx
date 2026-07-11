"use client";
import { useRef, useEffect, useState } from "react";

// 5 orbital bands — index 0 = innermost (fast, high pitch), index 4 = outermost (slow, low)
const BAND_HZ      = [261.63, 220.0, 196.0, 164.81, 130.81]; // C4 A3 G3 E3 C3
const BAND_COLORS  = ["#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6"]; // rose amber emerald cyan violet
const BAND_FRACS   = [0.175, 0.265, 0.365, 0.475, 0.595]; // radii as fraction of halfMin
const BAND_PERIODS = [3.5, 5.0, 7.0, 9.5, 13.0];          // orbit periods in seconds
const BAND_OMEGA   = BAND_PERIODS.map(p => (2 * Math.PI) / p);
const N_BANDS      = 5;

interface OrbBall {
  bandIdx: number;
  startAngle: number; // angle at placement (0 = north, + clockwise)
  phase: number;      // cumulative orbit progress (0 → 2π = one full orbit)
  flash: number;      // 0→1, pulses bright when note fires
  id: number;
}

function buildImpulse(actx: AudioContext): AudioBuffer {
  const sr  = actx.sampleRate;
  const len = Math.floor(sr * 1.6);
  const buf = actx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  return buf;
}

function ringNote(
  actx: AudioContext,
  conv: ConvolverNode,
  master: GainNode,
  freq: number
) {
  const now  = actx.currentTime;
  const osc  = actx.createOscillator();
  const env  = actx.createGain();
  const osc2 = actx.createOscillator();
  const env2 = actx.createGain();
  const wet  = actx.createGain();

  osc.type  = "triangle";
  osc.frequency.value = freq;
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.0;

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.20, now + 0.03);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

  env2.gain.setValueAtTime(0, now);
  env2.gain.linearRampToValueAtTime(0.07, now + 0.03);
  env2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

  wet.gain.value = 0.28;

  osc.connect(env);   env.connect(master);  env.connect(wet);
  osc2.connect(env2); env2.connect(master); env2.connect(wet);
  wet.connect(conv);

  osc.start(now);  osc.stop(now + 1.6);
  osc2.start(now); osc2.stop(now + 1.0);
}

export default function KidsOrbit() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const convRef   = useRef<ConvolverNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const ballsRef  = useRef<OrbBall[]>([]);
  const nextIdRef = useRef(0);
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx   = new AudioContext();
    const conv   = actx.createConvolver();
    const wetGain = actx.createGain();
    const master = actx.createGain();

    conv.buffer     = buildImpulse(actx);
    wetGain.gain.value = 0.14;
    master.gain.value  = 0.88;

    conv.connect(wetGain);
    wetGain.connect(master);
    master.connect(actx.destination);

    actxRef.current  = actx;
    convRef.current  = conv;
    masterRef.current = master;

    // Ambient drone: C2 + G2
    [65.41, 98.0].forEach((freq, idx) => {
      const osc = actx.createOscillator();
      const g   = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = 0.011 - idx * 0.003;
      osc.connect(g);
      g.connect(master);
      osc.start();
    });

    setStarted(true);
  }

  function clearBalls() {
    ballsRef.current = [];
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rafId = 0;
    let last  = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const actx = actxRef.current;
      const conv = convRef.current;
      const mg   = masterRef.current;
      if (!actx || !conv || !mg) return;

      const rect    = canvas.getBoundingClientRect();
      const px      = e.clientX - rect.left;
      const py      = e.clientY - rect.top;
      const W       = canvas.offsetWidth;
      const H       = canvas.offsetHeight;
      const halfMin = Math.min(W, H) / 2;
      const cx      = W / 2;
      const cy      = H / 2;
      const dx      = px - cx;
      const dy      = py - cy;
      const dist    = Math.hypot(dx, dy);

      // Ignore taps too close to center or well beyond outermost orbit
      if (dist < BAND_FRACS[0] * halfMin * 0.4)  return;
      if (dist > BAND_FRACS[N_BANDS - 1] * halfMin * 1.38) return;

      // Snap to nearest band
      let nearestBand = 0;
      let minDiff = Infinity;
      for (let i = 0; i < N_BANDS; i++) {
        const diff = Math.abs(dist - BAND_FRACS[i] * halfMin);
        if (diff < minDiff) { minDiff = diff; nearestBand = i; }
      }

      // Angle from north, increasing clockwise: atan2(east, north)
      const startAngle = Math.atan2(dx, -dy);

      const existingIdx = ballsRef.current.findIndex(b => b.bandIdx === nearestBand);
      if (existingIdx >= 0) {
        // Move existing ball to new angle
        ballsRef.current[existingIdx].startAngle = startAngle;
        ballsRef.current[existingIdx].phase      = 0;
        ballsRef.current[existingIdx].flash      = 1.0;
      } else {
        ballsRef.current.push({
          bandIdx: nearestBand,
          startAngle,
          phase: 0,
          flash: 1.0,
          id: nextIdRef.current++,
        });
      }
      ringNote(actx, conv, mg, BAND_HZ[nearestBand]);
    };
    canvas.addEventListener("pointerdown", onPointer);

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(last === 0 ? 16 : ts - last, 80) * 0.001;
      last = ts;

      const W       = canvas.offsetWidth;
      const H       = canvas.offsetHeight;
      const cx      = W / 2;
      const cy      = H / 2;
      const halfMin = Math.min(W, H) / 2;

      // Update balls — trigger note on each completed orbit
      const actx = actxRef.current;
      const conv = convRef.current;
      const mg   = masterRef.current;
      for (const ball of ballsRef.current) {
        const prev = ball.phase;
        ball.phase += BAND_OMEGA[ball.bandIdx] * dt;
        ball.flash  = Math.max(0, ball.flash - dt * 2.2);
        if (
          actx && conv && mg &&
          Math.floor(ball.phase / (2 * Math.PI)) > Math.floor(prev / (2 * Math.PI))
        ) {
          ringNote(actx, conv, mg, BAND_HZ[ball.bandIdx]);
          ball.flash = 1.0;
        }
      }

      // Background
      ctx.fillStyle = "#050010";
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfMin * 1.45);
      bg.addColorStop(0, "rgba(28, 8, 62, 0.92)");
      bg.addColorStop(0.65, "rgba(6, 1, 18, 0.75)");
      bg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Star field — deterministic golden-ratio positions
      ctx.save();
      ctx.fillStyle = "#fff";
      for (let s = 0; s < 52; s++) {
        const sx = ((Math.sin(s * 2.39996) + 1) / 2) * W;
        const sy = ((Math.cos(s * 1.61803) + 1) / 2) * H;
        const sz = 0.5 + 0.8 * ((Math.sin(s * 5.31) + 1) / 2);
        ctx.globalAlpha = 0.2 + 0.15 * ((Math.sin(s * 3.7) + 1) / 2);
        ctx.beginPath();
        ctx.arc(sx, sy, sz, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Orbit rings (dashed)
      ctx.save();
      ctx.setLineDash([5, 10]);
      for (let i = 0; i < N_BANDS; i++) {
        const r       = BAND_FRACS[i] * halfMin;
        const hasBall = ballsRef.current.some(b => b.bandIdx === i);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = hasBall
          ? BAND_COLORS[i] + "55"
          : "rgba(255,255,255,0.08)";
        ctx.lineWidth = hasBall ? 1.2 : 0.6;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();

      // Central sun
      const sunR = halfMin * 0.078;
      ctx.save();
      ctx.shadowColor = "rgba(200,140,255,0.9)";
      ctx.shadowBlur  = 32;
      const sunGr = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR);
      sunGr.addColorStop(0, "#ffffff");
      sunGr.addColorStop(0.42, "#d8aeff");
      sunGr.addColorStop(1, "rgba(120,55,200,0)");
      ctx.beginPath();
      ctx.arc(cx, cy, sunR, 0, 2 * Math.PI);
      ctx.fillStyle = sunGr;
      ctx.fill();
      ctx.restore();

      // Ball trails and bodies
      for (const ball of ballsRef.current) {
        const r         = BAND_FRACS[ball.bandIdx] * halfMin;
        const drawAngle = ball.startAngle + ball.phase;
        const bx        = cx + r * Math.sin(drawAngle);
        const by        = cy - r * Math.cos(drawAngle);
        const ballR     = halfMin * 0.054;
        const col       = BAND_COLORS[ball.bandIdx];

        // Trail arc (grows as ball moves, max ~51°)
        const tailLen = Math.min(Math.PI / 3.5, ball.phase);
        if (tailLen > 0.05) {
          // Canvas arc convention: canvas_angle = my_angle - π/2
          const arcStart = (drawAngle - tailLen) - Math.PI / 2;
          const arcEnd   = drawAngle - Math.PI / 2;
          ctx.save();
          ctx.globalAlpha = 0.22;
          ctx.beginPath();
          ctx.arc(cx, cy, r, arcStart, arcEnd, false);
          ctx.strokeStyle = col;
          ctx.lineWidth   = ballR * 0.85;
          ctx.lineCap     = "round";
          ctx.stroke();
          ctx.restore();
        }

        // Planet glow + body
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur  = 12 + ball.flash * 26;
        ctx.beginPath();
        ctx.arc(bx, by, ballR, 0, 2 * Math.PI);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.shadowBlur = 0;
        // Bright core
        ctx.beginPath();
        ctx.arc(bx, by, ballR * 0.40, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255,255,255,${0.65 + ball.flash * 0.30})`;
        ctx.fill();
        ctx.restore();
      }

      // Empty-state hint
      if (ballsRef.current.length === 0) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.font = "16px monospace";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap anywhere to add a planet", cx, cy + BAND_FRACS[2] * halfMin + 28);
        ctx.restore();
      }
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050010] text-foreground gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">🪐</div>
        <h1 className="text-2xl font-serif text-foreground">Orbit Garden</h1>
        <p className="text-base text-muted-foreground max-w-xs">
          Tap to send glowing planets into orbit. Each one rings its own note. Inner planets spin
          faster and sing higher.
        </p>
        <div className="flex gap-3 items-center opacity-40 select-none mt-1" aria-hidden="true">
          {BAND_COLORS.map((col, i) => (
            <div
              key={i}
              style={{
                width: 10 + i * 4,
                height: 10 + i * 4,
                borderRadius: "50%",
                backgroundColor: col,
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-foreground text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          ✨ Begin
        </button>
        <p className="text-sm text-muted-foreground">no microphone needed · for kids 3+</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: "pointer" }}
      />
      <button
        className="absolute top-4 right-4 min-h-[44px] px-4 py-2 text-sm text-muted-foreground hover:text-muted-foreground transition-colors"
        onPointerDown={(e) => {
          e.preventDefault();
          clearBalls();
        }}
      >
        clear
      </button>
    </div>
  );
}
