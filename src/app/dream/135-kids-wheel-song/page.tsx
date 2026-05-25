"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic: C3 E3 G3 A3 C4
const SEG_FREQS = [130.81, 164.81, 196.00, 220.00, 261.63];
const SEG_COLS  = ["#8b5cf6", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4"];
// violet    rose      amber    emerald   cyan
const N_SEG      = 5;
const SEG_ARC    = (2 * Math.PI) / N_SEG; // 72° per segment
const NOTE_NAMES = ["C3", "E3", "G3", "A3", "C4"];

function buildImpulse(actx: AudioContext): AudioBuffer {
  const sr  = actx.sampleRate;
  const len = Math.floor(sr * 1.3);
  const buf = actx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++)
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
  return buf;
}

function strikeNote(
  actx: AudioContext,
  conv: ConvolverNode,
  master: GainNode,
  freq: number,
  speed01: number
) {
  const now  = actx.currentTime;
  const osc  = actx.createOscillator();
  const env  = actx.createGain();
  const wet  = actx.createGain();
  const gain = 0.08 + speed01 * 0.14; // louder when spinning faster

  osc.type = "triangle";
  osc.frequency.value = freq;

  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.018);
  env.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  wet.gain.value = 0.25;

  osc.connect(env);
  env.connect(master);
  env.connect(wet);
  wet.connect(conv);

  osc.start(now);
  osc.stop(now + 1.3);
}

export default function KidsWheelSong() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const actxRef     = useRef<AudioContext | null>(null);
  const convRef     = useRef<ConvolverNode | null>(null);
  const masterRef   = useRef<GainNode | null>(null);
  const toneOscRef  = useRef<OscillatorNode | null>(null);
  const toneGainRef = useRef<GainNode | null>(null);
  const omegaRef    = useRef(0.8);   // rad/s — starts auto-spinning
  const thetaRef    = useRef(0.0);   // cumulative angle (radians)
  const prevSegRef  = useRef(0);     // last floor(theta/SEG_ARC) value
  const segFlashRef  = useRef([0, 0, 0, 0, 0]); // per-segment flash decay 0→1
  const noteFlashRef = useRef(0);               // 1→0 over 600ms for name label
  const noteSegRef   = useRef(0);               // which segment last struck
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx   = new AudioContext();
    const conv   = actx.createConvolver();
    const master = actx.createGain();

    conv.buffer       = buildImpulse(actx);
    master.gain.value = 0.85;
    conv.connect(master);
    master.connect(actx.destination);

    // Continuous low drone that rises in pitch with spin speed
    const toneOsc  = actx.createOscillator();
    const toneGain = actx.createGain();
    toneOsc.type = "sine";
    toneOsc.frequency.value = 65.41; // C2
    toneGain.gain.value = 0;
    toneOsc.connect(toneGain);
    toneGain.connect(master);
    toneOsc.start();

    actxRef.current   = actx;
    convRef.current   = conv;
    masterRef.current = master;
    toneOscRef.current  = toneOsc;
    toneGainRef.current = toneGain;

    // Startup chime on the first segment color so the wheel feels alive immediately
    strikeNote(actx, conv, master, SEG_FREQS[0], 0.25);
    segFlashRef.current[0] = 1.0;
    noteFlashRef.current   = 1.0;
    noteSegRef.current     = 0;

    setStarted(true);
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
    const MAX_OMEGA = 6.0;
    const MIN_OMEGA = 0.30;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      // Each tap adds a burst of spin momentum
      omegaRef.current = Math.min(omegaRef.current + 1.6, MAX_OMEGA);
    };
    canvas.addEventListener("pointerdown", onPointer, { passive: false });

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(last === 0 ? 16 : ts - last, 80) * 0.001;
      last = ts;

      const W  = canvas.offsetWidth;
      const H  = canvas.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;
      const R  = Math.min(W, H) * 0.38;

      // Physics: decelerate, enforce minimum drift
      omegaRef.current *= Math.pow(0.993, dt * 60);
      omegaRef.current  = Math.max(omegaRef.current, MIN_OMEGA);
      const omega = omegaRef.current;

      // Advance rotation
      thetaRef.current += omega * dt;

      // Striker detection — fire note when a new segment enters the 12-o'clock position
      const newSeg = Math.floor(thetaRef.current / SEG_ARC);
      if (newSeg > prevSegRef.current) {
        const entering = newSeg % N_SEG;
        prevSegRef.current = newSeg;
        segFlashRef.current[entering] = 1.0;
        noteFlashRef.current          = 1.0;
        noteSegRef.current            = entering;
        const actx   = actxRef.current;
        const conv   = convRef.current;
        const master = masterRef.current;
        if (actx && conv && master) {
          strikeNote(actx, conv, master, SEG_FREQS[entering], Math.min(omega / MAX_OMEGA, 1));
        }
      }

      // Decay flashes
      for (let k = 0; k < N_SEG; k++) {
        segFlashRef.current[k] = Math.max(0, segFlashRef.current[k] - dt * 4.0);
      }
      noteFlashRef.current = Math.max(0, noteFlashRef.current - dt / 0.6);

      // Update continuous tone: pitch + gain track spin speed
      const toneOsc  = toneOscRef.current;
      const toneGain = toneGainRef.current;
      const actx     = actxRef.current;
      if (toneOsc && toneGain && actx) {
        const speed01 = Math.min(omega / MAX_OMEGA, 1);
        const fq = 65.41 * Math.pow(2, speed01 * 1.5); // C2 → A3 range
        toneOsc.frequency.setTargetAtTime(fq, actx.currentTime, 0.15);
        toneGain.gain.setTargetAtTime(speed01 * 0.038, actx.currentTime, 0.15);
      }

      // ── Draw ──────────────────────────────────────────────────────
      const theta    = thetaRef.current;
      const speed01  = Math.min(omega / MAX_OMEGA, 1);

      // Deep dark background
      ctx.fillStyle = "#050012";
      ctx.fillRect(0, 0, W, H);

      // Ambient glow behind wheel — brighter when spinning fast
      const bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      bgGlow.addColorStop(0, `rgba(80,40,200,${0.05 + speed01 * 0.09})`);
      bgGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, W, H);

      // ── Wheel segments ──
      for (let k = 0; k < N_SEG; k++) {
        const startA = -Math.PI / 2 + theta + k * SEG_ARC;
        const endA   = startA + SEG_ARC;
        const col    = SEG_COLS[k];
        const flash  = segFlashRef.current[k];

        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur  = flash > 0 ? 24 + flash * 24 : 6 + speed01 * 8;
        ctx.globalAlpha = 0.55 + flash * 0.30 + speed01 * 0.10;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, startA, endA);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.restore();
      }

      // ── Segment boundary lines (subtle dark dividers) ──
      ctx.save();
      ctx.strokeStyle = "rgba(5,0,18,0.55)";
      ctx.lineWidth   = 2.0;
      for (let k = 0; k < N_SEG; k++) {
        const a = -Math.PI / 2 + theta + k * SEG_ARC;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        ctx.stroke();
      }
      ctx.restore();

      // ── Outer rim ring ──
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();

      // ── Center hub (white glow) ──
      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur  = 14 + speed01 * 12;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.11, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      // ── Rotation indicator dot on the rim ──
      // A small bright dot that orbits with the wheel — confirms direction of spin
      const indicatorAngle = -Math.PI / 2 + theta;
      const idX = cx + R * 0.88 * Math.cos(indicatorAngle);
      const idY = cy + R * 0.88 * Math.sin(indicatorAngle);
      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur  = 8;
      ctx.globalAlpha = 0.70;
      ctx.beginPath();
      ctx.arc(idX, idY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      // ── Striker: golden downward-pointing triangle at 12 o'clock ──
      const sY    = cy - R - 8;   // tip touches rim
      const sHalf = 9;
      const sTop  = sY - 18;
      ctx.save();
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur  = 12;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(cx, sY);          // tip (pointing down toward rim)
      ctx.lineTo(cx - sHalf, sTop);
      ctx.lineTo(cx + sHalf, sTop);
      ctx.closePath();
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.restore();

      // ── Note name above striker ──
      const nf = noteFlashRef.current;
      if (nf > 0) {
        ctx.save();
        ctx.globalAlpha    = nf * 0.75;
        ctx.font           = "15px monospace";
        ctx.fillStyle      = "#ffffff";
        ctx.textAlign      = "center";
        ctx.textBaseline   = "bottom";
        ctx.fillText(NOTE_NAMES[noteSegRef.current], cx, sTop - 8);
        ctx.restore();
      }

      // ── "tap to spin" hint — fades as speed increases ──
      const hintAlpha = Math.max(0, 0.72 - speed01 * 1.8);
      if (hintAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha  = hintAlpha;
        ctx.font         = "16px monospace";
        ctx.fillStyle    = "#ffffff";
        ctx.textAlign    = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("tap anywhere to spin faster", W / 2, H - 22);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
      actxRef.current?.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050012] text-white gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">🎡</div>
        <h1 className="text-2xl font-serif text-white/95">Wheel Song</h1>
        <p className="text-base text-white/75 max-w-xs">
          The wheel spins and sings — each color plays a different note. Tap to spin it faster!
        </p>
        <div className="flex gap-3 items-center opacity-50 select-none mt-1" aria-hidden="true">
          {SEG_COLS.map((col, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: col,
                boxShadow: `0 0 8px ${col}`,
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-white/95 text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          🎡 Spin the wheel
        </button>
        <p className="text-sm text-white/55">no microphone needed · for kids 3+</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: "crosshair" }}
      />
    </div>
  );
}
