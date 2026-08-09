"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createEngine, type DopplerEngine } from "./audio";
import {
  createField,
  SPEED_OF_SOUND,
  stepBob,
  voiceOf,
  type Bob,
} from "./pendulum";

// ── art palette (inline hex — this is the ART, not chrome) ────────────────────
const RAIL = "rgba(176, 188, 208, 0.30)"; // cool graphite rail
const STRING = "rgba(176, 188, 208, 0.20)"; // thinner graphite strings
const EMBER = "#e8a24c"; // the single warm accent — the bobs
const EMBER_HI = "#ffcf8a"; // approach highlight
const TEAL = "#39b6ad"; // the ear/listener

const MAX_TILT = 0.32; // radians of gravity-tilt at full drag / full sensor

// iOS permission shape, narrowly typed (avoid `any`).
interface OrientationPermission {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

type Phase = "idle" | "live";
type TiltStatus = "off" | "active" | "denied" | "unsupported";

export default function PendulumsPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [tiltStatus, setTiltStatus] = useState<TiltStatus>("off");
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Reduced-motion is read once for the field construction.
  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  const field = useMemo(() => createField(reducedMotion), [reducedMotion]);

  // Imperative refs (per-frame writes bypass React reconciliation for smoothness).
  const stageRef = useRef<HTMLDivElement | null>(null);
  const armRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const engineRef = useRef<DopplerEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const clockStartRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const tiltRef = useRef(0); // smoothed current tilt (rad)
  const targetTiltRef = useRef(0); // where tilt is easing toward
  const draggingRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── measure the stage (responsive layout of pivots + string lengths) ────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Per-bob layout in pixels. Angles come from the model each frame; layout
  // (pivot px + string length px) only changes on resize.
  const layout = useMemo(() => {
    const { w, h } = dims;
    const railY = h * 0.08;
    return field.bobs.map((b: Bob) => ({
      pivotXpx: w / 2 + b.pivotX * (w * 0.46),
      railYpx: railY,
      lengthPx: b.length * h * 0.66,
      bobR: 7 + (1 - b.idx / field.bobs.length) * 6,
    }));
  }, [dims, field]);

  // ── the animation loop (always running — muted self-demo, then audible) ─────
  useEffect(() => {
    clockStartRef.current = performance.now();
    const frame = () => {
      const t = (performance.now() - clockStartRef.current) / 1000;
      // Ease tilt toward its target (pointer release springs back to 0).
      tiltRef.current += (targetTiltRef.current - tiltRef.current) * 0.08;
      const tilt = tiltRef.current;
      const engine = engineRef.current;

      for (let i = 0; i < field.bobs.length; i++) {
        const bob = field.bobs[i];
        const kin = stepBob(bob, t, tilt);
        const arm = armRefs.current[i];
        if (arm) arm.style.transform = `rotate(${kin.alpha}rad)`;

        const v = voiceOf(bob, kin, field.vNorm, SPEED_OF_SOUND);
        const bobEl = bobRefs.current[i];
        if (bobEl) {
          const g = v.glow;
          bobEl.style.background = g > 0.02 ? EMBER_HI : EMBER;
          bobEl.style.opacity = String(0.55 + g * 0.45);
          bobEl.style.boxShadow = `0 0 ${6 + g * 20}px rgba(240,170,90,${(
            0.18 +
            g * 0.6
          ).toFixed(3)})`;
        }
        if (engine) engine.update(i, v);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [field]);

  // ── device-orientation tilt (optional enhancement) ──────────────────────────
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    // gamma = left-right tilt, roughly [-90, 90] degrees.
    const gamma = e.gamma ?? 0;
    const norm = Math.max(-1, Math.min(1, gamma / 40));
    targetTiltRef.current = norm * MAX_TILT;
  }, []);

  // ── begin: unlock audio + light the voices; then try the sensor ─────────────
  const handleBegin = useCallback(async () => {
    if (engineRef.current) return;
    const f0s = field.bobs.map((b) => b.f0);
    const detunes = field.bobs.map((b) => b.detune);
    const engine = createEngine(f0s, detunes);
    try {
      await engine.ctx.resume();
    } catch {
      // resume may reject if already running — safe to ignore
    }
    engineRef.current = engine;
    setPhase("live");

    // Attempt device-orientation (feature-detect + iOS permission prompt).
    const DOE = window.DeviceOrientationEvent as unknown as
      | (OrientationPermission & { prototype: DeviceOrientationEvent })
      | undefined;
    if (!DOE) {
      setTiltStatus("unsupported");
      return;
    }
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", handleOrientation);
          setTiltStatus("active");
        } else {
          setTiltStatus("denied");
        }
      } catch {
        setTiltStatus("denied");
      }
    } else {
      window.addEventListener("deviceorientation", handleOrientation);
      setTiltStatus("active");
    }
  }, [field, handleOrientation]);

  // ── release all: re-sync the wave (reset master clock) + level gravity ───────
  const handleRelease = useCallback(() => {
    clockStartRef.current = performance.now();
    targetTiltRef.current = 0;
  }, []);

  // ── pointer fallback: press + drag left/right to tilt gravity ────────────────
  const tiltFromPointer = useCallback((clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const norm = ((clientX - r.left) / r.width - 0.5) * 2; // [-1, 1]
    targetTiltRef.current = Math.max(-1, Math.min(1, norm)) * MAX_TILT;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      tiltFromPointer(e.clientX);
    },
    [tiltFromPointer],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      tiltFromPointer(e.clientX);
    },
    [tiltFromPointer],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    targetTiltRef.current = 0; // gravity springs back to level
  }, []);

  // ── full teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, [handleOrientation]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-5 py-10">
      <PrototypeNav slugs={["8856-pendulums"]} />

      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          8856 · Pendulums
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The Doppler Stage
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A row of swinging sound-sources of graduated length, each sighing a
          Doppler vibrato at its own swing period. Released together they drift
          in and out of phase — a chord that breathes, splits into shimmer, and
          re-fuses. Tilt (or drag left/right) to lean gravity; release all to
          re-sync.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {phase === "idle" ? (
          <button
            onClick={handleBegin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Begin — light the voices
          </button>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Voices lit · listening below the rail
          </span>
        )}
        <button
          onClick={handleRelease}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Release all (re-sync)
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {tiltStatus === "denied" || tiltStatus === "unsupported" ? (
        <p className="text-sm text-destructive">
          Motion sensor unavailable — using pointer tilt. Press and drag
          left/right across the stage to lean gravity.
        </p>
      ) : null}

      {/* ── the stage ─────────────────────────────────────────────────────── */}
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-[440px] w-full cursor-ew-resize touch-none overflow-hidden rounded-lg border border-border"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(30,36,48,0.55), rgba(10,12,18,0.92))",
        }}
      >
        {/* the rail */}
        <div
          className="absolute left-0"
          style={{
            top: dims.h * 0.08,
            width: "100%",
            height: 2,
            background: RAIL,
            boxShadow: `0 0 8px ${RAIL}`,
          }}
        />

        {/* pendula: each arm is a rotating string with a bob at its end */}
        {field.bobs.map((b, i) => {
          const l = layout[i];
          if (!l) return null;
          return (
            <div
              key={b.idx}
              ref={(el) => {
                armRefs.current[i] = el;
              }}
              className="absolute origin-top"
              style={{
                left: l.pivotXpx,
                top: l.railYpx,
                width: 0,
                height: l.lengthPx,
                willChange: "transform",
              }}
            >
              {/* string */}
              <div
                style={{
                  position: "absolute",
                  left: -0.75,
                  top: 0,
                  width: 1.5,
                  height: l.lengthPx,
                  background: `linear-gradient(${STRING}, rgba(176,188,208,0.06))`,
                }}
              />
              {/* bob */}
              <div
                ref={(el) => {
                  bobRefs.current[i] = el;
                }}
                style={{
                  position: "absolute",
                  left: -l.bobR,
                  top: l.lengthPx - l.bobR,
                  width: l.bobR * 2,
                  height: l.bobR * 2,
                  borderRadius: "50%",
                  background: EMBER,
                  boxShadow: "0 0 6px rgba(240,170,90,0.18)",
                  willChange: "opacity, box-shadow",
                }}
              />
            </div>
          );
        })}

        {/* the ear / listener, below the rail */}
        <div
          className="absolute -translate-x-1/2"
          style={{
            left: "50%",
            top: dims.h * 0.9,
            width: 16,
            height: 16,
            borderRadius: "50%",
            border: `2px solid ${TEAL}`,
            background: "rgba(57,182,173,0.16)",
            boxShadow: `0 0 14px rgba(57,182,173,0.45)`,
          }}
        />
        <div
          className="absolute -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ left: "50%", top: dims.h * 0.9 + 22, color: TEAL }}
        >
          ear
        </div>
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        14 graduated pendula · ~48 s full cycle · Doppler ±2 semitones
      </p>

      {/* ── design-notes modal ────────────────────────────────────────────── */}
      {showNotes ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold tracking-tight">
              What if a pendulum wave were something you HEAR?
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Fourteen bobs hang on strings of graduated length, tuned so each
              completes a whole number of swings per common cycle (~48 s).
              Released together they start in unison, then fan out through every
              phase relationship — snake, waves, apparent chaos — and re-converge.
              An ear sits below the rail: each bob&apos;s radial velocity toward
              it becomes a real Doppler vibrato (Christian Doppler, 1842) at that
              bob&apos;s swing frequency, so the whole choreography is a chord
              that breathes. The base pitches climb an equal-tempered pentatonic
              up the row; the phase drift is Steve Reich&apos;s in/out-of-phase
              music made physical. On a muted screen the motion alone carries it.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
