"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1095-plate-modes — "Tap a vibrating plate and watch the exact standing-wave
// (Chladni) nodal figures you're HEARING form in real time — the sound and the
// geometry being literally the same physics."
//
// A real 2D wave-equation FDTD sim runs on the GPU (WebGL2 ping-pong float
// textures, sim.ts). Fixed reflective edges make genuine square-plate standing
// modes; a swept centre driver rings them up one after another so the luminous
// nodal lines continuously reorganize. Each frame the field is read back and
// projected onto the plate's spatial eigenmodes (modes.ts); those modal
// amplitudes drive a bank of resonant voices (audio.ts) — so you literally hear
// the modes whose nodal lines you see. This is a physically-honest Chladni plate,
// not an FFT-of-a-song visualizer.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlateSim, type Impulse } from "./sim";
import { PlateAudio } from "./audio";
import { MODES, makeBasis, projectField, type Basis } from "./modes";

const GRID = 256; // FDTD resolution
const READ = 40; // readback / modal-projection resolution
const SUBSTEPS = 3; // FDTD substeps per animation frame (stability + speed)
const C2 = 0.24; // wave speed² — safely under the 0.5 CFL limit for 2D
const C = Math.sqrt(C2);
const DRIVER_X = 0.42; // off-centre so both odd and even modes get excited
const DRIVER_Y = 0.47;
const DRIVER_R = 0.03;
const DRIVER_AMP = 0.012;
const DISPLAY_F0 = 104; // must match F0 in audio.ts (for the readout only)

type Backend = "pending" | "webgl2" | "unsupported";

export default function PlateModesPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState<Backend>("pending");
  const [running, setRunning] = useState(false);
  const [damping, setDamping] = useState(0.4); // 0 = long ring · 1 = quick settle
  const [readout, setReadout] = useState<{ hz: number; m: number; n: number } | null>(null);

  const runningRef = useRef(false);
  const dampingRef = useRef(damping);
  dampingRef.current = damping;

  const simRef = useRef<PlateSim | null>(null);
  const audioRef = useRef<PlateAudio | null>(null);
  const rafRef = useRef<number>(0);
  const pendingRef = useRef<Impulse[]>([]);
  const basisRef = useRef<Basis | null>(null);
  const ampsRef = useRef<Float32Array>(new Float32Array(MODES.length));
  const fallbackAmpsRef = useRef<Float32Array>(new Float32Array(MODES.length));

  const handleStart = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new PlateAudio();
    try {
      await audioRef.current.start();
      runningRef.current = true;
      setRunning(true);
    } catch {
      /* autoplay blocked — user can tap again */
    }
  }, []);

  const strikeAt = useCallback((nx: number, ny: number, strength: number) => {
    pendingRef.current.push({
      x: nx,
      y: ny,
      r: 0.022,
      amp: 0.45 + strength * 0.35,
    });
    if (pendingRef.current.length > 8) pendingRef.current.shift();
    // audible strike, ringing with the current plate damping
    const decay = 0.25 + (1 - dampingRef.current) * 1.3;
    audioRef.current?.strike(0.5 + strength * 0.5, decay);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1 - (e.clientY - rect.top) / rect.height; // GL uv origin bottom-left
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      if (!runningRef.current) void handleStart();
      strikeAt(nx, ny, 1);
    },
    [handleStart, strikeAt],
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const gl = cv.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setBackend("unsupported");
      return;
    }
    const has32 = gl.getExtension("EXT_color_buffer_float");
    const has16 = gl.getExtension("EXT_color_buffer_half_float");
    if (!has32 && !has16) {
      setBackend("unsupported");
      return;
    }

    let sim: PlateSim;
    try {
      sim = new PlateSim(gl, GRID, READ);
    } catch {
      setBackend("unsupported");
      return;
    }
    simRef.current = sim;
    basisRef.current = makeBasis(READ);
    setBackend("webgl2");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const side = Math.floor(cv.clientWidth * dpr);
      if (side > 0 && (cv.width !== side || cv.height !== side)) {
        cv.width = side;
        cv.height = side;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let driverPhase = 0;
    let envPeak = 1e-4;
    let frame = 0;
    const t0 = performance.now();

    const tick = () => {
      const now = performance.now();
      const t = (now - t0) / 1000;

      // slowly swept driver: target modal radius q wanders through the modes
      let q = 3.3 + 2.4 * Math.sin(t * 0.13) + 0.7 * Math.sin(t * 0.041 + 1.3);
      q = Math.max(1.25, Math.min(6.2, q));
      const driverOmega = C * (Math.PI / GRID) * q; // rad per substep (small-k)

      const damp = 1 - (0.0002 + dampingRef.current * 0.0016);
      const envDecay = 0.992 - dampingRef.current * 0.02;

      for (let s = 0; s < SUBSTEPS; s++) {
        driverPhase += driverOmega;
        const drive = Math.sin(driverPhase) * DRIVER_AMP;
        const impulses = s === 0 ? pendingRef.current : [];
        sim.step({
          c2: C2,
          damp,
          envDecay,
          drive,
          driverX: DRIVER_X,
          driverY: DRIVER_Y,
          driverR: DRIVER_R,
          impulses,
        });
        if (s === 0) pendingRef.current = [];
      }

      // read the SAME field back for audio + visual normalization
      const snap = sim.snapshot();
      let envScale = 8;
      let activity = 0.85;
      const amps = ampsRef.current;
      const basis = basisRef.current;

      if (snap && basis) {
        const meanEnv = snap.meanEnv;
        envPeak = Math.max(envPeak * 0.999, meanEnv);
        envScale = 1 / (meanEnv + 1e-4);
        envScale = Math.max(0.5, Math.min(60, envScale));
        activity = Math.max(0, Math.min(1, meanEnv / (envPeak * 0.5 + 1e-6)));
        projectField(snap.u, basis, amps);
      } else {
        // readback unavailable: drive audio from the swept driver so it never
        // goes silent (the visual still reads the real texture directly).
        const fa = fallbackAmpsRef.current;
        for (let k = 0; k < MODES.length; k++) {
          const d = MODES[k].q - q;
          fa[k] = Math.exp(-(d * d) / (2 * 0.6 * 0.6));
        }
        amps.set(fa);
        activity = 0.8;
      }

      if (runningRef.current) audioRef.current?.update(amps, activity);

      sim.present(cv.width, cv.height, {
        envScale,
        activity,
        brightness: 1.0,
        time: t,
      });

      // low-rate UI readout
      frame++;
      if (frame % 8 === 0) {
        let bi = 0;
        let bv = -1;
        for (let k = 0; k < amps.length; k++) {
          if (amps[k] > bv) {
            bv = amps[k];
            bi = k;
          }
        }
        setReadout({
          hz: Math.round(DISPLAY_F0 * q),
          m: MODES[bi].m,
          n: MODES[bi].n,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      sim.dispose();
      simRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      runningRef.current = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-black text-white/80">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href="/dream"
          className="text-white/60 hover:text-white/90 text-base transition-colors"
        >
          ← dream lab
        </Link>

        <h1 className="mt-4 font-serif text-3xl text-white/95">Plate Modes</h1>
        <p className="mt-2 text-base text-white/80">
          Tap the plate and watch the exact standing-wave (Chladni) nodal lines
          you are hearing form in real time — the sound and the geometry are the
          same vibrating physics.
        </p>

        {backend === "unsupported" ? (
          <p className="mt-6 text-base text-rose-300">
            This piece needs WebGL2 with float render targets, which this browser
            or device does not provide. Try a recent desktop Chrome, Firefox, or
            Safari.
          </p>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-lg bg-violet-600 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-500 active:bg-violet-700"
              >
                {running ? "Strike the plate" : "Start"}
              </button>

              <label className="flex items-center gap-3 text-base text-white/70">
                <span className="whitespace-nowrap">damping</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={damping}
                  onChange={(e) => setDamping(parseFloat(e.target.value))}
                  className="h-1.5 w-36 cursor-pointer accent-violet-500"
                  aria-label="plate damping"
                />
              </label>

              <span className="text-base text-white/60">
                {readout
                  ? `driver ≈ ${readout.hz} Hz · mode (${readout.m},${readout.n})`
                  : "warming up…"}
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-black">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                className="block aspect-square w-full touch-none cursor-crosshair"
              />
            </div>

            <p className="mt-3 text-base text-white/60">
              Tap the plate to strike it — each tap is an impulse. Even untouched,
              the swept driver keeps ringing up new modes, so the luminous sand
              lines reorganize on their own. Cyan-white lines are nodes (where the
              plate is still); the faint amber wash is the antinodes (where it
              swings hardest).
            </p>
          </>
        )}
      </div>
    </main>
  );
}
