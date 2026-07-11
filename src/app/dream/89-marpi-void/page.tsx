"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// Smooth 2D noise (no deps) — summed sines at irrational-ish frequencies.
// Looks Perlin-like without an external library.
function sNoise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 2.3 + t * 0.6) * 0.50 +
    Math.sin(y * 1.7 + t * 0.9) * 0.25 +
    Math.sin((x + y) * 3.1 + t * 0.4) * 0.15 +
    Math.sin((x - y) * 1.9 + t * 1.1) * 0.10
  );
}

type OrgColor = "bass" | "mid" | "treble";

interface Organism {
  id: number;
  cx: number;
  cy: number;
  arms: number;       // 8–16
  phase: number;      // base rotation offset
  noiseOff: number;   // unique noise domain offset
  armLen: number;     // max arm radius in px
  alpha: number;      // current opacity 0–1
  lastFedAt: number;  // performance.now() of last feeding
  birthTime: number;
  driftVx: number;
  driftVy: number;
  colorType: OrgColor;
}

let _oid = 0;

function buildOrganism(
  cx: number,
  cy: number,
  colorType: OrgColor,
  now: number,
  maxR: number
): Organism {
  return {
    id: _oid++,
    cx,
    cy,
    arms: 8 + Math.floor(Math.random() * 9), // 8–16
    phase: Math.random() * Math.PI * 2,
    noiseOff: Math.random() * 100,
    armLen: maxR * (0.12 + Math.random() * 0.14),
    alpha: 0,
    lastFedAt: now,
    birthTime: now,
    driftVx: (Math.random() - 0.5) * 0.12,
    driftVy: (Math.random() - 0.5) * 0.12,
    colorType,
  };
}

// Nucleus color per organism type
const NUC: Record<OrgColor, [number, number, number]> = {
  bass:   [148,  60, 255], // violet
  mid:    [ 60, 220, 220], // cyan
  treble: [255,  80, 150], // rose
};
// Arm/tip color per organism type
const ARM: Record<OrgColor, [number, number, number]> = {
  bass:   [100, 200, 255], // ice blue
  mid:    [180, 120, 255], // lavender
  treble: [255, 200, 120], // amber
};

const COLOR_TYPES: OrgColor[] = ["bass", "mid", "treble"];

export default function MarpiVoid() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.88,
    gain: 2.0,
    onsetThreshold: 1.8,
  });

  const [mode, setMode] = useState<"idle" | "demo" | "mic">("idle");
  const [orgCount, setOrgCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const organismsRef = useRef<Organism[]>([]);
  const lastOnsetRef = useRef(0);
  const demoNextOnsetRef = useRef(0);

  const startDemo = useCallback(() => {
    organismsRef.current = [];
    demoNextOnsetRef.current = 0;
    setMode("demo");
  }, []);

  const startMic = useCallback(() => {
    organismsRef.current = [];
    demoNextOnsetRef.current = 0;
    start();
    setMode("mic");
  }, [start]);

  const stopAll = useCallback(() => {
    stop();
    organismsRef.current = [];
    setMode("idle");
  }, [stop]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode === "idle") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight - 48;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Seed the founding organism at center
    const seedNow = performance.now();
    if (organismsRef.current.length === 0) {
      const seedMaxR = Math.min(w, h) * 0.42;
      organismsRef.current.push(
        buildOrganism(w / 2, h / 2, "bass", seedNow, seedMaxR)
      );
    }

    let lastTs = 0;
    let lastCountUpdate = 0;

    const render = (ts: number) => {
      const dt = lastTs === 0 ? 16 : Math.min(ts - lastTs, 50);
      lastTs = ts;
      const t = ts / 1000;
      const maxR = Math.min(w, h) * 0.42;

      // --- Audio values ---
      let bassE = 0;
      let midE = 0;
      let trebleE = 0;
      let ampE = 0;
      let onset = false;

      if (mode === "demo") {
        bassE   = 0.30 + 0.28 * Math.sin(t * 0.65);
        midE    = 0.22 + 0.22 * Math.sin(t * 1.05 + 1.1);
        trebleE = 0.18 + 0.18 * Math.sin(t * 1.80 + 2.3);
        ampE    = (bassE + midE + trebleE) / 3;
        if (ts > demoNextOnsetRef.current) {
          onset = true;
          demoNextOnsetRef.current = ts + 7000 + Math.random() * 6000;
        }
      } else {
        const frame = getFrame();
        if (frame) {
          bassE   = frame.bands[1];
          midE    = (frame.bands[2] + frame.bands[3]) / 2;
          trebleE = (frame.bands[4] + frame.bands[5]) / 2;
          ampE    = frame.amplitude;
          onset   = frame.onset;
        }
      }

      // --- Spawn on onset ---
      if (
        onset &&
        ts - lastOnsetRef.current > 2000 &&
        organismsRef.current.length < 18
      ) {
        lastOnsetRef.current = ts;
        const parent =
          organismsRef.current[
            Math.floor(Math.random() * organismsRef.current.length)
          ];
        const angle = Math.random() * Math.PI * 2;
        const dist = parent.armLen * (0.7 + Math.random() * 0.5);
        const nx = Math.max(80, Math.min(w - 80, parent.cx + Math.cos(angle) * dist));
        const ny = Math.max(80, Math.min(h - 80, parent.cy + Math.sin(angle) * dist));
        organismsRef.current.push(
          buildOrganism(
            nx,
            ny,
            COLOR_TYPES[Math.floor(Math.random() * 3)],
            ts,
            maxR
          )
        );
      }

      // --- Update organism state ---
      for (const o of organismsRef.current) {
        const energy =
          o.colorType === "bass" ? bassE
          : o.colorType === "mid" ? midE
          : trebleE;

        if (energy > 0.06) o.lastFedAt = ts;

        // Brownian drift
        o.cx += o.driftVx * dt * 0.05;
        o.cy += o.driftVy * dt * 0.05;
        if (o.cx < 80 || o.cx > w - 80) {
          o.driftVx *= -0.8;
          o.cx = Math.max(80, Math.min(w - 80, o.cx));
        }
        if (o.cy < 80 || o.cy > h - 80) {
          o.driftVy *= -0.8;
          o.cy = Math.max(80, Math.min(h - 80, o.cy));
        }

        // Alpha: fade in 1.5s, fade out when starved 15s+
        const fadeIn = Math.min(1, (ts - o.birthTime) / 1500);
        const starved = ts - o.lastFedAt;
        const fadeOut = starved > 15000 ? Math.max(0, 1 - (starved - 15000) / 8000) : 1;
        o.alpha = fadeIn * fadeOut;
      }

      // Cull dissolved organisms (never remove the last one)
      if (organismsRef.current.length > 1) {
        organismsRef.current = organismsRef.current.filter((o) => o.alpha > 0.005);
      }

      // --- Render ---
      // Trail: partial clear for persistence effect (~7.7 frame half-life)
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(0, 0, w, h);

      for (const o of organismsRef.current) {
        if (o.alpha < 0.01) continue;

        const energy =
          o.colorType === "bass" ? bassE
          : o.colorType === "mid" ? midE
          : trebleE;
        const nc = NUC[o.colorType];
        const ac = ARM[o.colorType];

        // Arm extension driven by bass for all organisms (pulse of the music)
        const effLen = o.armLen * (0.5 + 1.0 * bassE);

        ctx.save();
        ctx.globalAlpha = o.alpha;
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = 1.2 + energy * 2.0;

        for (let ai = 0; ai < o.arms; ai++) {
          const angle = o.phase + (ai / o.arms) * Math.PI * 2;
          // Treble drives curvature jitter via smooth noise
          const n1 =
            sNoise(o.noiseOff + ai * 0.37, t * 0.4, o.noiseOff * 0.1) * trebleE;
          const n2 =
            sNoise(o.noiseOff + ai * 0.71, t * 0.3 + 1.0, o.noiseOff * 0.15) * trebleE;
          const perp = angle + Math.PI / 2;
          const ex = o.cx + Math.cos(angle) * effLen;
          const ey = o.cy + Math.sin(angle) * effLen;
          const cp1x =
            o.cx + Math.cos(angle) * effLen * 0.35 + Math.cos(perp) * n1 * effLen * 0.7;
          const cp1y =
            o.cy + Math.sin(angle) * effLen * 0.35 + Math.sin(perp) * n1 * effLen * 0.7;
          const cp2x =
            o.cx + Math.cos(angle) * effLen * 0.68 + Math.cos(perp) * n2 * effLen * 0.6;
          const cp2y =
            o.cy + Math.sin(angle) * effLen * 0.68 + Math.sin(perp) * n2 * effLen * 0.6;

          const armA = 0.25 + energy * 0.55;
          const grad = ctx.createLinearGradient(o.cx, o.cy, ex, ey);
          grad.addColorStop(0, `rgba(${nc[0]},${nc[1]},${nc[2]},${armA})`);
          grad.addColorStop(1, `rgba(${ac[0]},${ac[1]},${ac[2]},${armA * 0.35})`);
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(o.cx, o.cy);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);
          ctx.stroke();

          // Tip glow
          const tipR = 1.5 + energy * 4;
          const tg = ctx.createRadialGradient(ex, ey, 0, ex, ey, tipR * 2.5);
          tg.addColorStop(0, `rgba(${ac[0]},${ac[1]},${ac[2]},${0.7 * energy})`);
          tg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.arc(ex, ey, tipR * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Nucleus — pulsates with amplitude
        const nR = 5 + energy * 16 + ampE * 10;
        const ng = ctx.createRadialGradient(o.cx, o.cy, 0, o.cx, o.cy, nR * 3.5);
        ng.addColorStop(0, `rgba(${nc[0]},${nc[1]},${nc[2]},0.95)`);
        ng.addColorStop(0.25, `rgba(${nc[0]},${nc[1]},${nc[2]},0.40)`);
        ng.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(o.cx, o.cy, nR * 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }

      // HUD count update ~2Hz
      if (ts - lastCountUpdate > 500) {
        lastCountUpdate = ts;
        setOrgCount(organismsRef.current.length);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode, getFrame]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Void Organism</h1>
          <p className="text-base text-muted-foreground max-w-md mb-2 leading-relaxed">
            A living entity breathes in the void. Arms extend on bass energy, curl on
            treble jitter. Percussive onsets spawn offspring — play long enough and a
            drifting colony fills the space.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mb-8">
            Inspired by Marpi Studio&apos;s{" "}
            <em>New Nature</em> (ARTECHOUSE 2026).
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition min-h-[44px]"
            >
              Demo (no mic)
            </button>
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-violet-400/60 text-violet-300 rounded hover:bg-violet-500/10 hover:border-violet-400 transition min-h-[44px]"
            >
              Start mic
            </button>
          </div>
          {error && (
            <p className="mt-4 text-sm text-violet-300 max-w-sm">{error}</p>
          )}
          <Link
            href="/dream"
            className="mt-12 text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
          <div className="text-xs text-muted-foreground tracking-wider">
            {mode.toUpperCase()} &middot;{" "}
            {orgCount} organism{orgCount !== 1 ? "s" : ""}
          </div>
          {mode === "mic" && !running && error && (
            <p className="text-xs text-violet-300 max-w-[180px] text-right">{error}</p>
          )}
          <button
            onClick={stopAll}
            className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
          >
            stop
          </button>
          <Link
            href="/dream"
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back
          </Link>
        </div>
      )}
    </div>
  );
}
