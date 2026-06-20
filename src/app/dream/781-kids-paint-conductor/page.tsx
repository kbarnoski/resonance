"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Pentatonic scale: C major pentatonic across ~2.5 octaves (C3–A5) ───────
// MIDI notes: C3=48, D3=50, E3=52, G3=55, A3=57, C4=60, D4=62, E4=64, G4=67, A4=69,
//              C5=72, D5=74, E5=76, G5=79, A5=81
const PENTA_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
const PENTA_COUNT = PENTA_MIDI.length;

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function yNormToPentaHz(yNorm: number): number {
  // yNorm 0=top (high), 1=bottom (low)
  const idx = Math.round((1 - yNorm) * (PENTA_COUNT - 1));
  const clamped = Math.max(0, Math.min(PENTA_COUNT - 1, idx));
  return midiToHz(PENTA_MIDI[clamped]);
}

// ─── Voice / color swatches ──────────────────────────────────────────────────
interface Voice {
  id: string;
  label: string;
  color: string;
  lineWidth: number;
  emoji: string;
}

const VOICES: Voice[] = [
  { id: "bell",      label: "Bell",      color: "#f59e0b", lineWidth: 4,  emoji: "🔔" },
  { id: "flute",     label: "Flute",     color: "#34d399", lineWidth: 5,  emoji: "🪈" },
  { id: "horn",      label: "Horn",      color: "#f87171", lineWidth: 7,  emoji: "🎺" },
  { id: "musicbox",  label: "Music Box", color: "#a78bfa", lineWidth: 4,  emoji: "🎶" },
  { id: "pluck",     label: "Pluck",     color: "#60a5fa", lineWidth: 6,  emoji: "🎸" },
];

// ─── Audio types ─────────────────────────────────────────────────────────────
interface SafeChain {
  ctx: AudioContext;
  master: GainNode;
  lp: BiquadFilterNode;
  comp: DynamicsCompressorNode;
}

// ─── Stroke pixel data ───────────────────────────────────────────────────────
interface StrokePoint {
  x: number;  // canvas px
  y: number;  // canvas px
  voiceId: string;
  lineWidth: number;
}

interface Stroke {
  points: StrokePoint[];
  voiceId: string;
  color: string;
  lineWidth: number;
}

// ─── Sparkle for clear animation ─────────────────────────────────────────────
interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

// ─── Build audio safety chain ─────────────────────────────────────────────────
function buildSafeChain(ctx: AudioContext): SafeChain {
  const master = ctx.createGain();
  master.gain.value = 0.28;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);
  return { ctx, master, lp, comp };
}

// ─── Synthesise a short note for a voice ─────────────────────────────────────
function playVoiceNote(
  chain: SafeChain,
  voiceId: string,
  hz: number,
  loudness: number  // 0..1 from stroke thickness
): void {
  const { ctx, master } = chain;
  const t = ctx.currentTime;
  const amp = 0.18 + loudness * 0.18; // gentle range
  const dur = 0.22;

  const g = ctx.createGain();
  g.connect(master);

  if (voiceId === "bell") {
    // Soft sine "bell"
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2.756; // bell partial
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    osc.connect(g);
    osc2.connect(g2);
    g2.connect(master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 2.5);
    osc.start(t); osc.stop(t + dur * 2.5);
    osc2.start(t); osc2.stop(t + dur * 2.5);

  } else if (voiceId === "flute") {
    // Triangle "flute"
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    osc.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.04);
    g.gain.setValueAtTime(amp, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur + 0.05);

  } else if (voiceId === "horn") {
    // Warm sawtooth through lowpass "horn"
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hz;
    const hornLp = ctx.createBiquadFilter();
    hornLp.type = "lowpass";
    hornLp.frequency.value = hz * 3;
    hornLp.Q.value = 1.4;
    osc.connect(hornLp);
    hornLp.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp * 0.8, t + 0.06);
    g.gain.setValueAtTime(amp * 0.8, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.1);
    osc.start(t); osc.stop(t + dur + 0.15);

  } else if (voiceId === "musicbox") {
    // FM "music-box"
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = hz;
    const modulator = ctx.createOscillator();
    modulator.type = "sine";
    modulator.frequency.value = hz * 3.5;
    const modGain = ctx.createGain();
    modGain.gain.value = hz * 1.5;
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 2);
    carrier.start(t); carrier.stop(t + dur * 2);
    modulator.start(t); modulator.stop(t + dur * 2);

  } else {
    // Soft pluck (triangle + quick decay)
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.2;
    osc2.connect(g2); g2.connect(master);
    osc.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 1.5);
    osc.start(t); osc.stop(t + dur * 1.5);
    osc2.start(t); osc2.stop(t + dur * 1.5);
  }
}

// ─── Soft ambient pad drone ───────────────────────────────────────────────────
function startAmbientPad(chain: SafeChain): () => void {
  const { ctx, master } = chain;
  // Very soft pad on C3 + G3
  const freqs = [130.81, 196.0, 261.63];
  const oscs: OscillatorNode[] = [];
  const gPad = ctx.createGain();
  gPad.gain.value = 0.018;
  gPad.connect(master);
  for (const f of freqs) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    // Slight detune for warmth
    o.detune.value = (Math.random() - 0.5) * 6;
    o.connect(gPad);
    o.start();
    oscs.push(o);
  }
  return () => {
    for (const o of oscs) {
      try { o.stop(); } catch { /* ignore */ }
    }
  };
}

// ─── Seed curve (pre-drawn gentle arc) ───────────────────────────────────────
function makeSeedStroke(w: number, h: number): Stroke {
  const points: StrokePoint[] = [];
  const segments = 60;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = w * 0.12 + t * w * 0.76;
    // Gentle sine arc across top half
    const y = h * 0.28 + Math.sin(t * Math.PI) * h * 0.18;
    points.push({ x, y, voiceId: "flute", lineWidth: 5 });
  }
  return { points, voiceId: "flute", color: "#34d399", lineWidth: 5 };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const LOOP_SECONDS = 8;          // playhead period
const NOTE_COOLDOWN_MS = 55;     // min ms between notes per column-strip

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function KidsPaintConductor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chainRef = useRef<SafeChain | null>(null);
  const stopPadRef = useRef<(() => void) | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const playheadRef = useRef<number>(0);   // 0..1 (fraction of canvas width)
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastNoteColRef = useRef<number>(-999);
  const lastNoteTimeRef = useRef<number>(0);
  const sparklesRef = useRef<Sparkle[]>([]);
  const clearingRef = useRef<boolean>(false);
  const clearStartRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [activeVoice, setActiveVoice] = useState<string>("flute");
  const [drawing, setDrawing] = useState(false);

  // ── Resize canvas to fill container ──────────────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      // Preserve existing strokes by redrawing after resize
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) ctx2d.scale(dpr, dpr);
    }
  }, []);

  // ── Draw all strokes onto canvas ─────────────────────────────────────────
  const redrawStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    // Clear to warm cream
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = "#fefce8";
    ctx2d.fillRect(0, 0, W, H);

    // Draw all strokes
    for (const stroke of strokesRef.current) {
      drawStroke(ctx2d, stroke);
    }
    // Current stroke being drawn
    if (currentStrokeRef.current) {
      drawStroke(ctx2d, currentStrokeRef.current);
    }
  }, []);

  // ── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    let startTime: number | null = null;

    function frame(ts: number) {
      if (!startTime) startTime = ts;
      const dt = Math.min((ts - lastFrameRef.current) / 1000, 0.05);
      lastFrameRef.current = ts;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;

      // Advance playhead
      playheadRef.current = ((playheadRef.current * W + dt * (W / LOOP_SECONDS)) / W) % 1;
      const phX = Math.round(playheadRef.current * W);

      // Clear and redraw background + strokes
      ctx2d.clearRect(0, 0, W, H);

      // During clear-sparkle animation
      if (clearingRef.current) {
        const elapsed = (ts - clearStartRef.current) / 1000;
        if (elapsed < 0.8) {
          ctx2d.fillStyle = "#fefce8";
          ctx2d.fillRect(0, 0, W, H);
        } else {
          clearingRef.current = false;
        }
      } else {
        ctx2d.fillStyle = "#fefce8";
        ctx2d.fillRect(0, 0, W, H);
      }

      // Draw strokes
      for (const stroke of strokesRef.current) {
        drawStroke(ctx2d, stroke);
      }
      if (currentStrokeRef.current) {
        drawStroke(ctx2d, currentStrokeRef.current);
      }

      // Draw sparkles
      const alive: Sparkle[] = [];
      for (const sp of sparklesRef.current) {
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vy += 120 * dt; // gravity
        sp.life -= dt * 1.6;
        if (sp.life > 0) {
          ctx2d.save();
          ctx2d.globalAlpha = sp.life;
          ctx2d.fillStyle = sp.color;
          ctx2d.beginPath();
          ctx2d.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.restore();
          alive.push(sp);
        }
      }
      sparklesRef.current = alive;

      // Draw playhead
      const now = performance.now();
      const phPulse = 0.7 + 0.3 * Math.sin(now / 180);
      ctx2d.save();
      ctx2d.globalAlpha = 0.72 * phPulse;
      const grad = ctx2d.createLinearGradient(phX - 3, 0, phX + 3, 0);
      grad.addColorStop(0, "rgba(253,230,138,0)");
      grad.addColorStop(0.5, "rgba(253,224,71,1)");
      grad.addColorStop(1, "rgba(253,230,138,0)");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(phX - 4, 0, 8, H);
      // bright white center line
      ctx2d.globalAlpha = 0.9 * phPulse;
      ctx2d.strokeStyle = "rgba(255,255,255,0.95)";
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(phX, 0);
      ctx2d.lineTo(phX, H);
      ctx2d.stroke();
      ctx2d.restore();

      // Draw dots where playhead overlaps strokes
      for (const stroke of strokesRef.current) {
        for (const pt of stroke.points) {
          const dx = Math.abs(pt.x - phX);
          if (dx < 6) {
            const brightness = 1 - dx / 6;
            ctx2d.save();
            ctx2d.globalAlpha = brightness * 0.85;
            ctx2d.fillStyle = stroke.color;
            ctx2d.shadowColor = stroke.color;
            ctx2d.shadowBlur = 12;
            ctx2d.beginPath();
            ctx2d.arc(pt.x, pt.y, stroke.lineWidth * 0.9, 0, Math.PI * 2);
            ctx2d.fill();
            ctx2d.restore();
          }
        }
      }

      // Sound notes at playhead column
      const chain = chainRef.current;
      if (chain && !clearingRef.current) {
        const colStrip = 4;
        if (
          Math.abs(phX - lastNoteColRef.current) >= colStrip &&
          now - lastNoteTimeRef.current > NOTE_COOLDOWN_MS
        ) {
          const hitPoints: StrokePoint[] = [];
          for (const stroke of strokesRef.current) {
            for (const pt of stroke.points) {
              if (Math.abs(pt.x - phX) < colStrip) {
                hitPoints.push(pt);
              }
            }
          }
          if (hitPoints.length > 0) {
            // Play up to 4 simultaneous notes to avoid mud
            const toPlay = hitPoints.slice(0, 4);
            for (const pt of toPlay) {
              const yNorm = pt.y / H;
              const hz = yNormToPentaHz(yNorm);
              const loudness = Math.min(1, (pt.lineWidth - 3) / 10);
              playVoiceNote(chain, pt.voiceId, hz, loudness);
            }
            lastNoteColRef.current = phX;
            lastNoteTimeRef.current = now;
          }
        }
      }

      animId = requestAnimationFrame(frame);
    }

    lastFrameRef.current = performance.now();
    animId = requestAnimationFrame(frame);
    rafRef.current = animId;

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [started]);

  // ── Start handler (iOS-safe AudioContext) ─────────────────────────────────
  const handleStart = useCallback(() => {
    if (started) return;
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const chain = buildSafeChain(ctx);
      chainRef.current = chain;
      const stopPad = startAmbientPad(chain);
      stopPadRef.current = stopPad;
    } catch {
      setAudioError(true);
    }

    // Seed initial curve
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W > 0 && H > 0) {
        strokesRef.current = [makeSeedStroke(W, H)];
      }
    }
    setStarted(true);
  }, [started]);

  // ── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvas();
    const ro = new ResizeObserver(() => {
      resizeCanvas();
      if (started) redrawStrokes();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [resizeCanvas, redrawStrokes, started]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      stopPadRef.current?.();
      chainRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // ── Pointer events for drawing ────────────────────────────────────────────
  const getCanvasXY = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started) return;
      e.preventDefault();
      const voice = VOICES.find((v) => v.id === activeVoice) ?? VOICES[1];
      const { x, y } = getCanvasXY(e);
      currentStrokeRef.current = {
        points: [{ x, y, voiceId: voice.id, lineWidth: voice.lineWidth }],
        voiceId: voice.id,
        color: voice.color,
        lineWidth: voice.lineWidth,
      };
      setDrawing(true);
    },
    [started, activeVoice, getCanvasXY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing || !currentStrokeRef.current) return;
      e.preventDefault();
      const { x, y } = getCanvasXY(e);
      const stroke = currentStrokeRef.current;
      const last = stroke.points[stroke.points.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy > 16) {
        stroke.points.push({ x, y, voiceId: stroke.voiceId, lineWidth: stroke.lineWidth });
      }
    },
    [drawing, getCanvasXY]
  );

  const handlePointerUp = useCallback(() => {
    if (!currentStrokeRef.current) return;
    if (currentStrokeRef.current.points.length > 1) {
      strokesRef.current = [...strokesRef.current, currentStrokeRef.current];
    }
    currentStrokeRef.current = null;
    setDrawing(false);
  }, []);

  // ── Clear with sparkle ────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;

    // Burst sparkles from all stroke points (sample up to 80)
    const allPts: StrokePoint[] = strokesRef.current.flatMap((s) => s.points);
    const sample = allPts.length > 80 ? allPts.filter((_, i) => i % Math.ceil(allPts.length / 80) === 0) : allPts;
    const newSparkles: Sparkle[] = sample.map((pt) => {
      const angle = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 110;
      const voice = VOICES.find((v) => v.id === pt.voiceId);
      return {
        x: pt.x,
        y: pt.y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 30,
        life: 1,
        color: voice?.color ?? "#fbbf24",
        r: 3 + Math.random() * 4,
      };
    });

    // Add extra random sparkles for fun
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 150;
      const cx = W * 0.2 + Math.random() * W * 0.6;
      const cy = H * 0.2 + Math.random() * H * 0.6;
      newSparkles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 40,
        life: 1,
        color: VOICES[Math.floor(Math.random() * VOICES.length)].color,
        r: 4 + Math.random() * 5,
      });
    }

    sparklesRef.current = [...sparklesRef.current, ...newSparkles];
    strokesRef.current = [];
    currentStrokeRef.current = null;
    clearingRef.current = true;
    clearStartRef.current = performance.now();

    // Replant seed after clearing
    setTimeout(() => {
      if (canvas) {
        const dpr2 = window.devicePixelRatio || 1;
        const W2 = canvas.width / dpr2;
        const H2 = canvas.height / dpr2;
        if (W2 > 0 && H2 > 0) {
          strokesRef.current = [makeSeedStroke(W2, H2)];
        }
      }
    }, 1200);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-amber-50 select-none">
      {/* ── Canvas ─────────────────────────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor: started ? "crosshair" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* ── Start overlay ──────────────────────────────────────────────── */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-50/90 z-20">
          <div className="text-center px-6 max-w-sm">
            <div className="text-5xl mb-4">🎨</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Paint Your Music!</h1>
            <p className="text-base text-slate-600 mb-8 leading-relaxed">
              Draw anything — a rainbow, a wave, a scribble — and watch the glowing bar turn your picture into a song!
            </p>
            <button
              onClick={handleStart}
              className="min-h-[64px] px-8 py-4 bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-slate-900 font-bold text-xl rounded-2xl shadow-lg transition-all"
              style={{ minWidth: 200 }}
            >
              🎵 Let&apos;s Paint!
            </button>
          </div>
        </div>
      )}

      {/* ── Audio unavailable notice ───────────────────────────────────── */}
      {audioError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white border border-rose-200 rounded-xl px-4 py-2 shadow">
          <p className="text-rose-600 font-semibold text-base">
            Sound is unavailable on this device, but you can still paint!
          </p>
        </div>
      )}

      {/* ── Voice / color swatches ─────────────────────────────────────── */}
      {started && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-3 items-center bg-white/80 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg">
          {VOICES.map((voice) => (
            <button
              key={voice.id}
              onClick={() => setActiveVoice(voice.id)}
              className="flex flex-col items-center justify-center transition-transform"
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: voice.color,
                border: activeVoice === voice.id ? "3px solid #1e293b" : "3px solid transparent",
                boxShadow: activeVoice === voice.id
                  ? `0 0 0 3px white, 0 0 0 6px ${voice.color}`
                  : "0 2px 6px rgba(0,0,0,0.15)",
                transform: activeVoice === voice.id ? "scale(1.12)" : "scale(1)",
              }}
              aria-label={voice.label}
              title={voice.label}
            >
              <span style={{ fontSize: 24 }}>{voice.emoji}</span>
            </button>
          ))}

          {/* Clear button */}
          <div className="w-px h-10 bg-slate-200 mx-1" />
          <button
            onClick={handleClear}
            className="flex flex-col items-center justify-center transition-transform active:scale-95"
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: "#f1f5f9",
              border: "3px solid #e2e8f0",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
            }}
            aria-label="Clear the canvas"
            title="Clear"
          >
            <span style={{ fontSize: 26 }}>🧹</span>
          </button>
        </div>
      )}

      {/* ── Voice label hint ───────────────────────────────────────────── */}
      {started && (
        <div className="absolute bottom-[108px] left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="text-slate-600 text-base font-medium bg-white/70 rounded-full px-3 py-1">
            {VOICES.find((v) => v.id === activeVoice)?.label ?? ""} selected
          </span>
        </div>
      )}

      {/* ── Pitch hint (top label) ─────────────────────────────────────── */}
      {started && (
        <div className="absolute top-3 right-4 z-10 pointer-events-none flex flex-col items-end gap-1">
          <span className="text-slate-500 text-sm font-medium">⬆ High notes</span>
          <span className="text-slate-500 text-sm font-medium">⬇ Low notes</span>
        </div>
      )}

      {/* ── Design notes corner link ───────────────────────────────────── */}
      <a
        href="#notes"
        className="absolute top-3 left-3 z-10 text-slate-400 text-sm underline hover:text-slate-600 hidden"
        aria-hidden="true"
      >
        Design notes
      </a>
    </div>
  );
}

// ─── Helper: draw a stroke onto a 2D context ─────────────────────────────────
function drawStroke(ctx2d: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length < 2) return;
  ctx2d.save();
  ctx2d.strokeStyle = stroke.color;
  ctx2d.lineWidth = stroke.lineWidth;
  ctx2d.lineCap = "round";
  ctx2d.lineJoin = "round";
  ctx2d.shadowColor = stroke.color;
  ctx2d.shadowBlur = 4;
  ctx2d.globalAlpha = 0.88;
  ctx2d.beginPath();
  ctx2d.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    const prev = stroke.points[i - 1];
    const curr = stroke.points[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    ctx2d.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx2d.stroke();
  ctx2d.restore();
}
