"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhaseSociety, mulberry32, type SocietyParams } from "./kuramoto";
import { FieldRenderer } from "./gl";
import { SocietyVoices } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

const MAX_COUPLING = 3.4;
const IDLE_MS = 3500;

type Regime = "Consensus" | "Contested" | "Fractured" | "Breaking" | "Coalescing";

function regimeOf(r: number, lock: number): Regime {
  if (r > 0.72) return "Consensus";
  if (r < 0.34) return "Fractured";
  // in the contested band the hysteretic memory decides the flavour
  if (lock > 0.55) return "Breaking"; // memory still locked, field falling apart
  if (lock < 0.25) return "Coalescing"; // memory still loose, field pulling together
  return "Contested";
}

export default function PhaseSocietyPage() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [hud, setHud] = useState({
    r: 0,
    rA: 0,
    rB: 0,
    lock: 0,
    coupling: 0,
    gap: 0,
    regime: "Contested" as Regime,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const societyRef = useRef<PhaseSociety | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<SocietyVoices | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const hudTimerRef = useRef(0);

  // interaction state (refs — read by the loop without re-rendering)
  const targetRef = useRef<SocietyParams>({ couplingInter: 1.4, gap: 0.5 });
  const pointerActiveRef = useRef(false);
  const lastInputRef = useRef(0);
  const autopilotRngRef = useRef<() => number>(mulberry32(0xa17091));
  const nextShockRef = useRef(0);
  const tiltRef = useRef<{ on: boolean; coupling: number; gap: number }>({
    on: false,
    coupling: 1.4,
    gap: 0.5,
  });
  const reducedRef = useRef(false);

  // ── the animation + integration loop ──────────────────────────────────────
  const runFrame = useCallback((ts: number) => {
    const society = societyRef.current;
    const renderer = rendererRef.current;
    if (!society || !renderer) return;

    const last = lastTsRef.current || ts;
    let dtMs = ts - last;
    lastTsRef.current = ts;
    if (dtMs > 100) dtMs = 100; // guard tab-switch jumps
    const dtScale = dtMs / 16.667;

    const now = ts;
    const idle = now - lastInputRef.current > IDLE_MS;

    // decide the TARGETS this frame — user, tilt, or seeded autopilot
    if (pointerActiveRef.current) {
      // targets already set by pointer handlers
    } else if (tiltRef.current.on && !idle) {
      targetRef.current.couplingInter = tiltRef.current.coupling;
      targetRef.current.gap = tiltRef.current.gap;
    } else if (idle) {
      // seeded autopilot: two slow Lissajous wanders + occasional shocks so the
      // field visibly breathes between sync and fracture with nobody watching.
      const rng = autopilotRngRef.current;
      const t = now * 0.001;
      const slow = reducedRef.current ? 0.3 : 1;
      const cWander =
        1.7 + 1.5 * Math.sin(t * 0.09 * slow) + 0.3 * Math.sin(t * 0.31 * slow);
      const gWander = 0.5 + 0.42 * Math.sin(t * 0.063 * slow + 1.7);
      targetRef.current.couplingInter = Math.max(0, Math.min(MAX_COUPLING, cWander));
      targetRef.current.gap = Math.max(0, Math.min(1, gWander));
      if (now > nextShockRef.current) {
        society.shock(rng() > 0.5 ? 0 : 1);
        nextShockRef.current = now + (5000 + rng() * 6000) * (reducedRef.current ? 2 : 1);
      }
    }

    society.step(dtScale, targetRef.current);
    const ro = society.readout;
    renderer.pushHistory(ro.rGlobal);
    renderer.render(society);

    const audio = audioRef.current;
    if (audio) audio.update(ro.rGlobal, ro.rA, ro.rB, targetRef.current.gap, ro.meanSpeed);

    // throttle the React HUD to ~8 Hz
    if (now - hudTimerRef.current > 120) {
      hudTimerRef.current = now;
      setHud({
        r: ro.rGlobal,
        rA: ro.rA,
        rB: ro.rB,
        lock: ro.lockMemory,
        coupling: targetRef.current.couplingInter,
        gap: targetRef.current.gap,
        regime: regimeOf(ro.rGlobal, ro.lockMemory),
      });
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── set up society + renderer once mounted ─────────────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    let society: PhaseSociety;
    let renderer: FieldRenderer;
    try {
      society = new PhaseSociety(320);
      renderer = new FieldRenderer(canvas, society);
    } catch (e) {
      setError(
        e instanceof Error && /WebGL2/.test(e.message)
          ? "WebGL2 is unavailable in this browser — the phase field cannot render here."
          : "Could not initialise the renderer.",
      );
      return;
    }
    societyRef.current = society;
    rendererRef.current = renderer;
    renderer.resize();

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);

    lastInputRef.current = performance.now() - IDLE_MS - 1; // start in autopilot
    nextShockRef.current = performance.now() + 4000;
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
      societyRef.current = null;
    };
  }, [runFrame]);

  // ── pointer perturbation: X → inter-coupling, Y → frequency gap ─────────────
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    targetRef.current.couplingInter = nx * MAX_COUPLING; // right = pull together
    targetRef.current.gap = 1 - ny; // up = widen the argument
    lastInputRef.current = performance.now();
  }, []);

  const pointerDownPosRef = useRef({ x: 0, y: 0, t: 0, moved: false });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      pointerActiveRef.current = true;
      pointerDownPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        moved: false,
      };
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerActiveRef.current) return;
      const d0 = pointerDownPosRef.current;
      if (Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 6) {
        pointerDownPosRef.current.moved = true;
      }
      applyPointer(e.clientX, e.clientY);
    },
    [applyPointer],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      pointerActiveRef.current = false;
      const d0 = pointerDownPosRef.current;
      const quick = performance.now() - d0.t < 350;
      // a tap (not a drag) is a SHOCK the field must recover from.
      if (!d0.moved && quick) {
        const society = societyRef.current;
        const canvas = canvasRef.current;
        if (society && canvas) {
          const rect = canvas.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const rad = Math.hypot(e.clientX - cx, e.clientY - cy) /
            (Math.min(rect.width, rect.height) / 2);
          society.shock(rad < 0.6 ? 0 : 1); // inner tap shocks A, outer shocks B
          lastInputRef.current = performance.now();
        }
      }
    },
    [],
  );

  // ── device tilt as an alternate mobile perturbation ────────────────────────
  const enableTilt = useCallback(async () => {
    interface DOEvt {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
    const anyDO = (typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as unknown as DOEvt)
      : null);
    try {
      if (anyDO?.requestPermission) {
        const res = await anyDO.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      return;
    }
    const handler = (ev: DeviceOrientationEvent) => {
      const gamma = ev.gamma ?? 0; // left/right tilt -90..90
      const beta = ev.beta ?? 0; // front/back tilt -180..180
      tiltRef.current.coupling = Math.max(
        0,
        Math.min(MAX_COUPLING, ((gamma + 45) / 90) * MAX_COUPLING),
      );
      tiltRef.current.gap = Math.max(0, Math.min(1, (beta - 10) / 70));
      tiltRef.current.on = true;
      lastInputRef.current = performance.now();
    };
    window.addEventListener("deviceorientation", handler);
    tiltRef.current.on = true;
    setTiltOn(true);
  }, []);

  // ── start / stop audio ─────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (running) return;
    try {
      const voices = new SocietyVoices();
      voices.start();
      audioRef.current = voices;
      setRunning(true);
    } catch {
      setError("Web Audio could not start in this browser.");
    }
  }, [running]);

  const stop = useCallback(async () => {
    setRunning(false);
    const a = audioRef.current;
    audioRef.current = null;
    if (a) await a.stop();
  }, []);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      void audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const pct = (x: number) => Math.round(x * 100);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-6">
        <Link
          href="/dream"
          className="text-base text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Phase Society
        </h1>
        <p className="mt-1 max-w-2xl text-base text-muted-foreground">
          A crowd of coupled oscillators argues its way toward — or away from —
          agreement. The level of unity is nobody&apos;s dial; it emerges from two
          populations pulling against each other, and the field remembers.
        </p>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!running ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Mute / stop
            </button>
          )}
          {!tiltOn && (
            <button
              onClick={enableTilt}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Enable tilt
            </button>
          )}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-base text-destructive">
            {error}
          </div>
        )}

        {/* readouts — everything here is a READOUT, never an input */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-base text-muted-foreground">
          <span className="text-foreground">
            r = <span className="tabular-nums">{hud.r.toFixed(3)}</span>
          </span>
          <span>
            r<sub>slow</sub> = <span className="tabular-nums">{hud.rA.toFixed(2)}</span>
          </span>
          <span>
            r<sub>fast</sub> = <span className="tabular-nums">{hud.rB.toFixed(2)}</span>
          </span>
          <span>
            memory = <span className="tabular-nums">{pct(hud.lock)}%</span>
          </span>
          <span className="text-foreground">{hud.regime}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 font-mono text-sm text-muted-foreground/80">
          <span>coupling → {hud.coupling.toFixed(2)}</span>
          <span>gap ↑ {pct(hud.gap)}%</span>
        </div>

        {/* the field */}
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-[#050607]">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="block aspect-square max-h-[68vh] w-full touch-none"
            style={{ touchAction: "none" }}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Drag across the field — rightward pulls the two crowds together, upward
          widens the argument. These two gestures fight; unity is what survives the
          fight. Tap the inner ring to shock the slow crowd, the outer ring to shock
          the fast one, then watch it recover. Leave it alone and it breathes on its
          own.
        </p>

        {showNotes && (
          <div className="mt-4 space-y-3 rounded-lg border border-border bg-background/40 p-4 text-base text-muted-foreground">
            <p>
              <span className="text-foreground">The model.</span> Two communities of
              phase oscillators (Kuramoto, 1975) with different natural-frequency
              distributions — a slow inner crowd and a fast outer one. Each is pulled
              toward its own centroid and toward the rival&apos;s. The order parameter
              r = |mean(e<sup>iθ</sup>)| is the white vector; it is a{" "}
              <em>readout</em> of the argument, never a knob.
            </p>
            <p>
              <span className="text-foreground">The memory.</span> Integrated with
              inertia (the second-order Kuramoto model) plus a bistable lock-memory,
              so once the crowd agrees it resists breaking and once it fractures it
              resists re-forming. The field&apos;s own state can contradict your
              gesture — that lag is the point.
            </p>
            <p>
              <span className="text-foreground">The sound.</span> Each community is a
              choral voice; its detune spread widens as its coherence drops (beating,
              rough) and collapses toward unison as it locks. The interval between the
              two voices is the frequency gap — unison at agreement, a tritone at
              conflict.
            </p>
            <p className="text-sm">
              After Kuramoto (1975); the &ldquo;Collective Rhythms Toolbox&rdquo; and
              &ldquo;Sound in Multiples&rdquo; coupled-oscillator interfaces; visual
              language after Ryoji Ikeda&apos;s <em>datamatics</em>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
