"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Swarmalator, classifyState, type OrderParams } from "./swarmalator";
import { ChoirAudio, PHASE_BINS } from "./audio";
import { NOTES } from "./readme";

type StateName = ReturnType<typeof classifyState>;

// Presets that drop the swarm near each canonical regime. (A,B fixed at 1.)
const PRESETS: { name: string; J: number; K: number; label: string }[] = [
  { name: "static sync", J: 0.1, K: 1.0, label: "Static sync" },
  { name: "static async", J: 0.1, K: -0.7, label: "Static async" },
  { name: "static phase wave", J: 1.0, K: 0.0, label: "Static phase wave" },
  { name: "splintered phase wave", J: 1.0, K: -0.1, label: "Splintered" },
  { name: "active phase wave", J: 1.0, K: -0.6, label: "Active wave" },
];

const N = 420;

export default function SwarmChoirPage() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [J, setJ] = useState(1.0);
  const [K, setK] = useState(-0.6);
  const [stateName, setStateName] = useState<StateName>("active phase wave");
  const [order, setOrder] = useState<OrderParams>({
    Splus: 0, Sminus: 0, R: 0, R2: 0, meanTheta: 0, meanSpeed: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Swarmalator | null>(null);
  const audioRef = useRef<ChoirAudio | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const paramRef = useRef({ J, K });
  const reducedRef = useRef(false);
  const draggingRef = useRef(false);
  const uiTickRef = useRef(0);

  // Keep the live param ref in sync with slider state (read inside the rAF loop).
  useEffect(() => {
    paramRef.current = { J, K };
  }, [J, K]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 480;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }, []);

  // Render a single frame of the swarm onto the canvas.
  const drawFrame = useCallback((o: OrderParams) => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    if (!canvas || !sim) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Deep-slate ground (NOT cosmic-glow-on-black jewel palette).
    ctx.fillStyle = "#0d1017";
    ctx.fillRect(0, 0, W, H);

    // World [-2,2] → screen, keep aspect square & centred.
    const scale = Math.min(W, H) / 4.2;
    const cx = W / 2, cy = H / 2;
    const rad = Math.max(1.4, 2.2 * dpr);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < sim.N; i++) {
      const sx = cx + sim.x[i] * scale;
      const sy = cy + sim.y[i] * scale;
      const hue = (sim.theta[i] / (Math.PI * 2)) * 360;
      // Spectral phase wheel — saturated, mid-light so hue reads on slate.
      ctx.fillStyle = `hsl(${hue}, 85%, 62%)`;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // A faint coherence ring in the corner — space-order made legible.
    const ringR = 26 * dpr;
    const ox = 20 * dpr + ringR, oy = H - 20 * dpr - ringR;
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.arc(ox, oy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Mean-phase hand, length = phase coherence R.
    ctx.strokeStyle = `hsl(${(o.meanTheta / (Math.PI * 2)) * 360 + 180}, 80%, 65%)`;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(
      ox + Math.cos(o.meanTheta) * ringR * o.R,
      oy + Math.sin(o.meanTheta) * ringR * o.R,
    );
    ctx.stroke();
  }, []);

  // Initialise sim + draw the very first frame immediately on mount.
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sim = new Swarmalator(N, false);
    simRef.current = sim;
    resize();
    const o = sim.step({ J: paramRef.current.J, K: paramRef.current.K, A: 1, B: 1 }, 0.0001);
    drawFrame(o);
    const onResize = () => {
      resize();
      if (simRef.current) drawFrame(order);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize, drawFrame]);

  // The animation + audio loop. Runs once started.
  useEffect(() => {
    if (!started) return;
    let alive = true;
    const binCounts = new Array(PHASE_BINS).fill(0);
    const binAng = new Array(PHASE_BINS).fill(0);
    const binPh = new Array(PHASE_BINS).fill(0);

    const loop = () => {
      if (!alive) return;
      const sim = simRef.current;
      if (!sim) return;
      const p = { J: paramRef.current.J, K: paramRef.current.K, A: 1, B: 1 };
      // A few small Euler substeps per frame for stability; damp if reduced motion.
      const substeps = reducedRef.current ? 1 : 3;
      const dt = reducedRef.current ? 0.006 : 0.014;
      let o: OrderParams = order;
      for (let s = 0; s < substeps; s++) o = sim.step(p, dt);
      // Pointer strength decays so a flick "stirs" then releases.
      if (sim.pointer.strength > 0) {
        sim.pointer.strength *= 0.94;
        if (sim.pointer.strength < 0.02) sim.pointer.strength = 0;
      }
      drawFrame(o);

      // Bin the phase circle for the choir (circular means per bin).
      for (let b = 0; b < PHASE_BINS; b++) { binCounts[b] = 0; binAng[b] = 0; binPh[b] = 0; }
      const angC = new Float32Array(PHASE_BINS);
      const angS = new Float32Array(PHASE_BINS);
      const phC = new Float32Array(PHASE_BINS);
      const phS = new Float32Array(PHASE_BINS);
      for (let i = 0; i < sim.N; i++) {
        const th = sim.theta[i];
        const b = Math.min(PHASE_BINS - 1, Math.floor((th / (Math.PI * 2)) * PHASE_BINS));
        binCounts[b]++;
        phC[b] += Math.cos(th); phS[b] += Math.sin(th);
        const phi = Math.atan2(sim.y[i], sim.x[i]);
        angC[b] += Math.cos(phi); angS[b] += Math.sin(phi);
      }
      for (let b = 0; b < PHASE_BINS; b++) {
        binPh[b] = Math.atan2(phS[b], phC[b]);
        if (binPh[b] < 0) binPh[b] += Math.PI * 2;
        binAng[b] = Math.atan2(angS[b], angC[b]);
      }
      audioRef.current?.update(binCounts, binAng, binPh, o);

      // Throttle React state updates (~6/s) — the canvas already carries motion.
      uiTickRef.current++;
      if (uiTickRef.current % 10 === 0) {
        setOrder(o);
        setStateName(classifyState(o));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, drawFrame]);

  const begin = useCallback(async () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      const audio = new ChoirAudio(ctx);
      audio.start();
      audioCtxRef.current = ctx;
      audioRef.current = audio;
    } catch (e) {
      // Keep visuals alive even if audio is unavailable (e.g. headless).
      setAudioError(
        e instanceof Error ? e.message : "Audio unavailable — visuals continue.",
      );
    }
    setStarted(true);
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  // Pointer → attractor/repulsor + (optionally) map x→K, y→J while dragging.
  const pointerToWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;   // 0..1
    const ny = (e.clientY - rect.top) / rect.height;   // 0..1
    const scaleMin = Math.min(rect.width, rect.height);
    const wx = ((e.clientX - rect.left) - rect.width / 2) / (scaleMin / 4.2);
    const wy = ((e.clientY - rect.top) - rect.height / 2) / (scaleMin / 4.2);
    return { nx, ny, wx, wy };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { wx, wy } = pointerToWorld(e);
    const sim = simRef.current;
    if (sim) {
      sim.pointer.x = wx;
      sim.pointer.y = wy;
      // Right button / shift = repulsor, else attractor.
      sim.pointer.sign = e.shiftKey || e.button === 2 ? -1 : 1;
      sim.pointer.active = true;
      sim.pointer.strength = 1;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const { nx, ny, wx, wy } = pointerToWorld(e);
    const sim = simRef.current;
    if (sim) {
      sim.pointer.x = wx;
      sim.pointer.y = wy;
      sim.pointer.strength = 1;
    }
    // Map pointer across the field to the two governing knobs.
    const newK = Math.round((nx * 2 - 1) * 100) / 100;      // left −1 → right +1
    const newJ = Math.round((1 - ny) * 100) / 100;          // bottom 0 → top 1
    setK(Math.max(-1, Math.min(1, newK)));
    setJ(Math.max(0, Math.min(1.2, newJ)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    const sim = simRef.current;
    if (sim) sim.pointer.active = false;
  };

  const onDoubleTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { wx, wy } = pointerToWorld(e);
    simRef.current?.burst(wx, wy, 60);
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setJ(p.J);
    setK(p.K);
  };

  const S = Math.max(order.Splus, order.Sminus);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0d1017] text-foreground">
      {/* Canvas fills the viewport behind the controls. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleTap}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Swarm Choir
        </h1>
        <p className="mt-1 max-w-md font-mono text-base text-muted-foreground">
          a swarmalator: every dot is a position <span className="text-foreground">and</span> a phase
        </p>
      </div>

      {/* Begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#0d1017]/70 backdrop-blur-sm">
          <p className="max-w-lg px-6 text-center text-base text-muted-foreground">
            Space and phase steer each other. Drag across the field to stir the swarm and
            move the two coupling knobs — J (phase↔space) and K (sync). Double-tap to spawn a burst.
          </p>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-card px-6 py-2.5 text-base font-semibold text-[#0d1017] transition hover:bg-accent"
          >
            Begin
          </button>
          {audioError && (
            <p className="px-6 text-center text-base text-violet-300">{audioError}</p>
          )}
        </div>
      )}

      {/* Controls (bottom) */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-4 sm:p-5">
          {audioError && (
            <p className="text-base text-violet-300">{audioError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p)}
                className={`min-h-[44px] rounded-lg px-4 py-2.5 font-mono text-base transition ${
                  stateName === p.name
                    ? "bg-card text-[#0d1017]"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-black/30 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-6">
            <label className="flex flex-1 items-center gap-3 text-base text-foreground">
              <span className="w-24 font-mono">K sync {K.toFixed(2)}</span>
              <input
                type="range" min={-1} max={1} step={0.01} value={K}
                onChange={(e) => setK(parseFloat(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-violet-400"
              />
            </label>
            <label className="flex flex-1 items-center gap-3 text-base text-foreground">
              <span className="w-24 font-mono">J space {J.toFixed(2)}</span>
              <input
                type="range" min={0} max={1.2} step={0.01} value={J}
                onChange={(e) => setJ(parseFloat(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-violet-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-base text-muted-foreground">
            <span className="text-foreground">{stateName}</span>
            <span>R {order.R.toFixed(2)}</span>
            <span>S {S.toFixed(2)}</span>
            <span>spin {order.meanSpeed.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Design notes toggle */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-[#0d1017]/95 p-6 sm:p-10">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                Close
              </button>
            </div>
            <div className="mt-6 space-y-6">
              {NOTES.map((n) => (
                <section key={n.title}>
                  <h3 className="font-mono text-base font-semibold text-foreground">{n.title}</h3>
                  {n.body.map((line, i) => (
                    <p key={i} className="mt-2 text-base leading-relaxed text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </section>
              ))}
              <p className="pt-2 text-base text-muted-foreground">
                <Link href="/dream" className="underline hover:text-foreground">
                  ← back to the dream lab
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
