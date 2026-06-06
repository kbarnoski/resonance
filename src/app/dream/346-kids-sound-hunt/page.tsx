"use client";

// 346 · Kids Sound Hunt
// ─────────────────────────────────────────────────────────────────────────────
// The lab's first non-screen / audio-first KIDS piece.
// Turn your phone (or body) to FIND singing animals hidden in 3-D space.
// When you face one for ~1.2 s, it swoops to you and joins your growing song.
//
// Visual: a dim DOM/CSS compass with a soft glow — the experience lives in the ears.
// Audio: PannerNode{panningModel:"HRTF"} + DynamicsCompressor brick-wall limiter.
// Scale: D-Dorian (NOT C-major-pentatonic).
//
// Renderer: DOM/CSS only (divs, transforms, box-shadow) — Canvas2D and SVG are banned.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeAnimals,
  computeFacing,
  DWELL_COLLECT_S,
  type Animal,
} from "./hunt";
import { createHuntAudio, type HuntAudio } from "./audio";

// ── legacy type shim for iOS permission ─────────────────────────────────────
interface DOEWithPermission {
  requestPermission?: () => Promise<"granted" | "denied">;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function vibrate(ms: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(ms); } catch { /* unsupported */ }
  }
}

// ── compass math: animal dot position on the ring ───────────────────────────
// Returns CSS top/left percentages (0-100) for a dot placed on a circle of
// radius `r` (0..1 relative to container half-size) at the given azimuth,
// where 0 = north (top), CW positive.
function ringPos(azimuthRad: number, r: number): { x: number; y: number } {
  return {
    x: 50 + Math.sin(azimuthRad) * r * 50,
    y: 50 - Math.cos(azimuthRad) * r * 50,
  };
}

// ── component ─────────────────────────────────────────────────────────────────
type Phase = "idle" | "running" | "celebrating" | "done" | "no-audio";

export default function KidsSoundHunt() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sensorActive, setSensorActive] = useState(false);
  const [sensorDenied, setSensorDenied] = useState(false);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [headingDeg, setHeadingDeg] = useState(0);
  // which animal id is currently being faced (for glow)
  const [facedId, setFacedId] = useState<number | null>(null);
  // dwell progress 0..1 for the currently faced animal
  const [dwellPct, setDwellPct] = useState(0);

  // refs — audio
  const audioRef   = useRef<HuntAudio | null>(null);
  // refs — state (avoid stale closures in rAF)
  const animalsRef = useRef<Animal[]>([]);
  const headingRef = useRef(0); // radians
  const phaseRef   = useRef<Phase>("idle");
  // refs — interaction
  const rafRef         = useRef<number | null>(null);
  const draggingRef    = useRef(false);
  const lastPtrRef     = useRef(0);
  const autoDemoRef    = useRef(true);  // auto-demo until sensor or drag fires
  const autoDemoTimeRef = useRef(0);    // elapsed time for demo sweep
  const lastTickRef    = useRef<number>(0);
  // refs — collect
  const collectingRef  = useRef<Set<number>>(new Set());

  // ── rAF loop ────────────────────────────────────────────────────────────────
  const runFrame = useCallback((timestamp: number) => {
    if (phaseRef.current !== "running") return;

    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.1) : 0.016;
    lastTickRef.current = timestamp;

    const hunt = audioRef.current;
    if (!hunt) {
      rafRef.current = requestAnimationFrame(runFrame);
      return;
    }

    // ── heading ────────────────────────────────────────────────────────────
    let heading = headingRef.current;
    if (autoDemoRef.current) {
      // auto-demo: sweep 360° in ~24 s, then repeat
      autoDemoTimeRef.current += dt;
      heading = (autoDemoTimeRef.current * (Math.PI * 2)) / 24;
      headingRef.current = heading;
    }

    hunt.applyHeading(heading);

    // ── facing + dwell ─────────────────────────────────────────────────────
    const animals = animalsRef.current;
    const swells: Record<number, number> = {};
    let bestFace = 0;
    let bestId: number | null = null;
    let bestDwell = 0;

    for (const animal of animals) {
      if (animal.collected) {
        swells[animal.id] = 0;
        continue;
      }
      const face = computeFacing(animal, heading);
      swells[animal.id] = face;

      // smooth facing swell
      animal.swell += (face - animal.swell) * Math.min(1, dt * 6);

      if (face > 0.3) {
        animal.facingDwell = Math.min(DWELL_COLLECT_S, animal.facingDwell + dt);
      } else {
        animal.facingDwell = Math.max(0, animal.facingDwell - dt * 2);
      }

      if (animal.swell > bestFace) {
        bestFace = animal.swell;
        bestId = animal.id;
        bestDwell = animal.facingDwell;
      }
    }

    hunt.applySwells(swells);

    // ── auto-collect: check dwell threshold ───────────────────────────────
    for (const animal of animals) {
      if (animal.collected) continue;
      if (collectingRef.current.has(animal.id)) continue;
      if (animal.facingDwell >= DWELL_COLLECT_S) {
        collectAnimal(animal.id);
      }
    }

    // ── check all collected ───────────────────────────────────────────────
    const allCollected = animals.every((a) => a.collected);
    if (allCollected && animals.length > 0 && phaseRef.current === "running") {
      phaseRef.current = "celebrating";
      setPhase("celebrating");
      triggerCelebration();
      return; // stop rAF — celebration handles itself
    }

    // ── state → React (dim-rate: every frame is fine for heading, but throttle text)
    setHeadingDeg(Math.round((heading * 180) / Math.PI) % 360);
    setFacedId(bestFace > 0.25 ? bestId : null);
    setDwellPct(bestDwell / DWELL_COLLECT_S);

    // update animals ref → trigger re-render for DOM compass dots
    setAnimals([...animalsRef.current]);

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── collect an animal ────────────────────────────────────────────────────
  const collectAnimal = useCallback((id: number) => {
    const animal = animalsRef.current.find((a) => a.id === id);
    if (!animal || animal.collected) return;

    collectingRef.current.add(id);
    animal.collected = true;
    animal.facingDwell = 0;

    // haptic
    vibrate(30);

    // audio fly-in + chime
    audioRef.current?.flyIn(id);
    audioRef.current?.playCatchChime();

    setAnimals([...animalsRef.current]);
  }, []);

  // ── celebration ──────────────────────────────────────────────────────────
  const triggerCelebration = useCallback(() => {
    vibrate([40, 60, 40, 60, 80]);
    audioRef.current?.playCelebration(animalsRef.current);
    setTimeout(() => {
      phaseRef.current = "done";
      setPhase("done");
    }, 6000);
  }, []);

  // ── start handler (user gesture — iOS-safe) ──────────────────────────────
  const handleStart = useCallback(async () => {
    if (typeof window === "undefined") return;

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AC) {
      setPhase("no-audio");
      return;
    }

    // Create AudioContext INSIDE the gesture
    const ctx = new AC();
    await ctx.resume();

    // iOS 13+: request DeviceOrientation permission INSIDE the same gesture
    const DOE = (window as unknown as { DeviceOrientationEvent?: DOEWithPermission }).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          setSensorActive(true);
          autoDemoRef.current = false;
        } else {
          setSensorDenied(true);
        }
      } catch {
        setSensorDenied(true);
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      // Android or desktop with sensor
      setSensorActive(true);
      // don't turn off auto-demo yet — wait for actual events
    }

    // Set up animal state
    const freshAnimals = makeAnimals();
    animalsRef.current = freshAnimals;
    setAnimals(freshAnimals);

    // Build audio graph
    const hunt = createHuntAudio(ctx, freshAnimals);
    audioRef.current = hunt;

    phaseRef.current = "running";
    setPhase("running");
    lastTickRef.current = 0;
    autoDemoTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  // ── tap-to-collect on center target ─────────────────────────────────────
  const handleCenterTap = useCallback(() => {
    if (phaseRef.current !== "running") return;
    if (facedId !== null) {
      collectAnimal(facedId);
    }
  }, [facedId, collectAnimal]);

  // ── device orientation listener ──────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;

    function onOrient(e: DeviceOrientationEvent) {
      if (e.alpha == null) return;
      autoDemoRef.current = false;
      setSensorActive(true);
      headingRef.current = (e.alpha * Math.PI) / 180;
    }

    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [phase]);

  // ── pointer drag fallback ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;

    function onDown(e: PointerEvent) {
      draggingRef.current = true;
      lastPtrRef.current = e.clientX;
      autoDemoRef.current = false;
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPtrRef.current;
      lastPtrRef.current = e.clientX;
      headingRef.current += dx * 0.007;
    }
    function onUp() { draggingRef.current = false; }

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [phase]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.teardown();
      audioRef.current = null;
    };
  }, []);

  // ── reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.teardown();
    audioRef.current = null;
    animalsRef.current = [];
    collectingRef.current = new Set();
    headingRef.current = 0;
    autoDemoRef.current = true;
    autoDemoTimeRef.current = 0;
    lastTickRef.current = 0;
    phaseRef.current = "idle";
    setPhase("idle");
    setAnimals([]);
    setHeadingDeg(0);
    setFacedId(null);
    setDwellPct(0);
    setSensorActive(false);
    setSensorDenied(false);
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────
  const collectedCount = animals.filter((a) => a.collected).length;
  const totalCount = animals.length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <main
      className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: "#0d0a06" }}
    >

      {/* ── IDLE SCREEN ──────────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-6 px-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white/95">
            Sound Hunt
          </h1>
          <p className="text-base text-white/75 leading-relaxed">
            Animals are hiding all around you, singing in the dark.{" "}
            <span className="text-amber-300">Turn slowly</span> to find them —
            when you hear one up close, hold still and it will come to you.
          </p>
          <p className="text-base text-white/60 leading-relaxed">
            Best with <span className="text-white/80">headphones</span>.
            Works without — but the magic lives in your ears.
          </p>

          <button
            onClick={handleStart}
            className="mt-2 min-h-[56px] w-full rounded-2xl bg-amber-500/20 border border-amber-400/40 px-6 py-3.5 text-xl font-semibold text-amber-200 transition-all hover:bg-amber-500/30 active:scale-95"
            style={{ touchAction: "manipulation" }}
          >
            ▸ Listen for the animals
          </button>

          <p className="text-sm text-white/40 leading-relaxed">
            No phone sensor? Drag left/right to turn.
            A gentle auto-tour plays by itself.
          </p>
        </div>
      )}

      {/* ── RUNNING SCREEN ───────────────────────────────────────────────── */}
      {(phase === "running" || phase === "celebrating") && (
        <>
          {/* ── DIM COMPASS (DOM/CSS) ─────────────────────────────────────── */}
          <CompassRing
            headingDeg={headingDeg}
            animals={animals}
            facedId={facedId}
            dwellPct={dwellPct}
            onCenterTap={handleCenterTap}
          />

          {/* ── Status / hints ───────────────────────────────────────────── */}
          <div className="absolute top-8 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none">
            {/* Collection dots */}
            <div className="flex gap-2 items-center">
              {animals.map((a) => (
                <span
                  key={a.id}
                  className="text-lg transition-all duration-500"
                  style={{
                    opacity: a.collected ? 1 : 0.25,
                    transform: a.collected ? "scale(1.2)" : "scale(1)",
                    filter: a.collected
                      ? `drop-shadow(0 0 6px ${a.color})`
                      : "none",
                  }}
                >
                  {a.emoji}
                </span>
              ))}
            </div>

            <p className="text-base text-white/60">
              {collectedCount === 0
                ? "Turn slowly — listen…"
                : collectedCount < totalCount
                  ? `${collectedCount} of ${totalCount} found`
                  : ""}
            </p>

            {/* Sensor status */}
            {!sensorActive && !sensorDenied && (
              <p className="text-sm text-white/50">
                Drag left/right to turn · auto-demo playing
              </p>
            )}
            {sensorDenied && (
              <p className="text-sm text-rose-300">
                Sensor permission denied — drag left/right to turn.
              </p>
            )}
          </div>

          {/* Faced animal name */}
          {facedId !== null && (() => {
            const a = animals.find((x) => x.id === facedId);
            return a ? (
              <div className="absolute bottom-28 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
                <span className="text-4xl" style={{ filter: `drop-shadow(0 0 12px ${a.color})` }}>
                  {a.emoji}
                </span>
                <p className="text-base font-semibold" style={{ color: a.color }}>
                  {a.name}
                </p>
                {!a.collected && (
                  <p className="text-sm text-white/50">
                    {dwellPct > 0.6 ? "Hold still…" : "Stay facing it…"}
                  </p>
                )}
              </div>
            ) : null;
          })()}

          {/* Tap hint when animal is fully faced */}
          {facedId !== null && dwellPct > 0.4 && (() => {
            const a = animals.find((x) => x.id === facedId);
            return a && !a.collected ? (
              <div className="absolute bottom-12 left-0 right-0 flex justify-center pointer-events-none">
                <p className="text-sm text-white/40">or tap the compass to catch it</p>
              </div>
            ) : null;
          })()}
        </>
      )}

      {/* ── CELEBRATING ─────────────────────────────────────────────────── */}
      {phase === "celebrating" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none z-20"
          style={{ background: "radial-gradient(ellipse at center, rgba(251,191,36,0.08) 0%, transparent 70%)" }}
        >
          <p className="text-3xl text-amber-200 font-bold">All found!</p>
          <div className="flex gap-3 text-3xl">
            {animals.map((a) => (
              <span key={a.id} style={{ filter: `drop-shadow(0 0 10px ${a.color})` }}>
                {a.emoji}
              </span>
            ))}
          </div>
          <p className="text-base text-white/70">Listen to your song…</p>
        </div>
      )}

      {/* ── DONE SCREEN ──────────────────────────────────────────────────── */}
      {phase === "done" && (
        <div className="relative z-10 flex max-w-sm flex-col items-center gap-6 px-6 text-center">
          <div className="flex gap-3 text-3xl">
            {animals.map((a) => (
              <span key={a.id} style={{ filter: `drop-shadow(0 0 8px ${a.color})` }}>
                {a.emoji}
              </span>
            ))}
          </div>
          <h2 className="text-2xl font-bold text-amber-200">
            You found them all!
          </h2>
          <p className="text-base text-white/70 leading-relaxed">
            The {animals.map((a) => a.name).join(", ")} are all singing together
            in your ears now. Well done, little listener.
          </p>
          <button
            onClick={handleReset}
            className="mt-2 min-h-[52px] w-full rounded-2xl bg-amber-500/15 border border-amber-400/30 px-6 py-3 text-lg font-semibold text-amber-200 transition-all hover:bg-amber-500/25 active:scale-95"
            style={{ touchAction: "manipulation" }}
          >
            Hunt again
          </button>
        </div>
      )}

      {/* ── NO AUDIO ──────────────────────────────────────────────────────── */}
      {phase === "no-audio" && (
        <div className="relative z-10 max-w-sm px-6 text-center">
          <p className="text-base text-rose-300 leading-relaxed">
            Web Audio isn&apos;t available in this browser. Try a recent
            Chrome, Safari, or Firefox to hear the animals.
          </p>
        </div>
      )}

      {/* ── Corner note ───────────────────────────────────────────────────── */}
      <a
        href="/dream/346-kids-sound-hunt/README.md"
        className="absolute bottom-4 right-4 text-sm text-white/35 hover:text-white/60 transition-colors"
      >
        Design notes
      </a>
    </main>
  );
}

// ── CompassRing component (DOM/CSS only — no Canvas, no SVG) ─────────────────
interface CompassRingProps {
  headingDeg: number;
  animals: Animal[];
  facedId: number | null;
  dwellPct: number;
  onCenterTap: () => void;
}

function CompassRing({
  headingDeg,
  animals,
  facedId,
  dwellPct,
  onCenterTap,
}: CompassRingProps) {
  const RING_SIZE = 280; // px — outer ring diameter

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      {/* Outer ring — dim warm glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: "1.5px solid rgba(251,191,36,0.15)",
          boxShadow: "0 0 32px rgba(251,191,36,0.06) inset",
        }}
      />

      {/* North tick */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2"
        style={{
          width: 2,
          height: 12,
          background: "rgba(251,191,36,0.3)",
          borderRadius: 1,
          marginTop: -1,
        }}
      />

      {/* Heading needle — rotates opposite to heading (field rotates, not needle) */}
      <div
        className="absolute inset-0 flex items-start justify-center pointer-events-none"
        style={{
          transform: `rotate(${-headingDeg}deg)`,
          transition: "transform 0.08s linear",
        }}
      >
        <div
          style={{
            width: 2,
            height: RING_SIZE * 0.44,
            background: "linear-gradient(to bottom, rgba(251,191,36,0.7) 0%, rgba(251,191,36,0.1) 100%)",
            borderRadius: 1,
            marginTop: RING_SIZE * 0.06,
          }}
        />
      </div>

      {/* Animal dots on the ring */}
      {animals.map((animal) => {
        const r = 0.82; // ring radius as fraction of container half-size
        const { x, y } = ringPos(animal.azimuthRad, r);
        const isFaced = animal.id === facedId;
        const sz = isFaced ? 18 : 12;
        const opacity = animal.collected ? 0.85 : isFaced ? 0.95 : 0.45;

        return (
          <div
            key={animal.id}
            className="absolute flex items-center justify-center"
            style={{
              left: `${x}%`,
              top:  `${y}%`,
              width: sz,
              height: sz,
              marginLeft: -sz / 2,
              marginTop: -sz / 2,
              borderRadius: "50%",
              background: animal.collected
                ? animal.color
                : `rgba(${hexToRgb(animal.color)}, 0.3)`,
              border: `1.5px solid ${animal.color}`,
              boxShadow: isFaced
                ? `0 0 ${12 + dwellPct * 16}px ${animal.color}`
                : animal.collected
                  ? `0 0 8px ${animal.color}`
                  : "none",
              opacity,
              transition: "all 0.15s ease",
              fontSize: animal.collected ? 10 : 0,
              overflow: "hidden",
            }}
          >
            {animal.collected && (
              <span style={{ fontSize: 9, lineHeight: 1 }}>{animal.emoji}</span>
            )}
          </div>
        );
      })}

      {/* Center target — tap to collect when animal is faced */}
      <button
        onClick={onCenterTap}
        className="relative z-10 flex items-center justify-center rounded-full transition-all"
        style={{
          width: 64,
          height: 64,
          background:
            facedId !== null
              ? `radial-gradient(circle, rgba(${hexToRgb(
                  animals.find((a) => a.id === facedId)?.color ?? "#f59e42"
                )}, ${0.15 + dwellPct * 0.25}) 0%, transparent 80%)`
              : "rgba(251,191,36,0.04)",
          border:
            facedId !== null
              ? `1.5px solid rgba(${hexToRgb(
                  animals.find((a) => a.id === facedId)?.color ?? "#f59e42"
                )}, ${0.4 + dwellPct * 0.5})`
              : "1.5px solid rgba(251,191,36,0.12)",
          boxShadow:
            facedId !== null
              ? `0 0 ${20 + dwellPct * 30}px rgba(${hexToRgb(
                  animals.find((a) => a.id === facedId)?.color ?? "#f59e42"
                )}, ${0.3 + dwellPct * 0.4})`
              : "none",
          touchAction: "manipulation",
        }}
      >
        {/* Dwell arc — drawn as a rotating conic gradient border */}
        {facedId !== null && dwellPct > 0 && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(
                rgba(${hexToRgb(
                  animals.find((a) => a.id === facedId)?.color ?? "#f59e42"
                )}, 0.7) 0deg,
                rgba(${hexToRgb(
                  animals.find((a) => a.id === facedId)?.color ?? "#f59e42"
                )}, 0.7) ${dwellPct * 360}deg,
                transparent ${dwellPct * 360}deg
              )`,
              padding: 2,
              borderRadius: "50%",
              mask: "radial-gradient(circle at center, transparent 28px, black 29px)",
              WebkitMask: "radial-gradient(circle at center, transparent 28px, black 29px)",
            }}
          />
        )}
        {/* Listener dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(251,191,36,0.6)",
            boxShadow: "0 0 6px rgba(251,191,36,0.5)",
          }}
        />
      </button>
    </div>
  );
}

// ── utility: hex color to "r,g,b" string for rgba() ─────────────────────────
function hexToRgb(hex: string): string {
  const clean = hex.replace("#", "");
  const num   = parseInt(clean, 16);
  const r     = (num >> 16) & 255;
  const g     = (num >> 8)  & 255;
  const b     =  num        & 255;
  return `${r},${g},${b}`;
}
