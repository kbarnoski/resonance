"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { Choir, VOICE_COUNT } from "./choir";
import { NoiseFloor, rmsOf, opennessFrom, gateStep, smoothstep } from "./floor";

/**
 * 1190 · Quietude — What if SILENCE were the instrument?
 *
 * An inversion of every mic prototype. A just-intonation drone-choir is always
 * synthesizing internally; the room's QUIET lets it bloom (slow attack) and any
 * sound DUCKS it (fast release). Sustained stillness is rewarded — every few
 * quiet seconds a new overtone voice unlocks, so deep silence is audibly richer.
 * A disturbance shatters the bright gold/ivory mandala into drifting motes that
 * reconverge as quiet returns.
 *
 * Refs: John Cage, 4′33″ (1952); Éliane Radigue's sustained drone practice.
 */

const VIEW = 1000;
const CENTER = VIEW / 2;
const MOTES_PER_RING = 10;
const MOTE_COUNT = VOICE_COUNT * MOTES_PER_RING; // 70
const RAYS_PER_VOICE = 6;
const RAY_COUNT = VOICE_COUNT * RAYS_PER_VOICE; // 42
const UNLOCK_SECONDS = 4;

type Sensor = "mic" | "still";

function ringRadius(ring: number): number {
  return 70 + ring * 52;
}

interface MoteMeta {
  ring: number;
  angle: number;
  spin: number;
  reach: number; // per-mote scatter distance factor
}

interface Sim {
  floor: NoiseFloor;
  gain01: number; // smoothed openness (drives everything)
  unlockedF: number; // fractional unlocked-voice count, 1..VOICE_COUNT
  lastActivity: number; // performance.now() of last input (still mode)
  moteR: number[]; // current spring radius per mote
  moteA: number[]; // current angle per mote
  frame: number;
  reduced: boolean;
}

export default function QuietudePage() {
  const [started, setStarted] = useState(false);
  const [sensor, setSensor] = useState<Sensor>("mic");
  const [micError, setMicError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const choirRef = useRef<Choir | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const simRef = useRef<Sim | null>(null);

  // Element pools (updated imperatively each frame — no React re-render).
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const rayRefs = useRef<(SVGLineElement | null)[]>([]);
  const moteRefs = useRef<(SVGCircleElement | null)[]>([]);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const opennessTextRef = useRef<HTMLSpanElement | null>(null);
  const voicesTextRef = useRef<HTMLSpanElement | null>(null);

  // Stable mote/ray geometry — generated once on the client.
  const moteMetaRef = useRef<MoteMeta[] | null>(null);
  if (moteMetaRef.current === null) {
    const metas: MoteMeta[] = [];
    for (let i = 0; i < MOTE_COUNT; i++) {
      const ring = Math.floor(i / MOTES_PER_RING);
      const idx = i % MOTES_PER_RING;
      metas.push({
        ring,
        angle: (idx / MOTES_PER_RING) * Math.PI * 2 + ring * 0.35,
        spin: (Math.random() - 0.5) * 0.9,
        reach: 90 + Math.random() * 240,
      });
    }
    moteMetaRef.current = metas;
  }

  const markActivity = useCallback(() => {
    if (simRef.current) simRef.current.lastActivity = performance.now();
  }, []);

  const tick = useCallback((now: number) => {
    const sim = simRef.current;
    const choir = choirRef.current;
    const metas = moteMetaRef.current;
    if (!sim || !choir || !metas) return;

    // --- 1. Measure the room → raw openness (1 = quiet, 0 = sound) ---
    let opennessRaw: number;
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (analyser && buf) {
      analyser.getFloatTimeDomainData(buf);
      const rms = rmsOf(buf);
      const floor = sim.floor.update(rms);
      opennessRaw = opennessFrom(rms, floor);
    } else {
      // Still mode: idle rewards stillness; any input ducks it.
      const idle = (now - sim.lastActivity) / 1000;
      opennessRaw = smoothstep(0.1, 1.6, idle);
    }

    // --- 2. Asymmetric gate: slow open, fast duck ---
    sim.gain01 = gateStep(opennessRaw, sim.gain01);
    choir.setOpenness(sim.gain01);

    // --- 3. Stillness timer → unlock/fade voices ---
    const dt = Math.min(0.05, 1 / 60);
    if (sim.gain01 > 0.55) {
      sim.unlockedF = Math.min(VOICE_COUNT, sim.unlockedF + dt / UNLOCK_SECONDS);
    } else if (sim.gain01 < 0.35) {
      // Disturbance: relax progress SLOWLY (fade, never yank).
      sim.unlockedF = Math.max(1, sim.unlockedF - dt / (UNLOCK_SECONDS * 3));
    }
    choir.setUnlocked(sim.unlockedF);

    // --- 4. Drive the SVG mandala ---
    const g = sim.gain01;
    const scatter = 1 - g;
    const breath = 0.94 + 0.08 * g;

    if (glowRef.current) {
      glowRef.current.setAttribute("r", String(120 + g * 300));
      glowRef.current.setAttribute("opacity", String(0.18 + 0.42 * g));
    }

    // Rings — solid in quiet, dissolve (into motes) on disturbance.
    for (let i = 0; i < VOICE_COUNT; i++) {
      const el = ringRefs.current[i];
      if (!el) continue;
      const frac = Math.max(0, Math.min(1, sim.unlockedF - i));
      el.setAttribute("r", String(ringRadius(i) * breath));
      el.setAttribute("opacity", String(frac * g * 0.55));
    }

    // Rays — count grows with unlocked voices; fade with openness.
    const shownRays = Math.round(sim.unlockedF) * RAYS_PER_VOICE;
    for (let i = 0; i < RAY_COUNT; i++) {
      const el = rayRefs.current[i];
      if (!el) continue;
      if (i >= shownRays) {
        el.setAttribute("opacity", "0");
        continue;
      }
      const ang = (i / shownRays) * Math.PI * 2;
      const len = (90 + ringRadius(VOICE_COUNT - 1) * 0.9) * (0.5 + 0.5 * g);
      el.setAttribute("x2", String(CENTER + Math.cos(ang) * len));
      el.setAttribute("y2", String(CENTER + Math.sin(ang) * len));
      el.setAttribute("opacity", String(0.32 * g));
    }

    // Motes — the shattered-mandala particles.
    for (let i = 0; i < MOTE_COUNT; i++) {
      const el = moteRefs.current[i];
      const m = metas[i];
      if (!el) continue;
      const frac = Math.max(0, Math.min(1, sim.unlockedF - m.ring));
      if (frac <= 0) {
        el.setAttribute("opacity", "0");
        continue;
      }
      const homeR = ringRadius(m.ring);
      let targetR = homeR;
      let ang = m.angle;
      if (!sim.reduced) {
        targetR = homeR + scatter * m.reach;
        sim.moteA[i] += m.spin * scatter * dt;
        ang = m.angle + sim.moteA[i];
      }
      sim.moteR[i] += (targetR - sim.moteR[i]) * 0.06;
      const r = sim.moteR[i];
      el.setAttribute("cx", String(CENTER + Math.cos(ang) * r));
      el.setAttribute("cy", String(CENTER + Math.sin(ang) * r));
      el.setAttribute("opacity", String(frac * (0.3 + 0.6 * g)));
    }

    // --- 5. Throttled text readout ---
    sim.frame++;
    if (sim.frame % 12 === 0) {
      if (opennessTextRef.current)
        opennessTextRef.current.textContent = `${Math.round(g * 100)}%`;
      if (voicesTextRef.current)
        voicesTextRef.current.textContent = `${Math.floor(sim.unlockedF)} / ${VOICE_COUNT}`;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setAudioError(null);

    // Start the always-on choir (gesture-gated, ramps from 0).
    const choir = new Choir();
    try {
      await choir.start();
    } catch {
      setAudioError("Web Audio is unavailable in this browser, so the choir cannot play.");
      return;
    }
    choirRef.current = choir;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sim: Sim = {
      floor: new NoiseFloor(),
      gain01: 0,
      unlockedF: 1,
      lastActivity: performance.now(),
      moteR: new Array(MOTE_COUNT)
        .fill(0)
        .map((_, i) => ringRadius(moteMetaRef.current![i].ring)),
      moteA: new Array(MOTE_COUNT).fill(0),
      frame: 0,
      reduced,
    };
    simRef.current = sim;

    // Try the mic as an (inverted) silence sensor.
    let micOk = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      micCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      micOk = true;
    } catch {
      micOk = false;
    }

    if (micOk) {
      setSensor("mic");
    } else {
      setSensor("still");
      setMicError(
        "Microphone unavailable — still-mode is active. Leave the pointer and keyboard idle to open the piece; any movement or keypress ducks it.",
      );
      window.addEventListener("pointermove", markActivity, { passive: true });
      window.addEventListener("pointerdown", markActivity, { passive: true });
      window.addEventListener("keydown", markActivity);
      window.addEventListener("wheel", markActivity, { passive: true });
      window.addEventListener("touchstart", markActivity, { passive: true });
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [started, tick, markActivity]);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("wheel", markActivity);
      window.removeEventListener("touchstart", markActivity);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      micCtxRef.current?.close().catch(() => {});
      choirRef.current?.stop();
    };
  }, [markActivity]);

  const metas = moteMetaRef.current!;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#faf6ec] text-stone-800">
      {/* Mandala */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="h-[min(92vw,88vh)] w-[min(92vw,88vh)]"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="q-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff6d8" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#f4d67a" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#f4d67a" stopOpacity="0" />
            </radialGradient>
            <filter id="q-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <circle
            ref={glowRef}
            cx={CENTER}
            cy={CENTER}
            r={200}
            fill="url(#q-glow)"
            opacity={0.2}
          />

          <g filter="url(#q-soft)">
            {Array.from({ length: RAY_COUNT }).map((_, i) => (
              <line
                key={`ray-${i}`}
                ref={(el) => {
                  rayRefs.current[i] = el;
                }}
                x1={CENTER}
                y1={CENTER}
                x2={CENTER}
                y2={CENTER}
                stroke="#e6b84a"
                strokeWidth={2.5}
                strokeLinecap="round"
                opacity={0}
              />
            ))}
          </g>

          {Array.from({ length: VOICE_COUNT }).map((_, i) => (
            <circle
              key={`ring-${i}`}
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              cx={CENTER}
              cy={CENTER}
              r={ringRadius(i)}
              fill="none"
              stroke="#d8a12e"
              strokeWidth={2}
              opacity={0}
            />
          ))}

          <g filter="url(#q-soft)">
            {metas.map((m, i) => (
              <circle
                key={`mote-${i}`}
                ref={(el) => {
                  moteRefs.current[i] = el;
                }}
                cx={CENTER}
                cy={CENTER}
                r={m.ring < 3 ? 6 : 5}
                fill={m.ring % 2 === 0 ? "#f6e6b0" : "#e0a83a"}
                opacity={0}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Foreground UI */}
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col items-center px-6 py-10">
        <header className="text-center">
          <h1 className="font-semibold text-4xl tracking-tight text-stone-800 sm:text-5xl">
            Quietude
          </h1>
          <p className="mt-3 text-base text-stone-600">
            What if silence were the instrument?
          </p>
        </header>

        {!started && (
          <div className="mt-auto mb-auto flex flex-col items-center gap-6 text-center">
            <p className="max-w-md text-base leading-relaxed text-stone-600">
              A drone-choir is already singing, held silent. Your quiet lets it
              bloom; any sound ducks it. Stay still and, every few seconds, a new
              voice unlocks — deep silence is the richest sound of all.
            </p>
            <button
              type="button"
              onClick={begin}
              className="rounded-full bg-stone-800 px-8 py-3.5 text-lg font-medium text-[#faf6ec] shadow-md transition-colors hover:bg-stone-700"
            >
              Enter the quiet
            </button>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="rounded-full px-4 py-2.5 text-base text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-700"
            >
              {showNotes ? "Hide the design notes" : "Read the design notes"}
            </button>
          </div>
        )}

        {started && (
          <div className="mt-auto mb-4 flex flex-col items-center gap-4 text-center">
            {audioError && (
              <p className="max-w-md rounded-lg bg-violet-50 px-4 py-3 text-base font-medium text-violet-600">
                {audioError}
              </p>
            )}
            {micError && (
              <p className="max-w-md rounded-lg bg-violet-50 px-4 py-3 text-base text-violet-600">
                {micError}
              </p>
            )}
            {!audioError && (
              <div className="flex items-center gap-6 rounded-full bg-muted px-6 py-3 text-base text-stone-600 shadow-sm backdrop-blur-sm">
                <span>
                  openness{" "}
                  <span ref={opennessTextRef} className="font-semibold text-stone-800">
                    0%
                  </span>
                </span>
                <span aria-hidden="true" className="text-stone-300">
                  |
                </span>
                <span>
                  voices{" "}
                  <span ref={voicesTextRef} className="font-semibold text-stone-800">
                    1 / {VOICE_COUNT}
                  </span>
                </span>
              </div>
            )}
            <p className="max-w-md text-base text-stone-500">
              {sensor === "mic"
                ? "Listening for silence. The quieter the room, the fuller the choir."
                : "Still-mode: reward stillness by not touching pointer or keyboard."}
            </p>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="rounded-full px-4 py-2.5 text-base text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-700"
            >
              {showNotes ? "Hide the design notes" : "Read the design notes"}
            </button>
          </div>
        )}

        {showNotes && (
          <div className="mb-16 max-w-md rounded-xl bg-muted p-6 text-left text-base leading-relaxed text-stone-600 shadow-sm backdrop-blur-sm">
            <h2 className="mb-2 text-xl font-semibold text-stone-800">
              Design notes
            </h2>
            <p className="mb-3">
              Every mic prototype lets sound drive the visuals. This one inverts
              the gate: an adaptive noise floor self-calibrates to your room, and
              your <em>quiet</em> opens a just-intonation drone-choir (root 110
              Hz, partials 1 · 9/8 · 5/4 · 3/2 · 5/3 · 15/8 · 2). Quiet opens it
              slowly; any sound ducks it instantly.
            </p>
            <p className="mb-3">
              A stillness timer rewards sustained calm: every {UNLOCK_SECONDS}{" "}
              seconds of quiet fades in one more overtone voice, up to all seven.
              A disturbance shatters the mandala into drifting motes that
              reconverge as silence returns.
            </p>
            <p>
              After John Cage&rsquo;s <em>4′33″</em> (1952) and Éliane
              Radigue&rsquo;s sustained drone practice.
            </p>
          </div>
        )}
      </div>

      <PrototypeNav slugs={[]} />
    </main>
  );
}
