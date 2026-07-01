"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  REGIMES,
  regimeByKey,
  makeCpuLenia,
  setCpuRegime,
  seedCpu,
  stepCpu,
  statsCpu,
  type CpuLenia,
  type FieldStats,
} from "./lenia";
import { buildGpu, type GpuLenia } from "./gpu";
import { createAudio, type AudioEngine } from "./audio";

const GPU_SIZE = 256;
const CPU_SIZE = 128;

type Path = "gpu" | "cpu" | "pending";

// Auto-demo seeds: 2–3 creatures so the field is alive within ~2s, no input.
const DEMO_SEEDS: Array<{ x: number; y: number; r: number; a: number }> = [
  { x: 0.34, y: 0.4, r: 0.08, a: 0.9 },
  { x: 0.66, y: 0.58, r: 0.08, a: 0.9 },
  { x: 0.5, y: 0.3, r: 0.07, a: 0.75 },
];

export default function LeniaOrganismsPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const gpuRef = useRef<GpuLenia | null>(null);
  const cpuRef = useRef<CpuLenia | null>(null);
  const cpuPrevRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number>(0);
  const pathRef = useRef<Path>("pending");
  const regimeRef = useRef(REGIMES[0]);
  const statsRef = useRef<FieldStats>({
    mass: 0,
    centroidX: 0.5,
    centroidY: 0.5,
    motion: 0,
    activity: 0,
  });

  const [path, setPath] = useState<Path>("pending");
  const [regimeKey, setRegimeKey] = useState(REGIMES[0].key);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [live, setLive] = useState<FieldStats>(statsRef.current);

  // ── seed handling (works for both paths) ──
  const applySeed = useCallback((nx: number, ny: number, r: number, a: number) => {
    if (pathRef.current === "gpu" && gpuRef.current) {
      gpuRef.current.seed(nx, ny, r, a);
    } else if (cpuRef.current) {
      seedCpu(cpuRef.current, nx, ny, r, a);
    }
    // ring a bell immediately on a tap so it feels responsive
    audioRef.current?.pluck(ny, 0.7);
  }, []);

  // ── init: try GPU, else CPU, then run loop ──
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const audio = createAudio();
    audioRef.current = audio;

    let lastStatsT = 0;
    let statsInFlight = false;

    async function boot() {
      let usingGpu = false;
      try {
        const gpu = await buildGpu(canvas!, GPU_SIZE, regimeRef.current);
        if (gpu && !cancelled) {
          gpuRef.current = gpu;
          usingGpu = true;
        }
      } catch {
        usingGpu = false;
      }
      if (cancelled) {
        gpuRef.current?.destroy();
        return;
      }

      if (!usingGpu) {
        canvas!.width = CPU_SIZE;
        canvas!.height = CPU_SIZE;
        const cpu = makeCpuLenia(CPU_SIZE, regimeRef.current);
        cpuRef.current = cpu;
        cpuPrevRef.current = new Float32Array(CPU_SIZE * CPU_SIZE);
      }
      pathRef.current = usingGpu ? "gpu" : "cpu";
      setPath(usingGpu ? "gpu" : "cpu");

      // auto-demo: seed a few creatures so it lives headless
      for (const s of DEMO_SEEDS) applySeed(s.x, s.y, s.r, s.a);

      const cctx2d =
        !usingGpu && canvas ? canvas.getContext("2d") : null;
      const imageData =
        cctx2d ? cctx2d.createImageData(CPU_SIZE, CPU_SIZE) : null;

      let prevT = performance.now();

      function frame(t: number) {
        if (cancelled) return;
        const dt = Math.min(0.05, (t - prevT) / 1000);
        prevT = t;

        if (pathRef.current === "gpu" && gpuRef.current) {
          const g = gpuRef.current;
          g.step();
          g.step(); // two sub-steps/frame for livelier motion
          g.render();
          // periodic async stats readback (~15 Hz) — never blocks the frame
          if (!statsInFlight && t - lastStatsT > 66) {
            lastStatsT = t;
            statsInFlight = true;
            g.sampleStats()
              .then((s) => {
                if (s) {
                  statsRef.current = s;
                  audioRef.current?.update(s, 0.066);
                }
              })
              .finally(() => {
                statsInFlight = false;
              });
          }
        } else if (cpuRef.current && cctx2d && imageData) {
          const c = cpuRef.current;
          cpuPrevRef.current?.set(c.A);
          stepCpu(c);
          const s = statsCpu(c, cpuPrevRef.current);
          statsRef.current = s;
          audioRef.current?.update(s, dt);
          drawCpu(imageData.data, c.A, CPU_SIZE);
          cctx2d.putImageData(imageData, 0, 0);
        }

        setLive(statsRef.current);
        rafRef.current = requestAnimationFrame(frame);
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    void boot();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      gpuRef.current?.destroy();
      gpuRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // applySeed is stable (useCallback with []); intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── audio starts muted-until-gesture on some browsers; resume on interaction ──
  const ensureAudio = useCallback(() => {
    void audioRef.current?.resume();
  }, []);

  const onCanvasTap = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      ensureAudio();
      const rect = e.currentTarget.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      applySeed(nx, ny, 0.075, 0.9);
    },
    [applySeed, ensureAudio],
  );

  const chooseRegime = useCallback((key: string) => {
    void audioRef.current?.resume();
    const reg = regimeByKey(key);
    regimeRef.current = reg;
    setRegimeKey(key);
    if (pathRef.current === "gpu" && gpuRef.current) {
      gpuRef.current.setRegime(reg);
    } else if (cpuRef.current) {
      setCpuRegime(cpuRef.current, reg);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      if (!next) void audioRef.current?.resume();
      return next;
    });
  }, []);

  const clearField = useCallback(() => {
    ensureAudio();
    if (pathRef.current === "gpu" && gpuRef.current) {
      gpuRef.current.clear();
    } else if (cpuRef.current) {
      cpuRef.current.A.fill(0);
    }
    // re-seed a fresh demo so it never goes fully dark/silent
    for (const s of DEMO_SEEDS) applySeed(s.x, s.y, s.r, s.a);
  }, [applySeed, ensureAudio]);

  const badge =
    path === "gpu" ? (
      <span className="text-emerald-300">● GPU</span>
    ) : path === "cpu" ? (
      <span className="text-amber-300">● CPU fallback</span>
    ) : (
      <span className="text-white/75">● starting…</span>
    );

  return (
    <main
      className="min-h-screen w-full bg-[#07060f] text-white flex flex-col items-center px-4 py-6"
      onPointerDown={ensureAudio}
    >
      <div className="w-full max-w-3xl">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">
            Lenia Organisms
          </h1>
          <div className="text-base font-medium">{badge}</div>
        </div>
        <p className="mt-2 text-base text-white/75">
          A field of continuous artificial life that self-organizes into alien
          creatures — an instrument you seed by tapping, that sings back as it lives.
        </p>
        <p className="mt-1 text-base text-emerald-200/90">
          Tap the field to seed a blob of living matter. The Lenia dynamics grow it.
        </p>

        <div className="mt-4 relative w-full aspect-square rounded-xl overflow-hidden ring-1 ring-white/10 shadow-[0_0_60px_-15px_rgba(20,180,160,0.4)]">
          <canvas
            ref={canvasRef}
            width={GPU_SIZE}
            height={GPU_SIZE}
            onPointerDown={onCanvasTap}
            className="w-full h-full block touch-none cursor-crosshair"
            style={{ imageRendering: "auto" }}
            aria-label="Lenia life field — tap to seed a creature"
          />
        </div>

        {/* regime / species presets */}
        <div className="mt-4 flex flex-wrap gap-2">
          {REGIMES.map((r) => {
            const active = r.key === regimeKey;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => chooseRegime(r.key)}
                className={
                  "min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium transition-colors " +
                  (active
                    ? "bg-emerald-400/90 text-black"
                    : "bg-white/10 text-white/95 hover:bg-white/20")
                }
                aria-pressed={active}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* transport / meta controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium bg-white/10 text-white/95 hover:bg-white/20"
          >
            {muted ? "Sound: off" : "Sound: on"}
          </button>
          <button
            type="button"
            onClick={clearField}
            className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium bg-white/10 text-white/95 hover:bg-white/20"
          >
            Reseed field
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium bg-white/10 text-white/95 hover:bg-white/20"
          >
            Design notes
          </button>
          <Link
            href="/dream"
            className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium text-white/75 hover:text-white/95 flex items-center"
          >
            ← Dream lab
          </Link>
        </div>

        {/* live readout */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-base">
          <Meter label="Life (mass)" value={live.mass} scale={4} />
          <Meter label="Motion" value={live.motion} scale={40} />
          <Meter label="Activity" value={live.activity} scale={6} />
        </div>

        <p className="mt-4 text-base text-white/75">
          The whole model — a smooth ring-kernel convolution plus a Gaussian growth
          function — runs in a WebGPU compute shader (or a 128² JS fallback). The
          field&apos;s mass, motion and centroid drive a just-intonation choir:
          more life swells the drone, growth events ring soft bells (pitched by
          creature height), turbulence adds shimmer.
        </p>
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </main>
  );
}

function Meter({ label, value, scale }: { label: string; value: number; scale: number }) {
  const pct = Math.min(100, Math.max(0, value * scale * 100));
  return (
    <div className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2">
      <div className="text-white/75 text-sm">{label}</div>
      <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-teal-400 to-amber-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// draw the CPU field into an ImageData buffer with the same palette idea as WGSL.
function drawCpu(out: Uint8ClampedArray, A: Float32Array, size: number) {
  for (let i = 0; i < size * size; i++) {
    const a = A[i];
    // indigo void → teal → gold
    const t1 = smooth(0.03, 0.45, a);
    const t2 = smooth(0.5, 0.95, a);
    let r = 0.03 + (0.1 - 0.03) * t1 + (1.0 - 0.1) * t2;
    let g = 0.02 + (0.72 - 0.02) * t1 + (0.8 - 0.72) * t2;
    let b = 0.09 + (0.68 - 0.09) * t1 + (0.35 - 0.68) * t2;
    const glow = 0.12 * smooth(0.15, 0.6, a);
    r += 0.1 * glow;
    g += 0.72 * glow;
    b += 0.68 * glow;
    const o = i * 4;
    out[o] = Math.min(255, r * 255);
    out[o + 1] = Math.min(255, g * 255);
    out[o + 2] = Math.min(255, b * 255);
    out[o + 3] = 255;
  }
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Design notes"
    >
      <div
        className="max-w-2xl w-full max-h-[85vh] overflow-y-auto rounded-2xl bg-[#0d0b1a] ring-1 ring-white/15 p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold text-white">Design notes</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 rounded-lg text-base font-medium bg-white/10 hover:bg-white/20 text-white/95"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4 text-base text-white/85 leading-relaxed">
          <p>
            <span className="text-white font-medium">The question.</span> What if a
            screen of continuous artificial <em>life</em> — real alien organisms
            self-organizing out of a field — were an instrument you seed and that
            sings back as it lives?
          </p>
          <p>
            <span className="text-white font-medium">Lenia.</span> Lenia (Bert
            Wang-Chak Chan, <em>Lenia — Biology of Artificial Life</em>, 2019)
            generalizes Conway&apos;s Game of Life to continuous state, space and
            time. Each cell holds a real value A ∈ [0,1]. Every step the field is
            convolved with a smooth ring-shaped kernel K (a sum of exponential-bell
            shells), that result U = K∗A is passed through a smooth Gaussian growth
            function G(u) = 2·exp(−(u−μ)²/2σ²) − 1, and integrated:
            A ← clamp(A + dt·G(U), 0, 1). Out of a seeded blob this spontaneously
            grows smooth, gliding, organism-like structures. The mass-conservative
            extension is Flow-Lenia (Plantec, Chan et al., ALIFE / MIT Press 2025,
            arXiv:2212.07906).
          </p>
          <p>
            <span className="text-white font-medium">Phenomenology.</span> Self-
            organizing beings that appear, greet you and dissolve are the
            DMT/entity-encounter register made literal (cf. QRI / Andrés Gómez
            Emilsson on entity phenomenology). You don&apos;t draw them — you feed a
            field and meet what grows.
          </p>
          <p>
            <span className="text-white font-medium">Compute.</span> The field lives
            in two ping-pong GPU storage buffers; a WGSL compute shader does the
            direct ring-kernel convolution + growth each frame. A render pass colours
            it (indigo void → teal → gold by local mass). If there&apos;s no WebGPU,
            the identical model runs on a 128² grid in plain JS to a 2D canvas — the
            badge shows <span className="text-emerald-300">● GPU</span> or{" "}
            <span className="text-amber-300">● CPU fallback</span>.
          </p>
          <p>
            <span className="text-white font-medium">Sound.</span> Cheap global
            summaries (mass, motion, centroid) are read back each frame and mapped to
            a just-intonation additive/FM choir: total mass swells a stacked JI
            drone, growth events ring soft plucked JI bells pitched by creature
            height, turbulence adds a shimmer band. Everything runs through a master
            compressor with voice-stealing so it stays consonant and evolving. On
            load the field auto-seeds 2–3 creatures so it&apos;s alive and sounding
            within a couple of seconds with zero input.
          </p>
          <p>
            <span className="text-white font-medium">Regimes.</span> Orbium, Rotor and
            Colony differ in kernel radius and growth window (μ, σ) — different
            species. They sit near (not exactly on) the razor-edge classic Orbium
            point, tuned a touch wider so a symmetric tap reliably grows into living
            structure rather than dying.
          </p>
          <p>
            <span className="text-white font-medium">Honest limitations.</span> The
            symmetric gaussian taps this instrument uses don&apos;t reproduce the
            clean, endlessly-gliding Orbium (which needs its exact asymmetric seed
            pattern); instead they grow robust, churning, slowly-drifting life. The
            fallback grid is small, so its creatures are chunkier. Stats readback is
            asynchronous (~15 Hz) so audio events lag the visuals by a frame or two.
            No full-frame strobe is used; brightness drifts slowly and the background
            stays dark, so it is flicker-safe.
          </p>
        </div>
      </div>
    </div>
  );
}
