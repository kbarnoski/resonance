"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  joints,
  seededStart,
  step,
  PIVOT_X,
  PIVOT_Y,
  type State,
} from "./physics";
import { BAND_COUNT, createAudio, type AudioEngine } from "./audio";
import {
  createCanvas2DRenderer,
  createWebGL2Renderer,
  type Renderer,
} from "./gl";

const CENTER: [number, number] = [0, 0.16];
const K = 1.7; // plot zoom
const X_MIN = -0.52;
const X_MAX = 0.52;
const SIM_SUBSTEPS = 12;
const TIME_SCALE = 0.6;

interface Telemetry {
  band: number;
  divergence: number;
  voices: number;
}

export default function Butterfly() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);

  const mainRef = useRef<State>([2.2, 0, 2.2, 0]);
  const twinRef = useRef<State>([2.201, 0, 2.2, 0]);
  const prevMainTip = useRef<[number, number]>([0, 0]);
  const prevTwinTip = useRef<[number, number]>([0, 0]);
  const prevBand = useRef<number>(-1);
  const draggingRef = useRef(false);
  const reducedRef = useRef(false);
  const scaleRef = useRef<[number, number]>([K, K]);
  const frameCount = useRef(0);

  const [running, setRunning] = useState(false);
  const [glMode, setGlMode] = useState<"webgl2" | "canvas2d" | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tele, setTele] = useState<Telemetry>({
    band: 0,
    divergence: 0,
    voices: 0,
  });

  // --- sizing + reduced-motion (runs once) ---
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = () => (reducedRef.current = mq.matches);
    mq.addEventListener("change", onMq);

    const applyScale = () => {
      const c = canvasRef.current;
      if (!c) return;
      const aspect = c.width / c.height;
      scaleRef.current =
        aspect > 1 ? [(K * c.height) / c.width, K] : [K, (K * c.width) / c.height];
    };

    const onResize = () => {
      const c = canvasRef.current;
      const r = rendererRef.current;
      if (!c || !r) return;
      const rect = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      r.resize(rect.width, rect.height, dpr);
      applyScale();
    };
    window.addEventListener("resize", onResize);

    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // --- pointer -> world angle ---
  const pointerToState = useCallback((clientX: number, clientY: number): State => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const clipX = nx * 2 - 1;
    const clipY = (1 - ny) * 2 - 1;
    const [sx, sy] = scaleRef.current;
    const wx = clipX / sx + CENTER[0];
    const wy = clipY / sy + CENTER[1];
    const dx = wx - PIVOT_X;
    const dy = wy - PIVOT_Y;
    const theta = Math.atan2(dx, -dy); // from downward vertical
    return [theta, 0, theta, 0];
  }, []);

  const relaunch = useCallback((s: State) => {
    mainRef.current = [s[0], 0, s[2], 0];
    twinRef.current = [s[0] + 0.001, 0, s[2], 0];
    const jm = joints(mainRef.current);
    prevMainTip.current = [jm.x2, jm.y2];
    prevTwinTip.current = [jm.x2, jm.y2];
    prevBand.current = -1;
  }, []);

  // --- main loop ---
  const loop = useCallback(() => {
    const r = rendererRef.current;
    const audio = audioRef.current;
    const c = canvasRef.current;
    if (!r || !c) return;
    const reduced = reducedRef.current;

    if (!draggingRef.current) {
      const dt = (TIME_SCALE / 60 / SIM_SUBSTEPS) * (reduced ? 0.7 : 1);
      let m = mainRef.current;
      let t = twinRef.current;
      for (let i = 0; i < SIM_SUBSTEPS; i++) {
        m = step(m, dt);
        t = step(t, dt);
        // note events off the main tip crossing vertical pitch bands
        const jm = joints(m);
        const frac = (jm.x2 - X_MIN) / (X_MAX - X_MIN);
        const band = Math.max(0, Math.min(BAND_COUNT - 1, Math.floor(frac * BAND_COUNT)));
        if (band !== prevBand.current && prevBand.current !== -1 && audio) {
          const speed = Math.abs(m[1]) + Math.abs(m[3]);
          audio.note({
            band,
            gain: Math.min(1, speed / 22),
            pan: Math.max(-1, Math.min(1, jm.x2 / 0.52)),
            bright: Math.max(0, Math.min(1, (jm.y2 + 0.18) / 1.0)),
          });
        }
        prevBand.current = band;
      }
      mainRef.current = m;
      twinRef.current = t;
    }

    const jm = joints(mainRef.current);
    const jt = joints(twinRef.current);
    const mainB: [number, number] = [jm.x2, jm.y2];
    const twinB: [number, number] = [jt.x2, jt.y2];

    r.frame({
      center: CENTER,
      scale: scaleRef.current,
      mainA: prevMainTip.current,
      mainB,
      twinA: prevTwinTip.current,
      twinB,
      mainJoints: jm,
      twinJoints: jt,
      reduced,
    });

    prevMainTip.current = mainB;
    prevTwinTip.current = twinB;

    // throttle HUD updates so we don't re-render React at 60fps
    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      const dvg = Math.hypot(mainB[0] - twinB[0], mainB[1] - twinB[1]);
      setTele({
        band: prevBand.current,
        divergence: dvg,
        voices: audio ? audio.activeVoices() : 0,
      });
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const handleStart = useCallback(() => {
    if (running) return;
    const c = canvasRef.current;
    if (!c) return;

    let renderer = createWebGL2Renderer(c);
    if (!renderer) renderer = createCanvas2DRenderer(c);
    rendererRef.current = renderer;
    setGlMode(renderer.kind);

    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(rect.width, rect.height, dpr);
    const aspect = c.width / c.height;
    scaleRef.current =
      aspect > 1 ? [(K * c.height) / c.width, K] : [K, (K * c.width) / c.height];

    audioRef.current = createAudio();

    // self-demo: deterministic seeded launch
    relaunch(seededStart(0x1848b));
    setRunning(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [running, loop, relaunch]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  // --- drag handlers ---
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!running) return;
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      const s = pointerToState(e.clientX, e.clientY);
      mainRef.current = s;
      twinRef.current = [s[0] + 0.001, 0, s[2], 0];
    },
    [running, pointerToState],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const s = pointerToState(e.clientX, e.clientY);
      mainRef.current = s;
      twinRef.current = [s[0] + 0.001, 0, s[2], 0];
    },
    [pointerToState],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const s = pointerToState(e.clientX, e.clientY);
      relaunch(s);
    },
    [pointerToState, relaunch],
  );

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: running ? "crosshair" : "default" }}
      />

      {/* hero / intro overlay */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-lg border border-border bg-background/80 p-8 text-center shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Deterministic chaos · double pendulum
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              1848 · Butterfly
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              A music box driven by a chaotic double pendulum. Nudge the start
              by a hair and the whole song changes — deterministic, never
              repeating. A faint twin launches 0.001 rad away and visibly
              diverges.
            </p>
            <button
              onClick={handleStart}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the pendulum
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Then drag on the field to set new initial angles and release.
            </p>
          </div>
        </div>
      )}

      {/* live HUD */}
      {running && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            drag to relaunch
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            band {String(tele.band).padStart(2, "0")} / {BAND_COUNT} · voices{" "}
            {tele.voices}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            twin divergence {tele.divergence.toFixed(4)}
          </p>
          {glMode === "canvas2d" && (
            <p className="font-mono text-xs text-destructive">
              WebGL2 unavailable — Canvas2D trail fallback
            </p>
          )}
        </div>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if a
                piece of music were the trajectory of a chaotic physical system —
                so a hair-thin change in the start yields a completely different
                song, yet it is fully deterministic and never repeats?
              </p>
              <p>
                A real <span className="text-foreground">double pendulum</span>{" "}
                (two coupled rods under gravity) is integrated with 4th-order
                Runge–Kutta. As the tip crosses vertical pitch-band gridlines it
                fires notes on a pentatonic scale; angular velocity sets
                dynamics, the second bob&apos;s position sets pan and timbre.
                The motion never loops, so minute five differs from second five.
              </p>
              <p>
                The double pendulum is a canonical chaotic system. Edward
                Lorenz&apos;s <span className="text-foreground">butterfly
                effect</span> named sensitive dependence on initial conditions;
                Henri <span className="text-foreground">Poincaré</span> first
                saw that fully deterministic systems can be practically
                unpredictable. The faint twin pendulum, launched 0.001 rad
                away, makes that divergence visible and audible.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1848-butterfly"]} />
    </main>
  );
}
