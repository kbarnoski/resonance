"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic: C3 E3 G3 A3 C4
const FREQS = [130.81, 164.81, 196.0, 220.0, 261.63];
const NAMES = ["C3", "E3", "G3", "A3", "C4"];
const N_COLS = 5;
const MAX_TAPS = 8;
const SILENCE_MS = 1500;
const VOICE_GAP_S = 0.55;

// Voice 0 = original (amber), Voice 1 = +7 semitones / P5 (blue), Voice 2 = +12 semitones / octave (violet)
const V_COLORS = ["#f59e0b", "#60a5fa", "#a78bfa"];
const V_SHIFTS = [0, 7, 12];

interface TapEvt { col: number; x: number; y: number; tMs: number; }
interface CanonNote { freq: number; x: number; y: number; voiceIdx: number; when: number; sparked: boolean; }
interface Dot { x: number; y: number; col: string; alpha: number; r: number; }

function scheduleTone(
  actx: AudioContext,
  dest: AudioNode,
  freq: number,
  gain: number,
  when: number,
) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(gain, when + 0.018);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.85);
  osc.connect(env);
  env.connect(dest);
  osc.start(when);
  osc.stop(when + 0.92);
}

export default function KidsEchoCanon() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const masterRef  = useRef<GainNode | null>(null);
  const [started, setStarted] = useState(false);

  const phaseRef      = useRef<"idle" | "recording" | "playing">("idle");
  const tapsRef       = useRef<TapEvt[]>([]);
  const firstMsRef    = useRef(0);
  const silTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canonNotesRef = useRef<CanonNote[]>([]);
  const dotsRef       = useRef<Dot[]>([]);

  function handleStart() {
    const actx   = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.82;
    master.connect(actx.destination);
    actxRef.current   = actx;
    masterRef.current = master;
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr  = window.devicePixelRatio || 1;
    let rafId  = 0;
    let last   = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const fireCanon = () => {
      const taps   = tapsRef.current;
      const actx   = actxRef.current;
      const master = masterRef.current;
      if (!actx || !master || taps.length === 0) {
        phaseRef.current  = "idle";
        tapsRef.current   = [];
        return;
      }
      phaseRef.current = "playing";

      const baseTime   = actx.currentTime + 0.08;
      const phraseEndMs = taps[taps.length - 1].tMs + 900;
      const newNotes: CanonNote[] = [];

      for (let v = 0; v < 3; v++) {
        const voiceStart = baseTime + v * VOICE_GAP_S;
        for (const tap of taps) {
          const freq = FREQS[tap.col] * Math.pow(2, V_SHIFTS[v] / 12);
          const when = voiceStart + tap.tMs / 1000;
          scheduleTone(actx, master, freq, 0.16, when);
          // Y shifts upward per voice — communicates "higher pitch" spatially
          const yShift = v * 0.27;
          newNotes.push({
            freq, voiceIdx: v, when, sparked: false,
            x: tap.x,
            y: Math.max(0.04, tap.y - yShift),
          });
        }
      }
      canonNotesRef.current = newNotes;

      const totalMs = (2 * VOICE_GAP_S * 1000) + phraseEndMs + 500;
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = setTimeout(() => {
        phaseRef.current      = "idle";
        tapsRef.current       = [];
        canonNotesRef.current = [];
      }, totalMs);
    };

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (phaseRef.current === "playing") return;

      const rect = canvas.getBoundingClientRect();
      const xPx  = e.clientX - rect.left;
      const yPx  = e.clientY - rect.top;
      const W    = canvas.offsetWidth;
      const H    = canvas.offsetHeight;

      if (phaseRef.current === "idle") {
        phaseRef.current  = "recording";
        tapsRef.current   = [];
        firstMsRef.current = Date.now();
      }
      if (tapsRef.current.length >= MAX_TAPS) return;

      const col = Math.min(N_COLS - 1, Math.floor((xPx / W) * N_COLS));
      tapsRef.current.push({ col, x: xPx / W, y: yPx / H, tMs: Date.now() - firstMsRef.current });

      const actx   = actxRef.current;
      const master = masterRef.current;
      if (actx && master) scheduleTone(actx, master, FREQS[col], 0.22, actx.currentTime);

      dotsRef.current.push({ x: xPx / W, y: yPx / H, col: V_COLORS[0], alpha: 1.0, r: 20 });

      if (silTimerRef.current) clearTimeout(silTimerRef.current);
      silTimerRef.current = setTimeout(fireCanon, SILENCE_MS);
    };
    canvas.addEventListener("pointerdown", onPointer, { passive: false });

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(last === 0 ? 16 : ts - last, 80) * 0.001;
      last = ts;

      const W  = canvas.offsetWidth;
      const H  = canvas.offsetHeight;

      ctx.fillStyle = "#040014";
      ctx.fillRect(0, 0, W, H);

      // Subtle column zones
      for (let i = 0; i < N_COLS; i++) {
        if (i % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.014)";
          ctx.fillRect((i / N_COLS) * W, 0, W / N_COLS, H);
        }
      }

      // Faint column dividers
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth   = 1;
      for (let i = 1; i < N_COLS; i++) {
        const x = (i / N_COLS) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.restore();

      // Note name labels at bottom — parent-readable
      ctx.save();
      ctx.font         = "12px monospace";
      ctx.textAlign    = "center";
      ctx.textBaseline = "bottom";
      for (let i = 0; i < N_COLS; i++) {
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fillText(NAMES[i], ((i + 0.5) / N_COLS) * W, H - 8);
      }
      ctx.restore();

      // Spark visual particles for canon notes
      const actx = actxRef.current;
      if (actx) {
        for (const cn of canonNotesRef.current) {
          if (!cn.sparked && actx.currentTime >= cn.when - 0.008) {
            cn.sparked = true;
            dotsRef.current.push({
              x: cn.x, y: cn.y,
              col: V_COLORS[cn.voiceIdx],
              alpha: 1.0, r: 22,
            });
          }
        }
      }

      // Draw and decay dots
      dotsRef.current = dotsRef.current.filter(d => d.alpha > 0.02);
      for (const d of dotsRef.current) {
        const px = d.x * W;
        const py = d.y * H;
        ctx.save();
        ctx.globalAlpha = d.alpha;
        ctx.shadowColor = d.col;
        ctx.shadowBlur  = d.r * 1.8;
        ctx.beginPath();
        ctx.arc(px, py, d.r, 0, 2 * Math.PI);
        ctx.fillStyle = d.col;
        ctx.fill();
        ctx.restore();
        d.alpha -= dt * 0.62;
        d.r = Math.max(4, d.r - dt * 8);
      }

      // Status text
      const phase = phaseRef.current;
      ctx.save();
      ctx.textAlign = "center";
      if (phase === "idle" && tapsRef.current.length === 0) {
        ctx.globalAlpha = 0.48;
        ctx.font        = "16px monospace";
        ctx.fillStyle   = "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText("tap anywhere to play a tune —", W / 2, H / 2 - 14);
        ctx.fillText("then wait for the echo!", W / 2, H / 2 + 14);
      } else if (phase === "recording") {
        const n = tapsRef.current.length;
        ctx.globalAlpha = 0.32;
        ctx.font        = "13px monospace";
        ctx.fillStyle   = V_COLORS[0];
        ctx.textBaseline = "bottom";
        ctx.fillText(`${n} / ${MAX_TAPS} notes recorded`, W / 2, H - 26);
      } else if (phase === "playing") {
        ctx.globalAlpha = 0.40;
        ctx.font        = "13px monospace";
        ctx.fillStyle   = V_COLORS[2];
        ctx.textBaseline = "bottom";
        ctx.fillText("echoing back ↑ ↑ ↑", W / 2, H - 26);
      }
      ctx.restore();
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
      if (silTimerRef.current) clearTimeout(silTimerRef.current);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      actxRef.current?.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#040014] text-white gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">🎵</div>
        <h1 className="text-2xl font-serif text-white/95">Echo Canon</h1>
        <p className="text-base text-white/75 max-w-xs">
          Tap out a little tune — then wait. It echoes back higher and higher!
        </p>
        <div className="flex gap-5 items-center mt-1">
          {V_COLORS.map((col, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                style={{
                  width: 12, height: 12, borderRadius: "50%",
                  backgroundColor: col, boxShadow: `0 0 8px ${col}`,
                }}
              />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontFamily: "monospace" }}>
                {["you", "+5th", "+octave"][i]}
              </span>
            </div>
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-white/95 text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          🎵 Start playing
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
        style={{ cursor: "none" }}
      />
    </div>
  );
}
