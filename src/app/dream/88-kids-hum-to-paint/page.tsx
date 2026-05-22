"use client";

// **For**: kids (4+)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── pitch detection (autocorrelation) ─────────────────────────────────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;

  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;

  let maxVal = 0;
  let maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) { maxVal = acn[i]; maxBin = i; }
  }
  if (maxVal < 0.82) return 0;

  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;

  const freq = sampleRate / refined;
  if (freq < 60 || freq > 1200) return 0;
  return freq;
}

// ── color / position helpers ──────────────────────────────────────────────────

const FREQ_LOW = 80;
const FREQ_HIGH = 700;

function pitchT(freq: number): number {
  return Math.max(0, Math.min(1,
    (Math.log2(freq) - Math.log2(FREQ_LOW)) /
    (Math.log2(FREQ_HIGH) - Math.log2(FREQ_LOW))
  ));
}

function pitchToFillColor(freq: number): string {
  const hue = Math.round(pitchT(freq) * 270);
  return `hsl(${hue},88%,63%)`;
}

function pitchToGlowColor(freq: number): string {
  const hue = Math.round(pitchT(freq) * 270);
  return `hsl(${hue},100%,72%)`;
}

function pitchToY(freq: number, h: number): number {
  const margin = h * 0.11;
  return (1 - pitchT(freq)) * (h - 2 * margin) + margin;
}

// ── audio helpers ─────────────────────────────────────────────────────────────

const PAD_FREQS = [130.81, 164.81, 196.0] as const;

function bootPad(actx: AudioContext): () => void {
  const master = actx.createGain();
  master.gain.value = 0;
  master.connect(actx.destination);
  master.gain.linearRampToValueAtTime(0.032, actx.currentTime + 1.8);

  const oscs: OscillatorNode[] = [];
  PAD_FREQS.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    const lfo = actx.createOscillator();
    const lg = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    lfo.frequency.value = 0.08 + i * 0.025;
    lg.gain.value = 0.07;
    lfo.connect(lg);
    lg.connect(g.gain);
    osc.connect(g);
    g.connect(master);
    osc.start();
    lfo.start();
    oscs.push(osc);
  });

  return () => {
    const t = actx.currentTime;
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 1.5);
    setTimeout(() => oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } }), 2000);
  };
}

function scheduleTone(actx: AudioContext, freq: number, when: number) {
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(0.42, when + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.55);
  gain.connect(actx.destination);

  const o1 = actx.createOscillator();
  o1.type = "triangle";
  o1.frequency.value = freq;
  o1.connect(gain);
  o1.start(when);
  o1.stop(when + 0.65);

  const g2 = actx.createGain();
  g2.gain.value = 0.18;
  const o2 = actx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = freq * 2;
  o2.connect(g2);
  g2.connect(gain);
  o2.start(when);
  o2.stop(when + 0.65);
}

// ── melody note ───────────────────────────────────────────────────────────────

interface MelodyNote {
  freq: number;
  x: number;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KidsHumToPaint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number>(0);
  const stopPadRef = useRef<(() => void) | null>(null);

  // Drawing state (mutated in RAF loop — never triggers re-renders)
  const xPenRef = useRef(0);
  const ySmoothedRef = useRef<number | null>(null);
  const sampleTickRef = useRef(0);
  const melodyRef = useRef<MelodyNote[]>([]);
  const maxXRef = useRef(0);
  const startMsRef = useRef(0);
  const timeLeftRef = useRef(30);

  const [phase, setPhase] = useState<"idle" | "drawing" | "done" | "replaying">("idle");
  const [timeLeft, setTimeLeft] = useState(30);
  const [noteCount, setNoteCount] = useState(0);
  const [replayPct, setReplayPct] = useState(0);
  const [micError, setMicError] = useState(false);

  // ── start ────────────────────────────────────────────────────────────────
  async function beginPainting() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#07070e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Request mic
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError(true);
      return;
    }

    const actx = new AudioContext();
    actxRef.current = actx;
    const src = actx.createMediaStreamSource(stream);
    const analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    src.connect(analyser);
    analyserRef.current = analyser;
    bufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    stopPadRef.current = bootPad(actx);

    // Reset state
    xPenRef.current = canvas.width * 0.04;
    maxXRef.current = canvas.width * 0.04;
    ySmoothedRef.current = null;
    melodyRef.current = [];
    sampleTickRef.current = 0;
    timeLeftRef.current = 30;
    startMsRef.current = Date.now();

    setMicError(false);
    setPhase("drawing");
    setTimeLeft(30);
    setNoteCount(0);
    setReplayPct(0);
  }

  // ── RAF drawing loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "drawing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const H = canvas.height;
    const W = canvas.width;

    const loop = () => {
      const analyser = analyserRef.current;
      const buf = bufRef.current;
      const actx = actxRef.current;

      // Countdown
      const elapsed = (Date.now() - startMsRef.current) / 1000;
      const left = Math.max(0, Math.round(30 - elapsed));
      if (left !== timeLeftRef.current) {
        timeLeftRef.current = left;
        setTimeLeft(left);
      }
      if (elapsed >= 30) {
        stopPadRef.current?.();
        setPhase("done");
        return;
      }

      if (analyser && buf && actx) {
        analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);

        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);

        const freq = detectPitch(buf, actx.sampleRate);

        if (freq > 0) {
          const targetY = pitchToY(freq, H);
          if (ySmoothedRef.current === null) {
            ySmoothedRef.current = targetY;
          } else {
            ySmoothedRef.current += (targetY - ySmoothedRef.current) * 0.2;
          }
          const y = ySmoothedRef.current;
          const vol = Math.max(0.18, Math.min(1, rms * 13));
          const r = 20 + vol * 52;
          const alpha = 0.48 + vol * 0.42;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.shadowColor = pitchToGlowColor(freq);
          ctx.shadowBlur = r * 2.0;
          ctx.fillStyle = pitchToFillColor(freq);
          ctx.beginPath();
          ctx.arc(xPenRef.current, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Sample melody at ~2 Hz
          sampleTickRef.current++;
          if (sampleTickRef.current >= 28) {
            sampleTickRef.current = 0;
            melodyRef.current.push({ freq, x: xPenRef.current });
            setNoteCount(n => n + 1);
          }
        } else {
          ySmoothedRef.current = null;
        }
      }

      xPenRef.current = Math.min(xPenRef.current + 1, W * 0.96);
      maxXRef.current = xPenRef.current;

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // ── replay ────────────────────────────────────────────────────────────────
  function replayMelody() {
    const actx = actxRef.current;
    const notes = melodyRef.current;
    if (!actx || notes.length === 0) return;

    const minX = notes[0].x;
    const span = Math.max(maxXRef.current - minX, 1);
    const totalDur = Math.max(3, notes.length * 0.38);

    setPhase("replaying");
    setReplayPct(0);

    notes.forEach(note => {
      const t = ((note.x - minX) / span) * totalDur;
      scheduleTone(actx, note.freq, actx.currentTime + 0.4 + t);
    });

    const startMs = Date.now();
    const scanId = setInterval(() => {
      const pct = Math.min(1, (Date.now() - startMs) / 1000 / totalDur);
      setReplayPct(pct);
      if (pct >= 1) {
        clearInterval(scanId);
        setPhase("done");
      }
    }, 32);
  }

  // ── paint again ───────────────────────────────────────────────────────────
  function paintAgain() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#07070e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    melodyRef.current = [];
    xPenRef.current = 0;
    setNoteCount(0);
    void beginPainting();
  }

  return (
    <div className="fixed inset-0 bg-[#07070e] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-white text-3xl font-mono tracking-wide mb-2">
              hum to paint
            </h1>
            <p className="text-white/75 text-base font-mono">
              hum into the mic — your voice paints colors
            </p>
          </div>

          <button
            onClick={() => { void beginPainting(); }}
            className="flex items-center justify-center bg-violet-500 hover:bg-violet-400 text-white text-2xl font-bold rounded-full transition-colors"
            style={{ width: 160, height: 160 }}
          >
            Start
          </button>

          {micError && (
            <p className="text-rose-300 text-base font-mono text-center">
              microphone not available — check permissions and try again
            </p>
          )}

          <p className="text-white/55 text-sm font-mono text-center max-w-xs">
            high hum = top of screen · low hum = bottom
          </p>
        </div>
      )}

      {/* ── DRAWING ── */}
      {phase === "drawing" && (
        <>
          {/* Countdown + mic indicator */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-none">
            <div className="w-3 h-3 rounded-full bg-rose-400 animate-pulse" />
            <span className="text-white/80 text-xl font-mono">{timeLeft}s</span>
          </div>

          {/* Early replay once 5+ notes recorded */}
          {noteCount >= 5 && (
            <button
              onClick={replayMelody}
              className="absolute bottom-7 left-1/2 -translate-x-1/2 bg-violet-500/85 hover:bg-violet-400/90 text-white text-xl font-bold rounded-full px-9 transition-colors"
              style={{ minHeight: 72, minWidth: 200 }}
            >
              Replay ♫
            </button>
          )}
        </>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4">
          {noteCount >= 3 ? (
            <button
              onClick={replayMelody}
              className="bg-violet-500 hover:bg-violet-400 text-white text-2xl font-bold rounded-full transition-colors"
              style={{ minHeight: 90, minWidth: 220, padding: "0 2rem" }}
            >
              ▶ Replay ♫
            </button>
          ) : (
            <p className="text-white/75 text-lg font-mono">hum more to build a melody!</p>
          )}

          <button
            onClick={paintAgain}
            className="text-white/70 hover:text-white/95 text-base font-mono underline transition-colors"
          >
            paint again
          </button>
        </div>
      )}

      {/* ── REPLAYING ── */}
      {phase === "replaying" && (
        <>
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${replayPct * 96}%`,
              width: 4,
              background: "rgba(255,255,255,0.7)",
              boxShadow: "0 0 18px 6px rgba(255,255,255,0.35)",
            }}
          />
          <p className="absolute top-5 left-1/2 -translate-x-1/2 text-white/80 text-xl font-mono pointer-events-none">
            ♫ playing your melody…
          </p>
        </>
      )}

      {/* ── Back link ── */}
      <Link
        href="/dream"
        className="absolute top-3 left-3 text-white/55 hover:text-white/90 text-sm font-mono transition-colors"
      >
        ← dream lab
      </Link>
    </div>
  );
}
