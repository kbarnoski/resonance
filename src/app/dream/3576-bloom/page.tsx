"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 3576-bloom — "What if you could strike a real resonant surface and hear it
// ring with genuine NON-LINEAR physics — hit it harder and the pitch glides
// sharp and blooms, energy sloshing between its modes into an evolving shimmer,
// exactly like a real struck plate — while you WATCH the vibration modes draw
// themselves as living Chladni nodal patterns?"
//
// A hands-on physical-modelling instrument. No score, no win/lose. You excite a
// material; it sings back with real acoustic behaviour. Non-linear modal
// synthesis (tension-modulation bloom + mode-coupling shimmer) on a main-thread
// Web Audio oscillator bank; the same live mode energies draw a Chladni figure.
// See modal.ts, chladni.ts, README.md. Refs: nlm arXiv:2603.10240 (2026);
// Chladni (1787); Adrien modal synthesis.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NonLinearModalEngine,
  MATERIALS,
  MATERIAL_ORDER,
  mulberry32,
  type MaterialId,
} from "./modal";
import { makeField, drawChladni, disposeScratch, type ChladniField } from "./chladni";

const F0_MIN = 55;
const F0_MAX = 440;
const DEFAULT_F0 = 110;
const DEFAULT_HARD = 0.6;
const BUF = 200; // Chladni grid resolution
const SEED = 0x3576b100;
// Materials the autopilot cycles through so a hands-off reviewer hears the range.
const DEMO_MATERIALS: MaterialId[] = ["plate", "gong", "membrane"];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// x → fundamental on a musical LOG scale (never quantised to a scale/chord).
const xToF0 = (x: number) => F0_MIN * Math.pow(F0_MAX / F0_MIN, clamp01(x));
// y → strike hardness: top of the surface is hard/bright, bottom is soft.
const yToHard = (y: number) => clamp01(1 - y);

export default function BloomPage() {
  const [started, setStarted] = useState(false);
  const [material, setMaterial] = useState<MaterialId>("plate");
  const [f0UI, setF0UI] = useState(DEFAULT_F0);
  const [hardnessUI, setHardnessUI] = useState(DEFAULT_HARD);
  const [controller, setController] = useState<"auto" | "you">("auto");
  const [notesOpen, setNotesOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  const engineRef = useRef<NonLinearModalEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<ChladniField | null>(null);
  const rafRef = useRef<number | null>(null);
  const randRef = useRef<() => number>(() => 0.5);
  const autoRef = useRef({ active: false, nextAt: 0, matIdx: 0, count: 0 });
  const dragRef = useRef({ down: false, lastStrike: 0 });

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keep the canvas backing store matched to its displayed (square) size.
  const resize = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height) * dpr));
    if (cv.width !== size || cv.height !== size) {
      cv.width = size;
      cv.height = size;
    }
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // The animation + audio-model loop. Held in a ref so it always sees fresh
  // state without re-subscribing rAF (and never trips exhaustive-deps).
  const loopRef = useRef<(tsMs: number) => void>(() => {});
  loopRef.current = (tsMs: number) => {
    const eng = engineRef.current;
    const cv = canvasRef.current;
    const field = fieldRef.current;
    if (!eng || !cv || !field) return;

    const now = eng.ctx.currentTime;

    // ── seeded autopilot: strike on a slow evolving rhythm, cycling material,
    //    pitch and hardness, until the first human interaction takes over.
    const a = autoRef.current;
    if (a.active && now >= a.nextAt) {
      const r = randRef.current;
      a.count++;
      if (a.count % 4 === 0) {
        a.matIdx = (a.matIdx + 1) % DEMO_MATERIALS.length;
        const mid = DEMO_MATERIALS[a.matIdx];
        eng.setMaterial(mid);
        setMaterial(mid);
      }
      const x = 0.12 + 0.76 * r();
      const y = 0.15 + 0.7 * r();
      const f0 = xToF0(x);
      const hard = yToHard(y);
      eng.strike(f0, hard, x, y);
      setF0UI(f0);
      setHardnessUI(hard);
      a.nextAt = now + 0.7 + 1.1 * r();
    }

    eng.step(now);

    const c2 = cv.getContext("2d");
    if (c2) {
      drawChladni(
        c2,
        field,
        eng.energy,
        eng.totalEnergy,
        eng.strikeFlash,
        [eng.strikeX, eng.strikeY],
        tsMs / 1000,
        reduced,
        cv.width,
        cv.height
      );
    }
  };

  const tick = useCallback((ts: number) => {
    loopRef.current(ts);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // AudioContext is created ONLY inside this user-gesture handler.
  const handleStart = useCallback(async () => {
    if (engineRef.current) return;
    const rand = mulberry32(SEED);
    randRef.current = rand;
    const eng = new NonLinearModalEngine(rand, "plate");
    engineRef.current = eng;
    fieldRef.current = makeField(BUF);
    resize();
    await eng.start();
    eng.setFundamental(DEFAULT_F0);
    autoRef.current = {
      active: true,
      nextAt: eng.ctx.currentTime + 0.3,
      matIdx: 0,
      count: 0,
    };
    setMaterial("plate");
    setController("auto");
    setStarted(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [resize, tick]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      disposeScratch();
    };
  }, []);

  const takeOver = useCallback(() => {
    if (autoRef.current.active) {
      autoRef.current.active = false;
      setController("you");
    }
  }, []);

  const strikeFromEvent = useCallback((clientX: number, clientY: number) => {
    const eng = engineRef.current;
    const cv = canvasRef.current;
    if (!eng || !cv) return;
    const rect = cv.getBoundingClientRect();
    const x = clamp01((clientX - rect.left) / rect.width);
    const y = clamp01((clientY - rect.top) / rect.height);
    const f0 = xToF0(x);
    const hard = yToHard(y);
    eng.strike(f0, hard, x, y);
    setF0UI(f0);
    setHardnessUI(hard);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      takeOver();
      dragRef.current.down = true;
      dragRef.current.lastStrike = 0;
      strikeFromEvent(e.clientX, e.clientY);
    },
    [takeOver, strikeFromEvent]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.down) return;
      const eng = engineRef.current;
      if (!eng) return;
      // throttle drag-strikes so scrubbing across the plate stays musical
      const now = eng.ctx.currentTime;
      if (now - dragRef.current.lastStrike < 0.11) return;
      dragRef.current.lastStrike = now;
      strikeFromEvent(e.clientX, e.clientY);
    },
    [strikeFromEvent]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current.down = false;
  }, []);

  const onSelectMaterial = useCallback(
    (id: MaterialId) => {
      takeOver();
      setMaterial(id);
      engineRef.current?.setMaterial(id);
    },
    [takeOver]
  );

  const onF0Slider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      takeOver();
      const v = Number(e.target.value);
      setF0UI(v);
      engineRef.current?.setFundamental(v);
    },
    [takeOver]
  );

  const onHardnessSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      takeOver();
      setHardnessUI(clamp01(Number(e.target.value)));
    },
    [takeOver]
  );

  // Strike at the current slider settings (keyboard/no-pointer friendly).
  const onStrikeButton = useCallback(() => {
    takeOver();
    const eng = engineRef.current;
    if (!eng) return;
    const x = Math.log(f0UI / F0_MIN) / Math.log(F0_MAX / F0_MIN);
    eng.strike(f0UI, hardnessUI, clamp01(x), 1 - hardnessUI);
  }, [takeOver, f0UI, hardnessUI]);

  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Bloom — a struck resonant surface
        </h1>
        <p className="text-base text-muted-foreground">
          Strike a real material and hear it ring with genuine non-linear
          physics: hit harder and the pitch blooms sharp then glides home, energy
          sloshing between its modes into an evolving shimmer — while you watch
          the vibration draw itself as a living Chladni nodal figure.
        </p>
      </header>

      <div className="relative">
        <div className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-md border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none select-none"
            style={{ cursor: started ? "crosshair" : "default" }}
            onPointerDown={started ? onPointerDown : undefined}
            onPointerMove={started ? onPointerMove : undefined}
            onPointerUp={started ? onPointerUp : undefined}
            onPointerLeave={started ? onPointerUp : undefined}
          />

          {/* controller badge */}
          {started && (
            <div className="pointer-events-none absolute left-3 top-3">
              <span className={labelCls}>
                {controller === "auto" ? "AUTO" : "YOU"}
              </span>
            </div>
          )}

          {/* design-notes affordance */}
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="absolute right-3 top-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>

          {/* start overlay */}
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm">
              <p className="max-w-xs px-6 text-center text-base text-muted-foreground">
                Sound on. Press start — a seeded autopilot begins striking the
                surface; your first touch takes over.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start the instrument
              </button>
            </div>
          )}
        </div>
      </div>

      {/* readouts */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Material</span>
          <span className="text-sm text-foreground">
            {MATERIALS[material].label}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Fundamental</span>
          <span className="text-sm text-foreground">{f0UI.toFixed(1)} Hz</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Hardness</span>
          <span className="text-sm text-foreground">
            {Math.round(hardnessUI * 100)}%
          </span>
        </div>
      </div>

      {/* material selector */}
      <div className="flex flex-col gap-2">
        <span className={labelCls}>Surface</span>
        <div className="flex flex-wrap gap-2">
          {MATERIAL_ORDER.map((id) => {
            const active = id === material;
            return (
              <button
                key={id}
                type="button"
                disabled={!started}
                onClick={() => onSelectMaterial(id)}
                className={
                  active
                    ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                    : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                }
              >
                {MATERIALS[id].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* sliders + manual strike */}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className={labelCls}>Fundamental — {f0UI.toFixed(1)} Hz</span>
          <input
            type="range"
            min={F0_MIN}
            max={F0_MAX}
            step={0.5}
            value={f0UI}
            disabled={!started}
            onChange={onF0Slider}
            className="w-full accent-primary disabled:opacity-40"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={labelCls}>
            Hardness — {Math.round(hardnessUI * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={hardnessUI}
            disabled={!started}
            onChange={onHardnessSlider}
            className="w-full accent-primary disabled:opacity-40"
          />
        </label>
        <div>
          <button
            type="button"
            disabled={!started}
            onClick={onStrikeButton}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            Strike at these settings
          </button>
        </div>
      </div>

      <p className="text-base text-muted-foreground">
        On the surface: horizontal position sets the pitch (left low, right high,
        continuous — never snapped to a scale); vertical position sets how hard
        you strike (top = hard and bright, bottom = soft). Drag to scrub. The
        picture is the sound — bright violet filaments are the nodal lines where
        the sand would settle.
      </p>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 flex flex-col gap-3 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if a
                browser surface rang with genuine non-linear acoustics — bloom
                and shimmer — and you could watch its modes as Chladni figures?
              </p>
              <p>
                <span className="text-foreground">Non-linear modal
                synthesis.</span>{" "}
                A struck object rings as a sum of decaying sinusoids (modes). The
                linear model stops there. Here two non-linearities are added: the
                total vibrational energy stiffens the surface, raising every
                mode&apos;s pitch (tension-modulation <em>bloom</em> — a hard hit
                starts sharp then glides home), and energy sloshes between
                neighbouring modes over time (mode-coupling <em>shimmer</em> — the
                timbre evolves as it decays).
              </p>
              <p>
                <span className="text-foreground">Materials.</span> Plate,
                gong/tam-tam, membrane/drum, bar/marimba, and string/piano — each
                a different set of modal ratios, decay spread, bloom depth and
                coupling. The gong blooms and shimmers hardest.
              </p>
              <p>
                <span className="text-foreground">The picture.</span> Each audio
                mode is assigned an (n,m) integer pair; the live mode energies are
                the amplitudes in a Chladni superposition{" "}
                <span className="font-mono text-xs">
                  u = Σ aᵢ·cos(nᵢπx)·cos(mᵢπy)
                </span>
                . Bright filaments are the nodal lines (|u|≈0) where the sand
                settles; they reorganise as the sound blooms and couples.
              </p>
              <p>
                <span className="text-foreground">References.</span> Diaz,
                Constanzo &amp; Sandler, &ldquo;nlm: Real-Time Non-linear Modal
                Synthesis&rdquo; (arXiv:2603.10240, 2026); Jean-Marie Adrien, the
                modal-synthesis formalism; Ernst Chladni, plate figures (1787).
              </p>
              <p>
                <span className="text-foreground">Not yet verified.</span> The
                modal ratios are plausible idealisations, not measured from real
                instruments; the tension-modulation and coupling are param-
                automation approximations of the true PDE (an AudioWorklet /
                per-sample integrator would be more faithful); no formal
                perceptual or spectral validation has been run.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
