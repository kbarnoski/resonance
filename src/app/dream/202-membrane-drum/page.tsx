"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

const N = 64;
const CX = N >> 1;
const CY = N >> 1;
const R = N / 2 - 2;

// Circular boundary mask (precomputed at module level — pure math, no browser APIs)
const MASK = new Uint8Array(N * N);
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++)
    MASK[r * N + c] = (r - CX) * (r - CX) + (c - CY) * (c - CY) < R * R ? 1 : 0;

// Bessel zero ratios for circular membrane modes (j_mn / j_01)
// m=0: 1.000, 2.295, 3.598 | m=1: 1.593, 2.917 | m=2: 2.136
const BESSEL_RATIOS = [1.000, 1.593, 2.136, 2.295, 2.917, 3.598];
const BESSEL_GAINS  = [1.000, 0.420, 0.240, 0.160, 0.090, 0.060];

function colorPx(v: number, px: Uint8ClampedArray, i: number): void {
  // v in [-1, 1]; 0 → dark slate, +1 → amber, -1 → blue
  let r: number, g: number, b: number;
  if (v >= 0) {
    const t = Math.min(v, 1);
    r = (12 + t * 243) | 0;
    g = (14 + t * 146) | 0;
    b = 20;
  } else {
    const t = Math.min(-v, 1);
    r = 12;
    g = (14 + t * 46) | 0;
    b = (20 + t * 200) | 0;
  }
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
}

export default function MembraneDrum() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const traceCanvas = useRef<HTMLCanvasElement>(null);

  // 3 rotating FD buffers
  const pCurr = useRef(new Float32Array(N * N));
  const pPrev = useRef(new Float32Array(N * N));
  const pNext = useRef(new Float32Array(N * N));

  // Mutable params (written by sliders, read by loop — no loop restart needed)
  const tensionRef = useRef(0.35);
  const dampingRef = useRef(0.996);

  // Waveform trace ring buffer
  const traceBuf  = useRef(new Float32Array(180));
  const traceHead = useRef(0);
  const traceFull = useRef(false);

  // Audio
  const actxRef   = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  const [started,     setStarted]     = useState(false);
  const [tension,     setTension]     = useState(0.35);
  const [damping,     setDamping]     = useState(0.996);
  const [strikeCount, setStrikeCount] = useState(0);

  useEffect(() => { tensionRef.current = tension; }, [tension]);
  useEffect(() => { dampingRef.current = damping; }, [damping]);

  const ensureAudio = useCallback(() => {
    if (actxRef.current) return;
    const actx   = new AudioContext();
    const master  = actx.createGain();
    master.gain.value = 0.65;
    master.connect(actx.destination);
    actxRef.current  = actx;
    masterRef.current = master;
  }, []);

  const strike = useCallback((hr: number, hc: number, amp = 0.85) => {
    ensureAudio();

    // Gaussian excitation on current buffer
    const u      = pCurr.current;
    const sigma2 = 16;
    const span   = 14;
    for (let r = Math.max(0, hr - span); r < Math.min(N, hr + span); r++) {
      for (let c = Math.max(0, hc - span); c < Math.min(N, hc + span); c++) {
        if (!MASK[r * N + c]) continue;
        const d2 = (r - hr) * (r - hr) + (c - hc) * (c - hc);
        u[r * N + c] += amp * Math.exp(-d2 / (2 * sigma2));
      }
    }

    // Modal synthesis: 6 oscillators at Bessel ratios
    const actx   = actxRef.current;
    const master = masterRef.current;
    if (!actx || !master) return;

    const fund      = 55 + tensionRef.current * 200;          // 55–143 Hz
    const decay     = 0.35 + (dampingRef.current - 0.988) * 58; // 0.35–1.3 s
    const distNorm  = Math.sqrt((hr - CX) ** 2 + (hc - CY) ** 2) / R;
    const now       = actx.currentTime;

    for (let i = 0; i < BESSEL_RATIOS.length; i++) {
      // Symmetric modes (0,2,4=m=0) loudest at centre; m=1 modes louder off-centre
      const symBias = i % 2 === 0
        ? 1 - distNorm * 0.45
        : 0.2 + distNorm * 0.8;
      const peak = BESSEL_GAINS[i] * symBias * 0.11;
      if (peak < 0.0005) continue;

      const osc = actx.createOscillator();
      const g   = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = fund * BESSEL_RATIOS[i];
      g.gain.setValueAtTime(peak, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.08);
    }

    setStrikeCount(s => s + 1);
  }, [ensureAudio]);

  // Unified animation loop — reads params via refs, never restarts
  useEffect(() => {
    const cv = canvasRef.current;
    const tv = traceCanvas.current;
    if (!cv || !tv) return;
    const ctx  = cv.getContext("2d");
    const tctx = tv.getContext("2d");
    if (!ctx || !tctx) return;

    const CW = cv.width, CH = cv.height;
    const TW = tv.width, TH = tv.height;

    // Off-screen for ImageData → scaled blit
    const off    = document.createElement("canvas");
    off.width    = N;
    off.height   = N;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    const img = offCtx.createImageData(N, N);
    const px  = img.data;

    let id: number;

    const loop = () => {
      // ── FD wave step ──────────────────────────────────────────────
      const u  = pCurr.current;
      const p  = pPrev.current;
      const nx = pNext.current;
      const c2 = tensionRef.current;
      const dm = dampingRef.current;

      for (let r = 1; r < N - 1; r++) {
        for (let k = 1; k < N - 1; k++) {
          const idx = r * N + k;
          if (!MASK[idx]) { nx[idx] = 0; continue; }
          nx[idx] = (
            c2 * (u[idx + N] + u[idx - N] + u[idx + 1] + u[idx - 1] - 4 * u[idx])
            + 2 * u[idx] - p[idx]
          ) * dm;
        }
      }

      // Rotate buffers
      const tmp     = pPrev.current;
      pPrev.current = pCurr.current;
      pCurr.current = pNext.current;
      pNext.current = tmp;

      // Record centre-point in ring buffer
      const cv2 = pCurr.current[CY * N + CX];
      traceBuf.current[traceHead.current] = cv2;
      traceHead.current = (traceHead.current + 1) % 180;
      if (!traceFull.current && traceHead.current === 0) traceFull.current = true;

      // ── Render membrane ───────────────────────────────────────────
      const u2 = pCurr.current;
      for (let r = 0; r < N; r++) {
        for (let k = 0; k < N; k++) {
          const idx = r * N + k;
          const pi  = idx << 2;
          if (!MASK[idx]) {
            px[pi] = px[pi + 1] = px[pi + 2] = px[pi + 3] = 0;
            continue;
          }
          colorPx(Math.max(-1, Math.min(1, u2[idx] * 5)), px, pi);
        }
      }
      offCtx.putImageData(img, 0, 0);

      ctx.clearRect(0, 0, CW, CH);
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = "medium";
      ctx.drawImage(off, 0, 0, CW, CH);

      // Violet rim glow
      const rg = ctx.createRadialGradient(CW / 2, CH / 2, CW * 0.42, CW / 2, CH / 2, CW * 0.51);
      rg.addColorStop(0, "rgba(139,92,246,0)");
      rg.addColorStop(0.55, "rgba(139,92,246,0.10)");
      rg.addColorStop(1, "rgba(109,40,217,0.38)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, CW, CH);

      // ── Render waveform trace ─────────────────────────────────────
      tctx.fillStyle = "#0a0c14";
      tctx.fillRect(0, 0, TW, TH);

      const filled  = traceFull.current;
      const head    = traceHead.current;
      const len     = 180;
      const drawLen = filled ? len : head;

      if (drawLen > 1) {
        tctx.strokeStyle = "#a78bfa";
        tctx.lineWidth   = 1.5;
        tctx.beginPath();
        const tb = traceBuf.current;
        for (let i = 0; i < drawLen; i++) {
          const si = filled ? (head + i) % len : i;
          const x  = (i / (drawLen - 1)) * TW;
          const y  = TH / 2 - tb[si] * TH * 2.5;
          i === 0 ? tctx.moveTo(x, y) : tctx.lineTo(x, y);
        }
        tctx.stroke();
      }

      tctx.strokeStyle = "rgba(255,255,255,0.07)";
      tctx.lineWidth   = 1;
      tctx.beginPath();
      tctx.moveTo(0, TH / 2); tctx.lineTo(TW, TH / 2);
      tctx.stroke();

      id = requestAnimationFrame(loop);
    };

    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []); // empty — all mutable state via refs

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    setStarted(true);
    const rect = cv.getBoundingClientRect();
    const hr = Math.round((e.clientY - rect.top)  / rect.height * N);
    const hc = Math.round((e.clientX - rect.left) / rect.width  * N);
    if (hr < 0 || hr >= N || hc < 0 || hc >= N) return;
    if (!MASK[hr * N + hc]) return;
    strike(hr, hc);
  }, [strike]);

  const handleStart = useCallback(() => {
    setStarted(true);
    ensureAudio();
    strike(CX, CY, 0.7);
  }, [ensureAudio, strike]);

  const fundHz = Math.round(55 + tension * 200);

  return (
    <div className="min-h-screen bg-[#0c0e16] text-white flex flex-col items-center px-4 py-8 gap-6">

      <header className="text-center max-w-lg">
        <h1 className="text-2xl font-serif font-semibold text-white/95 mb-2">
          Membrane Drum
        </h1>
        <p className="text-base text-white/75">
          A circular drumhead solved with the 2D wave equation. Tap anywhere on the drum — Bessel-mode overtones emerge from the physics, not from a preset.
        </p>
      </header>

      {!started && (
        <button
          onClick={handleStart}
          className="min-h-[48px] px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base transition-colors"
        >
          Strike the drum
        </button>
      )}

      {/* Drum canvas — circular clip via CSS border-radius */}
      <div
        className="relative rounded-full overflow-hidden ring-1 ring-violet-500/25 shadow-2xl shadow-violet-950/60"
        style={{ width: "min(440px, 90vw)", height: "min(440px, 90vw)" }}
      >
        <canvas
          ref={canvasRef}
          width={440}
          height={440}
          className="w-full h-full touch-none"
          style={{ cursor: "crosshair", background: "#0c0e16" }}
          onPointerDown={handlePointerDown}
        />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white/40 text-sm">tap to play</span>
          </div>
        )}
      </div>

      {/* Waveform trace */}
      <div className="w-full max-w-lg rounded-lg overflow-hidden border border-white/10">
        <p className="text-xs text-white/40 px-3 pt-2 pb-0 font-mono">
          centre-point displacement · 180 frames
        </p>
        <canvas ref={traceCanvas} width={560} height={72} className="w-full" />
      </div>

      {/* Controls */}
      <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/80">
            Tension —{" "}
            <span className="text-violet-300 font-mono">{fundHz} Hz</span>{" "}
            fundamental
          </span>
          <input
            type="range" min="0.10" max="0.44" step="0.01"
            value={tension}
            onChange={e => setTension(parseFloat(e.target.value))}
            className="w-full accent-violet-400"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-white/80">
            Damping —{" "}
            <span className="text-violet-300 font-mono">
              {((1 - damping) * 1000).toFixed(1)}
            </span>{" "}
            loss/ms
          </span>
          <input
            type="range" min="0.988" max="0.9995" step="0.0005"
            value={damping}
            onChange={e => setDamping(parseFloat(e.target.value))}
            className="w-full accent-violet-400"
          />
        </label>
      </div>

      {/* Stats */}
      <div className="flex gap-6 text-xs text-white/55 font-mono">
        <span>64×64 grid</span>
        <span>6 Bessel modes</span>
        <span>{strikeCount} {strikeCount === 1 ? "strike" : "strikes"}</span>
      </div>

      <Link
        href="/dream"
        className="text-sm text-white/55 hover:text-white/80 transition-colors"
      >
        ← dream lab
      </Link>
    </div>
  );
}
