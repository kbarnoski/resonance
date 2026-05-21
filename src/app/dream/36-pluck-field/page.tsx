"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// 24 C pentatonic notes — 4 rows × 6 columns, C2 → G6
const STRINGS = [
  { note: "C2", freq: 65.41 },
  { note: "D2", freq: 73.42 },
  { note: "E2", freq: 82.41 },
  { note: "G2", freq: 98.0 },
  { note: "A2", freq: 110.0 },
  { note: "C3", freq: 130.81 },
  { note: "D3", freq: 146.83 },
  { note: "E3", freq: 164.81 },
  { note: "G3", freq: 196.0 },
  { note: "A3", freq: 220.0 },
  { note: "C4", freq: 261.63 },
  { note: "D4", freq: 293.66 },
  { note: "E4", freq: 329.63 },
  { note: "G4", freq: 392.0 },
  { note: "A4", freq: 440.0 },
  { note: "C5", freq: 523.25 },
  { note: "D5", freq: 587.33 },
  { note: "E5", freq: 659.26 },
  { note: "G5", freq: 783.99 },
  { note: "A5", freq: 880.0 },
  { note: "C6", freq: 1046.5 },
  { note: "D6", freq: 1174.66 },
  { note: "E6", freq: 1318.51 },
  { note: "G6", freq: 1567.98 },
] as const;

const ROWS = 4;
const COLS = 6;
const N = STRINGS.length; // 24

// KS feedback gain that gives ~tau seconds of -60 dB decay
function ksFeedbackGain(freq: number, tau: number): number {
  return Math.exp(-6.908 / (tau * freq));
}

// Per-string color: violet (C2) → orange (G6)
function stringHue(idx: number): number {
  return 280 - 250 * (idx / (N - 1));
}

// Per-string visual decay: low strings glow longer
function visualTau(idx: number): number {
  return 3.0 - 1.5 * (idx / (N - 1));
}

// Per-string audio decay target (seconds)
function audioTau(idx: number): number {
  return 3.0 - 1.5 * (idx / (N - 1));
}

interface KsNodes {
  delay: DelayNode;
  filter: BiquadFilterNode;
  feedback: GainNode;
}

const BTN: React.CSSProperties = {
  padding: "5px 12px",
  background: "#111",
  border: "1px solid #2a2a2a",
  color: "#aaa",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: 11,
  borderRadius: 2,
};

export default function PluckField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const ksNodesRef = useRef<KsNodes[] | null>(null);
  // pluck timestamp per string (ms); starts far in the past so strings appear resting
  const pluckTimesRef = useRef<number[]>(new Array(N).fill(-1e9));

  const prevOnsetRef = useRef(false);
  const lastTouchCellRef = useRef(-1);

  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const { running, error: micErr, start: startMicHook, stop: stopMicHook, getFrame } =
    useMicAnalyser({ smoothing: 0.8, gain: 2.0, onsetThreshold: 1.6 });

  // Sync mic error into local state
  useEffect(() => {
    if (micErr) setMicError(micErr);
  }, [micErr]);

  // Create AudioContext + Karplus-Strong node graph (must be called from user gesture)
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx() as AudioContext;
    audioCtxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    ksNodesRef.current = Array.from(STRINGS).map(({ freq }, idx) => {
      const delayTime = 1 / freq;
      const delay = ctx.createDelay(delayTime + 0.05);
      delay.delayTime.value = delayTime;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 4000; // absorbs high harmonics → plucked-string timbre

      const fb = ctx.createGain();
      fb.gain.value = ksFeedbackGain(freq, audioTau(idx));

      // KS feedback cycle: delay → filter → fb → delay
      // Valid because DelayNode is in the cycle (Web Audio allows this)
      delay.connect(filter);
      filter.connect(fb);
      fb.connect(delay);
      filter.connect(master); // output tap

      return { delay, filter, feedback: fb };
    });
  }, []);

  // Inject a white-noise burst into string idx to pluck it
  const pluckAt = useCallback((idx: number) => {
    const ctx = audioCtxRef.current;
    const nodes = ksNodesRef.current;
    if (!ctx || !nodes || idx < 0 || idx >= N) return;

    const { freq } = STRINGS[idx];
    const len = Math.max(2, Math.round(ctx.sampleRate / freq));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(nodes[idx].delay);
    src.start();

    pluckTimesRef.current[idx] = performance.now();
  }, []);

  const cellFromEvent = useCallback(
    (clientX: number, clientY: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return -1;
      const r = canvas.getBoundingClientRect();
      const col = Math.floor(((clientX - r.left) / r.width) * COLS);
      const row = Math.floor(((clientY - r.top) / r.height) * ROWS);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return -1;
      return row * COLS + col;
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      initAudio();
      const idx = cellFromEvent(e.clientX, e.clientY);
      if (idx >= 0) pluckAt(idx);
    },
    [initAudio, cellFromEvent, pluckAt]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      initAudio();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const idx = cellFromEvent(t.clientX, t.clientY);
        if (idx >= 0) {
          pluckAt(idx);
          lastTouchCellRef.current = idx;
        }
      }
    },
    [initAudio, cellFromEvent, pluckAt]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const idx = cellFromEvent(t.clientX, t.clientY);
        if (idx >= 0 && idx !== lastTouchCellRef.current) {
          pluckAt(idx);
          lastTouchCellRef.current = idx;
        }
      }
    },
    [cellFromEvent, pluckAt]
  );

  const handleStartMic = useCallback(async () => {
    initAudio();
    prevOnsetRef.current = false;
    await startMicHook();
    setMicActive(true);
    setMicError(null);
  }, [initAudio, startMicHook]);

  const handleStopMic = useCallback(() => {
    stopMicHook();
    setMicActive(false);
    prevOnsetRef.current = false;
  }, [stopMicHook]);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      g.fillStyle = "#080808";
      g.fillRect(0, 0, W, H);

      const now = performance.now();
      const cellW = W / COLS;
      const cellH = H / ROWS;

      // Mic onset → pluck a string in the frequency range matching the centroid
      if (running) {
        const frame = getFrame();
        const onset = frame?.onset ?? false;
        if (onset && !prevOnsetRef.current) {
          const centroid = frame?.centroid ?? 300;
          let lo = 0;
          let hi = N - 1;
          if (centroid < 300) { lo = 0; hi = 11; }
          else if (centroid < 900) { lo = 6; hi = 17; }
          else { lo = 12; hi = N - 1; }
          pluckAt(lo + Math.floor(Math.random() * (hi - lo + 1)));
        }
        prevOnsetRef.current = onset;
      }

      for (let i = 0; i < N; i++) {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        const cx = col * cellW;
        const cy = row * cellH;
        const midY = cy + cellH / 2;

        const hue = stringHue(i);
        const tau = visualTau(i);
        const elapsed = (now - pluckTimesRef.current[i]) / 1000;
        const ampl = elapsed < 0 ? 0 : Math.exp(-elapsed / tau);

        // Active cell background glow
        if (ampl > 0.01) {
          g.fillStyle = `hsla(${hue}, 70%, 8%, ${ampl * 0.45})`;
          g.fillRect(cx, cy, cellW, cellH);
        }

        // Cell border
        g.strokeStyle = `hsla(${hue}, 30%, 18%, 0.5)`;
        g.lineWidth = 0.5;
        g.strokeRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);

        // Note label
        const labelSize = Math.floor(Math.min(cellW, cellH) * 0.19);
        g.fillStyle = `hsla(${hue}, 70%, 55%, ${0.12 + 0.6 * ampl})`;
        g.font = `${labelSize}px monospace`;
        g.textAlign = "right";
        g.fillText(STRINGS[i].note, cx + cellW - 6, cy + cellH - 6);

        // String animation
        const margin = Math.max(8, cellW * 0.07);
        const strLen = cellW - margin * 2;
        // Standing wave mode: 1 half-wave for bottom row, up to 4 for top
        const halfWaves = 1 + Math.floor(i / 6);
        // Visual oscillation speed: higher strings vibrate visually faster
        const visualOmega = (3 + (i / N) * 6) * 2 * Math.PI;
        const phase = (now / 1000) * visualOmega;
        const maxSwing = cellH * 0.3;

        if (ampl < 0.01) {
          // Resting: thin dim line
          g.beginPath();
          g.strokeStyle = `hsla(${hue}, 35%, 18%, 0.65)`;
          g.lineWidth = 0.7;
          g.moveTo(cx + margin, midY);
          g.lineTo(cx + margin + strLen, midY);
          g.stroke();
        } else {
          // Vibrating: standing wave with additive glow
          g.save();
          g.shadowColor = `hsl(${hue}, 100%, 72%)`;
          g.shadowBlur = 10 * ampl;
          g.strokeStyle = `hsla(${hue}, 90%, ${32 + 38 * ampl}%, ${0.55 + 0.45 * ampl})`;
          g.lineWidth = 0.8 + 2.2 * ampl;
          const steps = Math.max(48, Math.floor(strLen / 1.5));
          g.beginPath();
          g.moveTo(cx + margin, midY);
          for (let j = 1; j <= steps; j++) {
            const x01 = j / steps;
            const px = cx + margin + x01 * strLen;
            // Standing wave: zero at both endpoints, peak(s) between
            const standingEnv = Math.sin(x01 * Math.PI * halfWaves);
            const swing = ampl * maxSwing * standingEnv * Math.sin(phase);
            g.lineTo(px, midY + swing);
          }
          g.stroke();
          g.restore();
        }
      }
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [running, getFrame, pluckAt]);

  // Close AudioContext on unmount
  useEffect(() => () => { void audioCtxRef.current?.close(); }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#080808",
        color: "#e0e0e0",
        fontFamily: "monospace",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #161616",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "0.02em" }}>
            pluck field
          </span>
          <span style={{ fontSize: 11, color: "#555", marginLeft: 10 }}>
            karplus-strong virtual strings — click any cell
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {!micActive ? (
            <button onClick={handleStartMic} style={BTN}>
              🎤 mic
            </button>
          ) : (
            <button
              onClick={handleStopMic}
              style={{ ...BTN, borderColor: "#446", color: "#88f" }}
            >
              ■ stop mic
            </button>
          )}
          <Link href="/dream" style={{ fontSize: 11, color: "#444", textDecoration: "none" }}>
            ← dream
          </Link>
        </div>
      </div>

      {/* Mic status bar */}
      {(micActive || micError) && (
        <div
          style={{
            padding: "3px 14px",
            fontSize: 11,
            background: micError ? "#1a0000" : "#00080f",
            color: micError ? "#f55" : "#48f",
            borderBottom: "1px solid #111",
          }}
        >
          {micError
            ? `mic error: ${micError}`
            : running
              ? "🎙 mic live — onsets pluck strings (centroid-weighted octave)"
              : "starting mic..."}
        </div>
      )}

      {/* String canvas */}
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={{
          flex: 1,
          width: "100%",
          cursor: "crosshair",
          touchAction: "none",
          display: "block",
        }}
      />

      {/* Footer */}
      <div
        style={{
          padding: "5px 14px",
          fontSize: 10,
          color: "#222",
          borderTop: "1px solid #111",
          display: "flex",
          gap: "16px",
        }}
      >
        <span>24 strings · c pentatonic · c2–g6</span>
        <span>karplus-strong physical synthesis</span>
        <span>click / drag = pluck · mic onset = random pluck</span>
      </div>
    </div>
  );
}
