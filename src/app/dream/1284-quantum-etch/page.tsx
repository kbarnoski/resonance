"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { createField, runSelfCheck, type QuantumField, type Tool } from "./schrodinger";
import { createRenderer, type Renderer } from "./render";
import { startAudio, BAND_COUNT, type AudioEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1284 · QUANTUM ETCH
 *
 * What if quantum probability drew itself as a living topographic ETCHING —
 * animated iso-contour lines of |ψ|² and glowing nodal curves — that you sculpt
 * with walls and wells, fire a packet through, and watch tunnel and settle into
 * shimmering scar-line figures, each a chord? The 2D time-dependent Schrödinger
 * equation is solved by the split-step Fourier method (unitary), and every frame
 * marching-squares turns |ψ|² into nested contour rings drawn as copper/bone
 * lines on ink — the line-drawing sibling of a filled quantum-ripple field.
 */

const PRESETS = [
  { id: "double-slit", label: "double-slit" },
  { id: "stadium", label: "stadium" },
  { id: "lattice", label: "lattice" },
  { id: "harmonic", label: "harmonic" },
] as const;

export default function QuantumEtchPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fieldRef = useRef<QuantumField | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef(false);
  const bandsRef = useRef<Float32Array>(new Float32Array(BAND_COUNT));

  const toolRef = useRef<Tool>("inject");
  const draggingRef = useRef(false);
  const lastWallRef = useRef(0);

  const [tool, setTool] = useState<Tool>("inject");
  const [audioOn, setAudioOn] = useState(false);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [normPct, setNormPct] = useState(0);

  // Keep the tool ref in sync so pointer handlers see the latest without rebinding.
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // ── Build the field + renderer, run the sim loop (audio joins on Begin) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNoCanvas(true);
      return;
    }

    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;
    const N = reduced ? 64 : 128;
    const dt = 0.35;
    const substeps = reduced ? 1 : 2;
    const levelCount = reduced ? 6 : 9;

    // One-time console self-check on the canonical 128 grid (norm conservation
    // + finiteness) — validates the unitary integrator regardless of render grid.
    try {
      runSelfCheck(128, dt);
    } catch {
      /* non-fatal */
    }

    const field = createField(N, dt);
    fieldRef.current = field;
    const renderer = createRenderer(ctx, field, levelCount);
    rendererRef.current = renderer;

    // A first demonstrating scene: double-slit + a packet firing through it.
    field.presetDoubleSlit();
    field.injectPacket(0.22, 0.5, 0.9, 0, N * 0.05, 1.3);

    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      renderer.setSize(rect.width, rect.height, dpr);
    };
    applySize();

    let audioTick = 0;
    let normTick = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const f = fieldRef.current;
      const r = rendererRef.current;
      if (!f || !r) return;

      f.step(substeps);
      const maxProb = f.computeProb();
      r.draw(maxProb);

      // Wall-strike → mallet (rising edge of probability sitting in a wall).
      const wall = f.wallContact();
      if (audioRef.current && wall > 0.015 && wall > lastWallRef.current + 0.006) {
        audioRef.current.mallet(Math.min(1, wall * 8));
      }
      lastWallRef.current = wall;

      // Throttled audio spectrum push.
      audioTick++;
      if (audioRef.current && audioTick >= 3) {
        audioTick = 0;
        f.radialSpectrum(bandsRef.current);
        const presence = Math.min(1, f.norm() / 300);
        audioRef.current.setSpectrum(bandsRef.current, presence);
      }

      normTick++;
      if (normTick >= 8) {
        normTick = 0;
        setNormPct(Math.min(999, Math.round(f.norm())));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(applySize);
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      fieldRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // ── Audio teardown on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const engine = await startAudio();
      audioRef.current = engine;
      setAudioOn(true);
    } catch {
      setAudioOn(false);
    }
  }, []);

  // ── Pointer: inject fires a packet; wall/well paint the potential ──
  const injectAt = useCallback((cssX: number, cssY: number) => {
    const f = fieldRef.current;
    const r = rendererRef.current;
    if (!f || !r) return;
    const [nx, ny] = r.toNorm(cssX, cssY);
    // Momentum aims from the tap toward the field centre so edge taps fire
    // inward (tap left of a barrier → a packet that heads through the slits).
    let dx = 0.5 - nx;
    let dy = 0.5 - ny;
    const len = Math.hypot(dx, dy);
    if (len < 0.08) {
      dx = 1;
      dy = 0;
    } else {
      dx /= len;
      dy /= len;
    }
    const k0 = 0.95;
    f.injectPacket(nx, ny, dx * k0, dy * k0, f.N * 0.05, 1.3);
  }, []);

  const paintAt = useCallback((cssX: number, cssY: number) => {
    const f = fieldRef.current;
    const r = rendererRef.current;
    if (!f || !r) return;
    const [nx, ny] = r.toNorm(cssX, cssY);
    const sign = toolRef.current === "well" ? -1 : 1;
    f.paintPotential(nx, ny, sign, f.N * 0.035, 1.1);
  }, []);

  const localXY = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const [x, y] = localXY(e);
      if (toolRef.current === "inject") injectAt(x, y);
      else paintAt(x, y);
    },
    [injectAt, paintAt],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      if (toolRef.current === "inject") return;
      const [x, y] = localXY(e);
      paintAt(x, y);
    },
    [paintAt],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  const runPreset = useCallback((id: (typeof PRESETS)[number]["id"]) => {
    const f = fieldRef.current;
    if (!f) return;
    f.clearWave();
    if (id === "double-slit") {
      f.presetDoubleSlit();
      f.injectPacket(0.22, 0.5, 0.95, 0, f.N * 0.05, 1.3);
    } else if (id === "stadium") {
      f.presetStadium();
      f.injectPacket(0.5, 0.5, 0.7, 0.35, f.N * 0.05, 1.3);
    } else if (id === "lattice") {
      f.presetLattice();
      f.injectPacket(0.3, 0.3, 0.6, 0.6, f.N * 0.05, 1.3);
    } else {
      f.presetHarmonic();
      f.injectPacket(0.62, 0.5, 0, 0, f.N * 0.07, 1.3);
    }
  }, []);

  const clearAll = useCallback(() => {
    fieldRef.current?.clear();
    lastWallRef.current = 0;
  }, []);

  const toolBtn = (id: Tool, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      title={hint}
      className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
        tool === id
          ? "bg-violet-300/20 text-violet-200 ring-violet-300/40"
          : "text-muted-foreground ring-border hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#0a0807]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl font-bold text-foreground">Quantum Etch</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:text-foreground"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-muted-foreground transition hover:text-foreground"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-muted-foreground">
          Quantum probability drawn as a living topographic etching — animated
          iso-contour lines of |ψ|² with bright nodal curves — that you sculpt with
          walls and wells, then fire a wave-packet through to watch it tunnel,
          interfere, and settle into shimmering scar-line figures.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-muted-foreground ring-1 ring-border backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-foreground">The question:</strong> what if quantum
            probability drew <em>itself</em> as a copper ETCHING — a topographic map
            of |ψ|² whose contour lines ripple, split, and re-form as the wave moves?
          </p>
          <p className="mb-2">
            <strong className="text-foreground">The physics:</strong> the 2D
            time-dependent Schrödinger equation is integrated by the{" "}
            <span className="text-violet-200">split-step Fourier method</span> — a
            half potential kick, a kinetic drift done in Fourier space (via a
            hand-written radix-2 FFT), then another half kick. Each factor is a pure
            phase, so the scheme is <em>unitary</em> and conserves ∑|ψ|² (checked in
            the console on load). A raised-cosine border quietly absorbs whatever
            reaches the edge.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Why lines, not a filled field:</strong>{" "}
            each frame marching-squares extracts ~9 log-spaced iso levels of |ψ|² and
            strokes them as nested rings, and the nodal set Re(ψ)=0 is drawn as a
            finer bright curve. Those moving nodal lines <em>are</em> the interference
            pattern made legible — the double-slit fringes read as a clean fan of
            them, which a glowing fill would blur.
          </p>
          <p className="mb-2">
            <strong className="text-foreground">Played:</strong> pick Inject / Wall /
            Well. Tap with Inject to fire a momentum-aimed Gaussian packet; drag with
            Wall or Well to paint the potential. Four presets — double-slit, the
            Bunimovich stadium (scars), a well lattice, a harmonic trap — plus Clear.
            The sound is the wave&apos;s own radial k-spectrum binned onto a
            just-intonation partial bank: a locked scar is a stable chord, a spreading
            packet a wider, brighter cluster; a mallet pings when it strikes a wall.
          </p>
          <p className="text-muted-foreground">
            Refs: Schrödinger, <em>Ann. Phyik</em> (1926); Feit, Fleck &amp; Steiger,{" "}
            <em>J. Comput. Phys.</em> 47 (1982) — split-step Fourier propagation;
            E. J. Heller, &ldquo;Bound-state eigenfunctions of classically chaotic
            systems: scars,&rdquo; <em>Phys. Rev. Lett.</em> 53 (1984). Not verified on
            real hardware/ears.
          </p>
        </div>
      )}

      <div ref={wrapRef} className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        {noCanvas && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
            <p className="max-w-md text-center text-base text-violet-300">
              Canvas 2D is unavailable in this browser, so the quantum etching
              can&apos;t be drawn. The audio engine and physics still require a canvas
              to interact with — try a current desktop browser.
            </p>
          </div>
        )}

        {/* Live readout */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-foreground ring-1 ring-border backdrop-blur-sm">
          <div className="text-violet-200">∑|ψ|² ≈ {normPct}</div>
          <div className="text-muted-foreground">
            {tool === "inject" ? "tap = fire a packet" : `drag = paint ${tool}`}
          </div>
        </div>

        {/* Tool toggle */}
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 gap-2">
          {toolBtn("inject", "Inject", "Tap to fire a wave-packet")}
          {toolBtn("wall", "Wall +", "Drag to paint a barrier")}
          {toolBtn("well", "Well −", "Drag to paint a well")}
        </div>

        {/* Presets + Clear */}
        <div className="absolute bottom-24 left-1/2 z-10 flex max-w-full -translate-x-1/2 flex-wrap justify-center gap-2 px-4">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => runPreset(p.id)}
              className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base text-violet-300/90 ring-1 ring-violet-400/25 transition hover:bg-violet-400/10"
          >
            clear
          </button>
        </div>

        {/* Begin (audio gate) */}
        {!audioOn && !noCanvas && (
          <div className="absolute inset-x-0 bottom-4 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-violet-200/40 transition hover:bg-violet-200"
            >
              ▶ Begin — sound the wavefunction
            </button>
            <p className="text-base text-muted-foreground">
              The etching is already alive and silent — Begin lets the wave&apos;s own
              spectrum sing.
            </p>
          </div>
        )}

        {audioOn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-muted-foreground">
              Fire packets, paint walls, try a preset — the chord follows the wave.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
