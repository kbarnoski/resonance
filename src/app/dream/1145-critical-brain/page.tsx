"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IsingGL, IsingObservables, TC } from "./gl";
import { IsingSynth } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// Temperature sweep range (units of J/kB). Tc ≈ 2.269 sits in the middle so the
// critical bloom is the centre of the journey.
const T_MIN = 1.2;
const T_MAX = 3.6;
const T_START = 1.55; // begin ordered / frozen

// nearness-to-Tc bump (drives the visual bloom + partial bank)
function critOf(t: number): number {
  const w = 0.3;
  return Math.exp(-((t - TC) * (t - TC)) / (2 * w * w));
}
// how far above Tc (drives noise overload)
function heatOf(t: number): number {
  const h = (t - TC) / (T_MAX - TC);
  const c = h < 0 ? 0 : h > 1 ? 1 : h;
  return c * c;
}
function phaseLabel(t: number): { name: string; tone: string } {
  if (t < TC - 0.35) return { name: "ordered · frozen", tone: "text-violet-300/95" };
  if (t <= TC + 0.35) return { name: "CRITICAL · edge of chaos", tone: "text-violet-300" };
  return { name: "overload · hot noise", tone: "text-violet-300" };
}

export default function CriticalBrainPage() {
  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tempUI, setTempUI] = useState(T_START);
  const [obsUI, setObsUI] = useState<IsingObservables>({ mag: 1, order: 1 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<IsingGL | null>(null);
  const synthRef = useRef<IsingSynth | null>(null);
  const rafRef = useRef(0);

  const tempRef = useRef(T_START);
  const obsRef = useRef<IsingObservables>({ mag: 1, order: 1 });
  const lastMagRef = useRef(1);
  const pausedRef = useRef(false);
  const draggingRef = useRef(false);
  const reducedRef = useRef(false);

  // set the temperature (shared by drag + slider)
  const setTemp = useCallback((t: number) => {
    const c = Math.max(T_MIN, Math.min(T_MAX, t));
    tempRef.current = c;
    setTempUI(c);
  }, []);

  // vertical position on the canvas → temperature (top = hot, bottom = cold)
  const tempFromPointer = useCallback((clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    setTemp(T_MAX - frac * (T_MAX - T_MIN));
  }, [setTemp]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      tempFromPointer(e.clientY);
    },
    [tempFromPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) tempFromPointer(e.clientY);
    },
    [tempFromPointer],
  );
  const endDrag = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── mount: build the WebGL engine and run the simulation immediately ────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    reducedRef.current = prefersReducedMotion();

    const gl = IsingGL.create(cv, 256);
    if (!gl) {
      setWebglFailed(true);
      return;
    }
    glRef.current = gl;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      const h = Math.max(1, Math.round(cv.clientHeight * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    const t0 = performance.now();
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (pausedRef.current) return;
      resize();
      const time = (performance.now() - t0) / 1000;
      const temp = tempRef.current;
      const sweeps = reducedRef.current ? 2 : 6;
      gl.step(temp, sweeps);

      // read the order parameter back occasionally (a GPU→CPU stall)
      frame++;
      if (frame % 12 === 0) {
        const obs = gl.measure();
        obsRef.current = obs;
        // a large jump in magnetization = a spin-cluster avalanche
        const dMag = Math.abs(obs.mag - lastMagRef.current);
        lastMagRef.current = obs.mag;
        const crit = critOf(temp);
        if (dMag > 0.012 && crit > 0.3) {
          synthRef.current?.avalanche(Math.min(1, dMag * 18 * crit));
        }
      }

      const crit = critOf(temp);
      const heat = heatOf(temp);
      gl.render(cv.width, cv.height, crit, heat, time);
      synthRef.current?.update({ crit, order: obsRef.current.mag, heat });

      if (frame % 6 === 0) setObsUI(obsRef.current);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      gl.dispose();
      glRef.current = null;
      synthRef.current?.stop();
      synthRef.current = null;
    };
  }, []);

  const handleBegin = useCallback(async () => {
    pausedRef.current = false;
    if (!synthRef.current) synthRef.current = new IsingSynth();
    const ok = await synthRef.current.start();
    if (!ok) setNoAudio(true);
    setStarted(true);
  }, []);

  const handleStop = useCallback(async () => {
    pausedRef.current = true; // freeze motion
    await synthRef.current?.stop();
    synthRef.current = null;
    setStarted(false);
  }, []);

  const handleReset = useCallback(() => {
    glRef.current?.seed(0.5);
    lastMagRef.current = 1;
  }, []);

  const phase = phaseLabel(tempUI);

  return (
    <main className="min-h-screen bg-[#050307] text-foreground">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
              Critical Brain
            </h1>
            <p className="mt-1 max-w-2xl text-base text-muted-foreground">
              A drug-free psychedelic instrument built on a real 2D Ising model.
              Drag a &ldquo;consciousness temperature&rdquo; through the critical
              point Tc&nbsp;&approx;&nbsp;2.269 and feel order melt into the
              edge-of-chaos bloom, then into overload.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <Link
              href="/dream"
              className="rounded-full border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ↑ all prototypes
            </Link>
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-sm text-violet-300 underline-offset-4 hover:underline"
            >
              Read the design notes
            </button>
          </div>
        </header>

        {showNotes && (
          <div className="mb-6 rounded-xl border border-border bg-black/40 p-5 text-base leading-relaxed text-foreground">
            <p className="mb-2">
              The lattice on screen is a genuine{" "}
              <span className="text-violet-300">2D Ising model</span> run as a{" "}
              <span className="text-violet-300">Metropolis Monte-Carlo</span>{" "}
              simulation on the GPU. Each cell is a spin s&nbsp;&isin;&nbsp;
              {"{-1,+1}"}; a flip is accepted with probability{" "}
              <span className="font-mono">min(1, exp(-&Delta;E/T))</span> where{" "}
              <span className="font-mono">&Delta;E = 2&middot;s&middot;&Sigma;</span>
              (neighbours), on a torus. The update is done in a race-free{" "}
              <span className="text-violet-300">checkerboard</span> ping-pong so
              neighbouring spins never change at once — the correct way to
              parallelise Metropolis.
            </p>
            <p className="mb-2 text-muted-foreground">
              At the critical temperature (Onsager&rsquo;s 1944 exact solution:{" "}
              <span className="font-mono">Tc = 2/ln(1+&radic;2) &approx; 2.269</span>)
              the correlation length diverges and scale-free domains of every
              size bloom. Below Tc the lattice freezes into one domain (a stable
              low drone); above Tc it dissolves into hot uncorrelated noise
              (overload). The magnetization, read back from the GPU, drives the
              synth.
            </p>
            <p className="text-muted-foreground">
              This is a metaphor-made-literal for near-critical brain dynamics —
              not a claim that the brain <em>is</em> an Ising model. It nods to
              the Entropic Brain hypothesis (Carhart-Harris), Toker et&nbsp;al.
              2022 <em>PNAS</em> (&ldquo;Consciousness is supported by
              near-critical slow cortical electrodynamics&rdquo;), and the 2026{" "}
              <em>J&nbsp;Neurosci</em> finding that DMT-induced shifts in
              criticality correlate with self-dissolution. Metropolis
              et&nbsp;al. 1953 gave us the algorithm.
            </p>
          </div>
        )}

        {webglFailed ? (
          <div className="rounded-2xl border border-violet-400/30 bg-violet-950/20 p-8 text-center">
            <p className="text-base text-violet-300">
              WebGL2 is unavailable in this browser, so the GPU lattice can&rsquo;t
              run. Try a recent Chrome, Firefox, or Safari with hardware
              acceleration enabled.
            </p>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                className="block h-[62vh] w-full touch-none cursor-ns-resize"
              />
              <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">phase </span>
                <span className={phase.tone}>{phase.name}</span>
              </div>
              <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/60 px-3 py-1.5 font-mono text-sm text-foreground">
                T {tempUI.toFixed(3)} · |M| {obsUI.mag.toFixed(3)}
              </div>
              {!started && (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/60 px-3 py-1.5 text-sm text-muted-foreground">
                  drag up/down on the lattice · press Begin for sound
                </div>
              )}
            </div>

            {/* temperature slider — the primary control, also draggable on canvas */}
            <div className="mt-4 rounded-xl border border-border bg-black/30 p-4">
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="temp"
                  className="text-sm uppercase tracking-widest text-muted-foreground"
                >
                  consciousness temperature
                </label>
                <span className="font-mono text-base text-foreground">
                  T = {tempUI.toFixed(3)}
                </span>
              </div>
              <div className="relative mt-3">
                <input
                  id="temp"
                  type="range"
                  min={T_MIN}
                  max={T_MAX}
                  step={0.001}
                  value={tempUI}
                  onChange={(e) => setTemp(parseFloat(e.target.value))}
                  className="w-full accent-violet-400"
                  aria-label="consciousness temperature"
                />
                {/* Tc marker */}
                <div
                  className="pointer-events-none absolute -top-1 h-4 w-px bg-violet-300"
                  style={{ left: `${((TC - T_MIN) / (T_MAX - T_MIN)) * 100}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-sm text-muted-foreground">
                <span className="text-violet-300/95">cold · ordered</span>
                <span className="text-violet-300">Tc ≈ 2.269</span>
                <span className="text-violet-300">hot · noise</span>
              </div>
            </div>

            {/* transport + observables */}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-black/30 p-4">
                <div className="text-sm uppercase tracking-widest text-muted-foreground">
                  Sound
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!started ? (
                    <button
                      onClick={handleBegin}
                      className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-black transition-colors hover:bg-violet-400"
                    >
                      ▶ Begin
                    </button>
                  ) : (
                    <button
                      onClick={handleStop}
                      className="min-h-[44px] rounded-full border border-violet-400/50 px-6 py-2.5 text-base font-medium text-violet-300 transition-colors hover:bg-violet-500/10"
                    >
                      ■ Stop (audio + motion)
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    ↻ Reseed lattice
                  </button>
                </div>
                {noAudio && (
                  <p className="mt-3 text-base text-violet-300">
                    Web Audio is unavailable — the visuals still run, but there is
                    no sound in this browser.
                  </p>
                )}
                <p className="mt-3 text-sm text-muted-foreground">
                  Headphones recommended. Audio is limited for your ears and only
                  starts on your gesture.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-black/30 p-4">
                <div className="text-sm uppercase tracking-widest text-muted-foreground">
                  Order parameters (read from the GPU)
                </div>
                <div className="mt-2 font-mono text-base text-foreground">
                  |magnetization| {obsUI.mag.toFixed(3)}
                </div>
                <div className="font-mono text-base text-foreground">
                  neighbour agreement {obsUI.order.toFixed(3)}
                </div>
                <p className="mt-3 text-base text-muted-foreground">
                  Drag up to heat the lattice. Watch |M| collapse from ~1
                  (one frozen domain) toward 0 as you cross{" "}
                  <span className="text-violet-300">Tc</span> — the correlation
                  length diverges right at the bloom.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
