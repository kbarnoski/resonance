"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ── Tonnetz constants ────────────────────────────────────────────────────────
// Right (+x) = perfect fifth (×3/2). Up (+y) = major third (×5/4).
// Minor third diagonal: (+1, -1) since (3/2)÷(5/4) = 6/5.
const GRID_COLS = 9;   // x: −4 … +4
const GRID_ROWS = 5;   // y: −2 … +2
const X_MIN = -4;
const Y_MIN = -2;
const BASE_FREQ = 220; // A3 = center node (ratio 1/1)

// ── JI math ──────────────────────────────────────────────────────────────────
function jiRatio(x: number, y: number): number {
  return Math.pow(3 / 2, x) * Math.pow(5 / 4, y);
}

// Octave-normalize a ratio to [1, 2)
function octNorm(r: number): number {
  while (r >= 2) r /= 2;
  while (r < 1) r *= 2;
  return r;
}

// Audible frequency: BASE_FREQ × (normalized ratio)
function nodeFreq(x: number, y: number): number {
  return BASE_FREQ * octNorm(jiRatio(x, y));
}

// 12-TET pitch class name (nearest semitone from A)
const NOTE_NAMES = ["A", "A♯", "B", "C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯"];
function pitchClass(x: number, y: number): string {
  const cents = 1200 * Math.log2(jiRatio(x, y));
  return NOTE_NAMES[((Math.round(cents / 100) % 12) + 12) % 12];
}

// Deviation from 12-TET in cents (−50 … +50)
function centsDev(x: number, y: number): number {
  const raw = 1200 * Math.log2(jiRatio(x, y));
  return Math.round(raw - Math.round(raw / 100) * 100);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// JI ratio as simplified fraction, octave-normalized to [1, 2)
function jiStr(x: number, y: number): string {
  // (3/2)^x × (5/4)^y as num/den before normalization
  let n = Math.round(
    Math.pow(3, Math.max(x, 0)) * Math.pow(2, Math.max(-x, 0)) *
    Math.pow(5, Math.max(y, 0)) * Math.pow(4, Math.max(-y, 0))
  );
  let d = Math.round(
    Math.pow(2, Math.max(x, 0)) * Math.pow(3, Math.max(-x, 0)) *
    Math.pow(4, Math.max(y, 0)) * Math.pow(5, Math.max(-y, 0))
  );
  // Normalize to [1, 2) by multiplying n by 2 as needed
  while (n < d) n *= 2;
  while (n >= 2 * d) d *= 2;
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

// Consonance: 0 = root (most consonant), larger = more complex
function cons(x: number, y: number): number {
  return Math.abs(x) + Math.abs(y);
}

// Node fill color: amber (root) → blue (complex)
function nodeCol(x: number, y: number): string {
  const d = cons(x, y);
  const t = Math.min(d / 6, 1);
  const h = Math.round(45 + t * 175);
  const s = Math.round(90 - t * 10);
  const l = Math.round(65 - t * 18);
  return `hsl(${h},${s}%,${l}%)`;
}

// ── Canvas layout (CSS pixels) ────────────────────────────────────────────────
const PAD_X = 50;
const PAD_Y = 44;

function nodePos(gx: number, gy: number, W: number, H: number): [number, number] {
  const cw = (W - PAD_X * 2) / (GRID_COLS - 1);
  const ch = (H - PAD_Y * 2) / (GRID_ROWS - 1);
  return [
    PAD_X + (gx - X_MIN) * cw,
    H - PAD_Y - (gy - Y_MIN) * ch,
  ];
}

function nodeRad(x: number, y: number, W: number, H: number): number {
  const cw = (W - PAD_X * 2) / (GRID_COLS - 1);
  const ch = (H - PAD_Y * 2) / (GRID_ROWS - 1);
  const maxR = Math.min(cw, ch) * 0.35;
  const d = cons(x, y);
  return Math.max(maxR * 0.52, maxR - d * maxR * 0.075);
}

function hitNode(px: number, py: number, W: number, H: number): [number, number] | null {
  for (let x = X_MIN; x <= -X_MIN; x++) {
    for (let y = Y_MIN; y <= -Y_MIN; y++) {
      const [sx, sy] = nodePos(x, y, W, H);
      if (Math.hypot(px - sx, py - sy) < nodeRad(x, y, W, H) + 6) return [x, y];
    }
  }
  return null;
}

// ── Pitch detection (NSDF autocorrelation) ────────────────────────────────────
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const N = buf.length;
  let sq = 0;
  for (let i = 0; i < N; i++) sq += buf[i] * buf[i];
  if (sq / N < 0.0001) return 0;

  const tauMin = Math.floor(sampleRate / 1100);
  const tauMax = Math.min(Math.ceil(sampleRate / 65), N >> 1);
  const range = tauMax - tauMin + 1;
  const nsdf: number[] = new Array(range);

  for (let k = 0; k < range; k++) {
    const tau = tauMin + k;
    let num = 0, den = 0;
    const L = N - tau;
    for (let i = 0; i < L; i++) {
      num += buf[i] * buf[i + tau];
      den += buf[i] * buf[i] + buf[i + tau] * buf[i + tau];
    }
    nsdf[k] = den > 0 ? 2 * num / den : 0;
  }

  let bestK = 0, bestVal = 0, inPeak = false;
  for (let k = 1; k < range; k++) {
    if (!inPeak && nsdf[k] > 0) inPeak = true;
    if (inPeak && nsdf[k] > bestVal) { bestVal = nsdf[k]; bestK = k; }
    if (inPeak && nsdf[k] < bestVal - 0.15) break;
  }
  if (bestVal < 0.82) return 0;

  // Parabolic interpolation on stored NSDF
  let tauF = tauMin + bestK;
  if (bestK > 0 && bestK < range - 1) {
    const v0 = nsdf[bestK - 1], v1 = nsdf[bestK], v2 = nsdf[bestK + 1];
    const denom = v0 - 2 * v1 + v2;
    if (denom !== 0) tauF += (v0 - v2) / (2 * denom);
  }
  return sampleRate / tauF;
}

// Nearest Tonnetz node (octave-invariant distance)
function nearestNode(freq: number): [number, number] {
  let bestX = 0, bestY = 0, bestDist = Infinity;
  const lf = Math.log2(freq / BASE_FREQ);
  for (let x = X_MIN; x <= -X_MIN; x++) {
    for (let y = Y_MIN; y <= -Y_MIN; y++) {
      const lr = Math.log2(jiRatio(x, y));
      let diff = lf - lr;
      diff = ((diff % 1) + 0.5) % 1 - 0.5; // wrap to [−0.5, 0.5) octave
      if (Math.abs(diff) < bestDist) { bestDist = Math.abs(diff); bestX = x; bestY = y; }
    }
  }
  return [bestX, bestY];
}

// ── Component ─────────────────────────────────────────────────────────────────
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

export default function RatioLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const toneMapRef = useRef(new Map<string, { osc: OscillatorNode; gain: GainNode }>());

  // Mic
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const micIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [started, setStarted] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Render state (refs, no re-render needed)
  const activeRef = useRef(new Set<string>());
  const detectedRef = useRef<[number, number] | null>(null);
  const hoverRef = useRef<[number, number] | null>(null);
  const phaseRef = useRef(0);

  // ── Audio helpers ──────────────────────────────────────────────────────────
  const ensureCtx = useCallback((): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx() as AudioContext;
    audioCtxRef.current = ctx;

    // Soft A3 drone (always on once started)
    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = BASE_FREQ;
    const dg = ctx.createGain();
    dg.gain.value = 0.052;
    drone.connect(dg);
    dg.connect(ctx.destination);
    drone.start();

    setStarted(true);
    return ctx;
  }, []);

  const toggleNode = useCallback((x: number, y: number) => {
    const ctx = ensureCtx();
    const key = `${x},${y}`;
    const map = toneMapRef.current;
    const active = activeRef.current;

    if (active.has(key)) {
      const t = map.get(key);
      if (t) {
        t.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        t.osc.stop(ctx.currentTime + 0.45);
        map.delete(key);
      }
      active.delete(key);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = nodeFreq(x, y);
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start();
      g.gain.setTargetAtTime(0.22, ctx.currentTime, 0.025);
      map.set(key, { osc, gain: g });
      active.add(key);
    }
  }, [ensureCtx]);

  const clearAll = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    toneMapRef.current.forEach(({ osc, gain }) => {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      osc.stop(ctx.currentTime + 0.45);
    });
    toneMapRef.current.clear();
    activeRef.current.clear();
  }, []);

  const startMic = useCallback(async () => {
    const ctx = ensureCtx();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      micAnalyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

      micIntervalRef.current = setInterval(() => {
        const an = micAnalyserRef.current;
        const tb = timeBufRef.current;
        if (!an || !tb) return;
        an.getFloatTimeDomainData(tb as unknown as Float32Array<ArrayBuffer>);
        const freq = detectPitch(tb, ctx.sampleRate);
        detectedRef.current = freq > 0 ? nearestNode(freq) : null;
      }, 80);

      setMicActive(true);
      setMicError(null);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Mic unavailable");
    }
  }, [ensureCtx]);

  const stopMic = useCallback(() => {
    if (micIntervalRef.current) clearInterval(micIntervalRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    detectedRef.current = null;
    setMicActive(false);
  }, []);

  // ── Draw ───────────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const dpr = window.devicePixelRatio || 1;
    // Draw in CSS pixel space (context scaled by DPR)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    g.fillStyle = "#050510";
    g.fillRect(0, 0, W, H);

    // Connection lines
    g.lineWidth = 1;

    // P5 connections (horizontal) — muted green
    for (let y = Y_MIN; y <= -Y_MIN; y++) {
      for (let x = X_MIN; x < -X_MIN; x++) {
        const [x1, y1] = nodePos(x, y, W, H);
        const [x2, y2] = nodePos(x + 1, y, W, H);
        g.beginPath();
        g.strokeStyle = "rgba(80,190,100,0.25)";
        g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
    }
    // M3 connections (vertical) — muted amber
    for (let x = X_MIN; x <= -X_MIN; x++) {
      for (let y = Y_MIN; y < -Y_MIN; y++) {
        const [x1, y1] = nodePos(x, y, W, H);
        const [x2, y2] = nodePos(x, y + 1, W, H);
        g.beginPath();
        g.strokeStyle = "rgba(190,145,45,0.22)";
        g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
    }
    // m3 diagonal (+1, −1) — muted blue
    for (let x = X_MIN; x < -X_MIN; x++) {
      for (let y = Y_MIN + 1; y <= -Y_MIN; y++) {
        const [x1, y1] = nodePos(x, y, W, H);
        const [x2, y2] = nodePos(x + 1, y - 1, W, H);
        g.beginPath();
        g.strokeStyle = "rgba(60,120,220,0.2)";
        g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
    }

    phaseRef.current += 0.055;
    const pulse = Math.sin(phaseRef.current) * 0.5 + 0.5;
    const det = detectedRef.current;
    const hov = hoverRef.current;

    // Nodes
    for (let x = X_MIN; x <= -X_MIN; x++) {
      for (let y = Y_MIN; y <= -Y_MIN; y++) {
        const [sx, sy] = nodePos(x, y, W, H);
        const r = nodeRad(x, y, W, H);
        const key = `${x},${y}`;
        const isActive = activeRef.current.has(key);
        const isDet = det !== null && det[0] === x && det[1] === y;
        const isHov = hov !== null && hov[0] === x && hov[1] === y;
        const col = nodeCol(x, y);

        // Active glow halo
        if (isActive) {
          const grad = g.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 2.6);
          grad.addColorStop(0, col.replace("hsl(", "hsla(").replace(")", ",0.4)"));
          grad.addColorStop(1, "transparent");
          g.beginPath();
          g.arc(sx, sy, r * 2.6, 0, Math.PI * 2);
          g.fillStyle = grad;
          g.fill();
        }

        // Mic detection pulsing ring
        if (isDet) {
          g.beginPath();
          g.arc(sx, sy, r + 7 + pulse * 7, 0, Math.PI * 2);
          g.strokeStyle = `rgba(85,165,255,${0.5 + pulse * 0.5})`;
          g.lineWidth = 2;
          g.stroke();
          g.lineWidth = 1;
        }

        // Node body
        g.beginPath();
        g.arc(sx, sy, r, 0, Math.PI * 2);
        g.fillStyle = isActive
          ? "#ffffff"
          : col.replace("hsl(", "hsla(").replace(")", isHov ? ",0.92)" : ",0.74)");
        g.fill();

        g.strokeStyle = isActive
          ? "#fff"
          : (x === 0 && y === 0) ? "rgba(255,200,50,0.9)"
          : "rgba(255,255,255,0.14)";
        g.lineWidth = isActive ? 2 : 1;
        g.stroke();
        g.lineWidth = 1;

        // Pitch class label
        const fs = Math.max(8, r * 0.72);
        g.fillStyle = isActive ? "#040410" : "#fff";
        g.font = `bold ${fs.toFixed(0)}px monospace`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(pitchClass(x, y), sx, sy);

        // Cents deviation
        if (r > 16) {
          const dev = centsDev(x, y);
          if (dev !== 0) {
            g.fillStyle = isActive ? "rgba(4,4,16,0.55)" : "rgba(255,255,255,0.38)";
            g.font = `${Math.max(6, r * 0.36).toFixed(0)}px monospace`;
            g.fillText(`${dev > 0 ? "+" : ""}${dev}¢`, sx, sy + r * 0.55);
          }
        }

        // Hover tooltip
        if (isHov) {
          const tipW = 142, tipH = 46;
          const tipX = Math.min(sx + r + 8, W - tipW - 4);
          const tipY = Math.max(sy - tipH / 2, 4);
          g.fillStyle = "rgba(6,6,18,0.95)";
          g.fillRect(tipX, tipY, tipW, tipH);
          g.strokeStyle = "rgba(255,255,255,0.07)";
          g.strokeRect(tipX, tipY, tipW, tipH);

          g.fillStyle = "#ddd";
          g.font = "11px monospace";
          g.textAlign = "left";
          g.textBaseline = "top";
          const dev2 = centsDev(x, y);
          g.fillText(`${pitchClass(x, y)}  ${jiStr(x, y)}`, tipX + 6, tipY + 6);
          g.fillStyle = "#777";
          g.font = "10px monospace";
          g.fillText(
            `${nodeFreq(x, y).toFixed(1)} Hz  ${dev2 > 0 ? "+" : ""}${dev2}¢`,
            tipX + 6, tipY + 24
          );
        }
      }
    }

    // Axis labels
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "10px monospace";
    g.fillStyle = "rgba(80,190,100,0.5)";
    g.fillText("← P5 (perfect fifths) →", W / 2, H - 10);

    g.save();
    g.translate(11, H / 2);
    g.rotate(-Math.PI / 2);
    g.fillStyle = "rgba(190,145,45,0.5)";
    g.fillText("M3 (major thirds) ↑", 0, 0);
    g.restore();

    // Legend (top-right corner)
    const lx = W - 138, ly = 14;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.font = "10px monospace";
    g.fillStyle = "rgba(80,190,100,0.65)";
    g.fillText("─ P5 right", lx, ly);
    g.fillStyle = "rgba(190,145,45,0.65)";
    g.fillText("─ M3 up", lx, ly + 14);
    g.fillStyle = "rgba(60,120,220,0.65)";
    g.fillText("╱ m3 diagonal", lx, ly + 28);
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = () => { drawFrame(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (micIntervalRef.current) clearInterval(micIntervalRef.current);
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      void audioCtxRef.current?.close();
    };
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hit = hitNode(px, py, canvas.clientWidth, canvas.clientHeight);
    if (hit) toggleNode(hit[0], hit[1]);
  }, [toggleNode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    hoverRef.current = hitNode(
      e.clientX - rect.left, e.clientY - rect.top,
      canvas.clientWidth, canvas.clientHeight
    );
  }, []);

  const handlePointerLeave = useCallback(() => { hoverRef.current = null; }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#050510", color: "#ccc", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #0d0d1c" }}>
        <Link href="/dream" style={{ color: "#555", textDecoration: "none", fontSize: 12 }}>← dream</Link>
        <span style={{ color: "#333", fontSize: 12 }}>|</span>
        <span style={{ fontSize: 13, color: "#bbb" }}>37 — Ratio Lab</span>
        <span style={{ fontSize: 11, color: "#555", flex: 1 }}>
          Tonnetz just-intonation lattice · navigate harmony as a landscape
        </span>
        <Link href="/dream/37-ratio-lab/README.md" style={{ color: "#444", textDecoration: "none", fontSize: 11 }}>
          design notes ↗
        </Link>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", cursor: "crosshair", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />

      {/* Controls */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #0d0d1c", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!started && (
          <span style={{ fontSize: 11, color: "#777" }}>
            Click any node to hear it against the A3 drone · hover for ratio
          </span>
        )}
        {started && !micActive && (
          <button style={BTN} onClick={startMic}>🎤 Mic</button>
        )}
        {micActive && (
          <button style={{ ...BTN, color: "#6af" }} onClick={stopMic}>🎤 stop</button>
        )}
        {micError && <span style={{ fontSize: 10, color: "#f86" }}>{micError}</span>}
        {micActive && (
          <span style={{ fontSize: 10, color: "#6af" }}>
            Listening · blue ring = closest node to your pitch
          </span>
        )}
        {started && (
          <button style={{ ...BTN, marginLeft: "auto" }} onClick={clearAll}>clear all</button>
        )}
        {!started && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#444" }}>
            warm = consonant · cool = dissonant · size = ratio simplicity
          </span>
        )}
      </div>
    </div>
  );
}
