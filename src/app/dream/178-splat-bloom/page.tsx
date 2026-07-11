"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Splat {
  x: number; y: number;
  restX: number; restY: number;
  vx: number; vy: number;
  angle: number;
  rx: number; ry: number;
  hue: number;
  opacity: number;
  isNear: boolean; // one of the 100 nearest to canvas center (pre-computed)
}

// ── Helpers (no "use" prefix — not hooks) ─────────────────────────────────────

function gaussianPair(): [number, number] {
  // Box-Muller transform — two standard-normal samples
  const u1 = Math.max(Math.random(), 1e-10);
  const u2 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(u1));
  return [mag * Math.cos(2 * Math.PI * u2), mag * Math.sin(2 * Math.PI * u2)];
}

function buildSplats(cw: number, ch: number): Splat[] {
  const sigma = Math.min(cw, ch) * 0.22;
  const cx = cw / 2;
  const cy = ch / 2;
  const splats: Splat[] = [];

  for (let i = 0; i < 500; i++) {
    const [z0, z1] = gaussianPair();
    const x = cx + z0 * sigma;
    const y = cy + z1 * sigma;
    const baseRx = 8 + Math.random() * 14;        // 8–22 px minor axis
    const elongation = 3 + Math.random() * 5;     // 3–8× elongation
    splats.push({
      x, y, restX: x, restY: y,
      vx: 0, vy: 0,
      angle: Math.random() * Math.PI * 2,
      rx: baseRx,
      ry: baseRx * elongation,
      hue: Math.random() * 360,
      opacity: 0.3 + Math.random() * 0.4,
      isNear: false,
    });
  }

  // Pre-mark the 100 nearest to canvas center — used for bass bloom effect
  const indexed = splats.map((s, i) => ({
    i,
    d2: (s.restX - cx) ** 2 + (s.restY - cy) ** 2,
  }));
  indexed.sort((a, b) => a.d2 - b.d2);
  for (let k = 0; k < 100; k++) splats[indexed[k].i].isNear = true;

  return splats;
}

// ── Component ──────────────────────────────────────────────────────────────────

type Phase = "idle" | "demo" | "mic";

export default function SplatBloomPage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase]   = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");

  const { running, error: micErr, start: startMic, getFrame } = useMicAnalyser({
    smoothing: 0.80,
    gain: 1.8,
    onsetThreshold: 1.60,
  });

  const splatsRef   = useRef<Splat[]>([]);
  const rafRef      = useRef(0);
  const runRef      = useRef(false);
  const initDoneRef = useRef(false);
  const smRef       = useRef({ bass: 0.28, treble: 0.18, cent: 0.45 });

  useEffect(() => { runRef.current = running; }, [running]);
  useEffect(() => { if (micErr) setErrMsg(micErr); }, [micErr]);

  // Main canvas loop — fires once when phase leaves idle
  useEffect(() => {
    if (phase === "idle" || initDoneRef.current) return;
    initDoneRef.current = true;

    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas = canvasMaybe;

    const ctxMaybe = canvas.getContext("2d");
    if (!ctxMaybe) return;
    const ctx = ctxMaybe;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      canvas.width  = Math.floor(window.innerWidth  * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width  = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      splatsRef.current = buildSplats(canvas.width, canvas.height);
    }
    resize();
    window.addEventListener("resize", resize);

    const K    = 0.015;  // spring stiffness
    const DAMP = 0.07;   // velocity damping
    const TAU  = Math.PI * 2;

    let prevBeat = -1;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);

      const elapsed = ts / 1000;
      const splats  = splatsRef.current;
      const sm      = smRef.current;
      const α       = 0.12;
      let hasOnset  = false;

      // ── Audio source ───────────────────────────────────────────────────────
      if (runRef.current) {
        const fr = getFrame();
        if (fr) {
          sm.bass   += α * ((fr.bands[0] + fr.bands[1]) * 0.5 - sm.bass);
          sm.treble += α * ((fr.bands[4] + fr.bands[5]) * 0.5 - sm.treble);
          sm.cent   += α * (Math.min(fr.centroid / 5000, 1) - sm.cent);
          hasOnset = fr.onset;
        }
      } else {
        // Demo: three slow LFOs simulate breathing audio
        sm.bass   = 0.30 + 0.26 * Math.sin(elapsed * 0.72);
        sm.treble = 0.16 + 0.14 * Math.sin(elapsed * 1.38 + 1.2);
        sm.cent   = 0.40 + 0.26 * Math.sin(elapsed * 0.51 + 2.4);
        // Onset every ~2.8 s in demo
        const beatIdx = Math.floor(elapsed / 2.8);
        hasOnset = beatIdx !== prevBeat;
        if (hasOnset) prevBeat = beatIdx;
      }

      // ── Onset: scatter 50 random splats ───────────────────────────────────
      if (hasOnset && splats.length > 0) {
        for (let i = 0; i < 50; i++) {
          const s   = splats[Math.floor(Math.random() * splats.length)];
          const dir = Math.random() * TAU;
          const mag = 40 + Math.random() * 60;
          s.vx += Math.cos(dir) * mag;
          s.vy += Math.sin(dir) * mag;
        }
      }

      // ── Compute hue target from spectral centroid ─────────────────────────
      // cent 0.1 (≈500 Hz) → cool violet (265°)
      // cent 0.4 (≈2 kHz)  → warm amber  (35°)
      const centT    = Math.min(1, Math.max(0, (sm.cent - 0.1) / 0.3));
      const hueTarget = 265 + (35 - 265) * centT;

      // ── Physics + per-splat updates ───────────────────────────────────────
      const rotDrift = sm.treble * 0.008;

      for (const s of splats) {
        // Spring back to rest position
        s.vx += -K * (s.x - s.restX) - DAMP * s.vx;
        s.vy += -K * (s.y - s.restY) - DAMP * s.vy;
        s.x  += s.vx;
        s.y  += s.vy;

        // Treble-driven rotation drift
        s.angle += rotDrift;

        // Hue converges 1°/frame toward global target (shortest arc)
        const diff = ((hueTarget - s.hue + 540) % 360) - 180;
        s.hue += Math.sign(diff) * Math.min(1, Math.abs(diff));
        if (s.hue < 0)   s.hue += 360;
        if (s.hue >= 360) s.hue -= 360;
      }

      // ── Render ────────────────────────────────────────────────────────────
      const cw = canvas.width;
      const ch = canvas.height;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "screen";

      const bloomScale = 1 + sm.bass * 0.6;
      const opDelta    = sm.bass * 0.15;

      for (const s of splats) {
        const erx = s.isNear ? s.rx * bloomScale : s.rx;
        const ery = s.isNear ? s.ry * bloomScale : s.ry;
        const op  = s.isNear ? Math.max(0.05, s.opacity - opDelta) : s.opacity;
        const h   = s.hue | 0;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.scale(erx, ery);
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, TAU);
        ctx.fillStyle = `hsla(${h},80%,70%,${op.toFixed(2)})`;
        ctx.fill();
        ctx.restore();
      }

      // Reset composite op so UI overlays render correctly
      ctx.globalCompositeOperation = "source-over";
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDemo() {
    setPhase("demo");
  }

  async function handleMic() {
    if (phase === "idle") setPhase("demo");
    try {
      await startMic();
      setPhase("mic");
    } catch {
      setErrMsg("Mic access denied — check browser permissions");
    }
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">
      {/* Canvas — full screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", imageRendering: "auto" }}
      />

      {/* ── Idle splash ── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 px-6">
          <h1 className="text-3xl font-mono text-foreground tracking-wide">Splat Bloom</h1>
          <p className="text-base text-muted-foreground max-w-xs text-center leading-relaxed">
            500 luminous ellipses breathing with your music. Bass blooms
            the centre outward; treble swirls the whole field; spectral
            colour shifts from violet to amber.
          </p>
          <p className="text-sm text-muted-foreground max-w-xs text-center">
            Additive Canvas2D splat field — a texture between particles and fluid.
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={handleDemo}
              className="px-5 py-3 min-h-[44px] min-w-[80px] bg-muted hover:bg-accent border border-border text-foreground text-base font-mono rounded-lg transition-colors"
            >
              Demo
            </button>
            <button
              onClick={handleMic}
              className="px-5 py-3 min-h-[44px] min-w-[110px] bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 text-violet-300 text-base font-mono rounded-lg transition-colors"
            >
              Start mic
            </button>
          </div>
          {errMsg && <p className="text-violet-300 text-base">{errMsg}</p>}
        </div>
      )}

      {/* ── Active: title bar ── */}
      {phase !== "idle" && (
        <div className="absolute top-4 left-5 z-10 pointer-events-none select-none">
          <p className="text-xl font-mono text-foreground">Splat Bloom</p>
          <p className="text-sm text-muted-foreground mt-0.5">Gaussian additive field · audio-reactive</p>
        </div>
      )}

      {/* ── Active: bottom bar ── */}
      {phase !== "idle" && (
        <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between z-10">
          <p className="text-xs text-muted-foreground font-mono select-none">
            {running ? "🎤 mic" : "demo · LFO"}
          </p>
          <div className="flex items-center gap-4">
            {!running && (
              <button
                onClick={handleMic}
                className="text-sm text-violet-300 font-mono border border-violet-400/30 px-4 py-1.5 min-h-[36px] rounded hover:bg-violet-500/15 transition-colors"
              >
                Add mic →
              </button>
            )}
            <Link
              href="/dream"
              className="text-sm text-muted-foreground/70 font-mono hover:text-muted-foreground transition-colors"
            >
              ← dream lab
            </Link>
          </div>
        </div>
      )}

      {/* ── Error overlay ── */}
      {errMsg && phase !== "idle" && (
        <div className="absolute top-16 left-5 z-10">
          <p className="text-violet-300 text-base font-mono">{errMsg}</p>
        </div>
      )}
    </div>
  );
}
