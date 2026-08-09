"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createLattice,
  stepLattice,
  mulberry32,
  type Lattice,
  type LatticeInput,
} from "./physics";
import {
  createGlRenderer,
  createCanvas2dRenderer,
  type Renderer,
} from "./render";
import { makeAudioRig, type AudioRig } from "./audio";

const VIEW = 1.125; // must match render.ts view scale
const DEMO_SEED = 0x5000;
const CYCLE = 12; // seconds per melt -> anneal demo arc

type Demo = {
  active: boolean;
  rng: () => number;
  t: number;
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
};

type Pointer = { active: boolean; x: number; y: number; lastX: number; lastY: number };
type Tilt = { enabled: boolean; x: number; y: number };

function smoothstep(e: number): number {
  return e * e * (3 - 2 * e);
}

// Deterministic hands-free demo: presses a drifting point, sustains to melt,
// then releases so the lattice anneals. Seeded — reproducible on every load.
function runDemo(d: Demo, dt: number, aspect: number, out: LatticeInput) {
  d.t += dt;
  if (d.t >= CYCLE) {
    d.t = 0;
    d.sx = d.cx;
    d.sy = d.cy;
    d.tx = (d.rng() * 2 - 1) * aspect * 0.6;
    d.ty = (d.rng() * 2 - 1) * 0.55;
  }
  const e = d.t / CYCLE;
  const k = smoothstep(e);
  const nx = d.sx + (d.tx - d.sx) * k;
  const ny = d.sy + (d.ty - d.sy) * k;
  out.vx = nx - d.cx;
  out.vy = ny - d.cy;
  d.cx = nx;
  d.cy = ny;

  let force = 0;
  if (e < 0.4) force = e / 0.4; // press & melt
  else if (e < 0.6) force = 1; // sustain
  else if (e < 0.8) force = 1 - (e - 0.6) / 0.2; // release
  // e >= 0.8: rest / anneal

  out.pointerActive = force > 0.001;
  out.px = d.cx;
  out.py = d.cy;
  out.force = force;
  out.radius = 0.42;
}

type Phase = "crystalline" | "yielding" | "molten" | "annealing";

export default function AnnealPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latticeRef = useRef<Lattice | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rigRef = useRef<AudioRig | null>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const aspectRef = useRef<number>(1);
  const reducedRef = useRef<boolean>(false);
  const startedRef = useRef<boolean>(false);

  const inputRef = useRef<LatticeInput>({
    pointerActive: false,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    radius: 0.42,
    force: 0,
    tiltX: 0,
    tiltY: 0,
    reduced: false,
  });
  const pointerRef = useRef<Pointer>({ active: false, x: 0, y: 0, lastX: 0, lastY: 0 });
  const tiltRef = useRef<Tilt>({ enabled: false, x: 0, y: 0 });
  const demoRef = useRef<Demo>({
    active: true,
    rng: mulberry32(DEMO_SEED),
    t: 0,
    cx: 0,
    cy: 0,
    sx: 0,
    sy: 0,
    tx: 0,
    ty: 0,
  });
  const prevMeltRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [rendererKind, setRendererKind] = useState<"webgl2" | "canvas2d" | "…">("…");
  const [audioMsg, setAudioMsg] = useState<string | null>(null);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("crystalline");
  const [showNotes, setShowNotes] = useState(false);

  // ── engine bootstrap (mount once) ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = !!reduced;
    inputRef.current.reduced = !!reduced;

    // renderer: WebGL2 preferred, Canvas2D fallback
    let renderer = createGlRenderer(canvas);
    if (renderer) {
      setRendererKind("webgl2");
    } else {
      renderer = createCanvas2dRenderer(canvas);
      setRendererKind("canvas2d");
    }
    rendererRef.current = renderer;

    const grid = reduced ? 24 : 38;

    const rebuild = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const aspect = w / h;
      aspectRef.current = aspect;
      rendererRef.current?.resize(w, h, dpr);
      latticeRef.current = createLattice(grid, grid, aspect, DEMO_SEED);
    };
    rebuild();

    if (typeof DeviceOrientationEvent !== "undefined") setTiltAvailable(true);

    let statusAccum = 0;
    const loop = (now: number) => {
      const L = latticeRef.current;
      const r = rendererRef.current;
      if (!L || !r) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = lastRef.current ? Math.min(0.033, (now - lastRef.current) / 1000) : 0.016;
      lastRef.current = now;

      const inp = inputRef.current;
      const p = pointerRef.current;
      const tilt = tiltRef.current;
      const tiltMag = Math.abs(tilt.x) + Math.abs(tilt.y);
      const userActive = p.active || (tilt.enabled && tiltMag > 0.12);

      if (userActive) demoRef.current.active = false;

      if (demoRef.current.active) {
        runDemo(demoRef.current, dt, aspectRef.current, inp);
        inp.tiltX = 0;
        inp.tiltY = 0;
      } else {
        inp.pointerActive = p.active;
        inp.px = p.x;
        inp.py = p.y;
        inp.force = p.active ? 1 : 0;
        inp.radius = 0.42;
        // pointer velocity (with decay)
        inp.vx = (p.x - p.lastX) * 0.8;
        inp.vy = (p.y - p.lastY) * 0.8;
        p.lastX = p.x;
        p.lastY = p.y;
        inp.tiltX = tilt.enabled ? tilt.x : 0;
        inp.tiltY = tilt.enabled ? tilt.y : 0;
      }
      inp.reduced = reducedRef.current;

      const report = stepLattice(L, dt, inp);

      if (startedRef.current && rigRef.current) {
        rigRef.current.update(report.regionExcite, report.regionMelt, report.avgMelt);
      }
      r.draw(L, now, report.avgMelt);

      // throttled status readout
      statusAccum += dt;
      if (statusAccum > 0.15) {
        statusAccum = 0;
        const m = report.avgMelt;
        const rising = m > prevMeltRef.current + 0.0005;
        prevMeltRef.current = m;
        let next: Phase;
        if (report.maxMelt > 0.12 && rising) next = "yielding";
        else if (m > 0.28) next = "molten";
        else if (m > 0.03) next = "annealing";
        else next = "crystalline";
        setPhase((cur) => (cur === next ? cur : next));
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuild, 150);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      rendererRef.current?.dispose();
      rigRef.current?.dispose();
    };
  }, []);

  // ── pointer handlers ────────────────────────────────────────────────────────
  const toPhysics = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) / rect.width;
    const sy = (clientY - rect.top) / rect.height;
    const aspect = rect.width / rect.height;
    return {
      x: (sx - 0.5) * 2 * (aspect / VIEW),
      y: (0.5 - sy) * 2 * (1 / VIEW),
    };
  }, []);

  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      const { x, y } = toPhysics(ev.clientX, ev.clientY);
      const p = pointerRef.current;
      p.active = true;
      p.x = x;
      p.y = y;
      p.lastX = x;
      p.lastY = y;
      demoRef.current.active = false;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
    },
    [toPhysics],
  );
  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      const p = pointerRef.current;
      if (!p.active) return;
      const { x, y } = toPhysics(ev.clientX, ev.clientY);
      p.x = x;
      p.y = y;
    },
    [toPhysics],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  // ── start audio (user gesture) ──────────────────────────────────────────────
  const onStart = useCallback(async () => {
    if (!startedRef.current) {
      if (!rigRef.current) {
        const rig = makeAudioRig();
        if (!rig) {
          setAudioMsg("Web Audio is unavailable in this browser.");
          setStarted(true);
          startedRef.current = true;
          return;
        }
        rigRef.current = rig;
      }
      await rigRef.current.resume();
      startedRef.current = true;
      setStarted(true);
    }
  }, []);

  // ── enable device tilt (iOS permission-gated) ───────────────────────────────
  const onEnableTilt = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      return;
    }
    const handler = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0; // left-right
      const beta = e.beta ?? 0; // front-back
      const t = tiltRef.current;
      t.x = Math.max(-1, Math.min(1, gamma / 40));
      t.y = Math.max(-1, Math.min(1, (beta - 45) / 40));
    };
    window.addEventListener("deviceorientation", handler);
    tiltRef.current.enabled = true;
    setTiltEnabled(true);
  }, []);

  const phaseLabel: Record<Phase, string> = {
    crystalline: "crystalline lattice",
    yielding: "yielding — melting",
    molten: "molten slush",
    annealing: "annealing — re-crystallising",
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
      />

      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
      >
        Design notes
      </button>

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            5000 · anneal
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">
            Anneal
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A crystal lattice you can melt by touch or tilt — and you hear the
            melting itself: strain excites a modal bell whose timbre tracks the
            material&apos;s stiffness.
          </p>
        </header>

        <section className="pointer-events-auto flex flex-col items-start gap-3">
          {!started ? (
            <button
              type="button"
              onClick={onStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Start sound
            </button>
          ) : (
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {phaseLabel[phase]}
            </p>
          )}

          {audioMsg && (
            <p className="text-base text-destructive">{audioMsg}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {tiltAvailable && !tiltEnabled && (
              <button
                type="button"
                onClick={onEnableTilt}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Enable tilt
              </button>
            )}
            {tiltEnabled && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                tilt live
              </span>
            )}
          </div>

          <p className="max-w-xl text-base text-muted-foreground">
            {started
              ? "Press and drag on the lattice to melt it; release to let it anneal. On a phone, tilt to pour force across the crystal."
              : "It is already melting and re-crystallising on its own — press Start to hear it, then take over with a touch."}
          </p>
        </section>

        <footer className="pointer-events-auto flex items-center gap-4">
          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
          >
            ← gallery
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            render: {rendererKind}
          </span>
        </footer>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">The question:</span> what if a
              solid could melt as you play it — and you heard the melting itself?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              A mass-spring crystal lattice fills the screen. Sustained force
              (pointer or phone tilt) pushes spring strain past a yield point;
              local stiffness collapses, the grid slumps into liquid slush, then
              re-stiffens (anneals) toward crystal when you release.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Physics-based sonification:</span>{" "}
              the whole screen is one struck bell whose six modes map to six
              lattice regions. Per-region strain-energy rate strikes each mode;
              per-region melt reshapes it — a hard crystal rings bright, high-Q
              and bell-like, while a melting region detunes, damps, and smears
              into a soft watery wash.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Reference:</span> BioSonix —
              Physics-Based Sonification of Tissue Deformations (arXiv:2508.14688,
              2026). There, tissue displacement drives a modal sound model
              encoding stiffness for surgery. Here the same idea is inverted into
              a drug-free visionary instrument: the deformation is the composer.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Safety:</span> slow luminance
              drift only — no strobe or flicker. Honours reduced-motion with a
              gentler slump and fewer points.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href="/dream/5000-anneal/README.md"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
              >
                README.md
              </a>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="ml-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
