"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createEngine, type GaitEngine } from "./audio";
import {
  createSimGait,
  createStepDetector,
  type SimGait,
  type StepDetector,
  type StepEvent,
} from "./gait";

/* ───────────────────────────────────────────────────────────────────────────
   1116-gait-loom — "Gait Loom"

   ONE question: What if walking WAS the instrument — if you held your phone,
   walked, and your own footstep cadence set the tempo and phase of a slow
   Reich-style phasing raga, while a mandala unfurled one petal per step?

   INPUT  device accelerometer / gait (DeviceMotion) with a deterministic
          "simulate walking" fallback for machines with no sensor.
   OUTPUT React-rendered SVG mandala — one petal blooms per footstep; two
          orbiting markers show your locked voice vs. the drifting phasing voice.
   AUDIO  Web Audio phasing engine (see audio.ts): Voice A locked to your steps,
          Voice B a few percent faster, so they phase like Piano Phase.
─────────────────────────────────────────────────────────────────────────── */

const SEED = 0x51f0a233;
const PETALS_PER_RING = 12;
const MAX_RINGS = 4;
const MAX_PETALS = PETALS_PER_RING * MAX_RINGS;
const SLOT_ANGLE = 360 / PETALS_PER_RING;
const BLOOM_MS = 1300;
const DRIFT = 0.03; // must mirror audio.ts Voice B drift

type Mode = "idle" | "real" | "sim";

interface Petal {
  id: number;
  ring: number;
  slot: number;
  bornMs: number;
  intensity: number;
}

interface Viz {
  petals: Petal[];
  nextId: number;
  stepCount: number;
  aAngle: number; // "your steps" marker — advances one slot per footfall
  bAngle: number; // phasing voice — advances continuously, a touch faster
  spin: number; // slow global mandala rotation
  cadence: number;
  lastFrameMs: number;
}

function makeViz(): Viz {
  return {
    petals: [],
    nextId: 0,
    stepCount: 0,
    aAngle: -90,
    bAngle: -90,
    spin: 0,
    cadence: 108,
    lastFrameMs: 0,
  };
}

// Warm terracotta / ochre / rust — hue stays in the clay band.
function petalFill(ring: number, intensity: number, bloom: number): string {
  const hue = 15 + ring * 6; // rust → ochre outward
  const light = 40 + intensity * 16;
  const alpha = (0.28 + intensity * 0.5) * bloom;
  return `hsla(${hue}, 62%, ${light}%, ${alpha.toFixed(3)})`;
}

// iOS gates DeviceMotion behind a permission call that must run in a gesture.
type MotionPermFn = () => Promise<"granted" | "denied" | "default">;
interface DMEWithPerm {
  requestPermission?: MotionPermFn;
}

export default function GaitLoomPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string>("");
  const [cadence, setCadence] = useState<number>(0);
  const [stepCount, setStepCount] = useState<number>(0);
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [, setFrame] = useState<number>(0);

  const engineRef = useRef<GaitEngine | null>(null);
  const detectorRef = useRef<StepDetector | null>(null);
  const simRef = useRef<SimGait | null>(null);
  const vizRef = useRef<Viz>(makeViz());
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>("idle");
  const motionSeenRef = useRef<boolean>(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const reducedRef = useRef<boolean>(false);

  // ── register a footstep from either source ──────────────────────────────
  const handleStep = useCallback((ev: StepEvent) => {
    const engine = engineRef.current;
    if (engine) engine.step(ev.intensity, ev.cadence);

    const v = vizRef.current;
    v.stepCount += 1;
    v.cadence = ev.cadence;
    const ring = Math.floor(v.stepCount / PETALS_PER_RING) % MAX_RINGS;
    const slot = v.stepCount % PETALS_PER_RING;
    v.petals.push({
      id: v.nextId++,
      ring,
      slot,
      bornMs: ev.t,
      intensity: ev.intensity,
    });
    if (v.petals.length > MAX_PETALS) v.petals.shift();
    v.aAngle += SLOT_ANGLE; // your voice snaps forward one petal

    setCadence(Math.round(ev.cadence));
    setStepCount(v.stepCount);
  }, []);

  // ── animation loop: sim ticks, petal bloom, phasing marker, re-render ────
  const runFrame = useCallback(() => {
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const v = vizRef.current;
    const dt = v.lastFrameMs ? now - v.lastFrameMs : 16;
    v.lastFrameMs = now;

    if (modeRef.current === "sim" && simRef.current) {
      const ev = simRef.current.tick(now);
      if (ev) handleStep(ev);
    }

    // Voice B marker advances continuously, DRIFT% faster than your cadence.
    const speedScale = reducedRef.current ? 0.4 : 1;
    const stepsPerMs = (v.cadence * (1 + DRIFT)) / 60000;
    v.bAngle += stepsPerMs * dt * SLOT_ANGLE * speedScale;
    v.spin += dt * (reducedRef.current ? 0.0006 : 0.0025);

    setFrame((f) => (f + 1) % 1000000);
    rafRef.current = requestAnimationFrame(runFrame);
  }, [handleStep]);

  const stopEverything = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (listenerRef.current) {
      window.removeEventListener("devicemotion", listenerRef.current);
      listenerRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
  }, []);

  const beginAudio = useCallback(async () => {
    vizRef.current = makeViz();
    setStepCount(0);
    setCadence(0);
    if (!engineRef.current) engineRef.current = createEngine();
    await engineRef.current.start();
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const startSim = useCallback(
    async (msg: string) => {
      simRef.current = createSimGait(SEED);
      modeRef.current = "sim";
      setMode("sim");
      setNotice(msg);
      await beginAudio();
    },
    [beginAudio],
  );

  const switchToSim = useCallback(
    (msg: string) => {
      if (listenerRef.current) {
        window.removeEventListener("devicemotion", listenerRef.current);
        listenerRef.current = null;
      }
      simRef.current = createSimGait(SEED);
      modeRef.current = "sim";
      setMode("sim");
      setNotice(msg);
    },
    [],
  );

  const startWalking = useCallback(async () => {
    // iOS: request motion permission from within this user gesture.
    try {
      const dme = (typeof DeviceMotionEvent !== "undefined"
        ? DeviceMotionEvent
        : undefined) as unknown as DMEWithPerm | undefined;
      if (dme && typeof dme.requestPermission === "function") {
        const res = await dme.requestPermission();
        if (res !== "granted") {
          await startSim("Motion permission denied — simulating a steady walk.");
          return;
        }
      }
    } catch {
      await startSim("Motion sensor unavailable — simulating a steady walk.");
      return;
    }

    detectorRef.current = createStepDetector();
    modeRef.current = "real";
    setMode("real");
    setNotice("Listening for your footsteps… start walking with the phone.");
    motionSeenRef.current = false;

    const listener = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || (a.x == null && a.y == null && a.z == null)) return;
      motionSeenRef.current = true;
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const ev = detectorRef.current?.push(a.x ?? 0, a.y ?? 0, a.z ?? 0, now);
      if (ev) handleStep(ev);
    };
    listenerRef.current = listener;
    window.addEventListener("devicemotion", listener);

    await beginAudio();

    // No real motion within 2s → fall back to the deterministic walker.
    fallbackTimerRef.current = setTimeout(() => {
      if (!motionSeenRef.current) {
        switchToSim(
          "No motion sensor detected — simulating a steady walk (~108 spm).",
        );
      }
    }, 2000);
  }, [beginAudio, handleStep, startSim, switchToSim]);

  const stop = useCallback(() => {
    stopEverything();
    modeRef.current = "idle";
    setMode("idle");
    setNotice("");
  }, [stopEverything]);

  // reduced-motion + unmount cleanup
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      stopEverything();
    };
  }, [stopEverything]);

  // ── render ───────────────────────────────────────────────────────────────
  const v = vizRef.current;
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const running = mode !== "idle";

  const markerR = 176;
  const aRad = (v.aAngle * Math.PI) / 180;
  const bRad = (v.bAngle * Math.PI) / 180;
  const ax = 200 + markerR * Math.cos(aRad);
  const ay = 200 + markerR * Math.sin(aRad);
  const bx = 200 + markerR * Math.cos(bRad);
  const by = 200 + markerR * Math.sin(bRad);

  // phase gap 0..180° between the two voices
  let gap = Math.abs(((v.aAngle - v.bAngle) % 360 + 360) % 360);
  if (gap > 180) gap = 360 - gap;
  const alignment = 1 - gap / 180; // 1 = locked, 0 = fully out of phase

  return (
    <main className="min-h-screen bg-[#f2e7d7] text-[#3a271b]">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          href="/dream"
          className="text-base text-[#8a5a34] underline decoration-[#c99b6e] underline-offset-4 hover:text-[#5e3a1f]"
        >
          ← dream lab
        </Link>

        <header className="mt-5">
          <h1 className="text-2xl font-semibold tracking-tight text-[#6b3a1c]">
            Gait Loom
          </h1>
          <p className="mt-2 text-base leading-relaxed text-[#4a3221]">
            Hold your phone and walk. Your footstep cadence sets the tempo of a
            slow Reich-style phasing raga while a mandala unfurls one petal per
            step.
          </p>
        </header>

        {/* controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!running ? (
            <>
              <button
                onClick={startWalking}
                className="min-h-[44px] rounded-full bg-[#b4551f] px-6 py-2.5 text-base font-semibold text-[#fbf3e6] shadow-sm transition-colors hover:bg-[#9c481a]"
              >
                Start walking
              </button>
              <button
                onClick={() =>
                  startSim("Simulating a steady walk (~108 spm).")
                }
                className="min-h-[44px] rounded-full border-2 border-[#b4551f] px-6 py-2.5 text-base font-semibold text-[#9c481a] transition-colors hover:bg-[#ead6bd]"
              >
                Simulate walking
              </button>
            </>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-full border-2 border-[#8a5a34] px-6 py-2.5 text-base font-semibold text-[#6b3a1c] transition-colors hover:bg-[#ead6bd]"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-full px-4 py-2.5 text-base font-medium text-[#8a5a34] underline decoration-[#c99b6e] underline-offset-4 hover:text-[#5e3a1f]"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
        </div>

        {notice && (
          <p className="mt-4 rounded-lg bg-[#e7d3b6] px-4 py-3 text-base font-medium text-[#5e3a1f]">
            {notice}
          </p>
        )}

        {/* the mandala */}
        <div className="mt-6 overflow-hidden rounded-2xl bg-[#efe0cb] p-2 shadow-inner">
          <svg
            viewBox="0 0 400 400"
            className="mx-auto block h-auto w-full max-w-[440px]"
            role="img"
            aria-label="A blooming terracotta mandala driven by footsteps"
          >
            {/* faint guide rings */}
            {[62, 88, 114, 140, markerR].map((r) => (
              <circle
                key={r}
                cx={200}
                cy={200}
                r={r}
                fill="none"
                stroke="#d8bd97"
                strokeWidth={r === markerR ? 1.2 : 0.6}
                opacity={0.5}
              />
            ))}

            {/* petals, slowly rotating as a whole */}
            <g transform={`rotate(${v.spin} 200 200)`}>
              {v.petals.map((p) => {
                const bloom = Math.min(1, (now - p.bornMs) / BLOOM_MS);
                const eased = bloom * (2 - bloom); // ease-out
                const radius = 46 + p.ring * 30;
                const angle = p.slot * SLOT_ANGLE + p.ring * 7;
                const rx = (5 + p.ring * 1.4) * eased;
                const ry = (16 + p.ring * 3) * eased;
                const cy = 200 - radius;
                return (
                  <g
                    key={p.id}
                    transform={`rotate(${angle} 200 200)`}
                    opacity={0.35 + eased * 0.65}
                  >
                    <ellipse
                      cx={200}
                      cy={cy}
                      rx={rx}
                      ry={ry}
                      fill={petalFill(p.ring, p.intensity, eased)}
                      stroke="#8a4a22"
                      strokeWidth={0.4}
                    />
                  </g>
                );
              })}
            </g>

            {/* mandala core */}
            <circle cx={200} cy={200} r={16} fill="#b4551f" opacity={0.85} />
            <circle cx={200} cy={200} r={9} fill="#e7c38c" opacity={0.9} />

            {/* phase link + two voice markers */}
            <line
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke="#a9713f"
              strokeWidth={1}
              opacity={0.35 + alignment * 0.5}
            />
            <circle cx={ax} cy={ay} r={7} fill="#7a2f12" />
            <circle cx={bx} cy={by} r={7} fill="#c98a2e" />
          </svg>
        </div>

        {/* live readout */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cadence" value={running ? `${cadence || "—"}` : "—"} unit="steps/min" />
          <Stat label="Steps" value={`${stepCount}`} unit="petals bloomed" />
          <Stat
            label="Phase align"
            value={running ? `${Math.round(alignment * 100)}` : "—"}
            unit="% locked"
          />
          <Stat
            label="Source"
            value={mode === "real" ? "Your steps" : mode === "sim" ? "Simulated" : "—"}
            unit=""
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-base text-[#4a3221]">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#7a2f12]" />
            Your voice (locked to your steps)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-[#c98a2e]" />
            Phasing voice (drifts {Math.round(DRIFT * 100)}% faster)
          </span>
        </div>

        {showNotes && <DesignNotes />}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl bg-[#e7d3b6] px-4 py-3">
      <div className="text-base font-medium text-[#8a5a34]">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-[#3a271b]">
        {value}
      </div>
      {unit && <div className="text-base text-[#7a5a3d]">{unit}</div>}
    </div>
  );
}

function DesignNotes() {
  return (
    <section className="mt-6 rounded-2xl bg-[#efe0cb] px-5 py-5 text-base leading-relaxed text-[#3a271b]">
      <h2 className="text-xl font-semibold text-[#6b3a1c]">Design notes</h2>
      <p className="mt-3">
        <strong>The question:</strong> what if walking WAS the instrument? You
        hold your phone and walk; the accelerometer&apos;s footfall peaks set the
        tempo and phase of a slow phasing raga, and the mandala grows one petal
        per step.
      </p>
      <p className="mt-3">
        <strong>Step detection.</strong> From the DeviceMotion stream we take the
        acceleration magnitude, remove gravity with a slow low-pass baseline,
        high-pass the rest, and pick footfall peaks with an adaptive threshold and
        a refractory window. Each step yields a cadence estimate (steps/min,
        EMA-smoothed) and a normalized intensity. iOS requires{" "}
        <code>DeviceMotionEvent.requestPermission()</code> from a tap, so the
        Start button doubles as the permission gesture.
      </p>
      <p className="mt-3">
        <strong>Phasing.</strong> Two voices play the same warm pentatonic cell.
        Voice A advances exactly one note per footstep — locked to your body.
        Voice B runs on its own clock ~3% faster, so it slowly slides out of and
        back into alignment: Steve Reich&apos;s <em>Piano Phase</em> process, but
        the metronome is your gait. Cadence sets tempo; step intensity opens the
        filter and lifts the dynamics.
      </p>
      <p className="mt-3">
        <strong>References.</strong> Steve Reich, <em>Piano Phase</em> and{" "}
        <em>Music for 18 Musicians</em> (phasing / process music); walking
        meditation after Thich Nhat Hanh; and the gait-sonification /
        rhythmic-entrainment research line (Audio Mostly 2024, &ldquo;Making
        Movement Sonification Usable in Clinical Gait Rehabilitation&rdquo;; work
        on central-pattern-generator coupling between gait and music). The
        meditative feel is what the piece creates — no therapeutic claim is made.
      </p>
      <p className="mt-3">
        <strong>Honest notes.</strong> Built and type-checked, but not verified
        with a real accelerometer or speakers in this headless environment. The
        deterministic &ldquo;Simulate walking&rdquo; mode (a seeded mulberry32
        walker at ~108 spm) is how it will first be seen; on a phone, &ldquo;Start
        walking&rdquo; uses your real steps and falls back to the simulator if no
        motion arrives within two seconds.
      </p>
    </section>
  );
}
