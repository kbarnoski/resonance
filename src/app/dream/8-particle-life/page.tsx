"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Physics constants ──────────────────────────────────────────────────────

const N_SPECIES = 6;
const N_PER_SPECIES = 150;         // 150 × 6 = 900 particles total
const N_TOTAL = N_PER_SPECIES * N_SPECIES;
const R_MIN = 28;                  // inner repulsion radius (px)
const R_MAX = 115;                 // outer influence radius (px)
const SIM_DT = 0.45;              // integration step
const SIM_FRICTION = 0.95;        // velocity damping per step

// Demo mode: one oscillator per species at its band's center frequency
const DEMO_FREQS = [40, 125, 350, 1000, 3000, 10000];
const DEMO_ENERGY = 0.14;         // constant energy injected in demo mode

// Species → color (matches 1-live band palette)
const SPECIES_COLORS: ReadonlyArray<[number, number, number]> = [
  [124, 58, 237],   // sub-bass  — violet
  [8, 145, 178],    // bass      — cyan
  [22, 163, 74],    // low-mid   — green
  [202, 138, 4],    // mid       — amber
  [234, 88, 12],    // high-mid  — orange
  [219, 39, 119],   // high      — pink
];
const SPECIES_NAMES = ["sub-bass", "bass", "low-mid", "mid", "high-mid", "high"];

// ── Pure helpers (no hooks, no "use" prefix) ───────────────────────────────

function randomMatrix(): Float32Array {
  const m = new Float32Array(N_SPECIES * N_SPECIES);
  for (let i = 0; i < m.length; i++) m[i] = Math.random() * 2 - 1;
  return m;
}

function spawnParticles(w: number, h: number): { pv: Float32Array; sp: Uint8Array } {
  const pv = new Float32Array(N_TOTAL * 4); // [x, y, vx, vy] per particle
  const sp = new Uint8Array(N_TOTAL);
  for (let i = 0; i < N_TOTAL; i++) {
    pv[i * 4]     = Math.random() * w;
    pv[i * 4 + 1] = Math.random() * h;
    pv[i * 4 + 2] = 0;
    pv[i * 4 + 3] = 0;
    sp[i] = Math.floor(i / N_PER_SPECIES);
  }
  return { pv, sp };
}

function applyPhysics(
  pv: Float32Array,
  sp: Uint8Array,
  w: number,
  h: number,
  matrix: Float32Array,
  energy: Float32Array,
) {
  const rMin2 = R_MIN * R_MIN;
  const rMax2 = R_MAX * R_MAX;
  const hw = w * 0.5;
  const hh = h * 0.5;

  // Pass 1: compute forces and update velocities (positions unchanged)
  for (let i = 0; i < N_TOTAL; i++) {
    const ix = pv[i * 4];
    const iy = pv[i * 4 + 1];
    const si = sp[i];
    let fx = 0;
    let fy = 0;

    for (let j = 0; j < N_TOTAL; j++) {
      if (i === j) continue;
      let dx = pv[j * 4] - ix;
      let dy = pv[j * 4 + 1] - iy;
      // Toroidal wrap — particles see through canvas edges
      if (dx > hw) dx -= w; else if (dx < -hw) dx += w;
      if (dy > hh) dy -= h; else if (dy < -hh) dy += h;
      const dsq = dx * dx + dy * dy;
      if (dsq > rMax2 || dsq < 1) continue; // early-exit: ~92% of pairs skip here
      const dist = Math.sqrt(dsq);
      let f: number;
      if (dsq < rMin2) {
        f = -(R_MIN - dist) / R_MIN;          // repulsion: push apart
      } else {
        f = matrix[si * N_SPECIES + sp[j]] * (1 - (dist - R_MIN) / (R_MAX - R_MIN));
      }
      const inv = f / dist;
      fx += inv * dx;
      fy += inv * dy;
    }

    // Audio energy injects random velocity noise — louder band = more turbulence
    const e = energy[si];
    if (e > 0.02) {
      fx += (Math.random() * 2 - 1) * e * 3;
      fy += (Math.random() * 2 - 1) * e * 3;
    }

    pv[i * 4 + 2] = (pv[i * 4 + 2] + fx * SIM_DT) * SIM_FRICTION;
    pv[i * 4 + 3] = (pv[i * 4 + 3] + fy * SIM_DT) * SIM_FRICTION;
  }

  // Pass 2: advance positions (wrap at edges)
  for (let i = 0; i < N_TOTAL; i++) {
    pv[i * 4]     = ((pv[i * 4]     + pv[i * 4 + 2] * SIM_DT) % w + w) % w;
    pv[i * 4 + 1] = ((pv[i * 4 + 1] + pv[i * 4 + 3] * SIM_DT) % h + h) % h;
  }
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  pv: Float32Array,
  w: number,
  h: number,
) {
  // Partial black fill → motion-blur trail
  ctx.fillStyle = "rgba(0,0,0,0.17)";
  ctx.fillRect(0, 0, w, h);

  // Draw particles batched by species (minimizes fillStyle switches)
  for (let s = 0; s < N_SPECIES; s++) {
    const [r, g, b] = SPECIES_COLORS[s];
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    const base = s * N_PER_SPECIES;
    for (let k = base; k < base + N_PER_SPECIES; k++) {
      ctx.fillRect(pv[k * 4] - 1.5, pv[k * 4 + 1] - 1.5, 3, 3);
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

type AudioMode = "none" | "demo" | "mic";

export default function ParticleLifePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>("none");
  const [matrixSnap, setMatrixSnap] = useState<number[]>([]);
  const [energySnap, setEnergySnap] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [fps, setFps] = useState(0);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef(0);
  const pvRef       = useRef<Float32Array | null>(null);
  const spRef       = useRef<Uint8Array | null>(null);
  const matrixRef   = useRef(randomMatrix());
  const energyRef   = useRef(new Float32Array(N_SPECIES));
  const audioModeRef = useRef<AudioMode>("none");
  const demoRigRef  = useRef<{ ctx: AudioContext; oscs: OscillatorNode[] } | null>(null);
  const lastOnsetMs = useRef(0);
  const fpsFrames   = useRef(0);
  const fpsEpoch    = useRef(0);

  // Keep audioModeRef current without adding audioMode to animation loop deps
  useEffect(() => { audioModeRef.current = audioMode; }, [audioMode]);

  const {
    error: micError,
    start: micStart,
    stop: micStop,
    getFrame,
  } = useMicAnalyser({ smoothing: 0.75, gain: 2.0, onsetThreshold: 1.8 });

  // ── Reshuffle ────────────────────────────────────────────────────────────

  const reshuffle = useCallback(() => {
    matrixRef.current = randomMatrix();
    setMatrixSnap(Array.from(matrixRef.current));
  }, []);

  // ── Start handlers ───────────────────────────────────────────────────────

  const launchDemo = useCallback(() => {
    if (demoRigRef.current || isRunning) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    const oscs: OscillatorNode[] = DEMO_FREQS.map((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      g.gain.value = i < 2 ? 0.05 : i < 4 ? 0.035 : 0.02; // quieter in high bands
      osc.connect(g);
      g.connect(master);
      osc.start();
      return osc;
    });
    demoRigRef.current = { ctx, oscs };
    setAudioMode("demo");
    setIsRunning(true);
  }, [isRunning]);

  const launchMic = useCallback(async () => {
    if (isRunning) return;
    await micStart();
    setAudioMode("mic");
    setIsRunning(true);
  }, [isRunning, micStart]);

  const stopAll = useCallback(() => {
    if (demoRigRef.current) {
      demoRigRef.current.oscs.forEach((o) => o.stop());
      void demoRigRef.current.ctx.close();
      demoRigRef.current = null;
    }
    micStop();
    setAudioMode("none");
    setIsRunning(false);
  }, [micStop]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (demoRigRef.current) {
        demoRigRef.current.oscs.forEach((o) => o.stop());
        void demoRigRef.current.ctx.close();
      }
    };
  }, []);

  // ── Spawn particles when simulation starts ───────────────────────────────

  useEffect(() => {
    if (!isRunning) {
      pvRef.current = null;
      spRef.current = null;
      return;
    }
    const canvas = canvasRef.current;
    const w = canvas?.clientWidth  ?? 700;
    const h = canvas?.clientHeight ?? 700;
    const { pv, sp } = spawnParticles(w, h);
    pvRef.current  = pv;
    spRef.current  = sp;
    matrixRef.current = randomMatrix();
    setMatrixSnap(Array.from(matrixRef.current));
    fpsFrames.current = 0;
    fpsEpoch.current  = 0;
  }, [isRunning]);

  // ── Animation loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRunning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    const w   = canvas.clientWidth;
    const h   = canvas.clientHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx2d.scale(dpr, dpr);
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    const tick = (now: number) => {
      const pv = pvRef.current;
      const sp = spRef.current;
      if (!pv || !sp) { animRef.current = requestAnimationFrame(tick); return; }

      // ── Audio energy update ────────────────────────────────────────────
      if (audioModeRef.current === "mic") {
        const frame = getFrame();
        if (frame) {
          for (let i = 0; i < N_SPECIES; i++) energyRef.current[i] = frame.bands[i];
          // Loud onset → reshuffle matrix (2.5s cooldown)
          if (frame.onset && now - lastOnsetMs.current > 2500) {
            lastOnsetMs.current = now;
            matrixRef.current = randomMatrix();
            setMatrixSnap(Array.from(matrixRef.current));
          }
        }
      } else if (audioModeRef.current === "demo") {
        for (let i = 0; i < N_SPECIES; i++) energyRef.current[i] = DEMO_ENERGY;
      }

      // ── Physics + render ───────────────────────────────────────────────
      applyPhysics(pv, sp, w, h, matrixRef.current, energyRef.current);
      paintFrame(ctx2d, pv, w, h);

      // ── FPS counter (update every ~1 s) ───────────────────────────────
      fpsFrames.current++;
      if (fpsEpoch.current === 0) fpsEpoch.current = now;
      const elapsed = now - fpsEpoch.current;
      if (elapsed > 1000) {
        setFps(Math.round(fpsFrames.current * 1000 / elapsed));
        setEnergySnap(Array.from(energyRef.current));
        fpsFrames.current = 0;
        fpsEpoch.current  = now;
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isRunning, getFrame]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {/* ── Idle screen ── */}
      {!isRunning && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Particle Life</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            900 particles. 6 species. A random 6×6 attraction/repulsion matrix
            drives emergent flocking, orbit, and predator-prey patterns — none
            explicitly programmed.
          </p>
          <p className="text-sm text-muted-foreground/70 max-w-md mb-6 leading-relaxed">
            Audio energy injects velocity noise per species. Percussive onsets
            reshuffle the matrix → new emergent pattern appears mid-song.
          </p>
          <div className="flex gap-3 mb-8">
            <button
              onClick={launchDemo}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={launchMic}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start mic
            </button>
          </div>
          {micError && (
            <p className="text-xs text-violet-300/80 max-w-sm mb-4">{micError}</p>
          )}
          <Link
            href="/dream"
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running overlay ── */}
      {isRunning && (
        <>
          {/* Matrix heatmap — top-left */}
          {matrixSnap.length === N_SPECIES * N_SPECIES && (
            <div className="absolute top-3 left-3 pointer-events-none select-none">
              <p className="text-[9px] tracking-widest text-muted-foreground/70 mb-1 uppercase">
                matrix
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${N_SPECIES}, 10px)`,
                  gap: 1,
                }}
              >
                {matrixSnap.map((v, i) => {
                  const abs = Math.abs(v);
                  const rVal = v < 0 ? Math.round(abs * 200) : 0;
                  const gVal = v > 0 ? Math.round(abs * 170) : 0;
                  const bVal = Math.round(abs * 60);
                  return (
                    <div
                      key={i}
                      title={`${SPECIES_NAMES[Math.floor(i / N_SPECIES)]}→${SPECIES_NAMES[i % N_SPECIES]}: ${v.toFixed(2)}`}
                      style={{
                        width: 10,
                        height: 10,
                        background: `rgb(${rVal},${gVal},${bVal})`,
                        opacity: 0.25 + abs * 0.75,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* FPS + mode — top-right */}
          <div className="absolute top-3 right-3 text-right text-[10px] tracking-wider text-muted-foreground/70 space-y-0.5 pointer-events-none select-none">
            <div>{fps} fps</div>
            <div className="uppercase">{audioMode}</div>
          </div>

          {/* Species energy bars + controls — bottom */}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            {/* Per-species energy bars */}
            <div className="flex gap-1.5 items-end">
              {SPECIES_NAMES.map((name, i) => {
                const [r, g, b] = SPECIES_COLORS[i];
                const barH = Math.max(3, energySnap[i] * 44);
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div
                      style={{
                        width: 14,
                        height: barH,
                        background: `rgb(${r},${g},${b})`,
                        opacity: 0.35 + energySnap[i] * 0.65,
                        transition: "height 80ms linear, opacity 80ms linear",
                      }}
                    />
                    <span className="text-[7px] text-muted-foreground/70 tracking-wider uppercase">
                      {name.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Control buttons */}
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={reshuffle}
                className="text-[10px] tracking-wider uppercase text-muted-foreground border border-border hover:border-border hover:text-foreground px-2.5 py-1 rounded transition"
              >
                reshuffle
              </button>
              <button
                onClick={stopAll}
                className="text-[10px] tracking-wider uppercase text-muted-foreground border border-border hover:border-border hover:text-foreground px-2.5 py-1 rounded transition"
              >
                stop
              </button>
              <Link
                href="/dream"
                className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition"
              >
                ← back
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
