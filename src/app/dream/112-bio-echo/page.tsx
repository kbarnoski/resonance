"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Root {
  pts: Array<[number, number]>;
  angle: number;
  speed: number;
  thick: number;
}

// ── Demo oscillators ──────────────────────────────────────────────────────────
// Incommensurable frequencies so the pattern never repeats.
const DEMO_F = [0.23, 0.37, 0.61, 0.89, 1.13, 1.73];

function buildDemoBands(t: number): number[] {
  return DEMO_F.map((f, i) => {
    const base = i < 3 ? 0.46 : 0.36;
    const amp  = i < 3 ? 0.42 : 0.30;
    return Math.max(0, base + amp * Math.sin(t * f * 2 * Math.PI));
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BioEcho() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.80,
    gain: 2.0,
  });

  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const animRef      = useRef(0);
  const rootsRef     = useRef<Root[]>([]);
  const trunkHRef    = useRef(0);
  const demoOnsetRef = useRef(0);
  const initRef      = useRef(false);

  const [mode, setMode] = useState<"idle" | "demo" | "mic">("idle");
  const modeRef = useRef<"idle" | "demo" | "mic">("idle");

  // Keep modeRef in sync so the RAF closure always reads the latest mode.
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // ── Main animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize canvas once (size it to the container and paint the sky).
    if (!initRef.current) {
      const dpr  = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.floor(rect.width  * dpr) || 800;
      canvas.height = Math.floor(rect.height * dpr) || 600;
      ctx.fillStyle = "#070718";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      initRef.current = true;
    }

    let prev = performance.now();

    function tick() {
      if (!canvas || !ctx) return;
      const W  = canvas.width;
      const H  = canvas.height;
      const now = performance.now();
      const t   = now / 1000;
      const dt  = Math.min((now - prev) / 1000, 0.05);
      prev = now;

      // ── Audio source ──────────────────────────────────────────────────────
      let bands: number[];
      let onset = false;

      if (modeRef.current === "mic") {
        const frame = getFrame();
        if (!frame) { animRef.current = requestAnimationFrame(tick); return; }
        bands = frame.bands;
        onset = frame.onset;
      } else {
        bands = buildDemoBands(t);
        // Demo onset: fire ~every 1.5 s when bass peaks above threshold.
        if (t - demoOnsetRef.current > 1.5 && bands[1] > 0.65) {
          onset = true;
          demoOnsetRef.current = t;
        }
      }

      const subBass = bands[0];
      const bass    = bands[1];
      const lowMid  = bands[2];
      const mid     = bands[3];
      const treble  = bands[5];

      // Ground line sits at 88 % of canvas height.
      const gnd = H * 0.88;

      // ── Layer 1: Root tendrils (sub-bass → deep violet) ───────────────────
      if (subBass > 0.05) {
        // Spawn a new root occasionally.
        if (
          rootsRef.current.length < 24 &&
          Math.random() < dt * 60 * 0.05 * subBass
        ) {
          rootsRef.current.push({
            pts:   [[W * (0.08 + Math.random() * 0.84), gnd]],
            angle: (Math.random() - 0.5) * 0.6,
            speed: 0.5 + Math.random() * 0.9,
            thick: 0.4 + Math.random() * 1.4,
          });
        }

        ctx.lineCap = "round";
        for (const root of rootsRef.current) {
          // pts is never empty — we always push the initial point at construction.
          const last = root.pts[root.pts.length - 1]!;
          // Stop extending this root once it reaches the canopy zone.
          if (last[1] < H * 0.58) continue;
          const spd = dt * (22 + subBass * 68) * root.speed;
          const nx  = last[0] + spd * Math.sin(root.angle);
          const ny  = last[1] - spd * Math.cos(root.angle);
          root.pts.push([nx, ny]);
          // Brownian angle drift.
          root.angle += (Math.random() - 0.5) * 0.4 * dt * 50;
          root.angle  = Math.max(-1.1, Math.min(1.1, root.angle));
          // Draw only the new segment — canvas retains everything else.
          ctx.beginPath();
          ctx.moveTo(last[0], last[1]);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = `rgba(88,32,192,${(0.32 + subBass * 0.48).toFixed(2)})`;
          ctx.lineWidth   = root.thick;
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }

      // ── Layer 2: Tree trunk (bass + low-mid → amber pillar) ───────────────
      // Trunk only grows — never shrinks — so old trunk pixels stay.
      const trunkE = bass * 0.60 + lowMid * 0.40;
      const tgtH   = H * 0.50 * trunkE;
      if (tgtH > trunkHRef.current) {
        trunkHRef.current += Math.min(tgtH - trunkHRef.current, dt * 45);
      }
      const th = Math.max(2, trunkHRef.current);
      // Low alpha + repeat draws = natural gradient: base saturates quickly,
      // freshly-added top stays lighter.
      ctx.fillStyle = "rgba(245,158,11,0.18)";
      ctx.fillRect(W / 2 - 5, gnd - th, 10, th);

      // ── Layer 3: Canopy (mid → emerald leaf particles) ────────────────────
      if (mid > 0.10) {
        const n = Math.ceil(mid * 3.5 * dt * 60);
        for (let i = 0; i < n; i++) {
          const px = W  * (0.12 + Math.random() * 0.76);
          const py = H  * (0.34 + Math.random() * 0.27);
          const pr = 1.0 + mid * 3.5;
          ctx.beginPath();
          ctx.ellipse(px, py, pr * 0.55, pr, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(52,211,153,${(0.18 + mid * 0.45).toFixed(2)})`;
          ctx.fill();
        }
      }

      // ── Layer 4: Bird arcs (onset → white bezier wing) ────────────────────
      if (onset) {
        const bx  = W * (0.06 + Math.random() * 0.88);
        const by  = H * (0.06 + Math.random() * 0.18);
        const aw  = W * (0.04 + Math.random() * 0.10);
        const dip = H * 0.022;
        ctx.beginPath();
        ctx.moveTo(bx - aw / 2, by + dip);
        ctx.bezierCurveTo(
          bx - aw / 4, by - dip * 1.4,
          bx + aw / 4, by - dip * 1.4,
          bx + aw / 2, by + dip
        );
        ctx.strokeStyle = "rgba(255,255,255,0.80)";
        ctx.lineWidth   = 1.0;
        ctx.lineCap     = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
      }

      // ── Layer 5: Sky shimmer (treble → white star-dots) ───────────────────
      if (treble > 0.07) {
        const n = Math.ceil(treble * 5 * dt * 60);
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(
            Math.random() * W,
            Math.random() * H * 0.14,
            0.5 + Math.random() * 1.5,
            0, Math.PI * 2
          );
          ctx.fillStyle = `rgba(255,255,255,${(0.35 + treble * 0.50).toFixed(2)})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode, getFrame]);

  // ── Actions ───────────────────────────────────────────────────────────────

  function clearForest() {
    rootsRef.current  = [];
    trunkHRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#070718";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `bio-echo-${Date.now()}.png`;
    a.click();
  }

  function handleStartMic() {
    void start();
    setMode("mic");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full min-h-screen bg-[#070718] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ── Start screen ── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
          <h1 className="text-2xl font-mono text-white/95 tracking-tight text-center">
            Bio Echo
          </h1>
          <p className="text-base text-white/75 text-center max-w-xs leading-relaxed">
            Play — watch your music grow a forest.
          </p>
          <p className="text-sm text-white/55 text-center max-w-sm leading-relaxed">
            Sub-bass grows root tendrils · bass builds the trunk ·
            mid blooms the canopy · onsets send birds · treble fills the sky
          </p>
          {error && (
            <p className="text-rose-300 text-sm text-center">{error}</p>
          )}
          <div className="flex flex-col gap-3 w-full max-w-[200px]">
            <button
              onClick={handleStartMic}
              className="px-5 py-2.5 rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-mono hover:bg-violet-500/30 transition min-h-[44px]"
            >
              Start mic
            </button>
            <button
              onClick={() => setMode("demo")}
              className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/75 text-base font-mono hover:bg-white/10 transition min-h-[44px]"
            >
              Demo mode
            </button>
          </div>
        </div>
      )}

      {/* ── Running HUD ── */}
      {mode !== "idle" && (
        <>
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2">
              <p className="text-rose-300 text-sm font-mono px-3 py-1.5 bg-rose-950/50 rounded border border-rose-500/30">
                {error}
              </p>
            </div>
          )}

          <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-mono ${
                  mode === "demo"
                    ? "text-white/55"
                    : running
                    ? "text-emerald-300/75"
                    : "text-white/40"
                }`}
              >
                {mode === "demo" ? "demo" : running ? "mic live" : "mic…"}
              </span>
              <button
                onClick={() => { stop(); setMode("idle"); clearForest(); }}
                className="text-white/55 text-xs font-mono hover:text-white/80 transition"
              >
                stop
              </button>
            </div>

            <button
              onClick={downloadPng}
              className="px-3 py-1.5 rounded bg-white/10 border border-white/15 text-white/75 text-xs font-mono hover:bg-white/15 transition"
            >
              Save PNG
            </button>
          </div>
        </>
      )}

      <div className="absolute top-3 right-3">
        <Link
          href="https://getresonance.vercel.app/dream"
          className="text-white/30 text-xs font-mono hover:text-white/55 transition"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
